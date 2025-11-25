import yahooFinance from 'yahoo-finance2';
import {
    WilliamsR,
    OBV,
    RSI,
    MACD,
    BollingerBands,
    SMA,
    EMA,
    Stochastic
} from 'technicalindicators';

// ============================================================================
// DATA FETCHING
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
    try {
        const result = await yahooFinance.chart(symbol, {
            period1: startDate.toISOString().split('T')[0],
            interval: interval
        });

        return result.quotes.map(q => ({
            date: new Date(q.date),
            open: q.open,
            high: q.high,
            low: q.low,
            close: q.close,
            volume: q.volume
        })).filter(q => q.close !== null);
    } catch (err) {
        console.error(`Error fetching ${interval} data for ${symbol}:`, err.message);
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

    return await fetchHistory(symbol, interval, startDate);
}


// ============================================================================
// INDICATOR CALCULATIONS
// ============================================================================

export function calculateAdvancedIndicators(historical) {
    if (!historical || historical.length < 50) return null;

    const closes = historical.map(c => c.close);
    const highs = historical.map(c => c.high);
    const lows = historical.map(c => c.low);
    const volumes = historical.map(c => c.volume);

    // 1. Williams %R (14) - Statistically significant for swing
    const williamsInput = {
        high: highs,
        low: lows,
        close: closes,
        period: 14
    };
    const williamsR = WilliamsR.calculate(williamsInput);

    // 2. OBV - Volume Confirmation
    const obvInput = {
        close: closes,
        volume: volumes
    };
    const obv = OBV.calculate(obvInput);

    // 3. RSI (14)
    const rsi = RSI.calculate({ values: closes, period: 14 });

    // 4. MACD (12, 26, 9)
    const macd = MACD.calculate({
        values: closes,
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        SimpleMAOscillator: false,
        SimpleMASignal: false
    });

    // 5. Bollinger Bands (20, 2)
    const bb = BollingerBands.calculate({
        period: 20,
        values: closes,
        stdDev: 2
    });

    // 6. Moving Averages
    const sma50 = SMA.calculate({ period: 50, values: closes });
    const sma200 = SMA.calculate({ period: 200, values: closes });
    const ema20 = EMA.calculate({ period: 20, values: closes });

    // 7. NEW: EMAs for Confluence Strategy (8, 21, 55)
    const ema8 = EMA.calculate({ period: 8, values: closes });
    const ema21 = EMA.calculate({ period: 21, values: closes });
    const ema55 = EMA.calculate({ period: 55, values: closes });

    // 8. NEW: Stochastic Oscillator (14, 3, 3)
    const stochastic = Stochastic.calculate({
        high: highs,
        low: lows,
        close: closes,
        period: 14,
        signalPeriod: 3
    });

    // 9. NEW: Volume Ratio (current vs 20-day average)
    const currentVolume = volumes[volumes.length - 1];
    const last20Volumes = volumes.slice(-20);
    const avgVolume = last20Volumes.reduce((sum, v) => sum + v, 0) / last20Volumes.length;
    const volumeRatio = avgVolume > 0 ? currentVolume / avgVolume : 1;

    // Return the latest values
    const lastIndex = closes.length - 1;

    return {
        williamsR: williamsR[williamsR.length - 1],
        obv: obv[obv.length - 1],
        rsi: rsi[rsi.length - 1],
        macd: macd[macd.length - 1],
        bb: bb[bb.length - 1],
        sma50: sma50[sma50.length - 1],
        sma200: sma200[sma200.length - 1],
        ema20: ema20[ema20.length - 1],
        // NEW indicators
        ema8: ema8[ema8.length - 1],
        ema21: ema21[ema21.length - 1],
        ema55: ema55[ema55.length - 1],
        stochastic: stochastic[stochastic.length - 1],
        volumeRatio: volumeRatio,
        currentPrice: closes[lastIndex]
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
