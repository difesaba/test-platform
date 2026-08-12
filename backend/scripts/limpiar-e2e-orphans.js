/**
 * Limpieza de archivos huerfanos de E2E tras pasar el store a SQL Server (E2E_STORE=sqlserver).
 *
 * Mueve (no borra) a _to_delete/e2e_orphans/ preservando la ruta original:
 *   - los recordings.json bajo workspace/modules (los flujos en archivo, que SQL ya no lee)
 *   - workspace/e2e-runs.jsonl (historial de corridas en archivo)
 *
 * NO toca: los .spec.ts ni las capturas dentro de e2e/ (los flujos nuevos en SQL los siguen usando),
 * ni las carpetas api/ ui/ (pruebas UI/API, aun en archivo), ni audit.log.jsonl (auditoria).
 *
 * Correr local (sin el limite del puente):   node scripts/limpiar-e2e-orphans.js
 * Es idempotente: si ya no queda nada, no hace nada. Revisa _to_delete/ y borrala cuando quieras.
 */
const fs = require('fs');
const path = require('path');

const BACKEND = path.resolve(__dirname, '..');
const WORKSPACE = path.join(BACKEND, 'workspace');
const DEST = path.join(BACKEND, '_to_delete', 'e2e_orphans');

let movidos = 0;
const t0 = Date.now();

function mover(origen, subrutaRelativaAWorkspace) {
  const destino = path.join(DEST, subrutaRelativaAWorkspace);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.renameSync(origen, destino);
  movidos++;
}

function walk(dir) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      // Podamos carpetas pesadas sin recordings.json para ir mas rapido.
      if (e.name === 'screenshots' || e.name === '.playwright-user-data') continue;
      walk(p);
    } else if (e.name === 'recordings.json') {
      mover(p, path.relative(WORKSPACE, p));
    }
  }
}

const runsFile = path.join(WORKSPACE, 'e2e-runs.jsonl');
if (fs.existsSync(runsFile)) mover(runsFile, 'e2e-runs.jsonl');

walk(path.join(WORKSPACE, 'modules'));

console.log('\nHuerfanos movidos a _to_delete/e2e_orphans: ' + movidos);
console.log('Tiempo: ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
console.log('Revisa la carpeta y borrala cuando quieras. Nada de esto afecta lo que ya esta en SQL.');
