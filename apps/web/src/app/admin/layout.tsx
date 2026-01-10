'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { Loader2 } from 'lucide-react';

export default function AdminRootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const router = useRouter();
    const { user, checkAuth } = useAuthStore();

    useEffect(() => {
        checkAuth().then(() => {
            const currentUser = useAuthStore.getState().user;
            if (!currentUser) {
                router.push('/login');
            } else if (currentUser.role === 'CANDIDATE') {
                router.push('/dashboard');
            }
        });
    }, [checkAuth, router]);

    // Show loading while checking auth
    if (!user) {
        return (
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '100vh',
                gap: '12px',
                color: 'var(--text-muted)',
            }}>
                <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
                <span>Loading...</span>
            </div>
        );
    }

    // Redirect if candidate (only admins and reviewers can access)
    if (user.role === 'CANDIDATE') {
        return null;
    }

    return children;
}

