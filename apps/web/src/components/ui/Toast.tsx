'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import styles from './Toast.module.css';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
    id: string;
    type: ToastType;
    message: string;
    duration?: number;
}

interface ToastContextValue {
    showToast: (type: ToastType, message: string, duration?: number) => void;
    success: (message: string) => void;
    error: (message: string) => void;
    warning: (message: string) => void;
    info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within ToastProvider');
    }
    return context;
}

const icons: Record<ToastType, ReactNode> = {
    success: <CheckCircle size={18} />,
    error: <XCircle size={18} />,
    warning: <AlertTriangle size={18} />,
    info: <Info size={18} />,
};

interface ToastProviderProps {
    children: ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const showToast = useCallback((type: ToastType, message: string, duration = 4000) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const toast: Toast = { id, type, message, duration };
        
        setToasts((prev) => [...prev, toast]);

        if (duration > 0) {
            setTimeout(() => removeToast(id), duration);
        }
    }, [removeToast]);

    const value: ToastContextValue = {
        showToast,
        success: (message) => showToast('success', message),
        error: (message) => showToast('error', message),
        warning: (message) => showToast('warning', message),
        info: (message) => showToast('info', message),
    };

    return (
        <ToastContext.Provider value={value}>
            {children}
            <div className={styles.container} role="region" aria-label="Notifications">
                {toasts.map((toast) => (
                    <div
                        key={toast.id}
                        className={`${styles.toast} ${styles[toast.type]}`}
                        role="alert"
                    >
                        <span className={styles.icon}>{icons[toast.type]}</span>
                        <span className={styles.message}>{toast.message}</span>
                        <button
                            onClick={() => removeToast(toast.id)}
                            className={styles.close}
                            aria-label="Dismiss"
                        >
                            <X size={14} />
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}


