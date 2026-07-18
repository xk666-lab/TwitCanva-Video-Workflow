import type { MediaTake } from '../../types.ts';
import type {
  ScriptDocument,
  StoryboardDocument
} from '../storyboard/storyboardTypes.ts';

export interface MediaGenerationTaskOutput {
  kind?: 'media';
  resultUrl: string;
  take?: MediaTake;
  takes?: MediaTake[];
}

export interface StoryPackageGenerationTaskOutput {
  kind: 'story-package';
  resultUrl?: never;
  take?: never;
  scriptRevision: number;
  storyboardRevision: number;
  scriptData: ScriptDocument;
  storyboardData: StoryboardDocument;
}

export type GenerationTaskOutput =
  | MediaGenerationTaskOutput
  | StoryPackageGenerationTaskOutput;

export type GenerationTaskStatus =
  | 'draft'
  | 'validating'
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export interface GenerationTask {
  schemaVersion: number;
  taskId: string;
  workflowId: string | null;
  nodeId: string;
  operation: string;
  provider: string;
  model: string;
  status: GenerationTaskStatus;
  progress: number;
  progressMessage?: string;
  inputSnapshot: unknown;
  inputHash: string;
  parameters: Record<string, unknown>;
  providerTaskId?: string;
  output?: GenerationTaskOutput;
  error?: {
    code?: string;
    message: string;
    retryable: boolean;
    providerMessage?: string;
    recoverySuggestion?: string;
  };
  retryOfTaskId?: string;
  rootTaskId?: string;
  attempt: number;
  idempotencyKey?: string;
  cancelRequestedAt?: string;
  cancellation?: {
    requestedAt: string;
    providerCancellationSupported: boolean;
  };
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  updatedAt: string;
}
