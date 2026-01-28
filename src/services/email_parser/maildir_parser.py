"""Maildir format email parser implementation."""

import mailbox
from email.message import Message
from email.utils import parseaddr
from pathlib import Path
from typing import Iterator, Optional, Tuple

from src.utils.path_utils import normalize_message_id
from src.utils.unicode_utils import decode_email_header
from .base import EmailMetadata, EmailParser, EmailParseError, InvalidFormatError


class MaildirParser(EmailParser):
    """Email parser for Maildir format directories."""

    def parse(self, email_path: Path) -> Iterator[Tuple[str, Message]]:
        """
        Parse Maildir directory and yield (key, message) tuples.

        Args:
            email_path: Path to Maildir directory

        Yields:
            Tuple of (message_key, email.message.Message)

        Raises:
            FileNotFoundError: If directory doesn't exist
            EmailParseError: If not a valid Maildir
        """
        if not email_path.exists():
            raise FileNotFoundError(f"Maildir not found: {email_path}")

        try:
            maildir = mailbox.Maildir(str(email_path), create=False)

            for key, message in maildir.items():
                # key is the Maildir message filename
                yield key, message

            maildir.close()

        except mailbox.NoSuchMailboxError:
            raise InvalidFormatError(f"Not a valid Maildir: {email_path}")
        except Exception as e:
            raise EmailParseError(f"Error parsing Maildir {email_path}: {e}")

    def detect_format(self, email_path: Path) -> str:
        """
        Detect if path is a Maildir directory.

        Args:
            email_path: Path to check

        Returns:
            'maildir' if directory is Maildir format, 'unknown' otherwise
        """
        if not email_path.exists() or not email_path.is_dir():
            return "unknown"

        # Check for Maildir subdirectories
        maildir_subdirs = {"cur", "new", "tmp"}
        existing_subdirs = {p.name for p in email_path.iterdir() if p.is_dir()}

        if maildir_subdirs.issubset(existing_subdirs):
            # Try to open as Maildir
            try:
                maildir = mailbox.Maildir(str(email_path), create=False)
                maildir.close()
                return "maildir"
            except Exception:
                pass

        return "unknown"

    def get_message_id(self, message: Message) -> Optional[str]:
        """
        Extract Message-ID from email message.

        Args:
            message: email.message.Message object

        Returns:
            Message-ID string with angle brackets, or None if missing
        """
        message_id = message.get("Message-ID")

        if not message_id:
            return None

        try:
            return normalize_message_id(message_id)
        except ValueError:
            return message_id

    def extract_metadata(self, message: Message, file_path: Path) -> EmailMetadata:
        """
        Extract structured metadata from email message.

        Args:
            message: email.message.Message object
            file_path: Path to Maildir directory

        Returns:
            EmailMetadata object

        Raises:
            MetadataExtractionError: If required headers are missing
        """
        from email.utils import parsedate_to_datetime
        from .base import MetadataExtractionError, MessageIdNotFoundError

        # Extract Message-ID
        message_id = self.get_message_id(message)
        if not message_id:
            raise MessageIdNotFoundError("Message-ID header is missing")

        # Extract sender
        sender_header = message.get("From", "")
        name, email_addr = parseaddr(sender_header)

        if name:
            name = decode_email_header(name)

        # Extract subject
        subject = message.get("Subject", "")
        if subject:
            subject = decode_email_header(subject)

        # Extract date
        date_header = message.get("Date")
        sent_date = parsedate_to_datetime(date_header) if date_header else None

        if not sent_date:
            raise MetadataExtractionError("Date header is missing")

        return EmailMetadata(
            message_id=message_id,
            sender_name=name or "",
            sender_email=email_addr,
            sent_date=sent_date,
            subject=subject or "",
            file_path=file_path,
            format="maildir",
            storage_offset=None,
            maildir_key=None,  # Would be set during iteration
        )
