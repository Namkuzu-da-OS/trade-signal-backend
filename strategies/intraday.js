import CONFIG from '../config.js';
import { sessionService } from '../services/session.js';

/**
 * Opening Range Breakout (ORB)
 * Timeframes: 15min, 1hr
 * Logic: Detect breakout above/below first 30min of trading
 */
export function scoreOpeningRangeBreakout(indicators, marketState) {
    const { priceHistory, rvol, highHistory, lowHistory, dates } = indicators;

    // 1. Get Opening Range from Session Service
    // We need to construct candle objects for the service
    const candles = dates.map((d, i) => ({
        date: d,
        high: highHistory[i],
        low: lowHistory[i],
        close: priceHistory[i]
    }));

    const orb = sessionService.getOpeningRange(candles);

    if (!orb) {
        return {
            id: 'orb-strategy',
            name: 'Opening Range Breakout',
            score: 0,
            signal: 'WAIT',
            color: 'slate',
            criteria: [{ met: false, description: 'Waiting for Opening Range (9:30-10:00 ET)' }],
            setup: null
        };
    }

    const currentPrice = priceHistory[priceHistory.length - 1];
    const criteria = [];
    let score = 0;
    let signal = 'NEUTRAL';

    // 1. Breakout Check
    const brokeAbove = currentPrice > orb.high;
    const brokeBelow = currentPrice < orb.low;

    criteria.push({
        name: 'Breakout Status',
        value: brokeAbove ? 'ABOVE' : brokeBelow ? 'BELOW' : 'INSIDE',
        met: brokeAbove || brokeBelow,
        description: `Price relative to ORB (${orb.low.toFixed(2)} - ${orb.high.toFixed(2)})`
    });
    if (brokeAbove || brokeBelow) score += 40;

    // 2. Volume Confirmation
    const volConfirm = rvol > CONFIG.ORB_VOLUME_CONFIRMATION;
    criteria.push({
        name: 'Volume Confirmation',
        value: rvol.toFixed(2) + 'x',
        met: volConfirm,
        description: `Relative volume > ${CONFIG.ORB_VOLUME_CONFIRMATION}`
    });
    if (volConfirm) score += 20;

    // 3. Session Phase Check
    const phase = sessionService.getSessionPhase();
    const isMorning = phase === 'MORNING_TREND';
    criteria.push({
        name: 'Session Phase',
        value: phase,
        met: isMorning,
        description: 'Best breakouts occur in Morning Trend phase'
    });
    if (isMorning) score += 10;

    // Signal Logic
    if (brokeAbove && volConfirm) signal = 'BUY';
    else if (brokeBelow && volConfirm) signal = 'SELL';
    else if (brokeAbove || brokeBelow) signal = 'WATCH';

    // Setup
    let setup = null;
    if (signal === 'BUY') {
        setup = {
            entryZone: orb.high,
            stopLoss: orb.low,
            target: orb.high + (orb.range * 2)
        };
    } else if (signal === 'SELL') {
        setup = {
            entryZone: orb.low,
            stopLoss: orb.high,
            target: orb.low - (orb.range * 2)
        };
    }

    return {
        id: 'orb-strategy',
        name: 'Opening Range Breakout',
        type: 'Breakout',
        description: 'Trading the breakout of the first 30 minutes of the session.',
        score: Math.max(0, Math.min(score, 100)),
        signal,
        color: score >= 60 ? 'emerald' : score >= 40 ? 'amber' : 'slate',
        criteria,
        setup,
        orHigh: orb.high,
        orLow: orb.low
    };
}

/**
 * VWAP Reversion (Institutional Fade)
 * Logic: Fade moves into 2SD/3SD bands
 */
