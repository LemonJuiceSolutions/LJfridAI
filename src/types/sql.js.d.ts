declare module 'sql.js' {
    interface SqlJsStatic {
        Database: new (data?: ArrayLike<number> | Buffer | null) => Database;
    }

    interface Database {
        run(sql: string, params?: any[]): Database;
        exec(sql: string, params?: any[]): QueryExecResult[];
        prepare(sql: string): Statement;
        close(): void;
    }

    interface Statement {
        run(params?: any[]): void;
        free(): void;
        getAsObject(params?: any[]): Record<string, any>;
        step(): boolean;
    }

    interface QueryExecResult {
        columns: string[];
        values: any[][];
    }

    export default function initSqlJs(config?: any): Promise<SqlJsStatic>;
}
