'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Editor from '@monaco-editor/react';
import { useAuthStore } from '@/lib/auth-store';
import { ReactDocsPanel, DocsToggle } from '@/components/exam/react/ReactDocsPanel';
import { api } from '@/lib/api';
import { useExamSocket } from '@/hooks/useExamSocket';
import { useToast, ConfirmModal } from '@/components/ui';
import { SqlChallengeWorkspace } from '@/components/exam/sql';
import { ReactPreviewPanel, PreviewToggle } from '@/components/exam/react';
import { FullscreenExitOverlay } from '@/components/exam/FullscreenExitOverlay';
import { ScreenShareOverlay } from '@/components/exam/ScreenShareOverlay';
import { useScreenShare } from '@/hooks/useScreenShare';
import { useKeystrokeTracker } from '@/hooks/useKeystrokeTracker';
import {
    captureScreenshotAsync,
    captureMultipleScreenshots,
    startRandomCaptures,
    stopRandomCaptures
} from '@/lib/proctorCapture';
import {
    Code2, Play, Send, Clock, ChevronRight, ChevronDown,
    FileCode, Folder, FolderOpen, AlertTriangle, CheckCircle, XCircle, Loader2,
    Wifi, WifiOff, GripHorizontal, ChevronUp, Minus, Maximize2, RotateCcw
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
    publicScore?: number | null;
    totalPublic?: number | null;
    gradingLogs?: string | null;
    gradedAt?: string | null;
    exam?: {
        title: string;
        timeLimit: number;
        pasteDisabled: boolean;
        fullscreenRequired: boolean;
        challenge?: {
            name: string;
            description?: string;
            publicTests: string;
            runner?: {
                mode?: string;
                runtime?: string;
                sampleData?: {
                    tables?: Record<string, {
                        columns: { name: string; type: string }[];
                        rows: Record<string, any>[];
                        truncated?: boolean;
                    }>;
                };
                publicTests?: Array<{
                    name: string;
                    expectedResult?: Record<string, any>[];
                }>;
            };
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
    const [testDetails, setTestDetails] = useState<Array<{
        name: string;
        status: string;
        failureMessages?: string[];
    }>>([]);
    const [isRunning, setIsRunning] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [sqlResults, setSqlResults] = useState<Array<{
        name: string;
        passed: boolean;
        expected?: Record<string, any>[];
        actual?: Record<string, any>[];
        error?: string;
    }>>([]);
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set([
        'src', 'tests', 'src/routes', 'src/controllers', 'src/services',
        'src/models', 'src/middleware', 'src/utils', 'src/components'
    ]));
    const [showConsent, setShowConsent] = useState(true);
    const [showFullscreenOverlay, setShowFullscreenOverlay] = useState(false);
    const [fullscreenExitCount, setFullscreenExitCount] = useState(0);
    const [showScreenShareOverlay, setShowScreenShareOverlay] = useState(false);
    const [screenShareLostAfterStart, setScreenShareLostAfterStart] = useState(false);
    const [previewMode, setPreviewMode] = useState<'off' | 'modal' | 'split'>('off');
    const [showDocs, setShowDocs] = useState(false);
    const [outputHeight, setOutputHeight] = useState(200);
    const [isOutputCollapsed, setIsOutputCollapsed] = useState(false);
    const [showSubmitModal, setShowSubmitModal] = useState(false);
    const [showResetModal, setShowResetModal] = useState(false);
    const isResizingOutput = useRef(false);
    const resizeStartY = useRef(0);
    const resizeStartHeight = useRef(0);

    const editorRef = useRef<any>(null);
    const monacoRef = useRef<any>(null);
    const tabLeaveTime = useRef<number>(0);
    const runTestsPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const runTestsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const runTestsStartedAtRef = useRef<number | null>(null);

    // Screen share hook
    const {
        isScreenSharing,
        isRequestingShare,
        screenShareError,
        requestScreenShare,
    } = useScreenShare({
        onScreenShareLost: () => {
            // Screen share stopped - show overlay again
            setScreenShareLostAfterStart(true);
            setShowScreenShareOverlay(true);
            toast.error('Screen sharing stopped! Please share your screen again to continue.');
            // Log the event
            logEvent('SCREEN_SHARE_LOST');
            // Capture screenshot when screen share lost
            captureScreenshotAsync({ attemptId, eventType: 'FULLSCREEN_EXIT' });
        },
        onScreenShareError: (error) => {
            toast.error(error);
        },
    });

    const clearRunTestsTimers = useCallback(() => {
        if (runTestsPollRef.current) {
            clearInterval(runTestsPollRef.current);
            runTestsPollRef.current = null;
        }
        if (runTestsTimeoutRef.current) {
            clearTimeout(runTestsTimeoutRef.current);
            runTestsTimeoutRef.current = null;
        }
        runTestsStartedAtRef.current = null;
    }, []);

    /** Strip infrastructure noise from test runner output */
    const sanitizeTestLogs = useCallback((logs: string): string => {
        const lines = logs.split('\n');
        const out: string[] = [];
        let inErrorBlock = false;

        for (const line of lines) {
            const l = line.toLowerCase();
            // Skip npm notices
            if (l.startsWith('npm notice') || l.startsWith('npm warn')) continue;
            // Skip JUNIT report line
            if (l.includes('junit report written to')) continue;

            // Detect start of Unhandled Error block
            if (l.includes('unhandled error')) {
                inErrorBlock = true;
                continue;
            }
            if (inErrorBlock) {
                // End block after Serialized Error line
                if (l.includes('serialized error')) {
                    inErrorBlock = false;
                }
                continue;
            }

            out.push(line);
        }

        return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    }, []);

    const applyPreviewResult = useCallback((result: {
        publicScore?: number | null;
        totalPublic?: number | null;
        logs?: string | null;
    }) => {
        clearRunTestsTimers();
        const passed = result.publicScore ?? 0;
        const total = result.totalPublic ?? 0;
        const status = passed === total ? '✅ All tests passed!' : `⚠️ ${passed}/${total} tests passed`;

        let rawLogs = result.logs || '';
        // Parse structured test details if embedded by grader
        const detailsMatch = rawLogs.match(/---TEST_DETAILS_JSON---\n([\s\S]*?)\n---END_TEST_DETAILS_JSON---/);
        if (detailsMatch?.[1]) {
            try {
                const parsed = JSON.parse(detailsMatch[1]);
                setTestDetails(parsed);
            } catch {
                setTestDetails([]);
            }
            rawLogs = rawLogs.replace(/---TEST_DETAILS_JSON---[\s\S]*?---END_TEST_DETAILS_JSON---/, '').trim();
        } else {
            setTestDetails([]);
        }

        rawLogs = sanitizeTestLogs(rawLogs);

        setTestOutput(`${status}\n\nPublic Tests: ${passed}/${total}${rawLogs ? '\n\n--- Test Output ---\n' + rawLogs.substring(0, 2000) : ''}`);
        setIsRunning(false);
    }, [clearRunTestsTimers, sanitizeTestLogs]);

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
            // Server auto-submits on timer expiry, just update UI state
            setIsSubmitting(true);
            setTestOutput('⏱️ Time expired — your code is being submitted for final grading...');
        },
        onGradingComplete: (result, isPreview) => {
            if (process.env.NODE_ENV === 'development') {
                console.debug('grading:complete received', {
                    attemptId,
                    isPreview,
                    publicScore: result.publicScore,
                    totalPublic: result.totalPublic,
                    hiddenScore: result.hiddenScore,
                    totalHidden: result.totalHidden,
                    success: result.success,
                });
            }

            // Update SQL results for SqlChallengeWorkspace
            // Try to parse JSON test details from logs
            let parsedDetails: Array<{
                name: string;
                passed: boolean;
                expected?: Record<string, any>[];
                actual?: Record<string, any>[];
                error?: string;
            }> = [];

            const logs = result.logs || '';
            const jsonMatch = logs.match(/---JSON_TEST_DETAILS---\n([\s\S]*?)\n---END_JSON_TEST_DETAILS---/);
            if (jsonMatch && jsonMatch[1]) {
                try {
                    parsedDetails = JSON.parse(jsonMatch[1]);
                    setSqlResults(parsedDetails);
                } catch (e) {
                    console.warn('Failed to parse SQL test details JSON:', e);
                }
            }

            // Fallback to basic results if no JSON available
            if (parsedDetails.length === 0) {
                const totalTests = (result.totalPublic || 0) + (result.totalHidden || 0);
                if (totalTests > 0) {
                    const newResults: Array<{ name: string; passed: boolean; error?: string }> = [];
                    for (let i = 0; i < (result.totalPublic || 0); i++) {
                        newResults.push({
                            name: `Public Test ${i + 1}`,
                            passed: i < (result.publicScore || 0),
                            error: i >= (result.publicScore || 0) ? 'Query result does not match expected output' : undefined,
                        });
                    }
                    for (let i = 0; i < (result.totalHidden || 0); i++) {
                        newResults.push({
                            name: `Hidden Test ${i + 1}`,
                            passed: i < (result.hiddenScore || 0),
                            error: i >= (result.hiddenScore || 0) ? 'Query result does not match expected output' : undefined,
                        });
                    }
                    setSqlResults(newResults);
                }
            }
            setIsRunning(false);

            if (isPreview) {
                applyPreviewResult({
                    publicScore: result.publicScore,
                    totalPublic: result.totalPublic,
                    logs: result.logs,
                });
            } else {
                clearRunTestsTimers();
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

    // Keystroke tracking - enabled when exam is active
    useKeystrokeTracker({
        attemptId,
        enabled: !!attempt && !showConsent && isConnected,
        batchIntervalMs: 10000,  // Send keystroke batches every 10s
        speedIntervalMs: 30000,  // Compute typing speed every 30s
    });

    // Load attempt data
    useEffect(() => {
        checkAuth();
        loadAttempt();
    }, [attemptId]);

    useEffect(() => {
        return () => {
            clearRunTestsTimers();
            stopRandomCaptures(); // Cleanup random captures on unmount
        };
    }, [clearRunTestsTimers]);

    // Check screen sharing status after consent (detect refresh or lost screen share)
    useEffect(() => {
        if (!attempt || showConsent) return;

        // If we're past consent screen but not sharing screen, show overlay
        // This handles the refresh case where consent is skipped but screen share is lost
        if (!isScreenSharing && !isRequestingShare) {
            setScreenShareLostAfterStart(true);
            setShowScreenShareOverlay(true);
        } else if (isScreenSharing) {
            // Hide overlay when screen sharing starts
            setShowScreenShareOverlay(false);
        }
    }, [attempt, showConsent, isScreenSharing, isRequestingShare]);

    // Proctoring: Tab visibility (via WebSocket)
    useEffect(() => {
        if (!attempt || showConsent || !isConnected) return;

        const handleVisibilityChange = () => {
            if (document.hidden) {
                tabLeaveTime.current = Date.now();
                logEvent('TAB_LEAVE');
                // Capture multiple screenshots on tab leave (3 captures, 1 sec apart)
                captureMultipleScreenshots(attemptId, 'TAB_LEAVE', 3, 1000);
            } else {
                // Only calculate duration if we actually left the tab (tabLeaveTime > 0)
                if (tabLeaveTime.current > 0) {
                    const duration = Math.floor((Date.now() - tabLeaveTime.current) / 1000);
                    // Sanity check: duration should be reasonable (max 24 hours)
                    const validDuration = Math.min(duration, 86400);
                    logEvent('TAB_RETURN', { duration: validDuration });
                    // Capture on return too
                    captureScreenshotAsync({ attemptId, eventType: 'TAB_RETURN' });
                }
                tabLeaveTime.current = 0; // Reset after return
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [attempt, showConsent, isConnected, logEvent, attemptId]);

    // Proctoring: Fullscreen (via WebSocket)
    useEffect(() => {
        if (!attempt || showConsent || !isConnected) return;

        const handleFullscreenChange = () => {
            if (!document.fullscreenElement) {
                logEvent('FULLSCREEN_EXIT');
                // Increment exit count and show overlay
                setFullscreenExitCount(prev => prev + 1);
                setShowFullscreenOverlay(true);
                // Capture multiple screenshots on fullscreen exit (3 captures, 1.5 sec apart)
                captureMultipleScreenshots(attemptId, 'FULLSCREEN_EXIT', 3, 1500);
            } else {
                logEvent('FULLSCREEN_ENTER');
                // Hide overlay when re-entering fullscreen
                setShowFullscreenOverlay(false);
                // Capture on re-entry
                captureScreenshotAsync({ attemptId, eventType: 'FULLSCREEN_ENTER' });
            }
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, [attempt, showConsent, isConnected, logEvent, attemptId]);

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

            // If exam was already started (e.g., page refresh), skip consent but require screen share
            if ((data as any).startedAt) {
                setShowConsent(false);
                // Screen share will be required by the useEffect that checks isScreenSharing
                setScreenShareLostAfterStart(true);
                setShowScreenShareOverlay(true);
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

        // Override paste command - CRITICAL for proctoring
        if (attempt?.exam?.pasteDisabled) {
            editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyV, () => {
                // Log paste attempt via WebSocket
                logEvent('PASTE_ATTEMPT', { pasteLength: 0, isMultiline: false });

                // Capture screenshot on paste attempt
                captureScreenshotAsync({
                    attemptId,
                    eventType: 'PASTE_ATTEMPT',
                });

                // Insert placeholder instead of clipboard content
                editor.trigger('keyboard', 'type', { text: '[PASTE_DISABLED_IN_EXAM]' });
            });
        }
    };

    useEffect(() => {
        // Effect for activeFile/language changes - can be used for debugging if needed
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
        // Prevent spam clicks - show toast if already running
        if (isRunning) {
            toast.warning('Tests are already running. Please wait...');
            return;
        }

        clearRunTestsTimers();
        runTestsStartedAtRef.current = Date.now();
        setIsRunning(true);
        setTestOutput('Saving files and running tests...\nThis may take up to 60 seconds.\n');

        try {
            // Save files first via API (ensures consistency)
            await api.saveFiles(attemptId, files);
            setTestOutput(prev => prev + '\n✓ Files saved\n⏳ Running tests...\n');

            // Start test run - results will come via WebSocket
            const { jobId } = await api.runTests(attemptId);
            if (process.env.NODE_ENV === 'development') {
                console.debug('run-tests queued', { attemptId, jobId });
            }

            const pollAttempt = async () => {
                const startTime = runTestsStartedAtRef.current;
                if (!startTime) {
                    return;
                }
                try {
                    const refreshed = await api.getAttempt(attemptId);
                    const gradedAt = refreshed.gradedAt ? new Date(refreshed.gradedAt).getTime() : 0;
                    if (!Number.isNaN(gradedAt) && gradedAt >= startTime) {
                        applyPreviewResult({
                            publicScore: refreshed.publicScore,
                            totalPublic: refreshed.totalPublic,
                            logs: refreshed.gradingLogs || '',
                        });
                    }
                } catch (error) {
                    if (process.env.NODE_ENV === 'development') {
                        console.warn('run-tests poll failed', error);
                    }
                }
            };

            runTestsPollRef.current = setInterval(pollAttempt, 3000);
            pollAttempt();

            runTestsTimeoutRef.current = setTimeout(() => {
                if (!runTestsStartedAtRef.current) {
                    return;
                }
                // Show error toast for better visibility
                toast.error('Test run timed out. Please try again.');
                setTestOutput('⚠️ Test run timed out after 90 seconds.\n\nPossible causes:\n• Server is busy - try again in a moment\n• Your code has an infinite loop\n• Network connection issues\n\nClick "Run Tests" to try again.');
                setIsRunning(false);
                clearRunTestsTimers();
                if (process.env.NODE_ENV === 'development') {
                    console.warn('run-tests timeout', { attemptId, jobId });
                }
            }, 90000);
        } catch (error: any) {
            // Handle 429 rate limit error with friendly message
            if (error?.response?.status === 429 || error?.message?.includes('429')) {
                toast.warning('Tests are already running. Please wait for them to complete.');
                setTestOutput('⏳ A test run is already in progress.\n\nPlease wait for it to complete before running tests again.');
            } else {
                toast.error(`Test run failed: ${error?.message || 'Unknown error'}`);
                setTestOutput(`❌ Error running tests:\n\n${error?.message || error}\n\nClick "Run Tests" to try again.`);
            }
            setIsRunning(false);
            clearRunTestsTimers();
        }
    };

    const handleSubmit = () => {
        if (isSubmitting) return;
        setShowSubmitModal(true);
    };

    const confirmSubmit = async () => {
        setShowSubmitModal(false);
        setIsSubmitting(true);
        setTestOutput('Submitting for final grading...');

        // Capture final screenshot before submission
        captureScreenshotAsync({ attemptId, eventType: 'EXAM_SUBMIT' });
        // Stop random captures
        stopRandomCaptures();

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

    const handleResetCode = () => {
        setShowResetModal(true);
    };

    const confirmReset = async () => {
        setShowResetModal(false);

        try {
            const { files: starterFiles } = await api.getStarterFiles(attemptId);
            setFiles(starterFiles);

            // Reset open/active file to first starter file
            const firstFile = Object.keys(starterFiles)[0];
            if (firstFile) {
                setActiveFile(firstFile);
                setOpenFiles([firstFile]);
            }

            toast.success('Code reset to starter files.');
        } catch (error: any) {
            toast.error(`Reset failed: ${error?.message || 'Unknown error'}`);
        }
    };

    const enterFullscreen = async () => {
        try {
            // First request screen sharing
            const screenShareSuccess = await requestScreenShare();
            if (!screenShareSuccess) {
                toast.error('You must share your entire screen to start the exam.');
                return;
            }

            // Then enter fullscreen
            await document.documentElement.requestFullscreen();
            setShowConsent(false);
            setShowScreenShareOverlay(false);

            // Capture exam start screenshot
            captureScreenshotAsync({ attemptId, eventType: 'EXAM_START' });

            // Start random periodic captures (S3 handles load well)
            startRandomCaptures(attemptId, 30, 90); // Every 30-90 seconds
        } catch (error) {
            toast.error('Failed to enter fullscreen. Please allow fullscreen access.');
        }
    };

    // Handle screen share re-request (after refresh or lost)
    // This is called from a button click, so we have user gesture for fullscreen
    const handleScreenShareRequest = async () => {
        try {
            // First request fullscreen (requires user gesture - we're in button click)
            if (!document.fullscreenElement) {
                await document.documentElement.requestFullscreen();
            }

            // Then request screen share
            const success = await requestScreenShare();
            if (success) {
                setShowScreenShareOverlay(false);
                // Start random captures if not already
                startRandomCaptures(attemptId, 30, 90);
            } else {
                // Screen share failed, exit fullscreen
                if (document.fullscreenElement) {
                    document.exitFullscreen().catch(() => { });
                }
            }
        } catch (error) {
            console.error('Failed to enter fullscreen or screen share:', error);
            toast.error('Please allow fullscreen and screen sharing to continue the exam.');
        }
    };

    const formatTimeLocal = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    // Output panel resize handlers
    const handleOutputResizeStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        isResizingOutput.current = true;
        resizeStartY.current = e.clientY;
        resizeStartHeight.current = outputHeight;
        document.body.style.cursor = 'row-resize';
        document.body.style.userSelect = 'none';

        const handleMouseMove = (ev: MouseEvent) => {
            if (!isResizingOutput.current) return;
            const delta = resizeStartY.current - ev.clientY;
            const newHeight = Math.max(80, Math.min(window.innerHeight * 0.6, resizeStartHeight.current + delta));
            setOutputHeight(newHeight);
            setIsOutputCollapsed(false);
        };

        const handleMouseUp = () => {
            isResizingOutput.current = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }, [outputHeight]);

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

    // Fullscreen exit overlay handler - MUST be before any early returns
    const handleFullscreenCountdownComplete = useCallback(() => {
        // After countdown, allow re-entry but keep overlay if not in fullscreen
        if (!document.fullscreenElement) {
            // Keep overlay visible until they re-enter fullscreen
        }
    }, []);

    const handleFullscreenReenter = useCallback(() => {
        setShowFullscreenOverlay(false);
    }, []);

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
                        <li>You must <strong>share your entire screen</strong> during the exam</li>
                        <li>This exam will run in <strong>fullscreen mode</strong></li>
                        <li>Tab switching and window exits will be <strong>logged with screenshots</strong></li>
                        <li>Paste is <strong>disabled</strong> - clipboard content will be blocked</li>
                        <li>Time limit: <strong>{attempt.exam?.timeLimit} minutes</strong></li>
                        <li>Write your own code - plagiarism will be detected</li>
                    </ul>
                    <p>By clicking "Share Screen & Start", you agree to these rules.</p>
                    <button onClick={enterFullscreen} className="btn btn-primary">
                        Share Screen & Start Exam
                    </button>
                </div>
            </div>
        );
    }

    const nestedTree = buildNestedTree();
    const displayTime = formattedTime || formatTimeLocal(timeLeft);

    // Detect SQL mode
    const isSqlMode = attempt.exam?.challenge?.runner?.mode === 'sql';
    const sqlRunner = attempt.exam?.challenge?.runner;

    // Detect React mode (playwright or ui_jsdom with react runtime)
    const runner = attempt.exam?.challenge?.runner;
    const isReactMode = runner?.runtime === 'react';

    // SQL Mode - LeetCode-style workspace
    if (isSqlMode && sqlRunner) {
        const sqlTables = sqlRunner.sampleData?.tables || {};
        const sqlPublicTests = sqlRunner.publicTests || [];

        return (
            <div className={styles.workspace}>
                {/* Screen Share Overlay */}
                <ScreenShareOverlay
                    isVisible={showScreenShareOverlay}
                    isRequesting={isRequestingShare}
                    error={screenShareError}
                    onRequestShare={handleScreenShareRequest}
                    showRefreshWarning={screenShareLostAfterStart}
                />

                {/* Fullscreen Exit Overlay */}
                <FullscreenExitOverlay
                    isVisible={showFullscreenOverlay && !showScreenShareOverlay}
                    countdownSeconds={15}
                    exitCount={fullscreenExitCount}
                    onCountdownComplete={handleFullscreenCountdownComplete}
                    onReenterFullscreen={handleFullscreenReenter}
                />

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
                        <div className={`${styles.connectionStatus} ${isConnected ? styles.connected : styles.disconnected}`}>
                            {isConnected ? <Wifi size={14} /> : <WifiOff size={14} />}
                            <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
                        </div>
                        <div className={styles.saveStatus}>
                            {saveStatus === 'saving' && <Loader2 size={12} className={styles.spinner} />}
                            {saveStatus === 'saved' && <CheckCircle size={12} color="var(--success)" />}
                            <span>{saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved' : ''}</span>
                        </div>
                    </div>
                    <div className={styles.timer} style={{ color: timeLeft < 300 ? 'var(--error)' : undefined }}>
                        <Clock size={16} />
                        <span>{displayTime}</span>
                    </div>
                </header>

                {/* SQL Challenge Workspace */}
                <div style={{ flex: 1, overflow: 'hidden' }}>
                    <SqlChallengeWorkspace
                        description={attempt.exam?.challenge?.description || attempt.exam?.challenge?.name || 'SQL Challenge'}
                        tables={sqlTables}
                        publicTests={sqlPublicTests}
                        files={files}
                        onFileChange={(fileName, value) => {
                            const newFiles = { ...files, [fileName]: value };
                            setFiles(newFiles);
                            debouncedSave(newFiles);
                        }}
                        onRun={async () => {
                            // Prevent spam clicks
                            if (isRunning) {
                                toast.warning('Tests are already running. Please wait...');
                                return [];
                            }

                            setIsRunning(true);
                            setTestOutput('Running SQL query...');

                            try {
                                await api.saveFiles(attemptId, files);
                                await api.runTests(attemptId);
                                // Results will come via WebSocket and update testOutput
                            } catch (error: any) {
                                if (error?.response?.status === 429 || error?.message?.includes('429')) {
                                    toast.warning('Tests already running. Please wait...');
                                    setTestOutput('⏳ A test run is already in progress.');
                                } else {
                                    toast.error(`Test run failed: ${error?.message || 'Unknown error'}`);
                                    setTestOutput(`❌ Error: ${error?.message || error}`);
                                }
                                setIsRunning(false);
                            }
                            return [];
                        }}
                        onSubmit={async () => {
                            setIsSubmitting(true);
                            await api.submitAttempt(attemptId, files);
                            toast.success('Exam submitted! Results will be ready shortly.');
                        }}
                        isRunning={isRunning}
                        isConnected={isConnected}
                        logs={testOutput}
                        results={sqlResults}
                    />
                </div>
            </div>
        );
    }

    // Standard workspace (Monaco editor)

    return (
        <div className={styles.workspace}>
            {/* Screen Share Overlay */}
            <ScreenShareOverlay
                isVisible={showScreenShareOverlay}
                isRequesting={isRequestingShare}
                error={screenShareError}
                onRequestShare={handleScreenShareRequest}
                showRefreshWarning={screenShareLostAfterStart}
            />

            {/* Fullscreen Exit Overlay */}
            <FullscreenExitOverlay
                isVisible={showFullscreenOverlay && !showScreenShareOverlay}
                countdownSeconds={15}
                exitCount={fullscreenExitCount}
                onCountdownComplete={handleFullscreenCountdownComplete}
                onReenterFullscreen={handleFullscreenReenter}
            />

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
                    {connectionError && (
                        <div className={styles.connectionError} title={connectionError}>
                            {connectionError}
                        </div>
                    )}
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
                        disabled={isRunning || !isConnected}
                        title={!isConnected ? 'Connecting to server...' : undefined}
                    >
                        {isRunning ? <Loader2 className={styles.spinner} size={14} /> : <Play size={14} />}
                        {!isConnected ? 'Connecting...' : 'Run Tests'}
                    </button>
                    <button
                        onClick={handleResetCode}
                        className="btn btn-outline btn-sm"
                        disabled={!isConnected || isSubmitting}
                        title="Reset all files to starter code"
                        style={{ color: 'var(--text-muted)' }}
                    >
                        <RotateCcw size={14} />
                        Reset
                    </button>
                    {isReactMode && (
                        <PreviewToggle mode={previewMode} onChange={setPreviewMode} />
                    )}
                    {isReactMode && (
                        <DocsToggle isActive={showDocs} onClick={() => setShowDocs(d => !d)} />
                    )}
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

                    {/* Resize Handle */}
                    <div
                        className={styles.resizeHandle}
                        onMouseDown={handleOutputResizeStart}
                        title="Drag to resize"
                    >
                        <GripHorizontal size={14} />
                    </div>

                    {/* Test Output Panel */}
                    <div
                        className={`${styles.outputPanel} ${isOutputCollapsed ? styles.outputCollapsed : ''}`}
                        style={isOutputCollapsed ? undefined : { height: outputHeight }}
                    >
                        <div className={styles.outputHeader}>
                            <div className={styles.outputHeaderLeft}>
                                <span>TERMINAL</span>
                                {testOutput && !isRunning && (
                                    <span className={styles.outputBadge}>
                                        {testOutput.includes('✅') ? '✅ Passed' : testOutput.includes('⚠️') ? '⚠️ Issues' : ''}
                                    </span>
                                )}
                            </div>
                            <div className={styles.outputHeaderActions}>
                                <button
                                    onClick={handleRunTests}
                                    className={styles.outputBtn}
                                    disabled={isRunning || !isConnected}
                                    title={!isConnected ? 'Connecting to server...' : 'Run Tests'}
                                >
                                    {isRunning ? <Loader2 className={styles.spinner} size={12} /> : <Play size={12} />}
                                    {!isConnected ? 'Connecting...' : 'Run'}
                                </button>
                                <button
                                    className={styles.outputIconBtn}
                                    onClick={() => setIsOutputCollapsed(c => !c)}
                                    title={isOutputCollapsed ? 'Expand panel' : 'Collapse panel'}
                                >
                                    {isOutputCollapsed ? <Maximize2 size={12} /> : <Minus size={12} />}
                                </button>
                            </div>
                        </div>
                        {!isOutputCollapsed && (
                            <div className={styles.outputContent}>
                                {testDetails.length > 0 ? (
                                    <div className={styles.testResults}>
                                        {testDetails.map((t, i) => (
                                            <div key={i} className={`${styles.testCase} ${t.status === 'passed' ? styles.testPassed : styles.testFailed}`}>
                                                <div className={styles.testHeader}>
                                                    {t.status === 'passed' ? <CheckCircle size={14} /> : <XCircle size={14} />}
                                                    <span className={styles.testName}>{t.name}</span>
                                                </div>
                                                {t.status !== 'passed' && t.failureMessages && t.failureMessages.length > 0 && (
                                                    <pre className={styles.testFailure}>
                                                        {t.failureMessages.join('\n')}
                                                    </pre>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
                                        {testOutput}
                                    </pre>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* React Docs Panel */}
                {isReactMode && showDocs && (
                    <ReactDocsPanel onClose={() => setShowDocs(false)} />
                )}
            </div>

            {/* React Preview Panel */}
            {isReactMode && previewMode !== 'off' && (
                <ReactPreviewPanel
                    files={files}
                    mode={previewMode}
                    onClose={() => setPreviewMode('off')}
                />
            )}

            {/* Submit Confirmation Modal */}
            <ConfirmModal
                isOpen={showSubmitModal}
                onClose={() => setShowSubmitModal(false)}
                onConfirm={confirmSubmit}
                title="Submit Assessment"
                message="Are you sure you want to submit? Your code will be graded and this action cannot be undone."
                confirmText="Submit"
                cancelText="Cancel"
                variant="warning"
                isLoading={isSubmitting}
            />

            {/* Reset Code Confirmation Modal */}
            <ConfirmModal
                isOpen={showResetModal}
                onClose={() => setShowResetModal(false)}
                onConfirm={confirmReset}
                title="Reset Code"
                message="Reset all files to the original starter code? This will overwrite ALL your current changes. This cannot be undone."
                confirmText="Reset Code"
                cancelText="Keep My Code"
                variant="danger"
            />
        </div>
    );
}
