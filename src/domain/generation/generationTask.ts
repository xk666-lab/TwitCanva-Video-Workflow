import type { MediaTake } from '../../types.ts';

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
  inputSnapshot: unknown;
  inputHash: string;
  parameters: Record<string, unknown>;
  providerTaskId?: string;
  output?: {
    resultUrl: string;
    take?: MediaTake;
  };
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
