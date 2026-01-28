"""Main CLI entry point for mailCopilot."""

import argparse
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional
from uuid import uuid4

from src.config.config_loader import ConfigLoader
from src.models.email_message import EmailMessage
from src.models.extracted_item import ExtractedItem, ItemType, Priority, IndexStatus
from src.services.email_parser.message_id_extractor import MessageIdExtractor
from src.services.indexing.index_validator import IndexValidator, ValidationResult
from src.services.linking.client_detector import ClientDetector
from src.services.reporting.metadata_formatter import MetadataFormatter
from src.storage.audit_log import AuditLog
from src.storage.database import (
    DatabaseConnection,
    EmailMessageRepository,
    ExtractedItemRepository,
    IndexAnomalyRepository,
)


def process_emails(
    email_paths: list[Path],
    config_path: Optional[Path] = None,
    verbose: bool = False,
) -> tuple[int, int, dict]:
    """
    Process emails and generate traceability report.

    Args:
        email_paths: List of email file paths to process
        config_path: Optional custom config file path
        verbose: Enable verbose logging

    Returns:
        Tuple of (total_emails, total_items, anomalies_summary)
    """
    # Load configuration
    config_loader = ConfigLoader(config_path)
    config = config_loader.load_app_config()

    # Initialize components
    db = DatabaseConnection(config.storage.get_database_path())
    db.execute_schema()

    email_repo = EmailMessageRepository(db)
    item_repo = ExtractedItemRepository(db)
    anomaly_repo = IndexAnomalyRepository(db)
    audit_log = AuditLog(config.storage.get_audit_log_path())

    validator = IndexValidator(anomaly_repo)
    extractor = MessageIdExtractor()
    formatter = MetadataFormatter(config.model_dump())

    # Detect email client
    client_detector = ClientDetector()
    try:
        adapter = client_detector.get_adapter()
    except Exception:
        adapter = None

    total_emails = 0
    total_items = 0

    # Process each email
    for email_path in email_paths:
        if verbose:
            print(f"Processing: {email_path}")

        total_emails += 1

        # Validate file exists
        file_result = validator.validate_email_file(email_path)
        if not file_result.is_valid:
            print(f"\n## {formatter.get_anomaly_marker()} {email_path.name}")
            print(f"Error: {file_result.error_details}\n")
            continue

        try:
            # Extract metadata
            metadata = extractor.extract_metadata(email_path)

            if not metadata:
                print(f"\n## {formatter.get_anomaly_marker()} {email_path.name}")
                print("无法提取 Message-ID\n")
                continue

            # Validate Message-ID
            validation_result = validator.validate_message_id(metadata.message_id)

            if not validation_result.is_valid:
                # Create anomaly record
                anomaly_id = validator.create_anomaly_record(
                    anomaly_type=validation_result.anomaly_type,
                    email_file_path=email_path,
                    message_id_value=metadata.message_id,
                    error_details=validation_result.error_details,
                )

                audit_log.log_index_anomaly(
                    anomaly_id=anomaly_id,
                    anomaly_type=validation_result.anomaly_type,
                    email_file_path=email_path,
                    message_id_value=metadata.message_id,
                    error_details=validation_result.error_details,
                )

                print(f"\n## {formatter.get_anomaly_marker()} {metadata.subject}")
                print(f"{formatter.get_anomaly_marker()} {validation_result.error_details}\n")
                continue

            # Save email message
            email = EmailMessage(
                message_id=metadata.message_id,
                sender_name=metadata.sender_name,
                sender_email=metadata.sender_email,
                sent_date=metadata.sent_date,
                subject=metadata.subject,
                file_path=metadata.file_path,
                format=metadata.format,
                storage_offset=metadata.storage_offset,
                maildir_key=metadata.maildir_key,
            )
            email_repo.save(email)

            # Format source metadata
            source_display = formatter.format_source_metadata(
                sender_name=metadata.sender_name,
                sender_email=metadata.sender_email,
                sent_date=metadata.sent_date,
                subject=metadata.subject,
            )

            # Generate deep link
            deep_link = None
            view_original = ""
            if adapter:
                try:
                    deep_link = adapter.generate_deep_link(metadata.message_id, email_path)
                    view_original = f"[查看原文]({deep_link})"
                except Exception as e:
                    if verbose:
                        print(f"Warning: Could not generate deep link: {e}")
                    view_original = f"文件位置: {email_path}"
            else:
                view_original = f"文件位置: {email_path}"

            # Display report entry
            print(f"\n## Task from {metadata.subject}")
            print(f"{source_display}")
            print(f"{view_original}\n")

            # Create sample item (in real use, this would come from LLM)
            item = ExtractedItem(
                item_id=str(uuid4()),
                content="Sample task from email",
                source_message_id=metadata.message_id,
                source_file_path=str(email_path),
                item_type=ItemType.TASK,
                priority=Priority.MEDIUM,
                confidence_score=0.85,
                index_status=IndexStatus.NORMAL,
                created_at=datetime.now(),
            )
            item_repo.save(item)
            total_items += 1

        except Exception as e:
            if verbose:
                print(f"Error processing {email_path}: {e}")
            continue

    # Get anomalies summary
    anomalies_summary = validator.get_anomalies_summary()

    # Display footer
    print("---")
    print(f"\nProcessed {total_emails} emails, {total_items} items extracted")
    if anomalies_summary["total_anomalies"] > 0:
        print(f"{formatter.get_anomaly_marker()} {anomalies_summary['total_anomalies']} items with index issues")
        for anomaly_type, count in anomalies_summary["by_type"].items():
            print(f"  - {anomaly_type}: {count}")

    return total_emails, total_items, anomalies_summary


