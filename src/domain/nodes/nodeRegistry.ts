import type { NodeData, NodeType } from '../../types';
import { DEFAULT_SEEDANCE_VIDEO_MODEL_ID } from '../../utils/videoModelRouting.ts';
import type { NodePortDefinition } from '../graph/graphTypes.ts';
import {
  createEmptyScriptDocument,
  createEmptyStoryboardDocument
} from '../storyboard/storyboardDocuments.ts';
import type {
  NodeCapabilities,
  NodeCreationDefaults,
  NodeDefinition
} from './nodeDefinition.ts';

const TYPES = {
  TEXT: '文本' as NodeType,
  IMAGE: '图片' as NodeType,
  VIDEO: '视频' as NodeType,
  AUDIO: '音频' as NodeType,
  SUBJECT: '主体' as NodeType,
  IMAGE_EDITOR: '图片编辑器' as NodeType,
  VIDEO_EDITOR: '视频编辑器' as NodeType,
  SCRIPT: '脚本' as NodeType,
  STORYBOARD: '分镜管理器' as NodeType,
  CAMERA_ANGLE: '镜头角度' as NodeType,
  LOCAL_IMAGE_MODEL: '本地图片模型' as NodeType,
  LOCAL_VIDEO_MODEL: '本地视频模型' as NodeType
} as const;

const idle = 'idle' as NodeData['status'];

const genericDefaults = (): Omit<NodeCreationDefaults, 'type'> => ({
  prompt: '',
  status: idle,
  model: 'Banana Pro',
  aspectRatio: 'Auto',
  resolution: 'Auto'
});

const imageDefaults = (): Omit<NodeCreationDefaults, 'type'> => ({
  ...genericDefaults(),
  model: 'gpt-image-2',
  imageModel: 'gpt-image-2'
});

const videoDefaults = (): Omit<NodeCreationDefaults, 'type'> => ({
  ...genericDefaults(),
  model: DEFAULT_SEEDANCE_VIDEO_MODEL_ID,
  videoModel: DEFAULT_SEEDANCE_VIDEO_MODEL_ID
});

