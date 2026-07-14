import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
    WorkflowTemplateStorageError,
    WorkflowTemplateValidationError,
    createWorkflowTemplateService,
    isWorkflowTemplateId
} from './workflowTemplates.js';

function createTempTemplatesDirectory(t) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'twitcanva-workflow-templates-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    return directory;
}

function draft(overrides = {}) {
    return {
        schemaVersion: 1,
        title: '产品镜头模板',
        description: '可复用的图片到视频流程',
        graph: {
            schemaVersion: 6,
            nodes: [{
                id: 'image-node',
                type: '图片',
                x: 0,
                y: 0,
                prompt: 'A premium product scene',
                status: 'idle',
                model: 'gpt-image-2',
                aspectRatio: '16:9',
                resolution: '1K'
            }],
            edges: [],
            groups: []
        },
        inputs: [],
        outputs: [{
            id: 'output:image-node:image-output',
            direction: 'output',
            nodeId: 'image-node',
            portId: 'image-output',
            dataType: 'image',
            label: 'Image'
        }],
        ...overrides
    };
}

test('workflow template storage creates, lists, reads, and removes compact records', t => {
    const templatesDir = createTempTemplatesDirectory(t);
    const service = createWorkflowTemplateService({
        templatesDir,
        idFactory: () => '11111111-1111-4111-8111-111111111111',
        now: () => new Date('2026-07-15T00:00:00.000Z')
    });

    const created = service.create(draft());

    assert.equal(created.id, '11111111-1111-4111-8111-111111111111');
    assert.equal(created.createdAt, '2026-07-15T00:00:00.000Z');
    assert.equal(created.updatedAt, '2026-07-15T00:00:00.000Z');
    assert.equal(fs.existsSync(path.join(templatesDir, `${created.id}.json`)), true);
    assert.deepEqual(service.list(), [{
        id: created.id,
        title: '产品镜头模板',
        description: '可复用的图片到视频流程',
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
        nodeCount: 1,
        inputCount: 0,
        outputCount: 1
    }]);
    assert.deepEqual(service.get(created.id), created);
    assert.equal(service.remove(created.id), true);
    assert.equal(service.get(created.id), null);
    assert.deepEqual(service.list(), []);
});

test('workflow template storage rejects unsafe runtime payloads and malformed template IDs', t => {
    const templatesDir = createTempTemplatesDirectory(t);
    const service = createWorkflowTemplateService({
        templatesDir,
        idFactory: () => '22222222-2222-4222-8222-222222222222'
    });

    assert.throws(() => service.create(draft({ title: '   ' })), WorkflowTemplateValidationError);
    assert.throws(() => service.create(draft({
        graph: {
            ...draft().graph,
            nodes: [{
                ...draft().graph.nodes[0],
                editorCanvasData: 'data:image/png;base64,AAAA'
            }]
        }
    })), /Data URLs are not allowed/);
    assert.throws(() => service.create(draft({
        graph: {
            ...draft().graph,
            nodes: [{
                ...draft().graph.nodes[0],
                activeTaskId: 'task-should-not-persist'
            }]
        }
    })), /runtime field/);
    assert.equal(isWorkflowTemplateId('../escape'), false);
    assert.equal(isWorkflowTemplateId('22222222-2222-4222-8222-222222222222'), true);
    assert.throws(() => service.get('../escape'), WorkflowTemplateValidationError);
});

test('workflow template storage removes a temporary record when atomic publishing fails', t => {
    const templatesDir = createTempTemplatesDirectory(t);
    const service = createWorkflowTemplateService({
        templatesDir,
        idFactory: () => '33333333-3333-4333-8333-333333333333',
        writeRecord: () => {
            throw new Error('disk full');
        }
    });

    assert.throws(() => service.create(draft()), WorkflowTemplateStorageError);
    assert.deepEqual(fs.readdirSync(templatesDir), []);
});
