# Index Validator Interface Contract

**Feature**: 001-item-traceability
**Module**: `src.services.indexing.index_validator`
**Version**: 1.0
**Date**: 2026-01-28

## Overview

Defines the interface for validating email index completeness and detecting traceability anomalies. This module ensures users are aware when Message-ID extraction fails or emails cannot be properly traced.

---

## Class: `IndexValidator`

```python
from abc import ABC, abstractmethod
from typing import List, Optional
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

@dataclass
class ValidationResult:
    """Result of index validation."""
    is_valid: bool
    anomaly_type: Optional[str]  # 'missing_message_id', 'malformed_message_id', etc.
    error_details: Optional[str]
    can_recover: bool  # True if anomaly is recoverable via fallback

class IndexValidator(ABC):
    """
    Validates email index completeness and detects anomalies.

    Ensures Message-ID extraction succeeds and traceability can be
    guaranteed. Creates IndexAnomaly records when validation fails.
    """

    @abstractmethod
    def validate_message_id(self, message_id: Optional[str]) -> ValidationResult:
        """
        Validate Message-ID format and presence.

        Args:
            message_id: Extracted Message-ID (may be None)

        Returns:
            ValidationResult with:
                - is_valid: True if Message-ID is present and well-formed
                - anomaly_type: Type of anomaly if invalid
                - error_details: Human-readable description
                - can_recover: Whether fallback is possible

        Notes:
            - None or empty string → missing_message_id
            - Malformed format (no @ symbol) → malformed_message_id
            - Valid format → is_valid=True
        """
        pass

    @abstractmethod
    def validate_email_file(self, file_path: Path) -> ValidationResult:
        """
        Validate that email file exists and is accessible.

        Args:
            file_path: Path to email file

        Returns:
            ValidationResult with:
                - is_valid: True if file exists and is readable
                - anomaly_type: 'file_not_found' if invalid
                - error_details: Error message
                - can_recover: False (file must exist)

        Notes:
            - Checks file existence and read permissions
            - Used for deep link validation before report generation
        """
        pass

    @abstractmethod
    def create_anomaly_record(
        self,
        anomaly_type: str,
        email_file_path: Path,
        message_id_value: Optional[str],
        error_details: str
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
            DatabaseError: If database insertion fails

        Notes:
            - Anomaly records are user-visible in reports
            - Used for debugging and transparency
        """
        pass

    @abstractmethod
    def get_anomalies_summary(self, email_file_path: Path) -> dict:
        """
        Get summary of anomalies for a specific email or batch.

        Args:
            email_file_path: Path to email file (or directory for batch)

        Returns:
            Dictionary with keys:
                - total_anomalies: int
                - by_type: dict of anomaly_type → count
                - unresolved: int

        Notes:
            - Used for report footer summary
            - Example: "Processed 100 emails, 3 items with index issues"
        """
        pass
```

---

## Validation Rules

### Message-ID Validation

```python
import re

# RFC 5322 Message-ID format (simplified)
MESSAGE_ID_PATTERN = re.compile(
    r'^<[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}>$'
)

def validate_message_id_format(message_id: str) -> bool:
    """
    Validate Message-ID matches RFC 5322 format.

    Args:
        message_id: Message-ID string (with angle brackets)

    Returns:
        True if format is valid, False otherwise

    Rules:
        - Must start with '<' and end with '>'
        - Must contain exactly one '@' symbol
        - Local part (before @): alphanumeric + ._%+-
        - Domain part (after @): domain.tld format
    """
    if not message_id:
        return False

    # Normalize: Add angle brackets if missing
    if not message_id.startswith('<'):
        message_id = f'<{message_id}>'
    if not message_id.endswith('>'):
        message_id = f'{message_id}>'

    return bool(MESSAGE_ID_PATTERN.match(message_id))
```

### Anomaly Types

| Anomaly Type | Description | Can Recover | User Action |
|--------------|-------------|-------------|-------------|
| `missing_message_id` | Message-ID header completely absent | No | Mark item with [索引异常], show file path |
| `malformed_message_id` | Message-ID format is invalid | No | Mark item with [索引异常], show file path |
| `duplicate_detection_failure` | Duplicate detection logic failed | Yes | Use file_path + message_id as composite key |
| `file_not_found` | Email file moved or deleted | No | Show clear error, display last known path |
| `permission_denied` | Cannot read email file | No | Show permissions error, suggest manual check |

---

## Implementation Requirements

### Concrete Implementation MUST:

1. **Validate Message-ID before creating items**
   ```python
   validation_result = validator.validate_message_id(message_id)
   if not validation_result.is_valid:
       # Create anomaly record
       anomaly_id = validator.create_anomaly_record(
           validation_result.anomaly_type,
           email_file_path,
           message_id,
           validation_result.error_details
       )
       # Mark item with [索引异常]
       item.index_status = "anomaly"
   ```

