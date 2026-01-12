'use client';

import { useState, useEffect } from 'react';
import { Database, Table2, Loader2, ChevronLeft, ChevronRight, Search, RefreshCw, Hash, Calendar, Type, Link2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { getTablesAction, getTableDataAction, getTableSchemaAction } from '@/actions/database';

interface TableInfo {
    name: string;
    count: number;
}

interface ColumnInfo {
    name: string;
    type: string;
    isRelation?: boolean;
}

export default function DatabaseViewerPage() {
    const { toast } = useToast();
    const [tables, setTables] = useState<TableInfo[]>([]);
    const [selectedTable, setSelectedTable] = useState<string | null>(null);
    const [columns, setColumns] = useState<ColumnInfo[]>([]);
    const [data, setData] = useState<any[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize] = useState(50);
    const [isLoadingTables, setIsLoadingTables] = useState(true);
    const [isLoadingData, setIsLoadingData] = useState(false);
    const [tableSearch, setTableSearch] = useState('');

    // Load tables on mount
    useEffect(() => {
        loadTables();
    }, []);

    // Load data when table or page changes
    useEffect(() => {
        if (selectedTable) {
            loadTableData(selectedTable, page);
        }
    }, [selectedTable, page]);

    const loadTables = async () => {
        setIsLoadingTables(true);
        try {
            const result = await getTablesAction();
            if (result.error) {
                toast({ title: "Errore", description: result.error, variant: "destructive" });
            } else if (result.tables) {
                setTables(result.tables);
            }
        } catch {
            toast({ title: "Errore", description: "Impossibile caricare le tabelle", variant: "destructive" });
        } finally {
            setIsLoadingTables(false);
        }
    };

    const loadTableData = async (tableName: string, pageNum: number) => {
        setIsLoadingData(true);
        try {
            // Load schema and data in parallel
            const [schemaResult, dataResult] = await Promise.all([
                getTableSchemaAction(tableName),
                getTableDataAction(tableName, pageNum, pageSize)
            ]);

            if (schemaResult.columns) {
                // Filter out relation fields for cleaner display
                setColumns(schemaResult.columns.filter(c => !c.isRelation));
            }

            if (dataResult.error) {
                toast({ title: "Errore", description: dataResult.error, variant: "destructive" });
            } else {
                setData(dataResult.data || []);
                setTotal(dataResult.total || 0);
            }
        } catch {
            toast({ title: "Errore", description: "Impossibile caricare i dati", variant: "destructive" });
        } finally {
            setIsLoadingData(false);
        }
    };

    const handleTableSelect = (tableName: string) => {
        setSelectedTable(tableName);
        setPage(1);
        setData([]);
        setColumns([]);
    };

    const filteredTables = tables.filter(t =>
        t.name.toLowerCase().includes(tableSearch.toLowerCase())
    );

    const totalPages = Math.ceil(total / pageSize);

    const getTypeIcon = (type: string) => {
        const lowerType = type.toLowerCase();
        if (lowerType.includes('int') || lowerType.includes('float') || lowerType.includes('decimal')) {
            return <Hash className="h-3 w-3 text-blue-500" />;
        }
        if (lowerType.includes('date') || lowerType.includes('time')) {
            return <Calendar className="h-3 w-3 text-orange-500" />;
        }
        return <Type className="h-3 w-3 text-gray-500" />;
    };

    const formatCellValue = (value: any): string => {
        if (value === null || value === undefined) return '—';
        if (typeof value === 'boolean') return value ? 'Sì' : 'No';
        if (typeof value === 'object') {
            try {
                return JSON.stringify(value).substring(0, 100) + (JSON.stringify(value).length > 100 ? '...' : '');
            } catch {
                return '[Object]';
            }
        }
        const str = String(value);
        return str.length > 100 ? str.substring(0, 100) + '...' : str;
    };

    return (
        <div className="flex h-[calc(100vh-80px)] gap-4 p-4">
            {/* Tables Sidebar */}
            <Card className="w-64 flex flex-col shrink-0 overflow-hidden">
                <CardHeader className="p-4 pb-3 border-b">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Database className="h-4 w-4 text-primary" />
                        Tabelle
                    </CardTitle>
                    <CardDescription className="text-xs">
                        {tables.length} tabelle nel database
                    </CardDescription>
                </CardHeader>
                <div className="p-3 border-b">
                    <div className="flex items-center border rounded-md px-2.5 py-1.5 bg-muted/30">
                        <Search className="h-3.5 w-3.5 opacity-50 mr-2 shrink-0" />
                        <Input
                            placeholder="Cerca tabella..."
                            value={tableSearch}
                            onChange={e => setTableSearch(e.target.value)}
                            className="border-0 h-6 text-xs focus-visible:ring-0 bg-transparent p-0"
                        />
                    </div>
                </div>
                <ScrollArea className="flex-1">
                    <div className="p-2">
                        {isLoadingTables ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                            </div>
                        ) : (
                            <div className="space-y-0.5">
                                {filteredTables.map(table => (
                                    <button
                                        key={table.name}
                                        onClick={() => handleTableSelect(table.name)}
                                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${selectedTable === table.name
                                                ? 'bg-primary text-primary-foreground'
                                                : 'hover:bg-muted text-foreground'
                                            }`}
                                    >
                                        <span className="flex items-center gap-2 truncate">
                                            <Table2 className="h-3 w-3 shrink-0 opacity-70" />
                                            <span className="truncate">{table.name}</span>
                                        </span>
                                        <Badge
                                            variant={selectedTable === table.name ? "secondary" : "outline"}
                                            className="ml-1.5 shrink-0 text-[10px] h-5 px-1.5"
                                        >
                                            {table.count}
                                        </Badge>
                                    </button>
                                ))}
                                {filteredTables.length === 0 && (
                                    <p className="text-xs text-muted-foreground text-center py-4">
                                        Nessuna tabella trovata
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                </ScrollArea>
                <div className="p-2 border-t">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={loadTables}
                        className="w-full h-7 text-xs"
                        disabled={isLoadingTables}
                    >
                        <RefreshCw className={`h-3 w-3 mr-1.5 ${isLoadingTables ? 'animate-spin' : ''}`} />
                        Ricarica
                    </Button>
                </div>
            </Card>

            {/* Data View */}
            <Card className="flex-1 flex flex-col overflow-hidden">
                {!selectedTable ? (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="text-center text-muted-foreground">
                            <Database className="h-16 w-16 mx-auto mb-4 opacity-20" />
                            <p className="text-lg font-medium">Database Explorer</p>
                            <p className="text-sm">Seleziona una tabella per visualizzare i dati</p>
                        </div>
                    </div>
                ) : (
                    <>
                        <CardHeader className="pb-2 border-b">
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="flex items-center gap-2">
                                        <Table2 className="h-5 w-5 text-primary" />
                                        {selectedTable}
                                    </CardTitle>
                                    <CardDescription>
                                        {total} record totali • Pagina {page} di {totalPages || 1}
                                    </CardDescription>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => loadTableData(selectedTable, page)}
                                    disabled={isLoadingData}
                                >
                                    <RefreshCw className={`h-3.5 w-3.5 mr-2 ${isLoadingData ? 'animate-spin' : ''}`} />
                                    Ricarica
                                </Button>
                            </div>
                        </CardHeader>

                        <CardContent className="flex-1 p-0 overflow-hidden">
                            {isLoadingData ? (
                                <div className="flex items-center justify-center h-full">
                                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                    <span className="ml-3 text-muted-foreground">Caricamento dati...</span>
                                </div>
                            ) : data.length === 0 ? (
                                <div className="flex items-center justify-center h-full text-muted-foreground">
                                    <p>Nessun record trovato</p>
                                </div>
                            ) : (
                                <div className="overflow-auto h-full">
                                    <Table>
                                        <TableHeader className="bg-muted/50 sticky top-0">
                                            <TableRow>
                                                {columns.map(col => (
                                                    <TableHead key={col.name} className="whitespace-nowrap">
                                                        <span className="flex items-center gap-1.5">
                                                            {getTypeIcon(col.type)}
                                                            {col.name}
                                                        </span>
                                                    </TableHead>
                                                ))}
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {data.map((row, idx) => (
                                                <TableRow key={row.id || idx}>
                                                    {columns.map(col => (
                                                        <TableCell
                                                            key={col.name}
                                                            className="text-xs font-mono max-w-[300px] truncate"
                                                            title={String(row[col.name] ?? '')}
                                                        >
                                                            {formatCellValue(row[col.name])}
                                                        </TableCell>
                                                    ))}
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </CardContent>

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div className="border-t p-3 flex items-center justify-between">
                                <p className="text-sm text-muted-foreground">
                                    Mostrando {((page - 1) * pageSize) + 1}-{Math.min(page * pageSize, total)} di {total}
                                </p>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setPage(p => Math.max(1, p - 1))}
                                        disabled={page === 1 || isLoadingData}
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                    </Button>
                                    <span className="text-sm px-2">
                                        {page} / {totalPages}
                                    </span>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                        disabled={page >= totalPages || isLoadingData}
                                    >
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </Card>
        </div>
    );
}
