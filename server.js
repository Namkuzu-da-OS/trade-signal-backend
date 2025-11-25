import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import yahooFinance from 'yahoo-finance2';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { SMA, RSI, BollingerBands, ADX } from 'technicalindicators';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import sqlite3 from 'sqlite3';
import axios from 'axios';
import {
    calculateIndicators,
    calculateVolumeProfile,
    scoreInstitutionalTrend,
    scoreVolatilitySqueeze,
    scorePanicReversion,
    scoreEMAMomentumConfluence,
    scoreVolatilityBreakoutEnhanced,
    scoreVWAPMeanReversion,
    calculateGEX,
    scoreGammaExposure,
    scoreVIXReversion
} from './strategies.js';
import {
    scoreOpeningRangeBreakout,
    scoreVWAPBounce,
    scoreGoldenSetup,
    scoreVIXFlow
} from './strategies/intraday.js';
import {
    fetchMultiTimeframeData,
    calculateAdvancedIndicators,
    calculateKeyLevels,
    fetchDataForInterval
} from './analysis.js';
import { calculateTradeSetup } from './tradeManager.js';
import { AutoTrader } from './automation.js';

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 300,
    }
});

const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) console.error('Error opening database:', err.message);
    else {
        console.log('Connected to SQLite database.');
        db.run(`CREATE TABLE IF NOT EXISTS watchlists (
            symbol TEXT PRIMARY KEY,
            added_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS portfolio (
        symbol TEXT PRIMARY KEY,
        quantity INTEGER,
        avg_price REAL
    )`);
        db.run(`CREATE TABLE IF NOT EXISTS trades(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT,
        side TEXT,
        quantity INTEGER,
        price REAL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        setup_type TEXT,
        stop_loss REAL,
        target_price REAL,
        pnl REAL,
        status TEXT DEFAULT 'OPEN'
    )`);

        db.run(`CREATE TABLE IF NOT EXISTS journal_entries(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trade_id INTEGER,
        note TEXT,
        image_url TEXT,
        emotion TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(trade_id) REFERENCES trades(id)
    )`);

        db.run(`CREATE TABLE IF NOT EXISTS alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT,
            strategy TEXT,
            score REAL,
            signal TEXT,
            ai_analysis TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Initialize cash if not exists (using a special symbol 'CASH')
        db.get("SELECT * FROM portfolio WHERE symbol = 'CASH'", (err, row) => {
            if (!row) {
                db.run("INSERT INTO portfolio (symbol, quantity, avg_price) VALUES ('CASH', 100000, 1)");
            }
        });

        // Attempt migrations for existing tables (ignore errors)
        const migrations = [
            "ALTER TABLE trades ADD COLUMN setup_type TEXT",
            "ALTER TABLE trades ADD COLUMN stop_loss REAL",
            "ALTER TABLE trades ADD COLUMN target_price REAL",
            "ALTER TABLE trades ADD COLUMN pnl REAL",
            "ALTER TABLE trades ADD COLUMN status TEXT DEFAULT 'OPEN'"
        ];
        migrations.forEach(query => db.run(query, () => { }));

        // Initialize AutoTrader with DB and AI Generator
        // Note: We pass generateAISentiment, but automation.js is configured to NOT use it automatically now.
        // It will be used by the manual endpoint.
        global.autoTrader = new AutoTrader(db, generateAISentiment);
    }
});

const LOCAL_API_URL = process.env.LOCAL_API_URL || 'http://localhost:3000';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ============================================================================
// JOURNAL API
// ============================================================================

app.post('/api/journal', (req, res) => {
    const { trade_id, note, image_url, emotion } = req.body;
    db.run(
        "INSERT INTO journal_entries (trade_id, note, image_url, emotion) VALUES (?, ?, ?, ?)",
        [trade_id, note, image_url, emotion],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID, message: 'Entry added' });
        }
    );
});

app.get('/api/journal', (req, res) => {
    db.all("SELECT * FROM journal_entries ORDER BY timestamp DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Swagger Configuration
const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'TradeSignal AI API',
            version: '1.0.0',
            description: 'Algorithmic trading signal engine API',
        },
        servers: [
            {
                url: `http://localhost:${PORT}`,
                description: 'Local server',
            },
        ],
    },
    apis: ['./server.js'], // Look for annotations in this file
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// ============================================================================
// DATA FETCHING LAYER
// ============================================================================

