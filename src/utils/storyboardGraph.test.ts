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
  removeNodesAndNormalizeStoryboardMediaReferences,
  syncBoundStoryboardGroupContexts,
  syncLegacyStoryboardContexts
} from '../domain/storyboard/storyboardGraph.ts';
import { createEmptyStoryboardDocument } from '../domain/storyboard/storyboardDocuments.ts';
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
  let repeatedIdFactoryCalls = 0;
  const second = materializeLegacyStoryboardGroup({
    group: first.group,
    nodes: first.nodes,
    edges: first.edges,
    anchor: { x: 0, y: 0 },
    idFactory: () => {
      repeatedIdFactoryCalls += 1;
      return 'must-not-be-used';
    },
    now: NOW
  });

  assert.equal(first.nodes.length, 2);
  assert.equal(first.group.storyContext?.scriptNodeId, 'script-new');
  assert.equal(first.group.storyContext?.storyboardNodeId, 'storyboard-new');
  assert.deepEqual(second, first);
  assert.equal(repeatedIdFactoryCalls, 0);
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

test('removing media nodes clears only their shot references and preserves unrelated nodes', () => {
  const storyboard = {
    ...createDefaultNodeData('分镜管理器' as NodeData['type']),
    id: 'storyboard-cleanup',
    x: 0,
    y: 0,
    parentIds: [],
    storyboardData: {
      ...createDefaultNodeData('分镜管理器' as NodeData['type']).storyboardData!,
      shots: [{
        id: 'shot-remove',
        order: 0,
        sceneNumber: 1,
        description: 'Remove linked media',
        cameraAngle: 'Wide shot',
        mood: '',
        imageNodeId: 'image-remove',
        videoNodeId: 'video-remove',
        status: 'video-ready' as const,
        revision: 0
      }, {
        id: 'shot-keep',
        order: 1,
        sceneNumber: 2,
        description: 'Keep linked media',
        cameraAngle: 'Close up',
        mood: '',
        imageNodeId: 'image-keep',
        videoNodeId: 'video-keep',
        status: 'video-ready' as const,
        revision: 0
      }]
    }
  } as NodeData;
  const nodes = [
    storyboard,
    {
      ...createDefaultNodeData('脚本' as NodeData['type']),
      id: 'script-keep',
      x: 0,
      y: 0,
      parentIds: []
    },
    {
      ...createDefaultNodeData('图片' as NodeData['type']),
      id: 'image-remove',
      x: 0,
      y: 0,
      parentIds: []
    },
    {
      ...createDefaultNodeData('视频' as NodeData['type']),
      id: 'video-remove',
      x: 0,
      y: 0,
      parentIds: []
    },
    {
      ...createDefaultNodeData('图片' as NodeData['type']),
      id: 'image-keep',
      x: 0,
      y: 0,
      parentIds: []
    },
    {
      ...createDefaultNodeData('视频' as NodeData['type']),
      id: 'video-keep',
      x: 0,
      y: 0,
      parentIds: []
    },
    {
      ...createDefaultNodeData('文本' as NodeData['type']),
      id: 'text-keep',
      x: 0,
      y: 0,
      parentIds: []
    }
  ] as NodeData[];

  const remaining = removeNodesAndNormalizeStoryboardMediaReferences(
    nodes,
    ['image-remove', 'video-remove'],
    NOW
  );
  const updatedStoryboard = remaining.find(node => node.id === 'storyboard-cleanup');
  assert.ok(updatedStoryboard?.storyboardData);

  assert.deepEqual(remaining.map(node => node.id), [
    'storyboard-cleanup',
    'script-keep',
    'image-keep',
    'video-keep',
    'text-keep'
  ]);
  assert.equal(updatedStoryboard.storyboardData.shots[0].imageNodeId, undefined);
  assert.equal(updatedStoryboard.storyboardData.shots[0].videoNodeId, undefined);
  assert.equal(updatedStoryboard.storyboardData.shots[1].imageNodeId, 'image-keep');
  assert.equal(updatedStoryboard.storyboardData.shots[1].videoNodeId, 'video-keep');
});

test('removing a non-media node leaves unrelated storyboard documents untouched', () => {
  const storyboard = {
    ...createDefaultNodeData('分镜管理器' as NodeData['type']),
    id: 'storyboard-untouched',
    x: 0,
    y: 0,
    parentIds: [],
    storyboardData: {
      ...createDefaultNodeData('分镜管理器' as NodeData['type']).storyboardData!,
      revision: 7,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
      shots: [{
        id: 'shot-untouched',
        order: 0,
        sceneNumber: 1,
        description: 'Keep every field',
        cameraAngle: 'Wide shot',
        mood: '',
        imageNodeId: 'image-untouched',
        videoNodeId: 'video-untouched',
        activeTaskId: 'active-task',
        lastTaskId: 'last-task',
        status: 'failed' as const,
        error: 'Keep this error',
        revision: 4
      }]
    }
  } as NodeData;
  const image = {
    ...createDefaultNodeData('图片' as NodeData['type']),
    id: 'image-untouched',
    x: 0,
    y: 0,
    parentIds: [],
    status: 'success' as NodeData['status']
  } as NodeData;
  const video = {
    ...createDefaultNodeData('视频' as NodeData['type']),
    id: 'video-untouched',
    x: 0,
    y: 0,
    parentIds: [],
    status: 'success' as NodeData['status'],
    lastTaskId: 'video-task'
  } as NodeData;
  const unrelated = {
    ...createDefaultNodeData('文本' as NodeData['type']),
    id: 'text-remove',
    x: 0,
    y: 0,
    parentIds: []
  } as NodeData;
  const originalStoryboardData = structuredClone(storyboard.storyboardData);

  const remaining = removeNodesAndNormalizeStoryboardMediaReferences(
    [storyboard, image, video, unrelated],
    ['text-remove'],
    NOW
  );
  const updatedStoryboard = remaining.find(node => node.id === 'storyboard-untouched');

  assert.ok(updatedStoryboard?.storyboardData);
  assert.deepEqual(remaining.map(node => node.id), [
    'storyboard-untouched',
    'image-untouched',
    'video-untouched'
  ]);
  assert.equal(updatedStoryboard, storyboard);
  assert.deepEqual(updatedStoryboard.storyboardData, originalStoryboardData);
});

