import { envs } from './shared/config/envs';
import { AppRoutes } from './shared/routes/index';
import { Server } from './server';
import { torreService } from './features/auth/torre.service';

(() => { main(); })();

function main() {
    const server = new Server({
        port: envs.PORT,
        routes: AppRoutes.routes,
    });
    server.start().then(() => {
        // Iniciar sesión Torre en background — no bloquea el arranque
        torreService.init().catch(() => {});
    });
}
