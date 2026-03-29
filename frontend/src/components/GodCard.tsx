"use client";

import { CheckCircle2, Zap, ScanLine, FlaskConical, Globe, ShieldAlert, Radio, type LucideIcon } from "lucide-react";

// ─── Types (shared with PantheonDashboard) ─────────────────────────────────────

export type Badge = "OBSERVE" | "REASON" | "ACT" | "A2A";
export type AgentId = "zeus" | "athena" | "hermes" | "hades" | "apollo" | "ares";

export interface AgentDef {
  id: AgentId;
  name: string;
  role: string;
  color: string;   // hex
}

const AGENT_ICONS: Record<AgentId, LucideIcon> = {
  zeus:   Zap,
  athena: ScanLine,
  hades:  FlaskConical,
  apollo: Globe,
  ares:   ShieldAlert,
  hermes: Radio,
};

export interface ThoughtEntry {
  id: string;
  agentId: AgentId;
  badge: Badge;
  text: string;
  timestamp: number;
}

// ─── Badge Styles ──────────────────────────────────────────────────────────────

export const BADGE_STYLES: Record<Badge, { bg: string; text: string; border: string }> = {
  OBSERVE: { bg: "rgba(59,130,246,0.15)",  text: "#93c5fd", border: "rgba(59,130,246,0.30)"  },
  REASON:  { bg: "rgba(139,92,246,0.15)",  text: "#c4b5fd", border: "rgba(139,92,246,0.30)"  },
  ACT:     { bg: "rgba(245,158,11,0.15)",  text: "#fcd34d", border: "rgba(245,158,11,0.30)"  },
  A2A:     { bg: "rgba(250,204,21,0.12)",  text: "#fde047", border: "rgba(250,204,21,0.35)"  },
};

// ─── GodCard ───────────────────────────────────────────────────────────────────

interface GodCardProps {
  agent: AgentDef;
  isWorking: boolean;
  isComplete: boolean;
  latestThought: ThoughtEntry | null;
  progress: number; // 0–100
}

export default function GodCard({
  agent,
  isWorking,
  isComplete,
  latestThought,
  progress,
}: GodCardProps) {
  const badge = latestThought ? BADGE_STYLES[latestThought.badge] : null;
  const AgentIcon = AGENT_ICONS[agent.id];

  return (
    <div
      className="relative rounded-xl overflow-hidden transition-all duration-500 select-none"
      style={{
        border: `1px solid ${isWorking ? agent.color + "70" : "rgba(201,162,39,0.20)"}`,
        backgroundColor: isWorking ? agent.color + "0d" : "#FFFFFF",
        boxShadow: isWorking
          ? `0 0 20px ${agent.color}30, 0 4px 16px ${agent.color}15, inset 0 1px 0 ${agent.color}18`
          : "0 1px 6px rgba(201,162,39,0.08)",
        transform: isWorking ? "scale(1.04)" : "scale(1)",
      }}
    >
      {/* Animated top-edge beam when working */}
      {isWorking && (
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{
            background: `linear-gradient(90deg, transparent 0%, ${agent.color} 50%, transparent 100%)`,
            animation: "beam-scan 2.4s ease-in-out infinite",
          }}
        />
      )}

      <div className="p-3.5">
        {/* Row 1: Icon + name + status */}
        <div className="flex items-start justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2.5">
            {/* Agent icon */}
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-all duration-300"
              style={{
                background: isWorking
                  ? `radial-gradient(circle, ${agent.color}30 0%, ${agent.color}08 100%)`
                  : "rgba(201,162,39,0.08)",
                border: `1px solid ${isWorking ? agent.color + "50" : "rgba(201,162,39,0.15)"}`,
                filter: isWorking ? `drop-shadow(0 0 6px ${agent.color}80)` : "none",
              }}
            >
              <AgentIcon size={18} color={isWorking ? agent.color : "#9A7A10"} />
            </div>

            <div>
              <p
                className="font-bold text-sm leading-tight transition-colors duration-300"
                style={{ color: isWorking ? agent.color : "#1a1208" }}
              >
                {agent.name}
              </p>
              <p className="text-[9px] uppercase tracking-widest mt-0.5" style={{ color: "rgba(26,18,8,0.30)" }}>
                {agent.role}
              </p>
            </div>
          </div>

          {/* Status chip */}
          <div className="shrink-0 mt-0.5">
            {isWorking && (
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full"
                style={{ background: agent.color + "18", border: `1px solid ${agent.color}40` }}>
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: agent.color, animation: "status-pulse 1s ease-in-out infinite" }}
                />
                <span className="text-[9px] font-bold uppercase tracking-widest"
                  style={{ color: agent.color }}>
                  Active
                </span>
              </div>
            )}
            {isComplete && !isWorking && (
              <CheckCircle2 className="w-4 h-4" style={{ color: "rgba(52,211,153,0.6)" }} />
            )}
            {!isWorking && !isComplete && (
              <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "rgba(26,18,8,0.22)" }}>Idle</span>
            )}
          </div>
        </div>

        {/* Thought preview */}
        <div className="min-h-[28px]">
          {latestThought && badge ? (
            <div className="flex items-start gap-1.5">
              <span
                className="text-[8px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider shrink-0 mt-0.5"
                style={{ background: badge.bg, color: badge.text, border: `1px solid ${badge.border}` }}
              >
                {latestThought.badge}
              </span>
              <p className="text-[10px] leading-snug line-clamp-2" style={{ color: "rgba(26,18,8,0.50)" }}>
                {latestThought.text}
              </p>
            </div>
          ) : (
            <p className="text-[10px] italic" style={{ color: "rgba(26,18,8,0.22)" }}>
              {isWorking ? "Processing..." : "Awaiting dispatch"}
            </p>
          )}
        </div>

        {/* Progress track */}
        <div
          className="mt-2.5 h-px rounded-full overflow-hidden"
          style={{ background: "rgba(201,162,39,0.12)" }}
        >
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${isWorking || isComplete ? progress : 0}%`,
              background: `linear-gradient(90deg, ${agent.color}70, ${agent.color})`,
            }}
          />
        </div>
      </div>

      {/* Keyframe definitions */}
      <style>{`
        @keyframes beam-scan {
          0%, 100% { opacity: 0.4; transform: scaleX(0.4); }
          50% { opacity: 1; transform: scaleX(1); }
        }
        @keyframes status-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.7); }
        }
      `}</style>
    </div>
  );
}
