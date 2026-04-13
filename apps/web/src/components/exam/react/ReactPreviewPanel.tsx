'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { transform } from 'sucrase';
import { X, Maximize2, Minimize2, Monitor, Columns, RefreshCw } from 'lucide-react';
import styles from './ReactPreviewPanel.module.css';

interface FileTree {
    [path: string]: string;
}

interface ReactPreviewPanelProps {
    files: FileTree;
    mode: 'modal' | 'split';
    onClose: () => void;
}

// Transpile JSX/TSX to JS using Sucrase
function transpileCode(code: string, filename: string): { code: string; error: string | null } {
    try {
        // Only transform JSX (and TypeScript if needed), NOT imports
        // Use 'classic' JSX runtime which outputs React.createElement() calls
        // 'automatic' runtime generates import statements that break when inside try block
        const transforms: ('jsx' | 'typescript')[] = ['jsx'];
        if (filename.endsWith('.tsx') || filename.endsWith('.ts')) {
            transforms.push('typescript');
        }

        const result = transform(code, {
            transforms,
            jsxRuntime: 'classic',
            production: true,
        });

        return { code: result.code, error: null };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { code: '', error: message };
    }
}

// Strip import/export statements from code (they're handled by the template)
function stripImportsAndExports(code: string): string {
    // Remove import statements
    let cleaned = code.replace(/^import\s+.*?['"]\s*;?\s*$/gm, '');
    // Remove export default at the end
    cleaned = cleaned.replace(/^export\s+default\s+/gm, '');
    // Remove export { ... }
    cleaned = cleaned.replace(/^export\s*\{[^}]*\}\s*;?\s*$/gm, '');
    return cleaned;
}

// Generate the iframe HTML document
function generatePreviewHtml(files: FileTree): { html: string; error: string | null } {
    // Find the entry file (App.jsx, App.tsx, or main entry)
    const entryFiles = ['src/App.jsx', 'src/App.tsx', 'App.jsx', 'App.tsx'];
    let entryFile = entryFiles.find(f => files[f]);

    // Also check for TodoList.jsx (common in challenges)
    if (!entryFile) {
        const todoFile = Object.keys(files).find(f =>
            f.includes('TodoList') && (f.endsWith('.jsx') || f.endsWith('.tsx'))
        );
        if (todoFile) entryFile = todoFile;
    }

    if (!entryFile) {
        // Check for any .jsx or .tsx file
        entryFile = Object.keys(files).find(f => f.endsWith('.jsx') || f.endsWith('.tsx'));
    }

    if (!entryFile) {
        return { html: '', error: 'No React component file found (App.jsx or similar)' };
    }

    // Transpile the entry file
    const { code: transpiledCode, error } = transpileCode(files[entryFile], entryFile);
    if (error) {
        return { html: '', error: `Transpilation error: ${error}` };
    }

    // Strip imports/exports from user code (template provides React, hooks, jsx-runtime)
    const cleanedCode = stripImportsAndExports(transpiledCode);

    // Find and include CSS
    const cssFiles = Object.keys(files).filter(f => f.endsWith('.css'));
    const cssContent = cssFiles.map(f => files[f]).join('\n');

    // Build the HTML document with ESM-compatible code
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>React Preview</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; }
    #root { min-height: 100vh; }
    ${cssContent}
  </style>
  <script type="importmap">
  {
    "imports": {
      "react": "https://esm.sh/react@18.2.0",
      "react-dom": "https://esm.sh/react-dom@18.2.0",
      "react-dom/client": "https://esm.sh/react-dom@18.2.0/client"
    }
  }
  </script>
</head>
<body>
  <div id="root"></div>
  <script type="module">
    import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
    import { createRoot } from 'react-dom/client';
    
    // Error boundary for catching runtime errors
    class ErrorBoundary extends React.Component {
      constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
      }
      static getDerivedStateFromError(error) {
        return { hasError: true, error };
      }
      render() {
        if (this.state.hasError) {
          return React.createElement('div', {
            style: {
              padding: '20px',
              background: '#ffebee',
              color: '#c62828',
              borderRadius: '8px',
              margin: '20px',
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap'
            }
          }, '❌ Runtime Error:\\n' + (this.state.error?.message || String(this.state.error)));
        }
        return this.props.children;
      }
    }
    
    try {
      // User component definition (transpiled to React.createElement calls)
      ${cleanedCode}
      
      // Get the default export (the component)
      const App = typeof TodoList !== 'undefined' ? TodoList : 
                  typeof Counter !== 'undefined' ? Counter :
                  typeof KanbanBoard !== 'undefined' ? KanbanBoard : null;
      
      if (!App) {
        throw new Error('No component found. Make sure your component function is named TodoList, Counter, or KanbanBoard.');
      }
      
      const root = createRoot(document.getElementById('root'));
      root.render(
        React.createElement(ErrorBoundary, null,
          React.createElement(App)
        )
      );
    } catch (err) {
      document.getElementById('root').innerHTML = \`
        <div style="padding: 20px; background: #ffebee; color: #c62828; border-radius: 8px; margin: 20px; font-family: monospace; white-space: pre-wrap;">
          ❌ Error: \${err.message}
        </div>
      \`;
      console.error(err);
    }
  </script>
</body>
</html>`;

    return { html, error: null };
}

