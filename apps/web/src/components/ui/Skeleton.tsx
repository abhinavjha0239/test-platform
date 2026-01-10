'use client';

import styles from './Skeleton.module.css';

interface SkeletonProps {
    width?: string | number;
    height?: string | number;
    borderRadius?: string | number;
    className?: string;
}

export function Skeleton({ 
    width = '100%', 
    height = 20, 
    borderRadius = 4,
    className = '' 
}: SkeletonProps) {
    return (
        <div
            className={`${styles.skeleton} ${className}`}
            style={{
                width: typeof width === 'number' ? `${width}px` : width,
                height: typeof height === 'number' ? `${height}px` : height,
                borderRadius: typeof borderRadius === 'number' ? `${borderRadius}px` : borderRadius,
            }}
        />
    );
}

export function SkeletonText({ lines = 3, gap = 8 }: { lines?: number; gap?: number }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap }}>
            {Array.from({ length: lines }).map((_, i) => (
                <Skeleton 
                    key={i} 
                    height={16} 
                    width={i === lines - 1 ? '60%' : '100%'} 
                />
            ))}
        </div>
    );
}

export function SkeletonTable({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
    return (
        <div className={styles.table}>
            <div className={styles.tableHeader}>
                {Array.from({ length: columns }).map((_, i) => (
                    <Skeleton key={i} height={14} width="80%" />
                ))}
            </div>
            {Array.from({ length: rows }).map((_, rowIdx) => (
                <div key={rowIdx} className={styles.tableRow}>
                    {Array.from({ length: columns }).map((_, colIdx) => (
                        <Skeleton 
                            key={colIdx} 
                            height={18} 
                            width={colIdx === 0 ? '70%' : colIdx === columns - 1 ? 80 : '50%'} 
                        />
                    ))}
                </div>
            ))}
        </div>
    );
}

export function SkeletonCard() {
    return (
        <div className={styles.card}>
            <Skeleton height={24} width="60%" />
            <Skeleton height={14} width="40%" />
            <div style={{ marginTop: 16 }}>
                <SkeletonText lines={2} />
            </div>
            <Skeleton height={36} width={120} borderRadius={6} />
        </div>
    );
}


