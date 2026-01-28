"""Unicode and email header decoding utilities."""

from email.header import decode_header
from email.utils import parseaddr


def decode_email_header(header_value: str) -> str:
    """
    Decode RFC 2047 encoded-word header to Unicode string.

    Args:
        header_value: Raw header value (may be encoded)

    Returns:
        Decoded Unicode string

    Examples:
        >>> decode_email_header("=?UTF-8?B?5Lit5paH?=")
        '中文'
        >>> decode_email_header("=?UTF-8?B?5LiJ5bel5L2c?=<test@example.com>")
        '张三<test@example.com>'
    """
    if not header_value:
        return ""

    decoded_parts = []
    for content, encoding in decode_header(header_value):
        if isinstance(content, bytes):
            if encoding:
                try:
                    decoded_parts.append(content.decode(encoding))
                except (UnicodeDecodeError, LookupError):
                    # Fallback to UTF-8 with error replacement
                    decoded_parts.append(content.decode("utf-8", errors="replace"))
            else:
                # Unknown encoding, try ASCII then UTF-8
                try:
                    decoded_parts.append(content.decode("ascii"))
                except UnicodeDecodeError:
                    decoded_parts.append(content.decode("utf-8", errors="replace"))
        else:
            decoded_parts.append(str(content))

    return "".join(decoded_parts)


def truncate_subject(subject: str | None, max_length: int = 50) -> str:
    """
    Truncate subject to max_length with '...' if needed.

    Args:
        subject: Subject line text
        max_length: Maximum length (default 50)

    Returns:
        Truncated subject with ellipsis if needed

    Examples:
        >>> truncate_subject("Short subject")
        'Short subject'
        >>> truncate_subject("This is a very long subject that exceeds the maximum length", 30)
        'This is a very long subject ...'
    """
    if not subject:
        return ""

    if len(subject) <= max_length:
        return subject

    # Truncate and add ellipsis
    return subject[: max_length - 3] + "..."
