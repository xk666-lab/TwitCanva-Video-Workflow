import test from 'node:test';
import assert from 'node:assert/strict';

import { getStoryboardImageModelName, STORYBOARD_IMAGE_MODELS } from './storyboardModelOptions.ts';

test('storyboard image model options expose the default GPT Image 2 model', () => {
  assert.equal(STORYBOARD_IMAGE_MODELS[0].id, 'gpt-image-2');
  assert.equal(getStoryboardImageModelName('gpt-image-2'), 'GPT Image 2');
});

test('getStoryboardImageModelName falls back to the raw id for unknown models', () => {
  assert.equal(getStoryboardImageModelName('custom-model'), 'custom-model');
});
