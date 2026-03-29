from __future__ import annotations

from agents.athena import classify_threat, create_incident_ticket, ThreatClassification


def test_classify_malware_as_critical() -> None:
    result = classify_threat("suspicious process connecting to C2 server via reverse shell")
    assert result.severity == "critical"
    assert result.category == "security/malware"


def test_classify_infrastructure() -> None:
    result = classify_threat("production database is down, OOM killer running")
    assert result.severity in ("critical", "high")
    assert result.category == "infrastructure"


def test_classify_generic_as_medium() -> None:
    result = classify_threat("user cannot log in")
    assert result.severity in ("medium", "low")


def test_create_ticket_returns_id() -> None:
    ticket = create_incident_ticket(
        title="Malware detected on prod-db-01",
        severity="critical",
        category="security/malware",
        description="Reverse shell trojan found",
    )
    assert ticket.id.startswith("INC-")
    assert ticket.status == "open"
    assert ticket.severity == "critical"
