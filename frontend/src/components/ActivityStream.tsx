'use client';

import { useEffect, useState } from 'react';
import { type EventStore, type PantheonEvent } from '@/lib/event-store';

const eventTypes = {
  AGENT_ACTIVATED: { icon: '▶', label: 'Agent Started', color: 'text-teal-400' },
  AGENT_COMPLETED: { icon: '✓', label: 'Agent Completed', color: 'text-emerald-400' },
  TOOL_CALLED: { icon: '⚙', label: 'Tool Invoked', color: 'text-slate-400' },
  TOOL_RESULT: { icon: '📊', label: 'Tool Result', color: 'text-slate-400' },
  STAGE_UNLOCKED: { icon: '🔓', label: 'Stage Unlocked', color: 'text-amber-400' },
  IOC_DISCOVERED: { icon: '⚠', label: 'IOC Found', color: 'text-red-400' },
  PROCESS_EVENT: { icon: '◆', label: 'Process Event', color: 'text-slate-400' },
  NETWORK_EVENT: { icon: '◇', label: 'Network Activity', color: 'text-slate-400' },
  HANDOFF: { icon: '→', label: 'Transfer', color: 'text-slate-400' },
  ERROR: { icon: '✕', label: 'Error', color: 'text-red-400' },
};

export default function ActivityStream({ store }: { store: EventStore }) {
  const [events, setEvents] = useState<PantheonEvent[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = store.subscribe(() => {
      setEvents(store.getRecentEvents());
    });
    return unsubscribe;
  }, [store]);

  return (
    <div className="border border-slate-800 rounded-lg p-6 bg-slate-900/30">
      <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-4">
        Activity Stream
      </h3>

      {events.length === 0 ? (
        <p className="text-sm text-slate-500">Waiting for events...</p>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {/* Render newest first */}
          {[...events].reverse().map((event, idx) => {
            const eventTypeConfig = eventTypes[event.type as keyof typeof eventTypes];
            const config = eventTypeConfig || { icon: '?', label: event.type, color: 'text-slate-500' };
            const eventKey = `${event.timestamp}-${idx}`;

            return (
              <div key={eventKey} className="border-l-2 border-slate-700 pl-3 py-1 text-xs">
                <div
                  className="flex items-start gap-2 cursor-pointer hover:bg-slate-800/50 p-1 rounded -ml-1"
                  onClick={() =>
                    setExpanded(expanded === eventKey ? null : eventKey)
                  }
                >
                  <span className={`${config.color} font-bold`}>{config.icon}</span>
                  <div className="flex-1">
                    <span className="text-slate-300">{config.label}</span>
                    {event.agent && (
                      <span className="text-slate-500 ml-2">
                        [{event.agent}]
                      </span>
                    )}
                    {event.tool && (
                      <span className="text-slate-500 ml-1">
                        {event.tool}
                      </span>
                    )}
                    <span className="text-slate-600 ml-2 text-xs">
                      {formatTimestamp(event.timestamp)}
                    </span>
                  </div>
                </div>

                {expanded === eventKey && (
                  <div className="mt-2 pl-2 border-l border-slate-600 text-slate-400 text-xs font-mono whitespace-pre-wrap break-words max-h-40 overflow-y-auto bg-slate-950/50 p-2 rounded">
                    {JSON.stringify(event.payload, null, 2)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);

  if (diffSec < 1) return 'now';
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  return date.toLocaleTimeString();
}
