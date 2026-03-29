"use client";

import { useState, useEffect, useCallback } from "react";
import { Mic, MicOff, PhoneOff, Volume2, ChevronDown } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AgentName = "Zeus" | "Hades" | "Apollo" | "Ares";

interface TranscriptEntry {
  agent: AgentName;
  text: string;
  ms: number; // ms since call started — used for ordered replay
}

interface AgentDef {
  name: AgentName;
  role: string;
  accent: string; // tailwind text color
  bg: string;     // tailwind bg color
  ring: string;   // tailwind ring color
}

// ---------------------------------------------------------------------------
// Static data
// ---------------------------------------------------------------------------

const AGENTS: AgentDef[] = [
  { name: "Zeus",   role: "Orchestrator",   accent: "text-sienna",   bg: "bg-sienna/10",  ring: "ring-sienna/40"  },
  { name: "Hades",  role: "Malware Analysis", accent: "text-rose",   bg: "bg-rose/10",    ring: "ring-rose/40"    },
  { name: "Apollo", role: "IOC Enrichment", accent: "text-sienna",   bg: "bg-sienna/10",  ring: "ring-sienna/40"  },
  { name: "Ares",   role: "Containment",    accent: "text-rose",     bg: "bg-rose/10",    ring: "ring-rose/40"    },
];

