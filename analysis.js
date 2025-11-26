import yahooFinance from 'yahoo-finance2';
import {
    WilliamsR,
    OBV,
    RSI,
    MACD,
    BollingerBands,
    SMA,
    EMA,
    Stochastic,
    ADX
} from 'technicalindicators';
import { getCached, setCached } from './utils/cache.js';
import { retryAsync } from './utils/retry.js';
import logger from './utils/logger.js';

// ============================================================================
// DATA FETCHING (WITH CACHING & RETRY)
// ============================================================================

export async function fetchMultiTimeframeData(symbol) {
    const now = new Date();
    const oneYearAgo = new Date(now); oneYearAgo.setFullYear(now.getFullYear() - 1);
    const twoYearsAgo = new Date(now); twoYearsAgo.setFullYear(now.getFullYear() - 2);
    const fiveYearsAgo = new Date(now); fiveYearsAgo.setFullYear(now.getFullYear() - 5);

    const [daily, weekly, monthly] = await Promise.all([
        fetchHistory(symbol, '1d', oneYearAgo),
        fetchHistory(symbol, '1wk', twoYearsAgo),
        fetchHistory(symbol, '1mo', fiveYearsAgo)
    ]);

    return { daily, weekly, monthly };
}

async function fetchHistory(symbol, interval, startDate) {
    const cacheKey = `history:${symbol}:${interval}:${startDate.toISOString().split('T')[0]}`;

    // Check cache first
    const cached = getCached(cacheKey);
    if (cached) {
        logger.debug(`Cache HIT: ${cacheKey} (${cached.freshness} fresh, ${cached.ttl}s remaining)`);
        return cached.data;
    }

    logger.debug(`Cache MISS: ${cacheKey} - Fetching from Yahoo Finance`);

    try {
        // Fetch with retry logic
        const result = await retryAsync(
            async () => await yahooFinance.chart(symbol, {
                period1: startDate.toISOString().split('T')[0],
                interval: interval
            }),
            3,
            1000,
            `fetchHistory(${symbol}, ${interval})`
        );

        const data = result.quotes.map(q => ({
            date: new Date(q.date),
            open: q.open,
            high: q.high,
            low: q.low,
            close: q.close,
            volume: q.volume
        })).filter(q => q.close !== null);

        // Cache the result (5 minutes TTL)
        setCached(cacheKey, data);
        logger.debug(`Cached: ${cacheKey}`);

        return data;
    } catch (err) {
        logger.error(`Error fetching ${interval} data for ${symbol}:`, err.message);
        return [];
    }
}

/**
 * Fetch historical data for a specific interval
 * Supports Yahoo Finance native intervals: 15m, 1h, 1d, 1wk
 */
export async function fetchDataForInterval(symbol, interval = '1d') {
    const now = new Date();
    let startDate;

    // Determine lookback period based on interval
    switch (interval) {
        case '15m':
            startDate = new Date(now);
            startDate.setDate(now.getDate() - 5); // 5 days (max for 15min)
            break;
        case '1h':
            startDate = new Date(now);
            startDate.setDate(now.getDate() - 30); // 30 days of hourly
            break;
        case '1d':
            startDate = new Date(now);
            startDate.setFullYear(now.getFullYear() - 1); // 1 year of daily
            break;
        case '1wk':
            startDate = new Date(now);
            startDate.setFullYear(now.getFullYear() - 2); // 2 years of weekly
            break;
        default:
            startDate = new Date(now);
            startDate.setFullYear(now.getFullYear() - 1);
    }

    // Uses fetchHistory which already has caching
    return await fetchHistory(symbol, interval, startDate);
}

export async function fetchMarketData(symbol) {
    const cacheKey = `marketData:${symbol}`;

    // Check cache first
    const cached = getCached(cacheKey);
    if (cached) {
        logger.debug(`Cache HIT: ${cacheKey} (${cached.freshness} fresh)`);
        return cached.data;
    }

    // Use chart API instead of historical (better success rate)
    const chartResult = await retryAsync(
        async () => await yahooFinance.chart(symbol, {
            period1: '2024-01-01',
            period2: new Date().toISOString().split('T')[0],
            interval: '1d'
        }),
        3,
        1000,
        `fetchMarketData(${symbol})`
    );

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

    const result = { historical, quote };
    setCached(cacheKey, result);

    return result;
}

