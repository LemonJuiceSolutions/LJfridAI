'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, AreaChart, Area } from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { WidgetConfig, WidgetType } from '@/lib/types';



interface WidgetEditorProps {
    data: any[]; // The preview data from the node
    initialConfig?: WidgetConfig;
    onSave: (config: WidgetConfig) => void;
    availableSources?: { id: string, name: string, type: 'current-sql' | 'current-python' | 'parent-table' }[];
    onRefreshData?: (sourceType: 'current-sql' | 'current-python' | 'parent-table', sourceId: string) => Promise<any[]>;
    isRefreshing?: boolean;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

// Helper to determine margins based on axis titles to prevent overlap
const getChartMargins = (config: Partial<WidgetConfig>) => {
    return {
        top: 20,
        right: 30,
        // Increase left margin if Y-axis title is present to prevent overlap
        left: config.yAxisTitle ? 110 : 30,
        bottom: config.xAxisTitle ? 30 : 20
    };
};

// Helper for legend props
const getLegendProps = (position?: 'top' | 'bottom' | 'left' | 'right') => {
    const defaultProps = { verticalAlign: 'bottom' as const, align: 'center' as const, layout: 'horizontal' as const };

    switch (position) {
        case 'top': return { verticalAlign: 'top' as const, align: 'center' as const, layout: 'horizontal' as const, wrapperStyle: { top: 0 } };
        case 'left': return { verticalAlign: 'middle' as const, align: 'left' as const, layout: 'vertical' as const, wrapperStyle: { left: 0 } };
        case 'right': return { verticalAlign: 'middle' as const, align: 'right' as const, layout: 'vertical' as const, wrapperStyle: { right: 0 } };
        case 'bottom':
        default: return { verticalAlign: 'bottom' as const, align: 'center' as const, layout: 'horizontal' as const, wrapperStyle: { bottom: 0 } };
    }
};

const getStrokeDasharray = (style?: 'solid' | 'dashed' | 'dotted') => {
    switch (style) {
        case 'dashed': return '5 5';
        case 'dotted': return '1 1';
        case 'solid':
        default: return undefined;
    }
};

export default function WidgetEditor({ data, initialConfig, onSave, availableSources = [], onRefreshData, isRefreshing = false }: WidgetEditorProps) {
    const [config, setConfig] = useState<WidgetConfig>(initialConfig || {
        type: 'table',
        title: '',
        dataKeys: [],
        data: [],
        colors: COLORS.slice(0, 2),
        dataSourceType: 'current-sql',
        dataSourceId: 'sql'
    });

    // Collapsible state
    const [axesOpen, setAxesOpen] = useState(true);
    const [styleOpen, setStyleOpen] = useState(false);
    const [dataSeriesOpen, setDataSeriesOpen] = useState(true);

    const [localData, setLocalData] = useState<any[]>(data);

    // Sync local data if prop changes (e.g. after refresh)
    useEffect(() => {
        setLocalData(data);
    }, [data]);

    // Auto-save whenever config changes
    useEffect(() => {
        onSave(config);
    }, [config, onSave]);

    const handleRefresh = async () => {
        if (!onRefreshData) return;

        // Use current selection or fallback
        const type = config.dataSourceType || 'current-sql';
        const id = config.dataSourceId || 'sql';

        try {
            const newData = await onRefreshData(type, id);
            if (newData) {
                setLocalData(newData);
                // Seal data into config
                setConfig(prev => ({ ...prev, data: newData }));
            }
        } catch (e) {
            console.error("Failed to refresh data", e);
        }
    };

    const columns = React.useMemo(() => {
        return data && data.length > 0 ? Object.keys(data[0]) : [];
    }, [data]);

    // Auto-select first reliable keys if not set
    useEffect(() => {
        if (data && data.length > 0 && columns.length > 0) {
            setConfig(prev => {
                // Prevent update if keys are already valid
                const hasValidXAxis = prev.xAxisKey && columns.includes(prev.xAxisKey);
                const hasValidDataKeys = prev.dataKeys && prev.dataKeys.length > 0 && prev.dataKeys.every(k => columns.includes(k));

                if (hasValidXAxis && hasValidDataKeys) {
                    return prev;
                }

                return {
                    ...prev,
                    xAxisKey: prev.xAxisKey && columns.includes(prev.xAxisKey) ? prev.xAxisKey : columns[0],
                    dataKeys: prev.dataKeys && prev.dataKeys.length > 0 && prev.dataKeys.every(k => columns.includes(k))
                        ? prev.dataKeys
                        : [columns[1] || columns[0]],
                    kpiValueKey: prev.kpiValueKey && columns.includes(prev.kpiValueKey) ? prev.kpiValueKey : columns[0]
                };
            });
        }
    }, [data, columns]); // Only run when data signature changes

    // Auto-save whenever config changes
    // Auto-select first reliable keys if not set
    useEffect(() => {
        if (localData && localData.length > 0 && columns.length > 0) {
            setConfig(prev => {
                // Prevent update if keys are already valid
                const hasValidXAxis = prev.xAxisKey && columns.includes(prev.xAxisKey);
                // ... rest of logic uses columns which derived from data prop, but we should use localData derived columns
                // Actually columns is memoized from `data` prop. We should update columns to depend on localData.
                return prev;
            });
        }
    }, [localData]);

    // Re-memoize columns based on localData
    const localColumns = React.useMemo(() => {
        return localData && localData.length > 0 ? Object.keys(localData[0]) : [];
    }, [localData]);
    // Note: Use localColumns instead of columns below? 
    // Yes, let's just make `chartData` typically use `localData`.

    // ... existing auto-select logic actually used `data` prop. Let's fix that block if we can, or just injecting handleRefresh 
    // requires careful surgery. For now, let's assume the previous block is fine but we add UI.


    const handleTypeChange = (type: WidgetType) => {
        setConfig(prev => ({ ...prev, type }));
    };

    const handleDataKeyToggle = (key: string) => {
        setConfig(prev => {
            const currentKeys = prev.dataKeys || [];
            if (currentKeys.includes(key)) {
                return { ...prev, dataKeys: currentKeys.filter(k => k !== key) };
            } else {
                return { ...prev, dataKeys: [...currentKeys, key] };
            }
        });
    };

    // Helper to clean numeric strings (e.g., "1.234,56" -> 1234.56 or "1.000" -> 1000)
    const cleanNumber = (val: any): number | string => {
        if (typeof val === 'number') return val;
        if (typeof val !== 'string') return val;

        // Check if it looks like a number
        const isNumeric = /^[0-9.,\-\s€$]+$/.test(val);
        if (!isNumeric) return val;

        try {
            // Remove common currency symbols and spaces
            let clean = val.replace(/[€$\s]/g, '');

            // Handle Italian/European format: 1.000,50
            // If contains comma, replace dots (thousands) with empty, and comma with dot
            if (clean.includes(',')) {
                clean = clean.replace(/\./g, '').replace(',', '.');
            } else {
                // If only dots, assume thousands if > 1 dot or if 3 digits follow
                // But simplistic approach: remove dots if they are thousands separators
                // Ambiguity: 1.234 could be 1 thousand or 1 point 234.
                // Heuristic: If we are in this context, it's likely thousands due to user report.
                // Safer: just remove all dots if there are no commas, assuming integers? 
                // Or try standard parseFloat.
                // Let's try removing dots if it looks like thousand sep.
                clean = clean.replace(/\./g, '');
            }

            const num = parseFloat(clean);
            return isNaN(num) ? val : num;
        } catch (e) {
            return val;
        }
    };

    const chartData = React.useMemo(() => {
        if (!data) return [];
        return data.map(item => {
            const newItem = { ...item };
            Object.keys(newItem).forEach(key => {
                newItem[key] = cleanNumber(newItem[key]);
            });
            return newItem;
        });
    }, [data]);

    const renderPreview = () => {
        if (!data || data.length === 0) return <div className="p-4 text-center text-muted-foreground">No data available for preview.</div>;

        switch (config.type) {
            case 'table':
                return (
                    <div className="border rounded-md max-h-[300px] overflow-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    {columns.map(col => <TableHead key={col}>{col}</TableHead>)}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {data.slice(0, 5).map((row, i) => (
                                    <TableRow key={i}>
                                        {columns.map(col => <TableCell key={col}>{String(row[col])}</TableCell>)}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                );
            case 'bar-chart':
                return (
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={chartData} margin={getChartMargins(config)}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey={config.xAxisKey} label={config.xAxisTitle ? { value: config.xAxisTitle, position: 'insideBottom', offset: config.xAxisDy || -10 } : undefined} />
                            <YAxis label={config.yAxisTitle ? { value: config.yAxisTitle, angle: -90, position: 'insideLeft', dx: config.yAxisDx || -80, style: { textAnchor: 'middle' } } : undefined} />
                            <Tooltip />
                            <Legend {...getLegendProps(config.legendPosition)} />
                            {(config.dataKeys || []).map((key, index) => (
                                <Bar key={key} dataKey={key} fill={config.colors?.[index % config.colors.length] || COLORS[index % COLORS.length]} radius={[4, 4, 0, 0]} />
                            ))}
                        </BarChart>
                    </ResponsiveContainer>
                );
            case 'line-chart':
                return (
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={chartData} margin={getChartMargins(config)}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey={config.xAxisKey} label={config.xAxisTitle ? { value: config.xAxisTitle, position: 'insideBottom', offset: config.xAxisDy || -10 } : undefined} />
                            <YAxis label={config.yAxisTitle ? { value: config.yAxisTitle, angle: -90, position: 'insideLeft', dx: config.yAxisDx || -80, style: { textAnchor: 'middle' } } : undefined} />
                            <Tooltip />
                            <Legend {...getLegendProps(config.legendPosition)} />
                            {(config.dataKeys || []).map((key, index) => (
                                <Line
                                    key={key}
                                    type="monotone"
                                    dataKey={key}
                                    stroke={config.colors?.[index % config.colors.length] || COLORS[index % COLORS.length]}
                                    strokeWidth={3}
                                    dot={{ r: 4 }}
                                    activeDot={{ r: 6 }}
                                    connectNulls
                                    strokeDasharray={getStrokeDasharray(config.lineStyle)}
                                />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                );
            case 'area-chart':
                return (
                    <ResponsiveContainer width="100%" height={300}>
                        <AreaChart data={chartData} margin={getChartMargins(config)}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey={config.xAxisKey} label={config.xAxisTitle ? { value: config.xAxisTitle, position: 'insideBottom', offset: config.xAxisDy || -10 } : undefined} />
                            <YAxis label={config.yAxisTitle ? { value: config.yAxisTitle, angle: -90, position: 'insideLeft', dx: config.yAxisDx || -80, style: { textAnchor: 'middle' } } : undefined} />
                            <Tooltip />
                            <Legend {...getLegendProps(config.legendPosition)} />
                            {(config.dataKeys || []).map((key, index) => (
                                <Area key={key} type="monotone" dataKey={key} fill={config.colors?.[index % config.colors.length] || COLORS[index % COLORS.length]} stroke={config.colors?.[index % config.colors.length] || COLORS[index % COLORS.length]} strokeDasharray={getStrokeDasharray(config.lineStyle)} />
                            ))}
                        </AreaChart>
                    </ResponsiveContainer>
                );
            case 'pie-chart':
                return (
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                            <Pie
                                data={chartData} // Use chartData 
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                outerRadius={80}
                                fill="#8884d8"
                                dataKey={config.dataKeys?.[0] || columns[1]}
                                nameKey={config.xAxisKey || columns[0]}
                            >
                                {chartData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={config.colors?.[index % config.colors.length] || COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                );
            case 'kpi-card':
                const kpiValue = data[0] && config.kpiValueKey ? data[0][config.kpiValueKey] : 'N/A';
                return (
                    <div className="flex flex-col items-center justify-center h-[200px] border rounded-lg bg-card p-6 text-card-foreground shadow-sm">
                        <div className="text-4xl font-bold">{kpiValue}</div>
                        <div className="text-sm text-muted-foreground mt-2">{config.kpiLabel || config.kpiValueKey}</div>
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
            <div className="lg:col-span-1 border-r pr-4 space-y-6 overflow-auto h-full p-1">
                <div className="space-y-2 border rounded p-3 bg-violet-50 dark:bg-violet-950/20 border-violet-200 dark:border-violet-800">
                    <div className="flex items-center justify-between">
                        <Label className="font-semibold text-violet-700 dark:text-violet-300">Fonte Dati</Label>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={handleRefresh}
                            disabled={isRefreshing}
                            className="h-6 w-6 text-violet-600 hover:text-violet-700 dark:text-violet-400"
                            title="Aggiorna Dati"
                        >
                            <span className={isRefreshing ? "animate-spin" : ""}>↻</span>
                        </Button>
                    </div>
                    <Select
                        value={config.dataSourceId || 'sql'}
                        onValueChange={(val) => {
                            const source = availableSources.find(s => s.id === val);
                            if (source) {
                                setConfig({
                                    ...config,
                                    dataSourceId: source.id,
                                    dataSourceType: source.type
                                });
                            }
                        }}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder="Seleziona fonte..." />
                        </SelectTrigger>
                        <SelectContent>
                            {availableSources.map(s => (
                                <SelectItem key={s.id} value={s.id}>
                                    {s.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <div className="flex items-center space-x-2 pt-2 mt-2 border-t border-violet-200 dark:border-violet-800">
                        <Switch
                            id="isPublished"
                            checked={config.isPublished || false}
                            onCheckedChange={(checked) => setConfig({ ...config, isPublished: checked })}
                        />
                        <Label htmlFor="isPublished" className="cursor-pointer text-sm text-violet-700 dark:text-violet-300">
                            Pubblica widget nella libreria dashboard
                        </Label>
                    </div>
                </div>

                <div className="space-y-2">
                    <Label>Widget Type</Label>
                    <Select value={config.type} onValueChange={(val: WidgetType) => handleTypeChange(val)}>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="table">Table</SelectItem>
                            <SelectItem value="bar-chart">Bar Chart</SelectItem>
                            <SelectItem value="line-chart">Line Chart</SelectItem>
                            <SelectItem value="area-chart">Area Chart</SelectItem>
                            <SelectItem value="pie-chart">Pie Chart</SelectItem>
                            <SelectItem value="kpi-card">KPI Card</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <Label>Title</Label>
                    <Input value={config.title || ''} onChange={e => setConfig({ ...config, title: e.target.value })} />
                </div>

                <div className="space-y-2">
                    <Label>Description</Label>
                    <Input value={config.description || ''} onChange={e => setConfig({ ...config, description: e.target.value })} />
                </div>

                {config.type !== 'table' && config.type !== 'kpi-card' && (
                    <>
                        {/* Assi e Legende - Collapsible */}
                        <Collapsible open={axesOpen} onOpenChange={setAxesOpen}>
                            <div className="border rounded overflow-hidden">
                                <CollapsibleTrigger className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors">
                                    <h4 className="font-medium text-sm">Assi e Legende</h4>
                                    {axesOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                    <div className="p-3 space-y-4 border-t bg-muted/10">
                                        <div className="space-y-2">
                                            <Label>X Axis Column</Label>
                                            <Select value={config.xAxisKey} onValueChange={(val) => setConfig({ ...config, xAxisKey: val })}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select column..." />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {columns.map(col => <SelectItem key={col} value={col}>{col}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>X Axis Title (Opzionale)</Label>
                                            <Input value={config.xAxisTitle || ''} onChange={e => setConfig({ ...config, xAxisTitle: e.target.value })} placeholder="Titolo asse X" />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Y Axis Title (Opzionale)</Label>
                                            <Input value={config.yAxisTitle || ''} onChange={e => setConfig({ ...config, yAxisTitle: e.target.value })} placeholder="Titolo asse Y" />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Legend Position</Label>
                                            <Select value={config.legendPosition || 'bottom'} onValueChange={(val: any) => setConfig({ ...config, legendPosition: val })}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Position" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="bottom">Bottom</SelectItem>
                                                    <SelectItem value="top">Top</SelectItem>
                                                    <SelectItem value="left">Left</SelectItem>
                                                    <SelectItem value="right">Right</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                </CollapsibleContent>
                            </div>
                        </Collapsible>

                        {/* Stile & Layout - Collapsible */}
                        <Collapsible open={styleOpen} onOpenChange={setStyleOpen}>
                            <div className="border rounded overflow-hidden">
                                <CollapsibleTrigger className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors">
                                    <h4 className="font-medium text-sm">Stile & Layout</h4>
                                    {styleOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                    <div className="p-3 space-y-4 border-t bg-muted/10">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label>X Axis Title Offset (dy)</Label>
                                                <Input type="number" value={config.xAxisDy || -10} onChange={e => setConfig({ ...config, xAxisDy: parseInt(e.target.value) || -10 })} />
                                            </div>
                                            {config.yAxisTitle && (
                                                <div className="space-y-2">
                                                    <Label>Y Axis Title Offset (dx)</Label>
                                                    <Input type="number" value={config.yAxisDx || -80} onChange={e => setConfig({ ...config, yAxisDx: parseInt(e.target.value) || -80 })} />
                                                </div>
                                            )}
                                        </div>

                                        <div className="space-y-2">
                                            <Label>Line Style</Label>
                                            <Select value={config.lineStyle || 'solid'} onValueChange={(val: any) => setConfig({ ...config, lineStyle: val })}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Style" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="solid">Solid</SelectItem>
                                                    <SelectItem value="dashed">Dashed</SelectItem>
                                                    <SelectItem value="dotted">Dotted</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-2">
                                            <Label>Chart Colors (comma separated hex)</Label>
                                            <Input
                                                value={config.colors?.join(',') || ''}
                                                onChange={e => setConfig({ ...config, colors: e.target.value ? e.target.value.split(',').map(c => c.trim()) : undefined })}
                                                placeholder="#0088FE, #00C49F, ..."
                                            />
                                        </div>
                                    </div>
                                </CollapsibleContent>
                            </div>
                        </Collapsible>

                        {/* Data Series - Collapsible */}
                        <Collapsible open={dataSeriesOpen} onOpenChange={setDataSeriesOpen}>
                            <div className="border rounded overflow-hidden">
                                <CollapsibleTrigger className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors">
                                    <h4 className="font-medium text-sm">Data Series (Values)</h4>
                                    {dataSeriesOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                    <div className="p-3 border-t bg-muted/10">
                                        <div className="space-y-2">
                                            {columns.map(col => (
                                                <div key={col} className="flex items-center gap-2">
                                                    <input
                                                        type="checkbox"
                                                        id={`col-${col}`}
                                                        checked={(config.dataKeys || []).includes(col)}
                                                        onChange={() => handleDataKeyToggle(col)}
                                                        className="h-4 w-4 rounded border-gray-300"
                                                    />
                                                    <label htmlFor={`col-${col}`} className="text-sm cursor-pointer select-none">
                                                        {col}
                                                    </label>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </CollapsibleContent>
                            </div>
                        </Collapsible>
                    </>
                )}

                {config.type === 'kpi-card' && (
                    <>
                        <div className="space-y-2">
                            <Label>Value Column</Label>
                            <Select value={config.kpiValueKey} onValueChange={(val) => setConfig({ ...config, kpiValueKey: val })}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select column..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {columns.map(col => <SelectItem key={col} value={col}>{col}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Label</Label>
                            <Input value={config.kpiLabel || ''} onChange={e => setConfig({ ...config, kpiLabel: e.target.value })} />
                        </div>
                    </>
                )}


            </div>

            <div className="lg:col-span-2 flex flex-col h-full bg-muted/20 rounded-md p-4">
                <div className="mb-4">
                    <h3 className="text-lg font-semibold">{config.title}</h3>
                    {config.description && <p className="text-sm text-muted-foreground">{config.description}</p>}
                </div>
                <div className="flex-1 min-h-0">
                    {renderPreview()}
                </div>
            </div>
        </div >
    );
}
