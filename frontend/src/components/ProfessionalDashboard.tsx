'use client';

import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Terminal,
} from 'lucide-react';
import { getEventStore, type Statistics, type AgentStatus } from '@/lib/event-store';
import { initWS } from '@/lib/pantheon-ws';

import OlympusFlow    from './OlympusFlow';
import AgentInspector from './AgentInspector';
import DivineChronicle from './DivineChronicle';
import IOCPanel       from './IOCPanel';
import HUDBar         from './HUDBar';
import SlidePanel     from './SlidePanel';

type Tab = 'dashboard' | 'telemetry';

const NAV: { tab: Tab; icon: React.ReactNode; label: string }[] = [
  { tab: 'dashboard', icon: <LayoutDashboard size={18} />, label: 'Dashboard'   },
  { tab: 'telemetry', icon: <Terminal size={18} />,        label: 'Telemetry'   },
];

export default function ProfessionalDashboard() {
  const [store]           = useState(() => getEventStore());
  const [connected, setConnected]         = useState(false);
  const [stats, setStats]                 = useState<Statistics | null>(null);
  const [activeTab, setActiveTab]         = useState<Tab>('dashboard');
  const [selectedAgent, setSelectedAgent] = useState<AgentStatus | null>(null);
  const [showInspector, setShowInspector] = useState(false);
  const [showEvents, setShowEvents]       = useState(false);
  const [showIOCs, setShowIOCs]           = useState(false);

  // WebSocket connection — runs once per store instance, never on agent selection.
  useEffect(() => {
    const sandboxUrl = process.env.NEXT_PUBLIC_SANDBOX_URL || 'http://localhost:9000';
    const ws = initWS(sandboxUrl, store);
    ws.connect()
      .then(() => setConnected(true))
      .catch(() => setConnected(false));
    return () => { ws.close(); };
  }, [store]);

  // Store subscription — re-subscribes when selectedAgent changes so the
  // closure always holds the latest value for the inspector auto-update.
  useEffect(() => {
    const unsubscribe = store.subscribe(() => {
      setStats(store.getStatistics());
      if (selectedAgent) {
        const updated = store.getAgents().find(a => a.name === selectedAgent.name);
        if (updated) setSelectedAgent(updated);
      }
    });
    return unsubscribe;
  }, [store, selectedAgent]);

  const handleSelectAgent = (agent: AgentStatus) => {
    setSelectedAgent(agent);
    setShowInspector(true);
  };

  return (
    <div className="flex h-screen w-full bg-marble overflow-hidden text-ink">

      {/* Collapsed icon-only sidebar */}
      <aside className="w-12 shrink-0 glass-panel border-r border-gold/10 flex flex-col items-center py-4 z-20 gap-1">
        <div className="mb-4 w-8 h-8 rounded-lg bg-sienna flex items-center justify-center shadow-gold shrink-0">
          <span className="text-white font-serif font-bold text-xs">P</span>
        </div>

        <nav className="flex flex-col items-center gap-1 flex-1">
          {NAV.map(({ tab, icon, label }) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              title={label}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-95
                ${activeTab === tab
                  ? 'bg-gold/15 text-gold-dark shadow-sm'
                  : 'text-gold-dark/30 hover:bg-gold/8 hover:text-gold-dark/60'}
              `}
            >
              {icon}
            </button>
          ))}
        </nav>

        <div
          title={connected ? 'Connected' : 'Disconnected'}
          className={`w-2 h-2 rounded-full mt-auto ${connected ? 'bg-green-500 animate-pulse' : 'bg-red-400'}`}
        />
      </aside>

      {/* Main area */}
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">

        <HUDBar
          connected={connected}
          stats={stats}
          job={store.getCurrentJob()}
          onOpenEvents={() => setShowEvents(true)}
          onOpenIOCs={() => setShowIOCs(true)}
        />

        {activeTab === 'dashboard' ? (
          <div className="flex-1 min-h-0 relative">
            <OlympusFlow store={store} onSelect={handleSelectAgent} />
          </div>
        ) : activeTab === 'telemetry' ? (
          <div className="flex-1 min-h-0 relative bg-white/20">
            <DivineChronicle store={store} />
          </div>
        ) : null}
      </main>

      {/* Slide-in panels */}
      <SlidePanel
        open={showInspector}
        onClose={() => setShowInspector(false)}
        title={selectedAgent ? `${selectedAgent.name} — Inspector` : 'Agent Inspector'}
        width="w-80"
      >
        <AgentInspector agent={selectedAgent} />
      </SlidePanel>

      <SlidePanel
        open={showEvents}
        onClose={() => setShowEvents(false)}
        title="Event Log"
        width="w-96"
      >
        <DivineChronicle store={store} />
      </SlidePanel>

      <SlidePanel
        open={showIOCs}
        onClose={() => setShowIOCs(false)}
        title="Indicators of Compromise"
        width="w-96"
      >
        <IOCPanel store={store} />
      </SlidePanel>
    </div>
  );
}
