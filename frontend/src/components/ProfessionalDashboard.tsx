'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, Zap } from 'lucide-react';
import { getEventStore, EventStore, type Statistics } from '@/lib/event-store';
import { initWS } from '@/lib/pantheon-ws';
import JobOverview from './JobOverview';
import AgentGrid from './AgentGrid';
import ActivityStream from './ActivityStream';
import IOCPanel from './IOCPanel';

export default function ProfessionalDashboard() {
  const [store] = useState(() => getEventStore());
  const [connected, setConnected] = useState(false);
  const [stats, setStats] = useState<Statistics | null>(null);
  const [jobId, setJobId] = useState<string>('');

  useEffect(() => {
    const unsubscribe = store.subscribe(() => {
      setStats(store.getStatistics());
      const job = store.getCurrentJob();
      if (job) setJobId(job.job_id);
    });

    const sandboxUrl = process.env.NEXT_PUBLIC_SANDBOX_URL || 'http://localhost:9000';
    const ws = initWS(sandboxUrl, store);

    ws.connect()
      .then(() => {
        setConnected(true);
        console.log('✓ Connected to Pantheon EventBus');
      })
      .catch((err) => {
        console.error('WebSocket connection error:', err.message || err);
        setConnected(false);
        // User is notified via the UI connection indicator
      });

    return () => {
      unsubscribe();
      ws.close();
    };
  }, [store]);

  const status = {
    active: stats?.agents_active ?? 0,
    complete: stats?.agents_complete ?? 0,
    idle: stats?.agents_idle ?? 0,
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur">
        <div className="flex items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-2xl font-light tracking-tight">Pantheon Analysis</h1>
            <p className="text-xs text-slate-500 mt-1">
              {jobId ? `Job: ${jobId}` : connected ? 'Ready for analysis' : 'Waiting for Hephaestus...'}
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            {!connected && (
              <div className="text-xs text-slate-400 max-w-xs text-right">
                <p className="mb-1">Hephaestus not detected</p>
                <code className="text-xs bg-slate-800/50 px-2 py-1 rounded block">
                  {process.env.NEXT_PUBLIC_SANDBOX_URL || 'http://localhost:9000'}
                </code>
              </div>
            )}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-sm text-xs font-medium ${
              connected 
                ? 'bg-green-500/10 text-green-400' 
                : 'bg-amber-500/10 text-amber-400'
            }`}>
              <div className={`w-2 h-2 rounded-full ${
                connected ? 'bg-green-400' : 'bg-amber-400'
              }`} />
              {connected ? 'Connected' : 'Offline'}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-6 grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Sidebar: Job Overview + IOCs */}
        <div className="lg:col-span-1 space-y-6">
          <JobOverview store={store} />
          <IOCPanel store={store} />
        </div>

        {/* Center: Parallel Agents + Activity */}
        <div className="lg:col-span-3 space-y-6">
          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-4">
            <StatCard 
              label="Active" 
              value={status.active}
              icon={<Zap className="w-4 h-4" />}
              type="active"
            />
            <StatCard 
              label="Complete" 
              value={status.complete}
              icon={<CheckCircle2 className="w-4 h-4" />}
              type="complete"
            />
            <StatCard 
              label="Events" 
              value={stats?.total_events ?? 0}
              icon={<Clock className="w-4 h-4" />}
              type="neutral"
            />
          </div>

          {/* Parallel Agent Grid */}
          <AgentGrid store={store} />

          {/* Activity Stream */}
          <ActivityStream store={store} />
        </div>
      </main>
    </div>
  );
}

function StatCard({ 
  label, 
  value, 
  icon, 
  type 
}: { 
  label: string; 
  value: number; 
  icon: React.ReactNode;
  type: 'active' | 'complete' | 'neutral';
}) {
  const typeStyles = {
    active: 'border-teal-800/30 bg-teal-500/5',
    complete: 'border-emerald-800/30 bg-emerald-500/5',
    neutral: 'border-slate-800/50 bg-slate-800/20',
  };

  return (
    <div className={`border rounded-lg p-4 ${typeStyles[type]}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-400 uppercase tracking-wider">{label}</p>
          <p className="text-3xl font-light mt-1">{value}</p>
        </div>
        <div className="text-slate-500">
          {icon}
        </div>
      </div>
    </div>
  );
}
