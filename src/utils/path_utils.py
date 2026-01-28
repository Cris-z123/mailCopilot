"""Path and Message-ID normalization utilities."""

import re


def normalize_message_id(message_id: str) -> str:
    """
    Normalize Message-ID to standard format with angle brackets.

    Args:
        message_id: Raw Message-ID (may or may not have brackets)

    Returns:
        Message-ID in format <id@domain>

    Raises:
        ValueError: If message_id is empty or malformed

    Examples:
        >>> normalize_message_id("abc@domain.com")
        '<abc@domain.com>'
        >>> normalize_message_id("<abc@domain.com>")
        '<abc@domain.com>'
    """
    if not message_id or not message_id.strip():
        raise ValueError("Message-ID is empty")

    # Remove whitespace
    clean_id = message_id.strip()

    # Remove existing angle brackets
    if clean_id.startswith("<"):
        clean_id = clean_id[1:]
    if clean_id.endswith(">"):
        clean_id = clean_id[:-1]

    # Basic format validation (id@domain pattern)
    if "@" not in clean_id:
        raise ValueError(f"Invalid Message-ID format: {message_id}")

    return f"<{clean_id}>"
