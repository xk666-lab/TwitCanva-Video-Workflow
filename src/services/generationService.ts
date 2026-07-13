/**
 * generationService.ts
 * 
 * Frontend service layer for AI content generation.
 * Proxies requests to backend API which handles multiple providers:
 * - Image: Gemini Pro, Kling AI
 * - Video: Veo 3.1, Kling AI
 */

import type { MediaTake } from '../types';
import { apiPost } from './apiClient';

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
}

/**
 * Generates an image by calling the backend API
 */
export const generateImage = async (params: GenerateImageParams): Promise<GenerationResult> => {
  try {
    const normalizedParams = {
      ...params,
      imageModel: params.imageModel === 'gpt-image-1.5' ? 'gpt-image-2' : params.imageModel
    };

    const data = await apiPost<GenerationResult>('/api/generate-image', normalizedParams);
    if (!data.resultUrl) {
      throw new Error("No image data returned from server");
    }
    return data;

  } catch (error) {
    console.error("Image Generation Error:", error);
    throw normalizeNetworkError(error, 'image');
  }
};

/**
 * Generates a video by calling the backend API
 */
export const generateVideo = async (params: GenerateVideoParams): Promise<GenerationResult> => {
  try {
    const data = await apiPost<GenerationResult>('/api/generate-video', params);
    if (!data.resultUrl) {
      throw new Error("No video data returned from server");
    }
    return data;

  } catch (error) {
    console.error("Video Generation Error:", error);
    throw normalizeNetworkError(error, 'video');
  }
};
