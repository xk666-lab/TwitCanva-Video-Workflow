import { GoogleGenerativeAI } from '@google/generative-ai';
import { resolveImageToBase64 } from '../utils/imageHelpers.js';
import { requestChatCompletion } from './openaiChat.js';
import { generateStoryPackage } from './storyboardText.js';

const SENSITIVE_STORY_PACKAGE_OUTPUT_KEY = /(api.?key|(?:access|private|secret).?key|authorization|authorisation|token|secret|password)/i;

function sanitizeStoryPackageOutputValue(value) {
    if (Array.isArray(value)) {
        return value.map(item => sanitizeStoryPackageOutputValue(item) ?? null);
    }
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value)
                .filter(([key]) => !SENSITIVE_STORY_PACKAGE_OUTPUT_KEY.test(key))
                .map(([key, item]) => [key, sanitizeStoryPackageOutputValue(item)])
                .filter(([, item]) => item !== undefined)
        );
    }
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    return undefined;
}

export function normalizeTextReferences({ characterDescriptions = [], referenceImages = [] }) {
    if (Array.isArray(characterDescriptions) && characterDescriptions.length > 0) {
        return characterDescriptions.map(character => ({
            name: character.name,
            description: [
                character.description,
                character.category ? `category: ${character.category}` : ''
            ].filter(Boolean).join('; ') || 'Reference asset'
        }));
    }
    return Array.isArray(referenceImages)
        ? referenceImages.map(reference => ({
            name: reference.name,
            description: `${reference.category || 'Reference'} visual asset selected from the canvas library`
        }))
        : [];
}

export function resolveStoryboardTextProvider(locals) {
    if (locals.OPENAI_API_KEY) {
        return { provider: 'openai', model: locals.OPENAI_TEXT_MODEL || 'gpt-4.1-mini' };
    }
    if (locals.GEMINI_API_KEY) {
        return { provider: 'gemini', model: 'gemini-2.0-flash' };
    }
    throw new Error('No text generation API key configured. Add OPENAI_API_KEY or GEMINI_API_KEY to .env');
}

export async function retryOperation(operation, maxRetries = 3, initialDelayMs = 2000) {
    let delay = initialDelayMs;
    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
        try {
            return await operation();
        } catch (error) {
            if (attempt === maxRetries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2;
        }
    }
    throw new Error('Storyboard provider retry loop ended unexpectedly');
}

async function defaultOpenAIRequest(locals, messages, model = locals.OPENAI_TEXT_MODEL || 'gpt-4.1-mini') {
    return retryOperation(() => requestChatCompletion({
        messages,
        apiKey: locals.OPENAI_API_KEY,
        baseURL: locals.OPENAI_BASE_URL,
        model,
        chatCompletionsPath: locals.OPENAI_CHAT_COMPLETIONS_PATH
    }));
}

export function createOpenAIStoryboardRequester(locals) {
    return locals.OPENAI_API_KEY
        ? messages => defaultOpenAIRequest(locals, messages)
        : null;
}

