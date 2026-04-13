'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminLayout } from '@/components/admin';
import {
    InputField, TextareaField, SelectField,
    FormGroup, FormActions, CodeEditor, useToast
} from '@/components/ui';
import { useMutation } from '@/hooks';
import { api } from '@/lib/api';
import { Loader2 } from 'lucide-react';
import type { ChallengeRunner } from '@exam-platform/shared';
import styles from '../challenges.module.css';

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

const DEFAULT_STARTER_FILES = {
    'src/index.js': `const express = require('express');

const app = express();
app.use(express.json());

// In-memory storage (if needed)
let items = [];
let nextId = 1;

// TODO: Implement your routes here

module.exports = app;
`,
    'src/server.js': `const app = require('./index');

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(\`Server running on port \${PORT}\`);
});
`,
};

const DEFAULT_PUBLIC_TESTS = `const request = require('supertest');

let app;

// Test isolation - reload app before each test to reset state
beforeEach(() => {
    jest.resetModules();
    app = require('../src/index');
});

describe('API Tests - Public', () => {
    test('GET / should respond with 200', async () => {
        const res = await request(app).get('/');
        expect(res.status).toBe(200);
    });

    // Add more public tests here...
    // Tips:
    // - Use random data to prevent hardcoding: \`Title-\${Date.now()}\`
    // - Test actual behavior, not just status codes
    // - Verify created items appear in list responses
});
`;

const DEFAULT_HIDDEN_TESTS = `const request = require('supertest');

let app;

// Test isolation - reload app before each test to reset state
beforeEach(() => {
    jest.resetModules();
    app = require('../src/index');
});

describe('Hidden Tests', () => {
    // Use random data to prevent hardcoding
    test('API works with random data', async () => {
        const randomValue = \`Test-\${Date.now()}-\${Math.random().toString(36).slice(2)}\`;
        // Replace with actual test logic
        expect(randomValue).toBeDefined();
    });

    // Test defaults are set correctly
    test('Default values are applied', async () => {
        // Example: POST without optional field should set default
        expect(true).toBe(true);
    });

    // Test error handling
    test('Returns 404 for non-existent resource', async () => {
        const res = await request(app).get('/nonexistent/99999');
        expect(res.status).toBe(404);
    });

    // Test isolation - operations don't affect unrelated data
    test('Delete only affects target item', async () => {
        // Create multiple items, delete one, verify others remain
        expect(true).toBe(true);
    });

    // Add more hidden tests...
    // Tips:
    // - Test list endpoints return created items (prevents empty array forever)
    // - Verify updates persist to subsequent GET requests
    // - Test 404 for PUT/DELETE on non-existent resources
    // - Validate date/timestamp formats
});
`;

