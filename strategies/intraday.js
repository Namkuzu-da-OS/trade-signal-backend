/**
 * Opening Range Breakout (ORB)
 * Timeframes: 15min, 1hr
 * Logic: Detect breakout above/below first 30min of trading
 */
export function scoreOpeningRangeBreakout(indicators, marketState) {
    const { priceHistory, rvol } = indicators;

    // Only valid during market hours or if we have data covering the open
    // Ideally we check if the current bar is after 10:00 AM
    // For simplicity, we'll assume if we have data, we can check the first 30m of the current session.
    // However, priceHistory is just an array of closes. We need high/lows.
    // indicators object in server.js currently only has arrays of calculated values.
    // We need the raw historical data (OHLC) to calculate ORB properly.
    // server.js passes 'indicators' which has priceHistory (closes).
    // We need to modify server.js to pass 'historical' or extract OHLC from it.

    // Let's look at server.js again. It calls: scoreInstitutionalTrend(indicators, vix)
    // indicators comes from calculateIndicators(historical).
    // calculateIndicators returns { dates, priceHistory, openHistory, highHistory, lowHistory, ... }
    // I need to ensure calculateIndicators returns high/low history.

    // Assuming indicators has highHistory and lowHistory.

    // Get market open time (9:30 AM ET)
    // This is tricky with just an array of data without explicit timestamps per candle in the indicators object,
    // although indicators.dates exists.

    // Simplified logic for now:
    // We will assume the data passed is for the "current day" or relevant period.
    // But fetchDataForInterval returns N days/candles.

    // Let's rely on the fact that for '15m' interval, we fetch 5 days.
    // We need to identify the *current day's* opening range.

    // We need the 'dates' array to find today's session start.
    const dates = indicators.dates;
    if (!dates || dates.length === 0) return { name: 'Opening Range Breakout', score: 0, signal: 'NEUTRAL', color: 'slate', criteria: [], setup: null };

    const lastDate = new Date(dates[dates.length - 1]);
    const todayStr = lastDate.toDateString();

    // Find indices for today
    let startIndex = -1;
    for (let i = dates.length - 1; i >= 0; i--) {
        if (new Date(dates[i]).toDateString() !== todayStr) {
            startIndex = i + 1;
            break;
        }
    }
    if (startIndex === -1) startIndex = 0; // All data is today

    const todayCandles = {
        highs: indicators.highHistory.slice(startIndex),
        lows: indicators.lowHistory.slice(startIndex),
        closes: indicators.priceHistory.slice(startIndex),
        volumes: indicators.volumeHistory ? indicators.volumeHistory.slice(startIndex) : []
    };

    // We need at least 2 candles (30 mins if 15m interval) to define ORB
    // If interval is 1h, the first candle IS the ORB (first hour).
    // Let's assume 15m candles for ORB logic usually.

    // If we don't have enough candles for today, return WAIT
    if (todayCandles.closes.length < 2) {
        return {
            name: 'Opening Range Breakout',
            score: 0,
            signal: 'WAIT',
            color: 'amber',
            criteria: [{ met: false, description: 'Waiting for first 30m to close' }],
            setup: null
        };
    }

    // Define ORB (First 30 mins)
    // If 15m candles: first 2 candles.
    // If 1h candles: first 1 candle.

    // We can't easily know the interval here unless passed.
    // But we can infer or just take the first N candles.
    // Let's assume 15m data for ORB.

    const orbHigh = Math.max(todayCandles.highs[0], todayCandles.highs[1] || -Infinity);
    const orbLow = Math.min(todayCandles.lows[0], todayCandles.lows[1] || Infinity);

    // If 1h data, just take the first candle
    // We'll refine this later. For now, taking first 2 candles max.

    const orRange = orbHigh - orbLow;
    const currentPrice = todayCandles.closes[todayCandles.closes.length - 1];

    const criteria = [];
    let score = 0;
    let signal = 'NEUTRAL';

    // 1. Breakout Check
    const brokeAbove = currentPrice > orbHigh;
    criteria.push({
        name: 'Breakout Above',
        value: brokeAbove ? 'YES' : 'NO',
        met: brokeAbove,
        description: `Price ${brokeAbove ? 'broke above' : 'below'} ORB high (${orbHigh.toFixed(2)})`
    });
    if (brokeAbove) score += 40;

    const brokeBelow = currentPrice < orbLow;
    criteria.push({
        name: 'Breakdown Below',
        value: brokeBelow ? 'YES' : 'NO',
        met: brokeBelow,
        description: `Price ${brokeBelow ? 'broke below' : 'above'} ORB low (${orbLow.toFixed(2)})`
    });
    if (brokeBelow) score += 40;

    // 2. Volume Confirmation (using rvol from last candle)
    const volConfirm = indicators.rvol > 1.2;
    criteria.push({
        name: 'Volume Confirmation',
        value: indicators.rvol.toFixed(2) + 'x',
        met: volConfirm,
        description: `Relative volume > 1.2`
    });
    if (volConfirm) score += 20;

    // 3. Range Quality
    const rangePercent = (orRange / orbLow) * 100;
    const goodRange = rangePercent > 0.2; // At least 0.2% range
    criteria.push({
        name: 'Range Quality',
        value: rangePercent.toFixed(2) + '%',
        met: goodRange,
        description: `ORB range > 0.2%`
    });
    if (goodRange) score += 10;

    // Signal Logic
    if (brokeAbove && volConfirm) signal = 'BUY';
    else if (brokeBelow && volConfirm) signal = 'SELL';
    else if (brokeAbove || brokeBelow) signal = 'WATCH';

    // Setup
    let setup = null;
    if (signal === 'BUY') {
        setup = {
            entryZone: orbHigh,
            stopLoss: orbLow,
            target: orbHigh + (orRange * 2)
        };
    } else if (signal === 'SELL') {
        setup = {
            entryZone: orbLow,
            stopLoss: orbHigh,
            target: orbLow - (orRange * 2)
        };
    }

    return {
        id: 'orb-strategy',
        name: 'Opening Range Breakout',
        type: 'Breakout',
        description: 'Trading the breakout of the first 30 minutes of the session.',
        score: Math.min(score, 100),
        signal,
        color: score >= 60 ? 'emerald' : score >= 40 ? 'amber' : 'slate',
        criteria,
        setup,
        orHigh: orbHigh,
        orLow: orbLow,
        orRange,
        education: "The Opening Range Breakout (ORB) captures the initial direction established by institutional money in the first 30 minutes. A breakout with volume often leads to a sustained trend for the day."
    };
}

