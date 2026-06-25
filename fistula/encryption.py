import logging

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.db import models

logger = logging.getLogger('programs')


def _fernet() -> Fernet:
    key = settings.FERNET_KEY
    if not key:
        raise ValueError(
            'FERNET_KEY is not configured. '
            'Generate one with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"'
        )
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt(plaintext: str) -> str:
    if not plaintext:
        return ''
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str:
    if not ciphertext:
        return ''
    try:
        return _fernet().decrypt(ciphertext.encode()).decode()
    except InvalidToken:
        # Wrong/rotated key or corrupted ciphertext — never echo the raw
        # ciphertext back; blank + log (audit FIX H1). A missing FERNET_KEY
        # raises ValueError from _fernet() and is intentionally NOT caught
        # here so the misconfiguration surfaces loudly.
        logger.error('decrypt() failed (InvalidToken) — check FERNET_KEY')
        return ''


# ── Transparent encrypted model field for PII at rest ────────────────────────
# Shared by the CIPRB clinical models (fistula, MPDSR death notification, near
# miss) so they get the SAME encryption GBV already has, without a cross-app
# import (this module has no model deps). Dev/test WITHOUT a FERNET_KEY passes
# through in cleartext; production refuses to boot without the key
# (spondon/settings/production.py), so real data is ALWAYS encrypted at rest.

def _enc(value: str) -> str:
    if not value:
        return ''
    key = settings.FERNET_KEY
    if not key:                       # dev/test only — prod guards FERNET_KEY
        return value
    return Fernet(key.encode() if isinstance(key, str) else key).encrypt(
        value.encode()).decode()


def _dec(value: str) -> str:
    if not value:
        return ''
    key = settings.FERNET_KEY
    if not key:
        return value
    try:
        return Fernet(key.encode() if isinstance(key, str) else key).decrypt(
            value.encode()).decode()
    except InvalidToken:
        # Plaintext legacy rows / wrong key / corruption — never echo raw bytes.
        logger.error('EncryptedCharField decrypt failed (InvalidToken) — check FERNET_KEY')
        return ''


class EncryptedCharField(models.TextField):
    """Fernet-encrypt on save, decrypt on read. Stored as TextField because the
    ciphertext is longer than the plaintext. NEVER use on a field that is a DB
    filter / lookup / unique / order key — the column holds ciphertext."""

    def from_db_value(self, value, expression, connection):
        return _dec(value) if value else value

    def pre_save(self, model_instance, add):
        value = super().pre_save(model_instance, add)
        enc = _enc(value)
        setattr(model_instance, self.attname, enc)
        return enc
