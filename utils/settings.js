import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SETTINGS_FILE = path.join(__dirname, '../user_settings.json');

const DEFAULT_SETTINGS = {
    general: {
        darkMode: true,
        compactView: false
    },
    api: {
        geminiKey: '',
        marketDataKey: ''
    },
    scanner: {
        defaultInterval: 15,
        defaultAssetClass: 'EQUITY',
        excludedSymbols: []
    },
    risk: {
        maxRiskPerTrade: 1.0,
        maxDailyLoss: 500,
        stopLossType: 'ATR',
        rewardRiskRatio: 2.0
    }
};

// Ensure settings file exists
if (!fs.existsSync(SETTINGS_FILE)) {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(DEFAULT_SETTINGS, null, 2));
}

export const getSettings = () => {
    try {
        if (!fs.existsSync(SETTINGS_FILE)) {
            return DEFAULT_SETTINGS;
        }
        const data = fs.readFileSync(SETTINGS_FILE, 'utf8');
        const settings = JSON.parse(data);
        // Merge with defaults to ensure all keys exist
        return {
            ...DEFAULT_SETTINGS, ...settings,
            general: { ...DEFAULT_SETTINGS.general, ...settings.general },
            api: { ...DEFAULT_SETTINGS.api, ...settings.api },
            scanner: { ...DEFAULT_SETTINGS.scanner, ...settings.scanner },
            risk: { ...DEFAULT_SETTINGS.risk, ...settings.risk }
        };
    } catch (error) {
        console.error('Error reading settings:', error);
        return DEFAULT_SETTINGS;
    }
};

export const saveSettings = (newSettings) => {
    try {
        const current = getSettings();
        // Deep merge would be better, but simple merge is okay for now if we are careful
        const updated = {
            ...current,
            ...newSettings,
            general: { ...current.general, ...newSettings.general },
            api: { ...current.api, ...newSettings.api },
            scanner: { ...current.scanner, ...newSettings.scanner },
            risk: { ...current.risk, ...newSettings.risk }
        };
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(updated, null, 2));
        return updated;
    } catch (error) {
        console.error('Error saving settings:', error);
        throw error;
    }
};
