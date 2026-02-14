'use client';

import { useState, useEffect } from 'react';
import { Palette, Type, Grid3X3, Table, BarChart3, Save, RotateCcw, Loader2, Maximize } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import { useChartTheme } from '@/hooks/use-chart-theme';
import { ChartTheme, DEFAULT_CHART_THEME } from '@/lib/chart-theme';
import { saveChartThemeAction, resetChartThemeAction } from '@/actions/chart-theme';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { gridStrokeDasharray, lineStrokeDasharray } from '@/lib/chart-theme';
import { ChevronDown } from 'lucide-react';

const SAMPLE_DATA = [
  { name: 'Gen', vendite: 4000, costi: 2400 },
  { name: 'Feb', vendite: 3000, costi: 1398 },
  { name: 'Mar', vendite: 5000, costi: 3200 },
  { name: 'Apr', vendite: 4780, costi: 2908 },
  { name: 'Mag', vendite: 5890, costi: 3800 },
  { name: 'Giu', vendite: 4390, costi: 2500 },
];

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-8 rounded border cursor-pointer bg-transparent"
      />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-24 font-mono text-xs"
        placeholder="#000000"
      />
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}

function NumberInput({ label, value, onChange, min, max, step }: {
  label: string; value: number; onChange: (v: number) => void;
  min?: number; max?: number; step?: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <Label className="text-xs min-w-[100px]">{label}</Label>
      <Input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        step={step || 1}
        className="h-8 w-20 text-xs"
      />
    </div>
  );
}

