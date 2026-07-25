/**
 * Single source of truth for U-CMS's product identity.
 *
 * Every other file that needs the product name, company name, tagline, support
 * email, brand colors, or marketing URLs should import from this module rather
 * than hardcoding the strings/values directly. To re-brand the app (new name,
 * new colors, new domain), edit this file plus the SVG assets under
 * `src/components/branding/` and `public/` — nothing else should need to change.
 */

export type BrandingColors = {
  /** Primary brand color, used for the admin panel's primary action buttons. */
  primary: string
  /** A lighter/brighter step of `primary`, used where `primary` reads too dark (e.g. dark theme). */
  primaryDark: string
  success: string
  warning: string
  error: string
}

export type BrandingUrls = {
  /** Placeholder marketing/company website. Update once a real domain is live. */
  website: string
}

export type Branding = {
  productName: string
  companyName: string
  tagline: string
  supportEmail: string
  colors: BrandingColors
  urls: BrandingUrls
}

export const branding: Branding = {
  productName: 'U-CMS',
  companyName: 'Public Pulse',
  tagline: 'Manage every site from one place',
  supportEmail: 'support@publicpulse.com.bd',
  colors: {
    primary: '#0F62FE',
    primaryDark: '#4589FF',
    success: '#198038',
    warning: '#F1C21B',
    error: '#DA1E28',
  },
  urls: {
    website: 'https://publicpulse.com.bd',
  },
}
