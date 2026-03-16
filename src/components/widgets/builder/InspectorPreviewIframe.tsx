'use client';

import React, { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react';
import { applyHtmlStyleOverrides } from '@/lib/html-style-utils';
import { generateUiElementsCss } from '@/lib/unified-style-css';
import type { HtmlStyleOverrides, HtmlInspectorZone } from '@/lib/html-style-utils';
import type { UiElementsOverrides } from '@/lib/unified-style-types';

export interface InspectorPreviewIframeProps {
  html: string;
  htmlOverrides: Partial<HtmlStyleOverrides>;
  uiOverrides: Partial<UiElementsOverrides>;
  onZoneSelect: (zone: Exclude<HtmlInspectorZone, null>, elementInfo: string) => void;
}

export interface InspectorPreviewIframeHandle {
  forceRefresh: () => void;
}

/**
 * Managed inspector iframe that rebuilds srcDoc on style changes
 * with debouncing to avoid flicker during rapid slider drags.
 */
const InspectorPreviewIframe = forwardRef<InspectorPreviewIframeHandle, InspectorPreviewIframeProps>(
  function InspectorPreviewIframe({ html, htmlOverrides, uiOverrides, onZoneSelect }, ref) {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [srcDoc, setSrcDoc] = useState('');
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Build full srcDoc from current html + overrides
    const buildSrcDoc = useCallback(() => {
      if (!html) return '';
      const uiCss = generateUiElementsCss(uiOverrides);
      return applyHtmlStyleOverrides(html, htmlOverrides as HtmlStyleOverrides, true, uiCss);
    }, [html, htmlOverrides, uiOverrides]);

    // Rebuild srcDoc when html or overrides change, debounced for slider performance
    useEffect(() => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setSrcDoc(buildSrcDoc());
      }, 60);
      return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }, [buildSrcDoc]);

    // Listen for inspector zone selection messages
    useEffect(() => {
      const handler = (e: MessageEvent) => {
        if (e.data?.type === 'html-inspector-select') {
          onZoneSelect(
            e.data.zone as Exclude<HtmlInspectorZone, null>,
            e.data.elementInfo || ''
          );
        }
      };
      window.addEventListener('message', handler);
      return () => window.removeEventListener('message', handler);
    }, [onZoneSelect]);

    // Expose forceRefresh for immediate srcDoc rebuild
    useImperativeHandle(ref, () => ({
      forceRefresh: () => setSrcDoc(buildSrcDoc()),
    }), [buildSrcDoc]);

    return (
      <iframe
        ref={iframeRef}
        srcDoc={srcDoc}
        className="w-full h-full border-none"
        title="HTML Style Preview"
        sandbox="allow-scripts allow-same-origin"
      />
    );
  }
);

InspectorPreviewIframe.displayName = 'InspectorPreviewIframe';

export default InspectorPreviewIframe;
