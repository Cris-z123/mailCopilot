"""Extracted item data model."""

from dataclasses import dataclass
from datetime import datetime
from enum import Enum


class ItemType(Enum):
    """Type of extracted item."""

    TASK = "task"
    DEADLINE = "deadline"
    ACTION_ITEM = "action_item"
    OTHER = "other"


class Priority(Enum):
    """Item priority level."""

    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class IndexStatus(Enum):
    """Traceability status."""

    NORMAL = "normal"
    ANOMALY = "anomaly"


@dataclass
class ExtractedItem:
    """
    Represents a task, deadline, or action item extracted from an email.

    Attributes:
        item_id: Unique item identifier
        content: Item description (task, deadline, etc.)
        source_message_id: Foreign key to Email.message_id
        source_file_path: Foreign key to Email.file_path
        item_type: Type of extracted item
        priority: Item priority level
        confidence_score: AI confidence in extraction accuracy
        index_status: Traceability status
        created_at: Timestamp when item was created
    """

    item_id: str
    content: str
    source_message_id: str
    source_file_path: str
    item_type: ItemType
    priority: Priority
    confidence_score: float
    index_status: IndexStatus
    created_at: datetime

    def __post_init__(self):
        """Validate fields after initialization."""
        if not 0.0 <= self.confidence_score <= 1.0:
            raise ValueError("confidence_score must be between 0.0 and 1.0")

        # Auto-set index_status based on confidence
        if self.confidence_score < 0.6:
            self.index_status = IndexStatus.ANOMALY
        else:
            self.index_status = IndexStatus.NORMAL
