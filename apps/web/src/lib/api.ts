const API_BASE = '/api';

interface FetchOptions extends RequestInit {
    data?: unknown;
}

class ApiClient {
    private token: string | null = null;

    setToken(token: string | null) {
        this.token = token;
        if (typeof window !== 'undefined') {
            if (token) {
                localStorage.setItem('token', token);
            } else {
                localStorage.removeItem('token');
            }
        }
    }

    getToken(): string | null {
        if (this.token) return this.token;
        if (typeof window !== 'undefined') {
            this.token = localStorage.getItem('token');
        }
        return this.token;
    }

    private async fetch<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
        const { data, ...fetchOptions } = options;

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...((options.headers as Record<string, string>) || {}),
        };

        const token = this.getToken();
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(`${API_BASE}${endpoint}`, {
            ...fetchOptions,
            headers,
            body: data ? JSON.stringify(data) : undefined,
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || result.message || 'Request failed');
        }

        return result;
    }

    // Auth
    async login(email: string, password: string) {
        const result = await this.fetch<{ success: boolean; data: { user: any; token: string } }>('/auth/login', {
            method: 'POST',
            data: { email, password },
        });
        this.setToken(result.data.token);
        return result.data;
    }

    async register(email: string, password: string, name?: string, role?: string) {
        const result = await this.fetch<{ success: boolean; data: { user: any; token: string } }>('/auth/register', {
            method: 'POST',
            data: { email, password, name, role },
        });
        this.setToken(result.data.token);
        return result.data;
    }

    async getCurrentUser() {
        return this.fetch<{ success: boolean; data: any }>('/auth/me');
    }

    logout() {
        this.setToken(null);
    }

    // Challenges
    async getChallenges() {
        return this.fetch<{ success: boolean; data: any[] }>('/challenges');
    }

    async getChallenge(id: string) {
        return this.fetch<{ success: boolean; data: any }>(`/challenges/${id}`);
    }

    async createChallenge(data: any) {
        return this.fetch<{ success: boolean; data: any }>('/challenges', {
            method: 'POST',
            data,
        });
    }

    async updateChallenge(id: string, data: any) {
        return this.fetch<{ success: boolean; data: any }>(`/challenges/${id}`, {
            method: 'PUT',
            data,
        });
    }

    async deleteChallenge(id: string) {
        return this.fetch<{ success: boolean }>(`/challenges/${id}`, {
            method: 'DELETE',
        });
    }

    // Exams
    async getExams() {
        return this.fetch<{ success: boolean; data: any[] }>('/exams');
    }

    async getExam(id: string) {
        return this.fetch<{ success: boolean; data: any }>(`/exams/${id}`);
    }

    async createExam(data: any) {
        return this.fetch<{ success: boolean; data: any }>('/exams', {
            method: 'POST',
            data,
        });
    }

    async updateExam(id: string, data: any) {
        return this.fetch<{ success: boolean; data: any }>(`/exams/${id}`, {
            method: 'PUT',
            data,
        });
    }

    async publishExam(id: string) {
        return this.fetch<{ success: boolean; data: any }>(`/exams/${id}/publish`, {
            method: 'POST',
        });
    }

    async deleteExam(id: string) {
        return this.fetch<{ success: boolean }>(`/exams/${id}`, {
            method: 'DELETE',
        });
    }

    async createInvitation(examId: string, email: string, expiresIn?: number) {
        return this.fetch<{ success: boolean; data: { invitation: any; inviteUrl: string } }>(`/exams/${examId}/invite`, {
            method: 'POST',
            data: { email, expiresIn },
        });
    }

    // Attempts
    async getAttempts() {
        return this.fetch<{ success: boolean; data: any[] }>('/attempts');
    }

    async getAttempt(id: string) {
        return this.fetch<{ success: boolean; data: any }>(`/attempts/${id}`);
    }

    async startAttempt(examId: string) {
        return this.fetch<{ success: boolean; data: any }>('/attempts', {
            method: 'POST',
            data: { examId },
        });
    }

    async saveFiles(attemptId: string, files: Record<string, string>) {
        return this.fetch<{ success: boolean; data: any }>(`/attempts/${attemptId}/files`, {
            method: 'PUT',
            data: { files },
        });
    }

    async runTests(attemptId: string) {
        return this.fetch<{ success: boolean; data: { jobId: string } }>(`/attempts/${attemptId}/run-tests`, {
            method: 'POST',
        });
    }

    async submitAttempt(attemptId: string, files: Record<string, string>) {
        return this.fetch<{ success: boolean; data: { jobId: string } }>(`/attempts/${attemptId}/submit`, {
            method: 'POST',
            data: { files },
        });
    }

    // Proctor
    async logProctorEvent(event: {
        attemptId: string;
        eventType: string;
        duration?: number;
        pasteLength?: number;
        isMultiline?: boolean;
    }) {
        return this.fetch<{ success: boolean }>('/proctor/event', {
            method: 'POST',
            data: event,
        });
    }

    // Reports
    async getExamReport(examId: string) {
        return this.fetch<{ success: boolean; data: any }>(`/reports/exam/${examId}`);
    }

    async getAttemptReport(attemptId: string) {
        return this.fetch<{ success: boolean; data: any }>(`/reports/attempt/${attemptId}`);
    }

    async getDashboard() {
        return this.fetch<{ success: boolean; data: any }>('/reports/dashboard');
    }
}

export const api = new ApiClient();
