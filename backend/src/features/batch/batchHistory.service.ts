import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { envs } from '../../shared/config/envs';
import type { BatchResult } from '../apiTests/apiTest.service';

export interface BatchRecord {
    id: string;
    timestamp: string;
    moduleContext: { module: string; submodule?: string; page?: string };
    companies: { urlRaiz: string; appName: string; empNombre: string }[];
    testNames: Record<string, string>;
    results: BatchResult[];
    summary: { total: number; passed: number; failed: number };
}

const MAX_RECORDS = 50;

function historyPath(): string {
    return path.join(process.cwd(), envs.WORKSPACE_PATH, 'batch-history.json');
}

function readHistory(): BatchRecord[] {
    const p = historyPath();
    if (!fs.existsSync(p)) return [];
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function writeHistory(records: BatchRecord[]): void {
    fs.mkdirSync(path.dirname(historyPath()), { recursive: true });
    fs.writeFileSync(historyPath(), JSON.stringify(records, null, 2), 'utf-8');
}

export class BatchHistoryService {
    list(): BatchRecord[] {
        return readHistory();
    }

    save(record: Omit<BatchRecord, 'id' | 'timestamp'>): BatchRecord {
        const full: BatchRecord = {
            ...record,
            id: randomUUID(),
            timestamp: new Date().toISOString(),
        };
        const records = [full, ...readHistory()].slice(0, MAX_RECORDS);
        writeHistory(records);
        return full;
    }

    remove(id: string): void {
        writeHistory(readHistory().filter(r => r.id !== id));
    }
}
