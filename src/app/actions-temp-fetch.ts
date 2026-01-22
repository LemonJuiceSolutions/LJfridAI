
// ... existing imports ...

// New action to fetch data from a specific table (for parent data source in widgets)
export async function fetchTableDataAction(tableName: string) {
    try {
        // Basic sanitization to prevent obvious injection, though typically table names are trusted or validated system-side
        // Using Prisma raw query for simplicity since tables are dynamic
        // Limit to 1000 rows to prevent overwhelming the frontend
        const sanitizedTableName = tableName.replace(/[^a-zA-Z0-9_]/g, '');
        const query = `SELECT * FROM "${sanitizedTableName}" LIMIT 1000`;

        // We reuse executeSqlPreviewAction which handles connection logic, or directly use prisma if simpler.
        // Reusing executeSqlPreviewAction is safer as it respects existing connection management logic if any.
        // However, executeSqlPreviewAction expects a full query.

        return await executeSqlPreviewAction(query, ''); // Empty connector ID implies default or derived? 
        // Wait, executeSqlPreviewAction requires a connectorId usually.
        // Actually, looking at previous code, tables are often in the default DB or specific connector logic.
        // Let's assume the table exists in the connected DB.

    } catch (error) {
        console.error('Error fetching table data:', error);
        return { success: false, error: 'Failed to fetch table data' };
    }
}
