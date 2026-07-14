import assert from 'node:assert/strict';
import test from 'node:test';

import {
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
