/**
 * useGenerationRecovery.ts
 * 
 * Custom hook that checks for nodes in 'loading' status and polls
 * the backend to see if their generation has finished.
 */

import { useEffect, useCallback, useRef } from 'react';
import { NodeData, NodeStatus } from '../types';
import { apiGet } from '../services/apiClient';
import { queryGenerationTasks } from '../services/generationService';
import type { GenerationTask } from '../domain/generation/generationTask';
import {
    buildGenerationTaskNodeUpdate,
    canApplyGenerationTaskResult
} from '../utils/generationTaskHelpers';
import { buildGenerationSuccessUpdate } from '../utils/takeHelpers';
import { extractVideoLastFrame } from '../utils/videoHelpers';

interface UseGenerationRecoveryOptions {
    nodes: NodeData[];
    updateNode: (id: string, updates: Partial<NodeData>) => void;
}

const TASK_POLL_INTERVAL_MS = 3000;

function getClosestAspectRatio(width: number, height: number): string {
    const ratio = width / height;
    const candidates = [
        ['1:1', 1],
        ['16:9', 16 / 9],
        ['9:16', 9 / 16],
        ['4:3', 4 / 3],
        ['3:4', 3 / 4],
        ['3:2', 3 / 2],
        ['2:3', 2 / 3],
        ['5:4', 5 / 4],
        ['4:5', 4 / 5],
        ['21:9', 21 / 9]
    ] as const;
    return candidates.reduce((closest, candidate) =>
        Math.abs(ratio - candidate[1]) < Math.abs(ratio - closest[1]) ? candidate : closest
    )[0];
}

function readImageResultAspectRatio(url: string): Promise<string | undefined> {
    return new Promise(resolve => {
        const image = new Image();
        image.onload = () => resolve(`${image.naturalWidth}/${image.naturalHeight}`);
        image.onerror = () => resolve(undefined);
        image.src = url;
    });
}

function readVideoResultAspectRatio(url: string): Promise<Partial<Pick<NodeData, 'resultAspectRatio' | 'aspectRatio'>>> {
    return new Promise(resolve => {
        const video = document.createElement('video');
        video.onloadedmetadata = () => resolve({
            resultAspectRatio: `${video.videoWidth}/${video.videoHeight}`,
            aspectRatio: getClosestAspectRatio(video.videoWidth, video.videoHeight)
        });
        video.onerror = () => resolve({});
        video.src = url;
    });
}

