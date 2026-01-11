import { Server, Socket } from 'socket.io';
import http from 'http';
import { createAdapter } from '@socket.io/redis-adapter';
import { verifyToken } from '../middleware/auth.js';
import { redisSubscriber, redisConnection, REDIS_CHANNELS, createAdapterPubClient, createAdapterSubClient } from '../lib/redis.js';
import { setupExamHandlers } from './examHandlers.js';
import type { JwtPayload } from '@exam-platform/shared';

// Extend Socket type with user data
declare module 'socket.io' {
    interface Socket {
        user: JwtPayload;
        tokenCheckedAt?: number;
    }
}

let io: Server | null = null;

// Token validation interval (5 minutes)
const TOKEN_CHECK_INTERVAL = 5 * 60 * 1000;

// Redis channel for socket eviction
const SOCKET_EVICTION_CHANNEL = 'socket:evict';

// Track user sockets for eviction
const userSockets = new Map<string, Set<string>>(); // userId -> Set<socketId>

/**
 * Initialize Socket.IO server with Redis adapter for horizontal scaling
 */
export function initializeSocket(httpServer: http.Server): Server {
    io = new Server(httpServer, {
        cors: {
            origin: process.env.FRONTEND_URL || 'http://localhost:3000',
            credentials: true,
        },
        pingTimeout: 60000,
        pingInterval: 25000,
    });

    // Configure Redis adapter for horizontal scaling
    // This enables Socket.IO events to be broadcast across multiple API instances
    const pubClient = createAdapterPubClient();
    const subClient = createAdapterSubClient();
    io.adapter(createAdapter(pubClient, subClient));
    console.log('✅ Socket.IO Redis adapter initialized for horizontal scaling');

    // Authentication middleware
    io.use(async (socket, next) => {
        const token = socket.handshake.auth.token;

        if (!token) {
            return next(new Error('Authentication required'));
        }

        try {
            const payload = verifyToken(token);
            socket.user = payload;
            socket.tokenCheckedAt = Date.now();
            next();
        } catch (error) {
            next(new Error('Invalid or expired token'));
        }
    });

    // Connection handler
    io.on('connection', (socket) => {
        console.log(`🔌 Socket connected: ${socket.id} (user: ${socket.user.email})`);

        // Track user's sockets for eviction
        const userId = socket.user.userId;
        if (!userSockets.has(userId)) {
            userSockets.set(userId, new Set());
        }
        userSockets.get(userId)!.add(socket.id);

        // Set up exam handlers for this socket
        setupExamHandlers(io!, socket);

        // Handle disconnection
        socket.on('disconnect', (reason) => {
            console.log(`🔌 Socket disconnected: ${socket.id} (reason: ${reason})`);

            // Remove from user tracking
            const sockets = userSockets.get(userId);
            if (sockets) {
                sockets.delete(socket.id);
                if (sockets.size === 0) {
                    userSockets.delete(userId);
                }
            }
        });

        // Handle errors
        socket.on('error', (error) => {
            console.error(`❌ Socket error (${socket.id}):`, error);
        });

        // Handle token refresh from client
        socket.on('auth:refresh', (newToken: string, callback) => {
            try {
                const payload = verifyToken(newToken);
                socket.user = payload;
                socket.tokenCheckedAt = Date.now();
                callback?.({ success: true });
            } catch (error) {
                callback?.({ success: false, error: 'Invalid token' });
                socket.disconnect(true);
            }
        });
    });

    // Subscribe to Redis channels for cross-process communication
    setupRedisSubscriptions(io);

    // Start periodic token validation
    startTokenValidation(io);

    console.log('✅ Socket.IO server initialized');

    return io;
}

/**
 * Set up Redis pub/sub subscriptions
 */
function setupRedisSubscriptions(io: Server) {
    // Subscribe to grading complete events
    redisSubscriber.subscribe(REDIS_CHANNELS.GRADING_COMPLETE);
    redisSubscriber.subscribe(REDIS_CHANNELS.PROCTOR_EVENT);
    redisSubscriber.subscribe(SOCKET_EVICTION_CHANNEL);

    redisSubscriber.on('message', (channel: string, message: string) => {
        try {
            const data = JSON.parse(message);

            switch (channel) {
                case REDIS_CHANNELS.GRADING_COMPLETE:
                    handleGradingComplete(io, data);
                    break;

                case REDIS_CHANNELS.PROCTOR_EVENT:
                    handleProctorEvent(io, data);
                    break;

                case SOCKET_EVICTION_CHANNEL:
                    handleEviction(io, data);
                    break;
            }
        } catch (error) {
            console.error(`Error processing Redis message on ${channel}:`, error);
        }
    });
}

