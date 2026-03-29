"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Zap, Shield, AlertTriangle, Activity, X, Radio, ScanLine, FlaskConical, Globe, ShieldAlert, type LucideIcon } from "lucide-react";
import GodCard, {
  AgentDef, AgentId, Badge, ThoughtEntry, BADGE_STYLES,
} from "./GodCard";

const AGENT_ICONS: Record<AgentId, LucideIcon> = {
  zeus:   Zap,
  athena: ScanLine,
  hades:  FlaskConical,
  apollo: Globe,
  ares:   ShieldAlert,
  hermes: Radio,
};

// ─── Agent Registry ────────────────────────────────────────────────────────────

const AGENTS: AgentDef[] = [
  { id: "zeus",   name: "Zeus",   role: "Root Orchestrator", color: "#f59e0b" },
  { id: "athena", name: "Athena", role: "Static Analysis",   color: "#60a5fa" },
  { id: "hermes", name: "Hermes", role: "Gateway & Delivery",color: "#34d399" },
  { id: "hades",  name: "Hades",  role: "Dynamic Analysis",  color: "#f87171" },
  { id: "apollo", name: "Apollo", role: "IOC Enrichment",    color: "#fb923c" },
  { id: "ares",   name: "Ares",   role: "Containment",       color: "#c084fc" },
];

const AGENT_MAP = Object.fromEntries(AGENTS.map((a) => [a.id, a])) as Record<AgentId, AgentDef>;

// SVG positions (viewBox 0 0 100 100, preserveAspectRatio="none")
const SVG_POS: Record<AgentId, [number, number]> = {
  zeus:   [10, 18],
  athena: [50, 15],
  hermes: [90, 18],
  hades:  [10, 82],
  apollo: [50, 85],
  ares:   [90, 82],
};
const ORACLE: [number, number] = [50, 50];

// ─── Scenario Engine ───────────────────────────────────────────────────────────

interface ThoughtScript {
  agentId: AgentId;
  badge: Badge;
  text: string;
  delay: number;
}

interface A2ALink {
  id: string;
  from: AgentId;
  to: AgentId;
}

interface ScenarioA2A {
  from: AgentId;
  to: AgentId;
  delay: number;
  duration?: number;
}

interface Scenario {
  id: string;
  label: string;
  desc: string;
  icon: React.ReactNode;
  agents: AgentId[];
  duration: number;
  thoughts: ThoughtScript[];
  a2a: ScenarioA2A[];
}

