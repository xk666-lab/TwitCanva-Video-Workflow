import type { NodeData } from '../../types';
import { getNodePort } from '../nodes/nodeRegistry.ts';
import type {
  CanvasEdge,
  ConnectionValidationResult,
  NodePortDefinition
} from './graphTypes.ts';

export type ConnectionPortResolution =
  | {
      valid: true;
      sourcePort: NodePortDefinition;
      targetPort: NodePortDefinition;
    }
  | {
      valid: false;
      code: string;
      message: string;
    };

export interface ValidateConnectionInput {
  sourceNode?: NodeData;
  sourcePort?: NodePortDefinition;
  targetNode?: NodeData;
  targetPort?: NodePortDefinition;
  existingEdges: CanvasEdge[];
}

function isDataTypeCompatible(source: NodePortDefinition, target: NodePortDefinition): boolean {
  return source.dataType === 'any' || target.dataType === 'any' || source.dataType === target.dataType;
}

function wouldCreateCycle(sourceNodeId: string, targetNodeId: string, edges: CanvasEdge[]): boolean {
  const visited = new Set<string>();
  const pending = [targetNodeId];

  while (pending.length > 0) {
    const current = pending.pop()!;
    if (current === sourceNodeId) return true;
    if (visited.has(current)) continue;
    visited.add(current);

    for (const edge of edges) {
      if (edge.sourceNodeId === current) pending.push(edge.targetNodeId);
    }
  }

  return false;
}

export function validateConnection({
  sourceNode,
  sourcePort,
  targetNode,
  targetPort,
  existingEdges
}: ValidateConnectionInput): ConnectionValidationResult {
  if (!sourceNode || !targetNode) {
    return { valid: false, code: 'missing_node', message: '找不到连接的源节点或目标节点。' };
  }
  if (!sourcePort || !targetPort) {
    return { valid: false, code: 'missing_port', message: '找不到对应的输入或输出端口。' };
  }
  if (sourcePort.enabled === false || targetPort.enabled === false) {
    return { valid: false, code: 'port_disabled', message: '该端口在当前阶段尚未开放。' };
  }
  if (sourcePort.direction !== 'output') {
    return { valid: false, code: 'invalid_source_direction', message: '连接必须从输出端口开始。' };
  }
  if (targetPort.direction !== 'input') {
    return { valid: false, code: 'invalid_target_direction', message: '连接必须指向输入端口。' };
  }
  if (sourceNode.id === targetNode.id) {
    return { valid: false, code: 'self_connection', message: '节点不能连接到自身。' };
  }
  if (!isDataTypeCompatible(sourcePort, targetPort)) {
    return {
      valid: false,
      code: 'incompatible_data_type',
      message: `无法把 ${sourcePort.dataType} 数据连接到 ${targetPort.dataType} 端口。`
    };
  }

  const duplicate = existingEdges.some(edge =>
    edge.sourceNodeId === sourceNode.id &&
    edge.sourcePortId === sourcePort.id &&
    edge.targetNodeId === targetNode.id &&
    edge.targetPortId === targetPort.id
  );
  if (duplicate) {
    return { valid: false, code: 'duplicate_edge', message: '这条连接已经存在。' };
  }

  const currentTargetConnections = existingEdges.filter(edge =>
    edge.targetNodeId === targetNode.id && edge.targetPortId === targetPort.id
  ).length;
  const limit = targetPort.maxConnections ?? (targetPort.multiple ? Number.POSITIVE_INFINITY : 1);
  if (currentTargetConnections >= limit) {
    return { valid: false, code: 'target_port_full', message: `${targetPort.label}端口已达到连接上限。` };
  }

  if (wouldCreateCycle(sourceNode.id, targetNode.id, existingEdges)) {
    return { valid: false, code: 'cycle_detected', message: '该连接会形成循环，当前工作流不允许循环。' };
  }

  return { valid: true };
}

