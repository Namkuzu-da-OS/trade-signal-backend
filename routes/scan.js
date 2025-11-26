import express from 'express';
import yahooFinance from 'yahoo-finance2';
import axios from 'axios';
import CONFIG from '../config.js';
import db from '../database.js';
import {
    scoreOpeningRangeBreakout,
    scoreVWAPBounce,
    scoreGoldenSetup,
    scoreMeanReversion,
    scoreVWAPReversion,
    scoreValueAreaPlay,
    scoreOrderBlock,
    scoreVolatilitySqueeze as scoreIntradaySqueeze
} from '../strategies/intraday.js';
import { scoreSwingPullback } from '../strategies/swing.js';
import { detectMarketRegime } from '../services/marketRegime.js';
import {
    scoreInstitutionalTrend,
    scoreVolatilitySqueeze,
    scorePanicReversion,
    scoreEMAMomentumConfluence,
    scoreVolatilityBreakoutEnhanced,
    scoreVWAPMeanReversion,
    scoreGammaExposure,
    scoreVIXReversion,
    calculateVolumeProfile,
    calculateGEX
} from '../strategies.js';
import {
    fetchDataForInterval,
    fetchVIX,
    fetchMarketData,
    fetchMultiTimeframeData,
    calculateIndicators,
    calculateKeyLevels,
    calculateKeltnerChannels,
    calculateVWAPBands,
    calculateIntradayProfile
} from '../analysis.js';
import { calculateTradeSetup } from '../tradeManager.js';
import { generateAISentiment } from '../services/ai.js';
import { sessionService } from '../services/session.js';

const router = express.Router();

// Helper functions for external data
async function fetchLocalSentiment() {
    try {
        const response = await axios.get(`${CONFIG.LOCAL_API_URL}/api/x/analyze/combined`);
        return response.data;
    } catch (error) {
        console.error('Error fetching local sentiment:', error.message);
        return null;
    }
}

async function fetchMarketCycles() {
    try {
        const response = await axios.get(`${CONFIG.LOCAL_API_URL}/api/cycles/active`);
        return response.data;
    } catch (error) {
        console.error('Error fetching market cycles:', error.message);
        return null;
    }
}

// Validation Middleware
function validateSymbol(req, res, next) {
    const symbol = req.query.symbol || req.body.symbol || req.params.symbol;
    if (!symbol) {
        return res.status(400).json({
            error: 'Symbol is required',
            message: 'Please provide a valid stock symbol (e.g., SPY, AAPL, NVDA)'
        });
    }
    if (!/^[A-Z0-9-]{1,12}(\.[A-Z]{1,2})?$/.test(symbol.toUpperCase())) {
        return res.status(400).json({
            error: 'Invalid symbol format',
            message: `"${symbol}" is not a valid ticker symbol.Symbols must be 1 - 12 characters(e.g., SPY, BTC - USD).`
        });
    }
    if (req.query.symbol) req.query.symbol = symbol.toUpperCase();
    if (req.body.symbol) req.body.symbol = symbol.toUpperCase();
    if (req.params.symbol) req.params.symbol = symbol.toUpperCase();
    next();
}

function validateInterval(req, res, next) {
    const interval = req.query.interval;
    const validIntervals = ['15m', '1h', '1d', '1wk'];
    if (interval && !validIntervals.includes(interval)) {
        return res.status(400).json({
            error: 'Invalid interval',
            message: `Interval must be one of: ${validIntervals.join(', ')} `,
            received: interval
        });
    }
    next();
}

/**
 * @swagger
 * /api/scan:
 *   get:
 *     summary: Perform a technical analysis scan
 */
