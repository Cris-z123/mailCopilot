"""Database schema and repository implementations."""

import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Iterator, Optional
from uuid import uuid4

from ..models.email_message import EmailMessage
from ..models.extracted_item import ExtractedItem
from ..models.index_anomaly import IndexAnomaly


class DatabaseConnection:
    """Database connection and schema management."""

    SCHEMA_VERSION = "1.0"

    def __init__(self, db_path: Path):
        """
        Initialize database connection.

        Args:
            db_path: Path to SQLite database file
        """
        self.db_path = db_path
        self._conn: Optional[sqlite3.Connection] = None

    def connect(self) -> sqlite3.Connection:
        """
        Establish database connection.

        Returns:
            SQLite connection object
        """
        if self._conn is None:
            # Ensure parent directory exists
            self.db_path.parent.mkdir(parents=True, exist_ok=True)

            self._conn = sqlite3.connect(self.db_path)
            self._conn.row_factory = sqlite3.Row

        return self._conn

    def execute_schema(self) -> None:
        """Create database tables if they don't exist."""
        conn = self.connect()

        # Email messages table
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS email_messages (
                message_id TEXT NOT NULL,
                file_path TEXT NOT NULL,
                sender_name TEXT NOT NULL,
                sender_email TEXT NOT NULL,
                sent_date TEXT NOT NULL,
                subject TEXT NOT NULL,
                format TEXT NOT NULL,
                storage_offset INTEGER,
                maildir_key TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (message_id, file_path)
            )
        """
        )

        # Create indexes for email_messages
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_email_sent_date
            ON email_messages(sent_date)
        """
        )

        # Extracted items table
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS extracted_items (
                item_id TEXT NOT NULL PRIMARY KEY,
                content TEXT NOT NULL,
                source_message_id TEXT NOT NULL,
                source_file_path TEXT NOT NULL,
                item_type TEXT NOT NULL,
                priority TEXT NOT NULL,
                confidence_score REAL NOT NULL,
                index_status TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (source_message_id, source_file_path)
                    REFERENCES email_messages(message_id, file_path)
                    ON DELETE CASCADE
            )
        """
        )

        # Create indexes for extracted_items
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_item_source
            ON extracted_items(source_message_id, source_file_path)
        """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_item_created
            ON extracted_items(created_at)
        """
        )

        # Index anomalies table
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS index_anomalies (
                anomaly_id TEXT NOT NULL PRIMARY KEY,
                anomaly_type TEXT NOT NULL,
                email_file_path TEXT NOT NULL,
                message_id_value TEXT,
                error_details TEXT NOT NULL,
                timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                resolved BOOLEAN NOT NULL DEFAULT 0
            )
        """
        )

        # Create indexes for index_anomalies
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_anomaly_path
            ON index_anomalies(email_file_path)
        """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_anomaly_time
            ON index_anomalies(timestamp)
        """
        )

        conn.commit()

    def migrate(self) -> None:
        """Run database migrations if needed."""
        # Placeholder for future migrations
        # For V1.0, just ensure schema exists
        self.execute_schema()

    def close(self) -> None:
        """Close database connection."""
        if self._conn is not None:
            self._conn.close()
            self._conn = None


