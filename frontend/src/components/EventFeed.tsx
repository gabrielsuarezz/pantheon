'use client';

import { useEffect, useState } from 'react';
import { EventStore, PantheonEvent } from '@/lib/event-store';
import { Clock, AlertTriangle, CheckCircle, Info } from 'lucide-react';

interface EventFeedProps {
  store: EventStore;
}

export default function EventFeed({ store }: EventFeedProps) {
  const [events, setEvents] = useState<PantheonEvent[]>([]);

  useEffect(() => {
    // Initial load
    setEvents(store.getRecentEvents(30));

    // Subscribe to changes
    const unsubscribe = store.subscribe(() => {
      setEvents(store.getRecentEvents(30));
    });

    return unsubscribe;
  }, [store]);

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'AGENT_ACTIVATED':
        return '🚀';
      case 'AGENT_COMPLETED':
        return '✅';
      case 'TOOL_CALLED':
        return '🔧';
      case 'TOOL_RESULT':
        return '📊';
      case 'STAGE_UNLOCKED':
        return '🔓';
      case 'IOC_DISCOVERED':
        return '⚠️';
      case 'PROCESS_EVENT':
        return '📱';
      case 'NETWORK_EVENT':
        return '🌐';
      case 'HANDOFF':
        return '🔄';
      case 'ERROR':
        return '❌';
      default:
        return '•';
    }
  };

  const getEventColor = (type: string) => {
    switch (type) {
      case 'AGENT_ACTIVATED':
      case 'AGENT_COMPLETED':
        return 'text-green-400';
      case 'TOOL_CALLED':
      case 'TOOL_RESULT':
        return 'text-blue-400';
      case 'STAGE_UNLOCKED':
      case 'HANDOFF':
        return 'text-purple-400';
      case 'IOC_DISCOVERED':
        return 'text-red-400';
      case 'PROCESS_EVENT':
      case 'NETWORK_EVENT':
        return 'text-orange-400';
      case 'ERROR':
        return 'text-red-500';
      default:
        return 'text-gray-400';
    }
  };

  const formatTimestamp = (iso: string) => {
    const date = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    if (diff < 1000) return 'now';
    if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    return date.toLocaleTimeString();
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 h-full">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-white">Event Feed</h3>
        <span className="text-xs text-gray-400">{events.length} events</span>
      </div>

      <div className="space-y-3 max-h-96 overflow-y-auto">
        {events.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Info className="w-4 h-4 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Waiting for events...</p>
          </div>
        ) : (
          events
            .slice()
            .reverse()
            .map((event, idx) => (
              <div
                key={`${event.timestamp}-${idx}`}
                className="border border-gray-800 rounded p-3 hover:border-gray-700 transition-colors bg-gray-950"
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-lg">{getEventIcon(event.type)}</span>
                    <div className="min-w-0">
                      <p className={`font-mono text-xs font-bold ${getEventColor(event.type)}`}>
                        {event.type}
                      </p>
                      {event.agent && (
                        <p className="text-xs text-gray-400 capitalize">{event.agent}</p>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-gray-500 whitespace-nowrap">
                    {formatTimestamp(event.timestamp)}
                  </span>
                </div>

                {/* Payload */}
                {Object.keys(event.payload).length > 0 && (
                  <div className="bg-gray-800/50 rounded p-2 text-xs text-gray-300 font-mono overflow-auto max-h-20">
                    <pre className="overflow-x-auto whitespace-pre-wrap word-break break-all">
                      {JSON.stringify(event.payload, null, 2)}
                    </pre>
                  </div>
                )}

                {/* Job ID */}
                {event.job_id && (
                  <p className="text-xs text-gray-500 mt-2">
                    Job: <span className="text-gray-400 font-mono">{event.job_id}</span>
                  </p>
                )}
              </div>
            ))
        )}
      </div>
    </div>
  );
}
