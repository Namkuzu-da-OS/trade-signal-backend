# TradeSignal AI - Algorithmic Trading Dashboard

A powerful, full-stack trading signal engine designed to identify high-probability setups for both **Swing Trading** and **Intraday Trading**. This system aggregates technical analysis, market sentiment, and institutional order flow concepts into a unified dashboard.

## 🚀 Key Features

### 1. Dual Trading Modes
The platform supports two distinct trading styles, toggled via the dashboard sidebar:

*   **📈 Swing Mode (Daily/Weekly)**
    *   **Focus:** Multi-day to multi-week holds.
    *   **Timeframes:** Daily (`1d`), Weekly (`1wk`).
    *   **Strategies:** Trend Following, Volatility Squeeze, Panic Reversion.
    *   **Goal:** Capture major market moves and institutional positioning.

*   **⚡ Intraday Mode (15m/1h)**
    *   **Focus:** Same-day execution.
    *   **Timeframes:** 15-Minute (`15m`), Hourly (`1h`).
    *   **Strategies:** Opening Range Breakout (ORB), VWAP Bounce.
    *   **Goal:** Capitalize on session volatility and intraday key levels.

### 2. Strategy Engine
The backend (`server.js` & `strategies/`) evaluates real-time market data against defined algorithmic criteria.

#### Swing Strategies
*   **Institutional Trend:** Identifies strong uptrends supported by moving averages (SMA 20/50/200) and RSI momentum.
*   **Volatility Squeeze:** Detects periods of low volatility (Bollinger Bands inside Keltner Channels) likely to be followed by an explosive move.
*   **Panic Reversion:** Contrarian strategy buying into extreme oversold conditions (RSI < 30) during uptrends.
*   **EMA Momentum Confluence:** Validates trends using a "stack" of EMAs (8, 21, 55).
*   **Volatility Breakout:** Trades expansions in volatility confirmed by volume.
*   **VWAP Mean Reversion:** Fades extreme deviations from the Volume Weighted Average Price.

#### Intraday Strategies
*   **🎯 Opening Range Breakout (ORB):**
    *   Monitors the first 30 minutes of the trading session (9:30 - 10:00 AM ET).
    *   Signals a **BUY** if price breaks above the ORB High with volume.
    *   Signals a **SELL** if price breaks below the ORB Low with volume.
    *   **UI:** Dedicated "Opening Range" panel shows High, Low, and current status.
*   **VWAP Bounce:**
    *   Identifies price pullbacks to the VWAP line that hold as support.
    *   Requires volume confirmation on the bounce.

### 3. Advanced Analytics
*   **Multi-Timeframe Alignment:** Automatically checks trend direction across Daily, Weekly, and Monthly charts. A "3/3" alignment indicates a high-probability setup.
*   **Smart Key Levels:**
    *   **Pivots:** Standard Daily Pivot Points (R1, S1, P).
    *   **Smart Fibs:** Dynamically displays the **nearest** 52-week Fibonacci retracement level to the current price.
    *   **Volume Profile:** Calculates Point of Control (POC) to identify high-interest price levels.
*   **Confluence Scoring:** Every strategy is assigned a "Confidence Score" (0-100%) based on how many confirming factors are present (e.g., Volume > Average, RSI not overbought, Trend Alignment).

## 🛠 Tech Stack
*   **Backend:** Node.js, Express
*   **Data:** Yahoo Finance API (`yahoo-finance2`)
*   **Analysis:** `technicalindicators` library, Custom logic
*   **Database:** SQLite (for Watchlist, Journal, and Trade History)
*   **Frontend:** HTML5, Vanilla JavaScript, TailwindCSS (via CDN), Chart.js

## 📦 Installation & Usage

1.  **Install Dependencies:**
    ```bash
    npm install
    ```

2.  **Start the Server:**
    ```bash
    npm start
    ```
    The server will run on `http://localhost:3001`.

3.  **Access the Dashboard:**
    Open your browser and navigate to `http://localhost:3001`.

## 📂 Project Structure
*   `server.js`: Main API server and route handling.
*   `analysis.js`: Core technical analysis logic (Indicator calculations, Key Levels).
*   `strategies.js`: Logic for Swing trading strategies.
*   `strategies/intraday.js`: Logic for Intraday strategies (ORB, VWAP).
*   `public/index.html`: The main dashboard frontend.
*   `database.sqlite`: Local storage for user data.

## 📝 API Endpoints
*   `GET /api/scan?symbol=SPY&interval=15m`: Runs the strategy engine on a specific symbol and timeframe.
*   `GET /api/analyze/multi/:symbol`: Fetches multi-timeframe trend data.
*   `GET /api/watchlist`: Retrieves the user's watchlist.
