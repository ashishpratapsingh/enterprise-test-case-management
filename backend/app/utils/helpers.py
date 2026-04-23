"""Utility functions for the Enterprise Test Case Management application."""

import csv
import io
import re
import uuid
from datetime import datetime, timezone
from typing import Any


def build_filters(**kwargs: Any) -> dict[str, Any]:
    """Build a filters dict for repository queries, dropping None and empty-string values.

    Preserves meaningful falsy values such as ``False`` and ``0`` so boolean
    filters like ``is_active=False`` still apply. Use this for the common
    "optional query param → filter" pattern in list routes.
    """
    return {k: v for k, v in kwargs.items() if v is not None and v != ""}


def generate_uuid() -> str:
    """Generate a new UUID4 string.

    Returns:
        A new UUID4 as a string.
    """
    return str(uuid.uuid4())


def format_datetime(dt: datetime | None = None, fmt: str = "%Y-%m-%dT%H:%M:%SZ") -> str:
    """Format a datetime object to an ISO-style string.

    Args:
        dt: The datetime to format. Defaults to current UTC time.
        fmt: The strftime format string.

    Returns:
        Formatted datetime string.
    """
    if dt is None:
        dt = datetime.now(timezone.utc)
    return dt.strftime(fmt)


def parse_csv_test_cases(csv_content: str) -> list[dict[str, str]]:
    """Parse CSV content into a list of test case dictionaries.

    Expected CSV columns: title, description, preconditions, steps, expected_result, priority, type.
    The first row must be a header row.

    Args:
        csv_content: Raw CSV string content.

    Returns:
        A list of dictionaries, one per row, keyed by the header columns.

    Raises:
        ValueError: If the CSV content is empty or has no data rows.
    """
    reader = csv.DictReader(io.StringIO(csv_content))
    rows = list(reader)
    if not rows:
        raise ValueError("CSV content is empty or contains only headers.")
    return rows


def sanitize_input(value: str, max_length: int = 1000) -> str:
    """Sanitize a user-provided string by stripping dangerous patterns.

    - Strips leading/trailing whitespace.
    - Removes HTML tags.
    - Truncates to max_length.

    Args:
        value: The raw user input string.
        max_length: Maximum allowed length after sanitization.

    Returns:
        The sanitized string.
    """
    value = value.strip()
    # Remove HTML tags
    value = re.sub(r"<[^>]*>", "", value)
    # Truncate
    if len(value) > max_length:
        value = value[:max_length]
    return value
