/**
 * generation.js
 * 
 * Routes for AI image and video generation.
 * Supports Gemini, Veo, Kling AI, Hailuo AI, and OpenAI GPT Image providers.
 */

import express from 'express';
import crypto from 'node:crypto';
import fs from 'fs';
import path from 'path';
import { generateKlingVideo, generateKlingImage, generateKlingMultiImage } from '../services/kling.js';
import { generateGeminiImage, generateVeoVideo } from '../services/gemini.js';
import { generateHailuoVideo } from '../services/hailuo.js';
import { generateOpenAIImage } from '../services/openai.js';
import { generateSeedanceVideo } from '../services/seedance.js';
import { createMediaTake } from '../services/takeMetadata.js';
import { isSeedanceVideoModel } from '../services/videoModelRouting.js';
import { isTrustedLocalOrigin } from '../services/localOriginPolicy.js';
import {
    resolveImageToBase64,
    saveBufferToFile
} from '../utils/imageHelpers.js';

const router = express.Router();

function readJsonFile(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return null;
    }
}

function metadataToTake(meta, url, fallbackType) {
    if (!meta) return null;
    const mediaType = meta.mediaType || fallbackType;
    return createMediaTake({
        id: meta.takeId || meta.id,
        nodeId: meta.nodeId || meta.id,
        type: mediaType,
        url,
        prompt: meta.prompt || '',
        model: meta.model || '',
        createdAt: meta.createdAt,
        thumbnailUrl: meta.thumbnailUrl,
        metadata: {
            ...(meta.metadata && typeof meta.metadata === 'object' ? meta.metadata : {}),
            filename: meta.filename,
            aspectRatio: meta.aspectRatio,
            resolution: meta.resolution
        }
    });
}

function findLatestTakeForNode(nodeId, dirs) {
    const matches = [];

    for (const { dir, mediaType, urlType } of dirs) {
        if (!fs.existsSync(dir)) continue;

        for (const file of fs.readdirSync(dir)) {
            if (!file.endsWith('.json')) continue;
            const meta = readJsonFile(path.join(dir, file));
            if (!meta || (meta.nodeId !== nodeId && meta.id !== nodeId)) continue;

            const url = `/library/${urlType}/${meta.filename}`;
            matches.push({
                meta,
                url,
                type: mediaType,
                createdAt: new Date(meta.createdAt || 0).getTime()
            });
        }
    }

    matches.sort((a, b) => b.createdAt - a.createdAt);
    return matches[0] || null;
}

function findTakeForGenerationTask(taskId, dirs) {
    for (const { dir, mediaType, urlType } of dirs) {
        if (!fs.existsSync(dir)) continue;
        for (const file of fs.readdirSync(dir)) {
            if (!file.endsWith('.json')) continue;
            const meta = readJsonFile(path.join(dir, file));
            if (!meta || meta.generationTaskId !== taskId) continue;
            return {
                meta,
                url: `/library/${urlType}/${meta.filename}`,
                type: mediaType
            };
        }
    }
    return null;
}

export function recoverGenerationTaskOutput(task, locals) {
    const recovered = findTakeForGenerationTask(task.taskId, [
        { dir: locals.IMAGES_DIR, mediaType: 'image', urlType: 'images' },
        { dir: locals.VIDEOS_DIR, mediaType: 'video', urlType: 'videos' }
    ]);
    if (!recovered) return null;
    return {
        resultUrl: recovered.url,
        take: metadataToTake(recovered.meta, recovered.url, recovered.type)
    };
}

const SUPPORTED_TASK_OPERATIONS = new Set(['generate-image', 'generate-video', 'generate-local-image']);
const SENSITIVE_TASK_INPUT_KEY = /(api.?key|authorization|access.?key|secret.?key|bearer.?token)/i;

function persistTaskDataUrl(dataUrl, locals) {
    const match = dataUrl.match(/^data:(image|video)\/(png|jpe?g|webp|gif|mp4|webm);base64,(.+)$/i);
    if (!match) throw new TypeError('Unsupported task data URL type');

    const mediaType = match[1].toLowerCase();
    const extension = match[2].toLowerCase() === 'jpeg' ? 'jpg' : match[2].toLowerCase();
    const buffer = Buffer.from(match[3], 'base64');
    const contentHash = crypto.createHash('sha256').update(buffer).digest('hex');
    const targetDir = mediaType === 'video' ? locals.VIDEOS_DIR : locals.IMAGES_DIR;
    const filename = `task_input_${contentHash}.${extension}`;
    const targetPath = path.join(targetDir, filename);
    if (!fs.existsSync(targetPath)) fs.writeFileSync(targetPath, buffer);
    return `/library/${path.basename(targetDir)}/${filename}`;
}

