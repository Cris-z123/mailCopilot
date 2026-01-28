# Quickstart Guide: Item Traceability & Indexing Module

**Feature**: 001-item-traceability
**Audience**: Developers implementing this feature
**Date**: 2026-01-28

## Overview

This guide helps you quickly set up and implement the Item Traceability & Indexing Module. Follow these steps to get from zero to working prototype.

---

## Prerequisites

### System Requirements
- Python 3.11 or higher
- Windows 10+, macOS 11+, or Linux
- Text editor or IDE (VS Code, PyCharm, etc.)

### Dependencies Installation

```bash
# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

**requirements.txt**:
```
# Core dependencies
pydantic>=2.0
keyring>=25.0

# Optional testing dependencies
pytest>=7.0
pytest-cov>=4.0
```

---

## Project Setup

### 1. Create Directory Structure

```bash
# From repository root
mkdir -p src/models
mkdir -p src/services/email_parser
mkdir -p src/services/indexing
mkdir -p src/services/linking
mkdir -p src/services/reporting
mkdir -p src/config
mkdir -p src/storage
mkdir -p src/utils
mkdir -p tests
mkdir -p config
mkdir -p cli
```

### 2. Initialize Configuration

Create `~/.maildigest/app_config.json`:

```json
{
  "schema_version": "1.0",
  "email_client": {
    "default_client": "auto-detect",
    "deep_link_enabled": true,
    "supported_clients": ["thunderbird", "applemail"]
  },
  "traceability": {
    "message_id_validation_rules": {
      "require_angle_brackets": false,
      "allow_local_domains": true
    },
    "display_templates": {
      "source_metadata": "📧 来源：{sender} | {date} | {subject}",
      "anomaly_marker": "[索引异常]"
    }
  },
  "storage": {
    "database_path": "~/.maildigest/items.db",
    "audit_log_path": "~/.maildigest/logs/audit.log"
  }
}
```

### 3. Initialize Database

```bash
# Create database directory
mkdir -p ~/.maildigest/logs

# Run database initialization (implementation step)
python -m cli.main init-db
```

---

## Implementation Workflow

### Phase 1: Core Data Models (1-2 hours)

#### Step 1.1: Create Email Message Model

**File**: `src/models/email_message.py`

```python
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Optional

@dataclass
class EmailMessage:
    """Email message with traceability metadata."""
    message_id: str
    sender_name: str
    sender_email: str
    sent_date: datetime
    subject: str
    file_path: Path
    format: str  # 'mbox' or 'maildir'
    storage_offset: Optional[int] = None
    maildir_key: Optional[str] = None

    def __post_init__(self):
        """Validate fields after initialization."""
        if not self.message_id:
            raise ValueError("message_id is required")
        if self.format not in ('mbox', 'maildir'):
            raise ValueError(f"Invalid format: {self.format}")
```

**Test it**:
```python
# Test basic model creation
from datetime import datetime
from pathlib import Path
from src.models.email_message import EmailMessage

email = EmailMessage(
    message_id="<abc@domain.com>",
    sender_name="张三",
    sender_email="zhangsan@example.com",
    sent_date=datetime.now(),
    subject="项目进度确认",
    file_path=Path("/test.mbox"),
    format="mbox",
    storage_offset=12345
)

print(f"Email from {email.sender_name}: {email.subject}")
```

#### Step 1.2: Create Extracted Item Model

**File**: `src/models/extracted_item.py`

```python
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Optional

class ItemType(Enum):
    TASK = "task"
    DEADLINE = "deadline"
    ACTION_ITEM = "action_item"
    OTHER = "other"

