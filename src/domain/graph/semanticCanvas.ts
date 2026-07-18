import { getInputPorts, getNodeLabel, getNodePort, getOutputPorts } from '../nodes/nodeRegistry.ts';
import type { NodeData } from '../../types.ts';
import { getHeroTake } from '../../utils/takeHelpers.ts';
import { validateConnection } from './connectionRules.ts';
import {
  CURRENT_EDGE_SCHEMA_VERSION,
  type CanvasEdge,
  type ConnectionValidationResult,
  type NodePortDefinition
} from './graphTypes.ts';

export interface ConnectionRenderIndex {
  nodesById: Map<string, NodeData>;
  parallelEdgeLayoutById: Map<string, { index: number; count: number }>;
}

export function createConnectionRenderIndex(
  nodes: NodeData[],
  edges: CanvasEdge[]
): ConnectionRenderIndex {
  const nodesById = new Map(nodes.map(node => [node.id, node]));
  const edgesByPair = new Map<string, CanvasEdge[]>();

  for (const edge of edges) {
    const pairKey = `${edge.sourceNodeId}\u0000${edge.targetNodeId}`;
    const pairEdges = edgesByPair.get(pairKey);
    if (pairEdges) pairEdges.push(edge);
    else edgesByPair.set(pairKey, [edge]);
  }

  const parallelEdgeLayoutById = new Map<string, { index: number; count: number }>();
  for (const pairEdges of edgesByPair.values()) {
    pairEdges.forEach((edge, index) => {
      parallelEdgeLayoutById.set(edge.id, { index, count: pairEdges.length });
    });
  }

  return { nodesById, parallelEdgeLayoutById };
}

export function getVisibleNodePorts(
  type: unknown,
  direction: NodePortDefinition['direction']
): NodePortDefinition[] {
  const ports = direction === 'input' ? getInputPorts(type) : getOutputPorts(type);
  return ports.filter(port => port.enabled !== false);
}

export interface ConnectionPortFeedback {
  state: 'source' | 'compatible' | 'incompatible';
  code?: string;
  message?: string;
}

export function getConnectionPortFeedbackKey(nodeId: string, portId: string): string {
  return `${nodeId}\u0000${portId}`;
}

export function createConnectionPortFeedbackIndex(
  nodes: NodeData[],
  edges: CanvasEdge[],
  connectionStart: CanvasPortEndpoint | null
): Map<string, ConnectionPortFeedback> {
  const feedbackByPort = new Map<string, ConnectionPortFeedback>();
  if (!connectionStart) return feedbackByPort;

  const nodesById = new Map(nodes.map(node => [node.id, node]));
  const sourceNode = nodesById.get(connectionStart.nodeId);
  const sourcePort = sourceNode ? getNodePort(sourceNode.type, connectionStart.portId) : undefined;

  for (const node of nodes) {
    const ports = [
      ...getVisibleNodePorts(node.type, 'input'),
      ...getVisibleNodePorts(node.type, 'output')
    ];

    for (const port of ports) {
      const key = getConnectionPortFeedbackKey(node.id, port.id);
      if (node.id === connectionStart.nodeId && port.id === connectionStart.portId) {
        feedbackByPort.set(key, { state: 'source' });
        continue;
      }

      const validation = validateConnection({
        sourceNode,
        sourcePort,
        targetNode: node,
        targetPort: port,
        existingEdges: edges
      });
      feedbackByPort.set(key, validation.valid
        ? { state: 'compatible' }
        : {
            state: 'incompatible',
            ...(validation.code ? { code: validation.code } : {}),
            ...(validation.message ? { message: validation.message } : {})
          });
    }
  }

  return feedbackByPort;
}

export interface ConnectionTargetChoice {
  sourcePort: NodePortDefinition;
  targetPort: NodePortDefinition;
}

export interface CanvasPortBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NodePortCanvasAnchor {
  side: 'left' | 'right';
  relativeY: number;
  x: number;
  y: number;
}

export interface NodePortRailPlacement {
  direction: NodePortDefinition['direction'];
  side: 'left' | 'right';
  relativeY: number;
}

export interface CanvasPortEndpoint {
  nodeId: string;
  portId: string;
  direction: NodePortDefinition['direction'];
}

export function getNodePortRailPlacement(
  type: unknown,
  portId: string
): NodePortRailPlacement | undefined {
  const port = getNodePort(type, portId);
  if (!port || port.enabled === false) return undefined;

  const hasVisiblePort = getVisibleNodePorts(type, port.direction)
    .some(candidate => candidate.id === port.id);
  if (!hasVisiblePort) return undefined;

  return {
    direction: port.direction,
    side: port.direction === 'input' ? 'left' : 'right',
    // LibTV-style merged rails: semantic ports still exist for validation,
    // but the canvas draws one visual handle per side at the card midpoint.
    relativeY: 0.5
  };
}