function materializeTaskInput(value, locals) {
    if (typeof value === 'string' && value.startsWith('data:')) {
        return persistTaskDataUrl(value, locals);
    }
    if (Array.isArray(value)) {
        return value.map(item => materializeTaskInput(item, locals));
    }
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value)
                .filter(([key]) => !SENSITIVE_TASK_INPUT_KEY.test(key))
                .map(([key, item]) => [key, materializeTaskInput(item, locals)])
        );
    }
    return value;
}

function resolveTaskProviderAndModel(operation, inputSnapshot, locals) {
    if (operation === 'generate-local-image') {
        return {
            provider: 'local',
            model: inputSnapshot.modelId || inputSnapshot.modelPath || 'local-image-model'
        };
    }

    if (operation === 'generate-image') {
        const requestedModel = inputSnapshot.imageModel || locals.OPENAI_IMAGE_MODEL || 'gpt-image-2';
        const model = requestedModel === 'gpt-image-1.5' ? 'gpt-image-2' : requestedModel;
        const provider = model.startsWith('kling-')
            ? 'kling'
            : model.startsWith('gpt-image-')
                ? 'openai'
                : 'gemini';
        return { provider, model };
    }

    const model = inputSnapshot.videoModel || 'veo-3.1';
    const provider = model.startsWith('kling-')
        ? (model === 'kling-v2-6' ? 'fal' : 'kling')
        : model.startsWith('hailuo-')
            ? 'hailuo'
            : isSeedanceVideoModel(model)
                ? 'seedance'
                : 'gemini';
    return { provider, model };
}

function pickTaskParameters(inputSnapshot) {
    const parameterKeys = [
        'aspectRatio',
        'resolution',
        'duration',
        'imageModel',
        'videoModel',
        'generateAudio',
        'klingReferenceMode',
        'klingFaceIntensity',
        'klingSubjectIntensity',
        'modelId',
        'modelPath',
        'negativePrompt',
        'steps',
        'guidanceScale',
        'seed'
    ];
    return Object.fromEntries(
        parameterKeys
            .filter(key => inputSnapshot[key] !== undefined)
            .map(key => [key, inputSnapshot[key]])
    );
}

function prepareTaskSubmission(body, locals, operationOverride) {
    const operation = operationOverride || body?.operation;
    if (!SUPPORTED_TASK_OPERATIONS.has(operation)) {
        throw new TypeError(`Unsupported generation operation: ${operation || '(missing)'}`);
    }

    const rawInput = operationOverride
        ? Object.fromEntries(Object.entries(body || {}).filter(([key]) => !['workflowId', 'idempotencyKey'].includes(key)))
        : body?.inputSnapshot;
    if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
        throw new TypeError('inputSnapshot is required');
    }

    const nodeId = body?.nodeId
        || rawInput.nodeId
        || (operationOverride ? `legacy-${operation}-${crypto.randomUUID()}` : undefined);
    if (!nodeId || typeof nodeId !== 'string') {
        throw new TypeError('nodeId is required');
    }

    const inputSnapshot = {
        ...materializeTaskInput(rawInput, locals),
        nodeId
    };
    const { provider, model } = resolveTaskProviderAndModel(operation, inputSnapshot, locals);

    return {
        workflowId: body?.workflowId ?? null,
        nodeId,
        operation,
        provider,
        model,
        inputSnapshot,
        parameters: body?.parameters || pickTaskParameters(inputSnapshot),
        idempotencyKey: body?.idempotencyKey
    };
}

function taskRouteError(res, error) {
    const isValidationError = error instanceof TypeError;
    const status = isValidationError ? 400 : /not found/i.test(error.message || '') ? 404 : 500;
    return res.status(status).json({
        error: {
            code: isValidationError ? 'VALIDATION_ERROR' : status === 404 ? 'TASK_NOT_FOUND' : 'UNKNOWN_ERROR',
            message: error.message || 'Generation task request failed',
            retryable: !isValidationError && status !== 404
        }
    });
}

