# Investigation: Why Agents Function Outside Muse

Date: 2026-03-29  
Scope: Pantheon runtime orchestration, Hermes gateway routing, Muse voice integration, startup conditions, and fallback logic.

## Executive Summary

The agents are functioning outside Muse by design, not by accident.

Pantheon has multiple user-entry paths that invoke Zeus and the ADK swarm directly through Hermes and the ADK runner. Muse is integrated as a voice I/O module (STT/TTS and optional ElevenLabs conversational bridge), but it is not a required dependency for the core multi-agent execution path.

In short:
- Text messages and file uploads do not require Muse.
- The core orchestration path is ADK-first (Zeus -> Athena -> Hades -> Apollo -> Ares), independent of voice.
- Muse is used when audio is involved or when ElevenLabs fallback is selected.
- Service startup explicitly allows Telegram + sandbox operation even if voice Mini App is disabled.

## What Was Investigated

I traced the runtime flow from all visible user entry points:
- Telegram text
- Telegram document upload
- Telegram voice message
- Telegram Mini App voice call
- ADK runner internals and fallback behavior
- Process startup gating in run.py
- Tests validating intended behavior

## Key Evidence

## 1. Hermes Routes Directly to ADK (Without Muse)

### Text flow
- `gateway/bot.py` sends text directly to `get_agent_response(...)`.
- `gateway/runner.py` sends requests to `_run_via_adk(...)` first.
- `_run_via_adk(...)` builds an ADK `Runner` around `agents.zeus` and streams outputs.

Evidence:
- `gateway/bot.py:148` creates `response_task = asyncio.create_task(get_agent_response(user_id, prompt))`
- `gateway/runner.py:144-168` says ADK is attempted first and preferred for full swarm execution.
- `gateway/runner.py:78-131` performs direct ADK execution and emits Zeus activation/completion events.

Result: agents run normally even if Muse is unavailable.

### File upload flow
- Uploaded files are saved and converted to a text prompt: `analyze the malware sample at <path>`.
- This prompt is sent through the same Hermes -> ADK path.

Evidence:
- `gateway/bot.py:287-292` builds prompt from file path and calls `_send_with_typing(...)`.
- `_send_with_typing(...)` again uses `get_agent_response(...)`.

Result: malware analysis starts without Muse involvement.

## 2. Muse Is Voice I/O, Not Orchestration Gatekeeper

`voice/client.py` implements:
- `transcribe(...)` for STT
- `speak(...)` for TTS

This file emits Muse events, but does not orchestrate the core swarm.

Evidence:
- `voice/client.py:36` `transcribe(...)`
- `voice/client.py:78` `speak(...)`
- `voice/client.py:44,53,63,100,112,120` use `AgentName.MUSE` event emission.

Result: Muse participates in voice UX, but not as required middleware for all agent actions.

## 3. Runner Is Explicitly ADK-First and Muse-Optional

`gateway/runner.py` documents and enforces priority:
1. ADK pipeline via Zeus (preferred)
2. ElevenLabs conversational agent (fallback only if ADK fails)

Evidence:
- `gateway/runner.py:146-151` docstring priority explicitly states ADK first.
- `gateway/runner.py:154-163` attempts ADK first.
- `gateway/runner.py:165-173` only tries ElevenLabs (`voice.agent.ask_agent`) if ADK fails.

Result: even with Muse/ElevenLabs issues, ADK path can still execute agents.

## 4. Startup Logic Enables Non-Voice Operation

`run.py` starts services independently:
- Hermes bot starts if Telegram token is present.
- Voice Mini App starts only if `WEBAPP_BASE_URL` and ElevenLabs key are set.
- Sandbox starts independently when importable.

Evidence:
- `run.py:95` Telegram bot enabled by `TELEGRAM_BOT_TOKEN` or `TELEGRAM_API`.
- `run.py:102` voice Mini App has extra requirements and can be disabled.
- `run.py:108` sandbox starts independently.

