/**
 * Log Sanitizer - Prevents hidden test code from leaking to candidates
 * 
 * This module sanitizes grading logs before they are stored or returned to candidates.
 * It removes or redacts any content that could reveal hidden test implementation details.
 */

/**
 * Patterns to sanitize from logs
 */
const SANITIZE_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
    // File paths containing "hidden"
    { pattern: /__tests__\/hidden\.test\.[jt]s/g, replacement: '[HIDDEN_TEST_FILE]' },
    { pattern: /hidden\.test\.[jt]s/g, replacement: '[HIDDEN_TEST_FILE]' },
    
    // Stack traces from hidden tests
    { pattern: /at.*hidden\.test\.[jt]s:\d+:\d+/g, replacement: 'at [HIDDEN_TEST]' },
    
    // Test names that might reveal hidden test logic
    { pattern: /Hidden Tests?/gi, replacement: '[HIDDEN_TESTS]' },
    
    // Assertion details from hidden tests (these often contain expected values)
    { pattern: /expect\(received\)\..*\n.*Hidden/gi, replacement: '[HIDDEN_ASSERTION]' },
    
    // File content if accidentally printed
    { pattern: /\/\/ Hidden test.*$/gm, replacement: '// [REDACTED]' },
];

/**
 * Sanitize grading logs to remove hidden test details
 * @param logs - Raw grading logs from Jest
 * @param isPreview - If true (run-tests), only public tests were run, no sanitization needed
 * @returns Sanitized logs safe to show to candidates
 */
export function sanitizeLogs(logs: string, isPreview: boolean = false): string {
    if (!logs) return '';
    
    // Preview mode only runs public tests, no hidden test content to leak
    if (isPreview) {
        return logs;
    }
    
    let sanitized = logs;
    
    // Apply all sanitization patterns
    for (const { pattern, replacement } of SANITIZE_PATTERNS) {
        sanitized = sanitized.replace(pattern, replacement);
    }
    
    // Remove any lines that contain "HIDDEN" in the path
    const lines = sanitized.split('\n');
    const filteredLines = lines.filter(line => {
        // Keep the line if it doesn't contain hidden test paths
        const lowerLine = line.toLowerCase();
        return !lowerLine.includes('hidden.test.') || 
               lowerLine.includes('[hidden_test');  // Keep already-redacted lines
    });
    
    // Limit log length to prevent huge outputs
    const MAX_LOG_LENGTH = 10000;
    let result = filteredLines.join('\n');
    
    if (result.length > MAX_LOG_LENGTH) {
        result = result.substring(0, MAX_LOG_LENGTH) + '\n\n... [LOG TRUNCATED] ...';
    }
    
    return result;
}

/**
 * Sanitize error messages that might leak test implementation
 */
export function sanitizeError(error: string): string {
    if (!error) return '';
    
    // Remove file paths
    let sanitized = error.replace(/\/[^\s]+\/hidden\.test\.[jt]s/g, '[HIDDEN_TEST]');
    
    // Remove line numbers from hidden tests
    sanitized = sanitized.replace(/hidden\.test\.[jt]s:\d+:\d+/g, '[HIDDEN_TEST]');
    
    return sanitized;
}

/**
 * Create a candidate-safe summary of grading results
 */
export function createCandidateSummary(result: {
    publicScore: number;
    hiddenScore: number;
    totalPublic: number;
    totalHidden: number;
    logs: string;
}): string {
    const publicPassed = result.publicScore === result.totalPublic;
    const hiddenPassed = result.hiddenScore === result.totalHidden;
    
    let summary = '';
    
    // Public tests summary
    summary += `📊 Public Tests: ${result.publicScore}/${result.totalPublic}`;
    summary += publicPassed ? ' ✅\n' : ' ❌\n';
    
    // Hidden tests summary (no details, just pass/fail count)
    summary += `🔒 Hidden Tests: ${result.hiddenScore}/${result.totalHidden}`;
    summary += hiddenPassed ? ' ✅\n' : ' ❌\n';
    
    // Total score
    const totalScore = result.publicScore + result.hiddenScore;
    const totalTests = result.totalPublic + result.totalHidden;
    const percentage = totalTests > 0 ? Math.round((totalScore / totalTests) * 100) : 0;
    
    summary += `\n📈 Total Score: ${totalScore}/${totalTests} (${percentage}%)\n`;
    
    return summary;
}


