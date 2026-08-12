import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { getPool, sql } from './pool';

const MIGRATIONS_DIR = path.join(__dirname, '../../../migrations');
const RESOURCE_DIR = path.join(__dirname, '../../../database');
const TABLE = '[dbo].[SchemaMigrations]';
const RES_TABLE = '[dbo].[SchemaResources]';

/**
 * Carpetas de recursos aplicadas en ORDEN DE DEPENDENCIA: un schema antes que sus tablas, las tablas
 * antes que los índices/FKs que las referencian, todo antes que los procedures que las leen. Cada
 * recurso es idempotente (create guardado / CREATE OR ALTER), así aplicar sobre una BD existente es
 * un no-op seguro.
 */
const RESOURCE_ORDER = ['schemas', 'tables', 'indexes', 'foreign-keys', 'views', 'procedures', 'seed'];
// 'seed' = DATOS de referencia idempotentes (catálogos que la app necesita para arrancar).
// Va al final porque llena tablas que los recursos de schema acaban de crear; cada seed hace MERGE por
// clave natural, así reaplicar es un no-op.

export interface MigrationFile {
    name: string;
    fullPath: string;
}

export interface AppliedMigration {
    Name: string;
    Checksum: string;
    AppliedAt: Date;
}

/** Asegura que exista la tabla de tracking de migraciones. */
async function ensureTable(): Promise<void> {
    const pool = await getPool();
    await pool.request().batch(`
    IF OBJECT_ID('${TABLE}', 'U') IS NULL
    BEGIN
      CREATE TABLE ${TABLE}(
        [Id]        INT IDENTITY(1,1) PRIMARY KEY,
        [Name]      VARCHAR(260) NOT NULL UNIQUE,
        [Checksum]  CHAR(64) NOT NULL,
        [AppliedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_SchemaMigrations_AppliedAt] DEFAULT (SYSUTCDATETIME())
      );
    END
  `);
}

/** Lista los .sql de migraciones versionadas, ordenados ascendente por nombre (0001_, 0002_, ...). */
export async function listMigrationFiles(): Promise<MigrationFile[]> {
    const entries = await readdir(MIGRATIONS_DIR);
    return entries
        .filter((f) => f.toLowerCase().endsWith('.sql'))
        .sort((a, b) => a.localeCompare(b))
        .map((name) => ({ name, fullPath: path.join(MIGRATIONS_DIR, name) }));
}

/**
 * Lista los archivos de RECURSO (schemas, tables, indexes, foreign-keys, views, procedures, seed) en
 * orden de dependencia. Son la FUENTE DE VERDAD del esquema: idempotentes, reaplicados cuando el
 * contenido de un archivo cambia. Una BD nueva se construye entera desde estos; las migraciones
 * versionadas son el registro histórico/de datos.
 */
export async function listResourceFiles(): Promise<MigrationFile[]> {
    const files: MigrationFile[] = [];
    for (const folder of RESOURCE_ORDER) {
        const base = path.join(RESOURCE_DIR, folder);
        // Recorre un nivel de subcarpetas por schema (o archivos planos directamente en la carpeta).
        let entries: import('node:fs').Dirent[];
        try { entries = await readdir(base, { withFileTypes: true }); } catch { continue; }
        for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
            if (e.isDirectory()) {
                const sub = await readdir(path.join(base, e.name)).catch(() => [] as string[]);
                for (const f of sub.filter((x) => x.toLowerCase().endsWith('.sql')).sort()) {
                    files.push({ name: `${folder}/${e.name}/${f}`, fullPath: path.join(base, e.name, f) });
                }
            } else if (e.name.toLowerCase().endsWith('.sql')) {
                files.push({ name: `${folder}/${e.name}`, fullPath: path.join(base, e.name) });
            }
        }
    }
    return files;
}