class Priority(Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"

class IndexStatus(Enum):
    NORMAL = "normal"
    ANOMALY = "anomaly"

@dataclass
class ExtractedItem:
    """Item extracted from email with traceability binding."""
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
```

**Test it**:
```python
from datetime import datetime
from src.models.extracted_item import ExtractedItem, ItemType, Priority, IndexStatus

item = ExtractedItem(
    item_id="uuid-123",
    content="完成Q3预算审批",
    source_message_id="<abc@domain.com>",
    source_file_path="/test.mbox",
    item_type=ItemType.TASK,
    priority=Priority.HIGH,
    confidence_score=0.85,
    index_status=IndexStatus.NORMAL,
    created_at=datetime.now()
)

print(f"Item: {item.content} (confidence: {item.confidence_score})")
```

### Phase 2: Email Parsing (2-3 hours)

#### Step 2.1: Implement Message-ID Extractor

**File**: `src/services/email_parser/message_id_extractor.py`

```python
from email import message_from_binary_file
from email.policy import default
from pathlib import Path
from typing import Optional

class MessageIdExtractor:
    """Extract Message-ID from email files."""

    def extract_from_file(self, file_path: Path) -> Optional[str]:
        """
        Extract Message-ID from email file.

        Args:
            file_path: Path to email file

        Returns:
            Message-ID string with angle brackets, or None if missing
        """
        try:
            with open(file_path, 'rb') as f:
                msg = message_from_binary_file(f, policy=default)

            message_id = msg.get('Message-ID')

            if not message_id:
                return None

            # Normalize: Add angle brackets if missing
            message_id = message_id.strip()
            if not message_id.startswith('<'):
                message_id = f'<{message_id}>'
            if not message_id.endswith('>'):
                message_id = f'{message_id}>'

            return message_id

        except Exception as e:
            print(f"Error extracting Message-ID: {e}")
            return None

    def extract_metadata(self, file_path: Path) -> Optional[dict]:
        """
        Extract all metadata from email file.

        Returns dict with: message_id, sender_name, sender_email,
        sent_date, subject, file_path, format
        """
        try:
            with open(file_path, 'rb') as f:
                msg = message_from_binary_file(f, policy=default)

            # Extract Message-ID
            message_id = self.extract_from_file(file_path)
            if not message_id:
                return None

            # Extract sender
            from email.utils import parseaddr
            from email.header import decode_header

            sender_header = msg.get('From', '')
            name, email_addr = parseaddr(sender_header)

            # Decode name if encoded
            if name:
                decoded_parts = []
                for content, encoding in decode_header(name):
                    if isinstance(content, bytes):
                        decoded_parts.append(content.decode(encoding or 'utf-8', errors='replace'))
                    else:
                        decoded_parts.append(str(content))
                name = ''.join(decoded_parts)

            # Extract subject
            subject = msg.get('Subject', '')
            if subject:
                decoded_parts = []
                for content, encoding in decode_header(subject):
                    if isinstance(content, bytes):
                        decoded_parts.append(content.decode(encoding or 'utf-8', errors='replace'))
                    else:
                        decoded_parts.append(str(content))
                subject = ''.join(decoded_parts)

            # Extract date
            from email.utils import parsedate_to_datetime
            date_header = msg.get('Date')
            sent_date = parsedate_to_datetime(date_header) if date_header else None

            return {
                'message_id': message_id,
                'sender_name': name,
                'sender_email': email_addr,
                'sent_date': sent_date,
                'subject': subject,
                'file_path': str(file_path),
                'format': 'mbox'  # Detect based on file structure
            }

        except Exception as e:
            print(f"Error extracting metadata: {e}")
            return None
```

**Test it**:
```python
from pathlib import Path
from src.services.email_parser.message_id_extractor import MessageIdExtractor

extractor = MessageIdExtractor()

# Test with real email file
email_path = Path("/path/to/test-email.mbox")
metadata = extractor.extract_metadata(email_path)

if metadata:
    print(f"Email from {metadata['sender_name']}: {metadata['subject']}")
    print(f"Message-ID: {metadata['message_id']}")
else:
    print("Failed to extract metadata")
```

### Phase 3: Deep Link Generation (1-2 hours)

#### Step 3.1: Implement Thunderbird Adapter

**File**: `src/services/linking/thunderbird_adapter.py`

```python
import platform
import subprocess
import webbrowser
from pathlib import Path
from .base import EmailClientAdapter

class ThunderbirdAdapter(EmailClientAdapter):
    """Email client adapter for Mozilla Thunderbird."""

    @property
    def client_name(self) -> str:
        return "Mozilla Thunderbird"

    @property
    def client_id(self) -> str:
        return "thunderbird"

    def generate_deep_link(self, message_id: str, file_path: Path) -> str:
        """Generate thunderbird:// deep link."""
        # Remove angle brackets
        clean_id = message_id.strip('<>')
        return f"thunderbird://message?id={clean_id}"

    def open_deep_link(self, deep_link: str) -> bool:
        """Open deep link in Thunderbird."""
        try:
            if platform.system() == "Darwin":  # macOS
                subprocess.run(["open", deep_link], check=True)
            elif platform.system() == "Windows":
                webbrowser.open(deep_link)
            else:  # Linux
                subprocess.run(["xdg-open", deep_link], check=True)
            return True
        except Exception:
            return False

    def is_client_installed(self) -> bool:
        """Check if Thunderbird is installed."""
        try:
            if platform.system() == "Windows":
                # Check Windows registry
                import winreg
                key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE,
                                   r"Software\Clients\Mail\Mozilla Thunderbird")
                winreg.CloseKey(key)
                return True
            elif platform.system() == "Darwin":
                # Check macOS Applications
                result = subprocess.run(["mdfind", "kMDItemCFBundleIdentifier==org.mozilla.thunderbird"],
                                      capture_output=True)
                return result.returncode == 0
            else:  # Linux
                # Check for thunderbird command
                result = subprocess.run(["which", "thunderbird"], capture_output=True)
                return result.returncode == 0
        except Exception:
            return False
