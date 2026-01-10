/**
 * API Versioning Middleware
 * 
 * Supports versioning via:
 * 1. URL path: /api/v1/resource, /api/v2/resource
 * 2. Header: X-API-Version: 1
 * 3. Query param: ?api_version=1 (useful for testing)
 * 
 * Default version is 1 if not specified.
 */

import { Request, Response, NextFunction } from 'express';

// Supported API versions
export const SUPPORTED_VERSIONS = ['1', '2'] as const;
export type ApiVersion = typeof SUPPORTED_VERSIONS[number];

// Default version if not specified
export const DEFAULT_VERSION: ApiVersion = '1';

// Latest stable version
export const LATEST_VERSION: ApiVersion = '1';

/**
 * Extend Express Request with version info
 */
declare global {
    namespace Express {
        interface Request {
            apiVersion?: ApiVersion;
        }
    }
}

/**
 * Extract API version from request
 */
export function getApiVersion(req: Request): ApiVersion {
    // Priority 1: URL path (extracted by router)
    if (req.apiVersion) {
        return req.apiVersion;
    }

    // Priority 2: X-API-Version header
    const headerVersion = req.headers['x-api-version'];
    if (headerVersion && typeof headerVersion === 'string') {
        const version = headerVersion.trim();
        if (SUPPORTED_VERSIONS.includes(version as ApiVersion)) {
            return version as ApiVersion;
        }
    }

    // Priority 3: Query parameter
    const queryVersion = req.query.api_version;
    if (queryVersion && typeof queryVersion === 'string') {
        const version = queryVersion.trim();
        if (SUPPORTED_VERSIONS.includes(version as ApiVersion)) {
            return version as ApiVersion;
        }
    }

    // Default
    return DEFAULT_VERSION;
}

/**
 * Middleware to detect and set API version
 */
export function detectApiVersion(req: Request, res: Response, next: NextFunction) {
    req.apiVersion = getApiVersion(req);
    
    // Add version to response headers
    res.setHeader('X-API-Version', req.apiVersion);
    res.setHeader('X-API-Latest-Version', LATEST_VERSION);
    
    next();
}

/**
 * Middleware to require a specific version
 */
export function requireVersion(version: ApiVersion) {
    return (req: Request, res: Response, next: NextFunction) => {
        req.apiVersion = version;
        res.setHeader('X-API-Version', version);
        next();
    };
}

/**
 * Middleware to validate version is supported
 */
export function validateVersion(req: Request, res: Response, next: NextFunction) {
    const version = getApiVersion(req);
    
    if (!SUPPORTED_VERSIONS.includes(version)) {
        return res.status(400).json({
            success: false,
            error: `Unsupported API version: ${version}. Supported versions: ${SUPPORTED_VERSIONS.join(', ')}`,
        });
    }
    
    req.apiVersion = version;
    next();
}

/**
 * Helper to create versioned response
 */
export function versionedResponse<T>(
    req: Request,
    data: T,
    transformers?: Partial<Record<ApiVersion, (data: T) => unknown>>
): unknown {
    const version = req.apiVersion || DEFAULT_VERSION;
    const transformer = transformers?.[version];
    
    if (transformer) {
        return transformer(data);
    }
    
    return data;
}

/**
 * Deprecation warning middleware
 */
export function deprecationWarning(message: string, sunsetDate?: Date) {
    return (req: Request, res: Response, next: NextFunction) => {
        res.setHeader('Deprecation', 'true');
        res.setHeader('X-Deprecation-Warning', message);
        
        if (sunsetDate) {
            res.setHeader('Sunset', sunsetDate.toUTCString());
        }
        
        next();
    };
}

/**
 * Version info endpoint data
 */
export function getVersionInfo() {
    return {
        current: LATEST_VERSION,
        supported: SUPPORTED_VERSIONS,
        default: DEFAULT_VERSION,
        latest: LATEST_VERSION,
        documentation: '/api/docs',
    };
}


