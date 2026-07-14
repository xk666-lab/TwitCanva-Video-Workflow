import assert from 'node:assert/strict';
import test from 'node:test';

import {
    generateStoryboardScriptsWithConfiguredProvider,
    generateStoryPackageWithConfiguredProvider,
    resolveStoryboardTextProvider
} from './storyboardGeneration.js';

test('OpenAI-compatible text provider wins when both keys are configured', () => {
    assert.deepEqual(resolveStoryboardTextProvider({
        OPENAI_API_KEY: 'openai-key',
        OPENAI_TEXT_MODEL: 'gpt-4.1-mini',
        GEMINI_API_KEY: 'gemini-key'
    }), { provider: 'openai', model: 'gpt-4.1-mini' });
});

test('Gemini is the fallback text provider', () => {
    assert.deepEqual(resolveStoryboardTextProvider({ GEMINI_API_KEY: 'gemini-key' }), {
        provider: 'gemini',
        model: 'gemini-2.0-flash'
    });
});

test('story package generation returns the existing response shape', async () => {
    const result = await generateStoryPackageWithConfiguredProvider({
        locals: { OPENAI_API_KEY: 'key', OPENAI_TEXT_MODEL: 'gpt-4.1-mini' },
        payload: {
            story: 'A fox enters a library',
            sceneCount: 1,
            characterDescriptions: []
        },
        dependencies: {
            requestOpenAI: async () => JSON.stringify({
                story: 'A polished fox story',
                styleAnchor: 'storybook',
                characterDNA: {},
                scenes: [{
                    sceneNumber: 1,
                    description: 'The fox opens a glowing book',
                    cameraAngle: 'Medium shot',
                    cameraMovement: 'Push in',
                    lighting: 'Warm light',
                    mood: 'Curious'
                }]
            })
        }
    });

    assert.equal(result.provider, 'openai');
    assert.equal(result.story, 'A polished fox story');
    assert.equal(result.scripts.length, 1);
});

test('missing text credentials fail before provider execution', async () => {
    await assert.rejects(
        generateStoryPackageWithConfiguredProvider({
            locals: {},
            payload: { story: 'No key', sceneCount: 1 }
        }),
        /No text generation API key configured/
    );
});

test('scripts mode keeps the OpenAI-compatible response shape', async () => {
    const result = await generateStoryboardScriptsWithConfiguredProvider({
        locals: { OPENAI_API_KEY: 'key', OPENAI_TEXT_MODEL: 'gpt-4.1-mini' },
        payload: { story: 'A fox enters a library', sceneCount: 1 },
        dependencies: {
            requestOpenAI: async () => JSON.stringify({
                story: 'A fox enters a library',
                styleAnchor: 'storybook',
                characterDNA: {},
                scenes: [{
                    sceneNumber: 1,
                    description: 'The fox opens a book',
                    cameraAngle: 'Medium shot',
                    cameraMovement: 'Static',
                    lighting: 'Warm',
                    mood: 'Curious'
                }]
            })
        }
    });

    assert.equal(result.provider, 'openai');
    assert.equal(result.scripts.length, 1);
    assert.equal(result.styleAnchor, 'storybook');
});

test('scripts mode accepts the existing Gemini JSON shape', async () => {
    const result = await generateStoryboardScriptsWithConfiguredProvider({
        locals: { GEMINI_API_KEY: 'key' },
        payload: { story: 'A train crosses the clouds', sceneCount: 1, referenceImages: [] },
        dependencies: {
            requestGeminiScripts: async () => JSON.stringify({
                styleAnchor: 'cinematic',
                characterDNA: {},
                scenes: [{
                    sceneNumber: 1,
                    description: 'A train leaves a cloud tunnel',
                    cameraAngle: 'Wide shot',
                    cameraMovement: 'Tracking',
                    lighting: 'Sunrise',
                    mood: 'Hopeful'
                }]
            })
        }
    });

    assert.equal(result.provider, 'gemini');
    assert.equal(result.scripts[0].cameraMovement, 'Tracking');
});

