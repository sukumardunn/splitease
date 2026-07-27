import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // loadEnv (unlike import.meta.env) also picks up vars without a VITE_
  // prefix, which is what we want here: PORT_BASE is a dev-server-only
  // setting, not something that should ship in the client bundle.
  const env = loadEnv(mode, process.cwd(), '');

  // Local dev port allocation (~/.claude/docs/port-allocation.md): splitease's
  // registered block is base 43200, web/vite is +0. PORT_BASE is the single
  // source of truth — set in jsapps/.env.local (see .env.example). Falls back
  // to the registered base if unset so a fresh checkout still lands correctly.
  const portBase = Number(env.PORT_BASE) || 43200;

  return {
    plugins: [react()],
    optimizeDeps: {
      exclude: ['lucide-react'],
    },
    server: {
      port: portBase,
      // Fail fast instead of drifting to the next free port. Vite's
      // auto-increment is exactly how this app previously ended up sharing
      // 5173/5174 with another project's dev server.
      strictPort: true,
    },
  };
});