router.get('/', validateSymbol, validateInterval, async (req, res) => {
    const symbol = req.query.symbol || 'SPY';
    const interval = req.query.interval || '1d';

    try {
        console.log(`[SCAN] Fetching ${interval} data for ${symbol}...`);

        const promises = [
            fetchDataForInterval(symbol, interval),
            fetchVIX(),
            fetchLocalSentiment(),
            fetchMarketCycles()
        ];

        if (interval === '15m' || interval === '1h') {
            promises.push(fetchDataForInterval(symbol, '1d'));
        }

        const results = await Promise.all(promises);
        const marketData = results[0];
        const vix = results[1];
        const sentimentData = results[2];
        const cyclesData = results[3];
        const dailyData = (interval === '15m' || interval === '1h') ? results[4] : null;

        const historical = Array.isArray(marketData) ? marketData : marketData.historical;

        let quote;
        if (marketData.quote) {
            quote = marketData.quote;
        } else if (historical && historical.length > 0) {
            const last = historical[historical.length - 1];
            const prev = historical[historical.length - 2];
            quote = {
                regularMarketPrice: last.close,
                regularMarketChange: last.close - prev.close,
                regularMarketChangePercent: ((last.close - prev.close) / prev.close) * 100,
                marketState: 'REGULAR'
            };
        }

        if (!historical || historical.length < 50) {
            return res.status(400).json({
                error: 'Insufficient historical data',
                message: `Need at least 50 candles, got ${historical?.length || 0} `
            });
        }

        let gexData = { totalGEX: 0, zeroGammaLevel: 0, val: 0 };
        try {
            const optionsRes = await yahooFinance.options(symbol, { lang: 'en-US', formatted: false, region: 'US' });
            if (optionsRes && optionsRes.options && optionsRes.options.length > 0) {
                const chain = optionsRes.options[0];
                const currentPrice = quote.regularMarketPrice;
                const allOptions = [...chain.calls, ...chain.puts];
                gexData = calculateGEX(allOptions, currentPrice);
            }
        } catch (optErr) {
            console.warn(`[SCAN] Options data failed for ${symbol}: ${optErr.message} `);
        }

        const indicators = calculateIndicators(historical);
        const vp = calculateVolumeProfile(historical, 50);

        // Intraday Advanced Indicators
        let vwapBands = null;
        let volumeProfile = null;
        let sessionPhase = 'CLOSED';

        if (interval === '15m' || interval === '1h') {
            vwapBands = calculateVWAPBands(historical);
            volumeProfile = calculateIntradayProfile(historical);
            sessionPhase = sessionService.getSessionPhase();

            // Attach to indicators object for strategies
            indicators.vwapBands = vwapBands;
            indicators.volumeProfile = volumeProfile;
            indicators.keltnerChannels = calculateKeltnerChannels(historical);
        }

        // Detect Market Regime
        const regimeResult = detectMarketRegime(indicators, { vix: vix.value });
        let marketRegime = regimeResult.regime;
        let regimeColor = marketRegime.includes('TRENDING') ? 'green' :
            marketRegime === 'VOLATILE' ? 'red' : 'yellow';

        let dailyTrend = { bullish: false, bearish: false };
        if (dailyData && dailyData.length > 20) {
            const dailyIndicators = calculateIndicators(dailyData);
            const lastPrice = dailyData[dailyData.length - 1].close;
            const sma20 = dailyIndicators.sma20History[dailyIndicators.sma20History.length - 1];
            dailyTrend.bullish = lastPrice > sma20;
            dailyTrend.bearish = lastPrice < sma20;
        }

        let signals = [];
        if (interval === '15m' || interval === '1h') {
            signals = [
                scoreOpeningRangeBreakout(indicators, quote),
                scoreGoldenSetup(indicators, dailyTrend, { gex: gexData.val }),
                scoreMeanReversion(indicators),
                scoreVWAPReversion(indicators), // New
                scoreValueAreaPlay(indicators),  // New
                scoreOrderBlock(indicators),     // New Phase 6
                scoreIntradaySqueeze(indicators) // New Phase 6
            ];
            // scoreVIXFlow removed as it is not implemented
            /* if (['SPY', 'QQQ', 'IWM'].includes(symbol)) {
                const vixData = await fetchVIX('15m');
                signals.push(scoreVIXFlow(indicators, vixData.historical));
            } */
        } else {
            // Daily/Swing Strategies
            signals = [
                scoreSwingPullback(indicators, { vix: vix.value }),
                scoreInstitutionalTrend(indicators, vix),
                scoreVolatilitySqueeze(indicators, vix),
                scorePanicReversion(indicators, vix),
                scoreEMAMomentumConfluence(indicators, vix),
                scoreVolatilityBreakoutEnhanced(indicators, vix),
                scoreVWAPMeanReversion(indicators, vix),
                scoreGammaExposure(gexData, quote.regularMarketPrice)
            ];
            if (['SPY', 'QQQ', 'IWM'].includes(symbol)) {
                const vixData = await fetchVIX('1d');
                signals.push(scoreVIXReversion(vixData.historical));
            }
        }

        signals.sort((a, b) => b.score - a.score);

        // Filter signals based on Regime Recommendations (Optional, but good for quality)
        // For now, we just pass the regime info to the frontend

        if (vix.value < CONFIG.VIX_LOW_VOLATILITY) {
            marketRegime = 'Low Volatility';
            regimeColor = 'emerald';
        } else if (vix.value >= CONFIG.VIX_LOW_VOLATILITY && vix.value < CONFIG.VIX_NORMAL) {
            marketRegime = 'Normal';
            regimeColor = 'emerald';
        } else if (vix.value >= CONFIG.VIX_NORMAL && vix.value < CONFIG.VIX_ELEVATED) {
            marketRegime = 'Elevated';
            regimeColor = 'amber';
        } else {
            marketRegime = 'High Fear';
            regimeColor = 'rose';
        }

        const response = {
            symbol: symbol.toUpperCase(),
            timestamp: new Date().toISOString(),
            marketState: {
                price: quote.regularMarketPrice,
                change: quote.regularMarketChange,
                changePercent: quote.regularMarketChangePercent,
                vix: vix.value,
                vixChange: vix.changePercent,
                marketRegime,
                regimeColor,
                sessionPhase, // New
                isMarketOpen: quote.marketState === 'REGULAR',
                gex: gexData.val,
                zeroGamma: gexData.zeroGammaLevel
            },
            sentiment: sentimentData,
            marketCycles: cyclesData,
            signals,
            chartData: {
                dates: indicators.dates,
                prices: indicators.priceHistory,
                sma20: indicators.sma20History,
                sma200: indicators.sma200History,
                upperBand: indicators.bbUpperHistory,
                lowerBand: indicators.bbLowerHistory,
                vwap: indicators.vwapHistory,
                vwapBands: vwapBands, // New
                volumes: historical.map(h => h.volume),
                volumeProfile: vp.profile,
                intradayProfile: volumeProfile, // New
                poc: vp.poc
            },
            indicators: {
                rsi: indicators.rsi,
                adx: indicators.adx,
                bbWidth: indicators.bbWidth,
                rvol: indicators.rvol
            }
        };

        if (signals.length > 0) {
            const topStrategy = signals[0];
            const aiSentiment = await generateAISentiment(
                symbol,
                indicators,
                topStrategy,
                response.marketState,
                topStrategy.setup
            );
            response.sentiment = aiSentiment;
        } else {
            response.sentiment = sentimentData;
        }

        console.log(`[SCAN] Success - ${symbol} @$${quote.regularMarketPrice} `);
        res.json(response);

    } catch (error) {
        console.error(`[SCAN] Error for ${symbol}: `, error.message);
        res.status(500).json({
            error: 'Failed to fetch market data',
            message: error.message
        });
    }
});

