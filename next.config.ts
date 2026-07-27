import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(__filename)

/**
 * Task 7D (R3 + P2's HSTS; OWASP audit §3/§6): security response headers.
 *
 * Applied GLOBALLY (all routes) — every value here is safe for the Payload admin
 * panel + Monaco editor + the public site:
 *  - `X-Content-Type-Options: nosniff` — no MIME sniffing.
 *  - `Referrer-Policy: strict-origin-when-cross-origin` — trim cross-origin refs.
 *  - `X-Frame-Options: DENY` + `Content-Security-Policy: frame-ancestors 'none'`
 *    — clickjacking protection. `frame-ancestors` is the ONLY CSP directive safe
 *    to add blindly: it governs who may FRAME us, never what scripts/styles load,
 *    so it cannot break the admin panel.
 *  - `Strict-Transport-Security` (P2's HSTS piece — set in ONE place, here).
 *    Harmless over http (browsers ignore HSTS on http), so e2e is unaffected.
 *
 * DELIBERATELY NOT ADDED: a restrictive `default-src`/`script-src`/`style-src`
 * content-CSP. The Payload admin UI + Next runtime rely on inline scripts/styles
 * + eval + the Monaco editor, so a strict script-src WOULD break `/admin`. A
 * fuller content-CSP is a documented follow-up, deferred until it can be built,
 * run, and e2e-proven not to break `/admin` or the public site.
 */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
]

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
  // Standalone output is only needed for the Docker image (see Dockerfile,
  // which copies `.next/standalone`). It's gated on `DOCKER_BUILD` — set by
  // the Dockerfile's builder stage — rather than always-on, so local
  // `pnpm build` + `pnpm start` (the flow Playwright's e2e webServer relies
  // on) keeps producing the regular `.next` output.
  ...(process.env.DOCKER_BUILD === '1' ? { output: 'standalone' } : {}),
  images: {
    localPatterns: [
      {
        pathname: '/api/media/file/**',
      },
    ],
  },
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      '.cjs': ['.cts', '.cjs'],
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    }

    return webpackConfig
  },
  turbopack: {
    root: path.resolve(dirname),
  },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
