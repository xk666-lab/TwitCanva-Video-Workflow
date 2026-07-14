# Persistent ScriptNode and StoryboardNode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persistent, connected ScriptNode and StoryboardNode objects that keep the existing storyboard wizard, run story generation through GenerationTask, recover after refresh, and preserve legacy `NodeGroup.storyContext`, image generation, and video generation behavior.

**Architecture:** Add nested script/storyboard documents to the existing compatible `NodeData`, register a new Script node and activate the existing Storyboard node, then treat those documents as the primary data source. The existing modal becomes a node-backed editor; legacy groups are upgraded only when edited and remain mirrored on save. A new `generate-story-package` operation returns structured output through the existing task queue, while a pure result mapper applies Script and Storyboard updates atomically through graph state.

**Tech Stack:** React 19, TypeScript, Vite, Express, Node.js test runner, local JSON workflow storage, local JSON GenerationTask repository.

---

## Scope And Guardrails

- Work only on phase 4 from `docs/superpowers/specs/2026-07-14-script-storyboard-nodes-design.md`.
- Keep `parentIds`, all existing NodeType values, existing storyboard modals, current media Provider calls, public workflow APIs, and server-side API key storage.
- Do not implement assets, subjects, audio, timeline, Agent APIs, new models, a professional shot table, or Prompt Compiler.
- Do not rewrite `App.tsx`, `CanvasNode.tsx`, or the canvas engine.
- Use TDD for pure functions and backend behavior. The repository has no component test harness, so verify compact node UI with typecheck, build, and a runtime smoke checklist.
- Run the smallest relevant test after every red/green cycle. Run the complete suite only at the final task.
- Commit after every task. Push only after the complete phase passes all verification.

## Locked File Map

### New Domain Files

- `src/domain/storyboard/storyboardTypes.ts`: serializable story, shot, document, legacy-context, and session types only.
- `src/domain/storyboard/storyboardDocuments.ts`: document factories, normalization, legacy conversion, and session/document projection.
- `src/domain/storyboard/storyboardGraph.ts`: draft node pair creation, legacy group materialization, story-context projection, and media-node linkage.
- `src/domain/nodes/nodeUpdates.ts`: pure multi-node update map application.
- `src/domain/generation/taskResultUpdates.ts`: operation-aware GenerationTask-to-node update mapping.

### New UI Files

- `src/components/canvas/ScriptNodeContent.tsx`: compact Script node body.
- `src/components/canvas/StoryboardNodeContent.tsx`: compact Storyboard node body.

### New Tests

- `src/utils/storyboardDomain.test.ts`
- `src/utils/storyboardGraph.test.ts`
- `src/utils/taskResultUpdates.test.ts`
- `server/services/storyboardGeneration.test.js`

### Primary Modified Files

- `src/types.ts`
- `src/domain/nodes/nodeDefinition.ts`
- `src/domain/nodes/nodeRegistry.ts`
- `src/domain/graph/graphTypes.ts`
- `src/domain/graph/connectionRules.ts`
- `src/domain/graph/edgeMigration.ts`
- `src/domain/workflow/workflowSchema.ts`
- `src/domain/workflow/migrateWorkflow.ts`
- `src/domain/generation/generationTask.ts`
- `src/services/generationService.ts`
- `src/hooks/useNodeManagement.ts`
- `src/hooks/useGenerationRecovery.ts`
- `src/hooks/useStoryboardGenerator.ts`
- `src/hooks/useWorkflow.ts`
- `src/components/ContextMenu.tsx`
- `src/components/canvas/NodeContent.tsx`
- `src/components/canvas/CanvasNode.tsx`
- `src/components/modals/StoryboardGeneratorModal.tsx`
- `src/components/modals/StoryboardVideoModal.tsx`
- `src/App.tsx`
- `server/services/storyboardGeneration.js`
- `server/routes/storyboard.js`
- `server/routes/generation.js`
- Existing related tests and workflow fixtures.

## Task 1: Add Serializable Storyboard Domain Documents

**Files:**

- Create: `src/domain/storyboard/storyboardTypes.ts`
- Create: `src/domain/storyboard/storyboardDocuments.ts`
- Create: `src/utils/storyboardDomain.test.ts`
- Modify: `src/types.ts`

- [ ] **Step 1: Write failing document factory and normalization tests**

Create `src/utils/storyboardDomain.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createEmptyScriptDocument,
  createEmptyStoryboardDocument,
  normalizeScriptDocument,
  normalizeStoryboardDocument
} from '../domain/storyboard/storyboardDocuments.ts';

const NOW = '2026-07-14T00:00:00.000Z';

test('document factories return fresh serializable defaults', () => {
  const firstScript = createEmptyScriptDocument({ now: NOW });
  const secondScript = createEmptyScriptDocument({ now: NOW });
  const storyboard = createEmptyStoryboardDocument({
    sourceScriptNodeId: 'script-1',
    now: NOW
  });

  assert.equal(firstScript.schemaVersion, 1);
  assert.equal(firstScript.revision, 0);
  assert.deepEqual(firstScript.referenceAssets, []);
  assert.notEqual(firstScript.referenceAssets, secondScript.referenceAssets);
  assert.equal(storyboard.sourceScriptNodeId, 'script-1');
  assert.equal(storyboard.selectedImageModel, 'gpt-image-2');
  assert.deepEqual(storyboard.shots, []);
});

test('normalization preserves unknown fields and assigns stable shot ids', () => {
  const raw = {
    schemaVersion: 1,
    sourceScriptNodeId: 'script-1',
    selectedImageModel: 'gpt-image-2',
    revision: 3,
    futureDocument: { enabled: true },
    shots: [{
      sceneNumber: 4,
      description: 'A train enters a flooded station',
      cameraAngle: 'Wide shot',
      mood: 'Tense',
      futureShot: 7
    }]
  };

  const once = normalizeStoryboardDocument(raw, {
    ownerId: 'storyboard-1',
    now: NOW
  });
  const twice = normalizeStoryboardDocument(once, {
    ownerId: 'storyboard-1',
    now: NOW
  });

  assert.equal(once.shots[0].id, 'legacy-shot-storyboard-1-1');
  assert.equal(once.shots[0].order, 0);
  assert.equal(once.shots[0].status, 'draft');
  assert.equal((once as Record<string, unknown>).futureDocument instanceof Object, true);
  assert.equal((once.shots[0] as unknown as Record<string, unknown>).futureShot, 7);
  assert.deepEqual(twice, once);
});

test('script normalization does not mutate its input', () => {
  const raw = {
    sourceText: 'A courier finds a lost robot',
    synopsis: 'A short adventure',
    futureField: 'kept'
  };
  const snapshot = structuredClone(raw);
  const normalized = normalizeScriptDocument(raw, { now: NOW });

  assert.deepEqual(raw, snapshot);
  assert.equal(normalized.sourceText, raw.sourceText);
  assert.equal((normalized as Record<string, unknown>).futureField, 'kept');
});
```

- [ ] **Step 2: Run the test and verify it fails because the domain modules do not exist**

Run:

```powershell
node --experimental-strip-types --test src/utils/storyboardDomain.test.ts
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `storyboardDocuments.ts`.

- [ ] **Step 3: Create the domain types**

Create `src/domain/storyboard/storyboardTypes.ts` with these exact public contracts:

```ts
export const SCRIPT_DOCUMENT_SCHEMA_VERSION = 1;
export const STORYBOARD_DOCUMENT_SCHEMA_VERSION = 1;

export interface StoryReferenceAsset {
  id: string;
  name: string;
  url: string;
  description?: string;
  category?: string;
  [key: string]: unknown;
}

export interface StoryGenerationProvenance {
  taskId: string;
  provider: string;
  model: string;
}

