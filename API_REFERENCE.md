# TradeSignal AI - API Reference

The TradeSignal AI backend exposes a RESTful API for retrieving technical analysis, market data, and trading signals.

## Base URL
`http://localhost:3001` (Default)

## Endpoints

### 1. Market Data
Real-time market status and indices.

- **Get Market Status:** `GET /api/scan/market/status`
  - Returns real-time data for SPY, QQQ, VIX, BTC.
  - **Response:**
    ```json
    {
      "SPY": { "price": 500.00, "change": 1.50, "percent": 0.3 },
      "QQQ": { "price": 400.00, "change": -0.50, "percent": -0.1 },
      ...
    }
    ```

### 2. Live Signals
Interact with the live signal engine.

- **Get All Signals:** `GET /api/signals/live`
  - Returns all active signals from the database.

- **Get Signal Details:** `GET /api/signals/live/:symbol`
  - Returns detailed data for a specific symbol.

- **Generate AI Analysis:** `POST /api/signals/live/:symbol/analyze`
  - Triggers Gemini AI to analyze a specific signal.
  - **Response:** `{ "analysis": "Markdown string..." }`

### 3. Scanner Automation
Control the background scanning engine.

- **Start Scanner:** `POST /api/auto/start`
  - Body: `{ "intervalMinutes": 15 }`
- **Stop Scanner:** `POST /api/auto/stop`
- **Get Status:** `GET /api/auto/status`
- **Run Single Cycle:** `POST /api/auto/cycle`
- **Get Logs:** `GET /api/auto/logs`

### 4. Technical Analysis
Perform on-demand analysis.

- **Single Scan:** `GET /api/scan?symbol=SPY&interval=15m`
- **Batch Scan:** `POST /api/scan/batch`
  - Body: `{ "symbols": ["SPY", "QQQ"], "interval": "15m" }`

### 5. Watchlist Management
Manage the list of symbols to scan.

- **Get Watchlist:** `GET /api/watchlist`
- **Add Symbol:** `POST /api/watchlist` (Body: `{ "symbol": "AAPL" }`)
- **Remove Symbol:** `DELETE /api/watchlist/:symbol`

### 6. System
- **Health Check:** `GET /api/health`
