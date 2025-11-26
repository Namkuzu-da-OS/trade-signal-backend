# 🔬 Signal Improvement Research (Phase 2)

## Objective
Enhance the quality and reliability of intraday and swing trading signals by improving data inputs, refining strategy logic, and introducing new market regime detection.

## 1. Data Quality Enhancements

### A. Real VIX & GEX Integration
Currently, we use mocked or simplified VIX/GEX data in some parts of the system.
- **VIX**: We need to ensure `fetchVIX()` is called and passed correctly to all strategies.
- **GEX (Gamma Exposure)**: This is hard to get for free.
  - *Alternative*: Use **Put/Call Ratio (PCR)** as a proxy. High PCR (>1.0) often indicates bearish sentiment (or oversold if extreme), Low PCR (<0.6) indicates bullish (or complacent).
  - *Action*: Add `fetchPCR()` using Yahoo Finance options data (summing volume of puts vs calls for nearest expiration).

### B. Economic Calendar
Trading during high-impact events (FOMC, CPI) is gambling.
- *Action*: Create a simple `isHighImpactEvent()` check.
- *Source*: Hardcode key times (2:00 PM ET on FOMC days) or fetch from a free calendar API.

## 2. Intraday Strategy Refinements

### A. "Golden Setup" 2.0
- **Time of Day Filter**: Avoid trading 12:00 PM - 1:30 PM ET (low volume "chop").
- **Distance from VWAP**: Don't enter if price is too far extended from VWAP (mean reversion risk).
- **Multi-Timeframe Confirmation**: Require 1H trend to match 15m signal.

### B. Opening Range Breakout (ORB)
- **Fix**: Ensure we have proper OHLC data for the first 30m.
- **Logic**:
  - Wait for 10:00 AM ET.
  - Buy break of 30m High.
  - Sell break of 30m Low.
  - Stop loss at mid-point of range.

### C. New: "Mean Reversion" (Scalping)
- **Condition**: Price pierces Lower Bollinger Band (20, 2) AND RSI < 30.
- **Trigger**: Candle closes back inside the band.
- **Target**: Middle Band (20 SMA).
- **Stop**: Low of the piercing candle.

## 3. Swing Trading Strategies (New)

We need a dedicated `strategies/swing.js` module.

### A. Sector Rotation
- **Logic**: Identify which sectors are outperforming SPY over 5 days.
- **Assets**: XLK (Tech), XLF (Financials), XLV (Health), XLE (Energy).
- **Signal**: Buy the strongest sector on a pullback.

### B. Breadth Thrust
- **Logic**: If >90% of stocks are above their 20-day SMA (rare), it signals a strong new bull trend.
- **Proxy**: Use `RSP` (Equal Weight SPY) vs `SPY` (Market Cap Weighted) relative strength.

## 4. Market Regime Detection

Strategies fail when used in the wrong environment.
- **Trending**: Use Golden Setup, ORB.
- **Ranging**: Use Mean Reversion.
- **High Volatility**: Reduce position size, widen stops.

**Detector Logic**:
- **ADX > 25**: Trending.
- **ADX < 20**: Ranging.
- **VIX > 20**: High Volatility.

## 5. Implementation Roadmap

1.  **Refactor**: Create `strategies/swing.js`.
2.  **Enhance**: Update `strategies/intraday.js` with Time of Day and Regime filters.
3.  **New Feature**: Implement `MarketRegime` service to classify the market state globally.
4.  **UI**: Display "Market Regime" (e.g., "Trending Bullish", "Choppy Range") on the dashboard.
