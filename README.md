# mailCopilot - Email Item Traceability & Indexing Module

**Version**: 1.0.0
**Feature Branch**: 001-item-traceability

## Overview

mailCopilot is an email item traceability system that extracts and binds Message-ID identifiers from source emails to all extracted items, enabling users to verify AI-generated tasks and action items against their original context.

### Key Features

1. **Email Item Traceability** (P1 - MVP)
   - Extract Message-ID from source emails (RFC 5322 compliant)
   - Bind source identification to all extracted items
   - Support for mbox and Maildir formats

2. **Index Completeness Validation** (P1 - MVP)
   - Detect and flag missing or malformed Message-IDs
   - Create anomaly records for traceability failures
   - Clear user-facing warnings with `[索引异常]` markers

3. **One-Click Email Access** (P2)
   - Deep links to Thunderbird (`thunderbird://`)
   - Deep links to Apple Mail (`message://`)
   - Automatic client detection (Windows/macOS/Linux)
   - Fallback to file path display

4. **Cross-Reference Information Display** (P2)
   - Display sender name/email alongside each item
   - Show date/time of source email
   - Subject preview (truncated to 50 chars)

## Installation

### Prerequisites

- Python 3.11 or higher
- Windows 10+, macOS 11+, or Linux

### Setup

```bash
# Clone repository
git clone <repository-url>
cd mailCopilot

# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Initialize database
python -m cli.main init-db
```

## Usage

### Process Emails

```bash
# Process single email
python -m cli.main path/to/email.mbox

# Process multiple emails
python -m cli.main path/to/email1.mbox path/to/email2.mbox

# With verbose logging
python -m cli.main --verbose path/to/email.mbox

# With custom config
python -m cli.main --config /path/to/config.json path/to/email.mbox
```

### Export Traceability Data

```bash
# Export all traceability data to JSON
python -m cli.main export --output traceability_export.json
```

### Database Commands

```bash
# Initialize database
python -m cli.main init-db

# With custom config
python -m cli.main init-db --config /path/to/config.json
```

## Configuration

### Configuration File Location

Default configuration is stored in:
- `~/.maildigest/app_config.json` (user home directory)
- `config/app_config.json` (project directory)

### Configuration Template

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

## Architecture

### Project Structure

```
src/
├── models/              # Data models
│   ├── email_message.py
│   ├── extracted_item.py
│   └── index_anomaly.py
├── services/            # Business logic
│   ├── email_parser/    # Email parsing module
│   ├── indexing/        # Index validation
│   ├── linking/         # Deep link generation
│   └── reporting/       # Report generation
├── config/              # Configuration management
├── storage/             # Data persistence (SQLite)
└── utils/               # Utility functions

cli/                     # Command-line interface
├── main.py              # CLI entry point
```

### Data Flow

```
Email Input → Email Parser → Message-ID Extraction
    ↓
Index Validator → Anomaly Detection
    ↓
Database Persistence → Audit Logging
    ↓
Report Generation → Deep Link Creation
```

## Development

### Code Style

- Python 3.11+ with type hints
- Google Python Style Guide docstrings
- Pydantic for data validation

### Testing

Tests are OPTIONAL - only included if explicitly required. To run tests:

```bash
# Install test dependencies
pip install pytest pytest-cov

# Run tests
pytest tests/ -v

# Run with coverage
pytest tests/ --cov=src --cov-report=html
```

## Troubleshooting

### Issue: Message-ID extraction returns None

**Cause**: Email file doesn't have Message-ID header or is corrupted

**Solution**: Check email file manually:
```python
from email import message_from_binary_file
with open('test.mbox', 'rb') as f:
    msg = message_from_binary_file(f)
    print(msg.keys())  # List all headers
```

### Issue: Deep link doesn't open email client

**Cause**: Email client not installed or URL scheme not registered

**Solution**: Check client installation:
```bash
# Test Thunderbird deep link
# Windows:
start thunderbird://message?id=test@domain.com
# macOS:
open thunderbird://message?id=test@domain.com
# Linux:
xdg-open thunderbird://message?id=test@domain.com
```

## License

[Specify your license here]

## Contributing

[Specify contribution guidelines here]

## 📚 文档维护指南
### 修改流程
1. **产品需求变更** → 编辑 `docs/product-design.md` → 运行 `specify agent [feature]` 更新 spec
2. **技术架构变更** → 编辑 `docs/tech-architecture.md` → 运行 `./scripts/sync-constitution.sh`
3. **提交时** → pre-commit hook 自动验证文档链接有效性

### 文档即权威
- 所有代码注释标注来源：`// 来源: docs/xxx.md#章节`
- 评审时优先对照原文档，而非口头描述
- 每次 PR 必须包含文档更新（如适用）