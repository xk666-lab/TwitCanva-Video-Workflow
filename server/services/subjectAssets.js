import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const SUBJECT_ASSET_SCHEMA_VERSION = 1;
export const MAX_SUBJECT_REFERENCE_IMAGES = 4;

const MAX_NAME_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_SOURCE_URL_LENGTH = 2048;
const ALLOWED_CREATE_FIELDS = new Set(['name', 'description', 'sourceUrl', 'sourceUrls']);
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F]/;

export class SubjectAssetValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'SubjectAssetValidationError';
    }
}

export class SubjectAssetStorageError extends Error {
    constructor(message) {
        super(message);
        this.name = 'SubjectAssetStorageError';
    }
}

export function isSubjectAssetId(value) {
    return typeof value === 'string' && UUID_PATTERN.test(value);
}

function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
}

function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function hasTraversalSegment(value) {
    return String(value).split(/[\\/]+/).some(segment => segment === '.' || segment === '..');
}

function isAbsolutePathLike(value) {
    const candidate = String(value || '');
    return path.isAbsolute(candidate)
        || path.posix.isAbsolute(candidate)
        || path.win32.isAbsolute(candidate)
        || /^[a-zA-Z]:/.test(candidate);
}

function isInsideDirectory(rootDir, targetPath) {
    const relative = path.relative(path.resolve(rootDir), path.resolve(targetPath));
    return relative === ''
        || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function trimRequiredText(value, label, maxLength) {
    if (typeof value !== 'string') {
        throw new SubjectAssetValidationError(`${label} must be a string.`);
    }
    const text = value.trim();
    if (!text) throw new SubjectAssetValidationError(`${label} is required.`);
    if (text.length > maxLength) {
        throw new SubjectAssetValidationError(`${label} must be ${maxLength} characters or fewer.`);
    }
    if (CONTROL_CHARACTER_PATTERN.test(text)) {
        throw new SubjectAssetValidationError(`${label} contains unsupported control characters.`);
    }
    return text;
}

function trimOptionalText(value, label, maxLength) {
    if (typeof value !== 'string') {
        throw new SubjectAssetValidationError(`${label} must be a string.`);
    }
    const text = value.trim();
    if (!text) return undefined;
    if (text.length > maxLength) {
        throw new SubjectAssetValidationError(`${label} must be ${maxLength} characters or fewer.`);
    }
    if (CONTROL_CHARACTER_PATTERN.test(text)) {
        throw new SubjectAssetValidationError(`${label} contains unsupported control characters.`);
    }
    return text;
}

function decodePathRepeatedly(value) {
    let decoded = value;
    for (let index = 0; index < 4; index += 1) {
        try {
            const next = decodeURIComponent(decoded);
            if (next === decoded) return decoded;
            decoded = next;
        } catch {
            throw new SubjectAssetValidationError('Image source path contains invalid URL encoding.');
        }
    }
    return decoded;
}

function sourceValuesFromPayload(payload) {
    const hasSourceUrl = hasOwn(payload, 'sourceUrl');
    const hasSourceUrls = hasOwn(payload, 'sourceUrls');
    if (hasSourceUrl === hasSourceUrls) {
        throw new SubjectAssetValidationError('Provide exactly one of sourceUrl or sourceUrls.');
    }

    if (hasSourceUrl) {
        if (typeof payload.sourceUrl !== 'string') {
            throw new SubjectAssetValidationError('sourceUrl must be a string.');
        }
        return [payload.sourceUrl];
    }

    if (!Array.isArray(payload.sourceUrls) || payload.sourceUrls.length === 0) {
        throw new SubjectAssetValidationError('sourceUrls must be a non-empty array.');
    }
    if (payload.sourceUrls.length > MAX_SUBJECT_REFERENCE_IMAGES) {
        throw new SubjectAssetValidationError(`sourceUrls accepts at most ${MAX_SUBJECT_REFERENCE_IMAGES} images.`);
    }
    if (payload.sourceUrls.some(sourceUrl => typeof sourceUrl !== 'string')) {
        throw new SubjectAssetValidationError('sourceUrls must contain only strings.');
    }
    return payload.sourceUrls;
}

function normalizeCreatePayload(payload) {
    if (!isPlainObject(payload)) {
        throw new SubjectAssetValidationError('Subject asset payload must be an object.');
    }
    for (const key of Object.keys(payload)) {
        if (!ALLOWED_CREATE_FIELDS.has(key)) {
            throw new SubjectAssetValidationError(`Unsupported subject asset field: ${key}.`);
        }
    }

    const name = trimRequiredText(payload.name, 'name', MAX_NAME_LENGTH);
    const description = hasOwn(payload, 'description')
        ? trimOptionalText(payload.description, 'description', MAX_DESCRIPTION_LENGTH)
        : undefined;
    const sourceUrls = sourceValuesFromPayload(payload).map(sourceUrl => {
        const value = sourceUrl.trim();
        if (!value) throw new SubjectAssetValidationError('Image source URL is required.');
        if (value.length > MAX_SOURCE_URL_LENGTH) {
            throw new SubjectAssetValidationError(`Image source URL must be ${MAX_SOURCE_URL_LENGTH} characters or fewer.`);
        }
        if (CONTROL_CHARACTER_PATTERN.test(value)) {
            throw new SubjectAssetValidationError('Image source URL contains unsupported control characters.');
        }
        return value;
    });

    return { name, description, sourceUrls };
}

function resolveLocalImageSource(sourceUrl, libraryDir) {
    if (sourceUrl.startsWith('data:')) {
        throw new SubjectAssetValidationError('Data URLs are not accepted for subject assets.');
    }
    if (/^https?:\/\//i.test(sourceUrl) || sourceUrl.startsWith('//')) {
        throw new SubjectAssetValidationError('Remote image URLs are not accepted for subject assets.');
    }
    if (!sourceUrl.startsWith('/library/')) {
        throw new SubjectAssetValidationError('Image source must be a local /library/ path.');
    }

    const rawPath = sourceUrl.split(/[?#]/, 1)[0];
    const decodedPath = decodePathRepeatedly(rawPath);
    if (!decodedPath.startsWith('/library/')) {
        throw new SubjectAssetValidationError('Image source must be a local /library/ path.');
    }
    const relativePath = decodedPath.slice('/library/'.length);
    if (!relativePath || hasTraversalSegment(relativePath) || isAbsolutePathLike(relativePath)) {
        throw new SubjectAssetValidationError('Image source path traversal is not allowed.');
    }

    const absolutePath = path.resolve(libraryDir, relativePath);
    if (!isInsideDirectory(libraryDir, absolutePath)) {
        throw new SubjectAssetValidationError('Image source must stay inside the library directory.');
    }
    if (!fs.existsSync(absolutePath)) {
        throw new SubjectAssetValidationError('Image source file was not found.');
    }

    let realLibraryDir;
    let realSourcePath;
    try {
        realLibraryDir = fs.realpathSync(libraryDir);
        realSourcePath = fs.realpathSync(absolutePath);
    } catch {
        throw new SubjectAssetValidationError('Image source file was not found.');
    }
    if (!isInsideDirectory(realLibraryDir, realSourcePath)) {
        throw new SubjectAssetValidationError('Image source must stay inside the library directory.');
    }

    const stats = fs.statSync(realSourcePath);
    if (!stats.isFile()) {
        throw new SubjectAssetValidationError('Image source must be a file.');
    }
    const extension = path.extname(realSourcePath).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(extension)) {
        throw new SubjectAssetValidationError('Image source must be a supported image file, not video or other media.');
    }

    return { absolutePath: realSourcePath, extension };
}

function isOwnedSubjectAssetUrl(value) {
    return typeof value === 'string'
        && /^\/library\/subject-assets\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpe?g|webp|gif)$/i.test(value);
}

function normalizeStoredRecord(value) {
    if (!isPlainObject(value)
        || value.schemaVersion !== SUBJECT_ASSET_SCHEMA_VERSION
        || !isSubjectAssetId(value.id)
        || typeof value.name !== 'string'
        || !value.name.trim()
        || value.name.length > MAX_NAME_LENGTH
        || CONTROL_CHARACTER_PATTERN.test(value.name)
        || value.type !== 'image'
        || !isOwnedSubjectAssetUrl(value.url)
        || !Array.isArray(value.referenceImages)
        || value.referenceImages.length === 0
        || value.referenceImages.length > MAX_SUBJECT_REFERENCE_IMAGES
        || value.referenceImages.some(referenceImage => !isOwnedSubjectAssetUrl(referenceImage))
        || value.referenceImages[0] !== value.url
        || typeof value.createdAt !== 'string'
        || typeof value.updatedAt !== 'string') {
        return null;
    }

    const record = {
        schemaVersion: SUBJECT_ASSET_SCHEMA_VERSION,
        id: value.id,
        name: value.name,
        type: 'image',
        url: value.url,
        referenceImages: [...value.referenceImages],
        createdAt: value.createdAt,
        updatedAt: value.updatedAt
    };
    if (typeof value.description === 'string' && value.description.trim()) {
        if (value.description.length > MAX_DESCRIPTION_LENGTH || CONTROL_CHARACTER_PATTERN.test(value.description)) {
            return null;
        }
        record.description = value.description;
    }
    return record;
}

function readSubjectAssetRecord(recordPath) {
    try {
        return normalizeStoredRecord(JSON.parse(fs.readFileSync(recordPath, 'utf8')));
    } catch {
        return null;
    }
}

function subjectAssetRecordPath(subjectAssetsDir, id) {
    const recordPath = path.resolve(subjectAssetsDir, `${id}.json`);
    return isInsideDirectory(subjectAssetsDir, recordPath) ? recordPath : null;
}

function ownedMediaPath(url, libraryDir, subjectAssetsDir) {
    if (!isOwnedSubjectAssetUrl(url)) return null;
    const relativePath = url.slice('/library/'.length);
    const mediaPath = path.resolve(libraryDir, relativePath);
    return isInsideDirectory(subjectAssetsDir, mediaPath) ? mediaPath : null;
}

function timestampFrom(clock) {
    const value = clock();
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
        throw new SubjectAssetStorageError('Subject asset clock returned an invalid timestamp.');
    }
    return date.toISOString();
}

