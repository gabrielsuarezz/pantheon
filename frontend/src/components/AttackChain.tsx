'use client';

import { useEffect, useState } from 'react';
import { EventStore, AttackStage } from '@/lib/event-store';

interface AttackChainProps {
  store: EventStore;
}

export default function AttackChain({ store }: AttackChainProps) {
  const [stages, setStages] = useState<AttackStage[]>([]);

  useEffect(() => {
    setStages(store.getAttackChain());

    const unsubscribe = store.subscribe(() => {
      setStages(store.getAttackChain());
    });

    return unsubscribe;
  }, [store]);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
      <h3 className="text-lg font-bold mb-6 text-white">Attack Chain</h3>

      {stages.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-gray-400">No stages discovered yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {stages.map((stage, idx) => (
            <div key={stage.stage_id} className="relative">
              {/* Connector line */}
              {idx < stages.length - 1 && (
                <div className="absolute left-6 top-12 w-0.5 h-4 bg-gradient-to-b from-blue-500 to-transparent"></div>
              )}

              {/* Stage card */}
              <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/30 rounded p-4 hover:border-blue-500/60 transition-colors">
                {/* Icon and Title */}
                <div className="flex items-start gap-3 mb-2">
                  <div className="text-2xl">{stage.icon}</div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-blue-300 truncate">{stage.label}</h4>
                    <p className="text-xs text-gray-400 mt-1">{stage.description}</p>
                  </div>
                </div>

                {/* Timestamp */}
                {stage.discovered_at && (
                  <p className="text-xs text-gray-500 mt-2">
                    Discovered: {new Date(stage.discovered_at).toLocaleTimeString()}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Stats */}
      <div className="mt-6 pt-4 border-t border-gray-800">
        <p className="text-sm text-gray-400">
          <span className="font-semibold text-blue-400">{stages.length}</span> stage{stages.length !== 1 ? 's' : ''} discovered
        </p>
      </div>
    </div>
  );
}
