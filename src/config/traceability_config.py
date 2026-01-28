"""Configuration models for traceability feature."""

from pathlib import Path
from typing import Optional

from pydantic import BaseModel, Field, field_validator


class MessageIdValidationRules(BaseModel):
    """Validation rules for Message-ID extraction."""

    require_angle_brackets: bool = False
    allow_local_domains: bool = True
    min_length: int = 3
    max_length: int = 254

    @field_validator("min_length", "max_length")
    def validate_length(cls, v: int) -> int:
        if v < 1:
            raise ValueError("Length must be positive")
        return v


class DisplayTemplates(BaseModel):
    """Display templates for reports."""

    source_metadata: str = "📧 来源：{sender} | {date} | {subject}"
    anomaly_marker: str = "[索引异常]"


class TraceabilityConfig(BaseModel):
    """Traceability configuration settings."""

    message_id_validation_rules: MessageIdValidationRules = Field(
        default_factory=MessageIdValidationRules
    )
    display_templates: DisplayTemplates = Field(default_factory=DisplayTemplates)


class EmailClientConfig(BaseModel):
    """Email client configuration."""

    default_client: str = "auto-detect"
    deep_link_enabled: bool = True
    supported_clients: list[str] = Field(default_factory=lambda: ["thunderbird", "applemail"])


class StorageConfig(BaseModel):
    """Storage configuration."""

    database_path: str = "~/.maildigest/items.db"
    audit_log_path: str = "~/.maildigest/logs/audit.log"

    def get_database_path(self) -> Path:
        """Get expanded database path."""
        return Path(self.database_path).expanduser()

    def get_audit_log_path(self) -> Path:
        """Get expanded audit log path."""
        return Path(self.audit_log_path).expanduser()


class AppConfig(BaseModel):
    """Main application configuration."""

    schema_version: str = "1.0"
    email_client: EmailClientConfig = Field(default_factory=EmailClientConfig)
    traceability: TraceabilityConfig = Field(default_factory=TraceabilityConfig)
    storage: StorageConfig = Field(default_factory=StorageConfig)

    @field_validator("schema_version")
    def validate_schema_version(cls, v: str) -> str:
        if not v:
            raise ValueError("schema_version is required")
        return v
