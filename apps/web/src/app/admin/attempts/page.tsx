'use client';

import { useState, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AdminLayout } from '@/components/admin';
import { DataTable, Column, useToast } from '@/components/ui';
import { usePaginatedQuery, useDebounce } from '@/hooks';
import { api, PaginationParams } from '@/lib/api';
import {
    Search, Eye, AlertTriangle, CheckCircle, XCircle,
    Clock, Filter, X, GitCompare
} from 'lucide-react';
import styles from './attempts.module.css';

interface AttemptItem {
    id: string;
    candidate: { id: string; name: string | null; email: string };
    exam: { id: string; title: string; challengeName: string | null };
    status: string;
    startedAt: string;
    submittedAt: string | null;
    score: {
        public: number | null;
        hidden: number | null;
        totalPublic: number | null;
        totalHidden: number | null;
        percentage: number | null;
    };
    integrity: {
        tabExits: number;
        fullscreenExits: number;
        pasteAttempts: number;
        outOfWindowSeconds: number;
        flags: number;
    };
}

const STATUS_OPTIONS = [
    { value: '', label: 'All Statuses' },
    { value: 'IN_PROGRESS', label: 'In Progress' },
    { value: 'SUBMITTED', label: 'Submitted' },
    { value: 'GRADING', label: 'Grading' },
    { value: 'COMPLETED', label: 'Completed' },
    { value: 'FAILED', label: 'Failed' },
];

