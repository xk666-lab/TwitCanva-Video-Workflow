import type { NodeData } from '../../types';
import { getNodePort } from '../nodes/nodeRegistry.ts';
import type { CanvasEdge } from './graphTypes.ts';
import { getIncomingEdges, getInputEdgesByPort } from './edgeMigration.ts';

function nodeById(nodes: NodeData[]): Map<string, NodeData> {
  return new Map(nodes.map(node => [node.id, node]));
}

function sourceNodesForEdges(edges: CanvasEdge[], nodes: NodeData[]): NodeData[] {
  const lookup = nodeById(nodes);
  return edges.map(edge => lookup.get(edge.sourceNodeId)).filter((node): node is NodeData => Boolean(node));
}

function legacyParents(targetNode: NodeData, nodes: NodeData[]): NodeData[] {
  const lookup = nodeById(nodes);
  return (targetNode.parentIds || [])
    .map(id => lookup.get(id))
    .filter((node): node is NodeData => Boolean(node));
}

function isValidSubjectSource(sourceNode: NodeData, edge: CanvasEdge): boolean {
  if (String(sourceNode.type) !== '主体' || edge.dataType !== 'subject') return false;

  const sourcePort = getNodePort(sourceNode.type, edge.sourcePortId);
  return sourcePort?.id === 'subject-output' &&
    sourcePort.direction === 'output' &&
    sourcePort.dataType === 'subject';
}

export function getConnectedTextInputs(
  targetNode: NodeData,
  nodes: NodeData[],
  edges: CanvasEdge[]
): NodeData[] {
  const incoming = getIncomingEdges(edges, targetNode.id);
  if (incoming.length > 0) {
    return sourceNodesForEdges(
      incoming.filter(edge => edge.targetPortId === 'prompt-input' || edge.dataType === 'text'),
      nodes
    );
  }
  return legacyParents(targetNode, nodes).filter(node => String(node.type) === '文本');
}

export function getConnectedImageInputs(
  targetNode: NodeData,
  nodes: NodeData[],
  edges: CanvasEdge[]
): NodeData[] {
  const incoming = getIncomingEdges(edges, targetNode.id);
  if (incoming.length > 0) {
    return sourceNodesForEdges(incoming.filter(edge => edge.dataType === 'image'), nodes);
  }
  return legacyParents(targetNode, nodes).filter(node => String(node.type) !== '文本');
}

export function getConnectedSubjectInputs(
  targetNode: NodeData,
  nodes: NodeData[],
  edges: CanvasEdge[]
): NodeData[] {
  const targetPort = getNodePort(targetNode.type, 'subject-references');
  if (!targetPort || targetPort.direction !== 'input' || targetPort.dataType !== 'subject') return [];

  const incoming = getIncomingEdges(edges, targetNode.id);
  if (incoming.length > 0) {
    const nodesById = nodeById(nodes);
    const subjectEdges = getInputEdgesByPort(edges, targetNode.id, 'subject-references').filter(edge => {
      const sourceNode = nodesById.get(edge.sourceNodeId);
      return sourceNode ? isValidSubjectSource(sourceNode, edge) : false;
    });
    return sourceNodesForEdges(subjectEdges, nodes);
  }
  return [];
}

export function getReferenceImageInputs(
  targetNode: NodeData,
  nodes: NodeData[],
  edges: CanvasEdge[]
): NodeData[] {
  const incoming = getIncomingEdges(edges, targetNode.id);
  if (incoming.length > 0) {
    return sourceNodesForEdges(getInputEdgesByPort(edges, targetNode.id, 'reference-images'), nodes);
  }
  return legacyParents(targetNode, nodes).filter(node =>
    ['图片', '图片编辑器', '镜头角度', '本地图片模型'].includes(String(node.type))
  );
}

export function getStartFrameInput(
  targetNode: NodeData,
  nodes: NodeData[],
  edges: CanvasEdge[]
): NodeData | undefined {
  const incoming = getIncomingEdges(edges, targetNode.id);
  if (incoming.length > 0) {
    return sourceNodesForEdges(getInputEdgesByPort(edges, targetNode.id, 'start-frame'), nodes)[0];
  }

  const lookup = nodeById(nodes);
  const explicit = targetNode.frameInputs?.find(frame => frame.order === 'start');
  if (explicit) return lookup.get(explicit.nodeId);
  return legacyParents(targetNode, nodes).find(node => String(node.type) !== '文本');
}

export function getEndFrameInput(
  targetNode: NodeData,
  nodes: NodeData[],
  edges: CanvasEdge[]
): NodeData | undefined {
  const incoming = getIncomingEdges(edges, targetNode.id);
  if (incoming.length > 0) {
    return sourceNodesForEdges(getInputEdgesByPort(edges, targetNode.id, 'end-frame'), nodes)[0];
  }

  const lookup = nodeById(nodes);
  const explicit = targetNode.frameInputs?.find(frame => frame.order === 'end');
  if (explicit) return lookup.get(explicit.nodeId);
  return legacyParents(targetNode, nodes).filter(node => String(node.type) !== '文本')[1];
}

export function getMotionReferenceInput(
  targetNode: NodeData,
  nodes: NodeData[],
  edges: CanvasEdge[]
): NodeData | undefined {
  const incoming = getIncomingEdges(edges, targetNode.id);
  if (incoming.length > 0) {
    return sourceNodesForEdges(getInputEdgesByPort(edges, targetNode.id, 'motion-reference'), nodes)[0];
  }
  return legacyParents(targetNode, nodes).find(node => String(node.type) === '视频');
}

export function getConnectedVideoInput(
  targetNode: NodeData,
  nodes: NodeData[],
  edges: CanvasEdge[]
): NodeData | undefined {
  const incoming = getIncomingEdges(edges, targetNode.id);
  if (incoming.length > 0) {
    return sourceNodesForEdges(incoming.filter(edge => edge.dataType === 'video'), nodes)[0];
  }
  return legacyParents(targetNode, nodes).find(node =>
    ['视频', '视频编辑器', '本地视频模型'].includes(String(node.type))
  );
}

export function getAudioReferenceInput(
  targetNode: NodeData,
  nodes: NodeData[],
  edges: CanvasEdge[]
): NodeData | undefined {
  if (String(targetNode.type) !== '视频') return undefined;
  const incoming = getIncomingEdges(edges, targetNode.id);
  if (incoming.length === 0) return undefined;

  return sourceNodesForEdges(
    getInputEdgesByPort(edges, targetNode.id, 'audio-reference').filter(edge => edge.dataType === 'audio'),
    nodes
  ).find(node => String(node.type) === '音频');
}
