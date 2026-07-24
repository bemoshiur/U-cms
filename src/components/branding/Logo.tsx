import React from 'react'

import { branding } from '@/branding'

import { Icon } from './Icon'

/**
 * Full wordmark for the Payload admin login screen. Server-safe: no client hooks, no
 * `"use client"` directive, so it can be rendered directly from `payload.config.ts`'s
 * `admin.components.graphics.Logo`.
 *
 * Reuses the {@link Icon} glyph (which is theme-agnostic on its own — a fixed-color mark)
 * next to the product name. The product name text uses Payload's `--theme-elevation-800`
 * CSS custom property for its color, which Payload itself flips between a dark and a light
 * value depending on `[data-theme="light"]` / `[data-theme="dark"]` on the document — so the
 * wordmark reads correctly in both admin themes without any client-side theme detection.
 */
export const Logo: React.FC = () => {
  return (
    <div
      style={{
        alignItems: 'center',
        display: 'inline-flex',
        gap: '0.65rem',
      }}
    >
      <span style={{ display: 'block', height: '40px', width: '40px' }}>
        <Icon />
      </span>
      <span
        style={{
          color: 'var(--theme-elevation-800)',
          fontSize: '1.5rem',
          fontWeight: 600,
          letterSpacing: '-0.01em',
        }}
      >
        {branding.productName}
      </span>
    </div>
  )
}

export default Logo
