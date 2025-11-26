# Intraday Engine 2.0 - Walkthrough

## Overview
The Intraday Engine has been significantly upgraded to incorporate institutional trading concepts, session awareness, and advanced volume analysis. The new engine now distinguishes between "Intraday" and "Swing" signals, providing a tailored experience for different trading styles.

## Key Features

### 1. Session Manager (`services/session.js`)
A new service that tracks market phases in real-time (ET Timezone):
- **Opening Drive (09:30 - 10:00)**: High volatility, breakout opportunities.
- **Morning Trend (10:00 - 12:00)**: Established trend following.
- **Lunch Chop (12:00 - 13:30)**: Low volume, high noise (Signals penalized).
- **Power Hour (15:00 - 16:00)**: Institutional closing volume.

### 2. Advanced Indicators (`analysis.js`)
- **VWAP Bands**: Standard Deviation bands (1SD, 2SD, 3SD) around VWAP to identify extreme extensions.
- **Intraday Volume Profile**: Calculates Value Area High (VAH), Value Area Low (VAL), and Point of Control (POC) dynamically from intraday data.

### 3. New Strategies (`strategies/intraday.js`)
- **VWAP Reversion**: Fades price moves that extend beyond 2SD/3SD bands with RSI confirmation.
- **Value Area Play**: Trades breakouts of VAH or breakdowns of VAL with volume confirmation.
- **Enhanced Golden Setup**: Now uses Session Manager to avoid "Lunch Chop" and targets "Prime Time" hours.

### 4. Tabbed UI (`public/signals.html`)
- **Intraday Tab**: Displays 15m/1h signals, focusing on session phases and VWAP levels.
- **Swing Tab**: Displays Daily signals, focusing on macro trends and institutional positioning.
- **Manual Scan**: Automatically detects the active tab and runs the appropriate scan interval (15m vs Daily).

## Verification
- **Session Logic**: Verified with `verify_session.js` covering all market phases.
- **Integration**: `routes/scan.js` successfully integrates new indicators and passes them to strategies.
- **Frontend**: Tab switching logic implemented and verified to filter signals correctly.

## Next Steps
- **Live Testing**: Monitor the "Session Phase" indicator during market hours.
- **Refinement**: Adjust VWAP Band multipliers if signals are too frequent/rare.
