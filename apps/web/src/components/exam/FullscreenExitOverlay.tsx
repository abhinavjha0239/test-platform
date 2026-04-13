'use client';

import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Maximize2 } from 'lucide-react';
import styles from './FullscreenExitOverlay.module.css';

interface FullscreenExitOverlayProps {
    isVisible: boolean;
    countdownSeconds?: number;
    exitCount: number;
    onCountdownComplete: () => void;
    onReenterFullscreen: () => void;
}

export function FullscreenExitOverlay({
    isVisible,
    countdownSeconds = 15,
    exitCount,
    onCountdownComplete,
    onReenterFullscreen,
}: FullscreenExitOverlayProps) {
    const [countdown, setCountdown] = useState(countdownSeconds);
    const [canReenter, setCanReenter] = useState(false);

    useEffect(() => {
        if (!isVisible) {
            setCountdown(countdownSeconds);
            setCanReenter(false);
            return;
        }

        // Start countdown
        const timer = setInterval(() => {
            setCountdown((prev) => {
                if (prev <= 1) {
                    clearInterval(timer);
                    onCountdownComplete();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        // Allow re-enter after 3 seconds
        const reenterTimer = setTimeout(() => {
            setCanReenter(true);
        }, 3000);

        return () => {
            clearInterval(timer);
            clearTimeout(reenterTimer);
        };
    }, [isVisible, countdownSeconds, onCountdownComplete]);

    const handleReenterFullscreen = useCallback(async () => {
        try {
            await document.documentElement.requestFullscreen();
            onReenterFullscreen();
        } catch (error) {
            console.error('Failed to re-enter fullscreen:', error);
        }
    }, [onReenterFullscreen]);

    if (!isVisible) return null;

    const isWarning = exitCount <= 2;
    const isCritical = exitCount > 2;

    return (
        <div className={styles.overlay} data-critical={isCritical}>
            <div className={styles.content}>
                <div className={styles.iconWrapper} data-critical={isCritical}>
                    <AlertTriangle size={64} />
                </div>

                <h1 className={styles.title}>
                    {isCritical ? 'FINAL WARNING' : 'Fullscreen Exit Detected!'}
                </h1>

                <p className={styles.message}>
                    {isCritical ? (
                        <>
                            You have exited fullscreen <strong>{exitCount}</strong> times.
                            <br />
                            <strong>Your exam will be auto-submitted if you exit again!</strong>
                        </>
                    ) : (
                        <>
                            Exiting fullscreen during an exam is not allowed.
                            <br />
                            This incident has been recorded. Exit count: <strong>{exitCount}</strong>
                        </>
                    )}
                </p>

                <div className={styles.screenshotNotice}>
                    <span>📸</span> A screenshot of your screen has been captured
                </div>

                <div className={styles.countdownWrapper}>
                    <div className={styles.countdownCircle}>
                        <span className={styles.countdownNumber}>{countdown}</span>
                    </div>
                    <p className={styles.countdownText}>
                        seconds before you can continue
                    </p>
                </div>

                {canReenter && (
                    <button
                        className={styles.reenterButton}
                        onClick={handleReenterFullscreen}
                    >
                        <Maximize2 size={20} />
                        Re-enter Fullscreen & Continue
                    </button>
                )}

                <p className={styles.warning}>
                    ⚠️ You cannot write code until you re-enter fullscreen mode
                </p>
            </div>
        </div>
    );
}
