# 🐛 Bug Review - Signal Upgrades

## Bugs Found & Fixed

### Bug #1: Bollinger Band Property Access ✅ FIXED
**File**: `strategies/intraday.js` → `scoreMeanReversion()`

**Issue**:
```javascript
// WRONG
const { bbUpper, bbLower, bbMiddle } = indicators;
```

**Problem**: `calculateIndicators()` returns `bb` as an object: `{ upper, lower, middle }`, not as separate properties.

**Fix**:
```javascript
// CORRECT
const { bb } = indicators;
const piercedLower = currentPrice < bb.lower;
const piercedUpper = currentPrice > bb.upper;
const target = bb.middle;
```

**Status**: ✅ Fixed
**Impact**: High - Would have caused runtime error (undefined values)

---

### Bug #2: Duplicate Imports ✅ FIXED
**File**: `routes/scan.js`

**Issue**:
```javascript
// Lines 4-10
import { scoreVWAPBounce, scoreGoldenSetup, scoreVIXFlow } from '../strategies/intraday.js';

// Lines 23-27 (DUPLICATE)
import { scoreVWAPBounce, scoreGoldenSetup, scoreVIXFlow } from '../strategies/intraday.js';
```

**Fix**: Removed duplicate import block (lines 23-27)

**Status**: ✅ Fixed
**Impact**: Low - Would cause linter warnings but wouldn't break functionality

---

### Bug #3: Missing Imports ✅ FIXED
**File**: `routes/scan.js`

**Issue**: Missing `calculateVolumeProfile` and `calculateGEX` imports

**Evidence**:
```javascript
// Line 164 uses them
const vp = calculateVolumeProfile(historical, 50);
```

**Fix**:
```javascript
import {
    // ... other imports
    calculateVolumeProfile,
    calculateGEX
} from '../strategies.js';
```

**Status**: ✅ Fixed
**Impact**: High - Would cause runtime error (undefined function)

---

### Bug #4: Missing CONFIG Import ✅ FIXED
**File**: `routes/scan.js`

**Issue**: File uses `CONFIG` but didn't import it

**Fix**:
```javascript
import CONFIG from '../config.js';
```

**Status**: ✅ Fixed
**Impact**: Medium - Would cause error if CONFIG is referenced anywhere

---

## Potential Issues (Not Bugs, but Worth Noting)

### 1. `isLunchChop()` Time Zone Assumption
**File**: `strategies/intraday.js`

**Code**:
```javascript
const etTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
```

**Note**: This assumes the server can convert to ET timezone. Should work on most systems, but could fail on some restricted environments.

**Recommendation**: Consider using a library like `moment-timezone` for more reliability.

---

### 2. Mean Reversion May Not Trigger
**File**: `strategies/intraday.js` → `scoreMeanReversion()`

**Observation**: Requires BOTH conditions:
- Price pierce BB
- RSI extreme (<30 or >70)

This is quite strict and may rarely trigger. Consider making it `OR` instead of `AND` for more signals.

**Current**:
```javascript
if (piercedLower && isOversold) signal = 'SCALP BUY';
```

**Alternative**:
```javascript
if (piercedLower || isOversold) signal = 'SCALP BUY';
```

---

### 3. Swing Strategy Untested on Intraday Data
**File**: `strategies/swing.js`

**Note**: `scoreSwingPullback` is added to daily signals, but the logic assumes daily timeframe data (SMA20, SMA50, SMA200).

If called on 15m data, SMAs represent 20 candles (5 hours), not 20 days. This might produce unexpected results.

**Recommendation**: Add a check or only call this strategy when interval === '1d'.

---

## Testing Recommendations

1. **Test Mean Reversion**:
   - Run a scan on a volatile day
   - Verify BB values are correctly accessed
   - Check if signals are generated (might be too strict)

2. **Test Time Filter**:
   - Run between 12:00-1:30 PM ET
   - Verify Golden Setup score is penalized

3. **Test Regime Detection**:
   - Run on trending day (SPY up 1%+)
   - Run on choppy day (VIX > 25)
   - Verify correct regime classification

4. **Test Swing Strategy**:
   - Run with `interval=1d`
   - Verify pullback logic works
   - Check if SMA calculations are correct

---

## Summary

✅ **4 bugs fixed**:
1. Bollinger Band property access
2. Duplicate imports
3. Missing calculateVolumeProfile/calculateGEX imports
4. Missing CONFIG import

⚠️ **3 areas to monitor**:
1. Time zone handling
2. Mean reversion strictness
3. Swing strategy on intraday data

The code should now run without errors. All critical bugs have been addressed.
