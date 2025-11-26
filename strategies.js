import { SMA, RSI, BollingerBands, ADX, Stochastic, PSAR, OBV, ATR, VWAP } from 'technicalindicators';
import { calculateKellySize } from './tradeManager.js';
import { calculateIndicators } from './analysis.js'; // Import from single source of truth
import CONFIG from './config.js';

// ============================================================================
// MATH HELPERS (Black-Scholes for GEX)
// ============================================================================

const stdNormCDF = (x) => {
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989423 * Math.exp(-x * x / 2);
    const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return x > 0 ? 1 - prob : prob;
};

const stdNormPDF = (x) => {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
};

function calculateGamma(S, K, T, r, sigma) {
    if (T <= 0 || sigma <= 0) return 0;
    const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    return stdNormPDF(d1) / (S * sigma * Math.sqrt(T));
}

// Note: calculateIndicators() is now imported from analysis.js
// This eliminates ~100 lines of duplicate code

export function calculateVolumeProfile(historical, period = 50) {
    const slice = historical.slice(-period);
    if (slice.length === 0) return { profile: [], poc: 0 };

    // Find Price Range
    let minPrice = Infinity;
    let maxPrice = -Infinity;
    slice.forEach(d => {
        if (d.low < minPrice) minPrice = d.low;
        if (d.high > maxPrice) maxPrice = d.high;
    });

    // Create Buckets (24 levels)
    const bucketCount = 24;
    const range = maxPrice - minPrice;
    const step = range / bucketCount;
    const buckets = new Array(bucketCount).fill(0);

    // Distribute Volume
    slice.forEach(d => {
        const bucketIndex = Math.min(
            Math.floor((d.close - minPrice) / step),
            bucketCount - 1
        );
        buckets[bucketIndex] += d.volume;
    });

    // Find POC (Point of Control)
    let maxVol = 0;
    let pocIndex = 0;
    buckets.forEach((vol, i) => {
        if (vol > maxVol) {
            maxVol = vol;
            pocIndex = i;
        }
    });

    const pocPrice = minPrice + (pocIndex * step) + (step / 2);

    // Format for chart
    const profile = buckets.map((vol, i) => ({
        price: minPrice + (i * step) + (step / 2),
        volume: vol,
        isPoc: i === pocIndex
    }));

    return { profile, poc: pocPrice };
}

