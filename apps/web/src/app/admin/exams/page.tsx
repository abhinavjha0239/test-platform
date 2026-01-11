'use client';

import { useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { AdminLayout } from '@/components/admin';
import { DataTable, Column, ConfirmModal, Modal, InputField, SelectField, FormActions, useToast } from '@/components/ui';
import { usePaginatedQuery, useMutation, useDebounce } from '@/hooks';
import { api, PaginationParams } from '@/lib/api';
import { Plus, Edit2, Trash2, Eye, EyeOff, Send, Copy, Check, Search, Flame, Loader2 } from 'lucide-react';
import styles from './exams.module.css';

interface Exam {
    id: string;
    title: string;
    description?: string;
    timeLimit: number;
    maxAttempts: number;
    isPublished: boolean;
    createdAt: string;
    challenge?: { id: string; name: string };
}

export default function ExamsPage() {
    const toast = useToast();
    const [search, setSearch] = useState('');
    const debouncedSearch = useDebounce(search, 300);

    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [inviteModal, setInviteModal] = useState<{ examId: string; examTitle: string } | null>(null);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteExpiry, setInviteExpiry] = useState('48');
    const [inviteUrl, setInviteUrl] = useState('');
    const [copied, setCopied] = useState(false);
    const [warmingPoolId, setWarmingPoolId] = useState<string | null>(null);

    const fetcher = useCallback(async (params: PaginationParams) => {
        const res = await api.getExams({
            ...params,
            search: debouncedSearch || undefined,
        });
        return { data: res.data, total: res.total, page: res.page, limit: res.limit };
    }, [debouncedSearch]);

    const {
        data: exams,
        total,
        page,
        limit,
        isLoading,
        setPage,
        setSort,
        refetch,
    } = usePaginatedQuery<Exam>(fetcher);

    const deleteMutation = useMutation(
        (id: string) => api.deleteExam(id),
        {
            onSuccess: () => {
                toast.success('Exam deleted successfully');
                refetch();
                setDeleteId(null);
            },
            onError: (err) => {
                toast.error(err.message);
            },
        }
    );

    const publishMutation = useMutation(
        ({ id, publish }: { id: string; publish: boolean }) =>
            publish ? api.publishExam(id) : api.unpublishExam(id),
        {
            onSuccess: (_, vars) => {
                toast.success(vars.publish ? 'Exam published' : 'Exam unpublished');
                refetch();
            },
            onError: (err) => {
                toast.error(err.message);
            },
        }
    );

    const inviteMutation = useMutation(
        ({ examId, email, expiry }: { examId: string; email: string; expiry: number }) =>
            api.createInvitation(examId, email, expiry),
        {
            onSuccess: (data) => {
                setInviteUrl(data.data.inviteUrl);
                toast.success('Invitation created');
            },
            onError: (err) => {
                toast.error(err.message);
            },
        }
    );

    const handleWarmPool = async (examId: string) => {
        setWarmingPoolId(examId);
        try {
            // Manual warmup should stay small (fast) by default.
            const result = await api.warmPoolForExam(examId, { testRunners: 2, candidates: 2 });
            if (result.success) {
                toast.success(
                    `Pool warmed: ${result.testRunners} test runners + ${result.candidateContainers} candidates (${result.warmupTimeMs}ms)`
                );
            } else {
                toast.error(result.error || 'Failed to warm pool');
            }
        } catch (error) {
            toast.error(String(error));
        } finally {
            setWarmingPoolId(null);
        }
    };

    const handleCopyInvite = async () => {
        await navigator.clipboard.writeText(inviteUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleSendInvite = () => {
        if (!inviteModal || !inviteEmail) return;
        inviteMutation.mutate({
            examId: inviteModal.examId,
            email: inviteEmail,
            expiry: parseInt(inviteExpiry) || 48,
        });
    };

    const closeInviteModal = () => {
        setInviteModal(null);
        setInviteEmail('');
        setInviteUrl('');
        setCopied(false);
    };

    const columns: Column<Exam>[] = useMemo(() => [
        {
            key: 'title',
            header: 'Title',
            sortable: true,
            render: (exam) => (
                <div className={styles.titleCell}>
                    <span className={styles.examTitle}>{exam.title}</span>
                    {exam.challenge && (
                        <span className={styles.challengeName}>{exam.challenge.name}</span>
                    )}
                </div>
            ),
        },
        {
            key: 'timeLimit',
            header: 'Duration',
            width: '100px',
            render: (exam) => `${exam.timeLimit} min`,
        },
        {
            key: 'maxAttempts',
            header: 'Attempts',
            width: '100px',
            render: (exam) => exam.maxAttempts,
        },
        {
            key: 'isPublished',
            header: 'Status',
            width: '120px',
            render: (exam) => (
                <span className={`badge ${exam.isPublished ? 'badge-success' : 'badge-warning'}`}>
                    {exam.isPublished ? 'Published' : 'Draft'}
                </span>
            ),
        },
        {
            key: 'createdAt',
            header: 'Created',
            sortable: true,
            width: '120px',
            render: (exam) => new Date(exam.createdAt).toLocaleDateString(),
        },
        {
            key: 'actions',
            header: 'Actions',
            width: '240px',
            render: (exam) => (
                <div className={styles.actions}>
                    <Link href={`/admin/exams/${exam.id}/edit`} className={styles.actionBtn} title="Edit">
                        <Edit2 size={14} />
                    </Link>
                    <button
                        onClick={() => publishMutation.mutate({ id: exam.id, publish: !exam.isPublished })}
                        className={styles.actionBtn}
                        title={exam.isPublished ? 'Unpublish' : 'Publish'}
                        disabled={publishMutation.isLoading}
                    >
                        {exam.isPublished ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                    <button
                        onClick={() => handleWarmPool(exam.id)}
                        className={styles.actionBtn}
                        title="Warm Container Pool"
                        disabled={warmingPoolId === exam.id}
                        style={{ color: warmingPoolId === exam.id ? 'var(--accent-orange)' : undefined }}
                    >
                        {warmingPoolId === exam.id ? <Loader2 size={14} className="spin" /> : <Flame size={14} />}
                    </button>
                    <button
                        onClick={() => setInviteModal({ examId: exam.id, examTitle: exam.title })}
                        className={styles.actionBtn}
                        title="Send Invitation"
                    >
                        <Send size={14} />
                    </button>
                    <button
                        onClick={() => setDeleteId(exam.id)}
                        className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                        title="Delete"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            ),
        },
    ], [publishMutation, warmingPoolId]);

    return (
        <AdminLayout
            title="Exams"
            breadcrumbs={[
                { label: 'Dashboard', href: '/admin' },
                { label: 'Exams' },
            ]}
            actions={
                <Link href="/admin/exams/new" className="btn btn-primary">
                    <Plus size={16} /> Create Exam
                </Link>
            }
        >
            <div className={styles.toolbar}>
                <div className={styles.searchBox}>
                    <Search size={16} className={styles.searchIcon} />
                    <input
                        type="text"
                        placeholder="Search exams..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className={styles.searchInput}
                    />
                </div>
            </div>

            <DataTable
                columns={columns}
                data={exams}
                totalCount={total}
                page={page}
                pageSize={limit}
                onPageChange={setPage}
                onSort={setSort}
                isLoading={isLoading}
                emptyMessage="No exams found. Create your first exam!"
                rowKey="id"
            />

            <ConfirmModal
                isOpen={!!deleteId}
                onClose={() => setDeleteId(null)}
                onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
                title="Delete Exam"
                message="Are you sure you want to delete this exam? This action cannot be undone and will remove all associated attempts."
                confirmText="Delete"
                variant="danger"
                isLoading={deleteMutation.isLoading}
            />

            <Modal
                isOpen={!!inviteModal}
                onClose={closeInviteModal}
                title={`Invite to: ${inviteModal?.examTitle}`}
                size="md"
            >
                <div className={styles.inviteForm}>
                    <InputField
                        label="Candidate Email"
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="candidate@example.com"
                        required
                    />
                    <SelectField
                        label="Expires In"
                        value={inviteExpiry}
                        onChange={(e) => setInviteExpiry(e.target.value)}
                        options={[
                            { value: '24', label: '24 hours' },
                            { value: '48', label: '48 hours' },
                            { value: '72', label: '72 hours' },
                            { value: '168', label: '1 week' },
                        ]}
                    />

                    {inviteUrl && (
                        <div className={styles.inviteUrlBox}>
                            <label className={styles.inviteUrlLabel}>Invitation URL</label>
                            <div className={styles.inviteUrlRow}>
                                <input
                                    type="text"
                                    value={inviteUrl}
                                    readOnly
                                    className={styles.inviteUrlInput}
                                />
                                <button onClick={handleCopyInvite} className="btn btn-secondary">
                                    {copied ? <Check size={16} /> : <Copy size={16} />}
                                </button>
                            </div>
                        </div>
                    )}

                    <FormActions>
                        <button onClick={closeInviteModal} className="btn btn-secondary">
                            Close
                        </button>
                        <button
                            onClick={handleSendInvite}
                            className="btn btn-primary"
                            disabled={!inviteEmail || inviteMutation.isLoading}
                        >
                            {inviteMutation.isLoading ? 'Creating...' : 'Create Invitation'}
                        </button>
                    </FormActions>
                </div>
            </Modal>
        </AdminLayout>
    );
}