export function scoreVWAPReversion(indicators) {
    const { vwapBands, priceHistory, rsi } = indicators;

    if (!vwapBands) return { id: 'vwap-reversion', score: 0, signal: 'NEUTRAL', criteria: [] };

    const currentPrice = priceHistory[priceHistory.length - 1];
    const criteria = [];
    let score = 0;
    let signal = 'NEUTRAL';

    // 1. Band Extension
    const above2SD = currentPrice > vwapBands.upper2;
    const below2SD = currentPrice < vwapBands.lower2;
    const above3SD = currentPrice > vwapBands.upper3;
    const below3SD = currentPrice < vwapBands.lower3;

    criteria.push({
        name: 'Band Extension',
        value: above3SD ? '> 3SD' : above2SD ? '> 2SD' : below3SD ? '< 3SD' : below2SD ? '< 2SD' : 'Normal',
        met: above2SD || below2SD,
        description: 'Price extended beyond 2 Standard Deviations'
    });
    if (above3SD || below3SD) score += 50;
    else if (above2SD || below2SD) score += 30;

    // 2. RSI Divergence/Extreme
    const isOverbought = rsi > 70;
    const isOversold = rsi < 30;

    criteria.push({
        name: 'RSI Extreme',
        value: rsi.toFixed(1),
        met: (above2SD && isOverbought) || (below2SD && isOversold),
        description: 'RSI confirms extension'
    });
    if ((above2SD && isOverbought) || (below2SD && isOversold)) score += 30;

    // Signal Logic
    if (above2SD && isOverbought) signal = 'SHORT FADE';
    if (below2SD && isOversold) signal = 'LONG FADE';

    // Setup
    let setup = null;
    if (signal === 'LONG FADE') {
        setup = {
            entryZone: vwapBands.lower2,
            stopLoss: vwapBands.lower3 * 0.995,
            target: vwapBands.vwap // Revert to mean
        };
    } else if (signal === 'SHORT FADE') {
        setup = {
            entryZone: vwapBands.upper2,
            stopLoss: vwapBands.upper3 * 1.005,
            target: vwapBands.vwap
        };
    }

    return {
        id: 'vwap-reversion',
        name: 'VWAP Reversion',
        type: 'Reversion',
        description: 'Fading extreme moves away from VWAP (2SD/3SD).',
        score: Math.max(0, Math.min(score, 100)),
        signal,
        color: score >= 60 ? 'purple' : 'slate',
        criteria,
        setup
    };
}

/**
 * Value Area Play
 * Logic: Trade breakouts of VAH or Rejections of VAL
 */
export function scoreValueAreaPlay(indicators) {
    const { volumeProfile, priceHistory, rvol } = indicators;

    if (!volumeProfile) return { id: 'value-area', score: 0, signal: 'NEUTRAL', criteria: [] };

    const currentPrice = priceHistory[priceHistory.length - 1];
    const { vah, val, poc } = volumeProfile;

    const criteria = [];
    let score = 0;
    let signal = 'NEUTRAL';

    // 1. Location relative to Value Area
    const aboveVAH = currentPrice > vah;
    const belowVAL = currentPrice < val;
    const insideVA = currentPrice >= val && currentPrice <= vah;

    // Logic: Breakout above VAH with Volume
    if (aboveVAH && rvol > 1.5) {
        criteria.push({ name: 'VAH Breakout', value: 'YES', met: true, description: 'Price broke above Value Area High' });
        score += 40;
        signal = 'BUY BREAKOUT';
    }

    // Logic: Breakdown below VAL with Volume
    if (belowVAL && rvol > 1.5) {
        criteria.push({ name: 'VAL Breakdown', value: 'YES', met: true, description: 'Price broke below Value Area Low' });
        score += 40;
        signal = 'SELL BREAKDOWN';
    }

    // Logic: Rejection (Mean Reversion inside VA)
    // If price touched VAL and bounced up
    // This requires looking at previous candle, simplified here

    // Volume Confirmation
    if (rvol > 1.5) {
        criteria.push({ name: 'Volume Spike', value: rvol.toFixed(1) + 'x', met: true, description: 'High volume confirms move' });
        score += 20;
    }

    let setup = null;
    if (signal === 'BUY BREAKOUT') {
        setup = { entryZone: vah, stopLoss: poc, target: vah + (vah - poc) };
    } else if (signal === 'SELL BREAKDOWN') {
        setup = { entryZone: val, stopLoss: poc, target: val - (poc - val) };
    }

    return {
        id: 'value-area',
        name: 'Value Area Play',
        type: 'Profile',
        description: 'Trading breakouts or rejections of the Volume Profile Value Area.',
        score: Math.max(0, Math.min(score, 100)),
        signal,
        color: score >= 60 ? 'blue' : 'slate',
        criteria,
        setup
    };
}

/**
 * The Golden Setup (Enhanced)
 */
