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
    buildGenerationTaskNodeUpdates,
    getUniqueActiveTaskIds,
    recoverMissingMediaTaskNodes
} from '../domain/generation/taskResultUpdates';
import type { NodeUpdateMap } from '../domain/nodes/nodeUpdates';
import { buildGenerationSuccessUpdate } from '../utils/takeHelpers';
import { extractVideoLastFrame } from '../utils/videoHelpers';

interface UseGenerationRecoveryOptions {
    nodes: NodeData[];
    updateNode: (id: string, updates: Partial<NodeData>) => void;
    applyNodeUpdates: (updates: NodeUpdateMap) => void;
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
    updateNode,
    applyNodeUpdates
}: UseGenerationRecoveryOptions) => {
    // Use a ref to access current nodes without causing re-renders
    const nodesRef = useRef<NodeData[]>(nodes);
    const isCheckingRef = useRef(false);
    nodesRef.current = nodes;

    const checkLegacyStatus = useCallback(async (nodeId: string, expectedTaskId?: string) => {
        try {
            const data = await apiGet<any>(`/api/generation-status/${nodeId}`);
            if (expectedTaskId && data.task?.taskId && data.task.taskId !== expectedTaskId) return;
            if (data.status === 'success' && data.resultUrl) {
                const node = nodesRef.current.find(n => n.id === nodeId);
                if (!node || (expectedTaskId ? node.activeTaskId !== expectedTaskId : node.activeTaskId)) return;
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
                if (!currentNode || (expectedTaskId
                    ? currentNode.activeTaskId !== expectedTaskId
                    : currentNode.activeTaskId)) return;
                if (generationMarker && currentNode.generationStartTime !== generationMarker) return;
                updateNode(nodeId, {
                    ...buildGenerationSuccessUpdate(currentNode, { resultUrl: data.resultUrl, take: data.take }),
                    ...extraUpdates,
                    ...(expectedTaskId ? {
                        activeTaskId: undefined,
                        lastTaskId: expectedTaskId
                    } : {})
                });
            } else if (data.status === 'error' || data.status === 'cancelled') {
                const node = nodesRef.current.find(candidate => candidate.id === nodeId);
                if (expectedTaskId && node?.activeTaskId !== expectedTaskId) return;
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
                    lastTaskId: expectedTaskId || data.task?.taskId,
                    generationStartTime: undefined
                });
            }
        } catch (error) {
            console.error(`[Recovery] Error checking status for node ${nodeId}:`, error);
        }
    }, [updateNode]); // Only updateNode as dependency, nodes accessed via ref

    const applyTask = useCallback(async (task: GenerationTask) => {
        const updates = buildGenerationTaskNodeUpdates(nodesRef.current, task);
        if (Object.keys(updates).length === 0) return;

        const extraUpdates: Partial<NodeData> = {};
        const mediaResultUrl = task.status === 'succeeded' && task.operation !== 'generate-story-package'
            ? task.output?.resultUrl
            : undefined;
        if (mediaResultUrl) {
            if (task.operation === 'generate-video') {
                try {
                    const [lastFrame, videoMetadata] = await Promise.all([
                        extractVideoLastFrame(mediaResultUrl),
                        readVideoResultAspectRatio(mediaResultUrl)
                    ]);
                    extraUpdates.lastFrame = lastFrame;
                    Object.assign(extraUpdates, videoMetadata);
                } catch (error) {
                    console.error(`[Recovery] Failed to inspect video result for task ${task.taskId}:`, error);
                }
            } else {
                extraUpdates.resultAspectRatio = await readImageResultAspectRatio(mediaResultUrl);
            }

            const currentUpdates = buildGenerationTaskNodeUpdates(nodesRef.current, task);
            if (Object.keys(currentUpdates).length === 0) return;
            updates[task.nodeId] = {
                ...currentUpdates[task.nodeId],
                ...extraUpdates
            };
        }
        applyNodeUpdates(updates);
    }, [applyNodeUpdates]);

    const loadingNodes = nodes.filter(node => node.status === NodeStatus.LOADING);
    const activeTaskIds = getUniqueActiveTaskIds(loadingNodes).sort();
    const legacyLoadingNodeIds = loadingNodes
        .filter(node => !node.activeTaskId)
        .map(node => node.id)
        .sort();
    const recoveryKey = `${activeTaskIds.join(',')}|${legacyLoadingNodeIds.join(',')}`;

    useEffect(() => {
        const [serializedTaskIds = '', serializedLegacyNodeIds = ''] = recoveryKey.split('|');
        const taskIds = serializedTaskIds ? serializedTaskIds.split(',') : [];
        const legacyNodeIds = serializedLegacyNodeIds ? serializedLegacyNodeIds.split(',') : [];
        if (taskIds.length === 0 && legacyNodeIds.length === 0) return;

        const checkAll = async () => {
            if (isCheckingRef.current) return;
            isCheckingRef.current = true;
            try {
                if (taskIds.length > 0) {
                    try {
                        const tasks = await queryGenerationTasks({ taskIds });
                        const returnedTaskIds = new Set(tasks.map(task => task.taskId));
                        await Promise.all(tasks.map(task => applyTask(task)));
                        await recoverMissingMediaTaskNodes(
                            loadingNodes,
                            taskIds,
                            returnedTaskIds,
                            checkLegacyStatus
                        );
                    } catch (error) {
                        console.error('[Recovery] Error querying generation tasks:', error);
                    }
                }

                await Promise.all(legacyNodeIds.map(nodeId => checkLegacyStatus(nodeId)));
            } finally {
                isCheckingRef.current = false;
            }
        };

        void checkAll(); // Initial check

        const interval = setInterval(() => { void checkAll(); }, TASK_POLL_INTERVAL_MS);

        return () => clearInterval(interval);
    }, [recoveryKey, applyTask, checkLegacyStatus]); // Stable string dependency instead of nodes array
};

