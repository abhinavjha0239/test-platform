'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { setScreenShareStream } from '@/lib/proctorCapture';

interface UseScreenShareOptions {
    onScreenShareLost: () => void;
    onScreenShareError: (error: string) => void;
}

// Check if screen sharing is available (requires HTTPS or localhost)
function isScreenShareAvailable(): boolean {
    if (typeof window === 'undefined') return false;

    // Check for secure context (HTTPS or localhost)
    const isSecureContext = window.isSecureContext ||
        window.location.protocol === 'https:' ||
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1';

    // Check if mediaDevices API is available
    const hasMediaDevices = !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);

    return isSecureContext && hasMediaDevices;
}

export function useScreenShare(options: UseScreenShareOptions) {
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [isRequestingShare, setIsRequestingShare] = useState(false);
    const [screenShareError, setScreenShareError] = useState<string | null>(null);
    const [isScreenShareSupported, setIsScreenShareSupported] = useState(true);

    const streamRef = useRef<MediaStream | null>(null);
    const optionsRef = useRef(options);
    optionsRef.current = options;

    // Check support on mount
    useEffect(() => {
        setIsScreenShareSupported(isScreenShareAvailable());
    }, []);

    // Cleanup function
    const stopScreenShare = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => {
                track.stop();
            });
            streamRef.current = null;
        }
        // Clear the stream from proctor capture
        setScreenShareStream(null);
        setIsScreenSharing(false);
    }, []);

    // Request screen share permission
    const requestScreenShare = useCallback(async (): Promise<boolean> => {
        setIsRequestingShare(true);
        setScreenShareError(null);

        // Check if screen sharing is available
        if (!isScreenShareAvailable()) {
            console.warn('[ScreenShare] Not available - requires HTTPS');
            // On HTTP, we skip screen sharing but allow exam to continue
            // This is for development/testing on non-HTTPS environments
            setIsRequestingShare(false);
            setIsScreenSharing(true); // Pretend it's working for HTTP
            // Screen sharing disabled in HTTP mode
            return true;
        }

        try {
            // Request ENTIRE screen (not just a window/tab)
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    displaySurface: 'monitor', // Prefer entire screen
                },
                audio: false,
            });

            // Check if user shared entire screen (not just a window)
            const videoTrack = stream.getVideoTracks()[0];
            const settings = videoTrack.getSettings();

            // Enforce entire screen sharing
            if (settings.displaySurface && settings.displaySurface !== 'monitor') {
                // Stop the tracks immediately
                stream.getTracks().forEach(track => track.stop());
                throw new Error('NotEntireScreenError');
            }

            // Log what was shared for debugging
            // Settings received

            // Store stream reference
            streamRef.current = stream;
            setIsScreenSharing(true);

            // Set stream for proctor capture (REAL SCREEN screenshots!)
            setScreenShareStream(stream);

            // Listen for track end (user stopped sharing)
            videoTrack.addEventListener('ended', () => {
                // User stopped screen sharing
                setIsScreenSharing(false);
                streamRef.current = null;
                // Clear the stream from proctor capture
                setScreenShareStream(null);
                optionsRef.current.onScreenShareLost();
            });

            setIsRequestingShare(false);
            return true;
        } catch (error: any) {
            console.error('[ScreenShare] Error:', error);

            let errorMessage = 'Failed to start screen sharing';
            if (error.name === 'NotAllowedError') {
                errorMessage = 'Screen sharing permission denied. Please allow screen sharing to continue.';
            } else if (error.name === 'NotFoundError') {
                errorMessage = 'No screen available for sharing.';
            } else if (error.name === 'NotSupportedError') {
                errorMessage = 'Screen sharing is not supported in this browser.';
            } else if (error.message === 'NotEntireScreenError') {
                errorMessage = 'You must share your ENTIRE screen, not just a window or tab. Please try again and select "Entire Screen".';
            }

            setScreenShareError(errorMessage);
            setIsRequestingShare(false);
            optionsRef.current.onScreenShareError(errorMessage);
            return false;
        }
    }, []);

    // Check if we have an active screen share (won't work after refresh - that's the point!)
    const checkScreenShare = useCallback(() => {
        return streamRef.current !== null &&
            streamRef.current.active &&
            streamRef.current.getVideoTracks().some(track => track.readyState === 'live');
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopScreenShare();
        };
    }, [stopScreenShare]);

    return {
        isScreenSharing,
        isRequestingShare,
        screenShareError,
        isScreenShareSupported,
        requestScreenShare,
        stopScreenShare,
        checkScreenShare,
    };
}
