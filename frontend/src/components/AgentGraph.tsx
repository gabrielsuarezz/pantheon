'use client';

import { EventStore } from '@/lib/event-store';

interface AgentGraphProps {
  store: EventStore;
}

const AGENT_NAMES = ['zeus', 'athena', 'hades', 'apollo', 'ares'] as const;

export default function AgentGraph({ store }: AgentGraphProps) {
  const agents = store.getAgents();
  const agentMap = Object.fromEntries(agents.map((a) => [a.name, a]));

  const agentColors: Record<string, { bg: string; border: string; text: string }> = {
    zeus: { bg: '#FCD34D', border: '#FBBF24', text: '#78350F' },
    athena: { bg: '#60A5FA', border: '#3B82F6', text: '#0F172A' },
    hades: { bg: '#F87171', border: '#DC2626', text: '#7F1D1D' },
    apollo: { bg: '#FB923C', border: '#F97316', text: '#7C2D12' },
    ares: { bg: '#A78BFA', border: '#8B5CF6', text: '#3F0F5C' },
  };

  const getStateIndicator = (state: string) => {
    switch (state) {
      case 'active':
        return '🔴';
      case 'complete':
        return '✅';
      case 'error':
        return '❌';
      default:
        return '⚪';
    }
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
      <h3 className="text-lg font-bold mb-6 text-white">Agent Pipeline</h3>

      {/* SVG Graph */}
      <svg viewBox="0 0 300 600" className="w-full mb-4">
        <defs>
          <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
            <polygon points="0 0, 10 3, 0 6" fill="#4B5563" />
          </marker>
        </defs>

        {/* Vertical flow lines */}
        <line x1="150" y1="60" x2="150" y2="120" stroke="#4B5563" strokeWidth="2" markerEnd="url(#arrowhead)" />
        <line x1="150" y1="180" x2="150" y2="240" stroke="#4B5563" strokeWidth="2" markerEnd="url(#arrowhead)" />
        <line x1="150" y1="300" x2="150" y2="360" stroke="#4B5563" strokeWidth="2" markerEnd="url(#arrowhead)" />
        <line x1="150" y1="420" x2="150" y2="480" stroke="#4B5563" strokeWidth="2" markerEnd="url(#arrowhead)" />

        {/* Agent nodes */}
        {[
          { name: 'zeus', y: 30, role: '⚡ Orchestrator' },
          { name: 'athena', y: 150, role: '🦉 Triage' },
          { name: 'hades', y: 270, role: '💀 Analysis' },
          { name: 'apollo', y: 390, role: '☀️ Enrichment' },
          { name: 'ares', y: 510, role: '⚔️ Response' },
        ].map((agent) => {
          const color = agentColors[agent.name as keyof typeof agentColors];
          const status = agentMap[agent.name as keyof typeof agentMap];
          const indicator = getStateIndicator(status?.state || 'idle');

          return (
            <g key={agent.name}>
              {/* Circle */}
              <circle cx="150" cy={agent.y} r="25" fill={color?.bg} stroke={color?.border} strokeWidth="2" />

              {/* State indicator */}
              <text x="150" y={agent.y + 7} textAnchor="middle" fontSize="16" fontWeight="bold">
                {indicator}
              </text>

              {/* Label */}
              <text x="150" y={agent.y + 45} textAnchor="middle" fontSize="12" fontWeight="600" fill="#E5E7EB">
                {agent.name}
              </text>
              <text x="150" y={agent.y + 60} textAnchor="middle" fontSize="10" fill="#9CA3AF">
                {agent.role}
              </text>

              {/* Event count */}
              {status && status.event_count > 0 && (
                <text x="150" y={agent.y + 75} textAnchor="middle" fontSize="9" fill="#6B7280">
                  {status.event_count} events
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="grid grid-cols-2 gap-2 text-xs mt-4 pt-4 border-t border-gray-800">
        <div className="flex items-center gap-2">
          <span>🔴</span>
          <span className="text-gray-400">Active</span>
        </div>
        <div className="flex items-center gap-2">
          <span>✅</span>
          <span className="text-gray-400">Complete</span>
        </div>
        <div className="flex items-center gap-2">
          <span>❌</span>
          <span className="text-gray-400">Error</span>
        </div>
        <div className="flex items-center gap-2">
          <span>⚪</span>
          <span className="text-gray-400">Idle</span>
        </div>
      </div>
    </div>
  );
}
