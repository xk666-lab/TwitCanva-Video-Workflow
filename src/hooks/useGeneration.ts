/**
 * useGeneration.ts
 * 
 * Custom hook for handling AI content generation (images and videos).
 * Manages generation state, API calls, and error handling.
 */

import { MediaTake, NodeData, NodeType, NodeStatus } from '../types';
import { generateImage, generateVideo } from '../services/generationService';
import { generateLocalImage } from '../services/localModelService';
import { buildGenerationSuccessUpdate } from '../utils/takeHelpers';
import { isSeedanceVideoModel } from '../utils/videoModelRouting';
import { extractVideoLastFrame } from '../utils/videoHelpers';
import type { CanvasEdge } from '../domain/graph/graphTypes';
import {
    getConnectedImageInputs,
    getConnectedTextInputs,
    getEndFrameInput,
    getMotionReferenceInput,
    getReferenceImageInputs,
    getStartFrameInput
} from '../domain/graph/connectionSelectors';

interface UseGenerationProps {
    nodes: NodeData[];
    edges: CanvasEdge[];
    updateNode: (id: string, updates: Partial<NodeData>) => void;
}

export const useGeneration = ({ nodes, edges, updateNode }: UseGenerationProps) => {
    // ============================================================================
    // HELPERS
    // ============================================================================

    /**
     * Convert pixel dimensions to closest standard aspect ratio
     */
    const getClosestAspectRatio = (width: number, height: number): string => {
        const ratio = width / height;
        const standardRatios = [
            { label: '1:1', value: 1 },
            { label: '16:9', value: 16 / 9 },
            { label: '9:16', value: 9 / 16 },
            { label: '4:3', value: 4 / 3 },
            { label: '3:4', value: 3 / 4 },
            { label: '3:2', value: 3 / 2 },
            { label: '2:3', value: 2 / 3 },
            { label: '5:4', value: 5 / 4 },
            { label: '4:5', value: 4 / 5 },
            { label: '21:9', value: 21 / 9 }
        ];

        let closest = standardRatios[0];
        let minDiff = Math.abs(ratio - closest.value);

        for (const r of standardRatios) {
            const diff = Math.abs(ratio - r.value);
            if (diff < minDiff) {
                minDiff = diff;
                closest = r;
            }
        }

        return closest.label;
    };

    /**
     * Detect the actual aspect ratio of an image
     * @param imageUrl - URL or base64 of the image
     * @returns Promise with resultAspectRatio (exact) and aspectRatio (closest standard)
     */
    const getImageAspectRatio = (imageUrl: string): Promise<{ resultAspectRatio: string; aspectRatio: string }> => {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const resultAspectRatio = `${img.naturalWidth}/${img.naturalHeight}`;
                const aspectRatio = getClosestAspectRatio(img.naturalWidth, img.naturalHeight);
                resolve({ resultAspectRatio, aspectRatio });
            };
            img.onerror = () => {
                resolve({ resultAspectRatio: '16/9', aspectRatio: '16:9' });
            };
            img.src = imageUrl;
        });
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

                // Generate image with all parent images and character references
                const generationResult = await generateImage({
                    prompt: combinedPrompt,
                    aspectRatio: node.aspectRatio,
                    resolution: node.resolution,
                    imageBase64: imageBase64s.length > 0 ? imageBase64s : undefined,
                    imageModel: node.imageModel || 'gpt-image-2',
                    nodeId: id,
                    // Kling V1.5 reference settings
                    klingReferenceMode: node.klingReferenceMode,
                    klingFaceIntensity: node.klingFaceIntensity,
                    klingSubjectIntensity: node.klingSubjectIntensity
                });

                const resultUrl = generationResult.resultUrl;

                // Detect actual image dimensions (for display purposes only)
                const { resultAspectRatio } = await getImageAspectRatio(resultUrl);

                updateNode(id, buildGenerationSuccessUpdate(node, generationResult, {
                    resultAspectRatio,
                    // Note: aspectRatio is intentionally NOT updated to preserve user's selection
                }));


            } else if (node.type === NodeType.LOCAL_IMAGE_MODEL) {
                // --- LOCAL MODEL GENERATION ---
                // Check if model is selected
                if (!node.localModelId && !node.localModelPath) {
                    updateNode(id, {
                        status: NodeStatus.ERROR,
                        errorMessage: 'No local model selected. Please select a model first.'
                    });
                    return;
                }

                // Get parent images if any
                const imageBase64s: string[] = [];
                if (connectedImageInputs.length > 0) {
                    for (const parent of connectedImageInputs) {
                        if (parent.resultUrl) imageBase64s.push(parent.resultUrl);
                    }
                }

                // Call local generation API
                const result = await generateLocalImage({
                    modelId: node.localModelId,
                    modelPath: node.localModelPath,
                    prompt: combinedPrompt,
                    aspectRatio: node.aspectRatio,
                    resolution: node.resolution || '512'
                });

                if (result.success && result.resultUrl) {
                    const resultUrl = result.resultUrl;

                    // Detect actual image dimensions
                    const { resultAspectRatio } = await getImageAspectRatio(resultUrl);
                    const take: MediaTake = {
                        id: `take_${crypto.randomUUID()}`,
                        nodeId: id,
                        type: 'image',
                        url: resultUrl,
                        prompt: combinedPrompt,
                        model: node.localModelId || node.localModelPath || 'local-image-model',
                        createdAt: new Date().toISOString(),
                        isHero: true,
                        metadata: {
                            modelType: result.modelType,
                            device: result.device
                        }
                    };
                    updateNode(id, buildGenerationSuccessUpdate(node, { resultUrl, take }, { resultAspectRatio }));
                } else {
                    throw new Error(result.error || 'Local generation failed');
                }

            } else if (node.type === NodeType.VIDEO) {
                let imageBase64: string | string[] | undefined;
                let lastFrameBase64: string | undefined;
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
                const motionReferenceUrl = node.videoModel === 'kling-v2-6'
                    ? motionReferenceInput?.resultUrl
                    : undefined;
                const isMotionControl = Boolean(motionReferenceUrl);
                const hasStartAndEndFrames = Boolean(startFrameInput && endFrameInput);

                // Seedance uses reference images, not start/end interpolation frames.
                const isFrameToFrame = !isSeedanceModel && !isMotionControl &&
                    (node.videoMode === 'frame-to-frame' || hasStartAndEndFrames);

                if (isSeedanceModel && seedanceReferenceImages.length > 0) {
                    imageBase64 = seedanceReferenceImages;
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

                // Generate video
                const generationResult = await generateVideo({
                    prompt: combinedPrompt,
                    imageBase64,
                    lastFrameBase64,
                    aspectRatio: node.aspectRatio,
                    resolution: node.resolution,
                    duration: requestedDuration,
                    videoModel: node.videoModel,
                    motionReferenceUrl,
                    generateAudio: node.generateAudio, // For Kling 2.6 and Veo 3.1 native audio
                    nodeId: id
                });

                const resultUrl = generationResult.resultUrl;

                // Extract last frame for chaining
                const lastFrame = await extractVideoLastFrame(resultUrl);

                // Detect video aspect ratio
                let resultAspectRatio: string | undefined;
                let aspectRatio: string | undefined;
                try {
                    const video = document.createElement('video');
                    await new Promise<void>((resolve) => {
                        video.onloadedmetadata = () => {
                            resultAspectRatio = `${video.videoWidth}/${video.videoHeight}`;
                            aspectRatio = getClosestAspectRatio(video.videoWidth, video.videoHeight);
                            resolve();
                        };
                        video.onerror = () => resolve();
                        video.src = resultUrl;
                    });
                } catch (e) {
                    // Ignore errors, use undefined aspect ratio
                }

                updateNode(id, buildGenerationSuccessUpdate(node, generationResult, {
                    resultAspectRatio,
                    aspectRatio,
                    lastFrame,
                }));


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

            updateNode(id, { status: NodeStatus.ERROR, errorMessage, generationStartTime: undefined });
            console.error('Generation failed:', error);
        }
    };

    // ============================================================================
    // RETURN
    // ============================================================================

    return {
        handleGenerate
    };
};
