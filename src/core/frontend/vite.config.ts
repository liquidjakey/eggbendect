import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// This dev container is served behind a JupyterHub / code-server reverse proxy
// at a per-user, per-port sub-path (e.g. /user/<user>/<server>/codeserver/proxy/<port>/).
// The platform injects VSCODE_PROXY_URI with a {{port}} placeholder for exactly this
// purpose. We resolve it at startup so the dev server (and all assets/HMR it serves)
// know their real public path, instead of assuming they're served from "/".
function resolveProxyBase(port: number): string {
  const template = process.env.VSCODE_PROXY_URI
  if (!template) return '/'
  try {
    const url = new URL(template.replace('{{port}}', String(port)))
    return url.pathname
  } catch {
    return '/'
  }
}

const port = 5174
const base = resolveProxyBase(port)

// The backend (FastAPI) runs as its own uvicorn process behind the same
// per-port proxy scheme (see backend/run_dev.sh) — reuse the same resolution
// logic, just for port 8000, so the browser can reach it without CORS ever
// coming into play (same origin, only the path prefix differs).
const BACKEND_PORT = 8000
function resolveApiBase(targetPort: number): string {
  const template = process.env.VSCODE_PROXY_URI
  if (!template) return `http://localhost:${targetPort}`
  try {
    const url = new URL(template.replace('{{port}}', String(targetPort)))
    return url.pathname.replace(/\/$/, '')
  } catch {
    return `http://localhost:${targetPort}`
  }
}
const apiBase = resolveApiBase(BACKEND_PORT)

// The reverse proxy strips its own mount prefix before forwarding requests to
// this dev server (so Vite sees "/" instead of the real external path). Since
// `base` above is set to that external path, Vite's own routing then thinks
// every incoming request is "wrong" and 302-redirects to `base` — and the proxy
// re-prepends its prefix onto that absolute Location header, doubling the path
// (see the browser's address bar duplicating the prefix). To avoid that redirect
// entirely, re-prepend `base` onto incoming request URLs *before* Vite's own
// middleware evaluates them, so Vite always sees paths that already match it.
function restoreProxyPrefix(prefix: string): Plugin | false {
  if (prefix === '/') return false
  const prefixNoSlash = prefix.slice(0, -1) // "/user/.../5174" (no trailing slash)
  const middleware = (req: { url?: string }, _res: unknown, next: () => void) => {
    if (req.url && !req.url.startsWith(prefix) && req.url !== prefixNoSlash) {
      req.url = prefixNoSlash + (req.url.startsWith('/') ? req.url : `/${req.url}`)
    }
    next()
  }
  return {
    name: 'restore-proxy-prefix',
    // `vite preview` (a plain built-output server, no HMR/WebSocket) doesn't
    // reuse configureServer — it needs the same fix registered separately or
    // the doubled-path redirect comes right back for anyone using `preview`.
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}

export default defineConfig({
  base,
  define: {
    __API_BASE_URL__: JSON.stringify(apiBase),
  },
  plugins: [react(), tailwindcss(), restoreProxyPrefix(base)],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    host: true,
    port,
    strictPort: true,
    allowedHosts: true,
  },
  // `npm run preview` serves the production build with no dev/HMR machinery
  // at all — no WebSocket to the client that a flaky reverse-proxy idle
  // timeout can drop, so no reconnect-triggered `location.reload()`. Kept on
  // the same port/base/host rules as `server` so it works through the same
  // proxy path.
  preview: {
    host: true,
    port,
    strictPort: true,
    allowedHosts: true,
  },
})
