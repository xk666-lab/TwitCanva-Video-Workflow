import { DEFAULT_SEEDANCE_VIDEO_MODEL_ID } from './videoModelRouting.ts';

export type StoryboardVideoProviderId = 'google' | 'seedance' | 'kling' | 'hailuo';
export type StoryboardVideoTier = 'Fast' | 'Standard' | 'Pro' | 'Master' | 'Motion';

export interface StoryboardVideoModelVariant {
  id: string;
  provider: StoryboardVideoProviderId;
  providerLabel: string;
  familyName: string;
  variantName: string;
  tier: StoryboardVideoTier;
  durations: number[];
  resolutions: string[];
  recommended?: boolean;
  durationResolutionMap?: Record<number, string[]>;
  note?: string;
}

export interface StoryboardVideoProviderFamily {
  id: StoryboardVideoProviderId;
  name: string;
  variants: StoryboardVideoModelVariant[];
}

export interface StoryboardVideoSettings {
  model: string;
  duration: number;
  resolution: string;
}

export const STORYBOARD_VIDEO_RESOLUTIONS = ['Auto', '1080p', '768p', '720p', '512p'];

export const STORYBOARD_VIDEO_MODEL_VARIANTS: StoryboardVideoModelVariant[] = [
  {
    id: 'veo-3.1',
    provider: 'google',
    providerLabel: 'Google',
    familyName: 'Veo 3.1',
    variantName: 'Fast',
    tier: 'Fast',
    durations: [4, 6, 8],
    resolutions: ['Auto', '720p', '1080p'],
    durationResolutionMap: {
      4: ['Auto', '720p'],
      6: ['Auto', '720p'],
      8: ['Auto', '720p', '1080p']
    },
    note: 'Current backend route uses veo-3.1-fast-generate-preview.'
  },
  {
    id: DEFAULT_SEEDANCE_VIDEO_MODEL_ID,
    provider: 'seedance',
    providerLabel: 'Seedance',
    familyName: 'Seedance 2.0',
    variantName: 'Standard',
    tier: 'Standard',
    durations: [5, 10],
    resolutions: ['720p']
  },
  {
    id: 'kling-v2-1',
    provider: 'kling',
    providerLabel: 'Kling AI',
    familyName: 'Kling V2.1',
    variantName: 'Pro',
    tier: 'Pro',
    durations: [5, 10],
    resolutions: ['Auto', '720p', '1080p'],
    recommended: true
  },
  {
    id: 'kling-v2-1-master',
    provider: 'kling',
    providerLabel: 'Kling AI',
    familyName: 'Kling V2.1',
    variantName: 'Master',
    tier: 'Master',
    durations: [5, 10],
    resolutions: ['Auto', '720p', '1080p']
  },
  {
    id: 'kling-v2-5-turbo',
    provider: 'kling',
    providerLabel: 'Kling AI',
    familyName: 'Kling V2.5',
    variantName: 'Turbo',
    tier: 'Fast',
    durations: [5, 10],
    resolutions: ['Auto', '720p', '1080p']
  },
  {
    id: 'kling-v2-6',
    provider: 'kling',
    providerLabel: 'Kling AI',
    familyName: 'Kling 2.6',
    variantName: 'Motion',
    tier: 'Motion',
    durations: [5, 10],
    resolutions: ['Auto', '720p', '1080p']
  },
  {
    id: 'hailuo-2.3',
    provider: 'hailuo',
    providerLabel: 'Hailuo AI',
    familyName: 'Hailuo 2.3',
    variantName: 'Standard',
    tier: 'Standard',
    durations: [5],
    resolutions: ['768p', '1080p']
  },
  {
    id: 'hailuo-2.3-fast',
    provider: 'hailuo',
    providerLabel: 'Hailuo AI',
    familyName: 'Hailuo 2.3',
    variantName: 'Fast',
    tier: 'Fast',
    durations: [5],
    resolutions: ['768p', '1080p']
  },
  {
    id: 'hailuo-02',
    provider: 'hailuo',
    providerLabel: 'Hailuo AI',
    familyName: 'Hailuo 02',
    variantName: 'Pro',
    tier: 'Pro',
    durations: [5],
    resolutions: ['768p', '1080p']
  }
];

export function getDefaultStoryboardVideoModelId(): string {
  return 'veo-3.1';
}

export function getStoryboardVideoModelVariant(modelId: string): StoryboardVideoModelVariant {
  return STORYBOARD_VIDEO_MODEL_VARIANTS.find(variant => variant.id === modelId)
    || STORYBOARD_VIDEO_MODEL_VARIANTS.find(variant => variant.id === getDefaultStoryboardVideoModelId())
    || STORYBOARD_VIDEO_MODEL_VARIANTS[0];
}

export function getStoryboardVideoProviderFamilies(): StoryboardVideoProviderFamily[] {
  const providerOrder: StoryboardVideoProviderId[] = ['google', 'seedance', 'kling', 'hailuo'];
  return providerOrder
    .map(provider => {
      const variants = STORYBOARD_VIDEO_MODEL_VARIANTS.filter(variant => variant.provider === provider);
      return {
        id: provider,
        name: variants[0]?.providerLabel || provider,
        variants
      };
    })
    .filter(family => family.variants.length > 0);
}

export function getStoryboardVideoVariantLabel(modelId: string): string {
  const variant = getStoryboardVideoModelVariant(modelId);
  return `${variant.familyName} ${variant.variantName}`;
}

export function getAvailableStoryboardVideoResolutions(modelId: string, duration: number): string[] {
  const variant = getStoryboardVideoModelVariant(modelId);
  return variant.durationResolutionMap?.[duration] || variant.resolutions || STORYBOARD_VIDEO_RESOLUTIONS;
}

export function normalizeStoryboardVideoSettings(settings: StoryboardVideoSettings): StoryboardVideoSettings {
  const variant = getStoryboardVideoModelVariant(settings.model);
  let duration = settings.duration;

  if (!variant.durations.includes(duration)) {
    duration = variant.durations[0];
  }

  const allowedResolutions = getAvailableStoryboardVideoResolutions(variant.id, duration);
  let resolution = settings.resolution;

  if (!allowedResolutions.includes(resolution)) {
    if (allowedResolutions.includes('720p')) resolution = '720p';
    else resolution = allowedResolutions[0];
  }

  return {
    model: variant.id,
    duration,
    resolution
  };
}
