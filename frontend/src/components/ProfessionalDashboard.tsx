'use client';

import React, { useEffect, useState } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  Network, 
  Terminal, 
  Settings, 
  HelpCircle,
  Shield,
  Zap,
  Activity
} from 'lucide-react';
import { getEventStore, EventStore, type Statistics, AgentStatus } from '@/lib/event-store';
import { initWS } from '@/lib/pantheon-ws';

import OlympusFlow from './OlympusFlow';
import DivineChronicle from './DivineChronicle';
import AgentInspector from './AgentInspector';
import TelemetryStream from './TelemetryStream';
import JobOverview from './JobOverview';
import IOCPanel from './IOCPanel';

export default function ProfessionalDashboard() {
  const [store] = useState(() => getEventStore());
  const [connected, setConnected] = useState(false);
  const [stats, setStats] = useState<Statistics | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'agents' | 'network' | 'telemetry'>('dashboard');
  const [selectedAgent, setSelectedAgent] = useState<AgentStatus | null>(null);

  useEffect(() => {
    const unsubscribe = store.subscribe(() => {
      setStats(store.getStatistics());
      
      // If an agent is selected, keep it updated
      if (selectedAgent) {
        const updated = store.getAgents().find(a => a.name === selectedAgent.name);
        if (updated) setSelectedAgent(updated);
      }
    });

    const sandboxUrl = process.env.NEXT_PUBLIC_SANDBOX_URL || 'http://localhost:9000';
    const ws = initWS(sandboxUrl, store);

    ws.connect()
      .then(() => setConnected(true))
      .catch(() => setConnected(false));

    return () => {
      unsubscribe();
      ws.close();
    };
  }, [store, selectedAgent]);

  return (
    <div className="flex h-screen w-full bg-marble overflow-hidden text-ink">
      {/* ─── Left Sidebar ─── */}
      <aside className="w-64 glass-panel border-r border-gold/10 flex flex-col z-20">
        <div className="p-8 pb-4">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-lg bg-sienna flex items-center justify-center shadow-gold">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <h1 className="font-serif text-xl font-bold tracking-tight italic">Pantheon</h1>
          </div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold-dark/50 pl-1">Agentic Intelligence</p>
        </div>

        <nav className="flex-1 px-4 py-8 space-y-2">
          <NavButton 
            active={activeTab === 'dashboard'} 
            onClick={() => setActiveTab('dashboard')}
            icon={<LayoutDashboard />} 
            label="Dashboard" 
          />
          <NavButton 
            active={activeTab === 'agents'} 
            onClick={() => setActiveTab('agents')}
            icon={<Users />} 
            label="Agent Swarm" 
          />
          <NavButton 
            active={activeTab === 'network'} 
            onClick={() => setActiveTab('network')}
            icon={<Network />} 
            label="Network Map" 
          />
          <NavButton 
            active={activeTab === 'telemetry'} 
            onClick={() => setActiveTab('telemetry')}
            icon={<Terminal />} 
            label="Telemetry Data" 
          />
        </nav>

        <div className="p-6 space-y-4 border-t border-gold/5 bg-gold/5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gold-dark/40">Status</span>
            <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider
              ${connected ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}
            `}>
              <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
              {connected ? 'Live' : 'Offline'}
            </div>
          </div>
          <div className="p-3 glass-panel rounded-xl text-[10px] font-mono text-gold-dark/50 border-gold/20 truncate">
            {connected ? 'ws://sandbox connected' : 'ws://sandbox disconnected'}
          </div>
        </div>
      </aside>

      {/* ─── Main View ─── */}
      <main className="flex-1 flex flex-col p-8 gap-8 overflow-hidden relative">
        {/* Subtle background texture */}
        <div className="absolute inset-0 linen-bg opacity-30 -z-10" />

        {/* Tab content */}
        {activeTab === 'dashboard' ? (
          <>
            <div className="flex-1 grid grid-cols-12 gap-8 min-h-0">
              {/* Left Col: Overview */}
              <div className="col-span-3 flex flex-col gap-8 overflow-y-auto pr-2 scrollbar-hide">
                <JobOverview store={store} />
                <div className="p-6 glass-panel rounded-2xl border-gold/20 space-y-6">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-gold-dark/60">Global Statistics</h3>
                  <div className="grid grid-cols-1 gap-4">
                    <MiniStat label="Active Agents" value={stats?.agents_active ?? 0} icon={<Users />} active />
                    <MiniStat label="Agents Complete" value={stats?.agents_complete ?? 0} icon={<Shield />} />
                    <MiniStat label="Total Events" value={stats?.total_events ?? 0} icon={<Activity />} />
                  </div>
                </div>
                <IOCPanel store={store} />
              </div>

              {/* Center Col: Graph */}
              <div className="col-span-6 flex flex-col gap-6">
                <OlympusFlow store={store} onSelect={setSelectedAgent} />
              </div>

              {/* Right Col: Inspector */}
              <div className="col-span-3">
                <AgentInspector agent={selectedAgent} />
              </div>
            </div>

            {/* Bottom Row: Feed */}
            <div className="h-64 shrink-0">
              <DivineChronicle store={store} />
            </div>
          </>
        ) : activeTab === 'telemetry' ? (
          <div className="flex-1">
            <TelemetryStream store={store} />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted/30 uppercase tracking-[0.5em] font-bold">
            Initializing {activeTab} Module...
          </div>
        )}
      </main>
    </div>
  );
}

function NavButton({ active, icon, label, onClick }: { active: boolean, icon: React.ReactNode, label: string, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all active:scale-95 border-l-4
        ${active ? 'bg-gold/10 text-gold-dark border-gold shadow-sm font-bold translate-x-1 outline-none' : 'hover:bg-gold/5 text-muted hover:text-gold-dark border-transparent'}
      `}
    >
      <span className={`transition-colors ${active ? 'text-gold-dark' : 'text-gold-dark/40'}`}>
        {React.cloneElement(icon as React.ReactElement, { size: 18 } as any)}
      </span>
      {label}
    </button>
  );
}

function MiniStat({ label, value, icon, active = false }: { label: string, value: number | string, icon: React.ReactNode, active?: boolean }) {
  return (
    <div className={`p-4 rounded-xl flex items-center justify-between border transition-all
      ${active ? 'bg-gold/5 border-gold/30 shadow-sm' : 'border-gold/5 bg-white/30'}
    `}>
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center
          ${active ? 'bg-gold/20 text-gold-dark' : 'bg-slate-100 text-slate-400'}
        `}>
          {React.cloneElement(icon as React.ReactElement, { size: 16 } as any)}
        </div>
        <span className="text-[10px] font-bold uppercase tracking-widest text-gold-dark/60">{label}</span>
      </div>
      <span className="text-xl font-serif font-bold text-ink">{value}</span>
    </div>
  );
}
