import yahooFinance from 'yahoo-finance2';

async function testOptions() {
    try {
        console.log("Fetching options for SPY...");
        const queryOptions = { lang: 'en-US', formatted: false, region: 'US' };
        const result = await yahooFinance.options('SPY', queryOptions);

        if (result && result.options && result.options.length > 0) {
            const chain = result.options[0];
            console.log(`Found chain for date: ${chain.expirationDate}`);
            console.log(`Calls: ${chain.calls.length}`);
            console.log(`Puts: ${chain.puts.length}`);

            if (chain.calls.length > 0) {
                console.log("Sample Call:", chain.calls[0]);
            }
            console.log("SUCCESS: Options data is available.");
        } else {
            console.log("No options data found.");
        }
    } catch (error) {
        console.error("Error fetching options:", error);
    }
}

testOptions();
