'use server';

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import type { UnifiedStylePreset } from "@/lib/unified-style-types";
import type { HtmlStyleOverrides } from "@/lib/html-style-utils";
import type { PlotlyStyleOverrides } from "@/lib/plotly-utils";
import type { UiElementsOverrides } from "@/lib/unified-style-types";

// ── Auth helper ──

async function getCompanyId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const userId = (session.user as any).id;
  if (!userId) return null;

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });
  return user?.companyId || null;
}

// ── GET ──

export async function getUnifiedStylePresetsAction(): Promise<{
  presets?: UnifiedStylePreset[];
  error?: string;
}> {
  try {
    const companyId = await getCompanyId();
    if (!companyId) return { error: 'Non autorizzato' };

    const company = await db.company.findUnique({
      where: { id: companyId },
      select: { unifiedStylePresets: true },
    });

    const presets = (company?.unifiedStylePresets as UnifiedStylePreset[] | null) || [];
    return { presets };
  } catch (error: any) {
    console.error('Failed to get unified style presets:', error);
    return { error: `Impossibile caricare i preset: ${error?.message || String(error)}` };
  }
}

// ── SAVE ──

export async function saveUnifiedStylePresetAction(
  label: string,
  description: string,
  category: string,
  html: Partial<HtmlStyleOverrides>,
  plotly: Partial<PlotlyStyleOverrides>,
  ui: Partial<UiElementsOverrides>,
): Promise<{ success: boolean; preset?: UnifiedStylePreset; error?: string }> {
  try {
    const companyId = await getCompanyId();
    if (!companyId) return { success: false, error: 'Non autorizzato' };

    const company = await db.company.findUnique({
      where: { id: companyId },
      select: { unifiedStylePresets: true },
    });

    const existing = (company?.unifiedStylePresets as UnifiedStylePreset[] | null) || [];

    const newPreset: UnifiedStylePreset = {
      id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      label,
      description,
      category: category as UnifiedStylePreset['category'],
      html,
      plotly,
      ui,
      createdAt: new Date().toISOString(),
      isBuiltIn: false,
    };

    await db.company.update({
      where: { id: companyId },
      data: { unifiedStylePresets: [...existing, newPreset] as any },
    });

    return { success: true, preset: newPreset };
  } catch (error: any) {
    console.error('Failed to save unified style preset:', error);
    return { success: false, error: `Impossibile salvare: ${error?.message || String(error)}` };
  }
}

// ── UPDATE ──

export async function updateUnifiedStylePresetAction(
  presetId: string,
  updates: Partial<Omit<UnifiedStylePreset, 'id' | 'createdAt' | 'isBuiltIn'>>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const companyId = await getCompanyId();
    if (!companyId) return { success: false, error: 'Non autorizzato' };

    const company = await db.company.findUnique({
      where: { id: companyId },
      select: { unifiedStylePresets: true },
    });

    const existing = (company?.unifiedStylePresets as UnifiedStylePreset[] | null) || [];
    const updated = existing.map(p =>
      p.id === presetId ? { ...p, ...updates } : p
    );

    await db.company.update({
      where: { id: companyId },
      data: { unifiedStylePresets: updated as any },
    });

    return { success: true };
  } catch (error: any) {
    console.error('Failed to update unified style preset:', error);
    return { success: false, error: `Impossibile aggiornare: ${error?.message || String(error)}` };
  }
}

// ── DELETE ──

export async function deleteUnifiedStylePresetAction(
  presetId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const companyId = await getCompanyId();
    if (!companyId) return { success: false, error: 'Non autorizzato' };

    const company = await db.company.findUnique({
      where: { id: companyId },
      select: { unifiedStylePresets: true },
    });

    const existing = (company?.unifiedStylePresets as UnifiedStylePreset[] | null) || [];
    const filtered = existing.filter(p => p.id !== presetId);

    await db.company.update({
      where: { id: companyId },
      data: { unifiedStylePresets: filtered as any },
    });

    return { success: true };
  } catch (error: any) {
    console.error('Failed to delete unified style preset:', error);
    return { success: false, error: `Impossibile eliminare: ${error?.message || String(error)}` };
  }
}

// ── SET ACTIVE STYLE ──

export async function setActiveUnifiedStyleAction(
  presetId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const companyId = await getCompanyId();
    if (!companyId) return { success: false, error: 'Non autorizzato' };

    await db.company.update({
      where: { id: companyId },
      data: { activeUnifiedStyleId: presetId },
    });

    return { success: true };
  } catch (error: any) {
    console.error('Failed to set active style:', error);
    return { success: false, error: `Impossibile impostare: ${error?.message || String(error)}` };
  }
}

// ── GET ACTIVE STYLE ──

export async function getActiveUnifiedStyleAction(): Promise<{
  activeStyleId?: string | null;
  error?: string;
}> {
  try {
    const companyId = await getCompanyId();
    if (!companyId) return { error: 'Non autorizzato' };

    const company = await db.company.findUnique({
      where: { id: companyId },
      select: { activeUnifiedStyleId: true },
    });

    return { activeStyleId: company?.activeUnifiedStyleId || null };
  } catch (error: any) {
    console.error('Failed to get active style:', error);
    return { error: `Impossibile recuperare: ${error?.message || String(error)}` };
  }
}

// ── GET ACTIVE STYLE FULL (for rendering pipeline) ──

export async function getActiveUnifiedStyleFullAction(): Promise<{
  preset?: UnifiedStylePreset | null;
  error?: string;
}> {
  try {
    const companyId = await getCompanyId();
    if (!companyId) return { error: 'Non autorizzato' };

    const company = await db.company.findUnique({
      where: { id: companyId },
      select: { activeUnifiedStyleId: true, unifiedStylePresets: true },
    });

    const activeId = company?.activeUnifiedStyleId;
    if (!activeId) return { preset: null };

    // Check custom presets first
    const customPresets = (company?.unifiedStylePresets as UnifiedStylePreset[] | null) || [];
    const customMatch = customPresets.find(p => p.id === activeId);
    if (customMatch) return { preset: customMatch };

    // Check built-in presets
    const { BUILTIN_PRESETS } = await import('@/lib/unified-style-presets');
    const builtinMatch = BUILTIN_PRESETS.find(p => p.id === activeId);
    return { preset: builtinMatch || null };
  } catch (error: any) {
    console.error('Failed to get active style full:', error);
    return { error: `Impossibile recuperare: ${error?.message || String(error)}` };
  }
}