/**
 * @swagger
 * /api/scan/batch:
 *   post:
 *     summary: Perform a technical analysis scan on multiple symbols
 */
router.post('/batch', async (req, res) => {
    const { symbols, interval = '1d' } = req.body;

    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
        return res.status(400).json({ error: 'Invalid or empty symbols array' });
    }

    console.log(`[BATCH] Scanning ${symbols.length} symbols(${interval}): ${symbols.join(', ')} `);

    const results = [];

    for (const symbol of symbols) {
        try {
            const promises = [
                fetchDataForInterval(symbol, interval),
                fetchVIX()
            ];

            if (interval === '15m' || interval === '1h') {
                promises.push(fetchDataForInterval(symbol, '1d'));
            }

            const fetchResults = await Promise.all(promises);
            const marketData = fetchResults[0];
            const vix = fetchResults[1];
            const dailyData = (interval === '15m' || interval === '1h') ? fetchResults[2] : null;

            const historical = Array.isArray(marketData) ? marketData : marketData.historical;

            if (!historical || historical.length < 50) {
                console.warn(`[BATCH] Insufficient data for ${symbol}`);
                continue;
            }

            const last = historical[historical.length - 1];
            const prev = historical[historical.length - 2];
            const quote = {
                regularMarketPrice: last.close,
                regularMarketChange: last.close - prev.close,
                regularMarketChangePercent: ((last.close - prev.close) / prev.close) * 100
            };

            const indicators = calculateIndicators(historical);

            let dailyTrend = { bullish: false, bearish: false };
            if (dailyData && dailyData.length > 20) {
                const dailyIndicators = calculateIndicators(dailyData);
                const lastPrice = dailyData[dailyData.length - 1].close;
                const sma20 = dailyIndicators.sma20History[dailyIndicators.sma20History.length - 1];
                dailyTrend.bullish = lastPrice > sma20;
                dailyTrend.bearish = lastPrice < sma20;
            }

            let signals = [];
            if (interval === '15m' || interval === '1h') {
                signals = [
                    scoreOpeningRangeBreakout(indicators, quote),
                    scoreVWAPBounce(indicators),
                    scoreGoldenSetup(indicators, dailyTrend, { gex: 0 })
                ];
            } else {
                signals = [
                    scoreInstitutionalTrend(indicators, vix),
                    scoreVolatilitySqueeze(indicators, vix),
                    scorePanicReversion(indicators, vix),
                    scoreEMAMomentumConfluence(indicators, vix)
                ];
            }

            signals.sort((a, b) => b.score - a.score);
            const bestSignal = signals[0];

            results.push({
                symbol: symbol.toUpperCase(),
                price: quote.regularMarketPrice,
                changePercent: quote.regularMarketChangePercent,
                score: bestSignal.score,
                signal: bestSignal.signal,
                strategy: bestSignal.name,
                color: bestSignal.color
            });

        } catch (error) {
            console.error(`[BATCH] Error scanning ${symbol}: `, error.message);
        }
    }

    results.sort((a, b) => b.score - a.score);

    console.log(`[BATCH] Completed.Found ${results.length} results.`);
    res.json(results);
});

