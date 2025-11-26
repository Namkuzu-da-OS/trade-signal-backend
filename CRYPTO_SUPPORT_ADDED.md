# ✅ Crypto Support Added

## The Issue
You couldn't add `BTC-USD` or `SOL-USD` to the watchlist because:
1.  **Validation Logic:** The regex was too strict (`^[A-Z]{1,5}$`), blocking symbols with hyphens or longer than 5 characters.
2.  **Database Error:** There was a bug in `routes/portfolio.js` where adding *any* symbol would throw an error (`Cannot read properties of undefined (reading 'lastID')`), even though the symbol was secretly added in the background.

## The Fix
1.  **Updated Validation:**
    - Modified `middleware/validation.js` and `routes/scan.js`.
    - New Regex: `^[A-Z0-9-]{1,12}(\.[A-Z]{1,2})?$`
    - Now supports: Hyphens (`-`), Numbers (`0-9`), and length up to 12.
    - Examples supported: `BTC-USD`, `SOL-USD`, `BRK.B`, `1000SHIB`.

2.  **Fixed Database Route:**
    - Rewrote the `dbRun` wrapper in `routes/portfolio.js` to correctly return the operation result (`lastID`).
    - Adding to watchlist now returns success `200 OK` instead of `500 Error`.

## Verification
I verified the fix by:
1.  Successfully adding `BTC-USD` and `SOL-USD` to the watchlist via API.
2.  Successfully running a scan on `BTC-USD`.

## How to Use
**Hard refresh your browser** (`Cmd+Shift+R`) and you can now:
- Add `BTC-USD`, `SOL-USD`, `ETH-USD` to your watchlist.
- Scan them just like any other stock!
