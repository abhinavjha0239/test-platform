'use client';

import { useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AdminLayout } from '@/components/admin';
import { Skeleton, useToast } from '@/components/ui';
import { useQuery } from '@/hooks';
import { api } from '@/lib/api';
import {
    Download, Eye, CheckCircle, XCircle, AlertTriangle,
    Users, TrendingUp, BarChart3, Clock
} from 'lucide-react';
import styles from './report.module.css';

export default function ExamReportPage() {
    const params = useParams();
    const examId = params.examId as string;
    const toast = useToast();

    const { data: report, isLoading, error } = useQuery(
        () => api.getExamReport(examId),
        { enabled: !!examId }
    );

    const sortedAttempts = useMemo(() => {
        if (!report?.attempts) return [];
        return [...report.attempts].sort((a: any, b: any) => {
            const scoreA = (a.publicScore || 0) + (a.hiddenScore || 0);
            const scoreB = (b.publicScore || 0) + (b.hiddenScore || 0);
            return scoreB - scoreA;
        });
    }, [report]);

    const exportCSV = () => {
        if (!report?.attempts) return;

        const headers = [
            'Candidate Name', 'Email', 'Status', 'Public Score', 'Hidden Score',
            'Total Tests', 'Percentage', 'Tab Exits', 'Fullscreen Exits',
            'Paste Attempts', 'Started At', 'Submitted At', 'Duration (min)'
        ];

        const rows = report.attempts.map((a: any) => {
            const totalTests = (a.totalPublic || 0) + (a.totalHidden || 0);
            const passed = (a.publicScore || 0) + (a.hiddenScore || 0);
            const pct = totalTests > 0 ? Math.round((passed / totalTests) * 100) : '';
            const duration = a.submittedAt && a.startedAt
                ? Math.round((new Date(a.submittedAt).getTime() - new Date(a.startedAt).getTime()) / 60000)
                : '';

            return [
                a.candidate?.name || '',
                a.candidate?.email || '',
                a.status,
                a.publicScore ?? '',
                a.hiddenScore ?? '',
                totalTests,
                pct,
                a.tabExits || 0,
                a.fullscreenExits || 0,
                a.pasteAttempts || 0,
                a.startedAt ? new Date(a.startedAt).toISOString() : '',
                a.submittedAt ? new Date(a.submittedAt).toISOString() : '',
                duration,
            ];
        });

        const csv = [headers, ...rows]
            .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
            .join('\n');

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${(report as any)?.exam?.title || 'exam'}_results.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('CSV exported!');
    };

    if (isLoading) {
        return (
            <AdminLayout title="Exam Report" breadcrumbs={[{ label: 'Dashboard', href: '/admin' }, { label: 'Loading...' }]}>
                <Skeleton height="200px" />
                <Skeleton height="400px" />
            </AdminLayout>
        );
    }

    if (error || !report) {
        return (
            <AdminLayout title="Error" breadcrumbs={[{ label: 'Dashboard', href: '/admin' }, { label: 'Error' }]}>
                <div className={styles.error}>
                    <AlertTriangle size={32} />
                    <h2>Failed to load report</h2>
                    <p>{String(error || 'Unknown error')}</p>
                </div>
            </AdminLayout>
        );
    }

    const exam = report.exam as any;
    const stats = report.stats as any;

    return (
        <AdminLayout
            title={`Report: ${exam?.title || 'Exam'}`}
            breadcrumbs={[
                { label: 'Dashboard', href: '/admin' },
                { label: 'Exams', href: '/admin/exams' },
                { label: exam?.title || 'Report' },
            ]}
        >
            <div className={styles.container}>
                {/* Stats Cards */}
                <div className={styles.statsGrid}>
                    <div className={styles.statCard}>
                        <Users size={20} className={styles.statIconBlue} />
                        <div>
                            <span className={styles.statValue}>{stats?.totalAttempts || 0}</span>
                            <span className={styles.statLabel}>Total Attempts</span>
                        </div>
                    </div>
                    <div className={styles.statCard}>
                        <TrendingUp size={20} className={styles.statIconGreen} />
                        <div>
                            <span className={styles.statValue}>{stats?.averageScore != null ? `${Math.round(stats.averageScore)}%` : '-'}</span>
                            <span className={styles.statLabel}>Average Score</span>
                        </div>
                    </div>
                    <div className={styles.statCard}>
                        <CheckCircle size={20} className={styles.statIconGreen} />
                        <div>
                            <span className={styles.statValue}>{stats?.passRate != null ? `${Math.round(stats.passRate)}%` : '-'}</span>
                            <span className={styles.statLabel}>Pass Rate</span>
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className={styles.toolbar}>
                    <button className="btn btn-secondary btn-sm" onClick={exportCSV}>
                        <Download size={14} /> Export CSV
                    </button>
                    <Link href={`/admin/attempts?examId=${examId}`} className="btn btn-secondary btn-sm">
                        <BarChart3 size={14} /> View All Attempts
                    </Link>
                </div>

                {/* Attempts Table */}
                <div className={styles.tableCard}>
                    <h3 className={styles.tableTitle}>Candidates ({sortedAttempts.length})</h3>
                    <div className={styles.tableWrap}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Candidate</th>
                                    <th>Status</th>
                                    <th>Score</th>
                                    <th>Integrity</th>
                                    <th>Duration</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedAttempts.map((attempt: any, idx: number) => {
                                    const totalTests = (attempt.totalPublic || 0) + (attempt.totalHidden || 0);
                                    const passed = (attempt.publicScore || 0) + (attempt.hiddenScore || 0);
                                    const pct = totalTests > 0 ? Math.round((passed / totalTests) * 100) : null;
                                    const flags = (attempt.tabExits || 0) + (attempt.fullscreenExits || 0) + (attempt.pasteAttempts || 0);
                                    const duration = attempt.submittedAt && attempt.startedAt
                                        ? Math.round((new Date(attempt.submittedAt).getTime() - new Date(attempt.startedAt).getTime()) / 60000)
                                        : null;

                                    return (
                                        <tr key={attempt.id}>
                                            <td className={styles.rank}>{idx + 1}</td>
                                            <td>
                                                <div className={styles.candidateCell}>
                                                    <span className={styles.candidateName}>{attempt.candidate?.name || 'Unnamed'}</span>
                                                    <span className={styles.candidateEmail}>{attempt.candidate?.email}</span>
                                                </div>
                                            </td>
                                            <td>
                                                <span className={`badge badge-${attempt.status === 'COMPLETED' ? 'success' : attempt.status === 'FAILED' ? 'error' : 'info'}`}>
                                                    {attempt.status === 'COMPLETED' && <CheckCircle size={11} />}
                                                    {attempt.status === 'FAILED' && <XCircle size={11} />}
                                                    {attempt.status.replace(/_/g, ' ')}
                                                </span>
                                            </td>
                                            <td>
                                                {pct !== null ? (
                                                    <div className={styles.scoreCell}>
                                                        <div className={styles.scoreBar}>
                                                            <div className={styles.scoreFill} style={{
                                                                width: `${pct}%`,
                                                                background: pct >= 70 ? 'var(--accent-green)' : pct >= 40 ? 'var(--accent-orange)' : 'var(--error)',
                                                            }} />
                                                        </div>
                                                        <span style={{ color: pct >= 70 ? 'var(--accent-green)' : pct >= 40 ? 'var(--accent-orange)' : 'var(--error)', fontWeight: 600, fontSize: 13 }}>
                                                            {pct}%
                                                        </span>
                                                    </div>
                                                ) : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Pending</span>}
                                            </td>
                                            <td>
                                                {flags > 0 ? (
                                                    <span className={styles.flagBadge} data-warning={flags > 2}>
                                                        <AlertTriangle size={11} /> {flags}
                                                    </span>
                                                ) : (
                                                    <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>✓ Clean</span>
                                                )}
                                            </td>
                                            <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                                                {duration !== null ? `${duration}m` : '-'}
                                            </td>
                                            <td>
                                                <Link href={`/admin/reports/attempt/${attempt.id}`} className={styles.viewBtn} title="View Report">
                                                    <Eye size={14} />
                                                </Link>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </AdminLayout>
    );
}
