'use client';

import { useEffect } from 'react';
import {
  ReactFlow,
  useNodesState,
  useEdgesState,
  Background,
  Controls,
  Node,
  NodeMouseHandler,
  NodeProps,
  Edge,
  Panel,
  EdgeProps,
  Handle,
  Position,
  getBezierPath,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, ScanLine, FlaskConical, Globe, ShieldAlert, Radio, Eye, Wrench, Mic, type LucideIcon } from 'lucide-react';
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
  muse:       { icon: Mic,          color: '#D946EF', label: 'Muse'       },
};

const AGENT_ORDER: AgentName[] = ['athena', 'hades', 'apollo', 'ares', 'hermes', 'artemis', 'hephaestus', 'muse'];
const HANDLE_POSITIONS = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
} as const;

type HandleId = keyof typeof HANDLE_POSITIONS;
type GodNodeData = {
  name: AgentName;
  state: AgentStatus['state'];
  last_thought?: string;
};

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

function getHandleId(source: AgentName, target: AgentName): HandleId {
  const dx = POSITIONS[target].x - POSITIONS[source].x;
  const dy = POSITIONS[target].y - POSITIONS[source].y;

  if (Math.abs(dx) > Math.abs(dy)) {
    return dx >= 0 ? 'right' : 'left';
  }

  return dy >= 0 ? 'bottom' : 'top';
}

// ─── Custom Components ──────────────────────────────────────────────────────

const GodNode = ({ data }: NodeProps<Node<GodNodeData, 'god'>>) => {
  const meta = AGENT_META[data.name as AgentName] || { icon: Eye, color: '#A1A1AA', label: (data.name || 'Unknown').toUpperCase() };
  const isZeus    = data.name === 'zeus';
  const isActive  = data.state === 'active';
  const isComplete = data.state === 'complete';
  const isError   = data.state === 'error';

  const size    = isZeus ? 112 : 96;
  const ringSize = size + 28;

  const dotColor = isActive ? '#F59E0B' : isComplete ? '#22C55E' : isError ? '#EF4444' : '#94A3B8';

  return (
    <div className="relative flex flex-col items-center" style={{ width: size + 60 }}>
      {Object.entries(HANDLE_POSITIONS).map(([id, position]) => (
        <Handle
          key={`target-${id}`}
          id={id}
          type="target"
          position={position}
          isConnectable={false}
          style={{ opacity: 0, pointerEvents: 'none' }}
        />
      ))}

      {Object.entries(HANDLE_POSITIONS).map(([id, position]) => (
        <Handle
          key={`source-${id}`}
          id={id}
          type="source"
          position={position}
          isConnectable={false}
          style={{ opacity: 0, pointerEvents: 'none' }}
        />
      ))}

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

function ParticleEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps) {
  const [edgePath] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const isActive = data?.active as boolean;
  const color    = (data?.color as string) ?? 'rgba(201,162,39,0.4)';

  return (
    <g>
      {/* Base inactive edge path */}
      {!isActive && (
        <path
          d={edgePath}
          fill="none"
          stroke="rgba(201,162,39,0.12)"
          strokeWidth={1}
          strokeDasharray="4 6"
        />
      )}

      {/* Active dashed striking line */}
      {isActive && (
        <path
          d={edgePath}
          fill="none"
          stroke={color}
          strokeWidth={3}
          strokeDasharray="16 12"
          strokeLinecap="round"
          style={{
            filter: `drop-shadow(0 0 6px ${color}80)`
          }}
        >
          <animate
            attributeName="stroke-dashoffset"
            from="28"
            to="0"
            dur="0.5s"
            repeatCount="indefinite"
          />
        </path>
      )}
    </g>
  );
}

const edgeTypes = {
  particle: ParticleEdge,
};

// ─── Main Component ─────────────────────────────────────────────────────────

export default function OlympusFlow({
  store,
  onSelect,
  onSecretTrigger,
}: {
  store: EventStore;
  onSelect: (agent: AgentStatus) => void;
  onSecretTrigger?: () => void;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const onNodeClick: NodeMouseHandler<Node> = (_, node) => {
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

      const recentHandoffs = store.getHandoffs().filter((h) => {
        const age = Date.now() - new Date(h.timestamp).getTime();
        return age < 1200;
      });

      const newEdges: Edge[] = AGENT_ORDER.map((name) => {
        const handoffKey = `zeus->${name}`;
        const reverseKey = `${name}->zeus`;
        const activeHandoff = recentHandoffs.find(
          (h) => `${h.from}->${h.to}` === handoffKey || `${h.from}->${h.to}` === reverseKey
        );
        const isActive = !!activeHandoff;
        const source = isActive && activeHandoff!.from !== 'zeus' ? name : 'zeus';
        const target = isActive && activeHandoff!.from !== 'zeus' ? 'zeus' : name;

        return {
          id: `edge-${name}`,
          source,
          target,
          sourceHandle: getHandleId(source, target),
          targetHandle: getHandleId(target, source),
          type: 'particle',
          data: {
            active: isActive,
            color: AGENT_META[activeHandoff ? (activeHandoff.from as AgentName) : name].color,
          },
        };
      });

      recentHandoffs
        .filter((h) => h.from !== 'zeus' && h.to !== 'zeus')
        .forEach((h, i) => {
          newEdges.push({
            id: `handoff-agent-${i}`,
            source: h.from,
            target: h.to,
            sourceHandle: getHandleId(h.from as AgentName, h.to as AgentName),
            targetHandle: getHandleId(h.to as AgentName, h.from as AgentName),
            type: 'particle',
            data: {
              active: true,
              color: AGENT_META[h.from as AgentName].color,
            },
          });
        });

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
        edgeTypes={edgeTypes}
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
          <button
            type="button"
            onClick={onSecretTrigger}
            className="glass-panel px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest text-gold-dark flex items-center gap-2 cursor-pointer"
            title="Agent Network"
          >
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            Agent Network
          </button>
        </Panel>
      </ReactFlow>
    </div>
  );
}
