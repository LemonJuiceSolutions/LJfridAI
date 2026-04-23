export interface FileInfo {
    name: string;
    url: string;
    size: number;
    createdAt: string;
}

export async function uploadFile(file: File, folder: string = 'data_lake', customName?: string): Promise<{ url: string; name: string } | null> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', folder);
    if (customName) formData.append('name', customName);

    try {
        const res = await fetch('/api/upload', {
            method: 'POST',
            body: formData,
        });

        const data = await res.json().catch(() => null);

        if (!res.ok) {
            const reason = data?.error || `HTTP ${res.status}`;
            throw new Error(`Upload failed: ${reason}`);
        }

        if (data?.success) {
            return { url: data.url, name: data.name };
        }
        return null;
    } catch (e) {
        console.error("Upload error:", e);
        throw e;
    }
}

export async function listFiles(folder: string = 'data_lake'): Promise<FileInfo[]> {
    try {
        const res = await fetch(`/api/files?folder=${folder}`);
        if (!res.ok) throw new Error('List failed');
        const data = await res.json();
        return data.files || [];
    } catch (e) {
        console.error("List error:", e);
        return [];
    }
}

export async function deleteFile(name: string, folder: string = 'data_lake'): Promise<boolean> {
    try {
        const res = await fetch(`/api/files?name=${encodeURIComponent(name)}&folder=${folder}`, {
            method: 'DELETE'
        });
        return res.ok;
    } catch (e) {
        console.error("Delete error:", e);
        return false;
    }
}
