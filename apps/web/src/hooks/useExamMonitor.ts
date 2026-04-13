'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

interface Screenshot {
    attemptId: string;
    examId: string;
    candidateId: string;
    eventType: string;
    timestamp: string;
    url: string;
    filename: string;
}

interface UseExamMonitorOptions {
    examId: string;
    onScreenshot?: (screenshot: Screenshot) => void;
}

export function useExamMonitor({ examId, onScreenshot }: UseExamMonitorOptions) {
    const [isConnected, setIsConnected] = useState(false);
    const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
    const socketRef = useRef<Socket | null>(null);
    const onScreenshotRef = useRef(onScreenshot);
    onScreenshotRef.current = onScreenshot;

    useEffect(() => {
        if (!examId) return;

        const token = localStorage.getItem('token');
        if (!token) return;

        // Connect to socket
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
        const socket = io(apiUrl, {
            auth: { token },
            transports: ['websocket', 'polling'],
        });

        socketRef.current = socket;

        socket.on('connect', () => {
            // Connected
            setIsConnected(true);

            // Join monitoring room
            socket.emit('exam:monitor:join', examId, (response: any) => {
                if (response?.success) {
                    // Joined monitoring room
                } else {
                    console.error('[ExamMonitor] Failed to join:', response?.error);
                }
            });
        });

        socket.on('disconnect', () => {
            // Disconnected
            setIsConnected(false);
        });

        // Listen for real-time screenshots
        socket.on('proctor:screenshot', (data: Screenshot) => {
            // Screenshot received
            setScreenshots(prev => [data, ...prev].slice(0, 100)); // Keep last 100
            onScreenshotRef.current?.(data);
        });

        // Cleanup
        return () => {
            socket.emit('exam:monitor:leave', examId);
            socket.disconnect();
            socketRef.current = null;
        };
    }, [examId]);

    // Fetch initial screenshots
    useEffect(() => {
        if (!examId) return;

        const token = localStorage.getItem('token');
        fetch(`/api/attempts/exam/${examId}/screenshots/live`, {
            headers: { 'Authorization': `Bearer ${token}` },
        })
            .then(res => res.json())
            .then(data => {
                if (data.success && data.data?.screenshots) {
                    setScreenshots(data.data.screenshots);
                }
            })
            .catch(console.error);
    }, [examId]);

    const clearScreenshots = useCallback(() => {
        setScreenshots([]);
    }, []);

    return {
        isConnected,
        screenshots,
        clearScreenshots,
    };
}
