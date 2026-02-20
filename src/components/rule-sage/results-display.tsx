
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { StoredTree, Variable } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import CodeBlock from "./code-block";
import InteractiveGuide from "./interactive-guide";
import VisualTree from "./visual-tree";
import { Button } from "../ui/button";
import { RefreshCw, Loader2 } from "lucide-react";

interface ResultsDisplayProps {
  result: StoredTree;
  onDataRefresh?: (freshData?: StoredTree) => void;
  isSaving?: boolean;
  // Props for Description tab
  descriptionContent?: string;
  isRegenerating?: boolean;
  onRegenerate?: () => void;
  initialNodePath?: string;
}

// Helper to render text with [[node:...]] markers highlighted in purple
const renderHighlightedText = (text: string) => {
  if (!text) return null;
  const parts = text.split(/(\[\[node:.*?\]\])/g);
  return parts.map((part, index) => {
    const match = part.match(/\[\[node:(.*?)\]\]/);
    if (match) {
      return <span key={index} className="text-primary font-medium">{match[1]}</span>;
    }
    return <span key={index}>{part}</span>;
  });
};

export default function ResultsDisplay({
  result,
  onDataRefresh,
  isSaving = false,
  descriptionContent,
  isRegenerating = false,
  onRegenerate,
  initialNodePath
}: ResultsDisplayProps) {

  return (
    <Tabs defaultValue="visual" className="w-full">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="visual">Regola Visuale</TabsTrigger>
        <TabsTrigger value="guide">Guida Interattiva</TabsTrigger>
        <TabsTrigger value="json">JSON</TabsTrigger>
        <TabsTrigger value="description">Descrizione</TabsTrigger>
      </TabsList>

      <TabsContent value="visual" className="mt-4">
        <VisualTree
          treeData={result}
          onDataRefresh={onDataRefresh}
          isSaving={isSaving}
          initialNodePath={initialNodePath}
        />
      </TabsContent>
      <TabsContent value="guide" className="mt-4">
        <InteractiveGuide jsonTree={result.jsonDecisionTree} treeId={result.id} />
      </TabsContent>
      <TabsContent value="json" className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle>Regola Decisionale (JSON)</CardTitle>
            <CardDescription>
              Una rappresentazione JSON strutturata della regola decisionale per l'interpretazione automatica.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CodeBlock code={result.jsonDecisionTree} />
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="description" className="mt-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex justify-between items-center">
              <CardTitle className="text-lg">Descrizione Processo</CardTitle>
              {onRegenerate && (
                <Button size="sm" variant="outline" onClick={onRegenerate} disabled={isRegenerating || isSaving}>
                  {isRegenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Rigenera
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {renderHighlightedText(descriptionContent || result.naturalLanguageDecisionTree || result.description || '')}
            </p>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}


