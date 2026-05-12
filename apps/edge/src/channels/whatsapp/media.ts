// Download Meta-hosted media (URL expires in 24h) and persist to Azure Blob.
// Returns the persistent blob URL.

import { BlobServiceClient } from '@azure/storage-blob';
import { request } from 'undici';
import { config } from '../../config.js';
import { logger } from '../../logger.js';

let _blob: BlobServiceClient | null = null;

function getBlobClient(): BlobServiceClient {
  if (_blob) return _blob;
  const cs = config.AZURE_BLOB_CONNECTION_STRING;
  if (!cs) throw new Error('AZURE_BLOB_CONNECTION_STRING missing');
  _blob = BlobServiceClient.fromConnectionString(cs);
  return _blob;
}

async function fetchMediaUrl(mediaId: string): Promise<string> {
  const token = config.META_SYSTEM_USER_TOKEN;
  if (!token) throw new Error('META_SYSTEM_USER_TOKEN missing');
  const res = await request(`https://graph.facebook.com/${config.META_GRAPH_VERSION}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.statusCode >= 400) {
    throw new Error(`meta.media_lookup_failed status=${res.statusCode}`);
  }
  const json = (await res.body.json()) as { url: string };
  return json.url;
}

export async function downloadAndStoreMedia(
  mediaId: string,
  mimeType: string,
  tenantId: string | undefined,
): Promise<string> {
  if (!config.AZURE_BLOB_CONNECTION_STRING) {
    // Dev fallback: return Meta's URL directly. The orchestrator/transcriber will fail
    // after 24h but this keeps local dev unblocked without Azurite-specific setup.
    logger.warn({ mediaId }, 'azure_blob.not_configured.using_meta_url');
    return await fetchMediaUrl(mediaId);
  }

  const downloadUrl = await fetchMediaUrl(mediaId);
  const token = config.META_SYSTEM_USER_TOKEN!;
  const dl = await request(downloadUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (dl.statusCode >= 400) {
    throw new Error(`meta.media_download_failed status=${dl.statusCode}`);
  }
  const buf = Buffer.from(await dl.body.arrayBuffer());

  const ext = mimeTypeToExt(mimeType);
  const blobName = `${tenantId ?? 'veda'}/media/${mediaId}.${ext}`;
  const containerClient = getBlobClient().getContainerClient(config.AZURE_BLOB_CONTAINER_MEDIA);
  await containerClient.createIfNotExists();
  const blockBlob = containerClient.getBlockBlobClient(blobName);
  await blockBlob.uploadData(buf, { blobHTTPHeaders: { blobContentType: mimeType } });
  return blockBlob.url;
}

function mimeTypeToExt(mt: string): string {
  if (mt.includes('ogg')) return 'ogg';
  if (mt.includes('mpeg')) return 'mp3';
  if (mt.includes('mp4')) return 'mp4';
  if (mt.includes('jpeg')) return 'jpg';
  if (mt.includes('png')) return 'png';
  if (mt.includes('pdf')) return 'pdf';
  if (mt.includes('sheet') || mt.includes('excel')) return 'xlsx';
  if (mt.includes('csv')) return 'csv';
  return 'bin';
}