export function getNodePortCanvasAnchor(
  type: unknown,
  portId: string,
  bounds: CanvasPortBounds
): NodePortCanvasAnchor | undefined {
  const placement = getNodePortRailPlacement(type, portId);
  if (!placement) return undefined;

  const { relativeY, side } = placement;
  return {
    side,
    relativeY,
    x: side === 'left' ? bounds.x : bounds.x + bounds.width,
    y: bounds.y + bounds.height * relativeY
  };
}

export type ConnectionDropResolution =
  | {
      kind: 'connect';
      sourcePort: NodePortDefinition;
      targetPort: NodePortDefinition;
    }
  | {
      kind: 'choose';
      sourcePort: NodePortDefinition;
      choices: ConnectionTargetChoice[];
    }
  | {
      kind: 'invalid';
      code: string;
      message: string;
    };

export function getConnectionTargetChoices(
  sourceNode: NodeData,
  sourcePortId: string,
  targetNode: NodeData,
  existingEdges: CanvasEdge[]
): ConnectionTargetChoice[] {
  const sourcePort = getNodePort(sourceNode.type, sourcePortId);
  if (!sourcePort || sourcePort.direction !== 'output' || sourcePort.enabled === false) return [];

  return getVisibleNodePorts(targetNode.type, 'input').flatMap(targetPort => {
    const validation = validateConnection({
      sourceNode,
      sourcePort,
      targetNode,
      targetPort,
      existingEdges
    });
    return validation.valid ? [{ sourcePort, targetPort }] : [];
  });
}

export function resolveConnectionDrop(
  sourceNode: NodeData,
  sourcePortId: string,
  targetNode: NodeData,
  existingEdges: CanvasEdge[]
): ConnectionDropResolution {
  const sourcePort = getNodePort(sourceNode.type, sourcePortId);
  if (!sourcePort || sourcePort.direction !== 'output' || sourcePort.enabled === false) {
    return {
      kind: 'invalid',
      code: 'invalid_source_port',
      message: '该连接必须从一个可用的输出端口开始。'
    };
  }

  const choices = getConnectionTargetChoices(sourceNode, sourcePortId, targetNode, existingEdges);
  const defaultReferenceChoice = choices.find(choice =>
    sourcePort.dataType === 'image' &&
    String(targetNode.type) === '视频' &&
    choice.targetPort.id === 'reference-images'
  );
  if (defaultReferenceChoice) {
    return {
      kind: 'connect',
      sourcePort,
      targetPort: defaultReferenceChoice.targetPort
    };
  }
  if (choices.length === 0) {
    return {
      kind: 'invalid',
      code: 'no_compatible_port',
      message: '目标节点没有可用的兼容输入端口。'
    };
  }
  if (choices.length === 1) {
    return {
      kind: 'connect',
      sourcePort,
      targetPort: choices[0].targetPort
    };
  }
  return { kind: 'choose', sourcePort, choices };
}

export interface CreateSemanticEdgeInput {
  sourceNode: NodeData;
  sourcePortId: string;
  targetNode: NodeData;
  targetPortId: string;
  existingEdges: CanvasEdge[];
  idFactory?: () => string;
  now?: () => string;
}

export type CreateSemanticEdgeResult = ConnectionValidationResult & { edge?: CanvasEdge };

export function createSemanticEdge(input: CreateSemanticEdgeInput): CreateSemanticEdgeResult {
  const sourcePort = getNodePort(input.sourceNode.type, input.sourcePortId);
  const targetPort = getNodePort(input.targetNode.type, input.targetPortId);
  const validation = validateConnection({
    sourceNode: input.sourceNode,
    sourcePort,
    targetNode: input.targetNode,
    targetPort,
    existingEdges: input.existingEdges
  });
  if (!validation.valid || !sourcePort || !targetPort) return validation;

  const existingPortEdges = input.existingEdges.filter(edge =>
    edge.targetNodeId === input.targetNode.id && edge.targetPortId === targetPort.id
  );
  const nextOrder = targetPort.ordered
    ? Math.max(-1, ...existingPortEdges.map(edge => edge.order ?? -1)) + 1
    : undefined;
  const edge: CanvasEdge = {
    schemaVersion: CURRENT_EDGE_SCHEMA_VERSION,
    id: (input.idFactory || (() => crypto.randomUUID()))(),
    sourceNodeId: input.sourceNode.id,
    sourcePortId: sourcePort.id,
    targetNodeId: input.targetNode.id,
    targetPortId: targetPort.id,
    dataType: sourcePort.dataType,
    ...(nextOrder === undefined ? {} : { order: nextOrder }),
    createdAt: (input.now || (() => new Date().toISOString()))()
  };
  return { valid: true, edge };
}

export interface InspectorPortConnection {
  edgeId: string;
  nodeId: string;
  portId: string;
  nodeLabel: string;
  portLabel: string;
  dataType: CanvasEdge['dataType'];
  order?: number;
}

export interface NodeInspectorPort {
  portId: string;
  label: string;
  dataType: NodePortDefinition['dataType'];
  connections: InspectorPortConnection[];
}

