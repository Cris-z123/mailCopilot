"""Business logic services"""

from .email_parser import MboxParser, MaildirParser, MessageIdExtractor
from .indexing import IndexValidator, ValidationResult
from .linking import (
    EmailClientAdapter,
    ThunderbirdAdapter,
    AppleMailAdapter,
    ClientDetector,
)
from .reporting import MetadataFormatter

__all__ = [
    "MboxParser",
    "MaildirParser",
    "MessageIdExtractor",
    "IndexValidator",
    "ValidationResult",
    "EmailClientAdapter",
    "ThunderbirdAdapter",
    "AppleMailAdapter",
    "ClientDetector",
    "MetadataFormatter",
]
