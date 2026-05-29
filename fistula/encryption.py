import logging

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings

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
