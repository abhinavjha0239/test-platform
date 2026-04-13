'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { BookOpen, X, RefreshCw, Lock, ExternalLink, ArrowLeft, ArrowRight } from 'lucide-react';
import styles from './ReactDocsPanel.module.css';

const ALLOWED_ORIGIN = 'https://react.dev';
const ALLOWED_PATH_PREFIX = '/learn';
const DOCS_HOME = 'https://react.dev/learn';

interface ReactDocsPanelProps {
    onClose: () => void;
}

export function ReactDocsPanel({ onClose }: ReactDocsPanelProps) {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [currentUrl, setCurrentUrl] = useState(DOCS_HOME);
    const [isBlocked, setIsBlocked] = useState(false);

    const handleLoad = useCallback(() => {
        setIsLoading(false);
    }, []);

    const handleRefresh = useCallback(() => {
        setIsLoading(true);
        setIsBlocked(false);
        if (iframeRef.current) {
            iframeRef.current.src = currentUrl;
        }
    }, [currentUrl]);

    const handleGoHome = useCallback(() => {
        setIsLoading(true);
        setIsBlocked(false);
        setCurrentUrl(DOCS_HOME);
        if (iframeRef.current) {
            iframeRef.current.src = DOCS_HOME;
        }
    }, []);

    // Note: Due to cross-origin restrictions, we can't directly read the iframe URL
    // or intercept navigation. react.dev may also block iframe embedding via
    // X-Frame-Options or CSP. If it does, we show a fallback with an external link.
    const [iframeError, setIframeError] = useState(false);

    useEffect(() => {
        // Check if iframe loaded within a timeout (fallback for X-Frame-Options block)
        const timer = setTimeout(() => {
            if (isLoading) {
                // If still loading after 8 seconds, likely blocked
                setIframeError(true);
                setIsLoading(false);
            }
        }, 8000);

        return () => clearTimeout(timer);
    }, [isLoading, currentUrl]);

    return (
        <div className={styles.docsPanel}>
            {/* Header */}
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <div className={styles.headerTitle}>
                        <BookOpen size={13} />
                        <span>React Docs</span>
                    </div>
                    <div className={styles.urlBar}>
                        <Lock size={10} />
                        <span>{currentUrl}</span>
                    </div>
                </div>
                <div className={styles.headerActions}>
                    <button
                        className={styles.headerBtn}
                        onClick={handleGoHome}
                        title="Go to React Learn home"
                    >
                        <ArrowLeft size={14} />
                    </button>
                    <button
                        className={styles.headerBtn}
                        onClick={handleRefresh}
                        title="Refresh"
                    >
                        <RefreshCw size={14} />
                    </button>
                    <button
                        className={styles.headerBtn}
                        onClick={onClose}
                        title="Close docs"
                    >
                        <X size={14} />
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className={styles.iframeContainer}>
                {isLoading && !iframeError && (
                    <div className={styles.loading}>
                        <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />
                        <span>Loading React documentation...</span>
                    </div>
                )}

                {iframeError ? (
                    <div className={styles.blockedOverlay}>
                        <BookOpen size={48} style={{ color: '#61dafb', opacity: 0.8 }} />
                        <h3>React Documentation</h3>
                        <p>
                            The React docs cannot be embedded directly.
                            Click below to open the docs in a new tab
                            (restricted to the Learn section).
                        </p>
                        <button onClick={() => window.open(DOCS_HOME, '_blank', 'noopener,noreferrer')}>
                            <ExternalLink size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                            Open React Learn Docs
                        </button>
                    </div>
                ) : (
                    <iframe
                        ref={iframeRef}
                        src={currentUrl}
                        className={styles.iframe}
                        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                        title="React Documentation"
                        onLoad={handleLoad}
                        onError={() => {
                            setIframeError(true);
                            setIsLoading(false);
                        }}
                    />
                )}
            </div>
        </div>
    );
}

/* Docs toggle button for the toolbar */
interface DocsToggleProps {
    isActive: boolean;
    onClick: () => void;
}

export function DocsToggle({ isActive, onClick }: DocsToggleProps) {
    return (
        <button
            className={`${styles.docsToggleBtn} ${isActive ? styles.docsToggleBtnActive : ''}`}
            onClick={onClick}
            title="Toggle React documentation"
        >
            <BookOpen size={14} />
            <span>Docs</span>
        </button>
    );
}

export default ReactDocsPanel;
