# 📊 Backtest Feature - User Guide

## How to Use the Backtest Engine

The backtesting feature allows you to test the "Golden Setup" strategy against historical data to see how it would have performed.

### Accessing the Backtest

1. Open the **Live Signals Dashboard** (`http://localhost:3001/signals.html`)
2. Click the **📊 Backtest** button in the header (purple button)

### Running a Backtest

1. **Enter Symbol**: Type any stock ticker (default: SPY)
2. **Select Days**: Choose how far back to test:
   - 7 Days (recent performance)
   - 14 Days
   - 30 Days (default, recommended)
   - 60 Days (longer history)
3. Click **"Run Backtest"**

### Understanding the Results

The backtest will show you:

- **Total Trades**: How many signals the strategy generated
- **Win Rate**: Percentage of profitable trades
- **Total P&L**: Profit or Loss in dollars (starting with $10,000)
- **Final Balance**: Ending account value
- **Win/Loss Breakdown**: Number of winning vs losing trades

### How It Works

The backtest engine:
1. Fetches 15-minute historical data for the chosen symbol
2. Simulates running the "Golden Setup" strategy on each candlestick
3. Enters positions when Score >= 85%
4. Uses 1% risk management (risks 1% of balance per trade)
5. Exits on Stop Loss or Target Price hit
6. Calculates performance statistics

### Important Notes

- ⚠️ **Backtesting is NOT a guarantee of future performance**
- The test uses simplified assumptions (no slippage, instant fills)
- VIX data is approximated (not synced with exact historical values)
- Use this to validate strategy logic, not to predict profits

### Example Results

If you see:
- **0 trades**: Strategy is very selective (good!) - try a longer period
- **High win rate (>60%)**: Strategy has good edge
- **Low total trades (<5)**: Not enough data, increase days

### Troubleshooting

- **"Not enough historical data"**: Try a different symbol or fewer days
- **Long load time**: 60-day tests take longer to process
- **Error message**: Check that the market is open or try a major index (SPY, QQQ)
