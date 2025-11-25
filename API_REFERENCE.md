# TradeSignal AI - API Reference

The TradeSignal AI backend exposes a RESTful API for retrieving technical analysis, market data, and trading signals.

## Base URL
`http://localhost:3001` (Default)

## Endpoints

### 1. Market Scan & Analysis
Performs a full technical analysis scan on a specified asset.

- **Endpoint:** `/api/scan`
- **Method:** `GET`
- **Query Parameters:**
  - `symbol` (string, optional): The ticker symbol to analyze (e.g., `SPY`, `NVDA`, `BTC-USD`). Defaults to `SPY`.

#### Request Example
```bash
curl "http://localhost:3001/api/scan?symbol=NVDA"
```

#### Response Format (JSON)
```json
{
  "symbol": "NVDA",
  "timestamp": "2025-11-23T14:00:00.000Z",
  "marketState": {
    "price": 145.20,
    "change": 2.50,
    "changePercent": 1.75,
    "vix": 18.42,
    "marketRegime": "Normal",
    "isMarketOpen": true
  },
  "signals": [
    {
      "id": "institutional-trend",
      "name": "Institutional Trend",
      "score": 85,
      "signal": "STRONG BUY",
      "criteria": [ ... ]
    },
    ...
  ],
  "indicators": {
    "rsi": 55.4,
    "adx": 22.1,
    "bbWidth": 0.12,
    "rvol": 1.5
  },
  "chartData": { ... }
}
```

### 2. Health Check
Verifies that the API server is running and responsive.

- **Endpoint:** `/api/health`
- **Method:** `GET`

#### Request Example
```bash
curl "http://localhost:3001/api/health"
```

#### Response Example
```json
{
  "status": "ok",
  "timestamp": "2025-11-23T14:00:00.000Z"
}
```

## Integration Guide
To use this API in another system:
1. Ensure the backend server is running (`npm start`).
2. Make HTTP GET requests to the endpoints above.
3. The server supports CORS, so it can be called from frontend applications hosted on different domains.