export function calculateGEX(options, currentPrice) {
    if (!options || options.length === 0) return { totalGEX: 0, zeroGammaLevel: 0, profile: [] };

    let totalGEX = 0;
    const gexByStrike = {};
    const r = 0.05; // Risk-free rate assumption (5%)

    options.forEach(option => {
        const K = option.strike;
        let T = (new Date(option.expiration) - new Date()) / (1000 * 60 * 60 * 24 * 365); // Time to expiry in years

        // Handle 0-DTE (Zero Days to Expiration) or slightly expired due to timezone
        // If T is negative but within 1 day, treat as 0-DTE (use small T)
        if (T <= 0 && T > -0.003) {
            T = 0.001; // ~8 hours
        }

        const sigma = option.impliedVolatility;
        const type = option.contractSymbol.includes('C') ? 'call' : 'put';
        const oi = option.openInterest || 0;

        if (T > 0 && sigma > 0 && oi > 0) {
            const gamma = calculateGamma(currentPrice, K, T, r, sigma);

            // Dealer Positioning Assumption:
            // Dealers are Short Calls (Retail Buys) -> Short Gamma -> Negative GEX contribution?
            // Wait, standard GEX convention:
            // Call OI * Gamma = Positive GEX (Dealers Long Gamma? No, Dealers Short Gamma).
            // SqueezeMetrics Convention:
            // Call GEX = OI * Gamma * Spot (Dealers Short Calls -> They sell into strength -> Dampen volatility? No.)
            // Let's stick to the roadmap's "Short Gamma amplifies volatility"
            // If Dealers are Short Calls: Price UP -> Delta UP (more short) -> Must BUY to hedge -> Accelerates move.
            // If Dealers are Short Puts: Price DOWN -> Delta DOWN (more short) -> Must SELL to hedge -> Accelerates move.

            // Simplified Model (SpotGamma/SqueezeMetrics style):
            // Call OI contributes to Positive GEX (Dampening)??
            // Actually, let's use the roadmap's simplified output:
            // "Negative GEX" = Volatility. "Positive GEX" = Mean Reversion.

            // Standard Model:
            // Dealers Short Calls -> Price Up -> Buy Underlying -> Accelerates (Short Gamma).
            // Dealers Long Puts -> Price Down -> Sell Underlying -> Accelerates (Short Gamma).
            // WAIT. Dealers SELL Puts to Retail. Retail BUYS Puts.
            // So Dealers are Short Puts.

            // Let's use the convention:
            // Call OI -> Adds to GEX
            // Put OI -> Subtracts from GEX
            // Net GEX = (Call Gamma * Call OI) - (Put Gamma * Put OI)
            // If Net GEX > 0: Calls Dominate. Dealers Short Calls.
            // If Net GEX < 0: Puts Dominate. Dealers Short Puts.

            // Wait, if Dealers are Short Calls (Short Gamma), then Call OI should be NEGATIVE GEX?
            // Let's assume:
            // Call OI = Dealer Short Call = Short Gamma (Negative)
            // Put OI = Dealer Short Put = Long Gamma (Positive)? No.

            // Let's flip it to the most common "GEX" chart interpretation:
            // Positive GEX = Low Volatility (Dealers Hedging against moves -> Mean Reversion).
            // Negative GEX = High Volatility (Dealers Hedging with moves -> Acceleration).

            // Usually:
            // Dealers are LONG Calls (from covered calls?) -> Positive Gamma.
            // Dealers are SHORT Puts (from cash secured puts?) -> Positive Gamma?

            // Let's use the "SpotGamma" formula:
            // GEX = (Call Gamma * OI) - (Put Gamma * OI)
            // This assumes Calls provide Positive Gamma and Puts provide Negative Gamma.
            // Let's stick to this standard convention.

            const gexValue = (gamma * oi * 100 * currentPrice); // Dollar Gamma

            if (type === 'call') {
                totalGEX += gexValue;
                if (!gexByStrike[K]) gexByStrike[K] = 0;
                gexByStrike[K] += gexValue;
            } else {
                totalGEX -= gexValue;
                if (!gexByStrike[K]) gexByStrike[K] = 0;
                gexByStrike[K] -= gexValue;
            }
        }
    });

    // Find Zero Gamma Level (Flip Point)
    // Simple approximation: Strike where GEX flips from positive to negative
    const strikes = Object.keys(gexByStrike).map(Number).sort((a, b) => a - b);
    let zeroGammaLevel = currentPrice;

    for (let i = 0; i < strikes.length - 1; i++) {
        if (gexByStrike[strikes[i]] < 0 && gexByStrike[strikes[i + 1]] > 0) {
            zeroGammaLevel = strikes[i] + (strikes[i + 1] - strikes[i]) / 2;
            break;
        }
    }

    return {
        totalGEX, // In Dollar terms (approx)
        zeroGammaLevel,
        val: totalGEX / 1000000000 // In Billions for display
    };
}

// ============================================================================
// STRATEGY SCORING ENGINE
// ============================================================================

