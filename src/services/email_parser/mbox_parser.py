"""mbox format email parser implementation."""

import mailbox
from email.message import Message
from email.utils import parseaddr
from pathlib import Path
from typing import Iterator, Optional, Tuple

from src.utils.path_utils import normalize_message_id
from src.utils.unicode_utils import decode_email_header
from .base import EmailMetadata, EmailParser, EmailParseError, InvalidFormatError


class MboxParser(EmailParser):
    """Email parser for mbox format files."""

    def parse(self, email_path: Path) -> Iterator[Tuple[str, Message]]:
        """
        Parse mbox file and yield (identifier, message) tuples.

        Args:
            email_path: Path to mbox file

        Yields:
            Tuple of (message_key, email.message.Message)

        Raises:
            FileNotFoundError: If file doesn't exist
            EmailParseError: If file is not a valid mbox
        """
        if not email_path.exists():
            raise FileNotFoundError(f"Email file not found: {email_path}")

        try:
            mbox = mailbox.mbox(str(email_path), create=False)

            for key, message in mbox.items():
                # key is the message offset in mbox
                yield str(key), message

            mbox.close()

        except mailbox.NoSuchMailboxError:
            raise InvalidFormatError(f"Not a valid mbox file: {email_path}")
        except Exception as e:
            raise EmailParseError(f"Error parsing mbox file {email_path}: {e}")

    def detect_format(self, email_path: Path) -> str:
        """
        Detect if path is an mbox file.

        Args:
            email_path: Path to check

        Returns:
            'mbox' if file is mbox format, 'unknown' otherwise
        """
        if not email_path.exists():
            return "unknown"

        if email_path.is_file():
            # Try to open as mbox
            try:
                mbox = mailbox.mbox(str(email_path), create=False)
                mbox.close()
                return "mbox"
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
            file_path: Path to mbox file

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
            format="mbox",
            storage_offset=None,  # Would be set during iteration
            maildir_key=None,
        )
