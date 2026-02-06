# Pipeline Buttons e Scheduler nei Nodi

Documentazione completa dei button che scatenano aggiornamenti pipeline e dei relativi scheduler che possono eseguire le stesse funzioni in modo schedulato.

## Indice

1. [Overview](#overview)
2. [Mapping Completo Button-Scheduler](#mapping-completo-button-scheduler)
3. [Dettagli per Tipo di Nodo](#dettagli-per-tipo-di-nodo)
4. [Tipi di Task](#tipi-di-task)
5. [Configurazione Scheduler](#configurazione-scheduler)

---

## Overview

Ogni nodo nel sistema ha **button di esecuzione manuale** e un **componente NodeScheduler** che permette di schedulare la stessa esecuzione automaticamente.

### Flusso di Esecuzione

```
┌─────────────────────────────────────────────────────────────┐
│                    NODO (Decision Tree)                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐         ┌─────────────────┐          │
│  │   BUTTON        │         │   SCHEDULER     │          │
│  │   (Manuale)     │         │   (Automatico)  │          │
│  └────────┬────────┘         └────────┬────────┘          │
│           │                           │                    │
│           ▼                           ▼                    │
│  ┌─────────────────────────────────────────────┐           │
│  │     executeFullPipeline() /                │           │
│  │     executeTriggerAction()                │           │
│  └─────────────────────────────────────────────┘           │
│                         │                                  │
│                         ▼                                  │
│  ┌─────────────────────────────────────────────┐           │
│  │     AZIONE (Preview/Export/Email/Trigger)  │           │
│  └─────────────────────────────────────────────┘           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Mapping Completo Button-Scheduler

| # | Button (Manuale) | Scheduler (Automatico) | Tipo Task | Funzione Eseguita | Output |
|---|------------------|----------------------|-----------|-------------------|--------|
| 1 | **Esegui Anteprima** (SQL) | **NodeScheduler** (SQL) | `SQL_EXECUTE` | `executeFullPipeline('preview')` | Tabella preview |
| 2 | **Esegui Anteprima** (Python) | **NodeScheduler** (Python) | `PYTHON_EXECUTE` | `executeFullPipeline('preview')` | Tabella/Variabile/Grafico |
| 3 | **Salva in Database** | *(Nessuno)* | `EXPORT_TABLE` | `executeFullPipeline('export')` | Tabella nel DB |
| 4 | **Invia Email di Test** | **NodeScheduler** (Email) | `EMAIL_SEND` | `executeFullPipeline('email')` | Email con allegati |
| 5 | **Invia Email** | **NodeScheduler** (Email) | `EMAIL_SEND` | `executeFullPipeline('email')` | Email con allegati |
| 6 | **Esegui Trigger** | *(Nessuno)* | `TRIGGER_EXECUTE` | `executeTriggerAction()` | Esecuzione nodi |

---

## Dettagli per Tipo di Nodo

### 1. NODO SQL

#### Button: Esegui Anteprima (SQL)
- **File**: [`edit-node-dialog.tsx`](src/components/rule-sage/edit-node-dialog.tsx:2032)
- **Linea**: 2032-2081
- **Funzione**: `executeFullPipeline('preview', ...)`
- **Configurazione**:
  ```typescript
  taskConfigProvider: () => ({
    query: sqlQuery,
    connectorIdSql: sqlConnectorId,
    selectedPipelines,
    // ... altre opzioni
  })
  ```

#### Scheduler: NodeScheduler (SQL)
- **File**: [`edit-node-dialog.tsx`](src/components/rule-sage/edit-node-dialog.tsx:2083)
- **Linea**: 2083-2090
- **Tipo**: `nodeType="sql"`
- **Task Type**: `SQL_EXECUTE`
- **Configurazione**:
  ```typescript
  <NodeScheduler
    treeId={treeId}
    nodeId={(initialNode as any).id}
    nodePath={nodePath}
    nodeType="sql"
    taskConfigProvider={() => ({
      query: sqlQuery,
      connectorIdSql: sqlConnectorId,
      selectedPipelines,
      // ... altre opzioni
    })}
  />
  ```

---

### 2. NODO PYTHON

#### Button: Esegui Anteprima (Python)
- **File**: [`edit-node-dialog.tsx`](src/components/rule-sage/edit-node-dialog.tsx:2339)
- **Linea**: 2339-2406
- **Funzione**: `executeFullPipeline('preview', ...)`
- **Configurazione**:
  ```typescript
  taskConfigProvider: () => ({
    code: pythonCode,
    outputType: pythonOutputType, // 'table' | 'variable' | 'chart'
    pythonSelectedPipelines,
    pythonConnectorId,
    // ... altre opzioni
  })
  ```

#### Scheduler: NodeScheduler (Python)
- **File**: [`edit-node-dialog.tsx`](src/components/rule-sage/edit-node-dialog.tsx:2408)
- **Linea**: 2408-2410
- **Tipo**: `nodeType="python"`
- **Task Type**: `PYTHON_EXECUTE`
- **Configurazione**:
  ```typescript
  <NodeScheduler
    treeId={treeId}
    nodeId={(initialNode as any).id}
    nodePath={nodePath}
    nodeType="python"
    taskConfigProvider={() => ({
      code: pythonCode,
      outputType: pythonOutputType,
      pythonSelectedPipelines,
      pythonConnectorId,
      // ... altre opzioni
    })}
  />
  ```

---

### 3. NODO EMAIL

#### Button: Invia Email di Test
- **File**: [`edit-node-dialog.tsx`](src/components/rule-sage/edit-node-dialog.tsx:3514)
- **Linea**: 3514-3775
- **Funzione**: `executeFullPipeline('email', ...)`
- **Configurazione**:
  ```typescript
  taskConfigProvider: () => ({
    connectorId: emailConfig.connectorId,
    to: emailConfig.to,
    cc: emailConfig.cc,
    bcc: emailConfig.bcc,
    subject: emailConfig.subject,
    bodyHtml: emailConfig.body,
    selectedTables, // Tabelle SQL selezionate
    selectedPythonOutputs, // Output Python selezionati
    availableMedia, // Media disponibili
    availableLinks, // Link disponibili
    availableTriggers, // Trigger disponibili
    mediaAttachments, // Allegati media
    // ... altre opzioni
  })
  ```

#### Scheduler: NodeScheduler (Email)
- **File**: [`edit-node-dialog.tsx`](src/components/rule-sage/edit-node-dialog.tsx:3777)
- **Linea**: 3777-3780
- **Tipo**: `nodeType="email"`
- **Task Type**: `EMAIL_SEND`
- **Configurazione**:
  ```typescript
  <NodeScheduler
    treeId={treeId}
    nodeId={(initialNode as any).id}
    nodePath={nodePath}
    nodeType="email"
    taskConfigProvider={() => ({
      connectorId: emailConfig.connectorId,
      to: emailConfig.to,
      cc: emailConfig.cc,
      bcc: emailConfig.bcc,
      subject: emailConfig.subject,
      bodyHtml: emailConfig.body,
      selectedTables,
      selectedPythonOutputs,
      availableMedia,
      availableLinks,
      availableTriggers,
      mediaAttachments,
      // ... altre opzioni
    })}
  />
  ```

---

### 4. NODO TRIGGER

#### Button: Esegui Trigger
- **File**: [`edit-node-dialog.tsx`](src/components/rule-sage/edit-node-dialog.tsx:1867)
- **Linea**: 1867-1869
- **Funzione**: `executeTriggerAction(treeId, nodeId, trigger)`
- **Configurazione**:
  ```typescript
  const handleExecuteTrigger = async (trigger: TriggerItem) => {
    setInternalSaving(true);
    const result = await executeTriggerAction(treeId, (initialNode as any).id, trigger);
    if (result.success) {
      // ... gestisci successo
    }
    setInternalSaving(false);
  };
  ```

#### Scheduler: *(Nessuno)*
- I trigger non hanno scheduler dedicato
- Vengono eseguiti solo manualmente tramite button

---

### 5. NODO EXPORT (SQL Export)

#### Button: Salva in Database
- **File**: [`edit-node-dialog.tsx`](src/components/rule-sage/edit-node-dialog.tsx:2845)
- **Linea**: 2845-3005
- **Funzione**: `executeFullPipeline('export', ...)`
- **Configurazione**:
  ```typescript
  taskConfigProvider: () => ({
    sqlExportTargetConnectorId,
    sqlExportTargetTableName,
    sqlExportSourceTables, // Tabelle da esportare
    // ... altre opzioni
  })
  ```

#### Scheduler: *(Nessuno)*
- L'export SQL non ha scheduler dedicato
- Viene eseguito solo manualmente tramite button

---

## Tipi di Task

Il componente [`NodeScheduler`](src/components/rule-sage/node-scheduler.tsx:128) mappa i tipi di nodo ai tipi di task:

```typescript
// Linea 128-131 di node-scheduler.tsx
let taskType = 'CUSTOM';
if (nodeType === 'sql') taskType = 'SQL_EXECUTE';
if (nodeType === 'email') taskType = 'EMAIL_SEND';
if (nodeType === 'python') taskType = 'PYTHON_EXECUTE';
```

### Task Types Disponibili

| Task Type | Descrizione | Button Associato | Scheduler Disponibile |
|-----------|-------------|------------------|---------------------|
| `SQL_EXECUTE` | Esegue query SQL e crea preview | Esegui Anteprima (SQL) | ✅ Sì |
| `PYTHON_EXECUTE` | Esegue script Python e crea preview | Esegui Anteprima (Python) | ✅ Sì |
| `EMAIL_SEND` | Invia email con allegati | Invia Email / Invia Email di Test | ✅ Sì |
| `EXPORT_TABLE` | Esporta dati in tabella DB | Salva in Database | ❌ No |
| `TRIGGER_EXECUTE` | Esegue trigger definito | Esegui Trigger | ❌ No |
| `CUSTOM` | Task personalizzato | - | ✅ Sì |

---

## Configurazione Scheduler

### Interfaccia NodeScheduler

```typescript
interface NodeSchedulerProps {
    treeId: string;           // ID dell'albero
    nodeId: string;           // ID del nodo
    nodePath: string;         // Path del nodo nell'albero
    nodeType: 'sql' | 'python' | 'email';  // Tipo di nodo
    taskConfigProvider: () => any;  // Funzione che restituisce la configurazione corrente
}
```

### Opzioni di Schedulazione

Il scheduler supporta due tipi di schedulazione:

#### 1. Giorni e Ore Specifici
- Seleziona giorni della settimana
- Seleziona ore specifiche
- Può aggiungere orari personalizzati

```typescript
scheduleType: 'specific'
daysOfWeek: '1,2,3,4,5'  // Lun-Ven
hours: '09:00,14:00'      // 9:00 e 14:00
customTimes: ['2025-02-06T10:00:00']  // Orari specifici
```

#### 2. Intervallo (Ogni X minuti)
- Esegui ogni X minuti
- Minimo 1 minuto

```typescript
scheduleType: 'interval'
intervalMinutes: 60  // Ogni ora
```

### Salvataggio Configurazione

```typescript
const scheduleConfig = {
    enabled: true,
    scheduleType: 'specific',  // o 'interval'
    intervalMinutes: 60,
    daysOfWeek: '1,2,3,4,5',
    hours: '09:00,14:00',
    timezone: 'Europe/Rome',
    customTimes: []
};

const finalTaskConfig = {
    ...currentTaskConfig,
    type: taskType  // 'SQL_EXECUTE' | 'PYTHON_EXECUTE' | 'EMAIL_SEND'
};

await saveNodeScheduleAction(
    treeId,
    nodeId,
    nodePath,
    scheduleConfig,
    finalTaskConfig
);
```

---

## Funzioni di Esecuzione

### executeFullPipeline()

Funzione principale che esegue la pipeline completa con dipendenze.

```typescript
const executeFullPipeline = async (
    targetAction: 'preview' | 'export' | 'email',
    onSuccess?: (pipelineResults?: Record<string, any>) => Promise<void>
) => {
    // 1. Costruisce la lista di step da eseguire
    // 2. Esegue ogni step in ordine
    // 3. Gestisce le dipendenze tra step
    // 4. Chiama la callback onSuccess con i risultati
}
```

#### Target Actions

| Action | Descrizione | Output |
|--------|-------------|--------|
| `preview` | Esegue query/script e crea preview | Tabella/Variabile/Grafico |
| `export` | Esporta dati in tabella DB | Tabella nel database |
| `email` | Invia email con allegati | Email inviata |

### executeTriggerAction()

Esegue un trigger specifico definito nel nodo.

```typescript
const executeTriggerAction = async (
    treeId: string,
    nodeId: string,
    trigger: TriggerItem
) => {
    // Esegue il trigger e attiva i nodi collegati
}
```

---

## Dipendenze Pipeline

Le pipeline supportano dipendenze tra nodi. Quando un nodo viene eseguito:

1. **Prima**: Esegue tutti i nodi antenati (ancestors)
2. **Poi**: Esegue il nodo corrente
3. **Infine**: Passa i risultati ai nodi successivi

### Esempio di Dipendenze

```typescript
const pipelineDependencies = [
    {
        tableName: 'sales_data',
        query: 'SELECT * FROM sales',
        isPython: false,
        connectorId: 'conn-123',
        pipelineDependencies: []  // Nessuna dipendenza
    },
    {
        tableName: 'aggregated_sales',
        query: 'SELECT SUM(amount) FROM sales_data',
        isPython: false,
        connectorId: 'conn-123',
        pipelineDependencies: [
            {
                tableName: 'sales_data',
                query: 'SELECT * FROM sales',
                isPython: false,
                connectorId: 'conn-123'
            }
        ]
    }
]
```

---

## Storico Esecuzioni

Il scheduler mantiene uno storico delle esecuzioni:

### Stati di Esecuzione

| Status | Icona | Descrizione |
|--------|-------|-------------|
| `success` | ✅ CheckCircle2 | Esecuzione completata con successo |
| `running` | 🔄 Loader2 | Esecuzione in corso |
| `failed` | ❌ XCircle | Esecuzione fallita |

### Visualizzazione Storico

```typescript
<Badge variant={run.status === 'success' ? 'outline' : run.status === 'running' ? 'secondary' : 'destructive'}>
    {run.status === 'success' ? 'Successo' : run.status === 'running' ? 'In corso' : 'Fallito'}
</Badge>
```

---

## File Riferimento

| File | Descrizione |
|------|-------------|
| [`edit-node-dialog.tsx`](src/components/rule-sage/edit-node-dialog.tsx) | Dialog per modifica nodi con button e scheduler |
| [`node-scheduler.tsx`](src/components/rule-sage/node-scheduler.tsx) | Componente scheduler per esecuzione automatica |
| [`visual-tree.tsx`](src/components/rule-sage/visual-tree.tsx) | Visualizzazione albero decisionale |
| [`schedule-builder.tsx`](src/components/scheduler/schedule-builder.tsx) | Builder per configurazione orari |
| [`scheduler.ts`](src/app/actions/scheduler.ts) | Actions per gestione scheduler |

---

## Riepilogo

### Button con Scheduler

| Button | Scheduler | Funzione Schedulata |
|--------|-----------|---------------------|
| ✅ Esegui Anteprima (SQL) | ✅ NodeScheduler (SQL) | SQL_EXECUTE |
| ✅ Esegui Anteprima (Python) | ✅ NodeScheduler (Python) | PYTHON_EXECUTE |
| ✅ Invia Email di Test | ✅ NodeScheduler (Email) | EMAIL_SEND |
| ✅ Invia Email | ✅ NodeScheduler (Email) | EMAIL_SEND |

### Button senza Scheduler

| Button | Scheduler | Funzione |
|--------|-----------|----------|
| ❌ Salva in Database | ❌ Nessuno | EXPORT_TABLE |
| ❌ Esegui Trigger | ❌ Nessuno | TRIGGER_EXECUTE |

---

## Note Importanti

1. **Stessa Funzione**: I scheduler eseguono le **stesse identiche funzioni** dei button, ma in modo automatico
2. **Configurazione Dinamica**: La configurazione viene presa tramite `taskConfigProvider()` al momento del salvataggio
3. **Dipendenze**: Le pipeline gestiscono automaticamente le dipendenze tra nodi
4. **Storico**: Tutte le esecuzioni (manuali e schedulate) vengono tracciate nello storico
5. **Timezone**: Lo scheduler usa `Europe/Rome` come timezone di default

---

*Ultimo aggiornamento: 2025-02-06*