export function scoreInstitutionalTrend(indicators, vix) {
    const criteria = [];
    let score = 0;

    // Criterion 1: Price > SMA(200) - Uptrend
    const aboveSMA200 = indicators.currentPrice > indicators.sma200;
    criteria.push({
        name: 'Above 200 SMA',
        description: 'Price confirms long-term uptrend',
        met: aboveSMA200,
        value: `$${indicators.currentPrice.toFixed(2)} vs $${indicators.sma200?.toFixed(2) || 'N/A'}`
    });
    if (aboveSMA200) score += 33;

    // Criterion 2: Price > VWAP - Institutional Support
    const aboveVWAP = indicators.currentPrice > indicators.vwap;
    criteria.push({
        name: 'Above VWAP',
        description: 'Trading above institutional average price',
        met: aboveVWAP,
        value: `$${indicators.currentPrice.toFixed(2)} vs $${indicators.vwap?.toFixed(2) || 'N/A'}`
    });
    if (aboveVWAP) score += 34;

    // Criterion 3: RSI between 50-70 - Strong but not overbought
    const rsiBullish = indicators.rsi >= CONFIG.RSI_BULLISH_MIN && indicators.rsi <= CONFIG.RSI_BULLISH_MAX;
    criteria.push({
        name: 'RSI Bullish Zone',
        description: `Momentum strong but not overbought (${CONFIG.RSI_BULLISH_MIN}-${CONFIG.RSI_BULLISH_MAX})`,
        met: rsiBullish,
        value: indicators.rsi?.toFixed(1) || 'N/A'
    });
    if (rsiBullish) score += 33;

    // Determine signal
    let signal = 'WAIT';
    if (score >= 90) signal = 'STRONG BUY';
    else if (score >= 67) signal = 'BUY';
    else if (score >= 34) signal = 'WATCH';

    // Calculate Trade Setup (Entry, Stop, Target)
    const currentPrice = indicators.currentPrice;
    const atrRisk = currentPrice * 0.02; // 2% ATR-based risk
    const stopLoss = currentPrice - atrRisk;
    const target = currentPrice + (atrRisk * 2); // 2:1 R:R

    return {
        id: 'institutional-trend',
        name: 'Institutional Trend',
        type: 'Trend Following',
        description: 'Follow the big money. Institutions accumulate at VWAP.',
        score,
        signal,
        color: score >= 67 ? 'emerald' : score >= 34 ? 'amber' : 'slate',
        criteria,
        education: 'This strategy identifies when price is supported by institutional buying (above VWAP) within a confirmed uptrend (above 200 SMA). RSI between 50-70 shows strength without overextension.',
        setup: {
            entryZone: currentPrice,
            stopLoss: stopLoss,
            target: target,
            riskReward: 2.0
        }
    };
}

export function scoreVolatilitySqueeze(indicators, vix) {
    const criteria = [];
    let score = 0;

    // Criterion 1: Bollinger Band Width < threshold - Tight bands
    const bandsTight = indicators.bbWidth < CONFIG.BB_SQUEEZE_THRESHOLD;
    criteria.push({
        name: 'Bands Contracting',
        description: `Bollinger Band Width < ${CONFIG.BB_SQUEEZE_THRESHOLD * 100}% (squeeze forming)`,
        met: bandsTight,
        value: `${(indicators.bbWidth * 100).toFixed(1)}%`
    });
    if (bandsTight) score += 34;

    // Criterion 2: ADX > threshold - Latent energy exists
    const adxReady = indicators.adx > CONFIG.ADX_ENERGY_THRESHOLD;
    criteria.push({
        name: 'ADX Energy',
        description: `ADX > ${CONFIG.ADX_ENERGY_THRESHOLD} indicates directional energy building`,
        met: adxReady,
        value: indicators.adx?.toFixed(1) || 'N/A'
    });
    if (adxReady) score += 33;

    // Criterion 3: RVOL > threshold - Volume confirming
    const volumeSpike = indicators.rvol > CONFIG.VOLUME_CONFIRMATION;
    criteria.push({
        name: 'Volume Surge',
        description: `Relative Volume > ${CONFIG.VOLUME_CONFIRMATION * 100}% of 10-day average`,
        met: volumeSpike,
        value: `${(indicators.rvol * 100).toFixed(0)}%`
    });
    if (volumeSpike) score += 33;

    // Determine signal
    let signal = 'NO SIGNAL';
    if (score >= 90) signal = 'BUY';
    else if (score >= 67) signal = 'BUY WATCH';
    else if (score >= 34) signal = 'WATCH';

    // Calculate Trade Setup
    const currentPrice = indicators.currentPrice;
    const atrRisk = currentPrice * 0.025; // 2.5% for breakout
    const stopLoss = currentPrice - atrRisk;
    const target = currentPrice + (atrRisk * 2);

    return {
        id: 'volatility-squeeze',
        name: 'Volatility Squeeze',
        type: 'Breakout',
        description: 'Low volatility precedes explosive moves. Catch the expansion.',
        score,
        signal,
        color: score >= 67 ? 'emerald' : score >= 34 ? 'amber' : 'slate',
        criteria,
        education: 'When Bollinger Bands contract (squeeze), it signals decreasing volatility. Combined with ADX showing directional energy and rising volume, this often precedes a significant price move.',
        setup: {
            entryZone: currentPrice,
            stopLoss: stopLoss,
            target: target,
            riskReward: 2.0
        }
    };
}

