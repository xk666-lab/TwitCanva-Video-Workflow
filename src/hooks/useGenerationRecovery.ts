/**
 * useGenerationRecovery.ts
 * 
 * Custom hook that checks for nodes in 'loading' status and polls
 * the backend to see if their generation has finished.
 */

import { useEffect, useCallback, useRef } from 'react';
import { NodeData, NodeStatus } from '../types';
import { apiGet } from '../services/apiClient';
import { buildGenerationSuccessUpdate } from '../utils/takeHelpers';
import { extractVideoLastFrame } from '../utils/videoHelpers';

interface UseGenerationRecoveryOptions {
    nodes: NodeData[];
    updateNode: (id: string, updates: Partial<NodeData>) => void;
}

export const useGenerationRecovery = ({
    nodes,
    updateNode
}: UseGenerationRecoveryOptions) => {
    // Use a ref to access current nodes without causing re-renders
    const nodesRef = useRef<NodeData[]>(nodes);
    nodesRef.current = nodes;

    const checkStatus = useCallback(async (nodeId: string) => {
        try {
            const data = await apiGet<any>(`/api/generation-status/${nodeId}`);
            if (data.status === 'success' && data.resultUrl) {
                // Access nodes via ref to avoid stale closure
                const node = nodesRef.current.find(n => n.id === nodeId);

                // Race condition check: If node has a generationStartTime, compare with result's createdAt
                // This prevents applying stale results from previous generations
                if (node?.generationStartTime && data.createdAt) {
                    const resultCreatedAt = new Date(data.createdAt).getTime();
                    if (resultCreatedAt < node.generationStartTime) {
                        // Stale result, skip silently (don't spam console)
                        return;
                    }
                }

                console.log(`[Recovery] Found new result for node ${nodeId}`);

                const updates: Partial<NodeData> = node
                    ? buildGenerationSuccessUpdate(node, { resultUrl: data.resultUrl, take: data.take })
                    : {
                        status: NodeStatus.SUCCESS,
                        resultUrl: data.resultUrl,
                        errorMessage: undefined,
                        generationStartTime: undefined
                    };

                // If it's a video, extract the last frame for chaining
                if (data.type === 'video') {
                    try {
                        const lastFrame = await extractVideoLastFrame(data.resultUrl);
                        updates.lastFrame = lastFrame;
                    } catch (err) {
                        console.error(`[Recovery] Failed to extract last frame for node ${nodeId}:`, err);
                    }
                }

                updateNode(nodeId, updates);
            }
        } catch (error) {
            console.error(`[Recovery] Error checking status for node ${nodeId}:`, error);
        }
    }, [updateNode]); // Only updateNode as dependency, nodes accessed via ref

    // Track loading node IDs for stable dependency
    const loadingNodeIds = nodes
        .filter(n => n.status === NodeStatus.LOADING)
        .map(n => n.id)
        .join(',');

    useEffect(() => {
        if (!loadingNodeIds) return;

        const nodeIds = loadingNodeIds.split(',');

        // Check each loading node every 10 seconds
        const checkAll = () => {
            nodeIds.forEach(nodeId => checkStatus(nodeId));
        };

        checkAll(); // Initial check

        const interval = setInterval(checkAll, 10000); // Check every 10s

        return () => clearInterval(interval);
    }, [loadingNodeIds, checkStatus]); // Stable string dependency instead of nodes array
};

