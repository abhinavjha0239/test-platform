'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { AdminLayout } from '@/components/admin';
import Link from 'next/link';
import { api } from '@/lib/api';
import {
    Radio, Users, AlertTriangle, Eye, Clock, Shield, RefreshCw,
    CheckCircle, Loader2, Keyboard
} from 'lucide-react';
import styles from './monitoring.module.css';

interface LiveAttempt {
    id: string;
    candidateId: string;
    examId: string;
    status: string;
    startedAt: string;
    tabExits: number;
    fullscreenExits: number;
    pasteAttempts: number;
    candidate?: { name?: string; email: string };
    exam?: { title: string; timeLimit: number };
}

interface KS { key: string; ts: number; ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean; }

interface KeystrokeInfo {
    wpm: number;
    totalKeystrokes: number;
    activeMinutes: number;
    recentKeys: KS[];
}

export default function MonitoringPage() {
    const [attempts, setAttempts] = useState<LiveAttempt[]>([]);
    const [keystrokeMap, setKeystrokeMap] = useState<Record<string, KeystrokeInfo>>({});
    const [expandedLog, setExpandedLog] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    const fetchActiveAttempts = async () => {
        try {
            const res = await api.getAllAttempts({
                page: 1,
                limit: 50,
                status: 'IN_PROGRESS',
            });
            const mapped = res.data.map((a: any) => ({
                id: a.id,
                candidateId: a.candidate?.id || '',
                examId: a.exam?.id || '',
                status: a.status,
                startedAt: a.startedAt,
                tabExits: a.integrity?.tabExits || 0,
                fullscreenExits: a.integrity?.fullscreenExits || 0,
                pasteAttempts: a.integrity?.pasteAttempts || 0,
                candidate: a.candidate,
                exam: a.exam,
            }));
            setAttempts(mapped);

            // Fetch keystroke stats for each active attempt
            const ksMap: Record<string, KeystrokeInfo> = {};
            await Promise.all(mapped.map(async (a: LiveAttempt) => {
                try {
                    const ksRes = await fetch(`/api/proctor/keystrokes/${a.id}`, {
                        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
                    });
                    const ksJson = await ksRes.json();
                    if (ksJson.success && ksJson.data) {
                        ksMap[a.id] = {
                            wpm: ksJson.data.typingSpeed?.avgWpm || ksJson.data.stats?.lastWpm || 0,
                            totalKeystrokes: ksJson.data.stats?.totalKeystrokes || 0,
                            activeMinutes: Math.round((ksJson.data.stats?.sessionDuration || 0) / 60000),
                            recentKeys: ksJson.data.recentKeystrokes || [],
                        };
                    }
                } catch { }
            }));
            setKeystrokeMap(ksMap);

            setLastRefresh(new Date());
        } catch (e) {
            console.error('Failed to fetch active attempts', e);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchActiveAttempts();
    }, []);

    useEffect(() => {
        if (autoRefresh) {
            intervalRef.current = setInterval(fetchActiveAttempts, 10000);
        }
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [autoRefresh]);

    const getElapsedMinutes = (startedAt: string) => {
        return Math.round((Date.now() - new Date(startedAt).getTime()) / 60000);
    };

    const getTimeRemaining = (startedAt: string, timeLimit: number) => {
        const elapsed = (Date.now() - new Date(startedAt).getTime()) / 60000;
        const remaining = timeLimit - elapsed;
        if (remaining <= 0) return { text: 'Overtime', urgent: true };
        if (remaining <= 5) return { text: `${Math.ceil(remaining)}m left`, urgent: true };
        return { text: `${Math.round(remaining)}m left`, urgent: false };
    };

    return (
        <AdminLayout
            title="Live Monitoring"
            breadcrumbs={[{ label: 'Dashboard', href: '/admin' }, { label: 'Live Monitor' }]}
        >
            <div className={styles.container}>
                {/* Header bar */}
                <div className={styles.headerBar}>
                    <div className={styles.headerLeft}>
                        <div className={styles.liveIndicator}>
                            <span className={styles.liveDot} />
                            LIVE
                        </div>
                        <span className={styles.headerCount}>
                            {attempts.length} active candidate{attempts.length !== 1 ? 's' : ''}
                        </span>
                    </div>
                    <div className={styles.headerRight}>
                        <span className={styles.lastUpdate}>
                            Updated {lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                        <button
                            className={`${styles.autoRefreshBtn} ${autoRefresh ? styles.autoRefreshActive : ''}`}
                            onClick={() => setAutoRefresh(!autoRefresh)}
                            title={autoRefresh ? 'Auto-refresh ON (10s)' : 'Auto-refresh OFF'}
                        >
                            <RefreshCw size={14} className={autoRefresh ? styles.spinning : ''} />
                            {autoRefresh ? 'Auto' : 'Paused'}
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => { setLoading(true); fetchActiveAttempts(); }}>
                            <RefreshCw size={14} /> Refresh
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className={styles.loadingState}>
                        <Loader2 size={24} className={styles.spinner} />
                        <span>Loading active sessions...</span>
                    </div>
                ) : attempts.length === 0 ? (
                    <div className={styles.emptyState}>
                        <CheckCircle size={40} />
                        <h2>No Active Exams</h2>
                        <p>There are currently no candidates taking exams.</p>
                    </div>
                ) : (
                    <div className={styles.candidateGrid}>
                        {attempts.map((attempt) => {
                            const flags = attempt.tabExits + attempt.fullscreenExits + attempt.pasteAttempts;
                            const elapsed = getElapsedMinutes(attempt.startedAt);
                            const timeLeft = attempt.exam?.timeLimit
                                ? getTimeRemaining(attempt.startedAt, attempt.exam.timeLimit)
                                : null;

                            return (
                                <div
                                    key={attempt.id}
                                    className={`${styles.candidateCard} ${flags > 2 ? styles.cardWarning : ''}`}
                                >
                                    {/* Card Header */}
                                    <div className={styles.cardHeader}>
                                        <div className={styles.cardInfo}>
                                            <span className={styles.cardName}>
                                                {attempt.candidate?.name || 'Unnamed'}
                                            </span>
                                            <span className={styles.cardEmail}>
                                                {attempt.candidate?.email}
                                            </span>
                                        </div>
                                        <Link
                                            href={`/admin/reports/attempt/${attempt.id}`}
                                            className={styles.viewBtn}
                                            title="View Report"
                                        >
                                            <Eye size={14} />
                                        </Link>
                                    </div>

                                    {/* Exam info */}
                                    <div className={styles.cardExam}>
                                        {attempt.exam?.title || 'Unknown Exam'}
                                    </div>

                                    {/* Time */}
                                    <div className={styles.cardTime}>
                                        <Clock size={13} />
                                        <span>{elapsed}m elapsed</span>
                                        {timeLeft && (
                                            <span className={`${styles.timeLeft} ${timeLeft.urgent ? styles.timeUrgent : ''}`}>
                                                {timeLeft.text}
                                            </span>
                                        )}
                                    </div>

                                    {/* Typing Speed */}
                                    {keystrokeMap[attempt.id] && (
                                        <div className={styles.cardTyping}>
                                            <Keyboard size={13} />
                                            <span className={styles.typingWpm}>
                                                {keystrokeMap[attempt.id].wpm} WPM
                                            </span>
                                            <span className={styles.typingDetail}>
                                                {keystrokeMap[attempt.id].totalKeystrokes.toLocaleString()} keystrokes
                                            </span>
                                            {keystrokeMap[attempt.id].activeMinutes > 0 && (
                                                <span className={styles.typingDetail}>
                                                    {keystrokeMap[attempt.id].activeMinutes}m active
                                                </span>
                                            )}
                                        </div>
                                    )}

                                    {/* Integrity flags */}
                                    <div className={styles.cardFlags}>
                                        <div className={`${styles.flagItem} ${attempt.tabExits > 0 ? styles.flagActive : ''}`}>
                                            <span className={styles.flagCount}>{attempt.tabExits}</span>
                                            <span className={styles.flagLabel}>Tab Exits</span>
                                        </div>
                                        <div className={`${styles.flagItem} ${attempt.fullscreenExits > 0 ? styles.flagActive : ''}`}>
                                            <span className={styles.flagCount}>{attempt.fullscreenExits}</span>
                                            <span className={styles.flagLabel}>FS Exits</span>
                                        </div>
                                        <div className={`${styles.flagItem} ${attempt.pasteAttempts > 0 ? styles.flagActive : ''}`}>
                                            <span className={styles.flagCount}>{attempt.pasteAttempts}</span>
                                            <span className={styles.flagLabel}>Pastes</span>
                                        </div>
                                    </div>

                                    {/* Alert bar */}
                                    {flags > 2 && (
                                        <div className={styles.alertBar}>
                                            <AlertTriangle size={12} />
                                            Suspicious activity ({flags} flags)
                                        </div>
                                    )}

                                    {/* Keystroke Section */}
                                    {keystrokeMap[attempt.id] && keystrokeMap[attempt.id].recentKeys.length > 0 && (
                                        <>
                                            <button
                                                className={styles.keystrokeToggle}
                                                onClick={() => setExpandedLog(expandedLog === attempt.id ? null : attempt.id)}
                                            >
                                                <Keyboard size={12} />
                                                {expandedLog === attempt.id ? 'Hide Keystroke Log' : `⌨ Keystroke Log (${keystrokeMap[attempt.id].recentKeys.length} keys)`}
                                            </button>
                                            {expandedLog === attempt.id && (
                                                <KeystrokePanel keys={keystrokeMap[attempt.id].recentKeys} />
                                            )}
                                        </>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </AdminLayout>
    );
}

// ─── Keystroke Panel Component ─────────────────────────────────────────────────

function KeystrokePanel({ keys }: { keys: KS[] }) {
    const [tab, setTab] = useState<'text' | 'keys' | 'timeline'>('text');

    // Reconstruct text from keystrokes
    const reconstructedText = useMemo(() => {
        const chars: string[] = [];
        keys.forEach(ks => {
            if (ks.ctrl || ks.meta || ks.alt) return;
            if (ks.key === 'Backspace') { chars.pop(); return; }
            if (ks.key === 'Enter') { chars.push('\n'); return; }
            if (ks.key === 'Tab') { chars.push('    '); return; }
            if (ks.key.length === 1) chars.push(ks.key);
        });
        return chars.join('');
    }, [keys]);

    // Stats
    const stats = useMemo(() => {
        if (keys.length === 0) return null;
        const duration = (keys[keys.length - 1].ts - keys[0].ts) / 60000;
        const keysPerMin = duration > 0 ? Math.round(keys.length / duration) : keys.length;
        const modCount = keys.filter(k => k.ctrl || k.meta || k.alt).length;
        const backspaces = keys.filter(k => k.key === 'Backspace').length;
        const freq: Record<string, number> = {};
        keys.forEach(k => { freq[k.key] = (freq[k.key] || 0) + 1; });
        const topKey = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
        return { keysPerMin, modCount, backspaces, topKey, total: keys.length, duration };
    }, [keys]);

    // Group by minute for timeline
    const timelineGroups = useMemo(() => {
        const groups: Array<{ time: string; keys: KS[] }> = [];
        let currentMinute = '';
        keys.forEach(ks => {
            const d = new Date(ks.ts);
            const min = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            if (min !== currentMinute) {
                currentMinute = min;
                groups.push({ time: min, keys: [] });
            }
            groups[groups.length - 1].keys.push(ks);
        });
        return groups;
    }, [keys]);

    const renderKey = (ks: KS, i: number) => {
        const isSpecial = ks.key.length > 1;
        const hasMod = ks.ctrl || ks.alt || ks.meta;
        const modStr = [ks.ctrl && 'Ctrl', ks.alt && 'Alt', ks.shift && 'Shift', ks.meta && 'Cmd'].filter(Boolean).join('+');

        let display = ks.key;
        if (ks.key === ' ') display = '␣';
        else if (ks.key === 'Enter') display = '↵';
        else if (ks.key === 'Backspace') display = '⌫';
        else if (ks.key === 'Tab') display = '⇥';
        else if (ks.key === 'Escape') display = 'Esc';
        else if (ks.key === 'ArrowUp') display = '↑';
        else if (ks.key === 'ArrowDown') display = '↓';
        else if (ks.key === 'ArrowLeft') display = '←';
        else if (ks.key === 'ArrowRight') display = '→';
        else if (ks.key === 'Delete') display = '⌦';

        return (
            <span
                key={i}
                className={`${styles.key} ${isSpecial ? styles.keySpecial : ''} ${hasMod ? styles.keyMod : ''} ${ks.key === 'Backspace' ? styles.keyDelete : ''}`}
                title={`${modStr ? modStr + '+' : ''}${ks.key} @ ${new Date(ks.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`}
            >
                {hasMod && <span className={styles.modPrefix}>{modStr}+</span>}
                {display}
            </span>
        );
    };

    return (
        <div className={styles.ksPanel}>
            {/* Stats Bar */}
            {stats && (
                <div className={styles.ksStats}>
                    <div className={styles.ksStat}>
                        <span className={styles.ksStatVal}>{stats.total}</span>
                        <span className={styles.ksStatLbl}>Total Keys</span>
                    </div>
                    <div className={styles.ksStat}>
                        <span className={styles.ksStatVal}>{stats.keysPerMin}</span>
                        <span className={styles.ksStatLbl}>Keys/Min</span>
                    </div>
                    <div className={styles.ksStat}>
                        <span className={styles.ksStatVal}>{stats.backspaces}</span>
                        <span className={styles.ksStatLbl}>Deletes</span>
                    </div>
                    <div className={styles.ksStat}>
                        <span className={styles.ksStatVal}>{stats.modCount}</span>
                        <span className={styles.ksStatLbl}>Shortcuts</span>
                    </div>
                    {stats.topKey && (
                        <div className={styles.ksStat}>
                            <span className={styles.ksStatVal}>{stats.topKey[0] === ' ' ? '␣' : stats.topKey[0]}</span>
                            <span className={styles.ksStatLbl}>Most Used ({stats.topKey[1]}×)</span>
                        </div>
                    )}
                </div>
            )}

            {/* Tabs */}
            <div className={styles.ksTabs}>
                <button className={`${styles.ksTab} ${tab === 'text' ? styles.ksTabActive : ''}`} onClick={() => setTab('text')}>
                    Reconstructed Text
                </button>
                <button className={`${styles.ksTab} ${tab === 'keys' ? styles.ksTabActive : ''}`} onClick={() => setTab('keys')}>
                    All Keys
                </button>
                <button className={`${styles.ksTab} ${tab === 'timeline' ? styles.ksTabActive : ''}`} onClick={() => setTab('timeline')}>
                    Timeline
                </button>
            </div>

            {/* Tab Content */}
            <div className={styles.ksContent}>
                {tab === 'text' && (
                    <pre className={styles.ksTextOutput}>
                        {reconstructedText || '(no printable text yet)'}
                    </pre>
                )}

                {tab === 'keys' && (
                    <div className={styles.ksKeysGrid}>
                        {keys.map((ks, i) => renderKey(ks, i))}
                    </div>
                )}

                {tab === 'timeline' && (
                    <div className={styles.ksTimeline}>
                        {timelineGroups.map((group, gi) => (
                            <div key={gi} className={styles.ksTimeGroup}>
                                <div className={styles.ksTimeLabel}>
                                    <span className={styles.ksTimeDot} />
                                    {group.time}
                                    <span className={styles.ksTimeCount}>{group.keys.length} keys</span>
                                </div>
                                <div className={styles.ksTimeKeys}>
                                    {group.keys.map((ks, i) => renderKey(ks, i))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