/**
 * @swagger
 * /api/scan/multi/{symbol}:
 *   get:
 *     summary: Get multi-timeframe analysis and professional trade setup
 */
router.get('/multi/:symbol', async (req, res) => {
    const symbol = req.params.symbol.toUpperCase();
    try {
        console.log(`[MULTI] Analyzing ${symbol}...`);

        // 1. Fetch Data
        const { daily, weekly, monthly } = await fetchMultiTimeframeData(symbol);

        if (!daily || daily.length < 200) {
            return res.status(400).json({ error: 'Insufficient data' });
        }

        // 2. Calculate Indicators (Daily)
        const indicators = calculateIndicators(daily);

        // 3. Calculate Key Levels
        const levels = calculateKeyLevels(daily);

        // 4. Determine Trend Context
        const trend = {
            daily: indicators.currentPrice > indicators.sma200 ? 'UP' : 'DOWN',
            weekly: weekly.length > 50 && weekly[weekly.length - 1].close > weekly[weekly.length - 1].open ? 'UP' : 'NEUTRAL',
            monthly: monthly.length > 12 && monthly[monthly.length - 1].close > monthly[monthly.length - 1].open ? 'UP' : 'NEUTRAL'
        };

        // 5. Generate Trade Setup
        const side = trend.daily === 'UP' ? 'BUY' : 'SELL';
        const setup = calculateTradeSetup(indicators.currentPrice, side, daily);

        res.json({
            symbol,
            price: indicators.currentPrice,
            trend,
            indicators,
            levels,
            setup
        });

    } catch (error) {
        console.error(`[MULTI] Error for ${symbol}: `, error.message);
        res.status(500).json({ error: error.message });
    }
});



/**
 * @swagger
 * /api/scan/signals/live/{symbol}:
 *   get:
 *     summary: Get detailed live signal data for a symbol
 *     description: Performs a real-time 15m scan to calculate Session Phase, VWAP, and Intraday Signals, merging with stored 1H/1D data.
 *     tags: [Scanning]
 *     parameters:
 *       - in: path
 *         name: symbol
 *         required: true
 *         schema:
 *           type: string
 *         description: Stock ticker symbol (e.g., SPY, AAPL)
 *     responses:
 *       200:
 *         description: Detailed signal object
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 symbol:
 *                   type: string
 *                 final_signal:
 *                   type: string
 *                   example: "WATCH SQUEEZE"
 *                 final_score:
 *                   type: integer
 *                   example: 75
 *                 session_phase:
 *                   type: string
 *                   example: "OPENING_DRIVE"
 *                 vwap:
 *                   type: number
 *                 vah:
 *                   type: number
 *                 val:
 *                   type: number
 *                 entry_price:
 *                   type: number
 *                 stop_loss:
 *                   type: number
 *                 target_price:
 *                   type: number
 *                 score_15m:
 *                   type: integer
 *                 signal_15m:
 *                   type: string
 *                 top_strategy_15m:
 *                   type: string
 *                 score_1h:
 *                   type: integer
 *                 score_1d:
 *                   type: integer
 *                 ai_analysis:
 *                   type: string
 *                   description: Markdown formatted AI analysis
 */
