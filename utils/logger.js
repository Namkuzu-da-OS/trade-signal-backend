/**
 * Structured Logger Utility
 * Controls log output based on environment variables
 * Usage: logger.info('message'), logger.error('error'), etc.
 */

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

const currentLevel = LEVELS[LOG_LEVEL] ?? LEVELS.info;

export const logger = {
    error: (...args) => {
        if (currentLevel >= LEVELS.error) {
            console.error('❌', new Date().toISOString(), '[ERROR]', ...args);
        }
    },
    warn: (...args) => {
        if (currentLevel >= LEVELS.warn) {
            console.warn('⚠️', new Date().toISOString(), '[WARN]', ...args);
        }
    },
    info: (...args) => {
        if (currentLevel >= LEVELS.info) {
            console.log('ℹ️', new Date().toISOString(), '[INFO]', ...args);
        }
    },
    debug: (...args) => {
        if (currentLevel >= LEVELS.debug) {
            console.log('🔍', new Date().toISOString(), '[DEBUG]', ...args);
        }
    },
    success: (...args) => {
        if (currentLevel >= LEVELS.info) {
            console.log('✅', new Date().toISOString(), '[SUCCESS]', ...args);
        }
    }
};

export default logger;
