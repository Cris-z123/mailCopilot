"""Tests for IndexValidator."""

import pytest
from pathlib import Path

from src.services.indexing.index_validator import IndexValidator, ValidationResult
from src.models.index_anomaly import AnomalyType


class TestIndexValidator:
    """Test index validation and anomaly detection."""

    @pytest.fixture
    def validator(self):
        """Create an IndexValidator without repo."""
        return IndexValidator(anomaly_repo=None)

    @pytest.fixture
    def validator_with_repo(self, tmp_path):
        """Create an IndexValidator with in-memory database."""
        from src.storage.database import DatabaseConnection, IndexAnomalyRepository

        db_path = tmp_path / "test.db"
        db = DatabaseConnection(db_path)
        db.execute_schema()

        anomaly_repo = IndexAnomalyRepository(db)
        return IndexValidator(anomaly_repo=anomaly_repo)

    def test_validate_message_id_valid(self, validator):
        """Test validating a correct Message-ID."""
        result = validator.validate_message_id("<test@example.com>")

        assert result.is_valid is True
        assert result.anomaly_type is None
        assert result.error_details is None
        assert result.can_recover is True

    def test_validate_message_id_none(self, validator):
        """Test validating None Message-ID."""
        result = validator.validate_message_id(None)

        assert result.is_valid is False
        assert result.anomaly_type == "missing_message_id"
        assert "absent" in result.error_details.lower()
        assert result.can_recover is False

    def test_validate_message_id_empty_string(self, validator):
        """Test validating empty string Message-ID."""
        result = validator.validate_message_id("")

        assert result.is_valid is False
        assert result.anomaly_type == "missing_message_id"

    def test_validate_message_id_whitespace_only(self, validator):
        """Test validating whitespace-only Message-ID."""
        result = validator.validate_message_id("   ")

        assert result.is_valid is False
        assert result.anomaly_type == "missing_message_id"

    def test_validate_message_id_malformed_no_at(self, validator):
        """Test validating Message-ID without @ symbol."""
        result = validator.validate_message_id("invalid-format")

        assert result.is_valid is False
        assert result.anomaly_type == "malformed_message_id"
        assert "invalid" in result.error_details.lower()

    def test_validate_message_id_malformed_no_brackets(self, validator):
        """Test validating Message-ID without angle brackets (should be normalized)."""
        # The validator should normalize it by adding brackets
        result = validator.validate_message_id("test@example.com")

        assert result.is_valid is True

    def test_validate_message_id_with_brackets(self, validator):
        """Test validating Message-ID with angle brackets."""
        result = validator.validate_message_id("<test@example.com>")

        assert result.is_valid is True

    def test_validate_email_file_exists(self, validator, tmp_path):
        """Test validating existing email file."""
        test_file = tmp_path / "test.mbox"
        test_file.write_text("test content")

        result = validator.validate_email_file(test_file)

        assert result.is_valid is True
        assert result.anomaly_type is None

    def test_validate_email_file_not_found(self, validator):
        """Test validating non-existent file."""
        result = validator.validate_email_file(Path("/nonexistent/file.mbox"))

        assert result.is_valid is False
        assert result.anomaly_type == "file_not_found"
        assert "not found" in result.error_details.lower()

    def test_validate_email_file_is_directory(self, validator, tmp_path):
        """Test validating directory path instead of file."""
        result = validator.validate_email_file(tmp_path)

        assert result.is_valid is False
        assert result.anomaly_type == "file_not_found"

    def test_create_anomaly_record_without_repo(self, validator):
        """Test creating anomaly record without repo returns ID but doesn't save."""
        anomaly_id = validator.create_anomaly_record(
            anomaly_type="missing_message_id",
            email_file_path=Path("/test/email.mbox"),
            message_id_value=None,
            error_details="Test error",
        )

        # Should return a UUID string
        assert anomaly_id is not None
        assert len(anomaly_id) == 36  # UUID format

    def test_create_anomaly_record_with_repo(self, validator_with_repo, tmp_path):
        """Test creating anomaly record with repo saves to database."""
        anomaly_id = validator_with_repo.create_anomaly_record(
            anomaly_type="missing_message_id",
            email_file_path=tmp_path / "test.mbox",
            message_id_value=None,
            error_details="Test error",
        )

        # Check anomaly was saved
        anomalies = list(validator_with_repo.anomaly_repo.find_unresolved())
        assert len(anomalies) == 1
        assert anomalies[0].anomaly_id == anomaly_id
        assert anomalies[0].anomaly_type == AnomalyType.MISSING_MESSAGE_ID

    def test_get_anomalies_summary_without_repo(self, validator):
        """Test getting anomalies summary without repo returns empty summary."""
        summary = validator.get_anomalies_summary()

        assert summary["total_anomalies"] == 0
        assert summary["by_type"] == {}
        assert summary["unresolved"] == 0

    def test_get_anomalies_summary_with_repo(self, validator_with_repo, tmp_path):
        """Test getting anomalies summary with repo returns actual counts."""
        # Create multiple anomalies
        validator_with_repo.create_anomaly_record(
            anomaly_type="missing_message_id",
            email_file_path=tmp_path / "test1.mbox",
            message_id_value=None,
            error_details="Error 1",
        )
        validator_with_repo.create_anomaly_record(
            anomaly_type="malformed_message_id",
            email_file_path=tmp_path / "test2.mbox",
            message_id_value="invalid",
            error_details="Error 2",
        )

        summary = validator_with_repo.get_anomalies_summary()

        assert summary["total_anomalies"] == 2
        assert summary["by_type"]["missing_message_id"] == 1
        assert summary["by_type"]["malformed_message_id"] == 1
        assert summary["unresolved"] == 2
