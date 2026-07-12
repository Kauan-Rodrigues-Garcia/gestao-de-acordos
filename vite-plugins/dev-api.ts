import type { Plugin } from 'vite';
import { loadEnv } from 'vite';

/**
 * Plugin de DESENVOLVIMENTO: serve as funções da pasta `/api` (que na Vercel
 * viram serverless) dentro do próprio `vite dev`. Assim recursos que dependem
 * de `/api` (impersonação, leitura por imagem via IA) funcionam com um simples
 * `npm run dev`, sem precisar de `vercel dev`.
 *
 * As variáveis NÃO-VITE do .env.local (ex.: SUPABASE_SERVICE_ROLE_KEY) são
 * carregadas no `process.env` do servidor de dev — ficam só no processo Node,
 * nunca são enviadas ao navegador.
 *
 * `apply: 'serve'` garante que isto NÃO entra no build de produção.
 */

interface ResShim {
  status(code: number): ResShim;
  json(data: unknown): void;
}

export function devApi(): Plugin {
  return {
    name: 'dev-api',
    apply: 'serve',
    configureServer(server) {
      // Expõe variáveis não-VITE (server-side) ao process.env para as funções /api.
      const env = loadEnv(server.config.mode, server.config.root, '');
      for (const [k, v] of Object.entries(env)) {
        if (process.env[k] === undefined) process.env[k] = v;
      }

      server.middlewares.use(async (req, res, next) => {
        const url = req.url || '';
        if (!url.startsWith('/api/')) return next();

        const nome = url.split('?')[0].replace(/^\/api\//, '').replace(/\/+$/, '');
        // Só nomes simples de arquivo — evita path traversal.
        if (!/^[a-zA-Z0-9_-]+$/.test(nome)) return next();

        // Lê o corpo como JSON
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        const raw = Buffer.concat(chunks).toString('utf8');
        let body: unknown;
        if (raw) {
          try { body = JSON.parse(raw); } catch { body = raw; }
        }

        const resShim: ResShim = {
          status(code: number) { res.statusCode = code; return this; },
          json(data: unknown) {
            if (!res.headersSent) res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(data));
          },
        };

        try {
          const mod = await server.ssrLoadModule(`/api/${nome}.ts`);
          const handler = (mod as { default?: (r: unknown, s: ResShim) => Promise<void> }).default;
          if (typeof handler !== 'function') {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: `Função /api/${nome} não encontrada.` }));
            return;
          }
          await handler({ method: req.method, headers: req.headers, body }, resShim);
        } catch (err) {
          server.config.logger.error(`[dev-api] erro em /api/${nome}: ${String(err)}`);
          if (!res.writableEnded) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Erro na função /api.' }));
          }
        }
      });
    },
  };
}
