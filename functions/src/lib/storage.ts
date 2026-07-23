// Shared Firebase Storage plumbing for every wave that saves a binary artifact
// (narration WAVs, scene PNGs). Uploads go through one place so the bucket-name
// quirk and the download-token trick are never re-derived per wave.
import { randomUUID } from "node:crypto";
import { getStorage } from "firebase-admin/storage";

/**
 * The project's default Storage bucket. In the functions runtime,
 * getStorage().bucket() defaults to the legacy `<project>.appspot.com` name,
 * which newer projects never provision — the real default bucket is
 * `<project>.firebasestorage.app`. Resolve it explicitly (STORAGE_BUCKET env
 * override wins), so uploads land in the bucket that actually exists.
 */
export function defaultBucketName(): string {
  if (process.env.STORAGE_BUCKET) return process.env.STORAGE_BUCKET;
  const projectId =
    JSON.parse(process.env.FIREBASE_CONFIG ?? "{}").projectId ??
    process.env.GCLOUD_PROJECT ??
    process.env.GCP_PROJECT;
  return `${projectId}.firebasestorage.app`;
}

/**
 * Save a buffer at an exact Storage path and return a long-lived, login-less
 * download URL. We attach a Firebase download token so the URL never expires (no
 * signing credentials or public-ACL dependency).
 */
export async function uploadBuffer(
  path: string,
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  const bucket = getStorage().bucket(defaultBucketName());
  const file = bucket.file(path);
  const token = randomUUID();

  await file.save(buffer, {
    resumable: false,
    contentType,
    metadata: { metadata: { firebaseStorageDownloadTokens: token } },
  });

  return (
    `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/` +
    `${encodeURIComponent(path)}?alt=media&token=${token}`
  );
}
