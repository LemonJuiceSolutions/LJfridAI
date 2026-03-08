'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import type { UnifiedStylePreset } from '@/lib/unified-style-types';
import type { HtmlStyleOverrides } from '@/lib/html-style-utils';
import type { PlotlyStyleOverrides } from '@/lib/plotly-utils';
import type { UiElementsOverrides } from '@/lib/unified-style-types';
import { BUILTIN_PRESETS } from '@/lib/unified-style-presets';
import {
  getUnifiedStylePresetsAction,
  saveUnifiedStylePresetAction,
  updateUnifiedStylePresetAction,
  deleteUnifiedStylePresetAction,
  getActiveUnifiedStyleAction,
  setActiveUnifiedStyleAction,
} from '@/actions/unified-style-presets';

import StyleTopBar from './components/StyleTopBar';
import StylePresetGallery from './components/StylePresetGallery';
import HtmlTableEditor from './components/HtmlTableEditor';
import PlotlyChartEditor from './components/PlotlyChartEditor';
import UiElementsEditor from './components/UiElementsEditor';
import StyleLivePreview from './components/StyleLivePreview';

export default function StylePage() {
  const { toast } = useToast();

  // ── State ──
  const [activePreset, setActivePreset] = useState<UnifiedStylePreset>(BUILTIN_PRESETS[0]);
  const [htmlOverrides, setHtmlOverrides] = useState<Partial<HtmlStyleOverrides>>(BUILTIN_PRESETS[0].html);
  const [plotlyOverrides, setPlotlyOverrides] = useState<Partial<PlotlyStyleOverrides>>(BUILTIN_PRESETS[0].plotly);
  const [uiOverrides, setUiOverrides] = useState<Partial<UiElementsOverrides>>(BUILTIN_PRESETS[0].ui);
  const [presetName, setPresetName] = useState(BUILTIN_PRESETS[0].label);
  const [presetDescription, setPresetDescription] = useState(BUILTIN_PRESETS[0].description);
  const [presetCategory, setPresetCategory] = useState<string>(BUILTIN_PRESETS[0].category || 'custom');
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [customPresets, setCustomPresets] = useState<UnifiedStylePreset[]>([]);
  const [activeStyleId, setActiveStyleId] = useState<string | null>(null);

  // ── Load custom presets + active style ──
  useEffect(() => {
    getUnifiedStylePresetsAction().then(res => {
      if (res.presets) setCustomPresets(res.presets);
    });
    getActiveUnifiedStyleAction().then(res => {
      if (res.activeStyleId) setActiveStyleId(res.activeStyleId);
    });
  }, []);

  // ── Select preset ──
  const handleSelectPreset = useCallback((preset: UnifiedStylePreset) => {
    setActivePreset(preset);
    setHtmlOverrides(preset.html);
    setPlotlyOverrides(preset.plotly);
    setUiOverrides(preset.ui);
    setPresetName(preset.label);
    setPresetDescription(preset.description);
    setPresetCategory(preset.category || 'custom');
    setIsDirty(false);
  }, []);

  // ── Mark dirty on changes ──
  const handleHtmlChange = useCallback((o: Partial<HtmlStyleOverrides>) => {
    setHtmlOverrides(o);
    setIsDirty(true);
  }, []);
  const handlePlotlyChange = useCallback((o: Partial<PlotlyStyleOverrides>) => {
    setPlotlyOverrides(o);
    setIsDirty(true);
  }, []);
  const handleUiChange = useCallback((o: Partial<UiElementsOverrides>) => {
    setUiOverrides(o);
    setIsDirty(true);
  }, []);
  const handleNameChange = useCallback((n: string) => {
    setPresetName(n);
    setIsDirty(true);
  }, []);
  const handleDescriptionChange = useCallback((d: string) => {
    setPresetDescription(d);
    setIsDirty(true);
  }, []);
  const handleCategoryChange = useCallback((c: string) => {
    setPresetCategory(c as string);
    setIsDirty(true);
  }, []);

  // ── Current preview preset ──
  const currentPreviewPreset = useMemo<UnifiedStylePreset>(() => ({
    id: activePreset.id,
    label: presetName,
    description: presetDescription,
    category: presetCategory as UnifiedStylePreset['category'],
    html: htmlOverrides,
    plotly: plotlyOverrides,
    ui: uiOverrides,
    isBuiltIn: activePreset.isBuiltIn,
  }), [activePreset.id, activePreset.isBuiltIn, presetName, presetDescription, presetCategory, htmlOverrides, plotlyOverrides, uiOverrides]);

  // ── Save new ──
  const handleSaveNew = useCallback(async () => {
    if (!presetName.trim()) return;
    setIsSaving(true);
    try {
      const res = await saveUnifiedStylePresetAction(
        presetName, presetDescription, presetCategory,
        htmlOverrides, plotlyOverrides, uiOverrides,
      );
      if (res.success && res.preset) {
        setCustomPresets(prev => [...prev, res.preset!]);
        setActivePreset(res.preset);
        setIsDirty(false);
        toast({ title: 'Preset salvato', description: `"${presetName}" salvato con successo.` });
      } else {
        toast({ title: 'Errore', description: res.error || 'Impossibile salvare.', variant: 'destructive' });
      }
    } finally {
      setIsSaving(false);
    }
  }, [presetName, presetDescription, presetCategory, htmlOverrides, plotlyOverrides, uiOverrides, toast]);

  // ── Update existing custom ──
  const handleUpdate = useCallback(async () => {
    if (!activePreset.id.startsWith('custom_')) return;
    setIsSaving(true);
    try {
      const res = await updateUnifiedStylePresetAction(activePreset.id, {
        label: presetName,
        description: presetDescription,
        category: presetCategory as UnifiedStylePreset['category'],
        html: htmlOverrides,
        plotly: plotlyOverrides,
        ui: uiOverrides,
      });
      if (res.success) {
        setCustomPresets(prev => prev.map(p =>
          p.id === activePreset.id
            ? { ...p, label: presetName, description: presetDescription, category: presetCategory as UnifiedStylePreset['category'], html: htmlOverrides, plotly: plotlyOverrides, ui: uiOverrides }
            : p
        ));
        setIsDirty(false);
        toast({ title: 'Preset aggiornato', description: `"${presetName}" aggiornato.` });
      } else {
        toast({ title: 'Errore', description: res.error || 'Impossibile aggiornare.', variant: 'destructive' });
      }
    } finally {
      setIsSaving(false);
    }
  }, [activePreset.id, presetName, presetDescription, presetCategory, htmlOverrides, plotlyOverrides, uiOverrides, toast]);

  // ── Reset ──
  const handleReset = useCallback(() => {
    handleSelectPreset(activePreset);
  }, [activePreset, handleSelectPreset]);

  // ── Delete ──
  const handleDelete = useCallback(async () => {
    if (!activePreset.id.startsWith('custom_')) return;
    setIsSaving(true);
    try {
      const res = await deleteUnifiedStylePresetAction(activePreset.id);
      if (res.success) {
        setCustomPresets(prev => prev.filter(p => p.id !== activePreset.id));
        handleSelectPreset(BUILTIN_PRESETS[0]);
        toast({ title: 'Preset eliminato' });
      } else {
        toast({ title: 'Errore', description: res.error || 'Impossibile eliminare.', variant: 'destructive' });
      }
    } finally {
      setIsSaving(false);
    }
  }, [activePreset.id, handleSelectPreset, toast]);

  // ── Delete custom from gallery ──
  const handleDeleteFromGallery = useCallback(async (id: string) => {
    setIsSaving(true);
    try {
      const res = await deleteUnifiedStylePresetAction(id);
      if (res.success) {
        setCustomPresets(prev => prev.filter(p => p.id !== id));
        if (activePreset.id === id) {
          handleSelectPreset(BUILTIN_PRESETS[0]);
        }
        toast({ title: 'Preset eliminato' });
      }
    } finally {
      setIsSaving(false);
    }
  }, [activePreset.id, handleSelectPreset, toast]);

  // ── Set active style ──
  const handleSetActive = useCallback(async () => {
    setIsSaving(true);
    try {
      const res = await setActiveUnifiedStyleAction(activePreset.id);
      if (res.success) {
        setActiveStyleId(activePreset.id);
        toast({ title: 'Stile attivato', description: `"${presetName}" è ora lo stile attivo per l'app.` });
      } else {
        toast({ title: 'Errore', description: res.error || 'Impossibile impostare.', variant: 'destructive' });
      }
    } finally {
      setIsSaving(false);
    }
  }, [activePreset.id, presetName, toast]);

  return (
    <div className="flex flex-col h-screen">
      {/* Top Bar */}
      <StyleTopBar
        name={presetName}
        description={presetDescription}
        category={presetCategory}
        isBuiltIn={!!activePreset.isBuiltIn}
        isDirty={isDirty}
        isSaving={isSaving}
        onNameChange={handleNameChange}
        onDescriptionChange={handleDescriptionChange}
        onCategoryChange={handleCategoryChange}
        onSaveNew={handleSaveNew}
        onUpdate={handleUpdate}
        onReset={handleReset}
        onDelete={handleDelete}
        activePresetId={activePreset.id}
        isActiveStyle={activePreset.id === activeStyleId}
        onSetActive={handleSetActive}
      />

      {/* Main content: editors + preview */}
      <div className="flex flex-1 min-h-0">
        {/* Left panel: Tabs */}
        <div className="w-[55%] border-r flex flex-col min-h-0">
          <Tabs defaultValue="gallery" className="flex flex-col flex-1 min-h-0">
            <TabsList className="mx-3 mt-2 shrink-0">
              <TabsTrigger value="gallery" className="text-xs">Galleria</TabsTrigger>
              <TabsTrigger value="html" className="text-xs">Tabelle / HTML</TabsTrigger>
              <TabsTrigger value="plotly" className="text-xs">Grafici</TabsTrigger>
              <TabsTrigger value="ui" className="text-xs">Elementi UI</TabsTrigger>
            </TabsList>

            <TabsContent value="gallery" className="flex-1 min-h-0 mt-0">
              <StylePresetGallery
                builtInPresets={BUILTIN_PRESETS}
                customPresets={customPresets}
                activePresetId={activePreset.id}
                onSelectPreset={handleSelectPreset}
                onDeletePreset={handleDeleteFromGallery}
              />
            </TabsContent>

            <TabsContent value="html" className="flex-1 min-h-0 mt-0">
              <HtmlTableEditor overrides={htmlOverrides} onChange={handleHtmlChange} />
            </TabsContent>

            <TabsContent value="plotly" className="flex-1 min-h-0 mt-0">
              <PlotlyChartEditor overrides={plotlyOverrides} onChange={handlePlotlyChange} />
            </TabsContent>

            <TabsContent value="ui" className="flex-1 min-h-0 mt-0">
              <UiElementsEditor overrides={uiOverrides} onChange={handleUiChange} />
            </TabsContent>
          </Tabs>
        </div>

        {/* Right panel: Live Preview */}
        <div className="w-[45%] p-3 flex flex-col min-h-0">
          <h3 className="text-xs font-medium text-muted-foreground mb-2 shrink-0">Anteprima Live</h3>
          <div className="flex-1 min-h-0">
            <StyleLivePreview preset={currentPreviewPreset} />
          </div>
        </div>
      </div>
    </div>
  );
}