export async function fetchVIX(interval = '1d') {
    // VIX only has daily data - always use '1d' regardless of requested interval
    const cacheKey = `vix:1d`;

    // Check cache first
    const cached = getCached(cacheKey);
    if (cached) {
        logger.debug(`Cache HIT: ${cacheKey} (${cached.freshness} fresh)`);
        return cached.data;
    }

    try {
        const chartResult = await retryAsync(
            async () => await yahooFinance.chart('^VIX', {
                period1: '2024-01-01',
                period2: new Date().toISOString().split('T')[0],
                interval: '1d' // VIX only supports daily interval
            }),
            3,
            1000,
            'fetchVIX'
        );

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

        const result = {
            value: current.close || 20,
            change: (current.close - (historical[historical.length - 2]?.close || current.close)) || 0,
            changePercent: 0,
            historical
        };

        setCached(cacheKey, result);
        return result;
    } catch (error) {
        logger.error('Error fetching VIX:', error.message);
        return { value: 20, change: 0, changePercent: 0, historical: [] }; // Fallback
    }
}


// ============================================================================
// INDICATOR CALCULATIONS
// ============================================================================

/**
 * Calculate all technical indicators for a given historical dataset
 * SINGLE SOURCE OF TRUTH - Used by all strategies and analysis endpoints
 * @param {Array} historical - Array of OHLCV candles
 * @returns {Object} Comprehensive indicator object
 */
export function calculateIndicators(historical) {
    if (!historical || historical.length < 50) return null;

    const closes = historical.map(c => c.close);
    const highs = historical.map(c => c.high);
    const lows = historical.map(c => c.low);
    const volumes = historical.map(c => c.volume);

    // Helper function to pad arrays for charting alignment
    const padArray = (arr, totalLength) => {
        const padding = new Array(totalLength - arr.length).fill(null);
        return [...padding, ...arr];
    };

    // Calculate VWAP (Volume Weighted Average Price)
    const calculateVWAP = () => {
        let cumulativeTPV = 0;
        let cumulativeVolume = 0;
        return historical.map(d => {
            const typicalPrice = (d.high + d.low + d.close) / 3;
            cumulativeTPV += typicalPrice * d.volume;
            cumulativeVolume += d.volume;
            return cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : typicalPrice;
        });
    };

    // Calculate Relative Volume
    const calculateRVOL = (period = 10) => {
        if (volumes.length < period + 1) return 1;
        const avgVolume = volumes.slice(-period - 1, -1).reduce((a, b) => a + b, 0) / period;
        const currentVolume = volumes[volumes.length - 1];
        return avgVolume > 0 ? currentVolume / avgVolume : 1;
    };

    // 1. Simple Moving Averages
    const sma20 = SMA.calculate({ period: 20, values: closes });
    const sma50 = SMA.calculate({ period: 50, values: closes });
    const sma200 = SMA.calculate({ period: 200, values: closes });

    // 2. Exponential Moving Averages
    const ema8 = EMA.calculate({ period: 8, values: closes });
    const ema20 = EMA.calculate({ period: 20, values: closes });
    const ema21 = EMA.calculate({ period: 21, values: closes });
    const ema55 = EMA.calculate({ period: 55, values: closes });

    // 3. RSI (14-period)
    const rsi = RSI.calculate({ period: 14, values: closes });

    // 4. MACD (12, 26, 9)
    const macd = MACD.calculate({
        values: closes,
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        SimpleMAOscillator: false,
        SimpleMASignal: false
    });

    // 5. Bollinger Bands (20-period, 2 std dev)
    const bb = BollingerBands.calculate({
        period: 20,
        values: closes,
        stdDev: 2
    });

    // 6. ADX (14-period)
    const adxData = ADX.calculate({
        period: 14,
        high: highs,
        low: lows,
        close: closes
    });

    // 7. Stochastic Oscillator (14, 3, 3)
    const stochastic = Stochastic.calculate({
        high: highs,
        low: lows,
        close: closes,
        period: 14,
        signalPeriod: 3
    });

    // 8. Williams %R (14)
    const williamsR = WilliamsR.calculate({
        high: highs,
        low: lows,
        close: closes,
        period: 14
    });

    // 9. OBV - Volume Confirmation
    const obv = OBV.calculate({
        close: closes,
        volume: volumes
    });

    // 10. VWAP
    const vwap = calculateVWAP();

    // 11. Relative Volume
    const rvol = calculateRVOL();

    // 12. Bollinger Band Width
    const bbWidth = bb.length > 0
        ? (bb[bb.length - 1].upper - bb[bb.length - 1].lower) / bb[bb.length - 1].middle
        : 0;

    // 13. Volume Ratio (current vs 20-day average)
    const currentVolume = volumes[volumes.length - 1];
    const last20Volumes = volumes.slice(-20);
    const avgVolume = last20Volumes.reduce((sum, v) => sum + v, 0) / last20Volumes.length;
    const volumeRatio = avgVolume > 0 ? currentVolume / avgVolume : 1;

    // Return comprehensive indicator object
    const lastIndex = closes.length - 1;

    return {
        // Current Values
        currentPrice: closes[lastIndex],

        // Moving Averages
        sma20: sma20[sma20.length - 1],
        sma50: sma50[sma50.length - 1],
        sma200: sma200[sma200.length - 1],
        ema8: ema8[ema8.length - 1],
        ema20: ema20[ema20.length - 1],
        ema21: ema21[ema21.length - 1],
        ema55: ema55[ema55.length - 1],

        // Oscillators
        rsi: rsi[rsi.length - 1],
        macd: macd[macd.length - 1],
        stochastic: stochastic[stochastic.length - 1],
        williamsR: williamsR[williamsR.length - 1],

        // Volatility
        bb: bb[bb.length - 1],
        bbWidth,
        adx: adxData[adxData.length - 1]?.adx || 0,

        // Volume
        vwap: vwap[vwap.length - 1],
        rvol,
        obv: obv[obv.length - 1],
        volumeRatio,

        // Arrays for charting (last 50 periods)
        priceHistory: closes.slice(-50),
        highHistory: highs.slice(-50),
        lowHistory: lows.slice(-50),
        volumeHistory: volumes.slice(-50),
        sma20History: padArray(sma20, closes.length).slice(-50),
        sma200History: padArray(sma200, closes.length).slice(-50),
        bbUpperHistory: padArray(bb.map(b => b.upper), closes.length).slice(-50),
        bbLowerHistory: padArray(bb.map(b => b.lower), closes.length).slice(-50),
        vwapHistory: vwap.slice(-50),
        dates: historical.slice(-50).map(d => d.date.toISOString().split('T')[0])
    };
}

