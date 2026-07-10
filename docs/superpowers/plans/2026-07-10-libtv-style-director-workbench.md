# LibTV-Style Director Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a LibTV-style three-step script director workbench to the existing TwitCanva canvas while preserving the current visual language, workflow JSON compatibility, and manual media-generation boundary.

**Architecture:** Keep the current React/Vite canvas and Express backend. Store structured director projects and assets beside existing workflow nodes, render the workbench as an in-app full-screen overlay, compile prompts through the existing OpenAI-compatible backend, and apply a validated idempotent Graph Patch to create asset and scene planning groups.

**Tech Stack:** React 19, TypeScript 5.8, Vite 6, Vitest, Testing Library, Express 5, Node.js built-in test runner, OpenAI-compatible chat completion service, local workflow JSON.

---

## File Structure

### New frontend files

- `src/test/setup.ts`: Vitest DOM and cleanup setup.
- `src/features/director/types.ts`: DirectorProject, DirectorShot, DirectorAsset, prompt status, and Graph Patch contracts.
- `src/features/director/workflowCompatibility.ts`: Old/new workflow normalization.
- `src/features/director/directorState.ts`: Revision, stale-state, step-gate, and immutable project updates.
- `src/features/director/mentionParser.ts`: `@asset` parsing and asset-reference reconciliation.
- `src/features/director/directorApi.ts`: Browser API client for project generation and prompt compilation.
- `src/features/director/graphBuilder.ts`: Pure idempotent canvas Graph Patch builder and merger.
- `src/features/director/useDirectorWorkbench.ts`: Workbench state and async orchestration.
- `src/features/director/components/DirectorWorkbenchModal.tsx`: Full-screen shell.
- `src/features/director/components/DirectorStepper.tsx`: Three-step header.
- `src/features/director/components/ShotTableStep.tsx`: Editable shot table.
- `src/features/director/components/AssetPreparationStep.tsx`: Referenced-asset preparation.
- `src/features/director/components/PromptCompilationStep.tsx`: Per-shot prompt compilation.
- `src/features/director/components/DirectorNodeContent.tsx`: Script, generator, asset, scene, and shot node bodies.
- `src/features/director/__tests__/*.test.ts(x)`: Focused unit/component tests.

### New backend files

- `server/services/directorProject.js`: Structured director-project prompt, parser, and normalizer.
- `server/services/directorProject.test.js`: Project parser and request tests.
- `server/services/promptCompiler.js`: Per-shot prompt compilation prompt, parser, and partial-error contract.
- `server/services/promptCompiler.test.js`: Prompt compilation tests.

### Existing files to modify

- `package.json`, `package-lock.json`, `vite.config.ts`, `tsconfig.json`: Frontend test runner.
- `src/types.ts`: Backward-compatible director references on NodeData and NodeGroup.
- `server/routes/storyboard.js`: Director project and prompt-compilation endpoints.
- `src/components/Toolbar.tsx`: New AI director entry without removing the old storyboard tool.
- `src/components/AssetLibraryPanel.tsx`: Optional full-asset selection callback.
- `src/components/canvas/NodeContent.tsx`: Director node body dispatch.
- `src/components/canvas/CanvasNode.tsx`: Open-workbench callback and director-node control behavior.
- `src/hooks/useWorkflow.ts`: Save/load directorProjects and directorAssets.
- `src/App.tsx`: Wire director state, toolbar entry, modal, persistence, and graph application.

## Task 1: Add the Frontend Test Harness

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `vite.config.ts`
- Modify: `tsconfig.json`
- Create: `src/test/setup.ts`
- Create: `src/test/smoke.test.ts`

- [ ] **Step 1: Verify that no frontend test command exists**

Run:

```powershell
npm test
```

Expected: FAIL with `Missing script: "test"`.

- [ ] **Step 2: Install the focused test dependencies**

Run:

```powershell
npm install --save-dev vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

Expected: `package.json` and `package-lock.json` include the five packages.

- [ ] **Step 3: Add scripts and Vitest configuration**

Add to `package.json` scripts:

```json
{
  "test": "vitest run",
  "test:watch": "vitest"
}
```

Change `vite.config.ts` to import from `vitest/config` and add the test block while preserving the existing proxy and alias:

```ts
import path from 'path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
    server: {
      proxy: {
        '/api': { target: 'http://localhost:3001', changeOrigin: true, timeout: 600000, proxyTimeout: 600000 },
        '/library': { target: 'http://localhost:3001', changeOrigin: true, timeout: 600000, proxyTimeout: 600000 }
      }
    },
    plugins: [react()],
    resolve: { alias: { '@': path.resolve(__dirname, '.') } },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      clearMocks: true
    }
});
```

Add `vitest/globals` to `tsconfig.json`:

```json
"types": ["node", "vite/client", "vitest/globals"]
```

- [ ] **Step 4: Add setup and smoke test**

Create `src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => cleanup());
```

Create `src/test/smoke.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

describe('frontend test harness', () => {
  it('runs in jsdom', () => {
    const element = document.createElement('div');
    element.textContent = 'TwitCanva';
    expect(element).toHaveTextContent('TwitCanva');
  });
});
```

- [ ] **Step 5: Run the harness**

Run:

```powershell
npm test -- src/test/smoke.test.ts
```

Expected: 1 test passes.

- [ ] **Step 6: Commit only harness files**

```powershell
git add package.json package-lock.json vite.config.ts tsconfig.json src/test/setup.ts src/test/smoke.test.ts
git commit -m "test: add frontend vitest harness"
```

## Task 2: Add Director Domain Contracts and Workflow Compatibility

**Files:**
- Create: `src/features/director/types.ts`
- Create: `src/features/director/workflowCompatibility.ts`
- Create: `src/features/director/__tests__/workflowCompatibility.test.ts`
- Modify: `src/types.ts:1-150`

- [ ] **Step 1: Write failing compatibility tests**

Create `src/features/director/__tests__/workflowCompatibility.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { normalizeDirectorCollections } from '../workflowCompatibility';

describe('normalizeDirectorCollections', () => {
  it('opens legacy workflows with empty director collections', () => {
    expect(normalizeDirectorCollections({ nodes: [], groups: [] })).toEqual({
      directorProjects: [],
      directorAssets: []
    });
  });

  it('preserves director collections from new workflows', () => {
    const project = { id: 'project-1', title: '雪夜归城' };
    const asset = { id: 'asset-1', name: '皇子' };
    expect(normalizeDirectorCollections({
      nodes: [],
      groups: [],
      directorProjects: [project],
      directorAssets: [asset]
    })).toEqual({ directorProjects: [project], directorAssets: [asset] });
  });
});
```

- [ ] **Step 2: Run the tests and verify the missing module failure**

Run:

```powershell
npm test -- src/features/director/__tests__/workflowCompatibility.test.ts
```

Expected: FAIL because `workflowCompatibility.ts` does not exist.

- [ ] **Step 3: Add the domain contracts**

Create `src/features/director/types.ts` with these exported contracts:

```ts
export type DirectorStep = 'shots' | 'assets' | 'prompts';
export type DirectorNodeRole = 'script' | 'script-generator' | 'character' | 'scene' | 'prop' | 'style' | 'shot';
export type DirectorAssetType = 'character' | 'scene' | 'prop' | 'style' | 'audio';
export type PromptStatus = 'missing' | 'generating' | 'ready' | 'stale' | 'error';

export interface DirectorShot {
  id: string;
  sceneId: string;
  order: number;
  duration: number;
  visualDescription: string;
  shotSize: string;
  lighting: string;
  dialogue?: string;
  sound?: string;
  cameraMovement: string;
  assetRefs: string[];
  imagePrompt?: string;
  videoPrompt?: string;
  negativePrompt?: string;
  promptStatus: PromptStatus;
  promptError?: string;
  manualOverride?: boolean;
  sourceRevision: number;
}

export interface DirectorAsset {
  id: string;
  projectId: string;
  type: DirectorAssetType;
  name: string;
  aliases: string[];
  description: string;
  aiBrief: string;
  referenceUrls: string[];
  source: 'generated' | 'library' | 'uploaded' | 'manual';
  status: 'draft' | 'ready' | 'error';
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface DirectorScene {
  id: string;
  name: string;
  description: string;
  assetId: string;
}

export interface DirectorProject {
  id: string;
  title: string;
  sourceNodeId: string;
  generatorNodeId: string;
  currentStep: DirectorStep;
  status: 'draft' | 'generating' | 'ready' | 'error';
  revision: number;
  appliedRevision?: number;
  story: string;
  styleBrief: string;
  targetDuration?: number;
  aspectRatio: string;
  characterIds: string[];
  sceneIds: string[];
  propIds: string[];
  styleIds: string[];
  scenes: DirectorScene[];
  shots: DirectorShot[];
  createdAt: string;
  updatedAt: string;
}

export interface DirectorGraphPatch {
  projectId: string;
  revision: number;
  nodesToCreate: import('../../types').NodeData[];
  nodesToUpdate: Array<Partial<import('../../types').NodeData> & { id: string }>;
  groupsToCreate: import('../../types').NodeGroup[];
  groupsToUpdate: Array<Partial<import('../../types').NodeGroup> & { id: string }>;
}
```

- [ ] **Step 4: Add legacy-safe normalization and root compatibility fields**

Create `src/features/director/workflowCompatibility.ts`:

```ts
import type { DirectorAsset, DirectorProject } from './types';

interface WorkflowLike {
  directorProjects?: DirectorProject[] | unknown[];
  directorAssets?: DirectorAsset[] | unknown[];
}

export function normalizeDirectorCollections(workflow: WorkflowLike) {
  return {
    directorProjects: Array.isArray(workflow.directorProjects) ? workflow.directorProjects : [],
    directorAssets: Array.isArray(workflow.directorAssets) ? workflow.directorAssets : []
  };
}
```

Add to `NodeData` in `src/types.ts`:

```ts
directorRole?: import('./features/director/types').DirectorNodeRole;
directorProjectId?: string;
directorEntityId?: string;
sourceRevision?: number;
stale?: boolean;
```

Add to `NodeGroup`:

```ts
directorProjectId?: string;
groupRole?: 'asset-group' | 'scene-group';
sceneId?: string;
status?: 'idle' | 'stale' | 'error';
collapsed?: boolean;
sourceRevision?: number;
```

- [ ] **Step 5: Run tests and build**

Run:

```powershell
npm test -- src/features/director/__tests__/workflowCompatibility.test.ts
npm run build
```

Expected: compatibility tests pass and Vite build succeeds.

- [ ] **Step 6: Commit the domain foundation**

```powershell
git add src/features/director/types.ts src/features/director/workflowCompatibility.ts src/features/director/__tests__/workflowCompatibility.test.ts src/types.ts
git commit -m "feat: add director workflow domain contracts"
```

## Task 3: Build the Structured Director Project Service

**Files:**
- Create: `server/services/directorProject.js`
- Create: `server/services/directorProject.test.js`
- Modify: `server/routes/storyboard.js`

- [ ] **Step 1: Write failing parser and prompt tests**

Create `server/services/directorProject.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDirectorProjectMessages, parseDirectorProjectResponse } from './directorProject.js';

const response = JSON.stringify({
  title: '雪夜归城',
  styleBrief: '东方史诗，冷蓝雪夜',
  characters: [{ id: 'char-prince', name: '流亡皇子', description: '黑发，旧王族披风' }],
  scenes: [{ id: 'scene-gate', name: '雪夜城门', description: '暴雪中的都城入口' }],
  props: [{ id: 'prop-badge', name: '王族徽章', description: '褪色金属徽章' }],
  shots: [{
    id: 'shot-1', sceneId: 'scene-gate', order: 1, duration: 5,
    visualDescription: '@流亡皇子 走向 @雪夜城门，手握 @王族徽章',
    shotSize: '远景', lighting: '冷蓝月光', dialogue: '', sound: '风雪声', cameraMovement: '缓慢推进'
  }]
});

test('parses fenced director JSON and derives asset references', () => {
  const parsed = parseDirectorProjectResponse('```json\n' + response + '\n```');
  assert.equal(parsed.shots.length, 1);
  assert.deepEqual(parsed.shots[0].assetRefs, ['流亡皇子', '雪夜城门', '王族徽章']);
  assert.equal(parsed.shots[0].promptStatus, 'missing');
});

test('rejects shots that reference an unknown scene', () => {
  const invalid = JSON.parse(response);
  invalid.shots[0].sceneId = 'missing-scene';
  assert.throws(() => parseDirectorProjectResponse(JSON.stringify(invalid)), /unknown scene/i);
});

