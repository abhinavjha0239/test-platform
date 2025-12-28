'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Editor from '@monaco-editor/react';
import { useAuthStore } from '@/lib/auth-store';
import { api } from '@/lib/api';
import {
    Code2, Play, Send, Clock, ChevronRight, ChevronDown,
    FileCode, Folder, FolderOpen, AlertTriangle, CheckCircle, XCircle, Loader2
} from 'lucide-react';
import styles from './workspace.module.css';

interface FileTree {
    [key: string]: string;
}

interface Attempt {
    id: string;
    examId: string;
    status: string;
    startedAt: string;
    files: FileTree;
    exam?: {
        title: string;
        timeLimit: number;
        pasteDisabled: boolean;
        fullscreenRequired: boolean;
        challenge?: {
            name: string;
            publicTests: string;
        };
    };
}

export default function ExamWorkspace() {
    const router = useRouter();
    const params = useParams();
    const attemptId = params.id as string;
    const { user, checkAuth } = useAuthStore();

    const [attempt, setAttempt] = useState<Attempt | null>(null);
    const [files, setFiles] = useState<FileTree>({});
    const [activeFile, setActiveFile] = useState<string>('');
    const [openFiles, setOpenFiles] = useState<string[]>([]);
    const [testOutput, setTestOutput] = useState<string>('Click "Run Tests" to execute your code against public tests.');
    const [isRunning, setIsRunning] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [timeLeft, setTimeLeft] = useState<number>(0);
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['src', 'tests']));
    const [showConsent, setShowConsent] = useState(true);

    const editorRef = useRef<any>(null);
    const tabLeaveTime = useRef<number>(0);

    // Load attempt data
    useEffect(() => {
        checkAuth();
        loadAttempt();
    }, [attemptId]);

    // Timer
    useEffect(() => {
        if (!attempt?.exam?.timeLimit || !attempt.startedAt) return;

        const startTime = new Date(attempt.startedAt).getTime();
        const endTime = startTime + attempt.exam.timeLimit * 60 * 1000;

        const interval = setInterval(() => {
            const now = Date.now();
            const remaining = Math.max(0, Math.floor((endTime - now) / 1000));
            setTimeLeft(remaining);

            if (remaining === 0) {
                handleSubmit();
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [attempt]);

    // Proctoring: Tab visibility
    useEffect(() => {
        if (!attempt || showConsent) return;

        const handleVisibilityChange = () => {
            if (document.hidden) {
                tabLeaveTime.current = Date.now();
                api.logProctorEvent({ attemptId, eventType: 'TAB_LEAVE' });
            } else {
                const duration = Math.floor((Date.now() - tabLeaveTime.current) / 1000);
                api.logProctorEvent({ attemptId, eventType: 'TAB_RETURN', duration });
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [attempt, attemptId, showConsent]);

    // Proctoring: Fullscreen
    useEffect(() => {
        if (!attempt || showConsent) return;

        const handleFullscreenChange = () => {
            if (!document.fullscreenElement) {
                api.logProctorEvent({ attemptId, eventType: 'FULLSCREEN_EXIT' });
            } else {
                api.logProctorEvent({ attemptId, eventType: 'FULLSCREEN_ENTER' });
            }
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, [attempt, attemptId, showConsent]);

    // Auto-save
    useEffect(() => {
        if (!attempt || Object.keys(files).length === 0) return;

        const interval = setInterval(() => {
            api.saveFiles(attemptId, files).catch(console.error);
        }, 30000); // Save every 30 seconds

        return () => clearInterval(interval);
    }, [attemptId, files, attempt]);

    const loadAttempt = async () => {
        try {
            const { data } = await api.getAttempt(attemptId);
            setAttempt(data);
            setFiles(data.files || {});

            // Open first file
            const firstFile = Object.keys(data.files || {})[0];
            if (firstFile) {
                setActiveFile(firstFile);
                setOpenFiles([firstFile]);
            }
        } catch (error) {
            console.error('Failed to load attempt:', error);
            router.push('/dashboard');
        }
    };

    const handleEditorMount = (editor: any, monaco: any) => {
        editorRef.current = editor;

        // Override paste command - CRITICAL for proctoring
        if (attempt?.exam?.pasteDisabled) {
            editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyV, () => {
                // Log paste attempt
                api.logProctorEvent({
                    attemptId,
                    eventType: 'PASTE_ATTEMPT',
                    pasteLength: 0,
                    isMultiline: false,
                });

                // Insert placeholder instead of clipboard content
                editor.trigger('keyboard', 'type', { text: '[PASTE_DISABLED_IN_EXAM]' });
            });

            // Also handle context menu paste
            editor.onDidPaste(() => {
                api.logProctorEvent({ attemptId, eventType: 'PASTE_ATTEMPT' });
            });
        }
    };

    const handleFileChange = (value: string | undefined) => {
        if (!activeFile || value === undefined) return;
        setFiles(prev => ({ ...prev, [activeFile]: value }));
    };

    const handleFileClick = (path: string) => {
        setActiveFile(path);
        if (!openFiles.includes(path)) {
            setOpenFiles(prev => [...prev, path]);
        }
    };

    const handleCloseTab = (path: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setOpenFiles(prev => prev.filter(f => f !== path));
        if (activeFile === path) {
            const remaining = openFiles.filter(f => f !== path);
            setActiveFile(remaining[remaining.length - 1] || '');
        }
    };

    const toggleFolder = (folder: string) => {
        setExpandedFolders(prev => {
            const next = new Set(prev);
            if (next.has(folder)) {
                next.delete(folder);
            } else {
                next.add(folder);
            }
            return next;
        });
    };

    const handleRunTests = async () => {
        setIsRunning(true);
        setTestOutput('Saving files and running tests...\nThis may take up to 60 seconds (installing dependencies + running tests).\n');

        try {
            // Save files first
            await api.saveFiles(attemptId, files);
            setTestOutput(prev => prev + '\n✓ Files saved\n⏳ Running tests...\n');

            // Start test run
            await api.runTests(attemptId);

            // Poll for results every 3 seconds for up to 90 seconds
            let attempts = 0;
            const maxAttempts = 30; // 30 * 3 seconds = 90 seconds max

            const pollForResults = async (): Promise<void> => {
                attempts++;
                try {
                    const { data } = await api.getAttempt(attemptId);

                    // Check if we have grading results
                    if (data.gradedAt || data.publicScore !== null) {
                        const passed = data.publicScore || 0;
                        const total = data.totalPublic || 0;
                        const status = passed === total ? '✅ All tests passed!' : `⚠️ ${passed}/${total} tests passed`;

                        setTestOutput(
                            `${status}\n\n` +
                            `Public Tests: ${passed}/${total}\n\n` +
                            `${data.gradingLogs ? '--- Test Output ---\n' + data.gradingLogs.substring(0, 2000) : ''}`
                        );
                        setIsRunning(false);
                        return;
                    }

                    // Keep polling if not done yet
                    if (attempts < maxAttempts) {
                        setTestOutput(prev => prev.includes('⏳') ? prev.replace('⏳', '⏳.') : prev + '.');
                        setTimeout(pollForResults, 3000);
                    } else {
                        setTestOutput('Test run timed out. Please try again or check the console for errors.');
                        setIsRunning(false);
                    }
                } catch (e) {
                    setTestOutput(`Error fetching results: ${e}`);
                    setIsRunning(false);
                }
            };

            // Start polling after a short delay
            setTimeout(pollForResults, 3000);
        } catch (error) {
            setTestOutput(`Error: ${error}`);
            setIsRunning(false);
        }
    };

    const handleSubmit = async () => {
        if (isSubmitting) return;

        if (!confirm('Are you sure you want to submit? This action cannot be undone.')) {
            return;
        }

        setIsSubmitting(true);
        setTestOutput('Submitting for final grading...');

        try {
            await api.submitAttempt(attemptId, files);
            router.push(`/exam/${attemptId}/result`);
        } catch (error) {
            setTestOutput(`Submission error: ${error}`);
            setIsSubmitting(false);
        }
    };

    const enterFullscreen = async () => {
        try {
            await document.documentElement.requestFullscreen();
            setShowConsent(false);
        } catch (error) {
            alert('Failed to enter fullscreen. Please allow fullscreen access.');
        }
    };

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    // Build file tree structure
    const buildFileTree = () => {
        const tree: { [folder: string]: string[] } = {};

        Object.keys(files).forEach(path => {
            const parts = path.split('/');
            if (parts.length > 1) {
                const folder = parts[0];
                if (!tree[folder]) tree[folder] = [];
                tree[folder].push(path);
            } else {
                if (!tree['root']) tree['root'] = [];
                tree['root'].push(path);
            }
        });

        return tree;
    };

    if (!attempt) {
        return <div className={styles.loading}><Loader2 className={styles.spinner} /> Loading workspace...</div>;
    }

    // Consent screen
    if (showConsent) {
        return (
            <div className={styles.consentOverlay}>
                <div className={styles.consentCard}>
                    <AlertTriangle size={48} color="var(--accent-yellow)" />
                    <h1>Exam Rules</h1>
                    <ul>
                        <li>This exam will run in <strong>fullscreen mode</strong></li>
                        <li>Tab switching and window exits will be <strong>logged</strong></li>
                        <li>Paste is <strong>disabled</strong> - clipboard content will be blocked</li>
                        <li>Time limit: <strong>{attempt.exam?.timeLimit} minutes</strong></li>
                        <li>Write your own code - plagiarism will be detected</li>
                    </ul>
                    <p>By clicking "Start Exam", you agree to these rules.</p>
                    <button onClick={enterFullscreen} className="btn btn-primary">
                        Start Exam
                    </button>
                </div>
            </div>
        );
    }

    const fileTree = buildFileTree();

    return (
        <div className={styles.workspace}>
            {/* Top Bar */}
            <header className={styles.topBar}>
                <div className={styles.logo}>
                    <Code2 size={20} />
                    <span>{attempt.exam?.title}</span>
                </div>
                <div className={styles.timer} style={{ color: timeLeft < 300 ? 'var(--error)' : undefined }}>
                    <Clock size={16} />
                    <span>{formatTime(timeLeft)}</span>
                </div>
                <div className={styles.actions}>
                    <button
                        onClick={handleRunTests}
                        className="btn btn-secondary btn-sm"
                        disabled={isRunning}
                    >
                        {isRunning ? <Loader2 className={styles.spinner} size={14} /> : <Play size={14} />}
                        Run Tests
                    </button>
                    <button
                        onClick={handleSubmit}
                        className="btn btn-success btn-sm"
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? <Loader2 className={styles.spinner} size={14} /> : <Send size={14} />}
                        Submit
                    </button>
                </div>
            </header>

            <div className={styles.mainArea}>
                {/* File Explorer */}
                <aside className={styles.explorer}>
                    <div className={styles.explorerHeader}>EXPLORER</div>
                    <div className={styles.fileTree}>
                        {Object.entries(fileTree).map(([folder, paths]) => (
                            folder !== 'root' ? (
                                <div key={folder}>
                                    <div
                                        className={styles.folder}
                                        onClick={() => toggleFolder(folder)}
                                    >
                                        {expandedFolders.has(folder) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                        {expandedFolders.has(folder) ? <FolderOpen size={14} /> : <Folder size={14} />}
                                        <span>{folder}</span>
                                    </div>
                                    {expandedFolders.has(folder) && paths.map(path => (
                                        <div
                                            key={path}
                                            className={`${styles.file} ${activeFile === path ? styles.fileActive : ''}`}
                                            onClick={() => handleFileClick(path)}
                                        >
                                            <FileCode size={14} />
                                            <span>{path.split('/').pop()}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                paths.map(path => (
                                    <div
                                        key={path}
                                        className={`${styles.file} ${activeFile === path ? styles.fileActive : ''}`}
                                        onClick={() => handleFileClick(path)}
                                    >
                                        <FileCode size={14} />
                                        <span>{path}</span>
                                    </div>
                                ))
                            )
                        ))}
                    </div>
                </aside>

                <div className={styles.editorArea}>
                    {/* Tabs */}
                    <div className={styles.tabs}>
                        {openFiles.map(path => (
                            <div
                                key={path}
                                className={`${styles.tab} ${activeFile === path ? styles.tabActive : ''}`}
                                onClick={() => setActiveFile(path)}
                            >
                                <FileCode size={12} />
                                <span>{path.split('/').pop()}</span>
                                <button
                                    className={styles.tabClose}
                                    onClick={(e) => handleCloseTab(path, e)}
                                >
                                    ×
                                </button>
                            </div>
                        ))}
                    </div>

                    {/* Monaco Editor */}
                    <div className={styles.editor}>
                        {activeFile ? (
                            <Editor
                                height="100%"
                                language="javascript"
                                theme="vs-dark"
                                value={files[activeFile] || ''}
                                onChange={handleFileChange}
                                onMount={handleEditorMount}
                                options={{
                                    fontSize: 14,
                                    fontFamily: 'Consolas, Monaco, monospace',
                                    minimap: { enabled: false },
                                    scrollBeyondLastLine: false,
                                    automaticLayout: true,
                                    tabSize: 2,
                                }}
                            />
                        ) : (
                            <div className={styles.noFile}>Select a file to edit</div>
                        )}
                    </div>

                    {/* Test Output Panel */}
                    <div className={styles.outputPanel}>
                        <div className={styles.outputHeader}>
                            <span>TEST OUTPUT</span>
                            <button
                                onClick={handleRunTests}
                                className="btn btn-sm btn-secondary"
                                disabled={isRunning}
                            >
                                {isRunning ? <Loader2 className={styles.spinner} size={12} /> : <Play size={12} />}
                                Run Tests
                            </button>
                        </div>
                        <pre className={styles.outputContent}>
                            {testOutput}
                        </pre>
                    </div>
                </div>
            </div>
        </div>
    );
}
