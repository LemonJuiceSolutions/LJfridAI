'use client';

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Code2, X } from 'lucide-react';
import type { HtmlStyleOverrides, HtmlInspectorZone } from '@/lib/html-style-utils';
import { generateHtmlStyleCss, isUiZone } from '@/lib/html-style-utils';
import { generateUiElementsCss } from '@/lib/unified-style-css';
import type { UiElementsOverrides } from '@/lib/unified-style-types';
import { useActiveUnifiedStyle } from '@/hooks/use-active-style';
import { mergeStyleWithInheritance, clearPropertyOverride, setPropertyOverride } from '@/lib/style-inheritance';

import InspectorPreviewIframe from './InspectorPreviewIframe';
import CssLivePanel from './CssLivePanel';
import HtmlStyleEditor from './HtmlStyleEditor';

interface VisualCssInspectorProps {
  html: string;
  htmlOverrides: Partial<HtmlStyleOverrides>;
  uiOverrides: Partial<UiElementsOverrides>;
  onHtmlOverridesChange: (overrides: Partial<HtmlStyleOverrides>) => void;
  onUiOverridesChange: (overrides: Partial<UiElementsOverrides>) => void;
  openRouterConfig?: { apiKey: string; model: string };
}

export default function VisualCssInspector({
  html,
  htmlOverrides,
  uiOverrides,
  onHtmlOverridesChange,
  onUiOverridesChange,
  openRouterConfig,
}: VisualCssInspectorProps) {
  const { activeStyle } = useActiveUnifiedStyle();
  const iframeRef = useRef<{ forceRefresh: () => void }>(null);

  // Inspector state
  const [selectedZone, setSelectedZone] = useState<HtmlInspectorZone>(null);
  const [elementInfo, setElementInfo] = useState('');
  const [showCssPanel, setShowCssPanel] = useState(false);

  // Merge active company style with per-node overrides
  const { mergedHtml, mergedUi, overriddenHtmlKeys, overriddenUiKeys } = useMemo(
    () => mergeStyleWithInheritance(
      activeStyle?.html || {},
      htmlOverrides,
      activeStyle?.ui || {},
      uiOverrides,
    ),
    [activeStyle, htmlOverrides, uiOverrides]
  );

  // Generated CSS for the CSS panel
  const htmlCss = useMemo(() => generateHtmlStyleCss(mergedHtml as HtmlStyleOverrides), [mergedHtml]);
  const uiCss = useMemo(() => generateUiElementsCss(mergedUi), [mergedUi]);

  // Zone selection handler
  const handleZoneSelect = useCallback((zone: Exclude<HtmlInspectorZone, null>, info: string) => {
    setSelectedZone(zone);
    setElementInfo(info);
  }, []);

  const handleClearZone = useCallback(() => {
    setSelectedZone(null);
    setElementInfo('');
  }, []);

  // ── Inheritance toggles ──
  const handleToggleInheritHtml = useCallback((key: string) => {
    if (overriddenHtmlKeys.has(key)) {
      // Currently overridden → revert to inherited
      onHtmlOverridesChange(clearPropertyOverride(htmlOverrides, key));
    } else {
      // Currently inherited → create local override with merged value
      const currentVal = (mergedHtml as any)[key];
      onHtmlOverridesChange(setPropertyOverride(htmlOverrides, key, currentVal));
    }
  }, [htmlOverrides, mergedHtml, overriddenHtmlKeys, onHtmlOverridesChange]);

  const handleToggleInheritUi = useCallback((key: string) => {
    if (overriddenUiKeys.has(key)) {
      onUiOverridesChange(clearPropertyOverride(uiOverrides, key));
    } else {
      const currentVal = (mergedUi as any)[key];
      onUiOverridesChange(setPropertyOverride(uiOverrides, key, currentVal));
    }
  }, [uiOverrides, mergedUi, overriddenUiKeys, onUiOverridesChange]);

  // Custom CSS change
  const handleCustomCssChange = useCallback((css: string) => {
    onHtmlOverridesChange({ ...htmlOverrides, custom_css: css });
  }, [htmlOverrides, onHtmlOverridesChange]);

  return (
    <div className="flex-1 min-h-0 flex overflow-hidden gap-1">
      {/* Panel 1: Preview — relative container, iframe fills it absolutely */}
      <div className="flex-1 min-w-0 min-h-0 border rounded-lg bg-muted/20 relative overflow-auto">
        <div className="absolute inset-0 overflow-hidden rounded-lg">
          <InspectorPreviewIframe
            ref={iframeRef}
            html={html}
            htmlOverrides={mergedHtml as Partial<HtmlStyleOverrides>}
            uiOverrides={mergedUi}
            onZoneSelect={handleZoneSelect}
          />
        </div>
        {/* CSS panel toggle button */}
        <button
          onClick={() => setShowCssPanel(!showCssPanel)}
          className={`absolute top-2 right-2 p-1.5 rounded-md border shadow-sm transition-colors z-10 ${
            showCssPanel
              ? 'bg-violet-100 border-violet-300 text-violet-700 dark:bg-violet-900 dark:border-violet-700 dark:text-violet-300'
              : 'bg-white/90 border-border text-muted-foreground hover:text-foreground dark:bg-zinc-900/90'
          }`}
          title={showCssPanel ? 'Nascondi CSS' : 'Mostra CSS'}
        >
          <Code2 className="h-4 w-4" />
        </button>
      </div>

      {/* Panel 2: CSS Live Panel (collapsible) */}
      {showCssPanel && (
        <div className="w-[280px] shrink-0 overflow-hidden flex flex-col">
          <CssLivePanel
            htmlCss={htmlCss}
            uiCss={uiCss}
            customCss={(htmlOverrides as any)?.custom_css || ''}
            onCustomCssChange={handleCustomCssChange}
          />
        </div>
      )}

      {/* Panel 3: Style Property Editor */}
      <div className="w-[340px] shrink-0 min-h-0 overflow-y-auto border-l px-4 py-2">
        <HtmlStyleEditor
          overrides={mergedHtml as HtmlStyleOverrides}
          onChange={(o) => {
            // When editor changes merged overrides, extract only the changed keys as node overrides
            // For simplicity, pass through the full change — the inheritance system handles display
            onHtmlOverridesChange(o);
          }}
          selectedZone={selectedZone}
          elementInfo={elementInfo}
          onClearZone={handleClearZone}
          openRouterConfig={openRouterConfig}
          // Inheritance props
          activeStyleHtml={activeStyle?.html || {}}
          activeStyleUi={activeStyle?.ui || {}}
          overriddenHtmlKeys={overriddenHtmlKeys}
          overriddenUiKeys={overriddenUiKeys}
          onToggleInheritHtml={handleToggleInheritHtml}
          onToggleInheritUi={handleToggleInheritUi}
          // UI element props
          uiOverrides={uiOverrides}
          onUiChange={onUiOverridesChange}
        />
      </div>
    </div>
  );
}
