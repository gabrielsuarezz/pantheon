'use client';

import React, { useMemo, useEffect, useState } from 'react';
import {
  ReactFlow,
  useNodesState,
  useEdgesState,
  MarkerType,
  Background,
  Controls,
  Node,
  Edge,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, ScanLine, FlaskConical, Globe, ShieldAlert, Radio, Eye, Wrench, type LucideIcon } from 'lucide-react';
import { AgentName, EventStore, AgentStatus } from '@/lib/event-store';

// ─── Constants & Registry ───────────────────────────────────────────────────

const AGENT_META: Record<AgentName, { icon: LucideIcon; color: string; label: string }> = {
  zeus:       { icon: Zap,          color: '#C9A227', label: 'Zeus'       },
  athena:     { icon: ScanLine,     color: '#60A5FA', label: 'Athena'     },
  hades:      { icon: FlaskConical, color: '#F87171', label: 'Hades'      },
  apollo:     { icon: Globe,        color: '#FBBF24', label: 'Apollo'     },
  ares:       { icon: ShieldAlert,  color: '#A78BFA', label: 'Ares'       },
  hermes:     { icon: Radio,        color: '#34D399', label: 'Hermes'     },
  artemis:    { icon: Eye,          color: '#F472B6', label: 'Artemis'    },
  hephaestus: { icon: Wrench,       color: '#94A3B8', label: 'Hephaestus' },
};

const AGENT_ORDER: AgentName[] = ['athena', 'hades', 'apollo', 'ares', 'hermes', 'artemis', 'hephaestus'];

// Circular layout coordinates (Zeus at 0,0)
const RAD = 320;
const POSITIONS: Record<AgentName, { x: number; y: number }> = {
  zeus: { x: 0, y: 0 },
  ...Object.fromEntries(
    AGENT_ORDER.map((name, i) => {
      const angle = (i / AGENT_ORDER.length) * 2 * Math.PI - Math.PI / 2;
      return [name, { x: Math.cos(angle) * RAD, y: Math.sin(angle) * RAD }];
    })
  ),
} as Record<AgentName, { x: number; y: number }>;

// ─── Custom Components ──────────────────────────────────────────────────────

const GodNode = ({ data }: { data: any }) => {
  const meta = AGENT_META[data.name as AgentName];
  const isZeus    = data.name === 'zeus';
  const isActive  = data.state === 'active';
  const isComplete = data.state === 'complete';
  const isError   = data.state === 'error';

  const size    = isZeus ? 112 : 96;
  const ringSize = size + 28;

  const dotColor = isActive ? '#F59E0B' : isComplete ? '#22C55E' : isError ? '#EF4444' : '#94A3B8';

  return (
    <div className="relative flex flex-col items-center" style={{ width: size + 60 }}>

      {/* Zeus command-radius ring */}
      {isZeus && (
        <div
          className="absolute rounded-full border border-dashed pointer-events-none"
          style={{
            width: 160,
            height: 160,
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            borderColor: 'rgba(201,162,39,0.25)',
          }}
        />
      )}

      {/* Glow ring */}
      <div
        className="absolute rounded-full pointer-events-none"
        style={{
          width: ringSize,
          height: ringSize,
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: `radial-gradient(circle, ${meta.color}40 0%, transparent 70%)`,
          opacity: isActive ? 1 : 0.25,
          animation: isActive ? 'pulse-ring 1.5s ease-in-out infinite' : undefined,
        }}
      />

      {/* Node circle */}
      <div
        className="rounded-full flex items-center justify-center transition-all duration-500 relative"
        style={{
          width: size,
          height: size,
          background: 'rgba(255,255,255,0.85)',
          backdropFilter: 'blur(8px)',
          border: `2px solid ${isActive ? meta.color : isComplete ? '#22C55E' : `${meta.color}40`}`,
          boxShadow: isActive
            ? `0 0 48px ${meta.color}60, 0 0 16px ${meta.color}30, inset 0 1px 0 rgba(255,255,255,0.8)`
            : `0 2px 16px ${meta.color}15, inset 0 1px 0 rgba(255,255,255,0.6)`,
          transform: isActive ? 'scale(1.06)' : 'scale(1)',
        }}
      >
        <meta.icon
          size={isZeus ? 36 : 28}
          color={isActive ? meta.color : `${meta.color}90`}
          style={{ transition: 'color 0.3s' }}
        />

        {/* State dot */}
        <div
          className="absolute rounded-full border-2 border-white"
          style={{
            width: 12,
            height: 12,
            top: 4,
            right: 4,
            background: dotColor,
            boxShadow: isActive ? `0 0 8px ${dotColor}` : undefined,
            animation: isActive ? 'pulse-ring 1s ease-in-out infinite' : undefined,
          }}
        />
      </div>

      {/* Label */}
      <div
        className="mt-2 text-[10px] font-bold uppercase tracking-widest text-center transition-colors duration-300"
        style={{ color: isActive ? meta.color : '#9A7A10', opacity: isActive ? 1 : 0.7 }}
      >
        {meta.label}
      </div>

      {/* Live thought — only when active */}
      <AnimatePresence>
        {isActive && data.last_thought && (
          <motion.div
            key={data.last_thought}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="mt-1 text-[9px] italic text-center leading-tight"
            style={{
              color: '#5a4e30',
              maxWidth: 120,
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {data.last_thought}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const nodeTypes = {
  god: GodNode,
};

// ─── Main Component ─────────────────────────────────────────────────────────

export default function OlympusFlow({ store, onSelect }: { store: EventStore, onSelect: (agent: AgentStatus) => void }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const onNodeClick = (_: any, node: Node) => {
    const agents = store.getAgents();
    const agent = agents.find(a => a.name === node.id);
    if (agent) onSelect(agent);
  };

  // Sync nodes with EventStore
  useEffect(() => {
    const updateNodes = () => {
      const agents = store.getAgents();
      const newNodes: Node[] = agents.map((agent) => ({
        id: agent.name,
        type: 'god',
        position: POSITIONS[agent.name as AgentName],
        data: { 
          name: agent.name, 
          state: agent.state,
          last_thought: agent.last_thought 
        },
      }));
      setNodes(newNodes);

      // Simple handoff edges
      const handoffs = store.getHandoffs();
      const newEdges: Edge[] = handoffs.map((h, i) => ({
        id: `handoff-${i}`,
        source: h.from,
        target: h.to,
        animated: true,
        style: { stroke: AGENT_META[h.from as AgentName].color, strokeWidth: 2 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: AGENT_META[h.from as AgentName].color,
        },
      }));
      
      // Also add fallback edges from Zeus (the orchestrator) if no handoffs
      if (newEdges.length === 0) {
        AGENT_ORDER.forEach(name => {
          newEdges.push({
            id: `base-${name}`,
            source: 'zeus',
            target: name,
            style: { stroke: 'rgba(201,162,39,0.1)', strokeWidth: 1, strokeDasharray: '5,5' },
          });
        });
      }

      setEdges(newEdges);
    };

    updateNodes();
    return store.subscribe(updateNodes);
  }, [store, setNodes, setEdges]);

  return (
    <div className="w-full h-full linen-bg rounded-2xl border border-gold-border overflow-hidden shadow-warm relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        fitView
        fitViewOptions={{ padding: 0.5 }}
        minZoom={0.2}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="rgba(201, 162, 39, 0.05)" gap={20} />
        <Controls 
          className="!bg-white !border-gold/20 !shadow-warm" 
          showInteractive={false}
        />
        
        <Panel position="top-right" className="m-4">
          <div className="glass-panel px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest text-gold-dark flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            Agent Network
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}
