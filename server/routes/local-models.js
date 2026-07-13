/**
 * local-models.js
 * 
 * API routes for local model discovery and management.
 * Scans configured directories for supported model files.
 */

import express from 'express';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { createMediaTake } from '../services/takeMetadata.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// ============================================================================
// CONFIGURATION
// ============================================================================

// Supported model file extensions
const MODEL_EXTENSIONS = ['.safetensors', '.pt', '.ckpt', '.bin', '.pth'];

// Default models directory (can be configured via env)
const MODELS_BASE_DIR = process.env.LOCAL_MODELS_DIR || path.join(process.cwd(), 'models');

// Model subdirectories and their types
const MODEL_DIRECTORIES = {
    checkpoints: { path: 'checkpoints', type: 'image' },
    loras: { path: 'loras', type: 'lora' },
    controlnet: { path: 'controlnet', type: 'controlnet' },
    video: { path: 'video', type: 'video' }
};

// Minimum VRAM requirements in GB
const MIN_VRAM_GB = 8;

// Model cache (refreshed on demand)
let modelCache = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 30000; // 30 seconds

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate a unique ID for a model based on its path
 */
function generateModelId(filePath) {
    return crypto.createHash('md5').update(filePath).digest('hex').substring(0, 12);
}

/**
 * Format file size to human-readable string
 */
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Load model registry from config file
 */
function loadModelRegistry() {
    try {
        const registryPath = path.join(process.cwd(), 'config', 'model-registry.json');
        if (fsSync.existsSync(registryPath)) {
            const data = fsSync.readFileSync(registryPath, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.warn('[Model Registry] Failed to load registry:', error.message);
    }
    return null;
}

// Load registry on startup
const modelRegistry = loadModelRegistry();
if (modelRegistry) {
    console.log(`[Model Registry] Loaded v${modelRegistry.version} with ${Object.keys(modelRegistry.architectures).length} architectures`);
}

/**
 * Detect model architecture from filename and file size using registry
 */
function detectArchitecture(filename, fileSize = 0) {
    const lowerName = filename.toLowerCase();

    // Use registry if available
    if (modelRegistry && modelRegistry.architectures) {
        const detectionOrder = modelRegistry.detectionOrder || Object.keys(modelRegistry.architectures);

        for (const archKey of detectionOrder) {
            const arch = modelRegistry.architectures[archKey];
            if (!arch || !arch.detection) continue;

            // Check filename patterns
            if (arch.detection.patterns) {
                for (const pattern of arch.detection.patterns) {
                    // Convert glob pattern to simple check
                    const cleanPattern = pattern.replace(/\*/g, '').toLowerCase();
                    if (cleanPattern && lowerName.includes(cleanPattern)) {
                        return archKey;
                    }
                }
            }

            // Check file size range as secondary detection
            if (fileSize > 0 && arch.detection.sizeRange) {
                const [minSize, maxSize] = arch.detection.sizeRange;
                if (fileSize >= minSize && fileSize <= maxSize) {
                    // Size matches, but only use as hint if no pattern matched
                    // Continue checking patterns for better matches
                }
            }
        }

        // Fallback: try size-based detection if no pattern matched
        for (const archKey of detectionOrder) {
            const arch = modelRegistry.architectures[archKey];
            if (!arch || !arch.detection || !arch.detection.sizeRange) continue;

            const [minSize, maxSize] = arch.detection.sizeRange;
            if (fileSize >= minSize && fileSize <= maxSize) {
                return archKey;
            }
        }
    }

    // Fallback to hardcoded detection if registry not available
    if (lowerName.includes('sdxl') || lowerName.includes('sd_xl')) return 'sdxl';
    if (lowerName.includes('sd15') || lowerName.includes('sd_1.5') || lowerName.includes('sd-1-5')) return 'sd15';
    if (lowerName.includes('flux')) return 'flux';
    if (lowerName.includes('animatediff')) return 'animatediff';

    return 'unknown';
}

/**
 * Recursively scan a directory for model files
 */
async function scanDirectory(dirPath, modelType) {
    const models = [];

    try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);

            if (entry.isDirectory()) {
                // Recursively scan subdirectories
                const subModels = await scanDirectory(fullPath, modelType);
                models.push(...subModels);
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();

                if (MODEL_EXTENSIONS.includes(ext)) {
                    try {
                        const stats = await fs.stat(fullPath);
                        const model = {
                            id: generateModelId(fullPath),
                            name: path.basename(entry.name, ext),
                            path: fullPath,
                            type: modelType,
                            size: stats.size,
                            sizeFormatted: formatFileSize(stats.size),
                            architecture: detectArchitecture(entry.name, stats.size),
                            lastModified: stats.mtime.toISOString()
                        };
                        models.push(model);
                    } catch (statErr) {
                        console.warn(`Could not stat file ${fullPath}:`, statErr.message);
                    }
                }
            }
        }
    } catch (err) {
        if (err.code !== 'ENOENT') {
            console.warn(`Could not scan directory ${dirPath}:`, err.message);
        }
    }

    return models;
}