export interface NodeInspectorData {
  nodeId: string;
  nodeLabel: string;
  inputs: NodeInspectorPort[];
  outputs: NodeInspectorPort[];
  heroTake?: {
    id: string;
    url: string;
    type: 'image' | 'video';
    thumbnailUrl?: string;
  };
  activeTaskId?: string;
  lastTaskId?: string;
  generationProgressMessage?: string;
  errorMessage?: string;
}

export interface EdgeInspectorData {
  id: string;
  source: {
    nodeId: string;
    portId: string;
    nodeLabel: string;
    portLabel: string;
    role?: string;
  };
  target: {
    nodeId: string;
    portId: string;
    nodeLabel: string;
    portLabel: string;
    role?: string;
  };
  dataType: CanvasEdge['dataType'];
  order?: number;
}

function displayNodeLabel(node: NodeData | undefined, fallbackId: string): string {
  if (!node) return fallbackId;
  return node.title || getNodeLabel(node.type) || node.id;
}

function connectionForEdge(
  edge: CanvasEdge,
  connectedNode: NodeData | undefined,
  connectedPortId: string,
  fallbackNodeId: string
): InspectorPortConnection {
  const port = connectedNode ? getNodePort(connectedNode.type, connectedPortId) : undefined;
  return {
    edgeId: edge.id,
    nodeId: connectedNode?.id || fallbackNodeId,
    portId: connectedPortId,
    nodeLabel: displayNodeLabel(connectedNode, fallbackNodeId),
    portLabel: port?.label || connectedPortId,
    dataType: edge.dataType,
    ...(edge.order === undefined ? {} : { order: edge.order })
  };
}

export function getNodeInspectorData(
  node: NodeData,
  nodes: NodeData[],
  edges: CanvasEdge[]
): NodeInspectorData {
  const nodesById = new Map(nodes.map(candidate => [candidate.id, candidate]));
  const inputs = getVisibleNodePorts(node.type, 'input').map(port => ({
    portId: port.id,
    label: port.label,
    dataType: port.dataType,
    connections: edges
      .filter(edge => edge.targetNodeId === node.id && edge.targetPortId === port.id)
      .map(edge => connectionForEdge(
        edge,
        nodesById.get(edge.sourceNodeId),
        edge.sourcePortId,
        edge.sourceNodeId
      ))
  }));
  const outputs = getVisibleNodePorts(node.type, 'output').map(port => ({
    portId: port.id,
    label: port.label,
    dataType: port.dataType,
    connections: edges
      .filter(edge => edge.sourceNodeId === node.id && edge.sourcePortId === port.id)
      .map(edge => connectionForEdge(
        edge,
        nodesById.get(edge.targetNodeId),
        edge.targetPortId,
        edge.targetNodeId
      ))
  }));
  const heroTake = getHeroTake(node);

  return {
    nodeId: node.id,
    nodeLabel: displayNodeLabel(node, node.id),
    inputs,
    outputs,
    ...(heroTake ? {
      heroTake: {
        id: heroTake.id,
        url: heroTake.url,
        type: heroTake.type,
        ...(heroTake.thumbnailUrl ? { thumbnailUrl: heroTake.thumbnailUrl } : {})
      }
    } : {}),
    ...(node.activeTaskId ? { activeTaskId: node.activeTaskId } : {}),
    ...(node.lastTaskId ? { lastTaskId: node.lastTaskId } : {}),
    ...(node.generationProgressMessage ? { generationProgressMessage: node.generationProgressMessage } : {}),
    ...(node.errorMessage ? { errorMessage: node.errorMessage } : {})
  };
}

export function getEdgeInspectorData(edge: CanvasEdge, nodes: NodeData[]): EdgeInspectorData {
  const nodesById = new Map(nodes.map(node => [node.id, node]));
  const sourceNode = nodesById.get(edge.sourceNodeId);
  const targetNode = nodesById.get(edge.targetNodeId);
  const sourcePort = sourceNode ? getNodePort(sourceNode.type, edge.sourcePortId) : undefined;
  const targetPort = targetNode ? getNodePort(targetNode.type, edge.targetPortId) : undefined;

  return {
    id: edge.id,
    source: {
      nodeId: edge.sourceNodeId,
      portId: edge.sourcePortId,
      nodeLabel: displayNodeLabel(sourceNode, edge.sourceNodeId),
      portLabel: sourcePort?.label || edge.sourcePortId,
      ...(sourcePort?.role ? { role: sourcePort.role } : {})
    },
    target: {
      nodeId: edge.targetNodeId,
      portId: edge.targetPortId,
      nodeLabel: displayNodeLabel(targetNode, edge.targetNodeId),
      portLabel: targetPort?.label || edge.targetPortId,
      ...(targetPort?.role ? { role: targetPort.role } : {})
    },
    dataType: edge.dataType,
    ...(edge.order === undefined ? {} : { order: edge.order })
  };
}
