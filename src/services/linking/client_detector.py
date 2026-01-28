"""Email client detection utility."""

import platform
import subprocess
from typing import Optional

from .base import EmailClientAdapter, ClientNotInstalledError
from .applemail_adapter import AppleMailAdapter
from .thunderbird_adapter import ThunderbirdAdapter


class ClientDetector:
    """Detects default email client and returns appropriate adapter."""

    def __init__(self):
        """Initialize client detector."""
        self._default_client: Optional[str] = None

    def detect_default_client(self) -> str:
        """
        Detect system's default email client.

        Returns:
            Client ID: 'thunderbird', 'applemail', or 'unknown'

        Notes:
            - Uses OS-specific detection methods
            - Windows: Registry query
            - macOS: defaults read
            - Linux: xdg-email or desktop files
        """
        if self._default_client is not None:
            return self._default_client

        try:
            if platform.system() == "Windows":
                self._default_client = self._detect_windows()

            elif platform.system() == "Darwin":  # macOS
                self._default_client = self._detect_macos()

            else:  # Linux
                self._default_client = self._detect_linux()

        except Exception:
            self._default_client = "unknown"

        return self._default_client

    def get_adapter(self, client_id: Optional[str] = None) -> EmailClientAdapter:
        """
        Get email client adapter.

        Args:
            client_id: Optional specific client ID ('thunderbird', 'applemail')
                      If None, uses auto-detected default

        Returns:
            EmailClientAdapter instance

        Raises:
            ClientNotInstalledError: If client is not installed
        """
        if client_id is None:
            client_id = self.detect_default_client()

        # Map client_id to adapter class
        adapters = {
            "thunderbird": ThunderbirdAdapter,
            "applemail": AppleMailAdapter,
        }

        adapter_class = adapters.get(client_id)

        if not adapter_class:
            # Fallback to Thunderbird as default
            adapter_class = ThunderbirdAdapter

        adapter = adapter_class()

        if not adapter.is_client_installed():
            # Try to find any available adapter
            for backup_class in adapters.values():
                backup_adapter = backup_class()
                if backup_adapter.is_client_installed():
                    return backup_adapter

            raise ClientNotInstalledError("No supported email client detected")

        return adapter

    def _detect_windows(self) -> str:
        """Detect default email client on Windows."""
        try:
            import winreg

            key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Clients\Mail")
            client_name = winreg.QueryValueEx(key, None)[0]
            winreg.CloseKey(key)

            # Map to supported clients
            client_map = {
                "Thunderbird": "thunderbird",
                "Mozilla Thunderbird": "thunderbird",
                # Apple Mail not on Windows
            }

            return client_map.get(client_name, "unknown")

        except Exception:
            return "unknown"

    def _detect_macos(self) -> str:
        """Detect default email client on macOS."""
        try:
            result = subprocess.run(
                [
                    "defaults",
                    "read",
                    "com.apple.LaunchServices",
                    "LSHandlerRoleAllForContentType:public.email-message",
                ],
                capture_output=True,
                text=True,
            )

            client_bundle_id = result.stdout.strip()

            client_map = {
                "com.apple.Mail": "applemail",
                "org.mozilla.thunderbird": "thunderbird",
            }

            return client_map.get(client_bundle_id, "unknown")

        except Exception:
            return "unknown"

    def _detect_linux(self) -> str:
        """Detect default email client on Linux."""
        # Method 1: Check xdg-email
        try:
            result = subprocess.run(["xdg-email", "--version"], capture_output=True)
            if result.returncode == 0:
                # xdg-email handles defaults
                # Try to detect specific client
                return self._detect_linux_client()
        except FileNotFoundError:
            pass

        return "unknown"

    def _detect_linux_client(self) -> str:
        """Detect specific email client on Linux."""
        import os

        # Check desktop files
        desktop_dir = os.path.expanduser("~/.local/share/applications/")
        if os.path.exists(desktop_dir):
            for file in os.listdir(desktop_dir):
                if "thunderbird" in file.lower():
                    return "thunderbird"

        # Try which command
        try:
            result = subprocess.run(["which", "thunderbird"], capture_output=True)
            if result.returncode == 0:
                return "thunderbird"
        except FileNotFoundError:
            pass

        return "unknown"
