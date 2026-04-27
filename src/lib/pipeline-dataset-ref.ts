import "server-only";
import fs from "fs";
import path from "path";
import { getDataLakePath } from "@/lib/data-lake";

const DEFAULT_THRESHOLD_BYTES = 5 * 1024 * 1024;

export interface PipelineDatasetRef {
  __datasetRef: true;
  format: "json";
  path: string;
  rowCount: number;
  sizeBytes: number;
  columns: string[];
}

export function isPipelineDatasetRef(value: unknown): value is PipelineDatasetRef {
  return (
    !!value &&
    typeof value === "object" &&
    (value as any).__datasetRef === true &&
    typeof (value as any).path === "string"
  );
}

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120) || "dataset";
}

export async function maybePersistDatasetRef(
  name: string,
  rows: any[],
  executionId: string,
  thresholdBytes = DEFAULT_THRESHOLD_BYTES,
): Promise<any[] | PipelineDatasetRef> {
  if (!Array.isArray(rows) || rows.length === 0) return rows;

  const json = JSON.stringify(rows);
  const sizeBytes = Buffer.byteLength(json, "utf8");
  if (sizeBytes <= thresholdBytes) return rows;

  const dir = getDataLakePath("pipeline-datasets", executionId);
  await fs.promises.mkdir(dir, { recursive: true });

  const filePath = path.join(dir, `${safeName(name)}.json`);
  await fs.promises.writeFile(filePath, json, "utf8");

  return {
    __datasetRef: true,
    format: "json",
    path: filePath,
    rowCount: rows.length,
    sizeBytes,
    columns: Object.keys(rows[0] || {}),
  };
}

export async function resolveDatasetRef(value: unknown): Promise<any> {
  if (!isPipelineDatasetRef(value)) return value;
  const dataLakeRoot = path.resolve(getDataLakePath());
  const filePath = path.resolve(value.path);
  if (!(filePath === dataLakeRoot || filePath.startsWith(dataLakeRoot + path.sep))) {
    throw new Error("datasetRef path outside data lake");
  }
  const raw = await fs.promises.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

export async function cleanupPipelineDatasetRefs(maxAgeHours = 24): Promise<number> {
  const root = path.resolve(getDataLakePath("pipeline-datasets"));
  const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
  let deleted = 0;

  let entries: string[];
  try {
    entries = await fs.promises.readdir(root);
  } catch {
    return 0;
  }

  await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(root, entry);
    try {
      const stat = await fs.promises.stat(fullPath);
      if (stat.mtimeMs < cutoff) {
        await fs.promises.rm(fullPath, { recursive: true, force: true });
        deleted += 1;
      }
    } catch {
      // Best-effort cleanup: a concurrent pipeline may remove the same dir.
    }
  }));

  return deleted;
}

export function datasetRowCount(value: unknown): number | undefined {
  if (isPipelineDatasetRef(value)) return value.rowCount;
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object" && "data" in value) {
    return datasetRowCount((value as any).data);
  }
  return undefined;
}
