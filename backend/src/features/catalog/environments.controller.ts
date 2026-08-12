import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { envs } from '../../shared/config/envs';

export class EnvironmentsController {

    list = (_req: Request, res: Response) => {
        try {
            const filePath = path.join(process.cwd(), envs.WORKSPACE_PATH, 'environments.json');
            const data = fs.readFileSync(filePath, 'utf-8');
            res.json(JSON.parse(data));
        } catch (error: any) {
            res.status(500).json({ error: 'No se pudo leer environments.json: ' + error.message });
        }
    };
}
