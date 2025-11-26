import { fetchDataForInterval, fetchMarketData, calculateIndicators, fetchVIX } from './analysis.js';
import {
    scoreInstitutionalTrend,
    scoreVolatilitySqueeze,
    scorePanicReversion,
    scoreVIXReversion,
    scoreEMAMomentumConfluence,
    scoreVolatilityBreakoutEnhanced,
    scoreVWAPMeanReversion,
    scoreGammaExposure
} from './strategies.js';
import {
    scoreOpeningRangeBreakout,
    scoreVWAPBounce,
    scoreGoldenSetup
} from './strategies/intraday.js';
import yahooFinance from 'yahoo-finance2';
import CONFIG from './config.js';
import logger from './utils/logger.js';
import { notificationService } from './services/notification.js';

// Concurrency control for parallel processing
const CONCURRENCY_LIMIT = 5; // Process 5 symbols at a time

/**
 * AutoTrader Class
 * Handles automated trading logic: scanning, signal generation, and trade execution.
 */
export class AutoTrader {
    /**
     * @param {Object} db - SQLite database instance
     * @param {Function} aiGenerator - Function to generate AI sentiment
     */
    constructor(db, aiGenerator) {
        this.db = db;
        this.aiGenerator = aiGenerator;
        this.isRunning = false;
        this.intervalId = null;
        this.intervalMinutes = 15; // Store interval for status endpoint
        this.minScore = 80; // Minimum score to trigger a trade
        this.lastScanTime = null; // Track last scan time
        this.watchlistCount = 0; // Track watchlist size
        this.activityLog = []; // Store recent activity
        this.maxLogSize = 100; // Keep last 100 log entries
    }

    /**
     * Log activity message
     * @param {string} type - 'info', 'success', 'warning', 'error'
     * @param {string} message 
     */
    log(type, message) {
        const entry = {
            timestamp: new Date().toISOString(),
            type,
            message
        };

        this.activityLog.unshift(entry); // Add to beginning

        // Keep only the most recent entries
        if (this.activityLog.length > this.maxLogSize) {
            this.activityLog = this.activityLog.slice(0, this.maxLogSize);
        }

        // Also log to console with prefix
        const prefix = `[AUTO]`;
        switch (type) {
            case 'success': console.log(`${prefix} ✓ ${message}`); break;
            case 'warning': console.warn(`${prefix} ⚠ ${message}`); break;
            case 'error': console.error(`${prefix} ✗ ${message}`); break;
            default: console.log(`${prefix} ${message}`);
        }
    }

    /**
     * Start the automation loop
     * @param {number} intervalMinutes - How often to run the scan (in minutes)
     */
    start(intervalMinutes = 15) {
        if (this.isRunning) {
            this.log('warning', 'Scanner is already running');
            return { status: 'already_running' };
        }

        this.log('success', `Starting Multi-Timeframe Scanner (Interval: ${intervalMinutes}m)`);
        this.isRunning = true;
        this.intervalMinutes = intervalMinutes;

        // Run immediately
        this.runCycle();

        // Schedule loop
        this.intervalId = setInterval(() => {
            this.runCycle();
        }, intervalMinutes * 60 * 1000);

        return { status: 'started', intervalMinutes };
    }

