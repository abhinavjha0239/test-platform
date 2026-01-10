'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AdminLayout } from '@/components/admin';
import { useQuery } from '@/hooks';
import { api } from '@/lib/api';
import { SkeletonTable, SkeletonCard, useToast } from '@/components/ui';
import {
    FileText, BarChart3, Users, Plus,
    CheckCircle, Clock, AlertTriangle
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
    const { data, isLoading, error } = useQuery<DashboardData>(
        () => api.getDashboard(),
    );

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'COMPLETED': return 'success';
            case 'FAILED': return 'error';
            case 'IN_PROGRESS': return 'warning';
            case 'GRADING': return 'info';
            default: return 'info';
        }
    };

    return (
        <AdminLayout
            title="Dashboard"
            actions={
                <Link href="/admin/exams/new" className="btn btn-primary">
                    <Plus size={16} /> Create Exam
                </Link>
            }
        >
            {/* Stats Cards */}
            <div className={styles.stats}>
                {isLoading ? (
                    <>
                        <SkeletonCard />
                        <SkeletonCard />
                        <SkeletonCard />
                    </>
                ) : (
                    <>
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
                    </>
                )}
            </div>

            {/* Recent Attempts */}
            <section className={styles.section}>
                <h2>Recent Attempts</h2>
                {isLoading ? (
                    <SkeletonTable rows={5} columns={5} />
                ) : data?.recentAttempts?.length ? (
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
        </AdminLayout>
    );
}
