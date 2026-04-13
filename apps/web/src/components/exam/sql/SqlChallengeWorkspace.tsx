'use client';

import React, { useState } from 'react';
import Editor from '@monaco-editor/react';
import { SchemaExplorer } from './SchemaExplorer';
import { DiffViewer } from './DiffViewer';

interface TableData {
    columns: { name: string; type: string }[];
    rows: Record<string, any>[];
    truncated?: boolean;
}

interface PublicTest {
    name: string;
    expectedResult?: Record<string, any>[];
}

interface TestResult {
    name: string;
    passed: boolean;
    expected?: Record<string, any>[];
    actual?: Record<string, any>[];
    error?: string;
}

interface SqlChallengeWorkspaceProps {
    description: string;
    tables: Record<string, TableData>;
    publicTests: PublicTest[];
    files: Record<string, string>;
    onFileChange: (fileName: string, value: string) => void;
    onRun: (code: string) => Promise<TestResult[]>; // Still used, allows manual run
    onSubmit: (code: string) => Promise<void>;
    isRunning?: boolean;
    isConnected?: boolean;
    results?: TestResult[];
    logs?: string;
}

const styles = {
    container: {
        height: '100%',
        display: 'flex',
        flexDirection: 'column' as const,
        backgroundColor: '#1a1a1a',
        color: '#e0e0e0',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    },
    mainContent: {
        flex: 1,
        display: 'flex',
        overflow: 'hidden',
    },
    leftPanel: {
        display: 'flex',
        flexDirection: 'column' as const,
        borderRight: '1px solid #333',
        backgroundColor: '#1e1e1e',
    },
    resizeHandle: {
        width: '4px',
        cursor: 'col-resize',
        backgroundColor: '#333',
        transition: 'background-color 0.2s',
    },
    rightPanel: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column' as const,
        overflow: 'hidden',
    },
    tabs: {
        display: 'flex',
        borderBottom: '1px solid #333',
        backgroundColor: '#252525',
    },
    tab: {
        padding: '10px 16px',
        fontSize: '13px',
        fontWeight: 500,
        cursor: 'pointer',
        border: 'none',
        backgroundColor: 'transparent',
        color: '#888',
        borderBottom: '2px solid transparent',
        transition: 'all 0.2s',
    },
    tabActive: {
        color: '#fff',
        backgroundColor: '#1e1e1e',
        borderBottom: '2px solid #3b82f6',
    },
    content: {
        flex: 1,
        overflow: 'auto',
        padding: '16px',
    },
    editorContainer: {
        flex: 1,
        minHeight: '250px',
        display: 'flex',
        flexDirection: 'column' as const,
    },
    actionBar: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 12px',
        borderTop: '1px solid #333',
        borderBottom: '1px solid #333',
        backgroundColor: '#252525',
    },
    button: {
        padding: '6px 16px',
        fontSize: '13px',
        fontWeight: 500,
        borderRadius: '4px',
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        transition: 'all 0.2s',
    },
    runButton: {
        backgroundColor: '#374151',
        color: '#fff',
    },
    submitButton: {
        backgroundColor: '#22c55e',
        color: '#fff',
    },
    disabledButton: {
        opacity: 0.5,
        cursor: 'not-allowed',
    },
    bottomPanel: {
        height: '35%',
        minHeight: '150px',
        display: 'flex',
        flexDirection: 'column' as const,
        borderTop: '1px solid #333',
    },
    testItem: {
        padding: '12px 16px',
        borderBottom: '1px solid #333',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    testName: {
        fontSize: '13px',
        fontWeight: 500,
    },
    testMeta: {
        fontSize: '11px',
        color: '#888',
        marginTop: '4px',
    },
    passedIcon: {
        color: '#22c55e',
    },
    failedIcon: {
        color: '#ef4444',
    },
    viewDiffLink: {
        fontSize: '12px',
        color: '#3b82f6',
        cursor: 'pointer',
        background: 'none',
        border: 'none',
    },
    emptyState: {
        padding: '24px',
        textAlign: 'center' as const,
        color: '#666',
        fontSize: '13px',
    },
    description: {
        lineHeight: 1.6,
        fontSize: '14px',
    },
    heading1: {
        fontSize: '24px',
        fontWeight: 'bold',
        marginBottom: '16px',
        color: '#fff',
    },
    heading2: {
        fontSize: '18px',
        fontWeight: 600,
        marginTop: '24px',
        marginBottom: '12px',
        color: '#fff',
    },
    heading3: {
        fontSize: '15px',
        fontWeight: 500,
        marginTop: '16px',
        marginBottom: '8px',
        color: '#e0e0e0',
    },
    paragraph: {
        marginBottom: '12px',
    },
    console: {
        fontFamily: 'Consolas, Monaco, monospace',
        fontSize: '12px',
        whiteSpace: 'pre-wrap' as const,
        color: '#888',
    },
    statusBar: {
        marginLeft: 'auto',
        fontSize: '13px',
    },
    modal: {
        position: 'fixed' as const,
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        padding: '32px',
    },
    modalContent: {
        backgroundColor: '#1e1e1e',
        borderRadius: '8px',
        maxWidth: '900px',
        width: '100%',
        maxHeight: '80vh',
        overflow: 'auto',
    },
};