test('legacy story context unknown fields survive document-backed sync', () => {
  const ids = ['script-context', 'storyboard-context', 'edge-context'];
  const created = createStoryboardDraftGraph({
    nodes: [],
    edges: [],
    center: { x: 0, y: 0 },
    session: {
      story: 'Node documents are authoritative',
      scripts: [],
      selectedCharacters: [],
      sceneCount: 1,
      styleAnchor: '',
      characterDNA: {},
      selectedImageModel: 'gpt-image-2',
      compositeImageUrl: null
    },
    idFactory: () => ids.shift() || 'unexpected',
    now: NOW
  });
  const synced = syncLegacyStoryboardContexts(created.nodes, [{
    id: 'group-context',
    nodeIds: [],
    label: 'Storyboard',
    storyContext: {
      story: 'Stale legacy story',
      scripts: [],
      scriptNodeId: 'script-context',
      storyboardNodeId: 'storyboard-context',
      futureLegacySetting: { enabled: true }
    }
  }]);

  assert.equal(synced[0].storyContext?.story, 'Node documents are authoritative');
  assert.deepEqual(synced[0].storyContext?.futureLegacySetting, { enabled: true });
});

test('bound story context sync updates only its pair and preserves unknown legacy fields', () => {
  const ids = ['script-bound', 'storyboard-bound', 'edge-bound'];
  const created = createStoryboardDraftGraph({
    nodes: [],
    edges: [],
    center: { x: 0, y: 0 },
    session: {
      story: 'Persistent story document',
      scripts: [],
      selectedCharacters: [],
      sceneCount: 1,
      styleAnchor: 'cinematic',
      characterDNA: {},
      selectedImageModel: 'gpt-image-2',
      compositeImageUrl: null
    },
    idFactory: () => ids.shift() || 'unexpected',
    now: NOW
  });
  const scriptData = created.nodes.find(node => node.id === created.scriptNodeId)?.scriptData;
  const storyboardData = created.nodes.find(node => node.id === created.storyboardNodeId)?.storyboardData;
  assert.ok(scriptData && storyboardData);
  const groups: NodeGroup[] = [
    {
      id: 'bound-group',
      nodeIds: [],
      label: 'Bound storyboard',
      storyContext: {
        story: 'Stale legacy story',
        scripts: [],
        scriptNodeId: created.scriptNodeId,
        storyboardNodeId: created.storyboardNodeId,
        futureLegacySetting: { enabled: true }
      }
    },
    {
      id: 'unrelated-group',
      nodeIds: [],
      label: 'Unrelated storyboard',
      storyContext: {
        story: 'Leave this alone',
        scripts: [],
        scriptNodeId: 'other-script',
        storyboardNodeId: 'other-storyboard'
      }
    }
  ];

  const synced = syncBoundStoryboardGroupContexts(groups, {
    scriptNodeId: created.scriptNodeId,
    storyboardNodeId: created.storyboardNodeId,
    scriptData,
    storyboardData
  });

  assert.equal(synced[0].storyContext?.story, 'Persistent story document');
  assert.deepEqual(synced[0].storyContext?.futureLegacySetting, { enabled: true });
  assert.equal(synced[1], groups[1]);
  assert.equal(syncBoundStoryboardGroupContexts(synced, {
    scriptNodeId: created.scriptNodeId,
    storyboardNodeId: created.storyboardNodeId,
    scriptData,
    storyboardData
  }), synced);
});

test('video linkage is keyed by source image id rather than array position', () => {
  const document = {
    ...createEmptyStoryboardDocument({ sourceScriptNodeId: 'script-1', now: NOW }),
    shots: [
      {
        id: 'shot-a',
        order: 0,
        sceneNumber: 1,
        description: 'A',
        cameraAngle: 'Wide',
        mood: '',
        imageNodeId: 'image-a',
        status: 'image-ready' as const,
        revision: 0
      },
      {
        id: 'shot-b',
        order: 1,
        sceneNumber: 2,
        description: 'B',
        cameraAngle: 'Close-up',
        mood: '',
        imageNodeId: 'image-b',
        status: 'image-ready' as const,
        revision: 0
      }
    ]
  };
  const linked = attachVideoNodesToShots(document, new Map([['image-b', 'video-b']]), NOW);

  assert.equal(linked.shots[0].videoNodeId, undefined);
  assert.equal(linked.shots[1].videoNodeId, 'video-b');
});
