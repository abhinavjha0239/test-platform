'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/lib/auth-store';
import { Code2, Loader2 } from 'lucide-react';
import styles from './auth.module.css';

export default function LoginPage() {
    const router = useRouter();
    const { login, isLoading, error, clearError, user, checkAuth } = useAuthStore();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    // Redirect if already logged in
    useEffect(() => {
        checkAuth().then(() => {
            const currentUser = useAuthStore.getState().user;
            if (currentUser) {
                redirectAfterLogin(currentUser.role);
            }
        });
    }, []);

    const redirectAfterLogin = (role: string) => {
        // Check for return URL first (e.g., from invitation)
        const returnUrl = sessionStorage.getItem('returnUrl');
        if (returnUrl) {
            sessionStorage.removeItem('returnUrl');
            router.push(returnUrl);
            return;
        }

        // Role-based redirect - Admins and Reviewers go to admin panel
        router.push(role === 'CANDIDATE' ? '/dashboard' : '/admin');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        clearError();

        try {
            await login(email, password);
            // Get user from store after login
            const loggedInUser = useAuthStore.getState().user;
            if (loggedInUser) {
                redirectAfterLogin(loggedInUser.role);
            }
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

                <h1 className={styles.title}>Welcome back</h1>
                <p className={styles.subtitle}>Sign in to your account</p>

                {error && (
                    <div className={styles.error}>{error}</div>
                )}

                <form onSubmit={handleSubmit} className={styles.form}>
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
                        />
                    </div>

                    <button type="submit" className="btn btn-primary" disabled={isLoading} style={{ width: '100%' }}>
                        {isLoading ? <Loader2 className={styles.spinner} size={20} /> : 'Sign In'}
                    </button>
                </form>

                <p className={styles.footer}>
                    Don't have an account? <Link href="/register">Sign up</Link>
                </p>
            </div>
        </div>
    );
}
