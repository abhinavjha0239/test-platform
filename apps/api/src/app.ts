import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import 'dotenv/config';

import authRoutes from './routes/auth.js';
import challengeRoutes from './routes/challenges.js';
import examRoutes from './routes/exams.js';
import attemptRoutes from './routes/attempts.js';
import proctorRoutes from './routes/proctor.js';
import reportsRoutes from './routes/reports.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

// Security & parsing
app.use(helmet());
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/challenges', challengeRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/attempts', attemptRoutes);
app.use('/api/proctor', proctorRoutes);
app.use('/api/reports', reportsRoutes);

// Error handler
app.use(errorHandler);

export default app;
