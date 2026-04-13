import type {
    User,
    Challenge,
    Exam,
    ExamAttempt,
    ExamInvitation,
    ProctorEvent,
    GradingResult,
    PaginatedResponse,
    ApiResponse,
} from '@exam-platform/shared';

const API_BASE = process.env.NEXT_PUBLIC_API_URL
    ? `${process.env.NEXT_PUBLIC_API_URL}/api`
    : '/api';

interface FetchOptions extends Omit<RequestInit, 'body'> {
    data?: unknown;
    skipAuth?: boolean;
}

export interface PaginationParams {
    page?: number;
    limit?: number;
    search?: string;
    sortBy?: string;
    order?: 'asc' | 'desc';
}

// Token storage keys
const ACCESS_TOKEN_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';
const LEGACY_TOKEN_KEY = 'token';

// Re-export types for convenience
export type { User, Challenge, Exam, ExamAttempt, ExamInvitation, ProctorEvent, GradingResult };

/**
 * API Client with automatic token refresh
 * 
 * Token Strategy:
 * - Access tokens are short-lived (15 min) and used for API requests
 * - Refresh tokens are long-lived (7 days) and used to get new access tokens
 * - Tokens are automatically refreshed when access token expires
 * - Token rotation: each refresh gives a new refresh token (security)
 */
class ApiClient {
    private accessToken: string | null = null;
    private refreshToken: string | null = null;
    private isRefreshing = false;
    private refreshPromise: Promise<boolean> | null = null;
    private tokenChangeCallbacks: Set<(hasToken: boolean) => void> = new Set();

    constructor() {
        // Load tokens from storage on initialization
        if (typeof window !== 'undefined') {
            this.loadTokens();
        }
    }

    /**
     * Load tokens from localStorage
     */
    private loadTokens(): void {
        this.accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
        this.refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);