export function SqlChallengeWorkspace({
    description,
    tables,
    publicTests,
    files = {},
    onFileChange,
    onRun,
    onSubmit,
    isRunning = false,
    isConnected = true,
    results = [],
    logs = '',
}: SqlChallengeWorkspaceProps) {
    const [leftTab, setLeftTab] = useState<'description' | 'tables'>('description');
    const [rightTab, setRightTab] = useState<'testcases' | 'results' | 'console'>('testcases');
    const [selectedDiff, setSelectedDiff] = useState<TestResult | null>(null);
    const [leftWidth, setLeftWidth] = useState(40);

    // Active file state
    const [activeFile, setActiveFile] = useState<string>(() => {
        const keys = Object.keys(files).sort();
        return keys.length > 0 ? keys[0] : '';
    });

    // Ensure activeFile is valid when files change
    React.useEffect(() => {
        if (files && activeFile && !files[activeFile]) {
            const keys = Object.keys(files).sort();
            if (keys.length > 0) setActiveFile(keys[0]);
        } else if (files && !activeFile) {
            const keys = Object.keys(files).sort();
            if (keys.length > 0) setActiveFile(keys[0]);
        }
    }, [files, activeFile]);


    const handleRun = async () => {
        await onRun(files[activeFile] || '');
        setRightTab('results');
    };

    const handleSubmit = async () => {
        await onSubmit(files[activeFile] || '');
        setRightTab('results');
    };

    const passedCount = results.filter((r) => r.passed).length;
    const totalCount = results.length;

    // Enhanced markdown renderer for LeetCode-style content
    const renderDescription = (text: string) => {
        const elements: React.ReactNode[] = [];
        const lines = text.split('\n');
        let i = 0;

        while (i < lines.length) {
            const line = lines[i];

            // Table detection
            if (line.trim().startsWith('|') && line.includes('|')) {
                const tableRows: string[][] = [];
                let j = i;
                while (j < lines.length && lines[j].trim().startsWith('|')) {
                    const row = lines[j]
                        .split('|')
                        .filter((cell, idx, arr) => idx > 0 && idx < arr.length - 1)
                        .map(cell => cell.trim());
                    // Skip separator row (contains ---)
                    if (!row.every(cell => /^-+$/.test(cell) || /^:?-+:?$/.test(cell))) {
                        tableRows.push(row);
                    }
                    j++;
                }
                if (tableRows.length > 0) {
                    const headers = tableRows[0];
                    const data = tableRows.slice(1);
                    elements.push(
                        <table key={`table-${i}`} style={{
                            borderCollapse: 'collapse',
                            margin: '12px 0',
                            fontSize: '13px',
                            width: '100%',
                        }}>
                            <thead>
                                <tr>
                                    {headers.map((h, hi) => (
                                        <th key={hi} style={{
                                            border: '1px solid #444',
                                            padding: '8px 12px',
                                            backgroundColor: '#2a2a2a',
                                            fontWeight: 600,
                                            textAlign: 'left',
                                        }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {data.map((row, ri) => (
                                    <tr key={ri}>
                                        {row.map((cell, ci) => (
                                            <td key={ci} style={{
                                                border: '1px solid #444',
                                                padding: '8px 12px',
                                            }}>{cell}</td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    );
                }
                i = j;
                continue;
            }

            // Headings
            if (line.startsWith('## ')) {
                elements.push(<h2 key={i} style={styles.heading2}>{line.slice(3)}</h2>);
            } else if (line.startsWith('### ')) {
                elements.push(<h3 key={i} style={styles.heading3}>{line.slice(4)}</h3>);
            } else if (line.startsWith('# ')) {
                elements.push(<h1 key={i} style={styles.heading1}>{line.slice(2)}</h1>);
            } else if (line.startsWith('**') && line.endsWith('**')) {
                // Bold line
                elements.push(<p key={i} style={{ ...styles.paragraph, fontWeight: 600 }}>{line.slice(2, -2)}</p>);
            } else if (line.trim() === '') {
                elements.push(<div key={i} style={{ height: '8px' }} />);
            } else {
                // Regular paragraph with inline formatting
                const formatted = line
                    .replace(/`([^`]+)`/g, '<code>$1</code>')
                    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
                elements.push(
                    <p key={i} style={styles.paragraph} dangerouslySetInnerHTML={{ __html: formatted }} />
                );
            }
            i++;
        }
        return elements;
    };

    return (
        <div style={styles.container}>
            <div style={styles.mainContent}>
                {/* Left Panel */}
                <div style={{ ...styles.leftPanel, width: `${leftWidth}%` }}>
                    {/* Left Tabs */}
                    <div style={styles.tabs}>
                        <button
                            onClick={() => setLeftTab('description')}
                            style={{
                                ...styles.tab,
                                ...(leftTab === 'description' ? styles.tabActive : {}),
                            }}
                        >
                            Description
                        </button>
                        <button
                            onClick={() => setLeftTab('tables')}
                            style={{
                                ...styles.tab,
                                ...(leftTab === 'tables' ? styles.tabActive : {}),
                            }}
                        >
                            Tables
                        </button>
                    </div>

                    {/* Left Content */}
                    <div style={styles.content}>
                        {leftTab === 'description' ? (
                            <div style={styles.description}>
                                {renderDescription(description)}
                            </div>
                        ) : (
                            <SchemaExplorer tables={tables} viewMode="list" />
                        )}
                    </div>
                </div>

                {/* Resize Handle */}
                <div
                    style={styles.resizeHandle}
                    onMouseDown={(e) => {
                        const startX = e.clientX;
                        const startWidth = leftWidth;
                        const handleMouseMove = (moveEvent: MouseEvent) => {
                            const container = e.currentTarget.parentElement;
                            if (container) {
                                const containerWidth = container.clientWidth;
                                const delta = moveEvent.clientX - startX;
                                const newWidth = startWidth + (delta / containerWidth) * 100;
                                setLeftWidth(Math.max(20, Math.min(60, newWidth)));
                            }
                        };
                        const handleMouseUp = () => {
                            document.removeEventListener('mousemove', handleMouseMove);
                            document.removeEventListener('mouseup', handleMouseUp);
                        };
                        document.addEventListener('mousemove', handleMouseMove);
                        document.addEventListener('mouseup', handleMouseUp);
                    }}
                />

                {/* Right Panel */}
                <div style={styles.rightPanel}>
                    {/* SQL Editor */}
                    <div style={styles.editorContainer}>
                        {/* File Tabs */}
                        <div style={{ ...styles.tabs, overflowX: 'auto', flexShrink: 0 }}>
                            {Object.keys(files || {}).sort().map((fileName) => (
                                <button
                                    key={fileName}
                                    onClick={() => setActiveFile(fileName)}
                                    style={{
                                        ...styles.tab,
                                        ...(activeFile === fileName ? styles.tabActive : {}),
                                        whiteSpace: 'nowrap'
                                    }}
                                >
                                    {fileName}
                                </button>
                            ))}
                        </div>

                        <Editor
                            height="100%"
                            language="sql"
                            theme="vs-dark"
                            value={files[activeFile] || ''}
                            onChange={(value) => onFileChange(activeFile, value || '')}
                            options={{
                                fontSize: 14,
                                fontFamily: 'Consolas, Monaco, monospace',
                                minimap: { enabled: false },
                                scrollBeyondLastLine: false,
                                automaticLayout: true,
                                tabSize: 2,
                                lineNumbers: 'on',
                                padding: { top: 16 },
                            }}
                        />
                    </div>

                    {/* Action Buttons */}
                    <div style={styles.actionBar}>
                        <button
                            onClick={handleRun}
                            disabled={isRunning || !isConnected}
                            title={!isConnected ? 'Connecting to server...' : undefined}
                            style={{
                                ...styles.button,
                                ...styles.runButton,
                                ...((isRunning || !isConnected) ? styles.disabledButton : {}),
                            }}
                        >
                            {!isConnected ? '⏳ Connecting...' : isRunning ? '⏳ Running...' : '▶ Run'}
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={isRunning || !isConnected}
                            title={!isConnected ? 'Connecting to server...' : undefined}
                            style={{
                                ...styles.button,
                                ...styles.submitButton,
                                ...((isRunning || !isConnected) ? styles.disabledButton : {}),
                            }}
                        >
                            📤 Submit
                        </button>
                        {results.length > 0 && (
                            <span style={styles.statusBar}>
                                {passedCount === totalCount ? (
                                    <span style={styles.passedIcon}>✅ All tests passed!</span>
                                ) : (
                                    <span style={{ color: '#eab308' }}>
                                        {passedCount}/{totalCount} tests passed
                                    </span>
                                )}
                            </span>
                        )}
                    </div>

                    {/* Bottom Panel - Results */}
                    <div style={styles.bottomPanel}>
                        {/* Bottom Tabs */}
                        <div style={styles.tabs}>
                            <button
                                onClick={() => setRightTab('testcases')}
                                style={{
                                    ...styles.tab,
                                    ...(rightTab === 'testcases' ? styles.tabActive : {}),
                                }}
                            >
                                Testcases
                            </button>
                            <button
                                onClick={() => setRightTab('results')}
                                style={{
                                    ...styles.tab,
                                    ...(rightTab === 'results' ? styles.tabActive : {}),
                                }}
                            >
                                Results
                                {results.length > 0 && (
                                    <span style={{ marginLeft: '4px', fontSize: '11px' }}>
                                        ({passedCount}/{totalCount})
                                    </span>
                                )}
                            </button>
                            <button
                                onClick={() => setRightTab('console')}
                                style={{
                                    ...styles.tab,
                                    ...(rightTab === 'console' ? styles.tabActive : {}),
                                }}
                            >
                                Console
                            </button>
                        </div>

                        {/* Bottom Content */}
                        <div style={styles.content}>
                            {rightTab === 'testcases' && (
                                <div>
                                    {publicTests.length === 0 ? (
                                        <div style={styles.emptyState}>No test cases available</div>
                                    ) : (
                                        publicTests.map((test, i) => (
                                            <div key={i} style={styles.testItem}>
                                                <div>
                                                    <div style={styles.testName}>{test.name}</div>
                                                    {test.expectedResult && (
                                                        <div style={styles.testMeta}>
                                                            Expected: {test.expectedResult.length} rows
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}
                            {rightTab === 'results' && (
                                <div>
                                    {results.length === 0 ? (
                                        <div style={styles.emptyState}>Run your query to see results</div>
                                    ) : (
                                        results.map((result, i) => (
                                            <div key={i} style={styles.testItem}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={result.passed ? styles.passedIcon : styles.failedIcon}>
                                                        {result.passed ? '✅' : '❌'}
                                                    </span>
                                                    <span style={styles.testName}>{result.name}</span>
                                                </div>
                                                {!result.passed && result.expected && result.actual && (
                                                    <button
                                                        onClick={() => setSelectedDiff(result)}
                                                        style={styles.viewDiffLink}
                                                    >
                                                        View Diff
                                                    </button>
                                                )}
                                                {!result.passed && result.error && (
                                                    <span style={{ fontSize: '12px', color: '#ef4444' }}>
                                                        {result.error}
                                                    </span>
                                                )}
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}
                            {rightTab === 'console' && (
                                <pre style={styles.console}>{logs || 'No output'}</pre>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Diff Modal */}
            {selectedDiff && (
                <div style={styles.modal}>
                    <div style={styles.modalContent}>
                        <DiffViewer
                            expected={selectedDiff.expected || []}
                            actual={selectedDiff.actual || []}
                            testName={selectedDiff.name}
                            onClose={() => setSelectedDiff(null)}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

export default SqlChallengeWorkspace;
