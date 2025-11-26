import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import CONFIG from './config.js';
import logger from './utils/logger.js';

// Import Database (initializes schema and AutoTrader)
import './database.js';

// Import Routes
import scanRoutes from './routes/scan.js';
import automationRoutes from './routes/automation.js';
import journalRoutes from './routes/journal.js';
import portfolioRoutes from './routes/portfolio.js';
import healthRoutes from './routes/health.js';
import backtestRoutes from './routes/backtest.js';

const app = express();
const PORT = process.env.PORT || CONFIG.DEFAULT_PORT;

// ============================================================================
// SECURITY MIDDLEWARE
// ============================================================================

// Helmet - Secure HTTP headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "cdn.tailwindcss.com", "cdn.jsdelivr.net", "cdnjs.cloudflare.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "fonts.googleapis.com"],
            fontSrc: ["'self'", "fonts.gstatic.com"],
            imgSrc: ["'self'", "data:"],
            connectSrc: ["'self'"]
        },
    },
}));

// Rate Limiting - Prevent DoS attacks
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500, // Increased to 500 to allow frontend usage (was 100)
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Apply rate limiting to all API routes
app.use('/api/', limiter);

// CORS - Allow localhost in development, restrict in production
const corsOptions = {
    origin: process.env.NODE_ENV === 'production'
        ? process.env.ALLOWED_ORIGINS?.split(',') || false
        : function (origin, callback) {
            // Allow requests with no origin (like mobile apps or curl requests)
            if (!origin) return callback(null, true);
            // Allow any localhost or 127.0.0.1 on any port
            if (origin.match(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/)) {
                return callback(null, true);
            }
            callback(new Error('Not allowed by CORS'));
        },
    credentials: true
};
app.use(cors(corsOptions));

app.use(express.json());
app.use(express.static('public'));

// ============================================================================
// ROUTES
// ============================================================================

app.use('/api/scan', scanRoutes);
app.use('/api', automationRoutes); // /api/auto, /api/alerts, /api/signals
app.use('/api/journal', journalRoutes);
app.use('/api', portfolioRoutes); // /api/portfolio, /api/trade, /api/watchlist
app.use('/api/backtest', backtestRoutes);
app.use('/api', healthRoutes); // /api/health, /api/health/cache

// ============================================================================
// SWAGGER
// ============================================================================

const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'TradeSignal AI API',
            version: '1.0.0',
            description: 'Algorithmic trading signal engine API with caching and performance optimizations',
        },
        servers: [
            {
                url: `http://localhost:${PORT}`,
                description: 'Local server',
            },
        ],
    },
    apis: ['./routes/*.js'], // Look for annotations in route files
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// ============================================================================
// START SERVER
// ============================================================================

app.listen(PORT, () => {
    logger.info(`\n╔═══════════════════════════════════════════════════════════╗`);
    logger.info(`║           TradeSignal AI - Backend Server                ║`);
    logger.info(`╠═══════════════════════════════════════════════════════════╣`);
    logger.info(`║  Server running at: http://localhost:${PORT}               ║`);
    logger.info(`║  API Endpoint:      GET /api/scan?symbol=SPY             ║`);
    logger.info(`║  API Docs:          http://localhost:${PORT}/api-docs      ║`);
    logger.info(`║  Health Check:      GET /api/health                      ║`);
    logger.info(`║  Cache Stats:       GET /api/health/cache                ║`);
    logger.info(`╚═══════════════════════════════════════════════════════════╝`);
});

