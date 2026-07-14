import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildStoryPackageTaskOutput,
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

test('task output preserves stable shot ids and advances both document revisions', () => {
    const task = {
        taskId: 'task-1',
        provider: 'openai',
        model: 'gpt-4.1-mini',
        inputSnapshot: {
            scriptRevision: 2,
            storyboardRevision: 4,
            sourceText: 'A paper moon',
            selectedImageModel: 'gpt-image-2',
            scriptData: {
                schemaVersion: 1,
                title: 'Paper Moon',
                sourceText: 'A paper moon',
                synopsis: '',
                styleAnchor: '',
                characterDNA: {},
                referenceAssets: [],
                revision: 2,
                apiKey: 'script-secret',
                futureScript: {
                    keep: 'script-extension',
                    accessToken: 'script-access-token'
                },
                createdAt: '2026-07-14T00:00:00.000Z',
                updatedAt: '2026-07-14T00:00:00.000Z'
            },
            storyboardData: {
                schemaVersion: 1,
                sourceScriptNodeId: 'script-1',
                selectedImageModel: 'gpt-image-2',
                revision: 4,
                password: 'storyboard-secret',
                futureStoryboard: {
                    keep: 'storyboard-extension',
                    secretKey: 'storyboard-secret-key'
                },
                createdAt: '2026-07-14T00:00:00.000Z',
                updatedAt: '2026-07-14T00:00:00.000Z',
                shots: [{
                    id: 'stable-shot',
                    order: 0,
                    sceneNumber: 1,
                    description: 'Old description',
                    cameraAngle: 'Wide shot',
                    mood: 'Old mood',
                    imageNodeId: 'image-1',
                    status: 'image-ready',
                    revision: 3,
                    authorization: 'shot-authorization',
                    nested: {
                        bearerToken: 'shot-token',
                        keep: 'shot-nested-extension'
                    },
                    futureShot: {
                        keep: 'shot-extension'
                    }
                }]
            }
        }
    };
    const output = buildStoryPackageTaskOutput(task, {
        story: 'A polished paper moon story',
        styleAnchor: 'paper craft',
        characterDNA: {},
        scripts: [{
            sceneNumber: 1,
            description: 'The paper moon unfolds',
            cameraAngle: 'Wide shot',
            cameraMovement: 'Push in',
            lighting: 'Blue hour',
            mood: 'Wonder'
        }]
    }, '2026-07-14T00:01:00.000Z');

    assert.equal(output.kind, 'story-package');
    assert.equal(output.scriptData.revision, 3);
    assert.equal(output.storyboardData.revision, 5);
    assert.equal(output.scriptData.revision, output.scriptRevision + 1);
    assert.equal(output.storyboardData.revision, output.storyboardRevision + 1);
    assert.equal(output.storyboardData.shots[0].id, 'stable-shot');
    assert.equal(output.storyboardData.shots[0].imageNodeId, 'image-1');
    assert.equal(output.scriptData.apiKey, undefined);
    assert.equal(output.scriptData.futureScript.keep, 'script-extension');
    assert.equal(output.scriptData.futureScript.accessToken, undefined);
    assert.equal(output.storyboardData.password, undefined);
    assert.equal(output.storyboardData.futureStoryboard.keep, 'storyboard-extension');
    assert.equal(output.storyboardData.futureStoryboard.secretKey, undefined);
    assert.equal(output.storyboardData.shots[0].authorization, undefined);
    assert.equal(output.storyboardData.shots[0].nested.bearerToken, undefined);
    assert.equal(output.storyboardData.shots[0].nested.keep, 'shot-nested-extension');
    assert.equal(output.storyboardData.shots[0].futureShot.keep, 'shot-extension');
});
