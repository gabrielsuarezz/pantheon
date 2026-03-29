"""Hermes — ADK session management.

Maps Telegram user_id to ADK session_id using InMemorySessionService.
"""

from __future__ import annotations

import uuid

from google.adk.sessions import InMemorySessionService, Session

APP_NAME = "pantheon"

_session_service = InMemorySessionService()  # type: ignore[no-untyped-call]
_user_sessions: dict[str, str] = {}


async def create_or_get_session(user_id: str) -> Session:
    """Return an existing ADK session for *user_id*, or create a new one."""
    session_id = _user_sessions.get(user_id)

    if session_id is not None:
        session = await _session_service.get_session(
            app_name=APP_NAME,
            user_id=user_id,
            session_id=session_id,
        )
        if session is not None:
            return session

    # No existing session — create one.
    session_id = uuid.uuid4().hex
    session = await _session_service.create_session(
        app_name=APP_NAME,
        user_id=user_id,
        session_id=session_id,
    )
    _user_sessions[user_id] = session_id
    return session


async def reset_session(user_id: str) -> None:
    """Discard the ADK session for *user_id* so the next call creates a fresh one."""
    old_id = _user_sessions.pop(user_id, None)
    if old_id is not None:
        # Delete from the backing store so memory is freed.
        await _session_service.delete_session(
            app_name=APP_NAME,
            user_id=user_id,
            session_id=old_id,
        )


def get_session_service() -> InMemorySessionService:
    """Expose the singleton session service for the ADK Runner."""
    return _session_service