export function scoreGoldenSetup(indicators, dailyTrend, marketState) {
    const { priceHistory, vwapHistory, rvol, rsi } = indicators;
    const currentPrice = priceHistory[priceHistory.length - 1];
    const currentVWAP = vwapHistory[vwapHistory.length - 1];

    const criteria = [];
    let score = 0;
    let signal = 'NEUTRAL';

    // 1. Multi-Timeframe Alignment
    const isBullish = dailyTrend?.bullish;
    const isBearish = dailyTrend?.bearish;

    criteria.push({
        name: 'Daily Trend',
        value: isBullish ? 'BULLISH' : isBearish ? 'BEARISH' : 'NEUTRAL',
        met: isBullish || isBearish,
        description: `Daily Price ${isBullish ? '>' : '<'} SMA20`
    });
    if (isBullish || isBearish) score += 30;

    // 2. VWAP Interaction
    const distToVWAP = Math.abs(currentPrice - currentVWAP) / currentVWAP;
    const nearVWAP = distToVWAP < CONFIG.VWAP_PROXIMITY_GOLDEN;
    criteria.push({
        name: 'VWAP Interaction',
        value: (distToVWAP * 100).toFixed(2) + '%',
        met: nearVWAP,
        description: `Price near VWAP`
    });
    if (nearVWAP) score += 20;

    // 3. Volume Trigger
    const volTrigger = rvol > CONFIG.VOLUME_CONFIRMATION;
    criteria.push({
        name: 'Volume Trigger',
        value: rvol.toFixed(2) + 'x',
        met: volTrigger,
        description: `RVOL > ${CONFIG.VOLUME_CONFIRMATION}`
    });
    if (volTrigger) score += 20;

    // 4. Momentum
    let momentum = false;
    if (isBullish && rsi > 40 && rsi < 75) momentum = true;
    if (isBearish && rsi < 60 && rsi > 25) momentum = true;
    if (momentum) score += 10;

    // 5. Session Phase (New)
    const phase = sessionService.getSessionPhase();
    const isLunch = phase === 'LUNCH_CHOP';

    if (isLunch) {
        criteria.push({ name: 'Session', value: 'LUNCH', met: false, description: 'Avoid Lunch Chop' });
        score -= 30;
    } else {
        criteria.push({ name: 'Session', value: phase, met: true, description: 'Active Session' });
        score += 10;
    }

    // Signal Logic
    if (score >= 80) {
        if (isBullish && currentPrice > currentVWAP) signal = 'GOLDEN LONG';
        else if (isBearish && currentPrice < currentVWAP) signal = 'GOLDEN SHORT';
    } else if (score >= 50) signal = 'WATCH';

    // Setup
    let setup = null;
    if (signal === 'GOLDEN LONG') {
        setup = { entryZone: currentVWAP, stopLoss: currentVWAP * 0.99, target: currentPrice + (currentPrice - currentVWAP) * 2 };
    } else if (signal === 'GOLDEN SHORT') {
        setup = { entryZone: currentVWAP, stopLoss: currentVWAP * 1.01, target: currentPrice - (currentVWAP - currentPrice) * 2 };
    }

    return {
        id: 'golden-setup',
        name: 'The Golden Setup',
        type: 'Trend Following',
        description: 'High probability trade aligned with Daily Trend + VWAP interaction.',
        score: Math.max(0, Math.min(score, 100)),
        signal,
        color: score >= 80 ? 'emerald' : score >= 50 ? 'amber' : 'slate',
        criteria,
        setup
    };
}

/**
 * Mean Reversion (Scalping)
 */
export function scoreMeanReversion(indicators) {
    const { priceHistory, rsi, bb } = indicators;
    const currentPrice = priceHistory[priceHistory.length - 1];

    if (!bb) return { id: 'mean-reversion', score: 0, signal: 'NEUTRAL', criteria: [] };

    const criteria = [];
    let score = 0;
    let signal = 'NEUTRAL';

    const piercedLower = currentPrice < bb.lower;
    const piercedUpper = currentPrice > bb.upper;
    const isOversold = rsi < 30;
    const isOverbought = rsi > 70;

    if (piercedLower || piercedUpper) {
        criteria.push({ name: 'BB Pierce', value: 'YES', met: true, description: 'Price pierced Bollinger Band' });
        score += 40;
    }
    if (isOversold || isOverbought) {
        criteria.push({ name: 'RSI Extreme', value: rsi.toFixed(1), met: true, description: 'RSI Overbought/Oversold' });
        score += 40;
    }

    if (piercedLower || isOversold) {
        if (score >= 40) {
            signal = 'SCALP BUY';
            if (piercedLower && isOversold) score += 20;
        }
    }
    if (piercedUpper || isOverbought) {
        if (score >= 40) {
            signal = 'SCALP SELL';
            if (piercedUpper && isOverbought) score += 20;
        }
    }

    let setup = null;
    if (signal === 'SCALP BUY') setup = { entryZone: currentPrice, stopLoss: currentPrice * 0.995, target: bb.middle };
    else if (signal === 'SCALP SELL') setup = { entryZone: currentPrice, stopLoss: currentPrice * 1.005, target: bb.middle };

    return {
        id: 'mean-reversion',
        name: 'Mean Reversion Scalp',
        type: 'Reversion',
        description: 'Scalping reversals from extreme overbought/oversold levels.',
        score: Math.max(0, Math.min(score, 100)),
        signal,
        color: score >= 80 ? 'purple' : 'slate',
        criteria,
        setup
    };
}

export function scoreVWAPBounce(indicators) {
    // Keeping simplified version for legacy support or removal
    return { id: 'vwap-bounce', score: 0, signal: 'NEUTRAL', criteria: [] };
}
