import type { NodeData, NodeGroup, Viewport } from '../../types';
import type { CanvasEdge } from '../graph/graphTypes';

export const CURRENT_WORKFLOW_SCHEMA_VERSION = 4;
export const LEGACY_WORKFLOW_SCHEMA_VERSION = 1;

export interface WorkflowData {
  schemaVersion: number;
  id: string | null;
  title: string;
  nodes: NodeData[];
  edges: CanvasEdge[];
  groups: NodeGroup[];
  viewport: Viewport;
  [key: string]: unknown;
}

export type WorkflowDataInput = Pick<
  WorkflowData,
  'id' | 'title' | 'nodes' | 'edges' | 'groups' | 'viewport'
> & Record<string, unknown>;

export function createWorkflowData(input: WorkflowDataInput): WorkflowData {
  return {
    ...input,
    schemaVersion: CURRENT_WORKFLOW_SCHEMA_VERSION
  };
}
