# 🎯 Live Signals Dashboard Guide

The **Live Signals Dashboard** (`/signals.html`) is your command center for real-time market analysis. It aggregates data from multiple timeframes, applies institutional-grade strategies, and provides AI-powered insights.

## Key Features

### 1. Market Ticker 📈
Located at the top of the screen, the ticker provides real-time context on the broader market health.
- **Indices:** SPY (S&P 500), QQQ (Nasdaq 100), ^VIX (Volatility), BTC-USD (Bitcoin).
- **Updates:** Automatically refreshes every minute.

### 2. Signal Heatmap 🔥
A visual grid that allows you to spot opportunities instantly.
- **Green:** Buy Signals (Darker = Stronger)
- **Red:** Sell Signals (Darker = Stronger)
- **Gray:** Neutral/Hold
- **Interaction:** Click any box to open the detailed breakdown.

### 3. Multi-Timeframe Matrix ⏱️
The "Timeframes" column in the list view shows the alignment of signals across:
- **15m:** Intraday momentum.
- **1H:** Short-term trend.
- **1D:** Daily trend direction.
- **Confluence:** When all three dots match color, it indicates a high-probability "Golden Setup".

### 4. AI Analysis 🤖
Get a second opinion from Gemini AI.
- **How to use:** Click the **🤖** button in the table or "Generate AI Analysis" in the details modal.
- **What it does:** The AI reviews the technical indicators, VIX context, and price action to provide a risk assessment and key levels.

### 5. Filtering & Views 🔍
- **List View vs. Heatmap:** Toggle between detailed data and visual overview.
- **Filters:** Use the dropdown to show only "Buys", "Sells", or "Strong" signals.

### 6. Manual & Auto Scanning ⚡
- **Auto-Scanner:** Runs in the background at your set interval (default: 15m).
- **Manual Scan:** Triggers an immediate scan of your entire watchlist. Useful during high-volatility events.

## Strategy Legend
- **STRONG BUY (85%+):** All timeframes aligned + High Strategy Score.
- **BUY (70%+):** Good setup, but maybe missing one timeframe alignment.
- **WATCH (40-69%):** Potential setup forming, keep an eye on it.
- **HOLD/NEUTRAL:** No clear edge.