export interface ScriptDocument {
  schemaVersion: number;
  title: string;
  sourceText: string;
  synopsis: string;
  styleAnchor: string;
  characterDNA: Record<string, string>;
  referenceAssets: StoryReferenceAsset[];
  revision: number;
  generatedBy?: StoryGenerationProvenance;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

export type StoryboardShotStatus =
  | 'draft'
  | 'ready'
  | 'image-running'
  | 'image-ready'
  | 'video-running'
  | 'video-ready'
  | 'failed';

export interface StoryboardShot {
  id: string;
  order: number;
  sceneNumber: number;
  description: string;
  cameraAngle: string;
  cameraMovement?: string;
  lighting?: string;
  mood: string;
  imagePrompt?: string;
  videoPrompt?: string;
  imageNodeId?: string;
  videoNodeId?: string;
  activeTaskId?: string;
  lastTaskId?: string;
  status: StoryboardShotStatus;
  error?: string;
  revision: number;
  [key: string]: unknown;
}

export interface StoryboardDocument {
  schemaVersion: number;
  sourceScriptNodeId: string;
  shots: StoryboardShot[];
  selectedImageModel: string;
  selectedVideoModel?: string;
  compositeImageUrl?: string | null;
  revision: number;
  generatedBy?: StoryGenerationProvenance;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

export interface LegacyStoryContext {
  story: string;
  scripts: StoryboardShot[];
  selectedCharacters?: StoryReferenceAsset[];
  sceneCount?: number;
  styleAnchor?: string;
  characterDNA?: Record<string, string>;
  compositeImageUrl?: string | null;
  selectedImageModel?: string;
  scriptNodeId?: string;
  storyboardNodeId?: string;
  [key: string]: unknown;
}

export interface StoryboardSessionSnapshot {
  story: string;
  scripts: StoryboardShot[];
  selectedCharacters: StoryReferenceAsset[];
  sceneCount: number;
  styleAnchor: string;
  characterDNA: Record<string, string>;
  selectedImageModel: string;
  compositeImageUrl: string | null;
}
```

- [ ] **Step 4: Implement factories and idempotent normalizers**

Create `src/domain/storyboard/storyboardDocuments.ts`. Implement these exports with object spreads before normalized fields so unknown fields survive:

```ts
import {
  SCRIPT_DOCUMENT_SCHEMA_VERSION,
  STORYBOARD_DOCUMENT_SCHEMA_VERSION,
  type ScriptDocument,
  type StoryReferenceAsset,
  type StoryboardDocument,
  type StoryboardShot,
  type StoryboardShotStatus
} from './storyboardTypes.ts';

type UnknownRecord = Record<string, unknown>;

const SHOT_STATUSES = new Set<StoryboardShotStatus>([
  'draft',
  'ready',
  'image-running',
  'image-ready',
  'video-running',
  'video-ready',
  'failed'
]);

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeReferenceAsset(value: unknown, index: number): StoryReferenceAsset {
  const asset = asRecord(value);
  return {
    ...asset,
    id: stringValue(asset.id, `legacy-reference-${index + 1}`),
    name: stringValue(asset.name, `Reference ${index + 1}`),
    url: stringValue(asset.url),
    ...(typeof asset.description === 'string' ? { description: asset.description } : {}),
    ...(typeof asset.category === 'string' ? { category: asset.category } : {})
  };
}

export function createEmptyScriptDocument(options: {
  sourceText?: string;
  title?: string;
  now?: string;
} = {}): ScriptDocument {
  const now = options.now || new Date().toISOString();
  return {
    schemaVersion: SCRIPT_DOCUMENT_SCHEMA_VERSION,
    title: options.title || '未命名脚本',
    sourceText: options.sourceText || '',
    synopsis: '',
    styleAnchor: '',
    characterDNA: {},
    referenceAssets: [],
    revision: 0,
    createdAt: now,
    updatedAt: now
  };
}

export function createEmptyStoryboardDocument(options: {
  sourceScriptNodeId?: string;
  selectedImageModel?: string;
  now?: string;
} = {}): StoryboardDocument {
  const now = options.now || new Date().toISOString();
  return {
    schemaVersion: STORYBOARD_DOCUMENT_SCHEMA_VERSION,
    sourceScriptNodeId: options.sourceScriptNodeId || '',
    shots: [],
    selectedImageModel: options.selectedImageModel || 'gpt-image-2',
    revision: 0,
    createdAt: now,
    updatedAt: now
  };
}

export function normalizeScriptDocument(
  value: unknown,
  options: { now?: string } = {}
): ScriptDocument {
  const raw = asRecord(value);
  const defaults = createEmptyScriptDocument({ now: options.now });
  const dna = asRecord(raw.characterDNA);
  return {
    ...raw,
    schemaVersion: numberValue(raw.schemaVersion, SCRIPT_DOCUMENT_SCHEMA_VERSION),
    title: stringValue(raw.title, defaults.title),
    sourceText: stringValue(raw.sourceText),
    synopsis: stringValue(raw.synopsis),
    styleAnchor: stringValue(raw.styleAnchor),
    characterDNA: Object.fromEntries(
      Object.entries(dna).map(([key, item]) => [key, stringValue(item)])
    ),
    referenceAssets: Array.isArray(raw.referenceAssets)
      ? raw.referenceAssets.map(normalizeReferenceAsset)
      : [],
    revision: Math.max(0, Math.trunc(numberValue(raw.revision, 0))),
    ...(raw.generatedBy ? { generatedBy: { ...asRecord(raw.generatedBy) } as ScriptDocument['generatedBy'] } : {}),
    createdAt: stringValue(raw.createdAt, defaults.createdAt),
    updatedAt: stringValue(raw.updatedAt, defaults.updatedAt)
  };
}

export function normalizeStoryboardShot(
  value: unknown,
  index: number,
  ownerId: string
): StoryboardShot {
  const raw = asRecord(value);
  const status = SHOT_STATUSES.has(raw.status as StoryboardShotStatus)
    ? raw.status as StoryboardShotStatus
    : 'draft';
  return {
    ...raw,
    id: stringValue(raw.id, `legacy-shot-${ownerId}-${index + 1}`),
    order: index,
    sceneNumber: Math.max(1, Math.trunc(numberValue(raw.sceneNumber, index + 1))),
    description: stringValue(raw.description),
    cameraAngle: stringValue(raw.cameraAngle, 'Medium shot'),
    ...(typeof raw.cameraMovement === 'string' ? { cameraMovement: raw.cameraMovement } : {}),
    ...(typeof raw.lighting === 'string' ? { lighting: raw.lighting } : {}),
    mood: stringValue(raw.mood),
    ...(typeof raw.imagePrompt === 'string' ? { imagePrompt: raw.imagePrompt } : {}),
    ...(typeof raw.videoPrompt === 'string' ? { videoPrompt: raw.videoPrompt } : {}),
    ...(typeof raw.imageNodeId === 'string' ? { imageNodeId: raw.imageNodeId } : {}),
    ...(typeof raw.videoNodeId === 'string' ? { videoNodeId: raw.videoNodeId } : {}),
    ...(typeof raw.activeTaskId === 'string' ? { activeTaskId: raw.activeTaskId } : {}),
    ...(typeof raw.lastTaskId === 'string' ? { lastTaskId: raw.lastTaskId } : {}),
    status,
    ...(typeof raw.error === 'string' ? { error: raw.error } : {}),
    revision: Math.max(0, Math.trunc(numberValue(raw.revision, 0)))
  };
}

export function normalizeStoryboardDocument(
  value: unknown,
  options: { ownerId: string; now?: string }
): StoryboardDocument {
  const raw = asRecord(value);
  const defaults = createEmptyStoryboardDocument({ now: options.now });
  return {
    ...raw,
    schemaVersion: numberValue(raw.schemaVersion, STORYBOARD_DOCUMENT_SCHEMA_VERSION),
    sourceScriptNodeId: stringValue(raw.sourceScriptNodeId),
    shots: Array.isArray(raw.shots)
      ? raw.shots.map((shot, index) => normalizeStoryboardShot(shot, index, options.ownerId))
      : [],
    selectedImageModel: stringValue(raw.selectedImageModel, defaults.selectedImageModel),
    ...(typeof raw.selectedVideoModel === 'string' ? { selectedVideoModel: raw.selectedVideoModel } : {}),
    ...(raw.compositeImageUrl === null || typeof raw.compositeImageUrl === 'string'
      ? { compositeImageUrl: raw.compositeImageUrl as string | null }
      : {}),
    revision: Math.max(0, Math.trunc(numberValue(raw.revision, 0))),
    ...(raw.generatedBy ? { generatedBy: { ...asRecord(raw.generatedBy) } as StoryboardDocument['generatedBy'] } : {}),
    createdAt: stringValue(raw.createdAt, defaults.createdAt),
    updatedAt: stringValue(raw.updatedAt, defaults.updatedAt)
  };
}
```

- [ ] **Step 5: Add the nested fields to NodeData and strongly type storyContext**

In `src/types.ts`, import the domain types and replace the inline weak story context:

```ts
import type {
  LegacyStoryContext,
  ScriptDocument,
  StoryboardDocument
} from './domain/storyboard/storyboardTypes.ts';
```

Add to `NodeData` after task references:

```ts
  scriptData?: ScriptDocument;
  storyboardData?: StoryboardDocument;
```

Change `NodeGroup.storyContext` to:

```ts
  storyContext?: LegacyStoryContext;
```

- [ ] **Step 6: Run the focused test and typecheck**

Run:

```powershell
node --experimental-strip-types --test src/utils/storyboardDomain.test.ts
npm run typecheck
```

Expected: both commands PASS.

- [ ] **Step 7: Commit the domain foundation**

```powershell
git add src/domain/storyboard/storyboardTypes.ts src/domain/storyboard/storyboardDocuments.ts src/utils/storyboardDomain.test.ts src/types.ts
git commit -m "feat: add persistent storyboard domain documents"
```

## Task 2: Register Script And Storyboard Ports

**Files:**

- Modify: `src/types.ts`
- Modify: `src/utils/nodeTypeHelpers.ts`
- Modify: `src/domain/nodes/nodeDefinition.ts`
- Modify: `src/domain/nodes/nodeRegistry.ts`
- Modify: `src/domain/graph/graphTypes.ts`
- Modify: `src/domain/graph/edgeMigration.ts`
- Modify: `src/domain/graph/connectionRules.ts`
- Modify: `src/utils/nodeRegistry.test.ts`
- Modify: `src/utils/nodePorts.test.ts`
- Modify: `src/utils/connectionRules.test.ts`

- [ ] **Step 1: Extend the failing registry and connection tests**

In `src/utils/nodeRegistry.test.ts`, add `脚本` to `NODE_TYPES` immediately before `分镜管理器`, then add:

```ts
test('script and storyboard defaults contain fresh persistent documents', () => {
  const firstScript = createDefaultNodeData('脚本' as NodeType);
  const secondScript = createDefaultNodeData('脚本' as NodeType);
  const storyboard = createDefaultNodeData('分镜管理器' as NodeType);

  assert.equal(firstScript.model, 'auto-text');
  assert.equal(firstScript.scriptData?.sourceText, '');
  assert.notEqual(firstScript.scriptData, secondScript.scriptData);
  assert.equal(storyboard.model, 'auto-storyboard');
  assert.deepEqual(storyboard.storyboardData?.shots, []);
});
```

In `src/utils/connectionRules.test.ts`, add:

```ts
test('TEXT to SCRIPT and SCRIPT to STORYBOARD resolve through typed ports', () => {
  const textToScript = resolveConnectionPorts(node('text', '文本'), node('script', '脚本'), []);
  assert.equal(textToScript.valid, true);
  if (textToScript.valid) {
    assert.equal(textToScript.sourcePort.id, 'text-output');
    assert.equal(textToScript.targetPort.id, 'text-input');
  }

  const scriptToStoryboard = resolveConnectionPorts(
    node('script', '脚本'),
    node('storyboard', '分镜管理器'),
    []
  );
  assert.equal(scriptToStoryboard.valid, true);
  if (scriptToStoryboard.valid) {
    assert.equal(scriptToStoryboard.sourcePort.id, 'script-output');
    assert.equal(scriptToStoryboard.targetPort.id, 'script-input');
  }
});

test('IMAGE cannot connect to STORYBOARD', () => {
  assert.equal(
    resolveConnectionPorts(node('image', '图片'), node('storyboard', '分镜管理器'), []).valid,
    false
  );
});
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run:

```powershell
node --experimental-strip-types --test src/utils/nodeRegistry.test.ts src/utils/nodePorts.test.ts src/utils/connectionRules.test.ts
```

Expected: FAIL because `脚本` is not registered and `script` is not a PortDataType.

- [ ] **Step 3: Add the new enum, alias, icon key, and port type**

In `src/types.ts`, add without changing existing values:

```ts
  SCRIPT = '脚本',
```

In `src/utils/nodeTypeHelpers.ts`, add a `SCRIPT` constant, English alias, and self alias:

```ts
const SCRIPT = '\u811a\u672c' as NodeType;
```

```ts
  Script: SCRIPT,
  [SCRIPT]: SCRIPT,
```

In `src/domain/nodes/nodeDefinition.ts`, add `'script'` to `NodeIconKey`.

In `src/domain/graph/graphTypes.ts`, change the union to:

```ts
export type PortDataType = 'text' | 'image' | 'video' | 'audio' | 'script' | 'storyboard' | 'any';
```

In `src/domain/graph/edgeMigration.ts`, add `'script'` to `PORT_DATA_TYPES`.

- [ ] **Step 4: Register ScriptNode and activate StoryboardNode**

In `src/domain/nodes/nodeRegistry.ts`, import the empty document factories and add `SCRIPT` to `TYPES`:

```ts
import {
  createEmptyScriptDocument,
  createEmptyStoryboardDocument
} from '../storyboard/storyboardDocuments.ts';
```

```ts
  SCRIPT: '脚本' as NodeType,
```

Insert this definition before STORYBOARD:

```ts
  {
    type: TYPES.SCRIPT,
    label: '脚本',
    icon: 'script',
    category: 'story',
    description: '持久化故事、剧本和视觉设定',
    defaultData: () => ({
      ...genericDefaults(),
      model: 'auto-text',
      scriptData: createEmptyScriptDocument()
    }),
    capabilities: { acceptsPrompt: true, supportsGeneration: true },
    ports: [
      { id: 'text-input', label: '故事文本', direction: 'input', dataType: 'text', maxConnections: 1, role: 'source-text' },
      { id: 'script-output', label: '脚本', direction: 'output', dataType: 'script', multiple: true, role: 'script' }
    ]
  },
```

Replace the STORYBOARD default and ports with:

```ts
    defaultData: () => ({
      ...genericDefaults(),
      model: 'auto-storyboard',
      storyboardData: createEmptyStoryboardDocument()
    }),
    capabilities: { supportsGeneration: true, supportsEditor: true },
    ports: [
      { id: 'script-input', label: '脚本', direction: 'input', dataType: 'script', required: true, maxConnections: 1, role: 'script' },
      { id: 'storyboard-output', label: '分镜', direction: 'output', dataType: 'storyboard', multiple: true, role: 'storyboard' }
    ]
```

- [ ] **Step 5: Add automatic port resolution**

In `resolveConnectionPorts` before the current text/image branches, add:

```ts
  if (sourceType === '文本' && targetType === '脚本') {
    return resolved(sourceNode, 'text-output', targetNode, 'text-input');
  }

  if (sourceType === '脚本' && targetType === '分镜管理器') {
    return resolved(sourceNode, 'script-output', targetNode, 'script-input');
  }
```

Change the existing text branch allowed targets so Script is handled only by the explicit rule and all prior targets remain unchanged.

- [ ] **Step 6: Run focused graph tests and typecheck**

Run:

```powershell
node --experimental-strip-types --test src/utils/nodeRegistry.test.ts src/utils/nodePorts.test.ts src/utils/connectionRules.test.ts src/utils/edgeMigration.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit the registered story nodes**

```powershell
git add src/types.ts src/utils/nodeTypeHelpers.ts src/domain/nodes/nodeDefinition.ts src/domain/nodes/nodeRegistry.ts src/domain/graph/graphTypes.ts src/domain/graph/edgeMigration.ts src/domain/graph/connectionRules.ts src/utils/nodeRegistry.test.ts src/utils/nodePorts.test.ts src/utils/connectionRules.test.ts
git commit -m "feat: register script and storyboard node ports"
```

## Task 3: Upgrade Workflow Migration To Schema Version 5

**Files:**

- Modify: `src/domain/storyboard/storyboardDocuments.ts`
- Modify: `src/domain/workflow/workflowSchema.ts`
- Modify: `src/domain/workflow/migrateWorkflow.ts`
- Modify: `src/utils/workflowMigration.test.ts`
- Create: `test/fixtures/workflows/workflow-script-storyboard-v4.json`

- [ ] **Step 1: Add failing schema, idempotence, and unknown-field tests**

Create `test/fixtures/workflows/workflow-script-storyboard-v4.json`:

```json
{
  "schemaVersion": 4,
  "id": "story-workflow",
  "title": "Persistent Story",
  "nodes": [
    {
      "id": "script-1",
      "type": "脚本",
      "x": 0,
      "y": 0,
      "prompt": "A lighthouse wakes at midnight",
      "status": "idle",
      "model": "auto-text",
      "aspectRatio": "Auto",
      "resolution": "Auto",
      "parentIds": [],
      "scriptData": {
        "sourceText": "A lighthouse wakes at midnight",
        "futureScript": true
      }
    },
    {
      "id": "storyboard-1",
      "type": "分镜管理器",
      "x": 440,
      "y": 0,
      "prompt": "",
      "status": "idle",
      "model": "auto-storyboard",
      "aspectRatio": "Auto",
      "resolution": "Auto",
      "parentIds": ["script-1"],
      "storyboardData": {
        "sourceScriptNodeId": "script-1",
        "shots": [
          {
            "description": "The dark lens begins to glow",
            "cameraAngle": "Wide shot",
            "mood": "Mysterious",
            "futureShot": "kept"
          }
        ],
        "futureStoryboard": 9
      }
    }
  ],
  "edges": [
    {
      "schemaVersion": 1,
      "id": "edge-script-storyboard",
      "sourceNodeId": "script-1",
      "sourcePortId": "script-output",
      "targetNodeId": "storyboard-1",
      "targetPortId": "script-input",
      "dataType": "script"
    }
  ],
  "groups": [],
  "viewport": { "x": 0, "y": 0, "zoom": 1 }
}
```

Append to `src/utils/workflowMigration.test.ts`:

```ts
test('story documents migrate to schema version 5 without losing unknown fields', () => {
  const once = migrateWorkflow(fixture('workflow-script-storyboard-v4.json'));
  const twice = migrateWorkflow(once);
  const script = once.nodes.find(node => node.id === 'script-1');
  const storyboard = once.nodes.find(node => node.id === 'storyboard-1');

  assert.equal(once.schemaVersion, 5);
  assert.equal(script?.scriptData?.schemaVersion, 1);
  assert.equal((script?.scriptData as Record<string, unknown>).futureScript, true);
  assert.equal(storyboard?.storyboardData?.shots[0].id, 'legacy-shot-storyboard-1-1');
  assert.equal(
    (storyboard?.storyboardData?.shots[0] as unknown as Record<string, unknown>).futureShot,
    'kept'
  );
  assert.equal(once.edges[0].dataType, 'script');
  assert.deepEqual(twice, once);
});

test('legacy storyboard groups gain normalized shots without visible node creation', () => {
  const migrated = migrateWorkflow(fixture('legacy-storyboard-group.json'));

  assert.equal(migrated.nodes.length, 1);
  assert.equal(migrated.groups[0].storyContext?.scripts[0].id, 'legacy-shot-storyboard-group-1');
  assert.equal(migrated.groups[0].storyContext?.scripts[0].order, 0);
});
```

Update the existing task-aware assertion from `4` to `CURRENT_WORKFLOW_SCHEMA_VERSION`.

- [ ] **Step 2: Run the migration tests and verify failure**

Run:

```powershell
node --experimental-strip-types --test src/utils/workflowMigration.test.ts
```

Expected: FAIL because the current schema is 4 and story documents are not normalized.

- [ ] **Step 3: Add legacy context normalization helpers**

In `storyboardDocuments.ts`, add exports that reuse `normalizeStoryboardShot`:

```ts
import type {
  LegacyStoryContext,
  StoryboardSessionSnapshot
} from './storyboardTypes.ts';

export function normalizeLegacyStoryContext(
  value: unknown,
  options: { ownerId: string }
): LegacyStoryContext {
  const raw = asRecord(value);
  return {
    ...raw,
    story: stringValue(raw.story),
    scripts: Array.isArray(raw.scripts)
      ? raw.scripts.map((shot, index) => normalizeStoryboardShot(shot, index, options.ownerId))
      : [],
    ...(Array.isArray(raw.selectedCharacters)
      ? { selectedCharacters: raw.selectedCharacters.map(normalizeReferenceAsset) }
      : {}),
    ...(typeof raw.sceneCount === 'number' ? { sceneCount: raw.sceneCount } : {}),
    ...(typeof raw.styleAnchor === 'string' ? { styleAnchor: raw.styleAnchor } : {}),
    ...(raw.characterDNA ? {
      characterDNA: Object.fromEntries(
        Object.entries(asRecord(raw.characterDNA)).map(([key, item]) => [key, stringValue(item)])
      )
    } : {}),
    ...(raw.compositeImageUrl === null || typeof raw.compositeImageUrl === 'string'
      ? { compositeImageUrl: raw.compositeImageUrl as string | null }
      : {}),
    ...(typeof raw.selectedImageModel === 'string' ? { selectedImageModel: raw.selectedImageModel } : {}),
    ...(typeof raw.scriptNodeId === 'string' ? { scriptNodeId: raw.scriptNodeId } : {}),
    ...(typeof raw.storyboardNodeId === 'string' ? { storyboardNodeId: raw.storyboardNodeId } : {})
  };
}

export function sessionFromLegacyStoryContext(context: LegacyStoryContext): StoryboardSessionSnapshot {
  return {
    story: context.story,
    scripts: context.scripts.map(shot => ({ ...shot })),
    selectedCharacters: (context.selectedCharacters || []).map(asset => ({ ...asset })),
    sceneCount: context.sceneCount || Math.max(1, context.scripts.length || 3),
    styleAnchor: context.styleAnchor || '',
    characterDNA: { ...(context.characterDNA || {}) },
    selectedImageModel: context.selectedImageModel || 'gpt-image-2',
    compositeImageUrl: context.compositeImageUrl || null
  };
}
```

- [ ] **Step 4: Bump workflow schema and normalize nested story data**

In `workflowSchema.ts` set:

```ts
export const CURRENT_WORKFLOW_SCHEMA_VERSION = 5;
```

In `migrateWorkflow.ts`, import the story normalizers. After `normalizeLegacyNodeTakes`, return a new node with `scriptData` or `storyboardData` normalized according to its type:

```ts
  const takeNormalized = normalizeLegacyNodeTakes(node);
  if (String(takeNormalized.type) === '脚本') {
    return {
      ...takeNormalized,
      scriptData: normalizeScriptDocument(takeNormalized.scriptData)
    };
  }
  if (String(takeNormalized.type) === '分镜管理器') {
    return {
      ...takeNormalized,
      storyboardData: normalizeStoryboardDocument(takeNormalized.storyboardData, {
        ownerId: takeNormalized.id
      })
    };
  }
  return takeNormalized;
```

Replace the inline `storyContext` normalization in `migrateGroup` with:

```ts
    ...(hasStoryContext
      ? { storyContext: normalizeLegacyStoryContext(storyContext, { ownerId: String(group.id || `legacy-group-${index + 1}`) }) }
      : {})
```

- [ ] **Step 5: Run migration and graph regression tests**

Run:

```powershell
node --experimental-strip-types --test src/utils/workflowMigration.test.ts src/utils/edgeMigration.test.ts src/utils/nodeTypeHelpers.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit schema version 5 migration**

```powershell
git add src/domain/storyboard/storyboardDocuments.ts src/domain/workflow/workflowSchema.ts src/domain/workflow/migrateWorkflow.ts src/utils/workflowMigration.test.ts test/fixtures/workflows/workflow-script-storyboard-v4.json
git commit -m "feat: migrate workflows to persistent story documents"
```

## Task 4: Add Draft Graph And Legacy Group Compatibility

**Files:**

- Create: `src/domain/storyboard/storyboardGraph.ts`
- Create: `src/domain/nodes/nodeUpdates.ts`
- Create: `src/utils/storyboardGraph.test.ts`
- Modify: `src/domain/storyboard/storyboardDocuments.ts`
- Modify: `src/hooks/useNodeManagement.ts`
- Modify: `src/hooks/useWorkflow.ts`

- [ ] **Step 1: Write failing graph creation and compatibility tests**

Create `src/utils/storyboardGraph.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import type { NodeData, NodeGroup } from '../types.ts';
import { createDefaultNodeData } from '../domain/nodes/nodeRegistry.ts';
import {
  attachImageNodesToShots,
  attachVideoNodesToShots,
  buildStoryboardMediaProjectionUpdates,
  createStoryboardDraftGraph,
  ensureStoryboardNodePair,
  getEffectiveStoryContext,
  materializeLegacyStoryboardGroup,
  syncLegacyStoryboardContexts
} from '../domain/storyboard/storyboardGraph.ts';
import { applyNodeUpdateMap } from '../domain/nodes/nodeUpdates.ts';

const NOW = '2026-07-14T00:00:00.000Z';
const IDS = ['script-1', 'storyboard-1', 'edge-1'];

function nextId(): string {
  const id = IDS.shift();
  assert.ok(id);
  return id;
}

test('draft creation adds one script, one storyboard, and one typed edge', () => {
  const result = createStoryboardDraftGraph({
    nodes: [],
    edges: [],
    center: { x: 500, y: 300 },
    session: {
      story: 'A city wakes under the sea',
      scripts: [],
      selectedCharacters: [],
      sceneCount: 3,
      styleAnchor: '',
      characterDNA: {},
      selectedImageModel: 'gpt-image-2',
      compositeImageUrl: null
    },
    idFactory: nextId,
    now: NOW
  });

  assert.equal(result.nodes.length, 2);
  assert.equal(result.edges.length, 1);
  assert.equal(result.scriptNodeId, 'script-1');
  assert.equal(result.storyboardNodeId, 'storyboard-1');
  assert.equal(result.edges[0].sourcePortId, 'script-output');
  assert.equal(result.edges[0].targetPortId, 'script-input');
  assert.equal(result.edges[0].dataType, 'script');
  assert.deepEqual(result.nodes.find(node => node.id === 'storyboard-1')?.parentIds, ['script-1']);
});

test('a manually created script node gains only the missing storyboard partner', () => {
  const scriptNode = {
    ...createDefaultNodeData('脚本' as NodeData['type']),
    id: 'script-only',
    x: 10,
    y: 20,
    parentIds: []
  } as NodeData;
  const ids = ['storyboard-added', 'edge-added'];
  const result = ensureStoryboardNodePair({
    nodes: [scriptNode],
    edges: [],
    scriptNodeId: 'script-only',
    center: { x: 0, y: 0 },
    session: {
      story: 'Manual script',
      scripts: [],
      selectedCharacters: [],
      sceneCount: 3,
      styleAnchor: '',
      characterDNA: {},
      selectedImageModel: 'gpt-image-2',
      compositeImageUrl: null
    },
    idFactory: () => ids.shift() || 'unexpected',
    now: NOW
  });

  assert.equal(result.nodes.filter(node => node.type === '脚本').length, 1);
  assert.equal(result.storyboardNodeId, 'storyboard-added');
  assert.equal(result.edges[0].sourceNodeId, 'script-only');
});

test('legacy materialization is lazy and idempotent', () => {
  const group: NodeGroup = {
    id: 'legacy-group',
    nodeIds: ['image-1'],
    label: 'Legacy storyboard',
    storyContext: {
      story: 'A tiny adventure',
      scripts: [{
        id: 'legacy-shot-1',
        order: 0,
        sceneNumber: 1,
        description: 'A fox enters a library',
        cameraAngle: 'Wide shot',
        mood: 'Curious',
        status: 'draft',
        revision: 0
      }]
    }
  };
  const idValues = ['script-new', 'storyboard-new', 'edge-new'];
  const first = materializeLegacyStoryboardGroup({
    group,
    nodes: [],
    edges: [],
    anchor: { x: 0, y: 0 },
    idFactory: () => idValues.shift() || 'unexpected',
    now: NOW
  });
  const second = materializeLegacyStoryboardGroup({
    group: first.group,
    nodes: first.nodes,
    edges: first.edges,
    anchor: { x: 0, y: 0 },
    idFactory: () => 'must-not-be-used',
    now: NOW
  });

  assert.equal(first.nodes.length, 2);
  assert.equal(first.group.storyContext?.scriptNodeId, 'script-new');
  assert.equal(first.group.storyContext?.storyboardNodeId, 'storyboard-new');
  assert.deepEqual(second, first);
});

test('new documents project to legacy context and media ids attach by shot order', () => {
  const created = createStoryboardDraftGraph({
    nodes: [],
    edges: [],
    center: { x: 0, y: 0 },
    session: {
      story: 'A mountain opens',
      scripts: [{
        id: 'shot-1',
        order: 0,
        sceneNumber: 1,
        description: 'Stone doors separate',
        cameraAngle: 'Low angle',
        mood: 'Epic',
        status: 'ready',
        revision: 0
      }],
      selectedCharacters: [],
      sceneCount: 1,
      styleAnchor: 'cinematic',
      characterDNA: {},
      selectedImageModel: 'gpt-image-2',
      compositeImageUrl: null
    },
    idFactory: (() => {
      const ids = ['script-a', 'storyboard-a', 'edge-a'];
      return () => ids.shift() || 'unexpected';
    })(),
    now: NOW
  });
  const script = created.nodes.find(node => node.id === 'script-a');
  const storyboard = created.nodes.find(node => node.id === 'storyboard-a');
  assert.ok(script?.scriptData && storyboard?.storyboardData);

  const withImage = attachImageNodesToShots(storyboard.storyboardData, ['image-a'], NOW);
  const withVideo = attachVideoNodesToShots(withImage, new Map([['image-a', 'video-a']]), NOW);
  const group: NodeGroup = {
    id: 'group-a',
    nodeIds: ['image-a'],
    label: 'Storyboard',
    storyContext: {
      story: '',
      scripts: [],
      scriptNodeId: 'script-a',
      storyboardNodeId: 'storyboard-a'
    }
  };
  const nodes = created.nodes.map(node => node.id === 'storyboard-a'
    ? { ...node, storyboardData: withVideo }
    : node);
  const synced = syncLegacyStoryboardContexts(nodes, [group]);
  const effective = getEffectiveStoryContext(synced[0], nodes);

  assert.equal(withVideo.shots[0].imageNodeId, 'image-a');
  assert.equal(withVideo.shots[0].videoNodeId, 'video-a');
  assert.equal(effective.story, 'A mountain opens');
  assert.equal(effective.scripts[0].videoNodeId, 'video-a');
});

test('node update maps apply all matching updates in one pure pass', () => {
  const nodes = [{ id: 'a', prompt: 'old-a' }, { id: 'b', prompt: 'old-b' }] as NodeData[];
  const updated = applyNodeUpdateMap(nodes, {
    a: { prompt: 'new-a' },
    b: { prompt: 'new-b' }
  });

  assert.deepEqual(updated.map(node => node.prompt), ['new-a', 'new-b']);
  assert.equal(nodes[0].prompt, 'old-a');
});

test('shot task projections follow linked media nodes and clear dangling ids', () => {
  const storyboard = {
    ...createDefaultNodeData('分镜管理器' as NodeData['type']),
    id: 'storyboard-status',
    x: 0,
    y: 0,
    parentIds: [],
    storyboardData: {
      ...createDefaultNodeData('分镜管理器' as NodeData['type']).storyboardData!,
      shots: [{
        id: 'shot-status',
        order: 0,
        sceneNumber: 1,
        description: 'A generated shot',
        cameraAngle: 'Wide shot',
        mood: '',
        imageNodeId: 'missing-image',
        videoNodeId: 'video-status',
        status: 'video-running' as const,
        revision: 0
      }]
    }
  } as NodeData;
  const video = {
    ...createDefaultNodeData('视频' as NodeData['type']),
    id: 'video-status',
    x: 0,
    y: 0,
    parentIds: [],
    status: 'success' as NodeData['status'],
    lastTaskId: 'video-task'
  } as NodeData;
  const updates = buildStoryboardMediaProjectionUpdates([storyboard, video], NOW);
  const shot = updates['storyboard-status'].storyboardData?.shots[0];

  assert.equal(shot?.status, 'video-ready');
  assert.equal(shot?.lastTaskId, 'video-task');
  assert.equal(shot?.imageNodeId, undefined);
  assert.equal(updates['storyboard-status'].storyboardData?.revision, 0);
});
```

- [ ] **Step 2: Run the test and verify the new modules are missing**

Run:

```powershell
node --experimental-strip-types --test src/utils/storyboardGraph.test.ts
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Add session/document projection functions**

In `storyboardDocuments.ts`, add:

```ts
import type { LegacyStoryContext, StoryboardSessionSnapshot } from './storyboardTypes.ts';

export function documentsFromSession(options: {
  session: StoryboardSessionSnapshot;
  scriptNodeId: string;
  storyboardNodeId: string;
  now: string;
}): { scriptData: ScriptDocument; storyboardData: StoryboardDocument } {
  const { session, scriptNodeId, storyboardNodeId, now } = options;
  return {
    scriptData: {
      ...createEmptyScriptDocument({ sourceText: session.story, now }),
      synopsis: session.story,
      styleAnchor: session.styleAnchor,
      characterDNA: { ...session.characterDNA },
      referenceAssets: session.selectedCharacters.map(asset => ({ ...asset }))
    },
    storyboardData: {
      ...createEmptyStoryboardDocument({
        sourceScriptNodeId: scriptNodeId,
        selectedImageModel: session.selectedImageModel,
        now
      }),
      shots: session.scripts.map((shot, index) => normalizeStoryboardShot(shot, index, storyboardNodeId)),
      compositeImageUrl: session.compositeImageUrl
    }
  };
}

export function legacyStoryContextFromDocuments(
  scriptData: ScriptDocument,
  storyboardData: StoryboardDocument,
  ids: { scriptNodeId: string; storyboardNodeId: string }
): LegacyStoryContext {
  return {
    story: scriptData.sourceText || scriptData.synopsis,
    scripts: storyboardData.shots.map(shot => ({ ...shot })),
    selectedCharacters: scriptData.referenceAssets.map(asset => ({ ...asset })),
    sceneCount: storyboardData.shots.length,
    styleAnchor: scriptData.styleAnchor,
    characterDNA: { ...scriptData.characterDNA },
    compositeImageUrl: storyboardData.compositeImageUrl || null,
    selectedImageModel: storyboardData.selectedImageModel,
    scriptNodeId: ids.scriptNodeId,
    storyboardNodeId: ids.storyboardNodeId
  };
}
```

- [ ] **Step 4: Implement pure graph compatibility helpers**

Create `src/domain/storyboard/storyboardGraph.ts` with these exports and use `syncLegacyParentIds` after adding the Edge:

```ts
import type { NodeData, NodeGroup } from '../../types.ts';
import type { CanvasEdge } from '../graph/graphTypes.ts';
import { CURRENT_EDGE_SCHEMA_VERSION } from '../graph/graphTypes.ts';
import { syncLegacyParentIds } from '../graph/edgeMigration.ts';
import { createDefaultNodeData } from '../nodes/nodeRegistry.ts';
import {
  documentsFromSession,
  legacyStoryContextFromDocuments,
  normalizeLegacyStoryContext,
  sessionFromLegacyStoryContext
} from './storyboardDocuments.ts';
import type { StoryboardDocument, StoryboardSessionSnapshot } from './storyboardTypes.ts';
import type { NodeUpdateMap } from '../nodes/nodeUpdates.ts';

interface GraphResult {
  nodes: NodeData[];
  edges: CanvasEdge[];
  scriptNodeId: string;
  storyboardNodeId: string;
}

export function createStoryboardDraftGraph(options: {
  nodes: NodeData[];
  edges: CanvasEdge[];
  center: { x: number; y: number };
  session: StoryboardSessionSnapshot;
  idFactory?: () => string;
  now?: string;
}): GraphResult {
  const idFactory = options.idFactory || (() => crypto.randomUUID());
  const now = options.now || new Date().toISOString();
  const scriptNodeId = idFactory();
  const storyboardNodeId = idFactory();
  const edgeId = idFactory();
  const documents = documentsFromSession({
    session: options.session,
    scriptNodeId,
    storyboardNodeId,
    now
  });
  const scriptNode: NodeData = {
    ...createDefaultNodeData('脚本' as NodeData['type']),
    id: scriptNodeId,
    title: '故事脚本',
    x: options.center.x - 420,
    y: options.center.y,
    prompt: options.session.story,
    parentIds: [],
    scriptData: documents.scriptData
  };
  const storyboardNode: NodeData = {
    ...createDefaultNodeData('分镜管理器' as NodeData['type']),
    id: storyboardNodeId,
    title: '分镜管理器',
    x: options.center.x + 20,
    y: options.center.y,
    parentIds: [],
    storyboardData: documents.storyboardData
  };
  const edge: CanvasEdge = {
    schemaVersion: CURRENT_EDGE_SCHEMA_VERSION,
    id: edgeId,
    sourceNodeId: scriptNodeId,
    sourcePortId: 'script-output',
    targetNodeId: storyboardNodeId,
    targetPortId: 'script-input',
    dataType: 'script',
    createdAt: now
  };
  const edges = [...options.edges, edge];
  const nodes = syncLegacyParentIds([...options.nodes, scriptNode, storyboardNode], edges);
  return { nodes, edges, scriptNodeId, storyboardNodeId };
}

export function ensureStoryboardNodePair(options: {
  nodes: NodeData[];
  edges: CanvasEdge[];
  scriptNodeId?: string | null;
  storyboardNodeId?: string | null;
  center: { x: number; y: number };
  session: StoryboardSessionSnapshot;
  idFactory?: () => string;
  now?: string;
}): GraphResult {
  const idFactory = options.idFactory || (() => crypto.randomUUID());
  const now = options.now || new Date().toISOString();
  const existingScript = options.scriptNodeId
    ? options.nodes.find(node => node.id === options.scriptNodeId && String(node.type) === '脚本')
    : undefined;
  const existingStoryboard = options.storyboardNodeId
    ? options.nodes.find(node => node.id === options.storyboardNodeId && String(node.type) === '分镜管理器')
    : undefined;

  if (!existingScript && !existingStoryboard) {
    return createStoryboardDraftGraph({ ...options, idFactory, now });
  }

  const scriptNodeId = existingScript?.id || idFactory();
  const storyboardNodeId = existingStoryboard?.id || idFactory();
  const documents = documentsFromSession({
    session: options.session,
    scriptNodeId,
    storyboardNodeId,
    now
  });
  const scriptNode = existingScript || {
    ...createDefaultNodeData('脚本' as NodeData['type']),
    id: scriptNodeId,
    title: '故事脚本',
    x: existingStoryboard ? existingStoryboard.x - 440 : options.center.x - 420,
    y: existingStoryboard ? existingStoryboard.y : options.center.y,
    prompt: options.session.story,
    parentIds: [],
    scriptData: documents.scriptData
  };
  const storyboardNode = existingStoryboard ? {
    ...existingStoryboard,
    storyboardData: {
      ...(existingStoryboard.storyboardData || documents.storyboardData),
      sourceScriptNodeId: scriptNodeId
    }
  } : {
    ...createDefaultNodeData('分镜管理器' as NodeData['type']),
    id: storyboardNodeId,
    title: '分镜管理器',
    x: scriptNode.x + 440,
    y: scriptNode.y,
    parentIds: [],
    storyboardData: documents.storyboardData
  };
  const hasEdge = options.edges.some(edge =>
    edge.sourceNodeId === scriptNodeId &&
    edge.sourcePortId === 'script-output' &&
    edge.targetNodeId === storyboardNodeId &&
    edge.targetPortId === 'script-input'
  );
  const edges = hasEdge ? options.edges : [...options.edges, {
    schemaVersion: CURRENT_EDGE_SCHEMA_VERSION,
    id: idFactory(),
    sourceNodeId: scriptNodeId,
    sourcePortId: 'script-output',
    targetNodeId: storyboardNodeId,
    targetPortId: 'script-input',
    dataType: 'script',
    createdAt: now
  }];
  const replacements = new Map([
    [scriptNodeId, scriptNode],
    [storyboardNodeId, storyboardNode]
  ]);
  const existingIds = new Set(options.nodes.map(node => node.id));
  const nodes = syncLegacyParentIds([
    ...options.nodes.map(node => replacements.get(node.id) || node),
    ...[scriptNode, storyboardNode].filter(node => !existingIds.has(node.id))
  ], edges);
  return { nodes, edges, scriptNodeId, storyboardNodeId };
}

export function materializeLegacyStoryboardGroup(options: {
  group: NodeGroup;
  nodes: NodeData[];
  edges: CanvasEdge[];
  anchor: { x: number; y: number };
  idFactory?: () => string;
  now?: string;
}): GraphResult & { group: NodeGroup } {
  const context = normalizeLegacyStoryContext(options.group.storyContext, { ownerId: options.group.id });
  const created = ensureStoryboardNodePair({
    nodes: options.nodes,
    edges: options.edges,
    scriptNodeId: context.scriptNodeId,
    storyboardNodeId: context.storyboardNodeId,
    center: options.anchor,
    session: sessionFromLegacyStoryContext(context),
    idFactory: options.idFactory,
    now: options.now
  });
  return {
    ...created,
    group: {
      ...options.group,
      storyContext: {
        ...context,
        scriptNodeId: created.scriptNodeId,
        storyboardNodeId: created.storyboardNodeId
      }
    }
  };
}

export function getEffectiveStoryContext(group: NodeGroup, nodes: NodeData[]) {
  const fallback = normalizeLegacyStoryContext(group.storyContext, { ownerId: group.id });
  const script = nodes.find(node => node.id === fallback.scriptNodeId)?.scriptData;
  const storyboard = nodes.find(node => node.id === fallback.storyboardNodeId)?.storyboardData;
  return script && storyboard
    ? legacyStoryContextFromDocuments(script, storyboard, {
        scriptNodeId: fallback.scriptNodeId!,
        storyboardNodeId: fallback.storyboardNodeId!
      })
    : fallback;
}

export function syncLegacyStoryboardContexts(nodes: NodeData[], groups: NodeGroup[]): NodeGroup[] {
  return groups.map(group => group.storyContext
    ? { ...group, storyContext: getEffectiveStoryContext(group, nodes) }
    : group);
}

export function attachImageNodesToShots(
  document: StoryboardDocument,
  imageNodeIds: string[],
  now = new Date().toISOString()
): StoryboardDocument {
  return {
    ...document,
    shots: document.shots.map((shot, index) => imageNodeIds[index]
      ? { ...shot, imageNodeId: imageNodeIds[index], status: 'image-running', error: undefined }
      : shot),
    revision: document.revision + 1,
    updatedAt: now
  };
}

export function attachVideoNodesToShots(
  document: StoryboardDocument,
  videoNodeIdByImageNodeId: Map<string, string>,
  now = new Date().toISOString()
): StoryboardDocument {
  return {
    ...document,
    shots: document.shots.map(shot => {
      const videoNodeId = shot.imageNodeId ? videoNodeIdByImageNodeId.get(shot.imageNodeId) : undefined;
      return videoNodeId
        ? { ...shot, videoNodeId, status: 'video-running', error: undefined }
        : shot;
    }),
    revision: document.revision + 1,
    updatedAt: now
  };
}

function mediaStatus(node: NodeData, kind: 'image' | 'video') {
  if (node.status === 'loading') return kind === 'video' ? 'video-running' as const : 'image-running' as const;
  if (node.status === 'error') return 'failed' as const;
  if (node.status === 'success') return kind === 'video' ? 'video-ready' as const : 'image-ready' as const;
  return kind === 'video' ? 'image-ready' as const : 'ready' as const;
}

export function buildStoryboardMediaProjectionUpdates(
  nodes: NodeData[],
  now = new Date().toISOString()
): NodeUpdateMap {
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const updates: NodeUpdateMap = {};
  for (const storyboardNode of nodes.filter(node => String(node.type) === '分镜管理器' && node.storyboardData)) {
    let changed = false;
    const shots = storyboardNode.storyboardData!.shots.map(shot => {
      const imageNode = shot.imageNodeId ? nodeById.get(shot.imageNodeId) : undefined;
      const videoNode = shot.videoNodeId ? nodeById.get(shot.videoNodeId) : undefined;
      const source = videoNode || imageNode;
      const kind = videoNode ? 'video' as const : 'image' as const;
      const next = {
        ...shot,
        ...(shot.imageNodeId && !imageNode ? { imageNodeId: undefined } : {}),
        ...(shot.videoNodeId && !videoNode ? { videoNodeId: undefined } : {}),
        ...(source ? {
          status: mediaStatus(source, kind),
          activeTaskId: source.activeTaskId,
          lastTaskId: source.lastTaskId,
          error: source.errorMessage
        } : {
          status: 'ready' as const,
          activeTaskId: undefined,
          error: undefined
        })
      };
      if (JSON.stringify(next) !== JSON.stringify(shot)) changed = true;
      return next;
    });
    if (changed) {
      updates[storyboardNode.id] = {
        storyboardData: {
          ...storyboardNode.storyboardData!,
          shots,
          updatedAt: now
        }
      };
    }
  }
  return updates;
}
```

- [ ] **Step 5: Add atomic multi-node updates to graph state**

Create `src/domain/nodes/nodeUpdates.ts`:

```ts
import type { NodeData } from '../../types.ts';

export type NodeUpdateMap = Record<string, Partial<NodeData>>;

export function applyNodeUpdateMap(nodes: NodeData[], updates: NodeUpdateMap): NodeData[] {
  return nodes.map(node => updates[node.id] ? { ...node, ...updates[node.id] } : node);
}
```

In `useNodeManagement.ts`, import it and add:

```ts
    const applyNodeUpdates = useCallback((updates: NodeUpdateMap) => {
        setNodes(previous => applyNodeUpdateMap(previous, updates));
    }, [setNodes]);
```

Return `applyNodeUpdates` beside `updateNode`.

- [ ] **Step 6: Project story contexts only when saving**

In `useWorkflow.ts`, import `syncLegacyStoryboardContexts` and change the save payload to:

```ts
            const workflow = createWorkflowData({
                id: workflowId,
                title: canvasTitle,
                nodes,
                edges,
                groups: syncLegacyStoryboardContexts(nodes, groups),
                viewport
            });
```

Do not mutate live group state during save.

- [ ] **Step 7: Run graph, workflow, and type tests**

Run:

```powershell
node --experimental-strip-types --test src/utils/storyboardGraph.test.ts src/utils/workflowMigration.test.ts src/utils/edgeMigration.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit graph compatibility**

```powershell
git add src/domain/storyboard/storyboardGraph.ts src/domain/storyboard/storyboardDocuments.ts src/domain/nodes/nodeUpdates.ts src/utils/storyboardGraph.test.ts src/hooks/useNodeManagement.ts src/hooks/useWorkflow.ts
git commit -m "feat: add storyboard graph compatibility layer"
```

## Task 5: Add Structured GenerationTask Results

**Files:**

- Modify: `src/domain/storyboard/storyboardTypes.ts`
- Modify: `src/domain/generation/generationTask.ts`
- Create: `src/domain/generation/taskResultUpdates.ts`
- Create: `src/utils/taskResultUpdates.test.ts`
- Modify: `src/services/generationService.ts`
- Modify: `src/utils/generationService.test.ts`

- [ ] **Step 1: Write failing structured-result and submission tests**

Create `src/utils/taskResultUpdates.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import type { GenerationTask } from '../domain/generation/generationTask.ts';
import { buildGenerationTaskNodeUpdates } from '../domain/generation/taskResultUpdates.ts';
import { createDefaultNodeData } from '../domain/nodes/nodeRegistry.ts';
import type { NodeData } from '../types.ts';

function nodes(): NodeData[] {
  return [
    {
      ...createDefaultNodeData('脚本' as NodeData['type']),
      id: 'script-1',
      x: 0,
      y: 0,
      parentIds: [],
      status: 'loading' as NodeData['status'],
      activeTaskId: 'task-1',
      scriptData: {
        ...createDefaultNodeData('脚本' as NodeData['type']).scriptData!,
        sourceText: 'A paper moon',
        revision: 2
      }
    },
    {
      ...createDefaultNodeData('分镜管理器' as NodeData['type']),
      id: 'storyboard-1',
      x: 440,
      y: 0,
      parentIds: ['script-1'],
      status: 'loading' as NodeData['status'],
      activeTaskId: 'task-1',
      storyboardData: {
        ...createDefaultNodeData('分镜管理器' as NodeData['type']).storyboardData!,
        sourceScriptNodeId: 'script-1',
        revision: 4
      }
    }
  ];
}

function task(overrides: Partial<GenerationTask> = {}): GenerationTask {
  return {
    schemaVersion: 1,
    taskId: 'task-1',
    workflowId: 'workflow-1',
    nodeId: 'script-1',
    operation: 'generate-story-package',
    provider: 'openai',
    model: 'gpt-4.1-mini',
    status: 'succeeded',
    progress: 100,
    inputSnapshot: {
      nodeId: 'script-1',
      storyboardNodeId: 'storyboard-1',
      scriptRevision: 2,
      storyboardRevision: 4
    },
    inputHash: 'a'.repeat(64),
    parameters: {},
    output: {
      kind: 'story-package',
      scriptRevision: 2,
      storyboardRevision: 4,
      scriptData: {
        ...nodes()[0].scriptData!,
        synopsis: 'A moon made of paper crosses the city',
        revision: 3,
        generatedBy: { taskId: 'task-1', provider: 'openai', model: 'gpt-4.1-mini' }
      },
      storyboardData: {
        ...nodes()[1].storyboardData!,
        revision: 5,
        shots: [{
          id: 'shot-1',
          order: 0,
          sceneNumber: 1,
          description: 'The moon unfolds above the skyline',
          cameraAngle: 'Wide shot',
          mood: 'Wonder',
          status: 'ready',
          revision: 0
        }],
        generatedBy: { taskId: 'task-1', provider: 'openai', model: 'gpt-4.1-mini' }
      }
    },
    attempt: 1,
    createdAt: '2026-07-14T00:00:00.000Z',
    updatedAt: '2026-07-14T00:01:00.000Z',
    completedAt: '2026-07-14T00:01:00.000Z',
    ...overrides
  };
}

test('story package success updates both nodes only when task and revisions match', () => {
  const updates = buildGenerationTaskNodeUpdates(nodes(), task());

  assert.deepEqual(Object.keys(updates).sort(), ['script-1', 'storyboard-1']);
  assert.equal(updates['script-1'].status, 'success');
  assert.equal(updates['script-1'].scriptData?.revision, 3);
  assert.equal(updates['storyboard-1'].storyboardData?.shots.length, 1);
  assert.equal(updates['storyboard-1'].activeTaskId, undefined);
});

test('a stale task returns no partial updates', () => {
  const changed = nodes();
  changed[1] = {
    ...changed[1],
    storyboardData: { ...changed[1].storyboardData!, revision: 5 }
  };

  assert.deepEqual(buildGenerationTaskNodeUpdates(changed, task()), {});
  assert.deepEqual(buildGenerationTaskNodeUpdates(nodes(), task({ taskId: 'task-old' })), {});
});

test('story package failure marks both bound nodes retryable without deleting documents', () => {
  const updates = buildGenerationTaskNodeUpdates(nodes(), task({
    status: 'failed',
    progress: 0,
    output: undefined,
    error: { code: 'PROVIDER_TIMEOUT', message: 'Timed out', retryable: true }
  }));

  assert.equal(updates['script-1'].status, 'error');
  assert.equal(updates['storyboard-1'].status, 'error');
  assert.equal(updates['script-1'].lastTaskId, 'task-1');
  assert.ok(nodes()[0].scriptData);
});
```

Append a test to `src/utils/generationService.test.ts`:

```ts
test('submitStoryPackageGeneration uses the shared task endpoint without polling', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let requestBody: Record<string, unknown> | undefined;
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body));
    return jsonResponse({
      task: {
        schemaVersion: 1,
        taskId: 'story-task',
        workflowId: 'workflow-1',
        nodeId: 'script-1',
        operation: 'generate-story-package',
        provider: 'openai',
        model: 'gpt-4.1-mini',
        status: 'queued',
        progress: 0,
        inputSnapshot: requestBody?.inputSnapshot,
        inputHash: 'a'.repeat(64),
        parameters: {},
        attempt: 1,
        createdAt: '2026-07-14T00:00:00.000Z',
        updatedAt: '2026-07-14T00:00:00.000Z'
      }
    }, 202);
  };

  const { submitStoryPackageGeneration } = await import('../services/generationService.ts');
  const task = await submitStoryPackageGeneration({
    nodeId: 'script-1',
    scriptNodeId: 'script-1',
    storyboardNodeId: 'storyboard-1',
    scriptRevision: 0,
    storyboardRevision: 0,
    generationMode: 'story-package',
    sourceText: 'A paper moon',
    sceneCount: 3,
    referenceAssets: [],
    selectedImageModel: 'gpt-image-2',
    scriptData: {} as never,
    storyboardData: {} as never
  }, { workflowId: 'workflow-1' });

  assert.equal(task.taskId, 'story-task');
  assert.equal(requestBody?.operation, 'generate-story-package');
});
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run:

```powershell
node --experimental-strip-types --test src/utils/taskResultUpdates.test.ts src/utils/generationService.test.ts
```

Expected: FAIL because structured outputs and submission helpers do not exist.

- [ ] **Step 3: Add the shared task input and output contracts**

Append to `storyboardTypes.ts`:

```ts
export type StoryPackageGenerationMode = 'scripts' | 'story-package';

export interface GenerateStoryPackageTaskInput {
  nodeId: string;
  scriptNodeId: string;
  storyboardNodeId: string;
  scriptRevision: number;
  storyboardRevision: number;
  generationMode: StoryPackageGenerationMode;
  sourceText: string;
  sceneCount: number;
  tone?: string;
  referenceAssets: StoryReferenceAsset[];
  selectedImageModel: string;
  scriptData: ScriptDocument;
  storyboardData: StoryboardDocument;
}
```

In `generationTask.ts`, replace the inline output object with:

```ts
import type {
  ScriptDocument,
  StoryboardDocument
} from '../storyboard/storyboardTypes.ts';
import type { MediaTake } from '../../types.ts';

export interface MediaGenerationTaskOutput {
  kind?: 'media';
  resultUrl: string;
  take?: MediaTake;
}

export interface StoryPackageGenerationTaskOutput {
  kind: 'story-package';
  scriptRevision: number;
  storyboardRevision: number;
  scriptData: ScriptDocument;
  storyboardData: StoryboardDocument;
}

export type GenerationTaskOutput =
  | MediaGenerationTaskOutput
  | StoryPackageGenerationTaskOutput;
```

Set `GenerationTask.output?: GenerationTaskOutput`.

- [ ] **Step 4: Implement the operation-aware pure result mapper**

Create `src/domain/generation/taskResultUpdates.ts`:

```ts
import type { NodeData } from '../../types.ts';
import type { NodeUpdateMap } from '../nodes/nodeUpdates.ts';
import type {
  GenerationTask,
  StoryPackageGenerationTaskOutput
} from './generationTask.ts';
import { buildGenerationTaskNodeUpdate } from '../../utils/generationTaskHelpers.ts';

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function isStoryOutput(value: unknown): value is StoryPackageGenerationTaskOutput {
  const output = asRecord(value);
  return output.kind === 'story-package' && Boolean(output.scriptData) && Boolean(output.storyboardData);
}

function terminalErrorUpdate(task: GenerationTask): Partial<NodeData> {
  return {
    status: 'error' as NodeData['status'],
    errorMessage: task.error?.message || (task.status === 'cancelled'
      ? 'Generation was cancelled.'
      : 'Generation failed.'),
    activeTaskId: undefined,
    lastTaskId: task.taskId,
    generationStartTime: undefined
  };
}

export function buildGenerationTaskNodeUpdates(
  nodes: NodeData[],
  task: GenerationTask
): NodeUpdateMap {
  if (task.operation !== 'generate-story-package') {
    const node = nodes.find(candidate => candidate.id === task.nodeId);
    if (!node) return {};
    const update = buildGenerationTaskNodeUpdate(node, task);
    return Object.keys(update).length > 0 ? { [node.id]: update } : {};
  }

  const input = asRecord(task.inputSnapshot);
  const storyboardNodeId = typeof input.storyboardNodeId === 'string' ? input.storyboardNodeId : '';
  const script = nodes.find(node => node.id === task.nodeId);
  const storyboard = nodes.find(node => node.id === storyboardNodeId);
  if (!script?.scriptData || !storyboard?.storyboardData) return {};
  if (script.activeTaskId !== task.taskId || storyboard.activeTaskId !== task.taskId) return {};
  if (script.scriptData.revision !== input.scriptRevision) return {};
  if (storyboard.storyboardData.revision !== input.storyboardRevision) return {};

  if (task.status === 'failed' || task.status === 'cancelled') {
    const error = terminalErrorUpdate(task);
    return { [script.id]: error, [storyboard.id]: error };
  }

  if (task.status !== 'succeeded' || !isStoryOutput(task.output)) {
    const loading = {
      status: 'loading' as NodeData['status'],
      activeTaskId: task.taskId,
      errorMessage: undefined
    };
    return { [script.id]: loading, [storyboard.id]: loading };
  }

  if (task.output.scriptRevision !== input.scriptRevision) return {};
  if (task.output.storyboardRevision !== input.storyboardRevision) return {};
  return {
    [script.id]: {
      prompt: task.output.scriptData.sourceText,
      scriptData: task.output.scriptData,
      status: 'success' as NodeData['status'],
      activeTaskId: undefined,
      lastTaskId: task.taskId,
      errorMessage: undefined,
      generationStartTime: undefined
    },
    [storyboard.id]: {
      storyboardData: task.output.storyboardData,
      status: 'success' as NodeData['status'],
      activeTaskId: undefined,
      lastTaskId: task.taskId,
      errorMessage: undefined,
      generationStartTime: undefined
    }
  };
}
```

- [ ] **Step 5: Add the story task submission service**

In `generationService.ts`, import `GenerateStoryPackageTaskInput`, extend the operation union, and add:

```ts
export const submitStoryPackageGeneration = (
  params: GenerateStoryPackageTaskInput,
  options: GenerationRequestOptions = {}
): Promise<GenerationTask> => submitGenerationTask('generate-story-package', params, options);
```

Change `submitGenerationTask` operation type to:

```ts
  operation: 'generate-image' | 'generate-video' | 'generate-local-image' | 'generate-story-package',
```

Change its `inputSnapshot` parameter union to include `GenerateStoryPackageTaskInput` explicitly:

```ts
  inputSnapshot: GenerateImageParams | GenerateVideoParams | GenerateStoryPackageTaskInput | Record<string, unknown>,
```

- [ ] **Step 6: Run task contract tests and regressions**

Run:

```powershell
node --experimental-strip-types --test src/utils/taskResultUpdates.test.ts src/utils/generationTaskHelpers.test.ts src/utils/generationService.test.ts
npm run typecheck
```

Expected: PASS and existing media task tests remain unchanged.

- [ ] **Step 7: Commit structured task support**

```powershell
git add src/domain/storyboard/storyboardTypes.ts src/domain/generation/generationTask.ts src/domain/generation/taskResultUpdates.ts src/utils/taskResultUpdates.test.ts src/services/generationService.ts src/utils/generationService.test.ts
git commit -m "feat: support structured storyboard task results"
```

## Task 6: Extract Shared Story Package Provider Logic

**Files:**

- Create: `server/services/storyboardGeneration.js`
- Create: `server/services/storyboardGeneration.test.js`
- Modify: `server/routes/storyboard.js`
- Modify: `server/services/storyboardText.test.js`

- [ ] **Step 1: Write failing provider-selection and package tests**

Create `server/services/storyboardGeneration.test.js`:

```js
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
```

- [ ] **Step 2: Run the test and verify the service is missing**

Run:

```powershell
node --test server/services/storyboardGeneration.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Create the shared provider service**

Create `server/services/storyboardGeneration.js`. Move the current `normalizeTextReferences`, OpenAI requester, Gemini requester, retry helper, and story-package provider selection from `server/routes/storyboard.js`. Expose this stable API:

```js
import { GoogleGenerativeAI } from '@google/generative-ai';
import { requestChatCompletion } from './openaiChat.js';
import { generateStoryPackage } from './storyboardText.js';

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

async function defaultOpenAIRequest(locals, messages) {
    return retryOperation(() => requestChatCompletion({
        messages,
        apiKey: locals.OPENAI_API_KEY,
        baseURL: locals.OPENAI_BASE_URL,
        model: locals.OPENAI_TEXT_MODEL,
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
            ? dependencies.requestOpenAI(messages)
            : defaultOpenAIRequest(locals, messages))
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
```

The helper above preserves the current three attempts, 2-second initial delay, and exponential backoff.

- [ ] **Step 4: Replace the package route with the shared service**

In `server/routes/storyboard.js`, remove the duplicated package provider helpers, import the service, and keep the legacy response:

```js
import {
    createOpenAIStoryboardRequester,
    generateStoryPackageWithConfiguredProvider,
    normalizeTextReferences,
    retryOperation
} from '../services/storyboardGeneration.js';
```

Remove the route-local retry helper after importing the shared export so brainstorm, optimize, composite preview, scripts, and package generation keep the same retry behavior without duplication.

Replace the two remaining `createOpenAIStoryboardRequester(req)` calls in brainstorm and optimize routes with `createOpenAIStoryboardRequester(req.app.locals)`, then remove the route-local requester factory. This preserves those endpoint responses while centralizing credential and retry handling.

Inside `/generate-story-package`:

```js
        const packageResult = await generateStoryPackageWithConfiguredProvider({
            locals: req.app.locals,
            payload: {
                story,
                sceneCount: count,
                tone,
                characterDescriptions,
                referenceImages
            }
        });
        return res.json(packageResult);
```

- [ ] **Step 5: Run package and route-adjacent service tests**

Run:

```powershell
node --test server/services/storyboardGeneration.test.js server/services/storyboardText.test.js server/services/openaiChat.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit the shared story package service**

```powershell
git add server/services/storyboardGeneration.js server/services/storyboardGeneration.test.js server/routes/storyboard.js server/services/storyboardText.test.js
git commit -m "refactor: share storyboard text provider logic"
```

## Task 7: Extract The Existing Generate-Scripts Behavior

**Files:**

- Modify: `server/services/storyboardGeneration.js`
- Modify: `server/services/storyboardGeneration.test.js`
- Modify: `server/routes/storyboard.js`

- [ ] **Step 1: Add failing tests for both scripts providers**

Append to `storyboardGeneration.test.js`:

```js
import { generateStoryboardScriptsWithConfiguredProvider } from './storyboardGeneration.js';

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
```

- [ ] **Step 2: Run the test and verify the export is missing**

Run:

```powershell
node --test server/services/storyboardGeneration.test.js
```

Expected: FAIL because `generateStoryboardScriptsWithConfiguredProvider` is not exported.

- [ ] **Step 3: Move the existing scripts algorithm into the service**

Move the implementation currently inside `router.post('/generate-scripts')` in `server/routes/storyboard.js` into `storyboardGeneration.js` under this API:

```js
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
        : await requestGeminiScriptsWithReferences(locals, payload);
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
```

Add this parser beside the service functions:

```js
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
```

Create private `requestGeminiScriptsWithReferences(locals, payload)` by extracting `server/routes/storyboard.js:217-404` into the service with these exact mechanical substitutions:

- Replace `req.app.locals.GEMINI_API_KEY` with `locals.GEMINI_API_KEY`.
- Replace the dynamic `resolveImageToBase64` import with a top-level import from `../utils/imageHelpers.js`.
- Read `story`, `characterDescriptions`, `sceneCount`, `referenceImages`, and `characterImages` from `payload`.
- Keep the categorized Character/Scene/Item/Style labels and the full current system prompt byte-for-byte.
- Keep both `referenceImages` and legacy `characterImages` branches.
- Replace `model.generateContent(promptParts)` with `retryOperation(() => model.generateContent(promptParts))`.
- Return `result.response.text()` at the end.
- Replace every route-level error response with a thrown `Error`; the public function maps those errors to the existing route response.

The extracted private function must not import Express or reference `req`/`res`.

- [ ] **Step 4: Reduce the legacy route to validation and response mapping**

Replace the body of `/generate-scripts` with:

```js
router.post('/generate-scripts', async (req, res) => {
    try {
        const result = await generateStoryboardScriptsWithConfiguredProvider({
            locals: req.app.locals,
            payload: req.body
        });
        return res.json(result);
    } catch (error) {
        const status = error instanceof TypeError ? 400 : 500;
        return res.status(status).json({ error: error.message || 'Script generation failed' });
    }
});
```

- [ ] **Step 5: Run storyboard backend tests**

Run:

```powershell
node --test server/services/storyboardGeneration.test.js server/services/storyboardText.test.js
```

Expected: PASS, with no network calls because tests inject requesters.

- [ ] **Step 6: Commit the scripts extraction**

```powershell
git add server/services/storyboardGeneration.js server/services/storyboardGeneration.test.js server/routes/storyboard.js
git commit -m "refactor: extract storyboard scripts generation"
```

## Task 8: Add The Backend Story Package Task Operation

**Files:**

- Modify: `server/services/storyboardGeneration.js`
- Modify: `server/services/storyboardGeneration.test.js`
- Modify: `server/routes/generation.js`
- Modify: `server/services/generationTaskRoutes.test.js`

- [ ] **Step 1: Add failing task output and route submission tests**

Append to `storyboardGeneration.test.js`:

```js
import { buildStoryPackageTaskOutput } from './storyboardGeneration.js';

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
                createdAt: '2026-07-14T00:00:00.000Z',
                updatedAt: '2026-07-14T00:00:00.000Z'
            },
            storyboardData: {
                schemaVersion: 1,
                sourceScriptNodeId: 'script-1',
                selectedImageModel: 'gpt-image-2',
                revision: 4,
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
                    revision: 3
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
    assert.equal(output.storyboardData.shots[0].id, 'stable-shot');
    assert.equal(output.storyboardData.shots[0].imageNodeId, 'image-1');
});
```

Append to `generationTaskRoutes.test.js`:

```js
test('POST generation-tasks accepts story-package and derives the configured text provider', async t => {
    const libraryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'twitcanva-story-task-route-'));
    t.after(() => fs.rmSync(libraryDir, { recursive: true, force: true }));
    let submission;
    const app = express();
    app.use(express.json());
    app.locals.GENERATION_TASK_MANAGER = {
        async submitTask(value) {
            submission = value;
            return { task: createTask({ ...value, taskId: 'story-task' }), reused: false };
        }
    };
    app.locals.LIBRARY_DIR = libraryDir;
    app.locals.IMAGES_DIR = path.join(libraryDir, 'images');
    app.locals.VIDEOS_DIR = path.join(libraryDir, 'videos');
    app.locals.OPENAI_API_KEY = 'key';
    app.locals.OPENAI_TEXT_MODEL = 'gpt-4.1-mini';
    fs.mkdirSync(app.locals.IMAGES_DIR, { recursive: true });
    fs.mkdirSync(app.locals.VIDEOS_DIR, { recursive: true });
    app.use('/api', generationRoutes);
    const server = await new Promise(resolve => {
        const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    });
    t.after(() => new Promise(resolve => server.close(resolve)));
    const address = server.address();

    const response = await fetch(`http://127.0.0.1:${address.port}/api/generation-tasks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            nodeId: 'script-1',
            operation: 'generate-story-package',
            inputSnapshot: {
                nodeId: 'script-1',
                storyboardNodeId: 'storyboard-1',
                sourceText: 'A paper moon',
                sceneCount: 3,
                generationMode: 'story-package',
                scriptRevision: 0,
                storyboardRevision: 0,
                referenceAssets: [],
                selectedImageModel: 'gpt-image-2',
                scriptData: {},
                storyboardData: {}
            }
        })
    });

    assert.equal(response.status, 202);
    assert.equal(submission.provider, 'openai');
    assert.equal(submission.model, 'gpt-4.1-mini');
    assert.equal(submission.operation, 'generate-story-package');
});
```

- [ ] **Step 2: Run the backend tests and verify failure**

Run:

```powershell
node --test server/services/storyboardGeneration.test.js server/services/generationTaskRoutes.test.js
```

Expected: FAIL because the operation is unsupported and the output builder is missing.

- [ ] **Step 3: Build structured task output from immutable snapshots**

In `storyboardGeneration.js`, add `buildStoryPackageTaskOutput(task, result, now)` with these rules:

```js
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
    return {
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
    };
}
```

- [ ] **Step 4: Register, validate, and execute the new operation**

In `server/routes/generation.js`:

1. Import `generateStoryPackageWithConfiguredProvider`, `generateStoryboardScriptsWithConfiguredProvider`, and `buildStoryPackageTaskOutput`.
2. Add `'generate-story-package'` to `SUPPORTED_TASK_OPERATIONS`.
3. Add this branch before media provider resolution:

```js
    if (operation === 'generate-story-package') {
        if (locals.OPENAI_API_KEY) {
            return { provider: 'openai', model: locals.OPENAI_TEXT_MODEL || 'gpt-4.1-mini' };
        }
        return { provider: 'gemini', model: 'gemini-2.0-flash' };
    }
```

4. In `prepareTaskSubmission`, validate `sourceText`, `sceneCount`, `storyboardNodeId`, both revisions, and `generationMode` for the new operation. Throw `TypeError` with a field-specific message on invalid input.
5. Add `sceneCount` and `generationMode` to `pickTaskParameters`.
6. Add to `executeGenerationTask`:

```js
    if (task.operation === 'generate-story-package') {
        const payload = {
            story: task.inputSnapshot.sourceText,
            sceneCount: task.inputSnapshot.sceneCount,
            tone: task.inputSnapshot.tone,
            characterDescriptions: task.inputSnapshot.referenceAssets,
            referenceImages: task.inputSnapshot.referenceAssets
        };
        const result = task.inputSnapshot.generationMode === 'scripts'
            ? await generateStoryboardScriptsWithConfiguredProvider({ locals, payload })
            : await generateStoryPackageWithConfiguredProvider({ locals, payload });
        return buildStoryPackageTaskOutput(task, result);
    }
```

Do not add structured-result recovery to `recoverGenerationTaskOutput`; after a server restart, a running text task follows the existing `SERVER_RESTARTED` retry path.

- [ ] **Step 5: Run all task and storyboard backend tests**

Run:

```powershell
node --test server/services/storyboardGeneration.test.js server/services/storyboardText.test.js server/services/generationTasks.test.js server/services/generationTaskRoutes.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit the backend operation**

```powershell
git add server/services/storyboardGeneration.js server/services/storyboardGeneration.test.js server/routes/generation.js server/services/generationTaskRoutes.test.js
git commit -m "feat: run story packages through generation tasks"
```

## Task 9: Make Unified Recovery Operation-Aware

**Files:**

- Modify: `src/domain/generation/taskResultUpdates.ts`
- Modify: `src/utils/taskResultUpdates.test.ts`
- Modify: `src/hooks/useGenerationRecovery.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Add failing task-id dedupe and start-update tests**

Append to `src/utils/taskResultUpdates.test.ts`:

```ts
import {
  buildStoryTaskStartUpdates,
  getUniqueActiveTaskIds
} from '../domain/generation/taskResultUpdates.ts';

test('active task ids are deduplicated for paired story nodes', () => {
  assert.deepEqual(getUniqueActiveTaskIds(nodes()), ['task-1']);
});

test('story task start updates bind the same task to both matching revisions', () => {
  const updates = buildStoryTaskStartUpdates(nodes(), task({
    status: 'queued',
    progress: 0,
    output: undefined
  }));

  assert.equal(updates['script-1'].activeTaskId, 'task-1');
  assert.equal(updates['storyboard-1'].activeTaskId, 'task-1');
  assert.equal(updates['script-1'].status, 'loading');
});

test('story task start refuses stale retry snapshots', () => {
  const changed = nodes();
  changed[0] = {
    ...changed[0],
    activeTaskId: undefined,
    scriptData: { ...changed[0].scriptData!, revision: 3 }
  };
  assert.deepEqual(buildStoryTaskStartUpdates(changed, task({
    taskId: 'task-retry',
    status: 'queued',
    output: undefined
  })), {});
});
```

- [ ] **Step 2: Run the focused test and verify missing exports**

Run:

```powershell
node --experimental-strip-types --test src/utils/taskResultUpdates.test.ts
```

Expected: FAIL because the start and dedupe helpers do not exist.

- [ ] **Step 3: Implement unique polling ids and safe story-task binding**

Add to `taskResultUpdates.ts`:

```ts
export function getUniqueActiveTaskIds(nodes: NodeData[]): string[] {
  return [...new Set(nodes.map(node => node.activeTaskId).filter((id): id is string => Boolean(id)))];
}

export function buildStoryTaskStartUpdates(
  nodes: NodeData[],
  task: GenerationTask
): NodeUpdateMap {
  if (task.operation !== 'generate-story-package') return {};
  const input = asRecord(task.inputSnapshot);
  const storyboardNodeId = typeof input.storyboardNodeId === 'string' ? input.storyboardNodeId : '';
  const script = nodes.find(node => node.id === task.nodeId);
  const storyboard = nodes.find(node => node.id === storyboardNodeId);
  if (!script?.scriptData || !storyboard?.storyboardData) return {};
  if (script.scriptData.revision !== input.scriptRevision) return {};
  if (storyboard.storyboardData.revision !== input.storyboardRevision) return {};
  const update = {
    status: 'loading' as NodeData['status'],
    activeTaskId: task.taskId,
    errorMessage: undefined,
    generationStartTime: new Date(task.createdAt).getTime()
  };
  return { [script.id]: update, [storyboard.id]: update };
}
```

- [ ] **Step 4: Route all terminal tasks through the pure mapper**

Change `UseGenerationRecoveryOptions` to accept both functions:

```ts
interface UseGenerationRecoveryOptions {
  nodes: NodeData[];
  updateNode: (id: string, updates: Partial<NodeData>) => void;
  applyNodeUpdates: (updates: NodeUpdateMap) => void;
}
```

Import `buildGenerationTaskNodeUpdates`, `getUniqueActiveTaskIds`, and `NodeUpdateMap`.

In `applyTask`:

1. Build `const updates = buildGenerationTaskNodeUpdates(nodesRef.current, task)`.
2. Return immediately when the map is empty.
3. For successful media tasks only, calculate last frame/aspect ratio exactly as today and merge those fields into `updates[task.nodeId]`.
4. Call `applyNodeUpdates(updates)` once.

Replace the loading-node key construction with:

```ts
const loadingNodes = nodes.filter(node => node.status === NodeStatus.LOADING);
const activeTaskIds = getUniqueActiveTaskIds(loadingNodes).sort();
const legacyLoadingNodeIds = loadingNodes
  .filter(node => !node.activeTaskId)
  .map(node => node.id)
  .sort();
const recoveryKey = `${activeTaskIds.join(',')}|${legacyLoadingNodeIds.join(',')}`;
```

Use `recoveryKey` as the effect dependency. Parse the left side into unique task IDs and the right side into legacy node IDs. Query active tasks once, then call the existing legacy status endpoint for every ID on the right side. This preserves old workflow recovery while deduplicating paired Script/Storyboard tasks.

- [ ] **Step 5: Pass atomic updates from App**

Destructure `applyNodeUpdates` from `useNodeManagement` and change the recovery call to:

```ts
  useGenerationRecovery({
    nodes,
    updateNode,
    applyNodeUpdates
  });
```

- [ ] **Step 6: Run recovery and media regressions**

Run:

```powershell
node --experimental-strip-types --test src/utils/taskResultUpdates.test.ts src/utils/generationTaskHelpers.test.ts src/utils/generationService.test.ts
npm run typecheck
```

Expected: PASS. Existing media resultUrl, take, heroTake, last-frame, and aspect-ratio behavior must remain unchanged.

- [ ] **Step 7: Commit unified structured recovery**

```powershell
git add src/domain/generation/taskResultUpdates.ts src/utils/taskResultUpdates.test.ts src/hooks/useGenerationRecovery.ts src/App.tsx
git commit -m "feat: recover structured storyboard tasks"
```

## Task 10: Convert The Existing Storyboard Hook Into A Node-Backed Session

**Files:**

- Modify: `src/domain/storyboard/storyboardDocuments.ts`
- Modify: `src/utils/storyboardDomain.test.ts`
- Modify: `src/hooks/useStoryboardGenerator.ts`
- Modify: `src/components/modals/StoryboardGeneratorModal.tsx`
- Modify: `src/components/modals/StoryboardVideoModal.tsx`
- Modify: `src/components/StoryInput.tsx`

- [ ] **Step 1: Add failing session merge tests**

Append to `storyboardDomain.test.ts`:

```ts
import {
  mergeSessionIntoDocuments,
  sessionFromDocuments
} from '../domain/storyboard/storyboardDocuments.ts';

test('session edits advance only the document whose persistent fields changed', () => {
  const script = createEmptyScriptDocument({ sourceText: 'Old story', now: NOW });
  const storyboard = {
    ...createEmptyStoryboardDocument({ sourceScriptNodeId: 'script-1', now: NOW }),
    shots: [{
      id: 'shot-1',
      order: 0,
      sceneNumber: 1,
      description: 'Old shot',
      cameraAngle: 'Wide shot',
      mood: 'Calm',
      imageNodeId: 'image-1',
      status: 'image-ready' as const,
      revision: 2
    }]
  };
  const merged = mergeSessionIntoDocuments({
    scriptData: script,
    storyboardData: storyboard,
    session: {
      story: 'New story',
      scripts: [{
        ...storyboard.shots[0],
        description: 'New shot'
      }],
      selectedCharacters: [],
      sceneCount: 1,
      styleAnchor: '',
      characterDNA: {},
      selectedImageModel: 'gpt-image-2',
      compositeImageUrl: null
    },
    now: '2026-07-14T00:02:00.000Z'
  });

  assert.equal(merged.scriptData.revision, 1);
  assert.equal(merged.storyboardData.revision, 1);
  assert.equal(merged.storyboardData.shots[0].id, 'shot-1');
  assert.equal(merged.storyboardData.shots[0].imageNodeId, 'image-1');
  assert.equal(merged.storyboardData.shots[0].revision, 3);
});

test('document to session projection preserves current modal fields', () => {
  const script = {
    ...createEmptyScriptDocument({ sourceText: 'A story', now: NOW }),
    styleAnchor: 'cinematic',
    characterDNA: { Hero: 'red coat' }
  };
  const storyboard = createEmptyStoryboardDocument({ sourceScriptNodeId: 'script-1', now: NOW });
  const session = sessionFromDocuments(script, storyboard);

  assert.equal(session.story, 'A story');
  assert.equal(session.styleAnchor, 'cinematic');
  assert.deepEqual(session.characterDNA, { Hero: 'red coat' });
});
```

- [ ] **Step 2: Run the focused test and verify missing session helpers**

Run:

```powershell
node --experimental-strip-types --test src/utils/storyboardDomain.test.ts
```

Expected: FAIL because merge/projection helpers are absent.

- [ ] **Step 3: Implement lossless session write-through helpers**

Add to `storyboardDocuments.ts`:

```ts
function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function sessionFromDocuments(
  scriptData: ScriptDocument,
  storyboardData: StoryboardDocument
): StoryboardSessionSnapshot {
  return {
    story: scriptData.sourceText || scriptData.synopsis,
    scripts: storyboardData.shots.map(shot => ({ ...shot })),
    selectedCharacters: scriptData.referenceAssets.map(asset => ({ ...asset })),
    sceneCount: Math.max(1, storyboardData.shots.length || 3),
    styleAnchor: scriptData.styleAnchor,
    characterDNA: { ...scriptData.characterDNA },
    selectedImageModel: storyboardData.selectedImageModel,
    compositeImageUrl: storyboardData.compositeImageUrl || null
  };
}

export function mergeSessionIntoDocuments(options: {
  scriptData: ScriptDocument;
  storyboardData: StoryboardDocument;
  session: StoryboardSessionSnapshot;
  now?: string;
}): { scriptData: ScriptDocument; storyboardData: StoryboardDocument } {
  const now = options.now || new Date().toISOString();
  const scriptFields = {
    sourceText: options.session.story,
    styleAnchor: options.session.styleAnchor,
    characterDNA: options.session.characterDNA,
    referenceAssets: options.session.selectedCharacters
  };
  const previousScriptFields = {
    sourceText: options.scriptData.sourceText,
    styleAnchor: options.scriptData.styleAnchor,
    characterDNA: options.scriptData.characterDNA,
    referenceAssets: options.scriptData.referenceAssets
  };
  const shots = options.session.scripts.map((incoming, index) => {
    const previous = options.storyboardData.shots.find(shot => shot.id === incoming.id)
      || options.storyboardData.shots[index];
    const normalized = normalizeStoryboardShot({ ...previous, ...incoming }, index, 'session');
    const changed = !previous || !sameJson(
      { ...previous, order: index },
      { ...normalized, order: index }
    );
    return { ...normalized, revision: changed ? (previous?.revision || 0) + 1 : (previous?.revision || 0) };
  });
  const storyboardFields = {
    shots,
    selectedImageModel: options.session.selectedImageModel,
    compositeImageUrl: options.session.compositeImageUrl
  };
  const previousStoryboardFields = {
    shots: options.storyboardData.shots,
    selectedImageModel: options.storyboardData.selectedImageModel,
    compositeImageUrl: options.storyboardData.compositeImageUrl || null
  };
  const scriptChanged = !sameJson(scriptFields, previousScriptFields);
  const storyboardChanged = !sameJson(storyboardFields, previousStoryboardFields);
  return {
    scriptData: scriptChanged ? {
      ...options.scriptData,
      ...scriptFields,
      revision: options.scriptData.revision + 1,
      updatedAt: now
    } : options.scriptData,
    storyboardData: storyboardChanged ? {
      ...options.storyboardData,
      ...storyboardFields,
      revision: options.storyboardData.revision + 1,
      updatedAt: now
    } : options.storyboardData
  };
}
```

- [ ] **Step 4: Move shared modal types out of the hook**

Replace the hook-local `CharacterAsset` and `SceneScript` definitions with aliases imported from `storyboardTypes.ts`:

```ts
export type CharacterAsset = StoryReferenceAsset;
export type SceneScript = StoryboardShot;
```

Update `StoryboardGeneratorModal.tsx`, `StoryboardVideoModal.tsx`, and `StoryInput.tsx` imports to use the domain type exports. Keep all current props and visual markup unchanged.

- [ ] **Step 5: Expand the hook contract with graph and task primitives**

Change `UseStoryboardGeneratorProps` to:

```ts
interface UseStoryboardGeneratorProps {
  nodes: NodeData[];
  edges: CanvasEdge[];
  groups: NodeGroup[];
  workflowId: string | null;
  viewport: Viewport;
  replaceGraph: (nodes: NodeData[], edges: CanvasEdge[]) => void;
  applyNodeUpdates: (updates: NodeUpdateMap) => void;
  setGroups: Dispatch<SetStateAction<NodeGroup[]>>;
  onCreateNodes: (nodes: Partial<NodeData>[], groupInfo?: StoryboardGroupInfo) => void;
}
```

Extend `StoryboardState` with:

```ts
  scriptNodeId: string | null;
  storyboardNodeId: string | null;
```

Set both to null in initial/reset state.

- [ ] **Step 6: Add node binding and task submission inside the hook**

Implement `ensureBoundNodes` using `ensureStoryboardNodePair`. It must:

1. Reuse valid IDs already in state.
2. Reuse a manually created Script or Storyboard node and create only its missing partner when one ID is already bound.
3. Otherwise calculate the current canvas center, create the pair, call `replaceGraph`, and save IDs in state.
4. Call `mergeSessionIntoDocuments` with the current Modal snapshot before submission; if it changes either document, replace those nodes in the same graph result so the submitted revisions match persisted input.
5. Return the created or existing nodes so submission never depends on a stale React render.

Implement one shared submission function:

```ts
const submitStoryGeneration = useCallback(async (
  generationMode: StoryPackageGenerationMode
) => {
  if (!state.story.trim()) {
    setState(previous => ({ ...previous, error: 'Please enter a story' }));
    return;
  }
  let bound: ReturnType<typeof ensureBoundNodes> | undefined;
  try {
    bound = ensureBoundNodes();
    const task = await submitStoryPackageGeneration({
      nodeId: bound.scriptNode.id,
      scriptNodeId: bound.scriptNode.id,
      storyboardNodeId: bound.storyboardNode.id,
      scriptRevision: bound.scriptNode.scriptData!.revision,
      storyboardRevision: bound.storyboardNode.storyboardData!.revision,
      generationMode,
      sourceText: state.story,
      sceneCount: state.sceneCount,
      referenceAssets: state.selectedCharacters,
      selectedImageModel: state.selectedImageModel,
      scriptData: bound.scriptNode.scriptData!,
      storyboardData: bound.storyboardNode.storyboardData!
    }, { workflowId });
    const updates = buildStoryTaskStartUpdates(bound.nodes, task);
    applyNodeUpdates(updates);
    setState(previous => ({
      ...previous,
      isGenerating: true,
      error: null,
      step: 'scripts',
      scriptNodeId: bound!.scriptNode.id,
      storyboardNodeId: bound!.storyboardNode.id
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to submit story generation';
    if (bound) {
      const failure = {
        status: 'error' as NodeData['status'],
        activeTaskId: undefined,
        errorMessage: message
      };
      applyNodeUpdates({
        [bound.scriptNode.id]: failure,
        [bound.storyboardNode.id]: failure
      });
    }
    setState(previous => ({ ...previous, isGenerating: false, error: message }));
  }
}, [state, ensureBoundNodes, workflowId, applyNodeUpdates]);
```

Make `generateScripts` call `submitStoryGeneration('scripts')` and `generateStoryPackage` call `submitStoryGeneration('story-package')`. Remove direct fetch calls from those two methods only. Keep brainstorm, optimize, and composite endpoints unchanged in this phase.

- [ ] **Step 7: Hydrate from tasks and write persistent modal edits through to nodes**

Add an effect that watches the two bound nodes. When both documents exist and their revision/task/status tuple changes, call `sessionFromDocuments` and update persistent Modal fields. Set `isGenerating` to true only while either bound node is loading, set it false on success/error, preserve the current `step`, and surface either node's `errorMessage`.

Add a second effect that builds the current `StoryboardSessionSnapshot`, calls `mergeSessionIntoDocuments`, and invokes `applyNodeUpdates` only when one returned document has a new identity. If either document changes while `activeTaskId` exists, clear both activeTaskIds and set both nodes to idle so the in-flight result is rejected by the revision/task guard.

Add a third effect that calls `buildStoryboardMediaProjectionUpdates(nodes)`. Apply the returned map only when it is non-empty. This keeps Shot status, activeTaskId, lastTaskId, error, and dangling media references synchronized even while the Modal is closed; the projection helper must not increment StoryboardDocument revision.

Do not persist `step`, `isGeneratingPreview`, `isGenerating`, `isBrainstorming`, `isOptimizing`, or `error` into workflow documents.

- [ ] **Step 8: Add explicit open/edit paths**

Expose:

```ts
openNode(nodeId: string): void
editLegacyStoryboard(groupId: string): void
cancelTaskForNode(nodeId: string): Promise<void>
retryTaskForNode(nodeId: string): Promise<void>
```

`openNode` binds a Script or Storyboard node pair by following `storyboardData.sourceScriptNodeId` or incoming Script Edge and hydrates the Modal.

`editLegacyStoryboard` calculates the old Group's `minX` and `minY`, passes `{ x: minX - 460, y: minY }` as the materialization anchor, then calls `materializeLegacyStoryboardGroup`. It atomically calls `replaceGraph`, updates exactly one group via `setGroups`, and opens the Modal. Repeated calls must reuse saved IDs and must not move an existing pair.

`cancelTaskForNode` calls `cancelGenerationTask`, then applies `buildGenerationTaskNodeUpdates` to both nodes.

`retryTaskForNode` calls `retryGenerationTask`, then applies `buildStoryTaskStartUpdates`. If revisions no longer match the old snapshot, set the Modal error to `当前内容已修改，请使用重新生成以提交最新内容。` and do not bind the retry result.

- [ ] **Step 9: Persist shot/image bindings before existing node creation**

Inside `createStoryboardNodes`, call `ensureBoundNodes`, create the Image node IDs exactly as today, then update the bound StoryboardDocument with `attachImageNodesToShots` before calling `onCreateNodes`. Add `scriptNodeId` and `storyboardNodeId` to the emitted legacy `storyContext`.

Keep current prompt construction, image model, reference URLs, group creation, auto-generation delays, and continue-to-video behavior unchanged.

- [ ] **Step 10: Run focused domain tests and typecheck**

Run:

```powershell
node --experimental-strip-types --test src/utils/storyboardDomain.test.ts src/utils/storyboardGraph.test.ts src/utils/taskResultUpdates.test.ts src/utils/storyboardNodeFactory.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 11: Commit the node-backed storyboard session**

```powershell
git add src/domain/storyboard/storyboardDocuments.ts src/utils/storyboardDomain.test.ts src/hooks/useStoryboardGenerator.ts src/components/modals/StoryboardGeneratorModal.tsx src/components/modals/StoryboardVideoModal.tsx src/components/StoryInput.tsx
git commit -m "feat: persist storyboard wizard state in nodes"
```

## Task 11: Add Compact Story Nodes And Minimal App Wiring

**Files:**

- Create: `src/components/canvas/ScriptNodeContent.tsx`
- Create: `src/components/canvas/StoryboardNodeContent.tsx`
- Modify: `src/components/canvas/NodeContent.tsx`
- Modify: `src/components/canvas/CanvasNode.tsx`
- Modify: `src/components/ContextMenu.tsx`
- Modify: `src/App.tsx`
- Modify: `src/utils/storyboardGraph.test.ts`

- [ ] **Step 1: Add a failing video linkage regression test**

Add `createEmptyStoryboardDocument` to the existing import section, then append the test:

```ts
test('video linkage is keyed by source image id rather than array position', () => {
  const document = {
    ...createEmptyStoryboardDocument({ sourceScriptNodeId: 'script-1', now: NOW }),
    shots: [
      {
        id: 'shot-a', order: 0, sceneNumber: 1, description: 'A', cameraAngle: 'Wide', mood: '',
        imageNodeId: 'image-a', status: 'image-ready' as const, revision: 0
      },
      {
        id: 'shot-b', order: 1, sceneNumber: 2, description: 'B', cameraAngle: 'Close-up', mood: '',
        imageNodeId: 'image-b', status: 'image-ready' as const, revision: 0
      }
    ]
  };
  const linked = attachVideoNodesToShots(document, new Map([['image-b', 'video-b']]), NOW);

  assert.equal(linked.shots[0].videoNodeId, undefined);
  assert.equal(linked.shots[1].videoNodeId, 'video-b');
});
```

- [ ] **Step 2: Run the graph test before UI work**

Run:

```powershell
node --experimental-strip-types --test src/utils/storyboardGraph.test.ts
```

Expected: PASS if Task 4 was implemented correctly. Treat this as a regression lock before App changes.

- [ ] **Step 3: Create the compact Script node body**

Create `ScriptNodeContent.tsx`:

```tsx
import React from 'react';
import { FileText, Loader2, RotateCcw, Square, WandSparkles } from 'lucide-react';
import type { NodeData } from '../../types.ts';

interface ScriptNodeContentProps {
  data: NodeData;
  onOpen: (nodeId: string) => void;
  onCancel: (nodeId: string) => void;
  onRetry: (nodeId: string) => void;
}

export const ScriptNodeContent: React.FC<ScriptNodeContentProps> = ({
  data,
  onOpen,
  onCancel,
  onRetry
}) => {
  const document = data.scriptData;
  const isLoading = data.status === 'loading';
  return (
    <div className="p-4 min-h-[190px] bg-[#141414] rounded-2xl flex flex-col gap-3">
      <div className="flex items-center gap-2 text-amber-300">
        <FileText size={18} />
        <span className="text-xs font-semibold uppercase tracking-[0.16em]">Script</span>
      </div>
      <p className="text-sm text-neutral-200 line-clamp-3">
        {document?.sourceText || '输入故事，建立可持久化脚本。'}
      </p>
      {document?.synopsis && document.synopsis !== document.sourceText && (
        <p className="text-xs text-neutral-500 line-clamp-2">{document.synopsis}</p>
      )}
      {data.errorMessage && <p className="text-xs text-red-400">{data.errorMessage}</p>}
      <div className="mt-auto flex gap-2">
        <button onPointerDown={event => event.stopPropagation()} onClick={() => onOpen(data.id)} className="flex-1 rounded-lg bg-amber-500/15 px-3 py-2 text-xs text-amber-200 hover:bg-amber-500/25">
          <WandSparkles size={13} className="inline mr-1" />编辑脚本
        </button>
        {isLoading ? (
          <button onPointerDown={event => event.stopPropagation()} onClick={() => onCancel(data.id)} className="rounded-lg bg-neutral-800 px-3 text-neutral-300" title="取消任务">
            <Square size={13} />
          </button>
        ) : data.status === 'error' && data.lastTaskId ? (
          <button onPointerDown={event => event.stopPropagation()} onClick={() => onRetry(data.id)} className="rounded-lg bg-neutral-800 px-3 text-neutral-300" title="重试任务">
            <RotateCcw size={13} />
          </button>
        ) : null}
      </div>
      {isLoading && <div className="flex items-center gap-2 text-xs text-neutral-500"><Loader2 size={12} className="animate-spin" />任务处理中</div>}
    </div>
  );
};
```

- [ ] **Step 4: Create the compact Storyboard node body**

Create `StoryboardNodeContent.tsx`:

```tsx
import React from 'react';
import { Clapperboard, Images, Loader2, RotateCcw, Square } from 'lucide-react';
import type { NodeData } from '../../types.ts';

interface StoryboardNodeContentProps {
  data: NodeData;
  onOpen: (nodeId: string) => void;
  onCancel: (nodeId: string) => void;
  onRetry: (nodeId: string) => void;
}

export const StoryboardNodeContent: React.FC<StoryboardNodeContentProps> = ({ data, onOpen, onCancel, onRetry }) => {
  const shots = data.storyboardData?.shots || [];
  const imageCount = shots.filter(shot => shot.imageNodeId).length;
  const videoCount = shots.filter(shot => shot.videoNodeId).length;
  const isLoading = data.status === 'loading';
  return (
    <div className="p-4 min-h-[220px] bg-[#141414] rounded-2xl flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-cyan-300"><Clapperboard size={18} /><span className="text-xs font-semibold uppercase tracking-[0.16em]">Storyboard</span></div>
        <span className="text-xs text-neutral-500">{shots.length} 镜头</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-neutral-900 px-3 py-2 text-neutral-400">图片 {imageCount}/{shots.length}</div>
        <div className="rounded-lg bg-neutral-900 px-3 py-2 text-neutral-400">视频 {videoCount}/{shots.length}</div>
      </div>
      <div className="space-y-1">
        {shots.slice(0, 3).map(shot => <p key={shot.id} className="truncate text-xs text-neutral-500">{shot.sceneNumber}. {shot.description}</p>)}
        {shots.length === 0 && <p className="text-xs text-neutral-600">尚未生成镜头。</p>}
      </div>
      {data.errorMessage && <p className="text-xs text-red-400">{data.errorMessage}</p>}
      <div className="mt-auto flex gap-2">
        <button onPointerDown={event => event.stopPropagation()} onClick={() => onOpen(data.id)} className="flex-1 rounded-lg bg-cyan-500/15 px-3 py-2 text-xs text-cyan-200 hover:bg-cyan-500/25"><Images size={13} className="inline mr-1" />打开分镜</button>
        {isLoading ? <button onPointerDown={event => event.stopPropagation()} onClick={() => onCancel(data.id)} className="rounded-lg bg-neutral-800 px-3 text-neutral-300"><Square size={13} /></button>
          : data.status === 'error' && data.lastTaskId ? <button onPointerDown={event => event.stopPropagation()} onClick={() => onRetry(data.id)} className="rounded-lg bg-neutral-800 px-3 text-neutral-300"><RotateCcw size={13} /></button> : null}
      </div>
      {isLoading && <div className="flex items-center gap-2 text-xs text-neutral-500"><Loader2 size={12} className="animate-spin" />任务处理中</div>}
    </div>
  );
};
```

- [ ] **Step 5: Route specialized content without changing media rendering**

Add these props to `NodeContentProps` and `CanvasNodeProps`:

```ts
onOpenStoryNode?: (nodeId: string) => void;
onCancelStoryTask?: (nodeId: string) => void;
onRetryStoryTask?: (nodeId: string) => void;
```

In `NodeContent`, render Script/Storyboard branches before the existing result/media branch:

```tsx
if (data.type === NodeType.SCRIPT) {
  return <ScriptNodeContent data={data} onOpen={onOpenStoryNode!} onCancel={onCancelStoryTask!} onRetry={onRetryStoryTask!} />;
}
if (data.type === NodeType.STORYBOARD) {
  return <StoryboardNodeContent data={data} onOpen={onOpenStoryNode!} onCancel={onCancelStoryTask!} onRetry={onRetryStoryTask!} />;
}
```

Pass the callbacks through `CanvasNode`. Exclude both types from the generic `NodeControls` condition:

```ts
data.type !== NodeType.SCRIPT && data.type !== NodeType.STORYBOARD
```

- [ ] **Step 6: Add explicit creation menu entries**

In `ContextMenu.tsx`, import `BookOpenText` and `PanelsTopLeft`. Insert after Text:

```tsx
<MenuItem
  icon={<BookOpenText size={18} />}
  label="脚本"
  desc="持久化故事与视觉设定"
  onClick={() => onSelectType(NodeType.SCRIPT)}
  canvasTheme={canvasTheme}
/>
<MenuItem
  icon={<PanelsTopLeft size={18} />}
  label="分镜管理器"
  desc="管理结构化镜头与生成结果"
  onClick={() => onSelectType(NodeType.STORYBOARD)}
  canvasTheme={canvasTheme}
/>
```

Connection-menu validation will automatically reject invalid source/target combinations through Task 2 rules.

- [ ] **Step 7: Wire the node-backed hook into App with minimal changes**

Pass these values to `useStoryboardGenerator`:

```ts
  const storyboardGenerator = useStoryboardGenerator({
    nodes,
    edges,
    groups,
    workflowId,
    viewport,
    replaceGraph,
    applyNodeUpdates,
    setGroups,
    onCreateNodes: handleCreateStoryboardNodes
  });
```

Change `handleEditStoryboard` to:

```ts
  const handleEditStoryboard = React.useCallback((groupId: string) => {
    storyboardGenerator.editLegacyStoryboard(groupId);
  }, [storyboardGenerator]);
```

Pass to every `CanvasNode`:

```tsx
onOpenStoryNode={storyboardGenerator.openNode}
onCancelStoryTask={storyboardGenerator.cancelTaskForNode}
onRetryStoryTask={storyboardGenerator.retryTaskForNode}
```

- [ ] **Step 8: Read effective context for video and persist video node ids**

In `handleCreateStoryboardVideo`, replace direct `group?.storyContext` access with:

```ts
const storyContext = group ? getEffectiveStoryContext(group, nodes) : undefined;
```

In `handleGenerateStoryVideos`, after creating `newNodes`, build:

```ts
const videoByImage = new Map(
  sourceNodes.map((sourceNode, index) => [sourceNode.id, newNodes[index].id])
);
const context = storyboardVideoModal.storyContext;
const storyboardNode = context?.storyboardNodeId
  ? nodes.find(node => node.id === context.storyboardNodeId)
  : undefined;
if (storyboardNode?.storyboardData) {
  const withPrompts = {
    ...storyboardNode.storyboardData,
    shots: storyboardNode.storyboardData.shots.map(shot => shot.imageNodeId && prompts[shot.imageNodeId]
      ? { ...shot, videoPrompt: prompts[shot.imageNodeId] }
      : shot)
  };
  applyNodeUpdates({
    [storyboardNode.id]: {
      storyboardData: attachVideoNodesToShots(withPrompts, videoByImage)
    }
  });
}
```

Add `nodes`, `applyNodeUpdates`, and the effective story context dependencies to the callback dependency array. Do not alter the Video node prompt or Provider parameters.

- [ ] **Step 9: Run frontend pure tests, typecheck, and build**

Run:

```powershell
node --experimental-strip-types --test src/utils/storyboardGraph.test.ts src/utils/storyboardDomain.test.ts src/utils/taskResultUpdates.test.ts src/utils/nodeRegistry.test.ts src/utils/connectionRules.test.ts
npm run typecheck
npm run build
```

Expected: all PASS. The existing Vite large-chunk warning is acceptable; new TypeScript or JSX errors are not.

- [ ] **Step 10: Commit the compact node UI and integration**

```powershell
git add src/components/canvas/ScriptNodeContent.tsx src/components/canvas/StoryboardNodeContent.tsx src/components/canvas/NodeContent.tsx src/components/canvas/CanvasNode.tsx src/components/ContextMenu.tsx src/App.tsx src/utils/storyboardGraph.test.ts
git commit -m "feat: add script and storyboard canvas nodes"
```

## Task 12: Full Regression, Runtime Smoke, Review, And Push

**Files:**

- Modify only files required by failures found during verification.
- Review: every file changed since commit `7de69bd`.

- [ ] **Step 1: Run all frontend and backend tests**

Run:

```powershell
npm test
```

Expected: all existing and new tests PASS. Record the exact test count in the final report.

- [ ] **Step 2: Run static verification**

Run:

```powershell
npm run typecheck
npm run build
```

Expected: both PASS. The pre-existing chunk-size warning may remain.

- [ ] **Step 3: Start or confirm the complete application**

Run:

```powershell
$listeners = netstat -ano | Select-String -Pattern ':3001\s|:5173\s'
if (-not $listeners) {
  Start-Process -FilePath 'npm.cmd' -ArgumentList 'run','dev' -WorkingDirectory (Get-Location) -WindowStyle Hidden
  Start-Sleep -Seconds 8
}
netstat -ano | Select-String -Pattern ':3001\s|:5173\s'
```

Expected: `127.0.0.1:3001` and a Vite listener on `5173`.

- [ ] **Step 4: Run API smoke checks without exposing credentials**

Run a local task query and frontend fetch:

```powershell
$taskResponse = Invoke-WebRequest -UseBasicParsing -Method Post -Uri 'http://127.0.0.1:3001/api/generation-tasks/query' -ContentType 'application/json' -Body '{}'
$frontResponse = Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:5173/'
"TASK_STATUS=$($taskResponse.StatusCode) FRONT_STATUS=$($frontResponse.StatusCode)"
```

Expected: `TASK_STATUS=200 FRONT_STATUS=200`.

- [ ] **Step 5: Manually verify the main user paths in the browser**

Verify each item and record pass/fail:

1. Open an existing public or legacy workflow; node count and old connections remain unchanged.
2. Open the toolbar storyboard wizard and close it before generation; no nodes are created.
3. Submit story generation; exactly one Script node, one Storyboard node, and one typed Edge appear.
4. Refresh while a task is active; both nodes retain task state and recover to success/error.
5. Edit story or a shot, save, reload, and confirm revisions and values persist.
6. Open an old storyboard Group and click Edit Storyboard; a node pair appears to its left only once.
7. Generate storyboard images; existing prompts, image model, Hero Take, and group behavior remain unchanged.
8. Continue to storyboard video; Video nodes use the selected model and Shot videoNodeId references persist.
9. Cancel and retry a story task; cancellation is truthful and retry uses the old snapshot only when revisions match.
10. Delete Script or Storyboard nodes; existing image/video media nodes are not deleted and the canvas does not crash.

- [ ] **Step 6: Audit compatibility invariants**

Run:

```powershell
rg -n "parentIds" src/types.ts src/domain src/hooks src/App.tsx
rg -n "generate-story-package|generate-scripts|brainstorm-story|optimize-story|generate-composite" server/routes src/hooks
rg -n "API_KEY|authorization|bearer" src/domain/storyboard src/domain/generation src/hooks/useStoryboardGenerator.ts
```

Expected:

- `parentIds` remains present and Edge remains primary.
- All old storyboard endpoints remain mounted.
- No API key or authorization value is added to frontend story/task data.

- [ ] **Step 7: Review the complete phase diff**

Run:

```powershell
git status --short
git diff --check 7de69bd..HEAD
git diff --stat 7de69bd..HEAD
git diff --name-only 7de69bd..HEAD
```

Review for:

- unrelated formatting or UI changes;
- duplicate Provider logic left in route and service;
- any direct story Provider call from React;
- result application without taskId and revision guards;
- workflow migration that creates visible nodes during load;
- media generation parameter changes;
- accidental Base64 persistence.

- [ ] **Step 8: Fix only verified phase-4 defects and rerun affected checks**

For every fix, first add or strengthen a failing test when the defect is testable. Rerun the smallest affected test, then rerun:

```powershell
npm run typecheck
npm test
npm run build
```

Expected: all PASS.

- [ ] **Step 9: Commit final verification fixes if any**

If verification required changes:

```powershell
git add -A
git commit -m "fix: complete persistent storyboard integration"
```

If the worktree is clean, do not create an empty commit.

- [ ] **Step 10: Push the completed phase to GitHub**

Run:

```powershell
git push origin codex/foundation-refactor
git status --short --branch
git rev-parse HEAD
git rev-parse origin/codex/foundation-refactor
```

Expected: local and remote commit hashes match and the worktree is clean.

- [ ] **Step 11: Report completion evidence**

The final report must include:

- commits created for Tasks 1-12;
- user-visible Script/Storyboard behavior;
- actual structured task data flow;
- workflow schema migration result;
- exact `typecheck`, test count, and build results;
- runtime smoke results;
- old workflow, Group, Edge, parentIds, image, video, take, and task compatibility;
- known limitations, especially text Provider restart recovery and remaining synchronous brainstorm/optimize/composite endpoints;
- the pushed branch and final commit hash.

## Spec Coverage Audit

| Design requirement | Implemented by |
|---|---|
| Persistent ScriptDocument, StoryboardDocument, StoryboardShot | Tasks 1 and 3 |
| New ScriptNode and activated StoryboardNode defaults | Task 2 |
| Stable text -> script -> storyboard ports | Task 2 |
| Workflow schemaVersion 5 and idempotent migration | Task 3 |
| Unknown-field preservation and stable legacy shot IDs | Tasks 1 and 3 |
| No visible node creation while merely loading old workflows | Tasks 3 and 4 |
| Lazy legacy Group materialization | Tasks 4 and 10 |
| Node data primary, storyContext compatibility mirror | Tasks 4, 10, and 11 |
| Atomic paired node updates | Tasks 4, 5, and 9 |
| Structured generate-story-package task output | Tasks 5 and 8 |
| Existing scripts and story-package provider behavior | Tasks 6 and 7 |
| Task dedupe, queue, cancel, retry, refresh recovery | Tasks 5, 8, 9, and 10 |
| Old task and revision overwrite protection | Tasks 5, 9, and 10 |
| Existing Modal retained as node-backed editor | Task 10 |
| Compact Script/Storyboard canvas UI | Task 11 |
| Existing storyboard Image and Video behavior retained | Tasks 10, 11, and 12 |
| Shot links and status projected from media nodes/tasks | Tasks 4, 10, and 11 |
| parentIds and old endpoints retained | Tasks 2, 8, and 12 |
| No new assets, audio, timeline, Agent, models, or canvas rewrite | Guardrails and Task 12 audit |
| Typecheck, complete tests, build, runtime smoke, review, push | Task 12 |

## Plan Self-Review Result

- Scope is one vertical slice: persistent story nodes from creation through task execution, recovery, media linkage, save/load, and UI.
- Every new runtime abstraction has a focused pure-function or backend test before implementation.
- All public names used by later tasks are introduced in an earlier task.
- The plan contains no unresolved markers, deferred implementation placeholders, database migration, or unrelated refactor.
- The only deliberately synchronous storyboard operations remaining are brainstorm, optimize, and composite preview; they are named as known phase limits and their existing endpoints remain intact.
- Task schemaVersion remains 1 because the envelope is unchanged; workflow schemaVersion advances to 5 because persisted node data changes.
- The final phase is not complete until local and remote Git hashes match after all verification passes.
