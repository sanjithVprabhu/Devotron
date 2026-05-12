"""Azure Blob Storage helper. Used to persist voice notes, image uploads, Excel
catalog uploads, and exported reports."""

from __future__ import annotations

from azure.storage.blob.aio import BlobServiceClient

from veda_shared.settings import get_settings

_client: BlobServiceClient | None = None


def get_blob_client() -> BlobServiceClient:
    global _client
    if _client is None:
        cs = get_settings().azure_blob_connection_string
        if not cs:
            raise RuntimeError("AZURE_BLOB_CONNECTION_STRING is not set")
        _client = BlobServiceClient.from_connection_string(cs)
    return _client


async def upload_bytes(container: str, blob_name: str, data: bytes, content_type: str | None = None) -> str:
    client = get_blob_client()
    container_client = client.get_container_client(container)
    blob_client = container_client.get_blob_client(blob_name)
    from azure.storage.blob import ContentSettings

    await blob_client.upload_blob(
        data,
        overwrite=True,
        content_settings=ContentSettings(content_type=content_type) if content_type else None,
    )
    return blob_client.url