export function ReactPreviewPanel({ files, mode, onClose }: ReactPreviewPanelProps) {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [error, setError] = useState<string | null>(null);
    const [isMaximized, setIsMaximized] = useState(false);
    const [key, setKey] = useState(0); // For forcing refresh

    // Debounced preview generation
    const previewHtml = useMemo(() => {
        const result = generatePreviewHtml(files);
        if (result.error) {
            setError(result.error);
            return null;
        }
        setError(null);
        return result.html;
    }, [files]);

    // Update iframe when preview changes
    useEffect(() => {
        if (iframeRef.current && previewHtml) {
            iframeRef.current.srcdoc = previewHtml;
        }
    }, [previewHtml, key]);

    const handleRefresh = useCallback(() => {
        setKey(k => k + 1);
    }, []);

    const containerClass = mode === 'modal'
        ? `${styles.container} ${styles.modal} ${isMaximized ? styles.maximized : ''}`
        : `${styles.container} ${styles.split}`;

    return (
        <div className={containerClass}>
            {/* Header */}
            <div className={styles.header}>
                <div className={styles.title}>
                    <Monitor size={16} />
                    <span>Preview</span>
                </div>
                <div className={styles.actions}>
                    <button
                        className={styles.actionBtn}
                        onClick={handleRefresh}
                        title="Refresh preview"
                    >
                        <RefreshCw size={14} />
                    </button>
                    {mode === 'modal' && (
                        <button
                            className={styles.actionBtn}
                            onClick={() => setIsMaximized(!isMaximized)}
                            title={isMaximized ? 'Minimize' : 'Maximize'}
                        >
                            {isMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                        </button>
                    )}
                    <button
                        className={styles.actionBtn}
                        onClick={onClose}
                        title="Close preview"
                    >
                        <X size={14} />
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className={styles.content}>
                {error ? (
                    <div className={styles.error}>
                        <div className={styles.errorTitle}>❌ Preview Error</div>
                        <pre className={styles.errorMessage}>{error}</pre>
                    </div>
                ) : (
                    <iframe
                        ref={iframeRef}
                        key={key}
                        className={styles.iframe}
                        sandbox="allow-scripts allow-same-origin"
                        title="React Preview"
                    />
                )}
            </div>
        </div>
    );
}

// Preview mode toggle component
interface PreviewToggleProps {
    mode: 'off' | 'modal' | 'split';
    onChange: (mode: 'off' | 'modal' | 'split') => void;
}

export function PreviewToggle({ mode, onChange }: PreviewToggleProps) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className={styles.toggleContainer}>
            <button
                className={`${styles.toggleBtn} ${mode !== 'off' ? styles.active : ''}`}
                onClick={() => setIsOpen(!isOpen)}
            >
                <Monitor size={14} />
                <span>Preview</span>
                <span className={styles.caret}>▾</span>
            </button>

            {isOpen && (
                <div className={styles.dropdown}>
                    <button
                        className={`${styles.dropdownItem} ${mode === 'modal' ? styles.selected : ''}`}
                        onClick={() => { onChange('modal'); setIsOpen(false); }}
                    >
                        <Maximize2 size={14} />
                        Modal
                    </button>
                    <button
                        className={`${styles.dropdownItem} ${mode === 'split' ? styles.selected : ''}`}
                        onClick={() => { onChange('split'); setIsOpen(false); }}
                    >
                        <Columns size={14} />
                        Split Screen
                    </button>
                    {mode !== 'off' && (
                        <>
                            <div className={styles.divider} />
                            <button
                                className={styles.dropdownItem}
                                onClick={() => { onChange('off'); setIsOpen(false); }}
                            >
                                <X size={14} />
                                Close Preview
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

export default ReactPreviewPanel;
