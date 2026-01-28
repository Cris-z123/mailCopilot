"""Index anomaly data model."""

from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Optional


class AnomalyType(Enum):
    """Type of index anomaly."""

    MISSING_MESSAGE_ID = "missing_message_id"
    MALFORMED_MESSAGE_ID = "malformed_message_id"
    DUPLICATE_DETECTION_FAILURE = "duplicate_detection_failure"
    FILE_NOT_FOUND = "file_not_found"


@dataclass
class IndexAnomaly:
    """
    Records traceability failures for user awareness and debugging.

    Attributes:
        anomaly_id: Unique anomaly identifier
        anomaly_type: Type of index failure
        email_file_path: Path to email file
        message_id_value: Extracted Message-ID (if any)
        error_details: Human-readable error description
        timestamp: When anomaly was detected
        resolved: Whether anomaly was resolved
    """

    anomaly_id: str
    anomaly_type: AnomalyType
    email_file_path: Path
    message_id_value: Optional[str]
    error_details: str
    timestamp: datetime
    resolved: bool = False

    def __post_init__(self):
        """Validate fields after initialization."""
        if self.anomaly_type == AnomalyType.MISSING_MESSAGE_ID and self.message_id_value:
            # Missing Message-ID should have None value
            self.message_id_value = None
