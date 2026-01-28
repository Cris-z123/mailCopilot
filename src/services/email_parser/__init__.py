"""Email parsing services."""

from .base import EmailParser, EmailMetadata, EmailParseError
from .message_id_extractor import MessageIdExtractor
from .mbox_parser import MboxParser
from .maildir_parser import MaildirParser

__all__ = [
    "EmailParser",
    "EmailMetadata",
    "EmailParseError",
    "MessageIdExtractor",
    "MboxParser",
    "MaildirParser",
]
