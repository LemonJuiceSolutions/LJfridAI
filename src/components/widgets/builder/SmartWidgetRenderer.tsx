'use client';

import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, AreaChart, Area } from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RefreshCw, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WidgetConfig } from '@/lib/types';
import { useChartTheme } from '@/hooks/use-chart-theme';
import { gridStrokeDasharray, lineStrokeDasharray, ChartTheme } from '@/lib/chart-theme';
import { resolveChartStyle, BarChartStyle, LineChartStyle, AreaChartStyle, PieChartStyle, KpiCardStyle } from '@/lib/chart-style';

interface SmartWidgetRendererProps {
    data: Record<string, unknown>[];
    config: WidgetConfig;
    onRefresh?: () => void;
    isRefreshing?: boolean;
    onUpdateHierarchy?: () => void;
}

// Helper to determine margins based on axis titles, using theme defaults
const getChartMargins = (config: Partial<WidgetConfig>, theme: ChartTheme) => {
    return {
        top: theme.chartMargins.top,
        right: theme.chartMargins.right,
        left: config.yAxisTitle ? Math.max(110, theme.chartMargins.left) : theme.chartMargins.left,
        bottom: config.xAxisTitle ? Math.max(30, theme.chartMargins.bottom) : theme.chartMargins.bottom,
    };
};

// Helper for legend props
const getLegendProps = (position?: 'top' | 'bottom' | 'left' | 'right' | 'none') => {
    if (position === 'none') return null;
    switch (position) {
        case 'top': return { verticalAlign: 'top' as const, align: 'center' as const, layout: 'horizontal' as const, wrapperStyle: { top: 0 } };
        case 'left': return { verticalAlign: 'middle' as const, align: 'left' as const, layout: 'vertical' as const, wrapperStyle: { left: 0 } };
        case 'right': return { verticalAlign: 'middle' as const, align: 'right' as const, layout: 'vertical' as const, wrapperStyle: { right: 0 } };
        case 'bottom':
        default: return { verticalAlign: 'bottom' as const, align: 'center' as const, layout: 'horizontal' as const, wrapperStyle: { bottom: 0 } };
    }
};

