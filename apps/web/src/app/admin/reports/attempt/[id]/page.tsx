'use client';

import { useParams } from 'next/navigation';
import { AdminLayout } from '@/components/admin';
import { CodeEditor, Skeleton, useToast } from '@/components/ui';
import { useQuery } from '@/hooks';
import { api } from '@/lib/api';
import { 
    User, Clock, FileText, AlertTriangle, CheckCircle, XCircle,
    Eye, EyeOff, Clipboard, Maximize2, Timer
} from 'lucide-react';
import styles from './report.module.css';

interface AttemptReport {
    id: string;
    candidate: { id: string; email: string; name?: string };
    exam: { id: string; title: string; challengeName?: string };
    status: string;
    startedAt: string;
    submittedAt?: string;
    timeSpentMinutes?: number;
    score: {
        public: number;
        hidden: number;
        totalPublic: number;
        totalHidden: number;
    };
    gradingLogs?: string;
    integrity: {
        tabExits: number;
        outOfWindowSeconds: number;
        fullscreenExits: number;
        pasteAttempts: number;
    };
    proctorEvents: Array<{
        id: string;
        eventType: string;
        timestamp: string;
        duration?: number;
    }>;
    files?: Record<string, string>;
}

export default function AttemptReportPage() {
    const params = useParams();
    const attemptId = params.id as string;

    const { data: report, isLoading, error } = useQuery<AttemptReport>(
        () => api.getAttemptReport(attemptId),
        { enabled: !!attemptId }
    );

    if (isLoading) {
        return (
            <AdminLayout
                title="Attempt Report"
                breadcrumbs={[
                    { label: 'Dashboard', href: '/admin' },
                    { label: 'Reports' },
                ]}
            >
                <div className={styles.loading}>
                    <div className={styles.card}>
                        <Skeleton height={32} width="50%" />
                        <div style={{ marginTop: 24 }}>
                            <Skeleton height={100} />
                        </div>
                    </div>
                </div>
            </AdminLayout>
        );
    }

    if (error || !report) {
        return (
            <AdminLayout
                title="Attempt Report"
                breadcrumbs={[
                    { label: 'Dashboard', href: '/admin' },
                    { label: 'Reports' },
                ]}
            >
                <div className={styles.error}>
                    <XCircle size={48} />
                    <h2>Report Not Found</h2>
                    <p>{error?.message || 'The attempt report could not be loaded.'}</p>
                </div>
            </AdminLayout>
        );
    }

    const totalScore = (report.score.public || 0) + (report.score.hidden || 0);
    const totalTests = (report.score.totalPublic || 0) + (report.score.totalHidden || 0);
    const percentage = totalTests > 0 ? Math.round((totalScore / totalTests) * 100) : 0;
    const passed = percentage >= 70;

    const formatTime = (dateString: string) => {
        return new Date(dateString).toLocaleString();
    };

    const getEventIcon = (eventType: string) => {
        switch (eventType) {
            case 'TAB_LEAVE':
            case 'TAB_RETURN':
                return <Eye size={14} />;
            case 'FULLSCREEN_EXIT':
            case 'FULLSCREEN_ENTER':
                return <Maximize2 size={14} />;
            case 'PASTE_ATTEMPT':
                return <Clipboard size={14} />;
            default:
                return <Timer size={14} />;
        }
    };

    const getEventColor = (eventType: string) => {
        if (eventType.includes('EXIT') || eventType.includes('LEAVE') || eventType === 'PASTE_ATTEMPT') {
            return 'var(--error)';
        }
        if (eventType.includes('ENTER') || eventType.includes('RETURN')) {
            return 'var(--accent-green)';
        }
        return 'var(--text-muted)';
    };

    const fileEntries = Object.entries(report.files || {});
    const mainFile = fileEntries.find(([path]) => path.includes('index') || path.includes('main'));
    const displayFile = mainFile || fileEntries[0];

    return (
        <AdminLayout
            title="Attempt Report"
            breadcrumbs={[
                { label: 'Dashboard', href: '/admin' },
                { label: report.exam.title },
                { label: 'Report' },
            ]}
        >
            <div className={styles.container}>
                {/* Header Card */}
                <div className={styles.headerCard}>
                    <div className={styles.headerMain}>
                        <div className={styles.statusBadge} data-passed={passed}>
                            {passed ? <CheckCircle size={24} /> : <XCircle size={24} />}
                            <span>{passed ? 'PASSED' : 'FAILED'}</span>
                        </div>
                        <div className={styles.scoreCircle}>
                            <span className={styles.scoreValue}>{percentage}%</span>
                            <span className={styles.scoreLabel}>Score</span>
                        </div>
                    </div>
                    
                    <div className={styles.headerMeta}>
                        <div className={styles.metaItem}>
                            <User size={16} />
                            <div>
                                <span className={styles.metaLabel}>Candidate</span>
                                <span className={styles.metaValue}>{report.candidate.name || report.candidate.email}</span>
                            </div>
                        </div>
                        <div className={styles.metaItem}>
                            <FileText size={16} />
                            <div>
                                <span className={styles.metaLabel}>Exam</span>
                                <span className={styles.metaValue}>{report.exam.title}</span>
                            </div>
                        </div>
                        <div className={styles.metaItem}>
                            <Clock size={16} />
                            <div>
                                <span className={styles.metaLabel}>Time Spent</span>
                                <span className={styles.metaValue}>{report.timeSpentMinutes || '-'} minutes</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className={styles.grid}>
                    {/* Score Breakdown */}
                    <div className={styles.card}>
                        <h3 className={styles.cardTitle}>Score Breakdown</h3>
                        <div className={styles.scoreGrid}>
                            <div className={styles.scoreItem}>
                                <span className={styles.scoreItemValue}>
                                    {report.score.public || 0}/{report.score.totalPublic || 0}
                                </span>
                                <span className={styles.scoreItemLabel}>Public Tests</span>
                            </div>
                            <div className={styles.scoreItem}>
                                <span className={styles.scoreItemValue}>
                                    {report.score.hidden || 0}/{report.score.totalHidden || 0}
                                </span>
                                <span className={styles.scoreItemLabel}>Hidden Tests</span>
                            </div>
                        </div>
                    </div>

                    {/* Integrity Summary */}
                    <div className={styles.card}>
                        <h3 className={styles.cardTitle}>
                            <AlertTriangle size={18} />
                            Integrity Summary
                        </h3>
                        <div className={styles.integrityGrid}>
                            <div className={styles.integrityItem} data-warning={report.integrity.tabExits > 0}>
                                <span className={styles.integrityValue}>{report.integrity.tabExits}</span>
                                <span className={styles.integrityLabel}>Tab Exits</span>
                            </div>
                            <div className={styles.integrityItem} data-warning={report.integrity.fullscreenExits > 0}>
                                <span className={styles.integrityValue}>{report.integrity.fullscreenExits}</span>
                                <span className={styles.integrityLabel}>Fullscreen Exits</span>
                            </div>
                            <div className={styles.integrityItem} data-warning={report.integrity.pasteAttempts > 0}>
                                <span className={styles.integrityValue}>{report.integrity.pasteAttempts}</span>
                                <span className={styles.integrityLabel}>Paste Attempts</span>
                            </div>
                            <div className={styles.integrityItem} data-warning={report.integrity.outOfWindowSeconds > 30}>
                                <span className={styles.integrityValue}>{report.integrity.outOfWindowSeconds}s</span>
                                <span className={styles.integrityLabel}>Out-of-Window</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Proctor Events Timeline */}
                <div className={styles.card}>
                    <h3 className={styles.cardTitle}>Proctor Events Timeline</h3>
                    {report.proctorEvents.length === 0 ? (
                        <p className={styles.empty}>No proctor events recorded.</p>
                    ) : (
                        <div className={styles.timeline}>
                            {report.proctorEvents.slice(0, 50).map((event) => (
                                <div key={event.id} className={styles.timelineItem}>
                                    <div 
                                        className={styles.timelineIcon}
                                        style={{ color: getEventColor(event.eventType) }}
                                    >
                                        {getEventIcon(event.eventType)}
                                    </div>
                                    <div className={styles.timelineContent}>
                                        <span className={styles.timelineEvent}>{event.eventType.replace(/_/g, ' ')}</span>
                                        {event.duration && (
                                            <span className={styles.timelineDuration}>({event.duration}s)</span>
                                        )}
                                    </div>
                                    <span className={styles.timelineTime}>
                                        {new Date(event.timestamp).toLocaleTimeString()}
                                    </span>
                                </div>
                            ))}
                            {report.proctorEvents.length > 50 && (
                                <p className={styles.timelineMore}>
                                    + {report.proctorEvents.length - 50} more events
                                </p>
                            )}
                        </div>
                    )}
                </div>

                {/* Submitted Code */}
                {displayFile && (
                    <div className={styles.card}>
                        <h3 className={styles.cardTitle}>Submitted Code</h3>
                        <div className={styles.fileSelector}>
                            {fileEntries.map(([path]) => (
                                <span key={path} className={styles.fileName}>{path}</span>
                            ))}
                        </div>
                        <CodeEditor
                            value={displayFile[1]}
                            language="typescript"
                            height={400}
                            readOnly
                        />
                    </div>
                )}

                {/* Grading Logs */}
                {report.gradingLogs && (
                    <div className={styles.card}>
                        <h3 className={styles.cardTitle}>Grading Logs</h3>
                        <pre className={styles.logs}>{report.gradingLogs}</pre>
                    </div>
                )}
            </div>
        </AdminLayout>
    );
}

