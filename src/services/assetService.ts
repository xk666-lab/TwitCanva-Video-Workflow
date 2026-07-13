/**
 * assetService.ts
 * 
 * Service for managing assets (images/videos) via the backend API.
 */

import { apiPost } from './apiClient';

/**
 * Uploads a base64 data URL to the server and returns the file path URL.
 * 
 * @param dataUrl The base64 data URL to upload
 * @param type 'image' | 'video'
 * @param prompt Optional prompt associated with the asset
 * @returns Promise resolving to the server-side URL (e.g., /library/images/xyz.png)
 */
export const uploadAsset = async (
    dataUrl: string,
    type: 'image' | 'video' = 'image',
    prompt: string = ''
): Promise<string> => {
    try {
        // If it's already a server URL (not base64), return it as is
        if (!dataUrl.startsWith('data:')) {
            return dataUrl;
        }

        const endpoint = type === 'image' ? '/api/assets/images' : '/api/assets/videos';
        const result = await apiPost<{ url: string }>(endpoint, {
            data: dataUrl,
            prompt: prompt
        });
        return result.url;
    } catch (error) {
        console.error('Asset upload failed:', error);
        throw error;
    }
};
