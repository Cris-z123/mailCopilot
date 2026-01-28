"""Tests for MessageIdExtractor."""

import pytest
from pathlib import Path

from src.services.email_parser.message_id_extractor import MessageIdExtractor
from src.services.email_parser.base import EmailParseError, MessageIdNotFoundError


class TestMessageIdExtractor:
    """Test Message-ID extraction from email files."""

    @pytest.fixture
    def extractor(self):
        """Create a MessageIdExtractor instance."""
        return MessageIdExtractor()

    @pytest.fixture
    def valid_email_path(self):
        """Path to valid email fixture."""
        return Path(__file__).parent / "fixtures" / "emails" / "sample_valid.mbox"

    @pytest.fixture
    def missing_message_id_path(self):
        """Path to email without Message-ID."""
        return Path(__file__).parent / "fixtures" / "emails" / "sample_missing_message_id.mbox"

    @pytest.fixture
    def malformed_message_id_path(self):
        """Path to email with malformed Message-ID."""
        return Path(__file__).parent / "fixtures" / "emails" / "sample_malformed_message_id.mbox"

    @pytest.fixture
    def long_subject_path(self):
        """Path to email with long subject."""
        return Path(__file__).parent / "fixtures" / "emails" / "sample_long_subject.mbox"

    def test_extract_from_file_valid_email(self, extractor, valid_email_path):
        """Test extracting Message-ID from valid email."""
        message_id = extractor.extract_from_file(valid_email_path)
        assert message_id == "<test12345@example.com>"

    def test_extract_from_file_missing_message_id(self, extractor, missing_message_id_path):
        """Test extracting Message-ID from email without Message-ID."""
        message_id = extractor.extract_from_file(missing_message_id_path)
        assert message_id is None

    def test_extract_from_file_nonexistent_file(self, extractor):
        """Test extracting from non-existent file raises FileNotFoundError."""
        with pytest.raises(FileNotFoundError):
            extractor.extract_from_file(Path("/nonexistent/file.mbox"))

    def test_extract_metadata_valid_email(self, extractor, valid_email_path):
        """Test extracting full metadata from valid email."""
        metadata = extractor.extract_metadata(valid_email_path)

        assert metadata is not None
        assert metadata.message_id == "<test12345@example.com>"
        assert metadata.sender_email == "sender@example.com"
        assert metadata.subject == "Test Email with Valid Message-ID"
        assert metadata.file_path == valid_email_path
        assert metadata.format == "mbox"
        assert metadata.sent_date is not None

    def test_extract_metadata_missing_message_id(self, extractor, missing_message_id_path):
        """Test extracting metadata from email without Message-ID raises error."""
        with pytest.raises(Exception):  # MessageIdNotFoundError wrapped in MetadataExtractionError
            extractor.extract_metadata(missing_message_id_path)

    def test_extract_metadata_malformed_message_id(self, extractor, malformed_message_id_path):
        """Test extracting metadata with malformed Message-ID."""
        metadata = extractor.extract_metadata(malformed_message_id_path)

        # Should still extract metadata even with malformed Message-ID
        assert metadata is not None
        assert metadata.message_id == "invalid-format"
        assert metadata.subject == "Test Email with Malformed Message-ID"

    def test_extract_metadata_long_subject(self, extractor, long_subject_path):
        """Test extracting metadata with long subject line."""
        metadata = extractor.extract_metadata(long_subject_path)

        assert metadata is not None
        assert "This is an extremely long subject line" in metadata.subject
        assert metadata.sender_name == "Very Long Name That Goes On And On"

    def test_detect_format_mbox(self, extractor, valid_email_path):
        """Test format detection for mbox file."""
        format_type = extractor._detect_format(valid_email_path)
        assert format_type == "mbox"

    def test_detect_format_unknown(self, extractor, tmp_path):
        """Test format detection for unknown path."""
        # Create a directory without Maildir structure
        unknown_dir = tmp_path / "unknown"
        unknown_dir.mkdir()

        format_type = extractor._detect_format(unknown_dir)
        assert format_type == "unknown"
