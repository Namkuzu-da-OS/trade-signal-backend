import { fetchDataForInterval, calculateIndicators, calculateVWAPBands, calculateIntradayProfile, calculateKeltnerChannels } from '../analysis.js';
import { sessionService } from './session.js';
import {
    scoreOpeningRangeBreakout,
    scoreGoldenSetup,
    scoreMeanReversion,
    scoreVWAPReversion,
    scoreValueAreaPlay,
    scoreOrderBlock,
    scoreVolatilitySqueeze
} from '../strategies/intraday.js';

/**
 * Intraday Backtester
 * Simulates intraday strategies over historical data with session-aware tracking
 */

export class IntradayBacktester {
    constructor() {
        this.results = [];
        this.trades = [];
        this.currentTrade = null;
    }

    /**
     * Run backtest on a symbol
     * @param {string} symbol - Ticker symbol
     * @param {number} days - Number of days to backtest
     * @param {string} interval - Timeframe (15m, 1h)
     * @param {number} minScore - Minimum score threshold
     * @returns {Object} Backtest results
     */
    async run(symbol, days = 30, interval = '15m', minScore = 60) {
        console.log(`[BACKTEST] Running ${days}-day backtest on ${symbol} (${interval})`);

        // Fetch historical data
        const historicalData = await fetchDataForInterval(symbol, interval, days);

        if (!historicalData || historicalData.length < 50) {
            throw new Error('Insufficient historical data for backtesting');
        }

        // Reset state
        this.results = [];
        this.trades = [];
        this.currentTrade = null;

        // Simulate candle-by-candle
        for (let i = 50; i < historicalData.length; i++) {
            const windowData = historicalData.slice(0, i + 1);
            const currentCandle = windowData[windowData.length - 1];

            // Calculate indicators using the window
            const indicators = calculateIndicators(windowData);
            indicators.vwapBands = calculateVWAPBands(windowData);
            indicators.volumeProfile = calculateIntradayProfile(windowData);
            indicators.keltnerChannels = calculateKeltnerChannels(windowData);

            // Get session phase for this candle
            const candleTime = new Date(currentCandle.date);
            const sessionPhase = sessionService.getSessionPhase(candleTime);

            // Run all strategies
            const signals = this.evaluateStrategies(indicators, {
                regularMarketPrice: currentCandle.close
            });

            // Check for entry
            if (!this.currentTrade) {
                this.checkEntry(signals, currentCandle, sessionPhase, minScore);
            }

            // Check for exit
            if (this.currentTrade) {
                this.checkExit(currentCandle, i);
            }
        }

        // Close any open trade
        if (this.currentTrade) {
            const lastCandle = historicalData[historicalData.length - 1];
            this.closeTradeData = windowData.slice(0, i + 1);
            const currentCandle = windowData[windowData.length - 1];

            // Calculate indicators using the window
            const indicators = calculateIndicators(windowData);
            indicators.vwapBands = calculateVWAPBands(windowData);
            indicators.volumeProfile = calculateIntradayProfile(windowData);
            indicators.keltnerChannels = calculateKeltnerChannels(windowData);

            // Get session phase for this candle
            const candleTime = new Date(currentCandle.date);
            const sessionPhase = sessionService.getSessionPhase(candleTime);

            // Run all strategies
            const signals = this.evaluateStrategies(indicators, {
                regularMarketPrice: currentCandle.close
            });

            // Check for entry
            if (!this.currentTrade) {
                this.checkEntry(signals, currentCandle, sessionPhase, minScore);
            }

            // Check for exit
            if (this.currentTrade) {
                this.checkExit(currentCandle, i);
            }
        }

        // Close any open trade
        if (this.currentTrade) {
            const lastCandle = historicalData[historicalData.length - 1];
            this.closeTrade(lastCandle, 'END_OF_DATA');
        }

        // Calculate summary statistics
        return this.generateSummary();
    }

    /**
     * Evaluate all intraday strategies
     */
    evaluateStrategies(indicators, quote) {
        return [
            scoreOpeningRangeBreakout(indicators, quote),
            scoreGoldenSetup(indicators, { bullish: true }, { gex: 0 }),
            scoreMeanReversion(indicators),
            scoreVWAPReversion(indicators),
            scoreValueAreaPlay(indicators),
            scoreOrderBlock(indicators),
            scoreVolatilitySqueeze(indicators)
        ].filter(s => s.score > 0); // Only consider active signals
    }

    /**
     * Check for trade entry
     */
    checkEntry(signals, candle, sessionPhase, minScore) {
        // Find highest scoring signal
        const topSignal = signals.reduce((best, current) =>
            current.score > best.score ? current : best
            , { score: 0 });

        if (topSignal.score >= minScore && topSignal.setup) {
            this.currentTrade = {
                strategy: topSignal.id,
                entryDate: candle.date,
                entryPrice: candle.close,
                entryTime: new Date(candle.date).toLocaleTimeString(),
                sessionPhase,
                dayOfWeek: new Date(candle.date).getDay(),
                score: topSignal.score,
                signal: topSignal.signal,
                stopLoss: topSignal.setup.stopLoss || candle.close * 0.98,
                target: topSignal.setup.target || candle.close * 1.02,
                entryCandle: candle
            };
        }
    }

