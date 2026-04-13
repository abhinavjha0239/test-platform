'use client';

import { Monitor, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import styles from './ScreenShareOverlay.module.css';

interface ScreenShareOverlayProps {
    isVisible: boolean;
    isRequesting: boolean;
    error: string | null;
    onRequestShare: () => void;
    showRefreshWarning?: boolean;
}

export function ScreenShareOverlay({
    isVisible,
    isRequesting,
    error,
    onRequestShare,
    showRefreshWarning = false,
}: ScreenShareOverlayProps) {
    if (!isVisible) return null;

    return (
        <div className={styles.overlay}>
            <div className={styles.content}>
                <div className={styles.iconWrapper}>
                    <Monitor size={64} />
                </div>

                <h1 className={styles.title}>
                    {showRefreshWarning ? 'Screen Share Required' : 'Share Your Entire Screen'}
                </h1>

                {showRefreshWarning && (
                    <div className={styles.refreshWarning}>
                        <RefreshCw size={20} />
                        <span>Screen sharing was reset after page refresh</span>
                    </div>
                )}

                <p className={styles.message}>
                    To ensure exam integrity, you must share your <strong>entire screen</strong> during the exam.
                    <br /><br />
                    This helps us verify that you are not using any unauthorized resources.
                </p>

                <ul className={styles.requirements}>
                    <li>Select <strong>"Entire Screen"</strong> when prompted</li>
                    <li>Do not select a specific window or tab</li>
                    <li>Keep screen sharing active throughout the exam</li>
                    <li>Stopping screen share will pause your exam</li>
                </ul>

                {error && (
                    <div className={styles.error}>
                        <AlertCircle size={18} />
                        <span>{error}</span>
                    </div>
                )}

                <button
                    className={styles.shareButton}
                    onClick={onRequestShare}
                    disabled={isRequesting}
                >
                    {isRequesting ? (
                        <>
                            <Loader2 size={20} className={styles.spinner} />
                            Requesting Permission...
                        </>
                    ) : (
                        <>
                            <Monitor size={20} />
                            Share Entire Screen
                        </>
                    )}
                </button>

                <p className={styles.warning}>
                    ⚠️ You cannot write code until screen sharing is enabled
                </p>
            </div>
        </div>
    );
}
