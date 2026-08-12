import express, { Router } from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import session from 'express-session';
import path from 'path';
import { envs } from './shared/config/envs';

interface Options {
    port: number;
    routes: Router;
    publicPath?: string;
}

export class Server {

    private app = express();
    private readonly port: number;
    private readonly publicPath: string;
    private readonly routes: Router;

    constructor(options: Options) {
        const { port, publicPath = 'public', routes } = options;
        this.port = port;
        this.publicPath = publicPath;
        this.routes = routes;
    }

    async start() {
        this.app.use(bodyParser.json({ limit: '50mb' }));
        this.app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
        this.app.use(cors({ origin: true, credentials: true }));

        this.app.use(session({
            secret: envs.SESSION_SECRET,
            resave: false,
            saveUninitialized: false,
            cookie: { secure: false, maxAge: 8 * 60 * 60 * 1000 },
        }));

        // API routes
        this.app.use('/api', this.routes);

        // Serve React frontend
        const staticPath = path.join(__dirname, '../', this.publicPath);
        this.app.use(express.static(staticPath));
        this.app.get('/*splat', (_req, res) => {
            res.sendFile(path.join(staticPath, 'index.html'));
        });

        this.app.listen(this.port, () => {
            console.log(`testPlatform backend corriendo en puerto ${this.port}`);
        });
    }
}