const SCENARIOS: Scenario[] = [
  {
    id: "analyze",
    label: "Analyze Sample",
    desc: "Parallel dynamic + static",
    icon: <Shield className="w-4 h-4" />,
    agents: ["zeus", "hades", "athena"],
    duration: 7500,
    thoughts: [
      { agentId: "zeus",   badge: "OBSERVE", text: "Sample received: 6108674530.JS.malicious (47 KB)",                     delay: 200  },
      { agentId: "zeus",   badge: "REASON",  text: "Routing to ParallelAgent — dispatching Hades + Athena simultaneously", delay: 700  },
      { agentId: "zeus",   badge: "ACT",     text: "Firing 2 agents in parallel via ADK ParallelAgent",                    delay: 1100 },
      { agentId: "hades",  badge: "OBSERVE", text: "Sandbox health check → OK (docker=true, version=0.1.0)",               delay: 1200 },
      { agentId: "athena", badge: "OBSERVE", text: "Reading raw bytes — scanning for obfuscation signatures",               delay: 1200 },
      { agentId: "hades",  badge: "ACT",     text: "submit_sample() → job_id: hades-2a1f-9c3d, status: queued",            delay: 1700 },
      { agentId: "athena", badge: "REASON",  text: "javascript-obfuscator _0x string array pattern detected",              delay: 1900 },
      { agentId: "hades",  badge: "OBSERVE", text: "LoopAgent → poll_report() iteration 1: status=running",                delay: 2300 },
      { agentId: "athena", badge: "ACT",     text: "classify_threat() → category: dropper | severity: critical | conf: 0.94", delay: 2500 },
      { agentId: "hades",  badge: "OBSERVE", text: "LoopAgent → poll_report() iteration 2: status=running",                delay: 3100 },
      { agentId: "hades",  badge: "OBSERVE", text: "LoopAgent → poll_report() iteration 3: status=complete ✓",             delay: 3900 },
      { agentId: "hades",  badge: "REASON",  text: "WSH dropper confirmed — CRITICAL. C2 beacon to 198.51.100.42:443",     delay: 4400 },
      { agentId: "zeus",   badge: "REASON",  text: "Both branches resolved. Merging ThreatReport + classification.",       delay: 5200 },
      { agentId: "zeus",   badge: "A2A",     text: "A2A Transfer → Apollo: ThreatReport + static classification context",  delay: 5800 },
    ],
    a2a: [
      { from: "zeus",   to: "hades",  delay: 1100, duration: 3800 },
      { from: "zeus",   to: "athena", delay: 1100, duration: 2000 },
      { from: "hades",  to: "zeus",   delay: 5000, duration: 1200 },
      { from: "athena", to: "zeus",   delay: 4600, duration: 1200 },
    ],
  },
  {
    id: "enrich",
    label: "Enrich IOCs",
    desc: "Threat intel enrichment",
    icon: <Activity className="w-4 h-4" />,
    agents: ["apollo", "hermes"],
    duration: 5500,
    thoughts: [
      { agentId: "apollo", badge: "OBSERVE", text: "get_iocs(job='hades-2a1f') → 2 IPs, 3 domains, 1 hash",               delay: 300  },
      { agentId: "hermes", badge: "OBSERVE", text: "Checking external threat feed registrations",                          delay: 400  },
      { agentId: "apollo", badge: "ACT",     text: "enrich_iocs_with_threat_intel() — invoking Gemini 2.5 Flash",          delay: 900  },
      { agentId: "hermes", badge: "REASON",  text: "198.51.100.42 matches known Cobalt Strike Team Server infrastructure", delay: 1200 },
      { agentId: "apollo", badge: "REASON",  text: "evil-c2.example.com — registered 11 days ago via bulletproof host",   delay: 1700 },
      { agentId: "hermes", badge: "ACT",     text: "Registering IOCs in threat intelligence database",                    delay: 2100 },
      { agentId: "apollo", badge: "ACT",     text: "format_threat_report() → 847-word markdown report assembled",         delay: 2900 },
      { agentId: "apollo", badge: "A2A",     text: "A2A Transfer → Ares: enriched ThreatReport + IOC context",           delay: 3900 },
    ],
    a2a: [
      { from: "apollo", to: "hermes", delay: 400,  duration: 2500 },
      { from: "apollo", to: "ares",   delay: 3900, duration: 1200 },
    ],
  },
  {
    id: "respond",
    label: "Emergency Response",
    desc: "4 agents dispatched in parallel",
    icon: <AlertTriangle className="w-4 h-4" />,
    agents: ["zeus", "ares", "apollo", "hermes"],
    duration: 8000,
    thoughts: [
      { agentId: "zeus",   badge: "OBSERVE", text: "CRITICAL incident confirmed — triggering emergency response protocol", delay: 200  },
      { agentId: "zeus",   badge: "ACT",     text: "ParallelAgent: dispatching Ares + Apollo + Hermes simultaneously",    delay: 700  },
      { agentId: "ares",   badge: "REASON",  text: "extract_threat_summary_for_ares() — loading IOC context",             delay: 800  },
      { agentId: "apollo", badge: "OBSERVE", text: "IOC context loaded — 2 IPs, 3 domains, 1 persistence key",           delay: 800  },
      { agentId: "hermes", badge: "OBSERVE", text: "Alert channels ready: Telegram + ElevenLabs TTS",                    delay: 800  },
      { agentId: "ares",   badge: "ACT",     text: "generate_containment_plan() → 5 steps [CRITICAL]/[HIGH]",            delay: 1600 },
      { agentId: "apollo", badge: "ACT",     text: "Compiling IOC summary for delivery brief",                           delay: 1800 },
      { agentId: "ares",   badge: "ACT",     text: "generate_remediation_plan() → delete files, rotate credentials",     delay: 2500 },
      { agentId: "ares",   badge: "ACT",     text: "generate_prevention_plan() → YARA + ASR rules + Sigma detection",    delay: 3400 },
      { agentId: "ares",   badge: "REASON",  text: "All 3 plans assembled — building full incident response report",     delay: 4300 },
      { agentId: "hermes", badge: "ACT",     text: "Delivering report via Telegram + voice (ElevenLabs TTS)",            delay: 5200 },
      { agentId: "zeus",   badge: "A2A",     text: "Pipeline complete — incident response delivered to analyst",         delay: 6100 },
    ],
    a2a: [
      { from: "zeus",   to: "ares",   delay: 700,  duration: 4200 },
      { from: "zeus",   to: "apollo", delay: 700,  duration: 2500 },
      { from: "zeus",   to: "hermes", delay: 700,  duration: 5800 },
      { from: "ares",   to: "hermes", delay: 4300, duration: 1500 },
      { from: "apollo", to: "hermes", delay: 3200, duration: 2200 },
    ],
  },
  {
    id: "full",
    label: "Full Pipeline",
    desc: "All 6 gods — complete Pantheon",
    icon: <Zap className="w-4 h-4" />,
    agents: ["zeus", "athena", "hades", "apollo", "ares", "hermes"],
    duration: 13000,
    thoughts: [
      { agentId: "zeus",   badge: "OBSERVE", text: "Artemis sentinel: new sample detected. Full pipeline initiated.",      delay: 300  },
      { agentId: "zeus",   badge: "ACT",     text: "Stage 1 — ParallelAgent: Hades (dynamic) + Athena (static)",          delay: 800  },
      { agentId: "hades",  badge: "ACT",     text: "Sandbox submission → job_id: hades-2a1f queued",                      delay: 900  },
      { agentId: "athena", badge: "ACT",     text: "classify_threat() → dropper | critical | confidence=0.94",             delay: 1000 },
      { agentId: "hades",  badge: "OBSERVE", text: "LoopAgent: running → running → complete (3 polls)",                   delay: 2100 },
      { agentId: "hades",  badge: "REASON",  text: "ThreatReport: WSH dropper, CRITICAL, C2 to 198.51.100.42 confirmed",  delay: 3600 },
      { agentId: "athena", badge: "REASON",  text: "WScript.Shell + XMLHTTP pattern — corroborates dynamic findings",     delay: 3200 },
      { agentId: "zeus",   badge: "A2A",     text: "A2A Handoff → Apollo: ThreatReport + classification context",         delay: 4400 },
      { agentId: "apollo", badge: "OBSERVE", text: "get_iocs() → 2 IPs, 3 domains, 1 hash, 2 dropped files",             delay: 4600 },
      { agentId: "apollo", badge: "ACT",     text: "Gemini enrichment: Cobalt Strike C2, APT41 campaign overlap",         delay: 5500 },
      { agentId: "apollo", badge: "A2A",     text: "A2A Handoff → Ares: enriched ThreatReport ready",                    delay: 7000 },
      { agentId: "ares",   badge: "ACT",     text: "ParallelAgent: containment + remediation + prevention simultaneously", delay: 7200 },
      { agentId: "ares",   badge: "REASON",  text: "Containment: isolate host, block C2 IPs at perimeter",               delay: 8100 },
      { agentId: "ares",   badge: "REASON",  text: "Remediation: delete svchost32.exe, remove HKCU Run key",              delay: 8600 },
      { agentId: "ares",   badge: "REASON",  text: "Prevention: YARA rule for _0x pattern + Sigma + ASR rules",           delay: 9100 },
      { agentId: "ares",   badge: "ACT",     text: "build_full_response() → 847-word incident response document",         delay: 9900 },
      { agentId: "hermes", badge: "ACT",     text: "Telegram delivery + ElevenLabs TTS voice briefing sent",              delay: 10700 },
      { agentId: "zeus",   badge: "REASON",  text: "All 6 agents resolved. Pipeline complete. Analyst briefed.",          delay: 11800 },
    ],
    a2a: [
      { from: "zeus",   to: "hades",  delay: 800,  duration: 3500 },
      { from: "zeus",   to: "athena", delay: 800,  duration: 3000 },
      { from: "zeus",   to: "apollo", delay: 4400, duration: 3200 },
      { from: "apollo", to: "ares",   delay: 7000, duration: 3400 },
      { from: "ares",   to: "hermes", delay: 9900, duration: 1500 },
    ],
  },
];

