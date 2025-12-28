import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from './api';

interface User {
    id: string;
    email: string;
    name?: string;
    role: 'ADMIN' | 'CANDIDATE' | 'REVIEWER';
}

interface AuthState {
    user: User | null;
    isLoading: boolean;
    error: string | null;

    login: (email: string, password: string) => Promise<void>;
    register: (email: string, password: string, name?: string, role?: string) => Promise<void>;
    logout: () => void;
    checkAuth: () => Promise<void>;
    clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set, get) => ({
            user: null,
            isLoading: false,
            error: null,

            login: async (email, password) => {
                set({ isLoading: true, error: null });
                try {
                    const { user } = await api.login(email, password);
                    set({ user, isLoading: false });
                } catch (error) {
                    set({ error: String(error), isLoading: false });
                    throw error;
                }
            },

            register: async (email, password, name, role) => {
                set({ isLoading: true, error: null });
                try {
                    const { user } = await api.register(email, password, name, role);
                    set({ user, isLoading: false });
                } catch (error) {
                    set({ error: String(error), isLoading: false });
                    throw error;
                }
            },

            logout: () => {
                api.logout();
                set({ user: null });
            },

            checkAuth: async () => {
                const token = api.getToken();
                if (!token) {
                    set({ user: null });
                    return;
                }

                try {
                    const { data } = await api.getCurrentUser();
                    set({ user: data });
                } catch {
                    api.logout();
                    set({ user: null });
                }
            },

            clearError: () => set({ error: null }),
        }),
        {
            name: 'auth-storage',
            partialize: (state) => ({ user: state.user }),
        }
    )
);
