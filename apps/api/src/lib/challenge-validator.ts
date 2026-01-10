/**
 * Challenge Validation Service
 * 
 * Validates challenges before they can be published.
 * Ensures tests are comprehensive, isolated, and don't have loopholes.
 */

import { runLocalGrader } from './local-grader.js';

/**
 * Validation result
 */
export interface ValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    checks: {
        name: string;
        passed: boolean;
        message: string;
    }[];
}

/**
 * Challenge data for validation
 */
export interface ChallengeToValidate {
    name: string;
    starterFiles: Record<string, string>;
    publicTests: string;
    hiddenTests: string;
    dependencies: Record<string, string>;
    nodeVersion: string;
    solutionFiles?: Record<string, string>; // Reference solution for testing
}

/**
 * Validate a challenge before publishing
 */
export async function validateChallenge(challenge: ChallengeToValidate): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const checks: ValidationResult['checks'] = [];

    // 1. Check required fields
    if (!challenge.name || challenge.name.trim().length === 0) {
        errors.push('Challenge name is required');
    }
    checks.push({
        name: 'Required fields',
        passed: errors.length === 0,
        message: errors.length === 0 ? 'All required fields present' : 'Missing required fields',
    });

    // 2. Check starter files
    const starterFileCount = Object.keys(challenge.starterFiles || {}).length;
    if (starterFileCount === 0) {
        errors.push('At least one starter file is required');
    }
    checks.push({
        name: 'Starter files',
        passed: starterFileCount > 0,
        message: `${starterFileCount} starter file(s) found`,
    });

    // 3. Check public tests exist
    if (!challenge.publicTests || challenge.publicTests.trim().length === 0) {
        errors.push('Public tests are required');
    } else {
        // Check for test isolation pattern
        const hasResetModules = challenge.publicTests.includes('jest.resetModules()');
        if (!hasResetModules) {
            warnings.push('Public tests should use jest.resetModules() in beforeEach for isolation');
        }
        checks.push({
            name: 'Public test isolation',
            passed: hasResetModules,
            message: hasResetModules ? 'Tests use jest.resetModules()' : 'Missing test isolation',
        });
    }
    checks.push({
        name: 'Public tests',
        passed: !!challenge.publicTests,
        message: challenge.publicTests ? 'Public tests provided' : 'No public tests',
    });

    // 4. Check hidden tests exist
    if (!challenge.hiddenTests || challenge.hiddenTests.trim().length === 0) {
        warnings.push('Hidden tests are recommended for robust grading');
    } else {
        // Check for test isolation pattern
        const hasResetModules = challenge.hiddenTests.includes('jest.resetModules()');
        if (!hasResetModules) {
            warnings.push('Hidden tests should use jest.resetModules() in beforeEach for isolation');
        }
        checks.push({
            name: 'Hidden test isolation',
            passed: hasResetModules,
            message: hasResetModules ? 'Tests use jest.resetModules()' : 'Missing test isolation',
        });
    }
    checks.push({
        name: 'Hidden tests',
        passed: !!challenge.hiddenTests,
        message: challenge.hiddenTests ? 'Hidden tests provided' : 'No hidden tests (recommended)',
    });

    // 5. Check for common test quality issues
    const allTests = (challenge.publicTests || '') + '\n' + (challenge.hiddenTests || '');
    
    // Check for hardcoded values (potential loopholes)
    const hasHardcodedIds = /expect\([^)]+\)\.toEqual\(\s*['"][\w-]{8,}['"]\s*\)/g.test(allTests);
    if (hasHardcodedIds) {
        warnings.push('Tests may contain hardcoded IDs - consider using dynamic data');
    }
    
    // Check for random/unique test data
    const usesRandomData = allTests.includes('Date.now()') || 
                           allTests.includes('Math.random()') || 
                           allTests.includes('uuid');
    checks.push({
        name: 'Dynamic test data',
        passed: usesRandomData,
        message: usesRandomData ? 'Uses dynamic/random test data' : 'Consider using dynamic test data',
    });

    // 6. Check for proper Express app import pattern
    const usesAppRequire = allTests.includes("require('../src/app')") || 
                           allTests.includes('require("../src/app")');
    if (!usesAppRequire) {
        warnings.push('Tests should import app from ../src/app for consistency');
    }

    // 7. Run starter files against tests (should fail)
    if (challenge.solutionFiles && Object.keys(challenge.solutionFiles).length > 0) {
        try {
            // Test starter files - should have some failures
            const starterResult = await runLocalGrader({
                attemptId: 'validation-starter',
                files: challenge.starterFiles,
                publicTests: challenge.publicTests,
                hiddenTests: challenge.hiddenTests,
                dependencies: challenge.dependencies,
                nodeVersion: challenge.nodeVersion,
                timeLimit: 60,
                memoryLimit: 512,
            });

            const totalStarterPassed = starterResult.publicScore + starterResult.hiddenScore;
            const totalTests = starterResult.totalPublic + starterResult.totalHidden;
            
            if (totalStarterPassed === totalTests) {
                errors.push('Starter files pass all tests! This defeats the purpose of the challenge.');
            } else if (starterResult.publicScore === starterResult.totalPublic) {
                warnings.push('Starter files pass all public tests. Consider making some public tests fail initially.');
            }

            checks.push({
                name: 'Starter fails tests',
                passed: totalStarterPassed < totalTests,
                message: `Starter files: ${totalStarterPassed}/${totalTests} tests pass`,
            });

            // Test solution files - should pass all
            const solutionResult = await runLocalGrader({
                attemptId: 'validation-solution',
                files: challenge.solutionFiles,
                publicTests: challenge.publicTests,
                hiddenTests: challenge.hiddenTests,
                dependencies: challenge.dependencies,
                nodeVersion: challenge.nodeVersion,
                timeLimit: 60,
                memoryLimit: 512,
            });

            const totalSolutionPassed = solutionResult.publicScore + solutionResult.hiddenScore;
            
            if (totalSolutionPassed !== totalTests) {
                errors.push(`Solution files fail ${totalTests - totalSolutionPassed} tests! Fix your solution or tests.`);
            }

            checks.push({
                name: 'Solution passes tests',
                passed: totalSolutionPassed === totalTests,
                message: `Solution files: ${totalSolutionPassed}/${totalTests} tests pass`,
            });

        } catch (error) {
            warnings.push(`Could not validate against solution: ${error}`);
        }
    } else {
        warnings.push('No solution files provided for validation. Consider adding them for thorough testing.');
    }

    return {
        isValid: errors.length === 0,
        errors,
        warnings,
        checks,
    };
}

/**
 * Quick validation (without running tests)
 */
export function quickValidate(challenge: ChallengeToValidate): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const checks: ValidationResult['checks'] = [];

    // Basic field checks
    if (!challenge.name?.trim()) errors.push('Challenge name is required');
    if (!Object.keys(challenge.starterFiles || {}).length) errors.push('Starter files required');
    if (!challenge.publicTests?.trim()) errors.push('Public tests required');
    if (!challenge.hiddenTests?.trim()) warnings.push('Hidden tests recommended');

    // Test isolation check
    const publicHasIsolation = challenge.publicTests?.includes('jest.resetModules()') ?? false;
    const hiddenHasIsolation = challenge.hiddenTests?.includes('jest.resetModules()') ?? false;
    
    if (!publicHasIsolation) warnings.push('Add jest.resetModules() to public tests');
    if (challenge.hiddenTests && !hiddenHasIsolation) warnings.push('Add jest.resetModules() to hidden tests');

    checks.push(
        { name: 'Name', passed: !!challenge.name, message: challenge.name || 'Missing' },
        { name: 'Starter files', passed: !!Object.keys(challenge.starterFiles || {}).length, message: `${Object.keys(challenge.starterFiles || {}).length} files` },
        { name: 'Public tests', passed: !!challenge.publicTests, message: challenge.publicTests ? 'Present' : 'Missing' },
        { name: 'Hidden tests', passed: !!challenge.hiddenTests, message: challenge.hiddenTests ? 'Present' : 'Recommended' },
        { name: 'Public test isolation', passed: publicHasIsolation, message: publicHasIsolation ? 'Good' : 'Add jest.resetModules()' },
        { name: 'Hidden test isolation', passed: hiddenHasIsolation || !challenge.hiddenTests, message: hiddenHasIsolation ? 'Good' : 'Add jest.resetModules()' },
    );

    return {
        isValid: errors.length === 0,
        errors,
        warnings,
        checks,
    };
}