async function runLegacyGeneration(req, res, operation) {
    try {
        const manager = req.app.locals.GENERATION_TASK_MANAGER;
        if (!manager) throw new Error('Generation task manager is not initialized');
        const submission = prepareTaskSubmission(req.body, req.app.locals, operation);
        const { task } = await manager.submitTask(submission);
        const terminalTask = await manager.waitForTask(task.taskId);

        if (terminalTask.status === 'succeeded' && terminalTask.output?.resultUrl) {
            return res.json({ ...terminalTask.output, task: terminalTask });
        }

        const statusCode = terminalTask.status === 'cancelled'
            ? 409
            : terminalTask.provider === 'seedance'
                ? 502
                : 500;
        return res.status(statusCode).json({
            error: terminalTask.error?.message || 'Generation failed',
            task: terminalTask
        });
    } catch (error) {
        console.error(`[GenerationTasks] Legacy ${operation} failed:`, error);
        return taskRouteError(res, error);
    }
}

router.use('/generation-tasks', (req, res, next) => {
    const allowedOrigins = req.app.locals.TASK_ALLOWED_ORIGINS || [];
    if (isTrustedLocalOrigin(req.get('origin'), allowedOrigins)) return next();
    return res.status(403).json({
        error: {
            code: 'FORBIDDEN_ORIGIN',
            message: 'Generation task APIs are only available to the local workbench.',
            retryable: false
        }
    });
});

router.post('/generation-tasks', async (req, res) => {
    try {
        const submission = prepareTaskSubmission(req.body, req.app.locals);
        const result = await req.app.locals.GENERATION_TASK_MANAGER.submitTask(submission);
        return res.status(result.reused ? 200 : 202).json(result);
    } catch (error) {
        return taskRouteError(res, error);
    }
});

router.post('/generation-tasks/query', (req, res) => {
    try {
        const tasks = req.app.locals.GENERATION_TASK_MANAGER.queryTasks(req.body || {});
        return res.json({ tasks });
    } catch (error) {
        return taskRouteError(res, error);
    }
});

router.get('/generation-tasks/:taskId', (req, res) => {
    try {
        const task = req.app.locals.GENERATION_TASK_MANAGER.getTask(req.params.taskId);
        if (!task) return res.status(404).json({ error: { code: 'TASK_NOT_FOUND', message: 'Generation task not found', retryable: false } });
        return res.json({ task });
    } catch (error) {
        return taskRouteError(res, error);
    }
});

router.post('/generation-tasks/:taskId/cancel', async (req, res) => {
    try {
        const task = await req.app.locals.GENERATION_TASK_MANAGER.cancelTask(req.params.taskId);
        return res.json({ task });
    } catch (error) {
        return taskRouteError(res, error);
    }
});

router.post('/generation-tasks/:taskId/retry', async (req, res) => {
    try {
        const task = await req.app.locals.GENERATION_TASK_MANAGER.retryTask(req.params.taskId);
        return res.status(202).json({ task });
    } catch (error) {
        return taskRouteError(res, error);
    }
});

router.post('/generate-image', (req, res) => runLegacyGeneration(req, res, 'generate-image'));
router.post('/generate-video', (req, res) => runLegacyGeneration(req, res, 'generate-video'));

// ============================================================================
// IMAGE GENERATION
// ============================================================================

