// Load environment variables FIRST before any other imports
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import generationRoutes, {
    createGenerationTaskExecutor,
    recoverGenerationTaskOutput
} from './routes/generation.js';
import twitterRoutes from './routes/twitter.js';
import tiktokPostRoutes from './routes/tiktok-post.js';
import localModelsRoutes from './routes/local-models.js';
import storyboardRoutes from './routes/storyboard.js';
import workflowRoutes from './routes/workflows.js';
import workflowTemplateRoutes from './routes/workflow-templates.js';
import libraryRoutes from './routes/library.js';
import assetRoutes from './routes/assets.js';
import subjectAssetRoutes from './routes/subject-assets.js';
import mediaToolRoutes from './routes/media-tools.js';
import chatRoutes from './routes/chat.js';
import { createGenerationTaskManager } from './services/generationTasks.js';
import { isTrustedLocalOrigin } from './services/localOriginPolicy.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;
const HOST = process.env.SERVER_HOST || '127.0.0.1';
const ALLOWED_BROWSER_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS || process.env.TASK_ALLOWED_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

// Ensure library directories exist
const LIBRARY_DIR = path.join(__dirname, '..', 'library');
const WORKFLOWS_DIR = path.join(LIBRARY_DIR, 'workflows');
const WORKFLOW_TEMPLATES_DIR = path.join(LIBRARY_DIR, 'templates');
const IMAGES_DIR = path.join(LIBRARY_DIR, 'images');
const VIDEOS_DIR = path.join(LIBRARY_DIR, 'videos');
const AUDIO_DIR = path.join(LIBRARY_DIR, 'audio');
const CHATS_DIR = path.join(LIBRARY_DIR, 'chats');
const LIBRARY_ASSETS_DIR = path.join(LIBRARY_DIR, 'assets');
const SERVER_DATA_DIR = path.join(__dirname, '..', '.twitcanva');
const TASKS_DIR = path.join(SERVER_DATA_DIR, 'tasks');

[LIBRARY_DIR, WORKFLOWS_DIR, WORKFLOW_TEMPLATES_DIR, IMAGES_DIR, VIDEOS_DIR, AUDIO_DIR, CHATS_DIR, LIBRARY_ASSETS_DIR, TASKS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// The local backend contains provider credentials and task history; reject arbitrary browser origins.
app.use((req, res, next) => {
    if (isTrustedLocalOrigin(req.get('origin'), ALLOWED_BROWSER_ORIGINS)) return next();
    return res.status(403).json({ error: 'This local API only accepts trusted workbench origins.' });
});
app.use(cors({
    origin(origin, callback) {
        callback(null, isTrustedLocalOrigin(origin, ALLOWED_BROWSER_ORIGINS));
    }
}));
app.use(express.json({ limit: '100mb' }));

// Serve static assets from library with CORS headers for cross-origin image access
app.use('/library', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
}, express.static(LIBRARY_DIR));


const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
    console.warn("SERVER WARNING: GEMINI_API_KEY is not set in environment or .env file.");
}

const getClient = () => {
    return new GoogleGenAI({ apiKey: API_KEY || '' });
};

// ============================================================================
// KLING AI CONFIGURATION
// ============================================================================

const KLING_ACCESS_KEY = process.env.KLING_ACCESS_KEY;
const KLING_SECRET_KEY = process.env.KLING_SECRET_KEY;
const KLING_BASE_URL = 'https://api-singapore.klingai.com';

if (!KLING_ACCESS_KEY || !KLING_SECRET_KEY) {
    console.warn("SERVER WARNING: KLING_ACCESS_KEY or KLING_SECRET_KEY not set. Kling AI models will not work.");
}

// ============================================================================
// HAILUO AI CONFIGURATION
// ============================================================================

const HAILUO_API_KEY = process.env.HAILUO_API_KEY;

if (!HAILUO_API_KEY) {
    console.warn("SERVER WARNING: HAILUO_API_KEY not set. Hailuo AI models will not work.");
}

// ============================================================================
// OPENAI GPT IMAGE CONFIGURATION
// ============================================================================

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL;
const OPENAI_IMAGE_API_KEY = process.env.OPENAI_IMAGE_API_KEY;
const OPENAI_IMAGE_BASE_URL = process.env.OPENAI_IMAGE_BASE_URL;
const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL;
const OPENAI_TEXT_MODEL = process.env.OPENAI_TEXT_MODEL;
const OPENAI_CHAT_COMPLETIONS_PATH = process.env.OPENAI_CHAT_COMPLETIONS_PATH;
const SEEDANCE_API_KEY = process.env.SEEDANCE_API_KEY;
const SEEDANCE_BASE_URL = process.env.SEEDANCE_BASE_URL;
const SEEDANCE_SUBMIT_PATH = process.env.SEEDANCE_SUBMIT_PATH;
const SEEDANCE_STATUS_PATH = process.env.SEEDANCE_STATUS_PATH;

