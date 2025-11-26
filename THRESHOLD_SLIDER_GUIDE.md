# 🎚️ Adjustable Threshold Feature

## What Changed

Added a **Confidence Threshold Slider** to the Backtest modal that allows you to test the strategy at different strictness levels.

### How to Use

1. Open the Backtest Modal (📊 Backtest button)
2. Adjust the **"Confidence Threshold"** slider
   - **50%**: Very relaxed (many trades, lower quality)
   - **70%**: Relaxed (more trades)
   - **85%**: Default (high quality, fewer trades)
   - **95%**: Very strict (very few trades, highest quality)
3. Watch the percentage update in real-time
4. Click "Run Backtest"

### What It Does

The threshold controls which signals get executed:
- **Higher threshold (85-95%)**: Only takes the absolute best setups → Fewer trades, potentially higher win rate
- **Lower threshold (50-70%)**: Takes more marginal setups → More trades, potentially lower win rate

### Testing Strategy

Try these thresholds to see how the strategy performs:
1. **Start at 85%** (default) - See baseline performance
2. **Lower to 70%** - Get more trade samples
3. **Raise to 90%** - See if being more selective improves win rate
4. **Compare results** - Find the sweet spot for your risk tolerance

### Example Results

Testing SPY over 7 days:
- **85% threshold**: 0 trades (very selective)
- **70% threshold**: 1 trade, 0% win rate, -$89.29 P&L
- **60% threshold**: More trades (test to see!)

The goal is to find the **optimal balance** between:
- **Trade Frequency** (enough opportunities)
- **Win Rate** (profitability per trade)
- **Total P&L** (overall profitability)

### Technical Details

- Range: 50% to 95%
- Step: 5%
- Default: 85%
- Applies to: Entry conditions only (exits remain the same)