/**
 * Scan all model directories
 */
async function scanAllModels() {
    const allModels = [];

    // Ensure models directory structure exists
    if (!fsSync.existsSync(MODELS_BASE_DIR)) {
        fsSync.mkdirSync(MODELS_BASE_DIR, { recursive: true });
        console.log(`[Local Models] Created models directory: ${MODELS_BASE_DIR}`);
    }

    for (const [key, config] of Object.entries(MODEL_DIRECTORIES)) {
        const dirPath = path.join(MODELS_BASE_DIR, config.path);

        // Create subdirectory if it doesn't exist
        if (!fsSync.existsSync(dirPath)) {
            fsSync.mkdirSync(dirPath, { recursive: true });
        }

        const models = await scanDirectory(dirPath, config.type);
        allModels.push(...models);
    }

    // Also scan root models directory for loose files
    const rootModels = await scanDirectory(MODELS_BASE_DIR, 'image');
    // Filter out models already found in subdirectories
    const existingPaths = new Set(allModels.map(m => m.path));
    for (const model of rootModels) {
        if (!existingPaths.has(model.path)) {
            allModels.push(model);
        }
    }

    console.log(`[Local Models] Found ${allModels.length} model(s) in ${MODELS_BASE_DIR}`);
    return allModels;
}

/**
 * Get models from cache or refresh if stale
 */
async function getCachedModels() {
    const now = Date.now();

    if (modelCache && (now - lastCacheTime) < CACHE_TTL_MS) {
        return modelCache;
    }

    modelCache = await scanAllModels();
    lastCacheTime = now;

    return modelCache;
}

/**
 * Check GPU availability using Python
 */