```

**Test it**:
```python
from src.services.linking.thunderbird_adapter import ThunderbirdAdapter

adapter = ThunderbirdAdapter()

# Check if installed
if adapter.is_client_installed():
    print(f"{adapter.client_name} is installed")

    # Generate deep link
    deep_link = adapter.generate_deep_link("<abc@domain.com>", Path("/test.mbox"))
    print(f"Deep link: {deep_link}")

    # Open deep link (careful - will actually open Thunderbird!)
    # success = adapter.open_deep_link(deep_link)
    # print(f"Opened: {success}")
else:
    print(f"{adapter.client_name} is not installed")
```

### Phase 4: Report Generation (2-3 hours)

#### Step 4.1: Implement Metadata Formatter

**File**: `src/services/reporting/metadata_formatter.py`

```python
from datetime import datetime
from typing import Dict

class MetadataFormatter:
    """Format source metadata for display in reports."""

    def __init__(self, config: Dict):
        """
        Initialize formatter with configuration.

        Args:
            config: Configuration dict with display_templates
        """
        self.source_template = config.get(
            'traceability', {}
        ).get(
            'display_templates', {}
        ).get(
            'source_metadata',
            '📧 来源：{sender} | {date} | {subject}'
        )

    def format_source_metadata(
        self,
        sender_name: str,
        sender_email: str,
        sent_date: datetime,
        subject: str
    ) -> str:
        """
        Format source metadata string.

        Args:
            sender_name: Sender display name
            sender_email: Sender email address
            sent_date: Email sent date
            subject: Email subject

        Returns:
            Formatted metadata string
        """
        # Format date
        date_str = sent_date.strftime("%Y-%m-%d %H:%M")

        # Truncate subject if needed
        subject_preview = self._truncate_subject(subject, max_length=50)

        # Format sender
        sender_display = f"{sender_name} <{sender_email}>" if sender_name else sender_email

        # Apply template
        return self.source_template.format(
            sender=sender_display,
            date=date_str,
            subject=subject_preview
        )

    def _truncate_subject(self, subject: str, max_length: int = 50) -> str:
        """Truncate subject to max_length with '...' if needed."""
        if len(subject) <= max_length:
            return subject

        # Truncate and add ellipsis
        return subject[:max_length-3] + "..."
```

**Test it**:
```python
from datetime import datetime
from src.services.reporting.metadata_formatter import MetadataFormatter

config = {
    'traceability': {
        'display_templates': {
            'source_metadata': '📧 来源：{sender} | {date} | {subject}'
        }
    }
}

formatter = MetadataFormatter(config)

metadata = formatter.format_source_metadata(
    sender_name="张三",
    sender_email="zhangsan@example.com",
    sent_date=datetime.now(),
    subject="RE: [项目A] Q1预算审批 - 请确认"
)

print(metadata)
# Output: 📧 来源：张三 <zhangsan@example.com> | 2026-01-28 14:30 | RE: [项目A] Q1预算审批...
```

### Phase 5: End-to-End Integration (2-3 hours)

#### Step 5.1: Create Main Processing Pipeline

**File**: `cli/main.py`

```python
import sys
from pathlib import Path

from src.services.email_parser.message_id_extractor import MessageIdExtractor
from src.services.linking.thunderbird_adapter import ThunderbirdAdapter
from src.services.reporting.metadata_formatter import MetadataFormatter