def cmd_init_db(args):
    """Initialize database command."""
    config_loader = ConfigLoader(args.config)
    config = config_loader.load_app_config()

    db = DatabaseConnection(config.storage.get_database_path())
    db.execute_schema()
    db.migrate()

    print(f"Database initialized at: {config.storage.get_database_path()}")


def cmd_export_traceability(args):
    """Export traceability data command."""
    config_loader = ConfigLoader(args.config)
    config = config_loader.load_app_config()

    audit_log = AuditLog(config.storage.get_audit_log_path())

    output_path = Path(args.output) if args.output else Path("traceability_export.json")

    audit_log.export_traceability_data(output_path)

    print(f"Traceability data exported to: {output_path}")


def main():
    """CLI entry point."""
    parser = argparse.ArgumentParser(description="mailCopilot - Email Item Traceability")
    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # Process command (default)
    process_parser = subparsers.add_parser("process", help="Process emails and generate report")
    process_parser.add_argument("emails", nargs="+", help="Email file(s) to process")
    process_parser.add_argument("--config", type=Path, help="Custom config file path")
    process_parser.add_argument("--verbose", action="store_true", help="Enable verbose logging")
    process_parser.add_argument("--output", type=Path, help="Custom report output path")

    # Init-db command
    init_parser = subparsers.add_parser("init-db", help="Initialize database")
    init_parser.add_argument("--config", type=Path, help="Custom config file path")

    # Export command
    export_parser = subparsers.add_parser("export", help="Export traceability data")
    export_parser.add_argument("--config", type=Path, help="Custom config file path")
    export_parser.add_argument("--output", type=Path, help="Output file path")

    args = parser.parse_args()

    # Default command: process emails
    if args.command is None:
        if len(sys.argv) < 2:
            parser.print_help()
            sys.exit(1)

        # Treat as process command
        email_paths = [Path(p) for p in sys.argv[1:]]
        process_emails(email_paths)
    elif args.command == "process":
        email_paths = [Path(p) for p in args.emails]
        process_emails(email_paths, args.config, args.verbose)
    elif args.command == "init-db":
        cmd_init_db(args)
    elif args.command == "export":
        cmd_export_traceability(args)


if __name__ == "__main__":
    main()
