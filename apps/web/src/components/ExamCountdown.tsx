'use client';

import { useState, useEffect } from 'react';
import { Clock, Calendar, AlertCircle, CheckCircle } from 'lucide-react';

interface ExamCountdownProps {
    scheduledStartAt: string | null;
    scheduledEndAt: string | null;
    timezone?: string;
    onStartTimeReached?: () => void;
}

type ScheduleStatus = 'not_scheduled' | 'before_start' | 'in_progress' | 'ended';

interface TimeRemaining {
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    total: number;
}

function formatTimeRemaining(ms: number): TimeRemaining {
    const total = Math.max(0, ms);
    const seconds = Math.floor((total / 1000) % 60);
    const minutes = Math.floor((total / 1000 / 60) % 60);
    const hours = Math.floor((total / 1000 / 60 / 60) % 24);
    const days = Math.floor(total / 1000 / 60 / 60 / 24);
    return { days, hours, minutes, seconds, total };
}

function formatDateTime(isoString: string, timezone: string = 'Asia/Kolkata'): string {
    const date = new Date(isoString);
    return new Intl.DateTimeFormat('en-IN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: timezone,
    }).format(date);
}

export function ExamCountdown({ 
    scheduledStartAt, 
    scheduledEndAt, 
    timezone = 'Asia/Kolkata',
    onStartTimeReached 
}: ExamCountdownProps) {
    const [status, setStatus] = useState<ScheduleStatus>('not_scheduled');
    const [timeRemaining, setTimeRemaining] = useState<TimeRemaining | null>(null);

    useEffect(() => {
        if (!scheduledStartAt && !scheduledEndAt) {
            setStatus('not_scheduled');
            return;
        }

        const updateStatus = () => {
            const now = Date.now();
            const startTime = scheduledStartAt ? new Date(scheduledStartAt).getTime() : null;
            const endTime = scheduledEndAt ? new Date(scheduledEndAt).getTime() : null;

            if (endTime && now >= endTime) {
                setStatus('ended');
                setTimeRemaining(null);
            } else if (startTime && now < startTime) {
                setStatus('before_start');
                setTimeRemaining(formatTimeRemaining(startTime - now));
            } else if (endTime && now < endTime) {
                setStatus('in_progress');
                setTimeRemaining(formatTimeRemaining(endTime - now));
            } else {
                setStatus('in_progress');
                setTimeRemaining(null);
            }
        };

        updateStatus();
        const interval = setInterval(updateStatus, 1000);

        return () => clearInterval(interval);
    }, [scheduledStartAt, scheduledEndAt]);

    // Notify when start time is reached
    useEffect(() => {
        if (status === 'in_progress' && onStartTimeReached) {
            onStartTimeReached();
        }
    }, [status, onStartTimeReached]);

    if (status === 'not_scheduled') {
        return null;
    }

    const containerStyle: React.CSSProperties = {
        padding: '16px 20px',
        borderRadius: '12px',
        marginBottom: '16px',
    };

    const iconStyle: React.CSSProperties = {
        marginRight: '8px',
        verticalAlign: 'middle',
    };

    if (status === 'ended') {
        return (
            <div style={{ 
                ...containerStyle, 
                background: 'rgba(239, 68, 68, 0.1)', 
                border: '1px solid rgba(239, 68, 68, 0.3)' 
            }}>
                <AlertCircle size={20} style={{ ...iconStyle, color: '#ef4444' }} />
                <strong style={{ color: '#ef4444' }}>Exam Has Ended</strong>
                <p style={{ margin: '8px 0 0', color: 'var(--text-secondary)', fontSize: '14px' }}>
                    The scheduled exam window has closed. No new attempts can be started.
                </p>
            </div>
        );
    }

    if (status === 'before_start') {
        return (
            <div style={{ 
                ...containerStyle, 
                background: 'rgba(251, 191, 36, 0.1)', 
                border: '1px solid rgba(251, 191, 36, 0.3)' 
            }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
                    <Calendar size={20} style={{ ...iconStyle, color: '#f59e0b' }} />
                    <strong style={{ color: '#f59e0b' }}>Exam Not Yet Started</strong>
                </div>
                
                {scheduledStartAt && (
                    <p style={{ margin: '0 0 12px', color: 'var(--text-secondary)', fontSize: '14px' }}>
                        <Clock size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                        Opens: <strong>{formatDateTime(scheduledStartAt, timezone)}</strong> IST
                    </p>
                )}

                {timeRemaining && (
                    <div style={{ 
                        display: 'flex', 
                        gap: '12px', 
                        marginTop: '12px',
                        flexWrap: 'wrap'
                    }}>
                        <CountdownUnit value={timeRemaining.days} label="Days" />
                        <CountdownUnit value={timeRemaining.hours} label="Hours" />
                        <CountdownUnit value={timeRemaining.minutes} label="Minutes" />
                        <CountdownUnit value={timeRemaining.seconds} label="Seconds" />
                    </div>
                )}
            </div>
        );
    }

    // in_progress
    return (
        <div style={{ 
            ...containerStyle, 
            background: 'rgba(34, 197, 94, 0.1)', 
            border: '1px solid rgba(34, 197, 94, 0.3)' 
        }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                <CheckCircle size={20} style={{ ...iconStyle, color: '#22c55e' }} />
                <strong style={{ color: '#22c55e' }}>Exam Window Open</strong>
            </div>
            
            {scheduledEndAt && (
                <p style={{ margin: '0', color: 'var(--text-secondary)', fontSize: '14px' }}>
                    <Clock size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                    Closes: <strong>{formatDateTime(scheduledEndAt, timezone)}</strong> IST
                    {timeRemaining && ` (${timeRemaining.hours}h ${timeRemaining.minutes}m remaining)`}
                </p>
            )}
        </div>
    );
}

function CountdownUnit({ value, label }: { value: number; label: string }) {
    return (
        <div style={{ 
            textAlign: 'center', 
            minWidth: '60px',
            padding: '8px 12px',
            background: 'rgba(0,0,0,0.1)',
            borderRadius: '8px',
        }}>
            <div style={{ 
                fontSize: '24px', 
                fontWeight: 700, 
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-primary)'
            }}>
                {String(value).padStart(2, '0')}
            </div>
            <div style={{ 
                fontSize: '11px', 
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
            }}>
                {label}
            </div>
        </div>
    );
}

export function useExamScheduleStatus(scheduledStartAt: string | null, scheduledEndAt: string | null) {
    const [status, setStatus] = useState<ScheduleStatus>('not_scheduled');

    useEffect(() => {
        if (!scheduledStartAt && !scheduledEndAt) {
            setStatus('not_scheduled');
            return;
        }

        const updateStatus = () => {
            const now = Date.now();
            const startTime = scheduledStartAt ? new Date(scheduledStartAt).getTime() : null;
            const endTime = scheduledEndAt ? new Date(scheduledEndAt).getTime() : null;

            if (endTime && now >= endTime) {
                setStatus('ended');
            } else if (startTime && now < startTime) {
                setStatus('before_start');
            } else {
                setStatus('in_progress');
            }
        };

        updateStatus();
        const interval = setInterval(updateStatus, 1000);

        return () => clearInterval(interval);
    }, [scheduledStartAt, scheduledEndAt]);

    return status;
}

