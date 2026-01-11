'use client';

import { useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { AdminLayout } from '@/components/admin';
import { DataTable, Column, ConfirmModal, useToast } from '@/components/ui';
import { usePaginatedQuery, useMutation, useDebounce } from '@/hooks';
import { api, PaginationParams } from '@/lib/api';
import { Plus, Edit2, Trash2, Search } from 'lucide-react';
import styles from './challenges.module.css';

interface Challenge {
    id: string;
    name: string;
    description?: string;
    nodeVersion: string;
    createdAt: string;
}

export default function ChallengesPage() {
    const toast = useToast();
    const [search, setSearch] = useState('');
    const debouncedSearch = useDebounce(search, 300);
    const [deleteId, setDeleteId] = useState<string | null>(null);

    const fetcher = useCallback(async (params: PaginationParams) => {
        const res = await api.getChallenges({
            ...params,
            search: debouncedSearch || undefined,
        });
        return { data: res.data, total: res.total, page: res.page, limit: res.limit };
    }, [debouncedSearch]);

    const {
        data: challenges,
        total,
        page,
        limit,
        isLoading,
        setPage,
        setSort,
        refetch,
    } = usePaginatedQuery<Challenge>(fetcher);

    const deleteMutation = useMutation(
        (id: string) => api.deleteChallenge(id),
        {
            onSuccess: () => {
                toast.success('Challenge deleted successfully');
                refetch();
                setDeleteId(null);
            },
            onError: (err) => {
                toast.error(err.message);
            },
        }
    );

    const columns: Column<Challenge>[] = useMemo(() => [
        {
            key: 'name',
            header: 'Name',
            sortable: true,
            render: (challenge) => (
                <div className={styles.nameCell}>
                    <span className={styles.challengeName}>{challenge.name}</span>
                    {challenge.description && (
                        <span className={styles.description}>
                            {challenge.description.slice(0, 100)}
                            {challenge.description.length > 100 ? '...' : ''}
                        </span>
                    )}
                </div>
            ),
        },
        {
            key: 'nodeVersion',
            header: 'Node Version',
            width: '140px',
            render: (challenge) => (
                <span className={styles.versionBadge}>Node {challenge.nodeVersion}</span>
            ),
        },
        {
            key: 'createdAt',
            header: 'Created',
            sortable: true,
            width: '140px',
            render: (challenge) => new Date(challenge.createdAt).toLocaleDateString(),
        },
        {
            key: 'actions',
            header: 'Actions',
            width: '120px',
            render: (challenge) => (
                <div className={styles.actions}>
                    <Link 
                        href={`/admin/challenges/${challenge.id}/edit`} 
                        className={styles.actionBtn} 
                        title="Edit"
                    >
                        <Edit2 size={14} />
                    </Link>
                    <button
                        onClick={() => setDeleteId(challenge.id)}
                        className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                        title="Delete"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            ),
        },
    ], []);

    return (
        <AdminLayout
            title="Challenges"
            breadcrumbs={[
                { label: 'Dashboard', href: '/admin' },
                { label: 'Challenges' },
            ]}
            actions={
                <Link href="/admin/challenges/new" className="btn btn-primary">
                    <Plus size={16} /> Create Challenge
                </Link>
            }
        >
            <div className={styles.toolbar}>
                <div className={styles.searchBox}>
                    <Search size={16} className={styles.searchIcon} />
                    <input
                        type="text"
                        placeholder="Search challenges..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className={styles.searchInput}
                    />
                </div>
            </div>

            <DataTable
                columns={columns}
                data={challenges}
                totalCount={total}
                page={page}
                pageSize={limit}
                onPageChange={setPage}
                onSort={setSort}
                isLoading={isLoading}
                emptyMessage="No challenges found. Create your first challenge!"
                rowKey="id"
            />

            <ConfirmModal
                isOpen={!!deleteId}
                onClose={() => setDeleteId(null)}
                onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
                title="Delete Challenge"
                message="Are you sure you want to delete this challenge? Any exams using this challenge will be affected."
                confirmText="Delete"
                variant="danger"
                isLoading={deleteMutation.isLoading}
            />
        </AdminLayout>
    );
}


