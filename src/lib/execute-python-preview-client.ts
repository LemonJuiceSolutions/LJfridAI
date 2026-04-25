/**
 * Client-side wrapper for executePythonPreviewAction that bypasses the
 * ~10MB React Flight response limit on Server Actions by going through
 * /api/internal/execute-python (plain Route Handler, no RSC serialization).
 *
 * Use from client components whenever the Python preview can return big
 * payloads (Plotly figs, large tables, HTML dashboards) — otherwise the
 * result gets truncated and surfaces as:
 *   SyntaxError: Unterminated string in JSON at position ~10485760
 */
export interface PythonPreviewDependency {
    tableName: string;
    query?: string;
    isPython?: boolean;
    pythonCode?: string;
    connectorId?: string;
    pipelineDependencies?: any[];
    selectedDocuments?: string[];
    nodeName?: string;
    displayName?: string;
}

export interface PythonPreviewResult {
    success: boolean;
    data?: any[];
    columns?: string[];
    variables?: Record<string, any>;
    chartBase64?: string;
    chartHtml?: string;
    html?: string;
    rechartsConfig?: any;
    rechartsData?: any[];
    rechartsStyle?: any;
    plotlyJson?: any;
    error?: string;
    rowCount?: number;
    stdout?: string;
    debugLogs?: string[];
    _autoSwitchedOutputType?: string;
}

export async function executePythonPreviewClient(
    code: string,
    outputType: 'table' | 'variable' | 'chart' | 'html',
    inputData: Record<string, any[]> = {},
    dependencies?: PythonPreviewDependency[],
    connectorId?: string,
    selectedDocuments?: string[],
    dfTarget?: string,
): Promise<PythonPreviewResult> {
    try {
        const response = await fetch('/api/internal/execute-python', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                code,
                outputType,
                inputData,
                dependencies,
                connectorId,
                selectedDocuments,
                dfTarget,
            }),
        });

        if (!response.ok) {
            let errMsg = `Errore server (${response.status})`;
            try {
                const errData = await response.json();
                errMsg = errData.error || errMsg;
            } catch {
                /* response wasn't JSON, keep default */
            }
            return { success: false, error: errMsg };
        }

        return (await response.json()) as PythonPreviewResult;
    } catch (e: any) {
        return {
            success: false,
            error: e?.message || 'Errore di rete durante l\'esecuzione Python',
        };
    }
}