async function fetchMarketData(symbol) {
    // Use chart API instead of historical (better success rate)
    const chartResult = await yahooFinance.chart(symbol, {
        period1: '2024-01-01',
        period2: new Date().toISOString().split('T')[0],
        interval: '1d'
    });

    // Convert chart result to historical format
    const quotes = chartResult.quotes || [];
    const historical = quotes.map(q => ({
        date: new Date(q.date),
        open: q.open,
        high: q.high,
        low: q.low,
        close: q.close,
        volume: q.volume
    })).filter(q => q.close !== null); // Filter out null values

    // Get current quote from chart meta or fetch separately
    const meta = chartResult.meta || {};
    const quote = {
        regularMarketPrice: meta.regularMarketPrice || historical[historical.length - 1]?.close,
        regularMarketChange: meta.regularMarketPrice - meta.previousClose || 0,
        regularMarketChangePercent: ((meta.regularMarketPrice - meta.previousClose) / meta.previousClose * 100) || 0,
        marketState: meta.marketState || 'CLOSED'
    };

    return { historical, quote };
}

async function fetchVIX(interval = '1d') {
    try {
        const chartResult = await yahooFinance.chart('^VIX', {
            period1: '2024-01-01', // Fetch enough history
            period2: new Date().toISOString().split('T')[0],
            interval: interval
        });

        const quotes = chartResult.quotes || [];
        const historical = quotes.map(q => ({
            date: new Date(q.date),
            open: q.open,
            high: q.high,
            low: q.low,
            close: q.close,
            volume: q.volume
        })).filter(q => q.close !== null);

        const current = historical[historical.length - 1] || {};

        return {
            value: current.close || 20,
            change: (current.close - (historical[historical.length - 2]?.close || current.close)) || 0,
            changePercent: 0, // Calculate if needed, but value is most important
            historical
        };
    } catch (error) {
        console.error('Error fetching VIX:', error.message);
        return { value: 20, change: 0, changePercent: 0, historical: [] }; // Fallback
    }
}

async function generateAISentiment(symbol, indicators, strategy, marketState, setup) {
    try {
        if (!process.env.GEMINI_API_KEY) {
            return { combined_analysis: 'AI sentiment unavailable (API key not configured)' };
        }

        const prompt = `You are a professional trading analyst. Analyze this setup concisely:

Symbol: ${symbol}
Strategy: ${strategy.name} (Score: ${strategy.score}%)
Signal: ${strategy.signal}
Price: $${marketState.price.toFixed(2)}
RSI: ${indicators.rsi.toFixed(1)} | ADX: ${indicators.adx.toFixed(1)} | VIX: ${marketState.vix.toFixed(2)}
Setup: Entry $${setup?.entryZone?.toFixed(2) || 'N/A'}, Stop $${setup?.stopLoss?.toFixed(2) || 'N/A'}, Target $${setup?.target?.toFixed(2) || 'N/A'}
GEX: $${marketState.gex.toFixed(2)}B (${marketState.gex > 0 ? 'Positive - Market Makers dampen volatility' : 'Negative - Market Makers amplify volatility'})
Kelly Sizing: ${setup?.kellyRecommendation?.percentage || 20}%

Provide a 2-3 sentence analysis:
1. What makes this setup compelling or risky
2. Key factors to watch
3. Brief market regime context

Be concise, professional, and educational. Use **bold** for emphasis.`;

        const result = await model.generateContent(prompt);
        const response = result.response;
        const text = response.text();

        return { combined_analysis: text };
    } catch (error) {
        console.warn('Gemini API Error:', error.message);
        if (error.message.includes('API_KEY_INVALID')) {
            return { combined_analysis: 'AI sentiment unavailable. Please set a valid **GEMINI_API_KEY** in your .env file. Get one at https://makersuite.google.com/app/apikey' };
        }
        return { combined_analysis: 'AI sentiment temporarily unavailable' };
    }
}


