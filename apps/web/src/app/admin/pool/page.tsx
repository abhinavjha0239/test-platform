'use client';

import { useEffect, useState, useCallback } from 'react';
import { AdminLayout } from '@/components/admin';
import { useToast } from '@/components/ui';
import { api } from '@/lib/api';
import {
    Server, RefreshCw, Trash2, Settings, Activity,
    CheckCircle, AlertCircle, Clock, Loader2
} from 'lucide-react';
import styles from '../admin.module.css';

interface PoolStats {
    size: number;
    available: number;
    borrowed: number;
    pending: number;
    min: number;
    max: number;
}

interface PoolStatus {
    testRunners: PoolStats | null;
    candidates: Record<string, PoolStats>;
}

export default function PoolManagementPage() {
    const [poolStatus, setPoolStatus] = useState<PoolStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [draining, setDraining] = useState(false);
    const [resizing, setResizing] = useState(false);
    const [newSize, setNewSize] = useState({ testRunners: 20, candidates: 20 });
    const toast = useToast();

    const fetchPoolStatus = useCallback(async () => {
        try {
            const status = await api.getPoolStatus();
            setPoolStatus(status);
        } catch (error) {
            console.error('Failed to fetch pool status:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchPoolStatus();
        // Refresh every 30 seconds (reduced from 5s to avoid spam)
        const interval = setInterval(() => {
            // Only fetch when page is visible
            if (!document.hidden) {
                fetchPoolStatus();
            }
        }, 30000);
        return () => clearInterval(interval);
    }, [fetchPoolStatus]);

    const handleRefresh = async () => {
        setRefreshing(true);
        await fetchPoolStatus();
    };

    const handleDrainPools = async () => {
        if (!confirm('Are you sure you want to drain all container pools? This will stop all running containers.')) {
            return;
        }

        setDraining(true);
        try {
            await api.drainAllPools();
            toast.success('All container pools have been drained successfully.');
            await fetchPoolStatus();
        } catch (error) {
            toast.error(String(error));
        } finally {
            setDraining(false);
        }
    };

    const handleResizePool = async () => {
        setResizing(true);
        try {
            await api.resizePool({
                testRunners: newSize.testRunners,
                candidates: newSize.candidates,
                runtime: 'node',
            });
            toast.success(`Pools resized to ${newSize.testRunners} test runners and ${newSize.candidates} candidates.`);
            await fetchPoolStatus();
        } catch (error) {
            toast.error(String(error));
        } finally {
            setResizing(false);
        }
    };

    const renderPoolCard = (title: string, stats: PoolStats | null, icon: React.ReactNode) => {
        if (!stats) {
            return (
                <div className={styles.statCard} style={{ opacity: 0.6 }}>
                    <div className={styles.statIcon} style={{ background: 'rgba(128, 128, 128, 0.1)', color: '#888' }}>
                        {icon}
                    </div>
                    <div className={styles.statInfo}>
                        <span className={styles.statValue}>Not Active</span>
                        <span className={styles.statLabel}>{title}</span>
                    </div>
                </div>
            );
        }

        const utilization = stats.size > 0 ? Math.round((stats.borrowed / stats.size) * 100) : 0;
        const color = utilization > 80 ? 'var(--accent-red)' : utilization > 50 ? 'var(--accent-orange)' : 'var(--accent-green)';

        return (
            <div className={styles.statCard}>
                <div className={styles.statIcon} style={{ background: `${color}20`, color }}>
                    {icon}
                </div>
                <div className={styles.statInfo}>
                    <span className={styles.statValue}>{stats.available}/{stats.size}</span>
                    <span className={styles.statLabel}>{title} Available</span>
                </div>
                <div style={{
                    marginLeft: 'auto',
                    fontSize: '0.85rem',
                    color: 'var(--text-secondary)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                    gap: '4px'
                }}>
                    <span>Borrowed: {stats.borrowed}</span>
                    <span>Pending: {stats.pending}</span>
                    <span style={{ color }}>Utilization: {utilization}%</span>
                </div>
            </div>
        );
    };

    return (
        <AdminLayout
            title="Container Pool Management"
            actions={
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        className="btn btn-secondary"
                        onClick={handleRefresh}
                        disabled={refreshing}
                    >
                        {refreshing ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
                        Refresh
                    </button>
                    <button
                        className="btn btn-danger"
                        onClick={handleDrainPools}
                        disabled={draining}
                    >
                        {draining ? <Loader2 size={16} className="spin" /> : <Trash2 size={16} />}
                        Drain All Pools
                    </button>
                </div>
            }
        >
            {/* Pool Status Cards */}
            <div className={styles.stats} style={{ marginBottom: '2rem' }}>
                {loading ? (
                    <>
                        <div className={styles.statCard} style={{ opacity: 0.5 }}>
                            <Loader2 size={24} className="spin" style={{ margin: 'auto' }} />
                        </div>
                        <div className={styles.statCard} style={{ opacity: 0.5 }}>
                            <Loader2 size={24} className="spin" style={{ margin: 'auto' }} />
                        </div>
                    </>
                ) : (
                    <>
                        {renderPoolCard('Test Runners', poolStatus?.testRunners || null, <Server size={24} />)}
                        {Object.entries(poolStatus?.candidates || {}).map(([runtime, stats]) => (
                            renderPoolCard(`${runtime} Candidates`, stats, <Activity size={24} />)
                        ))}
                        {!poolStatus?.testRunners && Object.keys(poolStatus?.candidates || {}).length === 0 && (
                            <div className={styles.statCard}>
                                <div className={styles.statIcon} style={{ background: 'rgba(128, 128, 128, 0.1)', color: '#888' }}>
                                    <AlertCircle size={24} />
                                </div>
                                <div className={styles.statInfo}>
                                    <span className={styles.statValue}>No Pools Active</span>
                                    <span className={styles.statLabel}>Warm a pool to get started</span>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Resize Pool Section */}
            <section className={styles.section}>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
                    <Settings size={20} />
                    Resize Pool
                </h2>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '1rem',
                    marginBottom: '1rem'
                }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                            Test Runners
                        </label>
                        <input
                            type="number"
                            min="1"
                            max="200"
                            value={newSize.testRunners}
                            onChange={(e) => setNewSize(prev => ({ ...prev, testRunners: parseInt(e.target.value) || 1 }))}
                            style={{
                                width: '100%',
                                padding: '0.75rem',
                                border: '1px solid var(--border)',
                                borderRadius: '4px',
                                background: 'var(--bg-secondary)',
                                color: 'var(--text-primary)',
                            }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                            Candidate Containers
                        </label>
                        <input
                            type="number"
                            min="1"
                            max="200"
                            value={newSize.candidates}
                            onChange={(e) => setNewSize(prev => ({ ...prev, candidates: parseInt(e.target.value) || 1 }))}
                            style={{
                                width: '100%',
                                padding: '0.75rem',
                                border: '1px solid var(--border)',
                                borderRadius: '4px',
                                background: 'var(--bg-secondary)',
                                color: 'var(--text-primary)',
                            }}
                        />
                    </div>
                </div>
                <button
                    className="btn btn-primary"
                    onClick={handleResizePool}
                    disabled={resizing}
                >
                    {resizing ? <Loader2 size={16} className="spin" /> : <Settings size={16} />}
                    Apply Resize
                </button>
            </section>

            {/* Info Section */}
            <section className={styles.section} style={{ marginTop: '2rem' }}>
                <h2 style={{ marginBottom: '1rem' }}>About Container Pools</h2>
                <div style={{
                    background: 'var(--bg-secondary)',
                    padding: '1rem',
                    borderRadius: '8px',
                    fontSize: '0.9rem',
                    lineHeight: '1.6',
                    color: 'var(--text-secondary)'
                }}>
                    <p style={{ marginBottom: '1rem' }}>
                        <strong style={{ color: 'var(--text-primary)' }}>Container pools</strong> pre-warm Docker containers
                        with dependencies installed. This eliminates the ~60 second npm install overhead per grading job,
                        reducing grading time to under 1 second.
                    </p>
                    <ul style={{ paddingLeft: '1.5rem', marginBottom: '1rem' }}>
                        <li><strong>Test Runners:</strong> Containers with Jest/Supertest for running tests</li>
                        <li><strong>Candidate Containers:</strong> Runtime-specific containers (Node, Python, etc.)</li>
                        <li><strong>Auto-warmup:</strong> Pools are automatically warmed 15 minutes before scheduled exam start</li>
                    </ul>
                    <p>
                        Use the <strong style={{ color: 'var(--text-primary)' }}>Warm Pool</strong> button on an exam page to
                        manually pre-warm containers before a high-traffic exam.
                    </p>
                </div>
            </section>
        </AdminLayout>
    );
}
