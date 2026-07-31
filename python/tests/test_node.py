import pytest

from aker_build._node import (
    NODE_FLOOR,
    meets_floor,
    parse_node_version,
)


def test_parses_a_standard_node_version_string():
    assert parse_node_version("v22.14.0\n") == (22, 14)
    assert parse_node_version("v22.13.0") == (22, 13)


def test_returns_none_for_unparseable_output():
    # A launcher that guessed here would run on an unknown runtime.
    assert parse_node_version("") is None
    assert parse_node_version("not a version") is None
    assert parse_node_version("v") is None


def test_floor_comparison_is_numeric_not_lexical():
    # The trap this exists to avoid: string comparison ranks "9" above "22",
    # because '9' > '2' lexically, so a naive check would accept Node 9.
    assert meets_floor((9, 99)) is False
    assert meets_floor((22, 13)) is True
    assert meets_floor((22, 12)) is False
    assert meets_floor((24, 0)) is True
    assert meets_floor((20, 11)) is False


def test_floor_matches_the_npm_engines_field():
    # Drift between the two channels' floors would let pip install a combination
    # npm refuses.
    assert NODE_FLOOR == (22, 13)


@pytest.mark.parametrize("text", ["v22.13", "22.13.0"])
def test_tolerates_missing_prefix_or_patch(text):
    assert parse_node_version(text) == (22, 13)
