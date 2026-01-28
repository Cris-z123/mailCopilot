"""Message-ID extraction from email files."""

from email import message_from_binary_file
from email.policy import default
from email.utils import parseaddr, parsedate_to_datetime
from pathlib import Path
from typing import Optional

from src.utils.path_utils import normalize_message_id
from src.utils.unicode_utils import decode_email_header
from .base import EmailMetadata, EmailParseError, MetadataExtractionError, MessageIdNotFoundError


class MessageIdExtractor:
    """Extract Message-ID and metadata from email files."""

    def extract_from_file(self, file_path: Path) -> Optional[str]:
        """
        Extract Message-ID from email file.

        Args:
            file_path: Path to email file

        Returns:
            Message-ID string with angle brackets, or None if missing

        Raises:
            FileNotFoundError: If file doesn't exist
            EmailParseError: If file is corrupted
        """
        if not file_path.exists():
            raise FileNotFoundError(f"Email file not found: {file_path}")

        try:
            with open(file_path, "rb") as f:
                msg = message_from_binary_file(f, policy=default)

            return self.get_message_id(msg)

        except Exception as e:
            raise EmailParseError(f"Error parsing email file {file_path}: {e}")

    def get_message_id(self, message) -> Optional[str]:
        """
        Extract Message-ID from email message object.

        Args:
            message: email.message.Message object

        Returns:
            Message-ID string with angle brackets, or None if missing
        """
        message_id = message.get("Message-ID")

        if not message_id:
            return None

        try:
            # Normalize: Add angle brackets if missing
            return normalize_message_id(message_id)
        except ValueError:
            # Message-ID is malformed, return as-is
            return message_id

    def extract_metadata(self, file_path: Path) -> Optional[EmailMetadata]:
        """
        Extract all metadata from email file.

        Args:
            file_path: Path to email file

        Returns:
            EmailMetadata object, or None if extraction fails

        Raises:
            FileNotFoundError: If file doesn't exist
            MetadataExtractionError: If required headers are missing
        """
        if not file_path.exists():
            raise FileNotFoundError(f"Email file not found: {file_path}")

        try:
            with open(file_path, "rb") as f:
                msg = message_from_binary_file(f, policy=default)

            # Extract Message-ID
            message_id = self.get_message_id(msg)
            if not message_id:
                raise MessageIdNotFoundError("Message-ID header is missing")

            # Extract sender
            sender_header = msg.get("From", "")
            name, email_addr = parseaddr(sender_header)

            # Decode name if encoded
            if name:
                name = decode_email_header(name)

            # Extract subject
            subject = msg.get("Subject", "")
            if subject:
                subject = decode_email_header(subject)

            # Extract date
            date_header = msg.get("Date")
            sent_date = parsedate_to_datetime(date_header) if date_header else None

            if not sent_date:
                raise MetadataExtractionError("Date header is missing")

            # Detect format
            format_type = self._detect_format(file_path)

            # Set format-specific fields
            # For single file extraction, offset is 0 (start of file)
            storage_offset = 0 if format_type == "mbox" else None
            maildir_key = None  # Not applicable for single file extraction

            # Create metadata
            return EmailMetadata(
                message_id=message_id,
                sender_name=name or "",
                sender_email=email_addr,
                sent_date=sent_date,
                subject=subject or "",
                file_path=file_path,
                format=format_type,
                storage_offset=storage_offset,
                maildir_key=maildir_key,
            )

        except MessageIdNotFoundError as e:
            raise MetadataExtractionError(f"Cannot extract metadata: {e}")
        except Exception as e:
            raise MetadataExtractionError(f"Error extracting metadata: {e}")

    def _detect_format(self, file_path: Path) -> str:
        """
        Detect email storage format.

        Args:
            file_path: Path to email file or directory

        Returns:
            Format identifier: 'mbox' or 'maildir'
        """
        if file_path.is_file():
            return "mbox"
        elif file_path.is_dir():
            # Check for Maildir subdirectories
            maildir_subdirs = {"cur", "new", "tmp"}
            if maildir_subdirs.issubset(set(p.name for p in file_path.iterdir())):
                return "maildir"

        return "unknown"