class EmailMessageRepository:
    """Repository for EmailMessage entities."""

    def __init__(self, db: DatabaseConnection):
        """
        Initialize repository.

        Args:
            db: Database connection
        """
        self.db = db

    def save(self, email: EmailMessage) -> None:
        """
        Save email message to database.

        Args:
            email: EmailMessage instance
        """
        conn = self.db.connect()

        conn.execute(
            """
            INSERT OR REPLACE INTO email_messages
            (message_id, file_path, sender_name, sender_email, sent_date, subject,
             format, storage_offset, maildir_key)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
            (
                email.message_id,
                str(email.file_path),
                email.sender_name,
                email.sender_email,
                email.sent_date.isoformat(),
                email.subject,
                email.format,
                email.storage_offset,
                email.maildir_key,
            ),
        )

        conn.commit()

    def find_by_message_id(self, message_id: str) -> Optional[EmailMessage]:
        """
        Find email by Message-ID.

        Args:
            message_id: Message-ID to search for

        Returns:
            EmailMessage if found, None otherwise
        """
        conn = self.db.connect()

        cursor = conn.execute(
            "SELECT * FROM email_messages WHERE message_id = ?", (message_id,)
        )
        row = cursor.fetchone()

        if row is None:
            return None

        return self._row_to_email(row)

    def find_by_file_path(self, file_path: Path) -> Iterator[EmailMessage]:
        """
        Find all emails from a specific file.

        Args:
            file_path: Path to email file

        Yields:
            EmailMessage instances
        """
        conn = self.db.connect()

        cursor = conn.execute(
            "SELECT * FROM email_messages WHERE file_path = ?", (str(file_path),)
        )

        for row in cursor.fetchall():
            yield self._row_to_email(row)

    def _row_to_email(self, row: sqlite3.Row) -> EmailMessage:
        """Convert database row to EmailMessage."""
        return EmailMessage(
            message_id=row["message_id"],
            sender_name=row["sender_name"],
            sender_email=row["sender_email"],
            sent_date=datetime.fromisoformat(row["sent_date"]),
            subject=row["subject"],
            file_path=Path(row["file_path"]),
            format=row["format"],
            storage_offset=row["storage_offset"],
            maildir_key=row["maildir_key"],
        )


class ExtractedItemRepository:
    """Repository for ExtractedItem entities."""

    def __init__(self, db: DatabaseConnection):
        """
        Initialize repository.

        Args:
            db: Database connection
        """
        self.db = db

    def save(self, item: ExtractedItem) -> None:
        """
        Save extracted item to database.

        Args:
            item: ExtractedItem instance
        """
        conn = self.db.connect()

        conn.execute(
            """
            INSERT OR REPLACE INTO extracted_items
            (item_id, content, source_message_id, source_file_path, item_type,
             priority, confidence_score, index_status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
            (
                item.item_id,
                item.content,
                item.source_message_id,
                item.source_file_path,
                item.item_type.value,
                item.priority.value,
                item.confidence_score,
                item.index_status.value,
                item.created_at.isoformat(),
            ),
        )

        conn.commit()

    def find_by_source(self, message_id: str, file_path: str) -> Iterator[ExtractedItem]:
        """
        Find all items from a specific email.

        Args:
            message_id: Source email Message-ID
            file_path: Source email file path

        Yields:
            ExtractedItem instances
        """
        conn = self.db.connect()

        cursor = conn.execute(
            """
            SELECT * FROM extracted_items
            WHERE source_message_id = ? AND source_file_path = ?
        """,
            (message_id, file_path),
        )

        for row in cursor.fetchall():
            yield self._row_to_item(row)

    def find_all_with_anomalies(self) -> Iterator[ExtractedItem]:
        """
        Find all items with index status = anomaly.

        Yields:
            ExtractedItem instances with anomalies
        """
        conn = self.db.connect()

        cursor = conn.execute(
            "SELECT * FROM extracted_items WHERE index_status = 'anomaly'"
        )

        for row in cursor.fetchall():
            yield self._row_to_item(row)

    def _row_to_item(self, row: sqlite3.Row) -> ExtractedItem:
        """Convert database row to ExtractedItem."""
        from ..models.extracted_item import ItemType, IndexStatus, Priority

        return ExtractedItem(
            item_id=row["item_id"],
            content=row["content"],
            source_message_id=row["source_message_id"],
            source_file_path=row["source_file_path"],
            item_type=ItemType(row["item_type"]),
            priority=Priority(row["priority"]),
            confidence_score=row["confidence_score"],
            index_status=IndexStatus(row["index_status"]),
            created_at=datetime.fromisoformat(row["created_at"]),
        )


class IndexAnomalyRepository:
    """Repository for IndexAnomaly entities."""

    def __init__(self, db: DatabaseConnection):
        """
        Initialize repository.

        Args:
            db: Database connection
        """
        self.db = db

    def save(self, anomaly: IndexAnomaly) -> None:
        """
        Save anomaly to database.

        Args:
            anomaly: IndexAnomaly instance
        """
        conn = self.db.connect()

        conn.execute(
            """
            INSERT OR REPLACE INTO index_anomalies
            (anomaly_id, anomaly_type, email_file_path, message_id_value,
             error_details, timestamp, resolved)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
            (
                anomaly.anomaly_id,
                anomaly.anomaly_type.value,
                str(anomaly.email_file_path),
                anomaly.message_id_value,
                anomaly.error_details,
                anomaly.timestamp.isoformat(),
                anomaly.resolved,
            ),
        )

        conn.commit()

    def find_by_email_path(self, file_path: Path) -> Iterator[IndexAnomaly]:
        """
        Find all anomalies for a specific email.

        Args:
            file_path: Path to email file

        Yields:
            IndexAnomaly instances
        """
        conn = self.db.connect()

        cursor = conn.execute(
            "SELECT * FROM index_anomalies WHERE email_file_path = ?", (str(file_path),)
        )

        for row in cursor.fetchall():
            yield self._row_to_anomaly(row)

    def find_unresolved(self) -> Iterator[IndexAnomaly]:
        """
        Find all unresolved anomalies.

        Yields:
            IndexAnomaly instances
        """
        conn = self.db.connect()

        cursor = conn.execute("SELECT * FROM index_anomalies WHERE resolved = 0")

        for row in cursor.fetchall():
            yield self._row_to_anomaly(row)

    def _row_to_anomaly(self, row: sqlite3.Row) -> IndexAnomaly:
        """Convert database row to IndexAnomaly."""
        from ..models.index_anomaly import AnomalyType

        return IndexAnomaly(
            anomaly_id=row["anomaly_id"],
            anomaly_type=AnomalyType(row["anomaly_type"]),
            email_file_path=Path(row["email_file_path"]),
            message_id_value=row["message_id_value"],
            error_details=row["error_details"],
            timestamp=datetime.fromisoformat(row["timestamp"]),
            resolved=bool(row["resolved"]),
        )
