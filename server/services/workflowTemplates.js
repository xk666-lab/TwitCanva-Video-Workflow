import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const WORKFLOW_TEMPLATE_SCHEMA_VERSION = 1;
export const MAX_WORKFLOW_TEMPLATE_NODES = 200;
export const MAX_WORKFLOW_TEMPLATE_EDGES = 800;
export const MAX_WORKFLOW_TEMPLATE_GROUPS = 100;
export const MAX_WORKFLOW_TEMPLATE_BYTES = 2 * 1024 * 1024;

const MAX_TITLE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_ID_LENGTH = 256;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F]/;
const ALLOWED_DRAFT_FIELDS = new Set(['schemaVersion', 'title', 'description', 'graph', 'inputs', 'outputs']);
const RUNTIME_FIELD_NAMES = new Set([
    'resultUrl',
    'takes',
    'heroTakeId',
    'lastFrame',
    'activeTaskId',
    'lastTaskId',
    'errorMessage',
    'generationStartTime',
    'inputUrl',
    'subjectAssetId',
    'characterReferenceUrls',
    'editorElements',
    'editorCanvasData',
    'editorCanvasSize',
    'editorBackgroundUrl',
    'detectedFaces',
    'faceDetectionStatus'
]);

export class WorkflowTemplateValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'WorkflowTemplateValidationError';
    }
}

export class WorkflowTemplateStorageError extends Error {
    constructor(message) {
        super(message);
        this.name = 'WorkflowTemplateStorageError';
    }
}

export function isWorkflowTemplateId(value) {
    return typeof value === 'string' && UUID_PATTERN.test(value);
}

function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
}

function assertText(value, label, maxLength, { optional = false } = {}) {
    if (typeof value !== 'string') {
        if (optional && value === undefined) return undefined;
        throw new WorkflowTemplateValidationError(`${label} must be a string.`);
    }
    const text = value.trim();
    if (!text) {
        if (optional) return undefined;
        throw new WorkflowTemplateValidationError(`${label} is required.`);
    }
    if (text.length > maxLength) {
        throw new WorkflowTemplateValidationError(`${label} must be ${maxLength} characters or fewer.`);
    }
    if (CONTROL_CHARACTER_PATTERN.test(text)) {
        throw new WorkflowTemplateValidationError(`${label} contains unsupported control characters.`);
    }
    return text;
}

function assertJsonIsSafe(value, pathLabel = 'template') {
    if (typeof value === 'string') {
        if (value.trimStart().toLowerCase().startsWith('data:')) {
            throw new WorkflowTemplateValidationError('Data URLs are not allowed in workflow templates.');
        }
        return;
    }
    if (value === null || typeof value === 'number' || typeof value === 'boolean') return;
    if (Array.isArray(value)) {
        value.forEach((item, index) => assertJsonIsSafe(item, `${pathLabel}[${index}]`));
        return;
    }
    if (!isPlainObject(value)) {
        throw new WorkflowTemplateValidationError(`${pathLabel} must contain JSON-serializable values.`);
    }
    for (const [key, item] of Object.entries(value)) {
        assertJsonIsSafe(item, `${pathLabel}.${key}`);
        if (RUNTIME_FIELD_NAMES.has(key)) {
            throw new WorkflowTemplateValidationError(`Workflow templates cannot contain runtime field "${key}".`);
        }
    }
}

function assertIdentifier(value, label) {
    if (typeof value !== 'string' || !value || value.length > MAX_ID_LENGTH || CONTROL_CHARACTER_PATTERN.test(value)) {
        throw new WorkflowTemplateValidationError(`${label} must be a non-empty safe string.`);
    }
    return value;
}

function assertArray(value, label, maxLength) {
    if (!Array.isArray(value)) {
        throw new WorkflowTemplateValidationError(`${label} must be an array.`);
    }
    if (value.length > maxLength) {
        throw new WorkflowTemplateValidationError(`${label} accepts at most ${maxLength} items.`);
    }
    return value;
}

