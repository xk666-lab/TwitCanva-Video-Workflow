/**
 * seedance.js
 *
 * Seedance 2.0 video generation through an OpenAI-compatible/NewAPI endpoint.
 */

import { makePublicAssetUrls } from './assetStorage.js';

const DEFAULT_BASE_URL = 'https://api.aixoras.com';
const DEFAULT_SUBMIT_PATH = '/v1/video/generations';
const DEFAULT_STATUS_PATH = '/v1/video/generations/{task_id}';

function envBool(value, fallback = false) {
    if (value === undefined || value === null || value === '') return fallback;
    return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function joinUrl(baseUrl, path) {
    const base = String(baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
    const suffix = String(path || '').startsWith('/') ? path : `/${path}`;
    return `${base}${suffix}`;
}

function authHeaders(apiKey) {
    return {
        'Authorization': `Bearer ${String(apiKey || '').replace(/^Bearer\s+/i, '').trim()}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    };
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function firstText(value) {
    if (!value) return '';
    if (Array.isArray(value)) return value.find(Boolean) || '';
    return String(value || '');
}

function textArray(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.flatMap(item => textArray(item));
    const text = String(value || '').trim();
    return text ? [text] : [];
}

function collectVideoUrls(value, urls = []) {
    if (!value) return urls;
    if (typeof value === 'string') {
        if (/^https?:\/\//i.test(value) || value.startsWith('/library/') || value.startsWith('data:video/')) {
            urls.push(value);
        }
        return urls;
    }
    if (Array.isArray(value)) {
        value.forEach(item => collectVideoUrls(item, urls));
        return urls;
    }
    if (typeof value === 'object') {
        [
            'video', 'video_url', 'videoUrl', 'url', 'result_url', 'resultUrl',
            'output', 'output_url', 'outputUrl', 'download_url', 'downloadUrl',
            'mp4_url', 'mp4Url', 'file_url', 'fileUrl', 'videos', 'outputs',
            'metadata', 'data', 'result', 'content'
        ].forEach(key => collectVideoUrls(value[key], urls));
    }
    return urls;
}

function pickBestVideoUrl(urls) {
    const uniqueUrls = [...new Set(urls)];
    return uniqueUrls.find(url => /\.(mp4|mov|webm)(\?|$)/i.test(url))
        || uniqueUrls.find(url => !/\/v1\/videos\/[^/]+\/content/i.test(url))
        || uniqueUrls[0];
}

function extractTaskId(raw) {
    if (!raw || typeof raw !== 'object') return '';
    for (const key of ['task_id', 'taskId', 'id', 'request_id', 'generation_id']) {
        if (raw[key]) return String(raw[key]);
    }
    for (const key of ['data', 'result', 'task']) {
        const nested = raw[key];
        if (nested && typeof nested === 'object') {
            const found = extractTaskId(nested);
            if (found) return found;
        }
    }
    return '';
}

function taskStatus(raw) {
    const values = [];
    const visit = (value) => {
        if (!value || typeof value !== 'object') return;
        for (const key of ['status', 'state', 'task_status', 'taskStatus', 'gen_status']) {
            if (value[key]) values.push(String(value[key]).toUpperCase());
        }
        for (const key of ['data', 'result', 'task']) visit(value[key]);
    };
    visit(raw);
    return values[0] || '';
}

function isSuccessStatus(status) {
    return ['SUCCESS', 'SUCCEED', 'SUCCEEDED', 'COMPLETED', 'COMPLETE', 'DONE', 'FINISHED', 'READY'].includes(status);
}

function isFailureStatus(status) {
    return ['FAIL', 'FAILED', 'FAILURE', 'ERROR', 'ERRORED', 'CANCELED', 'CANCELLED', 'REJECTED', 'EXPIRED'].includes(status);
}

function modelForMode(modelId, hasImage) {
    const configured = process.env.SEEDANCE_MODEL || 'bytedance/seedance-2.0/text-to-video';
    let model = modelId && modelId.startsWith('bytedance/') ? modelId : configured;
    if (hasImage) {
        model = model.replace('/text-to-video', '/image-to-video');
    } else {
        model = model.replace('/image-to-video', '/text-to-video');
    }
    return model;
}

const SEEDANCE_SUPPORTED_DURATIONS = [5, 10];

function nearestSeedanceDuration(seconds) {
    const numeric = Number(seconds);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    return SEEDANCE_SUPPORTED_DURATIONS.reduce((best, candidate) =>
        Math.abs(candidate - numeric) < Math.abs(best - numeric) ? candidate : best
    );
}

function promptExplicitDuration(prompt) {
    const text = String(prompt || '');
    const match = text.match(/(\d{1,2})\s*(?:秒钟|秒)/)
        || text.match(/(\d{1,2})\s*(?:s|sec|secs|second|seconds)\b/i)
        || text.match(/(?:时长|持续|duration|length)\D{0,8}(\d{1,2})/i);
    return match ? nearestSeedanceDuration(match[1]) : null;
}

function inferSeedanceDurationFromPrompt(prompt) {
    const text = String(prompt || '').trim();
    if (!text) return null;

    const explicit = promptExplicitDuration(text);
    if (explicit) return explicit;

    const lower = text.toLowerCase();
    const longActionCues = [
        '长镜头', '完整过程', '逐渐', '缓慢', '连续', '然后', '随后', '接着', '再',
        '从', '到', '转场', '过渡', '推进并', '回头后',
        'long take', 'full scene', 'slowly', 'gradually', 'then', 'after that',
        'transition', 'sequence', 'continuous'
    ];
    const cueCount = longActionCues.filter(cue => lower.includes(cue)).length;
    const beatCount = text.split(/[，。；、,.!?;]+/).filter(part => part.trim().length > 0).length;

    if (cueCount >= 2 || beatCount >= 4 || text.length >= 120) return 10;
    return 5;
}

function resolveSeedanceDuration(prompt, requestedDuration) {
    const requested = nearestSeedanceDuration(requestedDuration);
    if (requested) return { seconds: requested, source: 'manual' };

    const inferred = inferSeedanceDurationFromPrompt(prompt);
    if (inferred) return { seconds: inferred, source: 'prompt' };

    const configured = nearestSeedanceDuration(process.env.SEEDANCE_DURATION_SECONDS);
    if (configured) return { seconds: configured, source: 'env' };

    return { seconds: 5, source: 'default' };
}

function publicReferenceUrl(rawReference) {
    const raw = firstText(rawReference).trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw) && !/localhost|127\.0\.0\.1/i.test(raw)) return raw;

    let libraryPath = raw;
    if (/^https?:\/\//i.test(raw)) {
        try {
            const parsed = new URL(raw);
            libraryPath = `${parsed.pathname}${parsed.search}`;
        } catch {
            return '';
        }
    }
    if (!libraryPath.startsWith('/library/')) return '';

    const publicBase = (process.env.SEEDANCE_PUBLIC_ASSET_BASE_URL || process.env.PUBLIC_ASSET_BASE_URL || '').replace(/\/+$/, '');
    if (!publicBase) return '';
    return `${publicBase}${libraryPath}`;
}

function publicReferenceUrls(rawReferences) {
    return [...new Set(textArray(rawReferences)
        .map(rawReference => publicReferenceUrl(rawReference))
        .filter(Boolean))];
}

async function referencesForSeedance(rawReferences, dataUrls, assetStorage) {
    const rawReferenceList = textArray(rawReferences);
    const storageUrls = await makePublicAssetUrls(rawReferenceList, assetStorage || {});
    const uniqueReferenceCount = new Set(rawReferenceList).size;
    if (storageUrls.length > 0 && storageUrls.length >= uniqueReferenceCount) {
        return storageUrls;
    }

    const publicUrls = publicReferenceUrls(rawReferenceList);
    const mergedPublicUrls = [...new Set([...storageUrls, ...publicUrls])];
    if (mergedPublicUrls.length > 0) return mergedPublicUrls;

    const fallbacks = textArray(dataUrls);
    if (fallbacks.some(value => value.startsWith('data:'))) {
        throw new Error('Seedance image-to-video requires publicly accessible HTTP(S) image URLs. Start a public tunnel and set SEEDANCE_PUBLIC_ASSET_BASE_URL.');
    }

    return [...new Set(fallbacks.filter(value => /^https?:\/\//i.test(value) && !/localhost|127\.0\.0\.1/i.test(value)))];
}

async function referenceForSeedance(rawReference, dataUrl, assetStorage) {
    return (await referencesForSeedance(rawReference, dataUrl, assetStorage))[0] || '';
}

function promptExplicitDurationSafe(prompt) {
    const text = String(prompt || '');
    const match = text.match(/(\d{1,2})\s*(?:\u79d2\u949f|\u79d2)/)
        || text.match(/(\d{1,2})\s*(?:s|sec|secs|second|seconds)\b/i)
        || text.match(/(?:\u65f6\u957f|\u6301\u7eed|duration|length)\D{0,8}(\d{1,2})/i);
    return match ? nearestSeedanceDuration(match[1]) : null;
}

function inferSeedanceDurationFromPromptSafe(prompt) {
    const text = String(prompt || '').trim();
    if (!text) return null;

    const explicit = promptExplicitDurationSafe(text);
    if (explicit) return explicit;

    const lower = text.toLowerCase();
    const longActionCues = [
        '\u957f\u955c\u5934', '\u5b8c\u6574\u8fc7\u7a0b', '\u9010\u6e10', '\u7f13\u6162',
        '\u8fde\u7eed', '\u7136\u540e', '\u968f\u540e', '\u63a5\u7740', '\u518d',
        '\u4ece', '\u5230', '\u8f6c\u573a', '\u8fc7\u6e21', '\u63a8\u8fdb',
        '\u56de\u5934', '\u5207\u5230', '\u62c9\u8fd1',
        'long take', 'full scene', 'slowly', 'gradually', 'then', 'after that',
        'transition', 'sequence', 'continuous', 'push in', 'zoom in', 'cut to'
    ];
    const cueCount = longActionCues.filter(cue => lower.includes(cue)).length;
    const beatCount = text.split(/[,.!?;:\n\uFF0C\u3002\uFF1B\u3001\uFF1F\uFF01]+/).filter(part => part.trim().length > 0).length;

    if (cueCount >= 2 || beatCount >= 4 || text.length >= 120) return 10;
    return 5;
}

function resolveSeedanceDurationSafe(prompt, requestedDuration) {
    const requested = nearestSeedanceDuration(requestedDuration);
    if (requested) return { seconds: requested, source: 'manual' };

    const inferred = inferSeedanceDurationFromPromptSafe(prompt);
    if (inferred) return { seconds: inferred, source: 'prompt' };

    const configured = nearestSeedanceDuration(process.env.SEEDANCE_DURATION_SECONDS);
    if (configured) return { seconds: configured, source: 'env' };

    return { seconds: 5, source: 'default' };
}

async function assertPublicHttpReference(url, label) {
    if (!/^https?:\/\//i.test(url) || /localhost|127\.0\.0\.1/i.test(url)) {
        throw new Error(`${label} must be a publicly accessible HTTP(S) URL: ${url}`);
    }

    const timeoutMs = Number(process.env.SEEDANCE_REFERENCE_CHECK_TIMEOUT_MS || 15000);
    const maxAttempts = Math.max(1, Number(process.env.SEEDANCE_REFERENCE_CHECK_RETRIES || 3));
    const retryDelayMs = Number(process.env.SEEDANCE_REFERENCE_CHECK_RETRY_DELAY_MS || 1000);
    let lastError = null;

    const fetchWithTimeout = async (method) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            return await fetch(url, {
                method,
                headers: method === 'GET' ? { Range: 'bytes=0-0' } : undefined,
                signal: controller.signal
            });
        } finally {
            clearTimeout(timer);
        }
    };

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            const headResponse = await fetchWithTimeout('HEAD');
            if (headResponse.ok) return;
            lastError = new Error(`HEAD HTTP ${headResponse.status}`);
        } catch (error) {
            lastError = error;
        }

        try {
            const getResponse = await fetchWithTimeout('GET');
            if (getResponse.ok) return;
            lastError = new Error(`GET HTTP ${getResponse.status}`);
        } catch (error) {
            lastError = error;
        }

        if (attempt < maxAttempts) {
            await sleep(retryDelayMs * attempt);
        }
    }

    throw new Error(`${label} is not reachable from the public internet. Check SEEDANCE_PUBLIC_ASSET_BASE_URL or restart the tunnel. Details: ${lastError?.message || 'unknown error'}`);
}

async function parseJsonResponse(response, label) {
    const text = await response.text();
    let raw;
    try {
        raw = text ? JSON.parse(text) : {};
    } catch {
        throw new Error(`${label} returned non-JSON response (${response.status}): ${text.slice(0, 300)}`);
    }
    if (!response.ok) {
        throw new Error(`${label} failed (${response.status}): ${JSON.stringify(raw).slice(0, 600)}`);
    }
    return raw;
}

async function pollSeedanceTask({ taskId, apiKey, baseUrl, statusPath, timeoutMs, intervalMs }) {
    const startedAt = Date.now();
    let lastRaw = null;
    const path = statusPath || DEFAULT_STATUS_PATH;
    const maxNetworkRetries = Math.max(0, Number(process.env.SEEDANCE_POLL_NETWORK_RETRIES || 5));
    let consecutiveNetworkFailures = 0;

    while (Date.now() - startedAt < timeoutMs) {
        const url = joinUrl(baseUrl, path.replace('{task_id}', encodeURIComponent(taskId)));
        let response;
        try {
            response = await fetch(url, { headers: authHeaders(apiKey) });
        } catch (error) {
            consecutiveNetworkFailures += 1;
            if (consecutiveNetworkFailures > maxNetworkRetries) {
                throw new Error(
                    `Seedance status network failed after ${maxNetworkRetries} retries: ${error?.message || error}`,
                    { cause: error }
                );
            }
            console.warn(`[Seedance] Status network error for task ${taskId}; retrying (${consecutiveNetworkFailures}/${maxNetworkRetries})`);
            await sleep(Math.min(intervalMs, 1000));
            continue;
        }

        if (response.status === 429 || response.status >= 500) {
            consecutiveNetworkFailures += 1;
            const responseText = await response.text().catch(() => '');
            if (consecutiveNetworkFailures > maxNetworkRetries) {
                throw new Error(`Seedance status failed after ${maxNetworkRetries} retries (HTTP ${response.status}): ${responseText.slice(0, 300)}`);
            }
            console.warn(`[Seedance] Temporary status HTTP ${response.status} for task ${taskId}; retrying (${consecutiveNetworkFailures}/${maxNetworkRetries})`);
            await sleep(Math.min(intervalMs, 1000));
            continue;
        }

        consecutiveNetworkFailures = 0;
        const raw = await parseJsonResponse(response, 'Seedance status');
        lastRaw = raw;

        const videoUrl = pickBestVideoUrl(collectVideoUrls(raw));
        if (videoUrl) return videoUrl;

        const status = taskStatus(raw);
        if (isFailureStatus(status)) {
            throw new Error(`Seedance generation failed: ${JSON.stringify(raw).slice(0, 600)}`);
        }
        if (isSuccessStatus(status)) {
            throw new Error(`Seedance task completed but no video URL was returned: ${JSON.stringify(raw).slice(0, 600)}`);
        }
        await sleep(intervalMs);
    }

    throw new Error(`Seedance generation timed out: ${taskId}. Last response: ${JSON.stringify(lastRaw).slice(0, 600)}`);
}

export async function generateSeedanceVideo({
    prompt,
    imageBase64,
    imageReference,
    videoReference,
    audioReference,
    modelId,
    aspectRatio,
    resolution,
    duration,
    generateAudio,
    watermark,
    apiKey,
    baseUrl,
    submitPath,
    statusPath,
    assetStorage
}) {
    if (!apiKey) {
        throw new Error('SEEDANCE_API_KEY is required');
    }

    const referenceImages = await referencesForSeedance(imageReference, imageBase64, assetStorage);
    const referenceVideo = await referenceForSeedance(videoReference, videoReference, assetStorage);
    const referenceAudio = await referenceForSeedance(audioReference, audioReference, assetStorage);
    const { seconds: durationSeconds, source: durationSource } = resolveSeedanceDurationSafe(prompt, duration);
    const resolvedResolution = resolution && resolution !== 'Auto'
        ? resolution
        : (process.env.SEEDANCE_RESOLUTION || '720p');
    const resolvedAspectRatio = aspectRatio && aspectRatio !== 'Auto'
        ? aspectRatio
        : (process.env.SEEDANCE_ASPECT_RATIO || '16:9');

    const metadata = {
        aspect_ratio: resolvedAspectRatio,
        generate_audio: generateAudio ?? envBool(process.env.SEEDANCE_GENERATE_AUDIO, false),
        watermark: watermark ?? envBool(process.env.SEEDANCE_WATERMARK, false)
    };

    if (referenceImages.length > 0) metadata.reference_images = referenceImages;
    if (referenceVideo) metadata.reference_videos = [referenceVideo];
    if (referenceAudio) metadata.reference_audios = [referenceAudio];

    const body = {
        model: modelForMode(modelId, referenceImages.length > 0),
        prompt,
        duration: durationSeconds,
        seconds: String(durationSeconds),
        resolution: resolvedResolution,
        size: resolvedResolution,
        metadata
    };

    if (process.env.SEEDANCE_MODE) {
        body.mode = process.env.SEEDANCE_MODE;
    }

    if (referenceImages.length > 0) {
        // Public URL preflight is useful for setup, but Node 24 on Windows can
        // crash on some reset/aborted fetches. Keep it opt-in and let Seedance
        // return the provider error by default.
        if (envBool(process.env.SEEDANCE_VALIDATE_REFERENCES, false)) {
            for (const [index, url] of referenceImages.entries()) {
                await assertPublicHttpReference(url, `Seedance reference image #${index + 1}`);
            }
        }
        body.images = referenceImages;
        body.image = referenceImages[0];
        body.input_reference = referenceImages[0];
    }

    const submitUrl = joinUrl(baseUrl, submitPath || DEFAULT_SUBMIT_PATH);
    console.log(`[Seedance] Submitting ${body.model}, duration: ${durationSeconds}s (${durationSource}), resolution: ${resolvedResolution}, reference images: ${referenceImages.length}`);

    const response = await fetch(submitUrl, {
        method: 'POST',
        headers: authHeaders(apiKey),
        body: JSON.stringify(body)
    });
    const raw = await parseJsonResponse(response, 'Seedance submit');

    const videoUrl = pickBestVideoUrl(collectVideoUrls(raw));
    if (videoUrl) return videoUrl;

    const taskId = extractTaskId(raw);
    if (!taskId) {
        throw new Error(`Seedance did not return a task id or video URL: ${JSON.stringify(raw).slice(0, 600)}`);
    }
    console.log(`[Seedance] Task created: ${taskId}`);

    return await pollSeedanceTask({
        taskId,
        apiKey,
        baseUrl,
        statusPath,
        timeoutMs: Number(process.env.SEEDANCE_POLL_TIMEOUT_MS || 600000),
        intervalMs: Number(process.env.SEEDANCE_POLL_INTERVAL_MS || 5000)
    });
}