/** Devuelve las migraciones ya aplicadas indexadas por nombre. */
export async function getApplied(): Promise<Map<string, AppliedMigration>> {
    await ensureTable();
    const pool = await getPool();
    const result = await pool.request().query<AppliedMigration>(`SELECT Name, Checksum, AppliedAt FROM ${TABLE}`);
    return new Map(result.recordset.map((r) => [r.Name, r]));
}

/** Trackea el último hash aplicado de cada recurso, para saltar los que no cambiaron. */
async function ensureResTable(): Promise<void> {
    const pool = await getPool();
    await pool.request().batch(`
    IF OBJECT_ID('${RES_TABLE}', 'U') IS NULL
    BEGIN
      CREATE TABLE ${RES_TABLE}(
        [Name]      VARCHAR(260) NOT NULL PRIMARY KEY,
        [Checksum]  CHAR(64) NOT NULL,
        [AppliedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_SchemaResources_AppliedAt] DEFAULT (SYSUTCDATETIME())
      );
    END
  `);
}

async function getAppliedResources(): Promise<Map<string, string>> {
    await ensureResTable();
    const pool = await getPool();
    const r = await pool.request().query<{ Name: string; Checksum: string }>(`SELECT Name, Checksum FROM ${RES_TABLE}`);
    return new Map(r.recordset.map((x) => [x.Name, x.Checksum]));
}

/**
 * Relanza el error diciendo QUÉ archivo y QUÉ batch lo produjo.
 *
 * Sin esto, un despliegue que aplica sesenta recursos y falla en uno responde "Migration failed" y
 * nada más: hay que adivinar cuál, y el error real del motor —que suele nombrar la columna o la
 * restricción exacta— se queda dentro de un objeto que el log no despliega.
 */
function describeFailure(file: MigrationFile, batchIndex: number, batch: string, err: unknown): Error {
    const e = err as { message?: string; number?: number; lineNumber?: number; precedingErrors?: unknown[] };
    /* La primera línea del batch identifica el objeto mejor que un número de línea global. */
    const head = batch
        .split(/\r?\n/)
        .find((l) => l.trim() && !l.trim().startsWith('/*') && !l.trim().startsWith('--'))
        ?.trim()
        .slice(0, 120);
    /* SQL Server dice "See previous errors" y deja los previos en otro sitio. El que explica QUÉ
       constraint o QUÉ tabla falta suele ser el primero de esta lista, no el último que lanzó. */
    const preceding = (e?.precedingErrors ?? [])
        .map((p) => (p as { message?: string })?.message)
        .filter(Boolean)
        .join(' | ');

    const parts = [
        `${file.name} failed on batch ${batchIndex + 1}`,
        head ? `starting "${head}"` : null,
        e?.number != null ? `[SQL error ${e.number}${e.lineNumber != null ? `, line ${e.lineNumber}` : ''}]` : null,
        e?.message ?? String(err),
        preceding ? `PREVIOUS: ${preceding}` : null,
    ].filter(Boolean);
    const wrapped = new Error(parts.join(' — '));
    (wrapped as Error & { cause?: unknown }).cause = err;
    return wrapped;
}

/** Aplica un recurso (DDL idempotente / CREATE OR ALTER) y registra su hash. */
async function applyResource(file: MigrationFile, content: string): Promise<void> {
    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    const batches = splitBatches(content);
    let at = 0;
    try {
        for (const [i, batch] of batches.entries()) {
            at = i;
            await new sql.Request(tx).batch(batch);
        }
        await new sql.Request(tx)
            .input('Name', sql.VarChar, file.name)
            .input('Checksum', sql.Char, checksum(content))
            .query(`
        MERGE ${RES_TABLE} AS t USING (SELECT @Name AS Name) AS s ON t.Name = s.Name
        WHEN MATCHED THEN UPDATE SET Checksum = @Checksum, AppliedAt = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT (Name, Checksum) VALUES (@Name, @Checksum);`);
        await tx.commit();
    } catch (err) {
        try { await tx.rollback(); } catch { /* ya estaba deshecha; importa el error original */ }
        throw describeFailure(file, at, batches[at] ?? '', err);
    }
}

