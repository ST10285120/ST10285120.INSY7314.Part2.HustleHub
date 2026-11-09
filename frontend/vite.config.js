import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Strict Content Security Policy for the built app (also enforced by nginx in
// the Docker image - see frontend/nginx.conf). No inline scripts or styles,
// no third-party origins, no framing.
export const PRODUCTION_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

// The Vite dev server injects an inline React Fast Refresh preamble and talks
// to the HMR websocket, so development needs a slightly looser policy. It is
// still much tighter than no policy at all.
const apiOrigin = (() => {
  try {
    return new URL(process.env.VITE_API_URL || 'https://localhost:5443/api').origin;
  } catch {
    return 'https://localhost:5443';
  }
})();

const DEV_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  `connect-src 'self' ${apiOrigin} ws://localhost:3000 wss://localhost:3000`,
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join('; ');

const SHARED_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    headers: { ...SHARED_HEADERS, 'Content-Security-Policy': DEV_CSP },
  },
  preview: {
    port: 3000,
    headers: { ...SHARED_HEADERS, 'Content-Security-Policy': PRODUCTION_CSP },
  },
  build: {
    sourcemap: false,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/__tests__/setup.js',
  },
});
