

'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { Variable, VariableOption } from "@/lib/types";
import { Button } from "../ui/button";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { Input } from "../ui/input";

interface VariablesTableProps {
  variables: Variable[];
  onDelete?: (variable: Variable) => void;
  onDeleteAll?: () => void;
}

const typeColorMap: { [key in Variable['type']]: 'default' | 'secondary' | 'outline' } = {
    'boolean': 'default',
    'enumeration': 'secondary',
    'numeric': 'outline',
    'text': 'default'
};


export default function VariablesTable({ variables, onDelete, onDeleteAll }: VariablesTableProps) {

  if (!variables || variables.length === 0) {
    return <p className="text-sm text-muted-foreground">Nessuna variabile è stata estratta per questo albero.</p>;
  }

  const canDelete = onDelete && onDeleteAll;

  return (
    <>
      {canDelete && (
        <div className="flex justify-end mb-4">
            <Button variant="outline" size="sm" onClick={onDeleteAll}>
                <Trash2 className="mr-2 h-4 w-4" />
                Elimina Tutte le Variabili Locali
            </Button>
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome Variabile</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Valori Possibili</TableHead>
            {canDelete && <TableHead className="text-right">Azioni</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {variables.map((variable) => (
            <TableRow key={variable.name}>
              <TableCell className="font-medium">{variable.name}</TableCell>
              <TableCell>
                <Badge variant={typeColorMap[variable.type] || 'default'}>{variable.type}</Badge>
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-2">
                {(variable.possibleValues || []).map((value, index) =>
                    <Badge key={index} variant="outline" className="font-mono">
                        {value.name} ({value.abbreviation}, {value.value})
                    </Badge>
                )}
                </div>
              </TableCell>
               {canDelete && (
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => onDelete(variable)} className="h-8 w-8 text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}
