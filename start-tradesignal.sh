#!/bin/bash

# TradeSignal AI Startup Script
# This script starts the server and opens the dashboard

# Color codes for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║           TradeSignal AI - Starting Server                ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════╝${NC}"

# Navigate to project directory
PROJECT_DIR="/Users/caboose/Documents/GitHub/trade-signal-backend"
cd "$PROJECT_DIR" || exit 1

# Kill any existing processes on port 3001
echo -e "${BLUE}Checking for existing processes on port 3001...${NC}"
EXISTING_PID=$(lsof -ti:3001)
if [ ! -z "$EXISTING_PID" ]; then
    echo -e "${RED}Killing existing process $EXISTING_PID${NC}"
    kill -9 $EXISTING_PID
    sleep 1
fi

# Start the server
echo -e "${GREEN}Starting TradeSignal AI server...${NC}"
npm start &

# Wait for server to start
echo -e "${BLUE}Waiting for server to start...${NC}"
sleep 5

# Check if server is running
if lsof -Pi :3001 -sTCP:LISTEN -t >/dev/null ; then
    echo -e "${GREEN}✓ Server is running on http://localhost:3001${NC}"
    
    # Open browser to dashboard
    echo -e "${BLUE}Opening dashboard in browser...${NC}"
    open "http://localhost:3001/index.html"
    
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║          TradeSignal AI is ready!                         ║${NC}"
    echo -e "${GREEN}║  Dashboard: http://localhost:3001/index.html             ║${NC}"
    echo -e "${GREEN}║  Signals:   http://localhost:3001/signals.html           ║${NC}"
    echo -e "${GREEN}║  Settings:  http://localhost:3001/settings.html          ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
    
    # Keep terminal open
    echo ""
    echo "Press Ctrl+C to stop the server"
    wait
else
    echo -e "${RED}✗ Failed to start server${NC}"
    exit 1
fi
