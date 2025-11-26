import express from 'express';
import db from '../database.js';

const router = express.Router();

router.post('/', (req, res) => {
    const { trade_id, note, image_url, emotion } = req.body;
    db.run(
        "INSERT INTO journal_entries (trade_id, note, image_url, emotion) VALUES (?, ?, ?, ?)",
        [trade_id, note, image_url, emotion],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID, message: 'Entry added' });
        }
    );
});

router.get('/', (req, res) => {
    db.all("SELECT * FROM journal_entries ORDER BY timestamp DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

export default router;
