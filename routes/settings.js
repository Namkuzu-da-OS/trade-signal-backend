import express from 'express';
import { getSettings, saveSettings } from '../utils/settings.js';

const router = express.Router();

/**
 * @swagger
 * /api/settings:
 *   get:
 *     summary: Get user settings
 *     tags: [Settings]
 *     responses:
 *       200:
 *         description: Current settings
 */
router.get('/settings', (req, res) => {
    const settings = getSettings();
    // Mask API keys for security when sending to frontend
    const safeSettings = {
        ...settings,
        api: {
            ...settings.api,
            geminiKey: settings.api.geminiKey ? '********' : '',
            marketDataKey: settings.api.marketDataKey ? '********' : ''
        }
    };
    res.json(safeSettings);
});

/**
 * @swagger
 * /api/settings:
 *   post:
 *     summary: Update user settings
 *     tags: [Settings]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Settings updated
 */
router.post('/settings', (req, res) => {
    try {
        const currentSettings = getSettings();
        const newSettings = req.body;

        // Handle API keys: if they are masked (********), keep the old ones
        if (newSettings.api) {
            if (newSettings.api.geminiKey === '********') {
                newSettings.api.geminiKey = currentSettings.api.geminiKey;
            }
            if (newSettings.api.marketDataKey === '********') {
                newSettings.api.marketDataKey = currentSettings.api.marketDataKey;
            }
        }

        const updated = saveSettings(newSettings);
        res.json({ message: 'Settings saved successfully', settings: updated });
    } catch (error) {
        res.status(500).json({ error: 'Failed to save settings' });
    }
});

export default router;
