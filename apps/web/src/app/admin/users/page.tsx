'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { useRouter } from 'next/navigation';
import styles from './users.module.css';

interface User {
    id: string;
    email: string;
    name: string | null;
    role: 'ADMIN' | 'CANDIDATE' | 'REVIEWER';
    approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
    createdAt: string;
    approvedAt: string | null;
    approver?: {
        id: string;
        email: string;
        name: string | null;
    };
}

interface Stats {
    total: number;
    admins: number;
    reviewers: number;
    candidates: number;
    pendingApproval: number;
}

export default function AdminUsersPage() {
    const router = useRouter();
    const { user, checkAuth } = useAuthStore();
    const [users, setUsers] = useState<User[]>([]);
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    
    // Filters
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('');
    const [roleFilter, setRoleFilter] = useState<string>('');
    
    // Pagination
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const limit = 20;

    useEffect(() => {
        checkAuth().then(() => {
            if (!user || user.role !== 'ADMIN') {
                router.push('/login');
            }
        });
    }, []);

    const fetchUsers = useCallback(async () => {
        setLoading(true);
        setError(null);
        
        try {
            const params = new URLSearchParams();
            params.set('page', String(page));
            params.set('limit', String(limit));
            if (search) params.set('search', search);
            if (statusFilter) params.set('status', statusFilter);
            if (roleFilter) params.set('role', roleFilter);

            const response = await api.fetch<{ 
                success: boolean; 
                data: User[]; 
                total: number 
            }>(`/admin/users?${params.toString()}`);
            
            setUsers(response.data);
            setTotal(response.total);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch users');
        } finally {
            setLoading(false);
        }
    }, [page, search, statusFilter, roleFilter]);

    const fetchStats = async () => {
        try {
            const response = await api.fetch<{ success: boolean; data: Stats }>('/admin/users/stats');
            setStats(response.data);
        } catch (err) {
            console.error('Failed to fetch stats:', err);
        }
    };

    useEffect(() => {
        if (user?.role === 'ADMIN') {
            fetchUsers();
            fetchStats();
        }
    }, [user, fetchUsers]);

    const handleApprove = async (userId: string) => {
        setActionLoading(userId);
        setError(null);
        
        try {
            await api.fetch(`/admin/users/${userId}/approve`, { method: 'POST' });
            setSuccess('User approved successfully');
            fetchUsers();
            fetchStats();
            setTimeout(() => setSuccess(null), 3000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to approve user');
        } finally {
            setActionLoading(null);
        }
    };

    const handleReject = async (userId: string) => {
        if (!confirm('Are you sure you want to reject this user?')) return;
        
        setActionLoading(userId);
        setError(null);
        
        try {
            await api.fetch(`/admin/users/${userId}/reject`, { method: 'POST' });
            setSuccess('User rejected');
            fetchUsers();
            fetchStats();
            setTimeout(() => setSuccess(null), 3000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to reject user');
        } finally {
            setActionLoading(null);
        }
    };

    const handleRoleChange = async (userId: string, newRole: string) => {
        setActionLoading(userId);
        setError(null);
        
        try {
            await api.fetch(`/admin/users/${userId}/role`, { 
                method: 'PUT',
                body: JSON.stringify({ role: newRole }),
            });
            setSuccess('User role updated');
            fetchUsers();
            fetchStats();
            setTimeout(() => setSuccess(null), 3000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update role');
        } finally {
            setActionLoading(null);
        }
    };

    const totalPages = Math.ceil(total / limit);

    const getStatusBadgeClass = (status: string) => {
        switch (status) {
            case 'APPROVED': return styles.statusApproved;
            case 'PENDING': return styles.statusPending;
            case 'REJECTED': return styles.statusRejected;
            default: return '';
        }
    };

    const getRoleBadgeClass = (role: string) => {
        switch (role) {
            case 'ADMIN': return styles.roleAdmin;
            case 'REVIEWER': return styles.roleReviewer;
            case 'CANDIDATE': return styles.roleCandidate;
            default: return '';
        }
    };

    if (!user || user.role !== 'ADMIN') {
        return <div className={styles.loading}>Loading...</div>;
    }

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <div>
                    <h1>User Management</h1>
                    <p>Manage user accounts and approval requests</p>
                </div>
            </header>

            {/* Stats Cards */}
            {stats && (
                <div className={styles.statsGrid}>
                    <div className={styles.statCard}>
                        <span className={styles.statValue}>{stats.total}</span>
                        <span className={styles.statLabel}>Total Users</span>
                    </div>
                    <div className={`${styles.statCard} ${styles.statPending}`}>
                        <span className={styles.statValue}>{stats.pendingApproval}</span>
                        <span className={styles.statLabel}>Pending Approval</span>
                    </div>
                    <div className={styles.statCard}>
                        <span className={styles.statValue}>{stats.admins}</span>
                        <span className={styles.statLabel}>Admins</span>
                    </div>
                    <div className={styles.statCard}>
                        <span className={styles.statValue}>{stats.reviewers}</span>
                        <span className={styles.statLabel}>Reviewers</span>
                    </div>
                    <div className={styles.statCard}>
                        <span className={styles.statValue}>{stats.candidates}</span>
                        <span className={styles.statLabel}>Candidates</span>
                    </div>
                </div>
            )}

            {/* Alerts */}
            {error && <div className={styles.alertError}>{error}</div>}
            {success && <div className={styles.alertSuccess}>{success}</div>}

            {/* Filters */}
            <div className={styles.filters}>
                <input
                    type="text"
                    placeholder="Search by email or name..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                    className={styles.searchInput}
                />
                <select
                    value={statusFilter}
                    onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                    className={styles.filterSelect}
                >
                    <option value="">All Status</option>
                    <option value="PENDING">Pending</option>
                    <option value="APPROVED">Approved</option>
                    <option value="REJECTED">Rejected</option>
                </select>
                <select
                    value={roleFilter}
                    onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
                    className={styles.filterSelect}
                >
                    <option value="">All Roles</option>
                    <option value="ADMIN">Admin</option>
                    <option value="REVIEWER">Reviewer</option>
                    <option value="CANDIDATE">Candidate</option>
                </select>
            </div>

            {/* Users Table */}
            <div className={styles.tableContainer}>
                {loading ? (
                    <div className={styles.loading}>Loading users...</div>
                ) : users.length === 0 ? (
                    <div className={styles.empty}>No users found</div>
                ) : (
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>User</th>
                                <th>Role</th>
                                <th>Status</th>
                                <th>Created</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map((u) => (
                                <tr key={u.id}>
                                    <td>
                                        <div className={styles.userInfo}>
                                            <span className={styles.userName}>{u.name || 'Unnamed'}</span>
                                            <span className={styles.userEmail}>{u.email}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <span className={`${styles.badge} ${getRoleBadgeClass(u.role)}`}>
                                            {u.role}
                                        </span>
                                    </td>
                                    <td>
                                        <span className={`${styles.badge} ${getStatusBadgeClass(u.approvalStatus)}`}>
                                            {u.approvalStatus}
                                        </span>
                                    </td>
                                    <td>
                                        {new Date(u.createdAt).toLocaleDateString()}
                                    </td>
                                    <td>
                                        <div className={styles.actions}>
                                            {u.approvalStatus === 'PENDING' && (
                                                <>
                                                    <button
                                                        onClick={() => handleApprove(u.id)}
                                                        disabled={actionLoading === u.id}
                                                        className={styles.approveBtn}
                                                    >
                                                        {actionLoading === u.id ? '...' : 'Approve'}
                                                    </button>
                                                    <button
                                                        onClick={() => handleReject(u.id)}
                                                        disabled={actionLoading === u.id}
                                                        className={styles.rejectBtn}
                                                    >
                                                        Reject
                                                    </button>
                                                </>
                                            )}
                                            {u.approvalStatus === 'APPROVED' && u.id !== user.id && (
                                                <select
                                                    value={u.role}
                                                    onChange={(e) => handleRoleChange(u.id, e.target.value)}
                                                    disabled={actionLoading === u.id}
                                                    className={styles.roleSelect}
                                                >
                                                    <option value="CANDIDATE">Candidate</option>
                                                    <option value="REVIEWER">Reviewer</option>
                                                    <option value="ADMIN">Admin</option>
                                                </select>
                                            )}
                                            {u.id === user.id && (
                                                <span className={styles.youLabel}>(You)</span>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className={styles.pagination}>
                    <button
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                    >
                        Previous
                    </button>
                    <span>Page {page} of {totalPages}</span>
                    <button
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                    >
                        Next
                    </button>
                </div>
            )}
        </div>
    );
}