function Section({ title, icon: Icon, children }: {
  title: string; icon: React.ElementType; children: React.ReactNode;
}) {
  return (
    <Collapsible>
      <CollapsibleTrigger className="flex items-center gap-2 w-full py-2 text-sm font-semibold hover:text-primary transition-colors group">
        <Icon className="h-4 w-4 text-primary" />
        {title}
        <ChevronDown className="h-3 w-3 ml-auto text-muted-foreground group-data-[state=open]:rotate-180 transition-transform" />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 pl-6 pb-4">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function AppearanceSettings() {
  const { toast } = useToast();
  const { theme: loadedTheme, isLoading: isThemeLoading, refetch } = useChartTheme();
  const [draft, setDraft] = useState<ChartTheme>(DEFAULT_CHART_THEME);
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    if (!isThemeLoading) {
      setDraft({ ...loadedTheme });
    }
  }, [isThemeLoading, loadedTheme]);

  const update = <K extends keyof ChartTheme>(key: K, value: ChartTheme[K]) => {
    setDraft(prev => ({ ...prev, [key]: value }));
  };

  const updateColor = (index: number, value: string) => {
    setDraft(prev => {
      const colors = [...prev.colors];
      colors[index] = value;
      return { ...prev, colors };
    });
  };

  const updateMargin = (side: 'top' | 'right' | 'bottom' | 'left', value: number) => {
    setDraft(prev => ({
      ...prev,
      chartMargins: { ...prev.chartMargins, [side]: value },
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const result = await saveChartThemeAction(draft);
      if (result.success) {
        await refetch();
        toast({ title: 'Tema salvato', description: 'Le impostazioni di stile sono state salvate.' });
      } else {
        toast({ title: 'Errore', description: result.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Errore', description: 'Impossibile salvare il tema.', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    setIsResetting(true);
    try {
      const result = await resetChartThemeAction();
      if (result.success) {
        setDraft({ ...DEFAULT_CHART_THEME });
        await refetch();
        toast({ title: 'Tema ripristinato', description: 'Sono stati ripristinati i valori predefiniti.' });
      } else {
        toast({ title: 'Errore', description: result.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Errore', description: 'Impossibile ripristinare il tema.', variant: 'destructive' });
    } finally {
      setIsResetting(false);
    }
  };

  if (isThemeLoading) {
    return (
      <Card className="mb-6">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="h-6 w-6 text-primary" />
          Aspetto
        </CardTitle>
        <CardDescription>
          Configura i colori, la tipografia e lo stile di grafici, tabelle e KPI per tutta l&apos;azienda.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* Palette Colori */}
        <Section title="Palette Colori" icon={Palette}>
          <div className="grid grid-cols-2 gap-2">
            {draft.colors.map((color, i) => (
              <ColorInput
                key={i}
                label={`Colore ${i + 1}`}
                value={color}
                onChange={(v) => updateColor(i, v)}
              />
            ))}
          </div>
        </Section>

        {/* Tipografia */}
        <Section title="Tipografia" icon={Type}>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label className="text-xs min-w-[100px]">Font</Label>
              <Input
                value={draft.fontFamily}
                onChange={(e) => update('fontFamily', e.target.value)}
                className="h-8 text-xs"
                placeholder="Inter, sans-serif"
              />
            </div>
            <NumberInput label="Assi" value={draft.axisFontSize} onChange={(v) => update('axisFontSize', v)} min={8} max={24} />
            <NumberInput label="Tooltip" value={draft.tooltipFontSize} onChange={(v) => update('tooltipFontSize', v)} min={8} max={24} />
            <NumberInput label="Legenda" value={draft.legendFontSize} onChange={(v) => update('legendFontSize', v)} min={8} max={24} />
            <NumberInput label="Titolo" value={draft.titleFontSize} onChange={(v) => update('titleFontSize', v)} min={10} max={32} />
          </div>
        </Section>

        {/* Griglia e Linee */}
        <Section title="Griglia e Linee" icon={Grid3X3}>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label className="text-xs min-w-[100px]">Griglia</Label>
              <Select value={draft.gridStyle} onValueChange={(v) => update('gridStyle', v as ChartTheme['gridStyle'])}>
                <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dashed">Tratteggiata</SelectItem>
                  <SelectItem value="solid">Continua</SelectItem>
                  <SelectItem value="dotted">Puntinata</SelectItem>
                  <SelectItem value="none">Nessuna</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <ColorInput label="Colore griglia" value={draft.gridColor} onChange={(v) => update('gridColor', v)} />
            <div className="flex items-center gap-2">
              <Label className="text-xs min-w-[100px]">Stile linee</Label>
              <Select value={draft.defaultLineStyle} onValueChange={(v) => update('defaultLineStyle', v as ChartTheme['defaultLineStyle'])}>
                <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="solid">Continua</SelectItem>
                  <SelectItem value="dashed">Tratteggiata</SelectItem>
                  <SelectItem value="dotted">Puntinata</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <NumberInput label="Spessore linea" value={draft.lineWidth} onChange={(v) => update('lineWidth', v)} min={1} max={6} />
            <NumberInput label="Opacita' area" value={draft.areaOpacity} onChange={(v) => update('areaOpacity', v)} min={0} max={1} step={0.1} />
            <NumberInput label="Raggio barre" value={draft.barRadius} onChange={(v) => update('barRadius', v)} min={0} max={12} />
          </div>
        </Section>

        {/* Margini */}
        <Section title="Margini Grafici" icon={Maximize}>
          <div className="grid grid-cols-2 gap-2">
            <NumberInput label="Sopra" value={draft.chartMargins.top} onChange={(v) => updateMargin('top', v)} min={0} max={60} />
            <NumberInput label="Destra" value={draft.chartMargins.right} onChange={(v) => updateMargin('right', v)} min={0} max={60} />
            <NumberInput label="Sotto" value={draft.chartMargins.bottom} onChange={(v) => updateMargin('bottom', v)} min={0} max={60} />
            <NumberInput label="Sinistra" value={draft.chartMargins.left} onChange={(v) => updateMargin('left', v)} min={0} max={120} />
          </div>
        </Section>

        {/* Tabelle */}
        <Section title="Tabelle" icon={Table}>
          <div className="space-y-2">
            <ColorInput label="Sfondo header" value={draft.tableHeaderBg} onChange={(v) => update('tableHeaderBg', v)} />
            <ColorInput label="Hover riga" value={draft.tableRowHoverColor} onChange={(v) => update('tableRowHoverColor', v)} />
            <NumberInput label="Dim. testo" value={draft.tableFontSize} onChange={(v) => update('tableFontSize', v)} min={8} max={18} />
            <div className="flex items-center gap-2">
              <Label className="text-xs min-w-[100px]">Bordi</Label>
              <Select value={draft.tableBorderStyle} onValueChange={(v) => update('tableBorderStyle', v as ChartTheme['tableBorderStyle'])}>
                <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="solid">Continui</SelectItem>
                  <SelectItem value="dashed">Tratteggiati</SelectItem>
                  <SelectItem value="none">Nessuno</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={draft.tableAlternateRows} onCheckedChange={(v) => update('tableAlternateRows', v)} />
              <Label className="text-xs">Righe alternate</Label>
            </div>
          </div>
        </Section>

        {/* KPI */}
        <Section title="KPI" icon={BarChart3}>
          <div className="space-y-2">
            <NumberInput label="Dim. valore" value={draft.kpiValueSize} onChange={(v) => update('kpiValueSize', v)} min={16} max={72} />
            <NumberInput label="Dim. etichetta" value={draft.kpiLabelSize} onChange={(v) => update('kpiLabelSize', v)} min={10} max={24} />
            <ColorInput label="Positivo" value={draft.kpiPositiveColor} onChange={(v) => update('kpiPositiveColor', v)} />
            <ColorInput label="Negativo" value={draft.kpiNegativeColor} onChange={(v) => update('kpiNegativeColor', v)} />
          </div>
        </Section>

        {/* Anteprima Live */}
        <div className="border rounded-lg p-4 bg-muted/10 mt-4">
          <h4 className="text-xs font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Anteprima</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">Grafico a Barre</p>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={SAMPLE_DATA} margin={draft.chartMargins}>
                  {draft.gridStyle !== 'none' && (
                    <CartesianGrid strokeDasharray={gridStrokeDasharray(draft.gridStyle)} stroke={draft.gridColor} />
                  )}
                  <XAxis dataKey="name" tick={{ fontSize: draft.axisFontSize }} />
                  <YAxis tick={{ fontSize: draft.axisFontSize }} />
                  <Tooltip contentStyle={{ fontSize: draft.tooltipFontSize }} />
                  <Legend wrapperStyle={{ fontSize: draft.legendFontSize }} />
                  <Bar dataKey="vendite" fill={draft.colors[0]} radius={[draft.barRadius, draft.barRadius, 0, 0]} />
                  <Bar dataKey="costi" fill={draft.colors[1]} radius={[draft.barRadius, draft.barRadius, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">Grafico a Linee</p>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={SAMPLE_DATA} margin={draft.chartMargins}>
                  {draft.gridStyle !== 'none' && (
                    <CartesianGrid strokeDasharray={gridStrokeDasharray(draft.gridStyle)} stroke={draft.gridColor} />
                  )}
                  <XAxis dataKey="name" tick={{ fontSize: draft.axisFontSize }} />
                  <YAxis tick={{ fontSize: draft.axisFontSize }} />
                  <Tooltip contentStyle={{ fontSize: draft.tooltipFontSize }} />
                  <Legend wrapperStyle={{ fontSize: draft.legendFontSize }} />
                  <Line
                    type="monotone"
                    dataKey="vendite"
                    stroke={draft.colors[0]}
                    strokeWidth={draft.lineWidth}
                    strokeDasharray={lineStrokeDasharray(draft.defaultLineStyle)}
                  />
                  <Line
                    type="monotone"
                    dataKey="costi"
                    stroke={draft.colors[1]}
                    strokeWidth={draft.lineWidth}
                    strokeDasharray={lineStrokeDasharray(draft.defaultLineStyle)}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Bottoni */}
        <div className="flex gap-2 pt-4">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Salva Tema
          </Button>
          <Button variant="outline" onClick={handleReset} disabled={isResetting}>
            {isResetting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RotateCcw className="h-4 w-4 mr-2" />}
            Ripristina Default
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
