import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_UPLOAD_PREFIX = 'twitcanva/library';

function envBool(value, fallback = false) {
    if (value === undefined || value === null || value === '') return fallback;
    return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function textArray(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.flatMap(item => textArray(item));
    const text = String(value || '').trim();
    return text ? [text] : [];
}

function stripQueryAndHash(value) {
    return String(value || '').split('#')[0].split('?')[0];
}

function isLocalHost(hostname) {
    return ['localhost', '127.0.0.1', '::1'].includes(String(hostname || '').toLowerCase());
}

function isPublicHttpUrl(value) {
    if (!/^https?:\/\//i.test(value)) return false;
    try {
        const parsed = new URL(value);
        return !isLocalHost(parsed.hostname);
    } catch {
        return false;
    }
}

function normalizeForPathCheck(value) {
    return String(value || '').toLowerCase();
}

function assertInsideDirectory(filePath, directory) {
    const resolvedFile = path.resolve(filePath);
    const resolvedDirectory = path.resolve(directory);
    const fileCheck = normalizeForPathCheck(resolvedFile);
    const dirCheck = normalizeForPathCheck(resolvedDirectory);

    if (fileCheck !== dirCheck && !fileCheck.startsWith(`${dirCheck}${path.sep}`)) {
        throw new Error(`Refusing to read asset outside library directory: ${filePath}`);
    }
    return resolvedFile;
}

function parseLibraryReference(rawReference, libraryDir) {
    const raw = String(rawReference || '').trim();
    if (!raw) return null;

    if (isPublicHttpUrl(raw)) {
        return { publicUrl: raw };
    }

    let candidate = raw;
    if (/^https?:\/\//i.test(raw)) {
        try {
            const parsed = new URL(raw);
            if (!isLocalHost(parsed.hostname)) return { publicUrl: raw };
            candidate = parsed.pathname;
        } catch {
            return null;
        }
    }

    candidate = decodeURIComponent(stripQueryAndHash(candidate));
    if (!candidate.startsWith('/library/')) return null;

    const relativePath = candidate.replace(/^\/library\//, '');
    const absolutePath = assertInsideDirectory(path.join(libraryDir, relativePath), libraryDir);
    return { relativePath: relativePath.replace(/\\/g, '/'), absolutePath };
}

function contentTypeForPath(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.mov': 'video/quicktime',
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.m4a': 'audio/mp4'
    }[ext] || 'application/octet-stream';
}

function trimSlashes(value) {
    return String(value || '').replace(/^\/+|\/+$/g, '');
}

function makeObjectKey(prefix, relativePath) {
    const safeRelativePath = String(relativePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
    const safePrefix = trimSlashes(prefix || DEFAULT_UPLOAD_PREFIX);
    return safePrefix ? `${safePrefix}/${safeRelativePath}` : safeRelativePath;
}

function makePublicUrl(publicBaseUrl, key) {
    return `${String(publicBaseUrl || '').replace(/\/+$/, '')}/${String(key || '').split('/').map(encodeURIComponent).join('/')}`;
}

function makeSupabasePublicUrl(projectUrl, bucket, key, publicBaseUrl) {
    if (publicBaseUrl) return makePublicUrl(publicBaseUrl, key);
    const base = String(projectUrl || '').replace(/\/+$/, '');
    return `${base}/storage/v1/object/public/${encodeURIComponent(bucket)}/${String(key || '').split('/').map(encodeURIComponent).join('/')}`;
}

export function getAssetStorageConfig(env = process.env) {
    const driver = env.ASSET_STORAGE_DRIVER || env.STORAGE_DRIVER || '';
    const normalizedDriver = String(driver).trim().toLowerCase();

    if (normalizedDriver === 'supabase') {
        const projectUrl = env.SUPABASE_URL || env.SUPABASE_PROJECT_URL || '';
        const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || '';
        const bucket = env.SUPABASE_STORAGE_BUCKET || env.ASSET_SUPABASE_BUCKET || '';
        const publicBaseUrl = env.SUPABASE_STORAGE_PUBLIC_BASE_URL || env.ASSET_SUPABASE_PUBLIC_BASE_URL || '';
        const prefix = env.ASSET_UPLOAD_PREFIX || env.SUPABASE_UPLOAD_PREFIX || DEFAULT_UPLOAD_PREFIX;

        const missing = [];
        if (!projectUrl) missing.push('SUPABASE_URL');
        if (!serviceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
        if (!bucket) missing.push('SUPABASE_STORAGE_BUCKET');

        if (missing.length > 0) {
            throw new Error(`Supabase Storage is enabled but missing: ${missing.join(', ')}`);
        }

        return {
            enabled: true,
            driver: 'supabase',
            projectUrl,
            serviceRoleKey,
            bucket,
            publicBaseUrl,
            prefix
        };
    }

    const bucket = env.ASSET_S3_BUCKET || env.S3_BUCKET || env.R2_BUCKET || '';
    const endpoint = env.ASSET_S3_ENDPOINT || env.S3_ENDPOINT || env.R2_ENDPOINT || '';
    const region = env.ASSET_S3_REGION || env.S3_REGION || env.R2_REGION || 'auto';
    const accessKeyId = env.ASSET_S3_ACCESS_KEY_ID || env.S3_ACCESS_KEY_ID || env.R2_ACCESS_KEY_ID || '';
    const secretAccessKey = env.ASSET_S3_SECRET_ACCESS_KEY || env.S3_SECRET_ACCESS_KEY || env.R2_SECRET_ACCESS_KEY || '';
    const publicBaseUrl = env.ASSET_S3_PUBLIC_BASE_URL || env.ASSET_PUBLIC_BASE_URL || env.S3_PUBLIC_BASE_URL || env.R2_PUBLIC_BASE_URL || '';
    const prefix = env.ASSET_UPLOAD_PREFIX || env.S3_UPLOAD_PREFIX || env.R2_UPLOAD_PREFIX || DEFAULT_UPLOAD_PREFIX;
    const forcePathStyle = envBool(env.ASSET_S3_FORCE_PATH_STYLE ?? env.S3_FORCE_PATH_STYLE ?? env.R2_FORCE_PATH_STYLE, true);

    const configured = ['s3', 'r2'].includes(normalizedDriver)
        || Boolean(bucket || endpoint || publicBaseUrl || accessKeyId || secretAccessKey);

    if (!configured) {
        return { enabled: false };
    }

    const missing = [];
    if (!bucket) missing.push('ASSET_S3_BUCKET/R2_BUCKET');
    if (!publicBaseUrl) missing.push('ASSET_S3_PUBLIC_BASE_URL/R2_PUBLIC_BASE_URL');
    if (!accessKeyId) missing.push('ASSET_S3_ACCESS_KEY_ID/R2_ACCESS_KEY_ID');
    if (!secretAccessKey) missing.push('ASSET_S3_SECRET_ACCESS_KEY/R2_SECRET_ACCESS_KEY');

    if (missing.length > 0) {
        throw new Error(`Object storage is enabled but missing: ${missing.join(', ')}`);
    }

    return {
        enabled: true,
        driver: 's3',
        bucket,
        endpoint,
        region,
        accessKeyId,
        secretAccessKey,
        publicBaseUrl,
        prefix,
        forcePathStyle
    };
}

async function putS3Object(object, config) {
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
    const client = new S3Client({
        region: config.region,
        endpoint: config.endpoint || undefined,
        forcePathStyle: config.forcePathStyle,
        credentials: {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey
        }
    });

    await client.send(new PutObjectCommand({
        Bucket: object.bucket,
        Key: object.key,
        Body: object.body,
        ContentType: object.contentType,
        CacheControl: object.cacheControl || 'public, max-age=31536000, immutable'
    }));
}

async function putSupabaseObject(object, config) {
    const base = String(config.projectUrl || '').replace(/\/+$/, '');
    const url = `${base}/storage/v1/object/${encodeURIComponent(config.bucket)}/${String(object.key || '').split('/').map(encodeURIComponent).join('/')}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${config.serviceRoleKey}`,
            apikey: config.serviceRoleKey,
            'Content-Type': object.contentType,
            'Cache-Control': 'public, max-age=31536000, immutable',
            'x-upsert': 'true'
        },
        body: object.body
    });

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Supabase Storage upload failed (${response.status}): ${text.slice(0, 300)}`);
    }
}

export async function makePublicAssetUrls(rawReferences, options = {}) {
    const env = options.env || process.env;
    const libraryDir = options.libraryDir || env.LIBRARY_DIR || path.join(process.cwd(), 'library');
    let config = null;
    const getConfig = () => {
        if (!config) config = getAssetStorageConfig(env);
        return config;
    };
    const urls = [];
    const seen = new Set();

    for (const rawReference of textArray(rawReferences)) {
        const parsed = parseLibraryReference(rawReference, libraryDir);
        if (!parsed) continue;

        if (parsed.publicUrl) {
            if (!seen.has(parsed.publicUrl)) {
                urls.push(parsed.publicUrl);
                seen.add(parsed.publicUrl);
            }
            continue;
        }

        const activeConfig = getConfig();
        if (!activeConfig.enabled) continue;

        if (!fs.existsSync(parsed.absolutePath)) {
            throw new Error(`Local asset not found for upload: ${parsed.absolutePath}`);
        }

        const key = makeObjectKey(activeConfig.prefix, parsed.relativePath);
        const publicUrl = activeConfig.driver === 'supabase'
            ? makeSupabasePublicUrl(activeConfig.projectUrl, activeConfig.bucket, key, activeConfig.publicBaseUrl)
            : makePublicUrl(activeConfig.publicBaseUrl, key);
        if (seen.has(publicUrl)) continue;

        const putObject = options.putObject || ((object) => {
            if (activeConfig.driver === 'supabase') return putSupabaseObject(object, activeConfig);
            return putS3Object(object, activeConfig);
        });
        await putObject({
            bucket: activeConfig.bucket,
            key,
            body: fs.readFileSync(parsed.absolutePath),
            contentType: contentTypeForPath(parsed.absolutePath),
            sourcePath: parsed.absolutePath,
            publicUrl
        });

        urls.push(publicUrl);
        seen.add(publicUrl);
    }

    return urls;
}
