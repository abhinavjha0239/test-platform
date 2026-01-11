'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/lib/auth-store';
import { api } from '@/lib/api';
import { CheckCircle, XCircle, Clock, AlertTriangle, ArrowLeft, Loader2 } from 'lucide-react';
import styles from './result.module.css';

interface AttemptResult {
    id: string;
    status: string;
    startedAt: string;
    submittedAt?: string;
    publicScore?: number;
    hiddenScore?: number;
    totalPublic?: number;
    totalHidden?: number;
    tabExits: number;
    fullscreenExits: number;
    pasteAttempts: number;
    totalOutOfWindowSeconds: number;
    exam?: {
        title: string;
        passThreshold: number;
    };
}

export default function ExamResultPage() {
    const router = useRouter();
    const params = useParams();
    const attemptId = params.id as string;
    const { user, checkAuth } = useAuthStore();
    const [result, setResult] = useState<AttemptResult | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        checkAuth();
        loadResult();
    }, [attemptId]);

    // Auto-poll while grading
    useEffect(() => {
        if (!result || result.status === 'COMPLETED' || result.status === 'FAILED') {
            return; // Stop polling when finished
        }

        // Still grading - poll every 3 seconds
        const interval = setInterval(() => {
            loadResult();
        }, 3000);

        return () => clearInterval(interval);
    }, [result?.status, attemptId]);

    const loadResult = async () => {
        try {
            const attempt = await api.getAttempt(attemptId);
            setResult(attempt);
        } catch (error) {
            console.error('Failed to load result:', error);
        } finally {
            setLoading(false);
        }
    };

    // Check if grading is finished (COMPLETED or FAILED both mean done)
    const isGradingDone = result?.status === 'COMPLETED' || result?.status === 'FAILED';

    if (loading) {
        return <div className={styles.loading}><Loader2 className={styles.spinner} /> Loading results...</div>;
    }

    if (!result) {
        return <div className={styles.loading}>Result not found</div>;
    }

    const totalScore = (result.publicScore || 0) + (result.hiddenScore || 0);
    const totalTests = (result.totalPublic || 0) + (result.totalHidden || 0);
    const percentage = totalTests > 0 ? Math.round((totalScore / totalTests) * 100) : 0;
    const passed = result.exam?.passThreshold ? percentage >= result.exam.passThreshold * 100 : false;

    const timeSpent = result.submittedAt && result.startedAt
        ? Math.round((new Date(result.submittedAt).getTime() - new Date(result.startedAt).getTime()) / 60000)
        : null;

    return (
        <div className={styles.container}>
            <Link href="/dashboard" className={styles.backLink}>
                <ArrowLeft size={16} /> Back to Dashboard
            </Link>

            <div className={styles.card}>
                <div className={styles.header}>
                    {isGradingDone ? (
                        passed ? (
                            <CheckCircle size={64} className={styles.iconSuccess} />
                        ) : (
                            <XCircle size={64} className={styles.iconFail} />
                        )
                    ) : (
                        <Loader2 size={64} className={styles.spinner} />
                    )}

                    <h1>{result.exam?.title || 'Exam'}</h1>

                    <span className={`badge ${passed ? 'badge-success' : 'badge-error'}`} style={{ fontSize: '16px', padding: '8px 16px' }}>
                        {isGradingDone ? (passed ? 'PASSED' : 'FAILED') : 'Grading in progress...'}
                    </span>
                </div>

                {isGradingDone && (
                    <>
                        <div className={styles.score}>
                            <div className={styles.scoreCircle} style={{ '--percentage': percentage } as any}>
                                <span className={styles.scoreValue}>{percentage}%</span>
                                <span className={styles.scoreLabel}>Score</span>
                            </div>
                        </div>

                        <div className={styles.stats}>
                            <div className={styles.stat}>
                                <span className={styles.statValue}>{result.publicScore || 0}/{result.totalPublic || 0}</span>
                                <span className={styles.statLabel}>Public Tests</span>
                            </div>
                            <div className={styles.stat}>
                                <span className={styles.statValue}>{result.hiddenScore || 0}/{result.totalHidden || 0}</span>
                                <span className={styles.statLabel}>Hidden Tests</span>
                            </div>
                            <div className={styles.stat}>
                                <span className={styles.statValue}>{timeSpent || '-'} min</span>
                                <span className={styles.statLabel}>Time Spent</span>
                            </div>
                        </div>

                        <div className={styles.integrity}>
                            <h3><AlertTriangle size={16} /> Integrity Summary</h3>
                            <div className={styles.integrityGrid}>
                                <div className={styles.integrityItem}>
                                    <span className={styles.integrityValue}>{result.tabExits}</span>
                                    <span className={styles.integrityLabel}>Tab Exits</span>
                                </div>
                                <div className={styles.integrityItem}>
                                    <span className={styles.integrityValue}>{result.fullscreenExits}</span>
                                    <span className={styles.integrityLabel}>Fullscreen Exits</span>
                                </div>
                                <div className={styles.integrityItem}>
                                    <span className={styles.integrityValue}>{result.pasteAttempts}</span>
                                    <span className={styles.integrityLabel}>Paste Attempts</span>
                                </div>
                                <div className={styles.integrityItem}>
                                    <span className={styles.integrityValue}>{result.totalOutOfWindowSeconds}s</span>
                                    <span className={styles.integrityLabel}>Out-of-Window Time</span>
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {!isGradingDone && (
                    <p className={styles.gradingMessage}>
                        Your submission is being evaluated. This usually takes 1-2 minutes.
                        Auto-refreshing every 3 seconds...
                    </p>
                )}
            </div>
        </div>
    );
}
