'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, AreaChart, Area } from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WidgetConfig } from '@/lib/types';

interface SmartWidgetRendererProps {
    data: any[];
    config: WidgetConfig;
    onRefresh?: () => void;
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

export default function SmartWidgetRenderer({ data, config, onRefresh, isRefreshing }: SmartWidgetRendererProps) {
    if ((!data || data.length === 0) && !isRefreshing) {
        return (
            <Card className="h-full w-full flex items-center justify-center relative">
                {onRefresh && (
                    <div className="absolute top-2 right-2">
                        <Button variant="ghost" size="icon" onClick={onRefresh} disabled={isRefreshing} className={isRefreshing ? 'animate-spin' : ''}>
                            <RefreshCw className="h-4 w-4" />
                        </Button>
                    </div>
                )}
                <p className="text-muted-foreground text-sm">No data available</p>
            </Card>
        );
    }

    const cleanNumber = (val: any): number | string => {
        if (typeof val === 'number') return val;
        if (typeof val !== 'string') return val;

        const isNumeric = /^[0-9.,\-\s€$]+$/.test(val);
        if (!isNumeric) return val;

        try {
            let clean = val.replace(/[€$\s]/g, '');
            if (clean.includes(',')) {
                clean = clean.replace(/\./g, '').replace(',', '.');
            } else {
                // Remove dots if standard thousand separator
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

    const renderContent = () => {
        if (!data || data.length === 0) return null;

        switch (config.type) {
            case 'table':
                const columns = Object.keys(data[0]);
                return (
                    <div className="overflow-auto h-full w-full">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    {columns.map(col => <TableHead key={col}>{col}</TableHead>)}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {data.map((row, i) => (
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
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={getChartMargins(config)}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey={config.xAxisKey} label={config.xAxisTitle ? { value: config.xAxisTitle, position: 'insideBottom', offset: config.xAxisDy || -10 } : undefined} />
                            <YAxis label={config.yAxisTitle ? { value: config.yAxisTitle, angle: -90, position: 'insideLeft', dx: config.yAxisDx || -80, style: { textAnchor: 'middle' } } : undefined} />
                            <Tooltip
                                contentStyle={{ borderRadius: 'var(--radius)', border: '1px solid hsl(var(--border))', backgroundColor: 'hsl(var(--background))' }}
                            />
                            <Legend {...getLegendProps(config.legendPosition)} />
                            {(config.dataKeys || []).map((key, index) => (
                                <Bar key={key} dataKey={key} fill={config.colors?.[index % config.colors.length] || COLORS[index % COLORS.length]} radius={[4, 4, 0, 0]} />
                            ))}
                        </BarChart>
                    </ResponsiveContainer>
                );
            case 'line-chart':
                return (
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={getChartMargins(config)}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey={config.xAxisKey} label={config.xAxisTitle ? { value: config.xAxisTitle, position: 'insideBottom', offset: config.xAxisDy || -10 } : undefined} />
                            <YAxis label={config.yAxisTitle ? { value: config.yAxisTitle, angle: -90, position: 'insideLeft', dx: config.yAxisDx || -80, style: { textAnchor: 'middle' } } : undefined} />
                            <Tooltip
                                contentStyle={{ borderRadius: 'var(--radius)', border: '1px solid hsl(var(--border))', backgroundColor: 'hsl(var(--background))' }}
                            />
                            <Legend {...getLegendProps(config.legendPosition)} />
                            {(config.dataKeys || []).map((key, index) => (
                                <Line
                                    key={key}
                                    type="monotone"
                                    dataKey={key}
                                    stroke={config.colors?.[index % config.colors.length] || COLORS[index % COLORS.length]}
                                    strokeWidth={2}
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
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={getChartMargins(config)}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey={config.xAxisKey} label={config.xAxisTitle ? { value: config.xAxisTitle, position: 'insideBottom', offset: config.xAxisDy || -10 } : undefined} />
                            <YAxis label={config.yAxisTitle ? { value: config.yAxisTitle, angle: -90, position: 'insideLeft', dx: config.yAxisDx || -80, style: { textAnchor: 'middle' } } : undefined} />
                            <Tooltip
                                contentStyle={{ borderRadius: 'var(--radius)', border: '1px solid hsl(var(--border))', backgroundColor: 'hsl(var(--background))' }}
                            />
                            <Legend {...getLegendProps(config.legendPosition)} />
                            {(config.dataKeys || []).map((key, index) => (
                                <Area key={key} type="monotone" dataKey={key} fill={config.colors?.[index % config.colors.length] || COLORS[index % COLORS.length]} stroke={config.colors?.[index % config.colors.length] || COLORS[index % COLORS.length]} strokeDasharray={getStrokeDasharray(config.lineStyle)} />
                            ))}
                        </AreaChart>
                    </ResponsiveContainer>
                );
            case 'pie-chart':
                return (
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={chartData}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                outerRadius={80}
                                fill="#8884d8"
                                dataKey={config.dataKeys?.[0] || Object.keys(data[0])[1]}
                                nameKey={config.xAxisKey || Object.keys(data[0])[0]}
                            >
                                {chartData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={config.colors?.[index % config.colors.length] || COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip
                                contentStyle={{ borderRadius: 'var(--radius)', border: '1px solid hsl(var(--border))', backgroundColor: 'hsl(var(--background))' }}
                            />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                );
            case 'kpi-card':
                const kpiValue = data[0] && config.kpiValueKey ? data[0][config.kpiValueKey] : 'N/A';
                return (
                    <div className="flex flex-col items-center justify-center h-full">
                        <div className="text-5xl font-bold">{kpiValue}</div>
                        <div className="text-sm text-muted-foreground mt-2">{config.kpiLabel || config.kpiValueKey}</div>
                    </div>
                );
            default:
                return (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                        Unsupported widget type: {config.type}
                    </div>
                );
        }
    }

    return (
        <Card className="h-full w-full flex flex-col overflow-hidden">
            {(config.title || config.description || onRefresh) && (
                <CardHeader className="p-4 pb-2 flex flex-row items-start justify-between space-y-0">
                    <div>
                        {config.title && <CardTitle className="text-base">{config.title}</CardTitle>}
                        {config.description && <CardDescription>{config.description}</CardDescription>}
                    </div>
                    {onRefresh && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onRefresh}
                            disabled={isRefreshing}
                            className={`-mt-1 -mr-2 h-8 w-8 ${isRefreshing ? 'animate-spin' : ''}`}
                            title="Aggiorna Dati"
                        >
                            <RefreshCw className="h-4 w-4" />
                        </Button>
                    )}
                </CardHeader>
            )}
            <CardContent className="flex-1 min-h-0 p-4 pt-2 relative">
                {isRefreshing && (
                    <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10 backdrop-blur-[1px]">
                        <RefreshCw className="h-6 w-6 animate-spin text-primary" />
                    </div>
                )}
                {renderContent()}
            </CardContent>
        </Card>
    );
}
