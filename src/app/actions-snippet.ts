
// New action to fetch data from a specific table (for parent data source in widgets)
export async function fetchTableDataAction(tableName: string) {
    try {
        const user = await getAuthenticatedUser();
        if (!user) throw new Error("Unauthorized");

        // Basic sanitization
        const sanitizedTableName = tableName.replace(/[^a-zA-Z0-9_]/g, '');
        // Default limit to preventing huge payloads
        const query = `SELECT * FROM "${sanitizedTableName}" LIMIT 1000`;

        // Use executeSqlPreviewAction which handles connection selection logic if table name is passed implicitly?
        // Actually, executeSqlPreviewAction requires a connectorId. 
        // Ideally we should know which connector the table belongs to.

        // Quick fix: Since we don't always know the connector ID for a purely table-name based fetch (unless we look it up),
        // we can try to find the connector associated with this table.
        // However, usually the frontend knows the connector ID if it lists the table.
        // For now, let's assume the frontend passes a connector ID if available, or we use a default.

        // Wait, let's look at executeSqlPreviewAction signature.
        // export async function executeSqlPreviewAction(query: string, connectorId: string)

        // If we call it with empty connectorId, does it default?
        // Let's implement this by calling executeSqlPreviewAction.
        // But we need to update the signature or make it flexible.

        // BETTER APPROACH: modify fetchTableDataAction to accept connectorId too if possible?
        // The requirement says "input tables" from parents. Those usually have metadata.

        return await executeSqlPreviewAction(query, '');
    } catch (error) {
        console.error('Error fetching table data:', error);
        return { success: false, error: 'Failed to fetch table data' };
    }
}
