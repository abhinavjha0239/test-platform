'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/lib/auth-store';
import { api } from '@/lib/api';
import {
    Code2, Users, FileText, BarChart3, Plus,
    LogOut, CheckCircle, Clock, AlertTriangle, Loader2
} from 'lucide-react';
import styles from './admin.module.css';

interface DashboardData {
    stats: {
        totalExams: number;
        totalAttempts: number;
        totalCandidates: number;
    };
    recentAttempts: Array<{
        id: string;
        candidateName: string;
        examTitle: string;
        status: string;
        startedAt: string;
    }>;
}

export default function AdminDashboard() {
    const router = useRouter();
    const { user, checkAuth, logout } = useAuthStore();
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        checkAuth().then(() => {
            if (!user || user.role !== 'ADMIN') {
                router.push('/login');
            }
        });
    }, []);

    useEffect(() => {
        if (user?.role === 'ADMIN') {
            loadDashboard();
        }
    }, [user]);

    const loadDashboard = async () => {
        try {
            const { data } = await api.getDashboard();
            setData(data);
        } catch (error) {
            console.error('Failed to load dashboard:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = () => {
        logout();
        router.push('/');
    };

    if (loading || !user) {
        return <div className={styles.loading}><Loader2 className={styles.spinner} /> Loading...</div>;
    }

    return (
        <div className={styles.container}>
            {/* Sidebar */}
            <aside className={styles.sidebar}>
                <div className={styles.logo}>
                    <Code2 size={24} />
                    <span>ExamPlatform</span>
                </div>

                <nav className={styles.nav}>
                    <Link href="/admin" className={`${styles.navItem} ${styles.navItemActive}`}>
                        <BarChart3 size={18} /> Dashboard
                    </Link>
                    <Link href="/admin/exams" className={styles.navItem}>
                        <FileText size={18} /> Exams
                    </Link>
                    <Link href="/admin/challenges" className={styles.navItem}>
                        <Code2 size={18} /> Challenges
                    </Link>
                </nav>

                <div className={styles.sidebarFooter}>
                    <div className={styles.userInfo}>
                        <span>{user.name || user.email}</span>
                        <span className={styles.role}>{user.role}</span>
                    </div>
                    <button onClick={handleLogout} className={styles.logoutBtn}>
                        <LogOut size={16} />
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className={styles.main}>
                <header className={styles.header}>
                    <h1>Dashboard</h1>
                    <Link href="/admin/exams/new" className="btn btn-primary">
                        <Plus size={16} /> Create Exam
                    </Link>
                </header>

                {/* Stats Cards */}
                <div className={styles.stats}>
                    <div className={styles.statCard}>
                        <div className={styles.statIcon} style={{ background: 'rgba(0, 122, 204, 0.1)', color: 'var(--accent-blue)' }}>
                            <FileText size={24} />
                        </div>
                        <div className={styles.statInfo}>
                            <span className={styles.statValue}>{data?.stats.totalExams || 0}</span>
                            <span className={styles.statLabel}>Total Exams</span>
                        </div>
                    </div>

                    <div className={styles.statCard}>
                        <div className={styles.statIcon} style={{ background: 'rgba(78, 201, 176, 0.1)', color: 'var(--accent-green)' }}>
                            <BarChart3 size={24} />
                        </div>
                        <div className={styles.statInfo}>
                            <span className={styles.statValue}>{data?.stats.totalAttempts || 0}</span>
                            <span className={styles.statLabel}>Total Attempts</span>
                        </div>
                    </div>

                    <div className={styles.statCard}>
                        <div className={styles.statIcon} style={{ background: 'rgba(206, 145, 120, 0.1)', color: 'var(--accent-orange)' }}>
                            <Users size={24} />
                        </div>
                        <div className={styles.statInfo}>
                            <span className={styles.statValue}>{data?.stats.totalCandidates || 0}</span>
                            <span className={styles.statLabel}>Candidates</span>
                        </div>
                    </div>
                </div>

                {/* Recent Attempts */}
                <section className={styles.section}>
                    <h2>Recent Attempts</h2>
                    {data?.recentAttempts?.length ? (
                        <div className={styles.table}>
                            <table>
                                <thead>
                                    <tr>
                                        <th>Candidate</th>
                                        <th>Exam</th>
                                        <th>Status</th>
                                        <th>Date</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.recentAttempts.map((attempt) => (
                                        <tr key={attempt.id}>
                                            <td>{attempt.candidateName || 'Unknown'}</td>
                                            <td>{attempt.examTitle || 'Unknown'}</td>
                                            <td>
                                                <span className={`badge badge-${getStatusColor(attempt.status)}`}>
                                                    {attempt.status}
                                                </span>
                                            </td>
                                            <td>{new Date(attempt.startedAt).toLocaleDateString()}</td>
                                            <td>
                                                <Link href={`/admin/reports/attempt/${attempt.id}`} className="btn btn-sm btn-secondary">
                                                    View
                                                </Link>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <p className={styles.empty}>No attempts yet.</p>
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
