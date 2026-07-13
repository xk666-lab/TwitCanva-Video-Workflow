/**
 * Storyboard text generation helpers.
 *
 * Produces a director-ready story package: polished synopsis + storyboard scripts.
 */

function normalizeSceneCount(sceneCount) {
    const count = Number.parseInt(sceneCount, 10);
    if (!Number.isFinite(count) || count < 1) return 4;
    return Math.min(10, count);
}

function extractJsonText(text) {
    const raw = String(text || '').trim();
    if (!raw) throw new Error('AI returned an empty story package response');

    if (raw.includes('```json')) {
        return raw.split('```json')[1].split('```')[0].trim();
    }

    if (raw.includes('```')) {
        return raw.split('```')[1].split('```')[0].trim();
    }

    const firstBrace = raw.indexOf('{');
    const lastBrace = raw.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
        return raw.slice(firstBrace, lastBrace + 1);
    }

    return raw;
}

export function parseStoryPackageResponse(responseText) {
    let parsed;
    try {
        parsed = JSON.parse(extractJsonText(responseText));
    } catch (error) {
        throw new Error(`Failed to parse story package JSON: ${error.message}`);
    }

    const scripts = parsed.scenes || parsed.scripts;
    if (!Array.isArray(scripts) || scripts.length === 0) {
        throw new Error('Story package must include a valid scenes array');
    }

    return {
        story: String(parsed.story || parsed.synopsis || '').trim(),
        scripts: scripts.map((scene, index) => ({
            sceneNumber: Number(scene.sceneNumber || scene.scene || index + 1),
            description: String(scene.description || scene.visual || '').trim(),
            cameraAngle: String(scene.cameraAngle || scene.shot || 'Medium shot').trim(),
            cameraMovement: String(scene.cameraMovement || scene.movement || 'Static').trim(),
            lighting: String(scene.lighting || '').trim(),
            mood: String(scene.mood || scene.emotion || '').trim()
        })),
        styleAnchor: String(parsed.styleAnchor || parsed.style || 'cinematic, detailed, consistent visual style').trim(),
        characterDNA: parsed.characterDNA && typeof parsed.characterDNA === 'object' ? parsed.characterDNA : {}
    };
}

export function buildStoryPackageMessages({
    story,
    sceneCount,
    tone,
    characterDescriptions = []
}) {
    const count = normalizeSceneCount(sceneCount);
    const characterContext = characterDescriptions.length > 0
        ? characterDescriptions
            .map((character, index) => `${index + 1}. ${character.name}: ${character.description || 'infer a consistent character design from the story'}`)
            .join('\n')
        : 'No fixed characters. Infer the main characters from the story and keep them consistent.';

    const system = `You are an expert AI video director, screenwriter, storyboard artist, and prompt designer.
Turn a rough user idea into a director-workstation story package for AI image/video generation.
Respond in Simplified Chinese.
Return strict JSON only. Do not use markdown. Do not add explanations.`;

    const user = `Create a polished story synopsis and exactly ${count} storyboard scenes from the user idea below.

User idea:
${story}

Tone / style request:
${tone || 'cinematic, visually specific, suitable for short-form AI video generation'}

Character references:
${characterContext}

Return this JSON shape:
{
  "story": "4-6 sentence polished story synopsis in Simplified Chinese for a director to understand",
  "styleAnchor": "unified visual style, e.g. cinematic anime, rainy night, soft rim light",
  "characterDNA": {
    "CharacterName": "stable character design in Simplified Chinese, including age, vibe, hair, clothing, and key identifiers"
  },
  "scenes": [
    {
      "sceneNumber": 1,
      "description": "2-3 sentence visual scene description in Simplified Chinese, including character, setting, action, and emotion",
      "cameraAngle": "shot size / camera position, e.g. Wide shot / Close-up / Low angle",
      "cameraMovement": "movement, e.g. Static / Push in / Tracking / Pan",
      "lighting": "lighting description in Simplified Chinese",
      "mood": "emotional mood in Simplified Chinese"
    }
  ]
}

Requirements:
- The scenes array must contain exactly ${count} items.
- Every scene must be directly usable as an image/video prompt.
- Keep character names consistent across story, characterDNA, and scenes.
- If the user provides only one sentence, expand it into a clear beginning, escalation, turn, and ending.
- Avoid graphic violence, explicit sexual content, and intimate content involving minors.`;

    return [
        { role: 'system', content: system },
        { role: 'user', content: user }
    ];
}

export async function generateStoryPackage({
    story,
    sceneCount,
    tone,
    characterDescriptions,
    requestText
}) {
    if (!story || !String(story).trim()) {
        throw new Error('story is required');
    }
    if (typeof requestText !== 'function') {
        throw new Error('requestText is required');
    }

    const messages = buildStoryPackageMessages({
        story: String(story).trim(),
        sceneCount,
        tone,
        characterDescriptions
    });
    const responseText = await requestText(messages);
    return parseStoryPackageResponse(responseText);
}
