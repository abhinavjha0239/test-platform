'use client';

import React from 'react';

interface DiffViewerProps {
    expected: Record<string, any>[];
    actual: Record<string, any>[];
    testName?: string;
    onClose?: () => void;
}

/**
 * DiffViewer - Side-by-side comparison of Expected vs Actual query results
 * Shows differences with color coding for missing/extra rows
 */
export function DiffViewer({ expected, actual, testName, onClose }: DiffViewerProps) {
    // Get all unique column names
    const expectedCols = expected.length > 0 ? Object.keys(expected[0]) : [];
    const actualCols = actual.length > 0 ? Object.keys(actual[0]) : [];
    const allColumns = Array.from(new Set([...expectedCols, ...actualCols]));

    const columnsMismatch = JSON.stringify(expectedCols.sort()) !== JSON.stringify(actualCols.sort());
    const rowCountMismatch = expected.length !== actual.length;

    // Create string keys for row comparison
    const expectedSet = new Set(expected.map(row => JSON.stringify(row)));
    const actualSet = new Set(actual.map(row => JSON.stringify(row)));

    return (
        <div className="bg-background border rounded-lg overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-muted/50 border-b">
                <div className="flex items-center gap-3">
                    <span className="text-lg">📊</span>
                    <div>
                        <h3 className="font-semibold text-sm">
                            {testName || 'Result Comparison'}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                            Expected: {expected.length} rows | Actual: {actual.length} rows
                        </p>
                    </div>
                </div>
                {onClose && (
                    <button
                        onClick={onClose}
                        className="text-muted-foreground hover:text-foreground p-1"
                    >
                        ✕
                    </button>
                )}
            </div>

            {/* Warnings */}
            {(columnsMismatch || rowCountMismatch) && (
                <div className="px-4 py-2 bg-yellow-50 dark:bg-yellow-950/20 border-b">
                    {columnsMismatch && (
                        <p className="text-xs text-yellow-700 dark:text-yellow-400">
                            ⚠️ Column mismatch: Expected [{expectedCols.join(', ')}] but got [{actualCols.join(', ')}]
                        </p>
                    )}
                    {rowCountMismatch && (
                        <p className="text-xs text-yellow-700 dark:text-yellow-400">
                            ⚠️ Row count mismatch: Expected {expected.length} rows but got {actual.length} rows
                        </p>
                    )}
                </div>
            )}

            {/* Side-by-side comparison */}
            <div className="grid grid-cols-2 divide-x">
                {/* Expected */}
                <div>
                    <div className="px-4 py-2 bg-green-50 dark:bg-green-950/20 border-b">
                        <h4 className="font-semibold text-sm text-green-700 dark:text-green-400">
                            ✅ Expected
                        </h4>
                    </div>
                    <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                        <ResultTable
                            rows={expected}
                            columns={allColumns}
                            highlight="green"
                            comparisonSet={actualSet}
                            showMissing
                        />
                    </div>
                </div>

                {/* Actual */}
                <div>
                    <div className="px-4 py-2 bg-red-50 dark:bg-red-950/20 border-b">
                        <h4 className="font-semibold text-sm text-red-700 dark:text-red-400">
                            ❌ Your Output
                        </h4>
                    </div>
                    <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                        <ResultTable
                            rows={actual}
                            columns={allColumns}
                            highlight="red"
                            comparisonSet={expectedSet}
                            showExtra
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}

// Result Table Component
function ResultTable({
    rows,
    columns,
    highlight,
    comparisonSet,
    showMissing = false,
    showExtra = false,
}: {
    rows: Record<string, any>[];
    columns: string[];
    highlight: 'green' | 'red';
    comparisonSet?: Set<string>;
    showMissing?: boolean;
    showExtra?: boolean;
}) {
    if (rows.length === 0) {
        return (
            <div className="p-4 text-center text-sm text-muted-foreground italic">
                No rows
            </div>
        );
    }

    return (
        <table className="w-full text-xs">
            <thead>
                <tr className="bg-muted/30">
                    {columns.map((col) => (
                        <th
                            key={col}
                            className="px-3 py-2 text-left font-semibold border-b"
                        >
                            {col}
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {rows.map((row, i) => {
                    const rowKey = JSON.stringify(row);
                    const isInOther = comparisonSet?.has(rowKey);
                    const shouldHighlight = showMissing ? !isInOther : showExtra ? !isInOther : false;

                    return (
                        <tr
                            key={i}
                            className={`
                                ${shouldHighlight && highlight === 'green'
                                    ? 'bg-red-100 dark:bg-red-950/30'
                                    : ''
                                }
                                ${shouldHighlight && highlight === 'red'
                                    ? 'bg-yellow-100 dark:bg-yellow-950/30'
                                    : ''
                                }
                                hover:bg-muted/20
                            `}
                        >
                            {columns.map((col) => (
                                <td
                                    key={col}
                                    className="px-3 py-1.5 border-b border-border/50 font-mono"
                                >
                                    <CellValue value={row[col]} />
                                </td>
                            ))}
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
}

// Cell Value Renderer
function CellValue({ value }: { value: any }) {
    if (value === null || value === undefined) {
        return <span className="text-muted-foreground italic">NULL</span>;
    }
    if (typeof value === 'boolean') {
        return (
            <span className={value ? 'text-green-600' : 'text-red-600'}>
                {value ? 'TRUE' : 'FALSE'}
            </span>
        );
    }
    if (typeof value === 'object') {
        return <span className="text-muted-foreground">{JSON.stringify(value)}</span>;
    }
    return <>{String(value)}</>;
}

export default DiffViewer;