function validatePorts(value, direction, nodeIds) {
    const ports = assertArray(value, `${direction}s`, MAX_WORKFLOW_TEMPLATE_EDGES);
    return ports.map((port, index) => {
        if (!isPlainObject(port)) {
            throw new WorkflowTemplateValidationError(`${direction}s[${index}] must be an object.`);
        }
        const nodeId = assertIdentifier(port.nodeId, `${direction}s[${index}].nodeId`);
        if (!nodeIds.has(nodeId)) {
            throw new WorkflowTemplateValidationError(`${direction}s[${index}] references a node outside the template graph.`);
        }
        const portId = assertIdentifier(port.portId, `${direction}s[${index}].portId`);
        const dataType = assertIdentifier(port.dataType, `${direction}s[${index}].dataType`);
        return {
            ...cloneJson(port),
            id: typeof port.id === 'string' && port.id ? port.id : `${direction}:${nodeId}:${portId}`,
            direction,
            nodeId,
            portId,
            dataType,
            label: typeof port.label === 'string' && port.label ? port.label : portId
        };
    });
}

function validateGraph(value) {
    if (!isPlainObject(value)) {
        throw new WorkflowTemplateValidationError('graph must be an object.');
    }
    const nodes = assertArray(value.nodes, 'graph.nodes', MAX_WORKFLOW_TEMPLATE_NODES);
    if (nodes.length === 0) {
        throw new WorkflowTemplateValidationError('graph.nodes must contain at least one node.');
    }
    const nodeIds = new Set();
    for (const [index, node] of nodes.entries()) {
        if (!isPlainObject(node)) {
            throw new WorkflowTemplateValidationError(`graph.nodes[${index}] must be an object.`);
        }
        const id = assertIdentifier(node.id, `graph.nodes[${index}].id`);
        if (nodeIds.has(id)) {
            throw new WorkflowTemplateValidationError(`graph.nodes contains duplicate id "${id}".`);
        }
        nodeIds.add(id);
        assertIdentifier(node.type, `graph.nodes[${index}].type`);
        if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) {
            throw new WorkflowTemplateValidationError(`graph.nodes[${index}] must contain finite x and y coordinates.`);
        }
        if (node.status !== 'idle') {
            throw new WorkflowTemplateValidationError(`graph.nodes[${index}].status must be idle in a reusable template.`);
        }
    }

    const edges = assertArray(value.edges, 'graph.edges', MAX_WORKFLOW_TEMPLATE_EDGES);
    const edgeIds = new Set();
    for (const [index, edge] of edges.entries()) {
        if (!isPlainObject(edge)) {
            throw new WorkflowTemplateValidationError(`graph.edges[${index}] must be an object.`);
        }
        const id = assertIdentifier(edge.id, `graph.edges[${index}].id`);
        if (edgeIds.has(id)) {
            throw new WorkflowTemplateValidationError(`graph.edges contains duplicate id "${id}".`);
        }
        edgeIds.add(id);
        const sourceNodeId = assertIdentifier(edge.sourceNodeId, `graph.edges[${index}].sourceNodeId`);
        const targetNodeId = assertIdentifier(edge.targetNodeId, `graph.edges[${index}].targetNodeId`);
        if (!nodeIds.has(sourceNodeId) || !nodeIds.has(targetNodeId)) {
            throw new WorkflowTemplateValidationError(`graph.edges[${index}] must connect nodes inside the template graph.`);
        }
        assertIdentifier(edge.sourcePortId, `graph.edges[${index}].sourcePortId`);
        assertIdentifier(edge.targetPortId, `graph.edges[${index}].targetPortId`);
        assertIdentifier(edge.dataType, `graph.edges[${index}].dataType`);
    }

    const groups = assertArray(value.groups, 'graph.groups', MAX_WORKFLOW_TEMPLATE_GROUPS);
    const groupIds = new Set();
    for (const [index, group] of groups.entries()) {
        if (!isPlainObject(group)) {
            throw new WorkflowTemplateValidationError(`graph.groups[${index}] must be an object.`);
        }
        const id = assertIdentifier(group.id, `graph.groups[${index}].id`);
        if (groupIds.has(id)) {
            throw new WorkflowTemplateValidationError(`graph.groups contains duplicate id "${id}".`);
        }
        groupIds.add(id);
        assertArray(group.nodeIds, `graph.groups[${index}].nodeIds`, MAX_WORKFLOW_TEMPLATE_NODES)
            .forEach((nodeId, nodeIndex) => {
                const safeNodeId = assertIdentifier(nodeId, `graph.groups[${index}].nodeIds[${nodeIndex}]`);
                if (!nodeIds.has(safeNodeId)) {
                    throw new WorkflowTemplateValidationError(`graph.groups[${index}] references a node outside the template graph.`);
                }
            });
    }

    const schemaVersion = typeof value.schemaVersion === 'number' && Number.isFinite(value.schemaVersion)
        ? value.schemaVersion
        : 1;
    return {
        ...cloneJson(value),
        schemaVersion,
        nodes: cloneJson(nodes),
        edges: cloneJson(edges),
        groups: cloneJson(groups),
        nodeIds
    };
}