const MOCK_TRANSCRIPT: TranscriptEntry[] = [
  { agent: "Zeus",   text: "Sample received. Routing to Hades for sandbox submission.",          ms: 800  },
  { agent: "Hades",  text: "Sandbox health confirmed. Submitting payload — analysis_type: both.", ms: 2200 },
  { agent: "Hades",  text: "Behavioral capture complete. Risk level: CRITICAL.",                  ms: 5100 },
  { agent: "Zeus",   text: "Transferring ThreatReport to Apollo for IOC enrichment.",             ms: 5800 },
  { agent: "Apollo", text: "Detected 2 malicious IPs, 3 domains, 1 persistence key.",            ms: 7400 },
  { agent: "Apollo", text: "Threat intel enrichment done. Handing off to Ares.",                  ms: 9100 },
  { agent: "Ares",   text: "Generating containment, remediation and prevention plans.",           ms: 10200 },
  { agent: "Ares",   text: "Response playbook ready. Recommend immediate host isolation.",        ms: 12500 },
  { agent: "Zeus",   text: "Pipeline complete. Incident report assembled and delivered.",         ms: 13300 },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function Waveform({ active }: { active: boolean }) {
  const bars = [3, 6, 9, 7, 4, 8, 5, 10, 6, 3, 7, 5, 9, 4, 6];
  return (
    <div className="flex items-center gap-[3px] h-8">
      {bars.map((h, i) => (
        <div
          key={i}
          className={`w-[3px] rounded-full transition-all ${active ? "bg-sienna" : "bg-border-subtle"}`}
          style={{
            height: active ? `${h * 2.8}px` : "4px",
            animationName: active ? "wave" : "none",
            animationDuration: `${0.5 + (i % 5) * 0.12}s`,
            animationTimingFunction: "ease-in-out",
            animationIterationCount: "infinite",
            animationDirection: "alternate",
            animationDelay: `${i * 0.05}s`,
          }}
        />
      ))}
      <style>{`
        @keyframes wave {
          from { transform: scaleY(0.3); }
          to   { transform: scaleY(1); }
        }
      `}</style>
    </div>
  );
}

function AgentBadge({
  agent,
  isSpeaking,
}: {
  agent: AgentDef;
  isSpeaking: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all duration-300 ${
        isSpeaking
          ? `${agent.bg} border-current ${agent.accent} ring-2 ${agent.ring}`
          : "border-border-subtle text-muted bg-transparent"
      }`}
    >
      {isSpeaking && (
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            agent.accent.includes("rose") ? "bg-rose" : "bg-sienna"
          } animate-pulse`}
        />
      )}
      <span className="text-xs font-bold tracking-wide">{agent.name}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function VoiceChat() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(false);
  const [muted, setMuted] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [visibleLines, setVisibleLines] = useState<TranscriptEntry[]>([]);

  // Determine which agent is currently "speaking"
  const speakingAgent: AgentName | null = (() => {
    if (!active) return null;
    // Find the last transcript entry that has appeared
    const shown = MOCK_TRANSCRIPT.filter((e) => e.ms <= elapsedMs);
    return shown.length > 0 ? shown[shown.length - 1].agent : null;
  })();

  // Timer
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setElapsedMs((p) => p + 100), 100);
    return () => clearInterval(id);
  }, [active]);

  // Feed transcript lines as time advances
  useEffect(() => {
    if (!active) return;
    const next = MOCK_TRANSCRIPT.filter((e) => e.ms <= elapsedMs);
    setVisibleLines(next);
  }, [elapsedMs, active]);

  const startCall = useCallback(() => {
    setActive(true);
    setElapsedMs(0);
    setVisibleLines([]);
  }, []);

  const endCall = useCallback(() => {
    setActive(false);
    setElapsedMs(0);
    setVisibleLines([]);
  }, []);

  const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  };

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Open voice assistant"
        className={`fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-200 active:scale-95 ${
          active
            ? "bg-rose text-white ring-4 ring-rose/30 animate-pulse"
            : "bg-ink text-white hover:bg-[#2a221d]"
        }`}
      >
        {active ? <Volume2 className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-[360px] bg-card border border-border-subtle rounded-2xl shadow-2xl overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle bg-linen">
            <div className="flex items-center gap-2">
              <Mic className="w-4 h-4 text-sienna" />
              <span className="font-bold text-sm text-ink">Voice Assistant</span>
              {active && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-sienna/10 text-sienna font-bold">
                  {formatTime(elapsedMs)}
                </span>
              )}
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-muted hover:text-ink transition-colors"
              aria-label="Collapse panel"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>

          {/* Agent badges */}
          <div className="px-5 py-3 flex flex-wrap gap-2 border-b border-border-subtle">
            {AGENTS.map((a) => (
              <AgentBadge key={a.name} agent={a} isSpeaking={speakingAgent === a.name} />
            ))}
          </div>

          {/* Waveform + status */}
          <div className="px-5 py-4 flex items-center gap-4 border-b border-border-subtle">
            <Waveform active={active && !muted} />
            <div className="ml-auto text-right">
              <p className="text-xs text-muted font-medium">
                {active
                  ? muted
                    ? "Muted"
                    : speakingAgent
                    ? `${speakingAgent} speaking`
                    : "Listening..."
                  : "Ready"}
              </p>
            </div>
          </div>

          {/* Transcript */}
          <div className="flex-1 overflow-y-auto max-h-52 px-5 py-3 space-y-3">
            {visibleLines.length === 0 && (
              <p className="text-xs text-muted text-center py-4">
                {active ? "Waiting for agents..." : "Start a call to see agent activity."}
              </p>
            )}
            {visibleLines.map((entry, i) => {
              const def = AGENTS.find((a) => a.name === entry.agent)!;
              return (
                <div key={i} className="flex gap-2.5 items-start">
                  <span className={`text-[0.65rem] font-bold uppercase tracking-wider mt-0.5 w-12 shrink-0 ${def.accent}`}>
                    {entry.agent}
                  </span>
                  <p className="text-xs text-ink/80 leading-relaxed">{entry.text}</p>
                </div>
              );
            })}
          </div>

          {/* Controls */}
          <div className="px-5 py-4 border-t border-border-subtle flex items-center gap-3">
            {!active ? (
              <button
                onClick={startCall}
                className="flex-1 bg-sienna hover:bg-[#a35322] text-white rounded-xl py-2.5 font-semibold text-sm flex items-center justify-center gap-2 transition-all active:scale-95"
              >
                <Mic className="w-4 h-4" />
                Start Call
              </button>
            ) : (
              <>
                <button
                  onClick={() => setMuted((m) => !m)}
                  className={`flex-1 rounded-xl py-2.5 font-semibold text-sm flex items-center justify-center gap-2 border transition-all active:scale-95 ${
                    muted
                      ? "border-rose/40 bg-rose/10 text-rose"
                      : "border-border-subtle bg-white text-ink hover:bg-linen"
                  }`}
                >
                  {muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  {muted ? "Unmute" : "Mute"}
                </button>
                <button
                  onClick={endCall}
                  className="flex-1 bg-rose hover:bg-[#6e2e2e] text-white rounded-xl py-2.5 font-semibold text-sm flex items-center justify-center gap-2 transition-all active:scale-95"
                >
                  <PhoneOff className="w-4 h-4" />
                  End Call
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