async function checkGpuInfo() {
    return new Promise((resolve) => {
        const pythonScript = `
import json
try:
    import torch
    if torch.cuda.is_available():
        props = torch.cuda.get_device_properties(0)
        result = {
            "available": True,
            "name": props.name,
            "vramTotal": props.total_memory,
            "vramFree": torch.cuda.memory_reserved(0) - torch.cuda.memory_allocated(0),
            "cudaVersion": torch.version.cuda,
            "sufficient": props.total_memory >= ${MIN_VRAM_GB} * 1024 * 1024 * 1024
        }
        if not result["sufficient"]:
            result["warning"] = f"GPU has {props.total_memory / (1024**3):.1f}GB VRAM. Minimum ${MIN_VRAM_GB}GB recommended."
    else:
        result = {
            "available": False,
            "sufficient": False,
            "warning": "No CUDA-capable GPU detected. Local model inference will not work."
        }
except ImportError:
    result = {
        "available": False,
        "sufficient": False,
        "warning": "PyTorch not installed. Please install PyTorch with CUDA support."
    }
except Exception as e:
    result = {
        "available": False,
        "sufficient": False,
        "warning": f"Error detecting GPU: {str(e)}"
    }
print(json.dumps(result))
`;

        // Use venv Python if available, otherwise fall back to system Python
        const venvPythonPath = path.join(process.cwd(), 'venv', 'Scripts', 'python.exe');
        const pythonCmd = fsSync.existsSync(venvPythonPath) ? venvPythonPath : 'python';

        const python = spawn(pythonCmd, ['-c', pythonScript]);
        let output = '';
        let errorOutput = '';

        python.stdout.on('data', (data) => {
            output += data.toString();
        });

        python.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });

        python.on('close', (code) => {
            if (code === 0 && output) {
                try {
                    resolve(JSON.parse(output.trim()));
                } catch (e) {
                    resolve({
                        available: false,
                        sufficient: false,
                        warning: 'Error parsing GPU info response.'
                    });
                }
            } else {
                resolve({
                    available: false,
                    sufficient: false,
                    warning: errorOutput || 'Failed to detect GPU. Python may not be installed.'
                });
            }
        });

        python.on('error', () => {
            resolve({
                available: false,
                sufficient: false,
                warning: 'Python is not installed or not in PATH.'
            });
        });

        // Timeout after 5 seconds
        setTimeout(() => {
            python.kill();
            resolve({
                available: false,
                sufficient: false,
                warning: 'GPU detection timed out.'
            });
        }, 5000);
    });
}

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /api/local-models
 * Get all local models (optionally filtered by type)
 */
