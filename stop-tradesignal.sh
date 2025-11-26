#!/bin/bash

# TradeSignal AI Stop Script
# This script stops the TradeSignal AI server

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${RED}Stopping TradeSignal AI...${NC}"

# Find and kill all processes on port 3001
PID=$(lsof -ti:3001)
if [ ! -z "$PID" ]; then
    kill -9 $PID
    echo -e "${GREEN}✓ Server stopped (PID: $PID)${NC}"
else
    echo "No server running on port 3001"
fi
