"""Integration tests for the Pantheon swarm orchestration system.

Tests the complete agent pipeline: Zeus → Athena → Hades → Apollo → Ares

All external calls (sandbox, EventBus, LLM) are mocked.
"""

from __future__ import annotations

import asyncio
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from agents.swarm import AnalysisStatus, SwarmJob, SwarmManager


@pytest.fixture
def swarm() -> SwarmManager:
    """Create a fresh SwarmManager instance for each test."""
    return SwarmManager()


@pytest.fixture
def sample_path(tmp_path: Path) -> Path:
    """Create a temporary malware sample file."""
    sample = tmp_path / "6108674530.JS.malicious"
    sample.write_text("// obfuscated JS dropper")
    return sample


class TestSwarmJobLifecycle:
    """Test the lifecycle of a SwarmJob through the analysis pipeline."""

    @pytest.mark.asyncio
    async def test_ingest_sample(self, swarm: SwarmManager, sample_path: Path) -> None:
        """Test ingesting a malware sample into the swarm."""
        job_id = await swarm.ingest_sample(sample_path)
        
        assert job_id is not None
        assert len(job_id) > 0
        
        # Job should be pending
        pending = await swarm.get_pending_count()
        assert pending == 1

    @pytest.mark.asyncio
    async def test_route_next_pending_job(
        self, swarm: SwarmManager, sample_path: Path
    ) -> None:
        """Test routing the next pending job from queue."""
        job_id_in = await swarm.ingest_sample(sample_path)
        job = await swarm.route_next()
        
        assert job is not None
        assert job.job_id == job_id_in
        assert job.status == AnalysisStatus.ROUTING
        assert job.sample_name == sample_path.name

        # After routing, it should be in-progress
        pending = await swarm.get_pending_count()
        in_progress = await swarm.get_in_progress_count()
        assert pending == 0
        assert in_progress == 1

    @pytest.mark.asyncio
    async def test_update_job_through_pipeline(
        self, swarm: SwarmManager, sample_path: Path
    ) -> None:
        """Test updating a job as it progresses through agents."""
        job_id = await swarm.ingest_sample(sample_path)
        job = await swarm.route_next()

        # Simulate Athena classification
        await swarm.update_job_status(
            job_id,
            AnalysisStatus.ROUTING,
            "Malware - Critical",
        )
        updated = swarm.get_job(job_id)
        assert updated is not None
        assert updated.threat_classification == "Malware - Critical"

        # Simulate Hades analysis
        await swarm.update_job_status(
            job_id,
            AnalysisStatus.ANALYZING,
            {"malware_type": "WSH dropper", "risk_level": "critical"},
        )
        updated = swarm.get_job(job_id)
        assert updated is not None
        assert updated.threat_report is not None

        # Simulate Apollo enrichment
        await swarm.update_job_status(
            job_id,
            AnalysisStatus.ENRICHING,
            "IOCs enriched with threat intel",
        )
        updated = swarm.get_job(job_id)
        assert updated is not None
        assert "enriched" in updated.enriched_iocs or updated.enriched_iocs is None

        # Simulate Ares planning
        await swarm.update_job_status(
            job_id,
            AnalysisStatus.PLANNING,
            "Containment, remediation, and prevention plans generated",
        )
        updated = swarm.get_job(job_id)
        assert updated is not None

    @pytest.mark.asyncio
    async def test_complete_job(
        self, swarm: SwarmManager, sample_path: Path
    ) -> None:
        """Test completing a job successfully."""
        job_id = await swarm.ingest_sample(sample_path)
        await swarm.route_next()

        # Simulate full pipeline
        await swarm.update_job_status(job_id, AnalysisStatus.ANALYZING)
        await swarm.update_job_status(job_id, AnalysisStatus.ENRICHING)
        await swarm.update_job_status(job_id, AnalysisStatus.PLANNING)

        # Complete the job
        completed_job = await swarm.complete_job(job_id)
        assert completed_job is not None
        assert completed_job.status == AnalysisStatus.COMPLETE

        # Stats should reflect completion
        stats = await swarm.stats()
        assert stats["completed"] == 1
        assert stats["in_progress"] == 0

    @pytest.mark.asyncio
    async def test_fail_job_with_retry(
        self, swarm: SwarmManager, sample_path: Path
    ) -> None:
        """Test failing a job and queueing for retry."""
        job_id = await swarm.ingest_sample(sample_path)
        await swarm.route_next()

        # Fail the job
        failed_job = await swarm.fail_job(job_id, "Sandbox timeout")
        assert failed_job is not None
        assert failed_job.status == AnalysisStatus.RETRY
        assert failed_job.retry_count == 1
        assert failed_job.error_message == "Sandbox timeout"

        # Should be back in pending queue
        pending = await swarm.get_pending_count()
        assert pending == 1

    @pytest.mark.asyncio
    async def test_fail_job_exhausts_retries(
        self, swarm: SwarmManager, sample_path: Path
    ) -> None:
        """Test failing a job after all retries are exhausted."""
        job_id = await swarm.ingest_sample(sample_path)
        await swarm.route_next()

        job = swarm.get_job(job_id)
        assert job is not None

        # Fail the job max_retries times
        for i in range(job.max_retries):
            await swarm.fail_job(job_id, f"Attempt {i+1} failed")

        # After max retries, should be in FAILED status
        failed_job = swarm.get_job(job_id)
        assert failed_job is not None
        assert failed_job.status == AnalysisStatus.FAILED
        assert failed_job.retry_count == job.max_retries

        stats = await swarm.stats()
        assert stats["failed"] == 1


