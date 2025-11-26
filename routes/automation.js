import express from 'express';
import db from '../database.js';
import { validateSymbol } from '../middleware/validation.js';
import { fetchMarketData, fetchVIX, calculateIndicators } from '../analysis.js';
import { generateAISentiment } from '../services/ai.js';

const router = express.Router();

// ============================================================================
// AUTOMATION CONTROL
// ============================================================================

router.get('/auto/status', (req, res) => {
    if (!global.autoTrader) {
        return res.json({ status: 'initializing', isRunning: false });
    }
    res.json({
        status: global.autoTrader.isRunning ? 'running' : 'stopped',
        isRunning: global.autoTrader.isRunning,
        intervalMinutes: global.autoTrader.intervalMinutes,
        lastScanTime: global.autoTrader.lastScanTime,
        watchlistCount: global.autoTrader.watchlistCount
    });
});

router.post('/auto/start', (req, res) => {
    if (!global.autoTrader) return res.status(503).json({ error: 'AutoTrader not ready' });

    let intervalMinutes = parseInt(req.body.intervalMinutes) || 15;

    // Validate interval
    if (intervalMinutes < 1 || intervalMinutes > 60) {
        return res.status(400).json({
            error: 'Invalid interval',
            message: 'Interval must be between 1-60 minutes',
            received: intervalMinutes
        });
    }

    if (global.autoTrader.isRunning) {
        return res.json({
            message: 'Scanner is already running',
            status: 'running',
            intervalMinutes: global.autoTrader.intervalMinutes
        });
    }

    const result = global.autoTrader.start(intervalMinutes);
    res.json({
        message: 'Multi-timeframe scanner started successfully',
        ...result
    });
});

router.post('/auto/stop', (req, res) => {
    if (!global.autoTrader) return res.status(503).json({ error: 'AutoTrader not ready' });

    global.autoTrader.stop();
    res.json({
        message: 'Scanner stopped',
        status: 'stopped'
    });
});

router.post('/auto/cycle', async (req, res) => {
    if (!global.autoTrader) return res.status(503).json({ error: 'AutoTrader not ready' });

    try {
        await global.autoTrader.runCycle();
        res.json({
            message: 'Manual scan cycle completed',
            status: 'success'
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/auto/logs', (req, res) => {
    if (!global.autoTrader) return res.json({ logs: [], totalLogs: 0 });

    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    res.json({
        logs: global.autoTrader.activityLog.slice(0, limit),
        totalLogs: global.autoTrader.activityLog.length
    });
});

// ============================================================================
// ALERTS
// ============================================================================

router.get('/alerts', (req, res) => {
    db.all("SELECT * FROM alerts ORDER BY timestamp DESC LIMIT 50", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

router.post('/alerts/:id/analyze', async (req, res) => {
    const alertId = req.params.id;

    db.get("SELECT * FROM alerts WHERE id = ?", [alertId], async (err, alert) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!alert) return res.status(404).json({ error: 'Alert not found' });

        if (alert.ai_analysis) {
            return res.json({ message: 'Analysis already exists', analysis: alert.ai_analysis });
        }

        try {
            const { historical, quote } = await fetchMarketData(alert.symbol);
            const indicators = calculateIndicators(historical);
            const vix = await fetchVIX();

            const strategy = {
                name: alert.strategy,
                score: alert.score,
                signal: alert.signal
            };

            const marketState = {
                price: quote.regularMarketPrice,
                vix: vix.value,
                gex: 0
            };

            const sentiment = await generateAISentiment(alert.symbol, indicators, strategy, marketState, null);
            const analysis = sentiment.combined_analysis;

            db.run("UPDATE alerts SET ai_analysis = ? WHERE id = ?", [analysis, alertId], (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ message: 'Analysis generated', analysis });
            });

        } catch (error) {
            console.error('Error generating on-demand analysis:', error);
            res.status(500).json({ error: 'Failed to generate analysis' });
        }
    });
});

// ============================================================================
// LIVE SIGNALS
// ============================================================================

router.get('/signals/live', (req, res) => {
    db.all(`
        SELECT * FROM live_signals 
        ORDER BY final_score DESC, last_updated DESC
    `, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

router.get('/signals/live/:symbol', validateSymbol, (req, res) => {
    const { symbol } = req.params;
    db.get(`
        SELECT * FROM live_signals WHERE symbol = ?
    `, [symbol.toUpperCase()], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'No signal found for this symbol' });
        res.json(row);
    });
});

router.post('/signals/live/:symbol/analyze', validateSymbol, async (req, res) => {
    const { symbol } = req.params;

    db.get("SELECT * FROM live_signals WHERE symbol = ?", [symbol.toUpperCase()], async (err, signal) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!signal) return res.status(404).json({ error: 'Signal not found' });

        try {
            // 1. Fetch fresh market data
            const { historical, quote } = await fetchMarketData(symbol);
            const indicators = calculateIndicators(historical);
            const vix = await fetchVIX();

            // 2. Prepare context for AI
            const strategy = {
                name: signal.best_strategy || 'Multi-Timeframe Confluence', // Fallback
                score: signal.final_score,
                signal: signal.final_signal
            };

            const marketState = {
                price: quote.regularMarketPrice,
                vix: vix.value,
                gex: 0 // Placeholder until we have real GEX
            };

            const setup = {
                entryZone: signal.entry_price,
                stopLoss: signal.stop_loss,
                target: signal.target_price
            };

            // Enhanced context with multi-timeframe signals
            const timeframeSignals = {
                tf15m: signal.signal_15m || 'N/A',
                tf1h: signal.signal_1h || 'N/A',
                tf1d: signal.signal_1d || 'N/A'
            };

            // 3. Generate Analysis with enhanced context
            const aiResult = await generateAISentiment(symbol, indicators, strategy, marketState, setup, timeframeSignals);
            const analysis = aiResult.combined_analysis;

            // 4. Save to DB
            db.run("UPDATE live_signals SET ai_analysis = ? WHERE symbol = ?", [analysis, symbol.toUpperCase()], (err) => {
                if (err) console.error('Failed to save AI analysis:', err);
            });

            res.json({ analysis });

        } catch (error) {
            console.error('AI Analysis failed:', error);
            res.status(500).json({ error: 'Failed to generate AI analysis' });
        }
    });
});

export default router;
