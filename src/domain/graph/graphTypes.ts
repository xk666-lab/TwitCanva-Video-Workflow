export type PortDataType = 'text' | 'image' | 'video' | 'audio' | 'script' | 'storyboard' | 'any';

export interface NodePortDefinition {
  id: string;
  label: string;
  direction: 'input' | 'output';
  dataType: PortDataType;
  required?: boolean;
  multiple?: boolean;
  maxConnections?: number;
  ordered?: boolean;
  role?: string;
  enabled?: boolean;
}

export interface CanvasEdge {
  schemaVersion: number;
  id: string;
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
  dataType: PortDataType;
  order?: number;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}

export interface ConnectionValidationResult {
  valid: boolean;
  code?: string;
  message?: string;
}

export const CURRENT_EDGE_SCHEMA_VERSION = 1;
