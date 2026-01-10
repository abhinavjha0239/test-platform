import type { Metadata } from 'next';
import './globals.css';
import { ToastProvider } from '@/components/ui';

export const metadata: Metadata = {
    title: 'Exam Platform - Node/Express Skills Assessment',
    description: 'Fair, secure, and cheat-resistant online coding exams for Node.js and Express.js',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <body>
                <ToastProvider>
                    {children}
                </ToastProvider>
            </body>
        </html>
    );
}
