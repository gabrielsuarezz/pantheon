"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Play, RotateCcw, Pause, GitBranch, RefreshCw,
  ChevronDown, ChevronRight, Wrench, MessageSquare,
  ArrowRight, CheckCircle2, Zap, Terminal,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ToolCall {
  fn: string;
  args: string;
  result: string;
  durationMs: number;
}

interface LoopBlock {
  label: string;
  iterations: Array<{ label: string; status: "running" | "complete" }>;
  finalReveal: number;
}

interface BranchEvent {
  kind: "thought" | "tool_call" | "loop";
  revealAt: number;          // ms relative to parallel block start
  thought?: string;
  tool?: ToolCall;
  loop?: LoopBlock;
}

interface Branch {
  agentName: string;
  role: string;
  accent: string;           // tailwind text class
  border: string;           // tailwind border class
  bg: string;               // tailwind bg class
  events: BranchEvent[];
}

interface ParallelBlock {
  revealAt: number;
  endAt: number;
  label: string;
  branches: Branch[];
}

type TopEvent =
  | { kind: "thought";   revealAt: number; text: string }
  | { kind: "tool_call"; revealAt: number; tool: ToolCall }
  | { kind: "parallel";  revealAt: number; block: ParallelBlock }
  | { kind: "transfer";  revealAt: number; to: string; context: string }
  | { kind: "complete";  revealAt: number };

interface AgentSession {
  name: string;
  role: string;
  accent: string;
  border: string;
  bg: string;
  startAt: number;
  events: TopEvent[];
}

// ─── Trace Data ───────────────────────────────────────────────────────────────
//
//  Full Hades→Apollo→Ares pipeline including:
//   • Zeus top-level orchestration
//   • ParallelAgent: Hades (dynamic) + Athena (static) run concurrently
//   • LoopAgent: poll_report polls 3× before completing
//   • A2A transfers: Zeus→Hades, Hades→Apollo, Apollo→Ares
//   • Ares inner-parallel: 3 plan generators fire simultaneously