async function executeImageGeneration(inputSnapshot, locals) {
        const { nodeId, generationTaskId, prompt, aspectRatio, resolution, imageBase64: rawImageBase64, imageModel: requestedImageModel, klingReferenceMode, klingFaceIntensity, klingSubjectIntensity } = inputSnapshot;
        const { GEMINI_API_KEY, KLING_ACCESS_KEY, KLING_SECRET_KEY, OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_IMAGE_MODEL, IMAGES_DIR } = locals;
        const selectedImageModel = requestedImageModel || OPENAI_IMAGE_MODEL || 'gpt-image-2';
        const imageModel = selectedImageModel === 'gpt-image-1.5' ? 'gpt-image-2' : selectedImageModel;

        // Determine provider
        const isKlingModel = imageModel && imageModel.startsWith('kling-');
        const isOpenAIModel = imageModel && imageModel.startsWith('gpt-image-');

        let imageBuffer;
        let imageFormat = 'png';

        if (isKlingModel) {
            // --- KLING AI IMAGE GENERATION ---
            if (!KLING_ACCESS_KEY || !KLING_SECRET_KEY) {
                throw new Error('Kling API credentials not configured. Add KLING_ACCESS_KEY and KLING_SECRET_KEY to .env');
            }

            console.log(`Using Kling AI model for image: ${imageModel}`);

            // Resolve images if provided
            let resolvedImages = null;
            if (rawImageBase64) {
                const rawImages = Array.isArray(rawImageBase64) ? rawImageBase64 : [rawImageBase64];
                resolvedImages = rawImages.map(img => resolveImageToBase64(img)).filter(Boolean);
            }

            let klingImageUrl;

            // Determine which API to use based on model and reference images:
            // - kling-v1-5: Uses standard API with image_reference parameter
            // - kling-v2, kling-v2-1: Use Multi-Image API (image_reference not supported)
            const isV2Model = imageModel === 'kling-v2' || imageModel === 'kling-v2-1' || imageModel === 'kling-v2-new';
            const hasReferenceImages = resolvedImages && resolvedImages.length > 0;

            if (hasReferenceImages && isV2Model) {
                // V2 models: Use Multi-Image API for image-to-image
                console.log(`Using Kling Multi-Image API for ${imageModel} with ${resolvedImages.length} subject image(s)`);
                klingImageUrl = await generateKlingMultiImage({
                    prompt,
                    subjectImages: resolvedImages,
                    modelId: imageModel,
                    aspectRatio,
                    resolution,
                    accessKey: KLING_ACCESS_KEY,
                    secretKey: KLING_SECRET_KEY
                });
            } else if (hasReferenceImages && resolvedImages.length > 1) {
                // Multiple images with non-V2 model: Use Multi-Image API
                console.log(`Using Kling Multi-Image API with ${resolvedImages.length} subject images`);
                klingImageUrl = await generateKlingMultiImage({
                    prompt,
                    subjectImages: resolvedImages,
                    modelId: imageModel,
                    aspectRatio,
                    resolution,
                    accessKey: KLING_ACCESS_KEY,
                    secretKey: KLING_SECRET_KEY
                });
            } else {
                // V1.5 or text-to-image: Use standard API (V1.5 supports image_reference)
                klingImageUrl = await generateKlingImage({
                    prompt,
                    imageBase64: resolvedImages,
                    modelId: imageModel,
                    aspectRatio,
                    resolution,
                    klingReferenceMode,
                    klingFaceIntensity,
                    klingSubjectIntensity,
                    accessKey: KLING_ACCESS_KEY,
                    secretKey: KLING_SECRET_KEY
                });
            }

            // Download from Kling's URL
            const imageResponse = await fetch(klingImageUrl);
            if (!imageResponse.ok) {
                throw new Error('Failed to download image from Kling');
            }
            imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

            if (klingImageUrl.includes('.jpg') || klingImageUrl.includes('.jpeg')) {
                imageFormat = 'jpg';
            }

        } else if (isOpenAIModel) {
            // --- OPENAI GPT IMAGE GENERATION ---
            if (!OPENAI_API_KEY) {
                throw new Error('OpenAI API key not configured. Add OPENAI_API_KEY to .env');
            }

            console.log(`Using OpenAI GPT Image model: ${imageModel}`);

            // Resolve images if provided
            let imageBase64Array = null;
            if (rawImageBase64) {
                const rawImages = Array.isArray(rawImageBase64) ? rawImageBase64 : [rawImageBase64];
                imageBase64Array = rawImages.map(img => resolveImageToBase64(img)).filter(Boolean);
            }

            imageBuffer = await generateOpenAIImage({
                prompt,
                imageBase64Array,
                aspectRatio,
                resolution,
                apiKey: OPENAI_API_KEY,
                baseURL: OPENAI_BASE_URL,
                model: imageModel
            });

        } else {
            // --- GEMINI IMAGE GENERATION (Default) ---
            if (!GEMINI_API_KEY) {
                throw new Error('Server missing API Key config');
            }

            let imageBase64Array = null;
            if (rawImageBase64) {
                const rawImages = Array.isArray(rawImageBase64) ? rawImageBase64 : [rawImageBase64];
                imageBase64Array = rawImages.map(img => resolveImageToBase64(img)).filter(Boolean);
            }

            imageBuffer = await generateGeminiImage({
                prompt,
                imageBase64Array,
                aspectRatio,
                resolution,
                apiKey: GEMINI_API_KEY
            });
        }

        // Save to library - use unique filename to preserve previous generations
        const saved = saveBufferToFile(imageBuffer, IMAGES_DIR, 'img', imageFormat);

        const createdAt = new Date().toISOString();
        const take = createMediaTake({
            nodeId: nodeId || saved.id,
            type: 'image',
            url: saved.url,
            prompt,
            model: imageModel || 'gemini-pro',
            createdAt,
            metadata: {
                filename: saved.filename,
                format: imageFormat,
                generationTaskId
            }
        });

        const metadata = {
            id: take.id,
            takeId: take.id,
            nodeId: nodeId || saved.id,
            filename: saved.filename,
            prompt: prompt,
            model: imageModel || 'gemini-pro',
            createdAt,
            type: 'images',
            mediaType: 'image',
            generationTaskId
        };
        fs.writeFileSync(path.join(IMAGES_DIR, `${take.id}.json`), JSON.stringify(metadata, null, 2));

        console.log(`Image saved: ${saved.url} (model: ${imageModel || 'gemini-pro'})`);
        return { resultUrl: saved.url, take };
}

