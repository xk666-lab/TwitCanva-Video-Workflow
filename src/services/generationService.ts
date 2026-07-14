/**
 * generationService.ts
 * 
 * Frontend service layer for AI content generation.
 * Proxies requests to backend API which handles multiple providers:
 * - Image: Gemini Pro, Kling AI
 * - Video: Veo 3.1, Kling AI
 */

import type { GenerationTask } from '../domain/generation/generationTask.ts';
import type { GenerateStoryPackageTaskInput } from '../domain/storyboard/storyboardTypes.ts';
import type { MediaTake } from '../types';
import { apiGet, apiPost } from './apiClient.ts';

export interface GenerateImageParams {
  prompt: string;
  aspectRatio?: string;
  resolution?: string;
  imageBase64?: string | string[]; // Supports single image or array of images
  imageModel?: string; // Image model version (e.g., 'gemini-pro', 'kling-v2')
  nodeId?: string; // ID of the node initiating generation
  // Kling V1.5 reference settings
  klingReferenceMode?: 'subject' | 'face';
  klingFaceIntensity?: number; // 0-100
  klingSubjectIntensity?: number; // 0-100
}

export interface GenerateVideoParams {
  prompt: string;
  imageBase64?: string | string[]; // For Image-to-Video references
  lastFrameBase64?: string; // For frame-to-frame interpolation (end frame)
  aspectRatio?: string;
  resolution?: string; // Add resolution to params
  duration?: number; // Video duration in seconds (e.g., 5, 6, 8, 10)
  videoModel?: string; // Video model version (e.g., 'veo-3.1', 'kling-v2-1')
  motionReferenceUrl?: string; // For Kling 2.6 motion control
  generateAudio?: boolean; // For Kling 2.6 and Veo 3.1 native audio (default: true)
  nodeId?: string; // ID of the node initiating generation
}

const normalizeNetworkError = (error: unknown, mediaType: 'image' | 'video'): Error => {
  const message = error instanceof Error ? error.message : String(error);
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return new Error(`Unable to reach the local backend while generating ${mediaType}. Check that the backend on port 3001 is still running.`);
  }
  return error instanceof Error ? error : new Error(message);
};

export interface GenerationResult {
  resultUrl: string;
  take?: MediaTake;
  task: GenerationTask;
}

export interface GenerationRequestOptions {
  workflowId?: string | null;
  idempotencyKey?: string;
  pollIntervalMs?: number;
  onTaskCreated?: (task: GenerationTask) => void;
}

interface GenerationTaskResponse {
  task: GenerationTask;
  reused?: boolean;
}

interface GenerationTaskQueryResponse {
  tasks: GenerationTask[];
}

export class GenerationTaskError extends Error {
  task: GenerationTask;

  constructor(task: GenerationTask) {
    super(task.error?.message || `Generation task ${task.status}`);
    this.name = 'GenerationTaskError';
    this.task = task;
  }
}

const isTerminalTask = (task: GenerationTask): boolean =>
  task.status === 'succeeded' || task.status === 'failed' || task.status === 'cancelled';

const delay = (milliseconds: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, milliseconds));

export const getGenerationTask = async (taskId: string): Promise<GenerationTask> => {
  const response = await apiGet<GenerationTaskResponse>(`/api/generation-tasks/${encodeURIComponent(taskId)}`);
  return response.task;
};

export const queryGenerationTasks = async (filters: {
  taskIds?: string[];
  nodeIds?: string[];
  workflowId?: string | null;
  statuses?: GenerationTask['status'][];
}): Promise<GenerationTask[]> => {
  const response = await apiPost<GenerationTaskQueryResponse>('/api/generation-tasks/query', filters);
  return response.tasks;
};

export const cancelGenerationTask = async (taskId: string): Promise<GenerationTask> => {
  const response = await apiPost<GenerationTaskResponse>(
    `/api/generation-tasks/${encodeURIComponent(taskId)}/cancel`
  );
  return response.task;
};

export const retryGenerationTask = async (taskId: string): Promise<GenerationTask> => {
  const response = await apiPost<GenerationTaskResponse>(
    `/api/generation-tasks/${encodeURIComponent(taskId)}/retry`
  );
  return response.task;
};

export const waitForGenerationTask = async (
  taskId: string,
  pollIntervalMs = 2000
): Promise<GenerationTask> => {
  while (true) {
    const task = await getGenerationTask(taskId);
    if (isTerminalTask(task)) return task;
    await delay(Math.max(0, pollIntervalMs));
  }
};

export async function submitGenerationTask(
  operation: 'generate-image' | 'generate-video' | 'generate-local-image' | 'generate-story-package',
  inputSnapshot: GenerateImageParams | GenerateVideoParams | GenerateStoryPackageTaskInput | Record<string, unknown>,
  options: GenerationRequestOptions = {}
): Promise<GenerationTask> {
  const nodeId = typeof inputSnapshot.nodeId === 'string' ? inputSnapshot.nodeId : undefined;
  const task = (await apiPost<GenerationTaskResponse>('/api/generation-tasks', {
    workflowId: options.workflowId ?? null,
    nodeId,
    operation,
    inputSnapshot,
    idempotencyKey: options.idempotencyKey
  })).task;

  options.onTaskCreated?.(task);
  return task;
}

export const submitImageGeneration = async (
  params: GenerateImageParams,
  options: GenerationRequestOptions = {}
): Promise<GenerationTask> => {
  const normalizedParams = {
    ...params,
    imageModel: params.imageModel === 'gpt-image-1.5' ? 'gpt-image-2' : params.imageModel
  };
  return submitGenerationTask('generate-image', normalizedParams, options);
};

export const submitVideoGeneration = (
  params: GenerateVideoParams,
  options: GenerationRequestOptions = {}
): Promise<GenerationTask> => submitGenerationTask('generate-video', params, options);

export const submitStoryPackageGeneration = (
  params: GenerateStoryPackageTaskInput,
  options: GenerationRequestOptions = {}
): Promise<GenerationTask> => submitGenerationTask('generate-story-package', params, options);

/**
 * Generates an image by calling the backend API
 */
export const generateImage = async (
  params: GenerateImageParams,
  options: GenerationRequestOptions = {}
): Promise<GenerationResult> => {
  try {
    const task = await submitImageGeneration(params, options);
    const terminalTask = isTerminalTask(task)
      ? task
      : await waitForGenerationTask(task.taskId, options.pollIntervalMs);
    if (terminalTask.status !== 'succeeded' || !terminalTask.output?.resultUrl) {
      throw new GenerationTaskError(terminalTask);
    }
    return {
      resultUrl: terminalTask.output.resultUrl,
      take: terminalTask.output.take,
      task: terminalTask
    };

  } catch (error) {
    console.error("Image Generation Error:", error);
    throw normalizeNetworkError(error, 'image');
  }
};

/**
 * Generates a video by calling the backend API
 */
export const generateVideo = async (
  params: GenerateVideoParams,
  options: GenerationRequestOptions = {}
): Promise<GenerationResult> => {
  try {
    const task = await submitVideoGeneration(params, options);
    const terminalTask = isTerminalTask(task)
      ? task
      : await waitForGenerationTask(task.taskId, options.pollIntervalMs);
    if (terminalTask.status !== 'succeeded' || !terminalTask.output?.resultUrl) {
      throw new GenerationTaskError(terminalTask);
    }
    return {
      resultUrl: terminalTask.output.resultUrl,
      take: terminalTask.output.take,
      task: terminalTask
    };

  } catch (error) {
    console.error("Video Generation Error:", error);
    throw normalizeNetworkError(error, 'video');
  }
};
