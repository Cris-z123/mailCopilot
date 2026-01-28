"""Mozilla Thunderbird email client adapter."""

import platform
import subprocess
import webbrowser
from pathlib import Path

from .base import EmailClientAdapter, ClientNotInstalledError, DeepLinkExecutionError, MessageIdValidationError, normalize_message_id


class ThunderbirdAdapter(EmailClientAdapter):
    """Email client adapter for Mozilla Thunderbird."""

    def __init__(self):
        """Initialize Thunderbird adapter."""
        self._installed_cache: Optional[bool] = None

    @property
    def client_name(self) -> str:
        """Human-readable client name."""
        return "Mozilla Thunderbird"

    @property
    def client_id(self) -> str:
        """Machine-readable client identifier."""
        return "thunderbird"

    def generate_deep_link(self, message_id: str, file_path: Path) -> str:
        """
        Generate thunderbird:// deep link.

        Args:
            message_id: RFC 5322 Message-ID
            file_path: Path to email file (for context, not used in URL)

        Returns:
            Deep link URL: thunderbird://message?id=<message-id-without-brackets>
        """
        try:
            # Normalize Message-ID
            normalized_id = normalize_message_id(message_id)

            # Remove angle brackets for URL
            clean_id = normalized_id.strip("<>")

            return f"thunderbird://message?id={clean_id}"

        except Exception as e:
            raise MessageIdValidationError(f"Invalid Message-ID: {e}")

    def open_deep_link(self, deep_link: str) -> bool:
        """
        Open deep link in Thunderbird.

        Args:
            deep_link: Thunderbird URL

        Returns:
            True if successful, False otherwise

        Raises:
            ClientNotInstalledError: If Thunderbird is not installed
            DeepLinkExecutionError: If execution fails
        """
        if not self.is_client_installed():
            raise ClientNotInstalledError(f"{self.client_name} is not installed")

        try:
            if platform.system() == "Darwin":  # macOS
                subprocess.run(["open", deep_link], check=True)
            elif platform.system() == "Windows":
                # Use webbrowser.open() for Windows
                webbrowser.open(deep_link)
            else:  # Linux
                subprocess.run(["xdg-open", deep_link], check=True)

            return True

        except subprocess.CalledProcessError as e:
            raise DeepLinkExecutionError(f"Failed to open Thunderbird: {e}")
        except Exception as e:
            raise DeepLinkExecutionError(f"Unexpected error: {e}")

    def is_client_installed(self) -> bool:
        """
        Check if Thunderbird is installed.

        Returns:
            True if Thunderbird is detected, False otherwise
        """
        if self._installed_cache is not None:
            return self._installed_cache

        try:
            if platform.system() == "Windows":
                # Check Windows registry
                import winreg

                key = winreg.OpenKey(
                    winreg.HKEY_LOCAL_MACHINE, r"Software\Clients\Mail\Mozilla Thunderbird"
                )
                winreg.CloseKey(key)
                self._installed_cache = True
                return True

            elif platform.system() == "Darwin":
                # Check macOS Applications
                result = subprocess.run(
                    ["mdfind", "kMDItemCFBundleIdentifier==org.mozilla.thunderbird"],
                    capture_output=True,
                )
                self._installed_cache = result.returncode == 0
                return self._installed_cache

            else:  # Linux
                # Check for thunderbird command
                result = subprocess.run(["which", "thunderbird"], capture_output=True)
                self._installed_cache = result.returncode == 0
                return self._installed_cache

        except Exception:
            self._installed_cache = False
            return False
