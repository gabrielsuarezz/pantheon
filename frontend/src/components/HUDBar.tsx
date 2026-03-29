'use client';

import React from 'react';
import { List, Radio, Activity, Shield, Users } from 'lucide-react';
import { type Statistics, type JobState } from '@/lib/event-store';

const PIPELINE_STAGES = ['Triage', 'Analysis', 'Enrichment', 'Response'];

function statusToStageIndex(status: JobState['status'] | undefined): number {
  switch (status) {
    case 'routing':   return 0;
    case 'analyzing': return 1;
    case 'enriching': return 2;
    case 'planning':
    case 'complete':  return 3;
    default:          return -1;
  }
}

interface HUDBarProps {
  connected: boolean;
  stats: Statistics | null;
  job: JobState | null;
  onOpenEvents: () => void;
  onOpenIOCs: () => void;
}

export default function HUDBar({
  connected,
  stats,
  job,
  onOpenEvents,
  onOpenIOCs,
}: HUDBarProps) {
  const activeStage = statusToStageIndex(job?.status);

  return (
    <div className="h-12 shrink-0 glass-panel border-b border-gold/15 flex items-center justify-between px-6 z-10">
      {/* Left: job + pipeline */}
      <div className="flex items-center gap-6">
        <span className="text-[10px] font-bold uppercase tracking-widest text-gold-dark/60">
          {job?.sample_name ?? 'No active job'}
        </span>

        <div className="flex items-center gap-1.5">
          {PIPELINE_STAGES.map((label, i) => {
            const isDone   = i < activeStage;
            const isActive = i === activeStage;
            return (
              <div key={label} className="flex items-center gap-1.5">
                {i > 0 && (
                  <div className={`h-px w-4 transition-colors duration-500 ${isDone ? 'bg-gold' : 'bg-gold/15'}`} />
                )}
                <div className="flex items-center gap-1">
                  <div
                    className={`w-2 h-2 rounded-full transition-all duration-500 ${
                      isActive ? 'bg-gold scale-125' : isDone ? 'bg-gold/70' : 'bg-gold/15'
                    }`}
                    style={isActive ? { boxShadow: '0 0 6px rgba(201,162,39,0.8)' } : undefined}
                  />
                  <span
                    className={`text-[9px] font-bold uppercase tracking-widest transition-colors duration-500 ${
                      isActive ? 'text-gold-dark' : isDone ? 'text-gold-dark/50' : 'text-gold-dark/25'
                    }`}
                  >
                    {label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right: stats + triggers */}
      <div className="flex items-center gap-4">
        {/* Stat counters */}
        <div className="flex items-center gap-5">
          <StatCounter icon={<Users size={11} />} label="Active" value={stats?.agents_active ?? 0} accent />
          <StatCounter icon={<Activity size={11} />} label="Events" value={stats?.total_events ?? 0} />
          <StatCounter icon={<Shield size={11} />} label="Critical IOCs" value={stats?.critical_iocs ?? 0} danger={!!stats?.critical_iocs} />
        </div>

        {/* Divider */}
        <div className="w-px h-5 bg-gold/15" />

        {/* Drawer triggers */}
        <div className="flex items-center gap-1">
          <HUDButton icon={<Radio size={13} />} label="Events" onClick={onOpenEvents} />
          <HUDButton icon={<List size={13} />} label="IOCs" onClick={onOpenIOCs} />
        </div>

        {/* WS status */}
        <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${
          connected ? 'bg-green-50 text-green-600 border-green-200' : 'bg-red-50 text-red-500 border-red-200'
        }`}>
          <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-red-400'}`} />
          {connected ? 'Live' : 'Offline'}
        </div>
      </div>
    </div>
  );
}

function StatCounter({
  icon,
  label,
  value,
  accent = false,
  danger = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={danger ? 'text-rose' : accent ? 'text-gold-dark' : 'text-gold-dark/40'}>
        {icon}
      </span>
      <span className={`text-base font-serif font-bold ${danger ? 'text-rose' : 'text-ink'}`}>
        {value}
      </span>
      <span className="text-[9px] font-bold uppercase tracking-widest text-gold-dark/30">{label}</span>
    </div>
  );
}

function HUDButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gold/10 transition-colors text-gold-dark/50 hover:text-gold-dark active:scale-95"
    >
      {icon}
    </button>
  );
}
