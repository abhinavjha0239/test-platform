/**
 * Token Manager - JWT Access & Refresh Token Management
 * 
 * Implements secure token rotation:
 * - Access tokens (1 day)
 * - Long-lived refresh tokens (7 days)
 * - Refresh token rotation (new token on each use)
 * - Token family tracking for breach detection
 * - Redis-backed token storage for revocation
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { redisConnection } from './redis.js';

// Redis key prefixes
const REFRESH_TOKEN_PREFIX = 'refresh:';
const TOKEN_FAMILY_PREFIX = 'token_family:';
const REVOKED_TOKEN_PREFIX = 'revoked:';

// Token configuration
const ACCESS_TOKEN_EXPIRY = '1d';
const REFRESH_TOKEN_EXPIRY = '7d';
const REFRESH_TOKEN_EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 days

// Redis SCAN configuration
// Increased from 100 to 1000 for better performance with large token sets
const REDIS_SCAN_COUNT = 1000;

/**
 * Token payload structure
 */
export interface TokenPayload {
    userId: string;
    email: string;
    role: string;
}

/**
 * Refresh token metadata
 */
interface RefreshTokenData {
    userId: string;
    email: string;
    role: string;
    familyId: string;
    createdAt: number;
    rotationCount: number;
}

/**
 * Get JWT secrets
 */
function getSecrets() {
    const accessSecret = process.env.JWT_SECRET;
    const refreshSecret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;

    if (!accessSecret) {
        throw new Error('JWT_SECRET not configured');
    }

    return { accessSecret, refreshSecret };
}

/**
 * Generate access token (short-lived)
 */
export function generateAccessToken(payload: TokenPayload): string {
    const { accessSecret } = getSecrets();

    return jwt.sign(payload, accessSecret, {
        expiresIn: ACCESS_TOKEN_EXPIRY,
    });
}

/**
 * Generate refresh token (long-lived, stored in Redis)
 */
export async function generateRefreshToken(payload: TokenPayload): Promise<string> {
    const { refreshSecret } = getSecrets();

    // Generate unique token ID and family ID
    const tokenId = crypto.randomUUID();
    const familyId = crypto.randomUUID();

    // Create JWT with token ID
    const token = jwt.sign(
        {
            ...payload,
            tokenId,
            familyId,
            type: 'refresh',
        },
        refreshSecret,
        { expiresIn: REFRESH_TOKEN_EXPIRY }
    );

    // Store in Redis for tracking
    const tokenData: RefreshTokenData = {
        ...payload,
        familyId,
        createdAt: Date.now(),
        rotationCount: 0,
    };

    await redisConnection.set(
        `${REFRESH_TOKEN_PREFIX}${tokenId}`,
        JSON.stringify(tokenData),
        'EX',
        REFRESH_TOKEN_EXPIRY_SECONDS
    );

    // Track token family
    await redisConnection.sadd(`${TOKEN_FAMILY_PREFIX}${familyId}`, tokenId);
    await redisConnection.expire(`${TOKEN_FAMILY_PREFIX}${familyId}`, REFRESH_TOKEN_EXPIRY_SECONDS);

    return token;
}

/**
 * Verify access token
 */
export function verifyAccessToken(token: string): TokenPayload {
    const { accessSecret } = getSecrets();
    return jwt.verify(token, accessSecret) as TokenPayload;
}

/**
 * Rotate refresh token (use old token to get new tokens)
 * Returns new access and refresh tokens
 */
export async function rotateRefreshToken(oldToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
} | null> {
    const { refreshSecret } = getSecrets();

    try {
        // Verify the old token
        const decoded = jwt.verify(oldToken, refreshSecret) as TokenPayload & {
            tokenId: string;
            familyId: string;
            type: string;
        };

        if (decoded.type !== 'refresh') {
            console.warn('Token is not a refresh token');
            return null;
        }

        const { tokenId, familyId, userId, email, role } = decoded;

        // Check if token is revoked
        const isRevoked = await redisConnection.exists(`${REVOKED_TOKEN_PREFIX}${tokenId}`);
        if (isRevoked) {
            console.warn(`Attempt to use revoked token: ${tokenId}`);
            // Possible breach - revoke entire family
            await revokeTokenFamily(familyId);
            return null;
        }

        // Get token data from Redis
        const tokenDataStr = await redisConnection.get(`${REFRESH_TOKEN_PREFIX}${tokenId}`);
        if (!tokenDataStr) {
            console.warn(`Refresh token not found in Redis: ${tokenId}`);
            return null;
        }

        const tokenData: RefreshTokenData = JSON.parse(tokenDataStr);

        // Revoke the old token
        await redisConnection.del(`${REFRESH_TOKEN_PREFIX}${tokenId}`);
        await redisConnection.set(
            `${REVOKED_TOKEN_PREFIX}${tokenId}`,
            '1',
            'EX',
            REFRESH_TOKEN_EXPIRY_SECONDS
        );

        // Generate new tokens with same family ID
        const newTokenId = crypto.randomUUID();
        const newTokenData: RefreshTokenData = {
            userId,
            email,
            role,
            familyId,
            createdAt: Date.now(),
            rotationCount: tokenData.rotationCount + 1,
        };

        // Store new token in Redis
        await redisConnection.set(
            `${REFRESH_TOKEN_PREFIX}${newTokenId}`,
            JSON.stringify(newTokenData),
            'EX',
            REFRESH_TOKEN_EXPIRY_SECONDS
        );

        // Add to family
        await redisConnection.sadd(`${TOKEN_FAMILY_PREFIX}${familyId}`, newTokenId);

        // Generate new JWT
        const newRefreshToken = jwt.sign(
            {
                userId,
                email,
                role,
                tokenId: newTokenId,
                familyId,
                type: 'refresh',
            },
            refreshSecret,
            { expiresIn: REFRESH_TOKEN_EXPIRY }
        );

        // Generate new access token
        const accessToken = generateAccessToken({ userId, email, role });

        console.log(`🔄 Token rotated for user ${userId} (family: ${familyId}, rotation: ${newTokenData.rotationCount})`);

        return {
            accessToken,
            refreshToken: newRefreshToken,
        };
    } catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
            console.warn('Refresh token expired');
        } else {
            console.error('Token rotation error:', error);
        }
        return null;
    }
}

