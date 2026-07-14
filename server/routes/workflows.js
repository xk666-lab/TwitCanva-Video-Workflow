import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const router = express.Router();

const AUDIO_MIME_EXTENSIONS = {
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/mp4': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/aac': 'aac',
    'audio/ogg': 'ogg',
    'audio/webm': 'webm'
};

function isSafeId(id) {
    return typeof id === 'string' && /^[a-zA-Z0-9_-]+$/.test(id);
}

function workflowPath(rootDir, id) {
    if (!isSafeId(id)) return null;
    const root = path.resolve(rootDir);
    const target = path.resolve(root, `${id}.json`);
    return target.startsWith(root + path.sep) ? target : null;
}

function saveBase64ToFile(dataUrl, dirs) {
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return null;

    const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) return null;

    const mimeType = matches[1];
    const buffer = Buffer.from(matches[2], 'base64');
    const id = `wf_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    if (mimeType.startsWith('video/')) {
        const filename = `${id}.mp4`;
        fs.writeFileSync(path.join(dirs.VIDEOS_DIR, filename), buffer);
        return { url: `/library/videos/${filename}` };
    }

    if (mimeType.startsWith('audio/')) {
        const extension = AUDIO_MIME_EXTENSIONS[mimeType.toLowerCase()];
        if (!extension || !dirs.AUDIO_DIR) return null;
        const filename = `${id}.${extension}`;
        fs.writeFileSync(path.join(dirs.AUDIO_DIR, filename), buffer);
        return { url: `/library/audio/${filename}` };
    }

    const ext = mimeType === 'image/jpeg' ? 'jpg' : 'png';
    const filename = `${id}.${ext}`;
    fs.writeFileSync(path.join(dirs.IMAGES_DIR, filename), buffer);
    return { url: `/library/images/${filename}` };
}

function sanitizeWorkflowNodes(nodes, dirs) {
    if (!nodes || !Array.isArray(nodes)) return nodes;

    return nodes.map(node => {
        const cleanNode = { ...node };
        for (const field of ['resultUrl', 'lastFrame', 'editorCanvasData', 'editorBackgroundUrl']) {
            if (cleanNode[field] && cleanNode[field].startsWith('data:')) {
                const saved = saveBase64ToFile(cleanNode[field], dirs);
                if (saved) cleanNode[field] = saved.url;
            }
        }
        return cleanNode;
    });
}

router.post('/workflows', async (req, res) => {
    try {
        const workflow = req.body;
        const { WORKFLOWS_DIR, IMAGES_DIR, VIDEOS_DIR, AUDIO_DIR } = req.app.locals;

        if (!workflow.id) workflow.id = crypto.randomUUID();
        if (!isSafeId(workflow.id)) {
            return res.status(400).json({ error: "Invalid workflow id" });
        }
        workflow.updatedAt = new Date().toISOString();
        if (!workflow.createdAt) workflow.createdAt = workflow.updatedAt;

        const filePath = workflowPath(WORKFLOWS_DIR, workflow.id);
        if (!filePath) return res.status(400).json({ error: "Invalid workflow id" });
        if (fs.existsSync(filePath)) {
            try {
                const existingData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                if (existingData.coverUrl) workflow.coverUrl = existingData.coverUrl;
            } catch (error) {
                console.warn("Could not read existing workflow to preserve cover:", error);
            }
        }

        if (workflow.nodes) {
            workflow.nodes = sanitizeWorkflowNodes(workflow.nodes, { IMAGES_DIR, VIDEOS_DIR, AUDIO_DIR });
        }

        fs.writeFileSync(filePath, JSON.stringify(workflow, null, 2));
        res.json({ success: true, id: workflow.id });
    } catch (error) {
        console.error("Save workflow error:", error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/public-workflows', async (req, res) => {
    try {
        const publicWorkflowsDir = path.join(req.app.locals.ROOT_DIR, 'public', 'workflows');
        if (!fs.existsSync(publicWorkflowsDir)) return res.json([]);

        const workflows = fs.readdirSync(publicWorkflowsDir)
            .filter(file => file.endsWith('.json') && file !== 'index.json')
            .map(file => {
                try {
                    const workflow = JSON.parse(fs.readFileSync(path.join(publicWorkflowsDir, file), 'utf8'));
                    const nodeTypes = workflow.nodes?.reduce((acc, node) => {
                        acc[node.type] = (acc[node.type] || 0) + 1;
                        return acc;
                    }, {}) || {};
                    const typesSummary = Object.entries(nodeTypes)
                        .map(([type, count]) => `${count} ${type}${count > 1 ? 's' : ''}`)
                        .join(', ');
                    return {
                        id: file.replace('.json', ''),
                        title: workflow.title || 'Untitled Workflow',
                        description: workflow.description || (typesSummary ? `Workflow with ${typesSummary}` : 'A public workflow template'),
                        nodeCount: workflow.nodes?.length || 0,
                        coverUrl: workflow.coverUrl || null
                    };
                } catch (error) {
                    console.warn(`Skipping invalid workflow file: ${file}`, error.message);
                    return null;
                }
            })
            .filter(Boolean);

        res.json(workflows);
    } catch (error) {
        console.error("List public workflows error:", error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/public-workflows/:id', async (req, res) => {
    try {
        const publicWorkflowsDir = path.join(req.app.locals.ROOT_DIR, 'public', 'workflows');
        if (!isSafeId(req.params.id)) return res.status(400).json({ error: "Invalid workflow id" });
        const filePath = workflowPath(publicWorkflowsDir, req.params.id);
        if (!filePath) return res.status(400).json({ error: "Invalid workflow id" });
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Public workflow not found" });
        res.json(JSON.parse(fs.readFileSync(filePath, 'utf8')));
    } catch (error) {
        console.error("Load public workflow error:", error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/workflows', async (req, res) => {
    try {
        const { WORKFLOWS_DIR } = req.app.locals;
        if (!fs.existsSync(WORKFLOWS_DIR)) return res.json([]);

        const workflows = fs.readdirSync(WORKFLOWS_DIR)
            .filter(file => file.endsWith('.json'))
            .map(file => {
                try {
                    const workflow = JSON.parse(fs.readFileSync(path.join(WORKFLOWS_DIR, file), 'utf8'));
                    return {
                        id: workflow.id,
                        title: workflow.title || 'Untitled Workflow',
                        createdAt: workflow.createdAt,
                        updatedAt: workflow.updatedAt,
                        nodeCount: workflow.nodes?.length || 0,
                        coverUrl: workflow.coverUrl || null
                    };
                } catch {
                    return null;
                }
            })
            .filter(Boolean)
            .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

        res.json(workflows);
    } catch (error) {
        console.error("List workflows error:", error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/workflows/:id', async (req, res) => {
    try {
        const filePath = workflowPath(req.app.locals.WORKFLOWS_DIR, req.params.id);
        if (!filePath) return res.status(400).json({ error: "Invalid workflow id" });
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Workflow not found" });
        res.json(JSON.parse(fs.readFileSync(filePath, 'utf8')));
    } catch (error) {
        console.error("Load workflow error:", error);
        res.status(500).json({ error: error.message });
    }
});

router.delete('/workflows/:id', async (req, res) => {
    try {
        const filePath = workflowPath(req.app.locals.WORKFLOWS_DIR, req.params.id);
        if (!filePath) return res.status(400).json({ error: "Invalid workflow id" });
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        res.json({ success: true });
    } catch (error) {
        console.error("Delete workflow error:", error);
        res.status(500).json({ error: error.message });
    }
});

router.put('/workflows/:id/cover', async (req, res) => {
    try {
        const { coverUrl } = req.body;
        const filePath = workflowPath(req.app.locals.WORKFLOWS_DIR, req.params.id);
        if (!filePath) return res.status(400).json({ error: "Invalid workflow id" });
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Workflow not found" });

        const workflow = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        workflow.coverUrl = coverUrl;
        workflow.updatedAt = new Date().toISOString();
        fs.writeFileSync(filePath, JSON.stringify(workflow, null, 2));
        res.json({ success: true });
    } catch (error) {
        console.error("Update workflow cover error:", error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
