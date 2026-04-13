'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { AdminLayout } from '@/components/admin';
import { Skeleton, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import {
    GitCompare, CheckCircle, XCircle, AlertTriangle, Clock, Code2, Shield
} from 'lucide-react';
import styles from './compare.module.css';

interface AttemptDetail {
    id: string;
    candidate: { name?: string; email: string };
    status: string;
    publicScore: number;
    hiddenScore: number;
    totalPublic: number;
    totalHidden: number;
    startedAt: string;
    submittedAt?: string;
    tabExits: number;
    fullscreenExits: number;
    pasteAttempts: number;
    files?: Record<string, string>;
}

export default function ComparePage() {
    const searchParams = useSearchParams();
    const ids = searchParams.get('ids')?.split(',').filter(Boolean) || [];
    const [attempts, setAttempts] = useState<AttemptDetail[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedFile, setSelectedFile] = useState<string>('');

    useEffect(() => {
        if (ids.length === 0) { setLoading(false); return; }

        const fetchAll = async () => {
            setLoading(true);
            try {
                const results = await Promise.all(
                    ids.map(id => api.getAttemptReport(id))
                );
                setAttempts(results.map((r: any) => ({
                    id: r.id || r.attempt?.id,
                    candidate: r.candidate || r.attempt?.candidate || {},
                    status: r.status || r.attempt?.status || 'UNKNOWN',
                    publicScore: r.score?.public ?? r.attempt?.publicScore ?? 0,
                    hiddenScore: r.score?.hidden ?? r.attempt?.hiddenScore ?? 0,
                    totalPublic: r.score?.totalPublic ?? r.attempt?.totalPublic ?? 0,
                    totalHidden: r.score?.totalHidden ?? r.attempt?.totalHidden ?? 0,
                    startedAt: r.startedAt || r.attempt?.startedAt || '',
                    submittedAt: r.submittedAt || r.attempt?.submittedAt,
                    tabExits: r.integrity?.tabExits ?? r.attempt?.tabExits ?? 0,
                    fullscreenExits: r.integrity?.fullscreenExits ?? r.attempt?.fullscreenExits ?? 0,
                    pasteAttempts: r.integrity?.pasteAttempts ?? r.attempt?.pasteAttempts ?? 0,
                    files: r.files || r.attempt?.files || {},
                })));
            } catch (e) {
                console.error('Compare fetch failed', e);
            }
            setLoading(false);
        };
        fetchAll();
    }, []);

    const allFiles = useMemo(() => {
        const fileSet = new Set<string>();
        attempts.forEach(a => Object.keys(a.files || {}).forEach(f => fileSet.add(f)));
        return Array.from(fileSet).sort();
    }, [attempts]);

    useEffect(() => {
        if (allFiles.length > 0 && !selectedFile) setSelectedFile(allFiles[0]);
    }, [allFiles, selectedFile]);

    if (ids.length === 0) {
        return (
            <AdminLayout title="Compare" breadcrumbs={[{ label: 'Dashboard', href: '/admin' }, { label: 'Compare' }]}>
                <div className={styles.emptyState}>
                    <GitCompare size={40} />
                    <h2>No Attempts Selected</h2>
                    <p>Go to the Attempts page, select attempts using checkboxes, and click &quot;Compare Selected&quot;.</p>
                </div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout
            title={`Compare ${ids.length} Attempts`}
            breadcrumbs={[
                { label: 'Dashboard', href: '/admin' },
                { label: 'Attempts', href: '/admin/attempts' },
                { label: 'Compare' },
            ]}
        >
            {loading ? (
                <Skeleton height="400px" />
            ) : (
                <div className={styles.container}>
                    {/* Metrics Comparison */}
                    <div className={styles.metricsGrid} style={{ gridTemplateColumns: `180px repeat(${attempts.length}, 1fr)` }}>
                        {/* Header row */}
                        <div className={styles.metricLabel}>Candidate</div>
                        {attempts.map(a => (
                            <div key={a.id} className={styles.metricValue}>
                                <span className={styles.candidateName}>{a.candidate?.name || 'Unnamed'}</span>
                                <span className={styles.candidateEmail}>{a.candidate?.email}</span>
                            </div>
                        ))}

                        <div className={styles.metricLabel}>Status</div>
                        {attempts.map(a => (
                            <div key={a.id} className={styles.metricValue}>
                                <span className={`badge badge-${a.status === 'COMPLETED' ? 'success' : a.status === 'FAILED' ? 'error' : 'info'}`}>
                                    {a.status.replace(/_/g, ' ')}
                                </span>
                            </div>
                        ))}

                        <div className={styles.metricLabel}>
                            <CheckCircle size={14} /> Score
                        </div>
                        {attempts.map(a => {
                            const total = (a.totalPublic || 0) + (a.totalHidden || 0);
                            const passed = (a.publicScore || 0) + (a.hiddenScore || 0);
                            const pct = total > 0 ? Math.round((passed / total) * 100) : 0;
                            return (
                                <div key={a.id} className={styles.metricValue}>
                                    <div className={styles.scoreDisplay}>
                                        <div className={styles.scoreBarBg}>
                                            <div className={styles.scoreBarFill} style={{
                                                width: `${pct}%`,
                                                background: pct >= 70 ? 'var(--accent-green)' : pct >= 40 ? 'var(--accent-orange)' : 'var(--error)',
                                            }} />
                                        </div>
                                        <span style={{
                                            fontWeight: 700, fontSize: 16,
                                            color: pct >= 70 ? 'var(--accent-green)' : pct >= 40 ? 'var(--accent-orange)' : 'var(--error)',
                                        }}>{pct}%</span>
                                    </div>
                                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                        {passed}/{total} tests
                                    </span>
                                </div>
                            );
                        })}

                        <div className={styles.metricLabel}>
                            <Clock size={14} /> Duration
                        </div>
                        {attempts.map(a => {
                            const dur = a.submittedAt && a.startedAt
                                ? Math.round((new Date(a.submittedAt).getTime() - new Date(a.startedAt).getTime()) / 60000)
                                : null;
                            return (
                                <div key={a.id} className={styles.metricValue}>
                                    {dur !== null ? `${dur} min` : '-'}
                                </div>
                            );
                        })}

                        <div className={styles.metricLabel}>
                            <Shield size={14} /> Integrity
                        </div>
                        {attempts.map(a => {
                            const flags = a.tabExits + a.fullscreenExits + a.pasteAttempts;
                            return (
                                <div key={a.id} className={styles.metricValue}>
                                    {flags > 0 ? (
                                        <span className={styles.flagBadge} data-warning={flags > 2}>
                                            <AlertTriangle size={12} /> {flags} flag{flags !== 1 ? 's' : ''}
                                        </span>
                                    ) : (
                                        <span style={{ color: 'var(--accent-green)', fontSize: 12 }}>✓ Clean</span>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Code Comparison */}
                    {allFiles.length > 0 && (
                        <div className={styles.codeSection}>
                            <h3 className={styles.codeSectionTitle}>
                                <Code2 size={16} /> Code Comparison
                            </h3>
                            <div className={styles.fileTabs}>
                                {allFiles.map(f => (
                                    <button
                                        key={f}
                                        className={`${styles.fileTab} ${selectedFile === f ? styles.fileTabActive : ''}`}
                                        onClick={() => setSelectedFile(f)}
                                    >
                                        {f.split('/').pop()}
                                    </button>
                                ))}
                            </div>
                            <div className={styles.codeGrid} style={{ gridTemplateColumns: `repeat(${attempts.length}, 1fr)` }}>
                                {attempts.map(a => (
                                    <div key={a.id} className={styles.codePanel}>
                                        <div className={styles.codePanelHeader}>
                                            {a.candidate?.name || a.candidate?.email || 'Unnamed'}
                                        </div>
                                        <pre className={styles.codeContent}>
                                            {a.files?.[selectedFile] || '// File not found'}
                                        </pre>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </AdminLayout>
    );
}
