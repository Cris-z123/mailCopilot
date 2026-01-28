"""Email client deep linking services."""

from .base import (
    EmailClientAdapter,
    ClientNotInstalledError,
    DeepLinkExecutionError,
    EmailClientError,
    MessageIdValidationError,
    normalize_message_id,
)
from .thunderbird_adapter import ThunderbirdAdapter
from .applemail_adapter import AppleMailAdapter
from .client_detector import ClientDetector

__all__ = [
    "EmailClientAdapter",
    "ClientNotInstalledError",
    "DeepLinkExecutionError",
    "EmailClientError",
    "MessageIdValidationError",
    "normalize_message_id",
    "ThunderbirdAdapter",
    "AppleMailAdapter",
    "ClientDetector",
]
