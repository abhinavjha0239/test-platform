'use client';

import React, { useState } from 'react';

interface TableColumn {
    name: string;
    type: string;
}

interface TableData {
    columns: TableColumn[];
    rows: Record<string, any>[];
    truncated?: boolean;
}

interface SchemaExplorerProps {
    tables: Record<string, TableData>;
    viewMode?: 'list' | 'grid';
}

const styles = {
    container: {
        height: '100%',
        display: 'flex',
        flexDirection: 'column' as const,
    },
    toolbar: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 12px',
        borderBottom: '1px solid #333',
        backgroundColor: '#252525',
    },
    viewButton: {
        padding: '4px 12px',
        fontSize: '12px',
        borderRadius: '4px',
        border: 'none',
        cursor: 'pointer',
        backgroundColor: '#1e1e1e',
        color: '#aaa',
        transition: 'all 0.2s',
    },
    viewButtonActive: {
        backgroundColor: '#3b82f6',
        color: '#fff',
    },
    content: {
        flex: 1,
        overflow: 'auto',
        padding: '8px',
    },
    tableCard: {
        border: '1px solid #333',
        borderRadius: '8px',
        overflow: 'hidden',
        marginBottom: '12px',
        backgroundColor: '#1e1e1e',
    },
    tableHeader: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 12px',
        backgroundColor: '#252525',
        cursor: 'pointer',
        borderBottom: '1px solid #333',
    },
    tableName: {
        fontFamily: 'Consolas, Monaco, monospace',
        fontSize: '13px',
        fontWeight: 600,
        color: '#e0e0e0',
    },
    rowCount: {
        fontSize: '11px',
        color: '#888',
    },
    schemaRow: {
        display: 'flex',
        flexWrap: 'wrap' as const,
        gap: '8px',
        padding: '8px 12px',
        backgroundColor: '#1a1a1a',
        borderBottom: '1px solid #333',
    },
    columnChip: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        fontSize: '11px',
        fontFamily: 'Consolas, Monaco, monospace',
    },
    columnName: {
        fontWeight: 600,
        color: '#e0e0e0',
    },
    columnType: {
        color: '#888',
    },
    dataTable: {
        width: '100%',
        fontSize: '12px',
        borderCollapse: 'collapse' as const,
    },
    th: {
        padding: '8px 12px',
        textAlign: 'left' as const,
        fontWeight: 600,
        fontSize: '11px',
        backgroundColor: '#252525',
        color: '#aaa',
        borderBottom: '1px solid #333',
        textTransform: 'uppercase' as const,
    },
    td: {
        padding: '6px 12px',
        borderBottom: '1px solid #2a2a2a',
        fontFamily: 'Consolas, Monaco, monospace',
        fontSize: '12px',
        color: '#e0e0e0',
    },
    truncatedNote: {
        padding: '8px 12px',
        fontSize: '11px',
        color: '#666',
        backgroundColor: '#1a1a1a',
    },
    emptyState: {
        padding: '24px',
        textAlign: 'center' as const,
        color: '#666',
        fontSize: '13px',
    },
    nullValue: {
        color: '#666',
        fontStyle: 'italic' as const,
    },
};

export function SchemaExplorer({ tables, viewMode = 'list' }: SchemaExplorerProps) {
    const [expandedTables, setExpandedTables] = useState<Set<string>>(
        new Set(Object.keys(tables))
    );
    const [currentViewMode, setCurrentViewMode] = useState(viewMode);

    const toggleTable = (tableName: string) => {
        const newExpanded = new Set(expandedTables);
        if (newExpanded.has(tableName)) {
            newExpanded.delete(tableName);
        } else {
            newExpanded.add(tableName);
        }
        setExpandedTables(newExpanded);
    };

    const tableEntries = Object.entries(tables);

    if (tableEntries.length === 0) {
        return <div style={styles.emptyState}>No tables available</div>;
    }

    return (
        <div style={styles.container}>
            {/* View Mode Toggle */}
            <div style={styles.toolbar}>
                <button
                    onClick={() => setCurrentViewMode('list')}
                    style={{
                        ...styles.viewButton,
                        ...(currentViewMode === 'list' ? styles.viewButtonActive : {}),
                    }}
                >
                    List View
                </button>
                <button
                    onClick={() => setCurrentViewMode('grid')}
                    style={{
                        ...styles.viewButton,
                        ...(currentViewMode === 'grid' ? styles.viewButtonActive : {}),
                    }}
                >
                    Grid View
                </button>
            </div>

            {/* Content */}
            <div style={styles.content}>
                {tableEntries.map(([name, table]) => (
                    <div key={name} style={styles.tableCard}>
                        {/* Table Header */}
                        <div
                            style={styles.tableHeader}
                            onClick={() => toggleTable(name)}
                        >
                            <span style={styles.tableName}>
                                {expandedTables.has(name) ? '▼' : '▶'} 📋 {name}
                            </span>
                            <span style={styles.rowCount}>
                                {table.rows.length} rows{table.truncated ? '+' : ''}
                            </span>
                        </div>

                        {/* Schema */}
                        {expandedTables.has(name) && (
                            <>
                                <div style={styles.schemaRow}>
                                    {table.columns.map((col) => (
                                        <span key={col.name} style={styles.columnChip}>
                                            <span style={styles.columnName}>{col.name}</span>
                                            <span style={styles.columnType}>({col.type})</span>
                                        </span>
                                    ))}
                                </div>

                                {/* Data Table */}
                                <table style={styles.dataTable}>
                                    <thead>
                                        <tr>
                                            {table.columns.map((col) => (
                                                <th key={col.name} style={styles.th}>
                                                    {col.name}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {table.rows.map((row, i) => (
                                            <tr key={i}>
                                                {table.columns.map((col) => (
                                                    <td key={col.name} style={styles.td}>
                                                        <CellValue value={row[col.name]} />
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>

                                {table.truncated && (
                                    <div style={styles.truncatedNote}>... and more rows</div>
                                )}
                            </>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

// Cell Value Renderer
function CellValue({ value }: { value: any }) {
    if (value === null || value === undefined) {
        return <span style={styles.nullValue}>NULL</span>;
    }
    if (typeof value === 'boolean') {
        return (
            <span style={{ color: value ? '#22c55e' : '#ef4444' }}>
                {value ? 'TRUE' : 'FALSE'}
            </span>
        );
    }
    if (typeof value === 'object') {
        return <span style={{ color: '#888' }}>{JSON.stringify(value)}</span>;
    }
    return <>{String(value)}</>;
}

export default SchemaExplorer;
