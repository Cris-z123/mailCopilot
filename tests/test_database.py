"""Tests for database operations."""

import pytest
from pathlib import Path
from datetime import datetime
from uuid import uuid4

from src.storage.database import (
    DatabaseConnection,
    EmailMessageRepository,
    ExtractedItemRepository,
    IndexAnomalyRepository,
)
from src.models.email_message import EmailMessage
from src.models.extracted_item import ExtractedItem, ItemType, Priority, IndexStatus
from src.models.index_anomaly import IndexAnomaly, AnomalyType


class TestDatabaseConnection:
    """Test database connection and schema."""

    @pytest.fixture
    def db(self, tmp_path):
        """Create in-memory database for testing."""
        db_path = tmp_path / "test.db"
        db = DatabaseConnection(db_path)
        db.execute_schema()
        return db

    def test_execute_schema(self, db):
        """Test schema execution creates tables."""
        # Query to check if tables exist
        cursor = db.connect().execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        )
        tables = [row[0] for row in cursor.fetchall()]

        assert "email_messages" in tables
        assert "extracted_items" in tables
        assert "index_anomalies" in tables


class TestEmailMessageRepository:
    """Test email message repository."""

    @pytest.fixture
    def repo(self, tmp_path):
        """Create repository with test database."""
        db_path = tmp_path / "test.db"
        db = DatabaseConnection(db_path)
        db.execute_schema()
        return EmailMessageRepository(db)

    @pytest.fixture
    def sample_email(self):
        """Create sample email message."""
        return EmailMessage(
            message_id="<test@example.com>",
            sender_name="John Doe",
            sender_email="john@example.com",
            sent_date=datetime(2025, 1, 13, 10, 30, 0),
            subject="Test Subject",
            file_path=Path("/test/email.mbox"),
            format="mbox",
            storage_offset=0,
            maildir_key=None,
        )

    def test_save_email(self, repo, sample_email):
        """Test saving email to database."""
        repo.save(sample_email)

        # Verify email was saved
        found = repo.find_by_message_id("<test@example.com>")
        assert found is not None
        assert found.message_id == sample_email.message_id
        assert found.sender_email == "john@example.com"

    def test_find_by_message_id(self, repo, sample_email):
        """Test finding email by Message-ID."""
        repo.save(sample_email)

        found = repo.find_by_message_id("<test@example.com>")
        assert found is not None
        assert found.subject == "Test Subject"

    def test_find_by_message_id_not_found(self, repo):
        """Test finding non-existent email returns None."""
        found = repo.find_by_message_id("<nonexistent@example.com>")
        assert found is None

    def test_find_by_file_path(self, repo, sample_email):
        """Test finding email by file path."""
        repo.save(sample_email)

        results = list(repo.find_by_file_path(Path("/test/email.mbox")))
        assert len(results) == 1
        assert results[0].message_id == sample_email.message_id

    def test_find_by_file_path_not_found(self, repo):
        """Test finding by non-existent file path."""
        results = list(repo.find_by_file_path(Path("/nonexistent/email.mbox")))
        assert len(results) == 0


class TestExtractedItemRepository:
    """Test extracted item repository."""

    @pytest.fixture
    def repo(self, tmp_path):
        """Create repository with test database."""
        db_path = tmp_path / "test.db"
        db = DatabaseConnection(db_path)
        db.execute_schema()
        return ExtractedItemRepository(db)

    @pytest.fixture
    def sample_item(self):
        """Create sample extracted item."""
        return ExtractedItem(
            item_id=str(uuid4()),
            content="Sample task content",
            source_message_id="<test@example.com>",
            source_file_path="/test/email.mbox",
            item_type=ItemType.TASK,
            priority=Priority.MEDIUM,
            confidence_score=0.85,
            index_status=IndexStatus.NORMAL,
            created_at=datetime.now(),
        )

    def test_save_item(self, repo, sample_item):
        """Test saving item to database."""
        repo.save(sample_item)

        found = list(repo.find_by_source("<test@example.com>", "/test/email.mbox"))
        assert len(found) == 1

    def test_find_by_source(self, repo, sample_item):
        """Test finding items by source Message-ID."""
        repo.save(sample_item)

        items = list(repo.find_by_source("<test@example.com>", "/test/email.mbox"))
        assert len(items) == 1
        assert items[0].content == "Sample task content"

    def test_find_all_with_anomalies(self, repo, sample_item):
        """Test finding items with anomaly status."""
        # Create item with anomaly status
        # Note: __post_init__ sets status to ANOMALY only if confidence_score < 0.6
        item_anomaly = ExtractedItem(
            item_id=str(uuid4()),
            content="Anomalous item",
            source_message_id="<test2@example.com>",
            source_file_path="/test/email2.mbox",
            item_type=ItemType.TASK,
            priority=Priority.HIGH,
            confidence_score=0.5,  # Low confidence triggers ANOMALY status
            index_status=IndexStatus.NORMAL,  # Will be overridden to ANOMALY
            created_at=datetime.now(),
        )
        repo.save(sample_item)
        repo.save(item_anomaly)

        items = list(repo.find_all_with_anomalies())
        assert len(items) == 1
        assert items[0].index_status == IndexStatus.ANOMALY


class TestIndexAnomalyRepository:
    """Test index anomaly repository."""

    @pytest.fixture
    def repo(self, tmp_path):
        """Create repository with test database."""
        db_path = tmp_path / "test.db"
        db = DatabaseConnection(db_path)
        db.execute_schema()
        return IndexAnomalyRepository(db)

    @pytest.fixture
    def sample_anomaly(self):
        """Create sample anomaly record."""
        return IndexAnomaly(
            anomaly_id=str(uuid4()),
            anomaly_type=AnomalyType.MISSING_MESSAGE_ID,
            email_file_path=Path("/test/email.mbox"),
            message_id_value=None,
            error_details="Message-ID header is missing",
            timestamp=datetime.now(),
            resolved=False,
        )

    def test_save_anomaly(self, repo, sample_anomaly):
        """Test saving anomaly to database."""
        repo.save(sample_anomaly)

        found = list(repo.find_by_email_path(Path("/test/email.mbox")))
        assert len(found) == 1
        assert found[0].anomaly_type == AnomalyType.MISSING_MESSAGE_ID

    def test_find_by_email_path(self, repo, sample_anomaly):
        """Test finding anomalies by email path."""
        repo.save(sample_anomaly)

        found = list(repo.find_by_email_path(Path("/test/email.mbox")))
        assert len(found) == 1
        assert found[0].error_details == "Message-ID header is missing"

    def test_find_unresolved(self, repo, sample_anomaly):
        """Test finding unresolved anomalies."""
        # Create resolved anomaly
        resolved_anomaly = IndexAnomaly(
            anomaly_id=str(uuid4()),
            anomaly_type=AnomalyType.MALFORMED_MESSAGE_ID,
            email_file_path=Path("/test/email2.mbox"),
            message_id_value="invalid",
            error_details="Malformed Message-ID",
            timestamp=datetime.now(),
            resolved=True,
        )

        repo.save(sample_anomaly)
        repo.save(resolved_anomaly)

        found = list(repo.find_unresolved())
        assert len(found) == 1
        assert found[0].resolved is False
