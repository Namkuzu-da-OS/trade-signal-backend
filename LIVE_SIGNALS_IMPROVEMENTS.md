# 🚀 Research: Improving Live Signals Dashboard

To make the **Live Signals** page (`signals.html`) a true "Command Center," we should add the following features:

## 1. Market Context Ticker 📊
**Why:** You need to know the overall market "mood" (Risk On/Off) before taking any individual trade.
**Feature:** A top bar displaying real-time data for:
-   **SPY** (S&P 500)
-   **QQQ** (Tech)
-   **VIX** (Volatility/Fear)
-   **BTC-USD** (Crypto Sentiment)

## 2. Timeframe Matrix (Confluence) 🚥
**Why:** A single "Score" hides the detail. You want to see *alignment* across timeframes instantly.
**Feature:** Replace the generic "Score" column with a visual matrix:
-   **15m:** 🟢 (Bullish)
-   **1H:** 🟢 (Bullish)
-   **1D:** 🔴 (Bearish)
*This lets you spot "Counter-Trend" vs "Trend-Following" setups instantly.*

## 3. "Smart" Action Buttons ⚡
**Why:** The table is currently static.
**Feature:** Add action buttons to each row:
-   **🤖 Analyze:** Triggers the Gemini AI analysis immediately.
-   **📈 Chart:** Opens the TradingView chart (or internal chart).

## 4. Heatmap View (Visual Scanning) 🗺️
**Why:** Lists are hard to scan. A heatmap shows you where the action is.
**Feature:** A grid of boxes colored by Signal Strength (Green = Strong Buy, Red = Strong Sell).

## Implementation Plan
1.  **Backend:** Create `/api/market/status` endpoint to fetch indices.
2.  **Frontend:**
    -   Add Ticker Bar to `signals.html`.
    -   Update Table to show "Timeframe Badges" (15m/1H/1D).
    -   Add "Analyze" button to table rows.

Shall we proceed with these upgrades?
