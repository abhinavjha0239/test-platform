'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/lib/auth-store';
import { Code2, Shield, Clock, Users, ChevronRight } from 'lucide-react';
import styles from './page.module.css';

export default function HomePage() {
    const { user, checkAuth } = useAuthStore();
    const router = useRouter();

    useEffect(() => {
        checkAuth();
    }, [checkAuth]);

    useEffect(() => {
        if (user) {
            // Admins and Reviewers go to admin panel, Candidates go to dashboard
            router.push(user.role === 'CANDIDATE' ? '/dashboard' : '/admin');
        }
    }, [user, router]);

    return (
        <div className={styles.container}>
            {/* Header */}
            <header className={styles.header}>
                <div className={styles.logo}>
                    <Code2 size={28} />
                    <span>ExamPlatform</span>
                </div>
                <nav className={styles.nav}>
                    <Link href="/login" className="btn btn-secondary">Login</Link>
                    <Link href="/register" className="btn btn-primary">Get Started</Link>
                </nav>
            </header>

            {/* Hero */}
            <section className={styles.hero}>
                <h1 className={styles.heroTitle}>
                    <span className={styles.gradient}>Node/Express</span> Skills Assessment
                </h1>
                <p className={styles.heroSubtitle}>
                    Fair, secure, and cheat-resistant online coding exams with real-time proctoring
                </p>
                <div className={styles.heroCta}>
                    <Link href="/register" className="btn btn-primary" style={{ padding: '14px 32px', fontSize: '16px' }}>
                        Start Free Trial <ChevronRight size={20} />
                    </Link>
                </div>
            </section>

            {/* Features */}
            <section className={styles.features}>
                <div className={styles.feature}>
                    <div className={styles.featureIcon}>
                        <Shield size={32} />
                    </div>
                    <h3>Cheat-Resistant</h3>
                    <p>Tab switching detection, fullscreen monitoring, and paste protection</p>
                </div>
                <div className={styles.feature}>
                    <div className={styles.featureIcon}>
                        <Code2 size={32} />
                    </div>
                    <h3>Real Coding Tests</h3>
                    <p>Express.js API challenges with hidden tests and randomized inputs</p>
                </div>
                <div className={styles.feature}>
                    <div className={styles.featureIcon}>
                        <Clock size={32} />
                    </div>
                    <h3>Fast Grading</h3>
                    <p>Docker-isolated test execution with results in seconds</p>
                </div>
                <div className={styles.feature}>
                    <div className={styles.featureIcon}>
                        <Users size={32} />
                    </div>
                    <h3>Detailed Reports</h3>
                    <p>Comprehensive scoring and integrity reports for reviewers</p>
                </div>
            </section>

            {/* Footer */}
            <footer className={styles.footer}>
                <p>&copy; 2024 ExamPlatform. Built for fair technical assessments.</p>
            </footer>
        </div>
    );
}