    /**
     * Stop the automation loop
     */
    stop() {
        if (!this.isRunning) return;

        this.log('info', 'Stopping Multi-Timeframe Scanner');
        this.isRunning = false;
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    /**
     * Main execution cycle
     */
    async runCycle() {
        if (!this.isRunning) return;

        this.lastScanTime = new Date().toISOString();
        this.log('info', `Starting scan cycle at ${new Date().toLocaleTimeString()}`);

        try {
            // 1. Get Watchlist
            const symbols = await this.getWatchlist();
            this.watchlistCount = symbols.length;

            if (symbols.length === 0) {
                this.log('warning', 'Watchlist is empty - add symbols to begin scanning');
                return;
            }

            this.log('info', `Scanning ${symbols.length} symbols across ALL timeframes: ${symbols.join(', ')}`);

            // 2. Manage Open Positions (Exit Logic)
            await this.managePositions();

            // 3. Scan symbols in PARALLEL batches (5 at a time)
            const startTime = Date.now();
            let processedCount = 0;

            for (let i = 0; i < symbols.length; i += CONCURRENCY_LIMIT) {
                const batch = symbols.slice(i, i + CONCURRENCY_LIMIT);

                // Process batch in parallel
                const results = await Promise.allSettled(
                    batch.map(symbol => this.processSymbol(symbol))
                );

                // Count successful processes
                processedCount += results.filter(r => r.status === 'fulfilled').length;

                // Log batch completion
                const batchNum = Math.floor(i / CONCURRENCY_LIMIT) + 1;
                const totalBatches = Math.ceil(symbols.length / CONCURRENCY_LIMIT);
                logger.debug(`Batch ${batchNum}/${totalBatches} complete (${batch.length} symbols)`);
            }

            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            this.log('success', `Scan cycle completed - processed ${processedCount}/${symbols.length} symbols in ${elapsed}s`);

        } catch (error) {
            this.log('error', `Scan cycle failed: ${error.message}`);
        }
    }

    /**
     * Process a single symbol across ALL timeframes
     * @param {string} symbol 
     */
    async processSymbol(symbol) {
        try {
            this.log('info', `→ Processing ${symbol} (scanning 15m, 1h, 1d)`);

            // Scan all 3 timeframes in parallel
            const [signals15m, signals1h, signals1d] = await Promise.all([
                this.scanTimeframe(symbol, '15m'),
                this.scanTimeframe(symbol, '1h'),
                this.scanTimeframe(symbol, '1d')
            ]);

            // Aggregate signals
            const aggregated = this.aggregateSignals({
                '15m': signals15m,
                '1h': signals1h,
                '1d': signals1d
            });

            // Store in live_signals table
            await this.storeLiveSignal(symbol, aggregated);

            // Log result
            const logType = aggregated.final_score >= 70 ? 'success' : 'info';
            this.log(logType, `${symbol}: ${aggregated.final_signal} (${aggregated.final_score}%)`);

            // Optional: Execute trade if STRONG BUY
            if (aggregated.final_signal === 'STRONG BUY' && aggregated.final_score >= 80) {
                this.log('success', `🎯 STRONG BUY detected for ${symbol}!`);

                // 1. Generate AI Analysis
                const aiResult = await this.aiGenerator(symbol, {}, aggregated.best_strategy, { price: aggregated.entry_price, vix: 0, gex: 0 }, aggregated.best_strategy.setup);
                const aiAnalysis = aiResult.combined_analysis;

                // 2. Send Discord Alert
                await notificationService.sendTradeAlert({
                    symbol,
                    signal: aggregated.final_signal,
                    score: aggregated.final_score,
                    strategy: aggregated.best_strategy.name,
                    price: aggregated.entry_price,
                    stopLoss: aggregated.best_strategy.setup?.stopLoss,
                    target: aggregated.best_strategy.setup?.target,
                    aiAnalysis
                });

                // Uncomment to enable auto-trading:
                // await this.executeTradeLogic(symbol, aggregated, aggregated.entry_price);
            }

        } catch (error) {
            this.log('error', `Failed processing ${symbol}: ${error.message}`);
        }
    }

    /**
     * Scan a single timeframe for a symbol
     * @param {string} symbol 
     * @param {string} interval - '15m', '1h', or '1d'
     * @returns {Promise<Array>} Array of strategy signals
     */
    async scanTimeframe(symbol, interval) {
        try {
            // Fetch historical data
            const historical = await fetchDataForInterval(symbol, interval);

            if (!historical || historical.length < 50) {
                return [];
            }

            // Calculate indicators
            const indicators = calculateIndicators(historical);

            // Get current price (quote)
            const last = historical[historical.length - 1];
            const prev = historical[historical.length - 2];
            const quote = {
                regularMarketPrice: last.close,
                regularMarketChange: last.close - prev.close,
                regularMarketChangePercent: ((last.close - prev.close) / prev.close) * 100
            };

            // Calculate daily trend if needed for Golden Setup (intraday only)
            let dailyTrend = { bullish: false, bearish: false };
            if (interval === '15m' || interval === '1h') {
                try {
                    const dailyData = await fetchDataForInterval(symbol, '1d');
                    if (dailyData && dailyData.length > 20) {
                        const dailyIndicators = calculateIndicators(dailyData);
                        const lastPrice = dailyData[dailyData.length - 1].close;
                        const sma20 = dailyIndicators.sma20History[dailyIndicators.sma20History.length - 1];
                        dailyTrend.bullish = lastPrice > sma20;
                        dailyTrend.bearish = lastPrice < sma20;
                    }
                } catch (err) {
                    // Daily trend fetch failed, continue without it
                }
            }

            // Run strategies based on timeframe
            const strategies = [];
            // Fetch Real VIX
            const vixData = await fetchVIX();
            const vix = { value: vixData.value || 20 };

            if (interval === '15m' || interval === '1h') {
                // Intraday strategies
                strategies.push(scoreOpeningRangeBreakout(indicators, quote));
                strategies.push(scoreVWAPBounce(indicators));
                strategies.push(scoreGoldenSetup(indicators, dailyTrend, { gex: 0 }));
            } else {
                // Swing strategies (1d)
                strategies.push(scoreInstitutionalTrend(indicators, vix));
                strategies.push(scoreVolatilitySqueeze(indicators, vix));
                strategies.push(scorePanicReversion(indicators, vix));
                strategies.push(scoreEMAMomentumConfluence(indicators, vix));
                strategies.push(scoreVolatilityBreakoutEnhanced(indicators, vix));
                strategies.push(scoreVWAPMeanReversion(indicators, vix));
            }

            // Filter and sort by score
            return strategies
                .filter(s => s && s.score > 0)
                .sort((a, b) => b.score - a.score);

        } catch (error) {
            console.error(`[AUTO] Error scanning ${interval} for ${symbol}:`, error.message);
            return [];
        }
    }

    /**
     * Get the best signal from an array of strategies
     * @param {Array} strategies 
     * @returns {Object} Best strategy or default
     */
    getBestSignal(strategies) {
        if (!strategies || strategies.length === 0) {
            return {
                name: 'No Signal',
                signal: 'NEUTRAL',
                score: 0,
                setup: { entryZone: null, stopLoss: null, target: null }
            };
        }
        return strategies[0]; // Already sorted by score
    }

    /**
     * Aggregate signals from multiple timeframes
     * @param {Object} timeframeSignals - { '15m': [...], '1h': [...], '1d': [...] }
     * @returns {Object} Aggregated signal data
     */
    aggregateSignals(timeframeSignals) {
        const best15m = this.getBestSignal(timeframeSignals['15m']);
        const best1h = this.getBestSignal(timeframeSignals['1h']);
        const best1d = this.getBestSignal(timeframeSignals['1d']);

        // Weighted score: 1d (50%), 1h (30%), 15m (20%)
        const finalScore = Math.round(
            (best1d.score * 0.5) +
            (best1h.score * 0.3) +
            (best15m.score * 0.2)
        );

        // Count bullish signals
        const isBullish = (sig) => sig && (
            sig.includes('BUY') ||
            sig.includes('LONG') ||
            sig === 'BREAKOUT ALERT'
        );

        const bullishCount = [best15m.signal, best1h.signal, best1d.signal]
            .filter(isBullish).length;

        // Determine final signal
        let finalSignal = 'HOLD';
        if (bullishCount >= 3 && finalScore >= 85) {
            finalSignal = 'STRONG BUY';
        } else if (bullishCount >= 2 && finalScore >= 70) {
            finalSignal = 'BUY';
        } else if (finalScore >= 40 && bullishCount >= 1) {
            finalSignal = 'WATCH';
        }

        // Conservative stop loss (widest)
        const stops = [
            best15m.setup?.stopLoss,
            best1h.setup?.stopLoss,
            best1d.setup?.stopLoss
        ].filter(s => s && s > 0);

        const stopLoss = stops.length > 0 ? Math.min(...stops) : null;

        // Average target
        const targets = [
            best15m.setup?.target,
            best1h.setup?.target,
            best1d.setup?.target
        ].filter(t => t && t > 0);

        const targetPrice = targets.length > 0
            ? targets.reduce((a, b) => a + b, 0) / targets.length
            : null;

        // Entry price from shortest timeframe
        const entryPrice = best15m.setup?.entryZone ||
            best1h.setup?.entryZone ||
            best1d.setup?.entryZone;

        return {
            final_signal: finalSignal,
            final_score: finalScore,
            entry_price: entryPrice,
            stop_loss: stopLoss,
            target_price: targetPrice,

            signal_15m: best15m.signal || 'NEUTRAL',
            score_15m: best15m.score || 0,
            top_strategy_15m: best15m.name || 'None',

            signal_1h: best1h.signal || 'NEUTRAL',
            score_1h: best1h.score || 0,
            top_strategy_1h: best1h.name || 'None',

            signal_1d: best1d.signal || 'NEUTRAL',
            score_1d: best1d.score || 0,
            top_strategy_1d: best1d.name || 'None',

            best_strategy: [best15m, best1h, best1d].reduce((prev, current) => (prev.score > current.score) ? prev : current),

            scan_timestamp: new Date().toISOString()
        };
    }

    /**
     * Store aggregated signal in database
     * @param {string} symbol 
     * @param {Object} aggregated 
     */
    storeLiveSignal(symbol, aggregated) {
        return new Promise((resolve, reject) => {
            const query = `
                INSERT OR REPLACE INTO live_signals (
                    symbol, final_signal, final_score, entry_price, stop_loss, target_price,
                    signal_15m, score_15m, top_strategy_15m,
                    signal_1h, score_1h, top_strategy_1h,
                    signal_1d, score_1d, top_strategy_1d,
                    scan_timestamp, last_updated
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `;

            this.db.run(query, [
                symbol,
                aggregated.final_signal,
                aggregated.final_score,
                aggregated.entry_price,
                aggregated.stop_loss,
                aggregated.target_price,
                aggregated.signal_15m,
                aggregated.score_15m,
                aggregated.top_strategy_15m,
                aggregated.signal_1h,
                aggregated.score_1h,
                aggregated.top_strategy_1h,
                aggregated.signal_1d,
                aggregated.score_1d,
                aggregated.top_strategy_1d,
                aggregated.scan_timestamp
            ], (err) => {
                if (err) {
                    console.error(`[AUTO] Error storing signal for ${symbol}:`, err.message);
                    reject(err);
                } else {
                    console.log(`[AUTO] ✓ ${symbol}: ${aggregated.final_signal} (${aggregated.final_score}%)`);
                    resolve();
                }
            });
        });
    }

    /**
     * Execute trade or manage position
     * @param {string} symbol 
     * @param {Object} strategy 
     * @param {number} currentPrice 
     */
    async executeTradeLogic(symbol, strategy, currentPrice) {
        // Check if we already have a position
        const position = await this.getPosition(symbol);

        if (position) {
            // Manage existing position
            // TODO: Implement exit logic (Trailing stop, Target hit, etc.)
            // For now, we just log.
            console.log(`[AUTO] Existing position for ${symbol}. Quantity: ${position.quantity}. Skipping new entry.`);
            return;
        }

        // No position, check if signal is actionable
        if (strategy.signal === 'BUY' || strategy.signal === 'GOLDEN LONG' || strategy.signal === 'STRONG BUY') {
            await this.placeTrade(symbol, 'BUY', strategy, currentPrice);
        } else if (strategy.signal === 'SELL' || strategy.signal === 'GOLDEN SHORT') {
            // We only support Long for now in paper trading usually, unless we have margin logic.
            // But the DB supports 'SELL' side.
            // However, 'SELL' usually means closing a position or shorting.
            // Let's assume Shorting is allowed if we have cash (margin).
            // For simplicity, let's stick to Longs for this version unless explicitly asked.
            // But the user said "auto this project", so let's support Short if the DB supports it.
            // The DB check in server.js for SELL says: "Check Position... Insufficient position".
            // So server.js ONLY supports closing positions with SELL. It does NOT support Short Selling.
            // I will only execute BUYs.
            console.log(`[AUTO] Short signal ignored (Short selling not supported in current engine): ${symbol}`);
        }
    }

    /**
     * Place a trade in the database
     * @param {string} symbol 
     * @param {string} side 
     * @param {Object} strategy 
     * @param {number} price 
     */
    async placeTrade(symbol, side, strategy, price) {
        const quantity = 10; // Fixed quantity for now, or use Kelly
        // Ideally use strategy.setup.kellyRecommendation if available
        // But for safety, let's start small.

        const setup = strategy.setup;
        const stopLoss = setup ? setup.stopLoss : price * 0.95;
        const target = setup ? setup.target : price * 1.05;

        console.log(`[AUTO] Placing ${side} order for ${symbol} x ${quantity} @ $${price}`);

        // We can call the DB directly since we have the instance
        // But we need to handle the transaction logic similar to server.js
        // Or we can just use the same logic here.

        const cost = quantity * price;

        this.db.serialize(() => {
            this.db.run("BEGIN TRANSACTION");

            this.db.get("SELECT quantity FROM portfolio WHERE symbol = 'CASH'", (err, cashRow) => {
                if (err) {
                    console.error('[AUTO] DB Error:', err);
                    this.db.run("ROLLBACK");
                    return;
                }

                const cash = cashRow ? cashRow.quantity : 0;

                if (cash < cost) {
                    console.log(`[AUTO] Insufficient funds for ${symbol}. Cash: $${cash}, Cost: $${cost}`);
                    this.db.run("ROLLBACK");
                    return;
                }

                // Deduct Cash
                this.db.run("UPDATE portfolio SET quantity = quantity - ? WHERE symbol = 'CASH'", [cost]);

                // Update Position
                this.db.get("SELECT * FROM portfolio WHERE symbol = ?", [symbol], (err, row) => {
                    if (row) {
                        const newQty = row.quantity + quantity;
                        const newAvg = ((row.quantity * row.avg_price) + cost) / newQty;
                        this.db.run("UPDATE portfolio SET quantity = ?, avg_price = ? WHERE symbol = ?", [newQty, newAvg, symbol]);
                    } else {
                        this.db.run("INSERT INTO portfolio (symbol, quantity, avg_price) VALUES (?, ?, ?)", [symbol, quantity, price]);
                    }
                });

                // Record Trade
                this.db.run(
                    `INSERT INTO trades (symbol, side, quantity, price, setup_type, stop_loss, target_price, status) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN')`,
                    [symbol, side, quantity, price, strategy.name, stopLoss, target],
                    (err) => {
                        if (err) {
                            console.error('[AUTO] Error recording trade:', err);
                            this.db.run("ROLLBACK");
                        } else {
                            this.db.run("COMMIT");
                            console.log(`[AUTO] Trade executed successfully: ${symbol}`);
                        }
                    }
                );
            });
        });
    }

    /**
     * Helper: Get Watchlist
     * @returns {Promise<string[]>}
     */
    getWatchlist() {
        return new Promise((resolve, reject) => {
            this.db.all("SELECT symbol FROM watchlists", [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows.map(r => r.symbol));
            });
        });
    }