export default function SmartWidgetRenderer({ data, config, onRefresh, isRefreshing, onUpdateHierarchy }: SmartWidgetRendererProps) {
    const { theme: globalTheme } = useChartTheme();

    // Resolve per-chart style overrides on top of global theme
    const theme = useMemo(
        () => resolveChartStyle(globalTheme, config.chartStyle),
        [globalTheme, config.chartStyle]
    );
    const COLORS = theme.colors;

    // Type-specific style accessors
    const cs = config.chartStyle;
    const barStyle = cs as BarChartStyle | undefined;
    const lineStyleObj = cs as LineChartStyle | undefined;
    const areaStyleObj = cs as AreaChartStyle | undefined;
    const pieStyleObj = cs as PieChartStyle | undefined;
    const kpiStyleObj = cs as KpiCardStyle | undefined;

    if ((!data || data.length === 0) && !isRefreshing) {
        return (
            <Card className="h-full w-full flex items-center justify-center relative">
                {onRefresh && (
                    <div className="flex gap-2">
                        {onRefresh && (
                            <Button variant="ghost" size="icon" onClick={onRefresh} disabled={isRefreshing} className={isRefreshing ? 'animate-spin' : ''}>
                                <RefreshCw className="h-4 w-4" />
                            </Button>
                        )}
                        {onUpdateHierarchy && (
                            <Button variant="ghost" size="icon" onClick={onUpdateHierarchy} disabled={isRefreshing}>
                                <Zap className="h-4 w-4 text-amber-500" />
                            </Button>
                        )}
                    </div>
                )}
                <p className="text-muted-foreground text-sm">No data available</p>
            </Card>
        );
    }

    const cleanNumber = (val: unknown): number | string | unknown => {
        if (typeof val === 'number') return val;
        if (typeof val !== 'string') return val;

        const isNumeric = /^[0-9.,\-\s€$]+$/.test(val);
        if (!isNumeric) return val;

        try {
            let clean = val.replace(/[€$\s]/g, '');
            if (clean.includes(',')) {
                clean = clean.replace(/\./g, '').replace(',', '.');
            } else {
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
        return data.map((item) => {
            const newItem: Record<string, unknown> = { ...item };
            Object.keys(newItem).forEach(key => {
                newItem[key] = cleanNumber(newItem[key]);
            });
            return newItem;
        });
    }, [data]);

    // Resolved legend position (per-chart style > config legacy > default)
    const legendPosition = cs?.legendPosition ?? config.legendPosition ?? 'bottom';
    const legendProps = getLegendProps(legendPosition as any);

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
                                        {columns.map(col => <TableCell key={col}>{String(row[col] ?? '')}</TableCell>)}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                );

            case 'bar-chart': {
                const radius = barStyle?.barRadius ?? theme.barRadius;
                const stacked = barStyle?.stackBars;
                return (
                    <div className="overflow-y-auto h-full w-full custom-scrollbar">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                data={chartData}
                                margin={getChartMargins(config, theme)}
                                barGap={barStyle?.barGap}
                                barCategoryGap={barStyle?.barCategoryGap != null ? `${barStyle.barCategoryGap}%` : undefined}
                                layout={barStyle?.barOrientation === 'horizontal' ? 'vertical' : 'horizontal'}
                            >
                                {theme.gridStyle !== 'none' && <CartesianGrid strokeDasharray={gridStrokeDasharray(theme.gridStyle)} stroke={theme.gridColor} />}
                                {barStyle?.barOrientation === 'horizontal' ? (
                                    <>
                                        <YAxis dataKey={config.xAxisKey} type="category" tick={{ fontSize: theme.axisFontSize, fontFamily: theme.fontFamily }} />
                                        <XAxis type="number" tick={{ fontSize: theme.axisFontSize, fontFamily: theme.fontFamily }} />
                                    </>
                                ) : (
                                    <>
                                        <XAxis dataKey={config.xAxisKey} tick={{ fontSize: theme.axisFontSize, fontFamily: theme.fontFamily }} label={config.xAxisTitle ? { value: config.xAxisTitle, position: 'insideBottom', offset: config.xAxisDy || -10 } : undefined} />
                                        <YAxis tick={{ fontSize: theme.axisFontSize, fontFamily: theme.fontFamily }} label={config.yAxisTitle ? { value: config.yAxisTitle, angle: -90, position: 'insideLeft', dx: config.yAxisDx || -80, style: { textAnchor: 'middle' } } : undefined} />
                                    </>
                                )}
                                <Tooltip
                                    contentStyle={{ borderRadius: 'var(--radius)', border: '1px solid hsl(var(--border))', backgroundColor: 'hsl(var(--background))', fontSize: theme.tooltipFontSize, fontFamily: theme.fontFamily }}
                                />
                                {legendProps && <Legend {...legendProps} wrapperStyle={{ fontSize: theme.legendFontSize, fontFamily: theme.fontFamily }} />}
                                {(config.dataKeys || []).map((key, index) => (
                                    <Bar
                                        key={key}
                                        dataKey={key}
                                        fill={config.colors?.[index % config.colors.length] || COLORS[index % COLORS.length]}
                                        radius={[radius, radius, 0, 0]}
                                        stackId={stacked ? 'stack' : undefined}
                                    />
                                ))}
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                );
            }

            case 'line-chart': {
                const lw = lineStyleObj?.lineWidth ?? theme.lineWidth;
                const ls = lineStyleObj?.lineStyle ?? config.lineStyle ?? theme.defaultLineStyle;
                const lt = lineStyleObj?.lineType ?? 'monotone';
                const showDots = lineStyleObj?.showDots ?? true;
                const dotR = lineStyleObj?.dotRadius ?? 4;
                const activeDotR = lineStyleObj?.activeDotRadius ?? 6;
                const connectN = lineStyleObj?.connectNulls ?? true;
                return (
                    <div className="overflow-y-auto h-full w-full custom-scrollbar">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData} margin={getChartMargins(config, theme)}>
                                {theme.gridStyle !== 'none' && <CartesianGrid strokeDasharray={gridStrokeDasharray(theme.gridStyle)} stroke={theme.gridColor} />}
                                <XAxis dataKey={config.xAxisKey} tick={{ fontSize: theme.axisFontSize, fontFamily: theme.fontFamily }} label={config.xAxisTitle ? { value: config.xAxisTitle, position: 'insideBottom', offset: config.xAxisDy || -10 } : undefined} />
                                <YAxis tick={{ fontSize: theme.axisFontSize, fontFamily: theme.fontFamily }} label={config.yAxisTitle ? { value: config.yAxisTitle, angle: -90, position: 'insideLeft', dx: config.yAxisDx || -80, style: { textAnchor: 'middle' } } : undefined} />
                                <Tooltip
                                    contentStyle={{ borderRadius: 'var(--radius)', border: '1px solid hsl(var(--border))', backgroundColor: 'hsl(var(--background))', fontSize: theme.tooltipFontSize, fontFamily: theme.fontFamily }}
                                />
                                {legendProps && <Legend {...legendProps} wrapperStyle={{ fontSize: theme.legendFontSize, fontFamily: theme.fontFamily }} />}
                                {(config.dataKeys || []).map((key, index) => (
                                    <Line
                                        key={key}
                                        type={lt as any}
                                        dataKey={key}
                                        stroke={config.colors?.[index % config.colors.length] || COLORS[index % COLORS.length]}
                                        strokeWidth={lw}
                                        dot={showDots ? { r: dotR } : false}
                                        activeDot={showDots ? { r: activeDotR } : false}
                                        connectNulls={connectN}
                                        strokeDasharray={lineStrokeDasharray(ls)}
                                    />
                                ))}
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                );
            }

            case 'area-chart': {
                const areaOp = areaStyleObj?.areaOpacity ?? theme.areaOpacity;
                const areaLw = areaStyleObj?.lineWidth ?? theme.lineWidth;
                const areaLs = areaStyleObj?.lineStyle ?? config.lineStyle ?? theme.defaultLineStyle;
                const areaLt = areaStyleObj?.lineType ?? 'monotone';
                const stacked = areaStyleObj?.stackAreas;
                const showDots = areaStyleObj?.showDots ?? false;
                const dotR = areaStyleObj?.dotRadius ?? 4;
                return (
                    <div className="overflow-y-auto h-full w-full custom-scrollbar">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData} margin={getChartMargins(config, theme)}>
                                {theme.gridStyle !== 'none' && <CartesianGrid strokeDasharray={gridStrokeDasharray(theme.gridStyle)} stroke={theme.gridColor} />}
                                <XAxis dataKey={config.xAxisKey} tick={{ fontSize: theme.axisFontSize, fontFamily: theme.fontFamily }} label={config.xAxisTitle ? { value: config.xAxisTitle, position: 'insideBottom', offset: config.xAxisDy || -10 } : undefined} />
                                <YAxis tick={{ fontSize: theme.axisFontSize, fontFamily: theme.fontFamily }} label={config.yAxisTitle ? { value: config.yAxisTitle, angle: -90, position: 'insideLeft', dx: config.yAxisDx || -80, style: { textAnchor: 'middle' } } : undefined} />
                                <Tooltip
                                    contentStyle={{ borderRadius: 'var(--radius)', border: '1px solid hsl(var(--border))', backgroundColor: 'hsl(var(--background))', fontSize: theme.tooltipFontSize, fontFamily: theme.fontFamily }}
                                />
                                {legendProps && <Legend {...legendProps} wrapperStyle={{ fontSize: theme.legendFontSize, fontFamily: theme.fontFamily }} />}
                                {(config.dataKeys || []).map((key, index) => (
                                    <Area
                                        key={key}
                                        type={areaLt as any}
                                        dataKey={key}
                                        fill={config.colors?.[index % config.colors.length] || COLORS[index % COLORS.length]}
                                        stroke={config.colors?.[index % config.colors.length] || COLORS[index % COLORS.length]}
                                        strokeWidth={areaLw}
                                        fillOpacity={areaOp}
                                        strokeDasharray={lineStrokeDasharray(areaLs)}
                                        stackId={stacked ? 'stack' : undefined}
                                        dot={showDots ? { r: dotR } : false}
                                    />
                                ))}
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                );
            }

            case 'pie-chart': {
                const innerR = pieStyleObj?.innerRadius ?? 0;
                const outerR = pieStyleObj?.outerRadius ?? 80;
                const paddingA = pieStyleObj?.paddingAngle ?? 0;
                const showLabels = pieStyleObj?.showLabels ?? true;
                const labelType = pieStyleObj?.labelType ?? 'name-percent';

                const labelFn = showLabels
                    ? ({ name, percent, value }: any) => {
                        switch (labelType) {
                            case 'percent': return `${(percent * 100).toFixed(0)}%`;
                            case 'value': return `${value}`;
                            case 'name': return `${name}`;
                            case 'name-percent':
                            default: return `${name} ${(percent * 100).toFixed(0)}%`;
                        }
                    }
                    : false;

                return (
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={chartData}
                                cx="50%"
                                cy="50%"
                                labelLine={showLabels}
                                label={labelFn}
                                innerRadius={innerR}
                                outerRadius={outerR}
                                paddingAngle={paddingA}
                                fill={COLORS[0]}
                                dataKey={config.dataKeys?.[0] || Object.keys(data[0])[1]}
                                nameKey={config.xAxisKey || Object.keys(data[0])[0]}
                            >
                                {chartData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={config.colors?.[index % config.colors.length] || COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip
                                contentStyle={{ borderRadius: 'var(--radius)', border: '1px solid hsl(var(--border))', backgroundColor: 'hsl(var(--background))', fontSize: theme.tooltipFontSize, fontFamily: theme.fontFamily }}
                            />
                            {legendProps && <Legend {...legendProps} wrapperStyle={{ fontSize: theme.legendFontSize, fontFamily: theme.fontFamily }} />}
                        </PieChart>
                    </ResponsiveContainer>
                );
            }

            case 'kpi-card': {
                const rawValue = data[0] && config.kpiValueKey ? data[0][config.kpiValueKey] : 'N/A';
                const kpiValue = typeof rawValue === 'number' || typeof rawValue === 'string'
                    ? rawValue
                    : rawValue == null
                        ? 'N/A'
                        : JSON.stringify(rawValue);
                const valSize = kpiStyleObj?.kpiValueSize ?? theme.kpiValueSize;
                const labelSize = kpiStyleObj?.kpiLabelSize ?? theme.kpiLabelSize;
                return (
                    <div className="flex flex-col items-center justify-center h-full">
                        <div style={{ fontSize: valSize }} className="font-bold">{kpiValue}</div>
                        <div style={{ fontSize: labelSize }} className="text-muted-foreground mt-2">{config.kpiLabel || config.kpiValueKey}</div>
                    </div>
                );
            }

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
                    <div className="flex gap-1 -mt-1 -mr-2">
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
                    </div>
                </CardHeader>
            )}
            <CardContent className="flex-1 min-h-0 p-4 pt-2 relative">
                {isRefreshing && (
                    <div className="absolute inset-0 bg-background/50 flex flex-col items-center justify-center z-10 backdrop-blur-[1px]">
                        <RefreshCw className={`h-6 w-6 animate-spin text-primary`} />
                    </div>
                )}
                {renderContent()}
            </CardContent>
        </Card>
    );
}
