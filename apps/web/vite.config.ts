import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig, loadEnv } from 'vite';

const rootDir = resolve(import.meta.dirname, '../..');

export default defineConfig(({ mode }) => {
  // Shared repo-root .env (also used by the API)
  const env = loadEnv(mode, rootDir, '');
  const apiTarget = `http://localhost:${env.API_PORT ?? 3000}`;

  return {
    plugins: [react()],
    envDir: rootDir,
    // Public (non-secret) OIDC settings are shared with the API via OIDC_* vars
    envPrefix: ['VITE_', 'OIDC_'],
    resolve: {
      // Use shared sources directly in dev/build (HMR, no pre-build needed)
      alias: { '@app/shared': resolve(rootDir, 'packages/shared/src/index.ts') },
    },
    server: {
      host: '0.0.0.0',
      port: Number(env.WEB_PORT ?? 4200),
      strictPort: true,
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
        '/docs': { target: apiTarget, changeOrigin: true },
      },
    },
    preview: { host: '0.0.0.0', port: Number(env.WEB_PORT ?? 4200) },
  };
});
