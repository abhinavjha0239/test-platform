'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Editor from '@monaco-editor/react';
import { useAuthStore } from '@/lib/auth-store';
import { api } from '@/lib/api';
import { useExamSocket } from '@/hooks/useExamSocket';
import { useToast } from '@/components/ui';
import {
    Code2, Play, Send, Clock, ChevronRight, ChevronDown,
    FileCode, Folder, FolderOpen, AlertTriangle, CheckCircle, XCircle, Loader2,
    Wifi, WifiOff
} from 'lucide-react';
import styles from './workspace.module.css';

interface FileTree {
    [key: string]: string;
}

interface TreeNode {
    name: string;
    fullPath: string;
    isFolder: boolean;
    children: TreeNode[];
    _childrenMap?: { [key: string]: TreeNode }; // Temporary during tree building
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
    const toast = useToast();

    const [attempt, setAttempt] = useState<Attempt | null>(null);
    const [files, setFiles] = useState<FileTree>({});
    const [activeFile, setActiveFile] = useState<string>('');
    const [openFiles, setOpenFiles] = useState<string[]>([]);
    const [testOutput, setTestOutput] = useState<string>('Click "Run Tests" to execute your code against public tests.');
    const [isRunning, setIsRunning] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set([
        'src', 'tests', 'src/routes', 'src/controllers', 'src/services', 
        'src/models', 'src/middleware', 'src/utils', 'src/components'
    ]));
    const [showConsent, setShowConsent] = useState(true);

    const editorRef = useRef<any>(null);
    const monacoRef = useRef<any>(null);
    const tabLeaveTime = useRef<number>(0);

    const getLanguageForFile = useCallback((filePath: string) => {
        const ext = (filePath.split('.').pop() || '').toLowerCase();
        switch (ext) {
            // Rust / Go / Python
            case 'rs':
                return 'rust';
            case 'go':
                return 'go';
            case 'py':
                return 'python';

            // JS/TS
            case 'ts':
            case 'tsx':
                return 'typescript';
            case 'js':
            case 'jsx':
            case 'mjs':
            case 'cjs':
                return 'javascript';

            // Web / configs
            case 'json':
                return 'json';
            case 'md':
                return 'markdown';
            case 'html':
            case 'htm':
                return 'html';
            case 'css':
                return 'css';
            case 'yaml':
            case 'yml':
                return 'yaml';
            case 'toml':
                return 'toml';

            default:
                return 'plaintext';
        }
    }, []);

    const activeFileLanguage = activeFile ? getLanguageForFile(activeFile) : 'plaintext';

    // WebSocket integration
    const {
        timeLeft,
        formattedTime,
        isConnected,
        isConnecting,
        connectionError,
        saveStatus,
        proctorWarning,
        debouncedSave,
        logEvent,
        reconnect,
    } = useExamSocket(attemptId, {
        onTimerExpired: () => {
            toast.warning('Time is up! Your exam is being automatically submitted.');
            handleSubmit();
        },
        onGradingComplete: (result, isPreview) => {
            if (isPreview) {
                const passed = result.publicScore || 0;
                const total = result.totalPublic || 0;
                const status = passed === total ? '✅ All tests passed!' : `⚠️ ${passed}/${total} tests passed`;
                setTestOutput(`${status}\n\nPublic Tests: ${passed}/${total}\n\n${result.logs ? '--- Test Output ---\n' + result.logs.substring(0, 2000) : ''}`);
                setIsRunning(false);
            } else {
                toast.success('Grading complete! Redirecting to results...');
                setTimeout(() => router.push(`/exam/${attemptId}/result`), 1500);
            }
        },
        onProctorWarning: (warning) => {
            if (warning.severity === 'high') {
                toast.error(warning.message);
            } else {
                toast.warning(warning.message);
            }
        },
        onConnectionChange: (connected) => {
            if (connected) {
                toast.success('Connected to exam server');
            } else {
                toast.warning('Connection lost. Reconnecting...');
            }
        },
    });

    // Load attempt data
    useEffect(() => {
        checkAuth();
        loadAttempt();
    }, [attemptId]);

    // Proctoring: Tab visibility (via WebSocket)
    useEffect(() => {
        if (!attempt || showConsent || !isConnected) return;

        const handleVisibilityChange = () => {
            if (document.hidden) {
                tabLeaveTime.current = Date.now();
                logEvent('TAB_LEAVE');
            } else {
                const duration = Math.floor((Date.now() - tabLeaveTime.current) / 1000);
                logEvent('TAB_RETURN', { duration });
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [attempt, showConsent, isConnected, logEvent]);

    // Proctoring: Fullscreen (via WebSocket)
    useEffect(() => {
        if (!attempt || showConsent || !isConnected) return;

        const handleFullscreenChange = () => {
            if (!document.fullscreenElement) {
                logEvent('FULLSCREEN_EXIT');
            } else {
                logEvent('FULLSCREEN_ENTER');
            }
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, [attempt, showConsent, isConnected, logEvent]);

    // Auto-save via WebSocket (debounced)
    useEffect(() => {
        if (!attempt || Object.keys(files).length === 0 || showConsent) return;
        debouncedSave(files, 2000);
    }, [files, attempt, debouncedSave, showConsent]);

    const loadAttempt = async () => {
        try {
            const data = await api.getAttempt(attemptId);
            setAttempt(data as any);
            setFiles((data as any).files || {});

            // Open first file
            const firstFile = Object.keys((data as any).files || {})[0];
            if (firstFile) {
                setActiveFile(firstFile);
                setOpenFiles([firstFile]);
            }
        } catch (error) {
            console.error('Failed to load attempt:', error);
            toast.error('Failed to load exam. Redirecting...');
            setTimeout(() => router.push('/dashboard'), 2000);
        }
    };

    const handleEditorMount = (editor: any, monaco: any) => {
        editorRef.current = editor;
        monacoRef.current = monaco;

        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/96ef93a5-f48d-498e-b9a7-fe6968539886', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId: 'debug-session',
                runId: 'pre-fix',
                hypothesisId: 'A',
                location: 'apps/web/src/app/exam/[id]/page.tsx:handleEditorMount',
                message: 'Monaco editor mounted',
                data: {
                    activeFile,
                    activeFileExt: (activeFile.split('.').pop() || '').toLowerCase(),
                    languageProp: 'javascript',
                    modelLanguageId: editor?.getModel?.()?.getLanguageId?.(),
                    hasRustLanguage: Boolean(monaco?.languages?.getLanguages?.()?.some((l: any) => l?.id === 'rust')),
                    hasGoLanguage: Boolean(monaco?.languages?.getLanguages?.()?.some((l: any) => l?.id === 'go')),
                    hasPythonLanguage: Boolean(monaco?.languages?.getLanguages?.()?.some((l: any) => l?.id === 'python')),
                },
                timestamp: Date.now(),
            }),
        }).catch(() => {});
        // #endregion agent log

        // Override paste command - CRITICAL for proctoring
        if (attempt?.exam?.pasteDisabled) {
            editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyV, () => {
                // Log paste attempt via WebSocket
                logEvent('PASTE_ATTEMPT', { pasteLength: 0, isMultiline: false });

                // Insert placeholder instead of clipboard content
                editor.trigger('keyboard', 'type', { text: '[PASTE_DISABLED_IN_EXAM]' });
            });
        }
    };

    useEffect(() => {
        if (!activeFile) return;
        const modelLanguageId = editorRef.current?.getModel?.()?.getLanguageId?.();

        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/96ef93a5-f48d-498e-b9a7-fe6968539886', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId: 'debug-session',
                runId: 'post-fix',
                hypothesisId: 'A',
                location: 'apps/web/src/app/exam/[id]/page.tsx:activeFileLanguageEffect',
                message: 'Active file language computed / model language observed',
                data: {
                    activeFile,
                    activeFileExt: (activeFile.split('.').pop() || '').toLowerCase(),
                    computedLanguage: activeFileLanguage,
                    modelLanguageId,
                    hasRustLanguage: Boolean(monacoRef.current?.languages?.getLanguages?.()?.some((l: any) => l?.id === 'rust')),
                    hasGoLanguage: Boolean(monacoRef.current?.languages?.getLanguages?.()?.some((l: any) => l?.id === 'go')),
                    hasPythonLanguage: Boolean(monacoRef.current?.languages?.getLanguages?.()?.some((l: any) => l?.id === 'python')),
                },
                timestamp: Date.now(),
            }),
        }).catch(() => {});
        // #endregion agent log
    }, [activeFile, activeFileLanguage]);

    const handleFileChange = (value: string | undefined) => {
        if (!activeFile || value === undefined) return;
        setFiles(prev => ({ ...prev, [activeFile]: value }));
    };

    const handleFileClick = (path: string) => {
        setActiveFile(path);
        if (!openFiles.includes(path)) {
            setOpenFiles(prev => [...prev, path]);
        }

        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/96ef93a5-f48d-498e-b9a7-fe6968539886', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId: 'debug-session',
                runId: 'pre-fix',
                hypothesisId: 'A',
                location: 'apps/web/src/app/exam/[id]/page.tsx:handleFileClick',
                message: 'User selected file in workspace',
                data: {
                    path,
                    ext: (path.split('.').pop() || '').toLowerCase(),
                    languageProp: 'javascript',
                },
                timestamp: Date.now(),
            }),
        }).catch(() => {});
        // #endregion agent log
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
        setTestOutput('Saving files and running tests...\nThis may take up to 60 seconds.\n');

        try {
            // Save files first via API (ensures consistency)
            await api.saveFiles(attemptId, files);
            setTestOutput(prev => prev + '\n✓ Files saved\n⏳ Running tests...\n');

            // Start test run - results will come via WebSocket
            await api.runTests(attemptId);
        } catch (error) {
            setTestOutput(`Error: ${error}`);
            setIsRunning(false);
        }
    };

    const handleSubmit = async () => {
        if (isSubmitting) return;

        const confirmed = window.confirm('Are you sure you want to submit? This action cannot be undone.');
        if (!confirmed) return;

        setIsSubmitting(true);
        setTestOutput('Submitting for final grading...');

        try {
            await api.submitAttempt(attemptId, files);
            toast.success('Exam submitted! Results will be ready shortly.');
            // Results will arrive via WebSocket grading:complete event
        } catch (error) {
            setTestOutput(`Submission error: ${error}`);
            toast.error(`Submission failed: ${error}`);
            setIsSubmitting(false);
        }
    };

    const enterFullscreen = async () => {
        try {
            await document.documentElement.requestFullscreen();
            setShowConsent(false);
        } catch (error) {
            toast.error('Failed to enter fullscreen. Please allow fullscreen access.');
        }
    };

    const formatTimeLocal = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    // Build nested file tree structure
    const buildNestedTree = (): TreeNode[] => {
        const root: { [key: string]: TreeNode } = {};

        Object.keys(files).sort().forEach(filePath => {
            const parts = filePath.split('/');
            let current = root;

            parts.forEach((part, index) => {
                const isLast = index === parts.length - 1;
                const pathUpToHere = parts.slice(0, index + 1).join('/');

                if (!current[part]) {
                    current[part] = {
                        name: part,
                        fullPath: pathUpToHere,
                        isFolder: !isLast,
                        children: [],
                    };
                }

                if (!isLast) {
                    // Navigate into folder's children map
                    const folderNode = current[part];
                    if (!folderNode._childrenMap) {
                        folderNode._childrenMap = {};
                    }
                    current = folderNode._childrenMap;
                }
            });
        });

        // Convert the nested maps to arrays
        const convertToArray = (nodeMap: { [key: string]: TreeNode }): TreeNode[] => {
            return Object.values(nodeMap).map(node => {
                if (node._childrenMap) {
                    node.children = convertToArray(node._childrenMap);
                    delete node._childrenMap;
                }
                return node;
            }).sort((a, b) => {
                // Folders first, then alphabetically
                if (a.isFolder && !b.isFolder) return -1;
                if (!a.isFolder && b.isFolder) return 1;
                return a.name.localeCompare(b.name);
            });
        };

        return convertToArray(root);
    };

    // Recursive component to render tree nodes
    const renderTreeNode = (node: TreeNode, depth: number = 0): JSX.Element => {
        const paddingLeft = depth * 12 + 8;

        if (node.isFolder) {
            const isExpanded = expandedFolders.has(node.fullPath);
            return (
                <div key={node.fullPath}>
                    <div
                        className={styles.folder}
                        style={{ paddingLeft }}
                        onClick={() => toggleFolder(node.fullPath)}
                    >
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        {isExpanded ? <FolderOpen size={14} /> : <Folder size={14} />}
                        <span>{node.name}</span>
                    </div>
                    {isExpanded && node.children.map(child => renderTreeNode(child, depth + 1))}
                </div>
            );
        } else {
            return (
                <div
                    key={node.fullPath}
                    className={`${styles.file} ${activeFile === node.fullPath ? styles.fileActive : ''}`}
                    style={{ paddingLeft: paddingLeft + 14 }}
                    onClick={() => handleFileClick(node.fullPath)}
                >
                    <FileCode size={14} />
                    <span>{node.name}</span>
                </div>
            );
        }
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

    const nestedTree = buildNestedTree();
    const displayTime = formattedTime || formatTimeLocal(timeLeft);

    return (
        <div className={styles.workspace}>
            {/* Proctor Warning Banner */}
            {proctorWarning && (
                <div className={styles.warningBanner}>
                    <AlertTriangle size={16} />
                    <span>{proctorWarning.message}</span>
                </div>
            )}

            {/* Top Bar */}
            <header className={styles.topBar}>
                <div className={styles.logo}>
                    <Code2 size={20} />
                    <span>{attempt.exam?.title}</span>
                </div>
                <div className={styles.statusBar}>
                    {/* Connection Status */}
                    <div className={`${styles.connectionStatus} ${isConnected ? styles.connected : styles.disconnected}`}>
                        {isConnected ? <Wifi size={14} /> : <WifiOff size={14} />}
                        <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
                    </div>
                    {/* Save Status */}
                    <div className={styles.saveStatus}>
                        {saveStatus === 'saving' && <Loader2 size={12} className={styles.spinner} />}
                        {saveStatus === 'saved' && <CheckCircle size={12} color="var(--success)" />}
                        {saveStatus === 'error' && <XCircle size={12} color="var(--error)" />}
                        <span>{saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved' : ''}</span>
                    </div>
                </div>
                <div className={styles.timer} style={{ color: timeLeft < 300 ? 'var(--error)' : undefined }}>
                    <Clock size={16} />
                    <span>{displayTime}</span>
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
                        {nestedTree.map(node => renderTreeNode(node, 0))}
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
                                language={activeFileLanguage}
                                path={activeFile}
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
