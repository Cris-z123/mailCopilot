"""Audit logging for traceability events."""

import json
from datetime import datetime
from pathlib import Path
from typing import Optional


class AuditLog:
    """Audit logger for index anomalies and traceability events."""

    def __init__(self, log_path: Optional[Path] = None):
        """
        Initialize audit logger.

        Args:
            log_path: Path to audit log file (default: ~/.maildigest/logs/audit.log)
        """
        if log_path is None:
            log_path = Path("~/.maildigest/logs/audit.log").expanduser()

        self.log_path = log_path
        self.log_path.parent.mkdir(parents=True, exist_ok=True)

    def log_index_anomaly(
        self,
        anomaly_id: str,
        anomaly_type: str,
        email_file_path: Path,
        message_id_value: Optional[str],
        error_details: str,
    ) -> None:
        """
        Log index anomaly event.

        Args:
            anomaly_id: Unique anomaly identifier
            anomaly_type: Type of anomaly
            email_file_path: Path to email file
            message_id_value: Message-ID value (if any)
            error_details: Human-readable error description
        """
        event = {
            "timestamp": datetime.now().isoformat(),
            "event_type": "index_anomaly",
            "anomaly_id": anomaly_id,
            "anomaly_type": anomaly_type,
            "email_file_path": str(email_file_path),
            "message_id_value": message_id_value,
            "error_details": error_details,
        }

        self._write_event(event)

    def log_traceability_event(
        self,
        event_type: str,
        message_id: str,
        file_path: Path,
        metadata: dict,
    ) -> None:
        """
        Log general traceability event.

        Args:
            event_type: Type of event (e.g., "email_parsed", "item_extracted")
            message_id: Email Message-ID
            file_path: Path to email file
            metadata: Additional event metadata
        """
        event = {
            "timestamp": datetime.now().isoformat(),
            "event_type": event_type,
            "message_id": message_id,
            "file_path": str(file_path),
            **metadata,
        }

        self._write_event(event)

    def export_traceability_data(self, output_path: Path) -> None:
        """
        Export all traceability data to JSON file.

        Args:
            output_path: Path to output JSON file
        """
        events = []

        if self.log_path.exists():
            with open(self.log_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line:
                        try:
                            event = json.loads(line)
                            events.append(event)
                        except json.JSONDecodeError:
                            # Skip invalid lines
                            continue

        output_path.parent.mkdir(parents=True, exist_ok=True)

        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(events, f, indent=2, ensure_ascii=False)

    def _write_event(self, event: dict) -> None:
        """
        Write event to log file.

        Args:
            event: Event dictionary
        """
        with open(self.log_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(event, ensure_ascii=False) + "\n")
