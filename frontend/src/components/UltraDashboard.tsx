'use client';

import { useEffect, useState, useRef } from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle,
  Clock,
  AlertTriangle,
  Network,
  Zap,
  TrendingUp,
} from 'lucide-react';
import { getEventStore, EventStore, AgentStatus } from '@/lib/event-store';
import { initWS, PantheonWebSocket } from '@/lib/pantheon-ws';
import AgentGraph from './AgentGraph';
import EventFeed from './EventFeed';
import AttackChain from './AttackChain';
import IOCTracker from './IOCTracker';

const SANDBOX_URL = process.env.NEXT_PUBLIC_SANDBOX_URL || 'http://localhost:9000';

export default function PantheonDashboard() {
  const [store, setStore] = useState<EventStore | null>(null);
  const [ws, setWs] = useState<PantheonWebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [stats, setStats] = useState({
    total_events: 0,
    agents_active: 0,
    agents_complete: 0,
    agents_idle: 0,
    total_iocs: 0,
    critical_iocs: 0,
    stages_discovered: 0,
  });
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const eventStore = getEventStore();
    setStore(eventStore);

    // Subscribe to store changes
    const unsubscribe = eventStore.subscribe(() => {
      setAgents([...eventStore.getAgents()]);
      setStats(eventStore.getStatistics());
    });
    unsubscribeRef.current = unsubscribe;

    // Initialize WebSocket connection
    const client = initWS(SANDBOX_URL, eventStore);
    setWs(client);

    client
      .connect()
      .then(() => {
        setConnected(true);
        console.log('Dashboard connected to Pantheon');
      })
      .catch((error) => {
        console.error('Failed to connect to Pantheon:', error);
        setConnected(false);
      });

    return () => {
      unsubscribe();
      client.close();
    };
  }, []);

  if (!store) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <div className="text-center">
          <Activity className="w-12 h-12 text-blue-400 animate-spin mx-auto mb-4" />
          <p className="text-gray-300">Initializing Pantheon Dashboard...</p>
        </div>
      </div>
    );
  }

  const statusColor = connected ? 'text-green-400' : 'text-red-400';
  const statusBg = connected ? 'bg-green-50 dark:bg-green-900' : 'bg-red-50 dark:bg-red-900';

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <header className="border-b border-gray-800 sticky top-0 z-50 bg-gray-900/95 backdrop-blur">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Zap className="w-8 h-8 text-amber-500" />
              <h1 className="text-2xl font-bold">Pantheon</h1>
              <span className="text-sm text-gray-400">Malware Analysis Swarm</span>
            </div>

            {/* Connection Status */}
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${statusBg}`}>
              {connected ? (
                <>
                  <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                  <span className={`text-sm ${statusColor}`}>Connected</span>
                </>
              ) : (
                <>
                  <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                  <span className={`text-sm ${statusColor}`}>Disconnected</span>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 space-y-8">
        {/* Quick Stats */}
        <section>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-400" />
            System Overview
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              label="Active Agents"
              value={stats.agents_active}
              icon={<Activity className="w-5 h-5" />}
              color="blue"
            />
            <StatCard
              label="Completed"
              value={stats.agents_complete}
              icon={<CheckCircle className="w-5 h-5" />}
              color="green"
            />
            <StatCard
              label="Events"
              value={stats.total_events}
              icon={<Clock className="w-5 h-5" />}
              color="purple"
            />
            <StatCard
              label="IOCs"
              value={stats.total_iocs}
              icon={<AlertTriangle className="w-5 h-5" />}
              color={stats.critical_iocs > 0 ? 'red' : 'yellow'}
            />
          </div>
        </section>

        {/* Agent Status Grid */}
        <section>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-500" />
            Agent Status
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {agents.map((agent) => (
              <AgentCard key={agent.name} agent={agent} />
            ))}
          </div>
        </section>

        {/* Three-Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left: Agent Graph */}
          <div className="lg:col-span-1">
            <AgentGraph store={store} />
          </div>

          {/* Middle: Attack Chain & IOCs */}
          <div className="lg:col-span-1 space-y-8">
            <AttackChain store={store} />
            <IOCTracker store={store} />
          </div>

          {/* Right: Event Feed */}
          <div className="lg:col-span-1">
            <EventFeed store={store} />
          </div>
        </div>
      </main>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: 'blue' | 'green' | 'purple' | 'red' | 'yellow';
}

function StatCard({ label, value, icon, color }: StatCardProps) {
  const colorClasses = {
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    green: 'bg-green-500/10 text-green-400 border-green-500/30',
    purple: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
    red: 'bg-red-500/10 text-red-400 border-red-500/30',
    yellow: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  };

  return (
    <div className={`border rounded-lg p-4 ${colorClasses[color]}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-400">{label}</p>
          <p className="text-3xl font-bold">{value}</p>
        </div>
        <div className="opacity-50">{icon}</div>
      </div>
    </div>
  );
}

interface AgentCardProps {
  agent: AgentStatus;
}

function AgentCard({ agent }: AgentCardProps) {
  const agentColors = {
    zeus: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' },
    athena: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' },
    hades: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30' },
    apollo: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/30' },
    ares: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30' },
    hermes: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/30' },
    artemis: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30' },
    hephaestus: { bg: 'bg-indigo-500/10', text: 'text-indigo-400', border: 'border-indigo-500/30' },
  };

  const colors = agentColors[agent.name] || agentColors.zeus;
  const stateIcon =
    agent.state === 'active' ? (
      <Activity className="w-4 h-4 animate-pulse" />
    ) : agent.state === 'complete' ? (
      <CheckCircle className="w-4 h-4" />
    ) : agent.state === 'error' ? (
      <AlertCircle className="w-4 h-4" />
    ) : (
      <Clock className="w-4 h-4 opacity-50" />
    );

  return (
    <div className={`border rounded-lg p-3 ${colors.bg} ${colors.border}`}>
      <div className="flex items-start justify-between mb-2">
        <h3 className={`font-semibold capitalize ${colors.text}`}>{agent.name}</h3>
        <div className={colors.text}>{stateIcon}</div>
      </div>
      <p className="text-xs text-gray-400 capitalize">{agent.state}</p>
      {agent.current_task && (
        <p className="text-xs text-gray-300 mt-1 truncate">{agent.current_task}</p>
      )}
      <p className="text-xs text-gray-500 mt-2">{agent.event_count} events</p>
    </div>
  );
}
