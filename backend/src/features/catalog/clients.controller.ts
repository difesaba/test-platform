import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { envs } from '../../shared/config/envs';

export class ClientsController {
    list = (_req: Request, res: Response) => {
        try {
            const file = path.join(process.cwd(), envs.WORKSPACE_PATH, 'clients.json');
            res.json(JSON.parse(fs.readFileSync(file, 'utf-8')));
        } catch (e: any) {
            res.status(500).json({ error: 'No se pudo leer clients.json: ' + e.message });
        }
    };
}
