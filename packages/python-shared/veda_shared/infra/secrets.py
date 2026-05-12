"""AES-256-GCM secret decryption — matches the Node `lib/secrets.ts` format.
Format: ``v1:<iv_b64>:<tag_b64>:<ciphertext_b64>``.
Key from env ``TENANT_SECRET_KEY_B64`` (32 raw bytes, base64-encoded).
"""

from __future__ import annotations

import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def _key() -> bytes:
    raw = os.environ.get("TENANT_SECRET_KEY_B64")
    if not raw:
        raise RuntimeError("TENANT_SECRET_KEY_B64 not set")
    k = base64.b64decode(raw)
    if len(k) != 32:
        raise RuntimeError("TENANT_SECRET_KEY_B64 must decode to 32 bytes")
    return k


def decrypt_secret(blob: str) -> str:
    """Decrypt a Node-compatible v1 AES-256-GCM blob.

    Raises ValueError on malformed input or decryption failure.
    """
    parts = blob.split(":")
    if len(parts) != 4 or parts[0] != "v1":
        raise ValueError("invalid encrypted blob format")
    iv = base64.b64decode(parts[1])
    tag = base64.b64decode(parts[2])
    ct = base64.b64decode(parts[3])
    aes = AESGCM(_key())
    pt = aes.decrypt(iv, ct + tag, associated_data=None)
    return pt.decode("utf-8")


def encrypt_secret(plaintext: str) -> str:
    """Encrypt to the same wire format the Node side reads."""
    iv = os.urandom(12)
    aes = AESGCM(_key())
    blob = aes.encrypt(iv, plaintext.encode("utf-8"), associated_data=None)
    # AESGCM concatenates ciphertext|tag (last 16 bytes).
    ct, tag = blob[:-16], blob[-16:]
    return ":".join(
        [
            "v1",
            base64.b64encode(iv).decode("ascii"),
            base64.b64encode(tag).decode("ascii"),
            base64.b64encode(ct).decode("ascii"),
        ]
    )
