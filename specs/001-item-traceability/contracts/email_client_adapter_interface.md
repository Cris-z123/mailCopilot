# Email Client Adapter Interface Contract

**Feature**: 001-item-traceability
**Module**: `src.services.linking.base`
**Version**: 1.0
**Date**: 2026-01-28

## Overview

Defines the abstract interface for email client adapters. Concrete implementations (`ThunderbirdAdapter`, `AppleMailAdapter`) MUST adhere to this contract to enable one-click deep linking to source emails.

---

## Abstract Interface

### Class: `EmailClientAdapter`

```python
from abc import ABC, abstractmethod
from typing import Optional
from pathlib import Path

class EmailClientAdapter(ABC):
    """
    Abstract interface for email client deep link generation.

    Supports pluggable email client integrations while providing
    a consistent API for deep link generation and execution.
    """

    @abstractmethod
    def generate_deep_link(self, message_id: str, file_path: Path) -> str:
        """
        Generate a deep link URL that opens the email in the client.

        Args:
            message_id: RFC 5322 Message-ID (with or without angle brackets)
            file_path: Path to email file (for fallback or additional context)

        Returns:
            Deep link URL (e.g., "thunderbird://message?id=abc@domain.com")

        Raises:
            MessageIdValidationError: If message_id is malformed

        Notes:
            - Message-ID is normalized (angle brackets added if missing)
            - URL format is client-specific (see implementation docs)
            - Returned URL is suitable for OS open commands
        """
        pass

    @abstractmethod
    def open_deep_link(self, deep_link: str) -> bool:
        """
        Execute the deep link to open the email client.

        Args:
            deep_link: URL string from generate_deep_link()

        Returns:
            True if client opened successfully, False otherwise

        Raises:
            ClientNotInstalledError: If client is not installed
            DeepLinkExecutionError: If execution fails for other reasons

        Notes:
            - Uses OS-specific mechanisms (subprocess, webbrowser, etc.)
            - Returns False gracefully if client not available
            - Caller should implement fallback (file path display) on False
        """
        pass

    @abstractmethod
    def is_client_installed(self) -> bool:
        """
        Check if the email client is installed on the system.

        Returns:
            True if client is detected, False otherwise

        Notes:
            - Uses OS-specific detection (registry, filesystem, etc.)
            - Cached result for performance (cache invalidated periodically)
            - False result triggers fallback UI
        """
        pass

    @property
    @abstractmethod
    def client_name(self) -> str:
        """
        Human-readable name of the email client.

        Returns:
            Client name (e.g., "Mozilla Thunderbird", "Apple Mail")

        Notes:
            - Used for UI display ("Open in {client_name}")
            - Must be localized if application supports i18n
        """
        pass

    @property
    @abstractmethod
    def client_id(self) -> str:
        """
        Machine-readable identifier for the client.

        Returns:
            Client ID (e.g., "thunderbird", "applemail")

        Notes:
            - Used in configuration files and database storage
            - MUST be lowercase alphanumeric with underscores
        """
        pass
```

---

## Helper Functions

### Message-ID Normalization

```python
import re

def normalize_message_id(message_id: str) -> str:
    """
    Normalize Message-ID to standard format with angle brackets.

    Args:
        message_id: Raw Message-ID (may or may not have brackets)

    Returns:
        Message-ID in format <id@domain>

    Raises:
        MessageIdValidationError: If message_id is empty or malformed

    Examples:
        >>> normalize_message_id("abc@domain.com")
        "<abc@domain.com>"
        >>> normalize_message_id("<abc@domain.com>")
        "<abc@domain.com>"
    """
    if not message_id or not message_id.strip():
        raise MessageIdValidationError("Message-ID is empty")

    # Remove whitespace
    clean_id = message_id.strip()

    # Remove existing angle brackets
    if clean_id.startswith('<'):
        clean_id = clean_id[1:]
    if clean_id.endswith('>'):
        clean_id = clean_id[:-1]

    # Basic format validation (id@domain pattern)
    if '@' not in clean_id:
        raise MessageIdValidationError(
            f"Invalid Message-ID format: {message_id}"
        )

    return f"<{clean_id}>"
```

---

## Error Definitions

### Custom Exceptions

```python
class EmailClientError(Exception):
    """Base exception for email client adapter errors."""
    pass

class MessageIdValidationError(EmailClientError):
    """Raised when Message-ID is malformed or missing."""
    pass

class ClientNotInstalledError(EmailClientError):
    """Raised when email client is not installed on the system."""
    pass

class DeepLinkExecutionError(EmailClientError):
    """Raised when deep link execution fails."""
    pass
```

