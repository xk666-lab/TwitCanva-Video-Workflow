import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawn } from 'child_process';
import { processTikTokVideo, isValidTikTokUrl } from '../tools/tiktok.js';

const router = express.Router();

function resolveInside(rootDir, relativePath) {
    const root = path.resolve(rootDir);
    const target = path.resolve(root, relativePath);
    return target === root || target.startsWith(root + path.sep) ? target : null;
}

router.post('/tiktok/import', async (req, res) => {
    try {
        const { url, enableTrim = true } = req.body;
        if (!url) return res.status(400).json({ error: 'TikTok URL is required' });
        if (!isValidTikTokUrl(url)) {
            return res.status(400).json({ error: 'Invalid TikTok URL format. Please provide a valid TikTok video URL.' });
        }

        const result = await processTikTokVideo(url, req.app.locals.VIDEOS_DIR, enableTrim);
        res.json(result);
    } catch (error) {
        console.error('[TikTok API] Import error:', error);
        res.status(500).json({
            error: error.message || 'Failed to import TikTok video',
            details: error.toString()
        });
    }
});

router.post('/tiktok/validate', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ valid: false, error: 'URL is required' });
        res.json({ valid: isValidTikTokUrl(url), url });
    } catch (error) {
        res.status(500).json({ valid: false, error: error.message });
    }
});

async function isFFmpegAvailable() {
    return new Promise(resolve => {
        const proc = spawn('ffmpeg', ['-version'], { shell: false });
        proc.on('close', code => resolve(code === 0));
        proc.on('error', () => resolve(false));
    });
}

async function trimVideoWithFFmpeg(inputPath, outputPath, startTime, endTime) {
    return new Promise((resolve, reject) => {
        const duration = endTime - startTime;
        if (duration <= 0) {
            reject(new Error('Invalid trim range: end time must be greater than start time'));
            return;
        }

        const args = [
            '-y',
            '-i', inputPath,
            '-ss', startTime.toString(),
            '-t', duration.toString(),
            '-c:v', 'libx264',
            '-c:a', 'aac',
            '-preset', 'fast',
            '-crf', '23',
            outputPath
        ];

        const proc = spawn('ffmpeg', args, { shell: false });
        let stderr = '';
        proc.stderr.on('data', data => { stderr += data.toString(); });
        proc.on('close', code => {
            if (code === 0) resolve();
            else reject(new Error(`FFmpeg failed with code ${code}: ${stderr.slice(-500)}`));
        });
        proc.on('error', err => reject(new Error(`FFmpeg error: ${err.message}`)));
    });
}

router.post('/trim-video', async (req, res) => {
    try {
        const { videoUrl, startTime, endTime } = req.body;
        const { VIDEOS_DIR } = req.app.locals;

        if (!videoUrl || startTime === undefined || endTime === undefined) {
            return res.status(400).json({ error: 'videoUrl, startTime, and endTime are required' });
        }

        if (!await isFFmpegAvailable()) {
            return res.status(500).json({
                error: 'FFmpeg is not installed. Video trimming requires FFmpeg to be installed on the server.'
            });
        }

        const cleanVideoUrl = decodeURIComponent(videoUrl.split('?')[0]);
        if (!cleanVideoUrl.startsWith('/library/videos/')) {
            return res.status(400).json({ error: cleanVideoUrl.startsWith('http') ? 'Only local library videos can be trimmed' : 'Invalid video URL format' });
        }

        const inputPath = resolveInside(VIDEOS_DIR, cleanVideoUrl.replace('/library/videos/', ''));
        if (!inputPath) return res.status(400).json({ error: 'Invalid video path' });
        if (!fs.existsSync(inputPath)) return res.status(404).json({ error: 'Source video not found' });

        const timestamp = Date.now();
        const hash = crypto.randomBytes(4).toString('hex');
        const outputFilename = `trimmed_${timestamp}_${hash}.mp4`;
        const outputPath = path.join(VIDEOS_DIR, outputFilename);

        await trimVideoWithFFmpeg(inputPath, outputPath, startTime, endTime);

        const id = `${timestamp}_${hash}`;
        const metadata = {
            id,
            filename: outputFilename,
            prompt: `Trimmed video (${startTime.toFixed(1)}s - ${endTime.toFixed(1)}s)`,
            model: 'video-editor',
            sourceUrl: videoUrl,
            trimStart: startTime,
            trimEnd: endTime,
            createdAt: new Date().toISOString(),
            type: 'videos'
        };
        fs.writeFileSync(path.join(VIDEOS_DIR, `${id}.json`), JSON.stringify(metadata, null, 2));

        res.json({
            success: true,
            url: `/library/videos/${outputFilename}`,
            filename: outputFilename,
            duration: endTime - startTime
        });
    } catch (error) {
        console.error('[Video Trim] Error:', error);
        res.status(500).json({
            error: error.message || 'Failed to trim video',
            details: error.toString()
        });
    }
});

export default router;
