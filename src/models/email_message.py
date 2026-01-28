"""Email message data model."""

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Optional


@dataclass
class EmailMessage:
    """
    Represents the source email from which items are extracted.

    Attributes:
        message_id: RFC 5322 Message-ID (unique identifier)
        sender_name: Display name from From header
        sender_email: Email address from From header
        sent_date: Date/Time from Date header
        subject: Email subject line
        file_path: Absolute path to email file
        format: Email storage format ('mbox' or 'maildir')
        storage_offset: Byte offset in mbox file (mbox only)
        maildir_key: Message key in Maildir (Maildir only)
    """

    message_id: str
    sender_name: str
    sender_email: str
    sent_date: datetime
    subject: str
    file_path: Path
    format: str
    storage_offset: Optional[int] = None
    maildir_key: Optional[str] = None

    def __post_init__(self):
        """Validate fields after initialization."""
        if not self.message_id:
            raise ValueError("message_id is required")
        if not self.sender_email:
            raise ValueError("sender_email is required")
        if self.format not in ("mbox", "maildir"):
            raise ValueError(f"Invalid format: {self.format}")
        if self.format == "mbox" and self.storage_offset is None:
            raise ValueError("storage_offset required for mbox format")
        if self.format == "maildir" and self.maildir_key is None:
            raise ValueError("maildir_key required for Maildir format")