export default function AttemptsPage() {
    const searchParams = useSearchParams();
    const initialExamId = searchParams.get('examId') || '';

    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [examIdFilter, setExamIdFilter] = useState(initialExamId);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const debouncedSearch = useDebounce(search, 300);
    const router = useRouter();

    const fetcher = useCallback(async (params: PaginationParams) => {
        const res = await api.getAllAttempts({
            ...params,
            search: debouncedSearch || undefined,
            status: statusFilter || undefined,
            examId: examIdFilter || undefined,
        });
        return { data: res.data, total: res.total, page: res.page, limit: res.limit };
    }, [debouncedSearch, statusFilter, examIdFilter]);

    const {
        data: attempts,
        total,
        page,
        limit,
        isLoading,
        setPage,
        setSort,
        refetch,
    } = usePaginatedQuery<AttemptItem>(fetcher);

    const getStatusBadge = (status: string) => {
        const map: Record<string, { class: string; icon: React.ReactNode }> = {
            'IN_PROGRESS': { class: 'badge-warning', icon: <Clock size={12} /> },
            'SUBMITTED': { class: 'badge-info', icon: <Clock size={12} /> },
            'GRADING': { class: 'badge-info', icon: <Clock size={12} /> },
            'COMPLETED': { class: 'badge-success', icon: <CheckCircle size={12} /> },
            'FAILED': { class: 'badge-error', icon: <XCircle size={12} /> },
        };
        const info = map[status] || { class: 'badge-info', icon: null };
        return (
            <span className={`badge ${info.class}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                {info.icon}
                {status.replace(/_/g, ' ')}
            </span>
        );
    };

    const getScoreColor = (pct: number) => {
        if (pct >= 70) return 'var(--accent-green)';
        if (pct >= 40) return 'var(--accent-orange)';
        return 'var(--error)';
    };

    const hasFilters = statusFilter || examIdFilter;

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else if (next.size < 4) next.add(id);
            return next;
        });
    };

    const columns: Column<AttemptItem>[] = useMemo(() => [
        {
            key: 'select',
            header: '',
            width: '40px',
            render: (item) => (
                <input
                    type="checkbox"
                    checked={selectedIds.has(item.id)}
                    onChange={() => toggleSelect(item.id)}
                    style={{ cursor: 'pointer', width: 16, height: 16 }}
                />
            ),
        },
        {
            key: 'candidate',
            header: 'Candidate',
            render: (item) => (
                <div className={styles.candidateCell}>
                    <span className={styles.candidateName}>
                        {item.candidate.name || 'Unnamed'}
                    </span>
                    <span className={styles.candidateEmail}>{item.candidate.email}</span>
                </div>
            ),
        },
        {
            key: 'exam',
            header: 'Exam',
            render: (item) => (
                <div className={styles.examCell}>
                    <span className={styles.examTitle}>{item.exam.title}</span>
                    {item.exam.challengeName && (
                        <span className={styles.challengeName}>{item.exam.challengeName}</span>
                    )}
                </div>
            ),
        },
        {
            key: 'status',
            header: 'Status',
            width: '130px',
            sortable: true,
            render: (item) => getStatusBadge(item.status),
        },
        {
            key: 'score',
            header: 'Score',
            width: '140px',
            render: (item) => {
                if (item.score.percentage === null) {
                    return <span className={styles.scorePending}>Pending</span>;
                }
                const pct = item.score.percentage;
                return (
                    <div className={styles.scoreCell}>
                        <div className={styles.scoreBar}>
                            <div
                                className={styles.scoreBarFill}
                                style={{
                                    width: `${pct}%`,
                                    background: getScoreColor(pct),
                                }}
                            />
                        </div>
                        <span
                            className={styles.scorePercent}
                            style={{ color: getScoreColor(pct) }}
                        >
                            {pct}%
                        </span>
                    </div>
                );
            },
        },
        {
            key: 'integrity',
            header: 'Integrity',
            width: '110px',
            render: (item) => {
                const flags = item.integrity.flags;
                if (flags === 0) {
                    return <span className={styles.integrityClean}>✓ Clean</span>;
                }
                return (
                    <div className={styles.integrityCell}>
                        <span className={styles.integrityBadge} data-warning={flags > 2}>
                            <AlertTriangle size={11} />
                            {flags} flag{flags !== 1 ? 's' : ''}
                        </span>
                    </div>
                );
            },
        },
        {
            key: 'startedAt',
            header: 'Started',
            width: '140px',
            sortable: true,
            render: (item) => (
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {new Date(item.startedAt).toLocaleDateString()}{' '}
                    {new Date(item.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
            ),
        },
        {
            key: 'actions',
            header: '',
            width: '60px',
            render: (item) => (
                <div className={styles.actions}>
                    <Link
                        href={`/admin/reports/attempt/${item.id}`}
                        className={styles.actionBtn}
                        title="View Report"
                    >
                        <Eye size={14} />
                    </Link>
                </div>
            ),
        },
    ], [selectedIds]);

    // Count stats from current data
    const statusCounts = useMemo(() => {
        const counts = { total: 0, inProgress: 0, completed: 0, failed: 0 };
        counts.total = total;
        attempts.forEach(a => {
            if (a.status === 'IN_PROGRESS') counts.inProgress++;
            if (a.status === 'COMPLETED') counts.completed++;
            if (a.status === 'FAILED') counts.failed++;
        });
        return counts;
    }, [attempts, total]);

    return (
        <AdminLayout
            title="All Attempts"
            breadcrumbs={[
                { label: 'Dashboard', href: '/admin' },
                { label: 'Attempts' },
            ]}
        >
            {/* Stats summary bar */}
            <div className={styles.statsBar}>
                <div className={styles.statItem}>
                    <span className={styles.statCount}>{total}</span>
                    <span className={styles.statLabel}>Total</span>
                </div>
                <div className={styles.statItem}>
                    <span className={styles.statDot} style={{ background: 'var(--accent-orange)' }} />
                    <span className={styles.statCount}>{statusCounts.inProgress}</span>
                    <span className={styles.statLabel}>In Progress</span>
                </div>
                <div className={styles.statItem}>
                    <span className={styles.statDot} style={{ background: 'var(--accent-green)' }} />
                    <span className={styles.statCount}>{statusCounts.completed}</span>
                    <span className={styles.statLabel}>Completed</span>
                </div>
                <div className={styles.statItem}>
                    <span className={styles.statDot} style={{ background: 'var(--error)' }} />
                    <span className={styles.statCount}>{statusCounts.failed}</span>
                    <span className={styles.statLabel}>Failed</span>
                </div>
            </div>

            {/* Toolbar */}
            <div className={styles.toolbar}>
                <div className={styles.searchBox}>
                    <Search size={16} className={styles.searchIcon} />
                    <input
                        type="text"
                        placeholder="Search by candidate or exam..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className={styles.searchInput}
                    />
                </div>
                <div className={styles.filterGroup}>
                    <select
                        value={statusFilter}
                        onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                        className={`${styles.filterSelect} ${statusFilter ? styles.activeFilter : ''}`}
                    >
                        {STATUS_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                </div>
                {hasFilters && (
                    <button
                        className={styles.clearFilters}
                        onClick={() => {
                            setStatusFilter('');
                            setExamIdFilter('');
                            setPage(1);
                        }}
                    >
                        <X size={12} /> Clear filters
                    </button>
                )}
                {selectedIds.size >= 2 && (
                    <button
                        className="btn btn-primary btn-sm"
                        onClick={() => router.push(`/admin/reports/compare?ids=${Array.from(selectedIds).join(',')}`)}
                    >
                        <GitCompare size={14} /> Compare ({selectedIds.size})
                    </button>
                )}
                {selectedIds.size > 0 && selectedIds.size < 2 && (
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Select {2 - selectedIds.size} more to compare</span>
                )}
            </div>

            <DataTable
                columns={columns}
                data={attempts}
                totalCount={total}
                page={page}
                pageSize={limit}
                onPageChange={setPage}
                onSort={setSort}
                isLoading={isLoading}
                emptyMessage="No attempts found."
                rowKey="id"
            />
        </AdminLayout>
    );
}
