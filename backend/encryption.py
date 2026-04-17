"""
Cifrado simétrico para datos sensibles (IBAN, contraseñas SMTP).
Usa Fernet (AES-128-CBC) derivando la clave del SECRET_KEY del entorno.
"""

import base64
import hashlib
import os
import logging
from typing import Optional

logger = logging.getLogger(__name__)

_fernet = None


def _get_fernet():
    global _fernet
    if _fernet is not None:
        return _fernet
    try:
        from cryptography.fernet import Fernet
        secret = os.getenv("SECRET_KEY", "fallback-key-do-not-use-in-production")
        # SHA-256 del SECRET_KEY → 32 bytes → base64url → clave Fernet válida
        key = base64.urlsafe_b64encode(hashlib.sha256(secret.encode()).digest())
        _fernet = Fernet(key)
        return _fernet
    except ImportError:
        logger.error("cryptography no instalado. pip install cryptography")
        return None


def encrypt(value: str) -> str:
    """Cifra un string y devuelve el token cifrado como string."""
    f = _get_fernet()
    if not f:
        return value  # Fallback: sin cifrado
    return f.encrypt(value.encode()).decode()


def decrypt(value: str) -> str:
    """Descifra un token Fernet. Devuelve el valor original."""
    f = _get_fernet()
    if not f:
        return value
    try:
        return f.decrypt(value.encode()).decode()
    except Exception:
        # Si falla (valor no cifrado o key cambiada), devolver tal cual
        return value


def encrypt_if_sensitive(key: str, value: str) -> tuple[str, bool]:
    """
    Cifra el valor si la clave es sensible.
    Devuelve (valor_almacenado, fue_cifrado).
    """
    SENSITIVE = {"iban", "smtp_password"}
    if key in SENSITIVE and value:
        return encrypt(value), True
    return value, key in SENSITIVE


def decrypt_if_encrypted(value: Optional[str], is_encrypted: bool) -> str:
    """Descifra si el flag indica que está cifrado."""
    if not value:
        return ""
    if is_encrypted:
        return decrypt(value)
    return value
