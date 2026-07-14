/**
 * useWorkflow.ts
 *
 * Custom hook for managing workflow save/load functionality.
 * Handles persistence to the backend server.
 */

import React, { useState, useCallback, Dispatch, SetStateAction } from 'react';
import { NodeData, NodeGroup, Viewport } from '../types';
import { apiGet, apiPost } from '../services/apiClient';
import { createWorkflowData } from '../domain/workflow/workflowSchema';
import { migrateWorkflow } from '../domain/workflow/migrateWorkflow';
import type { CanvasEdge } from '../domain/graph/graphTypes';
import { syncLegacyStoryboardContexts } from '../domain/storyboard/storyboardGraph';

interface UseWorkflowOptions {
    nodes: NodeData[];
    edges: CanvasEdge[];
    groups: NodeGroup[];
    viewport: Viewport;
    canvasTitle: string;
    replaceGraph: (nodes: NodeData[], edges: CanvasEdge[]) => void;
    setGroups: Dispatch<SetStateAction<NodeGroup[]>>;
    setSelectedNodeIds: Dispatch<SetStateAction<string[]>>;
    setCanvasTitle: (title: string) => void;
    setEditingTitleValue: (value: string) => void;
    onPanelOpen?: () => void;
}

export const useWorkflow = ({
    nodes,
    edges,
    groups,
    viewport,
    canvasTitle,
    replaceGraph,
    setGroups,
    setSelectedNodeIds,
    setCanvasTitle,
    setEditingTitleValue,
    onPanelOpen
}: UseWorkflowOptions) => {
    const [workflowId, setWorkflowId] = useState<string | null>(null);
    const [isWorkflowPanelOpen, setIsWorkflowPanelOpen] = useState(false);
    const [workflowPanelY, setWorkflowPanelY] = useState(0);

    const handleSaveWorkflow = useCallback(async () => {
        try {
            const workflow = createWorkflowData({
                id: workflowId,
                title: canvasTitle,
                nodes,
                edges,
                groups: syncLegacyStoryboardContexts(nodes, groups),
                viewport
            });

            const result = await apiPost<{ id: string }>('/api/workflows', workflow);
            setWorkflowId(result.id);
            console.log('Workflow saved:', result.id);
        } catch (error) {
            console.error('Failed to save workflow:', error);
        }
    }, [workflowId, canvasTitle, nodes, edges, groups, viewport]);

    const handleLoadWorkflow = useCallback(async (id: string): Promise<{ nodeCount: number; title: string } | null> => {
        try {
            const isPublic = id.startsWith('public:');
            const targetWorkflowId = isPublic ? id.replace('public:', '') : id;
            const endpoint = isPublic
                ? `/api/public-workflows/${targetWorkflowId}`
                : `/api/workflows/${targetWorkflowId}`;

            const rawWorkflow = await apiGet<unknown>(endpoint);
            const workflow = migrateWorkflow(rawWorkflow);
            const title = workflow.title || '未命名';

            setWorkflowId(isPublic ? null : workflow.id);
            setCanvasTitle(title);
            setEditingTitleValue(title);
            replaceGraph(workflow.nodes, workflow.edges);
            setGroups(workflow.groups || []);
            setSelectedNodeIds([]);
            setIsWorkflowPanelOpen(false);
            console.log(isPublic ? 'Public workflow loaded:' : 'Workflow loaded:', targetWorkflowId);

            return {
                nodeCount: (workflow.nodes || []).length,
                title
            };
        } catch (error) {
            console.error('Failed to load workflow:', error);
        }
        return null;
    }, [replaceGraph, setGroups, setSelectedNodeIds, setCanvasTitle, setEditingTitleValue]);

    const handleWorkflowsClick = useCallback((e: React.MouseEvent) => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setWorkflowPanelY(rect.top);
        setIsWorkflowPanelOpen(prev => !prev);
        onPanelOpen?.();
    }, [onPanelOpen]);

    const closeWorkflowPanel = useCallback(() => {
        setIsWorkflowPanelOpen(false);
    }, []);

    const resetWorkflowId = useCallback(() => {
        setWorkflowId(null);
    }, []);

    return {
        workflowId,
        isWorkflowPanelOpen,
        workflowPanelY,
        handleSaveWorkflow,
        handleLoadWorkflow,
        handleWorkflowsClick,
        closeWorkflowPanel,
        resetWorkflowId
    };
};
