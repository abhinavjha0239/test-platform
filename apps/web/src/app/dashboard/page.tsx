'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/lib/auth-store';
import { api } from '@/lib/api';
import { Code2, Clock, CheckCircle, XCircle, Play, LogOut } from 'lucide-react';
import styles from './dashboard.module.css';

interface Exam {
    id: string;
    title: string;
    description?: string;
    timeLimit: number;
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

    useEffect(() => {
        checkAuth().then(() => {
            if (!user) router.push('/login');
        });
    }, []);

    useEffect(() => {
        if (user) {
            loadData();
        }
    }, [user]);

    const loadData = async () => {
        try {
            const [examsRes, attemptsRes] = await Promise.all([
                api.getExams(),
                api.getAttempts(),
            ]);
            setExams(examsRes.data);
            setAttempts(attemptsRes.data);
        } catch (error) {
            console.error('Failed to load data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleStartExam = async (examId: string) => {
        try {
            const { data } = await api.startAttempt(examId);
            router.push(`/exam/${data.id}`);
        } catch (error) {
            alert(String(error));
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
                    {exams.length === 0 ? (
                        <p className={styles.empty}>No exams available at the moment.</p>
                    ) : (
                        <div className={styles.grid}>
                            {exams.map((exam) => (
                                <div key={exam.id} className={styles.card}>
                                    <h3>{exam.title}</h3>
                                    <p className={styles.meta}>
                                        <Clock size={14} /> {exam.timeLimit} minutes
                                    </p>
                                    {exam.description && (
                                        <p className={styles.description}>{exam.description}</p>
                                    )}
                                    <button
                                        onClick={() => handleStartExam(exam.id)}
                                        className="btn btn-primary"
                                        style={{ marginTop: '16px' }}
                                    >
                                        <Play size={16} /> Start Exam
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                {/* Past Attempts */}
                <section className={styles.section}>
                    <h2>Your Attempts</h2>
                    {attempts.length === 0 ? (
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
