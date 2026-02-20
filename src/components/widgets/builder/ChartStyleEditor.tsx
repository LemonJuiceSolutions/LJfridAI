'use client';

import React, { useCallback } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WidgetType } from '@/lib/types';
import { ChartTheme } from '@/lib/chart-theme';
import {
    ChartStyle,
    BarChartStyle,
    LineChartStyle,
    AreaChartStyle,
    PieChartStyle,
    KpiCardStyle,
    TableStyle,
} from '@/lib/chart-style';

interface ChartStyleEditorProps {
    chartType: WidgetType;
    style?: ChartStyle | null;
    globalTheme: ChartTheme;
    onChange: (style: ChartStyle) => void;
    dataKeys?: string[];
}

// Helper: get a value from chart style or fallback to global theme
function getVal<T>(styleVal: T | undefined, themeVal: T): T {
    return styleVal !== undefined ? styleVal : themeVal;
}

// Collapsible section wrapper
function StyleSection({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
    const [open, setOpen] = React.useState(defaultOpen);
    return (
        <Collapsible open={open} onOpenChange={setOpen}>
            <div className="border rounded overflow-hidden">
                <CollapsibleTrigger className="w-full flex items-center justify-between p-2.5 hover:bg-muted/50 transition-colors">
                    <h4 className="font-medium text-xs">{title}</h4>
                    {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <div className="p-2.5 space-y-3 border-t bg-muted/10">
                        {children}
                    </div>
                </CollapsibleContent>
            </div>
        </Collapsible>
    );
}

// Single field with optional reset button
function FieldRow({ label, isOverridden, onReset, children }: {
    label: string;
    isOverridden?: boolean;
    onReset?: () => void;
    children: React.ReactNode;
}) {
    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between">
                <Label className="text-xs">{label}</Label>
                {isOverridden && onReset && (
                    <button onClick={onReset} className="text-muted-foreground hover:text-foreground transition-colors" title="Ripristina valore globale">
                        <RotateCcw className="h-3 w-3" />
                    </button>
                )}
            </div>
            {children}
        </div>
    );
}

export default function ChartStyleEditor({ chartType, style, globalTheme, onChange, dataKeys }: ChartStyleEditorProps) {
    // Ensure style has the correct type field
    const currentStyle = (style && style.type === chartType ? style : { type: chartType }) as ChartStyle;

    const update = useCallback((partial: Record<string, any>) => {
        onChange({ ...currentStyle, ...partial } as ChartStyle);
    }, [currentStyle, onChange]);

    const resetField = useCallback((field: string) => {
        const newStyle = { ...currentStyle };
        delete (newStyle as any)[field];
        onChange(newStyle as ChartStyle);
    }, [currentStyle, onChange]);

    const resetAll = useCallback(() => {
        onChange({ type: chartType } as ChartStyle);
    }, [chartType, onChange]);

    // Cast for type-specific access
    const barStyle = currentStyle as BarChartStyle & { type: string };
    const lineStyle = currentStyle as LineChartStyle & { type: string };
    const areaStyle = currentStyle as AreaChartStyle & { type: string };
    const pieStyle = currentStyle as PieChartStyle & { type: string };
    const kpiStyle = currentStyle as KpiCardStyle & { type: string };
    const tableStyleVal = currentStyle as TableStyle & { type: string };

    return (
        <div className="space-y-2">
            {/* ── Colori ── */}
            <StyleSection title="Colori" defaultOpen={true}>
                <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Palette colori per serie dati</Label>
                    <div className="flex flex-wrap gap-1.5">
                        {(getVal(currentStyle.colors, globalTheme.colors)).map((color, i) => (
                            <div key={i} className="relative group">
                                <input
                                    type="color"
                                    value={color}
                                    onChange={(e) => {
                                        const newColors = [...getVal(currentStyle.colors, globalTheme.colors)];
                                        newColors[i] = e.target.value;
                                        update({ colors: newColors });
                                    }}
                                    className="w-7 h-7 rounded cursor-pointer border border-border"
                                    title={`Colore ${i + 1}: ${color}`}
                                />
                                {(dataKeys && i < dataKeys.length) && (
                                    <span className="absolute -bottom-4 left-0 text-[8px] text-muted-foreground truncate max-w-[28px]">{dataKeys[i]}</span>
                                )}
                            </div>
                        ))}
                    </div>
                    {currentStyle.colors && (
                        <button onClick={() => resetField('colors')} className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1">
                            <RotateCcw className="h-2.5 w-2.5" /> Ripristina palette globale
                        </button>
                    )}
                </div>
            </StyleSection>

            {/* ── Tipografia ── */}
            <StyleSection title="Tipografia">
                <FieldRow label="Font Size Assi" isOverridden={currentStyle.axisFontSize !== undefined} onReset={() => resetField('axisFontSize')}>
                    <div className="flex items-center gap-2">
                        <Slider
                            value={[getVal(currentStyle.axisFontSize, globalTheme.axisFontSize)]}
                            onValueChange={([v]) => update({ axisFontSize: v })}
                            min={8} max={20} step={1}
                            className="flex-1"
                        />
                        <span className="text-xs text-muted-foreground w-6 text-right">{getVal(currentStyle.axisFontSize, globalTheme.axisFontSize)}</span>
                    </div>
                </FieldRow>
                <FieldRow label="Font Size Tooltip" isOverridden={currentStyle.tooltipFontSize !== undefined} onReset={() => resetField('tooltipFontSize')}>
                    <div className="flex items-center gap-2">
                        <Slider
                            value={[getVal(currentStyle.tooltipFontSize, globalTheme.tooltipFontSize)]}
                            onValueChange={([v]) => update({ tooltipFontSize: v })}
                            min={8} max={20} step={1}
                            className="flex-1"
                        />
                        <span className="text-xs text-muted-foreground w-6 text-right">{getVal(currentStyle.tooltipFontSize, globalTheme.tooltipFontSize)}</span>
                    </div>
                </FieldRow>
                <FieldRow label="Font Size Legenda" isOverridden={currentStyle.legendFontSize !== undefined} onReset={() => resetField('legendFontSize')}>
                    <div className="flex items-center gap-2">
                        <Slider
                            value={[getVal(currentStyle.legendFontSize, globalTheme.legendFontSize)]}
                            onValueChange={([v]) => update({ legendFontSize: v })}
                            min={8} max={20} step={1}
                            className="flex-1"
                        />
                        <span className="text-xs text-muted-foreground w-6 text-right">{getVal(currentStyle.legendFontSize, globalTheme.legendFontSize)}</span>
                    </div>
                </FieldRow>
                <FieldRow label="Font Size Titolo" isOverridden={currentStyle.titleFontSize !== undefined} onReset={() => resetField('titleFontSize')}>
                    <div className="flex items-center gap-2">
                        <Slider
                            value={[getVal(currentStyle.titleFontSize, globalTheme.titleFontSize)]}
                            onValueChange={([v]) => update({ titleFontSize: v })}
                            min={10} max={28} step={1}
                            className="flex-1"
                        />
                        <span className="text-xs text-muted-foreground w-6 text-right">{getVal(currentStyle.titleFontSize, globalTheme.titleFontSize)}</span>
                    </div>
                </FieldRow>
            </StyleSection>

            {/* ── Griglia ── */}
            {chartType !== 'pie-chart' && chartType !== 'kpi-card' && chartType !== 'table' && (
                <StyleSection title="Griglia">
                    <FieldRow label="Stile Griglia" isOverridden={currentStyle.gridStyle !== undefined} onReset={() => resetField('gridStyle')}>
                        <Select
                            value={getVal(currentStyle.gridStyle, globalTheme.gridStyle)}
                            onValueChange={(v) => update({ gridStyle: v })}
                        >
                            <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="solid">Continua</SelectItem>
                                <SelectItem value="dashed">Tratteggiata</SelectItem>
                                <SelectItem value="dotted">Puntinata</SelectItem>
                                <SelectItem value="none">Nessuna</SelectItem>
                            </SelectContent>
                        </Select>
                    </FieldRow>
                    <FieldRow label="Colore Griglia" isOverridden={currentStyle.gridColor !== undefined} onReset={() => resetField('gridColor')}>
                        <div className="flex items-center gap-2">
                            <input
                                type="color"
                                value={getVal(currentStyle.gridColor, globalTheme.gridColor)}
                                onChange={(e) => update({ gridColor: e.target.value })}
                                className="w-8 h-8 rounded cursor-pointer border border-border"
                            />
                            <span className="text-xs text-muted-foreground">{getVal(currentStyle.gridColor, globalTheme.gridColor)}</span>
                        </div>
                    </FieldRow>
                </StyleSection>
            )}

            {/* ── Margini ── */}
            <StyleSection title="Margini">
                <div className="grid grid-cols-2 gap-2">
                    {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
                        <FieldRow key={side} label={side.charAt(0).toUpperCase() + side.slice(1)}>
                            <Input
                                type="number"
                                value={getVal(currentStyle.chartMargins?.[side], globalTheme.chartMargins[side])}
                                onChange={(e) => {
                                    const margins = { ...currentStyle.chartMargins, [side]: parseInt(e.target.value) || 0 };
                                    update({ chartMargins: margins });
                                }}
                                className="h-7 text-xs"
                            />
                        </FieldRow>
                    ))}
                </div>
                {currentStyle.chartMargins && (
                    <button onClick={() => resetField('chartMargins')} className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1">
                        <RotateCcw className="h-2.5 w-2.5" /> Ripristina margini globali
                    </button>
                )}
            </StyleSection>

            {/* ── Legenda ── */}
            {chartType !== 'kpi-card' && (
                <StyleSection title="Legenda">
                    <FieldRow label="Posizione" isOverridden={currentStyle.legendPosition !== undefined} onReset={() => resetField('legendPosition')}>
                        <Select
                            value={getVal(currentStyle.legendPosition, 'bottom')}
                            onValueChange={(v) => update({ legendPosition: v })}
                        >
                            <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="top">Alto</SelectItem>
                                <SelectItem value="bottom">Basso</SelectItem>
                                <SelectItem value="left">Sinistra</SelectItem>
                                <SelectItem value="right">Destra</SelectItem>
                                <SelectItem value="none">Nascosta</SelectItem>
                            </SelectContent>
                        </Select>
                    </FieldRow>
                </StyleSection>
            )}

            {/* ══════════════════════════════════════════ */}
            {/* ── SEZIONI TIPO-SPECIFICHE ── */}
            {/* ══════════════════════════════════════════ */}

            {/* ── Bar Chart ── */}
            {chartType === 'bar-chart' && (
                <StyleSection title="Opzioni Barre" defaultOpen={true}>
                    <FieldRow label="Raggio Angoli" isOverridden={barStyle.barRadius !== undefined} onReset={() => resetField('barRadius')}>
                        <div className="flex items-center gap-2">
                            <Slider
                                value={[getVal(barStyle.barRadius, globalTheme.barRadius)]}
                                onValueChange={([v]) => update({ barRadius: v })}
                                min={0} max={20} step={1}
                                className="flex-1"
                            />
                            <span className="text-xs text-muted-foreground w-6 text-right">{getVal(barStyle.barRadius, globalTheme.barRadius)}</span>
                        </div>
                    </FieldRow>
                    <FieldRow label="Gap tra Barre" isOverridden={barStyle.barGap !== undefined} onReset={() => resetField('barGap')}>
                        <div className="flex items-center gap-2">
                            <Slider
                                value={[getVal(barStyle.barGap, 4)]}
                                onValueChange={([v]) => update({ barGap: v })}
                                min={0} max={20} step={1}
                                className="flex-1"
                            />
                            <span className="text-xs text-muted-foreground w-6 text-right">{getVal(barStyle.barGap, 4)}</span>
                        </div>
                    </FieldRow>
                    <FieldRow label="Gap tra Categorie" isOverridden={barStyle.barCategoryGap !== undefined} onReset={() => resetField('barCategoryGap')}>
                        <div className="flex items-center gap-2">
                            <Slider
                                value={[getVal(barStyle.barCategoryGap, 10)]}
                                onValueChange={([v]) => update({ barCategoryGap: v })}
                                min={0} max={50} step={1}
                                className="flex-1"
                            />
                            <span className="text-xs text-muted-foreground w-6 text-right">{getVal(barStyle.barCategoryGap, 10)}%</span>
                        </div>
                    </FieldRow>
                    <div className="flex items-center justify-between">
                        <Label className="text-xs">Barre Impilate</Label>
                        <Switch
                            checked={barStyle.stackBars || false}
                            onCheckedChange={(v) => update({ stackBars: v })}
                        />
                    </div>
                    <FieldRow label="Orientamento" isOverridden={barStyle.barOrientation !== undefined} onReset={() => resetField('barOrientation')}>
                        <Select
                            value={getVal(barStyle.barOrientation, 'vertical')}
                            onValueChange={(v) => update({ barOrientation: v })}
                        >
                            <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="vertical">Verticale</SelectItem>
                                <SelectItem value="horizontal">Orizzontale</SelectItem>
                            </SelectContent>
                        </Select>
                    </FieldRow>
                </StyleSection>
            )}

            {/* ── Line Chart ── */}
            {chartType === 'line-chart' && (
                <StyleSection title="Opzioni Linea" defaultOpen={true}>
                    <FieldRow label="Spessore Linea" isOverridden={lineStyle.lineWidth !== undefined} onReset={() => resetField('lineWidth')}>
                        <div className="flex items-center gap-2">
                            <Slider
                                value={[getVal(lineStyle.lineWidth, globalTheme.lineWidth)]}
                                onValueChange={([v]) => update({ lineWidth: v })}
                                min={1} max={8} step={0.5}
                                className="flex-1"
                            />
                            <span className="text-xs text-muted-foreground w-6 text-right">{getVal(lineStyle.lineWidth, globalTheme.lineWidth)}</span>
                        </div>
                    </FieldRow>
                    <FieldRow label="Stile Linea" isOverridden={lineStyle.lineStyle !== undefined} onReset={() => resetField('lineStyle')}>
                        <Select
                            value={getVal(lineStyle.lineStyle, globalTheme.defaultLineStyle)}
                            onValueChange={(v) => update({ lineStyle: v })}
                        >
                            <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="solid">Continua</SelectItem>
                                <SelectItem value="dashed">Tratteggiata</SelectItem>
                                <SelectItem value="dotted">Puntinata</SelectItem>
                            </SelectContent>
                        </Select>
                    </FieldRow>
                    <FieldRow label="Tipo Curva" isOverridden={lineStyle.lineType !== undefined} onReset={() => resetField('lineType')}>
                        <Select
                            value={getVal(lineStyle.lineType, 'monotone')}
                            onValueChange={(v) => update({ lineType: v })}
                        >
                            <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="monotone">Monotone (smooth)</SelectItem>
                                <SelectItem value="linear">Lineare</SelectItem>
                                <SelectItem value="step">Step</SelectItem>
                                <SelectItem value="stepBefore">Step Before</SelectItem>
                                <SelectItem value="stepAfter">Step After</SelectItem>
                            </SelectContent>
                        </Select>
                    </FieldRow>
                    <div className="flex items-center justify-between">
                        <Label className="text-xs">Mostra Punti</Label>
                        <Switch
                            checked={getVal(lineStyle.showDots, true)}
                            onCheckedChange={(v) => update({ showDots: v })}
                        />
                    </div>
                    {getVal(lineStyle.showDots, true) && (
                        <FieldRow label="Raggio Punti" isOverridden={lineStyle.dotRadius !== undefined} onReset={() => resetField('dotRadius')}>
                            <div className="flex items-center gap-2">
                                <Slider
                                    value={[getVal(lineStyle.dotRadius, 4)]}
                                    onValueChange={([v]) => update({ dotRadius: v })}
                                    min={1} max={10} step={0.5}
                                    className="flex-1"
                                />
                                <span className="text-xs text-muted-foreground w-6 text-right">{getVal(lineStyle.dotRadius, 4)}</span>
                            </div>
                        </FieldRow>
                    )}
                    <div className="flex items-center justify-between">
                        <Label className="text-xs">Connetti Valori Null</Label>
                        <Switch
                            checked={getVal(lineStyle.connectNulls, true)}
                            onCheckedChange={(v) => update({ connectNulls: v })}
                        />
                    </div>
                </StyleSection>
            )}

            {/* ── Area Chart ── */}
            {chartType === 'area-chart' && (
                <StyleSection title="Opzioni Area" defaultOpen={true}>
                    <FieldRow label="Opacita Area" isOverridden={areaStyle.areaOpacity !== undefined} onReset={() => resetField('areaOpacity')}>
                        <div className="flex items-center gap-2">
                            <Slider
                                value={[getVal(areaStyle.areaOpacity, globalTheme.areaOpacity)]}
                                onValueChange={([v]) => update({ areaOpacity: v })}
                                min={0} max={1} step={0.05}
                                className="flex-1"
                            />
                            <span className="text-xs text-muted-foreground w-10 text-right">{getVal(areaStyle.areaOpacity, globalTheme.areaOpacity).toFixed(2)}</span>
                        </div>
                    </FieldRow>
                    <FieldRow label="Spessore Linea" isOverridden={areaStyle.lineWidth !== undefined} onReset={() => resetField('lineWidth')}>
                        <div className="flex items-center gap-2">
                            <Slider
                                value={[getVal(areaStyle.lineWidth, globalTheme.lineWidth)]}
                                onValueChange={([v]) => update({ lineWidth: v })}
                                min={1} max={8} step={0.5}
                                className="flex-1"
                            />
                            <span className="text-xs text-muted-foreground w-6 text-right">{getVal(areaStyle.lineWidth, globalTheme.lineWidth)}</span>
                        </div>
                    </FieldRow>
                    <FieldRow label="Tipo Curva" isOverridden={areaStyle.lineType !== undefined} onReset={() => resetField('lineType')}>
                        <Select
                            value={getVal(areaStyle.lineType, 'monotone')}
                            onValueChange={(v) => update({ lineType: v })}
                        >
                            <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="monotone">Monotone (smooth)</SelectItem>
                                <SelectItem value="linear">Lineare</SelectItem>
                                <SelectItem value="step">Step</SelectItem>
                            </SelectContent>
                        </Select>
                    </FieldRow>
                    <div className="flex items-center justify-between">
                        <Label className="text-xs">Aree Impilate</Label>
                        <Switch
                            checked={areaStyle.stackAreas || false}
                            onCheckedChange={(v) => update({ stackAreas: v })}
                        />
                    </div>
                    <div className="flex items-center justify-between">
                        <Label className="text-xs">Mostra Punti</Label>
                        <Switch
                            checked={getVal(areaStyle.showDots, false)}
                            onCheckedChange={(v) => update({ showDots: v })}
                        />
                    </div>
                </StyleSection>
            )}

            {/* ── Pie Chart ── */}
            {chartType === 'pie-chart' && (
                <StyleSection title="Opzioni Torta" defaultOpen={true}>
                    <FieldRow label="Raggio Interno (0 = torta, >0 = ciambella)" isOverridden={pieStyle.innerRadius !== undefined} onReset={() => resetField('innerRadius')}>
                        <div className="flex items-center gap-2">
                            <Slider
                                value={[getVal(pieStyle.innerRadius, 0)]}
                                onValueChange={([v]) => update({ innerRadius: v })}
                                min={0} max={80} step={1}
                                className="flex-1"
                            />
                            <span className="text-xs text-muted-foreground w-6 text-right">{getVal(pieStyle.innerRadius, 0)}</span>
                        </div>
                    </FieldRow>
                    <FieldRow label="Raggio Esterno" isOverridden={pieStyle.outerRadius !== undefined} onReset={() => resetField('outerRadius')}>
                        <div className="flex items-center gap-2">
                            <Slider
                                value={[getVal(pieStyle.outerRadius, 80)]}
                                onValueChange={([v]) => update({ outerRadius: v })}
                                min={30} max={120} step={1}
                                className="flex-1"
                            />
                            <span className="text-xs text-muted-foreground w-6 text-right">{getVal(pieStyle.outerRadius, 80)}</span>
                        </div>
                    </FieldRow>
                    <FieldRow label="Angolo Padding" isOverridden={pieStyle.paddingAngle !== undefined} onReset={() => resetField('paddingAngle')}>
                        <div className="flex items-center gap-2">
                            <Slider
                                value={[getVal(pieStyle.paddingAngle, 0)]}
                                onValueChange={([v]) => update({ paddingAngle: v })}
                                min={0} max={10} step={1}
                                className="flex-1"
                            />
                            <span className="text-xs text-muted-foreground w-6 text-right">{getVal(pieStyle.paddingAngle, 0)}</span>
                        </div>
                    </FieldRow>
                    <div className="flex items-center justify-between">
                        <Label className="text-xs">Mostra Etichette</Label>
                        <Switch
                            checked={getVal(pieStyle.showLabels, true)}
                            onCheckedChange={(v) => update({ showLabels: v })}
                        />
                    </div>
                    {getVal(pieStyle.showLabels, true) && (
                        <FieldRow label="Tipo Etichetta" isOverridden={pieStyle.labelType !== undefined} onReset={() => resetField('labelType')}>
                            <Select
                                value={getVal(pieStyle.labelType, 'name-percent')}
                                onValueChange={(v) => update({ labelType: v })}
                            >
                                <SelectTrigger className="h-8 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="percent">Percentuale</SelectItem>
                                    <SelectItem value="value">Valore</SelectItem>
                                    <SelectItem value="name">Nome</SelectItem>
                                    <SelectItem value="name-percent">Nome + %</SelectItem>
                                </SelectContent>
                            </Select>
                        </FieldRow>
                    )}
                </StyleSection>
            )}

            {/* ── KPI Card ── */}
            {chartType === 'kpi-card' && (
                <StyleSection title="Opzioni KPI" defaultOpen={true}>
                    <FieldRow label="Dimensione Valore" isOverridden={kpiStyle.kpiValueSize !== undefined} onReset={() => resetField('kpiValueSize')}>
                        <div className="flex items-center gap-2">
                            <Slider
                                value={[getVal(kpiStyle.kpiValueSize, globalTheme.kpiValueSize)]}
                                onValueChange={([v]) => update({ kpiValueSize: v })}
                                min={16} max={72} step={2}
                                className="flex-1"
                            />
                            <span className="text-xs text-muted-foreground w-6 text-right">{getVal(kpiStyle.kpiValueSize, globalTheme.kpiValueSize)}</span>
                        </div>
                    </FieldRow>
                    <FieldRow label="Dimensione Label" isOverridden={kpiStyle.kpiLabelSize !== undefined} onReset={() => resetField('kpiLabelSize')}>
                        <div className="flex items-center gap-2">
                            <Slider
                                value={[getVal(kpiStyle.kpiLabelSize, globalTheme.kpiLabelSize)]}
                                onValueChange={([v]) => update({ kpiLabelSize: v })}
                                min={8} max={24} step={1}
                                className="flex-1"
                            />
                            <span className="text-xs text-muted-foreground w-6 text-right">{getVal(kpiStyle.kpiLabelSize, globalTheme.kpiLabelSize)}</span>
                        </div>
                    </FieldRow>
                    <FieldRow label="Colore Positivo" isOverridden={kpiStyle.kpiPositiveColor !== undefined} onReset={() => resetField('kpiPositiveColor')}>
                        <div className="flex items-center gap-2">
                            <input
                                type="color"
                                value={getVal(kpiStyle.kpiPositiveColor, globalTheme.kpiPositiveColor)}
                                onChange={(e) => update({ kpiPositiveColor: e.target.value })}
                                className="w-8 h-8 rounded cursor-pointer border border-border"
                            />
                            <span className="text-xs text-muted-foreground">{getVal(kpiStyle.kpiPositiveColor, globalTheme.kpiPositiveColor)}</span>
                        </div>
                    </FieldRow>
                    <FieldRow label="Colore Negativo" isOverridden={kpiStyle.kpiNegativeColor !== undefined} onReset={() => resetField('kpiNegativeColor')}>
                        <div className="flex items-center gap-2">
                            <input
                                type="color"
                                value={getVal(kpiStyle.kpiNegativeColor, globalTheme.kpiNegativeColor)}
                                onChange={(e) => update({ kpiNegativeColor: e.target.value })}
                                className="w-8 h-8 rounded cursor-pointer border border-border"
                            />
                            <span className="text-xs text-muted-foreground">{getVal(kpiStyle.kpiNegativeColor, globalTheme.kpiNegativeColor)}</span>
                        </div>
                    </FieldRow>
                </StyleSection>
            )}

            {/* ── Table ── */}
            {chartType === 'table' && (
                <StyleSection title="Opzioni Tabella" defaultOpen={true}>
                    <FieldRow label="Colore Header" isOverridden={tableStyleVal.tableHeaderBg !== undefined} onReset={() => resetField('tableHeaderBg')}>
                        <Input
                            value={getVal(tableStyleVal.tableHeaderBg, globalTheme.tableHeaderBg)}
                            onChange={(e) => update({ tableHeaderBg: e.target.value })}
                            className="h-7 text-xs"
                            placeholder="hsl(var(--muted))"
                        />
                    </FieldRow>
                    <div className="flex items-center justify-between">
                        <Label className="text-xs">Righe Alternate</Label>
                        <Switch
                            checked={getVal(tableStyleVal.tableAlternateRows, globalTheme.tableAlternateRows)}
                            onCheckedChange={(v) => update({ tableAlternateRows: v })}
                        />
                    </div>
                    <FieldRow label="Font Size" isOverridden={tableStyleVal.tableFontSize !== undefined} onReset={() => resetField('tableFontSize')}>
                        <div className="flex items-center gap-2">
                            <Slider
                                value={[getVal(tableStyleVal.tableFontSize, globalTheme.tableFontSize)]}
                                onValueChange={([v]) => update({ tableFontSize: v })}
                                min={8} max={18} step={1}
                                className="flex-1"
                            />
                            <span className="text-xs text-muted-foreground w-6 text-right">{getVal(tableStyleVal.tableFontSize, globalTheme.tableFontSize)}</span>
                        </div>
                    </FieldRow>
                    <FieldRow label="Stile Bordi" isOverridden={tableStyleVal.tableBorderStyle !== undefined} onReset={() => resetField('tableBorderStyle')}>
                        <Select
                            value={getVal(tableStyleVal.tableBorderStyle, globalTheme.tableBorderStyle)}
                            onValueChange={(v) => update({ tableBorderStyle: v })}
                        >
                            <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="solid">Continuo</SelectItem>
                                <SelectItem value="dashed">Tratteggiato</SelectItem>
                                <SelectItem value="none">Nessuno</SelectItem>
                            </SelectContent>
                        </Select>
                    </FieldRow>
                    <div className="flex items-center justify-between">
                        <Label className="text-xs">Modalita Compatta</Label>
                        <Switch
                            checked={tableStyleVal.compactMode || false}
                            onCheckedChange={(v) => update({ compactMode: v })}
                        />
                    </div>
                </StyleSection>
            )}

            {/* ── Reset All ── */}
            <Button variant="outline" size="sm" className="w-full text-xs" onClick={resetAll}>
                <RotateCcw className="h-3 w-3 mr-1.5" />
                Ripristina Tema Globale
            </Button>
        </div>
    );
}
