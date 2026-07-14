import type { NodeData, NodeGroup, Viewport } from '../../types';
import type { CanvasEdge } from '../graph/graphTypes';
import { createEmptyTimelineDocument, normalizeTimelineDocument } from '../timeline/timelineDocument.ts';
import type { TimelineDocument } from '../timeline/timelineTypes.ts';

export const CURRENT_WORKFLOW_SCHEMA_VERSION = 8;
export const LEGACY_WORKFLOW_SCHEMA_VERSION = 1;

export interface WorkflowData {
  schemaVersion: number;
  id: string | null;
  title: string;
  nodes: NodeData[];
  edges: CanvasEdge[];
  groups: NodeGroup[];
  viewport: Viewport;
  timeline: TimelineDocument;
  [key: string]: unknown;
}

export type WorkflowDataInput = Omit<Pick<
  WorkflowData,
  'id' | 'title' | 'nodes' | 'edges' | 'groups' | 'viewport' | 'timeline'
>, 'timeline'> & {
  timeline?: unknown;
} & Record<string, unknown>;

export function createWorkflowData(input: WorkflowDataInput): WorkflowData {
  const { timeline, ...workflow } = input;
  return {
    ...workflow,
    schemaVersion: CURRENT_WORKFLOW_SCHEMA_VERSION,
    timeline: timeline === undefined
      ? createEmptyTimelineDocument()
      : normalizeTimelineDocument(timeline)
  };
}
