import 'dotenv/config';
import http from 'http';
import app from './app.js';
import { initializeSocket, closeSocket } from './socket/index.js';
import { closeRedisConnections } from './lib/redis.js';
import { closeGradingQueue } from './lib/grading.js';
import { stopAllLocalTimers } from './socket/timerService.js';
import { startBackgroundFlush, gracefulShutdown as flushShutdown } from './lib/autosave-buffer.js';
import { startExamScheduler, stopExamScheduler } from './lib/exam-scheduler.js';
import { initializePoolSystem, drainAllPools, cleanupIdlePools } from './lib/container-pool.js';
import { initializeNetworkPool, drainNetworkPool } from './lib/network-pool.js';
import { initializeCache } from './lib/dependency-cache.js';
import { initializeBlackboxPool, drainBlackboxPools, cleanupIdleBlackboxPools } from './lib/blackbox-pool-manager.js';

const PORT = process.env.PORT || 3001;

// Create HTTP server
const httpServer = http.createServer(app);

// Initialize Socket.IO
const io = initializeSocket(httpServer);

// Start autosave background flush
startBackgroundFlush();

// Start exam scheduler (monitors scheduled end times)
startExamScheduler(io);

// Initialize container pool system (cleanup orphaned containers)
initializePoolSystem().catch(console.error);

// Initialize network pool for blackbox/playwright grading
initializeNetworkPool().catch(console.error);

// Initialize blackbox container pool
initializeBlackboxPool().catch(console.error);

// Initialize dependency cache
initializeCache().catch(console.error);

// Start periodic pool cleanup (EC-11, EC-15)
setInterval(() => {
    cleanupIdlePools().catch(err => {
        console.error('[Pool] Idle cleanup failed:', err);
    });
    cleanupIdleBlackboxPools().catch(err => {
        console.error('[BlackboxPool] Idle cleanup failed:', err);
    });
}, 60 * 60 * 1000); // Every hour

// Start server
httpServer.listen(PORT, () => {
    console.log(`🚀 API Server running on http://localhost:${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`🔌 WebSocket server ready`);
});

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
    console.log(`\n${signal} received. Starting graceful shutdown...`);

    // Stop accepting new connections
    httpServer.close(() => {
        console.log('HTTP server closed');
    });

    try {
        // Flush all pending autosaves to database
        await flushShutdown();

        // Stop all active timers (local instance)
        stopAllLocalTimers();

        // Stop exam scheduler
        stopExamScheduler();

        // Close Socket.IO
        await closeSocket();

        // Drain container pools
        await drainAllPools();

        // Drain blackbox pools
        await drainBlackboxPools();

        // Drain network pool
        await drainNetworkPool();

        // Close grading queue
        await closeGradingQueue();

        // Close Redis connections
        await closeRedisConnections();

        console.log('✅ Graceful shutdown complete');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
    }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
