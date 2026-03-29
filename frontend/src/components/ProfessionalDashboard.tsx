'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Terminal,
  ScrollText,
} from 'lucide-react';
import { getEventStore, type Statistics, type AgentStatus, type EventStore } from '@/lib/event-store';
import { initWS } from '@/lib/pantheon-ws';

import OlympusFlow    from './OlympusFlow';
import AgentInspector from './AgentInspector';
import DivineChronicle from './DivineChronicle';
import IOCPanel       from './IOCPanel';
import HUDBar         from './HUDBar';
import SlidePanel     from './SlidePanel';
import DiscoveriesArchive from './DiscoveriesArchive';

// ---------------------------------------------------------------------------
// Preset Demo Script — purely frontend, no live sandbox dependency.
// ---------------------------------------------------------------------------

function runPresetDemo(store: EventStore): void {
  // Prevent overlapping demos.
  if ((window as unknown as { __pantheonDemoRunning?: boolean }).__pantheonDemoRunning) {
    console.log('Pantheon preset demo already running.');
    return;
  }
  (window as unknown as { __pantheonDemoRunning?: boolean }).__pantheonDemoRunning = true;

  store.reset();
  const jobId = 'demo-job-001';
  const sampleName = '6108674530.JS.malicious';
  store.startJob(jobId, sampleName);
  store.updateJobStatus('routing', 'hermes');

  const now = Date.now();
  // Keep normal pacing; demo richness comes from more events, not slower timing.
  const DEMO_TIME_SCALE = 1;
  const mkTs = (offsetMs: number): string =>
    new Date(now + offsetMs * DEMO_TIME_SCALE).toISOString();

  const schedule = (delay: number, fn: () => void): number =>
    window.setTimeout(fn, delay * DEMO_TIME_SCALE);

  const add = (delay: number, event: Record<string, unknown>): void => {
    schedule(delay, () => {
      store.addEvent({
        job_id: jobId,
        ...event,
      });
    });
  };
  let cursor = 0;
  const push = (
    gapMs: number,
    event: Omit<Record<string, unknown>, 'timestamp'>,
  ): void => {
    cursor += gapMs;
    add(cursor, { ...event, timestamp: mkTs(cursor) });
  };

  // Hermes receives file and hands off to Zeus.
  add(0, {
    type: 'AGENT_ACTIVATED',
    agent: 'hermes',
    timestamp: mkTs(0),
    payload: { step: 'telegram_prompt: demo sample uploaded' },
  });
  add(300, {
    type: 'HANDOFF',
    agent: 'hermes',
    timestamp: mkTs(300),
    payload: { from: 'hermes', to: 'zeus' },
  });
  add(400, {
    type: 'AGENT_COMPLETED',
    agent: 'hermes',
    timestamp: mkTs(400),
    payload: {},
  });

  // Zeus orchestrates.
  add(450, {
    type: 'AGENT_ACTIVATED',
    agent: 'zeus',
    timestamp: mkTs(450),
    payload: { step: 'Parallel dispatch + incident orchestration' },
  });
  store.updateJobStatus('analyzing', 'zeus');

  // Zeus thinks + dispatches Athena + Hades in parallel (agentic swarm feel).
  add(600, {
    type: 'THOUGHT',
    agent: 'zeus',
    timestamp: mkTs(600),
    payload: { thought: 'Spawning parallel branches: Athena (static) + Hades (dynamic).' },
  });
  add(700, {
    type: 'HANDOFF',
    agent: 'zeus',
    timestamp: mkTs(700),
    payload: { from: 'zeus', to: 'athena' },
  });
  add(700, {
    type: 'HANDOFF',
    agent: 'zeus',
    timestamp: mkTs(700),
    payload: { from: 'zeus', to: 'hades' },
  });

  // Zeus calls triage tool (fast).
  add(900, {
    type: 'TOOL_CALLED',
    agent: 'zeus',
    tool: 'triage_sample',
    timestamp: mkTs(900),
    payload: { filename: sampleName, suspicion: 'high' },
  });
  add(1400, {
    type: 'TOOL_RESULT',
    agent: 'zeus',
    tool: 'triage_sample',
    timestamp: mkTs(1400),
    payload: { verdict: 'likely malware', confidence: 0.97 },
  });

  // Athena: threat classification (runs concurrently while Zeus stays active).
  add(1650, {
    type: 'AGENT_ACTIVATED',
    agent: 'athena',
    timestamp: mkTs(1650),
    payload: { step: 'classify threat + open incident ticket' },
  });
  add(1750, {
    type: 'THOUGHT',
    agent: 'athena',
    timestamp: mkTs(1750),
    payload: { thought: 'Scanning strings + deobfuscation patterns; looking for loaders/C2.' },
  });
  add(2100, {
    type: 'TOOL_CALLED',
    agent: 'athena',
    tool: 'classify_threat',
    timestamp: mkTs(2100),
    payload: { features: ['wscript', 'suspicious http', 'registry writes'] },
  });
  add(2700, {
    type: 'TOOL_RESULT',
    agent: 'athena',
    tool: 'classify_threat',
    timestamp: mkTs(2700),
    payload: { family: 'WSH dropper', risk_level: 'critical' },
  });

  // First attack stage unlocked.
  add(2800, {
    type: 'STAGE_UNLOCKED',
    agent: 'athena',
    timestamp: mkTs(2800),
    payload: {
      stage_id: 'initial-access',
      label: 'Initial Access',
      description: 'User executes spearphish attachment (malicious JS).',
      icon: 'door-open',
    },
  });

  // Handoff to Hades (heavier, more events and slower).
  add(2900, {
    type: 'HANDOFF',
    agent: 'athena',
    timestamp: mkTs(2900),
    payload: { from: 'athena', to: 'zeus' },
  });
  add(2960, {
    type: 'HANDOFF',
    agent: 'zeus',
    timestamp: mkTs(2960),
    payload: { from: 'zeus', to: 'hades' },
  });
  add(3000, {
    type: 'AGENT_COMPLETED',
    agent: 'athena',
    timestamp: mkTs(3000),
    payload: {},
  });

  add(3050, {
    type: 'AGENT_ACTIVATED',
    agent: 'hades',
    timestamp: mkTs(3050),
    payload: { step: 'sandbox + Windows VPS detonation' },
  });
  add(3200, {
    type: 'THOUGHT',
    agent: 'hades',
    timestamp: mkTs(3200),
    payload: { thought: 'Detonating in isolated harness; watching for dropped files, Run keys, and beacons.' },
  });

  // Hades sandbox analysis (tool calls).
  add(3400, {
    type: 'TOOL_CALLED',
    agent: 'hades',
    tool: 'submit_sample',
    timestamp: mkTs(3400),
    payload: { filename: sampleName, analysis_type: 'both' },
  });
  add(4200, {
    type: 'TOOL_RESULT',
    agent: 'hades',
    tool: 'submit_sample',
    timestamp: mkTs(4200),
    payload: { job_id: jobId, status: 'queued' },
  });
  add(4600, {
    type: 'TOOL_CALLED',
    agent: 'hades',
    tool: 'poll_report',
    timestamp: mkTs(4600),
    payload: { job_id: jobId },
  });

  // Process + network events from Windows VPS tools.
  add(5200, {
    type: 'PROCESS_EVENT',
    agent: 'hades',
    timestamp: mkTs(5200),
    payload: {
      id: 'proc-wscript',
      name: 'wscript.exe',
      parent_id: 'explorer.exe',
      event_type: 'process_spawn',
      details: { command_line: 'wscript.exe 6108674530.JS.malicious' },
    },
  });
  add(5600, {
    type: 'PROCESS_EVENT',
    agent: 'hades',
    timestamp: mkTs(5600),
    payload: {
      id: 'file-dropper',
      name: 'payload.exe',
      parent_id: 'proc-wscript',
      event_type: 'file_write',
      details: { path: 'C:\\\\Users\\\\Public\\\\payload.exe' },
    },
  });
  add(6000, {
    type: 'PROCESS_EVENT',
    agent: 'hades',
    timestamp: mkTs(6000),
    payload: {
      id: 'reg-run',
      name: 'HKCU\\\\Software\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Run\\\\Updater',
      parent_id: 'proc-wscript',
      event_type: 'registry_write',
      details: { value: 'C:\\\\Users\\\\Public\\\\payload.exe' },
    },
  });
  add(6400, {
    type: 'NETWORK_EVENT',
    agent: 'hades',
    timestamp: mkTs(6400),
    payload: {
      id: 'dns-lookup-1',
      name: 'DNS query',
      parent_id: 'proc-wscript',
      event_type: 'dns_query',
      details: { domain: 'api.evil-cloud-sync.com' },
    },
  });
  add(6800, {
    type: 'NETWORK_EVENT',
    agent: 'hades',
    timestamp: mkTs(6800),
    payload: {
      id: 'http-beacon-1',
      name: 'HTTP beacon',
      parent_id: 'proc-wscript',
      event_type: 'http_request',
      details: {
        method: 'POST',
        url: 'http://api.evil-cloud-sync.com/sync',
      },
    },
  });

  // New attack stages based on VPS signals.
  add(7000, {
    type: 'STAGE_UNLOCKED',
    agent: 'hades',
    timestamp: mkTs(7000),
    payload: {
      stage_id: 'execution',
      label: 'Execution',
      description: 'Malicious script launches wscript.exe and drops payload.',
      icon: 'play-circle',
    },
  });
  add(7400, {
    type: 'STAGE_UNLOCKED',
    agent: 'hades',
    timestamp: mkTs(7400),
    payload: {
      stage_id: 'persistence',
      label: 'Persistence',
      description: 'Registry Run key ensures payload.exe runs on login.',
      icon: 'pin',
    },
  });
  add(7800, {
    type: 'STAGE_UNLOCKED',
    agent: 'hades',
    timestamp: mkTs(7800),
    payload: {
      stage_id: 'command-and-control',
      label: 'Command & Control',
      description: 'Beaconing to api.evil-cloud-sync.com over HTTP.',
      icon: 'radio-tower',
    },
  });

  // Hades completes and hands off to Apollo.
  add(8200, {
    type: 'TOOL_RESULT',
    agent: 'hades',
    tool: 'poll_report',
    timestamp: mkTs(8200),
    payload: { job_id: jobId, status: 'complete' },
  });
  add(8300, {
    type: 'HANDOFF',
    agent: 'hades',
    timestamp: mkTs(8300),
    payload: { from: 'hades', to: 'apollo' },
  });
  add(8400, {
    type: 'AGENT_COMPLETED',
    agent: 'hades',
    timestamp: mkTs(8400),
    payload: {},
  });

  // Apollo: IOC extraction / intel enrichment (fewer, heavier events).
  add(8450, {
    type: 'AGENT_ACTIVATED',
    agent: 'apollo',
    timestamp: mkTs(8450),
    payload: { step: 'extract IOCs + enrich with intel' },
  });
  add(8600, {
    type: 'THOUGHT',
    agent: 'apollo',
    timestamp: mkTs(8600),
    payload: { thought: 'Correlating observed endpoints with intel corpus; scoring confidence + campaign overlap.' },
  });
  add(9000, {
    type: 'TOOL_CALLED',
    agent: 'apollo',
    tool: 'enrich_iocs_with_threat_intel',
    timestamp: mkTs(9000),
    payload: { job_id: jobId },
  });
  add(9600, {
    type: 'IOC_DISCOVERED',
    agent: 'apollo',
    timestamp: mkTs(9600),
    payload: {
      ioc_type: 'domain',
      value: 'api.evil-cloud-sync.com',
      severity: 'critical',
      context: 'C2 endpoint resolved during detonation',
    },
  });
  add(10000, {
    type: 'IOC_DISCOVERED',
    agent: 'apollo',
    timestamp: mkTs(10000),
    payload: {
      ioc_type: 'file_path',
      value: 'C:\\\\Users\\\\Public\\\\payload.exe',
      severity: 'high',
      context: 'Dropped payload on disk',
    },
  });
  add(10400, {
    type: 'TOOL_RESULT',
    agent: 'apollo',
    tool: 'enrich_iocs_with_threat_intel',
    timestamp: mkTs(10400),
    payload: { total_iocs: 2, high_risk: 2 },
  });

  // Handoff to Ares for remediation.
  add(10600, {
    type: 'HANDOFF',
    agent: 'apollo',
    timestamp: mkTs(10600),
    payload: { from: 'apollo', to: 'ares' },
  });
  add(10700, {
    type: 'AGENT_COMPLETED',
    agent: 'apollo',
    timestamp: mkTs(10700),
    payload: {},
  });

  add(10800, {
    type: 'AGENT_ACTIVATED',
    agent: 'ares',
    timestamp: mkTs(10800),
    payload: { step: 'parallel containment/remediation/prevention planning' },
  });
  add(10940, {
    type: 'THOUGHT',
    agent: 'ares',
    timestamp: mkTs(10940),
    payload: { thought: 'Splitting work: containment-model + remediation-model + prevention-model in parallel.' },
  });
  add(11400, {
    type: 'TOOL_CALLED',
    agent: 'ares',
    tool: 'ares_containment.generate_containment_plan',
    timestamp: mkTs(11400),
    payload: { job_id: jobId, risk_level: 'critical', model: 'ares_containment' },
  });
  add(11620, {
    type: 'TOOL_CALLED',
    agent: 'ares',
    tool: 'ares_remediation.generate_remediation_plan',
    timestamp: mkTs(11620),
    payload: { job_id: jobId, risk_level: 'critical', model: 'ares_remediation' },
  });
  add(11840, {
    type: 'TOOL_CALLED',
    agent: 'ares',
    tool: 'ares_prevention.generate_prevention_plan',
    timestamp: mkTs(11840),
    payload: { job_id: jobId, risk_level: 'critical', model: 'ares_prevention' },
  });
  add(12100, {
    type: 'TOOL_RESULT',
    agent: 'ares',
    tool: 'ares_containment.generate_containment_plan',
    timestamp: mkTs(12100),
    payload: {
      steps: 5,
      summary: 'Isolate host, kill wscript/payload, block domains/IPs, quarantine artifacts.',
      model: 'ares_containment',
    },
  });
  add(12340, {
    type: 'TOOL_RESULT',
    agent: 'ares',
    tool: 'ares_remediation.generate_remediation_plan',
    timestamp: mkTs(12340),
    payload: {
      steps: 7,
      summary: 'Remove payload.exe + persistence key, rotate creds, validate EDR clean scan.',
      model: 'ares_remediation',
    },
  });
  add(12580, {
    type: 'TOOL_RESULT',
    agent: 'ares',
    tool: 'ares_prevention.generate_prevention_plan',
    timestamp: mkTs(12580),
    payload: {
      steps: 6,
      summary: 'Deploy YARA/Sigma detections, ASR rules, egress filtering, user training note.',
      model: 'ares_prevention',
    },
  });
  add(12600, {
    type: 'AGENT_COMPLETED',
    agent: 'ares',
    timestamp: mkTs(12600),
    payload: {},
  });

  // Extend with much richer, realistic follow-on activity at normal speed.
  cursor = 12600;

  push(200, {
    type: 'AGENT_ACTIVATED',
    agent: 'zeus',
    payload: { step: 'synthesizing cross-agent findings + confidence scoring' },
  });
  push(220, {
    type: 'HANDOFF',
    agent: 'zeus',
    payload: { from: 'zeus', to: 'hephaestus' },
  });
  push(180, {
    type: 'AGENT_ACTIVATED',
    agent: 'hephaestus',
    payload: { step: 'streaming sandbox artifacts + event snapshots' },
  });

  for (let i = 1; i <= 24; i += 1) {
    push(170, {
      type: 'TOOL_CALLED',
      agent: 'hades',
      tool: 'poll_report',
      payload: { iteration: i, job_id: jobId, phase: i < 20 ? 'running' : 'finalizing' },
    });
    push(140, {
      type: 'TOOL_RESULT',
      agent: 'hades',
      tool: 'poll_report',
      payload: { iteration: i, status: i < 24 ? 'running' : 'complete', job_id: jobId },
    });
  }

  for (let i = 1; i <= 16; i += 1) {
    push(120, {
      type: 'PROCESS_EVENT',
      agent: 'hades',
      payload: {
        id: `proc-child-${i}`,
        name: i % 3 === 0 ? 'cmd.exe' : 'powershell.exe',
        parent_id: 'proc-wscript',
        event_type: i % 2 === 0 ? 'process_spawn' : 'file_write',
        details: {
          command_line: i % 3 === 0 ? 'cmd.exe /c whoami' : 'powershell -w hidden -enc ...',
          path: `C:\\\\ProgramData\\\\svc_${i}.bin`,
        },
      },
    });
  }

  for (let i = 1; i <= 14; i += 1) {
    push(125, {
      type: 'NETWORK_EVENT',
      agent: 'hades',
      payload: {
        id: `net-${i}`,
        name: i % 2 === 0 ? 'HTTP request' : 'DNS query',
        parent_id: 'proc-wscript',
        event_type: i % 2 === 0 ? 'http_request' : 'dns_query',
        details: i % 2 === 0
          ? { method: 'POST', url: `http://api.evil-cloud-sync.com/task/${i}` }
          : { domain: `cdn${i}.evil-cloud-sync.com` },
      },
    });
  }

  push(180, {
    type: 'HANDOFF',
    agent: 'zeus',
    payload: { from: 'zeus', to: 'apollo' },
  });
  // Fan-out: Zeus can message multiple agents at once.
  add(cursor, {
    type: 'HANDOFF',
    agent: 'zeus',
    timestamp: mkTs(cursor),
    payload: { from: 'zeus', to: 'ares' },
  });
  add(cursor, {
    type: 'HANDOFF',
    agent: 'zeus',
    timestamp: mkTs(cursor),
    payload: { from: 'zeus', to: 'hermes' },
  });
  push(140, {
    type: 'AGENT_ACTIVATED',
    agent: 'apollo',
    payload: { step: 'deep IOC enrichment + campaign correlation' },
  });

  for (let i = 1; i <= 18; i += 1) {
    push(150, {
      type: 'IOC_DISCOVERED',
      agent: 'apollo',
      payload: {
        ioc_type: i % 3 === 0 ? 'url' : i % 3 === 1 ? 'domain' : 'ip',
        value: i % 3 === 0
          ? `http://api.evil-cloud-sync.com/task/${i}`
          : i % 3 === 1
            ? `cdn${i}.evil-cloud-sync.com`
            : `198.51.100.${i}`,
        severity: i % 4 === 0 ? 'critical' : 'high',
        context: 'Enriched from sandbox artifacts + intel corpus correlation',
      },
    });
  }

  push(200, {
    type: 'TOOL_CALLED',
    agent: 'apollo',
    tool: 'format_threat_report',
    payload: { sections: ['behavior', 'iocs', 'campaigns', 'confidence'] },
  });
  push(260, {
    type: 'TOOL_RESULT',
    agent: 'apollo',
    tool: 'format_threat_report',
    payload: { pages: 6, findings: 42 },
  });
  push(190, {
    type: 'HANDOFF',
    agent: 'apollo',
    payload: { from: 'apollo', to: 'ares' },
  });
  // Apollo broadcast handoff to delivery + sandbox channels.
  add(cursor, {
    type: 'HANDOFF',
    agent: 'apollo',
    timestamp: mkTs(cursor),
    payload: { from: 'apollo', to: 'hermes' },
  });
  add(cursor, {
    type: 'HANDOFF',
    agent: 'apollo',
    timestamp: mkTs(cursor),
    payload: { from: 'apollo', to: 'hephaestus' },
  });
  push(130, {
    type: 'AGENT_ACTIVATED',
    agent: 'ares',
    payload: { step: 'expanded containment, remediation, prevention planning' },
  });

  const remediationTools = [
    'generate_containment_plan',
    'generate_remediation_plan',
    'generate_prevention_plan',
    'generate_exec_summary',
  ];
  remediationTools.forEach((toolName, idx) => {
    push(220, {
      type: 'TOOL_CALLED',
      agent: 'ares',
      tool: toolName,
      payload: { index: idx + 1, risk_level: 'critical' },
    });
    push(260, {
      type: 'TOOL_RESULT',
      agent: 'ares',
      tool: toolName,
      payload: { index: idx + 1, status: 'ready', recommendations: 5 + idx },
    });
  });

  push(200, {
    type: 'STAGE_UNLOCKED',
    agent: 'ares',
    payload: {
      stage_id: 'impact-assessment',
      label: 'Impact Assessment',
      description: 'Potential business impact and blast radius mapped.',
      icon: 'gauge',
    },
  });
  push(180, {
    type: 'STAGE_UNLOCKED',
    agent: 'ares',
    payload: {
      stage_id: 'containment-complete',
      label: 'Containment',
      description: 'Host isolation and IOC blocks scheduled across fleet.',
      icon: 'shield-check',
    },
  });
  // Ares sends coordinated updates to multiple recipients at once.
  add(cursor, {
    type: 'HANDOFF',
    agent: 'ares',
    timestamp: mkTs(cursor),
    payload: { from: 'ares', to: 'zeus' },
  });
  add(cursor, {
    type: 'HANDOFF',
    agent: 'ares',
    timestamp: mkTs(cursor),
    payload: { from: 'ares', to: 'hermes' },
  });
  add(cursor, {
    type: 'HANDOFF',
    agent: 'ares',
    timestamp: mkTs(cursor),
    payload: { from: 'ares', to: 'hephaestus' },
  });
  // Long-running parallel campaign rounds to reach full demo runtime (~100s).
  for (let wave = 1; wave <= 16; wave += 1) {
    push(350, {
      type: 'THOUGHT',
      agent: 'zeus',
      payload: { thought: `Parallel round ${wave}/16: rebalancing workloads across active agents.` },
    });
    add(cursor, {
      type: 'HANDOFF',
      agent: 'zeus',
      timestamp: mkTs(cursor),
      payload: { from: 'zeus', to: 'athena' },
    });
    add(cursor, {
      type: 'HANDOFF',
      agent: 'zeus',
      timestamp: mkTs(cursor),
      payload: { from: 'zeus', to: 'hades' },
    });
    add(cursor, {
      type: 'HANDOFF',
      agent: 'zeus',
      timestamp: mkTs(cursor),
      payload: { from: 'zeus', to: 'apollo' },
    });

    push(280, {
      type: 'TOOL_CALLED',
      agent: 'athena',
      tool: 'verify_static_iocs',
      payload: { wave, signatures_checked: 120 + wave * 3 },
    });
    push(320, {
      type: 'TOOL_RESULT',
      agent: 'athena',
      tool: 'verify_static_iocs',
      payload: { wave, matched_signatures: 6 + (wave % 4), confidence: 0.9 },
    });

    push(300, {
      type: 'TOOL_CALLED',
      agent: 'hades',
      tool: 'run_fakenet_capture',
      payload: { wave, duration_seconds: 8 },
    });
    push(360, {
      type: 'TOOL_RESULT',
      agent: 'hades',
      tool: 'run_fakenet_capture',
      payload: { wave, sessions: 2 + (wave % 5), suspicious_flows: 1 + (wave % 3) },
    });

    push(260, {
      type: 'TOOL_CALLED',
      agent: 'apollo',
      tool: 'correlate_campaigns',
      payload: { wave, intel_sources: 4 },
    });
    push(340, {
      type: 'TOOL_RESULT',
      agent: 'apollo',
      tool: 'correlate_campaigns',
      payload: { wave, overlaps: 1 + (wave % 2), confidence: 0.86 + (wave % 3) * 0.02 },
    });

    push(220, {
      type: 'TOOL_CALLED',
      agent: 'ares',
      tool: 'simulate_containment_impact',
      payload: { wave, scope: 'fleet-segment-a' },
    });
    push(360, {
      type: 'TOOL_RESULT',
      agent: 'ares',
      tool: 'simulate_containment_impact',
      payload: { wave, hosts_isolated: 3 + (wave % 4), projected_downtime_min: 12 + wave },
    });
  }

  // Ares "model quorum" rounds to emphasize multi-model concurrent planning.
  for (let round = 1; round <= 24; round += 1) {
    push(260, {
      type: 'TOOL_CALLED',
      agent: 'ares',
      tool: `ares_model_quorum.round_${round}`,
      payload: {
        models: ['containment', 'remediation', 'prevention', 'exec-brief', 'detections'],
        strategy: 'parallel_consensus',
      },
    });
    add(cursor, {
      type: 'HANDOFF',
      agent: 'ares',
      timestamp: mkTs(cursor),
      payload: { from: 'ares', to: 'zeus' },
    });
    add(cursor, {
      type: 'HANDOFF',
      agent: 'ares',
      timestamp: mkTs(cursor),
      payload: { from: 'ares', to: 'hermes' },
    });
    push(300, {
      type: 'TOOL_RESULT',
      agent: 'ares',
      tool: `ares_model_quorum.round_${round}`,
      payload: { consensus_score: 0.91 + (round % 4) * 0.01, recommendations: 9 + (round % 3) },
    });
  }

  // Additional telemetry growth for event feed and process/IOC views.
  for (let i = 1; i <= 30; i += 1) {
    push(220, {
      type: i % 2 === 0 ? 'PROCESS_EVENT' : 'NETWORK_EVENT',
      agent: 'hades',
      payload: i % 2 === 0
        ? {
            id: `late-proc-${i}`,
            name: 'rundll32.exe',
            parent_id: 'proc-wscript',
            event_type: 'process_spawn',
            details: { command_line: `rundll32.exe stage_${i}.dll,EntryPoint` },
          }
        : {
            id: `late-net-${i}`,
            name: 'HTTP request',
            parent_id: 'proc-wscript',
            event_type: 'http_request',
            details: { method: 'GET', url: `http://cdn${i}.evil-cloud-sync.com/beacon` },
          },
    });
  }

  push(260, {
    type: 'STAGE_UNLOCKED',
    agent: 'zeus',
    payload: {
      stage_id: 'lateral-movement-risk',
      label: 'Lateral Movement Risk',
      description: 'Behavioral indicators suggest possible follow-on spread path.',
      icon: 'network',
    },
  });
  push(260, {
    type: 'STAGE_UNLOCKED',
    agent: 'ares',
    payload: {
      stage_id: 'response-hardened',
      label: 'Response Hardened',
      description: 'Parallel plans reconciled and approved for execution.',
      icon: 'shield',
    },
  });

  push(200, {
    type: 'AGENT_COMPLETED',
    agent: 'hephaestus',
    payload: {},
  });
  push(180, {
    type: 'AGENT_COMPLETED',
    agent: 'apollo',
    payload: {},
  });
  push(180, {
    type: 'AGENT_COMPLETED',
    agent: 'hades',
    payload: {},
  });
  push(180, {
    type: 'AGENT_COMPLETED',
    agent: 'zeus',
    payload: {},
  });
  push(180, {
    type: 'AGENT_COMPLETED',
    agent: 'ares',
    payload: {},
  });

  // Final job status + clear running flag.
  schedule(cursor + 400, () => {
    store.updateJobStatus('complete', 'ares');
    (window as unknown as { __pantheonDemoRunning?: boolean }).__pantheonDemoRunning = false;
  });
}