class TestSwarmStatistics:
    """Test swarm statistics and state tracking."""

    @pytest.mark.asyncio
    async def test_initial_stats_empty(self, swarm: SwarmManager) -> None:
        """Test empty swarm has zero stats."""
        stats = await swarm.stats()
        assert stats["pending"] == 0
        assert stats["in_progress"] == 0
        assert stats["completed"] == 0
        assert stats["failed"] == 0

    @pytest.mark.asyncio
    async def test_concurrent_jobs(
        self, swarm: SwarmManager, tmp_path: Path
    ) -> None:
        """Test swarm handles multiple concurrent jobs."""
        # Ingest 5 samples
        job_ids = []
        for i in range(5):
            sample = tmp_path / f"sample_{i}.js"
            sample.write_text(f"// sample {i}")
            job_id = await swarm.ingest_sample(sample)
            job_ids.append(job_id)

        # Route 3 of them
        for _ in range(3):
            await swarm.route_next()

        stats = await swarm.stats()
        assert stats["pending"] == 2
        assert stats["in_progress"] == 3

        # Complete 2 of them
        for job_id in job_ids[:2]:
            await swarm.complete_job(job_id)

        stats = await swarm.stats()
        assert stats["in_progress"] == 1
        assert stats["completed"] == 2


class TestSwarmAgentPipeline:
    """Test the agent pipeline flow: Athena → Hades → Apollo → Ares."""

    @pytest.mark.asyncio
    async def test_full_pipeline_workflow(
        self, swarm: SwarmManager, sample_path: Path
    ) -> None:
        """
        Test the complete workflow of a sample flowing through all agents.
        
        Workflow:
        1. Zeus ingests sample → swarm queues it
        2. Athena triages → updates ROUTING status
        3. Hades analyzes → updates ANALYZING status
        4. Apollo enriches → updates ENRICHING status
        5. Ares plans → updates PLANNING status
        6. Job completes → moves to COMPLETED
        """
        # Step 1: Ingest
        job_id = await swarm.ingest_sample(sample_path)
        assert await swarm.get_pending_count() == 1

        # Step 2: Zeus routes to Athena
        job = await swarm.route_next()
        assert job is not None
        assert job.status == AnalysisStatus.ROUTING

        # Step 3: Athena classifies threat
        await swarm.update_job_status(
            job_id,
            AnalysisStatus.ROUTING,
            "WSH Dropper / Critical",
        )
        job = swarm.get_job(job_id)
        assert job is not None
        assert job.threat_classification == "WSH Dropper / Critical"

        # Step 4: Hades analyzes the sample
        threat_report = {
            "malware_type": "WSH dropper",
            "risk_level": "critical",
            "behavior": [
                "Decodes obfuscated payload",
                "Drops PE file to C:\\Users\\Public\\",
                "Establishes persistence via registry",
                "Contacts C2 over HTTPS",
            ],
            "file_iocs": ["C:\\Users\\Public\\Mands.png"],
            "registry_iocs": ["HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\Updater"],
            "network_iocs": ["evil-c2.example.com:443"],
        }
        await swarm.update_job_status(
            job_id,
            AnalysisStatus.ANALYZING,
            threat_report,
        )
        job = swarm.get_job(job_id)
        assert job is not None
        assert job.threat_report == threat_report

        # Step 5: Apollo enriches IOCs
        await swarm.update_job_status(
            job_id,
            AnalysisStatus.ENRICHING,
            "IOCs enriched: C2 confirmed AsyncRAT variant; File hash in VirusTotal",
        )
        job = swarm.get_job(job_id)
        assert job is not None

        # Step 6: Ares generates response
        response_plan = (
            "CONTAINMENT PLAN:\n"
            "- Isolate affected hosts from network\n"
            "- Kill powershell.exe processes\n"
            "\n"
            "REMEDIATION:\n"
            "- Remove registry persistence keys\n"
            "- Delete dropped files\n"
        )
        await swarm.update_job_status(
            job_id,
            AnalysisStatus.PLANNING,
            response_plan,
        )
        job = swarm.get_job(job_id)
        assert job is not None

        # Step 7: Complete the analysis
        job = await swarm.complete_job(job_id)
        assert job is not None
        assert job.status == AnalysisStatus.COMPLETE

        # Verify final state
        stats = await swarm.stats()
        assert stats["completed"] == 1
        assert stats["in_progress"] == 0
        assert stats["pending"] == 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
