export interface StoryboardImageModelOption {
  id: string;
  name: string;
  provider: 'openai' | 'google' | 'kling';
}

export const STORYBOARD_IMAGE_MODELS: StoryboardImageModelOption[] = [
  { id: 'gpt-image-2', name: 'GPT Image 2', provider: 'openai' },
  { id: 'gemini-pro', name: 'Nano Banana Pro', provider: 'google' },
  { id: 'kling-v1-5', name: 'Kling V1.5', provider: 'kling' },
  { id: 'kling-v2-1', name: 'Kling V2.1', provider: 'kling' }
];

export function getStoryboardImageModelName(modelId: string): string {
  return STORYBOARD_IMAGE_MODELS.find(model => model.id === modelId)?.name || modelId;
}