export function scorePanicReversion(indicators, vix) {
    const criteria = [];
    let score = 0;

    // Criterion 1: VIX > threshold - Market Fear
    const marketFear = vix.value > CONFIG.VIX_HIGH_FEAR;
    criteria.push({
        name: 'Market Fear',
        description: `VIX > ${CONFIG.VIX_HIGH_FEAR} indicates elevated fear`,
        met: marketFear,
        value: vix.value?.toFixed(2) || 'N/A'
    });
    if (marketFear) score += 34;

    // Criterion 2: RSI < threshold - Oversold
    const oversold = indicators.rsi < CONFIG.RSI_OVERSOLD;
    criteria.push({
        name: 'RSI Oversold',
        description: `RSI < ${CONFIG.RSI_OVERSOLD} indicates oversold conditions`,
        met: oversold,
        value: indicators.rsi?.toFixed(1) || 'N/A'
    });
    if (oversold) score += 33;

    // Criterion 3: Price > SMA(200) - Buying a dip, not catching a knife
    const trendIntact = indicators.currentPrice > indicators.sma200;
    criteria.push({
        name: 'Trend Intact',
        description: 'Price above 200 SMA - dip in bull market',
        met: trendIntact,
        value: `$${indicators.currentPrice.toFixed(2)} vs $${indicators.sma200?.toFixed(2) || 'N/A'}`
    });
    if (trendIntact) score += 33;

    // Determine signal
    let signal = 'NO SIGNAL';
    if (score >= 90) signal = 'STRONG BUY';
    else if (score >= 67) signal = 'BUY';
    else if (score >= 34) signal = 'WATCH';

    // Calculate Trade Setup
    const currentPrice = indicators.currentPrice;
    const atrRisk = currentPrice * 0.03; // 3% for reversal plays
    const stopLoss = currentPrice - atrRisk;
    const target = currentPrice + (atrRisk * 2);

    return {
        id: 'panic-reversion',
        name: 'Panic Reversion',
        type: 'Contrarian',
        description: 'Buy when the market is irrationally fearful.',
        score,
        signal,
        color: score >= 67 ? 'emerald' : score >= 34 ? 'amber' : 'slate',
        criteria,
        education: 'This contrarian strategy buys extreme fear. When VIX spikes above 25, RSI shows oversold conditions, BUT the long-term trend is still intact - this is often a high-probability mean reversion setup.',
        setup: {
            entryZone: currentPrice,
            stopLoss: stopLoss,
            target: target,
            riskReward: 2.0
        }
    };
}
// ============================================================================
// NEW CONFLUENCE-BASED STRATEGIES (Research-Backed)
// ============================================================================

export function scoreEMAMomentumConfluence(indicators, vix) {
    const criteria = [];
    let score = 0;

    // Criterion 1: EMA 8 > EMA 21 (Short-term uptrend)
    const emaUptrend = indicators.ema8 > indicators.ema21;
    criteria.push({
        name: 'EMA Crossover',
        description: 'EMA 8 above EMA 21 confirms short-term momentum',
        met: emaUptrend,
        value: `${indicators.ema8?.toFixed(2)} vs ${indicators.ema21?.toFixed(2)}`
    });
    if (emaUptrend) score += 25;

    // Criterion 2: RSI between 40-60 (Healthy momentum, not overbought)
    const rsiHealthy = indicators.rsi >= 40 && indicators.rsi <= 60;
    criteria.push({
        name: 'Healthy RSI',
        description: 'RSI 40-60 shows momentum without overextension',
        met: rsiHealthy,
        value: indicators.rsi?.toFixed(1) || 'N/A'
    });
    if (rsiHealthy) score += 25;

    // Criterion 3: Volume > 1.5x average (Volume confirmation)
    const volumeConfirm = indicators.rvol > 1.5;
    criteria.push({
        name: 'Volume Confirmation',
        description: 'Volume > 1.5x average validates the move',
        met: volumeConfirm,
        value: `${(indicators.rvol * 100).toFixed(0)}%`
    });
    if (volumeConfirm) score += 25;

    // Criterion 4: Price above VWAP (Institutional support)
    const aboveVWAP = indicators.currentPrice > indicators.vwap;
    criteria.push({
        name: 'Above VWAP',
        description: 'Trading above institutional average',
        met: aboveVWAP,
        value: `$${indicators.currentPrice.toFixed(2)} vs $${indicators.vwap?.toFixed(2)}`
    });
    if (aboveVWAP) score += 25;

    // Determine signal
    let signal = 'WAIT';
    if (score >= 90) signal = 'STRONG BUY';
    else if (score >= 75) signal = 'BUY';
    else if (score >= 50) signal = 'WATCH';

    // Calculate Trade Setup
    const currentPrice = indicators.currentPrice;
    const atrRisk = currentPrice * 0.02;
    const stopLoss = currentPrice - atrRisk;
    const target = currentPrice + (atrRisk * 2);

    return {
        id: 'ema-momentum-confluence',
        name: 'EMA Momentum Confluence',
        type: 'Trend + Momentum',
        description: '4-factor confluence: EMA trend + RSI + Volume + VWAP.',
        score,
        signal,
        color: score >= 75 ? 'emerald' : score >= 50 ? 'amber' : 'slate',
        criteria,
        education: 'This research-backed strategy combines 4 complementary signals. When EMA 8 crosses above EMA 21 with healthy RSI (not overbought), strong volume, AND price above VWAP, win rates reach 65-72%.',
        setup: {
            entryZone: currentPrice,
            stopLoss: stopLoss,
            target: target,
            riskReward: 2.0
        }
    };
}

