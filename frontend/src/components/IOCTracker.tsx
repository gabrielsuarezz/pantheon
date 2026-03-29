'use client';

import { useEffect, useState } from 'react';
import { EventStore, IOCEntry } from '@/lib/event-store';
import { AlertTriangle, AlertCircle } from 'lucide-react';

interface IOCTrackerProps {
  store: EventStore;
}

const IOC_TYPE_ICONS: Record<string, string> = {
  ip: '🌐',
  domain: '🌍',
  file_hash: '#️⃣',
  file_path: '📁',
  registry_key: '🔑',
  url: '🔗',
};

const SEVERITY_COLORS: Record<string, { border: string; bg: string; badge: string }> = {
  critical: { border: 'border-red-500/50', bg: 'bg-red-500/10', badge: 'bg-red-500/20 text-red-300' },
  high: { border: 'border-orange-500/50', bg: 'bg-orange-500/10', badge: 'bg-orange-500/20 text-orange-300' },
  medium: { border: 'border-yellow-500/50', bg: 'bg-yellow-500/10', badge: 'bg-yellow-500/20 text-yellow-300' },
  low: { border: 'border-blue-500/50', bg: 'bg-blue-500/10', badge: 'bg-blue-500/20 text-blue-300' },
};

export default function IOCTracker({ store }: IOCTrackerProps) {
  const [iocs, setIOCs] = useState<IOCEntry[]>([]);
  const [selectedSeverity, setSelectedSeverity] = useState<string | null>(null);

  useEffect(() => {
    setIOCs(store.getIOCs());

    const unsubscribe = store.subscribe(() => {
      setIOCs(store.getIOCs());
    });

    return unsubscribe;
  }, [store]);

  const filtered = selectedSeverity ? iocs.filter((i) => i.severity === selectedSeverity) : iocs;

  const severityCounts = {
    critical: iocs.filter((i) => i.severity === 'critical').length,
    high: iocs.filter((i) => i.severity === 'high').length,
    medium: iocs.filter((i) => i.severity === 'medium').length,
    low: iocs.filter((i) => i.severity === 'low').length,
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
      <h3 className="text-lg font-bold mb-4 text-white">Indicators of Compromise</h3>

      {/* Severity Filter */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
        <button
          onClick={() => setSelectedSeverity(null)}
          className={`px-3 py-1 rounded text-sm whitespace-nowrap transition-colors ${
            selectedSeverity === null ? 'bg-blue-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          All ({iocs.length})
        </button>
        {(['critical', 'high', 'medium', 'low'] as const).map((severity) => (
          <button
            key={severity}
            onClick={() => setSelectedSeverity(severity)}
            className={`px-3 py-1 rounded text-sm whitespace-nowrap transition-colors capitalize ${
              selectedSeverity === severity
                ? SEVERITY_COLORS[severity].badge
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            {severity} ({severityCounts[severity]})
          </button>
        ))}
      </div>

      {/* IOC List */}
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="text-center py-6 text-gray-500 text-sm">
            {selectedSeverity ? 'No IOCs with this severity' : 'No IOCs discovered yet'}
          </div>
        ) : (
          filtered.map((ioc, idx) => {
            const colors = SEVERITY_COLORS[ioc.severity];
            const icon = IOC_TYPE_ICONS[ioc.type] || '•';

            return (
              <div key={`${ioc.value}-${idx}`} className={`border rounded p-3 ${colors.border} ${colors.bg}`}>
                {/* Header */}
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-lg">{icon}</span>
                    <div className="min-w-0">
                      <p className="font-mono text-xs break-all text-gray-100">{ioc.value}</p>
                      <p className="text-xs text-gray-400 capitalize mt-0.5">{ioc.type.replace(/_/g, ' ')}</p>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold whitespace-nowrap ${colors.badge}`}>
                    {ioc.severity.toUpperCase()}
                  </span>
                </div>

                {/* Context and Source */}
                <div className="text-xs text-gray-400 mt-2">
                  <p>Source: {ioc.source}</p>
                  {ioc.context && <p className="mt-1">Context: {ioc.context}</p>}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Summary */}
      {iocs.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-800">
          <div className="grid grid-cols-4 gap-2 text-center text-xs">
            <div>
              <p className="text-red-400 font-bold">{severityCounts.critical}</p>
              <p className="text-gray-500">Critical</p>
            </div>
            <div>
              <p className="text-orange-400 font-bold">{severityCounts.high}</p>
              <p className="text-gray-500">High</p>
            </div>
            <div>
              <p className="text-yellow-400 font-bold">{severityCounts.medium}</p>
              <p className="text-gray-500">Medium</p>
            </div>
            <div>
              <p className="text-blue-400 font-bold">{severityCounts.low}</p>
              <p className="text-gray-500">Low</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
