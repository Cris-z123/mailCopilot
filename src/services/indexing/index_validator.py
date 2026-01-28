"""Index validation and anomaly detection."""

import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Optional
from uuid import uuid4

from src.models.index_anomaly import AnomalyType, IndexAnomaly
from src.storage.database import IndexAnomalyRepository
from src.utils.path_utils import normalize_message_id


@dataclass
class ValidationResult:
    """Result of index validation."""

    is_valid: bool
    anomaly_type: Optional[str]  # 'missing_message_id', 'malformed_message_id', etc.
    error_details: Optional[str]
    can_recover: bool  # True if anomaly is recoverable via fallback


class IndexValidator:
    """
    Validates email index completeness and detects anomalies.

    Ensures Message-ID extraction succeeds and traceability can be
    guaranteed. Creates IndexAnomaly records when validation fails.
    """

    # RFC 5322 Message-ID format (simplified)
    MESSAGE_ID_PATTERN = re.compile(r"^<[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}>$")

    def __init__(self, anomaly_repo: Optional[IndexAnomalyRepository] = None):
        """
        Initialize validator.

        Args:
            anomaly_repo: Optional repository for anomaly records
        """
        self.anomaly_repo = anomaly_repo

    def validate_message_id(self, message_id: Optional[str]) -> ValidationResult:
        """
        Validate Message-ID format and presence.

        Args:
            message_id: Extracted Message-ID (may be None)

        Returns:
            ValidationResult with validation status

        Notes:
            - None or empty string → missing_message_id
            - Malformed format (no @ symbol) → malformed_message_id
            - Valid format → is_valid=True
        """
        if not message_id or not message_id.strip():
            return ValidationResult(
                is_valid=False,
                anomaly_type="missing_message_id",
                error_details="Message-ID header is completely absent",
                can_recover=False,
            )

        # Normalize: Add angle brackets if missing
        try:
            normalized_id = normalize_message_id(message_id)
        except ValueError:
            return ValidationResult(
                is_valid=False,
                anomaly_type="malformed_message_id",
                error_details=f"Message-ID format is invalid: {message_id}",
                can_recover=False,
            )

        # Check format
        if not self.MESSAGE_ID_PATTERN.match(normalized_id):
            return ValidationResult(
                is_valid=False,
                anomaly_type="malformed_message_id",
                error_details=f"Message-ID does not match RFC 5322 format: {message_id}",
                can_recover=False,
            )

        return ValidationResult(
            is_valid=True,
            anomaly_type=None,
            error_details=None,
            can_recover=True,
        )

    def validate_email_file(self, file_path: Path) -> ValidationResult:
        """
        Validate that email file exists and is accessible.

        Args:
            file_path: Path to email file

        Returns:
            ValidationResult with validation status

        Notes:
            - Checks file existence and read permissions
            - Used for deep link validation before report generation
        """
        if not file_path.exists():
            return ValidationResult(
                is_valid=False,
                anomaly_type="file_not_found",
                error_details=f"Email file not found: {file_path}",
                can_recover=False,
            )

        if not file_path.is_file():
            return ValidationResult(
                is_valid=False,
                anomaly_type="file_not_found",
                error_details=f"Path is not a file: {file_path}",
                can_recover=False,
            )

        # Try to read the file
        try:
            with open(file_path, "rb") as f:
                # Just read first byte to check accessibility
                f.read(1)
        except PermissionError:
            return ValidationResult(
                is_valid=False,
                anomaly_type="file_not_found",
                error_details=f"Permission denied reading file: {file_path}",
                can_recover=False,
            )
        except Exception as e:
            return ValidationResult(
                is_valid=False,
                anomaly_type="file_not_found",
                error_details=f"Error reading file: {e}",
                can_recover=False,
            )

        return ValidationResult(
            is_valid=True,
            anomaly_type=None,
            error_details=None,
            can_recover=True,
        )

    def create_anomaly_record(
        self,
        anomaly_type: str,
        email_file_path: Path,
        message_id_value: Optional[str],
        error_details: str,
    ) -> str:
        """
        Create an IndexAnomaly record in the database.

        Args:
            anomaly_type: Type of anomaly (missing_message_id, etc.)
            email_file_path: Path to email file
            message_id_value: Extracted Message-ID (if any)
            error_details: Human-readable error description

        Returns:
            anomaly_id: UUID of created anomaly record

        Raises:
            Exception: If database insertion fails and repo is provided

        Notes:
            - Anomaly records are user-visible in reports
            - Used for debugging and transparency
        """
        anomaly_id = str(uuid4())

        if self.anomaly_repo:
            # Map string anomaly_type to enum
            anomaly_type_enum = self._map_anomaly_type(anomaly_type)

            anomaly = IndexAnomaly(
                anomaly_id=anomaly_id,
                anomaly_type=anomaly_type_enum,
                email_file_path=email_file_path,
                message_id_value=message_id_value,
                error_details=error_details,
                timestamp=datetime.now(),
                resolved=False,
            )

            self.anomaly_repo.save(anomaly)

        return anomaly_id

    def get_anomalies_summary(self, email_file_path: Optional[Path] = None) -> dict:
        """
        Get summary of anomalies for a specific email or batch.

        Args:
            email_file_path: Optional path to email file (or directory for batch)

        Returns:
            Dictionary with keys:
                - total_anomalies: int
                - by_type: dict of anomaly_type → count
                - unresolved: int

        Notes:
            - Used for report footer summary
            - Example: "Processed 100 emails, 3 items with index issues"
        """
        summary = {
            "total_anomalies": 0,
            "by_type": {},
            "unresolved": 0,
        }

        if not self.anomaly_repo:
            return summary

        # Get anomalies
        if email_file_path:
            anomalies = list(self.anomaly_repo.find_by_email_path(email_file_path))
        else:
            anomalies = list(self.anomaly_repo.find_unresolved())

        summary["total_anomalies"] = len(anomalies)
        summary["unresolved"] = sum(1 for a in anomalies if not a.resolved)

        # Count by type
        for anomaly in anomalies:
            anomaly_type_str = anomaly.anomaly_type.value
            summary["by_type"][anomaly_type_str] = summary["by_type"].get(anomaly_type_str, 0) + 1

        return summary

    def _map_anomaly_type(self, anomaly_type_str: str) -> AnomalyType:
        """Map string anomaly type to enum."""
        try:
            return AnomalyType(anomaly_type_str)
        except ValueError:
            # Default to malformed_message_id for unknown types
            return AnomalyType.MALFORMED_MESSAGE_ID
