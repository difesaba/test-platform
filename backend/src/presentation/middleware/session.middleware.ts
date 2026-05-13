import { NextFunction, Request, Response } from 'express';

export function requireAuth(req: Request, res: Response, next: NextFunction) {
    const sess = req.session as any;
    if (!sess.adproToken) {
        return res.status(401).json({ error: 'No autenticado. Inicia sesión primero.' });
    }
    next();
}
