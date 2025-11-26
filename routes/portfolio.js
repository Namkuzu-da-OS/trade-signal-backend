import express from 'express';
import db from '../database.js';
import { promisify } from 'util';

const router = express.Router();

// Promisify database methods for better async handling
// Custom promise wrapper for db.run to access 'this' (lastID, changes)
const dbRun = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
};

const dbGet = promisify(db.get.bind(db));
const dbAll = promisify(db.all.bind(db));

// ============================================================================
// WATCHLIST
// ============================================================================

router.get('/watchlist', async (req, res) => {
    try {
        const rows = await dbAll("SELECT * FROM watchlists ORDER BY added_at DESC");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/watchlist', async (req, res) => {
    const { symbol } = req.body;
    if (!symbol) return res.status(400).json({ error: 'Symbol is required' });

    try {
        const result = await dbRun("INSERT OR IGNORE INTO watchlists (symbol) VALUES (?)", [symbol.toUpperCase()]);
        res.json({ message: 'Added to watchlist', id: result.lastID });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/watchlist/:symbol', async (req, res) => {
    const symbol = req.params.symbol.toUpperCase();
    try {
        const result = await dbRun("DELETE FROM watchlists WHERE symbol = ?", [symbol]);
        res.json({ message: 'Removed from watchlist', changes: result.changes });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================================================
// PORTFOLIO & TRADING
// ============================================================================

router.get('/portfolio', async (req, res) => {
    try {
        const rows = await dbAll("SELECT * FROM portfolio");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/trade', async (req, res) => {
    const { symbol, side, quantity, price, setup_type, stop_loss, target_price } = req.body;

    // Validate required fields
    if (!symbol || !side || !quantity || !price) {
        return res.status(400).json({ error: 'Missing trade parameters' });
    }

    // Validate side
    if (side !== 'BUY' && side !== 'SELL') {
        return res.status(400).json({ error: 'Side must be BUY or SELL' });
    }

    const cost = quantity * price;

    try {
        // Use serialize to ensure all operations happen in order
        await new Promise((resolve, reject) => {
            db.serialize(async () => {
                try {
                    await dbRun("BEGIN TRANSACTION");

                    // Check Cash
                    const cashRow = await dbGet("SELECT quantity FROM portfolio WHERE symbol = 'CASH'");
                    const cash = cashRow ? cashRow.quantity : 0;

                    if (side === 'BUY') {
                        if (cash < cost) {
                            await dbRun("ROLLBACK");
                            return reject(new Error('Insufficient funds'));
                        }

                        // Deduct Cash
                        await dbRun("UPDATE portfolio SET quantity = quantity - ? WHERE symbol = 'CASH'", [cost]);

                        // Update Position
                        const existingPosition = await dbGet("SELECT * FROM portfolio WHERE symbol = ?", [symbol]);

                        if (existingPosition) {
                            const newQty = existingPosition.quantity + quantity;
                            const newAvg = ((existingPosition.quantity * existingPosition.avg_price) + cost) / newQty;
                            await dbRun("UPDATE portfolio SET quantity = ?, avg_price = ? WHERE symbol = ?", [newQty, newAvg, symbol]);
                        } else {
                            await dbRun("INSERT INTO portfolio (symbol, quantity, avg_price) VALUES (?, ?, ?)", [symbol, quantity, price]);
                        }

                    } else if (side === 'SELL') {
                        // Check Position
                        const existingPosition = await dbGet("SELECT * FROM portfolio WHERE symbol = ?", [symbol]);

                        if (!existingPosition || existingPosition.quantity < quantity) {
                            await dbRun("ROLLBACK");
                            return reject(new Error('Insufficient position'));
                        }

                        // Add Cash
                        await dbRun("UPDATE portfolio SET quantity = quantity + ? WHERE symbol = 'CASH'", [cost]);

                        // Update Position
                        const newQty = existingPosition.quantity - quantity;
                        if (newQty === 0) {
                            await dbRun("DELETE FROM portfolio WHERE symbol = ?", [symbol]);
                        } else {
                            await dbRun("UPDATE portfolio SET quantity = ? WHERE symbol = ?", [newQty, symbol]);
                        }
                    }

                    // Record Trade
                    const result = await dbRun(
                        `INSERT INTO trades (symbol, side, quantity, price, setup_type, stop_loss, target_price, pnl, status) 
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [symbol, side, quantity, price, setup_type, stop_loss, target_price, 0, 'OPEN']
                    );

                    await dbRun("COMMIT");
                    resolve(result);

                } catch (err) {
                    await dbRun("ROLLBACK").catch(() => { }); // Ensure rollback even if it fails
                    reject(err);
                }
            });
        }).then((result) => {
            res.json({ message: 'Trade executed', id: result.lastID });
        }).catch((err) => {
            res.status(400).json({ error: err.message });
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
