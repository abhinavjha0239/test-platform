import type { Metadata } from 'next';
import './globals.css';

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
            <body>{children}</body>
        </html>
    );
}