function normalizeCreatePayload(payload) {
    if (!isPlainObject(payload)) {
        throw new WorkflowTemplateValidationError('Workflow template payload must be an object.');
    }
    for (const key of Object.keys(payload)) {
        if (!ALLOWED_DRAFT_FIELDS.has(key)) {
            throw new WorkflowTemplateValidationError(`Unsupported workflow template field: ${key}.`);
        }
    }
    assertJsonIsSafe(payload);
    const serialized = JSON.stringify(payload);
    if (Buffer.byteLength(serialized, 'utf8') > MAX_WORKFLOW_TEMPLATE_BYTES) {
        throw new WorkflowTemplateValidationError(`Workflow template must be ${MAX_WORKFLOW_TEMPLATE_BYTES} bytes or smaller.`);
    }
    if (payload.schemaVersion !== WORKFLOW_TEMPLATE_SCHEMA_VERSION) {
        throw new WorkflowTemplateValidationError(`Unsupported workflow template schema version: ${String(payload.schemaVersion)}.`);
    }
    const title = assertText(payload.title, 'title', MAX_TITLE_LENGTH);
    const description = assertText(payload.description, 'description', MAX_DESCRIPTION_LENGTH, { optional: true });
    const graph = validateGraph(payload.graph);
    const inputs = validatePorts(payload.inputs, 'input', graph.nodeIds);
    const outputs = validatePorts(payload.outputs, 'output', graph.nodeIds);
    const { nodeIds: _nodeIds, ...safeGraph } = graph;
    return {
        schemaVersion: WORKFLOW_TEMPLATE_SCHEMA_VERSION,
        title,
        ...(description ? { description } : {}),
        graph: safeGraph,
        inputs,
        outputs
    };
}

function normalizeStoredRecord(value) {
    if (!isPlainObject(value)
        || !isWorkflowTemplateId(value.id)
        || typeof value.createdAt !== 'string'
        || typeof value.updatedAt !== 'string') {
        return null;
    }
    try {
        const { id, createdAt, updatedAt, ...draft } = value;
        const normalized = normalizeCreatePayload(draft);
        return { ...normalized, id, createdAt, updatedAt };
    } catch {
        return null;
    }
}

function templateRecordPath(templatesDir, id) {
    if (!isWorkflowTemplateId(id)) return null;
    const root = path.resolve(templatesDir);
    const recordPath = path.resolve(root, `${id}.json`);
    return recordPath.startsWith(`${root}${path.sep}`) ? recordPath : null;
}

function timestampFrom(clock) {
    const value = clock();
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
        throw new WorkflowTemplateStorageError('Workflow template clock returned an invalid timestamp.');
    }
    return date.toISOString();
}

