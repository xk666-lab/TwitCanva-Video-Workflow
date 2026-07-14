/**
 * useGeneration.ts
 * 
 * Custom hook for handling AI content generation (images and videos).
 * Manages generation state, API calls, and error handling.
 */

import { useRef } from 'react';
import { NodeData, NodeType, NodeStatus } from '../types';
import {
    cancelGenerationTask,
    retryGenerationTask,
    submitImageGeneration,
    submitVideoGeneration
} from '../services/generationService';
import type { GenerationRequestOptions } from '../services/generationService';
import { submitLocalImageGeneration } from '../services/localModelService';
import { buildGenerationTaskNodeUpdate } from '../utils/generationTaskHelpers';
import { isSeedanceVideoModel } from '../utils/videoModelRouting';
import type { CanvasEdge } from '../domain/graph/graphTypes';
import {
    getConnectedImageInputs,
    getConnectedSubjectInputs,
    getConnectedTextInputs,
    getEndFrameInput,
    getMotionReferenceInput,
    getReferenceImageInputs,
    getStartFrameInput
} from '../domain/graph/connectionSelectors';
import {
    buildSubjectReferenceSnapshots,
    getSubjectReferenceUrls
} from '../domain/subjects/subjectAsset.ts';
import { resolveSubjectAssets } from '../services/subjectAssetService.ts';

interface UseGenerationProps {
    nodes: NodeData[];
    edges: CanvasEdge[];
    workflowId: string | null;
    updateNode: (id: string, updates: Partial<NodeData>) => void;
}

