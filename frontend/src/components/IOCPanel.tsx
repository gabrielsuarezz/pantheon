'use client';

import { useEffect, useState } from 'react';
import { type EventStore, type IOCEntry } from '@/lib/event-store';
import { AlertTriangle, AlertCircle, Info } from 'lucide-react';

const severityConfig = {
  critical: { label: 'Critical', icon: AlertTriangle, color: 'text-red-400 bg-red-500/10 border-red-800/30' },
  high: { label: 'High', icon: AlertCircle, color: 'text-orange-400 bg-orange-500/10 border-orange-800/30' },
  medium: { label: 'Medium', icon: AlertCircle, color: 'text-yellow-400 bg-yellow-500/10 border-yellow-800/30' },
  low: { label: 'Low', icon: Info, color: 'text-blue-400 bg-blue-500/10 border-blue-800/30' },
};

export default function IOCPanel({ store }: { store: EventStore }) {
  const [iocs, setIocs] = useState<IOCEntry[]>([]);
  const [filter, setFilter] = useState<'all' | 'critical' | 'high' | 'medium' | 'low'>('all');

  useEffect(() => {
    const unsubscribe = store.subscribe(() => {
      if (filter === 'all') {
        setIocs(store.getIOCs());
      } else {
        setIocs(store.getIOCsBySeverity(filter));
      }
    });
    return unsubscribe;
  }, [store, filter]);

  const stats = {
    total: store.getIOCs().length,
    critical: store.getIOCsBySeverity('critical').length,
    high: store.getIOCsBySeverity('high').length,
    medium: store.getIOCsBySeverity('medium').length,
    low: store.getIOCsBySeverity('low').length,
  };

  return (
    <div className="border border-slate-800 rounded-lg p-4 bg-slate-900/30 space-y-4">
      <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
        Indicators of Compromise
      </h3>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="border border-slate-800/50 rounded p-2 bg-slate-900/20">
          <p className="text-slate-500">Total</p>
          <p className="text-lg font-light mt-1">{stats.total}</p>
        </div>
        <div className="border border-red-800/30 rounded p-2 bg-red-500/5">
          <p className="text-red-400">Critical</p>
          <p className="text-lg font-light mt-1">{stats.critical}</p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 flex-wrap">
        {(['all', 'critical', 'high', 'medium', 'low'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
              filter === f
                ? 'bg-teal-500/20 text-teal-300 border border-teal-500/50'
                : 'bg-slate-800/30 text-slate-400 border border-slate-800/50 hover:bg-slate-800/50'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* IOC List */}
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {iocs.length === 0 ? (
          <p className="text-xs text-slate-500">No IOCs found</p>
        ) : (
          iocs.map((ioc, idx) => {
            const config = severityConfig[ioc.severity as keyof typeof severityConfig];
            const Icon = config.icon;

            return (
              <div key={`${ioc.value}-${idx}`} className={`border rounded p-2 ${config.color}`}>
                <div className="flex items-start gap-2">
                  <Icon className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <code className="text-xs font-mono break-all text-slate-200">
                      {ioc.value}
                    </code>
                    {ioc.context && (
                      <p className="text-xs text-slate-400 mt-1">{ioc.context}</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
