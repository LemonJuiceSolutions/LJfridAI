
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { StoredTree, Variable } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import CodeBlock from "./code-block";
import InteractiveGuide from "./interactive-guide";
import VisualTree from "./visual-tree";

interface ResultsDisplayProps {
  result: StoredTree;
  onDataRefresh?: () => void;
  isSaving?: boolean;
}

export default function ResultsDisplay({ result, onDataRefresh, isSaving = false }: ResultsDisplayProps) {

  return (
    <Tabs defaultValue="visual" className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="visual">Albero Visuale</TabsTrigger>
        <TabsTrigger value="guide">Guida Interattiva</TabsTrigger>
        <TabsTrigger value="json">JSON</TabsTrigger>
      </TabsList>
      
      <TabsContent value="visual" className="mt-4">
        <VisualTree 
            treeData={result} 
            onDataRefresh={onDataRefresh}
            isSaving={isSaving} 
        />
      </TabsContent>
      <TabsContent value="guide" className="mt-4">
        <InteractiveGuide jsonTree={result.jsonDecisionTree} treeId={result.id} />
      </TabsContent>
      <TabsContent value="json" className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle>Albero Decisionale (JSON)</CardTitle>
            <CardDescription>
              Una rappresentazione JSON strutturata dell'albero decisionale per l'interpretazione automatica.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CodeBlock code={result.jsonDecisionTree} />
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}

    
