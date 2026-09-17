import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The API is proxied rather than called cross-origin in dev, so the session
// cookie is same-site and no CORS preflight is involved. 3004 is the port
// deploy/nginx already forwards /api/ to; VITE_API_PROXY overrides it when the
// canonical port is taken on this machine.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.VITE_API_PROXY || 'http://127.0.0.1:3004'

  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        '/api': { target, changeOrigin: false },
      },
    },
  }
})
