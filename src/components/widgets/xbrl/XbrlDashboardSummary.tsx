'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw, Loader2, FileSpreadsheet, GitBranch } from 'lucide-react';
import { useXbrlData } from '@/hooks/use-xbrl-data';
import { analysisTree } from '@/lib/xbrl-analysis-tree';
import { createXbrlAnalysisTreeAction } from '@/actions/xbrl';
import type { AnalysisRating } from '@/lib/xbrl-parser';

const ratingColor: Record<AnalysisRating, string> = {
  'Eccellente': 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30',
  'Positivo': 'bg-green-500/15 text-green-700 border-green-500/30',
  'Nella Media': 'bg-yellow-500/15 text-yellow-700 border-yellow-500/30',
  'Negativo': 'bg-orange-500/15 text-orange-700 border-orange-500/30',
  'Critico': 'bg-red-500/15 text-red-700 border-red-500/30',
};

export default function XbrlDashboardSummary() {
  const { data, ratios, isLoading, error, refreshData, invalidateCache } = useXbrlData();
  const [creatingTree, setCreatingTree] = useState(false);
  const router = useRouter();

  const handleRefresh = async () => {
    invalidateCache();
    await refreshData();
  };

  const [treeError, setTreeError] = useState<string | null>(null);

  const handleCreateTree = async () => {
    setCreatingTree(true);
    setTreeError(null);
    try {
      const result = await createXbrlAnalysisTreeAction();
      if (result.error) {
        setTreeError(result.error);
        console.error('Errore creazione albero XBRL:', result.error);
        return;
      }
      if (result.success && result.treeId) {
        router.push(`/view/${result.treeId}`);
      }
    } catch (e) {
      const msg = String(e);
      setTreeError(msg);
      console.error('Errore creazione albero XBRL:', msg);
    } finally {
      setCreatingTree(false);
    }
  };

  if (isLoading) {
    return (
      <Card className="h-full flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Analisi XBRL in corso...</span>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              Analisi Finanziaria XBRL
            </CardTitle>
            <Button variant="ghost" size="icon" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!data || ratios.length === 0) {
    return (
      <Card className="h-full flex items-center justify-center p-4">
        <p className="text-sm text-muted-foreground">Carica file .xbrl dalla pagina Impostazioni</p>
      </Card>
    );
  }

  const yearsStr = data.years.map(y => y.year).join(', ');

  return (
    <Card className="h-full overflow-auto">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            {data.entity.name}
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCreateTree}
              disabled={creatingTree}
              className="text-xs gap-1.5"
            >
              {creatingTree ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitBranch className="h-3.5 w-3.5" />}
              Crea Albero Regole
            </Button>
            <Button variant="ghost" size="icon" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          P.IVA: {data.entity.partitaIva} | Anni analizzati: {yearsStr} | {data.entity.dipendenti} dipendenti
        </p>
        {treeError && (
          <p className="text-xs text-destructive mt-1">{treeError}</p>
        )}
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {analysisTree.map(node => {
            const result = node.evaluate(ratios, data);
            return (
              <div
                key={node.id}
                className="flex flex-col gap-1 rounded-lg border p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{node.label}</span>
                  <Badge variant="outline" className={ratingColor[result.rating]}>
                    {result.rating}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{result.description}</p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
