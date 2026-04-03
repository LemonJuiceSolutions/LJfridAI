'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    Send, Bot, Loader2, Trash2, UserSearch, Download, Search,
    Users, Building2, Mail, Phone, Linkedin, Globe, FileSpreadsheet,
    ChevronRight, ChevronLeft, RefreshCw, ChevronsUpDown, Check,
    Plus, MessageSquare, Clock, MoreHorizontal, Star, X, Tag,
    PenLine, ExternalLink, ShieldCheck, Info, CheckCircle2,
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
import { sendLeadEmailAction, generateLeadEmailAction, getLeadGenApiKeysAction } from '@/actions/lead-generator';

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

    const name = lead.fullName || `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || 'N/A';
    const currentYear = new Date().getFullYear();
    const hasFinancials = lead.revenueYear1 || lead.revenueYear2 || lead.revenueYear3 || lead.profitYear1 || lead.profitYear2 || lead.profitYear3;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center justify-between pr-6">
                        <span>{name}</span>
                        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                    </DialogTitle>
                    {lead.jobTitle && (
                        <p className="text-sm text-muted-foreground">{lead.jobTitle}</p>
                    )}
                </DialogHeader>

                <div className="space-y-4 mt-2">
                    {/* Company info */}
                    {lead.companyName && (
                        <div className="flex items-center gap-2 text-sm">
                            <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="font-medium">{lead.companyName}</span>
                            {lead.companyIndustry && (
                                <Badge variant="secondary" className="text-[10px]">{lead.companyIndustry}</Badge>
                            )}
                        </div>
                    )}

                    {/* Contact details */}
                    <div className="grid grid-cols-1 gap-2 text-sm">
                        {lead.email && (
                            <a href={`mailto:${lead.email}`} className="flex items-center gap-2 text-blue-500 hover:underline">
                                <Mail className="h-3.5 w-3.5 shrink-0" />
                                {lead.email}
                            </a>
                        )}
                        {lead.phone && (
                            <a href={`tel:${lead.phone}`} className="flex items-center gap-2 text-green-600 hover:underline">
                                <Phone className="h-3.5 w-3.5 shrink-0" />
                                {lead.phone}
                            </a>
                        )}
                        {lead.linkedinUrl && (
                            <a href={lead.linkedinUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-blue-600 hover:underline">
                                <Linkedin className="h-3.5 w-3.5 shrink-0" />
                                LinkedIn
                            </a>
                        )}
                        {lead.companyWebsite && (
                            <a href={lead.companyWebsite.startsWith('http') ? lead.companyWebsite : `https://${lead.companyWebsite}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-purple-500 hover:underline">
                                <Globe className="h-3.5 w-3.5 shrink-0" />
                                {lead.companyWebsite}
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
                                    Affidabilita' e Fonte
                                </span>
                                <button onClick={() => setShowSourceInfo(false)} className="text-muted-foreground hover:text-foreground">
                                    <X className="h-3 w-3" />
                                </button>
                            </div>
                            <div className="grid grid-cols-2 gap-y-1.5 gap-x-4">
                                <span className="text-muted-foreground">Fonte dati:</span>
                                <span className="font-medium capitalize">{lead.source || 'N/A'}</span>

                                <span className="text-muted-foreground">Affidabilita':</span>
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

                                {lead.emailStatus && (
                                    <>
                                        <span className="text-muted-foreground">Stato email:</span>
                                        <span className={cn('font-medium', lead.emailStatus === 'valid' ? 'text-green-600' : lead.emailStatus === 'invalid' ? 'text-red-500' : 'text-amber-500')}>
                                            {lead.emailStatus === 'valid' ? 'Verificata' : lead.emailStatus === 'invalid' ? 'Non valida' : lead.emailStatus}
                                        </span>
                                    </>
                                )}

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

    // Conversation history state
    const [conversations, setConversations] = useState<ConversationMeta[]>([]);
    const [showHistory, setShowHistory] = useState(true);
    const [currentCost, setCurrentCost] = useState<number>(0);

    // Provider API keys status (which are configured)
    const [configuredProviders, setConfiguredProviders] = useState<Record<string, boolean>>({});

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

    const scrollToBottom = useCallback(() => {
        if (scrollAreaRef.current) {
            scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
        }
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [messages, scrollToBottom]);

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
        if (id === conversationId) return;
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
            // No linked searches found - show all leads
            activeSearchIdRef.current = null;
            setActiveSearchId(null);
            loadLeads(null);
        }
    };

    const handleNewConversation = () => {
        setConversationId(null);
        setMessages([]);
        setCurrentCost(0);
        // Reset search filter
        activeSearchIdRef.current = null;
        setActiveSearchId(null);
        loadLeads(null);
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

        try {
            const res = await fetch('/api/lead-generator', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userMessage: userMessage.content,
                    conversationId,
                    model: activeModel,
                    aiProvider,
                }),
            });

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

            // Refresh searches and conversation list, then auto-select this conversation's search
            const currentConvId = data.conversationId || conversationId;
            const refreshAndSelectSearch = async () => {
                const { getLeadSearchesAction } = await import('@/actions/lead-generator');
                const searchResult = await getLeadSearchesAction();
                if (searchResult.searches) {
                    setSearches(searchResult.searches);
                    // Auto-select the most recent search from this conversation
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
            // Delayed re-fetch in case DB write was slow
            setTimeout(() => refreshAndSelectSearch(), 2000);
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

    return (
        <div className="flex flex-col h-[calc(100vh-2rem)] p-4 md:p-6 gap-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                        <UserSearch className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold">Lead Generator</h1>
                        <div className="flex items-center gap-1.5">
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
                                        <span className="truncate max-w-[200px]">
                                            {isSavingModel ? 'Salvando...' : activeModelName}
                                        </span>
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
                                                    <CommandItem
                                                        key={m.id}
                                                        value={m.id}
                                                        onSelect={() => handleModelChange(m.id)}
                                                        className="text-xs"
                                                    >
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
                    <div className="flex gap-1 flex-wrap">
                        {[
                            { key: 'apollo', label: 'Apollo.io' },
                            { key: 'hunter', label: 'Hunter.io' },
                            { key: 'serpApi', label: 'Google Maps' },
                            { key: 'vibeProspect', label: 'Vibe Prospect' },
                            { key: 'firecrawl', label: 'Firecrawl' },
                            { key: 'apify', label: 'Apify' },
                        ].map(p => (
                            <Badge
                                key={p.key}
                                variant={configuredProviders[p.key] ? 'default' : 'secondary'}
                                className={cn(
                                    'text-[10px]',
                                    configuredProviders[p.key]
                                        ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 border-green-200 dark:border-green-800'
                                        : 'opacity-50'
                                )}
                            >
                                {configuredProviders[p.key] && <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />}
                                {p.label}
                            </Badge>
                        ))}
                    </div>
                    {leads.length > 0 && (() => {
                        const bySource: Record<string, number> = {};
                        for (const l of leads) {
                            const src = (l.source || 'altro').toLowerCase().replace(/_/g, ' ');
                            bySource[src] = (bySource[src] || 0) + 1;
                        }
                        return (
                            <div className="flex gap-1 items-center">
                                <span className="text-[9px] text-muted-foreground">Lead:</span>
                                {Object.entries(bySource).sort((a, b) => b[1] - a[1]).map(([src, count]) => (
                                    <Badge key={src} variant="outline" className="text-[9px] h-4 px-1.5 font-normal">
                                        {src} <span className="font-semibold ml-0.5">{count}</span>
                                    </Badge>
                                ))}
                                <Badge variant="outline" className="text-[9px] h-4 px-1.5 font-semibold bg-muted">
                                    Tot: {leads.length}
                                </Badge>
                            </div>
                        );
                    })()}
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowHistory(!showHistory)}
                    >
                        <Clock className="h-4 w-4" />
                        <span className="ml-1 text-xs">{showHistory ? 'Nascondi' : 'Cronologia'}</span>
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowLeadsPanel(!showLeadsPanel)}
                    >
                        {showLeadsPanel ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                        <span className="ml-1 text-xs">{showLeadsPanel ? 'Nascondi' : 'Lead'}</span>
                    </Button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex gap-4 overflow-hidden">
                {/* Conversation History Sidebar */}
                {showHistory && (
                    <Card className="w-64 flex flex-col shrink-0">
                        <CardHeader className="pb-2 px-3 pt-3">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-xs font-semibold">Ricerche</CardTitle>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={handleNewConversation}
                                    title="Nuova ricerca"
                                >
                                    <Plus className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="flex-1 overflow-hidden p-0 px-2 pb-2">
                            <ScrollArea className="h-full">
                                <div className="space-y-0.5">
                                    {/* New conversation button */}
                                    <button
                                        onClick={handleNewConversation}
                                        className={cn(
                                            "w-full text-left px-2.5 py-2 rounded-md text-xs transition-colors flex items-center gap-2",
                                            !conversationId
                                                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                                                : "hover:bg-muted text-muted-foreground"
                                        )}
                                    >
                                        <Plus className="h-3 w-3 shrink-0" />
                                        <span className="font-medium">Nuova ricerca</span>
                                    </button>

                                    {conversations.length === 0 ? (
                                        <div className="text-center py-6 text-muted-foreground">
                                            <MessageSquare className="h-6 w-6 mx-auto mb-2 opacity-30" />
                                            <p className="text-[10px]">Nessuna ricerca salvata</p>
                                        </div>
                                    ) : (
                                        conversations.map((conv) => (
                                            <div
                                                key={conv.id}
                                                onClick={() => handleSwitchConversation(conv.id)}
                                                className={cn(
                                                    "w-full text-left px-2.5 py-2 rounded-md text-xs transition-colors cursor-pointer group flex items-start gap-2",
                                                    conversationId === conv.id
                                                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                                                        : "hover:bg-muted text-foreground"
                                                )}
                                            >
                                                <MessageSquare className="h-3 w-3 shrink-0 mt-0.5 opacity-50" />
                                                <div className="flex-1 min-w-0">
                                                    <div className="truncate font-medium text-[11px] leading-tight">
                                                        {conv.title || 'Ricerca senza titolo'}
                                                    </div>
                                                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5">
                                                        <span>{formatDate(conv.updatedAt)}</span>
                                                        {conv.totalCost > 0 && (
                                                            <Badge variant="outline" className="text-[8px] h-3.5 px-1 font-mono">
                                                                {formatCost(conv.totalCost)}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                </div>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <button
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="h-5 w-5 shrink-0 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-muted-foreground/10 transition-opacity"
                                                        >
                                                            <MoreHorizontal className="h-3 w-3" />
                                                        </button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="w-36">
                                                        <DropdownMenuItem
                                                            onClick={(e) => handleDeleteConversation(conv.id, e as any)}
                                                            className="text-destructive text-xs"
                                                        >
                                                            <Trash2 className="h-3 w-3 mr-2" />
                                                            Elimina
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </ScrollArea>
                        </CardContent>
                    </Card>
                )}

                {/* Chat Area */}
                <Card className="flex-1 flex flex-col min-w-0">
                    {currentCost > 0 && (
                        <div className="flex items-center justify-end px-4 pt-2 pb-0">
                            <Badge variant="secondary" className="text-[10px] font-mono gap-1">
                                Costo: {formatCost(currentCost)}
                            </Badge>
                        </div>
                    )}
                    <CardContent className="flex-1 overflow-hidden p-0">
                        <div
                            ref={scrollAreaRef}
                            className="h-full overflow-y-auto px-4 py-4 space-y-4"
                        >
                            {displayMessages.map((msg, i) => (
                                <div
                                    key={i}
                                    className={cn(
                                        'flex gap-3',
                                        msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                                    )}
                                >
                                    <Avatar className="h-7 w-7 shrink-0">
                                        <AvatarFallback className={cn(
                                            'text-xs',
                                            msg.role === 'user'
                                                ? 'bg-primary text-primary-foreground'
                                                : 'bg-emerald-500/10 text-emerald-600'
                                        )}>
                                            {msg.role === 'user' ? 'Tu' : <Bot className="h-3.5 w-3.5" />}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className={cn(
                                        'max-w-[85%] rounded-xl px-4 py-3 text-sm',
                                        msg.role === 'user'
                                            ? 'bg-primary text-primary-foreground'
                                            : 'bg-muted/50 border'
                                    )}>
                                        <RichContent content={msg.content} />
                                    </div>
                                </div>
                            ))}
                            {isLoading && (
                                <div className="flex gap-3">
                                    <Avatar className="h-7 w-7 shrink-0">
                                        <AvatarFallback className="bg-emerald-500/10 text-emerald-600">
                                            <Bot className="h-3.5 w-3.5" />
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="bg-muted/50 border rounded-xl px-4 py-3 text-sm">
                                        <div className="flex items-center gap-2 text-muted-foreground">
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            <span className="text-xs">Sto cercando contatti...</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </CardContent>

                    {/* Input Area */}
                    <div className="border-t p-4">
                        <form
                            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                            className="flex gap-2 items-end"
                        >
                            <textarea
                                ref={textareaRef}
                                value={input}
                                onChange={(e) => {
                                    setInput(e.target.value);
                                    // Auto-resize
                                    e.target.style.height = 'auto';
                                    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSend();
                                    }
                                }}
                                placeholder="Descrivi i contatti che stai cercando... (Shift+Enter per a capo)"
                                disabled={isLoading}
                                rows={1}
                                className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                style={{ minHeight: '40px', maxHeight: '200px' }}
                            />
                            <Button type="submit" size="icon" disabled={isLoading || !input.trim()} className="shrink-0">
                                <Send className="h-4 w-4" />
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={handleClearChat}
                                title="Elimina conversazione"
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </form>
                    </div>
                </Card>

                {/* Leads Panel */}
                {showLeadsPanel && (
                    <Card className="w-80 flex flex-col shrink-0">
                        <CardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-sm">Lead Salvati</CardTitle>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={() => { loadLeads(activeSearchIdRef.current); loadSearches(); }}
                                    title="Aggiorna"
                                >
                                    <RefreshCw className="h-3 w-3" />
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="flex-1 overflow-hidden p-0">
                            <Tabs value={leadsTab} onValueChange={setLeadsTab} className="h-full flex flex-col">
                                <TabsList className="mx-4 mb-2 grid grid-cols-2 h-8">
                                    <TabsTrigger value="leads" className="text-[10px]">Lead</TabsTrigger>
                                    <TabsTrigger value="export" className="text-[10px]">Export</TabsTrigger>
                                </TabsList>

                                <TabsContent value="leads" className="flex-1 overflow-hidden m-0 px-4 pb-4">
                                    {activeSearchId && searches.length > 0 && (
                                        <div className="flex items-center justify-between mb-1.5">
                                            <span className="text-[10px] font-medium text-muted-foreground truncate">
                                                {searches.find(s => s.id === activeSearchId)?.name || 'Ricerca'}
                                            </span>
                                            <button
                                                className="text-[10px] text-muted-foreground hover:text-foreground"
                                                onClick={() => { activeSearchIdRef.current = null; setActiveSearchId(null); loadLeads(null); }}
                                            >
                                                Mostra tutti
                                            </button>
                                        </div>
                                    )}
                                    <div className="mb-2 space-y-1.5">
                                        <Input
                                            placeholder="Cerca lead..."
                                            value={leadsSearch}
                                            onChange={(e) => setLeadsSearch(e.target.value)}
                                            className="h-7 text-xs"
                                        />
                                        {leads.length > 0 && (
                                            <div className="flex items-center gap-1 flex-wrap">
                                                <button
                                                    onClick={selectAllLeads}
                                                    className="text-[10px] px-1.5 py-0.5 rounded border hover:bg-muted transition-colors"
                                                >
                                                    {selectedLeadIds.size === leads.length ? 'Deseleziona' : 'Seleziona tutti'}
                                                </button>
                                                {selectedLeadIds.size > 0 && (
                                                    <button
                                                        onClick={handleDeleteSelectedLeads}
                                                        disabled={isDeletingLeads}
                                                        className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 transition-colors flex items-center gap-0.5"
                                                    >
                                                        {isDeletingLeads ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Trash2 className="h-2.5 w-2.5" />}
                                                        Elimina {selectedLeadIds.size} selezionati
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => {
                                                        if (confirm(`Eliminare tutti i ${leads.length} lead? Questa azione non può essere annullata.`)) {
                                                            handleDeleteAllLeads();
                                                        }
                                                    }}
                                                    disabled={isDeletingLeads}
                                                    className="text-[10px] px-1.5 py-0.5 rounded text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors ml-auto"
                                                >
                                                    Elimina tutti
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                    <ScrollArea className="h-[calc(100%-2.5rem)]">
                                        {leadsLoading ? (
                                            <div className="flex items-center justify-center py-8 text-muted-foreground">
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            </div>
                                        ) : leads.length === 0 ? (
                                            <div className="text-center py-8 text-muted-foreground">
                                                <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
                                                <p className="text-xs">Nessun lead salvato</p>
                                                <p className="text-[10px] mt-1">I lead trovati dall&apos;agente appariranno qui</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                {leads.map((lead) => {
                                                    const isGenericEmail = lead.email && /^(info|admin|support|hello|contact|sales|marketing|office|noreply|segreteria|amministrazione|contatti|ordini|orders|customer|service|webstore)@/i.test(lead.email);
                                                    const confidencePct = lead.confidence != null ? Math.round(lead.confidence * 100) : null;
                                                    return (
                                                    <div
                                                        key={lead.id}
                                                        className={cn("border rounded-lg p-2 text-xs hover:bg-muted/30 transition-colors cursor-pointer", selectedLeadIds.has(lead.id) && "ring-1 ring-violet-400 bg-violet-50/50 dark:bg-violet-900/20")}
                                                        onClick={() => { setSelectedLead(lead); setIsLeadDialogOpen(true); }}
                                                    >
                                                        <div className="flex items-center gap-1.5 mb-0.5">
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedLeadIds.has(lead.id)}
                                                                onChange={(e) => { e.stopPropagation(); toggleLeadSelection(lead.id); }}
                                                                onClick={(e) => e.stopPropagation()}
                                                                className="h-3 w-3 rounded border-gray-300 accent-violet-500 shrink-0 cursor-pointer"
                                                            />
                                                            <span className="text-[10px] text-muted-foreground flex-1 truncate">
                                                                {lead.fullName || `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || lead.companyName || 'Lead'}
                                                            </span>
                                                        </div>
                                                        {lead.companyName && (
                                                            <div className="flex items-center gap-1">
                                                                <Building2 className="h-3 w-3 text-muted-foreground shrink-0" />
                                                                <div className="font-medium truncate flex-1 text-[11px]">{lead.companyName}</div>
                                                                {lead.rating > 0 && (
                                                                    <div className="flex shrink-0">
                                                                        {[1, 2, 3, 4, 5].map(i => (
                                                                            <Star key={i} className={cn('h-2 w-2', i <= lead.rating ? 'fill-amber-400 text-amber-400' : 'text-transparent')} />
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                        <div className="flex items-center gap-1 mt-0.5">
                                                            <div className="truncate flex-1 text-[10px] text-muted-foreground">
                                                                {lead.fullName || `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || 'N/A'}
                                                                {lead.jobTitle && <span> · {lead.jobTitle}</span>}
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                                            {lead.email && (
                                                                <div className={cn("flex items-center gap-0.5 text-[10px]", isGenericEmail ? 'text-amber-500' : 'text-blue-500')} title={isGenericEmail ? `Email generica: ${lead.email}` : lead.email}>
                                                                    <Mail className="h-2.5 w-2.5" />
                                                                    {isGenericEmail && <span className="text-[8px] font-medium">GEN</span>}
                                                                </div>
                                                            )}
                                                            {lead.phone && (
                                                                <div className="flex items-center gap-0.5 text-[10px] text-green-500">
                                                                    <Phone className="h-2.5 w-2.5" />
                                                                </div>
                                                            )}
                                                            {lead.linkedinUrl && (
                                                                <div className="flex items-center gap-0.5 text-[10px] text-blue-600">
                                                                    <Linkedin className="h-2.5 w-2.5" />
                                                                </div>
                                                            )}
                                                            {lead.companyWebsite && (
                                                                <div className="flex items-center gap-0.5 text-[10px] text-purple-500">
                                                                    <Globe className="h-2.5 w-2.5" />
                                                                </div>
                                                            )}
                                                            <div className="flex items-center gap-1 ml-auto">
                                                                {lead.source && (
                                                                    <Badge variant="outline" className="text-[8px] h-4 px-1">
                                                                        {lead.source}
                                                                    </Badge>
                                                                )}
                                                                {confidencePct != null && (
                                                                    <Badge
                                                                        variant="outline"
                                                                        className={cn("text-[8px] h-4 px-1 font-mono gap-0.5", confidencePct >= 70 ? 'border-green-500/50 text-green-600' : confidencePct >= 40 ? 'border-amber-500/50 text-amber-600' : 'border-red-500/50 text-red-500')}
                                                                    >
                                                                        <ShieldCheck className="h-2 w-2" />
                                                                        {confidencePct}%
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                        </div>
                                                        {/* Financial data preview */}
                                                        {(lead.revenueYear3 || lead.revenueYear2) && (
                                                            <div className="text-[9px] text-muted-foreground mt-1 truncate">
                                                                Fatt: {lead.revenueYear3 || lead.revenueYear2 || '-'}
                                                            </div>
                                                        )}
                                                        {lead.tags?.length > 0 && (
                                                            <div className="flex flex-wrap gap-0.5 mt-1">
                                                                {lead.tags.slice(0, 3).map((tag: string) => (
                                                                    <Badge key={tag} variant="default" className="text-[7px] h-3.5 px-1">
                                                                        {tag}
                                                                    </Badge>
                                                                ))}
                                                                {lead.tags.length > 3 && (
                                                                    <Badge variant="secondary" className="text-[7px] h-3.5 px-1">
                                                                        +{lead.tags.length - 3}
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </ScrollArea>
                                </TabsContent>

                                <TabsContent value="export" className="m-0 px-4 pb-4">
                                    <div className="space-y-3">
                                        <div className="text-center py-4">
                                            <FileSpreadsheet className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
                                            <p className="text-xs text-muted-foreground mb-1">
                                                Esporta {activeSearchId ? 'i lead della ricerca selezionata' : 'tutti i lead'}
                                            </p>
                                            <p className="text-[10px] text-muted-foreground">
                                                {leads.length} lead disponibili
                                            </p>
                                        </div>
                                        <Button
                                            className="w-full"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleExport('csv')}
                                            disabled={leads.length === 0}
                                        >
                                            <Download className="h-3.5 w-3.5 mr-2" />
                                            Esporta CSV
                                        </Button>
                                        <Button
                                            className="w-full"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleExport('excel')}
                                            disabled={leads.length === 0}
                                        >
                                            <FileSpreadsheet className="h-3.5 w-3.5 mr-2" />
                                            Esporta Excel
                                        </Button>
                                    </div>
                                </TabsContent>
                            </Tabs>
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* Lead detail dialog */}
            <LeadDetailDialog
                lead={selectedLead}
                open={isLeadDialogOpen}
                onOpenChange={setIsLeadDialogOpen}
                onUpdate={handleUpdateLead}
                onDelete={handleDeleteLead}
                onSendEmail={handleSendEmail}
            />

            {/* Delete search confirmation */}
            <AlertDialog open={!!deleteSearchTarget} onOpenChange={(open) => { if (!open) setDeleteSearchTarget(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Eliminare questa ricerca?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Eliminando la ricerca <strong>&quot;{deleteSearchTarget?.name}&quot;</strong> verranno eliminati anche tutti i <strong>{deleteSearchTarget?._count?.leads || 0} lead</strong> associati. Questa azione non può essere annullata.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Annulla</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => deleteSearchTarget && handleDeleteSearch(deleteSearchTarget.id)}
                        >
                            Elimina ricerca e lead
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