if (!OPENAI_API_KEY && !OPENAI_IMAGE_API_KEY) {
    console.warn("SERVER WARNING: OPENAI_API_KEY or OPENAI_IMAGE_API_KEY not set. OpenAI GPT Image models will not work.");
}

// ============================================================================
// FAL.AI CONFIGURATION (for Kling 2.6 Motion Control)
// ============================================================================

const FAL_API_KEY = process.env.FAL_API_KEY;

if (!FAL_API_KEY) {
    console.warn("SERVER WARNING: FAL_API_KEY not set. Kling 2.6 Motion Control will not work.");
}

// Set up app.locals for sharing config with route modules
app.locals.GEMINI_API_KEY = API_KEY;
app.locals.KLING_ACCESS_KEY = KLING_ACCESS_KEY;
app.locals.KLING_SECRET_KEY = KLING_SECRET_KEY;
app.locals.HAILUO_API_KEY = HAILUO_API_KEY;
app.locals.OPENAI_API_KEY = OPENAI_API_KEY;
app.locals.OPENAI_BASE_URL = OPENAI_BASE_URL;
app.locals.OPENAI_IMAGE_API_KEY = OPENAI_IMAGE_API_KEY;
app.locals.OPENAI_IMAGE_BASE_URL = OPENAI_IMAGE_BASE_URL;
app.locals.OPENAI_IMAGE_MODEL = OPENAI_IMAGE_MODEL;
app.locals.OPENAI_TEXT_MODEL = OPENAI_TEXT_MODEL;
app.locals.OPENAI_CHAT_COMPLETIONS_PATH = OPENAI_CHAT_COMPLETIONS_PATH;
app.locals.SEEDANCE_API_KEY = SEEDANCE_API_KEY;
app.locals.SEEDANCE_BASE_URL = SEEDANCE_BASE_URL;
app.locals.SEEDANCE_SUBMIT_PATH = SEEDANCE_SUBMIT_PATH;
app.locals.SEEDANCE_STATUS_PATH = SEEDANCE_STATUS_PATH;
app.locals.FAL_API_KEY = FAL_API_KEY;
app.locals.IMAGES_DIR = IMAGES_DIR;
app.locals.VIDEOS_DIR = VIDEOS_DIR;
app.locals.AUDIO_DIR = AUDIO_DIR;
app.locals.LIBRARY_DIR = LIBRARY_DIR;
app.locals.WORKFLOWS_DIR = WORKFLOWS_DIR;
app.locals.WORKFLOW_TEMPLATES_DIR = WORKFLOW_TEMPLATES_DIR;
app.locals.CHATS_DIR = CHATS_DIR;
app.locals.LIBRARY_ASSETS_DIR = LIBRARY_ASSETS_DIR;
app.locals.TASKS_DIR = TASKS_DIR;
app.locals.TASK_ALLOWED_ORIGINS = ALLOWED_BROWSER_ORIGINS;
app.locals.ROOT_DIR = path.join(__dirname, '..');

const generationTaskManager = createGenerationTaskManager({
    tasksDir: TASKS_DIR,
    concurrency: Number(process.env.GENERATION_CONCURRENCY) || 2,
    executor: createGenerationTaskExecutor(app.locals),
    recoverInterruptedTask: task => recoverGenerationTaskOutput(task, app.locals)
});
app.locals.GENERATION_TASK_MANAGER = generationTaskManager;
await generationTaskManager.initialize();

// ============================================================================
// WORKFLOW SANITIZATION HELPERS
// ============================================================================

/**
 * Saves base64 data URL to a file and returns the file URL path.
 * @param {string} dataUrl - Base64 data URL (e.g., data:image/png;base64,...)
 * @returns {{ url: string } | null} - File URL path or null if not base64
 */