/**
 * Aplica cada recurso cuyo archivo cambió desde la última vez que se aplicó.
 *
 * Corre DESPUÉS de las migraciones versionadas, así un proc puede referenciar una tabla que una
 * migración acaba de crear. Como cada recurso es idempotente, aplicar uno sin cambios sería un no-op
 * inofensivo — igual lo saltamos (hash coincide) para acelerar contra un servidor remoto.
 */
export async function applyResources(): Promise<string[]> {
    const files = await listResourceFiles();
    const applied = await getAppliedResources();
    const changed: string[] = [];
    for (const file of files) {
        const content = await readFile(file.fullPath, 'utf8');
        if (applied.get(file.name) === checksum(content)) continue;
        console.log(`[migrate] aplicando recurso ${file.name}`);
        /* También por stdout crudo: si el proceso muere aplicando este archivo, queda rastro. */
        process.stdout.write(`  -> ${file.name}\n`);
        await applyResource(file, content);
        changed.push(file.name);
    }
    return changed;
}

export function checksum(content: string): string {
    return createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Corta un script SQL en batches por separadores `GO` en línea propia (estilo SSMS),
 * que el driver mssql no entiende de forma nativa.
 */
export function splitBatches(content: string): string[] {
    return content
        .split(/^\s*GO\s*;?\s*$/gim)
        .map((b) => b.trim())
        .filter((b) => b.length > 0);
}

/** Aplica un único archivo de migración dentro de una transacción. */
async function applyMigration(file: MigrationFile, content: string): Promise<void> {
    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    const batches = splitBatches(content);
    let at = 0;
    try {
        for (const [i, batch] of batches.entries()) {
            at = i;
            await new sql.Request(tx).batch(batch);
        }
        await new sql.Request(tx)
            .input('Name', sql.VarChar, file.name)
            .input('Checksum', sql.Char, checksum(content))
            .query(`INSERT INTO ${TABLE}(Name, Checksum) VALUES (@Name, @Checksum)`);
        await tx.commit();
    } catch (err) {
        try { await tx.rollback(); } catch { /* ya estaba deshecha; importa el error original */ }
        throw describeFailure(file, at, batches[at] ?? '', err);
    }
}

export interface MigrateResult {
    applied: string[];
    alreadyApplied: number;
    resources: string[];
}

/**
 * Aplica todas las migraciones versionadas pendientes, luego reaplica cualquier recurso de BD que
 * haya cambiado (schemas/tables/indexes/foreign-keys/views/procedures/seed desde database/). Idempotente.
 */
export async function migrateUp(): Promise<MigrateResult> {
    const files = await listMigrationFiles();
    const applied = await getApplied();
    const result: MigrateResult = { applied: [], alreadyApplied: 0, resources: [] };

    for (const file of files) {
        const content = await readFile(file.fullPath, 'utf8');
        const existing = applied.get(file.name);

        if (existing) {
            if (existing.Checksum !== checksum(content)) {
                throw new Error(
                    `Migration ${file.name} was modified after being applied (checksum mismatch). ` +
                        `Never edit an applied migration — create a new one instead.`,
                );
            }
            result.alreadyApplied++;
            continue;
        }

        console.log(`[migrate] aplicando migración ${file.name}`);
        await applyMigration(file, content);
        result.applied.push(file.name);
    }

    result.resources = await applyResources();
    return result;
}

/** Reporta el estado de cada migración (aplicada o pendiente). */
export async function migrateStatus(): Promise<{ name: string; applied: boolean; appliedAt?: Date }[]> {
    const files = await listMigrationFiles();
    const applied = await getApplied();
    return files.map((f) => {
        const a = applied.get(f.name);
        return { name: f.name, applied: Boolean(a), appliedAt: a?.AppliedAt };
    });
}