const SESSIONS: AgentSession[] = [
  // ── Zeus ──────────────────────────────────────────────────────────────────
  {
    name: "Zeus",
    role: "Root Orchestrator",
    accent: "text-amber-400",
    border: "border-amber-500/40",
    bg: "bg-amber-500/8",
    startAt: 0,
    events: [
      {
        kind: "thought",
        revealAt: 300,
        text: "Sample received: 6108674530.JS.malicious (47 KB). Routing to parallel analysis pipeline — dispatching Hades for dynamic sandbox execution and Athena for static deobfuscation simultaneously.",
      },
      {
        kind: "parallel",
        revealAt: 700,
        block: {
          label: "Parallel Analysis — Dynamic + Static",
          revealAt: 700,
          endAt: 4000,
          branches: [
            // ── Hades branch ────────────────────────────────────────────────
            {
              agentName: "Hades",
              role: "Dynamic Analysis",
              accent: "text-rose-400",
              border: "border-rose-500/40",
              bg: "bg-rose-500/8",
              events: [
                {
                  kind: "tool_call",
                  revealAt: 200,
                  tool: {
                    fn: "check_sandbox_health",
                    args: "{}",
                    result: '{ "status": "ok", "docker_available": true, "version": "0.1.0" }',
                    durationMs: 142,
                  },
                },
                {
                  kind: "thought",
                  revealAt: 500,
                  text: "Sandbox healthy. Submitting payload for full analysis (static + dynamic).",
                },
                {
                  kind: "tool_call",
                  revealAt: 700,
                  tool: {
                    fn: "submit_sample",
                    args: '{ "file_path": "/samples/6108674530.JS.malicious", "analysis_type": "both" }',
                    result: '{ "job_id": "hades-2a1f-9c3d", "status": "queued" }',
                    durationMs: 213,
                  },
                },
                {
                  kind: "loop",
                  revealAt: 1000,
                  loop: {
                    label: "poll_report(job_id='hades-2a1f-9c3d')",
                    iterations: [
                      { label: "Poll #1", status: "running" },
                      { label: "Poll #2", status: "running" },
                      { label: "Poll #3", status: "complete" },
                    ],
                    finalReveal: 2200,
                  },
                },
                {
                  kind: "thought",
                  revealAt: 2500,
                  text: "Analysis complete. WSH dropper confirmed — Risk: CRITICAL. C2 beaconing to 198.51.100.42 over HTTPS. Persistence via HKCU Run key. Transferring ThreatReport to Apollo.",
                },
              ],
            },
            // ── Athena branch ───────────────────────────────────────────────
            {
              agentName: "Athena",
              role: "Static Analysis",
              accent: "text-sky-400",
              border: "border-sky-500/40",
              bg: "bg-sky-500/8",
              events: [
                {
                  kind: "thought",
                  revealAt: 150,
                  text: "Running triage classification on raw file content.",
                },
                {
                  kind: "tool_call",
                  revealAt: 300,
                  tool: {
                    fn: "classify_threat",
                    args: '{ "filename": "6108674530.JS.malicious", "file_size_bytes": 48122, "content_preview": "var _0x3f8a=[\'\\x57\\x53\\x63\\x72\\x69\\x70\\x74\\x2e\\x53\\x68\\x65\\x6c\\x6c\'..." }',
                    result: '{ "threat_category": "dropper", "severity": "critical", "confidence": 0.94, "reasoning": "javascript-obfuscator _0x string array pattern with WScript.Shell and ActiveXObject calls", "requires_sandbox": true }',
                    durationMs: 387,
                  },
                },
                {
                  kind: "thought",
                  revealAt: 900,
                  text: "Confirmed WSH dropper at 94% confidence. Deobfuscation reveals WScript.Shell + XMLHTTP download pattern. Corroborates dynamic analysis path.",
                },
              ],
            },
          ],
        },
      },
      {
        kind: "transfer",
        revealAt: 4200,
        to: "Apollo",
        context: "ThreatReport + IOC context from Hades · Static classification from Athena",
      },
    ],
  },

  // ── Apollo ────────────────────────────────────────────────────────────────
  {
    name: "Apollo",
    role: "IOC Enrichment & Reporting",
    accent: "text-emerald-400",
    border: "border-emerald-500/40",
    bg: "bg-emerald-500/8",
    startAt: 4400,
    events: [
      {
        kind: "thought",
        revealAt: 200,
        text: "Received ThreatReport from Hades. Fetching flat IOC list then enriching with Gemini threat intelligence.",
      },
      {
        kind: "tool_call",
        revealAt: 500,
        tool: {
          fn: "get_iocs",
          args: '{ "job_id": "hades-2a1f-9c3d" }',
          result: '{ "ips": ["198.51.100.42","203.0.113.7"], "domains": ["evil-c2.example.com","update.badactor.net"], "file_hashes": { "sha256": "aaaa...64chars" }, "file_paths": ["C:\\\\Temp\\\\svchost32.exe"], "ports": [443,8080], "registry_keys": ["HKCU\\\\...\\\\Run\\\\Updater"], "urls": ["https://evil-c2.example.com/payload.bin"] }',
          durationMs: 198,
        },
      },
      {
        kind: "tool_call",
        revealAt: 900,
        tool: {
          fn: "enrich_iocs_with_threat_intel",
          args: '{ "ioc_report_json": "{\\"ips\\":[\\"198.51.100.42\\",\\"203.0.113.7\\"],...}" }',
          result: "## IOC Enrichment\n**198.51.100.42** — Cobalt Strike Team Server (HIGH). Observed in APT41 campaigns Q3 2024.\n**evil-c2.example.com** — registered 11 days ago via bulletproof registrar. CRITICAL.\n**HKCU\\\\Run\\\\Updater** — standard persistence mechanism, common to QakBot/IcedID loaders.",
          durationMs: 1140,
        },
      },
      {
        kind: "tool_call",
        revealAt: 2200,
        tool: {
          fn: "format_threat_report",
          args: '{ "report": { "job_id": "hades-2a1f-9c3d", "malware_type": "WSH dropper", "risk_level": "critical", ... } }',
          result: "## Threat Analysis Report — `hades-2a1f-9c3d`\n**Malware Type:** WSH dropper  \n**Risk Level:** CRITICAL  \n### Network IOCs\n- IPs: 198.51.100.42, 203.0.113.7\n- Domains: evil-c2.example.com...",
          durationMs: 44,
        },
      },
      {
        kind: "thought",
        revealAt: 2500,
        text: "Enrichment complete. Formatted markdown report ready. Transferring full context to Ares for response planning.",
      },
      {
        kind: "transfer",
        revealAt: 2800,
        to: "Ares",
        context: "Formatted ThreatReport · Gemini IOC enrichment · Raw IOCReport",
      },
    ],
  },

  // ── Ares ──────────────────────────────────────────────────────────────────
  {
    name: "Ares",
    role: "Containment & Remediation",
    accent: "text-orange-400",
    border: "border-orange-500/40",
    bg: "bg-orange-500/8",
    startAt: 7400,
    events: [
      {
        kind: "tool_call",
        revealAt: 200,
        tool: {
          fn: "extract_threat_summary_for_ares",
          args: '{ "threat_report": { "malware_type": "WSH dropper", "risk_level": "critical", ... }, "enrichment": "## IOC Enrichment..." }',
          result: "Malware Type: WSH dropper\nRisk Level: CRITICAL\nAnalysis: Decodes obfuscated payload, drops loader, establishes C2 over HTTPS\nMalicious IPs: 198.51.100.42, 203.0.113.7\nMalicious Domains: evil-c2.example.com\nSample SHA-256: aaaa...64chars\nDropped Files: C:\\Temp\\svchost32.exe\nRegistry Keys: HKCU\\...\\Run\\Updater\nThreat Intel: Cobalt Strike infrastructure, APT41 overlap.",
          durationMs: 28,
        },
      },
      {
        kind: "thought",
        revealAt: 500,
        text: "Summary extracted. Firing containment, remediation, and prevention plan generators in parallel for maximum speed.",
      },
      {
        kind: "parallel",
        revealAt: 800,
        block: {
          label: "Parallel Response Planning",
          revealAt: 800,
          endAt: 2200,
          branches: [
            {
              agentName: "Containment",
              role: "generate_containment_plan",
              accent: "text-red-400",
              border: "border-red-500/40",
              bg: "bg-red-500/8",
              events: [
                {
                  kind: "tool_call",
                  revealAt: 100,
                  tool: {
                    fn: "generate_containment_plan",
                    args: '{ "threat_summary": "Malware Type: WSH dropper, Risk: CRITICAL..." }',
                    result: "1. [CRITICAL] Immediately isolate host from network via EDR quarantine.\n2. [CRITICAL] Block 198.51.100.42 and 203.0.113.7 at perimeter firewall.\n3. [HIGH] Terminate any wscript.exe / cscript.exe processes.\n4. [HIGH] Lock affected user account pending investigation.\n5. [MEDIUM] Capture memory dump before proceeding.",
                    durationMs: 980,
                  },
                },
              ],
            },
            {
              agentName: "Remediation",
              role: "generate_remediation_plan",
              accent: "text-yellow-400",
              border: "border-yellow-500/40",
              bg: "bg-yellow-500/8",
              events: [
                {
                  kind: "tool_call",
                  revealAt: 100,
                  tool: {
                    fn: "generate_remediation_plan",
                    args: '{ "threat_summary": "Malware Type: WSH dropper, Risk: CRITICAL..." }',
                    result: "1. Delete C:\\Temp\\svchost32.exe and C:\\ProgramData\\update\\loader.dll.\n2. Remove registry key HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\Updater.\n3. Rotate all credentials accessible from the compromised host.\n4. Patch CVE-2024-XXXX if applicable to the dropper vector.\n5. Re-image host if persistence beyond Run key is confirmed.",
                    durationMs: 1050,
                  },
                },
              ],
            },
            {
              agentName: "Prevention",
              role: "generate_prevention_plan",
              accent: "text-purple-400",
              border: "border-purple-500/40",
              bg: "bg-purple-500/8",
              events: [
                {
                  kind: "tool_call",
                  revealAt: 100,
                  tool: {
                    fn: "generate_prevention_plan",
                    args: '{ "threat_summary": "Malware Type: WSH dropper, Risk: CRITICAL..." }',
                    result: "1. Deploy YARA rule targeting _0x string array pattern in .js files.\n2. Enable ASR rule: Block execution of potentially obfuscated scripts.\n3. Restrict WScript.Shell via GPO — allow only signed scripts.\n4. Add 198.51.100.42/24 and evil-c2.example.com to threat intel feeds.\n5. Sigma rule: alert on HKCU\\Run writes by non-installer processes.",
                    durationMs: 1100,
                  },
                },
              ],
            },
          ],
        },
      },
      {
        kind: "tool_call",
        revealAt: 2500,
        tool: {
          fn: "build_full_response",
          args: '{ "threat_report_md": "## Threat Analysis...", "enrichment": "## IOC Enrichment...", "containment": "1. [CRITICAL]...", "remediation": "1. Delete...", "prevention": "1. Deploy YARA..." }',
          result: "# Pantheon Incident Response Report\n\n[Full markdown document — 847 words — ready for delivery via Hermes/Telegram]",
          durationMs: 31,
        },
      },
      {
        kind: "complete",
        revealAt: 2900,
      },
    ],
  },
];