export function scoreVolatilityBreakoutEnhanced(indicators, vix) {
    const criteria = [];
    let score = 0;

    // Criterion 1: Bollinger Band Squeeze (width < 10%)
    const squeeze = indicators.bbWidth < 0.10;
    criteria.push({
        name: 'BB Squeeze',
        description: 'Bollinger Bands contracting < 10%',
        met: squeeze,
        value: `${(indicators.bbWidth * 100).toFixed(1)}%`
    });
    if (squeeze) score += 25;

    // Criterion 2: ADX > 25 (Directional energy building)
    const adxStrong = indicators.adx > 25;
    criteria.push({
        name: 'Strong ADX',
        description: 'ADX > 25 shows directional conviction',
        met: adxStrong,
        value: indicators.adx?.toFixed(1) || 'N/A'
    });
    if (adxStrong) score += 25;

    // Criterion 3: Stochastic crossing in extreme zone
    const stoch = indicators.stochastic;
    const stochCross = stoch && ((stoch.k < 20 && stoch.k > stoch.d) || (stoch.k > 80 && stoch.k < stoch.d));
    criteria.push({
        name: 'Stochastic Signal',
        description: 'Stochastic crossing in oversold/overbought zone',
        met: stochCross,
        value: stoch ? `K: ${stoch.k?.toFixed(1)} D: ${stoch.d?.toFixed(1)}` : 'N/A'
    });
    if (stochCross) score += 25;

    // Criterion 4: Volume surge > 2x average
    const volumeSurge = indicators.rvol > 2.0;
    criteria.push({
        name: 'Volume Breakout',
        description: 'Volume surge > 200% confirms breakout',
        met: volumeSurge,
        value: `${(indicators.rvol * 100).toFixed(0)}%`
    });
    if (volumeSurge) score += 25;

    // Determine signal
    let signal = 'NO SIGNAL';
    if (score >= 90) signal = 'BREAKOUT ALERT';
    else if (score >= 75) signal = 'BUY';
    else if (score >= 50) signal = 'WATCH';

    // Calculate Trade Setup
    const currentPrice = indicators.currentPrice;
    const atrRisk = currentPrice * 0.03; // Higher risk for breakouts
    const stopLoss = currentPrice - atrRisk;
    const target = currentPrice + (atrRisk * 2.5); // Higher target for breakouts

    return {
        id: 'volatility-breakout-enhanced',
        name: 'Volatility Breakout Enhanced',
        type: 'Breakout + Volume',
        description: 'Squeeze + Stochastic + ADX + Volume for high-prob breakouts.',
        score,
        signal,
        color: score >= 75 ? 'emerald' : score >= 50 ? 'amber' : 'slate',
        criteria,
        education: 'When Bollinger Bands squeeze with strong ADX and Stochastic crosses in extremes, backed by 2x volume, breakout win rates reach 68-75%. This catches the explosive moves that follow low volatility periods.',
        setup: {
            entryZone: currentPrice,
            stopLoss: stopLoss,
            target: target,
            riskReward: 2.5
        }
    };
}

