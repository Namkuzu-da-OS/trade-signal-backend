/**
 * Enhanced Health Check Endpoint
 * Provides comprehensive system health and cache statistics
 */

import express from 'express';
import db from '../database.js';
import { getCacheStats } from '../utils/cache.js';
import logger from '../utils/logger.js';

const router = express.Router();
const startTime = Date.now();

/**
 * @swagger
 * /api/health:
 *   get:
 *     description: System health check with detailed statistics
 *     responses:
 *       200:
 *         description: System status and metrics
 */
router.get('/health', async (req, res) => {
    const health = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: Math.floor((Date.now() - startTime) / 1000), // seconds
        services: {},
        metrics: {}
    };

    // Check Database Connection
    try {
        await new Promise((resolve, reject) => {
            db.get("SELECT 1 as test", (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        health.services.database = { status: 'ok', type: 'SQLite' };
    } catch (error) {
        health.services.database = { status: 'error', error: error.message };
        health.status = 'degraded';
        logger.error('Database health check failed:', error.message);
    }

    // Check AutoTrader Status
    if (global.autoTrader) {
        health.services.autoTrader = {
            status: global.autoTrader.isRunning ? 'running' : 'stopped',
            intervalMinutes: global.autoTrader.intervalMinutes,
            lastScanTime: global.autoTrader.lastScanTime,
            watchlistCount: global.autoTrader.watchlistCount
        };
    } else {
        health.services.autoTrader = { status: 'not_initialized' };
    }

    // Get Cache Statistics
    try {
        const cacheStats = getCacheStats();
        health.services.cache = {
            status: 'ok',
            ...cacheStats,
            freshness: {
                maxAge: `${cacheStats.ttl}s`,
                description: 'Data caches for 5 minutes (300s)'
            }
        };
    } catch (error) {
        health.services.cache = { status: 'error', error: error.message };
        logger.warn('Cache stats unavailable:', error.message);
    }

    // Get Database Metrics
    try {
        const [tradeCount, alertCount, signalCount, watchlistCount] = await Promise.all([
            new Promise((resolve) => {
                db.get("SELECT COUNT(*) as count FROM trades", (err, row) => {
                    resolve(err ? 0 : row.count);
                });
            }),
            new Promise((resolve) => {
                db.get("SELECT COUNT(*) as count FROM alerts", (err, row) => {
                    resolve(err ? 0 : row.count);
                });
            }),
            new Promise((resolve) => {
                db.get("SELECT COUNT(*) as count FROM live_signals", (err, row) => {
                    resolve(err ? 0 : row.count);
                });
            }),
            new Promise((resolve) => {
                db.get("SELECT COUNT(*) as count FROM watchlists", (err, row) => {
                    resolve(err ? 0 : row.count);
                });
            })
        ]);

        health.metrics = {
            totalTrades: tradeCount,
            totalAlerts: alertCount,
            liveSignals: signalCount,
            watchlistSymbols: watchlistCount
        };
    } catch (error) {
        logger.warn('Database metrics unavailable:', error.message);
    }

    // Overall status determination
    if (health.services.database?.status === 'error') {
        health.status = 'error';
    } else if (Object.values(health.services).some(s => s.status === 'error')) {
        health.status = 'degraded';
    }

    // Log health check requests in debug mode
    logger.debug(`Health check: ${health.status}`);

    res.json(health);
});

/**
 * @swagger
 * /api/health/cache:
 *   get:
 *     description: Detailed cache statistics and freshness indicators
 *     responses:
 *       200:
 *         description: Cache metrics and performance data
 */
router.get('/health/cache', (req, res) => {
    try {
        const stats = getCacheStats();
        res.json({
            status: 'ok',
            cache: stats,
            config: {
                ttlSeconds: stats.ttl,
                checkPeriodSeconds: 60,
                description: 'Market data is cached for 5 minutes to reduce API calls and improve performance'
            },
            performance: {
                hitRate: stats.hitRate,
                totalRequests: stats.hits + stats.misses,
                cacheHits: stats.hits,
                cacheMisses: stats.misses
            },
            freshness: {
                maxAge: `${stats.ttl} seconds`,
                recommendation: 'Data is refreshed automatically after 5 minutes'
            }
        });
    } catch (error) {
        logger.error('Cache health check failed:', error.message);
        res.status(500).json({ status: 'error', error: error.message });
    }
});

export default router;
