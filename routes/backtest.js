import express from 'express';
import yahooFinance from 'yahoo-finance2';
import { calculateIndicators } from '../analysis.js';
import { scoreGoldenSetup } from '../strategies/intraday.js';
import backtester from '../services/backtester.js';

const router = express.Router();

router.post('/', async (req, res) => {
    const { symbol = 'SPY', days = 30, threshold = 85 } = req.body;

    try {
        console.log(`Starting backtest for ${symbol} over last ${days} days with ${threshold}% threshold...`);

        // 1. Fetch Historical Data
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const result = await yahooFinance.chart(symbol, {
            period1: startDate.toISOString().split('T')[0],
            interval: '15m'
        });

        const candles = result.quotes.map(q => ({
            date: new Date(q.date),
            open: q.open,
            high: q.high,
            low: q.low,
            close: q.close,
            volume: q.volume
        }));

        if (!candles || candles.length < 200) {
            return res.status(400).json({ error: 'Not enough historical data for backtesting' });
        }

        // 2. Simulation State
        let balance = 10000;
        let position = null; // { entryPrice, size, stopLoss, target, type: 'BUY'|'SELL' }
        const trades = [];
        const equityCurve = [];

        // 3. Iterate through candles (starting after warm-up period)
        for (let i = 200; i < candles.length; i++) {
            const candle = candles[i];
            const prevCandle = candles[i - 1];

            // Update Equity Curve
            const currentEquity = balance + (position ? (candle.close - position.entryPrice) * position.size : 0);
            equityCurve.push({ time: candle.date, equity: currentEquity });

            // Check Exit Conditions
            if (position) {
                // Check Stop Loss
                if (candle.low <= position.stopLoss) {
                    const exitPrice = position.stopLoss; // Slippage not modeled
                    const pnl = (exitPrice - position.entryPrice) * position.size;
                    balance += pnl;
                    trades.push({
                        entryTime: position.entryTime,
                        exitTime: candle.date,
                        type: position.type,
                        entryPrice: position.entryPrice,
                        exitPrice: exitPrice,
                        pnl: pnl,
                        result: 'LOSS'
                    });
                    position = null;
                    continue;
                }

                // Check Target
                if (candle.high >= position.target) {
                    const exitPrice = position.target;
                    const pnl = (exitPrice - position.entryPrice) * position.size;
                    balance += pnl;
                    trades.push({
                        entryTime: position.entryTime,
                        exitTime: candle.date,
                        type: position.type,
                        entryPrice: position.entryPrice,
                        exitPrice: exitPrice,
                        pnl: pnl,
                        result: 'WIN'
                    });
                    position = null;
                    continue;
                }
            }

            // Check Entry Conditions (only if no position)
            if (!position) {
                // Prepare Data Slice for Analysis
                const slice = candles.slice(0, i + 1);
                const indicators = calculateIndicators(slice);

                // Mock Daily Trend (Neutral) - In a real backtest, we'd analyze daily candles
                const mockDailyTrend = {
                    bullish: candle.close > candle.open, // Simple approximation
                    bearish: candle.close < candle.open,
                    sma20: candle.close
                };
                const mockMarket = { gex: 0 }; // Neutral market

                // Run Strategy
                const analysis = scoreGoldenSetup(indicators, mockDailyTrend, mockMarket);

                // Only enter if we have a valid setup (using configurable threshold)
                if (analysis.score >= threshold && analysis.setup) {
                    // Calculate Position Size (Risk 1% of equity)
                    const riskPerShare = Math.abs(candle.close - analysis.setup.stopLoss);
                    const riskAmount = balance * 0.01;
                    let shares = Math.floor(riskAmount / riskPerShare);

                    // Safety checks
                    const maxPositionValue = balance * 0.95; // Don't use more than 95% of balance
                    const positionValue = shares * candle.close;

                    if (positionValue > maxPositionValue) {
                        shares = Math.floor(maxPositionValue / candle.close);
                    }

                    if (shares > 0 && riskPerShare > 0 && positionValue <= balance) {
                        position = {
                            type: analysis.signal, // 'GOLDEN LONG' or 'GOLDEN SHORT'
                            entryPrice: candle.close,
                            entryTime: candle.date,
                            size: shares,
                            stopLoss: analysis.setup.stopLoss,
                            target: analysis.setup.target
                        };
                    }
                }
            }
        }

        // Close any open position at end of test period
        if (position) {
            const lastCandle = candles[candles.length - 1];
            const exitPrice = lastCandle.close;
            const pnl = (exitPrice - position.entryPrice) * position.size;
            balance += pnl;
            trades.push({
                entryTime: position.entryTime,
                exitTime: lastCandle.date,
                type: position.type,
                entryPrice: position.entryPrice,
                exitPrice: exitPrice,
                pnl: pnl,
                result: pnl > 0 ? 'WIN' : 'LOSS',
                note: 'Closed at end of test period'
            });
            position = null;
        }

        // 4. Calculate Statistics
        const wins = trades.filter(t => t.result === 'WIN').length;
        const losses = trades.filter(t => t.result === 'LOSS').length;
        const winRate = trades.length > 0 ? (wins / trades.length) * 100 : 0;
        const totalPnL = balance - 10000;

        // Calculate additional stats
        const winningTrades = trades.filter(t => t.pnl > 0);
        const losingTrades = trades.filter(t => t.pnl <= 0);
        const grossProfit = winningTrades.reduce((sum, t) => sum + t.pnl, 0);
        const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0));
        const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss).toFixed(2) : 'N/A';
        const avgWin = wins > 0 ? (grossProfit / wins).toFixed(2) : 0;
        const avgLoss = losses > 0 ? (grossLoss / losses).toFixed(2) : 0;

        res.json({
            symbol,
            days,
            threshold,
            totalTrades: trades.length,
            wins,
            losses,
            winRate: winRate.toFixed(2) + '%',
            totalPnL: totalPnL.toFixed(2),
            finalBalance: balance.toFixed(2),
            profitFactor,
            avgWin,
            avgLoss,
            trades: trades.slice(-50) // Return last 50 trades
        });

    } catch (error) {
        console.error('Backtest failed:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Intraday-Specific Backtest with Session Tracking
 * POST /api/backtest/intraday
 */
router.post('/intraday', async (req, res) => {
    const { symbol = 'SPY', days = 30, interval = '15m', minScore = 60 } = req.body;

    try {
        console.log(`[INTRADAY BACKTEST] ${symbol} - ${days} days - Min Score: ${minScore}`);

        const results = await backtester.run(symbol, days, interval, minScore);

        res.json({
            success: true,
            symbol,
            days,
            interval,
            minScore,
            ...results
        });

    } catch (error) {
        console.error('[INTRADAY BACKTEST] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

export default router;
