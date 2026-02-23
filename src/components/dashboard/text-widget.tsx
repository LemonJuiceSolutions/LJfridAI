'use client';

import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import { Bold, Italic, Underline, List, Palette, Variable, Loader2, BarChart2, Table, Sigma, ArrowUpDown, MoreHorizontal, Check, Search, RefreshCw, Zap, ChevronDown, Type, ALargeSmall } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import {
    Table as UiTable,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { ScrollArea } from '../ui/scroll-area';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { HtmlStyleOverrides } from '@/lib/html-style-utils';
import { applyHtmlStyleOverrides } from '@/lib/html-style-utils';


interface TextWidgetProps {
    content: string;
    onContentChange: (content: string) => void;
    isEditing: boolean;
    reportData?: any;
    reportType?: 'table' | 'kpi' | 'chart' | 'html';
    isLoadingData?: boolean;
    onRefresh?: () => void;
    isRefreshing?: boolean;
    onUpdateHierarchy?: () => void;
    htmlStyleOverrides?: HtmlStyleOverrides;
}

const ChartRenderer = ({ data }: { data: { name: string; value: number }[] }) => {
    if (!data || !Array.isArray(data) || data.length === 0) return <p className="text-xs text-muted-foreground my-4">[Dati del grafico non disponibili o in formato non corretto]</p>
    return (
        <div className='h-60 w-full my-4'>
            <ResponsiveContainer>
                <BarChart data={data} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                    <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis fontSize={10} tickLine={false} axisLine={false} />
                    <Tooltip
                        contentStyle={{
                            background: "hsl(var(--background))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "var(--radius)",
                            fontSize: '12px'
                        }}
                    />
                    <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    )
}

type SortState = {
    column: string;
    direction: 'asc' | 'desc';
};

const TableRenderer = ({ data }: { data: any[] }) => {
    const [sort, setSort] = useState<SortState | null>(null);
    const [filters, setFilters] = useState<Record<string, string>>({});
    const [multiSelectFilters, setMultiSelectFilters] = useState<Record<string, Set<string>>>(Object.fromEntries(data && data.length > 0 ? Object.keys(data[0]).map(key => [key, new Set()]) : []));

    if (!data || !Array.isArray(data) || data.length === 0) return <p className="text-xs text-muted-foreground my-4">[Dati della tabella non disponibili]</p>

    const headers = Object.keys(data[0]);

    const getUniqueColumnValues = useCallback((column: string) => {
        const values = new Set(data.map(row => String(row[column])));
        return Array.from(values);
    }, [data]);

    const handleSort = (column: string) => {
        if (sort && sort.column === column) {
            setSort({ column, direction: sort.direction === 'asc' ? 'desc' : 'asc' });
        } else {
            setSort({ column, direction: 'asc' });
        }
    };

    const handleFilterChange = (column: string, value: string) => {
        setFilters(prev => ({ ...prev, [column]: value }));
    };

    const handleMultiSelectFilterChange = (column: string, value: string) => {
        setMultiSelectFilters(prev => {
            const newSet = new Set(prev[column]);
            if (newSet.has(value)) {
                newSet.delete(value);
            } else {
                newSet.add(value);
            }
            return { ...prev, [column]: newSet };
        });
    };

    const filteredData = useMemo(() => {
        let filtered = data;

        Object.entries(filters).forEach(([column, value]) => {
            if (value) {
                filtered = filtered.filter(row => String(row[column]).toLowerCase().includes(value.toLowerCase()));
            }
        });

        Object.entries(multiSelectFilters).forEach(([column, selectedValues]) => {
            if (selectedValues.size > 0) {
                filtered = filtered.filter(row => selectedValues.has(String(row[column])));
            }
        });

        if (sort) {
            filtered.sort((a, b) => {
                const valA = a[sort.column];
                const valB = b[sort.column];

                if (valA < valB) return sort.direction === 'asc' ? -1 : 1;
                if (valA > valB) return sort.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return filtered;
    }, [data, sort, filters, multiSelectFilters]);

    return (
        <div className='my-4'>
            <UiTable>
                <TableHeader>
                    <TableRow>
                        {headers.map((header) => {
                            const uniqueValues = getUniqueColumnValues(header);
                            const canMultiSelect = uniqueValues.length > 1 && uniqueValues.length <= 15;

                            return (
                                <TableHead key={header} className="align-top">
                                    <div className='flex items-center gap-1'>
                                        <Button variant="ghost" size="sm" onClick={() => handleSort(header)} className="flex-1 justify-start h-8 px-2 -ml-2">
                                            {header}
                                            <ArrowUpDown className="ml-2 h-3 w-3" />
                                        </Button>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-6 w-6">
                                                    <MoreHorizontal className="h-3 w-3" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent onClick={(e) => e.stopPropagation()}>
                                                <DropdownMenuLabel>Filtra Colonna</DropdownMenuLabel>
                                                <div className='px-2 py-1'>
                                                    <div className='relative'>
                                                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                                                        <Input
                                                            placeholder={`Cerca in ${header}...`}
                                                            value={filters[header] || ''}
                                                            onChange={(e) => handleFilterChange(header, e.target.value)}
                                                            className="h-8 pl-8 text-xs"
                                                        />
                                                    </div>
                                                </div>
                                                {canMultiSelect && (
                                                    <>
                                                        <DropdownMenuSeparator />
                                                        <ScrollArea className='max-h-60'>
                                                            {uniqueValues.map(value => (
                                                                <DropdownMenuCheckboxItem
                                                                    key={value}
                                                                    checked={multiSelectFilters[header]?.has(value)}
                                                                    onCheckedChange={() => handleMultiSelectFilterChange(header, value)}
                                                                    onSelect={(e) => e.preventDefault()}
                                                                >
                                                                    {value}
                                                                </DropdownMenuCheckboxItem>
                                                            ))}
                                                        </ScrollArea>
                                                    </>
                                                )}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </TableHead>
                            )
                        })}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {filteredData.map((row, i) => (
                        <TableRow key={i}>
                            {headers.map((cell, j) => <TableCell key={j} className="text-xs">{String(row[cell])}</TableCell>)}
                        </TableRow>
                    ))}
                </TableBody>
            </UiTable>
        </div>
    )
}

const KpiRenderer = ({ data }: { data: { value: string, label: string } }) => {
    if (!data || !data.value) return <p className="text-xs text-muted-foreground my-4">[Dati KPI non disponibili]</p>;
    return (
        <div className='my-4 inline-block'>
            <Card>
                <CardHeader className="p-4 pb-2">
                    <CardTitle className='text-sm font-medium text-muted-foreground'>{data.label || 'Result'}</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                    <div className="text-3xl font-bold">{data.value}</div>
                </CardContent>
            </Card>
        </div>
    );
};

export default function TextWidget({
    content,
    onContentChange,
    isEditing,
    reportData,
    reportType,
    isLoadingData,
    onRefresh,
    isRefreshing,
    onUpdateHierarchy,
    htmlStyleOverrides
}: TextWidgetProps) {
    const editorRef = useRef<HTMLDivElement>(null);
    const [liveContent, setLiveContent] = useState(content);
    const savedSelectionRef = useRef<Range | null>(null);

    useEffect(() => {
        setLiveContent(content);
    }, [content]);

    // Save the current selection whenever it changes inside the editor
    useEffect(() => {
        if (!isEditing) return;
        const handleSelectionChange = () => {
            const sel = document.getSelection();
            if (sel && sel.rangeCount > 0 && editorRef.current) {
                const range = sel.getRangeAt(0);
                if (editorRef.current.contains(range.startContainer)) {
                    savedSelectionRef.current = range.cloneRange();
                }
            }
        };
        document.addEventListener('selectionchange', handleSelectionChange);
        return () => document.removeEventListener('selectionchange', handleSelectionChange);
    }, [isEditing]);

    const restoreSelection = useCallback(() => {
        const sel = document.getSelection();
        if (sel && savedSelectionRef.current) {
            sel.removeAllRanges();
            sel.addRange(savedSelectionRef.current);
            return true;
        }
        return false;
    }, []);

    const handleBlur = () => {
        if (editorRef.current) {
            onContentChange(editorRef.current.innerHTML);
        }
    };

    const applyStyle = useCallback((command: string, value: string | undefined = undefined) => {
        if (!isEditing) return;
        editorRef.current?.focus();
        restoreSelection();
        document.execCommand(command, false, value);
        if (editorRef.current) {
            onContentChange(editorRef.current.innerHTML);
        }
    }, [isEditing, onContentChange, restoreSelection]);

    // Apply font-size using a marker approach: execCommand creates a <font> tag, then we replace it with a styled span
    const applyFontSize = useCallback((sizePx: string) => {
        if (!isEditing) return;
        editorRef.current?.focus();
        restoreSelection();
        document.execCommand('fontSize', false, '1');
        if (editorRef.current) {
            const fontElements = editorRef.current.querySelectorAll('font[size="1"]');
            fontElements.forEach(el => {
                const span = document.createElement('span');
                span.style.fontSize = sizePx;
                span.innerHTML = el.innerHTML;
                el.replaceWith(span);
            });
            onContentChange(editorRef.current.innerHTML);
        }
    }, [isEditing, onContentChange, restoreSelection]);

    // Apply font-family using the same marker approach for reliability
    const applyFontFamily = useCallback((fontFamily: string) => {
        if (!isEditing) return;
        editorRef.current?.focus();
        restoreSelection();
        document.execCommand('fontName', false, '__marker_font__');
        if (editorRef.current) {
            const fontElements = editorRef.current.querySelectorAll('font[face="__marker_font__"]');
            fontElements.forEach(el => {
                const span = document.createElement('span');
                span.style.fontFamily = fontFamily;
                span.innerHTML = el.innerHTML;
                el.replaceWith(span);
            });
            onContentChange(editorRef.current.innerHTML);
        }
    }, [isEditing, onContentChange, restoreSelection]);

    const insertVariable = (variable: string) => {
        applyStyle('insertHTML', `{{${variable}}}`);
    }

    const renderContent = () => {
        if (isLoadingData) {
            return <div className="flex items-center justify-center h-full"><Loader2 className="h-6 w-6 animate-spin" /></div>;
        }

        if (isEditing) {
            return (
                <div
                    ref={editorRef}
                    contentEditable={true}
                    suppressContentEditableWarning={true}
                    dangerouslySetInnerHTML={{ __html: liveContent }}
                    onBlur={handleBlur}
                    className="prose prose-sm dark:prose-invert max-w-none h-full w-full p-1 focus:outline-none focus:ring-1 focus:ring-ring rounded-sm"
                />
            );
        }

        const parts = liveContent.split(/({{result}})/g);

        return (
            <div className="prose prose-sm dark:prose-invert max-w-none h-full w-full p-1">
                {parts.map((part, index) => {
                    if (part === '{{result}}') {
                        if (!reportData) return <p key={index} className="text-xs text-muted-foreground my-4">[Dati non ancora caricati. Eseguire la pipeline.]</p>;
                        switch (reportType) {
                            case 'table': return <TableRenderer key={index} data={reportData} />;
                            case 'kpi': return <KpiRenderer key={index} data={reportData} />;
                            case 'chart': return <ChartRenderer key={index} data={reportData} />;
                            case 'html': {
                                const htmlContent = typeof reportData === 'string' ? reportData : (reportData?.html || '');
                                if (!htmlContent) return <p key={index} className="text-xs text-muted-foreground my-4">[Contenuto HTML vuoto]</p>;
                                const styledSrcDoc = htmlStyleOverrides
                                    ? applyHtmlStyleOverrides(htmlContent, htmlStyleOverrides)
                                    : `<html><head><style>body { margin: 0; padding: 10px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; overflow: auto; }</style></head><body>${htmlContent}</body></html>`;
                                return (
                                    <div key={index} className="w-full my-4 bg-white dark:bg-zinc-950 overflow-hidden rounded-md border" style={{ minHeight: 200 }}>
                                        <iframe
                                            srcDoc={styledSrcDoc}
                                            className="w-full border-none"
                                            style={{ minHeight: 200, height: '100%' }}
                                            title="HTML Widget"
                                            sandbox="allow-same-origin"
                                        />
                                    </div>
                                );
                            }
                            default:
                                if (typeof reportData === 'object' && reportData !== null && 'value' in reportData && 'label' in reportData) {
                                    return <KpiRenderer key={index} data={reportData} />;
                                }
                                if (Array.isArray(reportData)) {
                                    return <TableRenderer key={index} data={reportData} />;
                                }
                                return <p key={index} className="text-xs text-muted-foreground my-4">[Tipo di report non supportato o non specificato ({reportType})]</p>;
                        }
                    }
                    return <ReactMarkdown key={index} rehypePlugins={[rehypeRaw]}>{part}</ReactMarkdown>;
                })}
            </div>
        );
    };

    return (
        <Card className={cn("h-full w-full flex flex-col overflow-hidden")}>
            {!isEditing && (onRefresh || onUpdateHierarchy) && (
                <CardHeader className="p-4 pb-0 flex flex-row items-center justify-end space-y-0 gap-1">
                    {onRefresh && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onRefresh}
                            disabled={isRefreshing}
                            className={`h-8 w-8 ${isRefreshing ? 'animate-spin' : ''}`}
                            title="Aggiorna Dati"
                        >
                            <RefreshCw className="h-4 w-4" />
                        </Button>
                    )}
                    {onUpdateHierarchy && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onUpdateHierarchy}
                            disabled={isRefreshing}
                            className={`h-8 w-8 text-amber-500 hover:text-amber-600`}
                            title="Aggiorna Intera Gerarchia"
                        >
                            <Zap className="h-4 w-4" />
                        </Button>
                    )}
                </CardHeader>
            )}
            {isEditing && (
                <div className="flex items-center gap-1 p-1 border-b flex-wrap" style={{ marginLeft: '20px' }}>
                    <ToolbarButton onClick={() => applyStyle('bold')}><Bold className="h-4 w-4" /></ToolbarButton>
                    <ToolbarButton onClick={() => applyStyle('italic')}><Italic className="h-4 w-4" /></ToolbarButton>
                    <ToolbarButton onClick={() => applyStyle('underline')}><Underline className="h-4 w-4" /></ToolbarButton>
                    <ToolbarButton onClick={() => applyStyle('insertUnorderedList')}><List className="h-4 w-4" /></ToolbarButton>

                    {/* Font Family Popover */}
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className="h-7 text-xs gap-1 px-2" onMouseDown={(e) => e.preventDefault()}>
                                <Type className="h-3.5 w-3.5" /> Font <ChevronDown className="h-3 w-3" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent
                            className="w-48 p-1"
                            onOpenAutoFocus={(e) => e.preventDefault()}
                            onCloseAutoFocus={(e) => e.preventDefault()}
                        >
                            {[
                                { label: 'Inter', value: 'Inter, sans-serif' },
                                { label: 'Arial', value: 'Arial, sans-serif' },
                                { label: 'Helvetica', value: 'Helvetica, Arial, sans-serif' },
                                { label: 'Georgia', value: 'Georgia, serif' },
                                { label: 'Times New Roman', value: "'Times New Roman', serif" },
                                { label: 'Verdana', value: 'Verdana, sans-serif' },
                                { label: 'Trebuchet MS', value: "'Trebuchet MS', sans-serif" },
                                { label: 'Courier New', value: "'Courier New', monospace" },
                                { label: 'Source Code Pro', value: "'Source Code Pro', monospace" },
                                { label: 'Garamond', value: 'Garamond, serif' },
                            ].map(font => (
                                <button
                                    key={font.value}
                                    className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-accent cursor-pointer"
                                    style={{ fontFamily: font.value }}
                                    onMouseDown={(e) => {
                                        e.preventDefault();
                                        applyFontFamily(font.value);
                                    }}
                                >
                                    {font.label}
                                </button>
                            ))}
                        </PopoverContent>
                    </Popover>

                    {/* Font Size Popover */}
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className="h-7 text-xs gap-1 px-2" onMouseDown={(e) => e.preventDefault()}>
                                <ALargeSmall className="h-3.5 w-3.5" /> Size <ChevronDown className="h-3 w-3" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent
                            className="w-44 p-2"
                            onOpenAutoFocus={(e) => e.preventDefault()}
                            onCloseAutoFocus={(e) => e.preventDefault()}
                        >
                            <div className="flex items-center gap-1 mb-2">
                                <Input
                                    type="number"
                                    min={8}
                                    max={120}
                                    placeholder="px"
                                    className="h-7 text-xs"
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            const val = (e.target as HTMLInputElement).value;
                                            if (val) {
                                                applyFontSize(val + 'px');
                                                (e.target as HTMLInputElement).value = '';
                                            }
                                        }
                                    }}
                                />
                                <span className="text-xs text-muted-foreground">px</span>
                            </div>
                            <div className="grid grid-cols-4 gap-1">
                                {[10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 42, 48, 56, 64, 72, 96].map(size => (
                                    <button
                                        key={size}
                                        className="px-1 py-1 text-xs rounded hover:bg-accent text-center cursor-pointer"
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            applyFontSize(size + 'px');
                                        }}
                                    >
                                        {size}
                                    </button>
                                ))}
                            </div>
                        </PopoverContent>
                    </Popover>

                    <div className="relative h-7 w-7">
                        <Input
                            type="color"
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            onInput={(e) => {
                                applyStyle('foreColor', (e.target as HTMLInputElement).value);
                            }}
                        />
                        <div className="h-7 w-7 flex items-center justify-center rounded-md border bg-background pointer-events-none">
                            <Palette className="h-4 w-4" />
                        </div>
                    </div>
                    <Button onMouseDown={(e) => { e.preventDefault(); insertVariable('result'); }} size="sm" variant="outline" className="h-7 text-xs">
                        <Variable className="h-4 w-4 mr-2" /> Inserisci Risultato
                    </Button>
                </div>
            )}
            <div className="p-2 flex-1 overflow-auto relative">
                {isRefreshing && (
                    <div className="absolute inset-0 bg-background/50 flex flex-col items-center justify-center z-10 backdrop-blur-[1px]">
                        <RefreshCw className={`h-6 w-6 animate-spin text-primary`} />
                    </div>
                )}
                {renderContent()}
            </div>
        </Card>
    );
}

const ToolbarButton = ({ onClick, children, ...props }: { onClick?: (e: React.MouseEvent) => void; children: React.ReactNode, [key: string]: any }) => (
    <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-7 w-7"
        onMouseDown={(e: React.MouseEvent) => {
            e.preventDefault();
            if (onClick) onClick(e);
        }}
        {...props}
    >
        {children}
    </Button>
);
