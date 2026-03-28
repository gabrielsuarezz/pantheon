"""Athena — triage agent. Classifies threats and opens incident tickets."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

from google.adk.agents import Agent

_MALWARE_SIGNALS = [
    "malware", "trojan", "ransomware", "reverse shell", "backdoor",
    "c2", "command and control", "exfiltration", "suspicious process",
    "payload", "dropper", "keylogger",
]
_CRITICAL_SIGNALS = [
    "production", "prod", "database", "customer data", "payment",
    "outage", "down", "unresponsive", "breach", "data leak",
]
_INFRA_SIGNALS = [
    "cpu", "memory", "disk", "latency", "timeout", "oom",
    "crash", "restart", "deployment", "rollback",
]

_ticket_counter = 1001


@dataclass
class ThreatClassification:
    severity: str
    category: str
    requires_escalation: bool


@dataclass
class IncidentTicket:
    id: str
    title: str
    severity: str
    category: str
    status: str
    created_at: str


def classify_threat(description: str) -> ThreatClassification:
    """Classify severity and category from a plain-language incident description."""
    lower = description.lower()
    category = "general"
    severity = "medium"

    if any(s in lower for s in _MALWARE_SIGNALS):
        category = "security/malware"
        severity = "critical"
    elif any(s in lower for s in _INFRA_SIGNALS):
        category = "infrastructure"
        severity = "high"

    # Upgrade severity regardless of category when critical context words appear
    if any(s in lower for s in _CRITICAL_SIGNALS):
        severity = "critical"

    return ThreatClassification(
        severity=severity,
        category=category,
        requires_escalation=severity == "critical",
    )


def create_incident_ticket(
    title: str,
    severity: str,
    category: str,
    description: str,
) -> IncidentTicket:
    """Create and store an incident ticket."""
    global _ticket_counter
    ticket = IncidentTicket(
        id=f"INC-{_ticket_counter}",
        title=title,
        severity=severity,
        category=category,
        status="open",
        created_at=datetime.now(UTC).isoformat(),
    )
    _ticket_counter += 1
    return ticket


# --- ADK agent definition ---------------------------------------------------

athena = Agent(
    name="athena",
    model="gemini-2.5-flash",
    instruction="""You are Athena, the triage specialist in the Pantheon incident response system.

YOUR JOB:
1. Call classify_threat with the description of the incident
2. Call create_incident_ticket to open a tracking record
3. Report severity and category in one sentence
4. Transfer to hades for malware analysis

RULES:
- Be direct and decisive — one sentence per action
- Always create a ticket before transferring
- If severity is critical, say "CRITICAL" explicitly
""",
    description="Triages incidents — classifies severity and category, opens an incident ticket.",
    tools=[classify_threat, create_incident_ticket],
)
