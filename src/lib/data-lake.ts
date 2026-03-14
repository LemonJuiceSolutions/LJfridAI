import { join, isAbsolute } from 'path';

/**
 * Returns the absolute path to the data lake directory.
 * Controlled by DATA_LAKE_PATH env var (default: "data_lake").
 * Relative paths are resolved from the project root (process.cwd()).
 */
export function getDataLakePath(...segments: string[]): string {
    const configured = process.env.DATA_LAKE_PATH || 'public/documents';
    const base = isAbsolute(configured) ? configured : join(process.cwd(), configured);
    return segments.length > 0 ? join(base, ...segments) : base;
}
