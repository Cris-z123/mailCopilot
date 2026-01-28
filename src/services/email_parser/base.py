"""Abstract interface for email parsing implementations."""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from email.message import Message
from pathlib import Path
from typing import Iterator, Optional, Tuple


class EmailParseError(Exception):
    """Base exception for email parsing errors."""

    pass


class InvalidFormatError(EmailParseError):
    """Raised when email format is not recognized or supported."""

    pass


class MetadataExtractionError(EmailParseError):
    """Raised when required metadata cannot be extracted."""

    pass


class MessageIdNotFoundError(MetadataExtractionError):
    """Raised when Message-ID header is missing."""

    pass


@dataclass
class EmailMetadata:
    """
    Structured metadata extracted from email message.

    Attributes:
        message_id: RFC 5322 Message-ID
        sender_name: Display name from From header
        sender_email: Email address from From header
        sent_date: Date/Time from Date header
        subject: Email subject line
        file_path: Path to email file
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
        """Validate metadata after initialization."""
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


class EmailParser(ABC):
    """
    Abstract interface for email parsing implementations.

    Supports pluggable email storage formats (mbox, Maildir, etc.)
    while providing a consistent API for the rest of the system.
    """

    @abstractmethod
    def parse(self, email_path: Path) -> Iterator[Tuple[str, Message]]:
        """
        Parse emails from the given path and yield (identifier, message) tuples.

        Args:
            email_path: Path to email file or directory

        Yields:
            Tuple of (message_identifier, email.message.Message)

        Raises:
            FileNotFoundError: If email_path does not exist
            EmailParseError: If email format is invalid or corrupted
            PermissionError: If read access is denied

        Notes:
            - Message identifier is format-specific (offset for mbox, key for Maildir)
            - Caller is responsible for closing resources if needed
            - Messages are parsed with policy=default for RFC compliance
        """
        pass

    @abstractmethod
    def detect_format(self, email_path: Path) -> str:
        """
        Detect the email storage format at the given path.

        Args:
            email_path: Path to email file or directory

        Returns:
            Format identifier: 'mbox', 'maildir', or 'unknown'

        Raises:
            FileNotFoundError: If email_path does not exist

        Notes:
            - Uses heuristics: file presence (mbox) vs directory structure (Maildir)
            - Maildir detection checks for cur/, new/, tmp/ subdirectories
        """
        pass

    @abstractmethod
    def get_message_id(self, message: Message) -> Optional[str]:
        """
        Extract Message-ID from email message.

        Args:
            message: email.message.Message object

        Returns:
            Message-ID string with angle brackets, or None if missing

        Notes:
            - Handles RFC 5322 format: <unique-id@domain>
            - Attempts normalization if angle brackets are missing
            - Returns None if Message-ID header is completely absent
        """
        pass

    @abstractmethod
    def extract_metadata(self, message: Message, file_path: Path) -> EmailMetadata:
        """
        Extract structured metadata from email message.

        Args:
            message: email.message.Message object
            file_path: Path to email file (for storage context)

        Returns:
            EmailMetadata object with extracted fields

        Raises:
            MetadataExtractionError: If required headers are missing or invalid

        Notes:
            - Decodes RFC 2047 encoded words in headers
            - Handles folded headers (RFC 5322 section 2.2.3)
            - Normalizes date to UTC timezone
        """
        pass
