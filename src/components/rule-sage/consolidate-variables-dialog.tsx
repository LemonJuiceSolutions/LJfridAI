

'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, GitMerge, PlusCircle, AlertTriangle, ArrowRight, X, Plus } from 'lucide-react';
import type { ConsolidationProposal, StoredTree, Variable, VariableOption, DecisionNode } from '@/lib/types';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';
import { Card, CardContent } from '../ui/card';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import _ from 'lodash';
import { cn } from '@/lib/utils';
import { nanoid } from 'nanoid';

interface ConsolidateVariablesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (approvedActions: { type: 'add' | 'merge', treeVarName: string, dbVarId?: string, finalName: string, finalOptions: VariableOption[] }[]) => void;
  tree: StoredTree;
  dbVariables: Variable[];
  isSaving: boolean;
}

type ProposalState = {
    checked: boolean;
    finalName: string;
    finalOptions: VariableOption[];
    newOption: Partial<VariableOption>;
}

// --- Levenshtein Distance for fuzzy matching ---
const levenshteinDistance = (a: string, b: string): number => {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));

    for (let i = 0; i <= a.length; i++) {
        matrix[0][i] = i;
    }
    for (let j = 0; j <= b.length; j++) {
        matrix[j][0] = j;
    }

    for (let j = 1; j <= b.length; j++) {
        for (let i = 1; i <= a.length; i++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[j][i] = Math.min(
                matrix[j][i - 1] + 1,          // Deletion
                matrix[j - 1][i] + 1,          // Insertion
                matrix[j - 1][i - 1] + cost  // Substitution
            );
        }
    }

    return matrix[b.length][a.length];
};


const UsedInBadges = ({ variable }: { variable?: Variable }) => {
    if (!variable?.usedIn || variable.usedIn.length === 0) {
        return <p className="text-xs text-muted-foreground italic mt-1">Non utilizzato in altri alberi.</p>;
    }
    return (
        <div className="flex flex-wrap gap-1 mt-1">
            {variable.usedIn.map(tree => (
                <Badge key={tree.id} variant="secondary">{tree.name}</Badge>
            ))}
        </div>
    )
}

const OptionsEditor = ({
  options,
  onRemoveOption,
  newOption,
  onNewOptionChange,
  onAddOption,
  isDisabled = false,
}: {
  options: VariableOption[];
  onRemoveOption: (index: number) => void;
  newOption: Partial<VariableOption>;
  onNewOptionChange: (field: keyof VariableOption, value: string | number) => void;
  onAddOption: () => void;
  isDisabled?: boolean;
}) => {
  return (
    <div className='space-y-2'>
        <div className="flex flex-wrap gap-2 p-2 border rounded-md min-h-[40px] bg-background">
            {options.map((opt, index) => (
                <Badge key={opt.id || index} variant="outline" className="flex items-center gap-1.5 font-mono">
                    <span>{opt.name} ({opt.abbreviation}, {opt.value})</span>
                    <button
                        onClick={() => onRemoveOption(index)}
                        disabled={isDisabled}
                        className="rounded-full hover:bg-destructive/20 disabled:hover:bg-transparent"
                    >
                        <X className="h-3 w-3" />
                    </button>
                </Badge>
            ))}
        </div>
         <div className="grid grid-cols-6 gap-2 items-end">
            <div className="col-span-3">
                 <Label htmlFor='new-opt-name' className='text-xs'>Nome</Label>
                <Input
                    id='new-opt-name'
                    value={newOption.name || ''}
                    onChange={(e) => onNewOptionChange('name', e.target.value)}
                    placeholder="Aggiungi opzione..."
                    disabled={isDisabled}
                />
            </div>
             <div className="col-span-1">
                <Label htmlFor='new-opt-value' className='text-xs'>Val.</Label>
                <Input
                    id='new-opt-value'
                    type="number"
                    value={newOption.value || 0}
                    onChange={(e) => onNewOptionChange('value', parseInt(e.target.value, 10))}
                    disabled={isDisabled}
                />
            </div>
             <div className="col-span-1">
                 <Label htmlFor='new-opt-abbr' className='text-xs'>Abbr.</Label>
                <Input
                    id='new-opt-abbr'
                    value={newOption.abbreviation || ''}
                    onChange={(e) => onNewOptionChange('abbreviation', e.target.value)}
                    maxLength={3}
                    disabled={isDisabled}
                />
            </div>
            <div className="col-span-1">
                <Button size="sm" variant="outline" onClick={onAddOption} disabled={isDisabled || !newOption.name?.trim()}>
                    <Plus className="h-4 w-4"/>
                </Button>
            </div>
        </div>
    </div>
  )
}