async function defaultGeminiRequest(locals, messages) {
    const genAI = new GoogleGenerativeAI(locals.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const prompt = messages.map(message => `${message.role.toUpperCase()}:\n${message.content}`).join('\n\n');
    const result = await retryOperation(() => model.generateContent(prompt));
    return result.response.text();
}

export async function generateStoryPackageWithConfiguredProvider({
    locals,
    payload,
    dependencies = {}
}) {
    const selected = resolveStoryboardTextProvider(locals);
    const requestText = selected.provider === 'openai'
        ? messages => (dependencies.requestOpenAI
            ? dependencies.requestOpenAI(messages, selected.model)
            : defaultOpenAIRequest(locals, messages, selected.model))
        : messages => (dependencies.requestGemini
            ? dependencies.requestGemini(messages)
            : defaultGeminiRequest(locals, messages));
    const result = await generateStoryPackage({
        ...payload,
        characterDescriptions: normalizeTextReferences(payload),
        requestText
    });
    return { ...result, provider: selected.provider, model: selected.model };
}

export function buildStoryPackageTaskOutput(task, result, now = new Date().toISOString()) {
    const input = task.inputSnapshot;
    const previousScript = input.scriptData || {};
    const previousStoryboard = input.storyboardData || {};
    const previousShots = Array.isArray(previousStoryboard.shots) ? previousStoryboard.shots : [];
    const scripts = Array.isArray(result.scripts) ? result.scripts : [];
    const generatedBy = { taskId: task.taskId, provider: task.provider, model: task.model };
    const shots = scripts.map((scene, index) => {
        const previous = previousShots[index] || {};
        return {
            ...previous,
            id: previous.id || `shot-${task.nodeId}-${index + 1}`,
            order: index,
            sceneNumber: Number(scene.sceneNumber || index + 1),
            description: String(scene.description || ''),
            cameraAngle: String(scene.cameraAngle || 'Medium shot'),
            ...(scene.cameraMovement ? { cameraMovement: String(scene.cameraMovement) } : {}),
            ...(scene.lighting ? { lighting: String(scene.lighting) } : {}),
            mood: String(scene.mood || ''),
            status: previous.imageNodeId
                ? (previous.videoNodeId ? 'video-ready' : 'image-ready')
                : 'ready',
            error: undefined,
            revision: Number(previous.revision || 0) + 1
        };
    });
    // Client task-result guards compare these immutable base revisions; the embedded documents advance on success.
    return sanitizeStoryPackageOutputValue({
        kind: 'story-package',
        scriptRevision: input.scriptRevision,
        storyboardRevision: input.storyboardRevision,
        scriptData: {
            ...previousScript,
            sourceText: input.sourceText,
            synopsis: result.story || input.sourceText,
            styleAnchor: result.styleAnchor || '',
            characterDNA: result.characterDNA || {},
            referenceAssets: input.referenceAssets || [],
            revision: Number(input.scriptRevision) + 1,
            generatedBy,
            updatedAt: now
        },
        storyboardData: {
            ...previousStoryboard,
            sourceScriptNodeId: input.scriptNodeId || task.nodeId,
            selectedImageModel: input.selectedImageModel || 'gpt-image-2',
            shots,
            revision: Number(input.storyboardRevision) + 1,
            generatedBy,
            updatedAt: now
        }
    });
}

function extractJsonText(text) {
    const raw = String(text || '').trim();
    if (!raw) throw new Error('AI returned an empty storyboard scripts response');
    if (raw.includes('```json')) return raw.split('```json')[1].split('```')[0].trim();
    if (raw.includes('```')) return raw.split('```')[1].split('```')[0].trim();
    const firstBrace = raw.indexOf('{');
    const lastBrace = raw.lastIndexOf('}');
    return firstBrace !== -1 && lastBrace > firstBrace
        ? raw.slice(firstBrace, lastBrace + 1)
        : raw;
}

async function requestGeminiScriptsWithReferences(locals, payload, dependencies = {}) {
    const {
        story,
        characterDescriptions,
        sceneCount,
        referenceImages,
        characterImages
    } = payload;
    const count = Number.parseInt(sceneCount, 10);

    // Initialize Gemini
    const model = dependencies.geminiModel || new GoogleGenerativeAI(locals.GEMINI_API_KEY)
        .getGenerativeModel({ model: 'gemini-2.0-flash' });
    const imageToBase64 = dependencies.resolveImageToBase64 || resolveImageToBase64;

    // Categorize reference images
    const refs = referenceImages || [];
    const characterRefs = refs.filter(r => r.category === 'Character');
    const sceneRefs = refs.filter(r => r.category === 'Scene');
    const itemRefs = refs.filter(r => r.category === 'Item');
    const styleRefs = refs.filter(r => r.category === 'Style');
    const otherRefs = refs.filter(r => !['Character', 'Scene', 'Item', 'Style'].includes(r.category));

    // Build reference context based on categories
    let referenceContext = '';

    if (characterRefs.length > 0) {
        referenceContext += `\n\nCHARACTER REFERENCES (create detailed "Character DNA" for each - MUST be consistent across all scenes):\n`;
        referenceContext += characterRefs.map((c, i) => `${i + 1}. ${c.name}: Use the provided reference image as the ABSOLUTE TRUTH for this character's appearance.`).join('\n');
    }

    if (sceneRefs.length > 0) {
        referenceContext += `\n\nSCENE/ENVIRONMENT REFERENCES (use these as visual inspiration for environments):\n`;
        referenceContext += sceneRefs.map((s, i) => `${i + 1}. ${s.name}: Incorporate this environment/setting style into relevant scenes.`).join('\n');
    }

    if (itemRefs.length > 0) {
        referenceContext += `\n\nPROP/ITEM REFERENCES (include these objects in scenes where appropriate):\n`;
        referenceContext += itemRefs.map((item, i) => `${i + 1}. ${item.name}: Feature this item/prop in the storyboard where it fits the narrative.`).join('\n');
    }

    if (styleRefs.length > 0) {
        referenceContext += `\n\nVISUAL STYLE REFERENCES (match this art style across ALL panels):\n`;
        referenceContext += styleRefs.map((s, i) => `${i + 1}. ${s.name}: Use this as the visual style guide for the entire storyboard.`).join('\n');
    }

    if (otherRefs.length > 0) {
        referenceContext += `\n\nADDITIONAL REFERENCES:\n`;
        referenceContext += otherRefs.map((r, i) => `${i + 1}. ${r.name}: Incorporate elements from this reference where appropriate.`).join('\n');
    }

    // Also support legacy characterDescriptions format
    const characterContext = characterDescriptions && characterDescriptions.length > 0 && !referenceContext
        ? `\n\nCHARACTERS (create a detailed "Character DNA" for each - this MUST be repeated verbatim in every scene):\n${characterDescriptions.map((c, i) => `${i + 1}. ${c.name}: ${c.description || 'Create a detailed physical description including age, ethnicity, hair style/color, distinctive features, and exact clothing'}`).join('\n')}`
        : '';

    const systemPrompt = `You are a professional film storyboard artist and cinematographer.

Create a cinematic storyboard that tells a REAL story like a movie scene, with professional camera work.

REQUIREMENTS:
1. **Character Consistency**: 
   - If reference images are provided, use them as the ABSOLUTE GROUND TRUTH for gender, age, clothing, and physical appearance.
   - If no image is provided, create a detailed specific look and keep it consistent.

2. **Cinematic Camera Progression**: Vary camera angles like a real film:
   - Scene 1: Establishing shot (Wide/Extreme wide) - set the scene
   - Middle scenes: Mix of Medium shots, Close-ups, Over-the-shoulder
   - Final scene: Impactful shot (can be wide for epic, or close-up for emotional)

3. **Story Arc**: Beginning → Rising action → Climax → Resolution

4. **Lighting Consistency**: Maintain logical lighting throughout (time of day, indoor/outdoor)

${referenceContext || characterContext}

STORY SYNOPSIS:
${story}

Generate exactly ${count} scenes. Return a JSON object with:
- "styleAnchor": A consistent style description (e.g., "photorealistic, cinematic lighting, 35mm film grain, high detail")
- "characterDNA": Object with detailed description for each character that stays CONSTANT
- "scenes": Array of scene objects

Each scene must have:
- "sceneNumber": Scene number
- "description": Detailed visual description (2-3 sentences) that:
  * Uses the character's NAME primarily (do NOT repeat their physical description every time if it's already in characterDNA)
  * Describes the action, environment, and emotion
  * Specifies lighting and atmosphere
- "cameraAngle": Professional camera terminology
- "cameraMovement": Static, Pan, Tilt, Dolly, Tracking, Crane, Handheld
- "lighting": Description of lighting
- "mood": Emotional tone

IMPORTANT: When referring to the specific characters listed above, YOU MUST use the format @CharacterName (e.g., if the character is "Shawn", write "@Shawn"). This triggers the asset link in the UI.

Example format:
{
  "styleAnchor": "photorealistic, cinematic, 35mm film, shallow depth of field",
  "characterDNA": {
    "Shawn": "Asian male, mid-20s, pink dyed wavy hair, round wire-frame glasses, clean-shaven, wearing light blue denim jacket over white t-shirt, dark jeans"
  },
  "scenes": [
    {
      "sceneNumber": 1,
      "description": "@Shawn stands in the doorway of an abandoned warehouse...",
      "cameraAngle": "Wide shot",
      "cameraMovement": "Static",
      "lighting": "Dusty beams of afternoon sunlight streaming through broken windows",
      "mood": "Mysterious, curious"
    }
  ]
}

Respond ONLY with valid JSON, no other text.`;

    // Process images for multimodal prompt
    const promptParts = [systemPrompt];

    // Process reference images for multimodal prompt (new format with categories)
    if (referenceImages && referenceImages.length > 0) {
        console.log('[Storyboard] Processing reference images for scripts...');
        for (const ref of referenceImages) {
            try {
                const fullDataUrl = await imageToBase64(ref.url);
                if (fullDataUrl && fullDataUrl.startsWith('data:')) {
                    const matches = fullDataUrl.match(/^data:(.+);base64,(.+)$/);
                    if (matches) {
                        const mimeType = matches[1];
                        const rawBase64 = matches[2];

                        // Category-specific labels
                        let imageLabel;
                        switch (ref.category) {
                            case 'Character':
                                imageLabel = `REFERENCE IMAGE FOR CHARACTER: ${ref.name}\n(This image is the visual truth for ${ref.name}. Ignore any conflicting text description. Ensure the script matches this character's gender, clothing, and appearance.)`;
                                break;
                            case 'Scene':
                                imageLabel = `REFERENCE IMAGE FOR SCENE/ENVIRONMENT: ${ref.name}\n(Use this as visual inspiration for environment, setting, and atmosphere in relevant scenes.)`;
                                break;
                            case 'Item':
                                imageLabel = `REFERENCE IMAGE FOR PROP/ITEM: ${ref.name}\n(Feature this item/object in scenes where appropriate to the narrative.)`;
                                break;
                            case 'Style':
                                imageLabel = `VISUAL STYLE REFERENCE: ${ref.name}\n(Use this image as the art style guide for ALL panels. Match the color palette, rendering technique, and visual aesthetic.)`;
                                break;
                            default:
                                imageLabel = `REFERENCE IMAGE: ${ref.name}\n(Incorporate elements from this reference where appropriate.)`;
                        }

                        promptParts.push(imageLabel);
                        promptParts.push({
                            inlineData: {
                                data: rawBase64,
                                mimeType: mimeType
                            }
                        });
                        console.log(`[Storyboard] Added ref image for scripts: ${ref.name} (${ref.category}, ${mimeType})`);
                    }
                }
            } catch (error) {
                console.error(`[Storyboard] Failed to process image for ${ref.name}:`, error.message);
            }
        }
    }
    // Fallback: support legacy characterImages format for backwards compatibility
    else if (characterImages && Object.keys(characterImages).length > 0) {
        console.log('[Storyboard] Processing character images for scripts...');
        for (const [name, url] of Object.entries(characterImages)) {
            try {
                const fullDataUrl = await imageToBase64(url);
                if (fullDataUrl && fullDataUrl.startsWith('data:')) {
                    const matches = fullDataUrl.match(/^data:(.+);base64,(.+)$/);
                    if (matches) {
                        const mimeType = matches[1];
                        const rawBase64 = matches[2];

                        promptParts.push(`\nREFERENCE IMAGE FOR CHARACTER: ${name}\n(This image is the visual truth for ${name}. Ignore any conflicting text description. Ensure the script matches this character's gender, clothing, and appearance.)\n`);
                        promptParts.push({
                            inlineData: {
                                data: rawBase64,
                                mimeType: mimeType
                            }
                        });
                        console.log(`[Storyboard] Added ref image for scripts: ${name} (${mimeType})`);
                    }
                }
            } catch (error) {
                console.error(`[Storyboard] Failed to process image for ${name}:`, error.message);
            }
        }
    }

    const result = await retryOperation(() => model.generateContent(promptParts));
    return result.response.text();
}

export async function generateStoryboardScriptsWithConfiguredProvider({
    locals,
    payload,
    dependencies = {}
}) {
    const count = Number.parseInt(payload.sceneCount, 10);
    if (!payload.story || !Number.isFinite(count) || count < 1 || count > 10) {
        throw new TypeError('story is required and sceneCount must be between 1 and 10');
    }

    if (locals.OPENAI_API_KEY) {
        const packageResult = await generateStoryPackageWithConfiguredProvider({
            locals,
            payload: { ...payload, sceneCount: count },
            dependencies: { requestOpenAI: dependencies.requestOpenAI }
        });
        return {
            scripts: packageResult.scripts,
            styleAnchor: packageResult.styleAnchor,
            characterDNA: packageResult.characterDNA,
            story: packageResult.story,
            provider: 'openai',
            model: packageResult.model
        };
    }

    if (!locals.GEMINI_API_KEY) {
        throw new Error('No text generation API key configured. Add OPENAI_API_KEY or GEMINI_API_KEY to .env');
    }

    const responseText = dependencies.requestGeminiScripts
        ? await dependencies.requestGeminiScripts(payload)
        : await requestGeminiScriptsWithReferences(locals, payload, dependencies);
    const parsed = JSON.parse(extractJsonText(responseText));
    const scripts = parsed.scenes || parsed.scripts || parsed;
    if (!Array.isArray(scripts) || scripts.length === 0) {
        throw new Error('AI returned invalid script format. Please try again.');
    }
    return {
        scripts,
        styleAnchor: parsed.styleAnchor || 'photorealistic, cinematic lighting, high detail',
        characterDNA: parsed.characterDNA || {},
        story: payload.story,
        provider: 'gemini',
        model: 'gemini-2.0-flash'
    };
}
