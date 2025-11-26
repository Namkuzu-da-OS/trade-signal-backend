import sqlite3 from 'sqlite3';
import { AutoTrader } from './automation.js';
import { generateAISentiment } from './services/ai.js';
import logger from './utils/logger.js';

const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) logger.error('Error opening database:', err.message);
    else {
        logger.info('Connected to SQLite database');
        initializeSchema();
    }
});

function initializeSchema() {
    db.run(`CREATE TABLE IF NOT EXISTS watchlists (
        symbol TEXT PRIMARY KEY,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS portfolio (
        symbol TEXT PRIMARY KEY,
        quantity INTEGER,
        avg_price REAL
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS trades(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT,
        side TEXT,
        quantity INTEGER,
        price REAL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        setup_type TEXT,
        stop_loss REAL,
        target_price REAL,
        pnl REAL,
        status TEXT DEFAULT 'OPEN'
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS journal_entries(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trade_id INTEGER,
        note TEXT,
        image_url TEXT,
        emotion TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(trade_id) REFERENCES trades(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT,
        strategy TEXT,
        score REAL,
        signal TEXT,
        ai_analysis TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // NEW TABLE: Live Signals (Multi-Timeframe Aggregation)
    db.run(`CREATE TABLE IF NOT EXISTS live_signals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL UNIQUE,
        final_signal TEXT,
        final_score INTEGER,
        entry_price REAL,
        stop_loss REAL,
        target_price REAL,
        
        signal_15m TEXT,
        score_15m INTEGER,
        top_strategy_15m TEXT,
        
        signal_1h TEXT,
        score_1h INTEGER,
        top_strategy_1h TEXT,
        
        signal_1d TEXT,
        score_1d INTEGER,
        top_strategy_1d TEXT,
        
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
        scan_timestamp DATETIME
    )`);

    // Initialize cash if not exists (using a special symbol 'CASH')
    db.get("SELECT * FROM portfolio WHERE symbol = 'CASH'", (err, row) => {
        if (!row) {
            db.run("INSERT INTO portfolio (symbol, quantity, avg_price) VALUES ('CASH', 100000, 1)");
            logger.info('Initialized portfolio with $100,000 cash');
        }
    });

    // Attempt migrations for existing tables (ignore errors)
    const migrations = [
        "ALTER TABLE trades ADD COLUMN setup_type TEXT",
        "ALTER TABLE trades ADD COLUMN stop_loss REAL",
        "ALTER TABLE trades ADD COLUMN target_price REAL",
        "ALTER TABLE trades ADD COLUMN pnl REAL",
        "ALTER TABLE trades ADD COLUMN status TEXT DEFAULT 'OPEN'"
    ];
    migrations.forEach(query => db.run(query, () => { }));

    // ============================================================================
    // DATABASE INDEXES - Performance Optimization
    // ============================================================================
    logger.info('Creating database indexes for performance...');

    const indexes = [
        "CREATE INDEX IF NOT EXISTS idx_live_signals_symbol ON live_signals(symbol)",
        "CREATE INDEX IF NOT EXISTS idx_live_signals_updated ON live_signals(last_updated DESC)",
        "CREATE INDEX IF NOT EXISTS idx_alerts_timestamp ON alerts(timestamp DESC)",
        "CREATE INDEX IF NOT EXISTS idx_alerts_symbol ON alerts(symbol)",
        "CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status)",
        "CREATE INDEX IF NOT EXISTS idx_trades_symbol_status ON trades(symbol, status)",
        "CREATE INDEX IF NOT EXISTS idx_trades_timestamp ON trades(timestamp DESC)",
        "CREATE INDEX IF NOT EXISTS idx_watchlists_symbol ON watchlists(symbol)"
    ];

    let indexCount = 0;
    indexes.forEach(query => {
        db.run(query, (err) => {
            if (!err) indexCount++;
            if (indexCount === indexes.length) {
                logger.success(`Database initialized with ${indexes.length} indexes`);
            }
        });
    });

    // Initialize AutoTrader with DB and AI Generator
    global.autoTrader = new AutoTrader(db, generateAISentiment);
    logger.info('AutoTrader initialized');
}

export default db;