async function fetchLocalSentiment() {
    try {
        const response = await axios.get(`${LOCAL_API_URL}/api/x/analyze/combined`);
        return response.data;
    } catch (error) {
        console.error('Error fetching local sentiment:', error.message);
        return null;
    }
}

async function fetchMarketCycles() {
    try {
        const response = await axios.get(`${LOCAL_API_URL}/api/cycles/active`);
        return response.data;
    } catch (error) {
        console.error('Error fetching market cycles:', error.message);
        return null;
    }
}

// ============================================================================
// TECHNICAL INDICATOR CALCULATIONS
// ============================================================================

/**
 * @swagger
 * /api/scan:
 *   get:
 *     summary: Perform a technical analysis scan
 *     description: Fetches market data and calculates technical indicators to generate trading signals.
 *     parameters:
 *       - in: query
 *         name: symbol
 *         schema:
 *           type: string
 *           default: SPY
 *         description: The ticker symbol to analyze (e.g., SPY, NVDA)
 *     responses:
 *       200:
 *         description: Successful analysis
 *         content:
 *             schema:
 *               type: object
 *               properties:
 *                 symbol:
 *                   type: string
 *                 marketState:
 *                   type: object
 *                 signals:
 *                   type: array
 *                   items:
 *                     type: object
 *                 indicators:
 *                   type: object
 *       400:
 *         description: Insufficient data
 *       500:
 *         description: Server error
 */
