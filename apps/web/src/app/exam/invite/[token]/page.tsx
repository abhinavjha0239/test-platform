'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/lib/auth-store';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/hooks';
import { 
    Code2, Clock, FileText, CheckCircle, XCircle, 
    AlertTriangle, Loader2, LogIn
} from 'lucide-react';
import { ExamCountdown, useExamScheduleStatus } from '@/components/ExamCountdown';
import styles from './invite.module.css';

interface InvitationData {
    token: string;
    email: string;
    exam: {
        id: string;
        title: string;
        description?: string;
        timeLimit: number;
        scheduledStartAt?: string | null;
        scheduledEndAt?: string | null;
        timezone?: string;
    };
    expiresAt?: string;
    usedAt?: string;
}

export default function InvitePage() {
    const router = useRouter();
    const params = useParams();
    const token = params.token as string;
    const { user, checkAuth } = useAuthStore();
    const [authChecked, setAuthChecked] = useState(false);

    // Check auth on mount
    useEffect(() => {
        checkAuth().finally(() => setAuthChecked(true));
    }, [checkAuth]);

    // Fetch invitation data
    const { data: invitation, isLoading, error } = useQuery<InvitationData>(
        () => api.getInvitation(token),
        { enabled: !!token }
    );

    // Accept invitation mutation
    const acceptMutation = useMutation(
        () => api.acceptInvitation(token),
        {
            onSuccess: (data) => {
                router.push(`/exam/${data.data.attemptId}`);
            },
        }
    );

    // Handle login redirect
    const handleLogin = () => {
        // Store return URL in session storage
        sessionStorage.setItem('returnUrl', `/exam/invite/${token}`);
        router.push('/login');
    };

    // Check for return after login
    useEffect(() => {
        if (user && authChecked) {
            const returnUrl = sessionStorage.getItem('returnUrl');
            if (returnUrl === `/exam/invite/${token}`) {
                sessionStorage.removeItem('returnUrl');
            }
        }
    }, [user, authChecked, token]);

    // Loading state
    if (isLoading || !authChecked) {
        return (
            <div className={styles.container}>
                <div className={styles.loading}>
                    <Loader2 size={40} className={styles.spinner} />
                    <span>Loading invitation...</span>
                </div>
            </div>
        );
    }

    // Error state
    if (error || !invitation) {
        const isExpired = error?.message?.includes('expired');
        return (
            <div className={styles.container}>
                <div className={styles.card}>
                    <div className={styles.errorIcon}>
                        {isExpired ? <AlertTriangle size={64} /> : <XCircle size={64} />}
                    </div>
                    <h1>{isExpired ? 'Invitation Expired' : 'Invalid Invitation'}</h1>
                    <p className={styles.errorMessage}>
                        {isExpired 
                            ? 'This invitation has expired. Please contact the exam administrator for a new invitation.'
                            : 'This invitation link is invalid or has already been used.'
                        }
                    </p>
                    <Link href="/" className="btn btn-primary">
                        Go Home
                    </Link>
                </div>
            </div>
        );
    }

    // Already used
    if (invitation.usedAt) {
        return (
            <div className={styles.container}>
                <div className={styles.card}>
                    <div className={styles.infoIcon}>
                        <CheckCircle size={64} />
                    </div>
                    <h1>Already Accepted</h1>
                    <p className={styles.message}>
                        You've already accepted this invitation. Go to your dashboard to continue.
                    </p>
                    <Link href="/dashboard" className="btn btn-primary">
                        Go to Dashboard
                    </Link>
                </div>
            </div>
        );
    }

    // Not logged in
    if (!user) {
        return (
            <div className={styles.container}>
                <div className={styles.card}>
                    <div className={styles.logo}>
                        <Code2 size={40} />
                    </div>
                    <h1>You're Invited!</h1>
                    
                    <div className={styles.examInfo}>
                        <h2>{invitation.exam.title}</h2>
                        {invitation.exam.description && (
                            <p className={styles.description}>{invitation.exam.description}</p>
                        )}
                        <div className={styles.meta}>
                            <span><Clock size={16} /> {invitation.exam.timeLimit} minutes</span>
                        </div>
                    </div>

                    <div className={styles.loginPrompt}>
                        <AlertTriangle size={20} />
                        <p>Please log in or create an account to take this exam.</p>
                    </div>

                    <div className={styles.actions}>
                        <button onClick={handleLogin} className="btn btn-primary">
                            <LogIn size={16} /> Log In
                        </button>
                        <Link href="/register" className="btn btn-secondary">
                            Create Account
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    // Get schedule status
    const scheduleStatus = useExamScheduleStatus(
        invitation.exam.scheduledStartAt || null,
        invitation.exam.scheduledEndAt || null
    );

    const isExamEnded = scheduleStatus === 'ended';
    const isBeforeStart = scheduleStatus === 'before_start';
    const canStartExam = !isExamEnded && !isBeforeStart;

    // Logged in - show accept button
    return (
        <div className={styles.container}>
            <div className={styles.card}>
                <div className={styles.logo}>
                    <Code2 size={40} />
                </div>
                <h1>You're Invited!</h1>
                
                <div className={styles.examInfo}>
                    <h2>{invitation.exam.title}</h2>
                    {invitation.exam.description && (
                        <p className={styles.description}>{invitation.exam.description}</p>
                    )}
                    <div className={styles.meta}>
                        <span><Clock size={16} /> {invitation.exam.timeLimit} minutes</span>
                        <span><FileText size={16} /> Coding Challenge</span>
                    </div>
                </div>

                {/* Show exam schedule countdown */}
                <ExamCountdown
                    scheduledStartAt={invitation.exam.scheduledStartAt || null}
                    scheduledEndAt={invitation.exam.scheduledEndAt || null}
                    timezone={invitation.exam.timezone || 'Asia/Kolkata'}
                />

                <div className={styles.userInfo}>
                    <span>Logged in as:</span>
                    <strong>{user.email}</strong>
                </div>

                {invitation.expiresAt && (
                    <p className={styles.expires}>
                        This invitation expires on {new Date(invitation.expiresAt).toLocaleDateString()}
                    </p>
                )}

                {acceptMutation.error && (
                    <div className={styles.errorAlert}>
                        {acceptMutation.error.message}
                    </div>
                )}

                <button 
                    onClick={() => acceptMutation.mutate(undefined as never)}
                    className="btn btn-primary btn-lg"
                    disabled={acceptMutation.isLoading || !canStartExam}
                    title={isBeforeStart ? 'Exam has not started yet' : isExamEnded ? 'Exam has ended' : undefined}
                >
                    {acceptMutation.isLoading ? (
                        <>
                            <Loader2 size={20} className={styles.spinner} /> Starting...
                        </>
                    ) : isExamEnded ? (
                        'Exam Has Ended'
                    ) : isBeforeStart ? (
                        'Waiting for Exam to Start...'
                    ) : (
                        'Accept & Start Exam'
                    )}
                </button>

                <p className={styles.disclaimer}>
                    By clicking "Accept & Start Exam", you agree to the exam rules including 
                    proctoring, fullscreen mode, and paste restrictions.
                </p>
            </div>
        </div>
    );
}

