'use client';

import React, { useMemo } from 'react';
import type { UnifiedStylePreset } from '@/lib/unified-style-types';
import { generateUnifiedPreviewHtml } from '@/lib/unified-style-css';

interface StyleLivePreviewProps {
  preset: UnifiedStylePreset;
}

export default function StyleLivePreview({ preset }: StyleLivePreviewProps) {
  const srcdoc = useMemo(() => generateUnifiedPreviewHtml(preset), [preset]);

  return (
    <div className="w-full h-full bg-white rounded-lg border overflow-hidden">
      <iframe
        srcDoc={srcdoc}
        sandbox="allow-scripts"
        className="w-full h-full border-none"
        title="Anteprima stile"
      />
    </div>
  );
}
