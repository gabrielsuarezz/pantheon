"""Hephaestus analysis orchestrator — runs static + dynamic pipelines, stores results."""
from __future__ import annotations

import base64
import hashlib
import logging
import sqlite3
from typing import Any

from sandbox.dynamic.manager import SandboxManager
from sandbox.dynamic.parser import parse_intercept_log
from sandbox.models import (
    AnalysisType,
    FileIOCs,
    IOCReport,
    NetworkIOCs,
    ThreatReport,
)
from sandbox.static.deobfuscator import DeobfuscationResult
from sandbox.static.extractor import compute_hashes, extract_iocs
from sandbox.static.gemini_analyst import GeminiAnalyst

logger = logging.getLogger(__name__)

_DDL = """
CREATE TABLE IF NOT EXISTS jobs (
    job_id      TEXT PRIMARY KEY,
    report_json TEXT NOT NULL,
    ioc_json    TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
)
"""


class Analyzer:
    def __init__(self, db_path: str = "pantheon.db") -> None:
        self._db = sqlite3.connect(db_path, check_same_thread=False)
        self._db.execute("PRAGMA journal_mode=WAL")
        self._db.execute(_DDL)
        self._db.commit()
        # Lazy-initialized on first use so tests can patch _run_static/_run_dynamic
        # without requiring GOOGLE_API_KEY or a live Docker socket at construction.
        self._gemini: GeminiAnalyst | None = None
        self._docker: SandboxManager | None = None

    async def submit(
        self, file_content_b64: str, filename: str, analysis_type: AnalysisType  # type: ignore[valid-type]
    ) -> str:
        """Decode, analyze, persist results. Returns job_id."""
        file_bytes = base64.b64decode(file_content_b64)
        job_id = _make_job_id(filename, file_bytes)

        # Write a running sentinel so callers can poll before analysis completes
        self._upsert(job_id, _pending_report(job_id), None)

        await self._run(job_id, file_bytes, analysis_type)
        return job_id

    async def _run(
        self, job_id: str, file_bytes: bytes, analysis_type: str
    ) -> None:
        try:
            static_report = await self._run_static(file_bytes, job_id)

            dynamic_log: list[dict[str, Any]] = []
            if analysis_type in ("dynamic", "both"):
                dynamic_log = self._run_dynamic(file_bytes)

            report = self._merge(job_id, static_report, dynamic_log)
            iocs = _iocs_from_report(report)
            self._upsert(job_id, report, iocs)

        except Exception as exc:
            logger.exception("Analysis job %s failed: %s", job_id, exc)
            self._upsert(job_id, _error_report(job_id, str(exc)), None)

    async def _run_static(self, file_bytes: bytes, job_id: str) -> ThreatReport:
        if self._gemini is None:
            self._gemini = GeminiAnalyst()
        source = file_bytes.decode("utf-8", errors="replace")
        deob = DeobfuscationResult.from_source(source, file_bytes)
        extracted = extract_iocs(deob.summary_text, file_bytes)
        hashes = compute_hashes(file_bytes)
        report = await self._gemini.analyze(deob.summary_text)
        report.job_id = job_id
        report.file_iocs = FileIOCs(
            sha256=hashes["sha256"],
            md5=hashes["md5"],
            paths=extracted.file_paths,
        )
        # Merge IOCs the extractor found that Gemini may have missed
        report.network_iocs.ips = list(
            dict.fromkeys(report.network_iocs.ips + extracted.ips)
        )
        report.network_iocs.domains = list(
            dict.fromkeys(report.network_iocs.domains + extracted.domains)
        )
        return report

    def _run_dynamic(self, file_bytes: bytes) -> list[dict[str, Any]]:
        if self._docker is None:
            self._docker = SandboxManager()
        return self._docker.run(file_bytes)

    def _merge(
        self,
        job_id: str,
        static: ThreatReport,
        dynamic_log: list[dict[str, Any]],
    ) -> ThreatReport:
        if not dynamic_log:
            static.status = "complete"
            return static
        behavior = parse_intercept_log(dynamic_log)
        static.behavior = list(dict.fromkeys(static.behavior + behavior.to_behavior_strings()))
        static.network_iocs.urls = list(
            dict.fromkeys(static.network_iocs.urls + behavior.network_calls)
        )
        static.status = "complete"
        return static

    def get_report(self, job_id: str) -> ThreatReport | None:
        row = self._db.execute(
            "SELECT report_json FROM jobs WHERE job_id = ?", (job_id,)
        ).fetchone()
        if row is None:
            return None
        return ThreatReport.model_validate_json(row[0])

    def get_iocs(self, job_id: str) -> IOCReport | None:
        row = self._db.execute(
            "SELECT ioc_json FROM jobs WHERE job_id = ?", (job_id,)
        ).fetchone()
        if row is None or row[0] is None:
            return None
        return IOCReport.model_validate_json(row[0])

    def _upsert(
        self, job_id: str, report: ThreatReport, iocs: IOCReport | None
    ) -> None:
        self._db.execute(
            "INSERT OR REPLACE INTO jobs (job_id, report_json, ioc_json) VALUES (?, ?, ?)",
            (
                job_id,
                report.model_dump_json(),
                iocs.model_dump_json() if iocs else None,
            ),
        )
        self._db.commit()


def _make_job_id(filename: str, data: bytes) -> str:
    return hashlib.sha256(filename.encode() + data[:512]).hexdigest()[:16]


def _pending_report(job_id: str) -> ThreatReport:
    return ThreatReport(
        job_id=job_id, status="running",
        malware_type="", obfuscation_technique="",
        network_iocs=NetworkIOCs(), file_iocs=FileIOCs(),
        risk_level="medium", affected_systems=[], gemini_summary="",
    )


def _error_report(job_id: str, error: str) -> ThreatReport:
    return ThreatReport(
        job_id=job_id, status="failed",
        malware_type="analysis failed", obfuscation_technique="",
        behavior=[f"error: {error}"],
        network_iocs=NetworkIOCs(), file_iocs=FileIOCs(),
        risk_level="high", affected_systems=[], gemini_summary=error,
    )


def _iocs_from_report(report: ThreatReport) -> IOCReport:
    return IOCReport(
        ips=report.network_iocs.ips,
        domains=report.network_iocs.domains,
        file_hashes={"sha256": report.file_iocs.sha256, "md5": report.file_iocs.md5},
        file_paths=report.file_iocs.paths,
        ports=report.network_iocs.ports,
        registry_keys=report.registry_iocs,
        urls=report.network_iocs.urls,
    )
