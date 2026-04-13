'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
    getSocket,
    connectToExam,
    leaveExam,
    disconnectSocket,
    saveFiles as saveFilesSocket,
    logProctorEvent
} from '@/lib/socket';

interface ProctorWarning {
    type: string;
    message: string;
    count: number;
    severity: 'low' | 'medium' | 'high';
}

interface GradingResult {
    publicScore: number;
    hiddenScore: number;
    totalPublic: number;
    totalHidden: number;
    logs: string;
    success: boolean;
}

interface UseExamSocketOptions {
    onTimerExpired?: () => void;
    onGradingComplete?: (result: GradingResult, isPreview: boolean) => void;
    onProctorWarning?: (warning: ProctorWarning) => void;
    onConnectionChange?: (connected: boolean) => void;
}

export function useExamSocket(attemptId: string, options: UseExamSocketOptions = {}) {
    const router = useRouter();
    const [timeLeft, setTimeLeft] = useState<number>(0);
    const [formattedTime, setFormattedTime] = useState<string>('00:00');
    const [isConnected, setIsConnected] = useState(false);
    const [isConnecting, setIsConnecting] = useState(true);
    const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error' | 'idle'>('idle');
    const [lastSaved, setLastSaved] = useState<number | null>(null);
    const [proctorWarning, setProctorWarning] = useState<ProctorWarning | null>(null);
    const [connectionError, setConnectionError] = useState<string | null>(null);

    const optionsRef = useRef(options);
    optionsRef.current = options;

    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const warningTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Connect to exam on mount
    useEffect(() => {
        let mounted = true;

        const connect = async () => {
            setIsConnecting(true);
            setConnectionError(null);

            try {
                const response = await connectToExam(attemptId);

                if (!mounted) return;

                if (response.success) {
                    setIsConnected(true);
                    setConnectionError(null);
                } else {
                    setConnectionError(response.error || 'Failed to connect');
                }
            } catch (error) {
                if (mounted) {
                    setConnectionError('Connection failed');
                }
            } finally {
                if (mounted) {
                    setIsConnecting(false);
                }
            }
        };

        const socket = getSocket();

        // Set up event listeners
        socket.on('connect', () => {
            if (mounted) {
                setIsConnected(true);
                optionsRef.current.onConnectionChange?.(true);
            }
        });

        socket.on('disconnect', () => {
            if (mounted) {
                setIsConnected(false);
                optionsRef.current.onConnectionChange?.(false);
            }
        });

        socket.on('timer:tick', (data: { remaining: number; formattedTime: string }) => {
            if (mounted) {
                setTimeLeft(data.remaining);
                setFormattedTime(data.formattedTime);
            }
        });

        socket.on('timer:expired', () => {
            if (mounted) {
                optionsRef.current.onTimerExpired?.();
            }
        });

        socket.on('grading:complete', (data: { result: GradingResult; isPreview: boolean }) => {
            if (mounted) {
                // Grading complete
                optionsRef.current.onGradingComplete?.(data.result, data.isPreview);
            }
        });

        socket.on('proctor:warning', (warning: ProctorWarning) => {
            if (mounted) {
                setProctorWarning(warning);
                optionsRef.current.onProctorWarning?.(warning);

                // Clear warning after 5 seconds
                if (warningTimeoutRef.current) {
                    clearTimeout(warningTimeoutRef.current);
                }
                warningTimeoutRef.current = setTimeout(() => {
                    if (mounted) {
                        setProctorWarning(null);
                    }
                }, 5000);
            }
        });

        connect();

        return () => {
            mounted = false;
            leaveExam(attemptId);
            socket.off('connect');
            socket.off('disconnect');
            socket.off('timer:tick');
            socket.off('timer:expired');
            socket.off('grading:complete');
            socket.off('proctor:warning');

            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
            if (warningTimeoutRef.current) {
                clearTimeout(warningTimeoutRef.current);
            }
        };
    }, [attemptId]);

    // Save files function
    const saveFiles = useCallback(async (files: Record<string, string>) => {
        setSaveStatus('saving');

        try {
            const response = await saveFilesSocket(attemptId, files);

            if (response.success) {
                setSaveStatus('saved');
                setLastSaved(response.savedAt || Date.now());

                // Reset to idle after 2 seconds
                if (saveTimeoutRef.current) {
                    clearTimeout(saveTimeoutRef.current);
                }
                saveTimeoutRef.current = setTimeout(() => {
                    setSaveStatus('idle');
                }, 2000);
            } else {
                setSaveStatus('error');
            }
        } catch (error) {
            setSaveStatus('error');
        }
    }, [attemptId]);

    // Debounced save function
    const debouncedSave = useCallback((files: Record<string, string>, delay: number = 1000) => {
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }

        saveTimeoutRef.current = setTimeout(() => {
            saveFiles(files);
        }, delay);
    }, [saveFiles]);

    // Log proctor events
    const logEvent = useCallback(async (
        eventType: string,
        metadata?: { duration?: number; pasteLength?: number; isMultiline?: boolean }
    ) => {
        await logProctorEvent({
            attemptId,
            eventType,
            ...metadata,
        });
    }, [attemptId]);

    // Reconnect function
    const reconnect = useCallback(async () => {
        setIsConnecting(true);
        disconnectSocket();

        try {
            const response = await connectToExam(attemptId);
            if (response.success) {
                setIsConnected(true);
                setConnectionError(null);
            } else {
                setConnectionError(response.error || 'Reconnection failed');
            }
        } catch (error) {
            setConnectionError('Reconnection failed');
        } finally {
            setIsConnecting(false);
        }
    }, [attemptId]);

    return {
        // Timer state
        timeLeft,
        formattedTime,

        // Connection state
        isConnected,
        isConnecting,
        connectionError,

        // Save state
        saveStatus,
        lastSaved,

        // Proctor state
        proctorWarning,

        // Actions
        saveFiles,
        debouncedSave,
        logEvent,
        reconnect,
    };
}