router.get('/', async (req, res) => {
    try {
        let models = await getCachedModels();

        // Filter by type if specified
        if (req.query.type) {
            models = models.filter(m => m.type === req.query.type);
        }

        res.json(models);
    } catch (error) {
        console.error('Error fetching local models:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/local-models/gpu
 * Get GPU information for hardware detection
 */
router.get('/gpu', async (req, res) => {
    try {
        const gpuInfo = await checkGpuInfo();
        res.json(gpuInfo);
    } catch (error) {
        console.error('Error checking GPU:', error);
        res.status(500).json({
            available: false,
            sufficient: false,
            warning: error.message
        });
    }
});

/**
 * POST /api/local-models/refresh
 * Force refresh the model cache
 */
router.post('/refresh', async (req, res) => {
    try {
        modelCache = null; // Clear cache
        const models = await getCachedModels();
        res.json(models);
    } catch (error) {
        console.error('Error refreshing models:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/local-models/registry
 * Get the full model registry
 */
router.get('/registry', (req, res) => {
    if (!modelRegistry) {
        return res.status(404).json({ error: 'Model registry not loaded' });
    }
    res.json(modelRegistry);
});

/**
 * GET /api/local-models/architecture/:key
 * Get configuration for a specific architecture
 */
router.get('/architecture/:key', (req, res) => {
    if (!modelRegistry || !modelRegistry.architectures) {
        return res.status(404).json({ error: 'Model registry not loaded' });
    }

    const arch = modelRegistry.architectures[req.params.key];
    if (!arch) {
        return res.status(404).json({
            error: 'Architecture not found',
            available: Object.keys(modelRegistry.architectures)
        });
    }

    res.json({
        key: req.params.key,
        ...arch
    });
});

/**
 * GET /api/local-models/:id
 * Get info about a specific model
 */
router.get('/:id', async (req, res) => {
    try {
        const models = await getCachedModels();
        const model = models.find(m => m.id === req.params.id);

        if (!model) {
            return res.status(404).json({ error: 'Model not found' });
        }

        res.json(model);
    } catch (error) {
        console.error('Error fetching model:', error);
        res.status(500).json({ error: error.message });
    }
});

export async function executeLocalImageGeneration(inputSnapshot, locals = {}) {
    const { runLocalInference, checkInferenceAvailable } = await import('../services/local-inference.js');
    const availability = await checkInferenceAvailable();
    if (!availability.available) {
        throw new Error(availability.error || 'Local inference is unavailable');
    }

    const {
        nodeId,
        generationTaskId,
        modelId,
        modelPath,
        prompt,
        negativePrompt,
        aspectRatio,
        resolution,
        steps,
        guidanceScale,
        seed
    } = inputSnapshot;

    let finalModelPath = modelPath;
    if (!finalModelPath && modelId) {
        const models = await getCachedModels();
        const model = models.find(candidate => candidate.id === modelId);
        if (!model) throw new TypeError('Model not found');
        finalModelPath = model.path;
    }

    if (!finalModelPath) throw new TypeError('Model path or modelId required');
    if (!prompt) throw new TypeError('Prompt is required');

    console.log(`[Local Models] Starting generation with model: ${path.basename(finalModelPath)}`);
    const result = await runLocalInference({
        modelPath: finalModelPath,
        prompt,
        negativePrompt,
        aspectRatio,
        resolution,
        steps,
        guidanceScale,
        seed
    });
    if (!result.success || !result.resultUrl) {
        throw new Error(result.error || 'Local image generation failed');
    }

    const createdAt = new Date().toISOString();
    const take = createMediaTake({
        nodeId: nodeId || path.basename(result.resultUrl),
        type: 'image',
        url: result.resultUrl,
        prompt,
        model: modelId || finalModelPath,
        createdAt,
        metadata: {
            filename: path.basename(result.resultUrl),
            modelType: result.modelType,
            device: result.device,
            local: true,
            generationTaskId
        }
    });

    if (locals.IMAGES_DIR) {
        const metadata = {
            id: take.id,
            takeId: take.id,
            nodeId: nodeId || take.nodeId,
            filename: path.basename(result.resultUrl),
            prompt,
            model: modelId || finalModelPath,
            createdAt,
            type: 'images',
            mediaType: 'image',
            generationTaskId,
            metadata: take.metadata
        };
        fsSync.writeFileSync(
            path.join(locals.IMAGES_DIR, `${take.id}.json`),
            JSON.stringify(metadata, null, 2)
        );
    }

    return {
        resultUrl: result.resultUrl,
        take,
        modelType: result.modelType,
        device: result.device
    };
}

/**
 * POST /api/local-models/generate
 * Compatibility endpoint backed by the shared GenerationTask queue.
 */
router.post('/generate', async (req, res) => {
    try {
        const manager = req.app.locals.GENERATION_TASK_MANAGER;
        if (!manager) throw new Error('Generation task manager is not initialized');
        const model = req.body.modelId || req.body.modelPath || 'local-image-model';
        const nodeId = req.body.nodeId || `legacy-local-${crypto.randomUUID()}`;
        const { task } = await manager.submitTask({
            workflowId: req.body.workflowId ?? null,
            nodeId,
            operation: 'generate-local-image',
            provider: 'local',
            model,
            inputSnapshot: { ...req.body, nodeId },
            parameters: {
                modelId: req.body.modelId,
                modelPath: req.body.modelPath,
                aspectRatio: req.body.aspectRatio,
                resolution: req.body.resolution,
                steps: req.body.steps,
                guidanceScale: req.body.guidanceScale,
                seed: req.body.seed
            }
        });
        const terminalTask = await manager.waitForTask(task.taskId);
        if (terminalTask.status !== 'succeeded' || !terminalTask.output?.resultUrl) {
            const taskMessage = terminalTask.error?.message || 'Local generation failed';
            const statusCode = terminalTask.status === 'cancelled'
                ? 409
                : /model not found/i.test(taskMessage)
                    ? 404
                    : terminalTask.error?.code === 'VALIDATION_ERROR'
                        ? 400
                        : /unavailable/i.test(taskMessage)
                            ? 503
                            : 500;
            return res.status(statusCode).json({
                success: false,
                error: taskMessage,
                task: terminalTask
            });
        }

        return res.json({
            success: true,
            ...terminalTask.output,
            task: terminalTask
        });
    } catch (error) {
        console.error('Error in local generation:', error);
        return res.status(error instanceof TypeError ? 400 : 500).json({
            success: false,
            error: error.message
        });
    }
});

export default router;