router.get('/signals/live/:symbol', async (req, res) => {
    const symbol = req.params.symbol.toUpperCase();
    try {
        // Reuse the main scan logic but return formatted details
        // For efficiency, we should probably cache the last scan result or query the DB
        // But to ensure "live" data and session info, let's run a quick 15m scan

        const interval = '15m';
        const [marketData, vix] = await Promise.all([
            fetchDataForInterval(symbol, interval),
            fetchVIX()
        ]);

        const historical = Array.isArray(marketData) ? marketData : marketData.historical;
        if (!historical || historical.length < 50) throw new Error('Insufficient data');

        const indicators = calculateIndicators(historical);
        const vwapBands = calculateVWAPBands(historical);
        const volumeProfile = calculateIntradayProfile(historical);
        const sessionPhase = sessionService.getSessionPhase();

        indicators.vwapBands = vwapBands;
        indicators.volumeProfile = volumeProfile;
        indicators.keltnerChannels = calculateKeltnerChannels(historical);

        // Calculate signals
        const signals = [
            scoreOpeningRangeBreakout(indicators, { regularMarketPrice: indicators.currentPrice }),
            scoreMeanReversion(indicators),
            scoreVWAPReversion(indicators),
            scoreValueAreaPlay(indicators),
            scoreOrderBlock(indicators),
            scoreIntradaySqueeze(indicators)
        ].sort((a, b) => b.score - a.score);

        const topSignal = signals[0];

        // Fetch stored signals for other timeframes
        const dbSignal = await new Promise((resolve, reject) => {
            db.get("SELECT * FROM live_signals WHERE symbol = ?", [symbol], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        res.json({
            symbol,
            final_signal: topSignal.signal, // Prefer live signal
            final_score: topSignal.score,   // Prefer live score
            session_phase: sessionPhase,
            vwap: vwapBands ? vwapBands.vwap : null,
            vah: volumeProfile ? volumeProfile.vah : null,
            val: volumeProfile ? volumeProfile.val : null,
            entry_price: topSignal.setup ? topSignal.setup.entryZone : (dbSignal?.entry_price || null),
            stop_loss: topSignal.setup ? topSignal.setup.stopLoss : (dbSignal?.stop_loss || null),
            target_price: topSignal.setup ? topSignal.setup.target : (dbSignal?.target_price || null),

            // 15m is live
            score_15m: topSignal.score,
            signal_15m: topSignal.signal,
            top_strategy_15m: topSignal.name,

            // 1h and 1d from DB
            score_1h: dbSignal?.score_1h || 0,
            signal_1h: dbSignal?.signal_1h || 'WAIT',
            top_strategy_1h: dbSignal?.top_strategy_1h || '-',

            score_1d: dbSignal?.score_1d || 0,
            signal_1d: dbSignal?.signal_1d || 'WAIT',
            top_strategy_1d: dbSignal?.top_strategy_1d || '-',

            scan_timestamp: new Date().toISOString(),
            ai_analysis: dbSignal?.ai_analysis || null
        });

    } catch (error) {
        console.error(`Error fetching live signal for ${symbol}:`, error.message);
        res.status(500).json({ error: error.message });
    }
});

router.get('/market/status', async (req, res) => {
    try {
        const symbols = ['SPY', 'QQQ', '^VIX', 'BTC-USD'];
        const promises = symbols.map(sym => yahooFinance.quote(sym));
        const results = await Promise.all(promises);

        const data = {};
        results.forEach(q => {
            // Handle VIX special case (caret)
            const key = q.symbol === '^VIX' ? 'VIX' : q.symbol;
            data[key] = {
                price: q.regularMarketPrice,
                change: q.regularMarketChangePercent,
                prevClose: q.regularMarketPreviousClose
            };
        });

        res.json(data);
    } catch (error) {
        console.error('Error fetching market status:', error.message);
        res.status(500).json({ error: error.message });
    }
});

export default router;
