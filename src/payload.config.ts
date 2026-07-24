import { postgresAdapter } from '@payloadcms/db-postgres'
import { nodemailerAdapter } from '@payloadcms/email-nodemailer'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { s3Storage } from '@payloadcms/storage-s3'
import path from 'path'
import type { Plugin } from 'payload'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { branding } from './branding'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const smtpUser = process.env.SMTP_USER
const smtpPass = process.env.SMTP_PASS

/**
 * Builds the S3-compatible storage plugin. Fails fast (throws) if
 * `STORAGE_DRIVER=s3` but any required S3 env var is missing, so a
 * misconfigured deployment never silently falls back to local storage.
 */
function getS3StoragePlugin(): Plugin {
  const required = {
    S3_BUCKET: process.env.S3_BUCKET,
    S3_REGION: process.env.S3_REGION,
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
  }
  const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([key]) => key)

  if (missing.length > 0) {
    throw new Error(
      `STORAGE_DRIVER=s3 requires the following env var(s), which are missing: ${missing.join(', ')}`,
    )
  }

  return s3Storage({
    collections: {
      media: true,
    },
    bucket: required.S3_BUCKET as string,
    config: {
      region: required.S3_REGION as string,
      credentials: {
        accessKeyId: required.S3_ACCESS_KEY_ID as string,
        secretAccessKey: required.S3_SECRET_ACCESS_KEY as string,
      },
      ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT } : {}),
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    },
  })
}

const storageDriver = process.env.STORAGE_DRIVER === 's3' ? 's3' : 'local'
const plugins: Plugin[] = storageDriver === 's3' ? [getS3StoragePlugin()] : []

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
    meta: {
      description: branding.tagline,
      titleSuffix: ` — ${branding.productName}`,
      icons: {
        icon: [
          { url: '/favicon.svg', type: 'image/svg+xml' },
          { url: '/favicon-32x32.png', type: 'image/png', sizes: '32x32' },
        ],
        shortcut: '/favicon-32x32.png',
      },
    },
    components: {
      graphics: {
        Icon: '/components/branding/Icon#Icon',
        Logo: '/components/branding/Logo#Logo',
      },
    },
  },
  collections: [Users, Media],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URI || '',
    },
  }),
  email: nodemailerAdapter({
    defaultFromAddress: process.env.EMAIL_FROM_ADDRESS || branding.supportEmail,
    defaultFromName: process.env.EMAIL_FROM_NAME || branding.productName,
    transportOptions: {
      host: process.env.SMTP_HOST || 'localhost',
      port: Number(process.env.SMTP_PORT) || 1025,
      secure: process.env.SMTP_SECURE === 'true',
      ...(smtpUser && smtpPass ? { auth: { user: smtpUser, pass: smtpPass } } : {}),
    },
  }),
  sharp,
  plugins,
})
