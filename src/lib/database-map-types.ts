export interface ColumnInfo {
    name: string;
    dataType: string;
    maxLength: number | null;
    isNullable: boolean;
    defaultValue: string | null;
    isPrimaryKey: boolean;
    isForeignKey: boolean;
    foreignKeyTarget?: { schema: string; table: string; column: string };
    description: string | null;
    userDescription: string | null;
}

export interface RelationshipInfo {
    constraintName: string;
    sourceSchema: string;
    sourceTable: string;
    sourceColumn: string;
    targetSchema: string;
    targetTable: string;
    targetColumn: string;
    inferred?: boolean; // true se inferita da nomi colonne, false/undefined se FK formale
    confidence?: number; // 0-100, percentuale affidabilita'
    inferenceMethod?: string; // 'formal_fk' | 'name_pattern' | 'prefix_suffix' | 'view_sp' | 'ai_schema' | 'data_analysis'
    reason?: string; // motivazione dettagliata (perché è stata creata questa relazione)
}

export interface TableInfo {
    schema: string;
    name: string;
    fullName: string;
    rowCount: number;
    description: string | null;
    userDescription: string | null;
    columns: ColumnInfo[];
    primaryKeyColumns: string[];
    foreignKeysOut: RelationshipInfo[];
    foreignKeysIn: RelationshipInfo[];
}

// ─── Data Sampling Types ────────────────────────────────────────────────────

export interface ColumnFingerprint {
    type: string;
    values: string[];
    distinctCount: number;
    nullRate: number;
    isPK: boolean;
    isFK: boolean;
    isUnique?: boolean;    // from unique index detection (non-PK)
}

export interface OverlapCandidate {
    sourceTable: string;
    sourceColumn: string;
    targetTable: string;
    targetColumn: string;
    overlapCount: number;
    overlapRatio: number;
    sourceDistinct: number;
    targetDistinct: number;
    matchingSamples: string[];
    score: number;
    // SQL-verified fields (set in sql_verification phase)
    verifiedOverlapCount?: number;
    verifiedSourceDistinct?: number;
    verifiedOverlapRatio?: number;
    verified?: boolean;
}

export interface DataSamplingState {
    phase: 'fingerprinting' | 'overlap' | 'sql_verification' | 'ai_validation' | 'done';
    fingerprintedTables: string[];
    fingerprints: Record<string, Record<string, ColumnFingerprint>>;
    candidates?: OverlapCandidate[];
    validatedCount?: number;
    totalCandidates?: number;
    verifiedCount?: number;    // tracking for sql_verification phase
}

export interface DatabaseMap {
    connectorId: string;
    connectorName: string;
    databaseName: string;
    tables: TableInfo[];
    relationships: RelationshipInfo[];
    summary: {
        totalTables: number;
        totalColumns: number;
        totalRelationships: number;
        totalRows: number;
    };
    generatedAt: string;
    descriptionsGeneratedAt?: string;
    nodePositions?: Record<string, { x: number; y: number }>;
    dataSamplingState?: DataSamplingState;
}