test('requests Simplified Chinese and exact shot count', () => {
  const messages = buildDirectorProjectMessages({ story: '测试故事', shotCount: 8, targetDuration: 60, aspectRatio: '16:9', style: '古风' });
  assert.match(messages[0].content, /Simplified Chinese/);
  assert.match(messages[1].content, /exactly 8 shots/);
});
```

- [ ] **Step 2: Run and verify failure**

Run:

```powershell
node --test server/services/directorProject.test.js
```

Expected: FAIL because `directorProject.js` does not exist.

- [ ] **Step 3: Implement the parser and message builder**

Create `server/services/directorProject.js` with these exported functions and validation rules:

```js
const mentionPattern = /@([^@，。！？、；：,.!?;:\s]+)/g;

function stripFence(text) {
  const trimmed = String(text || '').trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1] : trimmed;
}

function requiredString(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing required field: ${field}`);
  return value.trim();
}

export function buildDirectorProjectMessages({ story, shotCount, targetDuration, aspectRatio, style }) {
  return [
    {
      role: 'system',
      content: 'You are an AI film director. Return valid JSON only. Respond in Simplified Chinese. Never wrap JSON in prose.'
    },
    {
      role: 'user',
      content: `Turn the story into exactly ${shotCount} shots for a ${targetDuration}-second ${aspectRatio} video. Style: ${style || 'cinematic'}.\n\nStory:\n${story}\n\nReturn title, styleBrief, characters[], scenes[], props[], and shots[]. Every shot needs id, sceneId, order, duration, visualDescription, shotSize, lighting, dialogue, sound, cameraMovement. Mention assets in visualDescription as @Name.`
    }
  ];
}

export function parseDirectorProjectResponse(responseText) {
  const parsed = JSON.parse(stripFence(responseText));
  const scenes = Array.isArray(parsed.scenes) ? parsed.scenes.map((scene, index) => ({
    id: requiredString(scene.id, `scenes[${index}].id`),
    name: requiredString(scene.name, `scenes[${index}].name`),
    description: requiredString(scene.description, `scenes[${index}].description`)
  })) : [];
  if (!scenes.length) throw new Error('Missing required field: scenes');
  const sceneIds = new Set(scenes.map(scene => scene.id));
  const normalizeAssets = (items, prefix) => (Array.isArray(items) ? items : []).map((item, index) => ({
    id: requiredString(item.id, `${prefix}[${index}].id`),
    name: requiredString(item.name, `${prefix}[${index}].name`),
    description: requiredString(item.description, `${prefix}[${index}].description`)
  }));
  const shots = (Array.isArray(parsed.shots) ? parsed.shots : []).map((shot, index) => {
    const sceneId = requiredString(shot.sceneId, `shots[${index}].sceneId`);
    if (!sceneIds.has(sceneId)) throw new Error(`Shot references unknown scene: ${sceneId}`);
    const visualDescription = requiredString(shot.visualDescription, `shots[${index}].visualDescription`);
    return {
      id: requiredString(shot.id, `shots[${index}].id`),
      sceneId,
      order: Number(shot.order) || index + 1,
      duration: Number(shot.duration) || 5,
      visualDescription,
      shotSize: requiredString(shot.shotSize, `shots[${index}].shotSize`),
      lighting: requiredString(shot.lighting, `shots[${index}].lighting`),
      dialogue: typeof shot.dialogue === 'string' ? shot.dialogue : '',
      sound: typeof shot.sound === 'string' ? shot.sound : '',
      cameraMovement: requiredString(shot.cameraMovement, `shots[${index}].cameraMovement`),
      assetRefs: [...new Set([...visualDescription.matchAll(mentionPattern)].map(match => match[1]))],
      promptStatus: 'missing',
      sourceRevision: 1
    };
  });
  if (!shots.length) throw new Error('Missing required field: shots');
  return {
    title: requiredString(parsed.title, 'title'),
    styleBrief: requiredString(parsed.styleBrief, 'styleBrief'),
    characters: normalizeAssets(parsed.characters, 'characters'),
    scenes,
    props: normalizeAssets(parsed.props, 'props'),
    shots
  };
}

export async function generateDirectorProject(input, requestText) {
  const messages = buildDirectorProjectMessages(input);
  const responseText = await requestText(messages);
  return parseDirectorProjectResponse(responseText);
}

```

- [ ] **Step 4: Add the route**

In `server/routes/storyboard.js`, import `generateDirectorProject`, reuse `createOpenAIStoryboardRequester(req)`, validate `story`, `shotCount` (1-50), `targetDuration` (5-600), and add:

```js
import { generateDirectorProject } from '../services/directorProject.js';

router.post('/generate-director-project', async (req, res) => {
  try {
    const story = String(req.body.story || '').trim();
    const shotCount = Number(req.body.shotCount || 8);
    const targetDuration = Number(req.body.targetDuration || 60);
    if (!story) return res.status(400).json({ error: 'Story is required' });
    if (!Number.isInteger(shotCount) || shotCount < 1 || shotCount > 50) return res.status(400).json({ error: 'shotCount must be between 1 and 50' });
    if (targetDuration < 5 || targetDuration > 600) return res.status(400).json({ error: 'targetDuration must be between 5 and 600 seconds' });
    const requestText = createOpenAIStoryboardRequester(req);
    if (!requestText) return res.status(500).json({ error: 'OPENAI_API_KEY is not configured' });
    const project = await generateDirectorProject({
      story,
      shotCount,
      targetDuration,
      aspectRatio: req.body.aspectRatio || '16:9',
      style: req.body.style || 'cinematic'
    }, requestText);
    return res.json({ project, provider: 'openai' });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Director project generation failed' });
  }
});
```

- [ ] **Step 5: Run service tests and route syntax check**

Run:

```powershell
node --test server/services/directorProject.test.js server/services/storyboardText.test.js server/services/openaiChat.test.js
node --check server/routes/storyboard.js
```

Expected: all tests pass and route syntax check exits 0.

- [ ] **Step 6: Commit the structured project service**

```powershell
git add server/services/directorProject.js server/services/directorProject.test.js server/routes/storyboard.js
git commit -m "feat: generate structured director projects"
```

## Task 4: Build Per-Shot Prompt Compilation

**Files:**
- Create: `server/services/promptCompiler.js`
- Create: `server/services/promptCompiler.test.js`
- Modify: `server/routes/storyboard.js`

- [ ] **Step 1: Write failing partial-result tests**

Create `server/services/promptCompiler.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPromptCompilationMessages, parsePromptCompilationResponse } from './promptCompiler.js';

test('parses results by shot id instead of array position', () => {
  const parsed = parsePromptCompilationResponse(JSON.stringify({ results: [
    { shotId: 'shot-2', imagePrompt: 'image two', videoPrompt: 'video two', negativePrompt: '' },
    { shotId: 'shot-1', imagePrompt: 'image one', videoPrompt: 'video one', negativePrompt: 'blur' }
  ] }), ['shot-1', 'shot-2']);
  assert.equal(parsed['shot-1'].imagePrompt, 'image one');
  assert.equal(parsed['shot-2'].videoPrompt, 'video two');
});

test('returns a per-shot error for missing results', () => {
  const parsed = parsePromptCompilationResponse('{"results":[]}', ['shot-1']);
  assert.match(parsed['shot-1'].error, /missing/i);
});

test('includes assets and Seedance motion guidance in messages', () => {
  const messages = buildPromptCompilationMessages({
    styleBrief: '古风史诗',
    shots: [{ id: 'shot-1', duration: 5, visualDescription: '@皇子 在雪中前行', shotSize: '远景', lighting: '月光', cameraMovement: '推进', dialogue: '', sound: '风雪' }],
    assets: [{ id: 'asset-1', name: '皇子', aiBrief: '黑发，灰色披风' }]
  });
  assert.match(messages[1].content, /黑发，灰色披风/);
  assert.match(messages[0].content, /imagePrompt/);
  assert.match(messages[0].content, /videoPrompt/);
});
```

- [ ] **Step 2: Run and verify failure**

Run:

```powershell
node --test server/services/promptCompiler.test.js
```

Expected: FAIL because `promptCompiler.js` does not exist.

- [ ] **Step 3: Implement compilation messages and parser**

Create `server/services/promptCompiler.js`:

```js
function stripFence(text) {
  const trimmed = String(text || '').trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1] : trimmed;
}

export function buildPromptCompilationMessages({ styleBrief, shots, assets }) {
  const assetBriefs = assets.map(asset => `@${asset.name}: ${asset.aiBrief || asset.description}`).join('\n');
  return [
    {
      role: 'system',
      content: 'You compile AI film prompts. Return JSON only as {"results":[{"shotId":"","imagePrompt":"","videoPrompt":"","negativePrompt":""}]}. imagePrompt must describe a still frame. videoPrompt must include duration, action, camera movement, environmental motion, continuity, and audio intent suitable for Seedance 2.0. Respond in Simplified Chinese.'
    },
    {
      role: 'user',
      content: `Global style:\n${styleBrief}\n\nAssets:\n${assetBriefs}\n\nShots:\n${JSON.stringify(shots)}`
    }
  ];
}

export function parsePromptCompilationResponse(responseText, requestedShotIds) {
  const parsed = JSON.parse(stripFence(responseText));
  const rows = Array.isArray(parsed.results) ? parsed.results : [];
  const byId = Object.fromEntries(rows.filter(row => requestedShotIds.includes(row.shotId)).map(row => [row.shotId, row]));
  return Object.fromEntries(requestedShotIds.map(shotId => {
    const row = byId[shotId];
    if (!row || !String(row.imagePrompt || '').trim() || !String(row.videoPrompt || '').trim()) {
      return [shotId, { error: 'Missing prompt result for shot' }];
    }
    return [shotId, {
      imagePrompt: String(row.imagePrompt).trim(),
      videoPrompt: String(row.videoPrompt).trim(),
      negativePrompt: String(row.negativePrompt || '').trim()
    }];
  }));
}

export async function compileShotPrompts(input, requestText) {
  const shotIds = input.shots.map(shot => shot.id);
  try {
    const responseText = await requestText(buildPromptCompilationMessages(input));
    return parsePromptCompilationResponse(responseText, shotIds);
  } catch (error) {
    return Object.fromEntries(shotIds.map(id => [id, { error: error.message || 'Prompt compilation failed' }]));
  }
}
```

- [ ] **Step 4: Add the compilation route**

Add to `server/routes/storyboard.js`:

```js
import { compileShotPrompts } from '../services/promptCompiler.js';

router.post('/compile-prompts', async (req, res) => {
  const shots = Array.isArray(req.body.shots) ? req.body.shots : [];
  if (!shots.length) return res.status(400).json({ error: 'At least one shot is required' });
  const requestText = createOpenAIStoryboardRequester(req);
  if (!requestText) return res.status(500).json({ error: 'OPENAI_API_KEY is not configured' });
  const results = await compileShotPrompts({
    styleBrief: String(req.body.styleBrief || ''),
    shots,
    assets: Array.isArray(req.body.assets) ? req.body.assets : []
  }, requestText);
  return res.json({ results, provider: 'openai' });
});
```

- [ ] **Step 5: Run backend tests**

Run:

```powershell
node --test server/services/promptCompiler.test.js server/services/directorProject.test.js
node --check server/routes/storyboard.js
```

Expected: all tests pass.

- [ ] **Step 6: Commit prompt compilation**

```powershell
git add server/services/promptCompiler.js server/services/promptCompiler.test.js server/routes/storyboard.js
git commit -m "feat: compile image and video prompts per shot"
```

## Task 5: Add Frontend Director State, Mention Parsing, and API Client

**Files:**
- Create: `src/features/director/mentionParser.ts`
- Create: `src/features/director/directorState.ts`
- Create: `src/features/director/directorApi.ts`
- Create: `src/features/director/__tests__/directorState.test.ts`
- Create: `src/features/director/__tests__/directorApi.test.ts`

- [ ] **Step 1: Write failing state and mention tests**

Create `src/features/director/__tests__/directorState.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { extractMentionNames } from '../mentionParser';
import { canEnterDirectorStep, updateDirectorShot } from '../directorState';
import type { DirectorProject } from '../types';

const project: DirectorProject = {
  id: 'project-1', title: '雪夜归城', sourceNodeId: 'text-1', generatorNodeId: 'generator-1',
  currentStep: 'shots', status: 'ready', revision: 1, story: '故事', styleBrief: '电影感',
  aspectRatio: '16:9', characterIds: [], sceneIds: ['scene-1'], propIds: [], styleIds: [],
  scenes: [{ id: 'scene-1', name: '城门', description: '雪夜城门', assetId: 'asset-scene-1' }],
  shots: [{ id: 'shot-1', sceneId: 'scene-1', order: 1, duration: 5, visualDescription: '@皇子 走入 @雪夜城门', shotSize: '远景', lighting: '月光', cameraMovement: '推进', assetRefs: ['皇子', '雪夜城门'], promptStatus: 'ready', imagePrompt: 'old image', videoPrompt: 'old video', sourceRevision: 1 }],
  createdAt: '2026-07-10T00:00:00.000Z', updatedAt: '2026-07-10T00:00:00.000Z'
};

describe('director state', () => {
  it('extracts unique mentions in source order', () => {
    expect(extractMentionNames('@皇子 走入 @雪夜城门，@皇子 回头')).toEqual(['皇子', '雪夜城门']);
  });

  it('marks only the edited shot prompt stale and increments revision', () => {
    const next = updateDirectorShot(project, 'shot-1', { lighting: '金色晨光' });
    expect(next.revision).toBe(2);
    expect(next.shots[0].promptStatus).toBe('stale');
    expect(next.shots[0].sourceRevision).toBe(2);
  });

  it('blocks assets step when a shot is incomplete', () => {
    const invalid = updateDirectorShot(project, 'shot-1', { visualDescription: '' });
    expect(canEnterDirectorStep(invalid, [], 'assets')).toEqual({ ok: false, reason: '镜头 1 缺少画面描述' });
  });
});
```

- [ ] **Step 2: Write failing API tests**

Create `src/features/director/__tests__/directorApi.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { compileDirectorPrompts, generateDirectorProject } from '../directorApi';

afterEach(() => vi.unstubAllGlobals());

describe('directorApi', () => {
  it('posts story settings to the director endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ project: { title: '雪夜归城' } }) });
    vi.stubGlobal('fetch', fetchMock);
    await generateDirectorProject({ story: '故事', shotCount: 8, targetDuration: 60, aspectRatio: '16:9', style: '电影感' });
    expect(fetchMock).toHaveBeenCalledWith('/api/storyboard/generate-director-project', expect.objectContaining({ method: 'POST' }));
  });

  it('surfaces the backend error message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'OPENAI_API_KEY is not configured' }) }));
    await expect(compileDirectorPrompts({ styleBrief: '', shots: [], assets: [] })).rejects.toThrow('OPENAI_API_KEY is not configured');
  });
});
```

- [ ] **Step 3: Run and verify missing-module failures**

Run:

```powershell
npm test -- src/features/director/__tests__/directorState.test.ts src/features/director/__tests__/directorApi.test.ts
```

Expected: FAIL because the three implementation modules do not exist.

- [ ] **Step 4: Implement mention parsing and immutable shot updates**

Create `src/features/director/mentionParser.ts`:

```ts
const MENTION_PATTERN = /@([^@，。！？、；：,.!?;:\s]+)/g;

export function extractMentionNames(text: string): string[] {
  const names = [...String(text).matchAll(MENTION_PATTERN)].map(match => match[1]);
  return [...new Set(names)];
}
```

Create `src/features/director/directorState.ts`:

```ts
import type { DirectorAsset, DirectorProject, DirectorShot, DirectorStep } from './types';
import { extractMentionNames } from './mentionParser';

export function updateDirectorShot(project: DirectorProject, shotId: string, updates: Partial<DirectorShot>): DirectorProject {
  const revision = project.revision + 1;
  return {
    ...project,
    revision,
    updatedAt: new Date().toISOString(),
    shots: project.shots.map(shot => shot.id === shotId ? {
      ...shot,
      ...updates,
      assetRefs: updates.visualDescription === undefined ? shot.assetRefs : extractMentionNames(updates.visualDescription),
      promptStatus: 'stale',
      promptError: undefined,
      sourceRevision: revision
    } : shot)
  };
}

export function canEnterDirectorStep(project: DirectorProject, assets: DirectorAsset[], step: DirectorStep): { ok: true } | { ok: false; reason: string } {
  if (step === 'shots') return { ok: true };
  for (const shot of project.shots) {
    if (!shot.visualDescription.trim()) return { ok: false, reason: `镜头 ${shot.order} 缺少画面描述` };
    if (!shot.shotSize.trim()) return { ok: false, reason: `镜头 ${shot.order} 缺少景别` };
    if (shot.duration < 1 || shot.duration > 30) return { ok: false, reason: `镜头 ${shot.order} 时长必须为 1-30 秒` };
  }
  if (step === 'assets') return { ok: true };
  const referencedNames = new Set(project.shots.flatMap(shot => shot.assetRefs));
  for (const name of referencedNames) {
    const asset = assets.find(item => item.name === name || item.aliases.includes(name));
    if (!asset || !asset.description.trim()) return { ok: false, reason: `资产 @${name} 尚未准备` };
  }
  return { ok: true };
}
```

- [ ] **Step 5: Implement the typed API client**

Create `src/features/director/directorApi.ts`:

```ts
import type { DirectorAsset, DirectorShot } from './types';

export interface GeneratedDirectorAsset {
  id: string;
  name: string;
  description: string;
}

export type GeneratedDirectorScene = GeneratedDirectorAsset;

export interface GeneratedDirectorProject {
  title: string;
  styleBrief: string;
  characters: GeneratedDirectorAsset[];
  scenes: GeneratedDirectorScene[];
  props: GeneratedDirectorAsset[];
  shots: DirectorShot[];
}

async function postJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `${response.status} ${response.statusText}`);
  return payload as T;
}

export function generateDirectorProject(input: { story: string; shotCount: number; targetDuration: number; aspectRatio: string; style: string }, signal?: AbortSignal) {
  return postJson<{ project: GeneratedDirectorProject }>('/api/storyboard/generate-director-project', input, signal);
}

export function compileDirectorPrompts(input: { styleBrief: string; shots: DirectorShot[]; assets: DirectorAsset[] }, signal?: AbortSignal) {
  return postJson<{ results: Record<string, { imagePrompt?: string; videoPrompt?: string; negativePrompt?: string; error?: string }> }>('/api/storyboard/compile-prompts', input, signal);
}
```

- [ ] **Step 6: Run tests**

Run:

```powershell
npm test -- src/features/director/__tests__/directorState.test.ts src/features/director/__tests__/directorApi.test.ts
```

Expected: all tests pass.

- [ ] **Step 7: Commit state and API modules**

```powershell
git add src/features/director/mentionParser.ts src/features/director/directorState.ts src/features/director/directorApi.ts src/features/director/__tests__/directorState.test.ts src/features/director/__tests__/directorApi.test.ts
git commit -m "feat: add director frontend state and API client"
```

## Task 6: Add the Workbench Shell and Script Generator Canvas Node

**Files:**
- Create: `src/features/director/components/DirectorStepper.tsx`
- Create: `src/features/director/components/DirectorWorkbenchModal.tsx`
- Create: `src/features/director/components/DirectorNodeContent.tsx`
- Create: `src/features/director/__tests__/DirectorWorkbenchModal.test.tsx`
- Modify: `src/components/canvas/NodeContent.tsx:10-180`
- Modify: `src/components/canvas/CanvasNode.tsx:10-80,850-930`

- [ ] **Step 1: Write the failing shell test**

Create `src/features/director/__tests__/DirectorWorkbenchModal.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DirectorWorkbenchModal } from '../components/DirectorWorkbenchModal';

describe('DirectorWorkbenchModal', () => {
  it('uses the three LibTV-style steps and TwitCanva theme shell', () => {
    const onClose = vi.fn();
    render(
      <DirectorWorkbenchModal isOpen title="雪夜归城" currentStep="shots" counts={{ shots: '8 个镜头已就绪', assets: '0/6 已准备', prompts: '0/8 已合成' }} canvasTheme="dark" onClose={onClose} onSave={() => undefined}>
        <div>镜头表内容</div>
      </DirectorWorkbenchModal>
    );
    expect(screen.getByText('确认镜头')).toBeInTheDocument();
    expect(screen.getByText('准备资产')).toBeInTheDocument();
    expect(screen.getByText('合成提示词')).toBeInTheDocument();
    expect(screen.getByText('镜头表内容')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '返回画布' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('uses the existing light canvas theme', () => {
    const { container } = render(<DirectorWorkbenchModal isOpen title="雪夜归城" currentStep="shots" counts={{ shots: '', assets: '', prompts: '' }} canvasTheme="light" onClose={() => undefined} onSave={() => undefined}><div /></DirectorWorkbenchModal>);
    expect(container.firstChild).toHaveClass('bg-neutral-50');
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run:

```powershell
npm test -- src/features/director/__tests__/DirectorWorkbenchModal.test.tsx
```

Expected: FAIL because the modal does not exist.

- [ ] **Step 3: Implement the stepper and shell**

Create `src/features/director/components/DirectorStepper.tsx`:

```tsx
import type { DirectorStep } from '../types';

const steps: Array<{ id: DirectorStep; label: string }> = [
  { id: 'shots', label: '确认镜头' },
  { id: 'assets', label: '准备资产' },
  { id: 'prompts', label: '合成提示词' }
];

export function DirectorStepper({ currentStep, counts, canvasTheme }: { currentStep: DirectorStep; counts: Record<DirectorStep, string>; canvasTheme: 'dark' | 'light' }) {
  const dark = canvasTheme === 'dark';
  return <div className={`flex items-center justify-center gap-6 border-b px-6 py-4 ${dark ? 'border-neutral-800 bg-[#111]' : 'border-neutral-200 bg-white'}`}>
    {steps.map((step, index) => <div className="contents" key={step.id}>
      <div className={`flex items-center gap-3 rounded-xl px-4 py-2 ${currentStep === step.id ? dark ? 'bg-neutral-800 text-white' : 'bg-neutral-100 text-neutral-900' : 'text-neutral-500'}`}>
        <span className={`flex h-7 w-7 items-center justify-center rounded-full ${currentStep === step.id ? 'bg-gradient-to-br from-cyan-600 to-violet-600 text-white' : 'border-2 border-neutral-600'}`}>{index + 1}</span>
        <span><strong className="block text-sm">{step.label}</strong><small>{counts[step.id]}</small></span>
      </div>
      {index < steps.length - 1 && <span className="h-px w-24 bg-neutral-700" />}
    </div>)}
  </div>;
}
```

Create `src/features/director/components/DirectorWorkbenchModal.tsx`:

```tsx
import type { PropsWithChildren } from 'react';
import { X } from 'lucide-react';
import type { DirectorStep } from '../types';
import { DirectorStepper } from './DirectorStepper';

interface Props extends PropsWithChildren {
  isOpen: boolean;
  title: string;
  currentStep: DirectorStep;
  counts: Record<DirectorStep, string>;
  canvasTheme: 'dark' | 'light';
  needsRegeneration?: boolean;
  onClose: () => void;
  onSave: () => void;
  onRegenerate?: () => void;
}

export function DirectorWorkbenchModal({ isOpen, title, currentStep, counts, canvasTheme, needsRegeneration, onClose, onSave, onRegenerate, children }: Props) {
  if (!isOpen) return null;
  const dark = canvasTheme === 'dark';
  return <div className={`fixed inset-0 z-[200] flex flex-col ${dark ? 'bg-[#050505] text-white' : 'bg-neutral-50 text-neutral-900'}`}>
    <header className={`flex h-16 items-center justify-between border-b px-6 ${dark ? 'border-neutral-800 bg-[#0f0f0f]' : 'border-neutral-200 bg-white'}`}>
      <div className="flex items-center gap-3"><img src="/TwitCanva-logo.png" className="h-8 w-8 rounded-lg" /><strong>脚本导演制作台</strong><span className="text-neutral-500">/</span><span>{title}</span></div>
      <div className="flex gap-2">{needsRegeneration && <button onClick={onRegenerate} className="rounded-full border border-amber-600 px-4 py-2 text-sm text-amber-400">重新解析脚本</button>}<button onClick={onSave} className="rounded-full border border-neutral-700 px-4 py-2 text-sm">保存草稿</button><button onClick={onClose} aria-label="返回画布" className="flex items-center gap-2 rounded-full border border-neutral-700 px-4 py-2 text-sm"><X size={16} />返回画布</button></div>
    </header>
    <DirectorStepper currentStep={currentStep} counts={counts} canvasTheme={canvasTheme} />
    <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
  </div>;
}
```

- [ ] **Step 4: Add director canvas node content**

Create `src/features/director/components/DirectorNodeContent.tsx`:

```tsx
import { FileText, ListTree, Users, Map, Clapperboard } from 'lucide-react';
import type { NodeData } from '../../../types';

export function DirectorNodeContent({ data, canvasTheme, onOpen }: { data: NodeData; canvasTheme: 'dark' | 'light'; onOpen?: (nodeId: string) => void }) {
  const dark = canvasTheme === 'dark';
  const icon = data.directorRole === 'script-generator' ? <ListTree size={36} /> : data.directorRole === 'character' ? <Users size={30} /> : data.directorRole === 'scene' ? <Map size={30} /> : data.directorRole === 'shot' ? <Clapperboard size={30} /> : <FileText size={30} />;
  return <div className={`flex min-h-[180px] flex-col items-center justify-center gap-4 rounded-2xl p-5 text-center ${dark ? 'bg-[#1a1a1a]' : 'bg-white'}`}>
    <span className="text-neutral-600">{icon}</span>
    <div><strong className={`block ${dark ? 'text-white' : 'text-neutral-900'}`}>{data.title || '导演节点'}</strong>{data.prompt && <p className="mt-2 line-clamp-3 text-xs text-neutral-500">{data.prompt}</p>}{data.stale && <small className="text-amber-400">内容已过期</small>}{data.errorMessage && <p className="mt-2 rounded-lg border border-red-800 bg-red-900/20 px-2 py-1 text-xs text-red-400">{data.errorMessage}</p>}</div>
    {data.directorRole === 'script-generator' && <button onClick={() => onOpen?.(data.id)} onPointerDown={event => event.stopPropagation()} className="rounded-xl bg-neutral-800 px-4 py-2 text-sm text-white hover:bg-neutral-700">打开脚本节点 →</button>}
  </div>;
}
```

Add `canvasTheme: 'dark' | 'light'` and `onOpenDirector?: (nodeId: string) => void` to `NodeContentProps`; add `onOpenDirector` to `CanvasNodeProps` and pass the existing `canvasTheme` value into `NodeContent`. Import `DirectorNodeContent`, then insert this early return immediately before the component's existing `return` statement:

```tsx
if (data.directorRole && data.directorRole !== 'script') {
  return <DirectorNodeContent data={data} canvasTheme={canvasTheme} onOpen={onOpenDirector} />;
}
```

Leave the existing result/text/placeholder return block unchanged. Pass `onOpenDirector` through `CanvasNode` to `NodeContent`, and change the existing controls condition from `selected && showControls` to `selected && showControls && !data.directorRole`.

- [ ] **Step 5: Run shell test and build**

Run:

```powershell
npm test -- src/features/director/__tests__/DirectorWorkbenchModal.test.tsx
npm run build
```

Expected: test passes and build succeeds.

- [ ] **Step 6: Commit workbench shell**

```powershell
git add src/features/director/components/DirectorStepper.tsx src/features/director/components/DirectorWorkbenchModal.tsx src/features/director/components/DirectorNodeContent.tsx src/features/director/__tests__/DirectorWorkbenchModal.test.tsx src/components/canvas/NodeContent.tsx src/components/canvas/CanvasNode.tsx
git commit -m "feat: add director workbench shell"
```

## Task 7: Implement the Confirm Shots Table

**Files:**
- Create: `src/features/director/components/AssetMentionTextarea.tsx`
- Create: `src/features/director/components/ShotTableStep.tsx`
- Create: `src/features/director/__tests__/ShotTableStep.test.tsx`
- Modify: `src/features/director/components/DirectorWorkbenchModal.tsx`

- [ ] **Step 1: Write failing shot-edit tests**

Create `src/features/director/__tests__/ShotTableStep.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ShotTableStep } from '../components/ShotTableStep';

