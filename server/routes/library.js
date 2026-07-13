import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const router = express.Router();

function resolveInside(rootDir, relativePath) {
    const root = path.resolve(rootDir);
    const target = path.resolve(root, relativePath);
    return target === root || target.startsWith(root + path.sep) ? target : null;
}

function safeCategoryName(category) {
    const sanitized = String(category || '')
        .normalize('NFKC')
        .replace(/[<>:"|?*\x00-\x1F]/g, '_')
        .replace(/[\\/]+/g, '_')
        .replace(/\.\./g, '_')
        .trim();
    return sanitized || 'uncategorized';
}

function sourcePathFromLibraryUrl(cleanUrl, dirs) {
    const mappings = [
        { prefix: '/library/images/', root: dirs.IMAGES_DIR },
        { prefix: '/library/videos/', root: dirs.VIDEOS_DIR },
        { prefix: '/assets/images/', root: dirs.IMAGES_DIR },
        { prefix: '/assets/videos/', root: dirs.VIDEOS_DIR }
    ];

    for (const { prefix, root } of mappings) {
        if (cleanUrl.startsWith(prefix)) {
            return resolveInside(root, cleanUrl.slice(prefix.length));
        }
    }

    return null;
}

router.post('/library', async (req, res) => {
    try {
        const { sourceUrl, name, category, meta } = req.body;
        const { LIBRARY_ASSETS_DIR, IMAGES_DIR, VIDEOS_DIR } = req.app.locals;

        if (!sourceUrl || !name || !category) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        const safeCategory = safeCategoryName(category);
        const destDir = resolveInside(LIBRARY_ASSETS_DIR, safeCategory);
        if (!destDir) {
            return res.status(400).json({ error: 'Invalid category' });
        }
        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }

        const safeName = name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        let destFilename;
        let destPath;

        if (sourceUrl.startsWith('data:')) {
            const matches = sourceUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (!matches || matches.length !== 3) {
                return res.status(400).json({ error: 'Invalid data URL format' });
            }

            const mimeType = matches[1];
            const buffer = Buffer.from(matches[2], 'base64');
            let ext = '.png';
            if (mimeType === 'image/jpeg') ext = '.jpg';
            else if (mimeType === 'video/mp4') ext = '.mp4';

            destFilename = `${safeName}${ext}`;
            destPath = path.join(destDir, destFilename);
            fs.writeFileSync(destPath, buffer);
        } else {
            let cleanUrl = sourceUrl;
            try {
                if (sourceUrl.startsWith('http')) {
                    cleanUrl = new URL(sourceUrl).pathname;
                }
            } catch {
                // Treat as a path below.
            }

            cleanUrl = decodeURIComponent(cleanUrl.split('?')[0]);
            if (!cleanUrl.startsWith('/')) cleanUrl = '/' + cleanUrl;

            const sourcePath = sourcePathFromLibraryUrl(cleanUrl, { IMAGES_DIR, VIDEOS_DIR });

            if (!sourcePath || !fs.existsSync(sourcePath)) {
                return res.status(404).json({ error: "Source file not found" });
            }

            const ext = path.extname(sourcePath);
            destFilename = `${safeName}${ext}`;
            destPath = path.join(destDir, destFilename);
            fs.copyFileSync(sourcePath, destPath);
        }

        const libraryJsonPath = path.join(LIBRARY_ASSETS_DIR, 'assets.json');
        let libraryData = [];
        if (fs.existsSync(libraryJsonPath)) {
            libraryData = JSON.parse(fs.readFileSync(libraryJsonPath, 'utf8'));
        }

        const newEntry = {
            id: crypto.randomUUID(),
            name,
            category: safeCategory,
            url: `/library/assets/${safeCategory}/${destFilename}`,
            type: sourceUrl.includes('video') || sourceUrl.startsWith('data:video') ? 'video' : 'image',
            createdAt: new Date().toISOString(),
            ...meta
        };

        libraryData.push(newEntry);
        fs.writeFileSync(libraryJsonPath, JSON.stringify(libraryData, null, 2));

        res.json({ success: true, asset: newEntry });
    } catch (error) {
        console.error("Save to library error:", error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/library', async (req, res) => {
    try {
        const libraryJsonPath = path.join(req.app.locals.LIBRARY_ASSETS_DIR, 'assets.json');
        if (!fs.existsSync(libraryJsonPath)) return res.json([]);
        const libraryData = JSON.parse(fs.readFileSync(libraryJsonPath, 'utf8'));
        libraryData.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        res.json(libraryData);
    } catch (error) {
        console.error("List library error:", error);
        res.status(500).json({ error: error.message });
    }
});

router.delete('/library/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { LIBRARY_ASSETS_DIR } = req.app.locals;
        const libraryJsonPath = path.join(LIBRARY_ASSETS_DIR, 'assets.json');

        if (!fs.existsSync(libraryJsonPath)) {
            return res.status(404).json({ error: "Library not found" });
        }

        const libraryData = JSON.parse(fs.readFileSync(libraryJsonPath, 'utf8'));
        const assetIndex = libraryData.findIndex(a => a.id === id);
        if (assetIndex === -1) {
            return res.status(404).json({ error: "Asset not found" });
        }

        const asset = libraryData[assetIndex];
        if (asset.url && asset.url.startsWith('/library/assets/')) {
            const filePath = resolveInside(LIBRARY_ASSETS_DIR, asset.url.replace('/library/assets/', ''));
            if (!filePath) return res.status(400).json({ error: "Invalid asset path" });
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }

        libraryData.splice(assetIndex, 1);
        fs.writeFileSync(libraryJsonPath, JSON.stringify(libraryData, null, 2));
        res.json({ success: true });
    } catch (error) {
        console.error("Delete library asset error:", error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
