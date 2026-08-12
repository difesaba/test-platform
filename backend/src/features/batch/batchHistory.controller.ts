import { Request, Response } from 'express';
import { BatchHistoryService } from './batchHistory.service';

const svc = new BatchHistoryService();

export class BatchHistoryController {
    list = (_req: Request, res: Response) => {
        res.json(svc.list());
    };

    remove = (req: Request, res: Response) => {
        svc.remove((req.params.id as string));
        res.json({ ok: true });
    };
}