const shot = { id: 'shot-1', sceneId: 'scene-1', order: 1, duration: 5, visualDescription: '@皇子 走向城门', shotSize: '远景', lighting: '冷蓝月光', dialogue: '', sound: '风雪声', cameraMovement: '缓慢推进', assetRefs: ['皇子'], promptStatus: 'missing' as const, sourceRevision: 1 };

describe('ShotTableStep', () => {
  it('edits a cell and adds a shot', () => {
    const onUpdateShot = vi.fn();
    const onAddShot = vi.fn();
    render(<ShotTableStep shots={[shot]} mentionOptions={['皇子', '雪夜城门']} onUpdateShot={onUpdateShot} onAddShot={onAddShot} onDeleteShot={() => undefined} onDuplicateShot={() => undefined} onSplitShot={() => undefined} onReorderShot={() => undefined} onNext={() => undefined} />);
    fireEvent.change(screen.getByLabelText('镜头 1 画面描述'), { target: { value: '@皇子 回头' } });
    expect(onUpdateShot).toHaveBeenCalledWith('shot-1', { visualDescription: '@皇子 回头' });
    fireEvent.click(screen.getByRole('button', { name: '添加镜头' }));
    expect(onAddShot).toHaveBeenCalledOnce();
  });

  it('offers project assets after typing @', () => {
    const onUpdateShot = vi.fn();
    render(<ShotTableStep shots={[shot]} mentionOptions={['皇子', '雪夜城门']} onUpdateShot={onUpdateShot} onAddShot={() => undefined} onDeleteShot={() => undefined} onDuplicateShot={() => undefined} onSplitShot={() => undefined} onReorderShot={() => undefined} onNext={() => undefined} />);
    fireEvent.change(screen.getByLabelText('镜头 1 画面描述'), { target: { value: '@皇' } });
    fireEvent.click(screen.getByRole('button', { name: '@皇子' }));
    expect(onUpdateShot).toHaveBeenLastCalledWith('shot-1', { visualDescription: '@皇子 ' });
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run:

```powershell
npm test -- src/features/director/__tests__/ShotTableStep.test.tsx
```

Expected: FAIL because `ShotTableStep` does not exist.

- [ ] **Step 3: Implement the table with controlled cells**

Create `src/features/director/components/AssetMentionTextarea.tsx`:

```tsx
import { useEffect, useState } from 'react';

export function AssetMentionTextarea({ value, options, ariaLabel, onChange }: { value: string; options: string[]; ariaLabel: string; onChange: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  const [query, setQuery] = useState<string>();
  useEffect(() => setDraft(value), [value]);
  const update = (next: string) => {
    setDraft(next);
    onChange(next);
    const match = next.match(/@([^@，。！？、；：,.!?;:\s]*)$/);
    setQuery(match ? match[1] : undefined);
  };
  const matches = query === undefined ? [] : options.filter(option => option.includes(query)).slice(0, 8);
  const choose = (name: string) => {
    const next = draft.replace(/@([^@，。！？、；：,.!?;:\s]*)$/, `@${name} `);
    setDraft(next);
    onChange(next);
    setQuery(undefined);
  };
  return <div className="relative">
    <textarea aria-label={ariaLabel} value={draft} onChange={event => update(event.target.value)} className="min-h-20 w-full rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm text-neutral-200 outline-none focus:border-blue-500/50 focus:bg-neutral-800" />
    {matches.length > 0 && <div className="absolute left-0 top-full z-30 mt-1 w-56 rounded-xl border border-neutral-700 bg-neutral-900 p-1 shadow-2xl">{matches.map(name => <button key={name} aria-label={`@${name}`} onMouseDown={event => event.preventDefault()} onClick={() => choose(name)} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-cyan-300 hover:bg-neutral-800">@{name}</button>)}</div>}
  </div>;
}
```

Create `src/features/director/components/ShotTableStep.tsx`. Use one `<table>` with sticky headers and these exact columns: 镜号、时长、画面描述、景别、光影氛围、对白·旁白、音效、运镜、最终提示词、操作. Each editable field calls `onUpdateShot(shot.id, { field: value })`; duration converts to `Number`.

```tsx
import type { DirectorShot } from '../types';
import { useState } from 'react';
import { AssetMentionTextarea } from './AssetMentionTextarea';

interface Props {
  shots: DirectorShot[];
  mentionOptions: string[];
  onUpdateShot: (shotId: string, updates: Partial<DirectorShot>) => void;
  onAddShot: () => void;
  onDeleteShot: (shotId: string) => void;
  onDuplicateShot: (shotId: string) => void;
  onSplitShot: (shotId: string) => void;
  onReorderShot: (sourceShotId: string, targetShotId: string) => void;
  onNext: () => void;
}

export function ShotTableStep(props: Props) {
  const [draggedShotId, setDraggedShotId] = useState<string>();
  const inputClass = 'w-full rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm text-neutral-200 outline-none focus:border-blue-500/50 focus:bg-neutral-800';
  return <div className="flex h-full flex-col bg-[#0f0f0f]">
    <div className="min-h-0 flex-1 overflow-auto">
      <table className="min-w-[1500px] border-collapse text-left text-sm text-neutral-200">
        <thead className="sticky top-0 z-10 bg-neutral-900 text-neutral-400"><tr>{['镜号','时长','画面描述','景别','光影氛围','对白·旁白','音效','运镜','最终提示词','操作'].map(label => <th key={label} className="border border-neutral-800 px-3 py-3">{label}</th>)}</tr></thead>
        <tbody>{props.shots.map(shot => <tr key={shot.id} draggable onDragStart={() => setDraggedShotId(shot.id)} onDragOver={event => event.preventDefault()} onDrop={() => { if (draggedShotId && draggedShotId !== shot.id) props.onReorderShot(draggedShotId, shot.id); setDraggedShotId(undefined); }} className="odd:bg-[#0f0f0f] even:bg-[#151515]">
          <td className="border border-neutral-800 px-3 text-center">{shot.order}</td>
          <td className="border border-neutral-800 p-2"><input aria-label={`镜头 ${shot.order} 时长`} type="number" min={1} max={30} value={shot.duration} onChange={event => props.onUpdateShot(shot.id, { duration: Number(event.target.value) })} className={inputClass} /></td>
          <td className="min-w-[300px] border border-neutral-800 p-2"><AssetMentionTextarea ariaLabel={`镜头 ${shot.order} 画面描述`} value={shot.visualDescription} options={props.mentionOptions} onChange={value => props.onUpdateShot(shot.id, { visualDescription: value })} /></td>
          <td className="border border-neutral-800 p-2"><select value={shot.shotSize} onChange={event => props.onUpdateShot(shot.id, { shotSize: event.target.value })} className={inputClass}>{['大远景','远景','全景','中景','近景','特写','大特写'].map(size => <option key={size}>{size}</option>)}</select></td>
          <td className="min-w-[220px] border border-neutral-800 p-2"><textarea value={shot.lighting} onChange={event => props.onUpdateShot(shot.id, { lighting: event.target.value })} className={inputClass} /></td>
          <td className="min-w-[220px] border border-neutral-800 p-2"><textarea value={shot.dialogue || ''} onChange={event => props.onUpdateShot(shot.id, { dialogue: event.target.value })} className={inputClass} /></td>
          <td className="min-w-[180px] border border-neutral-800 p-2"><textarea value={shot.sound || ''} onChange={event => props.onUpdateShot(shot.id, { sound: event.target.value })} className={inputClass} /></td>
          <td className="min-w-[180px] border border-neutral-800 p-2"><textarea value={shot.cameraMovement} onChange={event => props.onUpdateShot(shot.id, { cameraMovement: event.target.value })} className={inputClass} /></td>
          <td className="min-w-[160px] border border-neutral-800 px-3 text-neutral-500">{shot.promptStatus === 'ready' ? '已合成' : shot.promptStatus === 'stale' ? '内容已过期' : '待生成提示词'}</td>
          <td className="border border-neutral-800 p-2"><div className="flex gap-1"><span className="cursor-grab text-neutral-500">⋮⋮</span><button onClick={() => props.onDuplicateShot(shot.id)}>复制</button><button onClick={() => props.onSplitShot(shot.id)}>拆分</button><button onClick={() => props.onDeleteShot(shot.id)}>删除</button></div></td>
        </tr>)}</tbody>
      </table>
    </div>
    <footer className="flex items-center justify-between border-t border-neutral-800 bg-neutral-900 px-5 py-4"><button aria-label="添加镜头" onClick={props.onAddShot} className="rounded-xl bg-neutral-800 px-4 py-2">＋ 添加镜头</button><button onClick={props.onNext} className="rounded-xl bg-gradient-to-r from-cyan-600 to-violet-600 px-5 py-2.5">下一步：准备资产 →</button></footer>
  </div>;
}
```

- [ ] **Step 4: Run tests and build**

Run:

```powershell
npm test -- src/features/director/__tests__/ShotTableStep.test.tsx src/features/director/__tests__/directorState.test.ts
npm run build
```

Expected: tests and build pass.

- [ ] **Step 5: Commit the shot table**

```powershell
git add src/features/director/components/AssetMentionTextarea.tsx src/features/director/components/ShotTableStep.tsx src/features/director/__tests__/ShotTableStep.test.tsx
git commit -m "feat: add editable director shot table"
```

## Task 8: Implement Asset Preparation and Library Selection

**Files:**
- Create: `src/features/director/components/AssetPreparationStep.tsx`
- Create: `src/features/director/__tests__/AssetPreparationStep.test.tsx`
- Modify: `src/components/AssetLibraryPanel.tsx:1-220`

- [ ] **Step 1: Write failing minimum-readiness tests**

Create `src/features/director/__tests__/AssetPreparationStep.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AssetPreparationStep } from '../components/AssetPreparationStep';

describe('AssetPreparationStep', () => {
  it('shows referenced assets and accepts text-only readiness', () => {
    const onUpdateAsset = vi.fn();
    render(<AssetPreparationStep referencedNames={['皇子']} assets={[{ id: 'asset-1', projectId: 'p1', type: 'character', name: '皇子', aliases: [], description: '', aiBrief: '', referenceUrls: [], source: 'generated', status: 'draft', metadata: {}, createdAt: '', updatedAt: '' }]} onUpdateAsset={onUpdateAsset} onChooseLibraryAsset={() => undefined} onBack={() => undefined} onNext={() => undefined} />);
    fireEvent.change(screen.getByLabelText('皇子文字设定'), { target: { value: '黑发，旧王族披风' } });
    expect(onUpdateAsset).toHaveBeenCalledWith('asset-1', expect.objectContaining({ description: '黑发，旧王族披风', status: 'ready' }));
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run:

```powershell
npm test -- src/features/director/__tests__/AssetPreparationStep.test.tsx
```

Expected: FAIL because the step component does not exist.

- [ ] **Step 3: Preserve full asset metadata in AssetLibraryPanel**

Export `LibraryAsset` and add this optional prop without removing the existing callback:

```ts
export interface LibraryAsset {
  id: string;
  name: string;
  category: string;
  url: string;
  type: 'image' | 'video';
}

interface AssetLibraryPanelProps {
  onSelectAsset: (url: string, type: 'image' | 'video') => void;
  onSelectLibraryAsset?: (asset: LibraryAsset) => void;
}
```

Pass `onSelectLibraryAsset` into `AssetLibraryContent`, then change the card click to:

```tsx
onClick={() => onSelectLibraryAsset ? onSelectLibraryAsset(asset) : onSelectAsset(asset.url, asset.type)}
```

- [ ] **Step 4: Implement the asset preparation step**

Create `src/features/director/components/AssetPreparationStep.tsx` with this contract and behavior:

```tsx
import type { DirectorAsset } from '../types';

interface Props {
  referencedNames: string[];
  assets: DirectorAsset[];
  onUpdateAsset: (assetId: string, updates: Partial<DirectorAsset>) => void;
  onChooseLibraryAsset: (assetId: string) => void;
  onBack: () => void;
  onNext: () => void;
}

export function AssetPreparationStep({ referencedNames, assets, onUpdateAsset, onChooseLibraryAsset, onBack, onNext }: Props) {
  const referenced = referencedNames.map(name => assets.find(asset => asset.name === name || asset.aliases.includes(name))).filter((asset): asset is DirectorAsset => Boolean(asset));
  const grouped = ['character', 'scene', 'prop', 'style', 'audio'].map(type => ({ type, items: referenced.filter(asset => asset.type === type) })).filter(group => group.items.length);
  return <div className="flex h-full flex-col bg-[#0f0f0f]">
    <div className="min-h-0 flex-1 overflow-auto p-6">{grouped.map(group => <section key={group.type} className="mb-6"><h3 className="mb-3 text-sm font-semibold text-neutral-300">{group.type}</h3><div className="grid grid-cols-2 gap-3">{group.items.map(asset => <article key={asset.id} className="rounded-2xl border border-neutral-800 bg-[#1a1a1a] p-4"><div className="flex justify-between"><strong>@{asset.name}</strong><span className={asset.description.trim() ? 'text-emerald-400' : 'text-amber-400'}>{asset.description.trim() ? '✓ 已准备' : '待准备'}</span></div><select aria-label={`${asset.name}类型`} value={asset.type} onChange={event => onUpdateAsset(asset.id, { type: event.target.value as DirectorAsset['type'] })} className="mt-3 rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"><option value="character">角色</option><option value="scene">场景</option><option value="prop">道具</option><option value="style">风格</option><option value="audio">音效</option></select><textarea aria-label={`${asset.name}文字设定`} value={asset.description} onChange={event => onUpdateAsset(asset.id, { description: event.target.value, aiBrief: event.target.value, status: event.target.value.trim() ? 'ready' : 'draft' })} className="mt-3 min-h-24 w-full rounded-xl border border-neutral-700 bg-neutral-900 p-3 text-sm outline-none focus:border-blue-500" /><div className="mt-3 flex gap-2"><button onClick={() => onChooseLibraryAsset(asset.id)} className="rounded-lg bg-neutral-800 px-3 py-2 text-sm">从素材库选择</button><span className="text-xs text-neutral-500">参考图可选</span></div></article>)}</div></section>)}</div>
    <footer className="flex justify-between border-t border-neutral-800 bg-neutral-900 px-5 py-4"><button onClick={onBack}>← 返回确认镜头</button><button onClick={onNext} className="rounded-xl bg-gradient-to-r from-cyan-600 to-violet-600 px-5 py-2.5">下一步：合成提示词 →</button></footer>
  </div>;
}
```

- [ ] **Step 5: Run tests and build**

Run:

```powershell
npm test -- src/features/director/__tests__/AssetPreparationStep.test.tsx
npm run build
```

Expected: tests and build pass; existing asset library callers still compile.

- [ ] **Step 6: Commit asset preparation**

```powershell
git add src/features/director/components/AssetPreparationStep.tsx src/features/director/__tests__/AssetPreparationStep.test.tsx src/components/AssetLibraryPanel.tsx
git commit -m "feat: add director asset preparation step"
```

## Task 9: Implement Prompt Compilation and Workbench Orchestration

**Files:**
- Create: `src/features/director/components/PromptCompilationStep.tsx`
- Create: `src/features/director/useDirectorWorkbench.ts`
- Create: `src/features/director/__tests__/PromptCompilationStep.test.tsx`
- Create: `src/features/director/__tests__/useDirectorWorkbench.test.tsx`
- Modify: `src/features/director/components/DirectorWorkbenchModal.tsx`

- [ ] **Step 1: Write failing prompt-step tests**

Create `src/features/director/__tests__/PromptCompilationStep.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PromptCompilationStep } from '../components/PromptCompilationStep';

const shot = { id: 'shot-1', sceneId: 'scene-1', order: 1, duration: 5, visualDescription: '@皇子 走向城门', shotSize: '远景', lighting: '月光', cameraMovement: '推进', assetRefs: ['皇子'], promptStatus: 'error' as const, promptError: 'fetch failed', sourceRevision: 1 };

describe('PromptCompilationStep', () => {
  it('retries only the failed shot', () => {
    const onCompile = vi.fn();
    render(<PromptCompilationStep shots={[shot]} onCompile={onCompile} onUpdatePrompt={() => undefined} onBack={() => undefined} onApply={() => undefined} applying={false} />);
    expect(screen.getByText('fetch failed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重试镜头 1' }));
    expect(onCompile).toHaveBeenCalledWith(['shot-1']);
  });

  it('protects manually edited prompts from silent overwrite', () => {
    const onCompile = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<PromptCompilationStep shots={[{ ...shot, promptStatus: 'ready', manualOverride: true, imagePrompt: 'manual image', videoPrompt: 'manual video' }]} onCompile={onCompile} onUpdatePrompt={() => undefined} onBack={() => undefined} onApply={() => undefined} applying={false} />);
    fireEvent.click(screen.getByRole('button', { name: '重试镜头 1' }));
    expect(onCompile).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Write a failing orchestration test**

Create `src/features/director/__tests__/useDirectorWorkbench.test.tsx`:

```tsx
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useDirectorWorkbench } from '../useDirectorWorkbench';

vi.mock('../directorApi', () => ({
  generateDirectorProject: vi.fn().mockResolvedValue({ project: { title: '雪夜归城', styleBrief: '电影感', characters: [], scenes: [{ id: 'scene-1', name: '城门', description: '雪夜' }], props: [], shots: [{ id: 'shot-1', sceneId: 'scene-1', order: 1, duration: 5, visualDescription: '皇子归城', shotSize: '远景', lighting: '月光', dialogue: '', sound: '风雪', cameraMovement: '推进', assetRefs: [], promptStatus: 'missing', sourceRevision: 1 }] } }),
  compileDirectorPrompts: vi.fn().mockResolvedValue({ results: { 'shot-1': { imagePrompt: 'image', videoPrompt: 'video', negativePrompt: '' } } })
}));

describe('useDirectorWorkbench', () => {
  it('creates a project and compiles a selected shot', async () => {
    const { result } = renderHook(() => useDirectorWorkbench());
    await act(() => result.current.openFromGenerator({ sourceNodeId: 'text-1', generatorNodeId: 'generator-1', story: '故事' }));
    expect(result.current.activeProject?.title).toBe('雪夜归城');
    act(() => result.current.splitShot('shot-1'));
    expect(result.current.activeProject?.shots).toHaveLength(2);
    const secondShotId = result.current.activeProject!.shots[1].id;
    act(() => result.current.reorderShot(secondShotId, 'shot-1'));
    expect(result.current.activeProject?.shots[0].id).toBe(secondShotId);
    await act(() => result.current.compilePrompts(['shot-1']));
    expect(result.current.activeProject?.shots.find(shot => shot.id === 'shot-1')?.promptStatus).toBe('ready');
  });
});
```

- [ ] **Step 3: Run and verify failures**

Run:

```powershell
npm test -- src/features/director/__tests__/PromptCompilationStep.test.tsx src/features/director/__tests__/useDirectorWorkbench.test.tsx
```

Expected: FAIL because the component and hook do not exist.

- [ ] **Step 4: Implement the prompt table**

Create `src/features/director/components/PromptCompilationStep.tsx`:

```tsx
import type { DirectorShot } from '../types';

interface Props {
  shots: DirectorShot[];
  onCompile: (shotIds: string[]) => void;
  onUpdatePrompt: (shotId: string, field: 'imagePrompt' | 'videoPrompt' | 'negativePrompt', value: string) => void;
  onBack: () => void;
  onApply: () => void;
  applying: boolean;
}

export function PromptCompilationStep({ shots, onCompile, onUpdatePrompt, onBack, onApply, applying }: Props) {
  const pendingIds = shots.filter(shot => shot.promptStatus !== 'ready').map(shot => shot.id);
  const requestCompile = (shotIds: string[]) => {
    const protectedShots = shots.filter(shot => shotIds.includes(shot.id) && shot.manualOverride);
    if (protectedShots.length && !window.confirm(`将覆盖 ${protectedShots.length} 个手动编辑的提示词，是否继续？`)) return;
    onCompile(shotIds);
  };
  return <div className="flex h-full flex-col bg-[#0f0f0f]">
    <div className="min-h-0 flex-1 overflow-auto"><table className="min-w-[1200px] border-collapse text-sm"><thead className="sticky top-0 bg-neutral-900 text-neutral-400"><tr>{['镜号','引用资产','图片提示词','视频提示词','状态','操作'].map(label => <th key={label} className="border border-neutral-800 p-3 text-left">{label}</th>)}</tr></thead><tbody>{shots.map(shot => <tr key={shot.id} className="odd:bg-[#0f0f0f] even:bg-[#151515]"><td className="border border-neutral-800 p-3 text-center">{shot.order}</td><td className="border border-neutral-800 p-3 text-cyan-400">{shot.assetRefs.map(name => `@${name}`).join(' ')}</td><td className="border border-neutral-800 p-2"><textarea value={shot.imagePrompt || ''} onChange={event => onUpdatePrompt(shot.id, 'imagePrompt', event.target.value)} className="min-h-24 w-full rounded-lg bg-neutral-900 p-2" /></td><td className="border border-neutral-800 p-2"><textarea value={shot.videoPrompt || ''} onChange={event => onUpdatePrompt(shot.id, 'videoPrompt', event.target.value)} className="min-h-24 w-full rounded-lg bg-neutral-900 p-2" /></td><td className="border border-neutral-800 p-3">{shot.promptStatus === 'error' ? <span className="text-red-400">{shot.promptError}</span> : shot.promptStatus === 'ready' ? <span className="text-emerald-400">✓ 已合成</span> : <span className="text-amber-400">待处理</span>}</td><td className="border border-neutral-800 p-3"><button aria-label={`重试镜头 ${shot.order}`} onClick={() => requestCompile([shot.id])} className="rounded-lg bg-neutral-800 px-3 py-2">{shot.promptStatus === 'error' ? '重试' : '合成'}</button></td></tr>)}</tbody></table></div>
    <footer className="flex justify-between border-t border-neutral-800 bg-neutral-900 px-5 py-4"><button onClick={onBack}>← 返回准备资产</button><div className="flex gap-3"><button disabled={!pendingIds.length} onClick={() => requestCompile(pendingIds)} className="rounded-xl bg-neutral-800 px-4 py-2 disabled:opacity-40">合成剩余提示词</button><button disabled={applying || shots.some(shot => !shot.imagePrompt?.trim() || !shot.videoPrompt?.trim())} onClick={onApply} className="rounded-xl bg-gradient-to-r from-cyan-600 to-violet-600 px-5 py-2.5 disabled:opacity-40">保存并应用到画布 →</button></div></footer>
  </div>;
}
```

- [ ] **Step 5: Implement the workbench hook**

Create `src/features/director/useDirectorWorkbench.ts` with the complete controller below:

```ts
import { useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { compileDirectorPrompts, generateDirectorProject, type GeneratedDirectorAsset, type GeneratedDirectorProject } from './directorApi';
import { updateDirectorShot } from './directorState';
import { extractMentionNames } from './mentionParser';
import type { DirectorAsset, DirectorProject, DirectorShot, DirectorStep } from './types';

export interface OpenDirectorInput {
  sourceNodeId: string;
  generatorNodeId: string;
  story: string;
}

export interface DirectorWorkbenchController {
  projects: DirectorProject[];
  assets: DirectorAsset[];
  setProjects: Dispatch<SetStateAction<DirectorProject[]>>;
  setAssets: Dispatch<SetStateAction<DirectorAsset[]>>;
  activeProject?: DirectorProject;
  activeAssets: DirectorAsset[];
  isOpen: boolean;
  busy: boolean;
  error?: string;
  openFromGenerator(input: OpenDirectorInput): Promise<void>;
  close(): void;
  cancel(): void;
  setStep(step: DirectorStep): void;
  updateShot(shotId: string, updates: Partial<DirectorShot>): void;
  addShot(): void;
  deleteShot(shotId: string): void;
  duplicateShot(shotId: string): void;
  splitShot(shotId: string): void;
  reorderShot(sourceShotId: string, targetShotId: string): void;
  updateAsset(assetId: string, updates: Partial<DirectorAsset>): void;
  compilePrompts(shotIds: string[]): Promise<void>;
  updatePrompt(shotId: string, field: 'imagePrompt' | 'videoPrompt' | 'negativePrompt', value: string): void;
  markSourceChanged(projectId: string, story: string): void;
  regenerateActiveProject(): Promise<void>;
  markApplied(projectId: string, revision: number): void;
}

function makeAsset(projectId: string, type: DirectorAsset['type'], source: GeneratedDirectorAsset): DirectorAsset {
  const now = new Date().toISOString();
  return { id: `${projectId}-${type}-${source.id}`, projectId, type, name: source.name, aliases: [], description: source.description, aiBrief: source.description, referenceUrls: [], source: 'generated', status: source.description.trim() ? 'ready' : 'draft', metadata: {}, createdAt: now, updatedAt: now };
}

function hydrateGeneratedProject(input: OpenDirectorInput, generated: GeneratedDirectorProject): { project: DirectorProject; assets: DirectorAsset[] } {
  const now = new Date().toISOString();
  const projectId = `project-${input.generatorNodeId}`;
  const characters = generated.characters.map(item => makeAsset(projectId, 'character', item));
  const sceneAssets = generated.scenes.map(item => makeAsset(projectId, 'scene', item));
  const props = generated.props.map(item => makeAsset(projectId, 'prop', item));
  const style = makeAsset(projectId, 'style', { id: 'global-style', name: '全局风格', description: generated.styleBrief });
  const scenes = generated.scenes.map(scene => ({ id: scene.id, name: scene.name, description: scene.description, assetId: `${projectId}-scene-${scene.id}` }));
  return {
    project: {
      id: projectId, title: generated.title, sourceNodeId: input.sourceNodeId, generatorNodeId: input.generatorNodeId,
      currentStep: 'shots', status: 'ready', revision: 1, story: input.story, styleBrief: generated.styleBrief,
      targetDuration: generated.shots.reduce((sum, shot) => sum + shot.duration, 0), aspectRatio: '16:9',
      characterIds: characters.map(asset => asset.id), sceneIds: scenes.map(scene => scene.id), propIds: props.map(asset => asset.id), styleIds: [style.id],
      scenes, shots: generated.shots.map(shot => ({ ...shot, sourceRevision: 1 })), createdAt: now, updatedAt: now
    },
    assets: [...characters, ...sceneAssets, ...props, style]
  };
}

function reorder(shots: DirectorShot[]): DirectorShot[] {
  return shots.map((shot, index) => ({ ...shot, order: index + 1 }));
}

export function useDirectorWorkbench(): DirectorWorkbenchController {
  const [projects, setProjects] = useState<DirectorProject[]>([]);
  const [assets, setAssets] = useState<DirectorAsset[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>();
  const [isOpen, setIsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const controllerRef = useRef<AbortController | null>(null);
  const activeProject = projects.find(project => project.id === activeProjectId);
  const activeAssets = assets.filter(asset => asset.projectId === activeProjectId);

  const cancel = () => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setBusy(false);
  };

  const openFromGenerator = async (input: OpenDirectorInput) => {
    const existing = projects.find(project => project.generatorNodeId === input.generatorNodeId);
    if (existing) {
      setActiveProjectId(existing.id);
      setIsOpen(true);
      setError(undefined);
      return;
    }
    if (!input.story.trim()) throw new Error('请先填写左侧脚本节点');
    cancel();
    const controller = new AbortController();
    controllerRef.current = controller;
    setBusy(true);
    setError(undefined);
    setIsOpen(true);
    try {
      const response = await generateDirectorProject({ story: input.story, shotCount: 8, targetDuration: 60, aspectRatio: '16:9', style: '电影感' }, controller.signal);
      const hydrated = hydrateGeneratedProject(input, response.project);
      setProjects(previous => [...previous, hydrated.project]);
      setAssets(previous => [...previous, ...hydrated.assets]);
      setActiveProjectId(hydrated.project.id);
    } catch (caught) {
      if ((caught as Error).name !== 'AbortError') {
        setError((caught as Error).message);
        throw caught;
      }
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      setBusy(false);
    }
  };

  const updateActive = (updater: (project: DirectorProject) => DirectorProject) => {
    setProjects(previous => previous.map(project => project.id === activeProjectId ? updater(project) : project));
  };

  const setStep = (step: DirectorStep) => updateActive(project => ({ ...project, currentStep: step, updatedAt: new Date().toISOString() }));
  const updateShot = (shotId: string, updates: Partial<DirectorShot>) => {
    updateActive(project => updateDirectorShot(project, shotId, updates));
    if (updates.visualDescription !== undefined && activeProjectId) {
      const names = extractMentionNames(updates.visualDescription);
      setAssets(previous => {
        const known = new Set(previous.filter(asset => asset.projectId === activeProjectId).flatMap(asset => [asset.name, ...asset.aliases]));
        const now = new Date().toISOString();
        const additions = names.filter(name => !known.has(name)).map(name => ({ id: `${activeProjectId}-manual-${encodeURIComponent(name)}`, projectId: activeProjectId, type: 'prop' as const, name, aliases: [], description: '', aiBrief: '', referenceUrls: [], source: 'manual' as const, status: 'draft' as const, metadata: {}, createdAt: now, updatedAt: now }));
        return additions.length ? [...previous, ...additions] : previous;
      });
    }
  };
  const addShot = () => updateActive(project => {
    const last = project.shots.at(-1);
    const shot: DirectorShot = { id: crypto.randomUUID(), sceneId: last?.sceneId || project.scenes[0].id, order: project.shots.length + 1, duration: 5, visualDescription: '', shotSize: '中景', lighting: '', dialogue: '', sound: '', cameraMovement: '固定', assetRefs: [], promptStatus: 'missing', sourceRevision: project.revision + 1 };
    return { ...project, revision: project.revision + 1, shots: [...project.shots, shot], updatedAt: new Date().toISOString() };
  });
  const deleteShot = (shotId: string) => updateActive(project => ({ ...project, revision: project.revision + 1, shots: reorder(project.shots.filter(shot => shot.id !== shotId)), updatedAt: new Date().toISOString() }));
  const duplicateShot = (shotId: string) => updateActive(project => {
    const index = project.shots.findIndex(shot => shot.id === shotId);
    if (index < 0) return project;
    const copy = { ...project.shots[index], id: crypto.randomUUID(), promptStatus: 'stale' as const, sourceRevision: project.revision + 1 };
    const shots = [...project.shots.slice(0, index + 1), copy, ...project.shots.slice(index + 1)];
    return { ...project, revision: project.revision + 1, shots: reorder(shots), updatedAt: new Date().toISOString() };
  });
  const splitShot = (shotId: string) => updateActive(project => {
    const index = project.shots.findIndex(shot => shot.id === shotId);
    if (index < 0) return project;
    const original = project.shots[index];
    const revision = project.revision + 1;
    const first = { ...original, duration: Math.max(1, Math.ceil(original.duration / 2)), promptStatus: 'stale' as const, sourceRevision: revision };
    const second = { ...original, id: crypto.randomUUID(), duration: Math.max(1, Math.floor(original.duration / 2)), visualDescription: `${original.visualDescription}（续）`, imagePrompt: undefined, videoPrompt: undefined, negativePrompt: undefined, manualOverride: false, promptStatus: 'missing' as const, sourceRevision: revision };
    const shots = [...project.shots.slice(0, index), first, second, ...project.shots.slice(index + 1)];
    return { ...project, revision, shots: reorder(shots), updatedAt: new Date().toISOString() };
  });
  const reorderShot = (sourceShotId: string, targetShotId: string) => updateActive(project => {
    const sourceIndex = project.shots.findIndex(shot => shot.id === sourceShotId);
    const targetIndex = project.shots.findIndex(shot => shot.id === targetShotId);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return project;
    const shots = [...project.shots];
    const [moved] = shots.splice(sourceIndex, 1);
    shots.splice(targetIndex, 0, moved);
    return { ...project, revision: project.revision + 1, shots: reorder(shots), updatedAt: new Date().toISOString() };
  });
  const updateAsset = (assetId: string, updates: Partial<DirectorAsset>) => setAssets(previous => previous.map(asset => asset.id === assetId ? { ...asset, ...updates, updatedAt: new Date().toISOString() } : asset));

  const compilePrompts = async (shotIds: string[]) => {
    if (!activeProject) return;
    cancel();
    const controller = new AbortController();
    controllerRef.current = controller;
    setBusy(true);
    updateActive(project => ({ ...project, shots: project.shots.map(shot => shotIds.includes(shot.id) ? { ...shot, promptStatus: 'generating', promptError: undefined } : shot) }));
    try {
      const selectedShots = activeProject.shots.filter(shot => shotIds.includes(shot.id));
      const response = await compileDirectorPrompts({ styleBrief: activeProject.styleBrief, shots: selectedShots, assets: activeAssets }, controller.signal);
      updateActive(project => ({ ...project, shots: project.shots.map(shot => {
        if (!shotIds.includes(shot.id)) return shot;
        const result = response.results[shot.id];
        return result?.error ? { ...shot, promptStatus: 'error', promptError: result.error } : { ...shot, imagePrompt: result.imagePrompt, videoPrompt: result.videoPrompt, negativePrompt: result.negativePrompt, promptStatus: 'ready', promptError: undefined, sourceRevision: project.revision };
      }) }));
    } catch (caught) {
      updateActive(project => ({ ...project, shots: project.shots.map(shot => shotIds.includes(shot.id) ? { ...shot, promptStatus: 'error', promptError: (caught as Error).message } : shot) }));
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      setBusy(false);
    }
  };

  const updatePrompt = (shotId: string, field: 'imagePrompt' | 'videoPrompt' | 'negativePrompt', value: string) => updateActive(project => ({ ...project, shots: project.shots.map(shot => {
    if (shot.id !== shotId) return shot;
    const next = { ...shot, [field]: value, manualOverride: true };
    return { ...next, promptStatus: next.imagePrompt?.trim() && next.videoPrompt?.trim() ? 'ready' : 'stale' };
  }) }));
  const markSourceChanged = (projectId: string, story: string) => setProjects(previous => previous.map(project => {
    if (project.id !== projectId || project.story === story) return project;
    const revision = project.revision + 1;
    return { ...project, story, revision, status: 'draft', shots: project.shots.map(shot => ({ ...shot, promptStatus: 'stale', sourceRevision: revision })), updatedAt: new Date().toISOString() };
  }));
  const regenerateActiveProject = async () => {
    if (!activeProject) return;
    cancel();
    const controller = new AbortController();
    controllerRef.current = controller;
    setBusy(true);
    setError(undefined);
    try {
      const response = await generateDirectorProject({ story: activeProject.story, shotCount: activeProject.shots.length || 8, targetDuration: activeProject.targetDuration || 60, aspectRatio: activeProject.aspectRatio, style: activeProject.styleBrief }, controller.signal);
      const hydrated = hydrateGeneratedProject({ sourceNodeId: activeProject.sourceNodeId, generatorNodeId: activeProject.generatorNodeId, story: activeProject.story }, response.project);
      const replacement = { ...hydrated.project, revision: activeProject.revision, appliedRevision: activeProject.appliedRevision, createdAt: activeProject.createdAt };
      setProjects(previous => previous.map(project => project.id === activeProject.id ? replacement : project));
      setAssets(previous => [...previous.filter(asset => asset.projectId !== activeProject.id), ...hydrated.assets]);
    } catch (caught) {
      if ((caught as Error).name !== 'AbortError') setError((caught as Error).message);
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      setBusy(false);
    }
  };
  const markApplied = (projectId: string, revision: number) => setProjects(previous => previous.map(project => project.id === projectId ? { ...project, appliedRevision: revision, updatedAt: new Date().toISOString() } : project));

  return {
    projects, assets, setProjects, setAssets, activeProject, activeAssets, isOpen, busy, error,
    openFromGenerator, close: () => { cancel(); setIsOpen(false); }, cancel, setStep, updateShot,
    addShot, deleteShot, duplicateShot, splitShot, reorderShot, updateAsset, compilePrompts, updatePrompt,
    markSourceChanged, regenerateActiveProject, markApplied
  };
}
```

- [ ] **Step 6: Run tests and build**

Run:

```powershell
npm test -- src/features/director/__tests__/PromptCompilationStep.test.tsx src/features/director/__tests__/useDirectorWorkbench.test.tsx
npm run build
```

Expected: tests and build pass.

- [ ] **Step 7: Commit orchestration**

```powershell
git add src/features/director/components/PromptCompilationStep.tsx src/features/director/useDirectorWorkbench.ts src/features/director/__tests__/PromptCompilationStep.test.tsx src/features/director/__tests__/useDirectorWorkbench.test.tsx
git commit -m "feat: orchestrate director prompt compilation"
```

## Task 10: Build the Idempotent Scene-Group Graph Patch

**Files:**
- Create: `src/features/director/graphBuilder.ts`
- Create: `src/features/director/__tests__/graphBuilder.test.ts`
- Modify: `src/hooks/useGroupManagement.ts:50-90`
- Modify: `src/App.tsx:1200-1245`

- [ ] **Step 1: Write failing graph tests**

Create `src/features/director/__tests__/graphBuilder.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildDirectorGraphPatch } from '../graphBuilder';
import type { DirectorAsset, DirectorProject } from '../types';

const project: DirectorProject = {
  id: 'project-1', title: '雪夜归城', sourceNodeId: 'text-1', generatorNodeId: 'generator-1', currentStep: 'prompts', status: 'ready', revision: 1,
  story: '故事', styleBrief: '电影感', aspectRatio: '16:9', characterIds: ['asset-1'], sceneIds: ['scene-1'], propIds: [], styleIds: [],
  scenes: [{ id: 'scene-1', name: '雪夜城门', description: '暴雪中的城门', assetId: 'scene-asset-1' }],
  shots: [
    { id: 'shot-1', sceneId: 'scene-1', order: 1, duration: 5, visualDescription: '@皇子 归城', shotSize: '远景', lighting: '月光', cameraMovement: '推进', assetRefs: ['皇子'], promptStatus: 'ready', imagePrompt: 'image 1', videoPrompt: 'video 1', sourceRevision: 1 },
    { id: 'shot-2', sceneId: 'scene-1', order: 2, duration: 5, visualDescription: '@皇子 回头', shotSize: '特写', lighting: '月光', cameraMovement: '固定', assetRefs: ['皇子'], promptStatus: 'ready', imagePrompt: 'image 2', videoPrompt: 'video 2', sourceRevision: 1 }
  ],
  createdAt: '', updatedAt: ''
};
const assets: DirectorAsset[] = [{ id: 'asset-1', projectId: 'project-1', type: 'character', name: '皇子', aliases: [], description: '黑发灰披风', aiBrief: '黑发灰披风', referenceUrls: [], source: 'generated', status: 'ready', metadata: {}, createdAt: '', updatedAt: '' }];

describe('buildDirectorGraphPatch', () => {
  it('creates public assets and scene-group planning nodes with stable parents', () => {
const patch = buildDirectorGraphPatch({ project, assets, anchor: { x: 100, y: 200 }, existingNodes: [], existingGroups: [] });
expect(patch.nodesToCreate.map(node => node.directorRole)).toEqual(['character', 'scene', 'shot', 'shot']);
expect(patch.groupsToCreate.map(group => group.groupRole)).toEqual(['asset-group', 'scene-group']);
expect(patch.nodesToCreate.find(node => node.directorRole === 'shot')?.parentIds).toEqual(['director-project-1-scene-scene-1']);
expect(patch.nodesToCreate.find(node => node.directorEntityId === 'shot-1')?.prompt).toContain('图片提示词：image 1');
  });

  it('does not create duplicates for an already-applied graph', () => {
    const first = buildDirectorGraphPatch({ project, assets, anchor: { x: 100, y: 200 }, existingNodes: [], existingGroups: [] });
const second = buildDirectorGraphPatch({ project: { ...project, appliedRevision: 1 }, assets, anchor: { x: 100, y: 200 }, existingNodes: first.nodesToCreate, existingGroups: first.groupsToCreate });
    expect(second.nodesToCreate).toHaveLength(0);
    expect(second.groupsToCreate).toHaveLength(0);
  });

  it('marks removed planning nodes stale instead of deleting downstream media', () => {
    const first = buildDirectorGraphPatch({ project, assets, anchor: { x: 100, y: 200 }, existingNodes: [], existingGroups: [] });
    const nextProject = { ...project, revision: 2, shots: project.shots.slice(0, 1) };
    const patch = buildDirectorGraphPatch({ project: nextProject, assets, anchor: { x: 100, y: 200 }, existingNodes: first.nodesToCreate, existingGroups: first.groupsToCreate });
    expect(patch.nodesToUpdate).toContainEqual(expect.objectContaining({ id: 'director-project-1-shot-shot-2', stale: true }));
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run:

```powershell
npm test -- src/features/director/__tests__/graphBuilder.test.ts
```

Expected: FAIL because `graphBuilder.ts` does not exist.

- [ ] **Step 3: Implement stable IDs and layout**

Create `src/features/director/graphBuilder.ts` with:

```ts
import { NodeStatus, NodeType, type NodeData, type NodeGroup } from '../../types';
import type { DirectorAsset, DirectorGraphPatch, DirectorProject } from './types';

const nodeId = (projectId: string, role: string, entityId: string) => `director-${projectId}-${role}-${entityId}`;
const groupId = (projectId: string, role: string, entityId: string) => `director-${projectId}-group-${role}-${entityId}`;

function planningNode(project: DirectorProject, role: NodeData['directorRole'], entityId: string, title: string, prompt: string, x: number, y: number, parentIds: string[] = []): NodeData {
  return { id: nodeId(project.id, role || 'node', entityId), type: NodeType.TEXT, title, x, y, prompt, status: NodeStatus.IDLE, parentIds, model: '', aspectRatio: project.aspectRatio, resolution: '1K', directorRole: role, directorProjectId: project.id, directorEntityId: entityId, sourceRevision: project.revision, stale: false };
}

export function buildDirectorGraphPatch({ project, assets, anchor, existingNodes, existingGroups }: { project: DirectorProject; assets: DirectorAsset[]; anchor: { x: number; y: number }; existingNodes: NodeData[]; existingGroups: NodeGroup[] }): DirectorGraphPatch {
  const desiredNodes: NodeData[] = [];
  const desiredGroups: NodeGroup[] = [];
  const projectAssets = assets.filter(asset => asset.projectId === project.id && asset.type !== 'scene' && asset.type !== 'audio');
  const assetNodes = projectAssets.map((asset, index) => planningNode(project, asset.type, asset.id, asset.name, asset.aiBrief, anchor.x, anchor.y + index * 220));
  desiredNodes.push(...assetNodes);
  desiredGroups.push({ id: groupId(project.id, 'assets', 'shared'), nodeIds: assetNodes.map(node => node.id), label: '公共资产', directorProjectId: project.id, groupRole: 'asset-group', status: 'idle', collapsed: false, sourceRevision: project.revision });
  project.scenes.forEach((scene, sceneIndex) => {
    const sceneX = anchor.x + 420 + sceneIndex * 900;
    const sceneNode = planningNode(project, 'scene', scene.id, scene.name, scene.description, sceneX, anchor.y, [project.generatorNodeId]);
    const shots = project.shots.filter(shot => shot.sceneId === scene.id).sort((a, b) => a.order - b.order);
    const shotNodes = shots.map((shot, index) => planningNode(project, 'shot', shot.id, `镜头 ${shot.order}`, `${shot.visualDescription}\n\n图片提示词：${shot.imagePrompt || ''}\n视频提示词：${shot.videoPrompt || ''}`, sceneX + (index % 2) * 390, anchor.y + 240 + Math.floor(index / 2) * 260, [sceneNode.id]));
    desiredNodes.push(sceneNode, ...shotNodes);
    desiredGroups.push({ id: groupId(project.id, 'scene', scene.id), nodeIds: [sceneNode.id, ...shotNodes.map(node => node.id)], label: `场景 ${sceneIndex + 1} · ${scene.name}`, directorProjectId: project.id, groupRole: 'scene-group', sceneId: scene.id, status: 'idle', collapsed: false, sourceRevision: project.revision });
  });
  const existingNodeIds = new Set(existingNodes.map(node => node.id));
  const existingGroupIds = new Set(existingGroups.map(group => group.id));
  const desiredNodeIds = new Set(desiredNodes.map(node => node.id));
  const desiredGroupIds = new Set(desiredGroups.map(group => group.id));
  const obsoleteNodeUpdates = existingNodes.filter(node => node.directorProjectId === project.id && !desiredNodeIds.has(node.id)).map(node => ({ id: node.id, stale: true, sourceRevision: project.revision }));
  const obsoleteGroupUpdates = existingGroups.filter(group => group.directorProjectId === project.id && !desiredGroupIds.has(group.id)).map(group => ({ id: group.id, status: 'stale' as const, sourceRevision: project.revision }));
  return {
    projectId: project.id,
    revision: project.revision,
    nodesToCreate: desiredNodes.filter(node => !existingNodeIds.has(node.id)),
    nodesToUpdate: [...desiredNodes.filter(node => existingNodeIds.has(node.id)), ...obsoleteNodeUpdates],
    groupsToCreate: desiredGroups.filter(group => !existingGroupIds.has(group.id)),
    groupsToUpdate: [...desiredGroups.filter(group => existingGroupIds.has(group.id)), ...obsoleteGroupUpdates]
  };
}

export function mergeDirectorGraphPatch(nodes: NodeData[], groups: NodeGroup[], patch: DirectorGraphPatch) {
  const updateNodes = new Map(patch.nodesToUpdate.map(node => [node.id, node]));
  const updateGroups = new Map(patch.groupsToUpdate.map(group => [group.id, group]));
  return {
    nodes: [...nodes.map(node => updateNodes.has(node.id) ? { ...node, ...updateNodes.get(node.id) } : node), ...patch.nodesToCreate],
    groups: [...groups.map(group => updateGroups.has(group.id) ? { ...group, ...updateGroups.get(group.id) } : group), ...patch.groupsToCreate]
  };
}
```

- [ ] **Step 4: Preserve one-node director groups**

In `useGroupManagement.cleanupInvalidGroups`, change the invalid rule to:

```ts
if (groupNodeCount < 2 && !group.groupRole) invalidGroupIds.push(group.id);
```

In `App.tsx` group rendering, change the visibility rule to:

```ts
if (groupNodes.length < 2 && !group.groupRole) return null;
```

- [ ] **Step 5: Run graph tests and build**

Run:

```powershell
npm test -- src/features/director/__tests__/graphBuilder.test.ts
npm run build
```

Expected: graph tests pass and build succeeds.

- [ ] **Step 6: Commit graph application foundation**

```powershell
git add src/features/director/graphBuilder.ts src/features/director/__tests__/graphBuilder.test.ts src/hooks/useGroupManagement.ts src/App.tsx
git commit -m "feat: build idempotent director scene graphs"
```

## Task 11: Wire Toolbar Entry, Workbench Steps, Persistence, and Canvas Application

**Files:**
- Modify: `src/components/Toolbar.tsx:1-180`
- Modify: `src/hooks/useWorkflow.ts:10-140`
- Modify: `src/App.tsx:60-260,413-484,924-1040,1097-1145`
- Modify: `src/features/director/components/DirectorWorkbenchModal.tsx`
- Modify: `src/features/director/useDirectorWorkbench.ts`
- Create: `src/features/director/__tests__/workflowRoundTrip.test.ts`

- [ ] **Step 1: Write a failing workflow round-trip test**

Create `src/features/director/__tests__/workflowRoundTrip.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { normalizeDirectorCollections } from '../workflowCompatibility';

describe('director workflow round trip', () => {
  it('restores projects and assets without changing legacy nodes', () => {
    const workflow = { nodes: [{ id: 'legacy-node' }], groups: [], directorProjects: [{ id: 'project-1' }], directorAssets: [{ id: 'asset-1' }] };
    const director = normalizeDirectorCollections(JSON.parse(JSON.stringify(workflow)));
    expect(workflow.nodes).toEqual([{ id: 'legacy-node' }]);
    expect(director.directorProjects[0]).toEqual({ id: 'project-1' });
    expect(director.directorAssets[0]).toEqual({ id: 'asset-1' });
  });
});
```

- [ ] **Step 2: Run the round-trip test**

Run:

```powershell
npm test -- src/features/director/__tests__/workflowRoundTrip.test.ts
```

Expected: PASS after Task 2; this locks the compatibility contract before integration edits.

- [ ] **Step 3: Add the toolbar entry without removing current tools**

Add `onDirectorClick?: (e: React.MouseEvent) => void` to `ToolbarProps`, import `Clapperboard`, destructure the callback, and insert this item before the current storyboard generator item:

```tsx
<button
  onClick={handleToolClick(onDirectorClick)}
  className={`group flex w-full items-center gap-3 px-3 py-2.5 transition-colors ${isDark ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'}`}
>
  <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${isDark ? 'bg-neutral-800' : 'bg-neutral-200'}`}>
    <Clapperboard size={16} className={isDark ? 'text-cyan-400' : 'text-cyan-700'} />
  </div>
  <div className="text-left">
    <p className={`text-sm ${isDark ? 'text-neutral-200 group-hover:text-white' : 'text-neutral-700 group-hover:text-neutral-900'}`}>AI 导演脚本</p>
    <p className={`text-xs ${isDark ? 'text-neutral-500' : 'text-neutral-400'}`}>剧情 → 镜头 → 资产 → 提示词</p>
  </div>
</button>
```

Keep the current storyboard generator item available.

- [ ] **Step 4: Extend workflow save/load**

Add `directorProjects`, `directorAssets`, `setDirectorProjects`, and `setDirectorAssets` to `UseWorkflowOptions`. Include the two arrays in `WorkflowData` during save. During load:

```ts
const director = normalizeDirectorCollections(workflow);
setDirectorProjects(director.directorProjects as DirectorProject[]);
setDirectorAssets(director.directorAssets as DirectorAsset[]);
```

Do not alter existing node/group/viewport behavior.

- [ ] **Step 5: Add the quick-create canvas entry**

In `App.tsx`, instantiate `const directorWorkbench = useDirectorWorkbench();`. Add `handleCreateDirectorEntry` that creates exactly two nodes at the viewport center:

```ts
const sourceId = crypto.randomUUID();
const generatorId = crypto.randomUUID();
const anchorX = (-viewport.x + window.innerWidth / 2) / viewport.zoom;
const anchorY = (-viewport.y + window.innerHeight / 2) / viewport.zoom;
const sourceNode: NodeData = { id: sourceId, type: NodeType.TEXT, title: '脚本', x: anchorX - 420, y: anchorY, prompt: '', status: NodeStatus.IDLE, textMode: 'editing', model: '', aspectRatio: '16:9', resolution: '1K', directorRole: 'script' };
const generatorNode: NodeData = { id: generatorId, type: NodeType.TEXT, title: '脚本生成器', x: anchorX, y: anchorY, prompt: '', status: NodeStatus.IDLE, parentIds: [sourceId], model: '', aspectRatio: '16:9', resolution: '1K', directorRole: 'script-generator' };
setNodes(previous => [...previous, sourceNode, generatorNode]);
setSelectedNodeIds([sourceId, generatorId]);
```

Wire the toolbar director item to this callback.

- [ ] **Step 6: Open the workbench from a generator node**

Pass `onOpenDirector` to every `CanvasNode`. Resolve the generator's first parent, require non-empty `parent.prompt`, and call:

```ts
directorWorkbench.openFromGenerator({ sourceNodeId: parent.id, generatorNodeId: node.id, story: parent.prompt });
```

If the story is empty, update the generator node with `errorMessage: '请先填写左侧脚本节点'` and do not call the API.

- [ ] **Step 7: Mark applied planning nodes stale when the source script changes**

Add this effect in `App.tsx`:

```ts
React.useEffect(() => {
  directorWorkbench.projects.forEach(project => {
    const source = nodes.find(node => node.id === project.sourceNodeId);
    if (!source || source.prompt === project.story) return;
    directorWorkbench.markSourceChanged(project.id, source.prompt);
    setNodes(previous => previous.map(node => node.directorProjectId === project.id ? { ...node, stale: true } : node));
  });
}, [nodes, directorWorkbench.projects]);
```

Add optional `needsRegeneration` and `onRegenerate` props to `DirectorWorkbenchModal`. When `needsRegeneration` is true, render a header button labeled `重新解析脚本`. Pass `needsRegeneration={project?.status === 'draft'}` and `onRegenerate={directorWorkbench.regenerateActiveProject}` from `App.tsx`. Re-parsing keeps `appliedRevision` but does not update canvas planning nodes until the user reaches step 3 and applies again.

- [ ] **Step 8: Compose all three steps in the modal**

Add `const [directorValidationError, setDirectorValidationError] = useState<string>();` in `App.tsx`. Build step content with the following branch, and render `directorValidationError` above it using `bg-red-900/20 border-red-800 text-red-400`:

```tsx
const project = directorWorkbench.activeProject;
const advanceDirectorStep = (step: DirectorStep) => {
  if (!project) return;
  const gate = canEnterDirectorStep(project, directorWorkbench.activeAssets, step);
  if (!gate.ok) {
    setDirectorValidationError(gate.reason);
    return;
  }
  setDirectorValidationError(undefined);
  directorWorkbench.setStep(step);
};

const directorStepContent = !project ? (
  <div className="flex h-full items-center justify-center text-neutral-500">正在生成结构化镜头表...</div>
) : project.currentStep === 'shots' ? (
  <ShotTableStep
    shots={project.shots}
    mentionOptions={directorWorkbench.activeAssets.map(asset => asset.name)}
    onUpdateShot={directorWorkbench.updateShot}
    onAddShot={directorWorkbench.addShot}
    onDeleteShot={directorWorkbench.deleteShot}
    onDuplicateShot={directorWorkbench.duplicateShot}
    onSplitShot={directorWorkbench.splitShot}
    onReorderShot={directorWorkbench.reorderShot}
    onNext={() => advanceDirectorStep('assets')}
  />
) : project.currentStep === 'assets' ? (
  <AssetPreparationStep
    referencedNames={[...new Set(project.shots.flatMap(shot => shot.assetRefs))]}
    assets={directorWorkbench.activeAssets}
    onUpdateAsset={directorWorkbench.updateAsset}
    onChooseLibraryAsset={assetId => { setPendingDirectorAssetId(assetId); openAssetLibraryModal(window.innerHeight / 2, closeWorkflowPanel); }}
    onBack={() => directorWorkbench.setStep('shots')}
    onNext={() => advanceDirectorStep('prompts')}
  />
) : (
  <PromptCompilationStep
    shots={project.shots}
    onCompile={directorWorkbench.compilePrompts}
    onUpdatePrompt={directorWorkbench.updatePrompt}
    onBack={() => directorWorkbench.setStep('assets')}
    onApply={handleApplyDirectorGraph}
    applying={directorWorkbench.busy}
  />
);
```

Add `pendingDirectorAssetId` state. When `AssetLibraryPanel.onSelectLibraryAsset` fires and this state is set, update that director asset's `referenceUrls`, `source='library'`, and clear the pending ID instead of creating a canvas media node. Use modal shell counts derived from shots, ready assets, and ready prompts.

Pass `canvasTheme` into all three step components. Each step computes `const dark = canvasTheme === 'dark'` and uses this exact mapping instead of fixed dark-only surfaces:

```ts
const theme = dark ? {
  root: 'bg-[#0f0f0f] text-neutral-200',
  surface: 'bg-[#1a1a1a] border-neutral-800',
  header: 'bg-neutral-900 text-neutral-400',
  input: 'bg-neutral-900 border-neutral-700 text-neutral-200',
  footer: 'bg-neutral-900 border-neutral-800'
} : {
  root: 'bg-neutral-50 text-neutral-900',
  surface: 'bg-white border-neutral-200',
  header: 'bg-neutral-100 text-neutral-600',
  input: 'bg-white border-neutral-300 text-neutral-900',
  footer: 'bg-white border-neutral-200'
};
```

Use complete literal class strings from this map so Tailwind includes both themes in the generated CSS.

- [ ] **Step 9: Apply the Graph Patch atomically**

On final apply:

```ts
const patch = buildDirectorGraphPatch({ project, assets: directorWorkbench.activeAssets, anchor: { x: generatorNode.x + 450, y: generatorNode.y }, existingNodes: nodes, existingGroups: groups });
const merged = mergeDirectorGraphPatch(nodes, groups, patch);
setNodes(merged.nodes);
setGroups(merged.groups);
directorWorkbench.markApplied(project.id, project.revision);
```

Add `markApplied(projectId, revision)` to the hook and set `appliedRevision=revision`. Close the modal only after both state updates complete.

- [ ] **Step 10: Include director state in dirty tracking and new-canvas reset**

Mark the workflow dirty when director projects/assets change. `handleNewCanvas` must set both collections to empty arrays. Keep current autosave behavior unchanged.

- [ ] **Step 11: Run the complete automated suite and build**

Run:

```powershell
npm test
node --test server/services/assetStorage.test.js server/services/openaiChat.test.js server/services/seedance.test.js server/services/storyboardText.test.js server/services/directorProject.test.js server/services/promptCompiler.test.js
npm run build
```

Expected: all frontend tests, all backend service tests, and the production build pass.

- [ ] **Step 12: Commit integrated director flow**

```powershell
git add src/components/Toolbar.tsx src/hooks/useWorkflow.ts src/App.tsx src/features/director/components/DirectorWorkbenchModal.tsx src/features/director/useDirectorWorkbench.ts src/features/director/__tests__/workflowRoundTrip.test.ts
git commit -m "feat: integrate the director workbench into the canvas"
```

## Task 12: Verify the Complete User Flow and Add Usage Documentation

**Files:**
- Create: `docs/director-workbench.md`
- Modify: `README.md`

- [ ] **Step 1: Start backend and frontend**

Run in separate terminals:

```powershell
npm run server
npm exec vite -- --host 127.0.0.1 --port 5173
```

Expected: backend listens on 3001 and frontend on 5173.

- [ ] **Step 2: Smoke-test the backend contracts**

Run a one-shot request with a 1-shot story:

```powershell
$body = @{ story = '一个流亡皇子在雪夜归城。'; shotCount = 1; targetDuration = 5; aspectRatio = '16:9'; style = '东方史诗' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3001/api/storyboard/generate-director-project' -ContentType 'application/json' -Body $body
```

Expected: response contains `project.shots` with one row and no generic 500 message.

- [ ] **Step 3: Verify the browser flow**

Use the local app and verify this exact sequence:

1. Open Tools → AI 导演脚本.
2. Confirm the canvas creates Script and Script Generator nodes with one edge.
3. Enter a story in the Script node.
4. Open the Script Generator.
5. Confirm the full-screen workbench matches TwitCanva dark theme.
6. Edit one shot and verify only that row becomes stale.
7. Advance to assets; provide text-only descriptions and optionally choose a library image.
8. Compile all prompts; force one failed response and verify single-row retry.
9. Apply to canvas; confirm one public asset group and one group per scene.
10. Apply the same revision again; confirm no duplicate nodes.
11. Save, reload, and reopen the workbench; confirm step and content restore.
12. Confirm no image-generation or video-generation request occurs during this flow.

- [ ] **Step 4: Verify light theme and responsive bounds**

Switch `canvasTheme` to light, reopen the workbench, and confirm readable table headers, borders, buttons, errors, and asset cards. At 1280×720, confirm the workbench uses internal scrolling and the footer remains reachable.

- [ ] **Step 5: Write the user guide**

Create `docs/director-workbench.md` with: where to open the tool, the three steps, `@资产` usage, text-only asset readiness, applying to canvas, how stale prompts work, and the statement that the first version does not automatically generate media. Add one README link under Usage.

- [ ] **Step 6: Run final verification**

Run:

```powershell
npm test
node --test server/services/assetStorage.test.js server/services/openaiChat.test.js server/services/seedance.test.js server/services/storyboardText.test.js server/services/directorProject.test.js server/services/promptCompiler.test.js
npm run build
git diff --check
```

Expected: all commands pass with no whitespace errors.

- [ ] **Step 7: Commit documentation and verification notes**

```powershell
git add docs/director-workbench.md README.md
git commit -m "docs: explain the director workbench flow"
```

## Completion Gate

The implementation is complete only when:

- All Task 1-12 tests pass.
- Existing image, video, storyboard, asset-library, and workflow loading paths still build.
- The three-step workbench uses TwitCanva visual classes in both themes.
- The final apply operation creates only planning nodes and never starts media generation.
- Reapplying an unchanged project is idempotent.
- Old workflow JSON opens without director data.
- Backend errors identify the failing configuration or shot instead of returning only `Internal Server Error`.
