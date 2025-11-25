import { ATR } from 'technicalindicators';

// ============================================================================
// TRADE MANAGEMENT SYSTEM
// ============================================================================

export function calculateKellySize(winRate, riskReward, bankroll) {
    // Kelly Formula: f* = (bp - q) / b
    // b = net odds received (risk:reward ratio, e.g. 2.0)
    // p = probability of winning (winRate, e.g. 0.60)
    // q = probability of losing (1 - p)

    const b = riskReward;
    const p = winRate;
    const q = 1 - p;

    let f = (b * p - q) / b;

    // Safety: Fractional Kelly (Half-Kelly) is standard to reduce volatility
    // Full Kelly is too aggressive for most traders
    const halfKelly = f * 0.5;

    // If negative, don't trade
    if (halfKelly <= 0) return { percentage: 0, amount: 0, type: 'NO TRADE' };

    // Cap max allocation at 20% for safety
    const safeKelly = Math.min(halfKelly, 0.20);

    return {
        percentage: parseFloat((safeKelly * 100).toFixed(2)),
        amount: parseFloat((bankroll * safeKelly).toFixed(2)),
        type: 'Half-Kelly'
    };
}

export function calculateTradeSetup(entryPrice, side, historical, accountSize = 100000, riskPerTrade = 0.01) {
    if (!historical || historical.length < 20) return null;

    // 1. Calculate ATR (14)
    const highs = historical.map(c => c.high);
    const lows = historical.map(c => c.low);
    const closes = historical.map(c => c.close);

    const atrInput = { high: highs, low: lows, close: closes, period: 14 };
    const atrValues = ATR.calculate(atrInput);
    const currentATR = atrValues[atrValues.length - 1];

    // 2. Find Market Structure (Swing Points - Last 20 days)
    // Simple implementation: Lowest Low / Highest High of last 20 candles
    const lookback = 20;
    const recentCandles = historical.slice(-lookback);

    let swingLow = Infinity;
    let swingHigh = -Infinity;

    recentCandles.forEach(c => {
        if (c.low < swingLow) swingLow = c.low;
        if (c.high > swingHigh) swingHigh = c.high;
    });

    // 3. Calculate Stop Loss (Hybrid: Structure + ATR Validation)
    let stopLoss;

    if (side === 'BUY') {
        // Stop below Swing Low, but ensure at least 1.5 ATR breathing room
        const structureStop = swingLow - (currentATR * 0.5); // Buffer below wick
        const minAtrStop = entryPrice - (currentATR * 2);    // Minimum 2 ATR distance

        // Use the WIDER of the two stops to be safe (further away)
        // Actually, "safe" means giving it room. 
        // If structure is too close (e.g. 0.5 ATR away), we use minAtrStop.
        // If structure is far enough (e.g. 3 ATR away), we use structureStop.
        stopLoss = Math.min(structureStop, minAtrStop);

    } else { // SELL (Short)
        const structureStop = swingHigh + (currentATR * 0.5);
        const minAtrStop = entryPrice + (currentATR * 2);
        stopLoss = Math.max(structureStop, minAtrStop);
    }

    // 4. Calculate Risk
    const riskPerShare = Math.abs(entryPrice - stopLoss);
    const riskAmount = accountSize * riskPerTrade; // $1000 for $100k account

    // 5. Position Sizing
    const shares = Math.floor(riskAmount / riskPerShare);

    // 6. Calculate Targets (R:R)
    let target1, target2, target3;

    if (side === 'BUY') {
        target1 = entryPrice + (riskPerShare * 2); // 1:2
        target2 = entryPrice + (riskPerShare * 3); // 1:3
        target3 = entryPrice + (riskPerShare * 5); // 1:5 (Runner)
    } else {
        target1 = entryPrice - (riskPerShare * 2);
        target2 = entryPrice - (riskPerShare * 3);
        target3 = entryPrice - (riskPerShare * 5);
    }

    // 7. Calculate Kelly Criterion Recommendation
    // Assumption: Win Rate 55% for standard setups, 65% for high conviction
    // We can pass this in later, for now assume 60%
    const assumedWinRate = 0.60;
    const riskReward = 2.0; // Based on Target 1
    const kelly = calculateKellySize(assumedWinRate, riskReward, accountSize);

    return {
        entryPrice,
        side,
        stopLoss: parseFloat(stopLoss.toFixed(2)),
        riskPerShare: parseFloat(riskPerShare.toFixed(2)),
        shares,
        riskAmount,
        targets: {
            t1: parseFloat(target1.toFixed(2)),
            t2: parseFloat(target2.toFixed(2)),
            t3: parseFloat(target3.toFixed(2))
        },
        atr: parseFloat(currentATR.toFixed(2)),
        swingPoint: side === 'BUY' ? swingLow : swingHigh,
        kellyRecommendation: kelly
    };
}
