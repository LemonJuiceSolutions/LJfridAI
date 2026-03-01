'use client';

import React, { useState } from 'react';
import { Loader2, Check, AlertCircle, ChevronDown, ChevronUp, Database, Search, BookOpen, Code2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// Tool name to Italian display name + icon
const TOOL_META: Record<string, { label: string; icon: React.ElementType }> = {
    // SQL agent tools
    exploreDbSchema: { label: 'Esplorando schema database', icon: Database },
    exploreTableColumns: { label: 'Esplorando colonne tabella', icon: Database },
    testSqlQuery: { label: 'Testando query SQL', icon: Code2 },
    searchKnowledgeBase: { label: 'Cercando nella Knowledge Base', icon: Search },
    listSqlConnectors: { label: 'Elencando connettori', icon: Database },
    sqlSaveToKnowledgeBase: { label: 'Salvando nella Knowledge Base', icon: BookOpen },
    browseOtherQueries: { label: 'Esplorando query da altri nodi', icon: Search },
    // Python agent tools
    pyTestCode: { label: 'Testando codice Python', icon: Code2 },
    pyExploreDbSchema: { label: 'Esplorando schema database', icon: Database },
    pyExploreTableColumns: { label: 'Esplorando colonne tabella', icon: Database },
    pyTestSqlQuery: { label: 'Testando query SQL', icon: Code2 },
    pySearchKnowledgeBase: { label: 'Cercando nella Knowledge Base', icon: Search },
    pyListSqlConnectors: { label: 'Elencando connettori', icon: Database },
    pySaveToKnowledgeBase: { label: 'Salvando nella Knowledge Base', icon: BookOpen },
    pyBrowseOtherScripts: { label: 'Esplorando script da altri nodi', icon: Search },
    // Super agent tools
    listTreesAndPipelines: { label: 'Elencando alberi e pipeline', icon: Search },
    getTreeContent: { label: 'Esplorando albero', icon: Search },
    searchNodesForQuery: { label: 'Cercando nei nodi', icon: Search },
    executeSqlQuery: { label: 'Eseguendo query SQL', icon: Database },
    executePythonCode: { label: 'Eseguendo codice Python', icon: Code2 },
    saveToKnowledgeBase: { label: 'Salvando nella Knowledge Base', icon: BookOpen },
};

export type ToolCallStatus = 'running' | 'completed' | 'failed';

export interface ToolCallInfo {
    toolCallId: string;
    toolName: string;
    args: Record<string, any>;
    status: ToolCallStatus;
    result?: string;
}

function ToolCallItem({ call }: { call: ToolCallInfo }) {
    const [isExpanded, setIsExpanded] = useState(false);
    const meta = TOOL_META[call.toolName] || { label: call.toolName, icon: Code2 };
    const Icon = meta.icon;

    // Truncate args for display
    const argsPreview = Object.entries(call.args)
        .filter(([k]) => k !== 'companyId' && k !== 'connectorId') // Hide internal IDs
        .map(([k, v]) => {
            const val = typeof v === 'string' ? (v.length > 60 ? v.substring(0, 60) + '...' : v) : JSON.stringify(v);
            return `${k}: ${val}`;
        })
        .join(', ');

    return (
        <div className={cn(
            'rounded-md border text-xs transition-colors',
            call.status === 'running' && 'border-blue-300/50 bg-blue-50/50 dark:border-blue-800/50 dark:bg-blue-950/20',
            call.status === 'completed' && 'border-green-300/50 bg-green-50/50 dark:border-green-800/50 dark:bg-green-950/20',
            call.status === 'failed' && 'border-red-300/50 bg-red-50/50 dark:border-red-800/50 dark:bg-red-950/20',
        )}>
            <button
                onClick={() => call.result && setIsExpanded(!isExpanded)}
                className="flex items-center gap-2 w-full px-2.5 py-1.5 cursor-pointer"
            >
                {/* Status icon */}
                {call.status === 'running' && <Loader2 className="h-3 w-3 animate-spin text-blue-500 shrink-0" />}
                {call.status === 'completed' && <Check className="h-3 w-3 text-green-500 shrink-0" />}
                {call.status === 'failed' && <AlertCircle className="h-3 w-3 text-red-500 shrink-0" />}

                {/* Tool icon + label */}
                <Icon className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="font-medium truncate">{meta.label}</span>

                {/* Args preview */}
                {argsPreview && (
                    <span className="text-muted-foreground truncate ml-1">
                        ({argsPreview})
                    </span>
                )}

                {/* Expand toggle */}
                {call.result && (
                    <span className="ml-auto shrink-0">
                        {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </span>
                )}
            </button>

            {/* Expanded result */}
            {isExpanded && call.result && (
                <div className="px-2.5 pb-2 pt-0">
                    <pre className="bg-zinc-950 text-zinc-300 p-2 rounded text-[10px] max-h-32 overflow-auto whitespace-pre-wrap break-all">
                        {formatToolResult(call.result)}
                    </pre>
                </div>
            )}
        </div>
    );
}

function formatToolResult(result: string): string {
    try {
        const parsed = JSON.parse(result);
        return JSON.stringify(parsed, null, 2);
    } catch {
        return result;
    }
}

export function ToolCallsDisplay({ toolCalls }: { toolCalls: ToolCallInfo[] }) {
    if (toolCalls.length === 0) return null;

    return (
        <div className="space-y-1 my-2">
            {toolCalls.map((call) => (
                <ToolCallItem key={call.toolCallId} call={call} />
            ))}
        </div>
    );
}
