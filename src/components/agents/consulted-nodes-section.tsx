'use client';

import React, { useState } from 'react';
import { Search, ChevronUp, ChevronDown, Database, Code2, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ConsultedNode } from '@/lib/types';

export function ConsultedNodesSection({ nodes }: { nodes: ConsultedNode[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const solutionNode = nodes.find(n => n.wasSolutionSource);

  return (
    <div className="my-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full px-3 py-1.5 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-950/50 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-1.5 flex-wrap">
          <Search className="h-3 w-3 text-blue-600 dark:text-blue-400 flex-shrink-0" />
          <span className="text-[11px] font-medium text-blue-700 dark:text-blue-300">
            {nodes.length} nodo/i consultato/i
          </span>
          {solutionNode && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 font-medium">
              Soluzione: {solutionNode.name}
            </span>
          )}
        </div>
        {isOpen ? (
          <ChevronUp className="h-3 w-3 text-blue-500 flex-shrink-0" />
        ) : (
          <ChevronDown className="h-3 w-3 text-blue-500 flex-shrink-0" />
        )}
      </button>

      {isOpen && (
        <div className="mt-1 px-3 py-2 rounded-b-lg border border-t-0 border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 animate-in slide-in-from-top-1 duration-150">
          <div className="space-y-1">
            {nodes.map((node, idx) => {
              const TypeIcon = node.type === 'sql' ? Database : node.type === 'python' ? Code2 : Layers;
              const iconColor = node.type === 'sql' ? 'text-blue-600' : node.type === 'python' ? 'text-green-600' : 'text-purple-600';
              const iconBg = node.type === 'sql' ? 'bg-blue-100 dark:bg-blue-900/40' : node.type === 'python' ? 'bg-green-100 dark:bg-green-900/40' : 'bg-purple-100 dark:bg-purple-900/40';

              return (
                <div key={idx} className="flex items-center gap-2 text-[11px]">
                  <div className={cn('h-4 w-4 rounded flex items-center justify-center flex-shrink-0', iconBg)}>
                    <TypeIcon className={cn('h-2.5 w-2.5', iconColor)} />
                  </div>
                  <span className="text-muted-foreground truncate">{node.source}</span>
                  <span className="font-medium truncate">{node.name}</span>
                  {node.sameConnector && (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-primary/10 text-primary flex-shrink-0">stesso DB</span>
                  )}
                  {node.wasSolutionSource && (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-green-500/20 text-green-700 dark:text-green-400 font-semibold flex-shrink-0">SOLUZIONE</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