    /**
     * Check for trade exit
     */
    checkExit(candle, candleIndex) {
        if (!this.currentTrade) return;

        const { stopLoss, target, entryPrice } = this.currentTrade;

        // Check stop loss
        if (candle.low <= stopLoss) {
            this.closeTrade(candle, 'STOP_LOSS', stopLoss);
            return;
        }

        // Check target
        if (candle.high >= target) {
            this.closeTrade(candle, 'TARGET', target);
            return;
        }

        // Time-based exit (EOD)
        const hour = new Date(candle.date).getHours();
        if (hour >= 15) { // Close at 3 PM
            this.closeTrade(candle, 'EOD');
        }
    }

    /**
     * Close trade and record results
     */
    closeTrade(candle, reason, exitPrice = null) {
        if (!this.currentTrade) return;

        const actualExit = exitPrice || candle.close;
        const pnl = actualExit - this.currentTrade.entryPrice;
        const pnlPercent = (pnl / this.currentTrade.entryPrice) * 100;

        const trade = {
            ...this.currentTrade,
            exitDate: candle.date,
            exitTime: new Date(candle.date).toLocaleTimeString(),
            exitPrice: actualExit,
            exitReason: reason,
            pnl,
            pnlPercent,
            win: pnl > 0,
            holdMinutes: this.calculateHoldTime(this.currentTrade.entryDate, candle.date)
        };

        this.trades.push(trade);
        this.currentTrade = null;
    }

    /**
     * Calculate hold time in minutes
     */
    calculateHoldTime(entryDate, exitDate) {
        const diff = new Date(exitDate) - new Date(entryDate);
        return Math.floor(diff / (1000 * 60));
    }

    /**
     * Generate summary statistics
     */
    generateSummary() {
        if (this.trades.length === 0) {
            return { error: 'No trades executed' };
        }

        const wins = this.trades.filter(t => t.win);
        const losses = this.trades.filter(t => !t.win);

        const totalPnL = this.trades.reduce((sum, t) => sum + t.pnl, 0);
        const grossProfit = wins.reduce((sum, t) => sum + t.pnl, 0);
        const grossLoss = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0));

        const winRate = wins.length / this.trades.length;
        const avgWin = wins.length > 0 ? grossProfit / wins.length : 0;
        const avgLoss = losses.length > 0 ? grossLoss / losses.length : 0;
        const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;
        const expectancy = (winRate * avgWin) - ((1 - winRate) * avgLoss);

        // Session breakdown
        const bySession = this.groupBySession();

        // Strategy breakdown
        const byStrategy = this.groupByStrategy();

        // Day of week breakdown
        const byDayOfWeek = this.groupByDayOfWeek();

        return {
            summary: {
                totalTrades: this.trades.length,
                wins: wins.length,
                losses: losses.length,
                winRate: (winRate * 100).toFixed(2) + '%',
                profitFactor: profitFactor.toFixed(2),
                expectancy: expectancy.toFixed(2),
                avgWin: avgWin.toFixed(2),
                avgLoss: avgLoss.toFixed(2),
                totalPnL: totalPnL.toFixed(2),
                avgHoldMinutes: (this.trades.reduce((sum, t) => sum + t.holdMinutes, 0) / this.trades.length).toFixed(0)
            },
            bySession,
            byStrategy,
            byDayOfWeek,
            trades: this.trades
        };
    }

    /**
     * Group results by session phase
     */
    groupBySession() {
        const sessions = {};

        this.trades.forEach(trade => {
            if (!sessions[trade.sessionPhase]) {
                sessions[trade.sessionPhase] = [];
            }
            sessions[trade.sessionPhase].push(trade);
        });

        const result = {};
        Object.keys(sessions).forEach(session => {
            const trades = sessions[session];
            const wins = trades.filter(t => t.win).length;
            result[session] = {
                trades: trades.length,
                wins,
                losses: trades.length - wins,
                winRate: ((wins / trades.length) * 100).toFixed(1) + '%'
            };
        });

        return result;
    }

    /**
     * Group results by strategy
     */
    groupByStrategy() {
        const strategies = {};

        this.trades.forEach(trade => {
            if (!strategies[trade.strategy]) {
                strategies[trade.strategy] = [];
            }
            strategies[trade.strategy].push(trade);
        });

        const result = {};
        Object.keys(strategies).forEach(strategy => {
            const trades = strategies[strategy];
            const wins = trades.filter(t => t.win).length;
            const totalPnL = trades.reduce((sum, t) => sum + t.pnl, 0);

            result[strategy] = {
                trades: trades.length,
                wins,
                losses: trades.length - wins,
                winRate: ((wins / trades.length) * 100).toFixed(1) + '%',
                totalPnL: totalPnL.toFixed(2)
            };
        });

        return result;
    }

    /**
     * Group results by day of week
     */
    groupByDayOfWeek() {
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayGroups = {};

        this.trades.forEach(trade => {
            const dayName = days[trade.dayOfWeek];
            if (!dayGroups[dayName]) {
                dayGroups[dayName] = [];
            }
            dayGroups[dayName].push(trade);
        });

        const result = {};
        Object.keys(dayGroups).forEach(day => {
            const trades = dayGroups[day];
            const wins = trades.filter(t => t.win).length;

            result[day] = {
                trades: trades.length,
                wins,
                losses: trades.length - wins,
                winRate: ((wins / trades.length) * 100).toFixed(1) + '%'
            };
        });

        return result;
    }
}

export default new IntradayBacktester();
