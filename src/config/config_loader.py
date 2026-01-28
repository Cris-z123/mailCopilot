"""Configuration loader for application settings."""

import json
from pathlib import Path
from typing import Optional

from pydantic import ValidationError

from .traceability_config import AppConfig


class ConfigLoader:
    """Load and validate application configuration."""

    DEFAULT_CONFIG_PATHS = [
        Path("~/.maildigest/app_config.json"),
        Path("config/app_config.json"),
    ]

    def __init__(self, config_path: Optional[Path] = None):
        """
        Initialize configuration loader.

        Args:
            config_path: Optional custom config file path
        """
        self.config_path = config_path
        self._config: Optional[AppConfig] = None

    def load_app_config(self) -> AppConfig:
        """
        Load application configuration from file.

        Returns:
            AppConfig instance

        Raises:
            FileNotFoundError: If no config file found
            ValidationError: If config is invalid
        """
        if self._config is not None:
            return self._config

        config_paths = [self.config_path] if self.config_path else self.DEFAULT_CONFIG_PATHS

        for config_path in config_paths:
            if config_path and config_path.expanduser().exists():
                try:
                    with open(config_path.expanduser(), "r", encoding="utf-8") as f:
                        config_data = json.load(f)
                    self._config = AppConfig(**config_data)
                    return self._config
                except (json.JSONDecodeError, ValidationError) as e:
                    raise ValidationError(f"Invalid config in {config_path}: {e}")

        # Return default config if no file found
        self._config = AppConfig()
        return self._config

    def load_traceability_rules(self) -> dict:
        """
        Load traceability rules from configuration.

        Returns:
            Dictionary of traceability rules
        """
        config = self.load_app_config()

        # Convert Pydantic model to dict for easy access
        rules = {
            "message_id_validation": config.traceability.message_id_validation_rules.model_dump(),
            "display_templates": config.traceability.display_templates.model_dump(),
            "anomaly_handling": {
                "fail_on_missing_message_id": False,
                "fail_on_malformed_message_id": False,
                "log_all_anomalies": True,
                "show_anomaly_summary_in_report": True,
            },
            "duplicate_detection": {
                "enabled": True,
                "use_composite_key": True,
                "composite_key_format": "{message_id}:{file_path}",
            },
        }

        return rules

    def reload(self) -> AppConfig:
        """Reload configuration from file."""
        self._config = None
        return self.load_app_config()