app.get('/api/scan', async (req, res) => {
    const symbol = req.query.symbol || 'SPY';
    const interval = req.query.interval || '1d';

    try {
        console.log(`[SCAN] Fetching ${interval} data for ${symbol}...`);

        // Fetch market data, VIX, and Local API data in parallel
        const promises = [
            fetchDataForInterval(symbol, interval),
            fetchVIX(),
            fetchLocalSentiment(),
            fetchMarketCycles()
        ];

        // If intraday, also fetch daily for MTF alignment
        if (interval === '15m' || interval === '1h') {
            promises.push(fetchDataForInterval(symbol, '1d'));
        }

        const results = await Promise.all(promises);
        const marketData = results[0];
        const vix = results[1];
        const sentimentData = results[2];
        const cyclesData = results[3];
        const dailyData = (interval === '15m' || interval === '1h') ? results[4] : null;

        // Handle different return structures from fetchDataForInterval vs fetchMarketData
        const historical = Array.isArray(marketData) ? marketData : marketData.historical;

        // Construct quote object if not present (fetchDataForInterval returns array)
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
                message: `Need at least 50 candles, got ${historical?.length || 0}`
            });
        }

        // Fetch Options Data (GEX is useful for both Swing and Intraday Golden Setup)
        let gexData = { totalGEX: 0, zeroGammaLevel: 0, val: 0 };
        try {
            const optionsRes = await yahooFinance.options(symbol, { lang: 'en-US', formatted: false, region: 'US' });
            if (optionsRes && optionsRes.options && optionsRes.options.length > 0) {
                const chain = optionsRes.options[0]; // Nearest expiration
                const currentPrice = quote.regularMarketPrice;

                // Combine calls and puts from the chain
                const allOptions = [...chain.calls, ...chain.puts];
                gexData = calculateGEX(allOptions, currentPrice);
            }
        } catch (optErr) {
            console.warn(`[SCAN] Options data failed for ${symbol}: ${optErr.message}`);
        }

        // Calculate all indicators
        const indicators = calculateIndicators(historical);

        // Calculate Volume Profile (last 50 days)
        const vp = calculateVolumeProfile(historical, 50);

        // Calculate Daily Trend for MTF Alignment
        let dailyTrend = { bullish: false, bearish: false };
        if (dailyData && dailyData.length > 20) {
            const dailyIndicators = calculateIndicators(dailyData);
            const lastPrice = dailyData[dailyData.length - 1].close;
            const sma20 = dailyIndicators.sma20History[dailyIndicators.sma20History.length - 1];
            dailyTrend.bullish = lastPrice > sma20;
            dailyTrend.bearish = lastPrice < sma20;
        }

        // Score all strategies
        let signals = [];
        if (interval === '15m' || interval === '1h') {
            // Intraday Strategies
            signals = [
                scoreOpeningRangeBreakout(indicators, quote),
                scoreVWAPBounce(indicators),
                scoreGoldenSetup(indicators, dailyTrend, { gex: gexData.val })
            ];

            // Add VIX Flow (Intraday) for Indices
            if (['SPY', 'QQQ', 'IWM'].includes(symbol)) {
                const vixData = await fetchVIX('15m'); // Fetch intraday VIX
                signals.push(scoreVIXFlow(indicators, vixData.historical));
            }
        } else {
            // Swing Strategies
            signals = [
                scoreInstitutionalTrend(indicators, vix),
                scoreVolatilitySqueeze(indicators, vix),
                scorePanicReversion(indicators, vix),
                scoreEMAMomentumConfluence(indicators, vix),
                scoreVolatilityBreakoutEnhanced(indicators, vix),
                scoreVWAPMeanReversion(indicators, vix),
                scoreGammaExposure(gexData, quote.regularMarketPrice)
            ];

            // Add VIX Reversion (Swing) for Indices
            if (['SPY', 'QQQ', 'IWM'].includes(symbol)) {
                const vixData = await fetchVIX('1d'); // Fetch daily VIX
                signals.push(scoreVIXReversion(vixData.historical));
            }
        }

        // Sort by score (highest first)
        signals.sort((a, b) => b.score - a.score);
        let marketRegime = 'Normal';
        let regimeColor = 'amber';
        if (vix.value < 15) {
            marketRegime = 'Low Volatility';
            regimeColor = 'emerald';
        } else if (vix.value >= 15 && vix.value < 20) {
            marketRegime = 'Normal';
            regimeColor = 'emerald';
        } else if (vix.value >= 20 && vix.value < 30) {
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
                regimeColor,
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
                volumes: historical.map(h => h.volume),
                volumeProfile: vp.profile,
                poc: vp.poc
            },
            indicators: {
                rsi: indicators.rsi,
                adx: indicators.adx,
                bbWidth: indicators.bbWidth,
                rvol: indicators.rvol
            }
        };

        // Generate AI Sentiment for the top strategy
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

        console.log(`[SCAN] Success - ${symbol} @ $${quote.regularMarketPrice}`);
        res.json(response);

    } catch (error) {
        console.error(`[SCAN] Error for ${symbol}:`, error.message);
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
 *     description: Fetches market data and calculates technical indicators for a list of symbols.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               symbols:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["SPY", "QQQ", "NVDA"]
 *     responses:
 *       200:
 *         description: Successful batch analysis
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   symbol:
 *                     type: string
 *                   score:
 *                     type: number
 *                   signal:
 *                     type: string
 *                   strategy:
 *                     type: string
 *       400:
 *         description: Invalid request
 *       500:
 *         description: Server error
 */
app.post('/api/scan/batch', async (req, res) => {
    const { symbols, interval = '1d' } = req.body;

    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
        return res.status(400).json({ error: 'Invalid or empty symbols array' });
    }

    console.log(`[BATCH] Scanning ${symbols.length} symbols (${interval}): ${symbols.join(', ')}`);

    const results = [];

    for (const symbol of symbols) {
        try {
            // Fetch Data
            const promises = [
                fetchDataForInterval(symbol, interval),
                fetchVIX()
            ];

            // MTF: If intraday, fetch daily for trend alignment
            if (interval === '15m' || interval === '1h') {
                promises.push(fetchDataForInterval(symbol, '1d'));
            }

            const fetchResults = await Promise.all(promises);
            const marketData = fetchResults[0];
            const vix = fetchResults[1];
            const dailyData = (interval === '15m' || interval === '1h') ? fetchResults[2] : null;

            // Handle Data Structure
            const historical = Array.isArray(marketData) ? marketData : marketData.historical;

            if (!historical || historical.length < 50) {
                console.warn(`[BATCH] Insufficient data for ${symbol}`);
                continue;
            }

            // Construct Quote (Last Candle)
            const last = historical[historical.length - 1];
            const prev = historical[historical.length - 2];
            const quote = {
                regularMarketPrice: last.close,
                regularMarketChange: last.close - prev.close,
                regularMarketChangePercent: ((last.close - prev.close) / prev.close) * 100
            };

            // Calculate Indicators
            const indicators = calculateIndicators(historical);

            // Calculate Daily Trend (if needed)
            let dailyTrend = { bullish: false, bearish: false };
            if (dailyData && dailyData.length > 20) {
                const dailyIndicators = calculateIndicators(dailyData);
                const lastPrice = dailyData[dailyData.length - 1].close;
                const sma20 = dailyIndicators.sma20History[dailyIndicators.sma20History.length - 1];
                dailyTrend.bullish = lastPrice > sma20;
                dailyTrend.bearish = lastPrice < sma20;
            }

            // Select Strategies
            let signals = [];
            if (interval === '15m' || interval === '1h') {
                // Intraday Strategies
                // Note: We don't have GEX here for batch to save time, passing 0
                signals = [
                    scoreOpeningRangeBreakout(indicators, quote),
                    scoreVWAPBounce(indicators),
                    scoreGoldenSetup(indicators, dailyTrend, { gex: 0 })
                ];
            } else {
                // Swing Strategies
                signals = [
                    scoreInstitutionalTrend(indicators, vix),
                    scoreVolatilitySqueeze(indicators, vix),
                    scorePanicReversion(indicators, vix),
                    scoreEMAMomentumConfluence(indicators, vix)
                ];
            }

            // Sort by score
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
            console.error(`[BATCH] Error scanning ${symbol}:`, error.message);
        }
    }

    // Sort results by score descending
    results.sort((a, b) => b.score - a.score);

    console.log(`[BATCH] Completed. Found ${results.length} results.`);
    res.json(results);
});