export const useGeneration = ({ nodes, edges, workflowId, updateNode }: UseGenerationProps) => {
    const nodesRef = useRef(nodes);
    nodesRef.current = nodes;

    const getSubjectReferences = async (targetNode: NodeData) => {
        const subjectAssetIds = getConnectedSubjectInputs(targetNode, nodes, edges)
            .map(input => input.subjectAssetId)
            .filter((id): id is string => Boolean(id));
        if (subjectAssetIds.length === 0) return [];
        return buildSubjectReferenceSnapshots(await resolveSubjectAssets(subjectAssetIds));
    };

    // ============================================================================
    // GENERATION HANDLER
    // ============================================================================

    /**
     * Handles content generation for a node
     * Supports image and video generation with parent node chaining
     * 
     * @param id - ID of the node to generate content for
     */
    const handleGenerate = async (id: string) => {
        const node = nodes.find(n => n.id === id);
        if (!node) return;
        if (node.status === NodeStatus.LOADING && node.activeTaskId) return;

        const generationRequestOptions: GenerationRequestOptions = {
            workflowId,
            onTaskCreated: task => {
                updateNode(id, {
                    status: NodeStatus.LOADING,
                    activeTaskId: task.taskId,
                    errorMessage: undefined,
                    generationStartTime: Date.now()
                });
            }
        };

        // Combine prompts: TEXT node prompts + node's own prompt
        const textNodePrompts = getConnectedTextInputs(node, nodes, edges)
            .filter(input => input.prompt)
            .map(input => input.prompt);
        const combinedPrompt = [...textNodePrompts, node.prompt].filter(Boolean).join('\n\n');
        const connectedImageInputs = getConnectedImageInputs(node, nodes, edges);
        const startFrameInput = getStartFrameInput(node, nodes, edges);
        const endFrameInput = getEndFrameInput(node, nodes, edges);
        const motionReferenceInput = getMotionReferenceInput(node, nodes, edges);

        // Check if prompt is required
        // For Kling frame-to-frame with both start and end frames, prompt is optional
        const isKlingFrameToFrame =
            node.type === NodeType.VIDEO &&
            node.videoModel?.startsWith('kling-') &&
            Boolean(node.parentIds && node.parentIds.length >= 2);

        if (!combinedPrompt && !isKlingFrameToFrame) return;

        updateNode(id, { status: NodeStatus.LOADING, generationStartTime: Date.now() });

        try {
            if (node.type === NodeType.IMAGE || node.type === NodeType.IMAGE_EDITOR) {
                // Collect ALL parent images for multi-input generation
                const imageBase64s: string[] = [];
                const subjectReferences = await getSubjectReferences(node);

                // Traverse each typed image input until a generated image is found.
                for (const input of connectedImageInputs) {
                    let current: NodeData | undefined = input;
                    const visited = new Set<string>();

                    while (current && imageBase64s.length < 14 && !visited.has(current.id)) {
                        visited.add(current.id);
                        if (current.resultUrl) {
                            imageBase64s.push(current.resultUrl);
                            break;
                        }
                        current = getConnectedImageInputs(current, nodes, edges)[0];
                    }
                }

                // Add character reference URLs from storyboard nodes (for maintaining character consistency)
                if (node.characterReferenceUrls && node.characterReferenceUrls.length > 0) {
                    for (const charUrl of node.characterReferenceUrls) {
                        if (imageBase64s.length < 14) { // Respect Gemini's limit
                            imageBase64s.push(charUrl);
                        }
                    }
                }

                for (const subjectUrl of getSubjectReferenceUrls(subjectReferences, 14)) {
                    if (imageBase64s.length >= 14) break;
                    if (!imageBase64s.includes(subjectUrl)) imageBase64s.push(subjectUrl);
                }

                // Generate image with all parent images and character references
                await submitImageGeneration({
                    prompt: combinedPrompt,
                    aspectRatio: node.aspectRatio,
                    resolution: node.resolution,
                    imageBase64: imageBase64s.length > 0 ? imageBase64s : undefined,
                    imageModel: node.imageModel || 'gpt-image-2',
                    nodeId: id,
                    // Kling V1.5 reference settings
                    klingReferenceMode: node.klingReferenceMode,
                    klingFaceIntensity: node.klingFaceIntensity,
                    klingSubjectIntensity: node.klingSubjectIntensity,
                    ...(subjectReferences.length > 0 ? { subjectReferences } : {})
                }, generationRequestOptions);
                return;

            } else if (node.type === NodeType.LOCAL_IMAGE_MODEL) {
                // --- LOCAL MODEL GENERATION ---
                // Check if model is selected
                if (!node.localModelId && !node.localModelPath) {
                    updateNode(id, {
                        status: NodeStatus.ERROR,
                        errorMessage: 'No local model selected. Please select a model first.',
                        lastTaskId: undefined,
                        generationStartTime: undefined
                    });
                    return;
                }

                await submitLocalImageGeneration({
                    nodeId: id,
                    modelId: node.localModelId,
                    modelPath: node.localModelPath,
                    prompt: combinedPrompt,
                    aspectRatio: node.aspectRatio,
                    resolution: node.resolution || '512'
                }, generationRequestOptions);
                return;

            } else if (node.type === NodeType.VIDEO) {
                let imageBase64: string | string[] | undefined;
                let lastFrameBase64: string | undefined;
                const subjectReferences = await getSubjectReferences(node);
                const subjectReferenceUrls = getSubjectReferenceUrls(subjectReferences, 14);
                const isSeedanceModel = isSeedanceVideoModel(node.videoModel);
                const requestedDuration = isSeedanceModel ? undefined : node.videoDuration;
                const referenceImageInputs = getReferenceImageInputs(node, nodes, edges);
                const inputImageValue = (input?: NodeData): string | undefined => {
                    if (!input) return undefined;
                    if (input.type === NodeType.VIDEO || input.type === NodeType.VIDEO_EDITOR) {
                        return input.lastFrame || input.resultUrl;
                    }
                    return input.resultUrl;
                };
                const seedanceReferenceImages = connectedImageInputs
                    .filter(input => input.type === NodeType.IMAGE)
                    .map(inputImageValue)
                    .filter((url): url is string => Boolean(url));
                const seedanceReferences = [...new Set([...seedanceReferenceImages, ...subjectReferenceUrls])].slice(0, 14);
                const motionReferenceUrl = node.videoModel === 'kling-v2-6'
                    ? motionReferenceInput?.resultUrl
                    : undefined;
                const isMotionControl = Boolean(motionReferenceUrl);
                const hasStartAndEndFrames = Boolean(startFrameInput && endFrameInput);

                // Seedance uses reference images, not start/end interpolation frames.
                const isFrameToFrame = !isSeedanceModel && !isMotionControl &&
                    (node.videoMode === 'frame-to-frame' || hasStartAndEndFrames);

                if (isSeedanceModel && seedanceReferences.length > 0) {
                    imageBase64 = seedanceReferences;
                } else if (isFrameToFrame && startFrameInput && endFrameInput) {
                    imageBase64 = inputImageValue(startFrameInput);
                    lastFrameBase64 = inputImageValue(endFrameInput);
                } else if (connectedImageInputs.length > 0) {
                    if (isMotionControl) {
                        const characterReference = referenceImageInputs.find(input => input.type === NodeType.IMAGE)
                            || connectedImageInputs.find(input => input.type === NodeType.IMAGE);
                        imageBase64 = inputImageValue(characterReference);
                    } else {
                        imageBase64 = inputImageValue(startFrameInput || connectedImageInputs[0]);
                    }
                }

                if (!imageBase64 && subjectReferenceUrls[0]) {
                    imageBase64 = subjectReferenceUrls[0];
                }

                await submitVideoGeneration({
                    prompt: combinedPrompt,
                    imageBase64,
                    lastFrameBase64,
                    aspectRatio: node.aspectRatio,
                    resolution: node.resolution,
                    duration: requestedDuration,
                    videoModel: node.videoModel,
                    motionReferenceUrl,
                    generateAudio: node.generateAudio, // For Kling 2.6 and Veo 3.1 native audio
                    nodeId: id,
                    ...(subjectReferences.length > 0 ? { subjectReferences } : {})
                }, generationRequestOptions);
                return;

            }
        } catch (error: any) {
            // Handle errors
            const msg = error.toString().toLowerCase();
            let errorMessage = error.message || 'Generation failed';

            if (msg.includes('permission_denied') || msg.includes('403')) {
                errorMessage = 'Permission denied. Check API Key configuration.';
            } else if (msg.includes('unable to process input image') || msg.includes('invalid_argument')) {
                errorMessage = '⚠️ Input image incompatible. Veo requires: JPEG format, 16:9 or 9:16 aspect ratio. Try a different image or generate without input.';
            }

            updateNode(id, {
                status: NodeStatus.ERROR,
                errorMessage,
                lastTaskId: undefined,
                generationStartTime: undefined
            });
            console.error('Generation failed:', error);
        }
    };

    const handleCancelGeneration = async (id: string) => {
        const node = nodesRef.current.find(candidate => candidate.id === id);
        const taskId = node?.activeTaskId;
        if (!node || !taskId) return;

        try {
            const task = await cancelGenerationTask(taskId);
            const current = nodesRef.current.find(candidate => candidate.id === id) || node;
            if (current.activeTaskId && current.activeTaskId !== taskId) return;
            const taskNode = { ...current, activeTaskId: taskId };
            updateNode(id, buildGenerationTaskNodeUpdate(taskNode, task));
        } catch (error) {
            updateNode(id, {
                status: NodeStatus.LOADING,
                errorMessage: error instanceof Error ? error.message : 'Unable to request cancellation.'
            });
            console.error('Failed to cancel generation task:', error);
        }
    };

    const handleRetryGeneration = async (id: string) => {
        const node = nodesRef.current.find(candidate => candidate.id === id);
        if (!node?.lastTaskId || node.status === NodeStatus.LOADING) return;

        updateNode(id, {
            status: NodeStatus.LOADING,
            errorMessage: undefined,
            generationStartTime: Date.now()
        });
        try {
            const task = await retryGenerationTask(node.lastTaskId);
            updateNode(id, {
                status: NodeStatus.LOADING,
                activeTaskId: task.taskId,
                errorMessage: undefined,
                generationStartTime: Date.now()
            });
        } catch (error) {
            updateNode(id, {
                status: NodeStatus.ERROR,
                errorMessage: error instanceof Error ? error.message : 'Unable to retry generation.',
                generationStartTime: undefined
            });
            console.error('Failed to retry generation task:', error);
        }
    };

    // ============================================================================
    // RETURN
    // ============================================================================

    return {
        handleGenerate,
        handleCancelGeneration,
        handleRetryGeneration
    };
};
