import express from 'express';

import {
    SubjectAssetStorageError,
    SubjectAssetValidationError,
    createSubjectAssetService
} from '../services/subjectAssets.js';

function sendSubjectAssetError(res, error, action) {
    if (error instanceof SubjectAssetValidationError) {
        return res.status(400).json({ error: error.message });
    }
    if (error instanceof SubjectAssetStorageError) {
        console.error(`Subject asset ${action} error:`, error.message);
        return res.status(500).json({ error: error.message });
    }
    console.error(`Subject asset ${action} error:`, error);
    return res.status(500).json({ error: `Could not ${action} subject asset.` });
}

export function createSubjectAssetRoutes({ createService = createSubjectAssetService } = {}) {
    const router = express.Router();

    function serviceFor(req) {
        return createService({ libraryDir: req.app.locals.LIBRARY_DIR });
    }

    router.get('/subject-assets', (req, res) => {
        try {
            return res.json(serviceFor(req).list());
        } catch (error) {
            return sendSubjectAssetError(res, error, 'list');
        }
    });

    router.get('/subject-assets/:id', (req, res) => {
        try {
            const subjectAsset = serviceFor(req).get(req.params.id);
            if (!subjectAsset) return res.status(404).json({ error: 'Subject asset not found.' });
            return res.json(subjectAsset);
        } catch (error) {
            return sendSubjectAssetError(res, error, 'load');
        }
    });

    router.post('/subject-assets', (req, res) => {
        try {
            const subjectAsset = serviceFor(req).create(req.body);
            return res.status(201).json({ success: true, subjectAsset });
        } catch (error) {
            return sendSubjectAssetError(res, error, 'create');
        }
    });

    router.delete('/subject-assets/:id', (req, res) => {
        try {
            const deleted = serviceFor(req).remove(req.params.id);
            if (!deleted) return res.status(404).json({ error: 'Subject asset not found.' });
            return res.json({ success: true });
        } catch (error) {
            return sendSubjectAssetError(res, error, 'delete');
        }
    });

    return router;
}

export default createSubjectAssetRoutes();
