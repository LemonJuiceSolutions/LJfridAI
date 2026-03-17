import type { HtmlStyleOverrides } from '@/lib/html-style-utils';
import { HTML_STYLE_DEFAULTS } from '@/lib/html-style-utils';
import type { UiElementsOverrides } from '@/lib/unified-style-types';
import { UI_ELEMENTS_DEFAULTS } from '@/lib/unified-style-types';

/**
 * Merge the active company-level style with per-node overrides.
 * Returns the merged values plus sets of keys that are locally overridden.
 */
export function mergeStyleWithInheritance(
  activeHtml: Partial<HtmlStyleOverrides>,
  nodeHtml: Partial<HtmlStyleOverrides>,
  activeUi: Partial<UiElementsOverrides>,
  nodeUi: Partial<UiElementsOverrides>,
) {
  // Start from defaults, layer company style, then node overrides
  const mergedHtml: Record<string, unknown> = { ...HTML_STYLE_DEFAULTS, ...activeHtml, ...nodeHtml };
  const mergedUi: Record<string, unknown> = { ...UI_ELEMENTS_DEFAULTS, ...activeUi, ...nodeUi };

  // Track which keys the node explicitly overrides
  const overriddenHtmlKeys = new Set<string>(Object.keys(nodeHtml));
  const overriddenUiKeys = new Set<string>(Object.keys(nodeUi));

  return { mergedHtml, mergedUi, overriddenHtmlKeys, overriddenUiKeys };
}

/**
 * Remove a property override, reverting to the inherited (company-level) value.
 */
export function clearPropertyOverride<T extends Record<string, unknown>>(
  overrides: Partial<T>,
  key: string,
): Partial<T> {
  const next = { ...overrides };
  delete (next as Record<string, unknown>)[key];
  return next;
}

/**
 * Set a property override on the node level.
 */
export function setPropertyOverride<T extends Record<string, unknown>>(
  overrides: Partial<T>,
  key: string,
  value: unknown,
): Partial<T> {
  return { ...overrides, [key]: value };
}
