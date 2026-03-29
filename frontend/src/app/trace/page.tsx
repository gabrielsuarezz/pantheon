import Link from "next/link";
import { ArrowLeft, GitBranch, Zap, ArrowRight, RefreshCw } from "lucide-react";
import TraceViewer from "@/components/TraceViewer";

export default function TracePage() {
  return (
    <div className="min-h-screen bg-[#0c0a09] text-white">
      {/* ── Header ── */}
      <header className="border-b border-white/8 px-6 md:px-12 py-4 flex items-center justify-between sticky top-0 bg-[#0c0a09]/95 backdrop-blur-sm z-10">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 text-white/30 hover:text-white/60 transition-colors text-sm font-medium"
          >
            <ArrowLeft className="w-4 h-4" /> Dashboard
          </Link>
          <span className="text-white/15">·</span>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-semibold text-sm text-white/80">ADK Trace Viewer</span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[11px] px-3 py-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-400 font-bold uppercase tracking-wider">
          <GitBranch className="w-3 h-3" /> Google ADK · A2A Protocol
        </div>
      </header>

      <main className="max-w-[1200px] mx-auto px-6 md:px-12 py-10">
        {/* ── Page title ── */}
        <div className="mb-10">
          <h1 className="font-serif text-3xl md:text-4xl font-medium text-white mb-3">
            Agent Execution Trace
          </h1>
          <p className="text-white/40 text-sm max-w-2xl leading-relaxed">
            Real-time trace of Pantheon&apos;s multi-agent pipeline powered by Google ADK.
            Watch the literal &ldquo;thoughts&rdquo; and parallel actions of each agent as they
            collaborate to analyze, enrich, and remediate a live malware sample.
          </p>
        </div>

        {/* ── Architecture callouts ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
          {[
            {
              icon: <GitBranch className="w-4 h-4" />,
              label: "ParallelAgent",
              desc: "Hades + Athena run concurrently. Ares fires 3 plan generators simultaneously.",
              accent: "text-violet-400",
              border: "border-violet-500/20",
              bg: "bg-violet-500/8",
            },
            {
              icon: <RefreshCw className="w-4 h-4" />,
              label: "LoopAgent",
              desc: "poll_report() iterates on sandbox job status until analysis completes.",
              accent: "text-amber-400",
              border: "border-amber-500/20",
              bg: "bg-amber-500/8",
            },
            {
              icon: <ArrowRight className="w-4 h-4" />,
              label: "A2A Protocol",
              desc: "Zeus → Hades → Apollo → Ares. Each handoff passes full context via agent transfer.",
              accent: "text-emerald-400",
              border: "border-emerald-500/20",
              bg: "bg-emerald-500/8",
            },
          ].map(({ icon, label, desc, accent, border, bg }) => (
            <div
              key={label}
              className={`rounded-xl border ${border} ${bg} px-5 py-4 flex gap-3`}
            >
              <div className={`mt-0.5 shrink-0 ${accent}`}>{icon}</div>
              <div>
                <p className={`text-sm font-bold ${accent} mb-1`}>{label}</p>
                <p className="text-white/35 text-xs leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Trace viewer ── */}
        <TraceViewer />

        {/* ── Legend ── */}
        <div className="mt-8 flex flex-wrap gap-6 text-[11px] text-white/25">
          {[
            { color: "bg-amber-400",   label: "Zeus — Orchestrator"     },
            { color: "bg-rose-400",    label: "Hades — Dynamic Analysis" },
            { color: "bg-sky-400",     label: "Athena — Static Analysis" },
            { color: "bg-emerald-400", label: "Apollo — IOC Enrichment"  },
            { color: "bg-orange-400",  label: "Ares — Containment"       },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${color}`} />
              {label}
            </div>
          ))}
          <div className="flex items-center gap-2 ml-auto">
            <Zap className="w-3 h-3" />
            Click any tool call to expand inputs &amp; outputs
          </div>
        </div>
      </main>
    </div>
  );
}