---

## Implementation Requirements

### Concrete Implementations MUST:

1. **Inherit from `EmailClientAdapter`**
   ```python
   class ThunderbirdAdapter(EmailClientAdapter):
       # Implementation...
   ```

2. **Implement all abstract methods and properties**
   - `generate_deep_link()`: Return client-specific URL scheme
   - `open_deep_link()`: Execute URL with OS-specific command
   - `is_client_installed()`: Detect client presence
   - `client_name`: Return display name
   - `client_id`: Return machine identifier

3. **Handle edge cases**
   - Client not installed → Return `False` from `is_client_installed()`
   - Deep link execution failure → Return `False` from `open_deep_link()`
   - Message-ID not found in client → Client handles, return `True` from `open_deep_link()`
   - File moved/deleted → Display clear error in report (not adapter's responsibility)

4. **Platform-specific behavior**
   - Windows: Use `webbrowser.open()` or `subprocess.Popen()`
   - macOS: Use `subprocess.run(["open", url])`
   - Linux: Use `subprocess.run(["xdg-open", url])`

5. **URL scheme standards**
   - Thunderbird: `thunderbird://message?id=<message-id-without-brackets>`
   - Apple Mail: `message://<message-id-without-brackets>`
   - Future: Follow client documentation

---

## Testing Requirements

### Contract Tests (if tests are included)

All implementations MUST pass these contract tests:

1. **Deep Link Generation Test**
   ```python
   def test_generate_deep_link_standard(self):
       adapter = ThunderbirdAdapter()
       result = adapter.generate_deep_link(
           "<abc@domain.com>",
           Path("/path/to/email.mbox")
       )
       assert result == "thunderbird://message?id=abc@domain.com"
   ```

2. **Message-ID Normalization Test**
   ```python
   def test_generate_deep_link_normalizes_id(self):
       adapter = ThunderbirdAdapter()
       result = adapter.generate_deep_link(
           "abc@domain.com",  # No brackets
           Path("/path/to/email.mbox")
       )
       assert result == "thunderbird://message?id=abc@domain.com"
   ```

3. **Client Detection Test**
   ```python
   def test_is_client_installed(self):
       adapter = ThunderbirdAdapter()
       result = adapter.is_client_installed()
       assert isinstance(result, bool)
   ```

---

## Usage Example

```python
from pathlib import Path
from src.services.linking.base import EmailClientAdapter
from src.services.linking.thunderbird_adapter import ThunderbirdAdapter
from src.services.linking.applemail_adapter import AppleMailAdapter

def create_adapter(client_id: str) -> EmailClientAdapter:
    """Factory function to create appropriate adapter."""
    adapters = {
        "thunderbird": ThunderbirdAdapter,
        "applemail": AppleMailAdapter,
    }

    adapter_class = adapters.get(client_id)
    if not adapter_class:
        raise ValueError(f"Unsupported client: {client_id}")

    adapter = adapter_class()

    if not adapter.is_client_installed():
        raise ClientNotInstalledError(
            f"{adapter.client_name} is not installed"
        )

    return adapter

# Usage
try:
    adapter = create_adapter("thunderbird")
    deep_link = adapter.generate_deep_link(
        "<abc123@domain.com>",
        Path("/path/to/email.mbox")
    )
    success = adapter.open_deep_link(deep_link)

    if not success:
        # Fallback: Display file path
        print(f"Cannot open email. Location: /path/to/email.mbox")

except ClientNotInstalledError as e:
    print(f"Error: {e}")
    # Fallback UI
```

---

## Fallback Strategy

### When Deep Link Fails

If `open_deep_link()` returns `False` or raises exception:

1. **Display file path prominently**
   ```
   Original Email Location:
   /path/to/email.mbox (offset: 1234567)
   ```

2. **Offer manual open option**
   - Button: "Open in File Browser"
   - Action: Execute OS file browser with file selected

3. **Show clear error message**
   - If client not installed: "Thunderbird is not installed on this system"
   - If execution failed: "Could not open email client. Please open manually."

---

## Versioning

- **Current Version**: 1.0
- **Backward Compatibility**: MUST maintain compatibility with existing implementations
- **Deprecation**: Provide 2-version notice before removing methods

---

## Future Extensions

### Planned for V1.1:
- Add support for Microsoft Outlook (Windows)
- Add support for Evolution (Linux)
- Add `get_email_position()` method for highlighting specific text

### Planned for V2.0:
- Support for web-based clients (Gmail, Outlook Web)
- Custom adapter registration (user-provided scripts)
