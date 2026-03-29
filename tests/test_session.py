"""Tests for gateway.session — ADK session management."""

from __future__ import annotations

import pytest

from gateway import session as sess


@pytest.fixture(autouse=True)
def _clean_state() -> None:  # type: ignore[misc]
    """Reset module-level state between tests."""
    sess._user_sessions.clear()


async def test_create_session_returns_session() -> None:
    s = await sess.create_or_get_session("user_1")
    assert s is not None
    assert s.id  # non-empty session id


async def test_same_user_returns_same_session() -> None:
    s1 = await sess.create_or_get_session("user_2")
    s2 = await sess.create_or_get_session("user_2")
    assert s1.id == s2.id


async def test_different_users_get_different_sessions() -> None:
    s1 = await sess.create_or_get_session("user_a")
    s2 = await sess.create_or_get_session("user_b")
    assert s1.id != s2.id


async def test_reset_then_new_session() -> None:
    s1 = await sess.create_or_get_session("user_r")
    await sess.reset_session("user_r")
    s2 = await sess.create_or_get_session("user_r")
    assert s1.id != s2.id


async def test_reset_nonexistent_user_is_noop() -> None:
    await sess.reset_session("ghost_user")  # should not raise


async def test_get_session_service_returns_singleton() -> None:
    svc1 = sess.get_session_service()
    svc2 = sess.get_session_service()
    assert svc1 is svc2
