import { migrateUp, migrateStatus } from '../database/migrator';
import { closePool } from '../database/pool';

/**
 * CLI de migración.
 *   node dist/scripts/migrate.js          -> aplica migraciones + recursos
 *   node dist/scripts/migrate.js status   -> muestra el estado de cada migración
 */
async function main(): Promise<void> {
    const cmd = process.argv[2];

    if (cmd === 'status') {
        const rows = await migrateStatus();
        console.table(
            rows.map((r) => ({
                migration: r.name,
                applied: r.applied ? 'yes' : 'no',
                appliedAt: r.appliedAt ? new Date(r.appliedAt).toISOString() : '',
            })),
        );
    } else {
        const result = await migrateUp();
        console.log(`applied:        ${result.applied.length ? result.applied.join(', ') : '(none)'}`);
        console.log(`alreadyApplied: ${result.alreadyApplied}`);
        console.log(`resources:      ${result.resources.length ? result.resources.join(', ') : '(none)'}`);
    }
}

main()
    .then(async () => {
        await closePool();
        process.exit(0);
    })
    .catch(async (err) => {
        console.error('[migrate] error:', err);
        try { await closePool(); } catch { /* noop */ }
        process.exit(1);
    });
