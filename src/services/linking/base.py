"""Abstract interface for email client deep linking."""

from abc import ABC, abstractmethod
from pathlib import Path
from typing import Optional


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
        '<abc@domain.com>'
        >>> normalize_message_id("<abc@domain.com>")
        '<abc@domain.com>'
    """
    if not message_id or not message_id.strip():
        raise MessageIdValidationError("Message-ID is empty")

    # Remove whitespace
    clean_id = message_id.strip()

    # Remove existing angle brackets
    if clean_id.startswith("<"):
        clean_id = clean_id[1:]
    if clean_id.endswith(">"):
        clean_id = clean_id[:-1]

    # Basic format validation (id@domain pattern)
    if "@" not in clean_id:
        raise MessageIdValidationError(f"Invalid Message-ID format: {message_id}")

    return f"<{clean_id}>"


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
