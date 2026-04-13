'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { getSocket } from '@/lib/socket';

/** Max keystrokes to buffer before force-dropping oldest (prevents OOM on disconnect) */
const MAX_BUFFER_SIZE = 1000;

interface KeystrokeEntry {
    key: string;       // Key pressed (single char or key name like 'Backspace')
    ts: number;        // Timestamp (ms since epoch)
    ctrl?: boolean;    // Modifier keys
    shift?: boolean;
    alt?: boolean;
    meta?: boolean;
}

interface TypingSpeedSnapshot {
    wpm: number;           // Words per minute (1 word = 5 chars)
    cpm: number;           // Characters per minute
    interval: number;      // Measurement interval in ms
    charCount: number;     // Characters typed in this interval
}

interface UseKeystrokeTrackerOptions {
    attemptId: string;
    enabled: boolean;            // Only track when exam is active
    batchIntervalMs?: number;    // How often to send batches (default: 10s)
    speedIntervalMs?: number;    // How often to compute typing speed (default: 30s)
}

/**
 * Hook that tracks every keystroke during an exam and computes typing speed.
 * 
 * - Captures all keydown events on the document
 * - Buffers keystrokes and sends batches via WebSocket every 10 seconds
 * - Computes WPM/CPM every 30 seconds
 * - Stores data server-side in Redis (no DB migration needed)
 */
export function useKeystrokeTracker({
    attemptId,
    enabled,
    batchIntervalMs = 10000,
    speedIntervalMs = 30000,
}: UseKeystrokeTrackerOptions) {
    const keystrokeBuffer = useRef<KeystrokeEntry[]>([]);
    const charCountInWindow = useRef(0);
    const speedWindowStart = useRef(Date.now());
    const totalKeystrokes = useRef(0);
    const sessionStart = useRef(Date.now());
    const enabledRef = useRef(enabled);
    enabledRef.current = enabled;

    // Send buffered keystrokes to server
    const flushBuffer = useCallback(() => {
        const buffer = keystrokeBuffer.current;
        if (buffer.length === 0) return;

        const socket = getSocket();
        if (!socket.connected) {
            // Drop oldest entries if buffer is overflowing while disconnected
            if (buffer.length > MAX_BUFFER_SIZE) {
                buffer.splice(0, buffer.length - MAX_BUFFER_SIZE);
            }
            return;
        }

        // Take the batch and clear
        const batch = buffer.splice(0, buffer.length);

        socket.emit('keystroke:batch', {
            attemptId,
            keystrokes: batch,
            totalKeystrokes: totalKeystrokes.current,
            timestamp: Date.now(),
        });
    }, [attemptId]);

    // Compute and send typing speed
    const sendTypingSpeed = useCallback(() => {
        const now = Date.now();
        const elapsed = now - speedWindowStart.current;
        const chars = charCountInWindow.current;

        // Reset window regardless (so next window starts fresh)
        charCountInWindow.current = 0;
        speedWindowStart.current = now;

        // Skip if window too short or no activity
        if (elapsed < 5000 || chars === 0) return;

        const minutes = elapsed / 60000;
        const cpm = Math.round(chars / minutes);
        const wpm = Math.round(cpm / 5); // Standard: 1 word = 5 chars

        const snapshot: TypingSpeedSnapshot = {
            wpm,
            cpm,
            interval: elapsed,
            charCount: chars,
        };

        const socket = getSocket();
        if (!socket.connected) return;

        socket.emit('keystroke:speed', {
            attemptId,
            speed: snapshot,
            totalKeystrokes: totalKeystrokes.current,
            sessionDuration: now - sessionStart.current,
            timestamp: now,
        });
    }, [attemptId]);

    // Handle keydown — attach once on mount, use enabledRef to check
    // This avoids tearing down/re-attaching on brief reconnects
    useEffect(() => {
        sessionStart.current = Date.now();
        speedWindowStart.current = Date.now();

        const handleKeyDown = (e: KeyboardEvent) => {
            // Check enabled via ref to avoid re-registering listener
            if (!enabledRef.current) return;
            // Skip if user is typing in a non-editor input (shouldn't happen in exam mode)
            // but include all keystrokes for comprehensive tracking

            const entry: KeystrokeEntry = {
                key: e.key.length === 1 ? e.key : e.key, // Keep full key name
                ts: Date.now(),
            };

            // Only add modifier flags if they're true (saves space)
            if (e.ctrlKey) entry.ctrl = true;
            if (e.shiftKey) entry.shift = true;
            if (e.altKey) entry.alt = true;
            if (e.metaKey) entry.meta = true;

            keystrokeBuffer.current.push(entry);
            totalKeystrokes.current++;

            // Count printable characters for typing speed
            if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                charCountInWindow.current++;
            }
        };

        document.addEventListener('keydown', handleKeyDown, true); // Capture phase

        // Set up batch sending interval
        const batchInterval = setInterval(() => {
            if (enabledRef.current) flushBuffer();
        }, batchIntervalMs);

        // Set up typing speed interval
        const speedInterval = setInterval(() => {
            if (enabledRef.current) sendTypingSpeed();
        }, speedIntervalMs);

        return () => {
            document.removeEventListener('keydown', handleKeyDown, true);
            clearInterval(batchInterval);
            clearInterval(speedInterval);

            // Flush remaining on unmount
            flushBuffer();
            sendTypingSpeed();
        };
    }, [enabled, batchIntervalMs, speedIntervalMs, flushBuffer, sendTypingSpeed]);

    return {
        totalKeystrokes: totalKeystrokes.current,
    };
}

export default useKeystrokeTracker;
