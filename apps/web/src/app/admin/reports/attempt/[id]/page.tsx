'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { AdminLayout } from '@/components/admin';
import { CodeEditor, Skeleton, useToast } from '@/components/ui';
import { useQuery } from '@/hooks';
import { api } from '@/lib/api';
import {
    User, Clock, FileText, AlertTriangle, CheckCircle, XCircle,
    Eye, EyeOff, Clipboard, Maximize2, Timer, Camera, X, ChevronLeft, ChevronRight,
    Keyboard, Activity
} from 'lucide-react';
import styles from './report.module.css';

interface Screenshot {
    filename: string;
    url: string;
    eventType: string;
    capturedAt: string;
    size: number;
}

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

interface KeystrokeData {
    stats: {
        totalKeystrokes: number;
        lastWpm: number;
        lastCpm: number;
        sessionDuration: number;
    };
    typingSpeed: {
        avgWpm: number;
        avgCpm: number;
        peakWpm: number;
        history: Array<{ wpm: number; cpm: number; ts: number }>;
    };
}

export default function AttemptReportPage() {
    const params = useParams();
    const attemptId = params.id as string;
    const [selectedFile, setSelectedFile] = useState<string>('');
    const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
    const [selectedScreenshotIdx, setSelectedScreenshotIdx] = useState<number | null>(null);
    const [keystrokeData, setKeystrokeData] = useState<KeystrokeData | null>(null);

    const { data: report, isLoading, error } = useQuery<AttemptReport>(
        () => api.getAttemptReport(attemptId),
        { enabled: !!attemptId }
    );

    // Fetch screenshots
    useEffect(() => {
        if (!attemptId) return;

        fetch(`/api/attempts/${attemptId}/screenshots`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
            },
        })
            .then(res => res.json())
            .then(data => {
                if (data.success && data.data?.screenshots) {
                    setScreenshots(data.data.screenshots);
                }
            })
            .catch(console.error);
    }, [attemptId]);

    // Fetch keystroke data
    useEffect(() => {
        if (!attemptId) return;

        fetch(`/api/proctor/keystrokes/${attemptId}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
            },
        })
            .then(res => res.json())
            .then(data => {
                if (data.success && data.data) {
                    setKeystrokeData(data.data);
                }
            })
            .catch(console.error);
    }, [attemptId]);

    const fileEntries = Object.entries(report?.files || {});

    // Update selected file when report loads
    useEffect(() => {
        if (fileEntries.length > 0 && !selectedFile) {
            setSelectedFile(fileEntries[0][0]);
        }
    }, [report?.files]);

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

    // Get the content of the selected file
    const selectedFileContent = report.files?.[selectedFile] || '';

    // Detect language from file extension
    const getLanguage = (filename: string) => {
        const ext = filename.split('.').pop()?.toLowerCase();
        switch (ext) {
            case 'sql': return 'sql';
            case 'js': return 'javascript';
            case 'ts': return 'typescript';
            case 'tsx': return 'typescript';
            case 'jsx': return 'javascript';
            case 'py': return 'python';
            case 'go': return 'go';
            case 'rs': return 'rust';
            case 'json': return 'json';
            case 'html': return 'html';
            case 'css': return 'css';
            default: return 'plaintext';
        }
    };

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

                {/* Typing Speed Visualization */}
                {keystrokeData && (keystrokeData.typingSpeed.history.length > 0 || keystrokeData.stats.totalKeystrokes > 0) && (
                    <div className={styles.card}>
                        <h3 className={styles.cardTitle}>
                            <Keyboard size={18} />
                            Typing Speed Analysis
                        </h3>

                        {/* Stats Row */}
                        <div className={styles.typingStatsGrid}>
                            <div className={styles.typingStat}>
                                <span className={styles.typingStatValue}>{keystrokeData.typingSpeed.avgWpm}</span>
                                <span className={styles.typingStatLabel}>Avg WPM</span>
                            </div>
                            <div className={styles.typingStat}>
                                <span className={styles.typingStatValue}>{keystrokeData.typingSpeed.peakWpm}</span>
                                <span className={styles.typingStatLabel}>Peak WPM</span>
                            </div>
                            <div className={styles.typingStat}>
                                <span className={styles.typingStatValue}>{keystrokeData.stats.totalKeystrokes.toLocaleString()}</span>
                                <span className={styles.typingStatLabel}>Total Keystrokes</span>
                            </div>
                            <div className={styles.typingStat}>
                                <span className={styles.typingStatValue}>
                                    {keystrokeData.stats.sessionDuration > 0
                                        ? `${Math.round(keystrokeData.stats.sessionDuration / 60000)}m`
                                        : '-'}
                                </span>
                                <span className={styles.typingStatLabel}>Active Time</span>
                            </div>
                        </div>

                        {/* SVG Line Chart */}
                        {keystrokeData.typingSpeed.history.length > 1 && (
                            <div className={styles.chartContainer}>
                                <TypingSpeedChart
                                    history={keystrokeData.typingSpeed.history}
                                    avgWpm={keystrokeData.typingSpeed.avgWpm}
                                />
                            </div>
                        )}
                    </div>
                )}

                {/* Submitted Code */}
                {fileEntries.length > 0 && (
                    <div className={styles.card}>
                        <h3 className={styles.cardTitle}>Submitted Code</h3>
                        <div className={styles.fileSelector}>
                            {fileEntries.map(([path]) => (
                                <button
                                    key={path}
                                    className={`${styles.fileTab} ${selectedFile === path ? styles.fileTabActive : ''}`}
                                    onClick={() => setSelectedFile(path)}
                                >
                                    {path}
                                </button>
                            ))}
                        </div>
                        <CodeEditor
                            value={selectedFileContent}
                            language={getLanguage(selectedFile)}
                            height={400}
                            readOnly
                        />
                    </div>
                )}

                {/* Proctor Screenshots */}
                {screenshots.length > 0 && (
                    <div className={styles.card}>
                        <h3 className={styles.cardTitle}>
                            <Camera size={18} />
                            Proctor Screenshots ({screenshots.length})
                        </h3>
                        <div className={styles.screenshotGrid}>
                            {screenshots.map((screenshot, idx) => (
                                <div
                                    key={screenshot.filename}
                                    className={styles.screenshotItem}
                                    onClick={() => setSelectedScreenshotIdx(idx)}
                                >
                                    <img
                                        src={screenshot.url}
                                        alt={`Screenshot ${idx + 1}`}
                                        loading="lazy"
                                    />
                                    <div className={styles.screenshotMeta}>
                                        <span className={styles.screenshotEvent}>{screenshot.eventType.replace(/_/g, ' ')}</span>
                                        <span className={styles.screenshotTime}>
                                            {new Date(screenshot.capturedAt).toLocaleTimeString()}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Screenshot Lightbox */}
                {selectedScreenshotIdx !== null && screenshots[selectedScreenshotIdx] && (
                    <div className={styles.lightbox} onClick={() => setSelectedScreenshotIdx(null)}>
                        <button
                            className={styles.lightboxClose}
                            onClick={() => setSelectedScreenshotIdx(null)}
                        >
                            <X size={24} />
                        </button>

                        <button
                            className={styles.lightboxNav}
                            data-direction="prev"
                            onClick={(e) => {
                                e.stopPropagation();
                                setSelectedScreenshotIdx(prev =>
                                    prev !== null && prev > 0 ? prev - 1 : screenshots.length - 1
                                );
                            }}
                        >
                            <ChevronLeft size={32} />
                        </button>

                        <div className={styles.lightboxContent} onClick={(e) => e.stopPropagation()}>
                            <img
                                src={screenshots[selectedScreenshotIdx].url}
                                alt={`Screenshot ${selectedScreenshotIdx + 1}`}
                            />
                            <div className={styles.lightboxInfo}>
                                <span>{screenshots[selectedScreenshotIdx].eventType.replace(/_/g, ' ')}</span>
                                <span>{new Date(screenshots[selectedScreenshotIdx].capturedAt).toLocaleString()}</span>
                                <span>{selectedScreenshotIdx + 1} / {screenshots.length}</span>
                            </div>
                        </div>

                        <button
                            className={styles.lightboxNav}
                            data-direction="next"
                            onClick={(e) => {
                                e.stopPropagation();
                                setSelectedScreenshotIdx(prev =>
                                    prev !== null && prev < screenshots.length - 1 ? prev + 1 : 0
                                );
                            }}
                        >
                            <ChevronRight size={32} />
                        </button>
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

// SVG Line Chart for Typing Speed
function TypingSpeedChart({ history, avgWpm }: { history: Array<{ wpm: number; cpm: number; ts: number }>; avgWpm: number }) {
    const W = 700, H = 200, PAD = { top: 20, right: 20, bottom: 30, left: 45 };
    const chartW = W - PAD.left - PAD.right;
    const chartH = H - PAD.top - PAD.bottom;

    const sorted = [...history].sort((a, b) => a.ts - b.ts);
    const minTs = sorted[0].ts;
    const maxTs = sorted[sorted.length - 1].ts;
    const maxWpm = Math.max(...sorted.map(s => s.wpm), avgWpm + 10, 30);

    const x = (ts: number) => PAD.left + ((ts - minTs) / (maxTs - minTs || 1)) * chartW;
    const y = (wpm: number) => PAD.top + chartH - (wpm / maxWpm) * chartH;

    const points = sorted.map(s => `${x(s.ts)},${y(s.wpm)}`).join(' ');
    const areaPoints = `${x(minTs)},${PAD.top + chartH} ${points} ${x(maxTs)},${PAD.top + chartH}`;

    const yTicks = [0, Math.round(maxWpm / 3), Math.round((maxWpm * 2) / 3), Math.round(maxWpm)];

    const duration = maxTs - minTs;
    const timeLabels = [0, 0.25, 0.5, 0.75, 1].map(pct => ({
        ts: minTs + duration * pct,
        label: `${Math.round((duration * pct) / 60000)}m`,
    }));

    return (
        <svg viewBox={`0 0 ${W} ${H}`} className={styles.chart}>
            <defs>
                <linearGradient id="wpmGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent-blue)" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="var(--accent-blue)" stopOpacity="0.02" />
                </linearGradient>
            </defs>

            {yTicks.map((tick, i) => (
                <g key={i}>
                    <line x1={PAD.left} y1={y(tick)} x2={W - PAD.right} y2={y(tick)}
                        stroke="var(--border)" strokeWidth="1" strokeDasharray="4 4" />
                    <text x={PAD.left - 8} y={y(tick) + 4} textAnchor="end"
                        fill="var(--text-muted)" fontSize="10">{tick}</text>
                </g>
            ))}

            <line x1={PAD.left} y1={y(avgWpm)} x2={W - PAD.right} y2={y(avgWpm)}
                stroke="var(--accent-orange)" strokeWidth="1.5" strokeDasharray="6 4" opacity="0.7" />
            <text x={W - PAD.right + 4} y={y(avgWpm) + 4}
                fill="var(--accent-orange)" fontSize="10" fontWeight="500">avg</text>

            <polygon points={areaPoints} fill="url(#wpmGradient)" />
            <polyline points={points} fill="none" stroke="var(--accent-blue)"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

            {sorted.map((s, i) => (
                <circle key={i} cx={x(s.ts)} cy={y(s.wpm)} r="3"
                    fill="var(--bg-secondary)" stroke="var(--accent-blue)" strokeWidth="1.5">
                    <title>{s.wpm} WPM</title>
                </circle>
            ))}

            {timeLabels.map((t, i) => (
                <text key={i} x={x(t.ts)} y={H - 6} textAnchor="middle"
                    fill="var(--text-muted)" fontSize="10">{t.label}</text>
            ))}

            <text x={12} y={PAD.top + chartH / 2} textAnchor="middle"
                fill="var(--text-muted)" fontSize="10"
                transform={`rotate(-90, 12, ${PAD.top + chartH / 2})`}>WPM</text>
        </svg>
    );
}
