/**
 * generation.js
 * 
 * Routes for AI image and video generation.
 * Supports Gemini, Veo, Kling AI, Hailuo AI, and OpenAI GPT Image providers.
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import { generateKlingVideo, generateKlingImage, generateKlingMultiImage } from '../services/kling.js';
import { generateGeminiImage, generateVeoVideo } from '../services/gemini.js';
import { generateHailuoVideo } from '../services/hailuo.js';
import { generateOpenAIImage } from '../services/openai.js';
import { generateSeedanceVideo } from '../services/seedance.js';
import { createMediaTake } from '../services/takeMetadata.js';
import { isSeedanceVideoModel } from '../services/videoModelRouting.js';
import { resolveImageToBase64, saveBufferToFile } from '../utils/imageHelpers.js';

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

// ============================================================================
// IMAGE GENERATION
// ============================================================================

router.post('/generate-image', async (req, res) => {
    try {
        const { nodeId, prompt, aspectRatio, resolution, imageBase64: rawImageBase64, imageModel: requestedImageModel, klingReferenceMode, klingFaceIntensity, klingSubjectIntensity } = req.body;
        const { GEMINI_API_KEY, KLING_ACCESS_KEY, KLING_SECRET_KEY, OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_IMAGE_MODEL, IMAGES_DIR } = req.app.locals;
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
                return res.status(500).json({
                    error: "Kling API credentials not configured. Add KLING_ACCESS_KEY and KLING_SECRET_KEY to .env"
                });
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
                return res.status(500).json({
                    error: "OpenAI API key not configured. Add OPENAI_API_KEY to .env"
                });
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
                return res.status(500).json({ error: "Server missing API Key config" });
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
                format: imageFormat
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
            mediaType: 'image'
        };
        fs.writeFileSync(path.join(IMAGES_DIR, `${take.id}.json`), JSON.stringify(metadata, null, 2));

        console.log(`Image saved: ${saved.url} (model: ${imageModel || 'gemini-pro'})`);
        return res.json({ resultUrl: saved.url, take });

    } catch (error) {
        console.error("Server Image Gen Error:", error);
        res.status(500).json({ error: error.message || "Image generation failed" });
    }
});

// ============================================================================
// VIDEO GENERATION
// ============================================================================

router.post('/generate-video', async (req, res) => {
    try {
        const { nodeId, prompt, imageBase64: rawImageBase64, lastFrameBase64: rawLastFrameBase64, motionReferenceUrl: rawMotionReferenceUrl, aspectRatio, resolution, duration, videoModel } = req.body;
        const { GEMINI_API_KEY, KLING_ACCESS_KEY, KLING_SECRET_KEY, HAILUO_API_KEY, SEEDANCE_API_KEY, SEEDANCE_BASE_URL, SEEDANCE_SUBMIT_PATH, SEEDANCE_STATUS_PATH, VIDEOS_DIR } = req.app.locals;

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
                const { FAL_API_KEY } = req.app.locals;

                if (!FAL_API_KEY) {
                    return res.status(500).json({
                        error: "FAL_API_KEY not configured. Add FAL_API_KEY to .env for Kling 2.6."
                    });
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
                    console.log(`[Route] Generate Audio: ${req.body.generateAudio !== false}`);

                    const { generateFalImageToVideo } = await import('../services/fal.js');

                    resultVideoUrl = await generateFalImageToVideo({
                        prompt,
                        imageBase64,
                        duration: String(duration || 5),
                        generateAudio: req.body.generateAudio !== false, // Default to true
                        apiKey: FAL_API_KEY
                    });
                }
            } else {
                // --- STANDARD KLING VIDEO GENERATION ---
                if (!KLING_ACCESS_KEY || !KLING_SECRET_KEY) {
                    return res.status(500).json({
                        error: "Kling API credentials not configured. Add KLING_ACCESS_KEY and KLING_SECRET_KEY to .env"
                    });
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
                return res.status(500).json({
                    error: "Hailuo API key not configured. Add HAILUO_API_KEY to .env"
                });
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
                return res.status(500).json({
                    error: "Seedance API key not configured. Add SEEDANCE_API_KEY to .env"
                });
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
                generateAudio: req.body.generateAudio,
                watermark: req.body.watermark,
                apiKey: SEEDANCE_API_KEY,
                baseUrl: SEEDANCE_BASE_URL,
                submitPath: SEEDANCE_SUBMIT_PATH,
                statusPath: SEEDANCE_STATUS_PATH,
                assetStorage: {
                    libraryDir: req.app.locals.LIBRARY_DIR
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
                return res.status(500).json({ error: "Server missing API Key config" });
            }

            console.log(`Using Veo model: ${videoModel || 'veo-3.1'}, duration: ${duration || 8}s, generateAudio: ${req.body.generateAudio !== false}`);

            videoBuffer = await generateVeoVideo({
                prompt,
                imageBase64,
                lastFrameBase64,
                aspectRatio,
                resolution,
                duration: duration || 8,
                generateAudio: req.body.generateAudio !== false, // Default to true
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
                resolution: resolution || 'Auto'
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
            mediaType: 'video'
        };
        fs.writeFileSync(path.join(VIDEOS_DIR, `${take.id}.json`), JSON.stringify(metadata, null, 2));

        console.log(`Video saved: ${saved.url} (model: ${videoModel || 'veo-3.1'})`);
        return res.json({ resultUrl: saved.url, take });

    } catch (error) {
        console.error("Server Video Gen Error:", error);
        const statusCode = String(error.message || '').toLowerCase().includes('seedance') ? 502 : 500;
        res.status(statusCode).json({ error: error.message || "Video generation failed" });
    }
});

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