    /**
     * Helper: Log Alert to Database
     */
    logAlert(symbol, strategy, aiAnalysis) {
        const query = `INSERT INTO alerts (symbol, strategy, score, signal, ai_analysis) VALUES (?, ?, ?, ?, ?)`;
        this.db.run(query, [symbol, strategy.name, strategy.score, strategy.signal, aiAnalysis], (err) => {
            if (err) console.error('[AUTO] Error saving alert:', err.message);
            else console.log(`[AUTO] Alert saved for ${symbol}`);
        });
    }

    /**
     * Helper: Get Position
     * @param {string} symbol 
     * @returns {Promise<Object>}
     */
    getPosition(symbol) {
        return new Promise((resolve, reject) => {
            this.db.get("SELECT * FROM portfolio WHERE symbol = ?", [symbol], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }
    /**
     * Manage open positions: Check for Stop Loss or Target Hit
     */
    async managePositions() {
        try {
            // Get all OPEN trades
            const openTrades = await new Promise((resolve, reject) => {
                this.db.all("SELECT * FROM trades WHERE status = 'OPEN'", [], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });

            if (openTrades.length === 0) return;

            this.log('info', `Managing ${openTrades.length} open positions...`);

            for (const trade of openTrades) {
                // Fetch current price
                const { quote } = await fetchMarketData(trade.symbol);
                const currentPrice = quote.regularMarketPrice;

                if (!currentPrice) {
                    console.warn(`[AUTO] Could not fetch price for ${trade.symbol}`);
                    continue;
                }

                let exitReason = null;

                // Check Stop Loss
                if (trade.stop_loss && currentPrice <= trade.stop_loss) {
                    exitReason = 'STOP_LOSS';
                }
                // Check Target
                else if (trade.target_price && currentPrice >= trade.target_price) {
                    exitReason = 'TARGET_HIT';
                }

                if (exitReason) {
                    this.log('warning', `Exiting ${trade.symbol} (${exitReason}) @ $${currentPrice}`);
                    await this.closePosition(trade, currentPrice, exitReason);
                }
            }

        } catch (error) {
            console.error('[AUTO] Error managing positions:', error.message);
        }
    }

    /**
     * Close a position
     * @param {Object} trade - The original trade object
     * @param {number} exitPrice 
     * @param {string} reason 
     */
    async closePosition(trade, exitPrice, reason) {
        const pnl = (exitPrice - trade.price) * trade.quantity;
        const pnlPercent = ((exitPrice - trade.price) / trade.price) * 100;

        return new Promise((resolve, reject) => {
            this.db.serialize(() => {
                this.db.run("BEGIN TRANSACTION", (err) => {
                    if (err) {
                        console.error('[AUTO] Error starting transaction:', err);
                        return reject(err);
                    }

                    // 1. Update Portfolio (Remove shares, Add Cash)
                    const proceeds = trade.quantity * exitPrice;

                    this.db.run("UPDATE portfolio SET quantity = quantity + ? WHERE symbol = 'CASH'", [proceeds], (err) => {
                        if (err) {
                            console.error('[AUTO] Error adding cash:', err);
                            this.db.run("ROLLBACK", () => reject(err));
                            return;
                        }

                        // Remove Shares
                        this.db.run("UPDATE portfolio SET quantity = quantity - ? WHERE symbol = ?", [trade.quantity, trade.symbol], (err) => {
                            if (err) {
                                console.error('[AUTO] Error removing shares:', err);
                                this.db.run("ROLLBACK", () => reject(err));
                                return;
                            }

                            // Clean up zero quantity positions
                            this.db.run("DELETE FROM portfolio WHERE symbol = ? AND quantity <= 0", [trade.symbol], (err) => {
                                if (err) {
                                    console.error('[AUTO] Error cleaning up position:', err);
                                    this.db.run("ROLLBACK", () => reject(err));
                                    return;
                                }

                                // 2. Update Trade Record
                                this.db.run(
                                    `UPDATE trades SET status = 'CLOSED', pnl = ?, setup_type = setup_type || ' (' || ? || ')' WHERE id = ?`,
                                    [pnl, reason, trade.id],
                                    (err) => {
                                        if (err) {
                                            console.error('[AUTO] Error updating trade record:', err);
                                            this.db.run("ROLLBACK", () => reject(err));
                                        } else {
                                            this.db.run("COMMIT", (err) => {
                                                if (err) {
                                                    console.error('[AUTO] Error committing transaction:', err);
                                                    this.db.run("ROLLBACK", () => reject(err));
                                                } else {
                                                    this.log('success', `Closed ${trade.symbol}: PnL $${pnl.toFixed(2)} (${pnlPercent.toFixed(2)}%)`);
                                                    resolve();
                                                }
                                            });
                                        }
                                    }
                                );
                            });
                        });
                    });
                });
            });
        });
    }
}
