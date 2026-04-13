'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { AdminLayout } from '@/components/admin';
import { 
    InputField, TextareaField, SelectField, 
    FormGroup, FormActions, CodeEditor, Skeleton, useToast 
} from '@/components/ui';
import { useMutation, useQuery } from '@/hooks';
import { api } from '@/lib/api';
import { Loader2 } from 'lucide-react';
import type { ChallengeRunner } from '@exam-platform/shared';
import styles from '../../challenges.module.css';

interface ChallengeFormData {
    name: string;
    description: string;
    nodeVersion: string;
    dependencies: Record<string, string>;
    starterFiles: Record<string, string>;
    publicTests: string;
    hiddenTests: string;
    runner?: ChallengeRunner;
}

export default function EditChallengePage() {
    const router = useRouter();
    const params = useParams();
    const challengeId = params.id as string;
    const toast = useToast();

    const [form, setForm] = useState<ChallengeFormData>({
        name: '',
        description: '',
        nodeVersion: '20',
        dependencies: {},
        starterFiles: {},
        publicTests: '',
        hiddenTests: '',
        runner: undefined,
    });

    const [errors, setErrors] = useState<Partial<Record<keyof ChallengeFormData, string>>>({});
    const [dependenciesJson, setDependenciesJson] = useState('{}');
    const [starterFilesJson, setStarterFilesJson] = useState('{}');
    const [runnerJson, setRunnerJson] = useState<string>(''); // optional
    const [runnerPreset, setRunnerPreset] = useState<string>('legacy');

    const { data: challenge, isLoading } = useQuery(
        () => api.getChallenge(challengeId),
        { enabled: !!challengeId }
    );

    // Populate form when challenge loads
    useEffect(() => {
        if (challenge) {
            const deps = typeof challenge.dependencies === 'string' 
                ? JSON.parse(challenge.dependencies) 
                : challenge.dependencies || {};
            const files = typeof challenge.starterFiles === 'string'
                ? JSON.parse(challenge.starterFiles)
                : challenge.starterFiles || {};
            const runner = (challenge as any).runner || undefined;

            setForm({
                name: challenge.name || '',
                description: challenge.description || '',
                nodeVersion: challenge.nodeVersion || '20',
                dependencies: deps,
                starterFiles: files,
                publicTests: challenge.publicTests || '',
                hiddenTests: challenge.hiddenTests || '',
                runner,
            });
            setDependenciesJson(JSON.stringify(deps, null, 2));
            setStarterFilesJson(JSON.stringify(files, null, 2));
            setRunnerJson(runner ? JSON.stringify(runner, null, 2) : '');
            // Best-effort preset inference (so the dropdown stays aligned with the runner JSON)
            const inferredPreset = !runner?.mode
                ? 'legacy'
                : runner.mode === 'jest'
                    ? 'legacy'
                    : runner.mode === 'playwright'
                        ? 'react_playwright'
                        : runner.mode === 'ui_jsdom'
                            ? 'react_ui_jsdom'
                            : runner.mode === 'http'
                                ? (runner.runtime === 'python'
                                    ? 'backend_fastapi_http'
                                    : runner.runtime === 'go'
                                        ? 'backend_go_http'
                                        : 'backend_node_http')
                                : 'legacy';
            setRunnerPreset(inferredPreset);
        }
    }, [challenge]);

    const updateMutation = useMutation(
        (data: ChallengeFormData) => api.updateChallenge(challengeId, data),
        {
            onSuccess: () => {
                toast.success('Challenge updated successfully');
                router.push('/admin/challenges');
            },
            onError: (err) => {
                toast.error(err.message);
            },
        }
    );

    const updateField = <K extends keyof ChallengeFormData>(field: K, value: ChallengeFormData[K]) => {
        setForm((prev) => ({ ...prev, [field]: value }));
        if (errors[field]) {
            setErrors((prev) => ({ ...prev, [field]: undefined }));
        }
    };

    const handleDependenciesChange = (value: string) => {
        setDependenciesJson(value);
        try {
            const parsed = JSON.parse(value);
            updateField('dependencies', parsed);
        } catch {
            // Invalid JSON - will be caught in validation
        }
    };

    const handleStarterFilesChange = (value: string) => {
        setStarterFilesJson(value);
        try {
            const parsed = JSON.parse(value);
            updateField('starterFiles', parsed);
        } catch {
            // Invalid JSON - will be caught in validation
        }
    };

    const applyRunnerPreset = (preset: string) => {
        setRunnerPreset(preset);

        if (preset === 'legacy') {
            setRunnerJson('');
            updateField('runner', undefined);
            return;
        }

        const presets: Record<string, ChallengeRunner> = {
            backend_node_http: {
                mode: 'http',
                runtime: 'node',
                candidate: {
                    image: 'node:20-alpine',
                    workdir: '/app',
                    installCommand: 'npm install --legacy-peer-deps 2>&1',
                    runCommand: 'node src/server.js',
                    port: 3000,
                    healthPath: '/',
                    startupTimeoutMs: 30000,
                },
                tests: {
                    framework: 'jest',
                    image: 'node:20-alpine',
                    installCommand: 'npm install --legacy-peer-deps 2>&1',
                    testCommand: 'npm test 2>&1 || true',
                    timeoutMs: 120000,
                },
            },
            backend_fastapi_http: {
                mode: 'http',
                runtime: 'python',
                candidate: {
                    image: 'python:3.11-slim',
                    workdir: '/app',
                    generatedFiles: {
                        'requirements.txt': 'fastapi==0.115.5\nuvicorn==0.32.1\n',
                    },
                    installCommand: 'pip install -r requirements.txt',
                    runCommand: 'python -m uvicorn main:app --host 0.0.0.0 --port $PORT',
                    port: 3000,
                    healthPath: '/',
                    startupTimeoutMs: 30000,
                },
                tests: {
                    framework: 'jest',
                    image: 'node:20-alpine',
                    installCommand: 'npm install --legacy-peer-deps 2>&1',
                    testCommand: 'npm test 2>&1 || true',
                    timeoutMs: 120000,
                },
            },
            backend_flask_http: {
                mode: 'http',
                runtime: 'python',
                candidate: {
                    image: 'python:3.11-slim',
                    workdir: '/app',
                    generatedFiles: {
                        'requirements.txt': 'flask==3.0.3\n',
                    },
                    installCommand: 'pip install -r requirements.txt',
                    runCommand: 'python app.py',
                    port: 3000,
                    healthPath: '/',
                    startupTimeoutMs: 30000,
                },
                tests: {
                    framework: 'jest',
                    image: 'node:20-alpine',
                    installCommand: 'npm install --legacy-peer-deps 2>&1',
                    testCommand: 'npm test 2>&1 || true',
                    timeoutMs: 120000,
                },
            },
            backend_go_http: {
                mode: 'http',
                runtime: 'go',
                candidate: {
                    image: 'golang:1.22-alpine',
                    workdir: '/app',
                    installCommand: 'go build -o app .',
                    runCommand: './app',
                    port: 3000,
                    healthPath: '/',
                    startupTimeoutMs: 30000,
                },
                tests: {
                    framework: 'jest',
                    image: 'node:20-alpine',
                    installCommand: 'npm install --legacy-peer-deps 2>&1',
                    testCommand: 'npm test 2>&1 || true',
                    timeoutMs: 120000,
                },
            },
            react_playwright: {
                mode: 'playwright',
                runtime: 'react',
                candidate: {
                    image: 'node:20-alpine',
                    workdir: '/app',
                    installCommand: 'npm install --legacy-peer-deps 2>&1',
                    generatedFiles: {
                        'package.json': JSON.stringify({
                            name: 'candidate-react-app',
                            private: true,
                            scripts: {
                                dev: 'vite --host 0.0.0.0 --port $PORT',
                                build: 'vite build',
                                start: 'vite preview --host 0.0.0.0 --port $PORT',
                            },
                            dependencies: {
                                react: '^18.3.1',
                                'react-dom': '^18.3.1',
                            },
                            devDependencies: {
                                vite: '^5.4.10',
                                '@vitejs/plugin-react': '^4.3.3',
                            },
                        }, null, 2),
                    },
                    runCommand: 'npm run dev -- --host 0.0.0.0 --port $PORT',
                    port: 3000,
                    healthPath: '/',
                    startupTimeoutMs: 30000,
                },
                tests: {
                    framework: 'playwright',
                    image: 'mcr.microsoft.com/playwright:v1.57.0-jammy',
                    installCommand: 'npm install 2>&1',
                    testCommand: 'PLAYWRIGHT_JUNIT_OUTPUT_NAME=results.xml npx playwright test --reporter=junit 2>&1',
                    timeoutMs: 180000,
                },
            },
            react_ui_jsdom: {
                mode: 'ui_jsdom',
                runtime: 'react',
                candidate: {
                    image: 'node:20-alpine',
                    workdir: '/app',
                    generatedFiles: {
                        'package.json': JSON.stringify({
                            name: 'candidate-react-ui-jsdom',
                            private: true,
                            type: 'module',
                            scripts: {
                                dev: 'vite --host 0.0.0.0 --port $PORT',
                                build: 'vite build',
                            },
                            dependencies: {
                                react: '^18.3.1',
                                'react-dom': '^18.3.1',
                            },
                            devDependencies: {
                                vite: '^5.4.10',
                                '@vitejs/plugin-react': '^4.3.3',
                                jsdom: '^24.1.0',
                                '@testing-library/react': '^16.0.1',
                                '@testing-library/dom': '^10.4.0',
                                '@testing-library/user-event': '^14.5.2',
                            },
                        }, null, 2),
                        '.grader/ui-harness.cjs': `// ui_jsdom harness (placeholder)
// Replace with the full harness template from docs.
console.log('ui_jsdom harness placeholder');
require('http').createServer((req, res) => {
  if (req.url === '/health') return res.end('ok');
  res.statusCode = 404;
  res.end('not implemented');
}).listen(process.env.PORT || 3000, '0.0.0.0');
`,
                    },
                    installCommand: 'npm install --legacy-peer-deps 2>&1',
                    runCommand: 'node .grader/ui-harness.cjs',
                    port: 3000,
                    healthPath: '/health',
                    env: { APP_ENTRY: '/src/App.jsx' },
                    startupTimeoutMs: 45000,
                },
                tests: {
                    framework: 'vitest',
                    image: 'node:20-alpine',
                    installCommand: 'npm install --legacy-peer-deps 2>&1',
                    testCommand: 'npm test 2>&1',
                    timeoutMs: 180000,
                },
            },
        };

        const runner = presets[preset];
        if (runner) {
            setRunnerJson(JSON.stringify(runner, null, 2));
            updateField('runner', runner);
        }
    };

    const handleRunnerChange = (value: string) => {
        setRunnerJson(value);
        try {
            const parsed = JSON.parse(value);
            updateField('runner', parsed);
        } catch {
            // Invalid JSON - will be caught in validation
        }
    };

    const validate = (): boolean => {
        const newErrors: Partial<Record<keyof ChallengeFormData, string>> = {};

        if (!form.name.trim()) {
            newErrors.name = 'Name is required';
        }

        try {
            JSON.parse(dependenciesJson);
        } catch {
            newErrors.dependencies = 'Invalid JSON for dependencies';
        }

        try {
            JSON.parse(starterFilesJson);
        } catch {
            newErrors.starterFiles = 'Invalid JSON for starter files';
        }

        if (!form.publicTests.trim()) {
            newErrors.publicTests = 'Public tests are required';
        }

        if (!form.hiddenTests.trim()) {
            newErrors.hiddenTests = 'Hidden tests are required';
        }

        if (runnerJson.trim()) {
            try {
                JSON.parse(runnerJson);
            } catch {
                newErrors.runner = 'Invalid JSON for runner config';
            }
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (validate()) {
            const payload: any = {
                ...form,
                dependencies: JSON.parse(dependenciesJson),
                starterFiles: JSON.parse(starterFilesJson),
            };

            if (!runnerJson.trim()) {
                delete payload.runner;
            } else {
                payload.runner = JSON.parse(runnerJson);
            }

            updateMutation.mutate(payload);
        }
    };

    if (isLoading) {
        return (
            <AdminLayout
                title="Edit Challenge"
                breadcrumbs={[
                    { label: 'Dashboard', href: '/admin' },
                    { label: 'Challenges', href: '/admin/challenges' },
                    { label: 'Edit' },
                ]}
            >
                <div className={styles.formCard}>
                    <Skeleton height={24} width="40%" />
                    <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <Skeleton height={40} />
                        <Skeleton height={80} />
                        <Skeleton height={200} />
                    </div>
                </div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout
            title="Edit Challenge"
            breadcrumbs={[
                { label: 'Dashboard', href: '/admin' },
                { label: 'Challenges', href: '/admin/challenges' },
                { label: challenge?.name || 'Edit' },
            ]}
        >
            <form onSubmit={handleSubmit} className={styles.form}>
                <div className={styles.formCard}>
                    <h2 className={styles.formSection}>Basic Information</h2>
                    
                    <div className={styles.fieldGroup}>
                        <FormGroup columns={2}>
                            <InputField
                                label="Name"
                                value={form.name}
                                onChange={(e) => updateField('name', e.target.value)}
                                placeholder="e.g., Express Todo API"
                                error={errors.name}
                                required
                            />

                            <SelectField
                                label="Node Version"
                                value={form.nodeVersion}
                                onChange={(e) => updateField('nodeVersion', e.target.value)}
                                options={[
                                    { value: '18', label: 'Node 18 LTS' },
                                    { value: '20', label: 'Node 20 LTS' },
                                    { value: '22', label: 'Node 22' },
                                ]}
                                required
                            />
                        </FormGroup>

                        <TextareaField
                            label="Description"
                            value={form.description}
                            onChange={(e) => updateField('description', e.target.value)}
                            placeholder="Describe what candidates need to build..."
                            rows={3}
                        />
                    </div>
                </div>

                <div className={styles.formCard}>
                    <h2 className={styles.formSection}>Dependencies (package.json)</h2>
                    <CodeEditor
                        value={dependenciesJson}
                        onChange={handleDependenciesChange}
                        language="json"
                        height={200}
                        error={errors.dependencies}
                    />
                </div>

                <div className={styles.formCard}>
                    <h2 className={styles.formSection}>Starter Files</h2>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                        Define the initial files candidates will start with. Keys are file paths, values are file contents.
                    </p>
                    <CodeEditor
                        value={starterFilesJson}
                        onChange={handleStarterFilesChange}
                        language="json"
                        height={300}
                        error={errors.starterFiles}
                    />
                </div>

                <div className={styles.formCard}>
                    <h2 className={styles.formSection}>Runner (Optional - Multi-runtime / Secure)</h2>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                        Leave this empty for legacy Node/Jest challenges. Use a preset for secure multi-language backend (HTTP black-box)
                        or React UI (Playwright / jsdom).
                    </p>

                    <FormGroup columns={2}>
                        <SelectField
                            label="Runner Preset"
                            value={runnerPreset}
                            onChange={(e) => applyRunnerPreset(e.target.value)}
                            options={[
                                { value: 'legacy', label: 'Legacy (Node/Jest import tests)' },
                                { value: 'backend_node_http', label: 'Backend HTTP (Node/Express) - Secure' },
                                { value: 'backend_fastapi_http', label: 'Backend HTTP (FastAPI) - Secure' },
                                { value: 'backend_flask_http', label: 'Backend HTTP (Flask) - Secure' },
                                { value: 'backend_go_http', label: 'Backend HTTP (Go) - Secure' },
                                { value: 'react_playwright', label: 'React UI (Playwright E2E) - Secure' },
                                { value: 'react_ui_jsdom', label: 'React UI (jsdom + Vitest) - Secure (fast)' },
                            ]}
                        />
                    </FormGroup>

                    <CodeEditor
                        value={runnerJson}
                        onChange={handleRunnerChange}
                        language="json"
                        height={260}
                        error={errors.runner}
                    />
                </div>

                <div className={styles.formCard}>
                    <h2 className={styles.formSection}>Public Tests</h2>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                        These tests are visible to candidates. Use <code>jest.resetModules()</code> in <code>beforeEach</code> for test isolation.
                    </p>
                    <CodeEditor
                        value={form.publicTests}
                        onChange={(val) => updateField('publicTests', val)}
                        language="typescript"
                        height={300}
                        error={errors.publicTests}
                    />
                </div>

                <div className={styles.formCard}>
                    <h2 className={styles.formSection}>Hidden Tests</h2>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                        Server-only tests. Use random data to prevent hardcoding. Test list correctness, defaults, and 404 handling.
                    </p>
                    <CodeEditor
                        value={form.hiddenTests}
                        onChange={(val) => updateField('hiddenTests', val)}
                        language="typescript"
                        height={300}
                        error={errors.hiddenTests}
                    />
                </div>

                <FormActions>
                    <button
                        type="button"
                        onClick={() => router.push('/admin/challenges')}
                        className="btn btn-secondary"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={updateMutation.isLoading}
                    >
                        {updateMutation.isLoading ? (
                            <>
                                <Loader2 size={16} className="spinner" /> Saving...
                            </>
                        ) : (
                            'Save Changes'
                        )}
                    </button>
                </FormActions>
            </form>
        </AdminLayout>
    );
}

