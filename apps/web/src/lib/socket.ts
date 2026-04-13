import { io, Socket } from 'socket.io-client';
import { api } from './api';

/**
 * Socket.IO client with token refresh support
 * 
 * Features:
 * - Uses access tokens from API client
 * - Handles token updates for reconnection
 * - Automatic reconnection with backoff
 * - Clean disconnection handling
 */

/**
 * Socket.IO client instance
 */
let socket: Socket | null = null;

/**
 * Token change unsubscribe function
 */
let tokenUnsubscribe: (() => void) | null = null;

/**
 * Track active attempt IDs for reconnection
 */
const activeAttemptIds = new Set<string>();

/**
 * Ensure socket listeners are only registered once per socket instance
 */
let socketListenersAttached = false;

/**
 * API URL for Socket.IO connection
 * In production, connect via the same origin (nginx proxies /socket.io/ to the API).
 * In development, connect directly to the API server.
 */
const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001');

function rejoinActiveAttempts(reason: string): void {
    if (!socket || !socket.connected) {
        return;
    }

    if (activeAttemptIds.size === 0) {
        return;
    }

    const token = api.getToken();
    if (!token) {
        return;
    }

    activeAttemptIds.forEach((attemptId) => {
        socket?.emit('attempt:join', attemptId, (response: any) => {
            if (!response?.success) {
                console.warn(`🔌 Failed to rejoin attempt ${attemptId} after ${reason}:`, response?.error);
                activeAttemptIds.delete(attemptId);
            }
        });
    });
}

/**
 * Get or create Socket.IO client instance
 * Recreates socket if token has changed
 */
export function getSocket(): Socket {
    const token = api.getToken();

    if (socket) {
        // Check if token has changed - if so, update auth
        const currentAuth = socket.auth as { token?: string };
        if (currentAuth.token !== token) {
            // Update socket auth for next reconnection
            socket.auth = { token };

            // If connected with old token, disconnect to force reconnection with new token
            if (socket.connected && !token) {
                socket.disconnect();
            }
        }
        return socket;
    }

    socket = io(SOCKET_URL, {
        auth: { token },
        autoConnect: false,
        transports: ['websocket'],  // Skip polling — avoids SID mismatch with multiple API instances
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10000,
        timeout: 20000,
        // Ensure we always send the latest token
        query: {},
    });

    // Subscribe to token changes to update socket auth
    if (!tokenUnsubscribe) {
        tokenUnsubscribe = api.onTokenChange((hasToken) => {
            if (socket) {
                const newToken = api.getToken();
                socket.auth = { token: newToken };

                if (!hasToken && socket.connected) {
                    // Token was cleared, disconnect
                    socket.disconnect();
                } else if (hasToken && !socket.connected) {
                    // New token available, can reconnect if needed
                    // (reconnection will be triggered by the component that needs it)
                    if (activeAttemptIds.size > 0) {
                        socket.connect();
                    }
                }
            }
        });
    }

    // Log connection events in development
    if (process.env.NODE_ENV === 'development') {
        socket.on('connect', () => {
            console.log('🔌 Socket connected:', socket?.id);
        });

        socket.on('disconnect', (reason) => {
            console.log('🔌 Socket disconnected:', reason);
        });

        socket.on('connect_error', (error) => {
            console.error('🔌 Socket connection error:', error.message);

            // If authentication error, token might be expired
            if (error.message.includes('expired') || error.message.includes('Invalid')) {
                console.log('🔌 Token may be expired, API client will handle refresh');
            }
        });

        socket.on('reconnect', (attemptNumber) => {
            console.log('🔌 Socket reconnected after', attemptNumber, 'attempts');
        });

        socket.on('reconnect_failed', () => {
            console.error('🔌 Socket reconnection failed');
        });
    }

    if (!socketListenersAttached) {
        socket.on('connect', () => {
            rejoinActiveAttempts('connect');
        });

        socket.on('reconnect', () => {
            rejoinActiveAttempts('reconnect');
        });

        if (process.env.NODE_ENV === 'development') {
            socket.on('reconnect_error', (error) => {
                console.error('🔌 Socket reconnect error:', error.message);
            });
        }
        socketListenersAttached = true;
    }

    return socket;
}

/**
 * Connect to exam attempt room
 */
export function connectToExam(attemptId: string): Promise<{
    success: boolean;
    data?: {
        attemptId: string;
        files: Record<string, string>;
        startedAt: string;
        timeLimit: number;
    };
    error?: string;
}> {
    return new Promise((resolve, reject) => {
        const socket = getSocket();

        // Declare timeout variable first so it can be referenced in handlers
        let timeout: ReturnType<typeof setTimeout>;

        const handleConnect = () => {
            clearTimeout(timeout);
            socket.off('connect_error', handleError);
            socket.emit('attempt:join', attemptId, (response: any) => {
                if (response.success) {
                    activeAttemptIds.add(attemptId);
                    resolve(response);
                } else {
                    activeAttemptIds.delete(attemptId);
                    reject(new Error(response.error || 'Failed to join exam'));
                }
            });
        };

        const handleError = (error: Error) => {
            clearTimeout(timeout);
            socket.off('connect', handleConnect);
            socket.off('connect_error', handleError);
            activeAttemptIds.delete(attemptId);
            reject(error);
        };

        // Set a timeout for the connection
        timeout = setTimeout(() => {
            socket.off('connect', handleConnect);
            socket.off('connect_error', handleError);
            activeAttemptIds.delete(attemptId);
            reject(new Error('Connection timeout'));
        }, 15000);

        if (socket.connected) {
            clearTimeout(timeout);
            handleConnect();
        } else {
            socket.once('connect', handleConnect);
            socket.once('connect_error', handleError);
            socket.connect();
        }
    });
}

/**
 * Leave exam attempt room
 */
export function leaveExam(attemptId: string): void {
    if (socket) {
        socket.emit('attempt:leave', attemptId);
    }
    activeAttemptIds.delete(attemptId);
}

/**
 * Disconnect socket completely
 */
export function disconnectSocket(): void {
    if (socket) {
        socket.removeAllListeners();
        socket.disconnect();
        socket = null;
        socketListenersAttached = false;
    }

    if (tokenUnsubscribe) {
        tokenUnsubscribe();
        tokenUnsubscribe = null;
    }
    activeAttemptIds.clear();
}

/**
 * Save code files via WebSocket
 */
export function saveFiles(
    attemptId: string,
    files: Record<string, string>
): Promise<{ success: boolean; savedAt?: number; error?: string }> {
    return new Promise((resolve) => {
        const socket = getSocket();

        if (!socket.connected) {
            resolve({ success: false, error: 'Not connected' });
            return;
        }

        // Add timeout for the save operation
        const timeout = setTimeout(() => {
            resolve({ success: false, error: 'Save timeout' });
        }, 10000);

        socket.emit('code:save', { attemptId, files }, (response: any) => {
            clearTimeout(timeout);
            resolve(response);
        });
    });
}

/**
 * Log proctor event via WebSocket
 */
export function logProctorEvent(data: {
    attemptId: string;
    eventType: string;
    duration?: number;
    pasteLength?: number;
    isMultiline?: boolean;
}): Promise<{ success: boolean }> {
    return new Promise((resolve) => {
        const socket = getSocket();

        if (!socket.connected) {
            resolve({ success: false });
            return;
        }

        // Proctor events don't need a timeout - they're fire-and-forget
        socket.emit('proctor:event', data, (response: any) => {
            resolve(response);
        });
    });
}