2. **Log all anomalies to audit log**
   - Use `storage.audit_log.log_index_anomaly()`
   - Include timestamp, anomaly_type, file_path, message_id_value

3. **Provide user-visible summary**
   - In report footer: "Processed X emails, Y items with index issues"
   - Breakdown by anomaly type if needed

4. **Support configuration-driven rules**
   - Load validation rules from `~/.maildigest/rules/traceability_rules.json`
   - Allow users to customize validation strictness

5. **Handle batch validation**
   - Validate all emails in a batch before processing
   - Return summary of anomalies
   - Allow batch to continue with warnings (not fatal errors)

---

## Configuration

### traceability_rules.json

```json
{
  "schema_version": "1.0",
  "validation_rules": {
    "message_id": {
      "require_angle_brackets": false,
      "allow_local_domains": true,
      "min_length": 3,
      "max_length": 254
    },
    "anomaly_handling": {
      "fail_on_missing_message_id": false,
      "fail_on_malformed_message_id": false,
      "log_all_anomalies": true,
      "show_anomaly_summary_in_report": true
    },
    "duplicate_detection": {
      "enabled": true,
      "use_composite_key": true,
      "composite_key_format": "{message_id}:{file_path}"
    }
  }
}
```

---

## Testing Requirements

### Unit Tests (if tests are included)

1. **Valid Message-ID Test**
   ```python
   def test_validate_message_id_valid(self):
       validator = IndexValidator()
       result = validator.validate_message_id("<abc@domain.com>")
       assert result.is_valid is True
       assert result.anomaly_type is None
   ```

2. **Missing Message-ID Test**
   ```python
   def test_validate_message_id_missing(self):
       validator = IndexValidator()
       result = validator.validate_message_id(None)
       assert result.is_valid is False
       assert result.anomaly_type == "missing_message_id"
       assert result.can_recover is False
   ```

3. **Malformed Message-ID Test**
   ```python
   def test_validate_message_id_malformed(self):
       validator = IndexValidator()
       result = validator.validate_message_id("invalid-no-at-symbol")
       assert result.is_valid is False
       assert result.anomaly_type == "malformed_message_id"
   ```

---

## Usage Example

```python
from pathlib import Path
from src.services.indexing.index_validator import IndexValidator

def process_email_with_validation(email_file: Path):
    """Process email with index validation."""
    validator = IndexValidator()

    # Validate file exists
    file_result = validator.validate_email_file(email_file)
    if not file_result.is_valid:
        print(f"Error: {file_result.error_details}")
        return None

    # Parse email and extract Message-ID
    message_id = extract_message_id(email_file)

    # Validate Message-ID
    validation_result = validator.validate_message_id(message_id)

    if not validation_result.is_valid:
        # Create anomaly record
        anomaly_id = validator.create_anomaly_record(
            anomaly_type=validation_result.anomaly_type,
            email_file_path=email_file,
            message_id_value=message_id,
            error_details=validation_result.error_details
        )

        # Log to audit
        log_index_anomaly(anomaly_id, validation_result.anomaly_type, email_file)

        # Return marker item
        return ExtractedItem(
            content="[无法提取事项 - 邮件索引异常]",
            index_status="anomaly",
            source_message_id=None,
            # ... other fields
        )

    # Valid: Continue processing
    return ExtractedItem(
        content="完成预算审批",
        index_status="normal",
        source_message_id=message_id,
        # ... other fields
    )
```

---

## Error Handling

### Validation Failures Are Non-Fatal

- **Philosophy**: Validation failures create warnings, not errors
- **Behavior**: Processing continues with `[索引异常]` markers
- **User Notification**: Report summary shows anomaly count
- **Logging**: All anomalies logged to audit log

### Exception Handling

```python
try:
    validation_result = validator.validate_message_id(message_id)
except Exception as e:
    # Unexpected error: Log and treat as anomaly
    log_error(f"Validation error: {e}")
    validation_result = ValidationResult(
        is_valid=False,
        anomaly_type="validation_error",
        error_details=str(e),
        can_recover=False
    )
```

---

## Summary

**Purpose**: Ensure traceability by validating Message-ID extraction
**Behavior**: Non-fatal validation - creates anomaly records on failure
**Configuration**: Rules loaded from `traceability_rules.json`
**User Impact**: Clear marking of items with [索引异常] in reports
**Transparency**: All anomalies logged to audit log

---

## Versioning

- **Current Version**: 1.0
- **Backward Compatibility**: Maintain existing anomaly types
- **Future**: Add more anomaly types as needed