function resolved(sourceNode: NodeData, sourcePortId: string, targetNode: NodeData, targetPortId: string): ConnectionPortResolution {
  const sourcePort = getNodePort(sourceNode.type, sourcePortId);
  const targetPort = getNodePort(targetNode.type, targetPortId);
  if (!sourcePort || !targetPort) {
    return { valid: false, code: 'missing_port', message: '节点没有可用于此次连接的端口。' };
  }
  return { valid: true, sourcePort, targetPort };
}

function hasInputEdge(edges: CanvasEdge[], targetNodeId: string, targetPortId: string): boolean {
  return edges.some(edge => edge.targetNodeId === targetNodeId && edge.targetPortId === targetPortId);
}

const IMAGE_NODE_TYPES = new Set(['图片', '图片编辑器', '镜头角度', '本地图片模型']);

export function resolveConnectionPorts(
  sourceNode: NodeData | undefined,
  targetNode: NodeData | undefined,
  existingEdges: CanvasEdge[]
): ConnectionPortResolution {
  if (!sourceNode || !targetNode) {
    return { valid: false, code: 'missing_node', message: '找不到连接的源节点或目标节点。' };
  }

  const sourceType = String(sourceNode.type);
  const targetType = String(targetNode.type);

  if (sourceType === '文本') {
    if (['图片', '视频', '本地图片模型', '本地视频模型'].includes(targetType)) {
      return resolved(sourceNode, 'text-output', targetNode, 'prompt-input');
    }
    return { valid: false, code: 'no_compatible_port', message: '文本只能连接到支持提示词输入的生成节点。' };
  }

  if (IMAGE_NODE_TYPES.has(sourceType)) {
    if (targetType === '图片' || targetType === '本地图片模型') {
      return resolved(sourceNode, 'image-output', targetNode, 'reference-images');
    }
    if (targetType === '图片编辑器' || targetType === '镜头角度') {
      return resolved(sourceNode, 'image-output', targetNode, 'image-input');
    }
    if (targetType === '本地视频模型') {
      return resolved(sourceNode, 'image-output', targetNode, 'start-frame');
    }
    if (targetType === '视频') {
      const hasMotionReference = hasInputEdge(existingEdges, targetNode.id, 'motion-reference');
      if (hasMotionReference) {
        return resolved(sourceNode, 'image-output', targetNode, 'reference-images');
      }
      if (!hasInputEdge(existingEdges, targetNode.id, 'start-frame')) {
        return resolved(sourceNode, 'image-output', targetNode, 'start-frame');
      }
      if (!hasInputEdge(existingEdges, targetNode.id, 'end-frame')) {
        return resolved(sourceNode, 'image-output', targetNode, 'end-frame');
      }
      return resolved(sourceNode, 'image-output', targetNode, 'reference-images');
    }
  }

  if (sourceType === '视频') {
    if (targetType === '视频编辑器') {
      return resolved(sourceNode, 'video-output', targetNode, 'video-input');
    }
    if (targetType === '视频') {
      const usesMotionReference = targetNode.videoModel === 'kling-v2-6' || targetNode.videoMode === 'motion-control';
      if (usesMotionReference) return resolved(sourceNode, 'video-output', targetNode, 'motion-reference');
      if (!hasInputEdge(existingEdges, targetNode.id, 'start-frame')) {
        return resolved(sourceNode, 'last-frame-output', targetNode, 'start-frame');
      }
      if (!hasInputEdge(existingEdges, targetNode.id, 'end-frame')) {
        return resolved(sourceNode, 'last-frame-output', targetNode, 'end-frame');
      }
      return resolved(sourceNode, 'last-frame-output', targetNode, 'reference-images');
    }
  }

  if (sourceType === '视频编辑器' && targetType === '视频') {
    if (!hasInputEdge(existingEdges, targetNode.id, 'start-frame')) {
      return resolved(sourceNode, 'last-frame-output', targetNode, 'start-frame');
    }
    if (!hasInputEdge(existingEdges, targetNode.id, 'end-frame')) {
      return resolved(sourceNode, 'last-frame-output', targetNode, 'end-frame');
    }
    return resolved(sourceNode, 'last-frame-output', targetNode, 'reference-images');
  }

  return { valid: false, code: 'no_compatible_port', message: '这两个节点之间没有兼容的端口。' };
}
