'use client';

import { useEffect, useState } from 'react';
import { type EventStore, type IOCEntry } from '@/lib/event-store';
import { AlertTriangle, AlertCircle, Info } from 'lucide-react';

const severityConfig = {
  critical: { label: 'Critical', icon: AlertTriangle, color: 'text-rose bg-rose/5 border-rose/20' },
  high: { label: 'High', icon: AlertCircle, color: 'text-amber-600 bg-amber-50 border-amber-200' },
  medium: { label: 'Medium', icon: AlertCircle, color: 'text-gold-dark bg-gold/5 border-gold/20' },
  low: { label: 'Low', icon: Info, color: 'text-blue-600 bg-blue-50 border-blue-200' },
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
    <div className="p-5 space-y-5">
      <h3 className="text-[10px] font-bold uppercase tracking-widest text-gold-dark/60">
        Indicators of Compromise
      </h3>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 text-[10px] font-bold uppercase tracking-wider">
        <div className="border border-gold/10 rounded-xl p-3 bg-white/30 shadow-sm">
          <p className="text-gold-dark/40 mb-1">Total</p>
          <p className="text-2xl font-serif text-ink">{stats.total}</p>
        </div>
        <div className="border border-rose/10 rounded-xl p-3 bg-rose/5 shadow-sm">
          <p className="text-rose mb-1">Critical</p>
          <p className="text-2xl font-serif text-rose">{stats.critical}</p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 flex-wrap">
        {(['all', 'critical', 'high', 'medium', 'low'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-2 py-1 rounded-lg text-[9px] font-bold uppercase tracking-tight transition-all active:scale-95 border
              ${filter === f
                ? 'bg-gold text-white border-gold shadow-sm'
                : 'bg-white/50 text-gold-dark/50 border-gold/10 hover:bg-gold/5'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* IOC List */}
      <div className="space-y-2 overflow-y-auto pr-2 scrollbar-hide">
        {iocs.length === 0 ? (
          <p className="text-xs text-gold-dark/40 italic">No indicators discovered yet</p>
        ) : (
          iocs.map((ioc, idx) => {
            const config = severityConfig[ioc.severity as keyof typeof severityConfig];
            const Icon = config.icon;

            return (
              <div key={`${ioc.value}-${idx}`} className={`border rounded-xl p-3 bg-white/60 shadow-sm ${config.color}`}>
                <div className="flex items-start gap-3">
                  <div className="p-1.5 rounded-lg bg-white shadow-sm">
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <code className="text-[11px] font-mono break-all text-ink font-semibold">
                      {ioc.value}
                    </code>
                    {ioc.context && (
                      <p className="text-[10px] text-gold-dark/60 mt-1 italic leading-relaxed">{ioc.context}</p>
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
