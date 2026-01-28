# Research: Item Traceability & Indexing Module

**Feature**: 001-item-traceability
**Date**: 2026-01-28
**Status**: Complete

## Overview

This document consolidates technical research findings for implementing email item traceability. All unknowns from the Technical Context have been resolved through investigation of standards, libraries, and best practices.

---

## Research Topic 1: RFC 5322 Message-ID Format & Extraction

### Decision
Use Python standard library `email` module for Message-ID extraction

### Rationale
- **Full RFC 5322 Compliance**: Python's `email.message.Message.get('Message-ID')` handles all standard formats
- **Robust Parsing**: Automatically handles:
  - Standard format: `<unique-id@domain>`
  - Missing angle brackets (malformed but common)
  - Duplicate Message-ID headers (returns first occurrence)
  - Comments and whitespace within headers
- **Zero Dependencies**: Built-in since Python 2.x, well-tested
- **Cross-Platform**: Consistent behavior across Windows, macOS, Linux

### Alternatives Considered
- **Custom regex parsing**: Rejected due to edge cases (comments, folded headers, encoded words)
- **Third-party email libraries** (e.g., `email-validator`): Rejected - adds dependency, `email` stdlib is sufficient

### Implementation Details

```python
from email import message_from_binary_file
from email.policy import default

# Parse email
with open(email_path, 'rb') as f:
    msg = message_from_binary_file(f, policy=default)

# Extract Message-ID (returns None if missing)
message_id = msg.get('Message-ID')

# Validation: Check format
if message_id:
    # Normalize: Remove whitespace, ensure angle brackets
    message_id = message_id.strip()
    if not message_id.startswith('<'):
        message_id = f'<{message_id}>'
    if not message_id.endswith('>'):
        message_id = f'{message_id}>'
```

### Edge Cases Handled
1. **Missing Message-ID**: Returns `None`, mark as `[索引异常]`
2. **Malformed Message-ID**: Attempt normalization, mark as anomaly if fails
3. **Duplicate emails with same Message-ID**: Use combination of `file_path + message_id` as unique key
4. **Message-ID in different header locations**: Standard `get()` searches all headers

---

## Research Topic 2: Cross-Platform Email Client Detection

### Decision
Use OS-native mechanisms for default email client detection

### Rationale
- **Reliability**: OS-level APIs are authoritative and maintained by platform vendors
- **No External Dependencies**: Uses built-in tools (registry, defaults, xdg-utils)
- **User Expectations**: Respects user's system preferences
- **Fallback**: If detection fails, display file path + manual open instructions

### Alternatives Considered
- **Hardcoded client lists**: Rejected - fragile, doesn't adapt to user preferences
- **Desktop entry files parsing** (Linux): Rejected - inconsistent across distributions
- **Browser-based detection** (mailto: handler): Rejected - unreliable, requires user interaction

### Implementation Details

#### Windows
```python
import winreg

def detect_default_email_client_windows():
    try:
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER,
                           r"Software\Clients\Mail")
        client_name = winreg.QueryValueEx(key, None)[0]
        winreg.CloseKey(key)

        # Map to supported clients
        client_map = {
            "Thunderbird": "thunderbird",
            "Mozilla Thunderbird": "thunderbird",
            # Apple Mail not on Windows
        }
        return client_map.get(client_name, "unknown")
    except WindowsError:
        return "unknown"
```

#### macOS
```python
import subprocess

def detect_default_email_client_macos():
    try:
        result = subprocess.run(
            ["defaults", "read", "com.apple.LaunchServices",
             "LSHandlerRoleAllForContentType:public.email-message"],
            capture_output=True, text=True
        )
        client_bundle_id = result.stdout.strip()

        client_map = {
            "com.apple.Mail": "applemail",
            "org.mozilla.thunderbird": "thunderbird",
        }
        return client_map.get(client_bundle_id, "unknown")
    except subprocess.CalledProcessError:
        return "unknown"
```

#### Linux
```python
import subprocess
import os

def detect_default_email_client_linux():
    # Method 1: Check xdg-email
    try:
        result = subprocess.run(["xdg-email", "--version"],
                              capture_output=True)
        if result.returncode == 0:
            # xdg-email handles defaults, return "xdg"
            return "xdg"
    except FileNotFoundError:
        pass

    # Method 2: Check desktop files
    desktop_dir = os.path.expanduser("~/.local/share/applications/")
    if os.path.exists(desktop_dir):
        for file in os.listdir(desktop_dir):
            if "thunderbird" in file.lower():
                return "thunderbird"
            elif "mail" in file.lower():
                return "applemail"  # Claws Mail, etc.

    return "unknown"
```