/**
 * Revoke a specific refresh token
 */
export async function revokeRefreshToken(token: string): Promise<boolean> {
    const { refreshSecret } = getSecrets();

    try {
        const decoded = jwt.verify(token, refreshSecret, { ignoreExpiration: true }) as {
            tokenId: string;
        };

        const { tokenId } = decoded;

        // Delete from active tokens
        await redisConnection.del(`${REFRESH_TOKEN_PREFIX}${tokenId}`);

        // Mark as revoked
        await redisConnection.set(
            `${REVOKED_TOKEN_PREFIX}${tokenId}`,
            '1',
            'EX',
            REFRESH_TOKEN_EXPIRY_SECONDS
        );

        return true;
    } catch {
        return false;
    }
}

/**
 * Revoke all tokens in a family (for breach detection)
 */
export async function revokeTokenFamily(familyId: string): Promise<void> {
    console.warn(`🚨 Revoking token family: ${familyId}`);

    const tokenIds = await redisConnection.smembers(`${TOKEN_FAMILY_PREFIX}${familyId}`);

    for (const tokenId of tokenIds) {
        await redisConnection.del(`${REFRESH_TOKEN_PREFIX}${tokenId}`);
        await redisConnection.set(
            `${REVOKED_TOKEN_PREFIX}${tokenId}`,
            '1',
            'EX',
            REFRESH_TOKEN_EXPIRY_SECONDS
        );
    }

    await redisConnection.del(`${TOKEN_FAMILY_PREFIX}${familyId}`);
}

/**
 * Helper function to scan Redis keys with a pattern
 * Uses SCAN instead of KEYS to avoid blocking Redis under load.
 * 
 * @param pattern - Redis key pattern to match
 * @param count - Number of keys to return per SCAN iteration (default: REDIS_SCAN_COUNT)
 */
async function scanKeys(pattern: string, count: number = REDIS_SCAN_COUNT): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';
    do {
        const [nextCursor, batch] = await redisConnection.scan(
            cursor,
            'MATCH',
            pattern,
            'COUNT',
            count.toString()
        );
        cursor = nextCursor;
        keys.push(...batch);
    } while (cursor !== '0');
    return keys;
}

/**
 * Revoke all tokens for a user (e.g., on password change)
 */
export async function revokeAllUserTokens(userId: string): Promise<void> {
    console.log(`🔒 Revoking all tokens for user: ${userId}`);

    // Find all token families for this user
    // Uses SCAN instead of KEYS for production safety
    const allTokenKeys = await scanKeys(`${REFRESH_TOKEN_PREFIX}*`);

    for (const key of allTokenKeys) {
        const data = await redisConnection.get(key);
        if (data) {
            try {
                const tokenData: RefreshTokenData = JSON.parse(data);
                if (tokenData.userId === userId) {
                    await revokeTokenFamily(tokenData.familyId);
                }
            } catch {
                // Invalid data, skip
            }
        }
    }
}

/**
 * Get token statistics
 * Uses SCAN instead of KEYS to avoid blocking Redis under load.
 */
export async function getTokenStats(): Promise<{
    activeTokens: number;
    revokedTokens: number;
    tokenFamilies: number;
}> {
    const [activeKeys, revokedKeys, familyKeys] = await Promise.all([
        scanKeys(`${REFRESH_TOKEN_PREFIX}*`),
        scanKeys(`${REVOKED_TOKEN_PREFIX}*`),
        scanKeys(`${TOKEN_FAMILY_PREFIX}*`),
    ]);

    return {
        activeTokens: activeKeys.length,
        revokedTokens: revokedKeys.length,
        tokenFamilies: familyKeys.length,
    };
}