/**
 * VWAP Bounce
 * Timeframes: 15min, 1hr
 * Logic: Price bounces off VWAP with volume
 */
export function scoreVWAPBounce(indicators) {
    const { vwapHistory, priceHistory, rvol } = indicators;
    const currentPrice = priceHistory[priceHistory.length - 1];
    const currentVWAP = vwapHistory[vwapHistory.length - 1];

    const criteria = [];
    let score = 0;

    // 1. Proximity to VWAP
    const dist = Math.abs(currentPrice - currentVWAP) / currentVWAP;
    const nearVWAP = dist < 0.005; // Within 0.5%
    criteria.push({
        name: 'Near VWAP',
        value: (dist * 100).toFixed(2) + '%',
        met: nearVWAP,
        description: `Price is within 0.5% of VWAP`
    });
    if (nearVWAP) score += 30;

    // 2. Volume Spike
    const volSpike = rvol > 1.5;
    criteria.push({
        name: 'Volume Spike',
        value: rvol.toFixed(2) + 'x',
        met: volSpike,
        description: `Volume is spiking > 1.5x average`
    });
    if (volSpike) score += 20;

    // 3. Trend Alignment (Price > SMA200 for Buy)
    // We might not have SMA200 on intraday if not enough data, check SMA20
    const sma20 = indicators.sma20History[indicators.sma20History.length - 1];
    const trendAligned = currentPrice > sma20;
    criteria.push({
        name: 'Trend Alignment',
        value: trendAligned ? 'UP' : 'DOWN',
        met: trendAligned,
        description: `Price above SMA20`
    });
    if (trendAligned) score += 20;

    let signal = 'NEUTRAL';
    if (nearVWAP && volSpike) {
        signal = trendAligned ? 'BUY' : 'SELL'; // Simplified
        score += 30;
    }

    let setup = null;
    if (signal === 'BUY') {
        setup = {
            entryZone: currentVWAP,
            stopLoss: currentVWAP * 0.99,
            target: currentVWAP * 1.02
        };
    } else if (signal === 'SELL') {
        setup = {
            entryZone: currentVWAP,
            stopLoss: currentVWAP * 1.01,
            target: currentVWAP * 0.98
        };
    }

    return {
        id: 'vwap-bounce',
        name: 'VWAP Bounce',
        type: 'Reversion',
        description: 'Trading bounces off the Volume Weighted Average Price.',
        score: Math.min(score, 100),
        signal,
        color: score >= 60 ? 'emerald' : score >= 40 ? 'amber' : 'slate',
        criteria,
        setup,
        education: "Institutions often defend the VWAP. A bounce off this level with high volume confirms their participation."
    };
}

/**
 * The Golden Setup
 * Timeframes: 15min (Execution), Daily (Bias)
 * Logic: Trade WITH Daily Trend + Pullback to VWAP + Volume Trigger
 */