        // Migrate from legacy token if needed
        if (!this.accessToken && !this.refreshToken) {
            const legacyToken = localStorage.getItem(LEGACY_TOKEN_KEY);
            if (legacyToken) {
                // Use legacy token as access token temporarily
                // User will need to log in again for proper tokens
                this.accessToken = legacyToken;
                console.log('Migrated from legacy token');
            }
        }
    }

    /**
     * Save tokens to localStorage
     */
    private saveTokens(accessToken: string | null, refreshToken: string | null): void {
        this.accessToken = accessToken;
        this.refreshToken = refreshToken;

        if (typeof window !== 'undefined') {
            if (accessToken) {
                localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
            } else {
                localStorage.removeItem(ACCESS_TOKEN_KEY);
            }

            if (refreshToken) {
                localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
            } else {
                localStorage.removeItem(REFRESH_TOKEN_KEY);
            }

            // Also update legacy token for backwards compatibility
            if (accessToken) {
                localStorage.setItem(LEGACY_TOKEN_KEY, accessToken);
            } else {
                localStorage.removeItem(LEGACY_TOKEN_KEY);
            }
        }

        // Notify callbacks
        this.tokenChangeCallbacks.forEach(cb => cb(!!accessToken));
    }

    /**
     * Subscribe to token changes
     */
    onTokenChange(callback: (hasToken: boolean) => void): () => void {
        this.tokenChangeCallbacks.add(callback);
        return () => this.tokenChangeCallbacks.delete(callback);
    }

    /**
     * Check if user has valid tokens
     */
    hasTokens(): boolean {
        return !!(this.accessToken || this.refreshToken);
    }

    /**
     * Get access token (for socket connections, etc.)
     */
    getToken(): string | null {
        return this.accessToken;
    }

    /**
     * Set token (legacy method, for backwards compatibility)
     */
    setToken(token: string | null): void {
        this.saveTokens(token, this.refreshToken);
    }

    /**
     * Refresh the access token using the refresh token
     */
    private async refreshAccessToken(): Promise<boolean> {
        // If already refreshing, wait for that to complete
        if (this.isRefreshing && this.refreshPromise) {
            return this.refreshPromise;
        }

        if (!this.refreshToken) {
            return false;
        }

        this.isRefreshing = true;

        this.refreshPromise = (async () => {
            try {
                const response = await fetch(`${API_BASE}/auth/refresh`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ refreshToken: this.refreshToken }),
                });

                if (!response.ok) {
                    // Refresh failed - clear tokens and require re-login
                    this.saveTokens(null, null);
                    return false;
                }

                const result = await response.json();

                if (result.success && result.data) {
                    this.saveTokens(result.data.accessToken, result.data.refreshToken);
                    console.log('🔄 Tokens refreshed successfully');
                    return true;
                }

                return false;
            } catch (error) {
                console.error('Token refresh failed:', error);
                return false;
            } finally {
                this.isRefreshing = false;
                this.refreshPromise = null;
            }
        })();

        return this.refreshPromise;
    }

    /**
     * Make an authenticated API request with automatic token refresh
     */
    async fetch<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
        const { data, skipAuth, ...fetchOptions } = options;

        const makeRequest = async (token: string | null): Promise<Response> => {
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                ...((options.headers as Record<string, string>) || {}),
            };

            if (token && !skipAuth) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            return fetch(`${API_BASE}${endpoint}`, {
                ...fetchOptions,
                headers,
                body: data ? JSON.stringify(data) : undefined,
            });
        };

        // First attempt
        let response = await makeRequest(this.accessToken);

        // If unauthorized, try to refresh token
        if (response.status === 401 && this.refreshToken && !options.skipAuth) {
            const refreshed = await this.refreshAccessToken();

            if (refreshed) {
                // Retry with new token
                response = await makeRequest(this.accessToken);
            } else {
                // Refresh failed, throw auth error
                throw new Error('Session expired. Please log in again.');
            }
        }

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || result.message || 'Request failed');
        }

        return result;
    }

    private buildQueryString(params: PaginationParams): string {
        const query = new URLSearchParams();
        if (params.page) query.set('page', String(params.page));
        if (params.limit) query.set('limit', String(params.limit));
        if (params.search) query.set('search', params.search);
        if (params.sortBy) query.set('sortBy', params.sortBy);
        if (params.order) query.set('order', params.order);
        const qs = query.toString();
        return qs ? `?${qs}` : '';
    }

    // ============ AUTH ============

    async login(email: string, password: string): Promise<{ user: User; token: string }> {
        const result = await this.fetch<{
            success: boolean;
            data: {
                user: User;
                token: string;
                accessToken?: string;
                refreshToken?: string;
            }
        }>('/auth/login', {
            method: 'POST',
            data: { email, password },
            skipAuth: true,
        });

        // Use new tokens if available, fall back to legacy token
        if (result.data.accessToken && result.data.refreshToken) {
            this.saveTokens(result.data.accessToken, result.data.refreshToken);
        } else {
            this.saveTokens(result.data.token, null);
        }

        return { user: result.data.user, token: result.data.token };
    }

    async register(
        email: string,
        password: string,
        name?: string,
        role?: 'ADMIN' | 'CANDIDATE' | 'REVIEWER'
    ): Promise<{ user: User; token: string; message?: string }> {
        const result = await this.fetch<{
            success: boolean;
            data: {
                user: User;
                token: string;
                accessToken?: string;
                refreshToken?: string;
            };
            message?: string
        }>('/auth/register', {
            method: 'POST',
            data: { email, password, name, role },
            skipAuth: true,
        });

        // Use new tokens if available, fall back to legacy token
        if (result.data.accessToken && result.data.refreshToken) {
            this.saveTokens(result.data.accessToken, result.data.refreshToken);
        } else {
            this.saveTokens(result.data.token, null);
        }

        return { user: result.data.user, token: result.data.token, message: result.message };
    }

    async getCurrentUser(): Promise<User> {
        const result = await this.fetch<{ success: boolean; data: User }>('/auth/me');
        return result.data;
    }

    /**
     * Logout - revokes refresh token and clears local tokens
     */
    async logout(): Promise<void> {
        // Try to revoke refresh token on server
        if (this.refreshToken) {
            try {
                await fetch(`${API_BASE}/auth/logout`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ refreshToken: this.refreshToken }),
                });
            } catch {
                // Ignore errors on logout
            }
        }

        // Clear local tokens
        this.saveTokens(null, null);
    }

    /**
     * Logout from all devices
     */
    async logoutAll(): Promise<void> {
        if (this.accessToken) {
            try {
                await this.fetch('/auth/logout-all', { method: 'POST' });
            } catch {
                // Ignore errors
            }
        }

        // Clear local tokens
        this.saveTokens(null, null);
    }

    // ============ CHALLENGES ============

    async getChallenges(params: PaginationParams = {}): Promise<PaginatedResponse<Challenge>> {
        return this.fetch<PaginatedResponse<Challenge>>(`/challenges${this.buildQueryString(params)}`);
    }

    async getAllChallenges(): Promise<{ id: string; name: string }[]> {
        const result = await this.fetch<{ success: boolean; data: { id: string; name: string }[] }>('/challenges/all');
        return result.data;
    }

    async getChallenge(id: string): Promise<Challenge> {
        const result = await this.fetch<{ success: boolean; data: Challenge }>(`/challenges/${id}`);
        return result.data;
    }

    async createChallenge(data: {
        name: string;
        description?: string;
        starterFiles: Record<string, string>;
        publicTests: string;
        hiddenTests: string;
        dependencies: Record<string, string>;
        nodeVersion?: string;
        runner?: unknown;
    }): Promise<Challenge> {
        const result = await this.fetch<{ success: boolean; data: Challenge }>('/challenges', {
            method: 'POST',
            data,
        });
        return result.data;
    }

    async updateChallenge(id: string, data: Partial<{
        name: string;
        description: string;
        starterFiles: Record<string, string>;
        publicTests: string;
        hiddenTests: string;
        dependencies: Record<string, string>;
        nodeVersion: string;
        runner: unknown;
    }>): Promise<Challenge> {
        const result = await this.fetch<{ success: boolean; data: Challenge }>(`/challenges/${id}`, {
            method: 'PUT',
            data,
        });
        return result.data;
    }

    async deleteChallenge(id: string): Promise<void> {
        await this.fetch<{ success: boolean }>(`/challenges/${id}`, {
            method: 'DELETE',
        });
    }

    // ============ EXAMS ============

    async getExams(params: PaginationParams = {}): Promise<PaginatedResponse<Exam>> {
        return this.fetch<PaginatedResponse<Exam>>(`/exams${this.buildQueryString(params)}`);
    }

    async getExam(id: string): Promise<Exam> {
        const result = await this.fetch<{ success: boolean; data: Exam }>(`/exams/${id}`);
        return result.data;
    }

    async createExam(data: {
        title: string;
        description?: string;
        challengeId: string;
        timeLimit: number;
        maxAttempts?: number;
        passThreshold?: number;
        fullscreenRequired?: boolean;
        tabSwitchLogging?: boolean;
        pasteDisabled?: boolean;
        // Scheduling
        scheduledStartAt?: string | null;
        scheduledEndAt?: string | null;
        timezone?: string;
    }): Promise<Exam> {
        const result = await this.fetch<{ success: boolean; data: Exam }>('/exams', {
            method: 'POST',
            data,
        });
        return result.data;
    }

    async updateExam(id: string, data: Partial<{
        title: string;
        description: string;
        challengeId: string;
        timeLimit: number;
        maxAttempts: number;
        passThreshold: number;
        fullscreenRequired: boolean;
        tabSwitchLogging: boolean;
        pasteDisabled: boolean;
        // Scheduling
        scheduledStartAt: string | null;
        scheduledEndAt: string | null;
        timezone: string;
    }>): Promise<Exam> {
        const result = await this.fetch<{ success: boolean; data: Exam }>(`/exams/${id}`, {
            method: 'PUT',
            data,
        });
        return result.data;
    }

    async publishExam(id: string): Promise<Exam> {
        const result = await this.fetch<{ success: boolean; data: Exam }>(`/exams/${id}/publish`, {
            method: 'POST',
        });
        return result.data;
    }

    async unpublishExam(id: string): Promise<Exam> {
        const result = await this.fetch<{ success: boolean; data: Exam }>(`/exams/${id}/unpublish`, {
            method: 'POST',
        });
        return result.data;
    }

    async deleteExam(id: string): Promise<void> {
        await this.fetch<{ success: boolean }>(`/exams/${id}`, {
            method: 'DELETE',
        });
    }

    async createInvitation(
        examId: string,
        email: string,
        expiresIn?: number
    ): Promise<{ invitation: ExamInvitation; inviteUrl: string }> {
        const result = await this.fetch<{ success: boolean; data: { invitation: ExamInvitation; inviteUrl: string } }>(`/exams/${examId}/invite`, {
            method: 'POST',
            data: { email, expiresIn },
        });
        return result.data;
    }

    // ============ INVITATIONS ============

    async getInvitation(token: string): Promise<{
        token: string;
        email: string;
        exam: Pick<Exam, 'id' | 'title' | 'description' | 'timeLimit'>;
        expiresAt: string | null;
        usedAt: string | null;
    }> {
        const result = await this.fetch<{
            success: boolean; data: {
                token: string;
                email: string;
                exam: Pick<Exam, 'id' | 'title' | 'description' | 'timeLimit'>;
                expiresAt: string | null;
                usedAt: string | null;
            }
        }>(`/exams/invite/${token}`);
        return result.data;
    }

    async acceptInvitation(token: string): Promise<{ attemptId: string }> {
        const result = await this.fetch<{ success: boolean; data: { attemptId: string } }>(`/exams/invite/${token}/accept`, {
            method: 'POST',
        });
        return result.data;
    }

    // ============ ATTEMPTS ============

    async getAttempts(): Promise<ExamAttempt[]> {
        const result = await this.fetch<{ success: boolean; data: ExamAttempt[] }>('/attempts');
        return result.data;
    }

    async getStarterFiles(attemptId: string): Promise<{ files: Record<string, string> }> {
        const result = await this.fetch<{ success: boolean; data: { files: Record<string, string> } }>(`/attempts/${attemptId}/starter-files`);
        return result.data;
    }

    async getAttempt(id: string): Promise<ExamAttempt> {
        const result = await this.fetch<{ success: boolean; data: ExamAttempt }>(`/attempts/${id}`);
        return result.data;
    }

    async startAttempt(examId: string): Promise<ExamAttempt> {
        const result = await this.fetch<{ success: boolean; data: ExamAttempt }>('/attempts', {
            method: 'POST',
            data: { examId },
        });
        return result.data;
    }

    async saveFiles(attemptId: string, files: Record<string, string>): Promise<void> {
        await this.fetch<{ success: boolean }>(`/attempts/${attemptId}/files`, {
            method: 'PUT',
            data: { files },
        });
    }

    async runTests(attemptId: string): Promise<{ jobId: string }> {
        const result = await this.fetch<{ success: boolean; data: { jobId: string } }>(`/attempts/${attemptId}/run-tests`, {
            method: 'POST',
        });
        return result.data;
    }

    async submitAttempt(attemptId: string, files: Record<string, string>): Promise<{ jobId: string }> {
        const result = await this.fetch<{ success: boolean; data: { jobId: string } }>(`/attempts/${attemptId}/submit`, {
            method: 'POST',
            data: { files },
        });
        return result.data;
    }

    // ============ PROCTOR ============

    async logProctorEvent(event: {
        attemptId: string;
        eventType: string;
        duration?: number;
        pasteLength?: number;
        isMultiline?: boolean;
    }): Promise<void> {
        await this.fetch<{ success: boolean }>('/proctor/event', {
            method: 'POST',
            data: event,
        });
    }

    async getProctorEvents(attemptId: string): Promise<ProctorEvent[]> {
        const result = await this.fetch<{ success: boolean; data: ProctorEvent[] }>(`/proctor/events/${attemptId}`);
        return result.data;
    }

    // ============ REPORTS ============

    async getExamReport(examId: string): Promise<{
        exam: Exam;
        attempts: ExamAttempt[];
        stats: {
            totalAttempts: number;
            averageScore: number;
            passRate: number;
        };
    }> {
        const result = await this.fetch<{
            success: boolean; data: {
                exam: Exam;
                attempts: ExamAttempt[];
                stats: { totalAttempts: number; averageScore: number; passRate: number };
            }
        }>(`/reports/exam/${examId}`);
        return result.data;
    }

    async getAttemptReport(attemptId: string): Promise<{
        attempt: ExamAttempt;
        events: ProctorEvent[];
    }> {
        const result = await this.fetch<{
            success: boolean; data: {
                attempt: ExamAttempt;
                events: ProctorEvent[];
            }
        }>(`/reports/attempt/${attemptId}`);
        return result.data;
    }

    async getDashboard(): Promise<{
        totalExams: number;
        totalChallenges: number;
        totalAttempts: number;
        recentAttempts: ExamAttempt[];
    }> {
        const result = await this.fetch<{
            success: boolean; data: {
                totalExams: number;
                totalChallenges: number;
                totalAttempts: number;
                recentAttempts: ExamAttempt[];
            }
        }>('/reports/dashboard');
        return result.data;
    }

    async getAllAttempts(params: PaginationParams & { status?: string; examId?: string } = {}): Promise<{
        data: Array<{
            id: string;
            candidate: { id: string; name: string | null; email: string };
            exam: { id: string; title: string; challengeName: string | null };
            status: string;
            startedAt: string;
            submittedAt: string | null;
            score: {
                public: number | null;
                hidden: number | null;
                totalPublic: number | null;
                totalHidden: number | null;
                percentage: number | null;
            };
            integrity: {
                tabExits: number;
                fullscreenExits: number;
                pasteAttempts: number;
                outOfWindowSeconds: number;
                flags: number;
            };
        }>;
        total: number;
        page: number;
        limit: number;
    }> {
        const query = new URLSearchParams();
        if (params.page) query.set('page', String(params.page));
        if (params.limit) query.set('limit', String(params.limit));
        if (params.search) query.set('search', params.search);
        if (params.sortBy) query.set('sortBy', params.sortBy);
        if (params.order) query.set('order', params.order);
        if (params.status) query.set('status', params.status);
        if (params.examId) query.set('examId', params.examId);
        const qs = query.toString();
        return this.fetch(`/reports/attempts${qs ? `?${qs}` : ''}`);
    }

    // ============ ADMIN USERS ============

    async getAdminUsers(params: PaginationParams & { status?: string; role?: string } = {}): Promise<PaginatedResponse<User>> {
        const query = new URLSearchParams();
        if (params.page) query.set('page', String(params.page));
        if (params.limit) query.set('limit', String(params.limit));
        if (params.search) query.set('search', params.search);
        if (params.status) query.set('status', params.status);
        if (params.role) query.set('role', params.role);
        const qs = query.toString();
        return this.fetch<PaginatedResponse<User>>(`/admin/users${qs ? `?${qs}` : ''}`);
    }

    async getPendingUsers(): Promise<User[]> {
        const result = await this.fetch<{ success: boolean; data: User[] }>('/admin/users/pending');
        return result.data;
    }

    async approveUser(userId: string): Promise<User> {
        const result = await this.fetch<{ success: boolean; data: User }>(`/admin/users/${userId}/approve`, {
            method: 'POST',
        });
        return result.data;
    }

    async rejectUser(userId: string): Promise<User> {
        const result = await this.fetch<{ success: boolean; data: User }>(`/admin/users/${userId}/reject`, {
            method: 'POST',
        });
        return result.data;
    }

    async changeUserRole(userId: string, role: 'ADMIN' | 'CANDIDATE' | 'REVIEWER'): Promise<User> {
        const result = await this.fetch<{ success: boolean; data: User }>(`/admin/users/${userId}/role`, {
            method: 'PUT',
            data: { role },
        });
        return result.data;
    }

    async getUserStats(): Promise<{
        total: number;
        admins: number;
        reviewers: number;
        candidates: number;
        pendingApproval: number;
    }> {
        const result = await this.fetch<{
            success: boolean; data: {
                total: number;
                admins: number;
                reviewers: number;
                candidates: number;
                pendingApproval: number;
            }
        }>('/admin/users/stats');
        return result.data;
    }

    // ============ CONTAINER POOL MANAGEMENT ============

    async getPoolStatus(): Promise<{
        testRunners: {
            size: number;
            available: number;
            borrowed: number;
            pending: number;
            min: number;
            max: number;
        } | null;
        candidates: Record<string, {
            size: number;
            available: number;
            borrowed: number;
            pending: number;
            min: number;
            max: number;
        }>;
    }> {
        const result = await this.fetch<{
            success: boolean; data: {
                testRunners: {
                    size: number;
                    available: number;
                    borrowed: number;
                    pending: number;
                    min: number;
                    max: number;
                } | null;
                candidates: Record<string, {
                    size: number;
                    available: number;
                    borrowed: number;
                    pending: number;
                    min: number;
                    max: number;
                }>;
            }
        }>('/exams/pool/status');
        return result.data;
    }

    async warmPoolForExam(examId: string, poolSize?: { testRunners?: number; candidates?: number }): Promise<{
        success: boolean;
        examId: string;
        testRunners: number;
        candidateContainers: number;
        warmupTimeMs: number;
        error?: string;
    }> {
        const result = await this.fetch<{
            success: boolean; data: {
                success: boolean;
                examId: string;
                testRunners: number;
                candidateContainers: number;
                warmupTimeMs: number;
                error?: string;
            }
        }>(`/exams/${examId}/warm-pool`, {
            method: 'POST',
            data: poolSize ? { poolSize } : undefined,
        });
        return result.data;
    }

    async getExamWarmupStatus(examId: string): Promise<{
        isWarm: boolean;
        warmedAt?: string;
        testRunners?: number;
        candidates?: number;
        runtime?: string;
    }> {
        const result = await this.fetch<{
            success: boolean; data: {
                isWarm: boolean;
                warmedAt?: string;
                testRunners?: number;
                candidates?: number;
                runtime?: string;
            }
        }>(`/exams/${examId}/warmup-status`);
        return result.data;
    }

    async resizePool(config: {
        testRunners?: number;
        candidates?: number;
        runtime?: string;
    }): Promise<{ success: boolean; message: string }> {
        const result = await this.fetch<{ success: boolean; data: { success: boolean; message: string } }>('/exams/pool/resize', {
            method: 'POST',
            data: config,
        });
        return result.data;
    }

    async drainAllPools(): Promise<void> {
        await this.fetch<{ success: boolean }>('/exams/pool/drain', {
            method: 'DELETE',
        });
    }
}

export const api = new ApiClient();
