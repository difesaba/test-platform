import { Request, Response } from 'express';

export class SwaggerController {

    getSpec = async (req: Request, res: Response) => {
        const { urlBase } = req.query as { urlBase?: string };
        const sess = req.session as any;

        if (!urlBase) return res.status(400).json({ error: 'Falta urlBase' });

        // urlBase = urlRaiz sin /v3  (ej: https://desarrollo.sincoerp.com/SincoOk)
        // Swagger en ADPRO: {urlRaiz}/API/swagger/docs/v1
        //   = {urlBase}/v3/API/swagger/docs/v1
        // Ejemplo localhost: http://localhost/Sinco/V3/ADPRO/API/swagger/ui/index
        const base = urlBase.replace(/\/+$/, '');
        const candidates = [
            `${base}/v3/API/swagger/docs/v1`,       // ← ADPRO cloud/nuevo
            `${base}/V3/ADPRO/API/swagger/docs/v1`, // ← ADPRO local/legacy
            `${base}/v3/swagger/docs/v1`,
            `${base}/swagger/docs/v1`,
        ];

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
