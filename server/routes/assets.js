import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const router = express.Router();

function assetDir(type, locals) {
    return type === 'images' ? locals.IMAGES_DIR : locals.VIDEOS_DIR;
}

function resolveInside(rootDir, relativePath) {
    const root = path.resolve(rootDir);
    const target = path.resolve(root, relativePath);
    return target === root || target.startsWith(root + path.sep) ? target : null;
}

router.post('/assets/:type', async (req, res) => {
    try {
        const { type } = req.params;
        const { data, prompt } = req.body;

        if (!['images', 'videos'].includes(type)) {
            return res.status(400).json({ error: 'Invalid asset type' });
        }

        const targetDir = assetDir(type, req.app.locals);
        const id = crypto.randomUUID();
        const ext = type === 'images' ? 'png' : 'mp4';
        const filename = `${id}.${ext}`;
        const metaFilename = `${id}.json`;

        const base64Data = data.replace(/^data:[^;]+;base64,/, '');
        fs.writeFileSync(path.join(targetDir, filename), base64Data, 'base64');

        const metadata = {
            id,
            filename,
            prompt: prompt || '',
            createdAt: new Date().toISOString(),
            type
        };
        fs.writeFileSync(path.join(targetDir, metaFilename), JSON.stringify(metadata, null, 2));

        res.json({ success: true, id, filename, url: `/library/${type}/${filename}` });
    } catch (error) {
        console.error('Save asset error:', error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/assets/:type', async (req, res) => {
    try {
        const { type } = req.params;
        const limit = parseInt(req.query.limit) || 0;
        const offset = parseInt(req.query.offset) || 0;

        if (!['images', 'videos'].includes(type)) {
            return res.status(400).json({ error: 'Invalid asset type' });
        }

        const targetDir = assetDir(type, req.app.locals);
        if (!fs.existsSync(targetDir)) {
            return res.json(limit > 0 ? { assets: [], total: 0, hasMore: false } : []);
        }

        const assets = [];
        for (const file of fs.readdirSync(targetDir)) {
            if (!file.endsWith('.json')) continue;
            try {
                const metadata = JSON.parse(fs.readFileSync(path.join(targetDir, file), 'utf8'));
                metadata.url = `/library/${type}/${metadata.filename}`;
                assets.push(metadata);
            } catch {
                // Skip invalid JSON files.
            }
        }

        assets.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        if (limit > 0) {
            const paginatedAssets = assets.slice(offset, offset + limit);
            return res.json({
                assets: paginatedAssets,
                total: assets.length,
                hasMore: offset + limit < assets.length
            });
        }

        res.json(assets);
    } catch (error) {
        console.error('List assets error:', error);
        res.status(500).json({ error: error.message });
    }
});

router.delete('/assets/:type/:id', async (req, res) => {
    try {
        const { type, id } = req.params;

        if (!['images', 'videos'].includes(type)) {
            return res.status(400).json({ error: 'Invalid asset type' });
        }

        const targetDir = assetDir(type, req.app.locals);
        if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
            return res.status(400).json({ error: 'Invalid asset id' });
        }

        const metaPath = resolveInside(targetDir, `${id}.json`);
        if (!metaPath) return res.status(400).json({ error: 'Invalid asset id' });
        let assetFilename = null;

        if (fs.existsSync(metaPath)) {
            try {
                const metadata = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                assetFilename = metadata.filename;
            } catch (error) {
                console.warn(`Could not read metadata for ${id}:`, error.message);
            }
        }

        if (assetFilename) {
            const assetPath = resolveInside(targetDir, assetFilename);
            if (!assetPath) return res.status(400).json({ error: 'Invalid asset path' });
            if (fs.existsSync(assetPath)) fs.unlinkSync(assetPath);
        }

        if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
        res.json({ success: true });
    } catch (error) {
        console.error('Delete asset error:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
