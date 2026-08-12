import { Request, Response } from 'express';

export class SwaggerController {

    getSpec = async (req: Request, res: Response) => {
        const { urlBase, override } = req.query as { urlBase?: string; override?: string };
        const sess = req.session as any;

        if (!urlBase) return res.status(400).json({ error: 'Falta urlBase' });

        // urlBase = raíz de la empresa ACTIVA (urlRaiz sin /v3). Entre empresas solo cambia el host,
        // así que la ruta del Swagger es invariante y se compone sobre la raíz activa.
        // Swagger ADPRO: {host}/V3/ADPRO/api/swagger/docs/v1 (el /ui/index es la página HTML; el spec es /docs/v1).
        const base = urlBase.replace(/\/+$/, '');
        const candidates: string[] = [];

        // Si hay un override por módulo (Configuración), se reapunta a la empresa activa:
        // se toma su RUTA (invariante) y se compone con el host activo. Se conserva el absoluto como respaldo.
        const ov = (override ?? '').trim();
        if (ov) {
            let path = ov;
            let search = '';
            try { const u = new URL(ov); path = u.pathname; search = u.search; } catch { /* ya es una ruta relativa */ }
            path = path.replace(/\/swagger\/ui\/index.*$/i, '/swagger/docs/v1'); // UI HTML → spec JSON
            if (!path.startsWith('/')) path = `/${path}`;
            candidates.push(`${base}${path}${search}`);                 // override reapuntado a la empresa activa
            if (/^https?:\/\//i.test(ov)) candidates.push(ov);          // override absoluto tal cual (respaldo)
        }

        // Autodescubrimiento estándar (respaldo si el override no resuelve).
        candidates.push(
            `${base}/v3/API/swagger/docs/v1`,       // ← ADPRO cloud/nuevo
            `${base}/V3/ADPRO/API/swagger/docs/v1`, // ← ADPRO local/legacy
            `${base}/v3/swagger/docs/v1`,
            `${base}/swagger/docs/v1`,
        );

        const headers: Record<string, string> = { 'Accept': 'application/json' };
        if (sess?.adproToken?.access_token) {
            headers['Authorization'] = `${sess.adproToken.token_type ?? 'Bearer'} ${sess.adproToken.access_token}`;
        }

        let spec: any = null;
        let lastError = '';
        let swaggerUrl = '';

        for (const url of candidates) {
            try {
                const resp = await fetch(url, { headers });
                if (resp.ok) {
                    spec = await resp.json();
                    swaggerUrl = url;
                    console.log(`[Swagger] OK en ${url}`);
                    break;
                }
                lastError = `${resp.status} en ${url}`;
            } catch (e: any) {
                lastError = e.message;
            }
        }

        if (!spec) {
            return res.status(404).json({
                error: `Swagger no encontrado. Último error: ${lastError}`,
                tried: candidates,
            });
        }

        // Inject the URL used so the frontend can derive the correct API base
        spec._swaggerUrl = swaggerUrl;
        res.json(spec);
    };
}