export function scoreGoldenSetup(indicators, dailyTrend, marketState) {
    const { priceHistory, vwapHistory, rvol, rsi } = indicators;
    const currentPrice = priceHistory[priceHistory.length - 1];
    const currentVWAP = vwapHistory[vwapHistory.length - 1];

    const criteria = [];
    let score = 0;
    let signal = 'NEUTRAL';

    // 1. Multi-Timeframe Alignment (The Trend is Your Friend)
    // dailyTrend is expected to be { bullish: boolean, bearish: boolean, sma20: number }
    const isBullish = dailyTrend?.bullish;
    const isBearish = dailyTrend?.bearish;

    criteria.push({
        name: 'Daily Trend Alignment',
        value: isBullish ? 'BULLISH' : isBearish ? 'BEARISH' : 'NEUTRAL',
        met: isBullish || isBearish,
        description: `Daily Price ${isBullish ? '>' : '<'} SMA20`
    });
    if (isBullish || isBearish) score += 30;

    // 2. Key Level Interaction (VWAP)
    const distToVWAP = Math.abs(currentPrice - currentVWAP) / currentVWAP;
    const nearVWAP = distToVWAP < 0.008; // Within 0.8%
    criteria.push({
        name: 'VWAP Interaction',
        value: (distToVWAP * 100).toFixed(2) + '%',
        met: nearVWAP,
        description: 'Price is testing VWAP'
    });
    if (nearVWAP) score += 20;

    // 3. Volume Trigger
    const volTrigger = rvol > 1.5;
    criteria.push({
        name: 'Volume Trigger',
        value: rvol.toFixed(2) + 'x',
        met: volTrigger,
        description: 'RVOL > 1.5 indicates institutional activity'
    });
    if (volTrigger) score += 20;

    // 4. Momentum Confirmation (RSI)
    // Bullish: RSI > 40 (not oversold, has momentum) AND < 70 (not overbought)
    // Bearish: RSI < 60 (not overbought) AND > 30 (not oversold)
    let momentum = false;
    if (isBullish && rsi > 40 && rsi < 75) momentum = true;
    if (isBearish && rsi < 60 && rsi > 25) momentum = true;

    criteria.push({
        name: 'Momentum Health',
        value: rsi.toFixed(1),
        met: momentum,
        description: isBullish ? 'RSI > 40 (Bullish Support)' : 'RSI < 60 (Bearish Resistance)'
    });
    if (momentum) score += 10;

    // 5. GEX Regime (Bonus)
    // Positive GEX = Mean Reversion (Buy dips to VWAP)
    // Negative GEX = Volatility (Breakouts/Trend)
    const gex = marketState?.gex || 0;
    let gexAligned = false;
    if (isBullish && gex > 0 && nearVWAP) gexAligned = true; // Buy dip in stable market
    if (isBearish && gex < 0) gexAligned = true; // Short breakdown in volatile market

    criteria.push({
        name: 'GEX Regime',
        value: `$${gex.toFixed(2)}B`,
        met: gexAligned,
        description: gex > 0 ? 'Positive Gamma (Dip Buying)' : 'Negative Gamma (Volatility)'
    });
    if (gexAligned) score += 20;


    // Determine Signal
    if (score >= 80) {
        if (isBullish && currentPrice > currentVWAP) signal = 'GOLDEN LONG';
        else if (isBearish && currentPrice < currentVWAP) signal = 'GOLDEN SHORT';
    } else if (score >= 50) {
        signal = 'WATCH';
    }

    // Setup Details
    let setup = null;
    if (signal === 'GOLDEN LONG') {
        setup = {
            entryZone: currentVWAP,
            stopLoss: currentVWAP * 0.99, // Tight stop below VWAP
            target: currentPrice + (currentPrice - currentVWAP * 0.99) * 2 // 2R Target
        };
    } else if (signal === 'GOLDEN SHORT') {
        setup = {
            entryZone: currentVWAP,
            stopLoss: currentVWAP * 1.01,
            target: currentPrice - (currentVWAP * 1.01 - currentPrice) * 2
        };
    }

    return {
        id: 'golden-setup',
        name: 'The Golden Setup',
        type: 'Trend Following',
        description: 'High probability trade aligned with Daily Trend + VWAP interaction.',
        score: Math.min(score, 100),
        signal,
        color: score >= 80 ? 'emerald' : score >= 50 ? 'amber' : 'slate',
        criteria,
        setup,
        education: "The Golden Setup aligns the Daily Trend (Macro) with an Intraday Pullback to VWAP (Micro). We wait for a Volume Trigger to confirm institutions are stepping in."
    };
}