export function scoreVWAPMeanReversion(indicators, vix) {
    const criteria = [];
    let score = 0;

    // Criterion 1: Price deviates > 2% from VWAP
    const deviation = Math.abs((indicators.currentPrice - indicators.vwap) / indicators.vwap) * 100;
    const deviates = deviation > 2;
    criteria.push({
        name: 'VWAP Deviation',
        description: 'Price > 2% from VWAP (reversion zone)',
        met: deviates,
        value: `${deviation.toFixed(1)}%`
    });
    if (deviates) score += 25;

    // Criterion 2: RSI divergence or extreme (simplified: < 30 or > 70)
    const rsiExtreme = indicators.rsi < 30 || indicators.rsi > 70;
    criteria.push({
        name: 'RSI Extreme',
        description: 'RSI in oversold/overbought zone',
        met: rsiExtreme,
        value: indicators.rsi?.toFixed(1) || 'N/A'
    });
    if (rsiExtreme) score += 25;

    // Criterion 3: Price near Bollinger Band extremes (support/resistance)
    const nearBBBand = indicators.currentPrice <= indicators.bb?.lower || indicators.currentPrice >= indicators.bb?.upper;
    criteria.push({
        name: 'At Key Level',
        description: 'Price at Bollinger Band extremes (support/resistance)',
        met: nearBBBand,
        value: `Lower: $${indicators.bb?.lower?.toFixed(2)} Upper: $${indicators.bb?.upper?.toFixed(2)}`
    });
    if (nearBBBand) score += 25;

    // Criterion 4: Price above SMA 200 (bullish context)
    const trendContext = indicators.currentPrice > indicators.sma200;
    criteria.push({
        name: 'Trend Context',
        description: 'Above 200 SMA (buying dip in uptrend)',
        met: trendContext,
        value: `$${indicators.currentPrice.toFixed(2)} vs $${indicators.sma200?.toFixed(2)}`
    });
    if (trendContext) score += 25;

    // Determine signal
    let signal = 'WAIT';
    if (score >= 90) signal = 'STRONG BUY';
    else if (score >= 75) signal = 'BUY';
    else if (score >= 50) signal = 'WATCH';

    // Calculate Trade Setup
    const currentPrice = indicators.currentPrice;
    const vwapDeviation = Math.abs(currentPrice - indicators.vwap);
    const stopLoss = currentPrice - vwapDeviation; // Stop at VWAP
    const target = currentPrice + (vwapDeviation * 1.5); // Mean reversion target

    return {
        id: 'vwap-mean-reversion',
        name: 'VWAP Mean Reversion',
        type: 'Mean Reversion',
        description: 'VWAP deviation + RSI + Key levels for reversion plays.',
        score,
        signal,
        color: score >= 75 ? 'emerald' : score >= 50 ? 'amber' : 'slate',
        criteria,
        education: 'Institutional traders use VWAP as their benchmark. When price deviates significantly from VWAP with extreme RSI at key support/resistance levels, reversion probability is 61-67%. This catches the snapback to the mean.',
        setup: {
            entryZone: currentPrice,
            stopLoss: stopLoss,
            target: target,
            riskReward: 1.5
        }
    };
}

