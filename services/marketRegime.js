/**
 * Market Regime Detector
 * Classifies the current market environment to filter strategies.
 */

export function detectMarketRegime(indicators, marketState) {
    const { adx, rsi, priceHistory, sma20, sma50, sma200 } = indicators;
    const { vix } = marketState;

    // Validation: Return default if critical data missing
    if (!priceHistory || !adx || vix === undefined) {
        return {
            regime: 'UNKNOWN',
            details: { trendStrength: 'UNKNOWN', trendDirection: 'UNKNOWN', volatility: 'UNKNOWN', adx: 'N/A', vix: 'N/A' },
            recommendations: { canTradeTrend: false, canTradeMeanReversion: false, canTradeBreakout: false, reduceRisk: true }
        };
    }

    // 1. Trend Strength (ADX)
    // ADX > 25 indicates a strong trend
    // ADX < 20 indicates a ranging/choppy market
    let trendStrength = 'WEAK';
    if (adx > 25) trendStrength = 'STRONG';
    else if (adx > 20) trendStrength = 'MODERATE';

    // 2. Trend Direction (SMA Alignment)
    // Bullish: Price > SMA20 > SMA50 > SMA200
    // Bearish: Price < SMA20 < SMA50 < SMA200
    const currentPrice = priceHistory[priceHistory.length - 1];
    let trendDirection = 'NEUTRAL';

    if (currentPrice > sma20 && sma20 > sma50) {
        trendDirection = 'BULLISH';
    } else if (currentPrice < sma20 && sma20 < sma50) {
        trendDirection = 'BEARISH';
    }

    // 3. Volatility Regime (VIX)
    // Low: VIX < 15 (Complacent)
    // Normal: 15 <= VIX <= 25
    // High: VIX > 25 (Fear/Stress)
    let volatility = 'NORMAL';
    if (vix < 15) volatility = 'LOW';
    else if (vix > 25) volatility = 'HIGH';

    // 4. Combine into Regime
    let regime = 'RANGING'; // Default

    if (trendStrength === 'STRONG' || trendStrength === 'MODERATE') {
        if (trendDirection === 'BULLISH') regime = 'TRENDING_BULLISH';
        if (trendDirection === 'BEARISH') regime = 'TRENDING_BEARISH';
    }

    if (volatility === 'HIGH') {
        regime = 'VOLATILE'; // Overrides trend in extreme cases
    }

    return {
        regime,
        details: {
            trendStrength,
            trendDirection,
            volatility,
            adx: adx ? adx.toFixed(1) : 'N/A',
            vix: vix ? vix.toFixed(2) : 'N/A'
        },
        // Strategy Recommendations based on regime
        recommendations: {
            canTradeTrend: regime.includes('TRENDING'),
            canTradeMeanReversion: regime === 'RANGING' || regime === 'VOLATILE',
            canTradeBreakout: regime === 'TRENDING_BULLISH' || regime === 'TRENDING_BEARISH',
            reduceRisk: volatility === 'HIGH'
        }
    };
}
