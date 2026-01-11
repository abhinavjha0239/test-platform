'use client';

import { memo, useMemo, ReactNode } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowUpDown, ArrowUp, ArrowDown, Loader2 } from 'lucide-react';
import styles from './DataTable.module.css';

export interface Column<T> {
    key: string;
    header: string;
    sortable?: boolean;
    width?: string;
    render?: (row: T) => ReactNode;
}

export interface SortConfig {
    column: string;
    direction: 'asc' | 'desc';
}

export interface DataTableProps<T> {
    columns: Column<T>[];
    data: T[];
    totalCount: number;
    page: number;
    pageSize: number;
    onPageChange: (page: number) => void;
    sortConfig?: SortConfig;
    onSort?: (column: string, direction: 'asc' | 'desc') => void;
    isLoading?: boolean;
    emptyMessage?: string;
    rowKey: keyof T | ((row: T) => string);
}

const TableRow = memo(function TableRow<T>({
    row,
    columns,
    rowKey,
}: {
    row: T;
    columns: Column<T>[];
    rowKey: keyof T | ((row: T) => string);
}) {
    const key = typeof rowKey === 'function' ? rowKey(row) : String(row[rowKey]);
    
    return (
        <tr key={key}>
            {columns.map((col) => (
                <td key={col.key} style={col.width ? { width: col.width } : undefined}>
                    {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? '')}
                </td>
            ))}
        </tr>
    );
});

export function DataTable<T>({
    columns,
    data,
    totalCount,
    page,
    pageSize,
    onPageChange,
    sortConfig,
    onSort,
    isLoading = false,
    emptyMessage = 'No data found',
    rowKey,
}: DataTableProps<T>) {
    const totalPages = useMemo(() => Math.ceil(totalCount / pageSize), [totalCount, pageSize]);
    
    const handleSort = (column: string) => {
        if (!onSort) return;
        const newDirection = sortConfig?.column === column && sortConfig.direction === 'asc' ? 'desc' : 'asc';
        onSort(column, newDirection);
    };

    const renderSortIcon = (column: string, sortable?: boolean) => {
        if (!sortable || !onSort) return null;
        
        if (sortConfig?.column === column) {
            return sortConfig.direction === 'asc' 
                ? <ArrowUp size={14} /> 
                : <ArrowDown size={14} />;
        }
        return <ArrowUpDown size={14} className={styles.sortInactive} />;
    };

    const pageNumbers = useMemo(() => {
        const pages: number[] = [];
        const start = Math.max(1, page - 2);
        const end = Math.min(totalPages, page + 2);
        for (let i = start; i <= end; i++) pages.push(i);
        return pages;
    }, [page, totalPages]);

    return (
        <div className={styles.container}>
            <div className={styles.tableWrapper}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            {columns.map((col) => (
                                <th
                                    key={col.key}
                                    style={col.width ? { width: col.width } : undefined}
                                    className={col.sortable ? styles.sortable : undefined}
                                    onClick={col.sortable ? () => handleSort(col.key) : undefined}
                                >
                                    <span className={styles.headerContent}>
                                        {col.header}
                                        {renderSortIcon(col.key, col.sortable)}
                                    </span>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? (
                            <tr>
                                <td colSpan={columns.length} className={styles.loading}>
                                    <Loader2 className={styles.spinner} size={24} />
                                    <span>Loading...</span>
                                </td>
                            </tr>
                        ) : data.length === 0 ? (
                            <tr>
                                <td colSpan={columns.length} className={styles.empty}>
                                    {emptyMessage}
                                </td>
                            </tr>
                        ) : (
                            data.map((row, idx) => (
                                <TableRow 
                                    key={typeof rowKey === 'function' ? rowKey(row) : String(row[rowKey])}
                                    row={row} 
                                    columns={columns} 
                                    rowKey={rowKey}
                                />
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {totalPages > 1 && (
                <div className={styles.pagination}>
                    <span className={styles.pageInfo}>
                        Showing {(page - 1) * pageSize + 1} - {Math.min(page * pageSize, totalCount)} of {totalCount}
                    </span>
                    
                    <div className={styles.pageControls}>
                        <button
                            onClick={() => onPageChange(1)}
                            disabled={page === 1 || isLoading}
                            className={styles.pageBtn}
                            aria-label="First page"
                        >
                            <ChevronsLeft size={16} />
                        </button>
                        <button
                            onClick={() => onPageChange(page - 1)}
                            disabled={page === 1 || isLoading}
                            className={styles.pageBtn}
                            aria-label="Previous page"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        
                        {pageNumbers.map((p) => (
                            <button
                                key={p}
                                onClick={() => onPageChange(p)}
                                disabled={isLoading}
                                className={`${styles.pageBtn} ${p === page ? styles.pageBtnActive : ''}`}
                            >
                                {p}
                            </button>
                        ))}
                        
                        <button
                            onClick={() => onPageChange(page + 1)}
                            disabled={page === totalPages || isLoading}
                            className={styles.pageBtn}
                            aria-label="Next page"
                        >
                            <ChevronRight size={16} />
                        </button>
                        <button
                            onClick={() => onPageChange(totalPages)}
                            disabled={page === totalPages || isLoading}
                            className={styles.pageBtn}
                            aria-label="Last page"
                        >
                            <ChevronsRight size={16} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}


