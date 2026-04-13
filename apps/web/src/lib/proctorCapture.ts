'use client';

export type ProctorEventType = 
    | 'TAB_LEAVE' 
    | 'TAB_RETURN'
    | 'FULLSCREEN_EXIT' 
    | 'FULLSCREEN_ENTER'
    | 'PASTE_ATTEMPT'
    | 'RANDOM_CHECK'
    | 'SCREEN_SHARE_LOST'
    | 'EXAM_START'
    | 'EXAM_SUBMIT';

export interface CaptureOptions {
    attemptId: string;
    eventType: ProctorEventType;
    sequenceNumber?: number;
}

// Store the screen share stream for capturing actual screen
let screenShareStream: MediaStream | null = null;
let videoElement: HTMLVideoElement | null = null;

/**
 * Set the screen share stream for capturing real screenshots
 * Call this after getDisplayMedia succeeds
 */
export function setScreenShareStream(stream: MediaStream | null): void {
    screenShareStream = stream;
    
    if (stream) {
        // Create hidden video element to capture frames
        if (!videoElement) {
            videoElement = document.createElement('video');
            videoElement.style.display = 'none';
            videoElement.autoplay = true;
            videoElement.playsInline = true;
            document.body.appendChild(videoElement);
        }
        videoElement.srcObject = stream;
        videoElement.play().catch(console.error);
        console.log('[ProctorCapture] Screen share stream set for real screen capture');
    } else {
        if (videoElement) {
            videoElement.srcObject = null;
        }
        console.log('[ProctorCapture] Screen share stream cleared');
    }
}

/**
 * Capture frame from screen share stream (REAL SCREEN!)
 */
async function captureFromStream(): Promise<Blob | null> {
    if (!screenShareStream || !videoElement) {
        console.warn('[ProctorCapture] No screen share stream available');
        return null;
    }
    
    // Check if stream is still active
    const videoTrack = screenShareStream.getVideoTracks()[0];
    if (!videoTrack || videoTrack.readyState !== 'live') {
        console.warn('[ProctorCapture] Screen share track not live');
        return null;
    }
    
    try {
        // Get video dimensions
        const width = videoElement.videoWidth;
        const height = videoElement.videoHeight;
        
        if (width === 0 || height === 0) {
            console.warn('[ProctorCapture] Video dimensions not ready');
            return null;
        }
        
        // Create canvas and draw video frame
        const canvas = document.createElement('canvas');
        // Scale down for reasonable file size (max 1920x1080)
        const scale = Math.min(1, 1920 / width, 1080 / height);
        canvas.width = width * scale;
        canvas.height = height * scale;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        
        ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
        
        // Convert to blob
        return new Promise((resolve) => {
            canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.85);
        });
    } catch (error) {
        console.error('[ProctorCapture] Failed to capture from stream:', error);
        return null;
    }
}

// Rate limiting - S3 can handle more load than local filesystem
const captureQueue: CaptureOptions[] = [];
let isProcessingQueue = false;
const MIN_CAPTURE_INTERVAL_MS = 1000; // Max 1 screenshot per second per student
const MAX_QUEUE_SIZE = 10; // Queue up to 10 screenshots
let lastCaptureTime = 0;

// Check if we're in HTTP mode (no screen sharing available)
function isHttpMode(): boolean {
    if (typeof window === 'undefined') return false;
    return !window.isSecureContext && 
           window.location.protocol !== 'https:' &&
           window.location.hostname !== 'localhost' &&
           window.location.hostname !== '127.0.0.1';
}

async function doCapture(options: CaptureOptions): Promise<boolean> {
    const { attemptId, eventType, sequenceNumber } = options;

    try {
        // In HTTP mode, skip screen capture entirely (not supported)
        if (isHttpMode()) {
            console.log('[ProctorCapture] HTTP mode - skipping capture (HTTPS required for screen sharing)');
            return true; // Return true to not block the exam flow
        }

        // Try to capture from screen share stream first (captures REAL SCREEN!)
        let blob = await captureFromStream();
        
        if (!blob) {
            console.warn('[ProctorCapture] Stream capture failed, screen may not be shared');
            // Return true to not block exam - admin will see missing screenshots
            return true;
        }

        const formData = new FormData();
        const seq = sequenceNumber ? `_${sequenceNumber}` : '';
        formData.append('screenshot', blob, `${eventType}${seq}_${Date.now()}.jpg`);
        formData.append('eventType', eventType);
        formData.append('timestamp', new Date().toISOString());
        formData.append('captureMethod', 'screen_share'); // Mark as real screen capture
        if (sequenceNumber) {
            formData.append('sequenceNumber', String(sequenceNumber));
        }

        const token = localStorage.getItem('token');
        const response = await fetch(`/api/attempts/${attemptId}/screenshot`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
            body: formData,
        });

        if (!response.ok) {
            console.error('Failed to upload screenshot:', response.statusText);
            return false;
        }

        console.log(`[ProctorCapture] REAL SCREEN captured: ${eventType}${seq}`);
        return true;
    } catch (error) {
        console.error('Screenshot capture failed:', error);
        return false;
    }
}