// ============================================================================
// VIDEO GENERATION
// ============================================================================

async function executeVideoGeneration(inputSnapshot, locals) {
        const { nodeId, generationTaskId, prompt, imageBase64: rawImageBase64, lastFrameBase64: rawLastFrameBase64, motionReferenceUrl: rawMotionReferenceUrl, aspectRatio, resolution, duration, videoModel } = inputSnapshot;
        const { GEMINI_API_KEY, KLING_ACCESS_KEY, KLING_SECRET_KEY, HAILUO_API_KEY, SEEDANCE_API_KEY, SEEDANCE_BASE_URL, SEEDANCE_SUBMIT_PATH, SEEDANCE_STATUS_PATH, VIDEOS_DIR } = locals;

        // Resolve file URLs to base64. Seedance can receive multiple image references;
        // other video providers keep using the first image as the start frame.
        const rawImageInputs = Array.isArray(rawImageBase64)
            ? rawImageBase64.filter(Boolean)
            : (rawImageBase64 ? [rawImageBase64] : []);
        const imageBase64 = resolveImageToBase64(rawImageInputs[0]);
        const seedanceImageBase64Array = rawImageInputs
            .map(input => resolveImageToBase64(input))
            .filter(Boolean);
        const lastFrameBase64 = resolveImageToBase64(rawLastFrameBase64);
        const motionReferenceUrl = resolveImageToBase64(rawMotionReferenceUrl);

        // Determine provider
        const isKlingModel = videoModel && videoModel.startsWith('kling-');
        const isHailuoModel = videoModel && videoModel.startsWith('hailuo-');
        const isSeedanceModel = isSeedanceVideoModel(videoModel);

        let videoBuffer;

        if (isKlingModel) {
            // --- KLING AI VIDEO GENERATION ---

            // Check if this is a Kling 2.6 model (route to Fal.ai - official API doesn't support v2.6)
            const isKling26 = videoModel === 'kling-v2-6';
            // Check if this is a motion control request (kling-v2-6 with motion reference)
            const isMotionControl = isKling26 && motionReferenceUrl;

            let resultVideoUrl;

            if (isKling26) {
                // --- KLING 2.6 VIA FAL.AI ---
                // Official Kling API doesn't support v2.6, use fal.ai instead
                const { FAL_API_KEY } = locals;

                if (!FAL_API_KEY) {
                    throw new Error('FAL_API_KEY not configured. Add FAL_API_KEY to .env for Kling 2.6.');
                }

                if (isMotionControl) {
                    // Motion Control mode
                    console.log(`\n[Route] Kling 2.6 Motion Control detected - routing to fal.ai`);
                    console.log(`[Route] Motion Reference: ${motionReferenceUrl ? 'YES (' + Math.round(motionReferenceUrl.length / 1024) + ' KB)' : 'NO'}`);
                    console.log(`[Route] Character Image: ${imageBase64 ? 'YES (' + Math.round(imageBase64.length / 1024) + ' KB)' : 'NO'}`);
                    console.log(`[Route] Prompt: ${prompt ? prompt.substring(0, 50) + '...' : '(none)'}`);

                    const { generateFalMotionControl } = await import('../services/fal.js');

                    resultVideoUrl = await generateFalMotionControl({
                        prompt,
                        characterImageBase64: imageBase64,
                        motionVideoBase64: motionReferenceUrl,
                        characterOrientation: 'video',
                        apiKey: FAL_API_KEY
                    });
                } else {
                    // Standard Image-to-Video mode
                    console.log(`\n[Route] Kling 2.6 Image-to-Video - routing to fal.ai`);
                    console.log(`[Route] Image: ${imageBase64 ? 'YES (' + Math.round(imageBase64.length / 1024) + ' KB)' : 'NO'}`);
                    console.log(`[Route] Duration: ${duration || 5}s`);
                    console.log(`[Route] Generate Audio: ${inputSnapshot.generateAudio !== false}`);

                    const { generateFalImageToVideo } = await import('../services/fal.js');

                    resultVideoUrl = await generateFalImageToVideo({
                        prompt,
                        imageBase64,
                        duration: String(duration || 5),
                        generateAudio: inputSnapshot.generateAudio !== false, // Default to true
                        apiKey: FAL_API_KEY
                    });
                }
            } else {
                // --- STANDARD KLING VIDEO GENERATION ---
                if (!KLING_ACCESS_KEY || !KLING_SECRET_KEY) {
                    throw new Error('Kling API credentials not configured. Add KLING_ACCESS_KEY and KLING_SECRET_KEY to .env');
                }

                console.log(`Using Kling AI model: ${videoModel}, duration: ${duration || 5}s`);

                resultVideoUrl = await generateKlingVideo({
                    prompt,
                    imageBase64,
                    lastFrameBase64,
                    modelId: videoModel,
                    aspectRatio,
                    duration: duration || 5,
                    motionReferenceUrl,
                    accessKey: KLING_ACCESS_KEY,
                    secretKey: KLING_SECRET_KEY
                });
            }

            // Download from the result URL
            const videoResponse = await fetch(resultVideoUrl);
            if (!videoResponse.ok) {
                throw new Error('Failed to download generated video');
            }
            videoBuffer = Buffer.from(await videoResponse.arrayBuffer());

        } else if (isHailuoModel) {
            // --- HAILUO AI VIDEO GENERATION ---
            if (!HAILUO_API_KEY) {
                throw new Error('Hailuo API key not configured. Add HAILUO_API_KEY to .env');
            }

            console.log(`Using Hailuo AI model: ${videoModel}, duration: ${duration || 6}s`);

            const hailuoVideoUrl = await generateHailuoVideo({
                prompt,
                imageBase64,
                lastFrameBase64,
                modelId: videoModel,
                aspectRatio,
                resolution,
                duration: duration || 6,
                apiKey: HAILUO_API_KEY
            });

            // Download from Hailuo's URL
            const videoResponse = await fetch(hailuoVideoUrl);
            if (!videoResponse.ok) {
                throw new Error('Failed to download video from Hailuo');
            }
            videoBuffer = Buffer.from(await videoResponse.arrayBuffer());

        } else if (isSeedanceModel) {
            // --- SEEDANCE 2.0 VIDEO GENERATION ---
            if (!SEEDANCE_API_KEY) {
                throw new Error('Seedance API key not configured. Add SEEDANCE_API_KEY to .env');
            }

            console.log(`Using Seedance model: ${videoModel}, duration: ${duration || 'Auto'}`);

            const seedanceVideoUrl = await generateSeedanceVideo({
                prompt,
                imageBase64: seedanceImageBase64Array.length > 0 ? seedanceImageBase64Array : imageBase64,
                imageReference: rawImageInputs.length > 0 ? rawImageInputs : rawImageBase64,
                videoReference: rawMotionReferenceUrl,
                modelId: videoModel,
                aspectRatio,
                resolution,
                duration: undefined,
                generateAudio: inputSnapshot.generateAudio,
                watermark: inputSnapshot.watermark,
                apiKey: SEEDANCE_API_KEY,
                baseUrl: SEEDANCE_BASE_URL,
                submitPath: SEEDANCE_SUBMIT_PATH,
                statusPath: SEEDANCE_STATUS_PATH,
                assetStorage: {
                    libraryDir: locals.LIBRARY_DIR
                }
            });

            const videoResponse = await fetch(seedanceVideoUrl);
            if (!videoResponse.ok) {
                throw new Error('Failed to download video from Seedance');
            }
            videoBuffer = Buffer.from(await videoResponse.arrayBuffer());

        } else {
            // --- VEO VIDEO GENERATION (Default) ---
            if (!GEMINI_API_KEY) {
                throw new Error('Server missing API Key config');
            }

            console.log(`Using Veo model: ${videoModel || 'veo-3.1'}, duration: ${duration || 8}s, generateAudio: ${inputSnapshot.generateAudio !== false}`);

            videoBuffer = await generateVeoVideo({
                prompt,
                imageBase64,
                lastFrameBase64,
                aspectRatio,
                resolution,
                duration: duration || 8,
                generateAudio: inputSnapshot.generateAudio !== false, // Default to true
                apiKey: GEMINI_API_KEY
            });
        }

        // Save to library - use unique filename to preserve previous generations
        const saved = saveBufferToFile(videoBuffer, VIDEOS_DIR, 'vid', 'mp4');

        const createdAt = new Date().toISOString();
        const take = createMediaTake({
            nodeId: nodeId || saved.id,
            type: 'video',
            url: saved.url,
            prompt,
            model: videoModel || 'veo-3.1',
            createdAt,
            metadata: {
                filename: saved.filename,
                aspectRatio: aspectRatio || 'Auto',
                resolution: resolution || 'Auto',
                generationTaskId
            }
        });

        const metadata = {
            id: take.id,
            takeId: take.id,
            nodeId: nodeId || saved.id,
            filename: saved.filename,
            prompt: prompt,
            model: videoModel || 'veo-3.1',
            aspectRatio: aspectRatio || 'Auto',
            resolution: resolution || 'Auto',
            createdAt,
            type: 'videos',
            mediaType: 'video',
            generationTaskId
        };
        fs.writeFileSync(path.join(VIDEOS_DIR, `${take.id}.json`), JSON.stringify(metadata, null, 2));

        console.log(`Video saved: ${saved.url} (model: ${videoModel || 'veo-3.1'})`);
        return { resultUrl: saved.url, take };
}

