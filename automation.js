import { fetchDataForInterval } from './analysis.js';
import {
    scoreInstitutionalTrend,
    scoreVolatilitySqueeze,
    scorePanicReversion,
    scoreVIXReversion
} from './strategies.js';
import {
    scoreOpeningRangeBreakout,
    scoreVWAPBounce,
    scoreVIXFlow
} from './strategies/intraday.js';
import yahooFinance from 'yahoo-finance2';

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
        this.scanInterval = '15m'; // Default to 15m for intraday
        this.minScore = 80; // Minimum score to trigger a trade
    }

    /**
     * Start the automation loop
     * @param {number} intervalMinutes - How often to run the scan (in minutes)
     */
    start(intervalMinutes = 15) {
        if (this.isRunning) {
            console.log('[AUTO] AutoTrader is already running.');
            return;
        }

        console.log(`[AUTO] Starting AutoTrader (Interval: ${intervalMinutes}m)...`);
        this.isRunning = true;

        // Run immediately
        this.runCycle();

        // Schedule loop
        this.intervalId = setInterval(() => {
            this.runCycle();
        }, intervalMinutes * 60 * 1000);
    }

    /**
     * Stop the automation loop
     */
    stop() {
        if (!this.isRunning) return;

        console.log('[AUTO] Stopping AutoTrader...');
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

        console.log(`[AUTO] Starting scan cycle at ${new Date().toISOString()}`);

        try {
            // 1. Get Watchlist
            const symbols = await this.getWatchlist();
            if (symbols.length === 0) {
                console.log('[AUTO] Watchlist empty. Skipping cycle.');
                return;
            }

            console.log(`[AUTO] Scanning ${symbols.length} symbols: ${symbols.join(', ')}`);

            // 2. Scan each symbol
            for (const symbol of symbols) {
                await this.processSymbol(symbol);
            }

            console.log('[AUTO] Cycle completed.');

        } catch (error) {
            console.error('[AUTO] Error in runCycle:', error.message);
        }
    }

    /**
     * Process a single symbol
     * @param {string} symbol 
     */
    async processSymbol(symbol) {
        try {
            // Fetch Data
            const historical = await fetchDataForInterval(symbol, this.scanInterval);
            if (!historical || historical.length < 50) {
                console.warn(`[AUTO] Insufficient data for ${symbol}`);
                return;
            }

            // Calculate Indicators
            const indicators = calculateIndicators(historical);

            // Get Quote (Current Price)
            const last = historical[historical.length - 1];
            const quote = {
                regularMarketPrice: last.close,
                regularMarketChange: last.close - historical[historical.length - 2].close,
                regularMarketChangePercent: ((last.close - historical[historical.length - 2].close) / historical[historical.length - 2].close) * 100
            };

            // Calculate Daily Trend (MTF)
            // We need daily data for this.
            const dailyData = await fetchDataForInterval(symbol, '1d');
            let dailyTrend = { bullish: false, bearish: false };
            if (dailyData && dailyData.length > 20) {
                const dailyIndicators = calculateIndicators(dailyData);
                const lastPrice = dailyData[dailyData.length - 1].close;
                const sma20 = dailyIndicators.sma20History[dailyIndicators.sma20History.length - 1];
                dailyTrend.bullish = lastPrice > sma20;
                dailyTrend.bearish = lastPrice < sma20;
            }
            // 2. Run Strategies
            const strategies = [];

            // Standard Strategies
            strategies.push(scoreInstitutionalTrend(indicators));
            strategies.push(scoreVolatilitySqueeze(indicators));
            strategies.push(scorePanicReversion(indicators));

            // Intraday Strategies (if interval is short)
            if (this.scanInterval === '15m' || this.scanInterval === '1h') {
                strategies.push(scoreOpeningRangeBreakout(indicators, marketState));
                strategies.push(scoreVWAPBounce(indicators));
            }

            // SPECIAL: VIX Strategies (Only for SPY/Indices)
            if (['SPY', 'QQQ', 'IWM'].includes(symbol)) {
                const vixData = await fetchVIX(this.scanInterval); // Fetch full history

                // Swing
                strategies.push(scoreVIXReversion(vixData.historical));

                // Intraday
                if (this.scanInterval === '15m') {
                    strategies.push(scoreVIXFlow(indicators, vixData.historical));
                }
            }

            // 3. Evaluate & Execute
            for (const strategy of strategies) {
                if (strategy.score >= this.minScore) {
                    console.log(`[AUTO] Signal: ${symbol} - ${strategy.name} (${strategy.score}%)`);

                    // Log to Database (Alerts Table)
                    await this.logAlert(symbol, strategy.name, strategy.score, strategy.signal);

                    // Execute Trade (Paper)
                    await this.executeTradeLogic(symbol, strategy, marketState.price);
                }
            }

        } catch (error) {
            console.error(`Error processing ${symbol}:`, error.message);
        }
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
}
