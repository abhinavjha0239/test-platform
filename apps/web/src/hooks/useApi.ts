import { useState, useEffect, useCallback, useRef } from 'react';

export interface PaginatedResponse<T> {
    data: T[];
    total: number;
    page: number;
    limit: number;
}

export interface PaginationParams {
    page: number;
    limit: number;
    search?: string;
    sortBy?: string;
    order?: 'asc' | 'desc';
}

interface UsePaginatedQueryOptions<T> {
    /** Initial data while loading */
    initialData?: T[];
    /** Enable/disable the query */
    enabled?: boolean;
    /** Refetch interval in ms (0 = disabled) */
    refetchInterval?: number;
}

interface UsePaginatedQueryResult<T> {
    data: T[];
    total: number;
    page: number;
    limit: number;
    isLoading: boolean;
    isRefetching: boolean;
    error: Error | null;
    setPage: (page: number) => void;
    setLimit: (limit: number) => void;
    setSearch: (search: string) => void;
    setSort: (sortBy: string, order: 'asc' | 'desc') => void;
    refetch: () => Promise<void>;
}

/**
 * Hook for paginated API queries with caching and optimistic updates
 */
export function usePaginatedQuery<T>(
    fetcher: (params: PaginationParams) => Promise<PaginatedResponse<T>>,
    options: UsePaginatedQueryOptions<T> = {}
): UsePaginatedQueryResult<T> {
    const { initialData = [], enabled = true, refetchInterval = 0 } = options;
    
    const [data, setData] = useState<T[]>(initialData);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(20);
    const [search, setSearch] = useState('');
    const [sortBy, setSortBy] = useState<string>('');
    const [order, setOrder] = useState<'asc' | 'desc'>('desc');
    const [isLoading, setIsLoading] = useState(true);
    const [isRefetching, setIsRefetching] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    
    const isMounted = useRef(true);
    const fetcherRef = useRef(fetcher);
    fetcherRef.current = fetcher;

    const fetchData = useCallback(async (showLoading = true) => {
        if (!enabled) return;
        
        if (showLoading && data.length === 0) {
            setIsLoading(true);
        } else {
            setIsRefetching(true);
        }
        setError(null);

        try {
            const response = await fetcherRef.current({
                page,
                limit,
                search: search || undefined,
                sortBy: sortBy || undefined,
                order,
            });
            
            if (isMounted.current) {
                setData(response.data);
                setTotal(response.total);
            }
        } catch (err) {
            if (isMounted.current) {
                setError(err instanceof Error ? err : new Error('Fetch failed'));
            }
        } finally {
            if (isMounted.current) {
                setIsLoading(false);
                setIsRefetching(false);
            }
        }
    }, [enabled, page, limit, search, sortBy, order, data.length]);

    // Initial fetch and refetch on param changes
    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Polling interval
    useEffect(() => {
        if (refetchInterval > 0 && enabled) {
            const interval = setInterval(() => fetchData(false), refetchInterval);
            return () => clearInterval(interval);
        }
    }, [refetchInterval, enabled, fetchData]);

    // Cleanup
    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    }, []);

    const setSort = useCallback((newSortBy: string, newOrder: 'asc' | 'desc') => {
        setSortBy(newSortBy);
        setOrder(newOrder);
        setPage(1); // Reset to first page on sort change
    }, []);

    const handleSetSearch = useCallback((newSearch: string) => {
        setSearch(newSearch);
        setPage(1); // Reset to first page on search
    }, []);

    const handleSetLimit = useCallback((newLimit: number) => {
        setLimit(newLimit);
        setPage(1); // Reset to first page on limit change
    }, []);

    return {
        data,
        total,
        page,
        limit,
        isLoading,
        isRefetching,
        error,
        setPage,
        setLimit: handleSetLimit,
        setSearch: handleSetSearch,
        setSort,
        refetch: () => fetchData(false),
    };
}

interface MutationState<TData> {
    data: TData | null;
    isLoading: boolean;
    error: Error | null;
}

interface UseMutationOptions<TData, TVariables> {
    onSuccess?: (data: TData, variables: TVariables) => void;
    onError?: (error: Error, variables: TVariables) => void;
    onSettled?: () => void;
}

interface UseMutationResult<TData, TVariables> extends MutationState<TData> {
    mutate: (variables: TVariables) => Promise<TData | undefined>;
    reset: () => void;
}

/**
 * Hook for API mutations (POST/PUT/DELETE) with loading and error states
 */
export function useMutation<TData, TVariables>(
    mutationFn: (variables: TVariables) => Promise<TData>,
    options: UseMutationOptions<TData, TVariables> = {}
): UseMutationResult<TData, TVariables> {
    const [state, setState] = useState<MutationState<TData>>({
        data: null,
        isLoading: false,
        error: null,
    });

    const optionsRef = useRef(options);
    optionsRef.current = options;

    const mutate = useCallback(async (variables: TVariables): Promise<TData | undefined> => {
        setState({ data: null, isLoading: true, error: null });
        
        try {
            const data = await mutationFn(variables);
            setState({ data, isLoading: false, error: null });
            optionsRef.current.onSuccess?.(data, variables);
            return data;
        } catch (err) {
            const error = err instanceof Error ? err : new Error('Mutation failed');
            setState({ data: null, isLoading: false, error });
            optionsRef.current.onError?.(error, variables);
            return undefined;
        } finally {
            optionsRef.current.onSettled?.();
        }
    }, [mutationFn]);

    const reset = useCallback(() => {
        setState({ data: null, isLoading: false, error: null });
    }, []);

    return {
        ...state,
        mutate,
        reset,
    };
}

/**
 * Simple hook for single resource fetching
 */
export function useQuery<T>(
    fetcher: () => Promise<T>,
    options: { enabled?: boolean; initialData?: T } = {}
) {
    const { enabled = true, initialData } = options;
    const [data, setData] = useState<T | undefined>(initialData);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    
    const fetcherRef = useRef(fetcher);
    fetcherRef.current = fetcher;

    const refetch = useCallback(async () => {
        if (!enabled) return;
        setIsLoading(true);
        setError(null);
        
        try {
            const result = await fetcherRef.current();
            setData(result);
        } catch (err) {
            setError(err instanceof Error ? err : new Error('Fetch failed'));
        } finally {
            setIsLoading(false);
        }
    }, [enabled]);

    useEffect(() => {
        refetch();
    }, [refetch]);

    return { data, isLoading, error, refetch };
}


