'use client';

import React, { useEffect, useState, useRef, useCallback, memo } from 'react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronRight, ChevronDown } from 'lucide-react';

// ---------------------------------------------------------------------------
// MemoizedChatInput
// ---------------------------------------------------------------------------
export const MemoizedChatInput = memo(function MemoizedChatInput({
  placeholder,
  onSubmit,
  disabled,
  buttonText,
  buttonClassName,
}: {
  placeholder: string;
  onSubmit: (value: string) => void;
  disabled: boolean;
  buttonText: string;
  buttonClassName?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (inputRef.current?.value) {
          onSubmit(inputRef.current.value);
          inputRef.current.value = '';
        }
      }
    },
    [onSubmit],
  );

  const handleClick = useCallback(() => {
    if (inputRef.current?.value) {
      onSubmit(inputRef.current.value);
      inputRef.current.value = '';
    }
  }, [onSubmit]);

  return (
    <div className="p-2 border-t bg-background flex gap-2">
      <input
        ref={inputRef}
        placeholder={placeholder}
        className="flex-1 border-0 focus-visible:ring-0 shadow-none bg-transparent h-9 px-3 text-sm outline-none"
        onKeyDown={handleKeyDown}
        disabled={disabled}
      />
      <Button
        size="sm"
        className={`gap-2 rounded-lg ${buttonClassName || ''}`}
        disabled={disabled}
        onClick={handleClick}
      >
        {buttonText}
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
});

// ---------------------------------------------------------------------------
// CollapsibleSection
// ---------------------------------------------------------------------------
export const CollapsibleSection = ({
  title,
  count = 0,
  storageKey,
  children,
  icon: Icon,
}: {
  title: string;
  count?: number;
  storageKey: string;
  children: React.ReactNode;
  icon?: any;
}) => {
  // Default to open if has items, closed if empty — UNLESS a user preference is saved
  const [isOpen, setIsOpen] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    const loadState = () => {
      try {
        const savedState = localStorage.getItem(storageKey);
        if (savedState !== null) {
          setIsOpen(savedState === 'true');
        } else {
          // Default rule: open if has items, closed otherwise
          setIsOpen(count > 0);
        }
      } catch (e) {
        // Fallback to default if localStorage fails
        console.warn('[CollapsibleSection] Failed to load state from localStorage:', e);
        setIsOpen(count > 0);
      }
    };

    loadState();
    setHasLoaded(true);

    // Listen for storage events (from collapse/expand all buttons)
    const handleStorage = () => loadState();
    window.addEventListener('storage', handleStorage);

    return () => window.removeEventListener('storage', handleStorage);
  }, [storageKey, count]);

  const toggle = () => {
    const newState = !isOpen;
    setIsOpen(newState);
    localStorage.setItem(storageKey, String(newState));
  };

  if (!hasLoaded) return null; // Avoid hydration mismatch or flash

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={toggle}
      className="border border-purple-500/40 rounded-lg overflow-hidden bg-white dark:bg-zinc-900/50"
    >
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          className="w-full flex items-center justify-between p-3 h-auto hover:bg-muted/50 rounded-none"
        >
          <div className="flex items-center gap-2">
            {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
            <span className="font-medium text-sm">{title}</span>
            {count > 0 && (
              <span className="bg-primary/10 text-primary text-[10px] px-2 py-0.5 rounded-full font-semibold">
                {count}
              </span>
            )}
          </div>
          {isOpen ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="p-3 pt-0 border-t border-border/50 bg-muted/10">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
};

// ---------------------------------------------------------------------------
// Helper functions for AgentChat integration
// ---------------------------------------------------------------------------
export const getTableSchema = (
  selectedPipelines: string[],
  availableInputTables: any[],
): Record<string, string[]> => {
  const schema: Record<string, string[]> = {};

  selectedPipelines.forEach((pipelineName) => {
    const table = availableInputTables.find((t) => t.name === pipelineName);
    if (!table) return;

    if (table.data && Array.isArray(table.data) && table.data.length > 0) {
      schema[table.name] = Object.keys(table.data[0]);
    } else if (table.sqlQuery) {
      const cols = extractColumnsFromQuery(table.sqlQuery);
      if (cols.length > 0) {
        schema[table.name] = cols;
      }
    }

    if (table.pipelineDependencies) {
      table.pipelineDependencies.forEach((dep: any) => {
        if (dep.query) {
          const columns = extractColumnsFromQuery(dep.query);
          if (columns.length > 0) {
            schema[dep.tableName || pipelineName] = columns;
          }
        }
      });
    }
  });

  return schema;
};

export const getInputTables = (
  selectedPipelines: string[],
  availableInputTables: any[],
): Record<string, any[]> => {
  const tables: Record<string, any[]> = {};

  selectedPipelines.forEach((pipelineName) => {
    const table = availableInputTables.find((t) => t.name === pipelineName);
    if (!table) return;

    if (table.data && Array.isArray(table.data)) {
      tables[table.name] = table.data;
    }
  });

  return tables;
};

export const getNodeQueries = (
  availableInputTables: any[],
): Record<string, { query: string; isPython: boolean; connectorId?: string }> => {
  const queries: Record<string, { query: string; isPython: boolean; connectorId?: string }> = {};
  availableInputTables.forEach((table) => {
    if (table.isPython && table.pythonCode) {
      queries[table.name] = { query: table.pythonCode, isPython: true, connectorId: table.connectorId };
    } else if (table.sqlQuery) {
      queries[table.name] = { query: table.sqlQuery, isPython: false, connectorId: table.connectorId };
    }
  });
  return queries;
};

export const extractColumnsFromQuery = (query: string): string[] => {
  // Simple regex to extract column names from SELECT clause
  const selectMatch = query.match(/SELECT\s+(.+?)\s+FROM/i);
  if (selectMatch) {
    return selectMatch[1]
      .split(',')
      .map((col) => col.trim().split(/\s+as\s+/i)[0].trim())
      .filter((col) => col !== '*');
  }
  return [];
};