export function writeWorkflowTemplateRecordAtomically(recordPath, record) {
    const directory = path.dirname(recordPath);
    const temporaryPath = path.join(directory, `.${path.basename(recordPath)}.${crypto.randomUUID()}.tmp`);
    try {
        fs.writeFileSync(temporaryPath, JSON.stringify(record, null, 2), { encoding: 'utf8', flag: 'wx' });
        fs.renameSync(temporaryPath, recordPath);
    } finally {
        if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath, { force: true });
    }
}

export function createWorkflowTemplateService(options = {}) {
    const templatesDir = options.templatesDir;
    if (typeof templatesDir !== 'string' || !templatesDir.trim()) {
        throw new WorkflowTemplateStorageError('Workflow templates directory is not configured.');
    }
    const resolvedTemplatesDir = path.resolve(templatesDir);
    const idFactory = options.idFactory || crypto.randomUUID;
    const clock = options.now || (() => new Date());
    const writeRecord = options.writeRecord || writeWorkflowTemplateRecordAtomically;

    function nextId() {
        for (let attempt = 0; attempt < 10; attempt += 1) {
            const id = idFactory();
            if (!isWorkflowTemplateId(id)) {
                throw new WorkflowTemplateStorageError('Workflow template id generator returned an invalid UUID.');
            }
            const recordPath = templateRecordPath(resolvedTemplatesDir, id);
            if (recordPath && !fs.existsSync(recordPath)) return id;
        }
        throw new WorkflowTemplateStorageError('Could not allocate a unique workflow template id.');
    }

    function get(id) {
        if (!isWorkflowTemplateId(id)) {
            throw new WorkflowTemplateValidationError('Invalid workflow template id.');
        }
        const recordPath = templateRecordPath(resolvedTemplatesDir, id);
        if (!recordPath || !fs.existsSync(recordPath)) return null;
        try {
            return normalizeStoredRecord(JSON.parse(fs.readFileSync(recordPath, 'utf8')));
        } catch {
            return null;
        }
    }

    function list() {
        if (!fs.existsSync(resolvedTemplatesDir)) return [];
        return fs.readdirSync(resolvedTemplatesDir)
            .filter(fileName => fileName.endsWith('.json'))
            .map(fileName => {
                const id = fileName.slice(0, -'.json'.length);
                if (!isWorkflowTemplateId(id)) return null;
                const record = get(id);
                if (!record) return null;
                return {
                    id: record.id,
                    title: record.title,
                    ...(record.description ? { description: record.description } : {}),
                    createdAt: record.createdAt,
                    updatedAt: record.updatedAt,
                    nodeCount: record.graph.nodes.length,
                    inputCount: record.inputs.length,
                    outputCount: record.outputs.length
                };
            })
            .filter(Boolean)
            .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
    }

    function create(payload) {
        const input = normalizeCreatePayload(payload);
        fs.mkdirSync(resolvedTemplatesDir, { recursive: true });
        const id = nextId();
        const recordPath = templateRecordPath(resolvedTemplatesDir, id);
        const timestamp = timestampFrom(clock);
        const record = {
            ...input,
            id,
            createdAt: timestamp,
            updatedAt: timestamp
        };
        try {
            writeRecord(recordPath, record);
            return record;
        } catch (error) {
            if (recordPath && fs.existsSync(recordPath)) {
                try {
                    fs.rmSync(recordPath, { force: true });
                } catch {
                    // Preserve the publishing error while making a best-effort cleanup attempt.
                }
            }
            throw new WorkflowTemplateStorageError('Could not publish workflow template.');
        }
    }

    function remove(id) {
        if (!isWorkflowTemplateId(id)) {
            throw new WorkflowTemplateValidationError('Invalid workflow template id.');
        }
        const recordPath = templateRecordPath(resolvedTemplatesDir, id);
        if (!recordPath || !fs.existsSync(recordPath)) return false;
        const record = get(id);
        if (!record) return false;
        try {
            fs.unlinkSync(recordPath);
            return true;
        } catch {
            throw new WorkflowTemplateStorageError('Could not delete workflow template.');
        }
    }

    return { create, list, get, remove, delete: remove };
}

export const createWorkflowTemplatesService = createWorkflowTemplateService;
