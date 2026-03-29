'use client';

import { useEffect, useState } from 'react';
import { type EventStore, type AgentStatus } from '@/lib/event-store';
import { 
  Zap, Eye, Siren, FileJson, Sun, Shield, 
  CheckCircle2, Clock, AlertCircle, Minus 
} from 'lucide-react';

const agentMetadata = {
  zeus: { label: 'Zeus', role: 'Orchestrator', icon: Zap, color: 'teal' },
  athena: { label: 'Athena', role: 'Triage', icon: Eye, color: 'blue' },
  hades: { label: 'Hades', role: 'Analysis', icon: Siren, color: 'slate' },
  apollo: { label: 'Apollo', role: 'Enrichment', icon: Sun, color: 'amber' },
  ares: { label: 'Ares', role: 'Remediation', icon: Shield, color: 'rose' },
};

export default function AgentGrid({ store }: { store: EventStore }) {
  const [agents, setAgents] = useState<AgentStatus[]>([]);

  useEffect(() => {
    const unsubscribe = store.subscribe(() => {
      setAgents(store.getAgents());
    });
    return unsubscribe;
  }, [store]);

  return (
    <div className="border border-slate-800 rounded-lg p-6 bg-slate-900/30">
      <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-4">
        Parallel Agent Execution
      </h3>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {agents.map((agent) => {
          const meta = agentMetadata[agent.name as keyof typeof agentMetadata];
          if (!meta) return null;

          const Icon = meta.icon;
          const stateConfig = getAgentStateIcon(agent.state);

          return (
            <div
              key={agent.name}
              className={`border rounded-lg p-4 transition-all ${getAgentBg(agent.state)}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4 text-slate-400" />
                  <div>
                    <p className="font-medium text-sm">{meta.label}</p>
                    <p className="text-xs text-slate-500">{meta.role}</p>
                  </div>
                </div>
                <div className="text-slate-400">
                  {stateConfig.icon}
                </div>
              </div>

              {agent.current_task && (
                <div className="border-t border-slate-700 pt-3 mt-3">
                  <p className="text-xs text-slate-500 mb-1">Current Task</p>
                  <p className="text-xs text-slate-300 font-mono break-words">
                    {agent.current_task}
                  </p>
                </div>
              )}

              {agent.event_count > 0 && (
                <div className="text-xs text-slate-500 mt-3 pt-3 border-t border-slate-700">
                  {agent.event_count} events
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 text-xs text-slate-500">
        <p>
          Agents execute in parallel based on job requirements. Events streamed in real-time as each agent
          completes its analysis.
        </p>
      </div>
    </div>
  );
}

function getAgentBg(state: string): string {
  switch (state) {
    case 'active':
      return 'border-teal-800/30 bg-teal-500/5 hover:bg-teal-500/10';
    case 'complete':
      return 'border-emerald-800/30 bg-emerald-500/5';
    case 'error':
      return 'border-red-800/30 bg-red-500/5';
    default:
      return 'border-slate-800/30 bg-slate-800/10';
  }
}

function getAgentStateIcon(state: string) {
  switch (state) {
    case 'active':
      return { icon: <Clock className="w-4 h-4 text-teal-400" /> };
    case 'complete':
      return { icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" /> };
    case 'error':
      return { icon: <AlertCircle className="w-4 h-4 text-red-400" /> };
    default:
      return { icon: <Minus className="w-4 h-4 text-slate-500" /> };
  }
}
