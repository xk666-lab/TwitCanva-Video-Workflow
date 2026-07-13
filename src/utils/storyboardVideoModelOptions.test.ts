import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getDefaultStoryboardVideoModelId,
  getStoryboardVideoModelVariant,
  getStoryboardVideoProviderFamilies,
  normalizeStoryboardVideoSettings
} from './storyboardVideoModelOptions.ts';

test('storyboard video model options expose provider families with selectable variants', () => {
  const families = getStoryboardVideoProviderFamilies();
  const kling = families.find(family => family.id === 'kling');

  assert.ok(kling);
  assert.ok(kling.variants.some(variant => variant.id === 'kling-v2-1' && variant.tier === 'Pro'));
  assert.ok(kling.variants.some(variant => variant.id === 'kling-v2-5-turbo' && variant.tier === 'Fast'));
});

test('storyboard video model options keep the current backend truthful for Veo fast', () => {
  const defaultModel = getStoryboardVideoModelVariant(getDefaultStoryboardVideoModelId());

  assert.equal(defaultModel.id, 'veo-3.1');
  assert.equal(defaultModel.familyName, 'Veo 3.1');
  assert.equal(defaultModel.variantName, 'Fast');
});

test('storyboard video model options use backend-callable Seedance ids instead of display aliases', () => {
  const families = getStoryboardVideoProviderFamilies();
  const allIds = families.flatMap(family => family.variants.map(variant => variant.id));

  assert.ok(allIds.includes('bytedance/seedance-2.0/text-to-video'));
  assert.equal(allIds.includes('seedance-2.0'), false);
});

test('normalizeStoryboardVideoSettings picks valid duration and resolution for the selected variant', () => {
  const normalized = normalizeStoryboardVideoSettings({
    model: 'hailuo-2.3-fast',
    duration: 10,
    resolution: '720p'
  });

  assert.deepEqual(normalized, {
    model: 'hailuo-2.3-fast',
    duration: 5,
    resolution: '768p'
  });
});