export default function NewChallengePage() {
    const router = useRouter();
    const toast = useToast();

    const [form, setForm] = useState<ChallengeFormData>({
        name: '',
        description: '',
        nodeVersion: '20',
        dependencies: {
            express: '^4.18.2',
            typescript: '^5.0.0',
            '@types/express': '^4.17.17',
            '@types/node': '^20.0.0',
            jest: '^29.0.0',
            '@types/jest': '^29.0.0',
            supertest: '^6.3.0',
            '@types/supertest': '^2.0.0',
            'ts-jest': '^29.0.0',
        },
        starterFiles: DEFAULT_STARTER_FILES,
        publicTests: DEFAULT_PUBLIC_TESTS,
        hiddenTests: DEFAULT_HIDDEN_TESTS,
        runner: undefined,
    });

    const [errors, setErrors] = useState<Partial<Record<keyof ChallengeFormData, string>>>({});
    const [dependenciesJson, setDependenciesJson] = useState(JSON.stringify(form.dependencies, null, 2));
    const [starterFilesJson, setStarterFilesJson] = useState(JSON.stringify(form.starterFiles, null, 2));
    const [runnerJson, setRunnerJson] = useState<string>(''); // optional
    const [runnerPreset, setRunnerPreset] = useState<string>('legacy');

    const createMutation = useMutation(
        (data: ChallengeFormData) => api.createChallenge(data),
        {
            onSuccess: () => {
                toast.success('Challenge created successfully');
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
                    // app.py should bind to 0.0.0.0 and use PORT env
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
                    // For Vite: make sure dev server binds 0.0.0.0 and uses PORT
                    generatedFiles: {
                        // Minimal Vite + React scaffold. You will still need appropriate starterFiles (index.html, src/main.jsx, etc.)
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
                    installCommand: 'npm install --legacy-peer-deps 2>&1',
                    runCommand: 'npm run dev -- --host 0.0.0.0 --port $PORT',
                    port: 3000,
                    healthPath: '/',
                    startupTimeoutMs: 45000,
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
                        // Starter: you still need a Vite scaffold in starterFiles/generatedFiles.
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

            // SQL Presets
            sql_readonly: {
                mode: 'sql',
                runtime: 'postgresql',
                database: {
                    setupScript: `CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE,
    age INT,
    created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO users (name, email, age) VALUES
    ('Alice', 'alice@test.com', 28),
    ('Bob', 'bob@test.com', 35),
    ('Charlie', 'charlie@test.com', 42),
    ('Diana', 'diana@test.com', 31),
    ('Eve', 'eve@test.com', 25);`,
                },
                sampleData: {
                    tables: {
                        users: {
                            columns: [
                                { name: 'id', type: 'INT' },
                                { name: 'name', type: 'VARCHAR(100)' },
                                { name: 'email', type: 'VARCHAR(255)' },
                                { name: 'age', type: 'INT' },
                            ],
                            rows: [
                                { id: 1, name: 'Alice', email: 'alice@test.com', age: 28 },
                                { id: 2, name: 'Bob', email: 'bob@test.com', age: 35 },
                                { id: 3, name: 'Charlie', email: 'charlie@test.com', age: 42 },
                            ],
                            truncated: true,
                        },
                    },
                },
                tests: {
                    isolation: 'shared',
                    orderSensitive: false,
                    columnOrderSensitive: false,
                    timeoutMs: 5000,
                },
                publicTests: [
                    {
                        name: 'Select all users',
                        expectedResult: [
                            { id: 1, name: 'Alice', email: 'alice@test.com', age: 28 },
                            { id: 2, name: 'Bob', email: 'bob@test.com', age: 35 },
                            { id: 3, name: 'Charlie', email: 'charlie@test.com', age: 42 },
                            { id: 4, name: 'Diana', email: 'diana@test.com', age: 31 },
                            { id: 5, name: 'Eve', email: 'eve@test.com', age: 25 },
                        ],
                    },
                ],
                hiddenTests: [
                    {
                        name: 'Filter by age > 30',
                        referenceQuery: 'SELECT * FROM users WHERE age > 30 ORDER BY id',
                    },
                ],
            } as unknown as ChallengeRunner,

            sql_write: {
                mode: 'sql',
                runtime: 'postgresql',
                database: {
                    setupScript: `CREATE TABLE tasks (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO tasks (title, completed) VALUES
    ('Learn SQL', FALSE),
    ('Practice queries', FALSE);`,
                    resetScript: 'TRUNCATE tasks RESTART IDENTITY CASCADE;',
                },
                sampleData: {
                    tables: {
                        tasks: {
                            columns: [
                                { name: 'id', type: 'INT' },
                                { name: 'title', type: 'VARCHAR(255)' },
                                { name: 'completed', type: 'BOOLEAN' },
                            ],
                            rows: [
                                { id: 1, title: 'Learn SQL', completed: false },
                                { id: 2, title: 'Practice queries', completed: false },
                            ],
                            truncated: false,
                        },
                    },
                },
                tests: {
                    isolation: 'isolated',
                    orderSensitive: false,
                    columnOrderSensitive: false,
                    timeoutMs: 10000,
                },
                publicTests: [
                    {
                        name: 'Insert a new task',
                        validationQuery: 'SELECT COUNT(*) as count FROM tasks',
                        expectedAfterMutation: [{ count: 3 }],
                    },
                ],
                hiddenTests: [
                    {
                        name: 'Insert with random data',
                        dataGenerator: {
                            table: 'tasks',
                            count: 5,
                            columns: {
                                title: "RANDOM_STRING(20)",
                                completed: "RANDOM_BOOL()",
                            },
                        },
                        referenceQuery: 'INSERT INTO tasks (title, completed) VALUES (\'New Task\', FALSE)',
                        validationQuery: 'SELECT COUNT(*) as count FROM tasks',
                    },
                ],
            } as unknown as ChallengeRunner,
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

            // Backwards compatible: omit runner if empty
            if (!runnerJson.trim()) {
                delete payload.runner;
            } else {
                payload.runner = JSON.parse(runnerJson);
            }

            createMutation.mutate(payload);
        }
    };

    return (
        <AdminLayout
            title="Create Challenge"
            breadcrumbs={[
                { label: 'Dashboard', href: '/admin' },
                { label: 'Challenges', href: '/admin/challenges' },
                { label: 'Create' },
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
                                { value: 'sql_readonly', label: 'SQL (PostgreSQL Read-Only)' },
                                { value: 'sql_write', label: 'SQL (PostgreSQL Write/Mutate)' },
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
                        disabled={createMutation.isLoading}
                    >
                        {createMutation.isLoading ? (
                            <>
                                <Loader2 size={16} className="spinner" /> Creating...
                            </>
                        ) : (
                            'Create Challenge'
                        )}
                    </button>
                </FormActions>
            </form>
        </AdminLayout>
    );
}

