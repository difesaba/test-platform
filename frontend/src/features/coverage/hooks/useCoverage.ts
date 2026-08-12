import { useCallback, useEffect, useMemo, useState } from 'react';
import { getModules } from '@/features/platform/services/catalog/catalog.service';
import { getCoverage } from '@/features/coverage/services/coverage.service';
import type { ModuleItem, SubmoduleItem } from '@/shared/types/platform';
import type { ModuleCoverage, CoverageTotals, CoverageCounts } from '@/features/coverage/models/coverage.model';

type PageEntry = { firstSub?: string; page: string; chain: string };

const EMPTY: CoverageCounts = { e2e: 0, ui: 0, api: 0, count: 0 };

// Aplana un módulo a sus páginas, con el submódulo de primer nivel (así se almacena el contexto).
function collectPages(mod: ModuleItem): PageEntry[] {
  const out: PageEntry[] = [];
  (mod.pages ?? []).forEach((p) => out.push({ firstSub: undefined, page: p.name, chain: '(módulo)' }));
  const walk = (node: SubmoduleItem, firstSub: string, chain: string[]) => {
    (node.pages ?? []).forEach((p) => out.push({ firstSub, page: p.name, chain: chain.join(' › ') }));
    (node.submodules ?? []).forEach((c) => walk(c, firstSub, [...chain, c.name]));
  };
  (mod.submodules ?? []).forEach((sub) => walk(sub, sub.name, [sub.name]));
  return out;
}

const key = (module: string, firstSub: string | undefined, page: string) => `${module}|||${firstSub ?? ''}|||${page}`;

interface UseCoverage {
  perModule: ModuleCoverage[];
  totals: CoverageTotals;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/**
 * Centraliza la carga de cobertura: trae el catálogo y la cobertura unificada (E2E/UI/API), y cruza
 * ambos (por módulo/submódulo-de-primer-nivel/página) devolviendo el modelo listo para la vista.
 */
export function useCoverage(): UseCoverage {
  const [modules, setModules] = useState<ModuleItem[]>([]);
  const [covMap, setCovMap] = useState<Map<string, CoverageCounts>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [mods, cov] = await Promise.all([getModules(), getCoverage()]);
      if (mods.success && mods.data) setModules(mods.data);
      else { setError(mods.error ?? 'No se pudieron cargar los módulos'); setModules([]); }
      if (cov.success && cov.data) {
        const m = new Map<string, CoverageCounts>();
        cov.data.forEach((r) => {
          if (r.page) m.set(key(r.module, r.submodule, r.page), { e2e: r.e2e, ui: r.ui, api: r.api, count: r.count });
        });
        setCovMap(m);
      } else {
        // ⚠️ Sin cobertura mostramos el árbol igual (todo sin cubrir), no rompemos la vista.
        setCovMap(new Map());
      }
    } catch (e) {
      console.error('[coverage] carga', e);
      setError('Ocurrió un error al cargar la cobertura.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const perModule = useMemo<ModuleCoverage[]>(() => modules.map((mod) => {
    const pages = collectPages(mod);
    let covered = 0;
    const rows = pages.map((p) => {
      const c = covMap.get(key(mod.name, p.firstSub, p.page)) ?? EMPTY;
      if (c.count > 0) covered++;
      return { ...p, ...c };
    });
    return { name: mod.name, total: pages.length, covered, rows };
  }), [modules, covMap]);

  const totals = useMemo<CoverageTotals>(() => {
    const total = perModule.reduce((a, m) => a + m.total, 0);
    const covered = perModule.reduce((a, m) => a + m.covered, 0);
    const e2e = perModule.reduce((a, m) => a + m.rows.reduce((s, r) => s + r.e2e, 0), 0);
    const ui = perModule.reduce((a, m) => a + m.rows.reduce((s, r) => s + r.ui, 0), 0);
    const api = perModule.reduce((a, m) => a + m.rows.reduce((s, r) => s + r.api, 0), 0);
    return { total, covered, pct: total ? Math.round((covered / total) * 100) : 0, e2e, ui, api };
  }, [perModule]);

  return { perModule, totals, loading, error, reload };
}