// ─── Main Component ────────────────────────────────────────────────────────────

export default function PantheonDashboard() {
  const [workingAgents,   setWorkingAgents]   = useState<Set<AgentId>>(new Set());
  const [completedAgents, setCompletedAgents] = useState<Set<AgentId>>(new Set());
  const [thoughts,        setThoughts]        = useState<ThoughtEntry[]>([]);
  const [a2aLinks,        setA2aLinks]        = useState<A2ALink[]>([]);
  const [runningId,       setRunningId]       = useState<string | null>(null);
  const [progress,        setProgress]        = useState<Partial<Record<AgentId, number>>>({});

  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const streamRef   = useRef<HTMLDivElement>(null);

  // Auto-scroll thought stream
  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight;
    }
  }, [thoughts]);

  // Smooth progress for active agents
  useEffect(() => {
    if (workingAgents.size === 0) return;
    const id = setInterval(() => {
      setProgress((prev) => {
        const next = { ...prev };
        workingAgents.forEach((aid) => {
          next[aid] = Math.min(97, (prev[aid] ?? 0) + Math.random() * 2.5 + 0.4);
        });
        return next;
      });
    }, 180);
    return () => clearInterval(id);
  }, [workingAgents]);

  // Run a scenario
  const run = useCallback((scenario: Scenario) => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];

    setWorkingAgents(new Set(scenario.agents));
    setCompletedAgents(new Set());
    setThoughts([]);
    setA2aLinks([]);
    setRunningId(scenario.id);
    setProgress(Object.fromEntries(scenario.agents.map((id) => [id, 0])));

    // Thought stream
    scenario.thoughts.forEach((t) => {
      const tid = setTimeout(() => {
        setThoughts((prev) => [
          ...prev,
          {
            id: Math.random().toString(36).slice(2),
            agentId: t.agentId,
            badge: t.badge,
            text: t.text,
            timestamp: Date.now(),
          },
        ].slice(-60));
      }, t.delay);
      timeoutsRef.current.push(tid);
    });

    // A2A links (show then remove)
    scenario.a2a.forEach((link) => {
      const linkId = Math.random().toString(36).slice(2);
      const showTid = setTimeout(() => {
        setA2aLinks((prev) => [...prev, { id: linkId, from: link.from, to: link.to }]);
        const rmTid = setTimeout(() => {
          setA2aLinks((prev) => prev.filter((l) => l.id !== linkId));
        }, link.duration ?? 2000);
        timeoutsRef.current.push(rmTid);
      }, link.delay);
      timeoutsRef.current.push(showTid);
    });

    // Completion
    const endTid = setTimeout(() => {
      setWorkingAgents(new Set());
      setCompletedAgents(new Set(scenario.agents));
      setRunningId(null);
      setProgress((prev) => {
        const next = { ...prev };
        scenario.agents.forEach((id) => { next[id] = 100; });
        return next;
      });
    }, scenario.duration);
    timeoutsRef.current.push(endTid);
  }, []);

  const reset = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
    setWorkingAgents(new Set());
    setCompletedAgents(new Set());
    setThoughts([]);
    setA2aLinks([]);
    setRunningId(null);
    setProgress({});
  }, []);

  // Latest thought per agent (for card preview)
  const latestByAgent = thoughts.reduce<Partial<Record<AgentId, ThoughtEntry>>>((acc, t) => {
    acc[t.agentId] = t;
    return acc;
  }, {});

  const isSystemActive = workingAgents.size > 0;
  const activeCount = workingAgents.size;

  return (
    <div className="min-h-screen flex flex-col" style={{
      background: "linear-gradient(160deg, #FDFCF7 0%, #FAF8EE 50%, #F5F0E0 100%)",
      color: "#1a1208",
    }}>

      {/* ── Top header ── */}
      <header
        className="sticky top-0 z-20 flex items-center justify-between px-6 py-3 border-b relative"
        style={{ background: "rgba(253,252,247,0.97)", backdropFilter: "blur(12px)", borderColor: "rgba(201,162,39,0.2)" }}
      >
        {/* Greek key underline */}
        <div className="absolute bottom-0 left-0 right-0 h-[8px] opacity-40 overflow-hidden">
          <svg viewBox="0 0 360 8" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
            <defs>
              <pattern id="hdr-meander" x="0" y="0" width="32" height="8" patternUnits="userSpaceOnUse">
                <path d="M0,7 L0,1 L8,1 L8,5 L4,5 L4,3 L12,3 L12,7 L20,7 L20,1 L28,1 L28,7 L32,7"
                  fill="none" stroke="#C9A227" strokeWidth="1.2" strokeLinecap="square"/>
              </pattern>
            </defs>
            <rect width="360" height="8" fill="url(#hdr-meander)"/>
          </svg>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {isSystemActive && (
              <Radio className="w-4 h-4" style={{ color: "#C9A227", animation: "status-pulse 1.2s ease-in-out infinite" }} />
            )}
            <span className="font-serif text-lg font-bold tracking-tight" style={{ color: "#1a1208" }}>
              Map of Olympus
            </span>
          </div>
          <span className="text-xs px-2 py-0.5 rounded-full font-bold uppercase tracking-widest"
            style={{ background: "rgba(201,162,39,0.1)", color: "#9A7A10", border: "1px solid rgba(201,162,39,0.35)" }}>
            ADK · A2A
          </span>
          {isSystemActive && (
            <span
              className="text-xs px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1.5"
              style={{ background: "rgba(201,162,39,0.12)", color: "#9A7A10", border: "1px solid rgba(201,162,39,0.40)" }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#C9A227", animation: "status-pulse 1s ease-in-out infinite" }} />
              {activeCount} agent{activeCount !== 1 ? "s" : ""} active
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <a href="/" className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
            style={{ color: "#9A7A10", border: "1px solid rgba(201,162,39,0.3)", background: "rgba(201,162,39,0.05)" }}>
            ← Home
          </a>
          <button
            onClick={reset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
            style={{
              background: "rgba(26,18,8,0.04)",
              color: "rgba(26,18,8,0.45)",
              border: "1px solid rgba(26,18,8,0.12)",
            }}
          >
            <X className="w-3 h-3" /> Reset
          </button>
        </div>
      </header>

      {/* ── Scenario buttons ── */}
      <div
        className="flex flex-wrap gap-3 px-6 py-4 border-b"
        style={{ borderColor: "rgba(201,162,39,0.15)", background: "rgba(201,162,39,0.02)" }}
      >
        <p className="w-full text-[10px] uppercase tracking-widest font-bold mb-1" style={{ color: "rgba(154,122,16,0.6)" }}>
          Stress Test — Select Mission
        </p>
        {SCENARIOS.map((scenario) => {
          const isRunning = runningId === scenario.id;
          return (
            <button
              key={scenario.id}
              onClick={() => !isRunning && run(scenario)}
              disabled={!!runningId}
              className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-left transition-all duration-200 active:scale-95"
              style={{
                background: isRunning ? "rgba(201,162,39,0.10)" : "#FFFFFF",
                border: `1px solid ${isRunning ? "rgba(201,162,39,0.55)" : "rgba(201,162,39,0.25)"}`,
                opacity: runningId && !isRunning ? 0.45 : 1,
                cursor: runningId && !isRunning ? "not-allowed" : "pointer",
                boxShadow: isRunning ? "0 0 20px rgba(201,162,39,0.20)" : "0 1px 4px rgba(201,162,39,0.08)",
              }}
            >
              <span style={{ color: isRunning ? "#C9A227" : "rgba(26,18,8,0.35)" }}>
                {scenario.icon}
              </span>
              <div>
                <p className="text-sm font-bold leading-tight"
                  style={{ color: isRunning ? "#9A7A10" : "#1a1208" }}>
                  {scenario.label}
                </p>
                <p className="text-[10px]" style={{ color: "rgba(26,18,8,0.40)" }}>
                  {scenario.desc}
                </p>
              </div>
              {isRunning && (
                <div
                  className="w-1.5 h-1.5 rounded-full ml-1 shrink-0"
                  style={{ background: "#C9A227", animation: "status-pulse 0.8s ease-in-out infinite" }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0">

        {/* ── LEFT: Olympus Map ── */}
        <div className="flex-1 lg:flex-[3] p-5">
          <div
            className="relative rounded-2xl overflow-hidden"
            style={{
              height: "min(480px, 55vw)",
              minHeight: 360,
              border: "1px solid rgba(201,162,39,0.30)",
              background: "radial-gradient(ellipse at 50% 50%, rgba(201,162,39,0.10) 0%, rgba(250,248,238,0.95) 65%)",
              boxShadow: "0 4px 32px rgba(201,162,39,0.10), inset 0 0 60px rgba(201,162,39,0.04)",
            }}
          >
            {/* ── SVG overlay ── */}
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              <defs>
                {/* Per-agent glow filters */}
                {AGENTS.map((agent) => (
                  <filter key={agent.id} id={`glow-${agent.id}`} x="-100%" y="-100%" width="300%" height="300%">
                    <feGaussianBlur stdDeviation="1.2" result="blur" />
                    <feFlood floodColor={agent.color} floodOpacity="0.7" result="flood" />
                    <feComposite in="flood" in2="blur" operator="in" result="shadow" />
                    <feMerge><feMergeNode in="shadow" /><feMergeNode in="SourceGraphic" /></feMerge>
                  </filter>
                ))}
                {/* Oracle glow */}
                <filter id="glow-oracle" x="-100%" y="-100%" width="300%" height="300%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feFlood floodColor="#f59e0b" floodOpacity="0.5" result="flood" />
                  <feComposite in="flood" in2="blur" operator="in" result="shadow" />
                  <feMerge><feMergeNode in="shadow" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>

              {/* Lines: Oracle → each working agent */}
              {AGENTS.map((agent) => {
                const [ax, ay] = SVG_POS[agent.id];
                const isWorking = workingAgents.has(agent.id);
                const isDone = completedAgents.has(agent.id);
                if (!isWorking && !isDone) return null;
                return (
                  <line
                    key={agent.id}
                    x1={ORACLE[0]} y1={ORACLE[1]}
                    x2={ax} y2={ay}
                    stroke={agent.color}
                    strokeWidth={isWorking ? "0.5" : "0.2"}
                    strokeDasharray={isWorking ? "2 1.5" : "1 2"}
                    opacity={isWorking ? 0.85 : 0.25}
                    filter={isWorking ? `url(#glow-${agent.id})` : undefined}
                    style={isWorking ? { animation: "dash-flow 0.9s linear infinite" } : undefined}
                  />
                );
              })}

              {/* A2A direct links between agents */}
              {a2aLinks.map((link) => {
                const [fx, fy] = SVG_POS[link.from];
                const [tx, ty] = SVG_POS[link.to];
                const fromAgent = AGENT_MAP[link.from];
                // Midpoint control for curve
                const mx = (fx + tx) / 2;
                const my = (fy + ty) / 2 - 12;
                return (
                  <g key={link.id}>
                    <path
                      d={`M ${fx} ${fy} Q ${mx} ${my} ${tx} ${ty}`}
                      fill="none"
                      stroke={fromAgent.color}
                      strokeWidth="0.6"
                      strokeDasharray="3 2"
                      opacity="0.9"
                      filter={`url(#glow-${link.from})`}
                      style={{ animation: "dash-flow 0.6s linear infinite" }}
                    />
                    {/* Traveling particle */}
                    <circle r="0.8" fill={fromAgent.color} opacity="0.9" filter={`url(#glow-${link.from})`}>
                      <animateMotion
                        path={`M ${fx} ${fy} Q ${mx} ${my} ${tx} ${ty}`}
                        dur="1.2s"
                        repeatCount="indefinite"
                      />
                    </circle>
                  </g>
                );
              })}

              {/* Oracle pulse rings */}
              {isSystemActive && (
                <>
                  <circle cx={ORACLE[0]} cy={ORACLE[1]} r="6" fill="none"
                    stroke="#f59e0b" strokeWidth="0.3" opacity="0.6"
                    style={{ animation: "ring-expand 2s ease-out infinite" }} />
                  <circle cx={ORACLE[0]} cy={ORACLE[1]} r="6" fill="none"
                    stroke="#f59e0b" strokeWidth="0.3" opacity="0.6"
                    style={{ animation: "ring-expand 2s ease-out infinite", animationDelay: "0.8s" }} />
                </>
              )}

              {/* Oracle center dot */}
              <circle
                cx={ORACLE[0]} cy={ORACLE[1]} r="2.5"
                fill={isSystemActive ? "#C9A227" : "rgba(201,162,39,0.25)"}
                filter="url(#glow-oracle)"
                style={{ transition: "fill 0.5s" }}
              />

              {/* Keyframes */}
              <style>{`
                @keyframes dash-flow { from { stroke-dashoffset: 14; } to { stroke-dashoffset: 0; } }
                @keyframes ring-expand { 0% { r: 3; opacity: 0.7; } 100% { r: 18; opacity: 0; } }
                @keyframes status-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
              `}</style>
            </svg>

            {/* ── Oracle center label ── */}
            <div
              className="absolute"
              style={{
                top: "50%", left: "50%",
                transform: "translate(-50%, -50%)",
                pointerEvents: "none",
                zIndex: 5,
              }}
            >
              <div
                className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl"
                style={{
                  background: "rgba(253,252,247,0.92)",
                  border: `1px solid ${isSystemActive ? "rgba(201,162,39,0.60)" : "rgba(201,162,39,0.20)"}`,
                  boxShadow: isSystemActive ? "0 0 30px rgba(201,162,39,0.25)" : "0 2px 12px rgba(201,162,39,0.08)",
                  backdropFilter: "blur(6px)",
                }}
              >
                <span className="text-2xl" style={{ filter: isSystemActive ? "drop-shadow(0 0 8px #C9A227)" : "none" }}>
                  ⚡
                </span>
                <span
                  className="text-[9px] font-bold uppercase tracking-widest"
                  style={{ color: isSystemActive ? "#9A7A10" : "rgba(26,18,8,0.30)" }}
                >
                  {isSystemActive ? "Active" : "Oracle"}
                </span>
              </div>
            </div>

            {/* ── God Cards (absolute positioned) ── */}
            {/* Zeus — top-left */}
            <div className="absolute" style={{ top: "5%", left: "2%", width: "16%" }}>
              <GodCard agent={AGENT_MAP.zeus} isWorking={workingAgents.has("zeus")}
                isComplete={completedAgents.has("zeus")} latestThought={latestByAgent.zeus ?? null}
                progress={progress.zeus ?? 0} />
            </div>
            {/* Athena — top-center */}
            <div className="absolute" style={{ top: "5%", left: "42%", width: "16%" }}>
              <GodCard agent={AGENT_MAP.athena} isWorking={workingAgents.has("athena")}
                isComplete={completedAgents.has("athena")} latestThought={latestByAgent.athena ?? null}
                progress={progress.athena ?? 0} />
            </div>
            {/* Hermes — top-right */}
            <div className="absolute" style={{ top: "5%", right: "2%", width: "16%" }}>
              <GodCard agent={AGENT_MAP.hermes} isWorking={workingAgents.has("hermes")}
                isComplete={completedAgents.has("hermes")} latestThought={latestByAgent.hermes ?? null}
                progress={progress.hermes ?? 0} />
            </div>
            {/* Hades — bottom-left */}
            <div className="absolute" style={{ bottom: "5%", left: "2%", width: "16%" }}>
              <GodCard agent={AGENT_MAP.hades} isWorking={workingAgents.has("hades")}
                isComplete={completedAgents.has("hades")} latestThought={latestByAgent.hades ?? null}
                progress={progress.hades ?? 0} />
            </div>
            {/* Apollo — bottom-center */}
            <div className="absolute" style={{ bottom: "5%", left: "42%", width: "16%" }}>
              <GodCard agent={AGENT_MAP.apollo} isWorking={workingAgents.has("apollo")}
                isComplete={completedAgents.has("apollo")} latestThought={latestByAgent.apollo ?? null}
                progress={progress.apollo ?? 0} />
            </div>
            {/* Ares — bottom-right */}
            <div className="absolute" style={{ bottom: "5%", right: "2%", width: "16%" }}>
              <GodCard agent={AGENT_MAP.ares} isWorking={workingAgents.has("ares")}
                isComplete={completedAgents.has("ares")} latestThought={latestByAgent.ares ?? null}
                progress={progress.ares ?? 0} />
            </div>

            {/* Parallel badge — appears when 2+ agents active */}
            {activeCount >= 2 && (
              <div
                className="absolute top-3 right-3 flex items-center gap-2 px-3 py-1.5 rounded-full"
                style={{
                  background: "rgba(253,252,247,0.92)",
                  border: "1px solid rgba(201,162,39,0.50)",
                  boxShadow: "0 0 20px rgba(201,162,39,0.20)",
                  backdropFilter: "blur(6px)",
                }}
              >
                <span className="w-2 h-2 rounded-full" style={{ background: "#C9A227", animation: "status-pulse 0.8s ease-in-out infinite" }} />
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#9A7A10" }}>
                  Parallel · {activeCount} agents
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Thought Stream ── */}
        <div
          className="w-full lg:w-80 xl:w-96 flex flex-col border-t lg:border-t-0 lg:border-l"
          style={{ borderColor: "rgba(201,162,39,0.18)", background: "#FFFFFF" }}
        >
          {/* Stream header */}
          <div
            className="flex items-center justify-between px-5 py-3 border-b shrink-0"
            style={{ borderColor: "rgba(201,162,39,0.15)", background: "rgba(201,162,39,0.03)" }}
          >
            <div>
              <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "#9A7A10" }}>
                Thought Stream
              </p>
              <p className="text-[10px]" style={{ color: "rgba(26,18,8,0.35)" }}>
                Live agentic trace
              </p>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider"
              style={{ color: "rgba(154,122,16,0.5)" }}>
              {thoughts.length > 0 && `${thoughts.length} entries`}
            </div>
          </div>

          {/* Badge legend */}
          <div className="flex gap-2 px-5 py-2.5 border-b shrink-0 flex-wrap"
            style={{ borderColor: "rgba(201,162,39,0.10)" }}>
            {(["OBSERVE", "REASON", "ACT", "A2A"] as Badge[]).map((b) => {
              const s = BADGE_STYLES[b];
              return (
                <span key={b} className="text-[8px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider"
                  style={{ background: s.bg, color: s.text, border: `1px solid ${s.border}` }}>
                  {b}
                </span>
              );
            })}
          </div>

          {/* Stream entries */}
          <div
            ref={streamRef}
            className="flex-1 overflow-y-auto px-4 py-3 space-y-2"
            style={{ minHeight: 0 }}
          >
            {thoughts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 py-12">
                <div className="text-3xl opacity-25">🏛️</div>
                <p className="text-xs text-center" style={{ color: "rgba(26,18,8,0.30)" }}>
                  Select a mission above to watch<br />the gods think in parallel
                </p>
              </div>
            ) : (
              thoughts.map((entry) => {
                const agent = AGENT_MAP[entry.agentId];
                const badge = BADGE_STYLES[entry.badge];
                return (
                  <div
                    key={entry.id}
                    className="flex gap-2.5 items-start rounded-lg px-2.5 py-2 transition-all"
                    style={{
                      background: `${agent.color}0d`,
                      border: `1px solid ${agent.color}28`,
                      animation: "entry-appear 0.25s ease-out forwards",
                    }}
                  >
                    {/* Agent icon */}
                    {(() => { const Icon = AGENT_ICONS[agent.id]; return <Icon size={14} color={agent.color} className="shrink-0 mt-0.5" />; })()}
                    <div className="flex-1 min-w-0">
                      {/* Agent name + badge */}
                      <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                        <span className="text-[10px] font-bold" style={{ color: agent.color }}>
                          {agent.name}
                        </span>
                        <span
                          className="text-[8px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider"
                          style={{ background: badge.bg, color: badge.text, border: `1px solid ${badge.border}` }}
                        >
                          {entry.badge}
                        </span>
                      </div>
                      {/* Text */}
                      <p className="text-[11px] leading-relaxed" style={{ color: "rgba(26,18,8,0.60)" }}>
                        {entry.text}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Global keyframes for thought stream */}
          <style>{`
            @keyframes entry-appear {
              from { opacity: 0; transform: translateY(6px); }
              to   { opacity: 1; transform: translateY(0); }
            }
            @keyframes status-pulse {
              0%, 100% { opacity: 1; }
              50% { opacity: 0.35; }
            }
          `}</style>
        </div>
      </div>
    </div>
  );
}