export async function executeGenerationTask(task, locals) {
    if (task.operation === 'generate-image') {
        return executeImageGeneration({ ...task.inputSnapshot, generationTaskId: task.taskId }, locals);
    }
    if (task.operation === 'generate-video') {
        return executeVideoGeneration({ ...task.inputSnapshot, generationTaskId: task.taskId }, locals);
    }
    if (task.operation === 'generate-local-image') {
        const { executeLocalImageGeneration } = await import('./local-models.js');
        return executeLocalImageGeneration({ ...task.inputSnapshot, generationTaskId: task.taskId }, locals);
    }
    throw new TypeError(`Unsupported generation operation: ${task.operation}`);
}

// ============================================================================
// GENERATION STATUS / RECOVERY
// ============================================================================

/**
 * Check if a generation has finished for a specific nodeId.
 * Returns the resultUrl if it exists.
 */
router.get('/generation-status/:nodeId', async (req, res) => {
    try {
        const { nodeId } = req.params;
        const { IMAGES_DIR, VIDEOS_DIR } = req.app.locals;
        const taskManager = req.app.locals.GENERATION_TASK_MANAGER;
        const latestTask = taskManager?.queryTasks({ nodeIds: [nodeId] })[0];

        if (latestTask) {
            if (latestTask.status === 'succeeded' && latestTask.output?.resultUrl) {
                return res.json({
                    status: 'success',
                    resultUrl: latestTask.output.resultUrl,
                    type: latestTask.output.take?.type || (latestTask.operation === 'generate-video' ? 'video' : 'image'),
                    createdAt: latestTask.completedAt || latestTask.updatedAt,
                    take: latestTask.output.take,
                    task: latestTask
                });
            }
            if (latestTask.status === 'failed' || latestTask.status === 'cancelled') {
                return res.json({
                    status: latestTask.status === 'cancelled' ? 'cancelled' : 'error',
                    error: latestTask.error,
                    createdAt: latestTask.createdAt,
                    task: latestTask
                });
            }
            return res.json({ status: 'pending', task: latestTask });
        }

        const latest = findLatestTakeForNode(nodeId, [
            { dir: IMAGES_DIR, mediaType: 'image', urlType: 'images' },
            { dir: VIDEOS_DIR, mediaType: 'video', urlType: 'videos' }
        ]);

        if (latest) {
            return res.json({
                status: 'success',
                resultUrl: latest.url,
                type: latest.type,
                createdAt: latest.meta.createdAt,
                take: metadataToTake(latest.meta, latest.url, latest.type)
            });
        }

        res.json({ status: 'pending' });
    } catch (error) {
        console.error("Status Check Error:", error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