### Fallback Strategy
If detection returns `"unknown"`:
1. Display email file path prominently in report
2. Show "Open in email client" button that opens file browser to email location
3. Provide instructions: "Open this file in your email client"

---

## Research Topic 3: Email Client Deep Link Protocols

### Decision
Use client-specific URL schemes for deep linking

### Rationale
- **Standardized Protocols**: RFC 2392 for MID URLs (message://), vendor-specific schemes (thunderbird://)
- **No Network Requests**: URL schemes trigger local applications
- **User Experience**: One-click access to original email
- **Fallback**: File path display for unsupported clients

### Alternatives Considered
- **D-Bus/AppleScript automation**: Rejected - too complex, client-specific APIs
- **Command-line arguments**: Rejected - inconsistent across clients
- **Direct file access** (opening mbox/Maildir): Rejected - clients may not auto-navigate to message

### Implementation Details

#### Thunderbird
```python
def generate_thunderbird_deep_link(message_id: str) -> str:
    """
    Generate Thunderbird deep link URL.
    Format: thunderbird://message?id=<message-id>
    Example: thunderbird://message?id=<abc123@domain.com>
    """
    # Remove angle brackets if present
    clean_id = message_id.strip('<>')
    return f"thunderbird://message?id={clean_id}"
```

**Testing**:
- Windows/macOS/Linux: Open link in browser/command (OS handles protocol registration)
- Thunderbird must be installed and registered as thunderbird:// handler

#### Apple Mail
```python
def generate_applemail_deep_link(message_id: str) -> str:
    """
    Generate Apple Mail deep link URL (RFC 2392 compliant).
    Format: message://<message-id>
    Example: message://abc123@domain.com
    """
    # Remove angle brackets if present
    clean_id = message_id.strip('<>')
    return f"message://{clean_id}"
```

**Testing**:
- macOS only: Use `open` command to trigger URL
- Apple Mail must be default mail client

#### Cross-Platform Link Invocation
```python
import webbrowser
import platform
import subprocess

def open_deep_link(url: str) -> bool:
    """
    Open deep link in registered email client.
    Returns True if successful, False otherwise.
    """
    try:
        if platform.system() == "Darwin":  # macOS
            subprocess.run(["open", url], check=True)
        elif platform.system() == "Windows":
            webbrowser.open(url)  # Windows handles protocol registration
        else:  # Linux
            subprocess.run(["xdg-open", url], check=True)
        return True
    except (subprocess.CalledProcessError, webbrowser.Error):
        return False
```

### Edge Cases
1. **Client not installed**: OS shows error dialog, fallback to file path display
2. **Email moved/deleted**: Client opens but can't find message, display clear error
3. **Message-ID not found in client**: Client shows "message not found" or opens to inbox

---

## Research Topic 4: Email Storage Format Parsing (mbox vs Maildir)

### Decision
Use Python standard library `mailbox` module

### Rationale
- **Universal Support**: Single module handles both mbox and Maildir formats
- **Zero Dependencies**: Built-in since Python 2.x
- **Robust**: Handles format variations, locking, concurrent access
- **Cross-Platform**: Consistent API across operating systems

### Alternatives Considered
- **Custom parsing**: Rejected - error-prone, must handle format specifications
- **Third-party libraries** (e.g., `mbox-parser`): Rejected - unnecessary dependency
- **Email client-specific APIs** (e.g., Thunderbird SQLite): Rejected - fragile, client-specific

### Implementation Details

#### Format Auto-Detection
```python
import mailbox
import os

def detect_email_format(email_path: str) -> str:
    """
    Detect email storage format.
    Returns: 'mbox', 'maildir', or 'unknown'
    """
    if os.path.isfile(email_path):
        # mbox is a single file
        return "mbox"
    elif os.path.isdir(email_path):
        # Maildir has specific subdirectories
        maildir_subdirs = {'cur', 'new', 'tmp'}
        if maildir_subdirs.issubset(set(os.listdir(email_path))):
            return "maildir"
    return "unknown"
```

#### mbox Parsing
```python
def parse_mbox(email_path: str):
    """
    Parse mbox file and iterate over messages.
    Yields: (message_index, email.message.Message)
    """
    mbox = mailbox.mbox(email_path, create=False)
    for msg_id, msg in mbox.items():
        yield msg_id, msg
    mbox.close()
```

#### Maildir Parsing
```python
def parse_maildir(maildir_path: str):
    """
    Parse Maildir directory and iterate over messages.
    Yields: (message_key, email.message.Message)
    """
    maildir = mailbox.Maildir(maildir_path, create=False)
    for msg_key, msg in maildir.items():
        yield msg_key, msg
    maildir.close()
```

### Performance Considerations
- **mbox**: Entire file loaded into memory, slower for large mailboxes (>10,000 emails)
- **Maildir**: Each message is separate file, faster for large mailboxes

### Edge Cases
1. **Locked mailbox**: `mailbox` module handles locking with `.lock()` method
2. **Corrupted mbox**: Module raises `mailbox.MailboxError`, catch and log
3. **Email encoding**: Use `policy=default` for automatic charset detection

---

## Research Topic 5: Internationalization (UTF-8 & RFC 2047)

### Decision
Use Python `email.header.decode_header()` for RFC 2047 encoded words

### Rationale
- **RFC 2047 Compliance**: Handles all standard encodings (UTF-8, ISO-8859-*, etc.)
- **Automatic Detection**: Header declares encoding, no guessing required
- **Built-in**: Zero dependencies, robust implementation

### Alternatives Considered
- **Assume UTF-8**: Rejected - many legacy emails use ISO-8859-1, GB2312, etc.
- **Third-party encoding detection** (e.g., `chardet`): Rejected - unnecessary, headers declare encoding
- **Unicode normalization only**: Rejected - doesn't handle encoded words

### Implementation Details

#### Decoding Email Headers
```python
from email.header import decode_header
from email.utils import parseaddr

def decode_email_header(header_value: str) -> str:
    """
    Decode RFC 2047 encoded-word header to Unicode string.
    Example: "=?UTF-8?B?5Lit5paH?=" -> "中文"
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
                    decoded_parts.append(content.decode('utf-8', errors='replace'))
            else:
                # Unknown encoding, try ASCII then UTF-8
                try:
                    decoded_parts.append(content.decode('ascii'))
                except UnicodeDecodeError:
                    decoded_parts.append(content.decode('utf-8', errors='replace'))
        else:
            decoded_parts.append(str(content))

    return ''.join(decoded_parts)

# Usage
sender_header = "=?UTF-8?B?5LiJ5bel5L2c?=<zhangsan@example.com>"
decoded_sender = decode_email_header(sender_header)
# Output: "张三<zhangsan@example.com>"

# Parse name and email separately
name, email_addr = parseaddr(decoded_sender)
# name: "张三", email_addr: "zhangsan@example.com"
```

#### Decoding Subject Lines
```python
def decode_subject(subject: str) -> str:
    """
    Decode subject line, handling encoded words and folding.
    """
    # decode_header handles encoded words
    decoded = decode_email_header(subject)
    # Remove line folding (RFC 5322 section 2.2.3)
    unfolded = decoded.replace('\r\n ', ' ').replace('\r\n\t', ' ')
    return unfolded.strip()
```

### Edge Cases
1. **Mixed encodings**: Header may contain multiple encoded words with different encodings
2. **Invalid encoding**: Fallback to UTF-8 with error replacement
3. **Broken encoded words**: Some clients produce malformed encoded words, handle gracefully

---

## Summary of Technology Decisions

| Component | Technology | Justification |
|-----------|-----------|---------------|
| **Email Parsing** | `email` stdlib, `mailbox` stdlib | RFC compliant, zero deps, cross-platform |
| **Message-ID Extraction** | `email.message.Message.get()` | Handles all edge cases, robust |
| **Email Client Detection** | OS-native APIs (registry, defaults, xdg) | Respects user preferences, reliable |
| **Deep Link Generation** | Client URL schemes (thunderbird://, message://) | Standard protocols, one-click access |
| **Internationalization** | `email.header.decode_header()` | RFC 2047 compliant, auto-detects encoding |
| **Configuration** | `pydantic` | Schema validation, migration support |
| **Database** | `sqlite3` stdlib | Embedded, no server, sufficient scale |
| **Testing** | `pytest` (optional) | Industry standard |

**All research complete. No NEEDS CLARIFICATION items remaining.**
