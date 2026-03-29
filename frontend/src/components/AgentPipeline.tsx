"use client";

import { useState, useEffect } from "react";
import { Shield, BookOpen, Swords, Terminal, ChevronRight } from "lucide-react";

// ---------------------------------------------------------------------------
// Types & static data
// ---------------------------------------------------------------------------

type StepStatus = "idle" | "active" | "done";

interface PipelineStep {
  id: string;
  god: string;
  role: string;
  description: string;
  icon: React.ReactNode;
  accent: string;
  bg: string;
}

const STEPS: PipelineStep[] = [
  {
    id: "zeus",
    god: "Zeus",
    role: "Orchestrator",
    description: "Routes the sample and compiles the final intelligence brief.",
    icon: <Terminal className="w-5 h-5" />,
    accent: "text-sienna",
    bg: "bg-sienna/10",
  },
  {
    id: "hades",
    god: "Hades",
    role: "Malware Analysis",
    description: "Submits to sandbox, polls for the ThreatReport, interprets behavior.",
    icon: <Shield className="w-5 h-5" />,
    accent: "text-rose",
    bg: "bg-rose/10",
  },
  {
    id: "apollo",
    god: "Apollo",
    role: "IOC Enrichment",
    description: "Fetches IOCs, enriches with Gemini threat intel, formats report.",
    icon: <BookOpen className="w-5 h-5" />,
    accent: "text-sienna",
    bg: "bg-sienna/10",
  },
  {
    id: "ares",
    god: "Ares",
    role: "Containment",
    description: "Generates containment, remediation, and prevention plans.",
    icon: <Swords className="w-5 h-5" />,
    accent: "text-rose",
    bg: "bg-rose/10",
  },
];

// How long (ms) each step stays "active" before flipping to "done"
const STEP_DURATION = 3200;
const STEP_GAP = 400; // pause between steps

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AgentPipeline() {
  const [statuses, setStatuses] = useState<Record<string, StepStatus>>(
    Object.fromEntries(STEPS.map((s) => [s.id, "idle"]))
  );
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);

  const runPipeline = () => {
    if (running) return;
    // Reset
    setStatuses(Object.fromEntries(STEPS.map((s) => [s.id, "idle"])));
    setFinished(false);
    setRunning(true);
  };

  useEffect(() => {
    if (!running) return;

    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    STEPS.forEach((step, i) => {
      const activateAt = i * (STEP_DURATION + STEP_GAP);
      const doneAt = activateAt + STEP_DURATION;

      timers.push(
        setTimeout(() => {
          if (!cancelled)
            setStatuses((prev) => ({ ...prev, [step.id]: "active" }));
        }, activateAt)
      );

      timers.push(
        setTimeout(() => {
          if (!cancelled)
            setStatuses((prev) => ({ ...prev, [step.id]: "done" }));
        }, doneAt)
      );
    });

    const totalDuration =
      STEPS.length * (STEP_DURATION + STEP_GAP) + STEP_GAP;
    timers.push(
      setTimeout(() => {
        if (!cancelled) {
          setRunning(false);
          setFinished(true);
        }
      }, totalDuration)
    );

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [running]);

  return (
    <div className="col-span-1 md:col-span-12 bg-card border border-border-subtle rounded-2xl p-8 shadow-warm">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-xs tracking-widest uppercase text-muted font-bold flex items-center gap-2 mb-1">
            <Terminal className="w-4 h-4 text-sienna" /> Agent Pipeline
          </p>
          <p className="text-muted text-sm">
            Hades → Apollo → Ares — live handoff sequence
          </p>
        </div>
        <button
          onClick={runPipeline}
          disabled={running}
          className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all active:scale-95 ${
            running
              ? "bg-linen text-muted border border-border-subtle cursor-not-allowed"
              : "bg-sienna hover:bg-[#a35322] text-white shadow-warm"
          }`}
        >
          {running ? "Running..." : finished ? "Replay Pipeline" : "Run Pipeline"}
        </button>
      </div>

      {/* Steps */}
      <div className="flex flex-col md:flex-row items-stretch gap-0">
        {STEPS.map((step, i) => {
          const status = statuses[step.id];
          const isActive = status === "active";
          const isDone = status === "done";

          return (
            <div key={step.id} className="flex flex-col md:flex-row flex-1 items-stretch">
              {/* Card */}
              <div
                className={`flex-1 rounded-xl border p-5 transition-all duration-500 ${
                  isActive
                    ? `${step.bg} border-current ${step.accent} shadow-md scale-[1.02]`
                    : isDone
                    ? "border-border-subtle bg-white opacity-70"
                    : "border-border-subtle bg-white"
                }`}
              >
                {/* Icon + status */}
                <div className="flex items-center justify-between mb-4">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-300 ${
                      isActive
                        ? `${step.bg} ${step.accent}`
                        : isDone
                        ? "bg-linen text-muted"
                        : "bg-linen text-muted"
                    }`}
                  >
                    {step.icon}
                  </div>

                  <span
                    className={`text-[0.6rem] px-2 py-1 rounded-full font-bold uppercase tracking-widest transition-all duration-300 ${
                      isActive
                        ? `${step.bg} ${step.accent} border border-current`
                        : isDone
                        ? "bg-linen text-muted border border-border-subtle"
                        : "bg-linen text-muted/50 border border-border-subtle"
                    }`}
                  >
                    {isActive ? (
                      <span className="flex items-center gap-1">
                        <span className={`w-1.5 h-1.5 rounded-full ${step.accent.includes("rose") ? "bg-rose" : "bg-sienna"} animate-pulse inline-block`} />
                        Active
                      </span>
                    ) : isDone ? (
                      "Done"
                    ) : (
                      "Idle"
                    )}
                  </span>
                </div>

                <p className={`font-serif text-xl font-bold mb-0.5 transition-colors duration-300 ${isActive ? step.accent : "text-ink"}`}>
                  {step.god}
                </p>
                <p className={`text-xs font-bold uppercase tracking-wider mb-3 ${isActive ? step.accent : "text-muted"}`}>
                  {step.role}
                </p>
                <p className="text-sm text-muted leading-relaxed">{step.description}</p>

                {/* Progress bar */}
                <div className="mt-4 h-1 rounded-full bg-border-subtle overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      step.accent.includes("rose") ? "bg-rose" : "bg-sienna"
                    } ${
                      isActive
                        ? "animate-[progress_3.2s_linear_forwards]"
                        : isDone
                        ? "w-full opacity-30"
                        : "w-0"
                    }`}
                  />
                </div>
              </div>

              {/* Arrow connector (not after last) */}
              {i < STEPS.length - 1 && (
                <div className="flex items-center justify-center px-2 py-3 md:py-0 text-muted">
                  <ChevronRight
                    className={`w-5 h-5 transition-all duration-300 md:rotate-0 rotate-90 ${
                      isDone ? "text-sienna" : "text-border-subtle"
                    }`}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Completion banner */}
      {finished && (
        <div className="mt-6 px-5 py-3 rounded-xl bg-sienna/10 border border-sienna/20 text-sienna text-sm font-semibold flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-sienna" />
          Pipeline complete — incident report assembled and ready for delivery.
        </div>
      )}

      <style>{`
        @keyframes progress {
          from { width: 0%; }
          to   { width: 100%; }
        }
      `}</style>
    </div>
  );
}
