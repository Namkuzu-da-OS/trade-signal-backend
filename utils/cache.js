/**
 * Market Data Cache Utility
 * Caches Yahoo Finance data with 5-minute TTL
 * Provides cache freshness metadata
 */

import NodeCache from 'node-cache';
import logger from './logger.js';

// Cache Configuration
const CACHE_TTL_SECONDS = 5 * 60; // 5 minutes (300 seconds)
const CHECK_PERIOD_SECONDS = 60;  // Check for expired keys every 60 seconds

// Initialize cache
const marketDataCache = new NodeCache({
    stdTTL: CACHE_TTL_SECONDS,
    checkperiod: CHECK_PERIOD_SECONDS,
    useClones: false // Better performance, be careful with mutations
});

// Track cache metadata
const cacheMetadata = new Map();

// Log cache events
marketDataCache.on('set', (key, value) => {
    const metadata = {
        cachedAt: Date.now(),
        expiresAt: Date.now() + (CACHE_TTL_SECONDS * 1000),
        ttl: CACHE_TTL_SECONDS
    };
    cacheMetadata.set(key, metadata);
    logger.debug(`Cache SET: ${key} (expires in ${CACHE_TTL_SECONDS}s)`);
});

marketDataCache.on('del', (key, value) => {
    cacheMetadata.delete(key);
    logger.debug(`Cache DEL: ${key}`);
});

marketDataCache.on('expired', (key, value) => {
    cacheMetadata.delete(key);
    logger.debug(`Cache EXPIRED: ${key}`);
});

/**
 * Get data from cache
 * @param {string} key - Cache key
 * @returns {Object|null} { data, metadata } or null if not found
 */
export function getCached(key) {
    const data = marketDataCache.get(key);

    if (!data) {
        return null;
    }

    const metadata = cacheMetadata.get(key);
    const now = Date.now();

    return {
        data,
        cached: true,
        cachedAt: metadata?.cachedAt,
        expiresAt: metadata?.expiresAt,
        age: metadata ? Math.floor((now - metadata.cachedAt) / 1000) : 0, // seconds
        ttl: metadata ? Math.floor((metadata.expiresAt - now) / 1000) : 0, // seconds remaining
        freshness: metadata ? ((CACHE_TTL_SECONDS - Math.floor((now - metadata.cachedAt) / 1000)) / CACHE_TTL_SECONDS * 100).toFixed(0) + '%' : '0%'
    };
}

/**
 * Set data in cache
 * @param {string} key - Cache key
 * @param {*} value - Data to cache
 * @param {number} ttl - Optional custom TTL in seconds
 */
export function setCached(key, value, ttl = CACHE_TTL_SECONDS) {
    return marketDataCache.set(key, value, ttl);
}

/**
 * Get cache statistics
 * @returns {Object} Cache stats
 */
export function getCacheStats() {
    const stats = marketDataCache.getStats();
    const keys = marketDataCache.keys();

    return {
        keys: stats.keys,
        hits: stats.hits,
        misses: stats.misses,
        hitRate: stats.hits + stats.misses > 0
            ? ((stats.hits / (stats.hits + stats.misses)) * 100).toFixed(2) + '%'
            : '0%',
        ksize: stats.ksize,
        vsize: stats.vsize,
        ttl: CACHE_TTL_SECONDS,
        activeKeys: keys.length
    };
}

/**
 * Check if data is fresh (< 1 minute old)
 * @param {string} key - Cache key
 * @returns {boolean}
 */
export function isFresh(key) {
    const cached = getCached(key);
    return cached && cached.age < 60; // Fresh if < 1 minute old
}

/**
 * Clear all cache
 */
export function clearCache() {
    marketDataCache.flushAll();
    cacheMetadata.clear();
    logger.info('Cache cleared');
}

/**
 * Clear specific key
 * @param {string} key - Cache key to clear
 */
export function clearKey(key) {
    marketDataCache.del(key);
    logger.debug(`Cache key cleared: ${key}`);
}

export const cache = marketDataCache;
export default {
    getCached,
    setCached,
    getCacheStats,
    isFresh,
    clearCache,
    clearKey,
    cache
};
