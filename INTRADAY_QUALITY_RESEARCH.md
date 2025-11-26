# Intraday Signal Quality Research

## Objective
Enhance the "Intraday" tab signals to be robust and high-quality throughout the trading day, specifically by adapting strategy logic to the unique characteristics of each market session (Open, Lunch, Close).

## Current State Analysis

### Session Definitions (`services/session.js`)
- **Opening Drive (09:30 - 10:00)**: High Volatility, Price Discovery.
- **Morning Trend (10:00 - 12:00)**: Trend Establishment, High Volume.
- **Lunch Chop (12:00 - 13:30)**: Low Volume, Range Bound, False Breakouts.
- **Afternoon (13:30 - 15:00)**: Trend Resumption or Reversal.
- **Power Hour (15:00 - 16:00)**: Institutional Volume, Closing Moves.

### Strategy Gaps

| Strategy | Current Session Logic | Issue |
| :--- | :--- | :--- |
| **Opening Range Breakout** | Boosts score during `MORNING_TREND`. | **Good**. Correctly targets the trend phase. |
| **Golden Setup** | Penalizes `LUNCH_CHOP` (-30 pts). | **Good**. Avoids low-probability chop. |
| **VWAP Reversion** | **None**. | **Risky**. Fading the `OPENING_DRIVE` is dangerous (strong trends). Best for `LUNCH` or `AFTERNOON` mean reversion. |
| **Value Area Play** | **None**. | **Risky**. Breakouts during `LUNCH` are often fake-outs. Needs volume confirmation which is naturally lower at lunch. |

## Proposed Improvements

### 1. VWAP Reversion Refinement
*   **Logic**: Mean reversion works best when volatility is contracting or stable, not expanding.
*   **Change**:
    *   **Penalize `OPENING_DRIVE`**: -30 pts. (Don't fade the open).
    *   **Boost `LUNCH_CHOP`**: +20 pts. (Lunch is often range-bound, perfect for band fades).
    *   **Boost `AFTERNOON`**: +10 pts.

### 2. Value Area Play Refinement
*   **Logic**: Breakouts require volume and momentum.
*   **Change**:
    *   **Penalize `LUNCH_CHOP`**: -30 pts. (Avoid fake breakouts).
    *   **Boost `MORNING_TREND`**: +20 pts.
    *   **Boost `POWER_HOUR`**: +20 pts.

### 3. Dynamic RVOL Thresholds
*   **Logic**: Volume is naturally high at Open/Close and low at Lunch. A fixed RVOL threshold might be too easy to hit at Open and too hard at Lunch.
*   **Change**:
    *   Use `sessionService` to adjust `CONFIG.VOLUME_CONFIRMATION` dynamically?
    *   *Decision*: Keep it simple for now. The session penalties/boosts above should handle the "quality" aspect sufficiently without complex dynamic thresholds.

## Implementation Plan
1.  **Update `strategies/intraday.js`**:
    *   Inject `sessionService` into `scoreVWAPReversion` and `scoreValueAreaPlay`.
    *   Apply the penalties/boosts defined above.
    *   Add a "Session Analysis" criteria to the output for transparency.
2.  **Verify**:
    *   Run `verify_session.js` (or similar) to check scores at different simulated times.
