import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import authRoutes from './routes/auth.js';
import challengeRoutes from './routes/challenges.js';
import examRoutes from './routes/exams.js';
import attemptRoutes from './routes/attempts.js';
import proctorRoutes from './routes/proctor.js';
import reportsRoutes from './routes/reports.js';
import adminUsersRoutes from './routes/admin-users.js';
import { errorHandler } from './middleware/errorHandler.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import { isRedisConnected } from './lib/redis.js';
import { detectApiVersion, getVersionInfo } from './middleware/apiVersion.js';

const app = express();

// Security & parsing
app.use(helmet());
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

// API version detection
app.use('/api', detectApiVersion);

// Apply general rate limiting to all API routes
app.use('/api', apiLimiter);

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        redis: isRedisConnected() ? 'connected' : 'disconnected',
    });
});

// API version info
app.get('/api/version', (req, res) => {
    res.json({
        success: true,
        data: getVersionInfo(),
    });
});

// API Routes (v1 - current)
// All current routes are v1 by default
app.use('/api/auth', authRoutes);
app.use('/api/challenges', challengeRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/attempts', attemptRoutes);
app.use('/api/proctor', proctorRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/admin/users', adminUsersRoutes);

// Versioned routes (for future v2)
// app.use('/api/v1/auth', authRoutes);
// app.use('/api/v2/auth', authRoutesV2);

// Error handler
app.use(errorHandler);

export default app;
