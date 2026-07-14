import test from 'node:test';
import assert from 'node:assert/strict';

import type { NodeData, NodeGroup, NodeType } from '../types.ts';
import type { CanvasEdge } from '../domain/graph/graphTypes.ts';
import { createDefaultNodeData } from '../domain/nodes/nodeRegistry.ts';
import {
  CURRENT_WORKFLOW_TEMPLATE_SCHEMA_VERSION,
  createWorkflowTemplateDraft,
  instantiateWorkflowTemplate,
  migrateWorkflowTemplate
} from '../domain/templates/workflowTemplates.ts';

const NODE_TYPES = {
  TEXT: '文本' as NodeType,
  IMAGE: '图片' as NodeType,
  VIDEO: '视频' as NodeType,
  SCRIPT: '脚本' as NodeType,
  STORYBOARD: '分镜管理器' as NodeType
} as const;

function node(id: string, type: NodeType, overrides: Partial<NodeData> = {}): NodeData {
  return {
    ...createDefaultNodeData(type),
    id,
    x: 0,
    y: 0,
    parentIds: [],
    ...overrides
  };
}

function edge(
  id: string,
  sourceNodeId: string,
  sourcePortId: string,
  targetNodeId: string,
  targetPortId: string,
  dataType: CanvasEdge['dataType']
): CanvasEdge {
  return {
    schemaVersion: 1,
    id,
    sourceNodeId,
    sourcePortId,
    targetNodeId,
    targetPortId,
    dataType
  };
}

test('template extraction keeps only its internal graph and documents cut boundary ports', () => {
  const outsidePrompt = node('outside-prompt', NODE_TYPES.TEXT, { prompt: 'External input' });
  const image = node('image', NODE_TYPES.IMAGE, { x: 120, y: 80, prompt: 'Product photo' });
  const video = node('video', NODE_TYPES.VIDEO, { x: 620, y: 80, prompt: 'Product motion' });
  const outsideVideo = node('outside-video', NODE_TYPES.VIDEO);
  const graphEdges = [
    edge('incoming', outsidePrompt.id, 'text-output', image.id, 'prompt-input', 'text'),
    edge('internal', image.id, 'image-output', video.id, 'start-frame', 'image'),
    edge('outgoing', video.id, 'video-output', outsideVideo.id, 'motion-reference', 'video')
  ];

  const template = createWorkflowTemplateDraft({
    title: '产品动画',
    description: '输入文案后生成短视频',
    nodes: [outsidePrompt, image, video, outsideVideo],
    edges: graphEdges,
    groups: [],
    selectedNodeIds: [image.id, video.id],
    now: '2026-07-15T00:00:00.000Z'
  });

  assert.equal(template.schemaVersion, CURRENT_WORKFLOW_TEMPLATE_SCHEMA_VERSION);
  assert.deepEqual(template.graph.nodes.map(item => item.id), ['image', 'video']);
  assert.deepEqual(template.graph.edges.map(item => item.id), ['internal']);
  assert.deepEqual(template.graph.nodes.find(item => item.id === image.id)?.parentIds, []);
  assert.deepEqual(template.graph.nodes.find(item => item.id === video.id)?.parentIds, ['image']);
  assert.deepEqual(template.inputs.map(port => [port.nodeId, port.portId]), [['image', 'prompt-input']]);
  assert.deepEqual(template.outputs.map(port => [port.nodeId, port.portId]), [['video', 'video-output']]);
  assert.equal(template.graph.nodes.find(item => item.id === image.id)?.x, 0);
  assert.equal(template.graph.nodes.find(item => item.id === video.id)?.x, 500);
});