/**
 * Start periodic token validation
 * Evicts sockets with expired tokens
 */
function startTokenValidation(io: Server) {
    setInterval(() => {
        const now = Date.now();

        for (const [_, socket] of io.sockets.sockets) {
            // Skip if recently checked
            if (socket.tokenCheckedAt && (now - socket.tokenCheckedAt) < TOKEN_CHECK_INTERVAL) {
                continue;
            }

            // Re-verify the token stored in handshake
            const token = socket.handshake.auth.token;
            if (!token) {
                console.log(`🔐 Evicting socket ${socket.id}: no token`);
                socket.emit('auth:expired', { message: 'Session expired. Please log in again.' });
                socket.disconnect(true);
                continue;
            }

            try {
                verifyToken(token);
                socket.tokenCheckedAt = now;
            } catch (error) {
                console.log(`🔐 Evicting socket ${socket.id}: token expired`);
                socket.emit('auth:expired', { message: 'Session expired. Please log in again.' });
                socket.disconnect(true);
            }
        }
    }, TOKEN_CHECK_INTERVAL);

    console.log('🔐 Token validation started');
}

/**
 * Handle eviction request from Redis (for cross-process logout)
 */
function handleEviction(io: Server, data: { userId?: string; socketId?: string }) {
    if (data.socketId) {
        // Evict specific socket
        const socket = io.sockets.sockets.get(data.socketId);
        if (socket) {
            console.log(`🔐 Evicting socket ${data.socketId} via Redis`);
            socket.emit('auth:expired', { message: 'Session terminated.' });
            socket.disconnect(true);
        }
    } else if (data.userId) {
        // Evict all sockets for user
        const sockets = userSockets.get(data.userId);
        if (sockets) {
            for (const socketId of sockets) {
                const socket = io.sockets.sockets.get(socketId);
                if (socket) {
                    console.log(`🔐 Evicting socket ${socketId} for user ${data.userId}`);
                    socket.emit('auth:expired', { message: 'Session terminated.' });
                    socket.disconnect(true);
                }
            }
        }
    }
}

/**
 * Handle grading complete event from worker
 */
function handleGradingComplete(io: Server, data: {
    attemptId: string;
    result: unknown;
    isPreview: boolean;
}) {
    io.to(`attempt:${data.attemptId}`).emit('grading:complete', {
        result: data.result,
        isPreview: data.isPreview,
    });
}

/**
 * Handle proctor event from Redis
 * Note: The proctorService already emits directly to sockets with the message.
 * This Redis handler is for cross-process coordination only.
 * We no longer re-emit here to avoid duplicate/empty notifications.
 */
function handleProctorEvent(_io: Server, data: {
    attemptId: string;
    eventType: string;
    count?: number;
    timestamp?: number;
}) {
    // Log for debugging/monitoring purposes only
    // The actual socket emission happens in proctorService.ts
    console.log(`📊 Proctor event via Redis: ${data.eventType} for attempt ${data.attemptId} (count: ${data.count})`);
}

/**
 * Get the Socket.IO server instance
 */
export function getIO(): Server {
    if (!io) {
        throw new Error('Socket.IO not initialized');
    }
    return io;
}

/**
 * Emit event to specific attempt room
 */
export function emitToAttempt(attemptId: string, event: string, data: unknown) {
    if (io) {
        io.to(`attempt:${attemptId}`).emit(event, data);
    }
}

/**
 * Get number of connected clients in an attempt room
 */
export async function getAttemptRoomSize(attemptId: string): Promise<number> {
    if (!io) return 0;
    const room = io.sockets.adapter.rooms.get(`attempt:${attemptId}`);
    return room ? room.size : 0;
}

/**
 * Evict all sockets for a user (call on logout)
 */
export async function evictUserSockets(userId: string): Promise<void> {
    // Publish to Redis for cross-process eviction
    await redisConnection.publish(
        SOCKET_EVICTION_CHANNEL,
        JSON.stringify({ userId })
    );
}

/**
 * Close Socket.IO server
 */
export async function closeSocket(): Promise<void> {
    if (io) {
        await io.close();
        io = null;
        userSockets.clear();
        console.log('Socket.IO server closed');
    }
}