const definitions: NodeDefinition[] = [
  {
    type: TYPES.TEXT,
    label: '文本',
    icon: 'type',
    category: 'input',
    description: '编写提示词或文本内容',
    defaultData: genericDefaults,
    capabilities: { acceptsPrompt: true },
    ports: [
      { id: 'text-output', label: '文本', direction: 'output', dataType: 'text', multiple: true, role: 'text' }
    ]
  },
  {
    type: TYPES.SUBJECT,
    label: '主体',
    icon: 'image',
    category: 'input',
    description: '管理用于生成一致性的主体参考',
    defaultData: () => ({ ...genericDefaults(), model: 'subject-reference' }),
    capabilities: {},
    ports: [
      { id: 'subject-output', label: '主体', direction: 'output', dataType: 'subject', multiple: true, role: 'subject' }
    ]
  },
  {
    type: TYPES.IMAGE,
    label: '图片',
    icon: 'image',
    category: 'generation',
    description: '生成、上传或派生图片',
    defaultData: imageDefaults,
    capabilities: {
      acceptsPrompt: true,
      supportsUpload: true,
      supportsGeneration: true,
      supportsTakes: true
    },
    ports: [
      { id: 'prompt-input', label: '提示词', direction: 'input', dataType: 'text', maxConnections: 1, role: 'prompt' },
      { id: 'reference-images', label: '参考图', direction: 'input', dataType: 'image', multiple: true, maxConnections: 14, ordered: true, role: 'reference' },
      { id: 'subject-references', label: '主体参考', direction: 'input', dataType: 'subject', multiple: true, enabled: true, role: 'subject-reference' },
      { id: 'image-output', label: '图片', direction: 'output', dataType: 'image', multiple: true, role: 'image' }
    ]
  },
  {
    type: TYPES.VIDEO,
    label: '视频',
    icon: 'video',
    category: 'generation',
    description: '生成、上传或派生视频',
    defaultData: videoDefaults,
    capabilities: {
      acceptsPrompt: true,
      supportsUpload: true,
      supportsGeneration: true,
      supportsTakes: true
    },
    ports: [
      { id: 'prompt-input', label: '提示词', direction: 'input', dataType: 'text', maxConnections: 1, role: 'prompt' },
      { id: 'start-frame', label: '首帧', direction: 'input', dataType: 'image', maxConnections: 1, role: 'start-frame' },
      { id: 'end-frame', label: '尾帧', direction: 'input', dataType: 'image', maxConnections: 1, role: 'end-frame' },
      { id: 'reference-images', label: '参考图', direction: 'input', dataType: 'image', multiple: true, maxConnections: 14, ordered: true, role: 'reference' },
      { id: 'subject-references', label: '主体参考', direction: 'input', dataType: 'subject', multiple: true, enabled: true, role: 'subject-reference' },
      { id: 'motion-reference', label: '动作参考', direction: 'input', dataType: 'video', maxConnections: 1, role: 'motion-reference' },
      { id: 'video-output', label: '视频', direction: 'output', dataType: 'video', multiple: true, role: 'video' },
      { id: 'last-frame-output', label: '末帧', direction: 'output', dataType: 'image', multiple: true, role: 'last-frame' }
    ]
  },
  {
    type: TYPES.AUDIO,
    label: '音频',
    icon: 'audio',
    category: 'input',
    description: '预留的音频节点类型',
    defaultData: genericDefaults,
    capabilities: {},
    ports: [
      { id: 'text-input', label: '文本', direction: 'input', dataType: 'text', enabled: false },
      { id: 'reference-audio', label: '参考音频', direction: 'input', dataType: 'audio', multiple: true, enabled: false },
      { id: 'audio-output', label: '音频', direction: 'output', dataType: 'audio', multiple: true, enabled: false }
    ]
  },
  {
    type: TYPES.IMAGE_EDITOR,
    label: '图片编辑器',
    icon: 'image-editor',
    category: 'editing',
    description: '编辑图片并创建派生结果',
    defaultData: imageDefaults,
    capabilities: {
      acceptsPrompt: true,
      supportsUpload: true,
      supportsGeneration: true,
      supportsTakes: true,
      supportsEditor: true
    },
    ports: [
      { id: 'image-input', label: '输入图片', direction: 'input', dataType: 'image', maxConnections: 1, role: 'source-image' },
      { id: 'image-output', label: '图片', direction: 'output', dataType: 'image', multiple: true, role: 'image' }
    ]
  },
  {
    type: TYPES.VIDEO_EDITOR,
    label: '视频编辑器',
    icon: 'video-editor',
    category: 'editing',
    description: '裁剪和编辑视频',
    defaultData: videoDefaults,
    capabilities: { supportsUpload: true, supportsEditor: true },
    ports: [
      { id: 'video-input', label: '输入视频', direction: 'input', dataType: 'video', maxConnections: 1, role: 'source-video' },
      { id: 'video-output', label: '视频', direction: 'output', dataType: 'video', multiple: true, role: 'video' },
      { id: 'last-frame-output', label: '末帧', direction: 'output', dataType: 'image', multiple: true, role: 'last-frame' }
    ]
  },
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
      { id: 'subject-references', label: '主体参考', direction: 'input', dataType: 'subject', multiple: true, enabled: true, role: 'subject-reference' },
      { id: 'script-output', label: '脚本', direction: 'output', dataType: 'script', multiple: true, role: 'script' }
    ]
  },
  {
    type: TYPES.STORYBOARD,
    label: '分镜管理器',
    icon: 'storyboard',
    category: 'story',
    description: '预留的持久化分镜节点类型',
    defaultData: () => ({
      ...genericDefaults(),
      model: 'auto-storyboard',
      storyboardData: createEmptyStoryboardDocument()
    }),
    capabilities: { supportsGeneration: true, supportsEditor: true },
    ports: [
      { id: 'script-input', label: '脚本', direction: 'input', dataType: 'script', required: true, maxConnections: 1, role: 'script' },
      { id: 'subject-references', label: '主体参考', direction: 'input', dataType: 'subject', multiple: true, enabled: true, role: 'subject-reference' },
      { id: 'storyboard-output', label: '分镜', direction: 'output', dataType: 'storyboard', multiple: true, role: 'storyboard' }
    ]
  },
  {
    type: TYPES.CAMERA_ANGLE,
    label: '镜头角度',
    icon: 'camera-angle',
    category: 'editing',
    description: '从现有图片生成新的镜头角度',
    defaultData: () => ({
      ...imageDefaults(),
      model: 'Qwen Camera Angle',
      imageModel: 'qwen-camera-angle'
    }),
    capabilities: { supportsGeneration: true, supportsEditor: true },
    ports: [
      { id: 'image-input', label: '输入图片', direction: 'input', dataType: 'image', maxConnections: 1, role: 'source-image' },
      { id: 'image-output', label: '图片', direction: 'output', dataType: 'image', multiple: true, role: 'image' }
    ]
  },
  {
    type: TYPES.LOCAL_IMAGE_MODEL,
    label: '本地图片模型',
    icon: 'local-image-model',
    category: 'generation',
    description: '使用本地图片模型生成内容',
    defaultData: () => ({
      ...genericDefaults(),
      model: 'local',
      aspectRatio: '1:1',
      localModelType: 'diffusion'
    }),
    capabilities: { acceptsPrompt: true, supportsGeneration: true, supportsTakes: true },
    ports: [
      { id: 'prompt-input', label: '提示词', direction: 'input', dataType: 'text', maxConnections: 1, role: 'prompt' },
      { id: 'reference-images', label: '参考图', direction: 'input', dataType: 'image', multiple: true, maxConnections: 14, ordered: true, role: 'reference' },
      { id: 'image-output', label: '图片', direction: 'output', dataType: 'image', multiple: true, role: 'image' }
    ]
  },
  {
    type: TYPES.LOCAL_VIDEO_MODEL,
    label: '本地视频模型',
    icon: 'local-video-model',
    category: 'generation',
    description: '使用本地视频模型生成内容',
    defaultData: () => ({
      ...genericDefaults(),
      model: 'local',
      aspectRatio: '16:9',
      localModelType: 'diffusion',
      videoDuration: 5
    }),
    capabilities: { acceptsPrompt: true, supportsGeneration: true, supportsTakes: true },
    ports: [
      { id: 'prompt-input', label: '提示词', direction: 'input', dataType: 'text', maxConnections: 1, role: 'prompt' },
      { id: 'start-frame', label: '首帧', direction: 'input', dataType: 'image', maxConnections: 1, role: 'start-frame' },
      { id: 'video-output', label: '视频', direction: 'output', dataType: 'video', multiple: true, role: 'video' }
    ]
  }
];