function saveBase64ToFile(dataUrl) {
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
        return null;
    }

    const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) return null;

    const mimeType = matches[1];
    const base64Data = matches[2];

    try {
        const buffer = Buffer.from(base64Data, 'base64');
        const id = `wf_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

        let filename, targetDir, urlType;

        if (mimeType.startsWith('video/')) {
            filename = `${id}.mp4`;
            targetDir = VIDEOS_DIR;
            urlType = 'videos';
        } else {
            const ext = mimeType === 'image/jpeg' ? 'jpg' : 'png';
            filename = `${id}.${ext}`;
            targetDir = IMAGES_DIR;
            urlType = 'images';
        }

        fs.writeFileSync(path.join(targetDir, filename), buffer);
        console.log(`  [Workflow Sanitize] Saved base64 -> /library/${urlType}/${filename}`);

        return { url: `/library/${urlType}/${filename}` };
    } catch (err) {
        console.error('  [Workflow Sanitize] Failed to save base64:', err.message);
        return null;
    }
}

/**
 * Sanitizes workflow nodes by converting base64 data to file URLs.
 * Prevents large base64 strings from bloating workflow JSON files.
 * @param {Array} nodes - Array of workflow nodes
 * @returns {Array} - Sanitized nodes with file URLs instead of base64
 */
function sanitizeWorkflowNodes(nodes) {
    if (!nodes || !Array.isArray(nodes)) return nodes;

    let sanitizedCount = 0;

    const sanitized = nodes.map(node => {
        const cleanNode = { ...node };

        // Check resultUrl for base64 data
        if (cleanNode.resultUrl && cleanNode.resultUrl.startsWith('data:')) {
            const saved = saveBase64ToFile(cleanNode.resultUrl);
            if (saved) {
                cleanNode.resultUrl = saved.url;
                sanitizedCount++;
            }
        }

        // Check lastFrame for base64 data (video nodes)
        if (cleanNode.lastFrame && cleanNode.lastFrame.startsWith('data:')) {
            const saved = saveBase64ToFile(cleanNode.lastFrame);
            if (saved) {
                cleanNode.lastFrame = saved.url;
                sanitizedCount++;
            }
        }

        // Check editorCanvasData for base64 data (Image Editor)
        if (cleanNode.editorCanvasData && cleanNode.editorCanvasData.startsWith('data:')) {
            const saved = saveBase64ToFile(cleanNode.editorCanvasData);
            if (saved) {
                cleanNode.editorCanvasData = saved.url;
                sanitizedCount++;
            }
        }

        // Check editorBackgroundUrl for base64 data (Image Editor)
        if (cleanNode.editorBackgroundUrl && cleanNode.editorBackgroundUrl.startsWith('data:')) {
            const saved = saveBase64ToFile(cleanNode.editorBackgroundUrl);
            if (saved) {
                cleanNode.editorBackgroundUrl = saved.url;
                sanitizedCount++;
            }
        }

        return cleanNode;
    });

    if (sanitizedCount > 0) {
        console.log(`[Workflow Sanitize] Converted ${sanitizedCount} base64 field(s) to file URLs`);
    }

    return sanitized;
}

// Mount generation routes (image and video generation)
app.use('/api', generationRoutes);

// Mount Twitter routes (Post to X feature)
app.use('/api/twitter', twitterRoutes);

// Mount TikTok routes (Post to TikTok feature)
app.use('/api/tiktok-post', tiktokPostRoutes);

// Mount Local Models routes (local open-source model discovery)
app.use('/api/local-models', localModelsRoutes);

// Mount Storyboard routes (AI script generation)
app.use('/api/storyboard', storyboardRoutes);

// Mount extracted foundation routes before the legacy inline handlers below.
app.use('/api', workflowRoutes);
app.use('/api', workflowTemplateRoutes);
app.use('/api', libraryRoutes);
app.use('/api', assetRoutes);
app.use('/api', subjectAssetRoutes);
app.use('/api', mediaToolRoutes);
app.use('/api', chatRoutes);

// NOTE: Old Kling helpers removed - now in server/services/kling.js



// ============================================================================
// GEMINI IMAGE DESCRIPTION API
// ============================================================================

// Describe an image for prompt generation
app.post('/api/gemini/describe-image', async (req, res) => {
    try {
        const { imageUrl, prompt } = req.body;
        console.log(`[Gemini DescribeV2] Request received. imageUrl: ${imageUrl ? (imageUrl.length > 100 ? imageUrl.substring(0, 100) + '...' : imageUrl) : 'missing'}`);
        // DEBUG: Verify story context injection
        if (prompt) {
            console.log('[Gemini DescribeV2] Received Prompt:', prompt);
        }

        if (!imageUrl) {
            return res.status(400).json({ error: 'Image URL is required' });
        }

        // Handle base64 or file URL
        let imagePart;

        // Check if it's a data URL (base64)
        if (imageUrl.startsWith('data:')) {
            const matches = imageUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (matches && matches.length === 3) {
                imagePart = {
                    inlineData: {
                        data: matches[2],
                        mimeType: matches[1]
                    }
                };
            }
        }
        // Handle local file paths (e.g., /library/images/...)
        else {
            // Strip domain if present to get relative path
            let cleanUrl = imageUrl;
            try {
                if (imageUrl.startsWith('http')) {
                    const u = new URL(imageUrl);
                    cleanUrl = u.pathname;
                }
            } catch (e) {
                // ignore invalid url parse, treat as path
            }

            // CRITICAL: Strip query string (cache busting params like ?t=123)
            if (cleanUrl.includes('?')) {
                cleanUrl = cleanUrl.split('?')[0];
            }

            console.log(`[Gemini DescribeV2] Cleaned path: ${cleanUrl}`);

            if (cleanUrl.startsWith('/library/')) {
                // Need to read the file from disk
                // Convert URL path to system path
                let fullPath = '';

                if (cleanUrl.startsWith('/library/images/')) {
                    const relativePath = cleanUrl.replace('/library/images/', '');
                    fullPath = path.join(IMAGES_DIR, relativePath);
                } else if (cleanUrl.startsWith('/library/videos/')) {
                    return res.status(400).json({ error: 'Video description not directly supported, use a frame.' });
                }

                console.log(`[Gemini DescribeV2] Resolved path: ${fullPath}`);

                if (fullPath && fs.existsSync(fullPath)) {
                    const imageData = fs.readFileSync(fullPath);
                    const base64Data = imageData.toString('base64');
                    const mimeType = fullPath.endsWith('.png') ? 'image/png' :
                        fullPath.endsWith('.jpg') || fullPath.endsWith('.jpeg') ? 'image/jpeg' : 'image/webp';

                    imagePart = {
                        inlineData: {
                            data: base64Data,
                            mimeType: mimeType
                        }
                    };
                } else {
                    console.log(`[Gemini DescribeV2] File not found at: ${fullPath}`);
                }
            }
        }

        if (!imagePart) {
            console.log('[Gemini DescribeV2] Failed to process image part');
            return res.status(400).json({ error: 'Could not process image URL. Provide base64 data or a valid library path.', debug: { imageUrl } });
        }

        const client = getClient();
        // Correct SDK usage for @google/genai ^1.32.0
        const result = await client.models.generateContent({
            model: "gemini-2.0-flash",
            contents: {
                parts: [
                    { text: prompt || "Describe this image in detail for video generation." },
                    imagePart
                ]
            }
        });

        let text = "";

        // Handle @google/genai SDK response structure
        if (result.candidates && result.candidates.length > 0) {
            const candidate = result.candidates[0];
            if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
                text = candidate.content.parts[0].text || "";
            }
        }
        // Fallback for other potential response shapes
        else if (result.response && typeof result.response.text === 'function') {
            text = result.response.text();
        }

        if (!text) {
            console.warn('[Gemini DescribeV2] Warning: No text content found in response.');
            console.debug('[Gemini DescribeV2] Response dump:', JSON.stringify(result, null, 2));
        }

        res.json({ description: text });

    } catch (error) {
        console.error("Describe image error:", error);
        res.status(500).json({ error: error.message });
    }
});

// Optimize a prompt for video generation
app.post('/api/gemini/optimize-prompt', async (req, res) => {
    try {
        const { prompt } = req.body;
        console.log(`[Gemini Optimize] Request received. Prompt: ${prompt ? (prompt.length > 50 ? prompt.substring(0, 50) + '...' : prompt) : 'missing'}`);

        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        const client = getClient();
        const systemInstruction = "You are an expert video prompt engineer. Your goal is to rewrite the user's prompt to be descriptive, visual, and optimized for AI video generation models like Veo, Kling, and Hailuo. detailed, cinematic, and focused on motion and atmosphere. Keep it under 60 words. Output ONLY the rewritten prompt.";

        const result = await client.models.generateContent({
            model: "gemini-2.0-flash",
            contents: {
                parts: [
                    { text: `${systemInstruction}\n\nUser Prompt: ${prompt}` }
                ]
            }
        });

        let text = "";

        // Handle @google/genai SDK response structure
        if (result.candidates && result.candidates.length > 0) {
            const candidate = result.candidates[0];
            if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
                text = candidate.content.parts[0].text || "";
            }
        }
        // Fallback for other potential response shapes
        else if (result.response && typeof result.response.text === 'function') {
            text = result.response.text();
        }

        if (!text) {
            console.warn('[Gemini Optimize] Warning: No text content found in response.');
            return res.status(500).json({ error: 'Failed to optimize prompt' });
        }

        // Clean up text (remove quotes if present)
        text = text.trim().replace(/^["']|["']$/g, '');

        res.json({ optimizedPrompt: text });

    } catch (error) {
        console.error("Optimize prompt error:", error);
        res.status(500).json({ error: error.message });
    }
});

// NOTE: Old generation routes removed - now in server/routes/generation.js





// ============================================================================
// CHAT AGENT API
// NOTE: Currently using LangGraph.js. If more complex agent capabilities
// are needed (multi-agent, advanced tools), consider migrating to Python.
// ============================================================================


// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(__dirname, '..', 'dist');
    app.use(express.static(distPath));

    // Handle SPA routing: serve index.html for any unknown routes
    app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
    });
}

app.listen(PORT, HOST, () => {
    console.log(`Backend server running on http://${HOST}:${PORT}`);
});
