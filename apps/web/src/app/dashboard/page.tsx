'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/lib/auth-store';
import { api } from '@/lib/api';
import { Code2, Clock, CheckCircle, XCircle, Play, LogOut, Calendar } from 'lucide-react';
import { ExamCountdown, useExamScheduleStatus } from '@/components/ExamCountdown';
import styles from './dashboard.module.css';

interface Exam {
    id: string;
    title: string;
    description?: string;
    timeLimit: number;
    scheduledStartAt?: string | null;
    scheduledEndAt?: string | null;
    timezone?: string;
    challenge?: { name: string };
}

interface Attempt {
    id: string;
    examId: string;
    status: string;
    startedAt: string;
    publicScore?: number;
    totalPublic?: number;
    exam?: { title: string; timeLimit: number };
}

export default function DashboardPage() {
    const router = useRouter();
    const { user, checkAuth, logout } = useAuthStore();
    const [exams, setExams] = useState<Exam[]>([]);
    const [attempts, setAttempts] = useState<Attempt[]>([]);
    const [loading, setLoading] = useState(true);
    
    // Prevent duplicate fetches
    const hasFetchedRef = useRef(false);
    const isFetchingRef = useRef(false);

    const loadData = useCallback(async () => {
        // Prevent concurrent fetches
        if (isFetchingRef.current) return;
        isFetchingRef.current = true;
        
        try {
            const [examsRes, attemptsData] = await Promise.all([
                api.getExams(),    // Returns PaginatedResponse with .data
                api.getAttempts(), // Returns array directly
            ]);
            // Filter out any invalid items
            const validExams = (examsRes?.data || []).filter((e: Exam) => e && e.id);
            const validAttempts = (attemptsData || []).filter((a: Attempt) => a && a.id);
            setExams(validExams);
            setAttempts(validAttempts);
            hasFetchedRef.current = true;
        } catch (error) {
            console.error('Failed to load data:', error);
            setExams([]);
            setAttempts([]);
        } finally {
            setLoading(false);
            isFetchingRef.current = false;
        }
    }, []);

    // Single consolidated effect for auth check and data loading
    useEffect(() => {
        let mounted = true;
        
        const init = async () => {
            await checkAuth();
            
            if (!mounted) return;
            
            if (!user) {
                router.push('/login');
                return;
            }
            
            // Only fetch data if we haven't already
            if (!hasFetchedRef.current) {
                loadData();
            }
        };
        
        init();
        
        return () => { mounted = false; };
    }, [checkAuth, router, loadData, user]);

    const handleStartExam = async (examId: string) => {
        try {
            // api.startAttempt returns the attempt data directly
            const attempt = await api.startAttempt(examId);
            if (attempt?.id) {
                router.push(`/exam/${attempt.id}`);
            } else {
                alert('Failed to start exam. Please try again.');
            }
        } catch (error) {
            console.error('Start exam error:', error);
            alert(error instanceof Error ? error.message : 'Failed to start exam');
        }
    };

    const handleLogout = () => {
        logout();
        router.push('/');
    };

    if (loading || !user) {
        return <div className={styles.loading}>Loading...</div>;
    }

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <div className={styles.logo}>
                    <Code2 size={24} />
                    <span>ExamPlatform</span>
                </div>
                <div className={styles.userInfo}>
                    <span>{user.name || user.email}</span>
                    <button onClick={handleLogout} className="btn btn-secondary btn-sm">
                        <LogOut size={16} /> Logout
                    </button>
                </div>
            </header>

            <main className={styles.main}>
                <h1>Welcome, {user.name || 'Candidate'}!</h1>

                {/* Available Exams */}
                <section className={styles.section}>
                    <h2>Available Exams</h2>
                    {!exams || exams.length === 0 ? (
                        <p className={styles.empty}>No exams available at the moment.</p>
                    ) : (
                        <div className={styles.grid}>
                            {exams.map((exam) => (
                                <ExamCard 
                                    key={exam.id} 
                                    exam={exam} 
                                    onStart={handleStartExam} 
                                />
                            ))}
                        </div>
                    )}
                </section>

                {/* Past Attempts */}
                <section className={styles.section}>
                    <h2>Your Attempts</h2>
                    {!attempts || attempts.length === 0 ? (
                        <p className={styles.empty}>You haven't taken any exams yet.</p>
                    ) : (
                        <div className={styles.table}>
                            <table>
                                <thead>
                                    <tr>
                                        <th>Exam</th>
                                        <th>Status</th>
                                        <th>Score</th>
                                        <th>Date</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {attempts.map((attempt) => (
                                        <tr key={attempt.id}>
                                            <td>{attempt.exam?.title || 'Unknown'}</td>
                                            <td>
                                                <span className={`badge badge-${getStatusColor(attempt.status)}`}>
                                                    {attempt.status}
                                                </span>
                                            </td>
                                            <td>
                                                {attempt.totalPublic !== null && attempt.totalPublic !== undefined
                                                    ? `${attempt.publicScore || 0}/${attempt.totalPublic}`
                                                    : '-'}
                                            </td>
                                            <td>{new Date(attempt.startedAt).toLocaleDateString()}</td>
                                            <td>
                                                {attempt.status === 'IN_PROGRESS' ? (
                                                    <Link href={`/exam/${attempt.id}`} className="btn btn-sm btn-primary">
                                                        Continue
                                                    </Link>
                                                ) : attempt.status === 'COMPLETED' ? (
                                                    <Link href={`/exam/${attempt.id}/result`} className="btn btn-sm btn-secondary">
                                                        View Result
                                                    </Link>
                                                ) : null}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            </main>
        </div>
    );
}

function getStatusColor(status: string) {
    switch (status) {
        case 'COMPLETED': return 'success';
        case 'FAILED': return 'error';
        case 'IN_PROGRESS': return 'warning';
        case 'GRADING': return 'info';
        default: return 'info';
    }
}

// Separate component to use hooks for each exam
function ExamCard({ exam, onStart }: { exam: Exam; onStart: (id: string) => void }) {
    const scheduleStatus = useExamScheduleStatus(
        exam.scheduledStartAt || null,
        exam.scheduledEndAt || null
    );

    const isEnded = scheduleStatus === 'ended';
    const isBeforeStart = scheduleStatus === 'before_start';
    const canStart = !isEnded && !isBeforeStart;

    return (
        <div className={styles.card}>
            <h3>{exam.title}</h3>
            <p className={styles.meta}>
                <Clock size={14} /> {exam.timeLimit} minutes
            </p>
            {exam.description && (
                <p className={styles.description}>{exam.description}</p>
            )}
            
            {/* Show scheduling info if applicable */}
            {(exam.scheduledStartAt || exam.scheduledEndAt) && (
                <div style={{ marginTop: '12px' }}>
                    <ExamCountdown
                        scheduledStartAt={exam.scheduledStartAt || null}
                        scheduledEndAt={exam.scheduledEndAt || null}
                        timezone={exam.timezone || 'Asia/Kolkata'}
                    />
                </div>
            )}
            
            <button
                onClick={() => onStart(exam.id)}
                className="btn btn-primary"
                style={{ marginTop: '16px' }}
                disabled={!canStart}
                title={
                    isEnded 
                        ? 'Exam has ended' 
                        : isBeforeStart 
                            ? 'Exam has not started yet' 
                            : undefined
                }
            >
                {isEnded ? (
                    'Exam Ended'
                ) : isBeforeStart ? (
                    <>
                        <Calendar size={16} /> Starts Soon
                    </>
                ) : (
                    <>
                        <Play size={16} /> Start Exam
                    </>
                )}
            </button>
        </div>
    );
}
