/**
 * useWorkflow.ts
 *
 * Custom hook for managing workflow save/load functionality.
 * Handles persistence to the backend server.
 */

import React, { useState, useCallback, Dispatch, SetStateAction } from 'react';
import { NodeData, NodeGroup, Viewport } from '../types';
import { apiGet, apiPost } from '../services/apiClient';
import { normalizeLegacyNodeTakes } from '../utils/takeHelpers';
import { normalizeWorkflowNode } from '../utils/nodeTypeHelpers';

interface WorkflowData {
    id: string | null;
    title: string;
    nodes: NodeData[];
    groups: NodeGroup[];
    viewport: Viewport;
}

interface UseWorkflowOptions {
    nodes: NodeData[];
    groups: NodeGroup[];
    viewport: Viewport;
    canvasTitle: string;
    setNodes: Dispatch<SetStateAction<NodeData[]>>;
    setGroups: Dispatch<SetStateAction<NodeGroup[]>>;
    setSelectedNodeIds: Dispatch<SetStateAction<string[]>>;
    setCanvasTitle: (title: string) => void;
    setEditingTitleValue: (value: string) => void;
    onPanelOpen?: () => void;
}

export const useWorkflow = ({
    nodes,
    groups,
    viewport,
    canvasTitle,
    setNodes,
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
            const workflow: WorkflowData = {
                id: workflowId,
                title: canvasTitle,
                nodes,
                groups,
                viewport
            };

            const result = await apiPost<{ id: string }>('/api/workflows', workflow);
            setWorkflowId(result.id);
            console.log('Workflow saved:', result.id);
        } catch (error) {
            console.error('Failed to save workflow:', error);
        }
    }, [workflowId, canvasTitle, nodes, groups, viewport]);

    const handleLoadWorkflow = useCallback(async (id: string): Promise<{ nodeCount: number; title: string } | null> => {
        try {
            const isPublic = id.startsWith('public:');
            const targetWorkflowId = isPublic ? id.replace('public:', '') : id;
            const endpoint = isPublic
                ? `/api/public-workflows/${targetWorkflowId}`
                : `/api/workflows/${targetWorkflowId}`;

            const workflow = await apiGet<WorkflowData>(endpoint);
            const title = workflow.title || '未命名';

            setWorkflowId(isPublic ? null : workflow.id);
            setCanvasTitle(title);
            setEditingTitleValue(title);
            setNodes((workflow.nodes || []).map(node => normalizeLegacyNodeTakes(normalizeWorkflowNode(node))));
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
    }, [setNodes, setGroups, setSelectedNodeIds, setCanvasTitle, setEditingTitleValue]);

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
