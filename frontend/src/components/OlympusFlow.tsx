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
const RAD = 250;
const POSITIONS: Record<AgentName, { x: number; y: number }> = {
  zeus: { x: 0, y: 0 },
  ...Object.fromEntries(
    AGENT_ORDER.map((name, i) => {
      const angle = (i / AGENT_ORDER.length) * 2 * Math.PI - Math.PI / 2;
      return [name, { x: Math.cos(angle) * RAD, y: Math.sin(angle) * RAD }];
    })
  ),
} as any;

// ─── Custom Components ──────────────────────────────────────────────────────

const GodNode = ({ data }: { data: any }) => {
  const meta = AGENT_META[data.name as AgentName];
  const isActive = data.state === 'active';
  const isComplete = data.state === 'complete';
  const isError = data.state === 'error';

  return (
    <div className={`relative flex flex-col items-center group`}>
      {/* Glow Effect */}
      <AnimatePresence>
        {isActive && (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1.5, opacity: 0.2 }}
            exit={{ opacity: 0 }}
            transition={{ repeat: Infinity, duration: 1.5, ease: "easeOut" }}
            className="absolute -inset-4 rounded-full"
            style={{ backgroundColor: meta.color }}
          />
        )}
      </AnimatePresence>

      {/* Thought Bubble */}
      <AnimatePresence>
        {data.last_thought && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: -60, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="absolute z-10 w-48 p-2 text-[10px] glass-panel rounded-xl text-center shadow-gold italic font-medium border-gold/30 bg-white/90"
          >
            "{data.last_thought}"
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-white rotate-45 border-b border-r border-gold/20" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Node */}
      <div
        className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-warm transition-all duration-500 border-2
          ${isActive ? 'scale-110 shadow-gold' : 'hover:scale-105'}
          ${isComplete ? 'bg-green-50/50 border-green-200' : 'bg-white/80'}
          ${isError ? 'bg-red-50/50 border-red-200' : ''}
        `}
        style={{ borderColor: isActive ? meta.color : isComplete ? '#22C55E' : 'rgba(201,162,39,0.2)' }}
      >
        <meta.icon size={24} color={meta.color} />
        
        {/* Status Dot */}
        <div 
          className={`absolute -top-1 -right-1 w-4 h-4 rounded-full border-2 border-white shadow-sm
            ${isActive ? 'bg-amber-400 animate-pulse' : isComplete ? 'bg-green-500' : isError ? 'bg-red-500' : 'bg-slate-300'}
          `}
        />
      </div>

      <div className="mt-2 text-[10px] font-bold uppercase tracking-widest text-gold-dark opacity-80">
        {meta.label}
      </div>
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
            Live Map of Olympus
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}
