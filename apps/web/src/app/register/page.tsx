'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/lib/auth-store';
import { Code2, Loader2 } from 'lucide-react';
import styles from '../login/auth.module.css';

export default function RegisterPage() {
    const router = useRouter();
    const { register, isLoading, error, clearError } = useAuthStore();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState<'CANDIDATE' | 'ADMIN'>('CANDIDATE');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        clearError();

        try {
            await register(email, password, name, role);
            router.push(role === 'ADMIN' ? '/admin' : '/dashboard');
        } catch (err) {
            // Error handled by store
        }
    };

    return (
        <div className={styles.container}>
            <div className={styles.card}>
                <div className={styles.logo}>
                    <Code2 size={32} />
                    <span>ExamPlatform</span>
                </div>

                <h1 className={styles.title}>Create account</h1>
                <p className={styles.subtitle}>Start your assessment journey</p>

                {error && (
                    <div className={styles.error}>{error}</div>
                )}

                <form onSubmit={handleSubmit} className={styles.form}>
                    <div className={styles.field}>
                        <label htmlFor="name">Full Name</label>
                        <input
                            id="name"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="John Doe"
                        />
                    </div>

                    <div className={styles.field}>
                        <label htmlFor="email">Email</label>
                        <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            required
                        />
                    </div>

                    <div className={styles.field}>
                        <label htmlFor="password">Password</label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                            minLength={6}
                        />
                    </div>

                    <div className={styles.field}>
                        <label htmlFor="role">I am a</label>
                        <select id="role" value={role} onChange={(e) => setRole(e.target.value as any)}>
                            <option value="CANDIDATE">Candidate (taking exams)</option>
                            <option value="ADMIN">Admin (creating exams)</option>
                        </select>
                    </div>

                    <button type="submit" className="btn btn-primary" disabled={isLoading} style={{ width: '100%' }}>
                        {isLoading ? <Loader2 className={styles.spinner} size={20} /> : 'Create Account'}
                    </button>
                </form>

                <p className={styles.footer}>
                    Already have an account? <Link href="/login">Sign in</Link>
                </p>
            </div>
        </div>
    );
}
