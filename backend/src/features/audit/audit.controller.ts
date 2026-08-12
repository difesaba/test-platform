import { Request, Response } from 'express';
import { auditService, type AuditEvent } from './audit.service';

function ctxOf(req: Request) {
    const s = req.session as any;
    return {
        empresaNombre: s?.empresa?.nombre ?? s?.empresaNombre,
        entorno: s?.sucursal?.entorno ?? s?.entorno?.name,
    };
}

// Híbrido: estructurales visibles siempre; ejecuciones filtradas por empresa+entorno.
function visible(e: AuditEvent, ctx: { empresaNombre?: string; entorno?: string }): boolean {
    if (e.type === 'structural') return true;
    return e.empresaNombre === ctx.empresaNombre && e.entorno === ctx.entorno;
}

export class AuditController {
    list = async (req: Request, res: Response) => {
        const ctx = ctxOf(req);
        res.json((await auditService.list(300)).filter((e) => visible(e, ctx)));
    };

    stream = async (req: Request, res: Response) => {
        const ctx = ctxOf(req);
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        (res as any).flushHeaders?.();

        for (const e of (await auditService.list(100)).filter((ev) => visible(ev, ctx))) {
            res.write(`data: ${JSON.stringify(e)}\n\n`);
        }

        const unsub = auditService.subscribe((e) => {
            if (visible(e, ctx)) res.write(`data: ${JSON.stringify(e)}\n\n`);
        });
        const keepAlive = setInterval(() => res.write(': ping\n\n'), 25000);
        req.on('close', () => { clearInterval(keepAlive); unsub(); });
    };
}
