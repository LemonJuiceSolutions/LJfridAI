
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Check, Copy, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface CodeBlockProps {
  code: string;
}

export default function CodeBlock({ code }: CodeBlockProps) {
  const [hasCopied, setHasCopied] = useState(false);
  const { toast } = useToast();

  const formattedCode = JSON.stringify(JSON.parse(code), null, 2);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(formattedCode).then(
      () => {
        setHasCopied(true);
        setTimeout(() => setHasCopied(false), 2000);
        toast({ title: 'Copiato negli appunti!' });
      },
      (err) => {
        toast({
          variant: 'destructive',
          title: 'Copia fallita',
          description: 'Impossibile copiare il testo negli appunti.',
        });
      }
    );
  };

  const downloadJson = () => {
    try {
      const blob = new Blob([formattedCode], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'albero-decisionale.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: 'Download del file JSON avviato.' });
    } catch (err) {
      toast({
          variant: 'destructive',
          title: 'Download fallito',
          description: 'Impossibile preparare il file JSON per il download.',
        });
    }
  };


  return (
    <div className="relative">
      <div className="absolute right-2 top-2 flex gap-2">
         <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={downloadJson}
            title="Scarica JSON"
          >
            <Download className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={copyToClipboard}
            title="Copia negli Appunti"
          >
            {hasCopied ? <Check className="h-4 w-4 text-accent" /> : <Copy className="h-4 w-4" />}
          </Button>
      </div>
      <pre className="w-full overflow-x-auto rounded-md border bg-muted/50 p-4 text-sm">
        <code>{formattedCode}</code>
      </pre>
    </div>
  );
}