test('scripts mode sends the resolved OpenAI fallback model to the requester', async () => {
    let requestedModel;

    await generateStoryboardScriptsWithConfiguredProvider({
        locals: { OPENAI_API_KEY: 'key' },
        payload: { story: 'A fox enters a library', sceneCount: 1 },
        dependencies: {
            requestOpenAI: async (_messages, model) => {
                requestedModel = model;
                return JSON.stringify({
                    story: 'A fox enters a library',
                    styleAnchor: 'storybook',
                    characterDNA: {},
                    scenes: [{
                        sceneNumber: 1,
                        description: 'The fox opens a book',
                        cameraAngle: 'Medium shot',
                        cameraMovement: 'Static',
                        lighting: 'Warm',
                        mood: 'Curious'
                    }]
                });
            }
        }
    });

    assert.equal(requestedModel, 'gpt-4.1-mini');
});

test('scripts mode builds categorized Gemini reference prompt parts through an injected model', async () => {
    const resolvedUrls = [];
    let receivedPromptParts;
    const result = await generateStoryboardScriptsWithConfiguredProvider({
        locals: { GEMINI_API_KEY: 'key' },
        payload: {
            story: 'A fox uses a key to enter a painted library',
            sceneCount: 1,
            referenceImages: [
                { name: 'Mina', category: 'Character', url: 'character.png' },
                { name: 'Cloud Library', category: 'Scene', url: 'scene.png' },
                { name: 'Brass Key', category: 'Item', url: 'item.png' },
                { name: 'Watercolor', category: 'Style', url: 'style.png' }
            ]
        },
        dependencies: {
            geminiModel: {
                generateContent: async promptParts => {
                    receivedPromptParts = promptParts;
                    return {
                        response: {
                            text: () => JSON.stringify({
                                styleAnchor: 'watercolor',
                                characterDNA: {},
                                scenes: [{
                                    sceneNumber: 1,
                                    description: '@Mina enters the library',
                                    cameraAngle: 'Wide shot',
                                    cameraMovement: 'Static',
                                    lighting: 'Warm',
                                    mood: 'Curious'
                                }]
                            })
                        }
                    };
                }
            },
            resolveImageToBase64: async url => {
                resolvedUrls.push(url);
                return 'data:image/png;base64,cHJvbXB0';
            }
        }
    });

    const promptText = receivedPromptParts.filter(part => typeof part === 'string').join('\n');
    assert.equal(result.provider, 'gemini');
    assert.deepEqual(resolvedUrls, ['character.png', 'scene.png', 'item.png', 'style.png']);
    assert.match(promptText, /REFERENCE IMAGE FOR CHARACTER: Mina/);
    assert.match(promptText, /REFERENCE IMAGE FOR SCENE\/ENVIRONMENT: Cloud Library/);
    assert.match(promptText, /REFERENCE IMAGE FOR PROP\/ITEM: Brass Key/);
    assert.match(promptText, /VISUAL STYLE REFERENCE: Watercolor/);
    assert.equal(receivedPromptParts.filter(part => part.inlineData).length, 4);
});

test('scripts mode keeps the legacy characterImages Gemini prompt branch injectable', async () => {
    const resolvedUrls = [];
    let receivedPromptParts;

    await generateStoryboardScriptsWithConfiguredProvider({
        locals: { GEMINI_API_KEY: 'key' },
        payload: {
            story: 'A fox finds a lost map',
            sceneCount: 1,
            referenceImages: [],
            characterImages: { 'Captain Fox': 'legacy-character.png' }
        },
        dependencies: {
            geminiModel: {
                generateContent: async promptParts => {
                    receivedPromptParts = promptParts;
                    return {
                        response: {
                            text: () => JSON.stringify({
                                scenes: [{
                                    sceneNumber: 1,
                                    description: '@Captain Fox finds a map',
                                    cameraAngle: 'Medium shot',
                                    cameraMovement: 'Static',
                                    lighting: 'Morning',
                                    mood: 'Hopeful'
                                }]
                            })
                        }
                    };
                }
            },
            resolveImageToBase64: async url => {
                resolvedUrls.push(url);
                return 'data:image/png;base64,bGVnYWN5';
            }
        }
    });

    const promptText = receivedPromptParts.filter(part => typeof part === 'string').join('\n');
    assert.deepEqual(resolvedUrls, ['legacy-character.png']);
    assert.match(promptText, /REFERENCE IMAGE FOR CHARACTER: Captain Fox/);
    assert.equal(receivedPromptParts.filter(part => part.inlineData).length, 1);
});
