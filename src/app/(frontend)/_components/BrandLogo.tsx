'use client'

import { useState } from 'react'

/**
 * Site brand mark: renders the uploaded logo image, but falls back to a styled
 * text wordmark if the image fails to load. Uploads live on ephemeral local
 * storage in the demo (Vercel), so the seeded logo file 500s and would
 * otherwise show a broken-image icon in the header on every page. On a real
 * deployment with persistent (S3) storage the image loads normally.
 */
export function BrandLogo({
  logoUrl,
  alt,
  width,
  height,
  name,
}: {
  logoUrl?: string | null
  alt?: string
  width?: number
  height?: number
  name: string
}) {
  const [failed, setFailed] = useState(false)

  if (logoUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- same-origin CMS asset; avoids next/image remote-loader config
      <img
        className="site-brand__logo"
        src={logoUrl}
        alt={alt || name}
        width={width}
        height={height}
        onError={() => setFailed(true)}
      />
    )
  }

  return <span className="site-brand__name">{name}</span>
}