test('template extraction preserves configuration but strips media, task, and external asset runtime state', () => {
  const source = node('image', NODE_TYPES.IMAGE, {
    prompt: 'A reusable product scene',
    status: 'loading' as NodeData['status'],
    resultUrl: '/library/images/source.png',
    takes: [{
      id: 'take-1',
      nodeId: 'image',
      type: 'image',
      url: '/library/images/source.png',
      prompt: 'A reusable product scene',
      model: 'gpt-image-2',
      createdAt: '2026-07-15T00:00:00.000Z',
      isHero: true
    }],
    heroTakeId: 'take-1',
    lastFrame: '/library/images/last.png',
    activeTaskId: 'task-active',
    lastTaskId: 'task-last',
    errorMessage: 'old error',
    generationStartTime: 123,
    subjectAssetId: 'subject-1',
    characterReferenceUrls: ['/library/images/character.png'],
    inputUrl: '/library/images/input.png',
    editorCanvasData: 'data:image/png;base64,AAAA',
    editorBackgroundUrl: '/library/images/editor.png',
    futureNodeField: { retained: true }
  } as Partial<NodeData>);

  const template = createWorkflowTemplateDraft({
    title: '干净模板',
    nodes: [source],
    edges: [],
    groups: [],
    selectedNodeIds: [source.id],
    now: '2026-07-15T00:00:00.000Z'
  });
  const saved = template.graph.nodes[0] as NodeData & Record<string, unknown>;

  assert.equal(saved.prompt, 'A reusable product scene');
  assert.equal(saved.model, source.model);
  assert.equal(saved.status, 'idle');
  assert.equal(saved.resultUrl, undefined);
  assert.equal(saved.takes, undefined);
  assert.equal(saved.heroTakeId, undefined);
  assert.equal(saved.lastFrame, undefined);
  assert.equal(saved.activeTaskId, undefined);
  assert.equal(saved.lastTaskId, undefined);
  assert.equal(saved.errorMessage, undefined);
  assert.equal(saved.subjectAssetId, undefined);
  assert.equal(saved.characterReferenceUrls, undefined);
  assert.equal(saved.editorCanvasData, undefined);
  assert.deepEqual(saved.futureNodeField, { retained: true });
});

test('template insertion creates a disconnected cloned graph with fresh IDs and synchronized legacy parents', () => {
  const source = node('image', NODE_TYPES.IMAGE, { x: 0, y: 0, groupId: 'group-1' });
  const target = node('video', NODE_TYPES.VIDEO, { x: 440, y: 0, groupId: 'group-1' });
  const group: NodeGroup = { id: 'group-1', nodeIds: [source.id, target.id], label: '镜头流程' };
  const template = createWorkflowTemplateDraft({
    title: '镜头流程',
    nodes: [source, target],
    edges: [edge('edge-1', source.id, 'image-output', target.id, 'start-frame', 'image')],
    groups: [group],
    selectedNodeIds: [source.id, target.id],
    now: '2026-07-15T00:00:00.000Z'
  });
  const ids = ['new-image', 'new-video', 'new-edge', 'new-group'];

  const inserted = instantiateWorkflowTemplate(template, {
    anchor: { x: 1000, y: 500 },
    idFactory: () => ids.shift() || 'unexpected-id',
    now: '2026-07-15T00:00:01.000Z'
  });
  const insertedVideo = inserted.nodes.find(item => item.id === 'new-video');

  assert.deepEqual(inserted.nodes.map(item => item.id), ['new-image', 'new-video']);
  assert.deepEqual(inserted.nodes.map(item => [item.x, item.y]), [[1000, 500], [1440, 500]]);
  assert.deepEqual(inserted.edges, [edge('new-edge', 'new-image', 'image-output', 'new-video', 'start-frame', 'image')]);
  assert.deepEqual(insertedVideo?.parentIds, ['new-image']);
  assert.equal(insertedVideo?.groupId, 'new-group');
  assert.deepEqual(inserted.groups, [{ id: 'new-group', nodeIds: ['new-image', 'new-video'], label: '镜头流程' }]);
});

