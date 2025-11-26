/**
 * Swing Trend Pullback
 * Logic: Buy when price pulls back to SMA20 in a strong uptrend.
 */
export function scoreSwingPullback(indicators, marketState) {
    const { priceHistory, sma20, sma50, sma200, rsi, adx } = indicators;

    // Validation: Need sufficient data for swing analysis
    if (!sma20 || !sma50 || !sma200) {
        return {
            id: 'swing-pullback',
            score: 0,
            signal: 'NEUTRAL',
            criteria: [{ name: 'Data Check', met: false, description: 'Insufficient data for swing analysis (need 200+ periods)' }]
        };
    }

    const currentPrice = priceHistory[priceHistory.length - 1];

    // 1. Define Trend (Uptrend)
    // Price > SMA50 > SMA200
    const isUptrend = currentPrice > sma50 && sma50 > sma200;
    const isDowntrend = currentPrice < sma50 && sma50 < sma200;

    if (!isUptrend && !isDowntrend) {
        return {
            id: 'swing-pullback',
            name: 'Swing Trend Pullback',
            score: 0,
            signal: 'NEUTRAL',
            criteria: [{ name: 'Trend Check', met: false, description: 'No clear trend detected' }],
            color: 'slate'
        };
    }

    const criteria = [];
    let score = 0;
    let signal = 'NEUTRAL';

    // 2. Pullback Condition
    // Price is near SMA20 (within 2%)
    const distToSMA20 = Math.abs((currentPrice - sma20) / sma20);
    const nearSMA20 = distToSMA20 < 0.02;

    if (nearSMA20) {
        criteria.push({
            name: 'Pullback to SMA20',
            value: `${(distToSMA20 * 100).toFixed(1)}% dist`,
            met: true,
            description: 'Price pulled back to key support/resistance'
        });
        score += 40;
    }

    // 3. Momentum Reset
    // RSI should not be overbought/oversold
    // Bullish Pullback: RSI between 40-60 (cooling off)
    let momentumReset = false;
    if (isUptrend && rsi > 40 && rsi < 60) momentumReset = true;
    if (isDowntrend && rsi > 40 && rsi < 60) momentumReset = true;

    if (momentumReset) {
        criteria.push({
            name: 'Momentum Reset',
            value: rsi.toFixed(1),
            met: true,
            description: 'RSI cooled off, ready for next leg'
        });
        score += 30;
    }

    // 4. Trend Strength
    if (adx > 25) {
        criteria.push({
            name: 'Strong Trend',
            value: adx.toFixed(1),
            met: true,
            description: 'ADX confirms strong trend'
        });
        score += 30;
    }

    // Determine Signal
    if (score >= 70) {
        signal = isUptrend ? 'SWING BUY' : 'SWING SELL';
    }

    // Setup
    let setup = null;
    if (signal === 'SWING BUY') {
        setup = {
            entryZone: sma20,
            stopLoss: sma50, // Wide stop for swing
            target: currentPrice + (currentPrice - sma50) * 2
        };
    } else if (signal === 'SWING SELL') {
        setup = {
            entryZone: sma20,
            stopLoss: sma50,
            target: currentPrice - (sma50 - currentPrice) * 2
        };
    }

    return {
        id: 'swing-pullback',
        name: 'Swing Trend Pullback',
        type: 'Swing',
        description: 'Entries on pullbacks to the 20-day SMA in established trends.',
        score: Math.max(0, Math.min(score, 100)), // Clamp 0-100
        signal,
        color: score >= 70 ? 'purple' : 'slate',
        criteria,
        setup
    };
}
