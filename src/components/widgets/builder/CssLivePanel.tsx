'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Copy, Check } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';

interface CssLivePanelProps {
  htmlCss: string;
  uiCss: string;
  customCss: string;
  onCustomCssChange: (css: string) => void;
}

// ── Minimal CSS syntax highlighting ──

function highlightCss(css: string): string {
  if (!css) return '';
  return css
    // Comments
    .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="css-comment">$1</span>')
    // Selectors (lines that contain { )
    .replace(/^([^{}\n]+)(\{)/gm, '<span class="css-selector">$1</span>$2')
    // Properties
    .replace(/\s+([\w-]+)\s*:/g, ' <span class="css-property">$1</span>:')
    // Values (everything between : and ;)
    .replace(/:\s*([^;{}]+)(;)/g, ': <span class="css-value">$1</span>$2');
}

// ── Collapsible section ──

function CssSection({ title, css, badge, defaultOpen = true }: {
  title: string;
  css: string;
  badge?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  if (!css.trim()) return null;

  return (
    <div className="border-b border-border/50 last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 w-full px-3 py-1.5 text-left hover:bg-muted/50 transition-colors"
      >
        {open ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{title}</span>
        {badge && <span className="text-[9px] bg-muted px-1.5 py-0.5 rounded-full">{badge}</span>}
      </button>
      {open && (
        <div className="px-3 pb-2 max-h-[300px] overflow-auto">
          <pre className="css-highlight text-[10px] leading-[1.6] whitespace-pre-wrap break-all font-mono">
            <code dangerouslySetInnerHTML={{ __html: highlightCss(css) }} />
          </pre>
        </div>
      )}
    </div>
  );
}

export default function CssLivePanel({ htmlCss, uiCss, customCss, onCustomCssChange }: CssLivePanelProps) {
  const [copied, setCopied] = useState(false);
  const [customOpen, setCustomOpen] = useState(true);

  const allCss = useMemo(() => [htmlCss, uiCss, customCss].filter(Boolean).join('\n\n'), [htmlCss, uiCss, customCss]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(allCss);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* noop */ }
  }, [allCss]);

  const lineCount = useMemo(() => allCss.split('\n').length, [allCss]);

  return (
    <div className="flex flex-col h-full bg-zinc-50 dark:bg-zinc-950 border-x">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-muted-foreground">CSS Generato</span>
          <span className="text-[9px] text-muted-foreground/70">{lineCount} righe</span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded hover:bg-muted"
          title="Copia tutto il CSS"
        >
          {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copiato!' : 'Copia'}
        </button>
      </div>

      {/* CSS Sections */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <CssSection title="Stile HTML" css={htmlCss} badge={`${htmlCss.split('\n').length}L`} />
        <CssSection title="Stile UI" css={uiCss} badge={uiCss.trim() ? `${uiCss.split('\n').length}L` : undefined} defaultOpen={false} />

        {/* Custom CSS (editable) */}
        <div className="border-b border-border/50 last:border-b-0">
          <button
            onClick={() => setCustomOpen(!customOpen)}
            className="flex items-center gap-1.5 w-full px-3 py-1.5 text-left hover:bg-muted/50 transition-colors"
          >
            {customOpen ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">CSS Personalizzato</span>
            {customCss.trim() && <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />}
          </button>
          {customOpen && (
            <div className="px-3 pb-2">
              <Textarea
                value={customCss}
                onChange={e => onCustomCssChange(e.target.value)}
                placeholder="/* Aggiungi CSS personalizzato qui... */"
                className="font-mono text-[10px] leading-[1.6] min-h-[80px] max-h-[200px] resize-y bg-white dark:bg-zinc-900 border-border/50"
              />
            </div>
          )}
        </div>
      </div>

      {/* Syntax highlighting styles */}
      <style jsx global>{`
        .css-highlight .css-comment { color: #6b7280; font-style: italic; }
        .css-highlight .css-selector { color: #8b5cf6; font-weight: 500; }
        .css-highlight .css-property { color: #3b82f6; }
        .css-highlight .css-value { color: #059669; }
      `}</style>
    </div>
  );
}
