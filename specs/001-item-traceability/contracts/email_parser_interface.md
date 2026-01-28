# Email Parser Interface Contract

**Feature**: 001-item-traceability
**Module**: `src.services.email_parser.base`
**Version**: 1.0
**Date**: 2026-01-28

## Overview

Defines the abstract interface for email parsing implementations. Concrete implementations (`MboxParser`, `MaildirParser`) MUST adhere to this contract to ensure pluggability and testability.

---

## Abstract Interface

### Class: `EmailParser`

```python
from abc import ABC, abstractmethod
from email.message import Message
from typing import Iterator, Tuple, Optional
from pathlib import Path

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
            EmailMetadata object with fields:
                - message_id: str (required)
                - sender_name: str (decoded Unicode)
                - sender_email: str (RFC 5322 addr-spec)
                - sent_date: datetime (timezone-aware)
                - subject: str (decoded Unicode)
                - file_path: Path
                - format: str ('mbox' or 'maildir')
                - storage_offset: Optional[int] (mbox only)
                - maildir_key: Optional[str] (Maildir only)

        Raises:
            MetadataExtractionError: If required headers are missing or invalid

        Notes:
            - Decodes RFC 2047 encoded words in headers
            - Handles folded headers (RFC 5322 section 2.2.3)
            - Normalizes date to UTC timezone
        """
        pass
```

---

## Data Classes

### EmailMetadata

```python
from dataclasses import dataclass
from datetime import datetime
from typing import Optional
from pathlib import Path

@dataclass
class EmailMetadata:
    """Structured metadata extracted from email message."""

    message_id: str
    sender_name: str
    sender_email: str
    sent_date: datetime
    subject: str
    file_path: Path
    format: str  # 'mbox' or 'maildir'
    storage_offset: Optional[int] = None  # mbox only
    maildir_key: Optional[str] = None  # Maildir only

    def __post_init__(self):
        """Validate metadata after initialization."""
        if not self.message_id:
            raise ValueError("message_id is required")
        if not self.sender_email:
            raise ValueError("sender_email is required")
        if self.format not in ('mbox', 'maildir'):
            raise ValueError(f"Invalid format: {self.format}")
        if self.format == 'mbox' and self.storage_offset is None:
            raise ValueError("storage_offset required for mbox format")
        if self.format == 'maildir' and self.maildir_key is None:
            raise ValueError("maildir_key required for Maildir format")
```

---

## Error Definitions

### Custom Exceptions

```python
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
```

---

## Implementation Requirements

### Concrete Implementations MUST:

1. **Inherit from `EmailParser`**
   ```python
   class MboxParser(EmailParser):
       # Implementation...
   ```

2. **Implement all abstract methods**
   - `parse()`: Yield (identifier, message) tuples
   - `detect_format()`: Return format identifier
   - `get_message_id()`: Extract and normalize Message-ID
   - `extract_metadata()`: Return populated `EmailMetadata`

3. **Handle edge cases**
   - Missing or malformed Message-ID → Return `None` from `get_message_id()`
   - Corrupted email files → Raise `EmailParseError` with descriptive message
   - Invalid encodings → Use UTF-8 with error replacement
   - Locked mailboxes → Implement retry with exponential backoff

4. **Thread safety**
   - Implementations MUST be thread-safe for parallel email processing
   - Use file locking if accessing shared resources

5. **Resource cleanup**
   - Close file handles in `parse()` after iteration completes
   - Use context managers where applicable

---

## Testing Requirements

### Contract Tests (if tests are included)

All implementations MUST pass these contract tests:

1. **Format Detection Test**
   ```python
   def test_detect_format_mbox(self):
       parser = MboxParser()
       result = parser.detect_format(Path("/path/to/mbox"))
       assert result == "mbox"
   ```

2. **Message-ID Extraction Test**
   ```python
   def test_get_message_id_standard(self):
       parser = MboxParser()
       message = Message()
       message["Message-ID"] = "<abc123@domain.com>"
       result = parser.get_message_id(message)
       assert result == "<abc123@domain.com>"
   ```

3. **Metadata Extraction Test**
   ```python
   def test_extract_metadata_complete(self):
       parser = MboxParser()
       # Create test message with all headers
       metadata = parser.extract_metadata(message, Path("/test.mbox"))
       assert metadata.message_id is not None
       assert metadata.sender_email is not None
       assert isinstance(metadata.sent_date, datetime)
   ```

---

## Usage Example

```python
from pathlib import Path
from src.services.email_parser.base import EmailParser
from src.services.email_parser.mbox_parser import MboxParser
from src.services.email_parser.maildir_parser import MaildirParser

def create_parser(email_path: Path) -> EmailParser:
    """Factory function to create appropriate parser."""
    detector = MboxParser()  # Can detect both formats
    format_type = detector.detect_format(email_path)

    if format_type == "mbox":
        return MboxParser()
    elif format_type == "maildir":
        return MaildirParser()
    else:
        raise InvalidFormatError(f"Unknown format: {format_type}")

# Usage
parser = create_parser(Path("/path/to/email.mbox"))
for msg_id, message in parser.parse(Path("/path/to/email.mbox")):
    metadata = parser.extract_metadata(message, Path("/path/to/email.mbox"))
    print(f"Email from {metadata.sender_name}: {metadata.subject}")
```

---

## Versioning

- **Current Version**: 1.0
- **Backward Compatibility**: MUST maintain compatibility with existing implementations
- **Deprecation**: Provide 2-version notice before removing methods

---

## Future Extensions

### Planned for V1.1:
- Add `parse_batch()` method for batch processing optimizations
- Support for additional formats (IMAP, Gmail API)
- Progress callbacks for long-running operations

### Planned for V2.0:
- Async parsing support
- Streaming parser for very large mailboxes
