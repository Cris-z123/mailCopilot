"""Metadata formatting for report generation."""

from datetime import datetime
from typing import Dict

from src.utils.unicode_utils import truncate_subject


class MetadataFormatter:
    """Format source metadata for display in reports."""

    def __init__(self, config: Dict):
        """
        Initialize formatter with configuration.

        Args:
            config: Configuration dict with display_templates
        """
        self.source_template = (
            config.get("traceability", {})
            .get("display_templates", {})
            .get(
                "source_metadata",
                "📧 来源：{sender} | {date} | {subject}",
            )
        )
        self.anomaly_marker = (
            config.get("traceability", {})
            .get("display_templates", {})
            .get("anomaly_marker", "[索引异常]")
        )

    def format_source_metadata(
        self,
        sender_name: str,
        sender_email: str,
        sent_date: datetime,
        subject: str,
    ) -> str:
        """
        Format source metadata string.

        Args:
            sender_name: Sender display name
            sender_email: Sender email address
            sent_date: Email sent date
            subject: Email subject

        Returns:
            Formatted metadata string
        """
        # Format date
        date_str = sent_date.strftime("%Y-%m-%d %H:%M")

        # Truncate subject if needed
        subject_preview = truncate_subject(subject, max_length=50)

        # Format sender
        sender_display = f"{sender_name} <{sender_email}>" if sender_name else sender_email

        # Apply template
        return self.source_template.format(
            sender=sender_display,
            date=date_str,
            subject=subject_preview,
        )

    def get_anomaly_marker(self) -> str:
        """
        Get anomaly marker string.

        Returns:
            Anomaly marker (e.g., "[索引异常]")
        """
        return self.anomaly_marker
