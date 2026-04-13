'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { AdminLayout } from '@/components/admin';
import { Skeleton, useToast } from '@/components/ui';
import { useExamMonitor } from '@/hooks/useExamMonitor';
import { api } from '@/lib/api';
import { 
    Camera, Eye, Wifi, WifiOff, Maximize2, AlertTriangle, 
    RefreshCw, X, ChevronLeft, ChevronRight, Volume2
} from 'lucide-react';
import styles from './monitor.module.css';

interface Screenshot {
    attemptId: string;
    examId: string;
    candidateId: string;
    eventType: string;
    timestamp: string;
    url: string;
    filename: string;
}

export default function ExamMonitorPage() {
    const params = useParams();
    const examId = params.id as string;
    const toast = useToast();
    
    const [exam, setExam] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [selectedScreenshot, setSelectedScreenshot] = useState<Screenshot | null>(null);
    const [soundEnabled, setSoundEnabled] = useState(true);
    const [filter, setFilter] = useState<string>('ALL');
    
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Real-time monitoring hook
    const { isConnected, screenshots, clearScreenshots } = useExamMonitor({
        examId,
        onScreenshot: (screenshot) => {
            // Play sound for critical events
            if (soundEnabled && ['TAB_LEAVE', 'FULLSCREEN_EXIT', 'PASTE_ATTEMPT', 'SCREEN_SHARE_LOST'].includes(screenshot.eventType)) {
                playAlertSound();
            }
            toast.info(`New screenshot: ${screenshot.eventType.replace(/_/g, ' ')}`);
        },
    });

    // Load exam details
    useEffect(() => {
        if (!examId) return;
        
        api.getExam(examId)
            .then(setExam)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [examId]);

    const playAlertSound = () => {
        if (audioRef.current) {
            audioRef.current.currentTime = 0;
            audioRef.current.play().catch(() => {});
        }
    };

    const getEventColor = (eventType: string) => {
        if (['TAB_LEAVE', 'FULLSCREEN_EXIT', 'PASTE_ATTEMPT', 'SCREEN_SHARE_LOST'].includes(eventType)) {
            return 'var(--error)';
        }
        if (['TAB_RETURN', 'FULLSCREEN_ENTER', 'EXAM_START'].includes(eventType)) {
            return 'var(--accent-green)';
        }
        return 'var(--accent-blue)';
    };

    const filteredScreenshots = filter === 'ALL' 
        ? screenshots 
        : screenshots.filter(s => s.eventType === filter);

    const eventTypes = ['ALL', ...new Set(screenshots.map(s => s.eventType))];

    if (loading) {
        return (
            <AdminLayout
                title="Live Monitoring"
                breadcrumbs={[{ label: 'Dashboard', href: '/admin' }, { label: 'Monitor' }]}
            >
                <Skeleton height={400} />
            </AdminLayout>
        );
    }

    return (
        <AdminLayout
            title={`Live Monitoring: ${exam?.title || 'Exam'}`}
            breadcrumbs={[
                { label: 'Dashboard', href: '/admin' },
                { label: 'Exams', href: '/admin/exams' },
                { label: exam?.title || 'Exam', href: `/admin/exams/${examId}` },
                { label: 'Live Monitor' },
            ]}
        >
            {/* Hidden audio element for alerts */}
            <audio ref={audioRef} src="/alert.mp3" preload="auto" />

            <div className={styles.container}>
                {/* Status Bar */}
                <div className={styles.statusBar}>
                    <div className={styles.connectionStatus} data-connected={isConnected}>
                        {isConnected ? <Wifi size={18} /> : <WifiOff size={18} />}
                        <span>{isConnected ? 'Connected - Live' : 'Disconnected'}</span>
                    </div>

                    <div className={styles.stats}>
                        <span className={styles.stat}>
                            <Camera size={16} />
                            {screenshots.length} screenshots
                        </span>
                        <span className={styles.stat}>
                            <AlertTriangle size={16} />
                            {screenshots.filter(s => ['TAB_LEAVE', 'FULLSCREEN_EXIT', 'PASTE_ATTEMPT'].includes(s.eventType)).length} violations
                        </span>
                    </div>

                    <div className={styles.actions}>
                        <button 
                            className={styles.actionBtn}
                            onClick={() => setSoundEnabled(!soundEnabled)}
                            title={soundEnabled ? 'Mute alerts' : 'Enable alerts'}
                        >
                            <Volume2 size={18} />
                            {soundEnabled ? 'Sound On' : 'Sound Off'}
                        </button>
                        <button 
                            className={styles.actionBtn}
                            onClick={clearScreenshots}
                            title="Clear screenshots"
                        >
                            <RefreshCw size={18} />
                            Clear
                        </button>
                    </div>
                </div>

                {/* Filter Bar */}
                <div className={styles.filterBar}>
                    {eventTypes.map(type => (
                        <button
                            key={type}
                            className={`${styles.filterBtn} ${filter === type ? styles.filterBtnActive : ''}`}
                            onClick={() => setFilter(type)}
                        >
                            {type.replace(/_/g, ' ')}
                        </button>
                    ))}
                </div>

                {/* Screenshots Grid */}
                {filteredScreenshots.length === 0 ? (
                    <div className={styles.empty}>
                        <Eye size={48} />
                        <h3>Waiting for screenshots...</h3>
                        <p>Screenshots will appear here in real-time as candidates interact with the exam.</p>
                    </div>
                ) : (
                    <div className={styles.grid}>
                        {filteredScreenshots.map((screenshot, idx) => (
                            <div 
                                key={`${screenshot.filename}-${idx}`}
                                className={styles.screenshotCard}
                                onClick={() => setSelectedScreenshot(screenshot)}
                            >
                                <div className={styles.imageWrapper}>
                                    <img 
                                        src={screenshot.url} 
                                        alt={`Screenshot ${idx + 1}`}
                                        loading="lazy"
                                    />
                                    <div 
                                        className={styles.eventBadge}
                                        style={{ backgroundColor: getEventColor(screenshot.eventType) }}
                                    >
                                        {screenshot.eventType.replace(/_/g, ' ')}
                                    </div>
                                </div>
                                <div className={styles.cardMeta}>
                                    <span className={styles.candidateId}>
                                        {screenshot.candidateId.slice(0, 8)}...
                                    </span>
                                    <span className={styles.timestamp}>
                                        {new Date(screenshot.timestamp).toLocaleTimeString()}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Lightbox */}
                {selectedScreenshot && (
                    <div className={styles.lightbox} onClick={() => setSelectedScreenshot(null)}>
                        <button 
                            className={styles.lightboxClose}
                            onClick={() => setSelectedScreenshot(null)}
                        >
                            <X size={24} />
                        </button>
                        
                        <div className={styles.lightboxContent} onClick={(e) => e.stopPropagation()}>
                            <img 
                                src={selectedScreenshot.url} 
                                alt="Screenshot"
                            />
                            <div className={styles.lightboxInfo}>
                                <span 
                                    className={styles.lightboxEvent}
                                    style={{ color: getEventColor(selectedScreenshot.eventType) }}
                                >
                                    {selectedScreenshot.eventType.replace(/_/g, ' ')}
                                </span>
                                <span>Candidate: {selectedScreenshot.candidateId}</span>
                                <span>Attempt: {selectedScreenshot.attemptId}</span>
                                <span>{new Date(selectedScreenshot.timestamp).toLocaleString()}</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </AdminLayout>
    );
}
