# Phase 7A: Intraday-Specific Backtesting Engine

## Objective
Build a session-aware backtesting system that evaluates intraday strategies across different market phases to identify the highest-probability setups.

## Key Features

### 1. Session-Aware Backtesting
- Run each strategy on historical 15m/1h data
- Track which **session phase** each trade occurred in
- Calculate performance metrics by session

### 2. Performance Metrics
- **Win Rate**: % of winning trades
- **Profit Factor**: Gross profit / Gross loss
- **Expectancy**: (Win% × Avg Win) - (Loss% × Avg Loss)
- **Max Drawdown**: Largest peak-to-trough decline
- **Sharpe Ratio**: Risk-adjusted returns
- **Average Trade Duration**: How long to hold

### 3. Strategy × Session Matrix
Generate a heatmap showing:
```
Strategy          | OPENING_DRIVE | MORNING_TREND | LUNCH_CHOP | POWER_HOUR
------------------|---------------|---------------|------------|------------
Order Block       | 75% (8/12)   | 60% (6/10)    | 40% (2/5)  | 80% (4/5)
VWAP Reversion    | 45% (5/11)   | 70% (7/10)    | 65% (13/20)| 50% (3/6)
Golden Setup      | 80% (12/15)  | 70% (14/20)   | 30% (3/10) | 90% (9/10)
```

### 4. Day-of-Week Analysis
- Monday vs Friday dynamics
- Best days for each strategy

## Technical Implementation

### Database Schema
```sql
CREATE TABLE backtest_results (
    id INTEGER PRIMARY KEY,
    strategy_id TEXT,
    symbol TEXT,
    interval TEXT,
    entry_date TEXT,
    entry_time TEXT,
    entry_price REAL,
    exit_date TEXT,
    exit_time TEXT,
    exit_price REAL,
    session_phase TEXT,
    day_of_week TEXT,
    score INTEGER,
    signal TEXT,
    pnl REAL,
    pnl_percent REAL,
    win BOOLEAN,
    hold_minutes INTEGER,
    exit_reason TEXT
);

CREATE TABLE backtest_summary (
    id INTEGER PRIMARY KEY,
    run_id TEXT,
    strategy_id TEXT,
    session_phase TEXT,
    total_trades INTEGER,
    wins INTEGER,
    losses INTEGER,
    win_rate REAL,
    profit_factor REAL,
    expectancy REAL,
    avg_win REAL,
    avg_loss REAL,
    created_at TEXT
);
```

### New Files to Create

#### 1. `services/backtester.js`
Core backtesting engine:
- Fetch historical data (15m/1h)
- Run strategies on each candle
- Simulate entries/exits
- Track session phase
- Calculate P&L

#### 2. `routes/backtest.js` (enhance existing)
Add new endpoint: `POST /api/backtest/intraday`
- Input: symbol, days, strategies to test
- Output: Performance summary + trade log

#### 3. `public/backtest.html` (new page)
Interactive backtest results viewer:
- Session performance heatmap
- Equity curve chart
- Trade log table
- Filter by strategy/session/day

## API Endpoints

### Run Backtest
```javascript
POST /api/backtest/intraday
Body: {
    symbol: "SPY",
    days: 30,
    interval: "15m",
    strategies: ["order-block", "vwap-reversion", "golden-setup"],
    minScore: 60
}

Response: {
    run_id: "bt_123",
    summary: {
        total_trades: 45,
        wins: 32,
        win_rate: 0.71,
        profit_factor: 2.3,
        expectancy: 0.85
    },
    by_session: { ... },
    by_strategy: { ... }
}
```

### Get Results
```javascript
GET /api/backtest/results/:run_id
```

## Implementation Steps

### Phase 7A-1: Core Engine
- [x] Research completed
- [ ] Create `services/backtester.js`
- [ ] Add database schema
- [ ] Implement trade simulation logic
- [ ] Add session tracking

### Phase 7A-2: API Integration
- [ ] Update `routes/backtest.js`
- [ ] Add `/api/backtest/intraday` endpoint
- [ ] Add results retrieval endpoint

### Phase 7A-3: Frontend
- [ ] Create `public/backtest.html`
- [ ] Build session heatmap visualization
- [ ] Add equity curve chart
- [ ] Create trade log viewer

### Phase 7A-4: Analysis Tools
- [ ] Export to CSV
- [ ] Generate PDF reports
- [ ] Email results (optional)

## Expected Outcomes

After running 30-day backtests on SPY:
1. **Know which strategies work best in which sessions**
   - Example: "Order Blocks have 80% win rate in OPENING_DRIVE"
   
2. **Identify best trading hours**
   - Example: "Avoid all trades during LUNCH_CHOP (11:30-13:30)"
   
3. **Optimize score thresholds**
   - Example: "Only take trades with score > 70 during POWER_HOUR"
   
4. **Build confidence**
   - See real historical performance before risking capital

## Risk Management Integration

Once we have backtest data, we can:
- Auto-calculate position sizes based on historical expectancy
- Set dynamic stop losses (1.5× average loss)
- Adjust targets based on session (tighter in LUNCH_CHOP)
- Build a "confidence score" that incorporates backtest win rate

## Next: Phase 7B Preview

After we have backtest results, Phase 7B will use this data to:
- Auto-reject low-probability setups
- Boost signals that have proven high win rates
- Create "High Conviction" filters based on multi-factor confluence
