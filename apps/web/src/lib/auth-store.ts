import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from './api';

interface User {
    id: string;
    email: string;
    name?: string;
    role: 'ADMIN' | 'CANDIDATE' | 'REVIEWER';
    approvalStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';
}

interface AuthState {
    user: User | null;
    isLoading: boolean;
    error: string | null;
    isInitialized: boolean;

    login: (email: string, password: string) => Promise<void>;
    register: (email: string, password: string, name?: string, role?: string) => Promise<{ message?: string }>;
    logout: () => Promise<void>;
    logoutAll: () => Promise<void>;
    checkAuth: () => Promise<void>;
    clearError: () => void;
    initialize: () => void;
}

/**
 * Auth Store with Zustand
 * 
 * Features:
 * - Persists user data across page reloads
 * - Syncs with API client token management
 * - Handles login, logout, and session verification
 * - Supports logout from all devices
 */
export const useAuthStore = create<AuthState>()(
    persist(
        (set, get) => ({
            user: null,
            isLoading: false,
            error: null,
            isInitialized: false,

            /**
             * Initialize auth state on app load
             */
            initialize: () => {
                if (get().isInitialized) return;
                
                set({ isInitialized: true });
                
                // Subscribe to token changes from API client
                api.onTokenChange((hasToken) => {
                    if (!hasToken) {
                        set({ user: null });
                    }
                });
            },

            /**
             * Login with email and password
             */
            login: async (email, password) => {
                set({ isLoading: true, error: null });
                try {
                    const { user } = await api.login(email, password);
                    set({ 
                        user: user as User, 
                        isLoading: false 
                    });
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Login failed';
                    set({ error: message, isLoading: false });
                    throw error;
                }
            },

            /**
             * Register new account
             */
            register: async (email, password, name, role) => {
                set({ isLoading: true, error: null });
                try {
                    const { user, message } = await api.register(
                        email, 
                        password, 
                        name, 
                        role as 'ADMIN' | 'CANDIDATE' | 'REVIEWER' | undefined
                    );
                    set({ 
                        user: user as User, 
                        isLoading: false 
                    });
                    return { message };
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Registration failed';
                    set({ error: message, isLoading: false });
                    throw error;
                }
            },

            /**
             * Logout from current device
             */
            logout: async () => {
                try {
                    await api.logout();
                } finally {
                    set({ user: null });
                }
            },

            /**
             * Logout from all devices
             */
            logoutAll: async () => {
                try {
                    await api.logoutAll();
                } finally {
                    set({ user: null });
                }
            },

            /**
             * Check if current session is valid
             */
            checkAuth: async () => {
                if (!api.hasTokens()) {
                    set({ user: null });
                    return;
                }

                try {
                    set({ isLoading: true });
                    const user = await api.getCurrentUser();
                    set({ 
                        user: user as User, 
                        isLoading: false 
                    });
                } catch (error) {
                    // Session invalid - tokens will be cleared by API client
                    set({ user: null, isLoading: false });
                }
            },

            /**
             * Clear error state
             */
            clearError: () => set({ error: null }),
        }),
        {
            name: 'auth-storage',
            partialize: (state) => ({ user: state.user }),
            onRehydrateStorage: () => (state) => {
                // Initialize after rehydration
                if (state) {
                    state.initialize();
                }
            },
        }
    )
);

/**
 * Hook to check if user is authenticated
 */
export function useIsAuthenticated(): boolean {
    const user = useAuthStore((state) => state.user);
    return user !== null;
}

/**
 * Hook to get user role
 */
export function useUserRole(): 'ADMIN' | 'CANDIDATE' | 'REVIEWER' | null {
    const user = useAuthStore((state) => state.user);
    return user?.role ?? null;
}

/**
 * Hook to check if user is admin
 */
export function useIsAdmin(): boolean {
    const role = useUserRole();
    return role === 'ADMIN';
}
