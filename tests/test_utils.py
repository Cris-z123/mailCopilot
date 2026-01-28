"""Tests for utility functions."""

import pytest

from src.utils.path_utils import normalize_message_id
from src.utils.unicode_utils import decode_email_header, truncate_subject


class TestNormalizeMessageId:
    """Test Message-ID normalization."""

    def test_normalize_with_angle_brackets(self):
        """Test normalization with angle brackets present."""
        result = normalize_message_id("<test@example.com>")
        assert result == "<test@example.com>"

    def test_normalize_without_angle_brackets(self):
        """Test normalization adds angle brackets."""
        result = normalize_message_id("test@example.com")
        assert result == "<test@example.com>"

    def test_normalize_with_whitespace(self):
        """Test normalization strips whitespace."""
        result = normalize_message_id("  test@example.com  ")
        assert result == "<test@example.com>"

    def test_normalize_invalid_format_raises_error(self):
        """Test normalization raises ValueError for invalid format."""
        with pytest.raises(ValueError):
            normalize_message_id("invalid-format")


class TestDecodeEmailHeader:
    """Test email header decoding."""

    def test_decode_plain_text(self):
        """Test decoding plain text without encoding."""
        result = decode_email_header("Plain Text")
        assert result == "Plain Text"

    def test_decode_utf8_encoded(self):
        """Test decoding UTF-8 encoded header."""
        result = decode_email_header("=?utf-8?B?5Lit5paH?=")  # "中文" in base64
        assert result == "中文"

    def test_decode_iso8859_encoded(self):
        """Test decoding ISO-8859-1 encoded header."""
        result = decode_email_header("=?iso-8859-1?Q?H=E9llo?=")
        assert result == "Héllo"

    def test_decode_empty_string(self):
        """Test decoding empty string."""
        result = decode_email_header("")
        assert result == ""

    def test_decode_none_value(self):
        """Test decoding None returns empty string."""
        result = decode_email_header(None)
        assert result == ""


class TestTruncateSubject:
    """Test subject line truncation."""

    def test_truncate_short_subject(self):
        """Test truncation of short subject (no change)."""
        result = truncate_subject("Short subject", max_length=50)
        assert result == "Short subject"
        assert not result.endswith("...")

    def test_truncate_long_subject(self):
        """Test truncation of long subject."""
        long_subject = "This is a very long subject line that exceeds fifty characters"
        result = truncate_subject(long_subject, max_length=50)

        assert len(result) <= 53  # 50 + "..."
        assert result.endswith("...")
        assert "This is a very long subject" in result

    def test_truncate_exact_length(self):
        """Test truncation at exact max length."""
        subject = "a" * 50
        result = truncate_subject(subject, max_length=50)

        # Should not truncate if exactly at limit
        assert result == subject

    def test_truncate_one_over_limit(self):
        """Test truncation when one character over limit."""
        subject = "a" * 51
        result = truncate_subject(subject, max_length=50)

        # The function returns subject[:47] + "..." = 50 chars total
        assert len(result) == 50
        assert result.endswith("...")

    def test_truncate_custom_max_length(self):
        """Test truncation with custom max length."""
        long_subject = "This is a very long subject line"
        result = truncate_subject(long_subject, max_length=20)

        assert len(result) <= 23  # 20 + "..."
        assert result.endswith("...")

    def test_truncate_empty_string(self):
        """Test truncation of empty string."""
        result = truncate_subject("")
        assert result == ""

    def test_truncate_none_value(self):
        """Test truncation of None returns empty string."""
        result = truncate_subject(None)
        assert result == ""