Result: system can run end-to-end text/file analysis without voice stack enabled.

## 5. Tests Confirm This Is Intended Behavior

### Bot tests
- Text handler tests assert direct `get_agent_response(...)` usage.
- Voice failure test asserts text still sends if TTS fails.

Evidence:
- `tests/test_bot.py:87-96` text path uses `get_agent_response(...)`.
- `tests/test_bot.py:215-228` TTS failure does not block text response.

### Runner tests
- Runner tests validate `get_agent_response(...)` concatenates ADK output parts.

Evidence:
- `tests/test_runner.py:43-59` ADK output aggregation test.

Result: outside-Muse functionality is supported by tests, not accidental side effects.

## 6. Mini App Uses ElevenLabs Agent, But Core Swarm Still Lives Elsewhere

- `gateway/static/call.html` starts ElevenLabs conversation by fetching `/api/agent-config` and connecting via ElevenLabs SDK.
- This is a separate voice-call UX path.

Evidence:
- `gateway/static/call.html:810` fetches `/api/agent-config`.
- `gateway/static/call.html:818-879` starts ElevenLabs conversation session.

Result: voice call path is additive; it does not replace Hermes -> ADK core execution path.

## Root Causes (Why This Happens)

1. Architectural separation of concerns.
Muse is scoped to voice conversion and conversational interface, while orchestration is owned by Zeus + ADK runner.

2. ADK-first routing policy in code.
The runner explicitly prioritizes ADK and only uses ElevenLabs agent as fallback.

3. Hermes directly triggers the swarm.
Text and file handlers invoke `get_agent_response(...)` without requiring Muse preconditions.

4. Fault-tolerant fallbacks preserve non-voice operation.
Even if TTS/STT fails, text responses and agent execution continue.

5. Independent startup gates.
Voice app can be disabled while Telegram + sandbox + ADK continue functioning.

## Important Observations

### Observation A: force_adk parameter is present but not currently used
`get_agent_response(..., force_adk: bool = False)` defines `force_adk`, but current implementation does not branch on it.
- Evidence: `gateway/runner.py:144` signature includes `force_adk`, but body does not consume it.
- Impact: no behavioral difference today; likely leftover or future hook.

### Observation B: WebApp comments mention backend tool endpoints that are not present in current webapp.py
`gateway/webapp.py` header comments describe `/api/tools/*` endpoints, but current file exposes `/call` and `/api/agent-config` only.
- Evidence: `gateway/webapp.py:1-10` comment vs. routes in `gateway/webapp.py:43-57`.
- Impact: possible documentation drift; not the cause of agents running outside Muse.

## Environment Context From Current .env

Current env uses compatibility variable names:
- `TELEGRAM_API` (fallback accepted by `gateway/bot.py` and `run.py`)
- `ELEVENLABS_API` (fallback accepted by `voice/client.py`, `voice/agent.py`, and `run.py`)

This still enables Hermes + ADK + optional Muse behavior as implemented.

## Conclusion

Agents functioning outside Muse is expected given the current architecture.

Pantheon is built so that multi-agent malware analysis can proceed through Hermes and ADK even when voice features are unavailable or failing. Muse augments the experience (voice transcription/synthesis and call UX), but is not the execution gate for Zeus and downstream agents.

If the desired behavior is to force all agent interactions through Muse, the architecture must be changed intentionally (routing policy, service gating, and failure semantics), because current code and tests explicitly support non-Muse execution.

## Optional Next Steps (If You Want Muse To Be Mandatory)

1. Enforce routing policy in `gateway/runner.py` so ADK execution is wrapped by a Muse session contract.
2. Add startup hard-fail in `run.py` when voice dependencies are missing.
3. Remove or restrict direct text/file paths in `gateway/bot.py` unless Muse handshake succeeds.
4. Update tests to assert fail-closed behavior when Muse is unavailable.
5. Align `gateway/webapp.py` comments with actual routes or implement missing tool endpoints if intended.