// Health check endpoint
/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Health check
 *     description: Verifies that the server is running.
 *     responses:
 *       200:
 *         description: Server is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 */
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================================================
// WATCHLIST API
// ============================================================================

/**
 * @swagger
 * /api/watchlist:
 *   get:
 *     summary: Get all watchlist symbols
 *     responses:
 *       200:
 *         description: List of watched symbols
 */
app.get('/api/watchlist', (req, res) => {
    db.all("SELECT * FROM watchlists ORDER BY added_at DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

/**
 * @swagger
 * /api/watchlist:
 *   post:
 *     summary: Add a symbol to watchlist
 *     parameters:
 *       - in: body
 *         name: symbol
 *         schema:
 *           type: object
 *           properties:
 *             symbol:
 *               type: string
 *     responses:
 *       200:
 *         description: Symbol added
 */
app.post('/api/watchlist', express.json(), (req, res) => {
    const { symbol } = req.body;
    if (!symbol) return res.status(400).json({ error: 'Symbol is required' });

    db.run("INSERT OR IGNORE INTO watchlists (symbol) VALUES (?)", [symbol.toUpperCase()], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Added to watchlist', id: this.lastID });
    });
});

/**
 * @swagger
 * /api/watchlist/{symbol}:
 *   delete:
 *     summary: Remove a symbol from watchlist
 *     parameters:
 *       - in: path
 *         name: symbol
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Symbol removed
 */
app.delete('/api/watchlist/:symbol', (req, res) => {
    const symbol = req.params.symbol.toUpperCase();
    db.run("DELETE FROM watchlists WHERE symbol = ?", [symbol], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Removed from watchlist', changes: this.changes });
    });
});

// ============================================================================
// PAPER TRADING API
// ============================================================================

app.get('/api/portfolio', (req, res) => {
    db.all("SELECT * FROM portfolio", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/trade', express.json(), async (req, res) => {
    const { symbol, side, quantity, price, setup_type, stop_loss, target_price } = req.body;
    if (!symbol || !side || !quantity || !price) {
        return res.status(400).json({ error: 'Missing trade parameters' });
    }

    const cost = quantity * price;

    db.serialize(() => {
        db.run("BEGIN TRANSACTION");

        // Check Cash
        db.get("SELECT quantity FROM portfolio WHERE symbol = 'CASH'", (err, cashRow) => {
            if (err) {
                db.run("ROLLBACK");
                return res.status(500).json({ error: err.message });
            }

            const cash = cashRow ? cashRow.quantity : 0;

            if (side === 'BUY') {
                if (cash < cost) {
                    db.run("ROLLBACK");
                    return res.status(400).json({ error: 'Insufficient funds' });
                }

                // Deduct Cash
                db.run("UPDATE portfolio SET quantity = quantity - ? WHERE symbol = 'CASH'", [cost]);

                // Update Position
                db.get("SELECT * FROM portfolio WHERE symbol = ?", [symbol], (err, row) => {
                    if (row) {
                        const newQty = row.quantity + quantity;
                        const newAvg = ((row.quantity * row.avg_price) + cost) / newQty;
                        db.run("UPDATE portfolio SET quantity = ?, avg_price = ? WHERE symbol = ?", [newQty, newAvg, symbol]);
                    } else {
                        db.run("INSERT INTO portfolio (symbol, quantity, avg_price) VALUES (?, ?, ?)", [symbol, quantity, price]);
                    }
                });

            } else if (side === 'SELL') {
                // Check Position
                db.get("SELECT * FROM portfolio WHERE symbol = ?", [symbol], (err, row) => {
                    if (!row || row.quantity < quantity) {
                        db.run("ROLLBACK");
                        return res.status(400).json({ error: 'Insufficient position' });
                    }

                    // Add Cash
                    db.run("UPDATE portfolio SET quantity = quantity + ? WHERE symbol = 'CASH'", [cost]);

                    // Update Position
                    const newQty = row.quantity - quantity;
                    if (newQty === 0) {
                        db.run("DELETE FROM portfolio WHERE symbol = ?", [symbol]);
                    } else {
                        db.run("UPDATE portfolio SET quantity = ? WHERE symbol = ?", [newQty, symbol]);
                    }
                });
            }

            // Record Trade
            db.run(
                `INSERT INTO trades (symbol, side, quantity, price, setup_type, stop_loss, target_price, pnl, status) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [symbol, side, quantity, price, setup_type, stop_loss, target_price, 0, 'OPEN'],
                function (err) {
                    if (err) {
                        db.run("ROLLBACK");
                        return res.status(500).json({ error: err.message });
                    }

                    db.run("COMMIT");
                    res.json({ message: 'Trade executed', id: this.lastID });
                }
            );
        });
    });
});

// ============================================================================
// PROFESSIONAL ANALYSIS API
// ============================================================================

/**
 * @swagger
 * /api/analyze/multi/{symbol}:
 *   get:
 *     summary: Get multi-timeframe analysis and professional trade setup
 *     parameters:
 *       - in: path
 *         name: symbol
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Detailed analysis
 */
app.get('/api/analyze/multi/:symbol', async (req, res) => {
    const symbol = req.params.symbol.toUpperCase();
    try {
        console.log(`[MULTI] Analyzing ${symbol}...`);

        // 1. Fetch Data
        const { daily, weekly, monthly } = await fetchMultiTimeframeData(symbol);

        if (!daily || daily.length < 200) {
            return res.status(400).json({ error: 'Insufficient data' });
        }

        // 2. Calculate Advanced Indicators (Daily)
        const indicators = calculateAdvancedIndicators(daily);

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
        console.error(`[MULTI] Error for ${symbol}:`, error.message);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================================
// ALERTS & AUTOMATION API
// ============================================================================

/**
 * @swagger
 * /api/alerts:
 *   get:
 *     summary: Get recent AI alerts
 *     responses:
 *       200:
 *         description: List of alerts
 */
app.get('/api/alerts', (req, res) => {
    db.all("SELECT * FROM alerts ORDER BY timestamp DESC LIMIT 50", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

/**
 * @swagger
 * /api/alerts/{id}/analyze:
 *   post:
 *     summary: Trigger AI analysis for a specific alert
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Analysis generated and saved
 */
app.post('/api/alerts/:id/analyze', async (req, res) => {
    const alertId = req.params.id;

    // 1. Fetch Alert
    db.get("SELECT * FROM alerts WHERE id = ?", [alertId], async (err, alert) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!alert) return res.status(404).json({ error: 'Alert not found' });

        if (alert.ai_analysis) {
            return res.json({ message: 'Analysis already exists', analysis: alert.ai_analysis });
        }

        // 2. Re-fetch Market Data (or use stored if we had it, but we only store score/signal)
        // We need fresh indicators for the prompt.
        try {
            const { historical, quote } = await fetchMarketData(alert.symbol);
            const indicators = calculateIndicators(historical);
            const vix = await fetchVIX();

            // Mock strategy object for the prompt
            const strategy = {
                name: alert.strategy,
                score: alert.score,
                signal: alert.signal
            };

            const marketState = {
                price: quote.regularMarketPrice,
                vix: vix.value,
                gex: 0 // We skip GEX re-calc for speed here unless critical
            };

            // 3. Generate AI
            const sentiment = await generateAISentiment(alert.symbol, indicators, strategy, marketState, null);
            const analysis = sentiment.combined_analysis;

            // 4. Update DB
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

/**
 * @swagger
 * /api/auto/status:
 *   get:
 *     summary: Get automation status
 *     responses:
 *       200:
 *         description: Status of the auto trader
 */
app.get('/api/auto/status', (req, res) => {
    if (!global.autoTrader) {
        return res.json({ status: 'initializing', isRunning: false });
    }
    res.json({
        status: global.autoTrader.isRunning ? 'running' : 'stopped',
        isRunning: global.autoTrader.isRunning,
        interval: global.autoTrader.scanInterval
    });
});

/**
 * @swagger
 * /api/auto/start:
 *   post:
 *     summary: Start automation
 *     responses:
 *       200:
 *         description: Automation started
 */
app.post('/api/auto/start', (req, res) => {
    if (!global.autoTrader) return res.status(503).json({ error: 'AutoTrader not ready' });

    const { interval } = req.body;
    global.autoTrader.start(interval || 15);
    res.json({ message: 'Automation started' });
});

/**
 * @swagger
 * /api/auto/stop:
 *   post:
 *     summary: Stop automation
 *     responses:
 *       200:
 *         description: Automation stopped
 */
app.post('/api/auto/stop', (req, res) => {
    if (!global.autoTrader) return res.status(503).json({ error: 'AutoTrader not ready' });

    global.autoTrader.stop();
    res.json({ message: 'Automation stopped' });
});

// ============================================================================
// SERVER START
// ============================================================================

app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║           TradeSignal AI - Backend Server                ║
╠═══════════════════════════════════════════════════════════╣
║  Server running at: http://localhost:${PORT}               ║
║  API Endpoint:      GET /api/scan?symbol=SPY             ║
║  API Docs:          http://localhost:${PORT}/api-docs      ║
║  Health Check:      GET /api/health                      ║
╚═══════════════════════════════════════════════════════════╝
    `);
});