// ============================================================================
// KEY LEVELS (Fibs, Pivots, OHLC)
// ============================================================================

export function calculateKeyLevels(historical) {
    if (!historical || historical.length < 2) return null;

    const last = historical[historical.length - 1];
    const prev = historical[historical.length - 2];

    // 1. OHLC Levels
    const ohlc = {
        prevOpen: prev.open,
        prevHigh: prev.high,
        prevLow: prev.low,
        prevClose: prev.close,
        currOpen: last.open
    };

    // 2. Pivot Points (Standard)
    // P = (H + L + C) / 3
    // R1 = 2*P - L
    // S1 = 2*P - H
    const p = (prev.high + prev.low + prev.close) / 3;
    const pivots = {
        p: p,
        r1: (2 * p) - prev.low,
        s1: (2 * p) - prev.high,
        r2: p + (prev.high - prev.low),
        s2: p - (prev.high - prev.low)
    };

    // 3. Fibonacci Retracements (52-Week High/Low)
    // We need the full year data for this, assuming 'historical' is daily 1y
    let yearHigh = -Infinity;
    let yearLow = Infinity;

    historical.forEach(candle => {
        if (candle.high > yearHigh) yearHigh = candle.high;
        if (candle.low < yearLow) yearLow = candle.low;
    });

    const range = yearHigh - yearLow;
    const fibs = {
        high: yearHigh,
        low: yearLow,
        fib236: yearHigh - (range * 0.236),
        fib382: yearHigh - (range * 0.382),
        fib500: yearHigh - (range * 0.500),
        fib618: yearHigh - (range * 0.618),
        fib786: yearHigh - (range * 0.786)
    };

    return { ohlc, pivots, fibs };
}
