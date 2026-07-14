import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';

import type { NodeData, NodeGroup, Viewport } from '../types.ts';
import type { CanvasEdge } from '../domain/graph/graphTypes.ts';
import {
  createWorkflowTemplateDraft,
  instantiateWorkflowTemplate,
  type InstantiatedWorkflowTemplate,
  type WorkflowTemplate
} from '../domain/templates/workflowTemplates.ts';
import { apiGet, apiPost } from '../services/apiClient.ts';

interface UseWorkflowTemplatesOptions {
  nodes: NodeData[];
  edges: CanvasEdge[];
  groups: NodeGroup[];
  viewport: Viewport;
  replaceGraph: (nodes: NodeData[], edges: CanvasEdge[]) => void;
  setGroups: Dispatch<SetStateAction<NodeGroup[]>>;
  setSelectedNodeIds: Dispatch<SetStateAction<string[]>>;
}

interface SaveWorkflowTemplateOptions {
  title: string;
  description?: string;
  selectedNodeIds: string[];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function viewportCenter(viewport: Viewport): { x: number; y: number } {
  const width = typeof window === 'undefined' ? 1200 : window.innerWidth;
  const height = typeof window === 'undefined' ? 800 : window.innerHeight;
  return {
    x: (width / 2 - viewport.x) / viewport.zoom,
    y: (height / 2 - viewport.y) / viewport.zoom
  };
}

export function useWorkflowTemplates({
  nodes,
  edges,
  groups,
  viewport,
  replaceGraph,
  setGroups,
  setSelectedNodeIds
}: UseWorkflowTemplatesOptions) {
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [isInsertingTemplate, setIsInsertingTemplate] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);

  const saveWorkflowTemplate = useCallback(async ({
    title,
    description,
    selectedNodeIds
  }: SaveWorkflowTemplateOptions): Promise<WorkflowTemplate> => {
    setIsSavingTemplate(true);
    setTemplateError(null);
    try {
      const draft = createWorkflowTemplateDraft({
        title,
        description,
        nodes,
        edges,
        groups,
        selectedNodeIds
      });
      const result = await apiPost<{ success: true; template: WorkflowTemplate }>('/api/workflow-templates', draft);
      return result.template;
    } catch (error) {
      const message = errorMessage(error);
      setTemplateError(message);
      throw error;
    } finally {
      setIsSavingTemplate(false);
    }
  }, [nodes, edges, groups]);

  const insertWorkflowTemplate = useCallback(async (templateId: string): Promise<InstantiatedWorkflowTemplate> => {
    setIsInsertingTemplate(true);
    setTemplateError(null);
    try {
      const template = await apiGet<unknown>(`/api/workflow-templates/${templateId}`);
      const inserted = instantiateWorkflowTemplate(template, {
        anchor: viewportCenter(viewport)
      });
      replaceGraph(
        [...nodes, ...inserted.nodes],
        [...edges, ...inserted.edges]
      );
      setGroups(previous => [...previous, ...inserted.groups]);
      setSelectedNodeIds(inserted.nodes.map(node => node.id));
      return inserted;
    } catch (error) {
      const message = errorMessage(error);
      setTemplateError(message);
      throw error;
    } finally {
      setIsInsertingTemplate(false);
    }
  }, [nodes, edges, viewport, replaceGraph, setGroups, setSelectedNodeIds]);

  const clearTemplateError = useCallback(() => {
    setTemplateError(null);
  }, []);

  return {
    isSavingTemplate,
    isInsertingTemplate,
    templateError,
    saveWorkflowTemplate,
    insertWorkflowTemplate,
    clearTemplateError
  };
}
