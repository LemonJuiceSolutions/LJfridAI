'use client';

import React, { useState } from 'react';
import { AgentChat } from '@/components/agents/agent-chat';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function TestAgentPage() {
  const [nodeId, setNodeId] = useState('test-node-1');
  const [sqlScript, setSqlScript] = useState(`SELECT 
  id,
  nome,
  cognome,
  email
FROM clienti
WHERE attivo = true`);
  const [pythonScript, setPythonScript] = useState(`import pandas as pd
import matplotlib.pyplot as plt

# Crea un grafico semplice
fig, ax = plt.subplots(figsize=(10, 6))
ax.plot(df['data'], df['valore'], marker='o')
ax.set_title('Grafico di Esempio')
ax.set_xlabel('Data')
ax.set_ylabel('Valore')

plt.tight_layout()
plt.show()`);

  const [tableSchema, setTableSchema] = useState<Record<string, string[]>>({
    clienti: ['id', 'nome', 'cognome', 'email', 'attivo', 'data_creazione'],
    vendite: ['id', 'cliente_id', 'importo', 'data_vendita', 'stato'],
  });

  const [inputTables, setInputTables] = useState<Record<string, any[]>>({
    clienti: [
      { id: 1, nome: 'Mario', cognome: 'Rossi', email: 'mario@example.com', attivo: true, data_creazione: '2024-01-15' },
      { id: 2, nome: 'Luca', cognome: 'Bianchi', email: 'luca@example.com', attivo: true, data_creazione: '2024-02-20' },
      { id: 3, nome: 'Giulia', cognome: 'Verdi', email: 'giulia@example.com', attivo: false, data_creazione: '2024-03-10' },
    ],
    vendite: [
      { id: 1, cliente_id: 1, importo: 1500, data_vendita: '2024-01-20', stato: 'completato' },
      { id: 2, cliente_id: 2, importo: 2300, data_vendita: '2024-02-25', stato: 'completato' },
    ],
  });

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Test AI Agent</h1>
        <p className="text-muted-foreground">
          Pagina di test per verificare il funzionamento degli agenti SQL e Python.
        </p>
      </div>

      {/* Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Configurazione</CardTitle>
          <CardDescription>
            Modifica lo script e i dati di test per verificare il comportamento dell'agente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Node ID</label>
            <input
              type="text"
              value={nodeId}
              onChange={(e) => setNodeId(e.target.value)}
              className="w-full px-3 py-2 border rounded-md"
            />
          </div>
        </CardContent>
      </Card>

      {/* SQL Agent Test */}
      <Card>
        <CardHeader>
          <CardTitle>Agente SQL</CardTitle>
          <CardDescription>
            Testa l'agente SQL con query e tabelle di esempio.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Script SQL Corrente</label>
            <Textarea
              value={sqlScript}
              onChange={(e) => setSqlScript(e.target.value)}
              className="font-mono text-sm"
              rows={8}
            />
          </div>
          <div className="h-[400px]">
            <AgentChat
              nodeId={nodeId}
              agentType="sql"
              script={sqlScript}
              tableSchema={tableSchema}
              inputTables={inputTables}
              onScriptUpdate={setSqlScript}
            />
          </div>
        </CardContent>
      </Card>

      {/* Python Agent Test */}
      <Card>
        <CardHeader>
          <CardTitle>Agente Python</CardTitle>
          <CardDescription>
            Testa l'agente Python con script e tabelle di esempio.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Script Python Corrente</label>
            <Textarea
              value={pythonScript}
              onChange={(e) => setPythonScript(e.target.value)}
              className="font-mono text-sm"
              rows={12}
            />
          </div>
          <div className="h-[400px]">
            <AgentChat
              nodeId={`${nodeId}-python`}
              agentType="python"
              script={pythonScript}
              tableSchema={tableSchema}
              inputTables={inputTables}
              onScriptUpdate={setPythonScript}
            />
          </div>
        </CardContent>
      </Card>

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>Istruzioni di Test</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>1. <strong>Test di chiarimento:</strong> Scrivi "aggiungimi dello spazio a destra" e verifica che l'agente chieda chiarimenti.</p>
          <p>2. <strong>Test di modifica:</strong> Fornisci dettagli specifici e verifica che l'agente aggiorni lo script.</p>
          <p>3. <strong>Test di persistenza:</strong> Ricarica la pagina e verifica che la cronologia delle conversazioni venga caricata.</p>
          <p>4. <strong>Test di contesto:</strong> Scrivi "mostrami i clienti attivi" e verifica che l'agente capisca le colonne disponibili.</p>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button
          onClick={() => {
            setNodeId('test-node-' + Date.now());
          }}
          variant="outline"
        >
          Nuovo Test
        </Button>
        <Button
          onClick={() => {
            localStorage.clear();
            window.location.reload();
          }}
          variant="destructive"
        >
          Reset Tutto
        </Button>
      </div>
    </div>
  );
}