export const useGenerationRecovery = ({
    nodes,
    updateNode
}: UseGenerationRecoveryOptions) => {
    // Use a ref to access current nodes without causing re-renders
    const nodesRef = useRef<NodeData[]>(nodes);
    const isCheckingRef = useRef(false);
    nodesRef.current = nodes;

    const checkLegacyStatus = useCallback(async (nodeId: string) => {
        try {
            const data = await apiGet<any>(`/api/generation-status/${nodeId}`);
            if (data.status === 'success' && data.resultUrl) {
                const node = nodesRef.current.find(n => n.id === nodeId);
                if (!node || node.activeTaskId) return;
                const generationMarker = node.generationStartTime;

                // Race condition check: If node has a generationStartTime, compare with result's createdAt
                // This prevents applying stale results from previous generations
                if (generationMarker && data.createdAt) {
                    const resultCreatedAt = new Date(data.createdAt).getTime();
                    if (resultCreatedAt < generationMarker) {
                        // Stale result, skip silently (don't spam console)
                        return;
                    }
                }

                console.log(`[Recovery] Found new result for node ${nodeId}`);
                const extraUpdates: Partial<NodeData> = {};

                // If it's a video, extract the last frame for chaining
                if (data.type === 'video') {
                    try {
                        const lastFrame = await extractVideoLastFrame(data.resultUrl);
                        extraUpdates.lastFrame = lastFrame;
                    } catch (err) {
                        console.error(`[Recovery] Failed to extract last frame for node ${nodeId}:`, err);
                    }
                }

                const currentNode = nodesRef.current.find(candidate => candidate.id === nodeId);
                if (!currentNode || currentNode.activeTaskId) return;
                if (generationMarker && currentNode.generationStartTime !== generationMarker) return;
                updateNode(nodeId, {
                    ...buildGenerationSuccessUpdate(currentNode, { resultUrl: data.resultUrl, take: data.take }),
                    ...extraUpdates
                });
            } else if (data.status === 'error' || data.status === 'cancelled') {
                const node = nodesRef.current.find(candidate => candidate.id === nodeId);
                if (node?.generationStartTime && data.createdAt) {
                    const taskCreatedAt = new Date(data.createdAt).getTime();
                    if (taskCreatedAt < node.generationStartTime) return;
                }
                updateNode(nodeId, {
                    status: NodeStatus.ERROR,
                    errorMessage: data.error?.message || (data.status === 'cancelled'
                        ? 'Generation was cancelled.'
                        : 'Generation failed.'),
                    activeTaskId: undefined,
                    lastTaskId: data.task?.taskId,
                    generationStartTime: undefined
                });
            }
        } catch (error) {
            console.error(`[Recovery] Error checking status for node ${nodeId}:`, error);
        }
    }, [updateNode]); // Only updateNode as dependency, nodes accessed via ref

    const applyTask = useCallback(async (task: GenerationTask) => {
        const node = nodesRef.current.find(candidate => candidate.id === task.nodeId);
        if (!node || !canApplyGenerationTaskResult(node, task)) return;
        if (task.status !== 'succeeded' && task.status !== 'failed' && task.status !== 'cancelled') return;

        const extraUpdates: Partial<NodeData> = {};
        if (task.status === 'succeeded' && task.output?.resultUrl) {
            if (task.operation === 'generate-video') {
                try {
                    const [lastFrame, videoMetadata] = await Promise.all([
                        extractVideoLastFrame(task.output.resultUrl),
                        readVideoResultAspectRatio(task.output.resultUrl)
                    ]);
                    extraUpdates.lastFrame = lastFrame;
                    Object.assign(extraUpdates, videoMetadata);
                } catch (error) {
                    console.error(`[Recovery] Failed to inspect video result for task ${task.taskId}:`, error);
                }
            } else {
                extraUpdates.resultAspectRatio = await readImageResultAspectRatio(task.output.resultUrl);
            }
        }

        const currentNode = nodesRef.current.find(candidate => candidate.id === task.nodeId);
        if (!currentNode || !canApplyGenerationTaskResult(currentNode, task)) return;
        updateNode(currentNode.id, {
            ...buildGenerationTaskNodeUpdate(currentNode, task),
            ...extraUpdates
        });
    }, [updateNode]);

    // Track loading node IDs for stable dependency
    const loadingNodeIds = nodes
        .filter(n => n.status === NodeStatus.LOADING)
        .map(n => `${n.id}:${n.activeTaskId || 'legacy'}`)
        .join(',');

    useEffect(() => {
        if (!loadingNodeIds) return;

        const loadingNodes = loadingNodeIds.split(',').map(value => {
            const separator = value.indexOf(':');
            return {
                nodeId: value.slice(0, separator),
                taskId: value.slice(separator + 1) === 'legacy' ? undefined : value.slice(separator + 1)
            };
        });

        const checkAll = async () => {
            if (isCheckingRef.current) return;
            isCheckingRef.current = true;
            try {
                const taskIds = loadingNodes
                    .map(node => node.taskId)
                    .filter((taskId): taskId is string => Boolean(taskId));

                if (taskIds.length > 0) {
                    try {
                        const tasks = await queryGenerationTasks({ taskIds });
                        const tasksById = new Map(tasks.map(task => [task.taskId, task]));
                        await Promise.all(tasks.map(task => applyTask(task)));

                        const missingTaskNodes = loadingNodes.filter(node => node.taskId && !tasksById.has(node.taskId));
                        await Promise.all(missingTaskNodes.map(node => checkLegacyStatus(node.nodeId)));
                    } catch (error) {
                        console.error('[Recovery] Error querying generation tasks:', error);
                    }
                }

                const legacyNodes = loadingNodes.filter(node => !node.taskId);
                await Promise.all(legacyNodes.map(node => checkLegacyStatus(node.nodeId)));
            } finally {
                isCheckingRef.current = false;
            }
        };

        void checkAll(); // Initial check

        const interval = setInterval(() => { void checkAll(); }, TASK_POLL_INTERVAL_MS);

        return () => clearInterval(interval);
    }, [loadingNodeIds, applyTask, checkLegacyStatus]); // Stable string dependency instead of nodes array
};