// Total trace duration in ms
const TOTAL_MS = 11000;

// ─── Sub-components ───────────────────────────────────────────────────────────

function ThoughtNode({ text }: { text: string }) {
  return (
    <div className="flex gap-3 items-start">
      <div className="mt-0.5 shrink-0 w-5 h-5 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
        <MessageSquare className="w-2.5 h-2.5 text-white/40" />
      </div>
      <p className="text-[13px] text-white/55 italic leading-relaxed">{text}</p>
    </div>
  );
}

function ToolCallNode({ tool }: { tool: ToolCall }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border border-white/8 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-3 px-4 py-2.5 bg-white/4 hover:bg-white/6 transition-colors text-left"
      >
        <Wrench className="w-3.5 h-3.5 text-white/30 shrink-0" />
        <span className="font-mono text-[13px] text-white/80 font-medium flex-1">
          {tool.fn}
          <span className="text-white/30 font-normal">()</span>
        </span>
        <span className="text-[11px] text-white/25 font-mono shrink-0">{tool.durationMs}ms</span>
        <span className="text-white/25 shrink-0">
          {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-white/8 divide-y divide-white/5">
          <div className="px-4 py-3">
            <p className="text-[10px] uppercase tracking-widest text-white/25 mb-2 font-bold">Input</p>
            <pre className="text-[11px] text-white/50 font-mono whitespace-pre-wrap leading-relaxed overflow-x-auto">
              {tool.args}
            </pre>
          </div>
          <div className="px-4 py-3">
            <p className="text-[10px] uppercase tracking-widest text-white/25 mb-2 font-bold">Output</p>
            <pre className="text-[11px] text-emerald-400/70 font-mono whitespace-pre-wrap leading-relaxed overflow-x-auto">
              {tool.result}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

function LoopNode({ loop, playheadInBlock }: { loop: LoopBlock; playheadInBlock: number }) {
  const visibleCount = loop.iterations.filter((_, i) => {
    const iterReveal = 200 + i * 500;
    return playheadInBlock >= iterReveal;
  }).length;

  return (
    <div className="border border-white/8 rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 bg-white/4 flex items-center gap-3">
        <RefreshCw className="w-3.5 h-3.5 text-white/30 shrink-0" />
        <span className="font-mono text-[13px] text-white/80 font-medium flex-1">{loop.label}</span>
        <span className="text-[10px] uppercase tracking-wider text-white/25 font-bold">LoopAgent</span>
      </div>
      <div className="px-4 py-3 space-y-1.5">
        {loop.iterations.slice(0, visibleCount).map((iter, i) => (
          <div key={i} className="flex items-center gap-3 text-[12px]">
            <RefreshCw className="w-3 h-3 text-white/20 shrink-0" />
            <span className="text-white/40 font-mono">{iter.label}</span>
            {iter.status === "running" ? (
              <span className="text-amber-400/70 text-[11px] font-mono">→ status: running</span>
            ) : (
              <span className="text-emerald-400/70 text-[11px] font-mono flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> status: complete
              </span>
            )}
          </div>
        ))}
        {visibleCount < loop.iterations.length && (
          <div className="flex items-center gap-2 text-[11px] text-white/20 font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400/40 animate-pulse" />
            polling...
          </div>
        )}
      </div>
    </div>
  );
}

function TransferNode({ to, context }: { to: string; context: string }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3 rounded-lg border border-dashed border-white/15 bg-white/3">
      <ArrowRight className="w-4 h-4 text-white/30 mt-0.5 shrink-0" />
      <div>
        <p className="text-[13px] font-semibold text-white/70">
          A2A Transfer → <span className="text-white">{to}</span>
        </p>
        <p className="text-[11px] text-white/30 mt-0.5 font-mono">{context}</p>
      </div>
    </div>
  );
}

function ParallelBlockNode({
  block,
  playheadInParent,
}: {
  block: ParallelBlock;
  playheadInParent: number;
}) {
  const playheadInBlock = Math.max(0, playheadInParent - block.revealAt);

  return (
    <div className="border border-white/10 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-2.5 bg-white/5 border-b border-white/8">
        <GitBranch className="w-3.5 h-3.5 text-violet-400/70" />
        <span className="text-[11px] font-bold uppercase tracking-widest text-violet-400/70">
          ParallelAgent
        </span>
        <span className="text-white/30 text-[12px] ml-1">— {block.label}</span>
      </div>

      {/* Branches */}
      <div
        className={`grid gap-px bg-white/5 ${
          block.branches.length === 2 ? "grid-cols-2" : "grid-cols-3"
        }`}
      >
        {block.branches.map((branch) => {
          return (
            <div key={branch.agentName} className={`${branch.bg} p-4 space-y-3`}>
              {/* Branch header */}
              <div className={`flex items-center gap-2 pb-2 border-b ${branch.border}`}>
                <span className={`text-[11px] font-bold uppercase tracking-wider ${branch.accent}`}>
                  {branch.agentName}
                </span>
                <span className="text-white/25 text-[10px]">{branch.role}</span>
              </div>

              {/* Branch events */}
              {branch.events.map((ev, i) => {
                if (playheadInBlock < ev.revealAt) return null;
                if (ev.kind === "thought" && ev.thought)
                  return <ThoughtNode key={i} text={ev.thought} />;
                if (ev.kind === "tool_call" && ev.tool)
                  return <ToolCallNode key={i} tool={ev.tool} />;
                if (ev.kind === "loop" && ev.loop)
                  return (
                    <LoopNode key={i} loop={ev.loop} playheadInBlock={playheadInBlock - ev.revealAt} />
                  );
                return null;
              })}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      {playheadInParent >= block.endAt && (
        <div className="flex items-center gap-2 px-4 py-2 bg-white/3 border-t border-white/8">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400/60" />
          <span className="text-[11px] text-emerald-400/60 font-medium">
            All branches resolved — results merged
          </span>
        </div>
      )}
    </div>
  );
}

function SessionBlock({
  session,
  playhead,
}: {
  session: AgentSession;
  playhead: number;
}) {
  const localPlayhead = playhead - session.startAt;
  if (localPlayhead < 0) return null;

  return (
    <div className={`rounded-xl border ${session.border} overflow-hidden`}>
      {/* Agent header */}
      <div className={`flex items-center gap-3 px-5 py-3 ${session.bg} border-b ${session.border}`}>
        <Terminal className="w-4 h-4 text-white/30" />
        <span className={`font-bold text-sm ${session.accent}`}>{session.name}</span>
        <span className="text-white/30 text-xs">·</span>
        <span className="text-white/40 text-xs">{session.role}</span>
        <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-full border ${session.border} ${session.accent} font-bold uppercase tracking-widest`}>
          Running
        </span>
      </div>

      {/* Events */}
      <div className="p-5 space-y-4">
        {session.events.map((ev, i) => {
          if (localPlayhead < ev.revealAt) return null;

          if (ev.kind === "thought")
            return <ThoughtNode key={i} text={ev.text} />;

          if (ev.kind === "tool_call")
            return <ToolCallNode key={i} tool={ev.tool} />;

          if (ev.kind === "parallel")
            return (
              <ParallelBlockNode
                key={i}
                block={ev.block}
                playheadInParent={localPlayhead}
              />
            );

          if (ev.kind === "transfer")
            return <TransferNode key={i} to={ev.to} context={ev.context} />;

          if (ev.kind === "complete")
            return (
              <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <div>
                  <p className="text-sm font-bold text-emerald-400">Pipeline Complete</p>
                  <p className="text-[12px] text-white/40 mt-0.5">
                    Incident report assembled — ready for delivery via Hermes / Telegram voice interface.
                  </p>
                </div>
              </div>
            );

          return null;
        })}
      </div>
    </div>
  );
}

// ─── Main TraceViewer ─────────────────────────────────────────────────────────

export default function TraceViewer() {
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<1 | 2 | 4>(2);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const tick = useCallback(() => {
    setPlayhead((p) => {
      if (p >= TOTAL_MS) {
        setPlaying(false);
        return TOTAL_MS;
      }
      return p + 50 * speed;
    });
  }, [speed]);

  useEffect(() => {
    if (playing) {
      intervalRef.current = setInterval(tick, 50);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [playing, tick]);

  const replay = () => {
    setPlayhead(0);
    setPlaying(true);
  };

  const togglePlay = () => {
    if (playhead >= TOTAL_MS) {
      replay();
    } else {
      setPlaying((p) => !p);
    }
  };

  const progress = Math.min(100, (playhead / TOTAL_MS) * 100);

  // Live stats
  const activeSessions = SESSIONS.filter((s) => playhead >= s.startAt).length;
  const toolCallsVisible = SESSIONS.reduce((acc, s) => {
    const lp = playhead - s.startAt;
    if (lp < 0) return acc;
    return (
      acc +
      s.events.filter((e) => {
        if (e.kind === "tool_call" && lp >= e.revealAt) return true;
        if (e.kind === "parallel") {
          return e.block.branches.some((b) =>
            b.events.some(
              (be) =>
                be.kind === "tool_call" &&
                lp - e.block.revealAt >= be.revealAt
            )
          );
        }
        return false;
      }).length
    );
  }, 0);

  return (
    <div className="flex flex-col gap-0 rounded-2xl overflow-hidden border border-white/8 shadow-2xl">
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-4 px-5 py-3 bg-[#12100e] border-b border-white/8">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-rose-500/70" />
          <div className="w-3 h-3 rounded-full bg-amber-500/70" />
          <div className="w-3 h-3 rounded-full bg-emerald-500/70" />
        </div>

        <span className="text-white/30 font-mono text-xs ml-2">
          pantheon · adk-trace · session_2026-03-29T09:14:00Z
        </span>

        <div className="ml-auto flex items-center gap-3">
          {/* Speed */}
          <div className="flex items-center gap-1 text-white/30 text-xs">
            {([1, 2, 4] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={`px-2 py-0.5 rounded font-mono transition-colors ${
                  speed === s
                    ? "bg-white/10 text-white/70"
                    : "hover:bg-white/5 text-white/30"
                }`}
              >
                {s}×
              </button>
            ))}
          </div>

          {/* Replay */}
          <button
            onClick={replay}
            className="p-1.5 rounded hover:bg-white/8 text-white/30 hover:text-white/60 transition-colors"
            title="Replay"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* Play/Pause */}
          <button
            onClick={togglePlay}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-sienna hover:bg-[#a35322] text-white text-xs font-semibold transition-colors active:scale-95"
          >
            {playing ? (
              <><Pause className="w-3 h-3" /> Pause</>
            ) : playhead >= TOTAL_MS ? (
              <><RotateCcw className="w-3 h-3" /> Replay</>
            ) : (
              <><Play className="w-3 h-3" /> {playhead > 0 ? "Resume" : "Play Trace"}</>
            )}
          </button>
        </div>
      </div>

      {/* ── Progress bar ── */}
      <div className="h-0.5 bg-white/5">
        <div
          className="h-full bg-gradient-to-r from-amber-500 via-sienna to-rose-500 transition-all duration-75"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* ── Stats bar ── */}
      <div className="grid grid-cols-4 divide-x divide-white/8 bg-[#161210]">
        {[
          { label: "Elapsed", value: `${(playhead / 1000).toFixed(1)}s`, accent: "text-white/60" },
          { label: "Active Agents", value: `${activeSessions}`, accent: "text-amber-400" },
          { label: "Tool Calls", value: `${toolCallsVisible}`, accent: "text-emerald-400" },
          { label: "A2A Transfers", value: playhead >= 4200 ? (playhead >= 7400 ? "2" : "1") : "0", accent: "text-violet-400" },
        ].map(({ label, value, accent }) => (
          <div key={label} className="flex flex-col items-center py-3 gap-0.5">
            <span className={`font-mono text-base font-bold ${accent}`}>{value}</span>
            <span className="text-white/25 text-[10px] uppercase tracking-widest">{label}</span>
          </div>
        ))}
      </div>

      {/* ── Trace body ── */}
      <div className="bg-[#0f0d0b] p-5 space-y-4 overflow-y-auto max-h-[680px]">
        {playhead === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
            <div className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center">
              <Zap className="w-6 h-6 text-white/20" />
            </div>
            <p className="text-white/25 text-sm">
              Press <span className="font-semibold text-white/40">Play Trace</span> to replay the full Pantheon agent execution
            </p>
          </div>
        )}

        {SESSIONS.map((session) => (
          <SessionBlock key={session.name} session={session} playhead={playhead} />
        ))}
      </div>
    </div>
  );
}