const definitionByType = new Map<string, NodeDefinition>(
  definitions.map(definition => [definition.type, definition])
);

export function getNodeDefinition(type: unknown): NodeDefinition | undefined {
  return typeof type === 'string' ? definitionByType.get(type) : undefined;
}

export function getNodeLabel(type: unknown): string {
  return getNodeDefinition(type)?.label || String(type ?? '');
}

export function createDefaultNodeData(type: NodeType): NodeCreationDefaults {
  const definition = getNodeDefinition(type);
  if (!definition) {
    throw new Error(`Unknown node type: ${String(type)}`);
  }

  return {
    type: definition.type,
    ...definition.defaultData()
  };
}

export function isKnownNodeType(value: unknown): value is NodeType {
  return typeof value === 'string' && definitionByType.has(value);
}

export function getNodeCapabilities(type: unknown): NodeCapabilities | undefined {
  return getNodeDefinition(type)?.capabilities;
}

export function listNodeDefinitions(): NodeDefinition[] {
  return [...definitions];
}

export function getNodePort(type: unknown, portId: string): NodePortDefinition | undefined {
  return getNodeDefinition(type)?.ports.find(port => port.id === portId);
}

export function getInputPorts(type: unknown): NodePortDefinition[] {
  return getNodeDefinition(type)?.ports.filter(port => port.direction === 'input') || [];
}

export function getOutputPorts(type: unknown): NodePortDefinition[] {
  return getNodeDefinition(type)?.ports.filter(port => port.direction === 'output') || [];
}
