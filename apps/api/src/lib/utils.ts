/**
 * Utility functions for the API
 */

/**
 * Escape special characters in LIKE patterns
 * Prevents SQL injection via pattern matching
 */
export function escapeLikePattern(pattern: string): string {
    return pattern.replace(/[%_\\]/g, '\\$&');
}