async function processQueue(): Promise<void> {
    if (isProcessingQueue || captureQueue.length === 0) return;
    
    isProcessingQueue = true;
    
    while (captureQueue.length > 0) {
        const now = Date.now();
        const timeSinceLastCapture = now - lastCaptureTime;
        
        if (timeSinceLastCapture < MIN_CAPTURE_INTERVAL_MS) {
            await new Promise(resolve => setTimeout(resolve, MIN_CAPTURE_INTERVAL_MS - timeSinceLastCapture));
        }
        
        const options = captureQueue.shift();
        if (options) {
            await doCapture(options);
            lastCaptureTime = Date.now();
        }
    }
    
    isProcessingQueue = false;
}

/**
 * Captures a screenshot of the exam page and uploads it to the server
 */
export async function captureAndUploadScreenshot(options: CaptureOptions): Promise<boolean> {
    return doCapture(options);
}

/**
 * Captures screenshot without blocking the main flow
 * Rate limited to prevent server overload with 200+ students
 */
export function captureScreenshotAsync(options: CaptureOptions): void {
    // Don't queue if already too many pending
    if (captureQueue.length >= MAX_QUEUE_SIZE) {
        console.log(`[ProctorCapture] Queue full (${MAX_QUEUE_SIZE}), skipping ${options.eventType}`);
        return;
    }
    captureQueue.push(options);
    processQueue().catch(console.error);
}

/**
 * Capture multiple screenshots in sequence (for events like tab leave, fullscreen exit)
 */
export function captureMultipleScreenshots(
    attemptId: string, 
    eventType: ProctorEventType, 
    count: number = 3,
    intervalMs: number = 1000
): void {
    // Capture first one immediately
    captureScreenshotAsync({
        attemptId,
        eventType,
        sequenceNumber: 1,
    });
    
    // Schedule remaining captures
    for (let i = 1; i < count; i++) {
        setTimeout(() => {
            captureScreenshotAsync({
                attemptId,
                eventType,
                sequenceNumber: i + 1,
            });
        }, i * intervalMs);
    }
}

// Random periodic capture controller
let randomCaptureTimeout: ReturnType<typeof setTimeout> | null = null;
let randomCaptureAttemptId: string | null = null;

export function startRandomCaptures(
    attemptId: string, 
    minIntervalSec: number = 45, 
    maxIntervalSec: number = 120
): void {
    stopRandomCaptures();
    randomCaptureAttemptId = attemptId;
    
    const scheduleNext = () => {
        if (!randomCaptureAttemptId) return;
        
        // Random interval between min and max
        const intervalMs = (Math.random() * (maxIntervalSec - minIntervalSec) + minIntervalSec) * 1000;
        
        randomCaptureTimeout = setTimeout(() => {
            if (randomCaptureAttemptId) {
                captureScreenshotAsync({
                    attemptId: randomCaptureAttemptId,
                    eventType: 'RANDOM_CHECK',
                });
            }
            scheduleNext();
        }, intervalMs);
    };
    
    // Start first capture after initial delay (30-60 sec)
    const initialDelay = (Math.random() * 30 + 30) * 1000;
    randomCaptureTimeout = setTimeout(() => {
        if (randomCaptureAttemptId) {
            captureScreenshotAsync({
                attemptId: randomCaptureAttemptId,
                eventType: 'RANDOM_CHECK',
            });
        }
        scheduleNext();
    }, initialDelay);
    
    console.log('[ProctorCapture] Random captures started');
}

export function stopRandomCaptures(): void {
    if (randomCaptureTimeout) {
        clearTimeout(randomCaptureTimeout);
        randomCaptureTimeout = null;
    }
    randomCaptureAttemptId = null;
    console.log('[ProctorCapture] Random captures stopped');
}
