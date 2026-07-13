import type { NodeData, NodeType } from '../../types';
import type { NodePortDefinition } from '../graph/graphTypes';

export type NodeCategory = 'input' | 'generation' | 'editing' | 'story' | 'utility';

export type NodeIconKey =
  | 'type'
  | 'image'
  | 'video'
  | 'audio'
  | 'image-editor'
  | 'video-editor'
  | 'storyboard'
  | 'camera-angle'
  | 'local-image-model'
  | 'local-video-model';

export interface NodeCapabilities {
  acceptsPrompt?: boolean;
  supportsUpload?: boolean;
  supportsGeneration?: boolean;
  supportsTakes?: boolean;
  supportsEditor?: boolean;
}

export type NodeCreationDefaults = Pick<
  NodeData,
  'type' | 'prompt' | 'status' | 'model' | 'aspectRatio' | 'resolution'
> & Partial<Omit<NodeData, 'id' | 'x' | 'y'>>;

export interface NodeDefinition {
  type: NodeType;
  label: string;
  icon: NodeIconKey;
  category: NodeCategory;
  description?: string;
  defaultData: () => Omit<NodeCreationDefaults, 'type'>;
  capabilities: NodeCapabilities;
  ports: NodePortDefinition[];
}
