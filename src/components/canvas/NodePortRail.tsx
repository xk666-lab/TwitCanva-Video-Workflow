import React from 'react';

import type { NodeData } from '../../types.ts';
import type { NodePortDefinition } from '../../domain/graph/graphTypes.ts';
import {
  getConnectionPortFeedbackKey,
  getVisibleNodePorts,
  type CanvasPortEndpoint,
  type ConnectionPortFeedback
} from '../../domain/graph/semanticCanvas.ts';

interface NodePortRailProps {
  node: NodeData;
  selected: boolean;
  isConnectionActive?: boolean;
  portFeedbackByKey?: ReadonlyMap<string, ConnectionPortFeedback>;
  canvasTheme?: 'dark' | 'light';
  onPortPointerDown: (event: React.PointerEvent, endpoint: CanvasPortEndpoint) => void;
  onPortPointerEnter?: (endpoint: CanvasPortEndpoint) => void;
  onPortPointerLeave?: (endpoint: CanvasPortEndpoint) => void;
}

type RailSide = 'left' | 'right';

function getFeedbackState(
  nodeId: string,
  ports: NodePortDefinition[],
  portFeedbackByKey?: ReadonlyMap<string, ConnectionPortFeedback>
): ConnectionPortFeedback['state'] | undefined {
  if (!portFeedbackByKey) return undefined;

  const states = ports
    .map(port => portFeedbackByKey.get(getConnectionPortFeedbackKey(nodeId, port.id))?.state)
    .filter(Boolean);

  if (states.includes('source')) return 'source';
  if (states.includes('compatible')) return 'compatible';
  if (states.includes('incompatible')) return 'incompatible';
  return undefined;
}

function SimplePortHandle({
  node,
  port,
  portsForFeedback,
  side,
  selected,
  isConnectionActive,
  portFeedbackByKey,
  canvasTheme,
  onPortPointerDown,
  onPortPointerEnter,
  onPortPointerLeave
}: NodePortRailProps & {
  port: NodePortDefinition;
  portsForFeedback: NodePortDefinition[];
  side: RailSide;
}) {
  const endpoint: CanvasPortEndpoint = {
    nodeId: node.id,
    portId: port.id,
    direction: port.direction
  };
  const feedbackState = getFeedbackState(node.id, portsForFeedback, portFeedbackByKey);
  const isDark = canvasTheme === 'dark';
  const sideClassName = side === 'left'
    ? '-left-3 -translate-x-1/2'
    : '-right-3 translate-x-1/2';
  const isHandleVisible = selected || isConnectionActive;
  const visibilityClassName = isHandleVisible
    ? 'pointer-events-auto opacity-100'
    : 'pointer-events-none opacity-0';
  const feedbackClassName = feedbackState === 'source'
    ? 'scale-110 ring-2 ring-white/90'
    : feedbackState === 'compatible'
      ? 'scale-110 ring-2 ring-emerald-300/90'
      : feedbackState === 'incompatible'
        ? 'opacity-45'
        : '';
  const themeClassName = isDark
    ? 'border-white/35 bg-neutral-950/95 text-white shadow-black/40 hover:border-white/70 hover:bg-neutral-900'
    : 'border-neutral-300 bg-white text-neutral-900 shadow-neutral-200/80 hover:border-neutral-500';

  return (
    <button
      type="button"
      aria-hidden={!isHandleVisible}
      tabIndex={isHandleVisible ? 0 : -1}
      aria-label={side === 'left' ? 'Add or connect previous node' : 'Add or connect next node'}
      title={side === 'left' ? 'Add or connect previous node' : 'Add or connect next node'}
      className={`absolute top-1/2 z-20 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border text-sm font-semibold leading-none shadow-lg backdrop-blur transition-all duration-150 ${sideClassName} ${visibilityClassName} ${themeClassName} ${feedbackClassName}`}
      onPointerDown={event => {
        event.preventDefault();
        event.stopPropagation();
        onPortPointerDown(event, endpoint);
      }}
      onPointerEnter={() => {
        if (side === 'right') onPortPointerEnter?.(endpoint);
      }}
      onPointerLeave={() => {
        if (side === 'right') onPortPointerLeave?.(endpoint);
      }}
    >
      <span className="-mt-px">+</span>
    </button>
  );
}

export function NodePortRail({
  node,
  selected,
  isConnectionActive = false,
  portFeedbackByKey,
  canvasTheme = 'dark',
  onPortPointerDown,
  onPortPointerEnter,
  onPortPointerLeave
}: NodePortRailProps) {
  const inputPorts = getVisibleNodePorts(node.type, 'input');
  const outputPorts = getVisibleNodePorts(node.type, 'output');
  const inputPort = inputPorts[0];
  const outputPort = outputPorts[0];

  if (!inputPort && !outputPort) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-20" aria-label="Node connectors">
      {inputPort && (
        <SimplePortHandle
          node={node}
          port={inputPort}
          portsForFeedback={inputPorts}
          side="left"
          selected={selected}
          isConnectionActive={isConnectionActive}
          portFeedbackByKey={portFeedbackByKey}
          canvasTheme={canvasTheme}
          onPortPointerDown={onPortPointerDown}
          onPortPointerEnter={onPortPointerEnter}
          onPortPointerLeave={onPortPointerLeave}
        />
      )}
      {outputPort && (
        <SimplePortHandle
          node={node}
          port={outputPort}
          portsForFeedback={outputPorts}
          side="right"
          selected={selected}
          isConnectionActive={isConnectionActive}
          portFeedbackByKey={portFeedbackByKey}
          canvasTheme={canvasTheme}
          onPortPointerDown={onPortPointerDown}
          onPortPointerEnter={onPortPointerEnter}
          onPortPointerLeave={onPortPointerLeave}
        />
      )}
    </div>
  );
}
