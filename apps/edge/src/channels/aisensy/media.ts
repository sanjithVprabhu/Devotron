// Download an AiSensy-hosted media URL and persist it to Azure Blob so it
// survives past the link's expiry. Returns the persistent blob URL.

import { BlobServiceClient } from '@azure/storage-blob';
import { request } from 'undici';
import { config } from '../../config.js';

let _blob: BlobServiceClient | null = null;

function getBlobClient(): BlobServiceClient {
  if (_blob) return _blob;
  const cs = config.AZURE_BLOB_CONNECTION_STRING;
  if (!cs) throw new Error('AZURE_BLOB_CONNECTION_STRING missing');
  _blob = BlobServiceClient.fromConnectionString(cs);
  return _blob;
}

function extFor(mt: string): string {
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

export async function persistRemoteMedia(
  remoteUrl: string,
  mimeType: string,
  tenantId: string,
): Promise<string> {
  const dl = await request(remoteUrl);
  if (dl.statusCode >= 400) {
    throw new Error(`media_download_failed status=${dl.statusCode}`);
  }
  const buf = Buffer.from(await dl.body.arrayBuffer());
  const blobName = `${tenantId}/media/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extFor(mimeType)}`;
  const containerClient = getBlobClient().getContainerClient(config.AZURE_BLOB_CONTAINER_MEDIA);
  await containerClient.createIfNotExists();
  const blockBlob = containerClient.getBlockBlobClient(blobName);
  await blockBlob.uploadData(buf, { blobHTTPHeaders: { blobContentType: mimeType } });
  return blockBlob.url;
}
