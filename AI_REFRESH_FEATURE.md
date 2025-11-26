# 🔄 AI Re-Analysis Feature

## What Changed

Added a **"Refresh Analysis"** button to the AI Insights section in the signal details modal.

### Behavior

1. **First Run**: You see a "Generate AI Analysis" button.
2. **After Generation**: You see the AI insights.
3. **Re-Run**: Below the insights, there is now a "↻ Refresh Analysis" button.
4. **Action**: Clicking it re-runs the Gemini analysis with the *latest* market data and overwrites the previous insight.

### Why This Is Useful

- **Market Conditions Change**: An analysis from 2 hours ago might be outdated.
- **New Signal Data**: If the signal strength or indicators change, you want a fresh opinion.
- **Iterative Analysis**: You can regenerate if you're not satisfied with the first response.

## Technical Implementation

- Modified `public/signals.html`
- Updated `showDetails()` to conditionally render the refresh button.
- Updated event listeners to attach to the new button.
- Reused existing `analyzeSignal()` logic which handles the API call and UI refresh.
