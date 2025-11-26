# Intraday Strategy Expansion Research

## Objective
Add 2-3 high-probability, institutional-grade intraday strategies to the engine.

## Candidate Strategies

### 1. Institutional Order Blocks (Smart Money Concepts)
*   **Concept**: Identify zones where institutions have likely placed large orders. These are often "consolidation" candles right before a massive impulsive move.
*   **Logic**:
    1.  Find a strong impulsive move (large body candle, high volume).
    2.  Identify the last opposite-color candle *before* that move (the "Order Block").
    3.  **Signal**: Limit entry when price retraces back into this zone.
*   **Why**: High probability of a bounce/rejection as institutions defend their positions.

### 2. Gap Fill Reversal
*   **Concept**: "Gaps" (price jumping overnight) often act as magnets.
*   **Logic**:
    1.  Detect a gap at the open (> 0.5%).
    2.  Wait for price to trade back to yesterday's close (The "Fill").
    3.  **Signal**: Reversal trade (bounce) at the fill level, confirmed by candlestick pattern or RSI.
*   **Why**: Algorithms often target gap fills for liquidity.

### 3. Volatility Squeeze (Momentum)
*   **Concept**: Periods of low volatility (compression) are followed by high volatility (expansion).
*   **Logic**:
    1.  Bollinger Bands are *inside* Keltner Channels (Squeeze is "On").
    2.  Wait for Squeeze to "Fire" (BBs expand outside KCs).
    3.  **Signal**: Trade in the direction of the breakout (Momentum).
*   **Why**: Catches explosive moves after consolidation (e.g., Lunch Chop -> Afternoon Breakout).

## Recommendation
Implement **Order Blocks** and **Volatility Squeeze**.
- **Order Blocks** adds a "Support/Resistance" style strategy that complements the existing Trend/Reversion ones.
- **Volatility Squeeze** is perfect for catching the "Power Hour" moves after "Lunch Chop".