test('template insertion remaps storyboard references and clears stale shot media state', () => {
  const script = node('script', NODE_TYPES.SCRIPT, {
    scriptData: {
      schemaVersion: 1,
      title: '故事',
      sourceText: '一段故事',
      synopsis: '',
      styleAnchor: '',
      characterDNA: {},
      referenceAssets: [],
      revision: 1,
      createdAt: '2026-07-15T00:00:00.000Z',
      updatedAt: '2026-07-15T00:00:00.000Z'
    }
  });
  const image = node('image', NODE_TYPES.IMAGE);
  const storyboard = node('storyboard', NODE_TYPES.STORYBOARD, {
    storyboardData: {
      schemaVersion: 1,
      sourceScriptNodeId: script.id,
      selectedImageModel: 'gpt-image-2',
      revision: 1,
      createdAt: '2026-07-15T00:00:00.000Z',
      updatedAt: '2026-07-15T00:00:00.000Z',
      shots: [{
        id: 'shot-1',
        order: 0,
        sceneNumber: 1,
        description: '产品特写',
        cameraAngle: 'Close up',
        mood: 'bright',
        imageNodeId: image.id,
        activeTaskId: 'stale-task',
        lastTaskId: 'stale-last-task',
        status: 'image-ready',
        error: 'old error',
        revision: 1
      }]
    }
  });
  const group: NodeGroup = {
    id: 'story-group',
    nodeIds: [script.id, image.id, storyboard.id],
    label: '分镜模板',
    storyContext: {
      story: '一段故事',
      scripts: [],
      scriptNodeId: script.id,
      storyboardNodeId: storyboard.id
    }
  };
  const template = createWorkflowTemplateDraft({
    title: '分镜模板',
    nodes: [script, image, storyboard],
    edges: [edge('script-edge', script.id, 'script-output', storyboard.id, 'script-input', 'script')],
    groups: [group],
    selectedNodeIds: [script.id, image.id, storyboard.id],
    now: '2026-07-15T00:00:00.000Z'
  });
  const ids = ['new-script', 'new-image', 'new-storyboard', 'new-edge', 'new-group'];

  const inserted = instantiateWorkflowTemplate(template, {
    anchor: { x: 0, y: 0 },
    idFactory: () => ids.shift() || 'unexpected-id',
    now: '2026-07-15T00:00:01.000Z'
  });
  const insertedStoryboard = inserted.nodes.find(item => item.id === 'new-storyboard');
  const insertedGroup = inserted.groups[0];
  const shot = insertedStoryboard?.storyboardData?.shots[0];

  assert.equal(insertedStoryboard?.storyboardData?.sourceScriptNodeId, 'new-script');
  assert.equal(shot?.imageNodeId, undefined);
  assert.equal(shot?.activeTaskId, undefined);
  assert.equal(shot?.lastTaskId, undefined);
  assert.equal(shot?.error, undefined);
  assert.equal(shot?.status, 'draft');
  assert.equal(insertedGroup.storyContext?.scriptNodeId, 'new-script');
  assert.equal(insertedGroup.storyContext?.storyboardNodeId, 'new-storyboard');
});

test('template migration is idempotent and preserves unknown template and node fields', () => {
  const raw = {
    id: 'template-1',
    title: '旧模板',
    graph: {
      nodes: [{
        id: 'text-1',
        type: '文本',
        x: 0,
        y: 0,
        prompt: 'hello',
        status: 'idle',
        model: 'gpt-image-2',
        aspectRatio: 'Auto',
        resolution: 'Auto',
        futureNode: { preserved: true }
      }],
      groups: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      futureGraph: { preserved: true }
    },
    futureTemplate: { preserved: true }
  };
  const snapshot = structuredClone(raw);

  const once = migrateWorkflowTemplate(raw, { warn: () => undefined });
  const twice = migrateWorkflowTemplate(once, { warn: () => undefined });

  assert.equal(once.schemaVersion, CURRENT_WORKFLOW_TEMPLATE_SCHEMA_VERSION);
  assert.equal(once.graph.nodes[0].type, NODE_TYPES.TEXT);
  assert.deepEqual((once.graph.nodes[0] as unknown as Record<string, unknown>).futureNode, { preserved: true });
  assert.deepEqual((once.graph as Record<string, unknown>).futureGraph, { preserved: true });
  assert.deepEqual((once as unknown as Record<string, unknown>).futureTemplate, { preserved: true });
  assert.deepEqual(raw, snapshot);
  assert.deepEqual(twice, once);
});
