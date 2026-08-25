import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * 개발 서버에서 /api/dataset 를 직접 처리한다.
 * 배포(Vercel)에서는 api/dataset.ts 서버리스 함수가 같은 응답을 낸다.
 */
function devApi(): Plugin {
  return {
    name: 'dev-api',
    configureServer(server) {
      server.middlewares.use('/api/dataset', async (_req, res) => {
        try {
          const { buildDataset } = await server.ssrLoadModule('/api/_lib/dataset.ts');
          const dataset = await buildDataset();
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(dataset));
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), devApi()],
  build: { outDir: 'dist' },
});
