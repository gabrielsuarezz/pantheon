'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EventStore, PantheonEvent } from '@/lib/event-store';

export default function DivineChronicle({ store }: { store: EventStore }) {
  const [events, setEvents] = useState<PantheonEvent[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updateEvents = () => {
      setEvents(store.getRecentEvents(100));
    };

    updateEvents();
    const unsubscribe = store.subscribe(updateEvents);
    return () => unsubscribe();
  }, [store]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  return (
    <div className="flex flex-col h-full bg-[#1c1c1e] rounded-xl border border-white/10 shadow-2xl overflow-hidden font-mono text-green-400 m-4">
      {/* macOS Terminal Title Bar */}
      <div className="flex items-center px-4 py-3 bg-[#2d2d30] border-b border-black/20 shrink-0">
        <div className="flex gap-2">
          <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
          <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
          <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
        </div>
        <div className="flex-1 text-center text-[10px] text-white/40 font-mono tracking-widest uppercase">
          root@pantheon — TELEMETRY
        </div>
        <div className="w-[44px]"></div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 scrollbar-hide space-y-1 bg-[#1e1e1e]"
      >
        <AnimatePresence initial={false}>
          {events.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-4 text-green-400/30">
              <div className="animate-pulse">_</div>
            </div>
          ) : (
            events.map((event, i) => {
              const timeString = new Date(event.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
              const agentString = (event.agent || 'SYSTEM').toUpperCase();
              
              let message = '';
              if (event.type === 'TOOL_CALLED') message = `Invoking tool: ${event.tool}`;
              else if (event.type === 'IOC_DISCOVERED') message = `Extracted ${event.payload.ioc_type as string}: ${event.payload.value as string}`;
              else if (event.type === 'HANDOFF') message = `A2A Handshake: Dispatched ${event.payload.to as string}`;
              else if (event.type === 'AGENT_ACTIVATED') message = String(event.payload.message || 'Activated');
              else if (event.type === 'ERROR') message = String(event.payload.error || event.payload.message);
              else message = String(event.payload.message || event.type);

              let prefixColor = 'text-green-500';
              if (event.type === 'ERROR') prefixColor = 'text-red-400';
              if (event.type === 'IOC_DISCOVERED') prefixColor = 'text-yellow-400';
              if (event.type === 'HANDOFF') prefixColor = 'text-fuchsia-400';
              if (event.type === 'TOOL_CALLED') prefixColor = 'text-blue-400';

              return (
                <motion.div
                  key={event.id || i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex flex-col sm:flex-row sm:items-start break-all hover:bg-white/5 px-2 py-0.5 rounded transition-colors text-[11px]"
                >
                  <div className="flex items-center shrink-0">
                    <span className="text-white/30 mr-2">[{timeString}]</span>
                    <span className={`mr-2 ${prefixColor} font-bold`}>[{agentString}]</span>
                  </div>
                  <span className="text-green-400/90 leading-relaxed">
                    <span className="text-white/50 mr-2 hidden sm:inline">➜</span>
                    {message}
                  </span>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
