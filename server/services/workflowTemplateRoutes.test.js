import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import express from 'express';
import workflowTemplateRoutes from '../routes/workflow-templates.js';

function createTempDirectory(t) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'twitcanva-workflow-template-routes-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    return directory;
}

function draft() {
    return {
        schemaVersion: 1,
        title: '图片到视频',
        graph: {
            schemaVersion: 6,
            nodes: [{
                id: 'image-1',
                type: '图片',
                x: 0,
                y: 0,
                prompt: 'A studio product photo',
                status: 'idle',
                model: 'gpt-image-2',
                aspectRatio: '16:9',
                resolution: '1K'
            }],
            edges: [],
            groups: []
        },
        inputs: [],
        outputs: []
    };
}

async function startTestServer(templatesDir) {
    const app = express();
    app.use(express.json({ limit: '64kb' }));
    app.locals.WORKFLOW_TEMPLATES_DIR = templatesDir;
    app.use('/api', workflowTemplateRoutes);
    const server = await new Promise(resolve => {
        const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    });
    const address = server.address();
    return {
        baseUrl: `http://127.0.0.1:${address.port}`,
        close: () => new Promise(resolve => server.close(resolve))
    };
}

async function requestJson(baseUrl, pathname, options = {}) {
    const response = await fetch(`${baseUrl}${pathname}`, options);
    const body = await response.json();
    return { response, body };
}

test('workflow template routes create, list, load, and delete local templates', async t => {
    const templatesDir = createTempDirectory(t);
    const server = await startTestServer(templatesDir);
    t.after(server.close);

    const created = await requestJson(server.baseUrl, '/api/workflow-templates', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(draft())
    });

    assert.equal(created.response.status, 201);
    assert.equal(created.body.success, true);
    assert.equal(created.body.template.title, '图片到视频');
    const templateId = created.body.template.id;

    const listed = await requestJson(server.baseUrl, '/api/workflow-templates');
    assert.equal(listed.response.status, 200);
    assert.equal(listed.body.length, 1);
    assert.equal(listed.body[0].id, templateId);
    assert.equal(listed.body[0].nodeCount, 1);

    const loaded = await requestJson(server.baseUrl, `/api/workflow-templates/${templateId}`);
    assert.equal(loaded.response.status, 200);
    assert.deepEqual(loaded.body, created.body.template);

    const deleted = await requestJson(server.baseUrl, `/api/workflow-templates/${templateId}`, { method: 'DELETE' });
    assert.equal(deleted.response.status, 200);
    assert.deepEqual(deleted.body, { success: true });
});

test('workflow template routes expose validation and missing-template errors', async t => {
    const templatesDir = createTempDirectory(t);
    const server = await startTestServer(templatesDir);
    t.after(server.close);

    const invalid = await requestJson(server.baseUrl, '/api/workflow-templates', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...draft(), title: '' })
    });
    assert.equal(invalid.response.status, 400);
    assert.match(invalid.body.error, /title is required/i);

    const malformedId = await requestJson(server.baseUrl, '/api/workflow-templates/not-a-template');
    assert.equal(malformedId.response.status, 400);
    assert.match(malformedId.body.error, /Invalid workflow template id/i);

    const missing = await requestJson(server.baseUrl, '/api/workflow-templates/44444444-4444-4444-8444-444444444444');
    assert.equal(missing.response.status, 404);
    assert.match(missing.body.error, /not found/i);
});
