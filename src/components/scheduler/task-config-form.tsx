/**
 * Task Config Form Component
 * 
 * Form for configuring task-specific parameters
 */

'use client';

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface TaskConfigFormProps {
  taskType: string;
  config: any;
  onChange: (config: any) => void;
}

export function TaskConfigForm({ taskType, config, onChange }: TaskConfigFormProps) {
  const updateConfig = (key: string, value: any) => {
    onChange({
      ...config,
      [key]: value
    });
  };

  return (
    <div className="space-y-4">
      {taskType === 'EMAIL_PREVIEW' || taskType === 'EMAIL_SEND' ? (
        <EmailConfigForm config={config} onChange={updateConfig} />
      ) : taskType === 'SQL_PREVIEW' || taskType === 'SQL_EXECUTE' ? (
        <SqlConfigForm config={config} onChange={updateConfig} />
      ) : taskType === 'DATA_SYNC' ? (
        <DataSyncConfigForm config={config} onChange={updateConfig} />
      ) : taskType === 'CUSTOM' ? (
        <CustomConfigForm config={config} onChange={updateConfig} />
      ) : null}
    </div>
  );
}

// ============================================
// Email Config Form
// ============================================

function EmailConfigForm({ config, onChange }: { config: any; onChange: (key: string, value: any) => void }) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email-connector">Connector Email *</Label>
        <Input
          id="email-connector"
          value={config.connectorId || ''}
          onChange={(e) => onChange('connectorId', e.target.value)}
          placeholder="ID del connector email"
        />
        <p className="text-sm text-muted-foreground">
          Seleziona il connector SMTP da utilizzare per inviare l'email
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email-to">Destinatario *</Label>
        <Input
          id="email-to"
          value={config.to || ''}
          onChange={(e) => onChange('to', e.target.value)}
          placeholder="recipient@example.com"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email-subject">Oggetto *</Label>
        <Input
          id="email-subject"
          value={config.subject || ''}
          onChange={(e) => onChange('subject', e.target.value)}
          placeholder="Oggetto dell'email"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email-body">Corpo Email *</Label>
        <Textarea
          id="email-body"
          value={config.body || ''}
          onChange={(e) => onChange('body', e.target.value)}
          placeholder="Contenuto dell'email..."
          rows={6}
        />
      </div>
    </div>
  );
}

// ============================================
// SQL Config Form
// ============================================

function SqlConfigForm({ config, onChange }: { config: any; onChange: (key: string, value: any) => void }) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="sql-connector">Connector Database *</Label>
        <Input
          id="sql-connector"
          value={config.connectorIdSql || ''}
          onChange={(e) => onChange('connectorIdSql', e.target.value)}
          placeholder="ID del connector database"
        />
        <p className="text-sm text-muted-foreground">
          Seleziona il connector del database su cui eseguire la query
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="sql-query">Query SQL *</Label>
        <Textarea
          id="sql-query"
          value={config.query || ''}
          onChange={(e) => onChange('query', e.target.value)}
          placeholder="SELECT * FROM table WHERE condition..."
          rows={8}
          className="font-mono text-sm"
        />
        <p className="text-sm text-muted-foreground">
          {config.query?.toUpperCase()?.startsWith('SELECT') 
            ? 'Query in modalità SELECT (sola lettura)'
            : '⚠️ Query in modalità scrittura - verranno apportate modifiche al database'}
        </p>
      </div>
    </div>
  );
}

// ============================================
// Data Sync Config Form
// ============================================

function DataSyncConfigForm({ config, onChange }: { config: any; onChange: (key: string, value: any) => void }) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="sync-source">Connector Sorgente *</Label>
        <Input
          id="sync-source"
          value={config.sourceConnectorId || ''}
          onChange={(e) => onChange('sourceConnectorId', e.target.value)}
          placeholder="ID del connector sorgente"
        />
        <p className="text-sm text-muted-foreground">
          Database o API da cui recuperare i dati
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="sync-target">Connector Destinazione *</Label>
        <Input
          id="sync-target"
          value={config.targetConnectorId || ''}
          onChange={(e) => onChange('targetConnectorId', e.target.value)}
          placeholder="ID del connector destinazione"
        />
        <p className="text-sm text-muted-foreground">
          Database o API su cui scrivere i dati
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="sync-query">Query di Sincronizzazione *</Label>
        <Textarea
          id="sync-query"
          value={config.syncQuery || ''}
          onChange={(e) => onChange('syncQuery', e.target.value)}
          placeholder="SELECT * FROM source_table WHERE sync_condition..."
          rows={6}
          className="font-mono text-sm"
        />
        <p className="text-sm text-muted-foreground">
          Query per recuperare i dati dal connettore sorgente
        </p>
      </div>
    </div>
  );
}

// ============================================
// Custom Config Form
// ============================================

function CustomConfigForm({ config, onChange }: { config: any; onChange: (key: string, value: any) => void }) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="custom-action">Azione Personalizzata *</Label>
        <Input
          id="custom-action"
          value={config.customAction || ''}
          onChange={(e) => onChange('customAction', e.target.value)}
          placeholder="Nome dell'azione personalizzata"
        />
        <p className="text-sm text-muted-foreground">
          Specifica l'azione personalizzata da eseguire
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Parametri Aggiuntivi</CardTitle>
          <CardDescription>
            Configura parametri aggiuntivi per l'azione personalizzata (formato JSON)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={config.customParams ? JSON.stringify(config.customParams, null, 2) : '{}'}
            onChange={(e) => {
              try {
                const parsed = JSON.parse(e.target.value);
                onChange('customParams', parsed);
              } catch {
                // Invalid JSON, don't update
              }
            }}
            placeholder='{\n  "param1": "value1",\n  "param2": "value2"\n}'
            rows={8}
            className="font-mono text-sm"
          />
          <p className="text-sm text-muted-foreground mt-2">
            Inserisci i parametri in formato JSON valido
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