export function writeSubjectAssetRecordAtomically(recordPath, record) {
    const directory = path.dirname(recordPath);
    const tempPath = path.join(directory, `.${path.basename(recordPath)}.${crypto.randomUUID()}.tmp`);
    try {
        fs.writeFileSync(tempPath, JSON.stringify(record, null, 2), { encoding: 'utf8', flag: 'wx' });
        fs.renameSync(tempPath, recordPath);
    } finally {
        if (fs.existsSync(tempPath)) fs.rmSync(tempPath, { force: true });
    }
}

export function createSubjectAssetService(options = {}) {
    const libraryDir = options.libraryDir;
    if (typeof libraryDir !== 'string' || !libraryDir.trim()) {
        throw new SubjectAssetStorageError('Library directory is not configured.');
    }

    const resolvedLibraryDir = path.resolve(libraryDir);
    const subjectAssetsDir = path.join(resolvedLibraryDir, 'subject-assets');
    const idFactory = options.idFactory || crypto.randomUUID;
    const clock = options.now || (() => new Date());
    const writeRecord = options.writeRecord || writeSubjectAssetRecordAtomically;
    const unlinkFile = options.unlinkFile || fs.unlinkSync;

    function nextId() {
        for (let attempt = 0; attempt < 10; attempt += 1) {
            const id = idFactory();
            if (!isSubjectAssetId(id)) {
                throw new SubjectAssetStorageError('Subject asset id generator returned an invalid UUID.');
            }
            const recordPath = subjectAssetRecordPath(subjectAssetsDir, id);
            if (recordPath && !fs.existsSync(recordPath)) return id;
        }
        throw new SubjectAssetStorageError('Could not allocate a unique subject asset id.');
    }

    function get(id) {
        if (!isSubjectAssetId(id)) {
            throw new SubjectAssetValidationError('Invalid subject asset id.');
        }
        const recordPath = subjectAssetRecordPath(subjectAssetsDir, id);
        if (!recordPath || !fs.existsSync(recordPath)) return null;
        return readSubjectAssetRecord(recordPath);
    }

    function list() {
        if (!fs.existsSync(subjectAssetsDir)) return [];
        return fs.readdirSync(subjectAssetsDir)
            .filter(fileName => fileName.endsWith('.json'))
            .map(fileName => {
                const id = fileName.slice(0, -'.json'.length);
                if (!isSubjectAssetId(id)) return null;
                const recordPath = subjectAssetRecordPath(subjectAssetsDir, id);
                if (!recordPath) return null;
                const record = readSubjectAssetRecord(recordPath);
                return record?.id === id ? record : null;
            })
            .filter(Boolean)
            .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
    }

    function create(payload) {
        const input = normalizeCreatePayload(payload);
        const sourceFiles = [];
        const seenSourcePaths = new Set();
        for (const sourceUrl of input.sourceUrls) {
            const source = resolveLocalImageSource(sourceUrl, resolvedLibraryDir);
            if (seenSourcePaths.has(source.absolutePath)) continue;
            seenSourcePaths.add(source.absolutePath);
            sourceFiles.push(source);
        }

        fs.mkdirSync(subjectAssetsDir, { recursive: true });
        const id = nextId();
        const recordPath = subjectAssetRecordPath(subjectAssetsDir, id);
        const copiedPaths = [];
        try {
            const referenceImages = sourceFiles.map(source => {
                const fileName = `${crypto.randomUUID()}${source.extension}`;
                const targetPath = path.join(subjectAssetsDir, fileName);
                if (fs.existsSync(targetPath)) {
                    throw new SubjectAssetStorageError('Could not allocate a unique subject asset media filename.');
                }
                copiedPaths.push(targetPath);
                fs.copyFileSync(source.absolutePath, targetPath, fs.constants.COPYFILE_EXCL);
                return `/library/subject-assets/${fileName}`;
            });
            const createdAt = timestampFrom(clock);
            const record = {
                schemaVersion: SUBJECT_ASSET_SCHEMA_VERSION,
                id,
                name: input.name,
                ...(input.description ? { description: input.description } : {}),
                type: 'image',
                url: referenceImages[0],
                referenceImages,
                createdAt,
                updatedAt: createdAt
            };
            writeRecord(recordPath, record);
            return record;
        } catch (error) {
            if (recordPath && fs.existsSync(recordPath)) {
                try {
                    fs.unlinkSync(recordPath);
                } catch {
                    // Preserve the original creation error while making a best-effort unpublish attempt.
                }
            }
            for (const copiedPath of copiedPaths) {
                try {
                    if (fs.existsSync(copiedPath)) fs.unlinkSync(copiedPath);
                } catch {
                    // Preserve the original creation error while making a best-effort cleanup attempt.
                }
            }
            throw error;
        }
    }

    function remove(id) {
        if (!isSubjectAssetId(id)) {
            throw new SubjectAssetValidationError('Invalid subject asset id.');
        }
        const recordPath = subjectAssetRecordPath(subjectAssetsDir, id);
        if (!recordPath || !fs.existsSync(recordPath)) return false;
        const record = readSubjectAssetRecord(recordPath);
        if (!record) return false;

        try {
            unlinkFile(recordPath);
        } catch {
            throw new SubjectAssetStorageError('Could not unpublish subject asset metadata.');
        }

        const mediaPaths = [...new Set([
            ownedMediaPath(record.url, resolvedLibraryDir, subjectAssetsDir),
            ...record.referenceImages.map(url => ownedMediaPath(url, resolvedLibraryDir, subjectAssetsDir))
        ].filter(Boolean))];
        const cleanupErrors = [];
        for (const mediaPath of mediaPaths) {
            try {
                if (fs.existsSync(mediaPath)) unlinkFile(mediaPath);
            } catch (error) {
                cleanupErrors.push(error);
            }
        }
        if (cleanupErrors.length > 0) {
            throw new SubjectAssetStorageError('Subject asset was unpublished, but owned media cleanup failed.');
        }
        return true;
    }

    return { create, list, get, remove, delete: remove };
}

export const createSubjectAssetsService = createSubjectAssetService;
