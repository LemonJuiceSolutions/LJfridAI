import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('pipeline dataset refs', () => {
  const originalEnv = { ...process.env };
  let tempDir: string;

  beforeEach(() => {
    vi.resetModules();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-dataset-ref-'));
    process.env.DATA_LAKE_PATH = tempDir;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('keeps small rowsets inline', async () => {
    const { maybePersistDatasetRef, isPipelineDatasetRef } = await import('@/lib/pipeline-dataset-ref');

    const rows = [{ id: 1, name: 'small' }];
    const result = await maybePersistDatasetRef('small table', rows, 'run-1', 10_000);

    expect(result).toBe(rows);
    expect(isPipelineDatasetRef(result)).toBe(false);
  });

  it('persists large rowsets as data-lake references', async () => {
    const {
      datasetRowCount,
      isPipelineDatasetRef,
      maybePersistDatasetRef,
      resolveDatasetRef,
    } = await import('@/lib/pipeline-dataset-ref');

    const rows = [
      { id: 1, payload: 'x'.repeat(200) },
      { id: 2, payload: 'y'.repeat(200) },
    ];
    const result = await maybePersistDatasetRef('large/table', rows, 'run-2', 20);

    expect(isPipelineDatasetRef(result)).toBe(true);
    expect(datasetRowCount(result)).toBe(2);
    expect((result as any).columns).toEqual(['id', 'payload']);
    expect((result as any).path.startsWith(tempDir)).toBe(true);
    await expect(resolveDatasetRef(result)).resolves.toEqual(rows);
  });

  it('refuses to resolve references outside the data lake', async () => {
    const { resolveDatasetRef } = await import('@/lib/pipeline-dataset-ref');

    await expect(resolveDatasetRef({
      __datasetRef: true,
      format: 'json',
      path: path.join(os.tmpdir(), 'outside.json'),
      rowCount: 1,
      sizeBytes: 2,
      columns: ['id'],
    })).rejects.toThrow('outside data lake');
  });

  it('cleans up stale pipeline dataset reference directories', async () => {
    const { cleanupPipelineDatasetRefs } = await import('@/lib/pipeline-dataset-ref');

    const stale = path.join(tempDir, 'pipeline-datasets', 'old-run');
    const fresh = path.join(tempDir, 'pipeline-datasets', 'fresh-run');
    fs.mkdirSync(stale, { recursive: true });
    fs.mkdirSync(fresh, { recursive: true });
    fs.writeFileSync(path.join(stale, 'data.json'), '[]');
    fs.writeFileSync(path.join(fresh, 'data.json'), '[]');

    const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000);
    fs.utimesSync(stale, oldDate, oldDate);

    await expect(cleanupPipelineDatasetRefs(24)).resolves.toBe(1);
    expect(fs.existsSync(stale)).toBe(false);
    expect(fs.existsSync(fresh)).toBe(true);
  });
});
