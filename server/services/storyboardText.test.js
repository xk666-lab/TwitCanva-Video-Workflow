import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildStoryPackageMessages,
    parseStoryPackageResponse,
    generateStoryPackage
} from './storyboardText.js';

test('parses story package JSON wrapped in markdown fences', () => {
    const parsed = parseStoryPackageResponse(`
\`\`\`json
{
  "story": "A prince returns to the capital on a snowy night.",
  "styleAnchor": "cinematic anime, snow night",
  "characterDNA": { "Prince": "black-haired young royal in a torn cloak" },
  "scenes": [
    {
      "sceneNumber": 1,
      "description": "The prince crosses the old city gate under heavy snow.",
      "cameraAngle": "Wide shot",
      "cameraMovement": "Tracking",
      "lighting": "cold moonlight",
      "mood": "lonely"
    }
  ]
}
\`\`\`
`);

    assert.equal(parsed.story, 'A prince returns to the capital on a snowy night.');
    assert.equal(parsed.scripts.length, 1);
    assert.equal(parsed.scripts[0].cameraAngle, 'Wide shot');
    assert.deepEqual(parsed.characterDNA, {
        Prince: 'black-haired young royal in a torn cloak'
    });
});

test('rejects story package responses without scenes', () => {
    assert.throws(
        () => parseStoryPackageResponse('{"story":"Only a synopsis, no scenes."}'),
        /valid scenes array/
    );
});

test('builds story package prompt for synopsis and storyboard scripts', () => {
    const messages = buildStoryPackageMessages({
        story: 'A robot learns how to dream for the first time',
        sceneCount: 4,
        tone: 'warm sci-fi',
        characterDescriptions: [{ name: 'Robot A', description: 'old service robot with chipped paint' }]
    });

    assert.equal(messages[0].role, 'system');
    assert.match(messages[0].content, /AI video director/);
    assert.match(messages[0].content, /Respond in Simplified Chinese/);
    assert.match(messages[1].content, /polished story synopsis/);
    assert.match(messages[1].content, /exactly 4 storyboard scenes/);
    assert.match(messages[1].content, /Robot A/);
});

test('generates story package with injected text requester', async () => {
    const calls = [];
    const result = await generateStoryPackage({
        story: 'A girl meets her future self at a rainy train station',
        sceneCount: 3,
        requestText: async (messages) => {
            calls.push(messages);
            return JSON.stringify({
                story: 'A girl meets her future self and decides to change her fate.',
                styleAnchor: 'cinematic anime, rain, neon reflections',
                characterDNA: { Girl: 'short-haired student holding a transparent umbrella' },
                scenes: [
                    {
                        sceneNumber: 1,
                        description: 'The girl stands alone in a rainy train station.',
                        cameraAngle: 'Wide shot',
                        cameraMovement: 'Static',
                        lighting: 'neon rain',
                        mood: 'lonely'
                    }
                ]
            });
        }
    });

    assert.equal(calls.length, 1);
    assert.equal(result.story, 'A girl meets her future self and decides to change her fate.');
    assert.equal(result.scripts.length, 1);
    assert.equal(result.styleAnchor, 'cinematic anime, rain, neon reflections');
});
