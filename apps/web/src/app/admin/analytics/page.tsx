'use client';

import { useState, useEffect } from 'react';
import { AdminLayout } from '@/components/admin';
import { Skeleton, useToast } from '@/components/ui';
import Link from 'next/link';
import {
    BarChart3, TrendingUp, Users, Award, Filter, Eye
} from 'lucide-react';
import styles from './analytics.module.css';

interface AnalyticsData {
    scoreDistribution: number[];
    passRate: { pass: number; fail: number; pending: number };
    dailyAttempts: Array<{ date: string; count: number }>;
    topPerformers: Array<{ id: string; name: string; email: string; pct: number; examTitle: string }>;
    totalAttempts: number;
    exams: Array<{ id: string; title: string }>;
}

export default function AnalyticsPage() {
    const [data, setData] = useState<AnalyticsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [examFilter, setExamFilter] = useState('');

    useEffect(() => {
        const fetchAnalytics = async () => {
            setLoading(true);
            try {
                const qs = examFilter ? `?examId=${examFilter}` : '';
                const res = await fetch(`/api/reports/analytics${qs}`, {
                    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
                });
                const json = await res.json();
                if (json.success) setData(json.data);
            } catch (e) {
                console.error('Analytics fetch failed', e);
            }
            setLoading(false);
        };
        fetchAnalytics();
    }, [examFilter]);

    return (
        <AdminLayout
            title="Analytics"
            breadcrumbs={[{ label: 'Dashboard', href: '/admin' }, { label: 'Analytics' }]}
        >
            {/* Exam Filter */}
            {data && data.exams.length > 0 && (
                <div className={styles.filterBar}>
                    <Filter size={14} />
                    <select
                        value={examFilter}
                        onChange={e => setExamFilter(e.target.value)}
                        className={styles.filterSelect}
                    >
                        <option value="">All Exams</option>
                        {data.exams.map(e => (
                            <option key={e.id} value={e.id}>{e.title}</option>
                        ))}
                    </select>
                </div>
            )}

            {loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <Skeleton height="100px" />
                    <Skeleton height="300px" />
                </div>
            ) : !data ? (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>No data available.</p>
            ) : (
                <>
                    {/* Summary Stats */}
                    <div className={styles.statsRow}>
                        <div className={styles.stat}>
                            <Users size={20} />
                            <span className={styles.statVal}>{data.totalAttempts}</span>
                            <span className={styles.statLbl}>Total Attempts</span>
                        </div>
                        <div className={styles.stat}>
                            <TrendingUp size={20} />
                            <span className={styles.statVal}>
                                {data.passRate.pass + data.passRate.fail > 0
                                    ? `${Math.round((data.passRate.pass / (data.passRate.pass + data.passRate.fail)) * 100)}%`
                                    : '-'}
                            </span>
                            <span className={styles.statLbl}>Pass Rate (≥50%)</span>
                        </div>
                        <div className={styles.stat}>
                            <Award size={20} />
                            <span className={styles.statVal}>
                                {data.topPerformers.length > 0 ? `${data.topPerformers[0].pct}%` : '-'}
                            </span>
                            <span className={styles.statLbl}>Top Score</span>
                        </div>
                    </div>

                    <div className={styles.chartsGrid}>
                        {/* Score Distribution Histogram */}
                        <div className={styles.chartCard}>
                            <h3 className={styles.chartTitle}>
                                <BarChart3 size={16} /> Score Distribution
                            </h3>
                            <ScoreHistogram buckets={data.scoreDistribution} />
                        </div>

                        {/* Pass Rate Donut */}
                        <div className={styles.chartCard}>
                            <h3 className={styles.chartTitle}>
                                <TrendingUp size={16} /> Pass / Fail
                            </h3>
                            <PassRateDonut pass={data.passRate.pass} fail={data.passRate.fail} pending={data.passRate.pending} />
                        </div>

                        {/* Daily Attempts */}
                        <div className={`${styles.chartCard} ${styles.chartWide}`}>
                            <h3 className={styles.chartTitle}>
                                <BarChart3 size={16} /> Attempts Over Time (30 days)
                            </h3>
                            <DailyAttemptsChart data={data.dailyAttempts} />
                        </div>
                    </div>

                    {/* Top Performers */}
                    {data.topPerformers.length > 0 && (
                        <div className={styles.chartCard}>
                            <h3 className={styles.chartTitle}>
                                <Award size={16} /> Top Performers
                            </h3>
                            <div className={styles.performersList}>
                                {data.topPerformers.map((p, i) => (
                                    <div key={p.id} className={styles.performerRow}>
                                        <span className={styles.performerRank}>#{i + 1}</span>
                                        <div className={styles.performerInfo}>
                                            <span className={styles.performerName}>{p.name}</span>
                                            <span className={styles.performerExam}>{p.examTitle}</span>
                                        </div>
                                        <div className={styles.performerScore}>
                                            <div className={styles.performerBar}>
                                                <div style={{
                                                    width: `${p.pct}%`,
                                                    height: '100%',
                                                    borderRadius: 3,
                                                    background: p.pct >= 70 ? 'var(--accent-green)' : p.pct >= 40 ? 'var(--accent-orange)' : 'var(--error)',
                                                }} />
                                            </div>
                                            <span style={{
                                                fontWeight: 600, fontSize: 13,
                                                color: p.pct >= 70 ? 'var(--accent-green)' : p.pct >= 40 ? 'var(--accent-orange)' : 'var(--error)',
                                            }}>{p.pct}%</span>
                                        </div>
                                        <Link href={`/admin/reports/attempt/${p.id}`} className={styles.performerLink}>
                                            <Eye size={14} />
                                        </Link>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}
        </AdminLayout>
    );
}

// Score Distribution SVG Histogram
function ScoreHistogram({ buckets }: { buckets: number[] }) {
    const max = Math.max(...buckets, 1);
    const W = 400, H = 180, PAD = { l: 30, r: 10, t: 10, b: 25 };
    const chartW = W - PAD.l - PAD.r;
    const chartH = H - PAD.t - PAD.b;
    const barW = (chartW / 10) - 4;

    return (
        <svg viewBox={`0 0 ${W} ${H}`} className={styles.svgChart}>
            {buckets.map((count, i) => {
                const barH = (count / max) * chartH;
                const x = PAD.l + i * (chartW / 10) + 2;
                const y = PAD.t + chartH - barH;
                const label = `${i * 10}-${i * 10 + 10}`;

                return (
                    <g key={i}>
                        <rect x={x} y={y} width={barW} height={barH} rx={3}
                            fill={i >= 5 ? 'var(--accent-green)' : 'var(--accent-orange)'} opacity={0.8}>
                            <title>{label}%: {count} attempt{count !== 1 ? 's' : ''}</title>
                        </rect>
                        {count > 0 && (
                            <text x={x + barW / 2} y={y - 4} textAnchor="middle"
                                fill="var(--text-muted)" fontSize="9">{count}</text>
                        )}
                        <text x={x + barW / 2} y={H - 6} textAnchor="middle"
                            fill="var(--text-muted)" fontSize="8">{i * 10}</text>
                    </g>
                );
            })}
        </svg>
    );
}

// Pass Rate Donut
function PassRateDonut({ pass, fail, pending }: { pass: number; fail: number; pending: number }) {
    const total = pass + fail + pending;
    if (total === 0) return <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No data</p>;

    const r = 60, cx = 100, cy = 80, strokeW = 18;
    const circ = 2 * Math.PI * r;
    const passAngle = (pass / total) * circ;
    const failAngle = (fail / total) * circ;

    return (
        <div className={styles.donutContainer}>
            <svg viewBox="0 0 200 160" className={styles.svgChart}>
                <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--bg-tertiary)" strokeWidth={strokeW} />
                <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--accent-green)" strokeWidth={strokeW}
                    strokeDasharray={`${passAngle} ${circ}`} strokeDashoffset="0"
                    transform={`rotate(-90, ${cx}, ${cy})`} strokeLinecap="round" />
                <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--error)" strokeWidth={strokeW}
                    strokeDasharray={`${failAngle} ${circ}`} strokeDashoffset={`${-passAngle}`}
                    transform={`rotate(-90, ${cx}, ${cy})`} strokeLinecap="round" />
                <text x={cx} y={cy - 4} textAnchor="middle" fill="var(--text-primary)" fontSize="20" fontWeight="700">
                    {Math.round((pass / (pass + fail || 1)) * 100)}%
                </text>
                <text x={cx} y={cy + 14} textAnchor="middle" fill="var(--text-muted)" fontSize="10">
                    Pass Rate
                </text>
            </svg>
            <div className={styles.donutLegend}>
                <span><span className={styles.legendDot} style={{ background: 'var(--accent-green)' }} /> Pass: {pass}</span>
                <span><span className={styles.legendDot} style={{ background: 'var(--error)' }} /> Fail: {fail}</span>
                <span><span className={styles.legendDot} style={{ background: 'var(--bg-tertiary)' }} /> Pending: {pending}</span>
            </div>
        </div>
    );
}

// Daily Attempts Bar Chart
function DailyAttemptsChart({ data }: { data: Array<{ date: string; count: number }> }) {
    const max = Math.max(...data.map(d => d.count), 1);
    const W = 700, H = 160, PAD = { l: 30, r: 10, t: 10, b: 25 };
    const chartW = W - PAD.l - PAD.r;
    const chartH = H - PAD.t - PAD.b;
    const barW = (chartW / data.length) - 2;

    return (
        <svg viewBox={`0 0 ${W} ${H}`} className={styles.svgChart}>
            {data.map((d, i) => {
                const barH = (d.count / max) * chartH;
                const x = PAD.l + i * (chartW / data.length) + 1;
                const y = PAD.t + chartH - barH;
                const dayLabel = new Date(d.date).getDate().toString();

                return (
                    <g key={i}>
                        <rect x={x} y={y} width={barW} height={Math.max(barH, 1)} rx={2}
                            fill="var(--accent-blue)" opacity={d.count > 0 ? 0.7 : 0.15}>
                            <title>{d.date}: {d.count}</title>
                        </rect>
                        {i % 5 === 0 && (
                            <text x={x + barW / 2} y={H - 6} textAnchor="middle"
                                fill="var(--text-muted)" fontSize="8">{dayLabel}</text>
                        )}
                    </g>
                );
            })}
        </svg>
    );
}
