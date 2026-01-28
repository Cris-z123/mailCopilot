"""Tests for MetadataFormatter."""

import pytest
from datetime import datetime

from src.services.reporting.metadata_formatter import MetadataFormatter


class TestMetadataFormatter:
    """Test metadata formatting for reports."""

    @pytest.fixture
    def default_config(self):
        """Default configuration for formatter."""
        return {
            "traceability": {
                "display_templates": {
                    "source_metadata": "📧 来源：{sender} | {date} | {subject}",
                    "anomaly_marker": "[索引异常]"
                }
            }
        }

    @pytest.fixture
    def formatter(self, default_config):
        """Create MetadataFormatter with default config."""
        return MetadataFormatter(default_config)

    def test_format_source_metadata(self, formatter):
        """Test formatting source metadata."""
        result = formatter.format_source_metadata(
            sender_name="John Doe",
            sender_email="john@example.com",
            sent_date=datetime(2025, 1, 13, 10, 30, 0),
            subject="Test Subject"
        )

        assert "📧 来源：" in result
        assert "john@example.com" in result
        assert "2025-01-13" in result
        assert "Test Subject" in result

    def test_format_source_metadata_long_subject(self, formatter):
        """Test formatting with long subject (should be truncated)."""
        long_subject = "This is an extremely long subject line that exceeds fifty characters and should be truncated"
        result = formatter.format_source_metadata(
            sender_name="Sender",
            sender_email="sender@example.com",
            sent_date=datetime.now(),
            subject=long_subject
        )

        # Subject should be truncated
        assert "..." in result
        assert len([line for line in result.split(" | ") if len(line) > 60]) == 0

    def test_format_source_metadata_empty_sender_name(self, formatter):
        """Test formatting with empty sender name."""
        result = formatter.format_source_metadata(
            sender_name="",
            sender_email="sender@example.com",
            sent_date=datetime.now(),
            subject="Test"
        )

        # Should use email when name is empty
        assert "sender@example.com" in result

    def test_get_anomaly_marker(self, formatter):
        """Test getting anomaly marker."""
        marker = formatter.get_anomaly_marker()
        assert marker == "[索引异常]"

    def test_format_source_metadata_custom_template(self):
        """Test formatting with custom template."""
        custom_config = {
            "traceability": {
                "display_templates": {
                    "source_metadata": "From: {sender} on {date}",
                    "anomaly_marker": "[ANOMALY]"
                }
            }
        }
        formatter = MetadataFormatter(custom_config)

        result = formatter.format_source_metadata(
            sender_name="Test",
            sender_email="test@example.com",
            sent_date=datetime(2025, 1, 13),
            subject="Subject"
        )

        assert result.startswith("From:")
        assert "on 2025-01-13" in result
