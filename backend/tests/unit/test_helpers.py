"""Unit tests for app.utils.helpers."""

from datetime import datetime, timezone

import pytest

from app.utils.helpers import (
    build_filters,
    format_datetime,
    generate_uuid,
    parse_csv_test_cases,
    sanitize_input,
)


class TestBuildFilters:
    def test_drops_none(self):
        assert build_filters(a=None, b="x") == {"b": "x"}

    def test_drops_empty_string(self):
        assert build_filters(a="", b="x") == {"b": "x"}

    def test_keeps_false(self):
        assert build_filters(is_active=False) == {"is_active": False}

    def test_keeps_zero(self):
        assert build_filters(count=0) == {"count": 0}

    def test_keeps_empty_list(self):
        # Empty collections are preserved; only None and "" are dropped.
        assert build_filters(tags=[]) == {"tags": []}

    def test_all_dropped_returns_empty_dict(self):
        assert build_filters(a=None, b="", c=None) == {}

    def test_mixed(self):
        result = build_filters(
            project_id="abc",
            is_active=False,
            search="",
            status=None,
            page=1,
        )
        assert result == {"project_id": "abc", "is_active": False, "page": 1}


class TestGenerateUuid:
    def test_returns_uuid4_string(self):
        value = generate_uuid()
        assert isinstance(value, str)
        # UUID4 is 36 chars with 4 hyphens
        assert len(value) == 36
        assert value.count("-") == 4

    def test_unique(self):
        assert generate_uuid() != generate_uuid()


class TestFormatDatetime:
    def test_default_uses_utc_now(self):
        result = format_datetime()
        # Basic shape: 2024-01-01T00:00:00Z
        assert result.endswith("Z")
        assert "T" in result

    def test_explicit_datetime(self):
        dt = datetime(2026, 1, 15, 12, 30, 45, tzinfo=timezone.utc)
        assert format_datetime(dt) == "2026-01-15T12:30:45Z"

    def test_custom_format(self):
        dt = datetime(2026, 1, 15, tzinfo=timezone.utc)
        assert format_datetime(dt, fmt="%Y-%m-%d") == "2026-01-15"


class TestParseCsvTestCases:
    def test_parses_rows(self):
        csv = (
            "title,description,priority\n"
            "Login,User login flow,High\n"
            "Logout,User logout flow,Medium\n"
        )
        rows = parse_csv_test_cases(csv)
        assert len(rows) == 2
        assert rows[0]["title"] == "Login"
        assert rows[1]["priority"] == "Medium"

    def test_empty_raises(self):
        with pytest.raises(ValueError):
            parse_csv_test_cases("title,description\n")

    def test_no_data_rows_raises(self):
        with pytest.raises(ValueError):
            parse_csv_test_cases("")


class TestSanitizeInput:
    def test_strips_whitespace(self):
        assert sanitize_input("  hello  ") == "hello"

    def test_removes_html_tags(self):
        assert sanitize_input("<script>bad</script>text") == "badtext"

    def test_truncates(self):
        value = "a" * 500
        result = sanitize_input(value, max_length=100)
        assert len(result) == 100

    def test_clean_string_unchanged(self):
        assert sanitize_input("clean text") == "clean text"
