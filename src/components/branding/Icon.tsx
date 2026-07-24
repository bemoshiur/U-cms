import React from 'react'

import { branding } from '@/branding'

/**
 * Compact glyph-only mark for the Payload admin nav header (the "home" icon in the
 * step-nav breadcrumb). Server-safe: no client hooks, no `"use client"` directive, so it
 * can be rendered directly from `payload.config.ts`'s `admin.components.graphics.Icon`.
 *
 * The mark is a rounded square in the brand primary color with a white pulse-wave glyph,
 * so it reads correctly on both the light and dark admin themes without needing any
 * theme-aware CSS of its own.
 */
export const Icon: React.FC = () => {
  return (
    <svg
      viewBox="0 0 24 24"
      width="100%"
      height="100%"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={`${branding.productName} icon`}
    >
      <rect width="24" height="24" rx="6" fill={branding.colors.primary} />
      <path
        d="M4 13h3.2l1.8-5.5L12.4 17l2.2-4h5.4"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default Icon
