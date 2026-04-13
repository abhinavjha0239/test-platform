'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/lib/auth-store';
import { api, PaginationParams } from '@/lib/api';
import { usePaginatedQuery } from '@/hooks';
import {
    Code2, Clock, Play, LogOut, Calendar, ChevronLeft, ChevronRight,
    CheckCircle, XCircle, Loader2, Timer, TrendingUp, ChevronDown, ChevronUp as ChevronUpIcon,
    BarChart3
} from 'lucide-react';
import { ExamCountdown, useExamScheduleStatus } from '@/components/ExamCountdown';
import styles from './dashboard.module.css';

interface Exam {
    id: string;
    title: string;
    description?: string | null;
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
    submittedAt?: string | null;
    publicScore?: number | null;
    hiddenScore?: number | null;
    totalPublic?: number | null;
    totalHidden?: number | null;
    exam?: { title: string; timeLimit: number };
}

const EXAMS_PER_PAGE = 12;

export default function DashboardPage() {
    const router = useRouter();
    const { user, checkAuth, logout } = useAuthStore();
    const [authReady, setAuthReady] = useState(false);
    const [attempts, setAttempts] = useState<Attempt[]>([]);
    const [attemptsLoading, setAttemptsLoading] = useState(true);
    const [expandedAttempt, setExpandedAttempt] = useState<string | null>(null);

    const examsFetcher = useCallback(async (params: PaginationParams) => {
        const res = await api.getExams({ ...params, limit: EXAMS_PER_PAGE });
        return { data: res.data || [], total: res.total, page: res.page, limit: res.limit };
    }, []);

    const {
        data: exams,
        total: totalExams,
        page: examPage,
        isLoading: examsLoading,
        setPage: setExamPage,
    } = usePaginatedQuery<Exam>(examsFetcher, { enabled: authReady });

    const totalExamPages = Math.ceil(totalExams / EXAMS_PER_PAGE);

    // Auth check and load attempts
    useEffect(() => {
        let mounted = true;

        const init = async () => {
            await checkAuth();
            if (!mounted) return;

            const currentUser = useAuthStore.getState().user;
            if (!currentUser) {
                router.push('/login');
                return;
            }

            setAuthReady(true);

            // Load attempts separately
            try {
                const attemptsData = await api.getAttempts();
                if (mounted) {
                    const validAttempts = (attemptsData || []).filter((a: Attempt) => a && a.id);
                    setAttempts(validAttempts);
                }
            } catch (error) {
                console.error('Failed to load attempts:', error);
            } finally {
                if (mounted) setAttemptsLoading(false);
            }
        };

        init();
        return () => { mounted = false; };
    }, [checkAuth, router]);

    const handleStartExam = async (examId: string) => {
        try {
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

    if (!authReady || !user) {
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
                    <div className={styles.sectionHeader}>
                        <h2>Available Exams</h2>
                        {totalExams > 0 && (
                            <span className={styles.examCount}>{totalExams} exam{totalExams !== 1 ? 's' : ''}</span>
                        )}
                    </div>
                    {examsLoading ? (
                        <p className={styles.empty}>Loading exams...</p>
                    ) : !exams || exams.length === 0 ? (
                        <p className={styles.empty}>No exams available at the moment.</p>
                    ) : (
                        <>
                            <div className={styles.grid}>
                                {exams.map((exam) => (
                                    <ExamCard
                                        key={exam.id}
                                        exam={exam}
                                        onStart={handleStartExam}
                                    />
                                ))}
                            </div>
                            {totalExamPages > 1 && (
                                <div className={styles.pagination}>
                                    <button
                                        className={styles.pageBtn}
                                        onClick={() => setExamPage(examPage - 1)}
                                        disabled={examPage <= 1}
                                    >
                                        <ChevronLeft size={16} /> Prev
                                    </button>
                                    <div className={styles.pageNumbers}>
                                        {Array.from({ length: totalExamPages }, (_, i) => i + 1).map((p) => (
                                            <button
                                                key={p}
                                                className={`${styles.pageNumber} ${p === examPage ? styles.pageNumberActive : ''}`}
                                                onClick={() => setExamPage(p)}
                                            >
                                                {p}
                                            </button>
                                        ))}
                                    </div>
                                    <button
                                        className={styles.pageBtn}
                                        onClick={() => setExamPage(examPage + 1)}
                                        disabled={examPage >= totalExamPages}
                                    >
                                        Next <ChevronRight size={16} />
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </section>

                {/* Summary Stats */}
                {!attemptsLoading && attempts.length > 0 && (
                    <div className={styles.statsRow}>
                        <div className={styles.statCard}>
                            <BarChart3 size={18} className={styles.statIcon} />
                            <div>
                                <span className={styles.statValue}>{attempts.length}</span>
                                <span className={styles.statLabel}>Total Attempts</span>
                            </div>
                        </div>
                        <div className={styles.statCard}>
                            <CheckCircle size={18} className={styles.statIconGreen} />
                            <div>
                                <span className={styles.statValue}>
                                    {attempts.filter(a => a.status === 'COMPLETED').length}
                                </span>
                                <span className={styles.statLabel}>Completed</span>
                            </div>
                        </div>
                        <div className={styles.statCard}>
                            <TrendingUp size={18} className={styles.statIconBlue} />
                            <div>
                                <span className={styles.statValue}>
                                    {(() => {
                                        const scored = attempts.filter(a => a.totalPublic && a.totalPublic > 0);
                                        if (scored.length === 0) return '-';
                                        const best = Math.max(...scored.map(a => {
                                            const total = (a.totalPublic || 0) + (a.totalHidden || 0);
                                            const passed = (a.publicScore || 0) + (a.hiddenScore || 0);
                                            return total > 0 ? Math.round((passed / total) * 100) : 0;
                                        }));
                                        return `${best}%`;
                                    })()}
                                </span>
                                <span className={styles.statLabel}>Best Score</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Past Attempts */}
                <section className={styles.section}>
                    <h2>Your Attempts</h2>
                    {attemptsLoading ? (
                        <p className={styles.empty}>Loading attempts...</p>
                    ) : !attempts || attempts.length === 0 ? (
                        <p className={styles.empty}>You haven't taken any exams yet.</p>
                    ) : (
                        <div className={styles.attemptsList}>
                            {attempts.map((attempt) => {
                                const totalTests = (attempt.totalPublic || 0) + (attempt.totalHidden || 0);
                                const passedTests = (attempt.publicScore || 0) + (attempt.hiddenScore || 0);
                                const pct = totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : null;
                                const isExpanded = expandedAttempt === attempt.id;

                                return (
                                    <div key={attempt.id} className={styles.attemptCard}>
                                        <div
                                            className={styles.attemptRow}
                                            onClick={() => setExpandedAttempt(isExpanded ? null : attempt.id)}
                                        >
                                            <div className={styles.attemptMain}>
                                                <span className={styles.attemptTitle}>
                                                    {attempt.exam?.title || 'Unknown Exam'}
                                                </span>
                                                <span className={styles.attemptDate}>
                                                    {new Date(attempt.startedAt).toLocaleDateString(undefined, {
                                                        month: 'short', day: 'numeric', year: 'numeric'
                                                    })}
                                                </span>
                                            </div>

                                            <div className={styles.attemptMeta}>
                                                {/* Score bar */}
                                                {pct !== null ? (
                                                    <div className={styles.attemptScore}>
                                                        <div className={styles.attemptScoreBar}>
                                                            <div
                                                                className={styles.attemptScoreFill}
                                                                style={{
                                                                    width: `${pct}%`,
                                                                    background: pct >= 70 ? 'var(--accent-green)' : pct >= 40 ? 'var(--accent-orange)' : 'var(--error)',
                                                                }}
                                                            />
                                                        </div>
                                                        <span
                                                            className={styles.attemptScorePct}
                                                            style={{ color: pct >= 70 ? 'var(--accent-green)' : pct >= 40 ? 'var(--accent-orange)' : 'var(--error)' }}
                                                        >
                                                            {pct}%
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className={styles.attemptPending}>Pending</span>
                                                )}

                                                {/* Status badge */}
                                                <span className={`${styles.attemptBadge} ${styles[`badge_${attempt.status.toLowerCase()}`] || ''}`}>
                                                    {attempt.status === 'COMPLETED' && <CheckCircle size={12} />}
                                                    {attempt.status === 'FAILED' && <XCircle size={12} />}
                                                    {attempt.status === 'IN_PROGRESS' && <Loader2 size={12} className={styles.spinner} />}
                                                    {attempt.status === 'GRADING' && <Timer size={12} />}
                                                    {attempt.status.replace(/_/g, ' ')}
                                                </span>

                                                {/* Action */}
                                                {attempt.status === 'IN_PROGRESS' ? (
                                                    <Link href={`/exam/${attempt.id}`} className="btn btn-sm btn-primary" onClick={e => e.stopPropagation()}>
                                                        Continue
                                                    </Link>
                                                ) : attempt.status === 'COMPLETED' ? (
                                                    <Link href={`/exam/${attempt.id}/result`} className="btn btn-sm btn-secondary" onClick={e => e.stopPropagation()}>
                                                        View Result
                                                    </Link>
                                                ) : <div style={{ width: 90 }} />}

                                                {/* Expand toggle */}
                                                {isExpanded ? <ChevronUpIcon size={16} /> : <ChevronDown size={16} />}
                                            </div>
                                        </div>

                                        {/* Expanded details */}
                                        {isExpanded && (
                                            <div className={styles.attemptDetails}>
                                                <div className={styles.detailGrid}>
                                                    <div className={styles.detailItem}>
                                                        <span className={styles.detailLabel}>Public Tests</span>
                                                        <span className={styles.detailValue}>
                                                            {attempt.publicScore ?? '-'} / {attempt.totalPublic ?? '-'}
                                                        </span>
                                                    </div>
                                                    <div className={styles.detailItem}>
                                                        <span className={styles.detailLabel}>Hidden Tests</span>
                                                        <span className={styles.detailValue}>
                                                            {attempt.hiddenScore ?? '-'} / {attempt.totalHidden ?? '-'}
                                                        </span>
                                                    </div>
                                                    <div className={styles.detailItem}>
                                                        <span className={styles.detailLabel}>Started</span>
                                                        <span className={styles.detailValue}>
                                                            {new Date(attempt.startedAt).toLocaleString(undefined, {
                                                                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                                            })}
                                                        </span>
                                                    </div>
                                                    <div className={styles.detailItem}>
                                                        <span className={styles.detailLabel}>Submitted</span>
                                                        <span className={styles.detailValue}>
                                                            {attempt.submittedAt
                                                                ? new Date(attempt.submittedAt).toLocaleString(undefined, {
                                                                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                                                })
                                                                : '-'}
                                                        </span>
                                                    </div>
                                                    <div className={styles.detailItem}>
                                                        <span className={styles.detailLabel}>Duration</span>
                                                        <span className={styles.detailValue}>
                                                            {attempt.submittedAt && attempt.startedAt
                                                                ? `${Math.round((new Date(attempt.submittedAt).getTime() - new Date(attempt.startedAt).getTime()) / 60000)} min`
                                                                : '-'}
                                                        </span>
                                                    </div>
                                                    <div className={styles.detailItem}>
                                                        <span className={styles.detailLabel}>Time Limit</span>
                                                        <span className={styles.detailValue}>
                                                            {attempt.exam?.timeLimit ? `${attempt.exam.timeLimit} min` : '-'}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
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
