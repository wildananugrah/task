import { S3Client } from 'bun'
import { env } from './env'

/**
 * The bucket is third-party — AWS S3, Cloudflare R2, Wasabi, or a MinIO standing
 * in for one locally. Bun ships an S3 client, so all of that is one config
 * object and no SDK.
 */
export const s3 = new S3Client({
  accessKeyId: env.s3.accessKeyId,
  secretAccessKey: env.s3.secretAccessKey,
  bucket: env.s3.bucket,
  region: env.s3.region,
  endpoint: env.s3.endpoint,
  virtualHostedStyle: !env.s3.forcePathStyle,
})

/**
 * Presigned PUT. The browser uploads straight to the bucket; bytes never come
 * through here. Only `host` is signed, so the browser is free to send its own
 * Content-Type header and the object keeps it.
 */
export function presignUpload(key: string) {
  return s3.presign(key, { method: 'PUT', expiresIn: env.uploadUrlTtl })
}

/**
 * Presigned GET. `inline` is what the preview dialog renders; `attachment`
 * carries the original filename into the browser's download, which the object
 * key (uuid-prefixed) would not.
 */
export function presignDownload(key: string, fileName: string, disposition: 'inline' | 'attachment') {
  // Bun signs `contentDisposition` into the URL as `response-content-disposition`,
  // which is what makes one stored object serve both the inline preview and a
  // download that keeps the original filename.
  return s3.presign(key, {
    method: 'GET',
    expiresIn: env.downloadUrlTtl,
    contentDisposition: `${disposition}; filename="${fileName.replace(/"/g, '')}"`,
  })
}

export async function deleteObjects(keys: string[]) {
  // Best-effort: a task delete must not fail because the bucket hiccuped. The
  // row is gone either way; an orphaned object is swept later.
  await Promise.allSettled(keys.filter(Boolean).map((key) => s3.delete(key)))
}

export const objectKey = (workspaceId: string, taskId: string, fileId: string, name: string) =>
  `ws/${workspaceId}/tasks/${taskId}/${fileId}-${name}`

export const logoKey = (workspaceId: string, fileId: string, name: string) =>
  `ws/${workspaceId}/logo/${fileId}-${name}`
