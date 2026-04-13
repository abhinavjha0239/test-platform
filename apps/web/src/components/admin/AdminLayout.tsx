'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import {
    Code2, BarChart3, FileText, Users, LogOut,
    ChevronRight, Settings, Server, ClipboardList, PieChart, Radio
} from 'lucide-react';
import styles from './AdminLayout.module.css';

interface NavItem {
    href: string;
    label: string;
    icon: ReactNode;
}

const navItems: NavItem[] = [
    { href: '/admin', label: 'Dashboard', icon: <BarChart3 size={18} /> },
    { href: '/admin/attempts', label: 'Attempts', icon: <ClipboardList size={18} /> },
    { href: '/admin/exams', label: 'Exams', icon: <FileText size={18} /> },
    { href: '/admin/analytics', label: 'Analytics', icon: <PieChart size={18} /> },
    { href: '/admin/monitoring', label: 'Live Monitor', icon: <Radio size={18} /> },
    { href: '/admin/challenges', label: 'Challenges', icon: <Code2 size={18} /> },
    { href: '/admin/pool', label: 'Container Pool', icon: <Server size={18} /> },
];

interface BreadcrumbItem {
    label: string;
    href?: string;
}

interface AdminLayoutProps {
    children: ReactNode;
    title: string;
    breadcrumbs?: BreadcrumbItem[];
    actions?: ReactNode;
}

export function AdminLayout({ children, title, breadcrumbs, actions }: AdminLayoutProps) {
    const pathname = usePathname();
    const router = useRouter();
    const { user, logout } = useAuthStore();

    const handleLogout = () => {
        logout();
        router.push('/');
    };

    const isActive = (href: string) => {
        if (href === '/admin') {
            return pathname === '/admin';
        }
        return pathname.startsWith(href);
    };

    return (
        <div className={styles.layout}>
            {/* Sidebar */}
            <aside className={styles.sidebar}>
                <div className={styles.logo}>
                    <Code2 size={24} />
                    <span>ExamPlatform</span>
                </div>

                <nav className={styles.nav}>
                    {navItems.filter(item => {
                        if (user?.role === 'REVIEWER') {
                            // Reviewers see Dashboard, Attempts, and Exams (read-only)
                            return !['/admin/challenges', '/admin/pool'].includes(item.href);
                        }
                        return true;
                    }).map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`${styles.navItem} ${isActive(item.href) ? styles.navItemActive : ''}`}
                        >
                            {item.icon}
                            <span>{item.label}</span>
                        </Link>
                    ))}
                </nav>

                <div className={styles.sidebarFooter}>
                    <div className={styles.userInfo}>
                        <div className={styles.userAvatar}>
                            {(user?.name || user?.email || 'A').charAt(0).toUpperCase()}
                        </div>
                        <div className={styles.userDetails}>
                            <span className={styles.userName}>{user?.name || user?.email}</span>
                            <span className={styles.userRole}>{user?.role}</span>
                        </div>
                    </div>
                    <button onClick={handleLogout} className={styles.logoutBtn} title="Logout">
                        <LogOut size={16} />
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className={styles.main}>
                <header className={styles.header}>
                    <div className={styles.headerLeft}>
                        {breadcrumbs && breadcrumbs.length > 0 && (
                            <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
                                {breadcrumbs.map((crumb, index) => (
                                    <span key={index} className={styles.breadcrumbItem}>
                                        {crumb.href ? (
                                            <Link href={crumb.href}>{crumb.label}</Link>
                                        ) : (
                                            <span>{crumb.label}</span>
                                        )}
                                        {index < breadcrumbs.length - 1 && (
                                            <ChevronRight size={14} className={styles.breadcrumbSep} />
                                        )}
                                    </span>
                                ))}
                            </nav>
                        )}
                        <h1 className={styles.title}>{title}</h1>
                    </div>
                    {actions && (
                        <div className={styles.headerActions}>
                            {actions}
                        </div>
                    )}
                </header>

                <div className={styles.content}>
                    {children}
                </div>
            </main>
        </div>
    );
}


