"""Apple Mail email client adapter."""

import platform
import subprocess
from pathlib import Path
from typing import Optional

from .base import EmailClientAdapter, ClientNotInstalledError, DeepLinkExecutionError, MessageIdValidationError, normalize_message_id


class AppleMailAdapter(EmailClientAdapter):
    """Email client adapter for Apple Mail."""

    def __init__(self):
        """Initialize Apple Mail adapter."""
        self._installed_cache: Optional[bool] = None

    @property
    def client_name(self) -> str:
        """Human-readable client name."""
        return "Apple Mail"

    @property
    def client_id(self) -> str:
        """Machine-readable client identifier."""
        return "applemail"

    def generate_deep_link(self, message_id: str, file_path: Path) -> str:
        """
        Generate message:// deep link (RFC 2392).

        Args:
            message_id: RFC 5322 Message-ID
            file_path: Path to email file (for context, not used in URL)

        Returns:
            Deep link URL: message://<message-id-without-brackets>
        """
        try:
            # Normalize Message-ID
            normalized_id = normalize_message_id(message_id)

            # Remove angle brackets for URL
            clean_id = normalized_id.strip("<>")

            return f"message://{clean_id}"

        except Exception as e:
            raise MessageIdValidationError(f"Invalid Message-ID: {e}")

    def open_deep_link(self, deep_link: str) -> bool:
        """
        Open deep link in Apple Mail.

        Args:
            deep_link: Message URL

        Returns:
            True if successful, False otherwise

        Raises:
            ClientNotInstalledError: If Apple Mail is not installed
            DeepLinkExecutionError: If execution fails
        """
        if platform.system() != "Darwin":
            raise ClientNotInstalledError("Apple Mail is only available on macOS")

        if not self.is_client_installed():
            raise ClientNotInstalledError(f"{self.client_name} is not installed")

        try:
            subprocess.run(["open", deep_link], check=True)
            return True

        except subprocess.CalledProcessError as e:
            raise DeepLinkExecutionError(f"Failed to open Apple Mail: {e}")
        except Exception as e:
            raise DeepLinkExecutionError(f"Unexpected error: {e}")

    def is_client_installed(self) -> bool:
        """
        Check if Apple Mail is installed.

        Returns:
            True if Apple Mail is detected, False otherwise
        """
        if platform.system() != "Darwin":
            self._installed_cache = False
            return False

        if self._installed_cache is not None:
            return self._installed_cache

        try:
            # Check for Apple Mail application
            result = subprocess.run(
                ["mdfind", "kMDItemCFBundleIdentifier==com.apple.Mail"],
                capture_output=True,
            )
            self._installed_cache = result.returncode == 0
            return self._installed_cache

        except Exception:
            self._installed_cache = False
            return False
