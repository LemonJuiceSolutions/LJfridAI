'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    Send, Bot, Loader2, Trash2, UserSearch, Download, Search,
    Users, Building2, Mail, Phone, Linkedin, Globe, FileSpreadsheet,
    ChevronRight, ChevronLeft, RefreshCw, ChevronsUpDown, Check,
    Plus, MessageSquare, Clock, MoreHorizontal, Star, X, Tag,
    PenLine, ExternalLink, ShieldCheck, Info, CheckCircle2,
    Target, AtSign, TrendingUp, BarChart3, ArrowLeft, FolderOpen, Copy, Pencil, Save, Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { fetchOpenRouterModelsAction } from '@/app/actions';
import { getOpenRouterAgentModelAction, saveOpenRouterAgentModelAction } from '@/actions/openrouter';
import { getAiProviderAction, saveAiProviderAction, type AiProvider } from '@/actions/ai-settings';
import { sendLeadEmailAction, generateLeadEmailAction, getLeadGenApiKeysAction, getLeadGenApiCreditsAction } from '@/actions/lead-generator';

const CLAUDE_CLI_MODELS = [
    { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
    { id: 'claude-opus-4-6', name: 'Claude Opus 4.6' },
    { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5' },
    { id: 'sonnet', name: 'Sonnet (latest)' },
    { id: 'opus', name: 'Opus (latest)' },
    { id: 'haiku', name: 'Haiku (latest)' },
];
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Message = {
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
};

type ConversationMeta = {
    id: string;
    title: string | null;
    totalCost: number;
    createdAt: string;
    updatedAt: string;
};

// Parse recharts config from markdown code blocks
function parseRechartsBlocks(content: string): { text: string; charts: any[] } {
    const charts: any[] = [];
    const text = content.replace(/```recharts\n([\s\S]*?)```/g, (_, json) => {
        try {
            const config = JSON.parse(json.trim());
            charts.push(config);
            return `[CHART_${charts.length - 1}]`;
        } catch {
            return json;
        }
    });
    return { text, charts };
}

// Inline markdown formatting (bold, italic, code, links)
function inlineFormat(text: string): string {
    return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code class="bg-muted px-1 py-0.5 rounded text-[11px]">$1</code>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-500 underline hover:text-blue-600">$1</a>');
}

// Render a block of text with full markdown support (headers, lists, paragraphs)
function MarkdownTextBlock({ text }: { text: string }) {
    const lines = text.split('\n');
    const elements: React.ReactNode[] = [];
    let idx = 0;
    let key = 0;

    while (idx < lines.length) {
        const line = lines[idx];
        const trimmed = line.trim();

        // Empty line
        if (!trimmed) { idx++; continue; }

        // Header
        const headerMatch = trimmed.match(/^(#{1,4})\s+(.+)/);
        if (headerMatch) {
            const level = headerMatch[1].length;
            const cls = level === 1 ? 'text-base font-bold mt-3 mb-1'
                : level === 2 ? 'text-sm font-bold mt-2 mb-1'
                : 'text-sm font-semibold mt-1.5 mb-0.5';
            elements.push(<div key={key++} className={cls} dangerouslySetInnerHTML={{ __html: inlineFormat(headerMatch[2]) }} />);
            idx++; continue;
        }

        // Horizontal rule
        if (/^[-*_]{3,}$/.test(trimmed)) {
            elements.push(<hr key={key++} className="my-2 border-muted" />);
            idx++; continue;
        }

        // Bullet list (- or *)
        if (/^[-*]\s/.test(trimmed)) {
            const items: string[] = [];
            while (idx < lines.length && /^[-*]\s/.test(lines[idx].trim())) {
                items.push(lines[idx].trim().replace(/^[-*]\s+/, ''));
                idx++;
            }
            elements.push(
                <ul key={key++} className="list-disc list-outside ml-4 space-y-0.5">
                    {items.map((item, j) => (
                        <li key={j} dangerouslySetInnerHTML={{ __html: inlineFormat(item) }} />
                    ))}
                </ul>
            );
            continue;
        }

        // Numbered list
        if (/^\d+[.)]\s/.test(trimmed)) {
            const items: string[] = [];
            while (idx < lines.length && /^\d+[.)]\s/.test(lines[idx].trim())) {
                items.push(lines[idx].trim().replace(/^\d+[.)]\s+/, ''));
                idx++;
            }
            elements.push(
                <ol key={key++} className="list-decimal list-outside ml-4 space-y-0.5">
                    {items.map((item, j) => (
                        <li key={j} dangerouslySetInnerHTML={{ __html: inlineFormat(item) }} />
                    ))}
                </ol>
            );
            continue;
        }

        // Regular paragraph: collect consecutive non-special lines
        const paraLines: string[] = [];
        while (idx < lines.length) {
            const l = lines[idx].trim();
            if (!l || /^#{1,4}\s/.test(l) || /^[-*]\s/.test(l) || /^\d+[.)]\s/.test(l) || /^[-*_]{3,}$/.test(l)) break;
            paraLines.push(l);
            idx++;
        }
        if (paraLines.length > 0) {
            elements.push(
                <p key={key++} className="whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: inlineFormat(paraLines.join('\n')) }} />
            );
        }
    }

    return <div className="space-y-1.5">{elements}</div>;
}

// Markdown renderer for tables, code blocks, and rich text
function RichContent({ content }: { content: string }) {
    const { text } = parseRechartsBlocks(content);
    // Split by code blocks (any language) and tables
    const parts = text.split(/(```[\w]*\n[\s\S]*?```|\|.*\|(?:\n\|.*\|)*)/g);

    return (
        <div className="space-y-2">
            {parts.map((part, i) => {
                // Code block (any language)
                const codeMatch = part.match(/```(\w*)\n([\s\S]*?)```/);
                if (codeMatch) {
                    const lang = codeMatch[1] || 'code';
                    return (
                        <div key={i} className="relative my-2">
                            <div className="flex items-center gap-1 px-3 py-1 bg-muted rounded-t-lg border border-b-0">
                                <span className="text-[10px] uppercase font-medium text-muted-foreground">{lang}</span>
                            </div>
                            <pre className="bg-zinc-950 text-zinc-100 px-3 py-2 rounded-b-lg text-[11px] overflow-x-auto border">
                                <code>{codeMatch[2].trim()}</code>
                            </pre>
                        </div>
                    );
                }

                // Markdown table
                if (part.includes('|') && part.split('\n').length >= 2) {
                    const lines = part.trim().split('\n').filter(l => l.includes('|'));
                    if (lines.length >= 2) {
                        const headers = lines[0].split('|').filter(c => c.trim() && !c.match(/^[\s-]+$/));
                        const isSeparator = (line: string) => /^\|[\s-:|]+\|$/.test(line.trim());
                        const dataLines = lines.filter(l => !isSeparator(l)).slice(1);

                        if (headers.length > 0 && dataLines.length > 0) {
                            return (
                                <div key={i} className="my-2 rounded-lg border w-full overflow-x-auto">
                                    <table className="w-full text-[11px] table-auto">
                                        <thead>
                                            <tr className="bg-muted/50">
                                                {headers.map((h, j) => (
                                                    <th key={j} className="px-2 py-1.5 text-left font-semibold border-b whitespace-nowrap">
                                                        {h.trim()}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {dataLines.map((row, j) => {
                                                const cells = row.split('|').filter(c => c.trim());
                                                return (
                                                    <tr key={j} className="border-b last:border-0 hover:bg-muted/30">
                                                        {cells.map((cell, k) => (
                                                            <td key={k} className="px-2 py-1 break-words">{cell.trim()}</td>
                                                        ))}
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            );
                        }
                    }
                }

                // Rich text block (headers, lists, paragraphs, inline formatting)
                if (!part.trim()) return null;
                return <MarkdownTextBlock key={i} text={part} />;
            })}
        </div>
    );
}

// Star rating component
function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
    return (
        <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map(i => (
                <button
                    key={i}
                    type="button"
                    onClick={() => onChange(value === i ? 0 : i)}
                    className="p-0.5 hover:scale-110 transition-transform"
                >
                    <Star
                        className={cn(
                            'h-4 w-4',
                            i <= value ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'
                        )}
                    />
                </button>
            ))}
        </div>
    );
}

// Lead detail dialog
function LeadDetailDialog({
    lead,
    open,
    onOpenChange,
    onUpdate,
    onDelete,
    onSendEmail,
}: {
    lead: any;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onUpdate: (id: string, data: any) => Promise<void>;
    onDelete: (id: string) => Promise<void>;
    onSendEmail: (to: string, subject: string, htmlBody: string) => Promise<{ success: boolean; error?: string }>;
}) {
    const [notes, setNotes] = useState(lead?.notes || '');
    const [rating, setRating] = useState(lead?.rating || 0);
    const [tags, setTags] = useState<string[]>(lead?.tags || []);
    const [tagInput, setTagInput] = useState('');
    const [saving, setSaving] = useState(false);
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Email compose state
    const [showEmailForm, setShowEmailForm] = useState(false);
    const [emailSubject, setEmailSubject] = useState('');
    const [emailBody, setEmailBody] = useState('');
    const [isSendingEmail, setIsSendingEmail] = useState(false);
    const [isGeneratingEmail, setIsGeneratingEmail] = useState(false);

    // Source/confidence popover
    const [showSourceInfo, setShowSourceInfo] = useState(false);

    // Reset state when lead changes
    useEffect(() => {
        if (lead) {
            setNotes(lead.notes || '');
            setRating(lead.rating || 0);
            setTags(lead.tags || []);
            setShowEmailForm(false);
            setEmailSubject('');
            setEmailBody('');
            setShowSourceInfo(false);
        }
    }, [lead?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const saveField = useCallback(async (field: string, value: any) => {
        if (!lead) return;
        setSaving(true);
        await onUpdate(lead.id, { [field]: value });
        setSaving(false);
    }, [lead, onUpdate]);

    const handleNotesChange = (val: string) => {
        setNotes(val);
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => saveField('notes', val), 800);
    };

    const handleRatingChange = (val: number) => {
        setRating(val);
        saveField('rating', val || null);
    };

    const handleAddTag = () => {
        const tag = tagInput.trim().toLowerCase();
        if (!tag || tags.includes(tag)) { setTagInput(''); return; }
        const newTags = [...tags, tag];
        setTags(newTags);
        setTagInput('');
        saveField('tags', newTags);
    };

    const handleRemoveTag = (tag: string) => {
        const newTags = tags.filter(t => t !== tag);
        setTags(newTags);
        saveField('tags', newTags);
    };

    const handlePrepareMail = async () => {
        if (!lead) return;
        setShowEmailForm(true);
        setIsGeneratingEmail(true);
        setEmailSubject('');
        setEmailBody('Sto generando l\'email con AI...');

        try {
            const result = await generateLeadEmailAction(lead.id);
            if (result.error) {
                setEmailBody(`Errore: ${result.error}`);
            } else {
                setEmailSubject(result.subject || '');
                setEmailBody(result.body || '');
            }
        } catch (e: any) {
            setEmailBody(`Errore: ${e.message}`);
        }
        setIsGeneratingEmail(false);
    };

    if (!lead) return null;

    const contacts: any[] = lead.contacts || [];
    const contactCount = contacts.length;
    const primaryName = lead.fullName || `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || null;
    const currentYear = new Date().getFullYear();
    const hasFinancials = lead.revenueYear1 || lead.revenueYear2 || lead.revenueYear3 || lead.profitYear1 || lead.profitYear2 || lead.profitYear3;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center justify-between pr-6">
                        <div className="flex items-center gap-2">
                            <Building2 className="h-4.5 w-4.5 text-muted-foreground shrink-0" />
                            <span>{lead.companyName || primaryName || 'N/A'}</span>
                        </div>
                        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                    </DialogTitle>
                    <div className="flex items-center gap-2 flex-wrap">
                        {lead.companyIndustry && (
                            <Badge variant="secondary" className="text-[10px]">{lead.companyIndustry}</Badge>
                        )}
                        {contactCount > 0 && (
                            <Badge variant="outline" className="text-[10px] gap-1">
                                <Users className="h-2.5 w-2.5" />
                                {contactCount} contatt{contactCount === 1 ? 'o' : 'i'}
                            </Badge>
                        )}
                    </div>
                </DialogHeader>

                <div className="space-y-4 mt-2">
                    {/* Company details */}
                    <div className="grid grid-cols-1 gap-2 text-sm">
                        {lead.companyWebsite && (
                            <a href={lead.companyWebsite.startsWith('http') ? lead.companyWebsite : `https://${lead.companyWebsite}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-purple-500 hover:underline">
                                <Globe className="h-3.5 w-3.5 shrink-0" />
                                {lead.companyWebsite}
                            </a>
                        )}
                        {lead.companyDomain && !lead.companyWebsite && (
                            <a href={`https://${lead.companyDomain}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-purple-500 hover:underline">
                                <Globe className="h-3.5 w-3.5 shrink-0" />
                                {lead.companyDomain}
                            </a>
                        )}
                    </div>

                    {/* Extra info row + source/confidence */}
                    <div className="flex flex-wrap gap-2 items-center">
                        {lead.companyCity && <Badge variant="outline" className="text-[10px]">{lead.companyCity}</Badge>}
                        {lead.companyCountry && <Badge variant="outline" className="text-[10px]">{lead.companyCountry}</Badge>}
                        {lead.companySize && <Badge variant="outline" className="text-[10px]">{lead.companySize} dip.</Badge>}
                        {lead.source && (
                            <Badge
                                variant="secondary"
                                className="text-[10px] cursor-pointer hover:bg-secondary/80 gap-1"
                                onClick={() => setShowSourceInfo(!showSourceInfo)}
                            >
                                <ShieldCheck className={cn('h-2.5 w-2.5', lead.confidence && lead.confidence >= 0.7 ? 'text-green-500' : lead.confidence && lead.confidence >= 0.4 ? 'text-amber-500' : 'text-muted-foreground')} />
                                {lead.source}
                            </Badge>
                        )}
                    </div>

                    {/* Source & Confidence detail */}
                    {showSourceInfo && (
                        <div className="rounded-md border bg-muted/20 p-3 text-xs space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="font-medium flex items-center gap-1.5">
                                    <Info className="h-3 w-3 text-muted-foreground" />
                                    Affidabilita&apos; e Fonte
                                </span>
                                <button onClick={() => setShowSourceInfo(false)} className="text-muted-foreground hover:text-foreground">
                                    <X className="h-3 w-3" />
                                </button>
                            </div>
                            <div className="grid grid-cols-2 gap-y-1.5 gap-x-4">
                                <span className="text-muted-foreground">Fonte dati:</span>
                                <span className="font-medium capitalize">{lead.source || 'N/A'}</span>

                                <span className="text-muted-foreground">Affidabilita&apos;:</span>
                                <span className="font-medium flex items-center gap-1">
                                    {lead.confidence != null ? (
                                        <>
                                            <div className="flex gap-0.5">
                                                {[1, 2, 3, 4, 5].map(i => (
                                                    <div key={i} className={cn('h-1.5 w-3 rounded-sm', i <= Math.round((lead.confidence || 0) * 5) ? 'bg-green-500' : 'bg-muted-foreground/20')} />
                                                ))}
                                            </div>
                                            <span className="text-[10px] text-muted-foreground">({Math.round((lead.confidence || 0) * 100)}%)</span>
                                        </>
                                    ) : (
                                        <span className="text-muted-foreground">Non disponibile</span>
                                    )}
                                </span>

                                <span className="text-muted-foreground">Aggiornato:</span>
                                <span className="font-medium">{new Date(lead.updatedAt || lead.createdAt).toLocaleDateString('it-IT')}</span>
                            </div>
                            {lead.source === 'apollo' && (
                                <p className="text-[10px] text-muted-foreground pt-1 border-t border-muted">
                                    Dati da Apollo.io - database B2B con oltre 200M di contatti. Email verificate tramite provider.
                                </p>
                            )}
                            {lead.source === 'hunter' && (
                                <p className="text-[10px] text-muted-foreground pt-1 border-t border-muted">
                                    Dati da Hunter.io - email estratte e verificate da fonti web pubbliche.
                                </p>
                            )}
                            {lead.source === 'google_maps' && (
                                <p className="text-[10px] text-muted-foreground pt-1 border-t border-muted">
                                    Dati da Google Maps - informazioni aziendali pubbliche, verificate da Google.
                                </p>
                            )}
                        </div>
                    )}

                    {/* ===== CONTACTS SECTION ===== */}
                    {contactCount > 0 && (
                        <>
                            <hr className="border-muted" />
                            <div>
                                <label className="text-xs font-medium text-muted-foreground mb-2 block flex items-center gap-1.5">
                                    <Users className="h-3 w-3" />
                                    Contatti ({contactCount})
                                </label>
                                <div className="space-y-2">
                                    {contacts.map((c: any, idx: number) => {
                                        const cName = c.fullName || `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Contatto';
                                        const isVerified = c.emailStatus === 'valid';
                                        return (
                                            <div key={idx} className="rounded-md border bg-muted/10 p-2.5 text-xs space-y-1">
                                                <div className="flex items-center justify-between">
                                                    <span className="font-medium text-[11px]">{cName}</span>
                                                    {isVerified && (
                                                        <Badge variant="outline" className="text-[8px] h-4 px-1 border-green-500/50 text-green-600 gap-0.5">
                                                            <CheckCircle2 className="h-2 w-2" />
                                                            Verificato
                                                        </Badge>
                                                    )}
                                                </div>
                                                {c.jobTitle && (
                                                    <p className="text-[10px] text-muted-foreground">{c.jobTitle}</p>
                                                )}
                                                <div className="flex flex-wrap gap-x-3 gap-y-1 pt-0.5">
                                                    {c.email && (
                                                        <a href={`mailto:${c.email}`} className="flex items-center gap-1 text-blue-500 hover:underline text-[10px]">
                                                            <Mail className="h-2.5 w-2.5 shrink-0" />
                                                            {c.email}
                                                        </a>
                                                    )}
                                                    {c.phone && (
                                                        <a href={`tel:${c.phone}`} className="flex items-center gap-1 text-green-600 hover:underline text-[10px]">
                                                            <Phone className="h-2.5 w-2.5 shrink-0" />
                                                            {c.phone}
                                                        </a>
                                                    )}
                                                    {c.linkedinUrl && (
                                                        <a href={c.linkedinUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-600 hover:underline text-[10px]">
                                                            <Linkedin className="h-2.5 w-2.5 shrink-0" />
                                                            LinkedIn
                                                        </a>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </>
                    )}

                    {/* Fallback: show primary contact if no contacts array */}
                    {contactCount === 0 && (primaryName || lead.email) && (
                        <>
                            <hr className="border-muted" />
                            <div>
                                <label className="text-xs font-medium text-muted-foreground mb-2 block">Contatto principale</label>
                                <div className="grid grid-cols-1 gap-2 text-sm">
                                    {primaryName && <span className="font-medium text-xs">{primaryName}{lead.jobTitle ? ` - ${lead.jobTitle}` : ''}</span>}
                                    {lead.email && (
                                        <a href={`mailto:${lead.email}`} className="flex items-center gap-2 text-blue-500 hover:underline text-xs">
                                            <Mail className="h-3.5 w-3.5 shrink-0" />
                                            {lead.email}
                                        </a>
                                    )}
                                    {lead.phone && (
                                        <a href={`tel:${lead.phone}`} className="flex items-center gap-2 text-green-600 hover:underline text-xs">
                                            <Phone className="h-3.5 w-3.5 shrink-0" />
                                            {lead.phone}
                                        </a>
                                    )}
                                    {lead.linkedinUrl && (
                                        <a href={lead.linkedinUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-blue-600 hover:underline text-xs">
                                            <Linkedin className="h-3.5 w-3.5 shrink-0" />
                                            LinkedIn
                                        </a>
                                    )}
                                </div>
                            </div>
                        </>
                    )}

                    {/* Revenue & Profit */}
                    {hasFinancials && (
                        <>
                            <hr className="border-muted" />
                            <div>
                                <label className="text-xs font-medium text-muted-foreground mb-2 block">Dati Finanziari</label>
                                <div className="rounded-md border text-[11px]">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="bg-muted/50">
                                                <th className="px-2 py-1.5 text-left font-semibold border-b"></th>
                                                <th className="px-2 py-1.5 text-right font-semibold border-b">{currentYear - 3}</th>
                                                <th className="px-2 py-1.5 text-right font-semibold border-b">{currentYear - 2}</th>
                                                <th className="px-2 py-1.5 text-right font-semibold border-b">{currentYear - 1}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(lead.revenueYear1 || lead.revenueYear2 || lead.revenueYear3) && (
                                                <tr className="border-b last:border-0">
                                                    <td className="px-2 py-1.5 font-medium">Fatturato</td>
                                                    <td className="px-2 py-1.5 text-right">{lead.revenueYear1 || '-'}</td>
                                                    <td className="px-2 py-1.5 text-right">{lead.revenueYear2 || '-'}</td>
                                                    <td className="px-2 py-1.5 text-right">{lead.revenueYear3 || '-'}</td>
                                                </tr>
                                            )}
                                            {(lead.profitYear1 || lead.profitYear2 || lead.profitYear3) && (
                                                <tr className="border-b last:border-0">
                                                    <td className="px-2 py-1.5 font-medium">Utile</td>
                                                    <td className="px-2 py-1.5 text-right">{lead.profitYear1 || '-'}</td>
                                                    <td className="px-2 py-1.5 text-right">{lead.profitYear2 || '-'}</td>
                                                    <td className="px-2 py-1.5 text-right">{lead.profitYear3 || '-'}</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    )}

                    <hr className="border-muted" />

                    {/* Rating */}
                    <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Valutazione</label>
                        <StarRating value={rating} onChange={handleRatingChange} />
                    </div>

                    {/* Tags */}
                    <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Tags</label>
                        <div className="flex flex-wrap gap-1 mb-2">
                            {tags.map(tag => (
                                <Badge key={tag} variant="default" className="text-[10px] gap-1 pr-1">
                                    {tag}
                                    <button onClick={() => handleRemoveTag(tag)} className="hover:text-destructive">
                                        <X className="h-2.5 w-2.5" />
                                    </button>
                                </Badge>
                            ))}
                        </div>
                        <div className="flex gap-1">
                            <Input
                                value={tagInput}
                                onChange={e => setTagInput(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddTag(); } }}
                                placeholder="Aggiungi tag..."
                                className="h-7 text-xs flex-1"
                            />
                            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={handleAddTag} disabled={!tagInput.trim()}>
                                <Tag className="h-3 w-3" />
                            </Button>
                        </div>
                    </div>

                    {/* Notes */}
                    <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Note</label>
                        <textarea
                            value={notes}
                            onChange={e => handleNotesChange(e.target.value)}
                            placeholder="Aggiungi note su questo lead..."
                            rows={3}
                            className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                    </div>

                    <hr className="border-muted" />

                    {/* Email compose */}
                    {!showEmailForm ? (
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                className="text-xs flex-1"
                                onClick={handlePrepareMail}
                                disabled={!lead.email || isGeneratingEmail}
                            >
                                {isGeneratingEmail ? (
                                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                ) : (
                                    <PenLine className="h-3 w-3 mr-1" />
                                )}
                                Prepara mail (AI)
                            </Button>
                            {lead.email && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-xs"
                                    asChild
                                >
                                    <a href={`mailto:${lead.email}`}>
                                        <ExternalLink className="h-3 w-3 mr-1" />
                                        Apri client email
                                    </a>
                                </Button>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-2 p-3 rounded-md border bg-muted/20">
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-medium flex items-center gap-1.5">
                                    {isGeneratingEmail && <Loader2 className="h-3 w-3 animate-spin" />}
                                    {isGeneratingEmail ? 'AI sta scrivendo...' : 'Componi email'}
                                </label>
                                <button onClick={() => setShowEmailForm(false)} className="text-muted-foreground hover:text-foreground">
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                                A: <span className="text-foreground">{lead.email}</span>
                            </div>
                            <Input
                                value={emailSubject}
                                onChange={e => setEmailSubject(e.target.value)}
                                placeholder="Oggetto..."
                                className="h-7 text-xs"
                                disabled={isGeneratingEmail}
                            />
                            <textarea
                                value={emailBody}
                                onChange={e => setEmailBody(e.target.value)}
                                placeholder="Corpo dell'email..."
                                rows={6}
                                className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                disabled={isGeneratingEmail}
                            />
                            <div className="flex gap-2 justify-end">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-xs mr-auto"
                                    onClick={handlePrepareMail}
                                    disabled={isGeneratingEmail}
                                >
                                    <RefreshCw className={cn("h-3 w-3 mr-1", isGeneratingEmail && "animate-spin")} />
                                    Rigenera
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-xs"
                                    asChild
                                >
                                    <a href={`mailto:${lead.email}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`}>
                                        <ExternalLink className="h-3 w-3 mr-1" />
                                        Apri in client
                                    </a>
                                </Button>
                                <Button
                                    size="sm"
                                    className="text-xs"
                                    disabled={!emailSubject.trim() || !emailBody.trim() || isSendingEmail || isGeneratingEmail}
                                    onClick={async () => {
                                        setIsSendingEmail(true);
                                        const htmlBody = emailBody.replace(/\n/g, '<br>');
                                        const result = await onSendEmail(lead.email, emailSubject, htmlBody);
                                        setIsSendingEmail(false);
                                        if (result.success) {
                                            setShowEmailForm(false);
                                        }
                                    }}
                                >
                                    {isSendingEmail ? (
                                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                    ) : (
                                        <Send className="h-3 w-3 mr-1" />
                                    )}
                                    Invia mail
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Delete button */}
                    <div className="flex justify-end pt-2">
                        <Button
                            variant="destructive"
                            size="sm"
                            className="text-xs"
                            onClick={async () => {
                                await onDelete(lead.id);
                                onOpenChange(false);
                            }}
                        >
                            <Trash2 className="h-3 w-3 mr-1" />
                            Elimina lead
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default function LeadGeneratorPage() {
    const { toast } = useToast();

    // AI Provider & Model selector state
    const [aiProvider, setAiProvider] = useState<AiProvider>('openrouter');
    const [model, setModel] = useState('google/gemini-2.0-flash-001');
    const [claudeModel, setClaudeModel] = useState('claude-sonnet-4-6');
    const [availableModels, setAvailableModels] = useState<any[]>([]);
    const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
    const [isSavingModel, setIsSavingModel] = useState(false);

    // Chat state
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [conversationId, setConversationId] = useState<string | null>(null);
    const scrollAreaRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Progress streaming state
    const [progressMessage, setProgressMessage] = useState<string>('');
    const [progressPercent, setProgressPercent] = useState<number>(0);
    const [progressPhase, setProgressPhase] = useState<string>('');
    const [progressStats, setProgressStats] = useState<{ companies?: number; leads?: number; leadsWithEmail?: number }>({});
    const [browserLogs, setBrowserLogs] = useState<string[]>([]);
    const [browserUrl, setBrowserUrl] = useState<string>('');
    const [browserScreenshot, setBrowserScreenshot] = useState<string>('');
    const browserLogRef = useRef<HTMLDivElement>(null);

    // Conversation history state
    const [conversations, setConversations] = useState<ConversationMeta[]>([]);
    const [showHistory, setShowHistory] = useState(true);
    const [currentCost, setCurrentCost] = useState<number>(0);

    // Provider API keys status (which are configured)
    const [configuredProviders, setConfiguredProviders] = useState<Record<string, boolean>>({});
    const [apiCredits, setApiCredits] = useState<any>(null);

    // View mode: 'dashboard' shows all searches as cards, 'detail' opens a specific search
    const [viewMode, setViewMode] = useState<'dashboard' | 'detail'>('dashboard');

    // Leads panel state
    const [showLeadsPanel, setShowLeadsPanel] = useState(true);
    const [leads, setLeads] = useState<any[]>([]);
    const [searches, setSearches] = useState<any[]>([]);
    const [activeSearchId, setActiveSearchId] = useState<string | null>(null);
    const [leadsLoading, setLeadsLoading] = useState(false);
    const [leadsSearch, setLeadsSearch] = useState('');
    const [selectedLead, setSelectedLead] = useState<any>(null);
    const [isLeadDialogOpen, setIsLeadDialogOpen] = useState(false);
    const [deleteSearchTarget, setDeleteSearchTarget] = useState<any>(null);
    const [leadsTab, setLeadsTab] = useState('leads');
    const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
    const [isDeletingLeads, setIsDeletingLeads] = useState(false);
    const activeSearchIdRef = useRef<string | null>(null);
    const loadLeadsAbortRef = useRef<AbortController | null>(null);

    // Title editing state
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [editTitleValue, setEditTitleValue] = useState('');
    const titleInputRef = useRef<HTMLInputElement>(null);

    const scrollToBottom = useCallback(() => {
        if (scrollAreaRef.current) {
            scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
        }
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [messages, scrollToBottom]);

    // Auto-scroll browser log to bottom
    useEffect(() => {
        if (browserLogRef.current) {
            browserLogRef.current.scrollTop = browserLogRef.current.scrollHeight;
        }
    }, [browserLogs]);

    // Load AI provider and models on mount
    useEffect(() => {
        getAiProviderAction().then(res => {
            if (res.provider) setAiProvider(res.provider);
            if (res.claudeCliModel) setClaudeModel(res.claudeCliModel);
        });
        fetchOpenRouterModelsAction().then(result => {
            if (result.data) setAvailableModels(result.data);
        });
        getOpenRouterAgentModelAction().then(result => {
            if (result.model) setModel(result.model);
        });
        // Load which provider API keys are configured
        getLeadGenApiKeysAction().then(res => {
            if (res.keys) {
                setConfiguredProviders({
                    apollo: !!res.keys.apollo,
                    hunter: !!res.keys.hunter,
                    serpApi: !!res.keys.serpApi,
                    apify: !!res.keys.apify,
                    vibeProspect: !!res.keys.vibeProspect,
                    firecrawl: !!res.keys.firecrawl,
                });
            }
        });
        // Load API credits balance
        getLeadGenApiCreditsAction().then(res => {
            if (res.credits) setApiCredits(res.credits);
        });
    }, []);

    const handleModelChange = async (newModel: string) => {
        setModelSelectorOpen(false);
        setIsSavingModel(true);
        try {
            if (aiProvider === 'claude-cli') {
                setClaudeModel(newModel);
                await saveAiProviderAction('claude-cli', newModel);
            } else {
                setModel(newModel);
                await saveOpenRouterAgentModelAction(newModel);
            }
        } catch { /* ignore */ }
        setIsSavingModel(false);
    };

    const activeModel = aiProvider === 'claude-cli' ? claudeModel : model;
    const activeModelName = aiProvider === 'claude-cli'
        ? CLAUDE_CLI_MODELS.find(m => m.id === claudeModel)?.name || claudeModel
        : availableModels.find(m => m.id === model)?.name || model.split('/').pop();

    // Load data on mount
    useEffect(() => {
        loadConversationList();
        loadConversation();
        loadLeads(null); // Load all leads initially; loadSearches will auto-select and reload
        loadSearches();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const loadConversationList = async () => {
        try {
            const res = await fetch('/api/lead-generator?action=list');
            const data = await res.json();
            if (data.success && data.conversations) {
                setConversations(data.conversations);
            }
        } catch (e) {
            console.error('Failed to load conversation list:', e);
        }
    };

    const loadConversation = async (id?: string) => {
        try {
            const url = id ? `/api/lead-generator?id=${id}` : '/api/lead-generator';
            const res = await fetch(url);
            const data = await res.json();
            if (data.success && data.conversation) {
                setConversationId(data.conversation.id);
                setCurrentCost(data.conversation.totalCost || 0);
                const msgs = (data.conversation.messages as any[]) || [];
                const chatMessages: Message[] = msgs
                    .filter((m: any) => m.role === 'user' || m.role === 'model')
                    .map((m: any) => ({
                        role: m.role === 'model' ? 'assistant' : 'user',
                        content: m.content?.map((c: any) => c.text).filter(Boolean).join('\n') || '',
                        timestamp: Date.now(),
                    }));
                setMessages(chatMessages);
            } else {
                setConversationId(null);
                setMessages([]);
                setCurrentCost(0);
            }
        } catch (e) {
            console.error('Failed to load conversation:', e);
        }
    };

    const handleSwitchConversation = async (id: string) => {
        if (id === conversationId && viewMode === 'detail') return;
        await loadConversation(id);
        // Find searches linked to this conversation and auto-select the first one
        const convSearches = searches.filter((s: any) => s.conversationId === id);
        if (convSearches.length > 0) {
            const firstSearchId = convSearches[0].id;
            activeSearchIdRef.current = firstSearchId;
            setActiveSearchId(firstSearchId);
            setLeadsTab('leads');
            loadLeads(firstSearchId);
        } else {
            activeSearchIdRef.current = null;
            setActiveSearchId(null);
            loadLeads(null);
        }
        setViewMode('detail');
        setActiveTab('chat');
    };

    const handleNewConversation = () => {
        setConversationId(null);
        setMessages([]);
        setCurrentCost(0);
        activeSearchIdRef.current = null;
        setActiveSearchId(null);
        setLeads([]);
        setViewMode('detail');
        setActiveTab('chat');
    };

    const handleBackToDashboard = () => {
        setViewMode('dashboard');
        loadSearches();
    };

    // Rename conversation title
    const handleStartEditTitle = () => {
        // Use the currently displayed title as starting value
        const conv = conversations.find(c => c.id === conversationId);
        const searchName = searches.find(s => s.id === activeSearchIdRef.current)?.name;
        setEditTitleValue(conv?.title || searchName || '');
        setIsEditingTitle(true);
        setTimeout(() => titleInputRef.current?.select(), 50);
    };

    const handleSaveTitle = async () => {
        if (!conversationId || !editTitleValue.trim()) {
            setIsEditingTitle(false);
            return;
        }
        try {
            await fetch('/api/lead-generator', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: conversationId, title: editTitleValue.trim() }),
            });
            setConversations(prev => prev.map(c => c.id === conversationId ? { ...c, title: editTitleValue.trim() } : c));
            toast({ description: 'Titolo aggiornato' });
        } catch {
            toast({ variant: 'destructive', description: 'Errore nel salvataggio del titolo' });
        }
        setIsEditingTitle(false);
    };

    // Copy entire chat history to clipboard
    const handleCopyChat = () => {
        const chatText = messages.map(msg => {
            const role = msg.role === 'user' ? 'Tu' : 'AI';
            return `[${role}]\n${msg.content}`;
        }).join('\n\n---\n\n');
        navigator.clipboard.writeText(chatText).then(() => {
            toast({ description: 'Chat copiata negli appunti' });
        }).catch(() => {
            toast({ variant: 'destructive', description: 'Errore nella copia' });
        });
    };

    const handleDeleteConversation = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await fetch(`/api/lead-generator?id=${id}`, { method: 'DELETE' });
            setConversations(prev => prev.filter(c => c.id !== id));
            if (conversationId === id) {
                setConversationId(null);
                setMessages([]);
                setCurrentCost(0);
            }
        } catch (err) {
            console.error('Failed to delete conversation:', err);
        }
    };

    const loadLeads = async (searchId?: string | null) => {
        // Cancel any in-flight request to prevent stale responses
        if (loadLeadsAbortRef.current) {
            loadLeadsAbortRef.current.abort();
        }
        const controller = new AbortController();
        loadLeadsAbortRef.current = controller;

        setLeadsLoading(true);
        try {
            const effectiveSearchId = searchId !== undefined ? searchId : activeSearchIdRef.current;
            const params = new URLSearchParams();
            if (effectiveSearchId) params.set('searchId', effectiveSearchId);
            if (leadsSearch) params.set('search', leadsSearch);
            const res = await fetch(`/api/lead-generator/leads?${params}`, {
                cache: 'no-store',
                signal: controller.signal,
            });
            const data = await res.json();
            if (!controller.signal.aborted) {
                if (data.leads) setLeads(data.leads);
                else if (data.success) setLeads([]);
            }
        } catch (e: any) {
            if (e.name !== 'AbortError') {
                console.error('Failed to load leads:', e);
            }
        }
        if (!controller.signal.aborted) {
            setLeadsLoading(false);
        }
    };

    const loadSearches = async () => {
        try {
            const { getLeadSearchesAction } = await import('@/actions/lead-generator');
            const result = await getLeadSearchesAction();
            if (result.searches) {
                setSearches(result.searches);
                // Auto-select first search if none is selected
                if (!activeSearchIdRef.current && result.searches.length > 0) {
                    const firstId = result.searches[0].id;
                    activeSearchIdRef.current = firstId;
                    setActiveSearchId(firstId);
                    loadLeads(firstId);
                }
            }
        } catch (e) {
            console.error('Failed to load searches:', e);
        }
    };

    // Reload leads when search text changes
    useEffect(() => {
        loadLeads(activeSearchIdRef.current);
    }, [leadsSearch]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleUpdateLead = async (id: string, data: any) => {
        try {
            const res = await fetch('/api/lead-generator/leads', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, ...data }),
            });
            const result = await res.json();
            if (result.lead) {
                setLeads(prev => prev.map(l => l.id === id ? result.lead : l));
                setSelectedLead((prev: any) => prev?.id === id ? result.lead : prev);
            }
        } catch (e) {
            console.error('Failed to update lead:', e);
        }
    };

    const handleDeleteLead = async (id: string) => {
        try {
            await fetch('/api/lead-generator/leads', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ leadIds: [id] }),
            });
            setLeads(prev => prev.filter(l => l.id !== id));
        } catch (e) {
            console.error('Failed to delete lead:', e);
        }
    };

    const handleDeleteSearch = async (searchId: string) => {
        try {
            const { deleteLeadSearchAction } = await import('@/actions/lead-generator');
            const result = await deleteLeadSearchAction(searchId);
            if (result.success) {
                setSearches(prev => prev.filter(s => s.id !== searchId));
                if (activeSearchIdRef.current === searchId) {
                    activeSearchIdRef.current = null;
                    setActiveSearchId(null);
                    loadLeads(null);
                } else {
                    loadLeads(activeSearchIdRef.current);
                }
                toast({ title: 'Ricerca eliminata', description: 'La ricerca e i lead associati sono stati eliminati.' });
            } else {
                toast({ variant: 'destructive', title: 'Errore', description: result.error || 'Impossibile eliminare la ricerca' });
            }
        } catch (e: any) {
            console.error('Failed to delete search:', e);
            toast({ variant: 'destructive', title: 'Errore', description: e.message });
        }
        setDeleteSearchTarget(null);
    };

    const toggleLeadSelection = (id: string) => {
        setSelectedLeadIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const selectAllLeads = () => {
        if (selectedLeadIds.size === leads.length) {
            setSelectedLeadIds(new Set());
        } else {
            setSelectedLeadIds(new Set(leads.map(l => l.id)));
        }
    };

    const handleDeleteSelectedLeads = async () => {
        if (selectedLeadIds.size === 0) return;
        setIsDeletingLeads(true);
        try {
            await fetch('/api/lead-generator/leads', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ leadIds: [...selectedLeadIds] }),
            });
            setLeads(prev => prev.filter(l => !selectedLeadIds.has(l.id)));
            toast({ title: `${selectedLeadIds.size} lead eliminati` });
            setSelectedLeadIds(new Set());
        } catch (e) {
            console.error('Failed to delete leads:', e);
            toast({ variant: 'destructive', title: 'Errore', description: 'Impossibile eliminare i lead' });
        }
        setIsDeletingLeads(false);
    };

    const handleDeleteAllLeads = async () => {
        if (leads.length === 0) return;
        setIsDeletingLeads(true);
        try {
            // Delete ALL leads in DB (not just the visible page), optionally filtered by active search
            const res = await fetch('/api/lead-generator/leads', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deleteAll: true, searchId: activeSearchId || undefined }),
            });
            const data = await res.json();
            setLeads([]);
            toast({ title: `${data.deletedCount || 'Tutti i'} lead eliminati` });
            setSelectedLeadIds(new Set());
        } catch (e) {
            console.error('Failed to delete all leads:', e);
            toast({ variant: 'destructive', title: 'Errore', description: 'Impossibile eliminare i lead' });
        }
        setIsDeletingLeads(false);
    };

    const handleSendEmail = async (to: string, subject: string, htmlBody: string) => {
        try {
            const result = await sendLeadEmailAction({ to, subject, htmlBody });
            if (result.success) {
                toast({ title: 'Email inviata', description: `Email inviata con successo a ${to}` });
            } else {
                toast({ variant: 'destructive', title: 'Errore invio email', description: result.error || 'Errore sconosciuto' });
            }
            return result;
        } catch (e: any) {
            const err = { success: false as const, error: e.message };
            toast({ variant: 'destructive', title: 'Errore', description: e.message });
            return err;
        }
    };

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        const userMessage: Message = {
            role: 'user',
            content: input.trim(),
            timestamp: Date.now(),
        };

        setMessages(prev => [...prev, userMessage]);
        setInput('');
        if (textareaRef.current) textareaRef.current.style.height = '40px';
        setIsLoading(true);
        setProgressMessage('Avvio ricerca...');
        setProgressPercent(0);
        setProgressPhase('');
        setProgressStats({});
        setBrowserLogs([]);
        setBrowserUrl('');
        setBrowserScreenshot('');

        try {
            const res = await fetch('/api/lead-generator', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userMessage: userMessage.content,
                    conversationId,
                    model: activeModel,
                    aiProvider,
                    stream: true,
                    skillsContext: skillsContext || undefined,
                }),
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || `HTTP ${res.status}`);
            }

            // Check if response is SSE stream
            const contentType = res.headers.get('content-type') || '';
            if (contentType.includes('text/event-stream') && res.body) {
                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                let finalData: any = null;

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || ''; // Keep incomplete line in buffer

                    let currentEvent = '';
                    for (const line of lines) {
                        if (line.startsWith('event: ')) {
                            currentEvent = line.slice(7).trim();
                        } else if (line.startsWith('data: ')) {
                            const dataStr = line.slice(6);
                            try {
                                const data = JSON.parse(dataStr);
                                if (currentEvent === 'progress') {
                                    setProgressMessage(data.message || '');
                                    if (data.progress != null) setProgressPercent(data.progress);
                                    if (data.phase) setProgressPhase(data.phase);
                                    setProgressStats({
                                        companies: data.companiesFound,
                                        leads: data.leadsFound,
                                        leadsWithEmail: data.leadsWithEmail,
                                    });
                                    // Capture browser activity logs + screenshots
                                    if (data.message && data.message.startsWith('🌐')) {
                                        setBrowserLogs(prev => {
                                            const next = [...prev, data.message];
                                            return next.length > 100 ? next.slice(-100) : next;
                                        });
                                    }
                                    if (data.browserUrl) setBrowserUrl(data.browserUrl);
                                    if (data.browserScreenshot) setBrowserScreenshot(data.browserScreenshot);
                                    // Clear screenshot when no browser activity
                                    if (data.message && !data.message.startsWith('🌐') && !data.browserScreenshot) {
                                        setBrowserScreenshot('');
                                        setBrowserUrl('');
                                    }
                                } else if (currentEvent === 'conversationId') {
                                    if (data.conversationId) setConversationId(data.conversationId);
                                } else if (currentEvent === 'result') {
                                    finalData = data;
                                } else if (currentEvent === 'error') {
                                    throw new Error(data.error || 'Errore sconosciuto');
                                }
                            } catch (e: any) {
                                if (currentEvent === 'error') throw e;
                            }
                            currentEvent = '';
                        }
                    }
                }

                if (!finalData) throw new Error('Nessuna risposta dal server');

                if (finalData.conversationId) setConversationId(finalData.conversationId);
                if (finalData.totalCost != null) setCurrentCost(finalData.totalCost);

                const assistantMessage: Message = {
                    role: 'assistant',
                    content: finalData.message || 'Nessuna risposta.',
                    timestamp: Date.now(),
                };
                setMessages(prev => [...prev, assistantMessage]);

                // Refresh searches
                const currentConvId = finalData.conversationId || conversationId;
                const refreshAndSelectSearch = async () => {
                    const { getLeadSearchesAction } = await import('@/actions/lead-generator');
                    const searchResult = await getLeadSearchesAction();
                    if (searchResult.searches) {
                        setSearches(searchResult.searches);
                        const convSearch = searchResult.searches.find((s: any) => s.conversationId === currentConvId);
                        if (convSearch) {
                            activeSearchIdRef.current = convSearch.id;
                            setActiveSearchId(convSearch.id);
                            loadLeads(convSearch.id);
                        } else {
                            loadLeads(activeSearchIdRef.current);
                        }
                    }
                };
                await Promise.all([refreshAndSelectSearch(), loadConversationList()]);
                setTimeout(() => refreshAndSelectSearch(), 2000);
            } else {
                // Fallback: non-streaming JSON response
                const data = await res.json();
                if (data.error) throw new Error(data.error);

                if (data.conversationId) setConversationId(data.conversationId);
                if (data.totalCost != null) setCurrentCost(data.totalCost);

                const assistantMessage: Message = {
                    role: 'assistant',
                    content: data.message || 'Nessuna risposta.',
                    timestamp: Date.now(),
                };
                setMessages(prev => [...prev, assistantMessage]);

                const currentConvId = data.conversationId || conversationId;
                const refreshAndSelectSearch = async () => {
                    const { getLeadSearchesAction } = await import('@/actions/lead-generator');
                    const searchResult = await getLeadSearchesAction();
                    if (searchResult.searches) {
                        setSearches(searchResult.searches);
                        const convSearch = searchResult.searches.find((s: any) => s.conversationId === currentConvId);
                        if (convSearch) {
                            activeSearchIdRef.current = convSearch.id;
                            setActiveSearchId(convSearch.id);
                            loadLeads(convSearch.id);
                        } else {
                            loadLeads(activeSearchIdRef.current);
                        }
                    }
                };
                await Promise.all([refreshAndSelectSearch(), loadConversationList()]);
                setTimeout(() => refreshAndSelectSearch(), 2000);
            }
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Errore',
                description: error.message || 'Errore di comunicazione con il server.',
            });
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: `Errore: ${error.message}`,
                timestamp: Date.now(),
            }]);
        } finally {
            setIsLoading(false);
            setProgressMessage('');
            setProgressPercent(0);
            setProgressPhase('');
            setProgressStats({});
        }
    };

    const handleClearChat = async () => {
        if (conversationId) {
            try {
                await fetch(`/api/lead-generator?id=${conversationId}`, { method: 'DELETE' });
                setConversations(prev => prev.filter(c => c.id !== conversationId));
            } catch (e) {
                console.error('Failed to delete conversation:', e);
            }
        }
        setMessages([]);
        setConversationId(null);
        setCurrentCost(0);
    };

    const formatCost = (cost: number) => {
        if (cost === 0) return '$0.00';
        if (cost < 0.01) return `$${cost.toFixed(4)}`;
        return `$${cost.toFixed(2)}`;
    };

    const handleExport = async (format: 'csv' | 'excel') => {
        try {
            const params = new URLSearchParams({ format });
            if (activeSearchId) params.set('searchId', activeSearchId);
            const res = await fetch(`/api/lead-generator/export?${params}`);

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Errore export');
            }

            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `leads-${new Date().toISOString().split('T')[0]}.${format === 'excel' ? 'xlsx' : 'csv'}`;
            a.click();
            URL.revokeObjectURL(url);

            toast({ title: 'Export completato', description: `Lead esportati in ${format.toUpperCase()}.` });
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Errore Export', description: error.message });
        }
    };

    const initialMessage: Message = {
        role: 'assistant',
        content: "Ciao! Sono **LeadAI**, il tuo assistente per la ricerca di contatti commerciali.\n\nDimmi che tipo di contatti stai cercando! Ad esempio:\n- \"Cerco marketing manager nel settore moda a Milano\"\n- \"Trovami aziende software a Roma con 50-200 dipendenti\"\n- \"Ho bisogno di contatti nel settore food & beverage in Lombardia\"",
        timestamp: Date.now(),
    };

    const displayMessages = messages.length > 0 ? messages : [initialMessage];

    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - d.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays === 0) return 'Oggi';
        if (diffDays === 1) return 'Ieri';
        if (diffDays < 7) return `${diffDays}g fa`;
        return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
    };

    // Active search tab: chat | leads | export | skills
    const [activeTab, setActiveTab] = useState<'chat' | 'leads' | 'export' | 'skills'>('chat');

    // Skills / Company profile for the AI agent
    const [skillsData, setSkillsData] = useState({
        companyName: '',
        tagline: '',
        sector: '',
        location: '',
        founded: '',
        teamSize: '',
        website: '',
        description: '',
        products: '',
        targetCustomers: '',
        uniqueValue: '',
        tone: '',
    });
    const [isSkillsSaving, setIsSkillsSaving] = useState(false);

    // Load skills from localStorage on mount
    useEffect(() => {
        try {
            const saved = localStorage.getItem('leadgen-skills');
            if (saved) setSkillsData(JSON.parse(saved));
        } catch {}
    }, []);

    const handleSaveSkills = () => {
        setIsSkillsSaving(true);
        try {
            localStorage.setItem('leadgen-skills', JSON.stringify(skillsData));
            toast({ title: 'Skills salvate', description: 'Il profilo aziendale è stato aggiornato.' });
        } catch {
            toast({ variant: 'destructive', title: 'Errore', description: 'Non riesco a salvare.' });
        }
        setIsSkillsSaving(false);
    };

    // Build skills context string for the AI agent
    const skillsContext = useMemo(() => {
        const s = skillsData;
        const parts: string[] = [];
        if (s.companyName) parts.push(`Azienda: ${s.companyName}`);
        if (s.tagline) parts.push(`Tagline: ${s.tagline}`);
        if (s.sector) parts.push(`Settore: ${s.sector}`);
        if (s.location) parts.push(`Sede: ${s.location}`);
        if (s.founded) parts.push(`Fondata: ${s.founded}`);
        if (s.teamSize) parts.push(`Team: ${s.teamSize}`);
        if (s.website) parts.push(`Sito: ${s.website}`);
        if (s.description) parts.push(`Descrizione: ${s.description}`);
        if (s.products) parts.push(`Prodotti/Servizi: ${s.products}`);
        if (s.targetCustomers) parts.push(`Clienti target: ${s.targetCustomers}`);
        if (s.uniqueValue) parts.push(`Proposta di valore unica: ${s.uniqueValue}`);
        if (s.tone) parts.push(`Tono comunicazione: ${s.tone}`);
        return parts.length > 0 ? parts.join('\n') : '';
    }, [skillsData]);

    // Compute KPIs from current leads
    const kpiData = useMemo(() => {
        if (leads.length === 0) return null;
        const totalLeads = leads.length;
        const genericRe = /^(info|admin|support|hello|contact|sales|marketing|office|noreply|segreteria|amministrazione|contatti|ordini|orders|customer|service|webstore)@/i;
        const uniqueCompanies = new Set(leads.filter(l => l.companyName).map(l => l.companyName.toLowerCase())).size;
        const withPersonalEmail = leads.filter(l => l.email && !genericRe.test(l.email)).length;
        const withGenericEmail = leads.filter(l => l.email && genericRe.test(l.email)).length;
        const withAnyEmail = leads.filter(l => l.email).length;
        const withPhone = leads.filter(l => l.phone).length;
        const withLinkedin = leads.filter(l => l.linkedinUrl).length;
        const withContact = leads.filter(l => l.fullName || (l.firstName && l.lastName)).length;
        const avgConfidence = totalLeads > 0 ? Math.round(leads.reduce((s, l) => s + ((l.confidence || 0) * 100), 0) / totalLeads) : 0;
        const emailRate = totalLeads > 0 ? Math.round((withAnyEmail / totalLeads) * 100) : 0;
        return { totalLeads, uniqueCompanies, withPersonalEmail, withGenericEmail, withAnyEmail, withPhone, withLinkedin, withContact, avgConfidence, emailRate };
    }, [leads]);

    // Compute per-conversation lead counts from searches
    const convLeadCounts = useMemo(() => {
        const map: Record<string, number> = {};
        for (const s of searches) {
            if (s.conversationId) {
                map[s.conversationId] = (map[s.conversationId] || 0) + (s._count?.leads || 0);
            }
        }
        return map;
    }, [searches]);

    // ============================================================
    // RENDER: Dashboard mode (grid of search cards) OR Detail mode
    // ============================================================

    // ===== DASHBOARD VIEW =====
    if (viewMode === 'dashboard') {
        return (
            <div className="flex flex-col h-[calc(100vh-2rem)] p-4 md:p-6">
                {/* Dashboard Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                            <UserSearch className="h-5 w-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold">Lead Generator</h1>
                            <div className="flex items-center gap-1.5 mt-0.5">
                                <button
                                    onClick={() => {
                                        const next = aiProvider === 'claude-cli' ? 'openrouter' : 'claude-cli';
                                        setAiProvider(next);
                                        saveAiProviderAction(next, claudeModel).catch(() => {});
                                    }}
                                    className={cn(
                                        "text-[10px] font-medium px-1.5 py-0.5 rounded transition-colors",
                                        aiProvider === 'claude-cli'
                                            ? "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
                                            : "bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200"
                                    )}
                                >
                                    {aiProvider === 'claude-cli' ? 'Claude CLI' : 'OpenRouter'}
                                </button>
                                <Popover open={modelSelectorOpen} onOpenChange={setModelSelectorOpen}>
                                    <PopoverTrigger asChild>
                                        <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                                            <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                                            <span className="truncate max-w-[200px]">{isSavingModel ? '...' : activeModelName}</span>
                                            <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50" />
                                        </button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[300px] p-0" align="start">
                                        <Command>
                                            <CommandInput placeholder="Cerca modello..." />
                                            <CommandList>
                                                <CommandEmpty>Nessun modello trovato.</CommandEmpty>
                                                <CommandGroup heading={aiProvider === 'claude-cli' ? 'Modelli Claude' : 'Modelli OpenRouter'}>
                                                    {(aiProvider === 'claude-cli' ? CLAUDE_CLI_MODELS : availableModels).map(m => (
                                                        <CommandItem key={m.id} value={m.id} onSelect={() => handleModelChange(m.id)} className="text-xs">
                                                            <Check className={cn("mr-2 h-3 w-3", activeModel === m.id ? "opacity-100" : "opacity-0")} />
                                                            <span className="truncate">{m.name}</span>
                                                        </CommandItem>
                                                    ))}
                                                </CommandGroup>
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {/* Provider badges */}
                        <div className="flex gap-1 flex-wrap">
                            {[
                                { key: 'apollo', label: 'Apollo', creditKey: 'apollo' },
                                { key: 'hunter', label: 'Hunter', creditKey: 'hunter' },
                                { key: 'serpApi', label: 'SerpApi', creditKey: 'serpApi' },
                                { key: 'vibeProspect', label: 'Vibe', creditKey: 'vibe' },
                                { key: 'firecrawl', label: 'Firecrawl', creditKey: 'firecrawl' },
                                { key: 'apify', label: 'Apify', creditKey: 'apify' },
                            ].map(p => {
                                const configured = configuredProviders[p.key];
                                if (!configured) return null;
                                const cred = apiCredits?.[p.creditKey] as { used: number; available: number; remaining: number } | undefined;
                                const hasCredits = cred && cred.available > 0;
                                const usagePct = hasCredits ? Math.min(100, Math.round((cred.used / cred.available) * 100)) : 0;
                                return (
                                    <div key={p.key} className={cn('inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px]', usagePct >= 85 ? 'border-red-300 dark:border-red-700' : 'border-green-300 dark:border-green-700')} title={hasCredits ? `${cred.remaining} rimanenti` : `${p.label}: attivo`}>
                                        <div className={cn('h-1.5 w-1.5 rounded-full', usagePct >= 85 ? 'bg-red-500' : usagePct >= 50 ? 'bg-amber-500' : 'bg-green-500')} />
                                        <span>{p.label}</span>
                                        {hasCredits && <span className="font-mono text-muted-foreground">{cred.remaining}</span>}
                                    </div>
                                );
                            })}
                        </div>
                        <Button onClick={handleNewConversation} size="sm" className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:from-emerald-600 hover:to-teal-700">
                            <Plus className="h-4 w-4 mr-1" />
                            Nuova ricerca
                        </Button>
                    </div>
                </div>

                {/* Search cards grid */}
                <ScrollArea className="flex-1">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {/* New search card */}
                        <Card
                            className="border-dashed border-2 hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all cursor-pointer group flex flex-col items-center justify-center min-h-[180px]"
                            onClick={handleNewConversation}
                        >
                            <div className="h-12 w-12 rounded-full bg-emerald-500/10 flex items-center justify-center group-hover:bg-emerald-500/20 transition-colors mb-3">
                                <Plus className="h-6 w-6 text-emerald-600" />
                            </div>
                            <span className="text-sm font-medium text-muted-foreground group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
                                Nuova ricerca
                            </span>
                            <span className="text-[10px] text-muted-foreground/60 mt-1">
                                Cerca contatti con l&apos;AI
                            </span>
                        </Card>

                        {/* Existing search cards */}
                        {conversations.map((conv) => {
                            const leadCount = convLeadCounts[conv.id] || 0;
                            const matchingSearch = searches.find(s => s.conversationId === conv.id);
                            return (
                                <Card
                                    key={conv.id}
                                    className="hover:shadow-md hover:border-emerald-500/30 transition-all cursor-pointer group relative"
                                    onClick={() => handleSwitchConversation(conv.id)}
                                >
                                    <CardHeader className="pb-2">
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1 min-w-0 pr-2">
                                                <CardTitle className="text-base font-bold truncate leading-tight">
                                                    {conv.title || 'Ricerca senza titolo'}
                                                </CardTitle>
                                                <CardDescription className="text-[10px] mt-1">
                                                    {formatDate(conv.updatedAt)}
                                                    {conv.totalCost > 0 && <span className="ml-1.5 font-mono">{formatCost(conv.totalCost)}</span>}
                                                </CardDescription>
                                            </div>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <button onClick={(e) => e.stopPropagation()} className="h-6 w-6 shrink-0 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-muted transition-opacity">
                                                        <MoreHorizontal className="h-3.5 w-3.5" />
                                                    </button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-40">
                                                    <DropdownMenuItem onClick={(e) => handleDeleteConversation(conv.id, e as any)} className="text-destructive text-xs">
                                                        <Trash2 className="h-3 w-3 mr-2" />Elimina
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="pt-0">
                                        {/* Mini KPI row */}
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="flex items-center gap-1 text-violet-600 dark:text-violet-400">
                                                <Users className="h-3 w-3" />
                                                <span className="text-sm font-bold tabular-nums">{leadCount}</span>
                                                <span className="text-[10px] text-muted-foreground">lead</span>
                                            </div>
                                            {matchingSearch?.name && matchingSearch.name !== conv.title && (
                                                <Badge variant="outline" className="text-[8px] h-4 px-1.5 truncate max-w-[120px]">
                                                    {matchingSearch.name}
                                                </Badge>
                                            )}
                                        </div>
                                        {/* Open button hint */}
                                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground/60 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                                            <FolderOpen className="h-3 w-3" />
                                            <span>Clicca per aprire</span>
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                    {conversations.length === 0 && (
                        <div className="text-center py-20 text-muted-foreground">
                            <Search className="h-12 w-12 mx-auto mb-4 opacity-20" />
                            <p className="text-lg font-medium mb-1">Nessuna ricerca ancora</p>
                            <p className="text-sm">Crea la tua prima ricerca per trovare contatti con l&apos;AI</p>
                        </div>
                    )}
                </ScrollArea>

                {/* Delete search confirmation */}
                <AlertDialog open={!!deleteSearchTarget} onOpenChange={(open) => { if (!open) setDeleteSearchTarget(null); }}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Eliminare questa ricerca?</AlertDialogTitle>
                            <AlertDialogDescription>
                                Eliminando la ricerca <strong>&quot;{deleteSearchTarget?.name}&quot;</strong> verranno eliminati anche tutti i <strong>{deleteSearchTarget?._count?.leads || 0} lead</strong> associati.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Annulla</AlertDialogCancel>
                            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteSearchTarget && handleDeleteSearch(deleteSearchTarget.id)}>
                                Elimina
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        );
    }

    // ===== DETAIL VIEW =====
    // Title priority: conversation title (user-editable) > search name (auto-generated)
    const convTitle = conversations.find(c => c.id === conversationId)?.title;
    const activeSearchName = searches.find(s => s.id === activeSearchId)?.name;
    const displayTitle = convTitle || activeSearchName || 'Nuova ricerca';

    return (
        <div className="flex flex-col h-[calc(100vh-2rem)] overflow-hidden">
            {/* Top bar */}
            <div className="border-b shrink-0">
                {/* Row 1: Nav + actions */}
                <div className="flex items-center justify-between px-6 pt-4 pb-1">
                    <Button variant="ghost" size="sm" className="h-8 gap-1.5 -ml-2 text-muted-foreground hover:text-foreground" onClick={handleBackToDashboard}>
                        <ArrowLeft className="h-4 w-4" />
                        <span className="text-xs">Tutte le ricerche</span>
                    </Button>
                    <div className="flex items-center gap-2">
                        {messages.length > 0 && (
                            <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={handleCopyChat}>
                                <Copy className="h-3.5 w-3.5" />
                                <span className="text-xs">Copia chat</span>
                            </Button>
                        )}
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => { const next = aiProvider === 'claude-cli' ? 'openrouter' : 'claude-cli'; setAiProvider(next); saveAiProviderAction(next, claudeModel).catch(() => {}); }}
                                className={cn("text-[9px] font-medium px-1.5 py-0.5 rounded", aiProvider === 'claude-cli' ? "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" : "bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200")}
                            >
                                {aiProvider === 'claude-cli' ? 'Claude' : 'OR'}
                            </button>
                            <Popover open={modelSelectorOpen} onOpenChange={setModelSelectorOpen}>
                                <PopoverTrigger asChild>
                                    <button className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground">
                                        <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse shrink-0" />
                                        <span className="truncate max-w-[120px]">{isSavingModel ? '...' : activeModelName}</span>
                                        <ChevronsUpDown className="h-2.5 w-2.5 opacity-50" />
                                    </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[280px] p-0" align="end">
                                    <Command>
                                        <CommandInput placeholder="Cerca modello..." />
                                        <CommandList>
                                            <CommandEmpty>Nessun modello.</CommandEmpty>
                                            <CommandGroup>
                                                {(aiProvider === 'claude-cli' ? CLAUDE_CLI_MODELS : availableModels).map(m => (
                                                    <CommandItem key={m.id} value={m.id} onSelect={() => handleModelChange(m.id)} className="text-xs">
                                                        <Check className={cn("mr-2 h-3 w-3", activeModel === m.id ? "opacity-100" : "opacity-0")} />
                                                        <span className="truncate">{m.name}</span>
                                                    </CommandItem>
                                                ))}
                                            </CommandGroup>
                                        </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>
                        </div>
                        {currentCost > 0 && <Badge variant="secondary" className="text-[10px] font-mono">{formatCost(currentCost)}</Badge>}
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { loadLeads(activeSearchIdRef.current); loadSearches(); }} title="Aggiorna"><RefreshCw className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleClearChat} title="Elimina"><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                </div>

                {/* Row 2: BIG title */}
                <div className="px-6 pb-3">
                    {isEditingTitle ? (
                        <div className="flex items-end gap-3">
                            <input
                                ref={titleInputRef}
                                value={editTitleValue}
                                onChange={(e) => setEditTitleValue(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveTitle(); if (e.key === 'Escape') setIsEditingTitle(false); }}
                                className="text-3xl font-extrabold tracking-tight bg-transparent border-b-2 border-emerald-500 outline-none flex-1 min-w-0 pb-1"
                                autoFocus
                            />
                            <Button className="shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white h-10 px-5" onClick={handleSaveTitle}>
                                <Check className="h-4 w-4 mr-1.5" />
                                Salva
                            </Button>
                            <Button variant="outline" className="shrink-0 h-10" onClick={() => setIsEditingTitle(false)}>
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-3">
                            <h1 className="text-3xl font-extrabold tracking-tight truncate">
                                {displayTitle}
                            </h1>
                            <Button variant="outline" size="sm" className="shrink-0 h-8 gap-1.5" onClick={handleStartEditTitle}>
                                <Pencil className="h-3.5 w-3.5" />
                                <span className="text-xs">Modifica</span>
                            </Button>
                        </div>
                    )}
                </div>

                {/* Row 3: Provider API badges */}
                {Object.values(configuredProviders).some(Boolean) && (
                    <div className="px-4 pb-2">
                        <div className="flex gap-1.5">
                            {(() => {
                                const items = [
                                    { key: 'apollo', label: 'Apollo', creditKey: 'apollo' },
                                    { key: 'hunter', label: 'Hunter', creditKey: 'hunter' },
                                    { key: 'serpApi', label: 'SerpApi', creditKey: 'serpApi' },
                                    { key: 'vibeProspect', label: 'Vibe', creditKey: 'vibe' },
                                    { key: 'firecrawl', label: 'Firecrawl', creditKey: 'firecrawl' },
                                    { key: 'apify', label: 'Apify', creditKey: 'apify' },
                                ].filter(p => configuredProviders[p.key]);
                                return items.map(p => {
                                    const cred = apiCredits?.[p.creditKey] as { used: number; available: number; remaining: number } | undefined;
                                    const hasCredits = cred && cred.available > 0;
                                    const usagePct = hasCredits ? Math.min(100, Math.round((cred.used / cred.available) * 100)) : 0;
                                    return (
                                        <div key={p.key} className={cn('flex-1 flex items-center justify-center gap-1.5 rounded-lg border py-1.5 text-xs', usagePct >= 85 ? 'border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-950' : 'border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-950')} title={hasCredits ? `${cred.remaining} rimanenti su ${cred.available}` : `${p.label}: attivo`}>
                                            <div className={cn('h-2 w-2 rounded-full shrink-0', usagePct >= 85 ? 'bg-red-500' : usagePct >= 50 ? 'bg-amber-500' : 'bg-green-500')} />
                                            <span className="font-medium">{p.label}</span>
                                            {hasCredits && <span className="font-mono text-muted-foreground">{cred.remaining}</span>}
                                        </div>
                                    );
                                });
                            })()}
                        </div>
                    </div>
                )}

                {/* Row 4: KPI cards — full width like the chat below */}
                {(isLoading && (progressStats.companies || progressStats.leads)) && (
                    <div className="px-4 pb-3">
                        <div className="flex gap-2 overflow-x-auto">
                            {[
                                progressStats.companies ? { icon: Building2, label: 'Aziende trovate', value: progressStats.companies, color: 'text-blue-600 dark:text-blue-400', iconBg: 'bg-blue-500/10' } : null,
                                progressStats.leads ? { icon: Users, label: 'Lead identificati', value: progressStats.leads, color: 'text-violet-600 dark:text-violet-400', iconBg: 'bg-violet-500/10' } : null,
                                progressStats.leadsWithEmail ? { icon: Mail, label: 'Con email', value: progressStats.leadsWithEmail, color: 'text-green-600 dark:text-green-400', iconBg: 'bg-green-500/10' } : null,
                            ].filter(Boolean).map((kpi: any) => (
                                <div key={kpi.label} className="flex-1 min-w-0 flex items-center gap-3 rounded-xl border bg-card p-3">
                                    <div className={cn('h-10 w-10 rounded-lg flex items-center justify-center shrink-0', kpi.iconBg)}>
                                        <kpi.icon className={cn('h-5 w-5', kpi.color)} />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className={cn('text-2xl font-bold tabular-nums leading-none', kpi.color)}>{kpi.value}</span>
                                            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground/40" />
                                        </div>
                                        <span className="text-xs text-muted-foreground">{kpi.label}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                {!isLoading && kpiData && (
                    <div className="px-4 pb-3">
                        <div className="flex gap-2 overflow-x-auto">
                            {[
                                { icon: Users, label: 'Lead', value: kpiData.totalLeads, color: 'text-violet-600 dark:text-violet-400', iconBg: 'bg-violet-500/10' },
                                { icon: Building2, label: 'Aziende', value: kpiData.uniqueCompanies, color: 'text-blue-600 dark:text-blue-400', iconBg: 'bg-blue-500/10' },
                                { icon: Target, label: 'Con nome', value: kpiData.withContact, color: 'text-emerald-600 dark:text-emerald-400', iconBg: 'bg-emerald-500/10' },
                                { icon: Mail, label: 'Email pers.', value: kpiData.withPersonalEmail, color: 'text-green-600 dark:text-green-400', iconBg: 'bg-green-500/10' },
                                { icon: AtSign, label: 'Email gen.', value: kpiData.withGenericEmail, color: 'text-amber-600 dark:text-amber-400', iconBg: 'bg-amber-500/10' },
                                { icon: Phone, label: 'Telefono', value: kpiData.withPhone, color: 'text-sky-600 dark:text-sky-400', iconBg: 'bg-sky-500/10' },
                                { icon: Linkedin, label: 'LinkedIn', value: kpiData.withLinkedin, color: 'text-[#0A66C2]', iconBg: 'bg-[#0A66C2]/10' },
                                { icon: TrendingUp, label: 'Qualita', value: `${kpiData.avgConfidence}%`, color: kpiData.avgConfidence >= 60 ? 'text-green-600 dark:text-green-400' : kpiData.avgConfidence >= 30 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400', iconBg: kpiData.avgConfidence >= 60 ? 'bg-green-500/10' : kpiData.avgConfidence >= 30 ? 'bg-amber-500/10' : 'bg-red-500/10' },
                                { icon: BarChart3, label: 'Email rate', value: `${kpiData.emailRate}%`, color: kpiData.emailRate >= 60 ? 'text-green-600 dark:text-green-400' : kpiData.emailRate >= 30 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400', iconBg: kpiData.emailRate >= 60 ? 'bg-green-500/10' : kpiData.emailRate >= 30 ? 'bg-amber-500/10' : 'bg-red-500/10' },
                            ].filter(k => k.value !== 0 && k.value !== '0%').map(kpi => (
                                <div key={kpi.label} className="flex-1 min-w-[90px] flex items-center gap-2.5 rounded-xl border bg-card px-3 py-2.5">
                                    <div className={cn('h-9 w-9 rounded-lg flex items-center justify-center shrink-0', kpi.iconBg)}>
                                        <kpi.icon className={cn('h-4.5 w-4.5', kpi.color)} />
                                    </div>
                                    <div className="min-w-0">
                                        <span className={cn('text-lg font-bold tabular-nums leading-none block', kpi.color)}>{kpi.value}</span>
                                        <span className="text-[10px] text-muted-foreground leading-tight">{kpi.label}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Row 4: Tabs */}
                <div className="flex gap-0 px-4">
                    {[
                        { key: 'chat' as const, icon: MessageSquare, label: 'Chat' },
                        { key: 'leads' as const, icon: Users, label: `Lead${leads.length > 0 ? ` (${leads.length})` : ''}` },
                        { key: 'export' as const, icon: Download, label: 'Export' },
                        { key: 'skills' as const, icon: Building2, label: 'Skills' },
                    ].map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={cn(
                                'flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px',
                                activeTab === tab.key
                                    ? 'border-emerald-500 text-emerald-700 dark:text-emerald-400'
                                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30'
                            )}
                        >
                            <tab.icon className="h-4 w-4" />
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Tab content — contained card */}
            <div className="flex-1 overflow-hidden mx-4 mb-4 border rounded-xl bg-card shadow-sm">
                {/* ===== CHAT TAB ===== */}
                {activeTab === 'chat' && (
                    <div className="flex flex-col h-full">
                        <div ref={scrollAreaRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                            {displayMessages.map((msg, i) => (
                                <div key={i} className={cn('flex gap-3', msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}>
                                    <Avatar className="h-7 w-7 shrink-0">
                                        <AvatarFallback className={cn('text-xs', msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-emerald-500/10 text-emerald-600')}>
                                            {msg.role === 'user' ? 'Tu' : <Bot className="h-3.5 w-3.5" />}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className={cn('max-w-[85%] rounded-xl px-4 py-3 text-sm', msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted/50 border')}>
                                        <RichContent content={msg.content} />
                                    </div>
                                </div>
                            ))}
                            {isLoading && (
                                <div className="flex gap-3">
                                    <Avatar className="h-7 w-7 shrink-0">
                                        <AvatarFallback className="bg-emerald-500/10 text-emerald-600"><Bot className="h-3.5 w-3.5" /></AvatarFallback>
                                    </Avatar>
                                    <div className="bg-muted/50 border rounded-xl px-4 py-3 text-sm min-w-[280px] max-w-[600px]">
                                        <div className="flex items-center gap-2 text-muted-foreground mb-2">
                                            <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                                            <span className="text-xs font-medium">{progressMessage || 'Sto cercando contatti...'}</span>
                                        </div>
                                        {progressPercent > 0 && (
                                            <div className="space-y-1.5">
                                                <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                                                    <div className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500 ease-out" style={{ width: `${Math.min(progressPercent, 100)}%` }} />
                                                </div>
                                                <div className="text-[10px] text-muted-foreground/70">{progressPercent}%</div>
                                            </div>
                                        )}
                                        {(browserLogs.length > 0 || browserScreenshot) && (
                                            <div className="mt-3 border-t border-dashed pt-2">
                                                <div className="flex items-center gap-1.5 mb-1.5 text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
                                                    <Globe className="h-3 w-3" /><span>Browser Agent</span>
                                                </div>
                                                <div className="rounded-lg overflow-hidden border border-border/60 shadow-sm">
                                                    {browserUrl && (
                                                        <div className="flex items-center gap-2 bg-muted/80 px-2 py-1 border-b border-border/40">
                                                            <div className="flex gap-1">
                                                                <div className="w-2 h-2 rounded-full bg-red-400" />
                                                                <div className="w-2 h-2 rounded-full bg-amber-400" />
                                                                <div className="w-2 h-2 rounded-full bg-emerald-400" />
                                                            </div>
                                                            <div className="flex-1 bg-background/60 rounded px-2 py-0.5 text-[10px] font-mono text-muted-foreground truncate">{browserUrl}</div>
                                                        </div>
                                                    )}
                                                    {browserScreenshot && (
                                                        <div className="bg-white">
                                                            <img src={`data:image/jpeg;base64,${browserScreenshot}`} alt="Browser" className="w-full h-auto max-h-[220px] object-contain object-top" />
                                                        </div>
                                                    )}
                                                    <div ref={browserLogRef} className="max-h-[120px] overflow-y-auto bg-[#1a1a2e] text-[10px] text-green-400 font-mono px-2 py-1.5 space-y-px scroll-smooth">
                                                        {browserLogs.slice(-30).map((log, idx) => (
                                                            <div key={idx} className={cn('leading-tight', log.includes('✅') && 'text-emerald-400', log.includes('❌') && 'text-red-400', log.includes('⚠️') && 'text-amber-400', log.includes('👤') && 'text-cyan-400', log.includes('📧') && 'text-blue-400')}>
                                                                {log.replace('🌐 ', '')}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="border-t p-4">
                            <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="flex gap-2 items-end">
                                <textarea
                                    ref={textareaRef}
                                    value={input}
                                    onChange={(e) => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px'; }}
                                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                                    placeholder="Descrivi i contatti che stai cercando... (Shift+Enter per a capo)"
                                    disabled={isLoading}
                                    rows={1}
                                    className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                    style={{ minHeight: '40px', maxHeight: '200px' }}
                                />
                                <Button type="submit" size="icon" disabled={isLoading || !input.trim()} className="shrink-0">
                                    <Send className="h-4 w-4" />
                                </Button>
                            </form>
                        </div>
                    </div>
                )}

                {/* ===== LEADS TAB ===== */}
                {activeTab === 'leads' && (
                    <div className="h-full flex flex-col p-4">
                        <div className="flex items-center gap-2 mb-3 flex-wrap">
                            <Input placeholder="Cerca lead..." value={leadsSearch} onChange={(e) => setLeadsSearch(e.target.value)} className="h-8 text-xs w-64" />
                            <div className="flex items-center gap-1 ml-auto">
                                {leads.length > 0 && (
                                    <>
                                        <button onClick={selectAllLeads} className="text-[10px] px-2 py-1 rounded border hover:bg-muted transition-colors">
                                            {selectedLeadIds.size === leads.length ? 'Deseleziona' : 'Seleziona tutti'}
                                        </button>
                                        {selectedLeadIds.size > 0 && (
                                            <button onClick={handleDeleteSelectedLeads} disabled={isDeletingLeads} className="text-[10px] px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 transition-colors flex items-center gap-0.5">
                                                {isDeletingLeads ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Trash2 className="h-2.5 w-2.5" />}
                                                Elimina {selectedLeadIds.size}
                                            </button>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                        <ScrollArea className="flex-1">
                            {leadsLoading ? (
                                <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
                            ) : leads.length === 0 ? (
                                <div className="text-center py-16 text-muted-foreground">
                                    <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
                                    <p className="text-sm font-medium">Nessun lead salvato</p>
                                    <p className="text-xs mt-1">Avvia una ricerca nella tab Chat</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                                    {leads.map((lead) => {
                                        const leadContacts: any[] = lead.contacts || [];
                                        const contactCount = leadContacts.length;
                                        const bestContact = leadContacts[0] || { fullName: lead.fullName || `${lead.firstName || ''} ${lead.lastName || ''}`.trim(), jobTitle: lead.jobTitle, email: lead.email };
                                        const isGenericEmail = lead.email && /^(info|admin|support|hello|contact|sales|marketing|office|noreply|segreteria|amministrazione|contatti|ordini|orders|customer|service|webstore)@/i.test(lead.email);
                                        const confidencePct = lead.confidence != null ? Math.round(lead.confidence * 100) : null;
                                        return (
                                            <div key={lead.id} className={cn("border rounded-lg p-2.5 text-xs hover:bg-muted/30 transition-colors cursor-pointer", selectedLeadIds.has(lead.id) && "ring-1 ring-violet-400 bg-violet-50/50 dark:bg-violet-900/20")} onClick={() => { setSelectedLead(lead); setIsLeadDialogOpen(true); }}>
                                                <div className="flex items-center gap-1.5 mb-0.5">
                                                    <input type="checkbox" checked={selectedLeadIds.has(lead.id)} onChange={(e) => { e.stopPropagation(); toggleLeadSelection(lead.id); }} onClick={(e) => e.stopPropagation()} className="h-3 w-3 rounded border-gray-300 accent-violet-500 shrink-0 cursor-pointer" />
                                                    <Building2 className="h-3 w-3 text-muted-foreground shrink-0" />
                                                    <div className="font-medium truncate flex-1 text-[11px]">{lead.companyName || bestContact.fullName || 'Lead'}</div>
                                                    {contactCount > 0 && <Badge variant="outline" className="text-[8px] h-4 px-1 shrink-0 gap-0.5"><Users className="h-2 w-2" />{contactCount}</Badge>}
                                                    {lead.rating > 0 && <div className="flex shrink-0">{[1,2,3,4,5].map(i => <Star key={i} className={cn('h-2 w-2', i <= lead.rating ? 'fill-amber-400 text-amber-400' : 'text-transparent')} />)}</div>}
                                                </div>
                                                <div className="flex items-center gap-1 mt-0.5 pl-[26px]">
                                                    <div className="truncate flex-1 text-[10px] text-muted-foreground">{bestContact.fullName || 'N/A'}{bestContact.jobTitle && <span> · {bestContact.jobTitle}</span>}</div>
                                                </div>
                                                <div className="flex items-center gap-1.5 mt-1 pl-[26px] flex-wrap">
                                                    {lead.email && <div className={cn("flex items-center gap-0.5 text-[10px]", isGenericEmail ? 'text-amber-500' : 'text-blue-500')} title={lead.email}><Mail className="h-2.5 w-2.5" />{isGenericEmail && <span className="text-[8px] font-medium">GEN</span>}</div>}
                                                    {lead.phone && <div className="text-[10px] text-green-500"><Phone className="h-2.5 w-2.5" /></div>}
                                                    {lead.linkedinUrl && <div className="text-[10px] text-blue-600"><Linkedin className="h-2.5 w-2.5" /></div>}
                                                    {lead.companyWebsite && <div className="text-[10px] text-purple-500"><Globe className="h-2.5 w-2.5" /></div>}
                                                    <div className="flex items-center gap-1 ml-auto">
                                                        {lead.source && <Badge variant="outline" className="text-[8px] h-4 px-1">{lead.source}</Badge>}
                                                        {confidencePct != null && <Badge variant="outline" className={cn("text-[8px] h-4 px-1 font-mono gap-0.5", confidencePct >= 70 ? 'border-green-500/50 text-green-600' : confidencePct >= 40 ? 'border-amber-500/50 text-amber-600' : 'border-red-500/50 text-red-500')}><ShieldCheck className="h-2 w-2" />{confidencePct}%</Badge>}
                                                    </div>
                                                </div>
                                                {(lead.revenueYear3 || lead.revenueYear2) && <div className="text-[9px] text-muted-foreground mt-1 pl-[26px] truncate">Fatt: {lead.revenueYear3 || lead.revenueYear2 || '-'}</div>}
                                                {lead.tags?.length > 0 && <div className="flex flex-wrap gap-0.5 mt-1 pl-[26px]">{lead.tags.slice(0, 3).map((tag: string) => <Badge key={tag} variant="default" className="text-[7px] h-3.5 px-1">{tag}</Badge>)}{lead.tags.length > 3 && <Badge variant="secondary" className="text-[7px] h-3.5 px-1">+{lead.tags.length - 3}</Badge>}</div>}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </ScrollArea>
                    </div>
                )}

                {/* ===== EXPORT TAB ===== */}
                {activeTab === 'export' && (
                    <div className="p-8 max-w-md mx-auto">
                        <div className="text-center mb-6">
                            <FileSpreadsheet className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                            <h3 className="text-sm font-semibold mb-1">Esporta lead</h3>
                            <p className="text-xs text-muted-foreground">{leads.length} lead disponibili</p>
                        </div>
                        <div className="space-y-3">
                            <Button className="w-full" variant="outline" size="lg" onClick={() => handleExport('csv')} disabled={leads.length === 0}>
                                <Download className="h-4 w-4 mr-2" />Esporta CSV
                            </Button>
                            <Button className="w-full" variant="outline" size="lg" onClick={() => handleExport('excel')} disabled={leads.length === 0}>
                                <FileSpreadsheet className="h-4 w-4 mr-2" />Esporta Excel
                            </Button>
                        </div>
                    </div>
                )}

                {/* ===== SKILLS TAB ===== */}
                {activeTab === 'skills' && (
                    <div className="h-full overflow-y-auto">
                        <div className="max-w-2xl mx-auto p-6 space-y-6">
                            {/* Header */}
                            <div className="flex items-center gap-3 pb-4 border-b">
                                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                                    <Sparkles className="h-5 w-5 text-white" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold">Skills &mdash; Chi sei?</h3>
                                    <p className="text-xs text-muted-foreground">Compila il profilo aziendale per aiutare l&apos;agente AI a scrivere email migliori e cercare lead più mirati</p>
                                </div>
                            </div>

                            {/* Form grid */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {/* Company Name */}
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-muted-foreground">Nome azienda *</label>
                                    <Input
                                        placeholder="Es. Quid Informatica"
                                        value={skillsData.companyName}
                                        onChange={e => setSkillsData(prev => ({ ...prev, companyName: e.target.value }))}
                                        className="h-9 text-sm"
                                    />
                                </div>
                                {/* Tagline */}
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-muted-foreground">Tagline / Slogan</label>
                                    <Input
                                        placeholder="Es. Innoviamo il tuo business con l'AI"
                                        value={skillsData.tagline}
                                        onChange={e => setSkillsData(prev => ({ ...prev, tagline: e.target.value }))}
                                        className="h-9 text-sm"
                                    />
                                </div>
                                {/* Sector */}
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-muted-foreground">Settore</label>
                                    <Input
                                        placeholder="Es. Software, Consulenza IT, AI"
                                        value={skillsData.sector}
                                        onChange={e => setSkillsData(prev => ({ ...prev, sector: e.target.value }))}
                                        className="h-9 text-sm"
                                    />
                                </div>
                                {/* Location */}
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-muted-foreground">Sede</label>
                                    <Input
                                        placeholder="Es. Verona, Italia"
                                        value={skillsData.location}
                                        onChange={e => setSkillsData(prev => ({ ...prev, location: e.target.value }))}
                                        className="h-9 text-sm"
                                    />
                                </div>
                                {/* Founded */}
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-muted-foreground">Anno fondazione</label>
                                    <Input
                                        placeholder="Es. 1988"
                                        value={skillsData.founded}
                                        onChange={e => setSkillsData(prev => ({ ...prev, founded: e.target.value }))}
                                        className="h-9 text-sm"
                                    />
                                </div>
                                {/* Team size */}
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-muted-foreground">Dimensione team</label>
                                    <Input
                                        placeholder="Es. 50-100 persone"
                                        value={skillsData.teamSize}
                                        onChange={e => setSkillsData(prev => ({ ...prev, teamSize: e.target.value }))}
                                        className="h-9 text-sm"
                                    />
                                </div>
                                {/* Website */}
                                <div className="sm:col-span-2 space-y-1.5">
                                    <label className="text-xs font-medium text-muted-foreground">Sito web</label>
                                    <Input
                                        placeholder="Es. https://www.quidinformatica.it"
                                        value={skillsData.website}
                                        onChange={e => setSkillsData(prev => ({ ...prev, website: e.target.value }))}
                                        className="h-9 text-sm"
                                    />
                                </div>
                            </div>

                            {/* Long text fields */}
                            <div className="space-y-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-muted-foreground">Descrizione azienda</label>
                                    <textarea
                                        placeholder="Descrivi cosa fa la tua azienda, la sua storia, i suoi valori..."
                                        value={skillsData.description}
                                        onChange={e => setSkillsData(prev => ({ ...prev, description: e.target.value }))}
                                        rows={3}
                                        className="w-full rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-muted-foreground">Prodotti / Servizi offerti</label>
                                    <textarea
                                        placeholder="Elenca i principali prodotti e servizi: ERP, CRM, soluzioni AI, consulenza..."
                                        value={skillsData.products}
                                        onChange={e => setSkillsData(prev => ({ ...prev, products: e.target.value }))}
                                        rows={3}
                                        className="w-full rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-muted-foreground">Clienti target</label>
                                    <textarea
                                        placeholder="A chi vi rivolgete? PMI manifatturiere, aziende fashion, retail..."
                                        value={skillsData.targetCustomers}
                                        onChange={e => setSkillsData(prev => ({ ...prev, targetCustomers: e.target.value }))}
                                        rows={2}
                                        className="w-full rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-muted-foreground">Proposta di valore unica</label>
                                    <textarea
                                        placeholder="Cosa vi differenzia? Perché un cliente dovrebbe scegliere voi?"
                                        value={skillsData.uniqueValue}
                                        onChange={e => setSkillsData(prev => ({ ...prev, uniqueValue: e.target.value }))}
                                        rows={2}
                                        className="w-full rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-muted-foreground">Tono di comunicazione</label>
                                    <Input
                                        placeholder="Es. Professionale ma amichevole, tecnico, formale..."
                                        value={skillsData.tone}
                                        onChange={e => setSkillsData(prev => ({ ...prev, tone: e.target.value }))}
                                        className="h-9 text-sm"
                                    />
                                </div>
                            </div>

                            {/* Preview */}
                            {skillsContext && (
                                <div className="rounded-xl border bg-muted/30 p-4 space-y-2">
                                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                                        <Info className="h-3.5 w-3.5" />
                                        Anteprima &mdash; Questo contesto verrà iniettato nell&apos;agente AI
                                    </div>
                                    <pre className="text-xs whitespace-pre-wrap text-foreground/80 font-mono leading-relaxed">{skillsContext}</pre>
                                </div>
                            )}

                            {/* Save button */}
                            <div className="flex justify-end pt-2 pb-4">
                                <Button onClick={handleSaveSkills} disabled={isSkillsSaving} className="gap-2 bg-gradient-to-r from-violet-500 to-purple-600 text-white hover:from-violet-600 hover:to-purple-700">
                                    {isSkillsSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                    Salva Skills
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Lead detail dialog */}
            <LeadDetailDialog lead={selectedLead} open={isLeadDialogOpen} onOpenChange={setIsLeadDialogOpen} onUpdate={handleUpdateLead} onDelete={handleDeleteLead} onSendEmail={handleSendEmail} />

            {/* Delete search confirmation */}
            <AlertDialog open={!!deleteSearchTarget} onOpenChange={(open) => { if (!open) setDeleteSearchTarget(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Eliminare questa ricerca?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Eliminando la ricerca <strong>&quot;{deleteSearchTarget?.name}&quot;</strong> verranno eliminati anche tutti i <strong>{deleteSearchTarget?._count?.leads || 0} lead</strong> associati.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Annulla</AlertDialogCancel>
                        <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteSearchTarget && handleDeleteSearch(deleteSearchTarget.id)}>
                            Elimina
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
