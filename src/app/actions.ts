// ---------------------------------------------------------------------------
// Barrel file — backwards compatibility.
// NOTE: NO 'use server' here — each module already declares it.
// Next.js 'use server' barrel files cannot use export * (non-async exports break it).

// Pure utility helpers (no 'use server' needed)
export * from '@/lib/tree-utils';
export * from '@/lib/json-utils';
// Every function that was importable from '@/app/actions' remains importable.
// ---------------------------------------------------------------------------

export * from './actions/auth';
export * from './actions/trees';
export * from './actions/sql';
export * from './actions/detai';
export * from './actions/variables';
export * from './actions/email';
export * from './actions/excel';
export * from './actions/triggers';
export * from './actions/openrouter';
export {
    getConnectorsAction,
    createConnectorAction,
    deleteConnectorAction,
    updateConnectorAction,
    executeSqlAction,
    testConnectorAction,
    sendEmailWithConnectorAction,
    sendTestEmailWithDataAction,
    sendWhatsAppTestMessageAction,
    getWhatsAppSessionsAction,
    getWhatsAppContactsAction,
    saveWhatsAppContactAction,
    deleteWhatsAppContactAction,
} from './actions/connectors';
export * from './actions/tree';
export * from './actions/ancestors';
export * from './actions/sharepoint';
export * from './actions/knowledge-base';
export * from './actions/backup-restore';
export * from './actions/invitations';
export * from './actions/scheduler';
export * from './actions/database-map';
