# ✅ Intraday Button Fixed

## The Issue
The "Intraday" button was not responding to clicks. This was likely due to the inline `onclick` handler being blocked or failing to execute properly within the browser's security context.

## The Fix
I replaced the inline `onclick="switchMode(...)"` handlers with robust JavaScript event listeners.

**Changes made in `public/index.html`:**
1.  **Removed** `onclick` attributes from the Swing and Intraday buttons.
2.  **Added** IDs `btnSwing` and `btnIntraday` to the buttons.
3.  **Added** an event listener block at the end of the script:
    ```javascript
    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('.mode-tab').forEach(btn => {
            btn.addEventListener('click', (e) => {
                // ... logic to switch mode ...
            });
        });
        // ...
    });
    ```

## Verification
I verified the fix with a browser test:
1.  Clicked the "Intraday" button.
2.  **Result:**
    - The button became active.
    - The timeframe options correctly switched to **15M** and **1H**.

## How to Apply
**Hard refresh your browser** (`Cmd+Shift+R` or `Ctrl+Shift+R`) and the Intraday button will work perfectly!
