import type { DecisionLeaf, DecisionNode, MediaItem, LinkItem, TriggerItem, EmailActionConfig, AIConfig, ExternalAgentConfig } from '@/lib/types';

export interface EditNodeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (path: string, newNodeData: any) => void;
  onSavePreview?: (nodePath: string, previewData: any) => void;
  onRefreshTree?: () => void;
  initialNode: DecisionNode | DecisionLeaf | { question: string } | { option: string };
  nodeType: 'question' | 'decision';
  variableId?: string;
  nodePath: string;
  treeId: string;
  isSaving: boolean;
  availableInputTables?: {
    name: string;
    nodeName?: string;
    nodeId?: string;
    path?: string;
    connectorId?: string;
    sqlQuery?: string;
    isPython?: boolean;
    pythonCode?: string;
    pythonOutputType?: 'table' | 'variable' | 'chart' | 'html';
    pipelineDependencies?: {
      tableName: string;
      path?: string;
      query?: string;
      isPython?: boolean;
      pythonCode?: string;
      connectorId?: string;
    }[];
    sqlExportTargetTableName?: string;
    sqlExportTargetConnectorId?: string;
    sqlExportSourceTables?: string[];
    writesToDatabase?: boolean;
    plotlyStyleOverrides?: any;
    htmlStyleOverrides?: any;
    externalAgentConfig?: any;
    // Runtime/computed fields used internally
    data?: any[];
    selectedDocuments?: string[];
    allNames?: string[];
    [key: string]: any; // allow extra fields used by runtime code
  }[];
  availableParentMedia?: MediaItem[];
  availableParentLinks?: LinkItem[];
  availableParentTriggers?: TriggerItem[];
}

export type FileToUpload = {
  file: File;
  preview: string;
  name: string;
  type: 'image' | 'video';
};

export type PipelineStatus = {
  name: string;
  type: 'python' | 'sql' | 'ai' | 'agent' | 'export';
  status: 'pending' | 'running' | 'success' | 'error' | 'skipped';
  executionTime?: number;
  message?: string;
};
