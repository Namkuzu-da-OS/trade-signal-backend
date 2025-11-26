# 🔬 Intraday Engine 2.0 - Research & Architecture

## 1. Core Philosophy: Institutional Logic
Retail traders chase price; institutions defend value. The new engine will focus on **Value**, **Volume**, and **Time**.

### Key Concepts
- **VWAP Bands**: Institutions use VWAP Standard Deviations to gauge "cheap" vs "expensive".
  - **Mean**: VWAP (Fair Value)
  - **1SD**: Normal Noise
  - **2SD**: Extended (Profit Taking)
  - **3SD**: Extreme (Reversion Likely)
- **Volume Profile Zones**:
  - **POC (Point of Control)**: Highest volume price level (Magnet).
  - **VAH (Value Area High)**: Resistance / Breakout level.
  - **VAL (Value Area Low)**: Support / Breakdown level.
- **Time Segmentation**:
  - **Opening Drive (9:30-10:00)**: Discovery phase.
  - **Morning Trend (10:00-11:30)**: Trend establishment.
  - **Lunch Chop (11:30-13:30)**: Low volume, fakeouts.
  - **Power Hour (15:00-16:00)**: Closing positioning.

## 2. Technical Architecture

### A. Session Manager (`services/session.js`)
Responsible for identifying the current market phase and extracting session-specific data.
- `getSessionPhase(timestamp)`: Returns 'OPEN', 'MORNING', 'LUNCH', 'AFTERNOON', 'CLOSE'.
- `getOpeningRange(candles)`: Returns OR High/Low.
- `getYesterdayValue(candles)`: Returns yesterday's VAH/VAL/POC.

### B. Enhanced Indicators (`analysis.js`)
Add new calculations:
- `calculateVWAPBands(candles)`: Returns VWAP, Upper1/2/3, Lower1/2/3.
- `calculateIntradayProfile(candles)`: Returns VAH, VAL, POC for the current day.

### C. New Strategies (`strategies/intraday.js`)
1.  **VWAP Reversion**:
    - **Short**: Price > VWAP + 2SD + Bearish Reversal Candle.
    - **Long**: Price < VWAP - 2SD + Bullish Reversal Candle.
2.  **Value Area Play**:
    - **Breakout**: Price closes above VAH + Volume Spike.
    - **Rejection**: Price touches VAH/VAL and reverses.
3.  **Opening Drive**:
    - Refined ORB logic using exact 9:30-10:00 range.

## 3. Data Requirements
- **15m Data**: Essential for profile and VWAP calculations.
- **Volume**: Must be accurate (yahoo-finance2 is usually okay for major ETFs).
- **Timestamps**: Need to handle timezone conversion (ET) robustly.

## 4. Implementation Plan
1.  **Create `services/session.js`**: Handle time and session logic.
2.  **Update `analysis.js`**: Add VWAP Bands and Profile calculations.
3.  **Refactor `strategies/intraday.js`**:
    - Import Session Manager.
    - Implement new strategies.
    - Deprecate old/fragile ORB logic.
4.  **Update `routes/scan.js`**: Pass new data to strategies.