type Tab = 'dashboard' | 'telemetry' | 'discoveries';

const NAV: { tab: Tab; icon: React.ReactNode; label: string }[] = [
  { tab: 'dashboard', icon: <LayoutDashboard size={18} />, label: 'Dashboard'   },
  { tab: 'telemetry', icon: <Terminal size={18} />,        label: 'Telemetry'   },
  { tab: 'discoveries', icon: <ScrollText size={18} />,    label: 'Discoveries' },
];

export default function ProfessionalDashboard() {
  const [store]           = useState(() => getEventStore());
  const [connected, setConnected]         = useState(false);
  const [stats, setStats]                 = useState<Statistics | null>(null);
  const [activeTab, setActiveTab]         = useState<Tab>('dashboard');
  const [demoStarted, setDemoStarted]     = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<AgentStatus | null>(null);
  const [showInspector, setShowInspector] = useState(false);
  const [showEvents, setShowEvents]       = useState(false);
  const [showIOCs, setShowIOCs]           = useState(false);

  const startPresetDemo = useCallback((): void => {
    setDemoStarted(true);
    runPresetDemo(store);
  }, [store]);

  // WebSocket connection — runs once per store instance, never on agent selection.
  useEffect(() => {
    const sandboxUrl = process.env.NEXT_PUBLIC_SANDBOX_URL || 'http://localhost:9000';
    const ws = initWS(sandboxUrl, store);
    ws.connect()
      .then(() => setConnected(true))
      .catch(() => setConnected(false));
    return () => { ws.close(); };
  }, [store]);

  // Store subscription — re-subscribes when selectedAgent changes so the
  // closure always holds the latest value for the inspector auto-update.
  useEffect(() => {
    const unsubscribe = store.subscribe(() => {
      setStats(store.getStatistics());
      if (selectedAgent) {
        const updated = store.getAgents().find(a => a.name === selectedAgent.name);
        if (updated) setSelectedAgent(updated);
      }
    });
    return unsubscribe;
  }, [store, selectedAgent]);

  // Global hotkeys — trigger the preset demo (simulated pipeline).
  useEffect(() => {
    function handleHotkey(event: KeyboardEvent) {
      const isBackslash =
        event.key === '\\' ||
        event.key === '|' ||
        event.code === 'Backslash' ||
        event.code === 'IntlBackslash' ||
        // Legacy fallback for some browsers/layouts.
        event.keyCode === 220;
      const isBacktick =
        event.key === '`' ||
        event.key === '~' ||
        event.code === 'Backquote' ||
        event.keyCode === 192;
      if ((isBackslash || isBacktick) && !event.repeat) {
        event.preventDefault();
        console.log('Pantheon preset demo hotkey pressed:', { key: event.key, code: event.code });
        startPresetDemo();
      }
    }

    // Console fallback for demos: window.startPantheonDemo()
    (window as unknown as { startPantheonDemo?: () => void }).startPantheonDemo = () => {
      startPresetDemo();
    };

    window.addEventListener('keydown', handleHotkey, { capture: true });
    document.addEventListener('keydown', handleHotkey, { capture: true });
    window.addEventListener('keyup', handleHotkey, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleHotkey, { capture: true });
      document.removeEventListener('keydown', handleHotkey, { capture: true });
      window.removeEventListener('keyup', handleHotkey, { capture: true });
      delete (window as unknown as { startPantheonDemo?: () => void }).startPantheonDemo;
    };
  }, [startPresetDemo]);

  const handleSelectAgent = (agent: AgentStatus) => {
    setSelectedAgent(agent);
    setShowInspector(true);
  };

  return (
    <div className="flex h-screen w-full bg-marble overflow-hidden text-ink">

      {/* Collapsed icon-only sidebar */}
      <aside className="w-12 shrink-0 glass-panel border-r border-gold/10 flex flex-col items-center py-4 z-20 gap-1">
        <div className="mb-4 w-8 h-8 rounded-lg bg-sienna flex items-center justify-center shadow-gold shrink-0">
          <span className="text-white font-serif font-bold text-xs">P</span>
        </div>

        <nav className="flex flex-col items-center gap-1 flex-1">
          {NAV.map(({ tab, icon, label }) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              title={label}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-95
                ${activeTab === tab
                  ? 'bg-gold/15 text-gold-dark shadow-sm'
                  : 'text-gold-dark/30 hover:bg-gold/8 hover:text-gold-dark/60'}
              `}
            >
              {icon}
            </button>
          ))}
        </nav>

        <div
          title={connected ? 'Connected' : 'Disconnected'}
          className={`w-2 h-2 rounded-full mt-auto ${connected ? 'bg-green-500 animate-pulse' : 'bg-red-400'}`}
        />
      </aside>

      {/* Main area */}
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">

        <HUDBar
          connected={connected}
          stats={stats}
          job={store.getCurrentJob()}
          onOpenEvents={() => setShowEvents(true)}
          onOpenIOCs={() => setShowIOCs(true)}
        />

        <div className={`flex-1 min-h-0 relative ${activeTab === 'dashboard' ? '' : 'hidden'}`}>
          <OlympusFlow
            store={store}
            onSelect={handleSelectAgent}
            onSecretTrigger={startPresetDemo}
          />
        </div>

        <div className={`flex-1 min-h-0 relative bg-white/20 ${activeTab === 'telemetry' ? '' : 'hidden'}`}>
          <DivineChronicle store={store} />
        </div>

        <div className={`flex-1 min-h-0 relative bg-white/20 ${activeTab === 'discoveries' ? '' : 'hidden'}`}>
          <DiscoveriesArchive demoStarted={demoStarted} />
        </div>
      </main>

      {/* Slide-in panels */}
      <SlidePanel
        open={showInspector}
        onClose={() => setShowInspector(false)}
        title={selectedAgent ? `${selectedAgent.name} — Inspector` : 'Agent Inspector'}
        width="w-80"
      >
        <AgentInspector agent={selectedAgent} />
      </SlidePanel>

      <SlidePanel
        open={showEvents}
        onClose={() => setShowEvents(false)}
        title="Event Log"
        width="w-96"
      >
        <DivineChronicle store={store} />
      </SlidePanel>

      <SlidePanel
        open={showIOCs}
        onClose={() => setShowIOCs(false)}
        title="Indicators of Compromise"
        width="w-96"
      >
        <IOCPanel store={store} />
      </SlidePanel>
    </div>
  );
}