def process_emails(email_paths: list[Path]):
    """Process emails and generate traceability report."""
    extractor = MessageIdExtractor()
    adapter = ThunderbirdAdapter()
    formatter = MetadataFormatter({})  # Load from config

    report_lines = []
    report_lines.append("# Email Items Report\n")

    for email_path in email_paths:
        # Extract metadata
        metadata = extractor.extract_metadata(email_path)

        if not metadata:
            report_lines.append(f"## [索引异常] {email_path.name}")
            report_lines.append("无法提取 Message-ID\n")
            continue

        # Format source metadata
        source_display = formatter.format_source_metadata(
            sender_name=metadata['sender_name'],
            sender_email=metadata['sender_email'],
            sent_date=metadata['sent_date'],
            subject=metadata['subject']
        )

        # Generate deep link
        deep_link = adapter.generate_deep_link(
            metadata['message_id'],
            email_path
        )

        # Add to report
        report_lines.append(f"## Task from {metadata['subject']}")
        report_lines.append(f"{source_display}")
        report_lines.append(f"[查看原文]({deep_link})\n")

    return "\n".join(report_lines)

def main():
    """CLI entry point."""
    if len(sys.argv) < 2:
        print("Usage: python -m cli.main <email-path>...")
        sys.exit(1)

    email_paths = [Path(p) for p in sys.argv[1:]]
    report = process_emails(email_paths)

    print(report)

if __name__ == "__main__":
    main()
```

**Run it**:
```bash
# Process test emails
python -m cli.main /path/to/email1.mbox /path/to/email2.mbox

# Output:
# Email Items Report
#
## Task from 项目进度确认
📧 来源：张三 <zhangsan@example.com> | 2026-01-28 14:30 | 项目进度确认
[查看原文](thunderbird://message?id=abc@domain.com)
```

---

## Testing Your Implementation

### Manual Testing Checklist

- [ ] Extract Message-ID from test email file
- [ ] Handle missing Message-ID gracefully
- [ ] Format source metadata correctly
- [ ] Generate deep link for Thunderbird
- [ ] Handle missing Thunderbird installation
- [ ] Generate report with all metadata
- [ ] Display [索引异常] for invalid emails

### Integration Testing (Optional)

If tests are explicitly required:

```bash
# Run all tests
pytest tests/ -v

# Run with coverage
pytest tests/ --cov=src --cov-report=html
```

---

## Troubleshooting

### Issue: Message-ID extraction returns None

**Possible causes**:
1. Email file doesn't have Message-ID header
2. Email file is corrupted
3. File encoding issues

**Solution**: Check email file with:
```python
from email import message_from_binary_file
with open('test.mbox', 'rb') as f:
    msg = message_from_binary_file(f)
    print(msg.keys())  # List all headers
```

### Issue: Deep link doesn't open Thunderbird

**Possible causes**:
1. Thunderbird not installed
2. URL scheme not registered
3. Wrong message_id format

**Solution**: Test manually:
```bash
# Windows
start thunderbird://message?id=test@domain.com

# macOS
open thunderbird://message?id=test@domain.com

# Linux
xdg-open thunderbird://message?id=test@domain.com
```

### Issue: Unicode characters display incorrectly

**Possible causes**:
1. Encoding not decoded properly
2. Terminal doesn't support UTF-8

**Solution**: Ensure UTF-8 decoding:
```python
# In extract_metadata()
decoded_content = content.decode('utf-8', errors='replace')
```

---

## Next Steps

1. **Implement remaining adapters**: Apple Mail, Outlook
2. **Add database persistence**: Save items and anomalies to SQLite
3. **Implement audit logging**: Track all index anomalies
4. **Add configuration loading**: Read from `~/.maildigest/app_config.json`
5. **Performance testing**: Process 100+ emails to measure performance

---

## Getting Help

- **Documentation**: See [plan.md](plan.md) for full architecture
- **Data Model**: See [data-model.md](data-model.md) for entity definitions
- **Contracts**: See [contracts/](contracts/) for interface definitions
- **Research**: See [research.md](research.md) for technical decisions

---

## Summary

This quickstart covers:
- ✅ Project setup and configuration
- ✅ Core data models (Email, ExtractedItem)
- ✅ Message-ID extraction
- ✅ Deep link generation
- ✅ Metadata formatting
- ✅ End-to-end integration

**Estimated time**: 8-12 hours for complete implementation
