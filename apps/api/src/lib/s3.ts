/**
 * Cloud Storage Service for Screenshot Storage
 *
 * Supports: AWS S3, Azure Blob Storage, or local filesystem fallback.
 * Priority: S3 (if configured) → Azure Blob (if configured) → Local filesystem.
 */

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as fs from 'fs';
import * as path from 'path';

// ============================================
// AWS S3 Configuration
// ============================================
const S3_BUCKET = process.env.S3_BUCKET || '';
const S3_REGION = process.env.S3_REGION || 'ap-south-1';
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID || '';
const S3_SECRET_KEY = process.env.S3_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY || '';

export const isS3Configured = Boolean(S3_BUCKET && (S3_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID));

let s3Client: S3Client | null = null;

if (isS3Configured) {
    const config: any = {
        region: S3_REGION,
    };
    if (S3_ACCESS_KEY && S3_SECRET_KEY) {
        config.credentials = {
            accessKeyId: S3_ACCESS_KEY,
            secretAccessKey: S3_SECRET_KEY,
        };
    }
    s3Client = new S3Client(config);
    console.log(`☁️ S3 configured: bucket=${S3_BUCKET}, region=${S3_REGION}`);
}

// ============================================
// Azure Blob Storage Configuration
// ============================================
const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING || '';
const AZURE_STORAGE_CONTAINER = process.env.AZURE_STORAGE_CONTAINER || 'screenshots';

export const isAzureBlobConfigured = Boolean(AZURE_STORAGE_CONNECTION_STRING);

let blobServiceClient: any = null;
let containerClient: any = null;

if (!isS3Configured && isAzureBlobConfigured) {
    // Lazy import to avoid requiring the package when not used
    import('@azure/storage-blob').then(({ BlobServiceClient }) => {
        blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
        containerClient = blobServiceClient.getContainerClient(AZURE_STORAGE_CONTAINER);
        // Ensure container exists
        containerClient.createIfNotExists().catch(() => {});
        console.log(`☁️ Azure Blob Storage configured: container=${AZURE_STORAGE_CONTAINER}`);
    }).catch((err: Error) => {
        console.warn('⚠️ @azure/storage-blob not installed, falling back to local filesystem');
    });
}

if (!isS3Configured && !isAzureBlobConfigured) {
    console.log('📁 No cloud storage configured, using local filesystem for screenshots');
}

// ============================================
// Storage type detection
// ============================================
type StorageLocation = 'S3' | 'AZURE' | 'LOCAL';

function getActiveStorage(): StorageLocation {
    if (isS3Configured && s3Client) return 'S3';
    if (isAzureBlobConfigured && containerClient) return 'AZURE';
    return 'LOCAL';
}

/**
 * Upload a file to S3, Azure Blob Storage, or local filesystem
 */
export async function uploadScreenshot(
    buffer: Buffer,
    filename: string,
    metadata: {
        attemptId: string;
        examId: string;
        candidateId: string;
        eventType: string;
    }
): Promise<{ url: string; location: StorageLocation }> {
    const key = `screenshots/${metadata.examId}/${metadata.attemptId}/${filename}`;
    const storage = getActiveStorage();

    if (storage === 'S3') {
        const command = new PutObjectCommand({
            Bucket: S3_BUCKET,
            Key: key,
            Body: buffer,
            ContentType: 'image/jpeg',
            Metadata: {
                'attempt-id': metadata.attemptId,
                'exam-id': metadata.examId,
                'candidate-id': metadata.candidateId,
                'event-type': metadata.eventType,
                'captured-at': new Date().toISOString(),
            },
        });
        await s3Client!.send(command);
        const url = `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${key}`;
        return { url, location: 'S3' };
    }

    if (storage === 'AZURE') {
        const { BlobSASPermissions } = await import('@azure/storage-blob');
        const blockBlobClient = containerClient.getBlockBlobClient(key);
        await blockBlobClient.upload(buffer, buffer.length, {
            blobHTTPHeaders: { blobContentType: 'image/jpeg' },
            metadata: {
                attemptid: metadata.attemptId,
                examid: metadata.examId,
                candidateid: metadata.candidateId,
                eventtype: metadata.eventType,
                capturedat: new Date().toISOString(),
            },
        });
        // Generate SAS URL with 7-day expiry (container is private)
        const sasUrl = await blockBlobClient.generateSasUrl({
            permissions: BlobSASPermissions.parse('r'),
            expiresOn: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        });
        return { url: sasUrl, location: 'AZURE' };
    }

    // Local filesystem fallback
    const uploadDir = path.join(process.cwd(), 'uploads', 'screenshots');
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }
    const filePath = path.join(uploadDir, filename);
    fs.writeFileSync(filePath, buffer);
    return { url: `/uploads/screenshots/${filename}`, location: 'LOCAL' };
}

/**
 * Get a signed URL for accessing a private object
 */
export async function getSignedScreenshotUrl(key: string, expiresIn: number = 3600): Promise<string> {
    const storage = getActiveStorage();

    if (storage === 'S3') {
        const command = new GetObjectCommand({ Bucket: S3_BUCKET, Key: key });
        return getSignedUrl(s3Client!, command, { expiresIn });
    }

    if (storage === 'AZURE') {
        const { BlobSASPermissions } = await import('@azure/storage-blob');
        const blockBlobClient = containerClient.getBlockBlobClient(key);
        const sasUrl = await blockBlobClient.generateSasUrl({
            permissions: BlobSASPermissions.parse('r'),
            expiresOn: new Date(Date.now() + expiresIn * 1000),
        });
        return sasUrl;
    }

    return key;
}

/**
 * Delete a screenshot from cloud storage or local filesystem
 */
export async function deleteScreenshot(key: string): Promise<void> {
    const storage = getActiveStorage();

    if (storage === 'S3') {
        const command = new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key });
        await s3Client!.send(command);
        return;
    }

    if (storage === 'AZURE') {
        const blockBlobClient = containerClient.getBlockBlobClient(key);
        await blockBlobClient.deleteIfExists();
        return;
    }

    const filePath = path.join(process.cwd(), key);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
}

/**
 * Get storage info for debugging
 */
export function getS3Info() {
    const storage = getActiveStorage();
    return {
        configured: storage !== 'LOCAL',
        provider: storage,
        bucket: storage === 'S3' ? S3_BUCKET : storage === 'AZURE' ? AZURE_STORAGE_CONTAINER : 'N/A',
        region: storage === 'S3' ? S3_REGION : 'N/A',
    };
}
