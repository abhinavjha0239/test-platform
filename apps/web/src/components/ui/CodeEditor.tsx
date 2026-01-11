'use client';

import { memo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import styles from './CodeEditor.module.css';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
    ssr: false,
    loading: () => (
        <div className={styles.loading}>
            <Loader2 className={styles.spinner} size={24} />
            <span>Loading editor...</span>
        </div>
    ),
});

export interface CodeEditorProps {
    value: string;
    onChange?: (value: string) => void;
    language?: string;
    height?: string | number;
    readOnly?: boolean;
    label?: string;
    error?: string;
}

export const CodeEditor = memo(function CodeEditor({
    value,
    onChange,
    language = 'javascript',
    height = 300,
    readOnly = false,
    label,
    error,
}: CodeEditorProps) {
    const handleChange = useCallback((val: string | undefined) => {
        if (onChange && val !== undefined) {
            onChange(val);
        }
    }, [onChange]);

    return (
        <div className={styles.container}>
            {label && (
                <label className={styles.label}>{label}</label>
            )}
            <div 
                className={`${styles.editorWrapper} ${error ? styles.editorError : ''}`}
                style={{ height: typeof height === 'number' ? `${height}px` : height }}
            >
                <MonacoEditor
                    height="100%"
                    language={language}
                    theme="vs-dark"
                    value={value}
                    onChange={handleChange}
                    options={{
                        readOnly,
                        fontSize: 13,
                        fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        automaticLayout: true,
                        tabSize: 2,
                        wordWrap: 'on',
                        lineNumbers: 'on',
                        renderLineHighlight: 'line',
                        padding: { top: 12, bottom: 12 },
                    }}
                />
            </div>
            {error && (
                <span className={styles.error}>{error}</span>
            )}
        </div>
    );
});