function traverseAndExtract(node: DecisionNode, extracted: Variable[]) {
    if (typeof node === 'object' && node !== null && node.question && node.options) {
      // Only extract if it hasn't been extracted before (avoids duplicates in recursive trees)
      if (!extracted.some(v => v.name === node.question)) {
        const options = Object.keys(node.options);
        const possibleValues: VariableOption[] = options.map((optName, index) => ({
          id: nanoid(8),
          name: optName,
          value: index,
          abbreviation: optName.substring(0, 3).toUpperCase(),
        }));
  
        // We push the variable even if it has no options, it might be an incomplete node
        extracted.push({
          id: node.variableId, // Will be undefined for non-standardized vars
          name: node.question,
          type: 'enumeration', // Assume enumeration for now
          possibleValues: possibleValues,
        });
      }
  
      // Recurse through children
      Object.values(node.options).forEach(childNode => {
        if (typeof childNode === 'object' && childNode !== null && !childNode.ref) {
          traverseAndExtract(childNode as DecisionNode, extracted);
        }
      });
    }
}


export default function ConsolidateVariablesDialog({
  isOpen,
  onClose,
  onConfirm,
  tree,
  dbVariables,
  isSaving,
}: ConsolidateVariablesDialogProps) {

  const [proposals, setProposals] = useState<ConsolidationProposal[]>([]);
  const [proposalStates, setProposalStates] = useState<Record<string, ProposalState>>({});

  useEffect(() => {
    if (isOpen && tree && dbVariables) {
        // 1. Extract all variables from the current tree's JSON
        const extractedVars: Variable[] = [];
        try {
            const jsonTree = JSON.parse(tree.jsonDecisionTree);
            traverseAndExtract(jsonTree, extractedVars);
        } catch(e) {
            console.error("Failed to parse tree for consolidation", e);
            onClose();
            return;
        }

        // 2. Filter out variables that are already standardized (i.e., have an ID)
        const nonStandardizedVars = extractedVars.filter(
            v => !v.id
        );

        // 3. Create proposals based on comparison
        const newProposals: ConsolidationProposal[] = [];
        const SIMILARITY_THRESHOLD = 0.6; // 60% similarity needed to propose a merge

        for (const treeVar of nonStandardizedVars) {
            let bestMatch: { variable: Variable, score: number } | null = null;
            
            for (const dbVar of dbVariables) {
                const distance = levenshteinDistance(
                    treeVar.name.trim().toLowerCase(), 
                    dbVar.name.trim().toLowerCase()
                );
                const longerLength = Math.max(treeVar.name.length, dbVar.name.length);
                const score = (longerLength - distance) / longerLength;

                if (score > (bestMatch?.score || 0)) {
                    bestMatch = { variable: dbVar, score: score };
                }
            }

            if (bestMatch && bestMatch.score >= SIMILARITY_THRESHOLD) {
                // Found a likely match, propose a merge
                newProposals.push({ type: 'merge', treeVariable: treeVar, dbVariable: bestMatch.variable });
            } else {
                // No match found, propose to add as new
                newProposals.push({ type: 'add', treeVariable: treeVar });
            }
        }
        setProposals(newProposals);
    }
  }, [isOpen, tree, dbVariables, onClose]);


  useEffect(() => {
    if (proposals.length > 0) {
        const initialStates: Record<string, ProposalState> = {};
        proposals.forEach(p => {
            if (!p.treeVariable?.name) return; 
            const treeVar = p.treeVariable;
            const dbVar = p.type === 'merge' ? p.dbVariable : null;
            
            const combinedOptions = _.uniqBy(
                _.filter(
                    [...(treeVar.possibleValues || []), ...(dbVar?.possibleValues || [])],
                    v => v && v.name
                ).map(v => ({...v, id: v.id || nanoid(8)})),
                'name'
            );

            initialStates[treeVar.name] = {
                checked: true,
                finalName: dbVar ? dbVar.name : treeVar.name,
                finalOptions: combinedOptions,
                newOption: { id: nanoid(8), name: '', value: combinedOptions.length, abbreviation: '' },
            }
        });
        setProposalStates(initialStates);
    }
  }, [proposals]);

  const handleStateChange = <K extends keyof ProposalState>(name: string, key: K, value: ProposalState[K]) => {
    setProposalStates(prev => ({
        ...prev,
        [name]: {
            ...prev[name],
            [key]: value
        }
    }));
  };
  
  const handleAddOption = (name: string) => {
    const state = proposalStates[name];
    if (state && state.newOption.name?.trim()) {
        const newOptionToAdd: VariableOption = {
          id: state.newOption.id || nanoid(8),
          name: state.newOption.name.trim(),
          value: state.newOption.value ?? state.finalOptions.length,
          abbreviation: state.newOption.abbreviation?.trim().toUpperCase() || state.newOption.name.trim().substring(0,3).toUpperCase(),
        };

        if (!state.finalOptions.some(v => v.name === newOptionToAdd.name)) {
            const newOptions = [...state.finalOptions, newOptionToAdd];
            handleStateChange(name, 'finalOptions', newOptions);
            handleStateChange(name, 'newOption', { id: nanoid(8), name: '', value: newOptions.length, abbreviation: '' });
        }
    }
  };

  const handleRemoveOption = (name: string, index: number) => {
     const state = proposalStates[name];
     if(state) {
        const newOptions = [...state.finalOptions];
        newOptions.splice(index, 1);
        handleStateChange(name, 'finalOptions', newOptions);
     }
  }


  const handleConfirmClick = () => {
    const approvedActions = proposals
      .filter(p => p.treeVariable && proposalStates[p.treeVariable.name]?.checked)
      .map(p => {
            const state = proposalStates[p.treeVariable.name];
            return {
                type: p.type,
                treeVarName: p.treeVariable.name,
                dbVarId: p.type === 'merge' && p.dbVariable ? p.dbVariable.id : undefined,
                finalName: state.finalName,
                finalOptions: state.finalOptions,
            };
      });
    onConfirm(approvedActions);
  };
  
  const numSelected = Object.values(proposalStates).filter(s => s.checked).length;

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Consolida e Standardizza Variabili</DialogTitle>
          <DialogDescription>
            Sono state trovate nuove variabili in questo albero. Standardizzale per renderle coerenti nel tuo database.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4 max-h-[60vh] overflow-y-auto pr-4">
            {proposals.length > 0 ? proposals.map((proposal, index) => {
                if (!proposal || !proposal.treeVariable) {
                    return null; // Prevent crash if is malformed
                }
                const state = proposalStates[proposal.treeVariable.name];
                if (!state) return null;

                const treeVar = proposal.treeVariable;

                return (
                     <div key={`${treeVar.name}-${index}`} className="flex items-start space-x-4">
                        <Checkbox
                            id={`check-${treeVar.name}`}
                            checked={state.checked}
                            onCheckedChange={(checked) => handleStateChange(treeVar.name, 'checked', !!checked)}
                            className="mt-3"
                            disabled={isSaving}
                        />
                        <div className="flex-1">
                            <Card className={cn(!state.checked ? 'bg-muted/50' : 'border-primary/50')}>
                                <CardContent className="p-4 space-y-4">
                                   {proposal.type === 'add' && (
                                       <div>
                                            <Badge variant="secondary"><PlusCircle className="mr-1.5 h-3 w-3"/>Nuova Variabile Standard</Badge>
                                            <p className="text-sm mt-2">Questa variabile non esiste nel database. Approvando, verrà aggiunta come nuova variabile standard.</p>
                                            <div className="mt-3 space-y-3 p-3 bg-background/50 rounded-lg border">
                                                 <Label>Nome Variabile Standard</Label>
                                                 <Input value={state.finalName} onChange={e => handleStateChange(treeVar.name, 'finalName', e.target.value)} disabled={!state.checked || isSaving} />
                                                 <Label>Opzioni</Label>
                                                 <OptionsEditor
                                                    options={state.finalOptions}
                                                    onRemoveOption={(i) => handleRemoveOption(treeVar.name, i)}
                                                    newOption={state.newOption}
                                                    onNewOptionChange={(field, value) => {
                                                        const newOpt = {...state.newOption, [field]: value};
                                                        handleStateChange(treeVar.name, 'newOption', newOpt);
                                                    }}
                                                    onAddOption={() => handleAddOption(treeVar.name)}
                                                    isDisabled={!state.checked || isSaving}
                                                 />
                                            </div>
                                       </div>
                                   )}
                                   {proposal.type === 'merge' && (
                                       <div>
                                            <Badge><GitMerge className="mr-1.5 h-3 w-3"/>Proposta di Fusione</Badge>
                                             <p className="text-sm mt-2">
                                                È stata trovata una variabile simile. Puoi fonderle, scegliendo un nome definitivo e unendo/modificando le opzioni.
                                            </p>
                                            <div className="flex items-center gap-4 mt-3">
                                                <div className="flex-1">
                                                    <Label>Variabile nell'Albero</Label>
                                                    <div className="p-3 border rounded-md bg-background h-full">
                                                        <p className="font-semibold">{treeVar.name}</p>
                                                        <div className="text-xs text-muted-foreground">
                                                            {(treeVar.possibleValues || []).map(v => v ? `(${v.name}, ${v.value}, ${v.abbreviation})` : '').join(', ')}
                                                        </div>
                                                    </div>
                                                </div>
                                                <ArrowRight className="h-5 w-5 text-muted-foreground shrink-0" />
                                                <div className="flex-1">
                                                     <Label>Simile nel Database</Label>
                                                     <div className="p-3 border rounded-md bg-background h-full">
                                                        {proposal.dbVariable ? (
                                                            <>
                                                                <p className="font-semibold">{proposal.dbVariable.name}</p>
                                                                <div className="text-xs text-muted-foreground">
                                                                     {(proposal.dbVariable.possibleValues || []).map(v => `(${v.name}, ${v.value}, ${v.abbreviation})`).join(', ')}
                                                                </div>
                                                                <UsedInBadges variable={proposal.dbVariable}/>
                                                            </>
                                                        ) : (
                                                            <p className="text-xs text-muted-foreground italic">Nessuna variabile simile trovata.</p>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                             <div className="mt-4 space-y-3 p-3 bg-background/50 rounded-lg border">
                                                 <Label>Risultato della Fusione (Preview Modificabile)</Label>
                                                  <div className='space-y-3'>
                                                    <Input value={state.finalName} onChange={e => handleStateChange(treeVar.name, 'finalName', e.target.value)} disabled={!state.checked || isSaving} placeholder="Nome definitivo"/>
                                                     <OptionsEditor
                                                        options={state.finalOptions}
                                                        onRemoveOption={(i) => handleRemoveOption(treeVar.name, i)}
                                                        newOption={state.newOption}
                                                        onNewOptionChange={(field, value) => {
                                                            const newOpt = {...state.newOption, [field]: value};
                                                            handleStateChange(treeVar.name, 'newOption', newOpt);
                                                        }}
                                                        onAddOption={() => handleAddOption(treeVar.name)}
                                                        isDisabled={!state.checked || isSaving}
                                                     />
                                                  </div>
                                            </div>
                                       </div>
                                   )}
                                </CardContent>
                            </Card>
                        </div>
                     </div>
                );
            }) : (
                 <div className="text-center py-8">
                    <AlertTriangle className="mx-auto h-10 w-10 text-muted-foreground" />
                    <p className="mt-4 text-muted-foreground">Nessuna proposta di consolidamento disponibile. L'albero è già sincronizzato.</p>
                </div>
            )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Annulla
          </Button>
          <Button onClick={handleConfirmClick} disabled={isSaving || numSelected === 0}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : `Applica ${numSelected} Azioni`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