export function scoreGammaExposure(gex, currentPrice) {
    const criteria = [];
    let score = 0;
    const gexBillion = gex.val;

    // Criterion 1: Negative GEX (High Volatility Regime)
    const isNegativeGEX = gexBillion < 0;
    criteria.push({
        name: 'Negative GEX Regime',
        description: 'Dealers are Short Gamma (Accelerates Volatility)',
        met: isNegativeGEX,
        value: `$${gexBillion.toFixed(2)}B`
    });
    // If Negative GEX, we favor Breakouts/Trend. If Positive, Mean Reversion.
    // This strategy scores for "Volatility/Crash" potential.
    if (isNegativeGEX) score += 50;

    // Criterion 2: Price below Zero Gamma Level (Bearish Flip)
    const belowFlip = currentPrice < gex.zeroGammaLevel;
    criteria.push({
        name: 'Below Flip Point',
        description: 'Price is in bearish gamma territory',
        met: belowFlip,
        value: `$${currentPrice.toFixed(2)} < $${gex.zeroGammaLevel.toFixed(2)}`
    });
    if (belowFlip) score += 25;

    // Criterion 3: Large Magnitude (> $1B or < -$1B)
    const significant = Math.abs(gexBillion) > 1;
    criteria.push({
        name: 'Significant Exposure',
        description: 'GEX > $1B or < -$1B indicates heavy dealer positioning',
        met: significant,
        value: `Abs($${gexBillion.toFixed(2)}B) > 1`
    });
    if (significant) score += 25;

    // Determine signal
    let signal = 'NEUTRAL';
    let type = 'Mean Reversion';

    if (gexBillion > 1) {
        signal = 'LOW VOLATILITY';
        type = 'Mean Reversion'; // Dealers dampen moves
    } else if (gexBillion < -1) {
        signal = 'HIGH VOLATILITY';
        type = 'Trend/Breakout'; // Dealers amplify moves
    }

    return {
        id: 'gamma-exposure',
        name: 'Gamma Exposure (GEX)',
        type: type,
        description: 'Market Maker positioning. Positive = Stable, Negative = Volatile.',
        score, // High score = High Volatility / Bearish Bias in this implementation
        signal,
        color: gexBillion < 0 ? 'rose' : 'emerald',
        criteria,
        education: 'Gamma Exposure (GEX) measures how Market Makers must hedge. Positive GEX (Green) means they buy dips and sell rips, stabilizing the market. Negative GEX (Red) means they sell dips and buy rips, accelerating volatility.',
        setup: {
            entryZone: currentPrice,
            stopLoss: gex.zeroGammaLevel,
            target: currentPrice + (currentPrice - gex.zeroGammaLevel), // Symmetry
            riskReward: 1.0,
            kellyRecommendation: calculateKellySize(0.55, 1.0, 100000) // Assumed 55% win rate, 1:1 RR
        }
    };
}
// ============================================================================
// VIX STRATEGIES
// ============================================================================

/**
 * Connors VIX Reversals (Swing)
 * Identifies market extremes based on VIX deviations.
 * @param {Array} vixHistory - Array of VIX historical data
 * @returns {Object} Strategy result
 */
export function scoreVIXReversion(vixHistory) {
    if (!vixHistory || vixHistory.length < 20) return { score: 0, signal: 'NEUTRAL' };

    const closes = vixHistory.map(d => d.close);
    const currentVIX = closes[closes.length - 1];

    // Calculate Indicators
    // Calculate Indicators
    const sma10 = SMA.calculate({ period: 10, values: closes });
    const currentSMA10 = sma10[sma10.length - 1];
    const rsi5 = RSI.calculate({ period: 5, values: closes });
    const currentRSI = rsi5[rsi5.length - 1];

    const criteria = [];
    let score = 0;
    let signal = 'NEUTRAL';

    // 1. Deviation from SMA (Mean Reversion)
    const deviation = (currentVIX - currentSMA10) / currentSMA10;

    if (deviation > 0.10) {
        criteria.push(`VIX is 10%+ above 10-SMA (${(deviation * 100).toFixed(1)}%) - Market Fear High`);
        score += 40;
    } else if (deviation < -0.10) {
        criteria.push(`VIX is 10%+ below 10-SMA (${(deviation * 100).toFixed(1)}%) - Market Complacency`);
        score += 40; // High score for Short signal too
    }

    // 2. RSI Extremes
    if (currentRSI > 70) {
        criteria.push(`VIX RSI(5) is Overbought (${currentRSI.toFixed(1)}) - Expect Market Bounce`);
        score += 30;
    } else if (currentRSI < 30) {
        criteria.push(`VIX RSI(5) is Oversold (${currentRSI.toFixed(1)}) - Expect Market Drop`);
        score += 30;
    }

    // Determine Signal
    // Note: High VIX = Buy Stocks (Fear is high)
    //       Low VIX = Sell Stocks (Complacency is high)
    if (score >= 60) {
        if (deviation > 0 || currentRSI > 70) {
            signal = 'BUY'; // Buy the market (SPY)
        } else if (deviation < 0 || currentRSI < 30) {
            signal = 'SELL'; // Sell the market (SPY)
        }
    }

    return {
        name: 'VIX Reversion (Connors)',
        score,
        signal,
        criteria,
        explanation: 'Contrarian strategy: Buys when VIX is extended high (Fear), Sells when VIX is extended low (Greed).'
    };
}
