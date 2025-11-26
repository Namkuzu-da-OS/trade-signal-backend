# TradeSignal AI - Quick Start Guide

## 🚀 Launch Options

### Option 1: Spotlight (Recommended)
1. Press `Cmd + Space` to open Spotlight
2. Type "TradeSignal AI"
3. Press Enter

The app will:
- Kill any existing server processes
- Start the TradeSignal AI server
- Open your browser to the dashboard

### Option 2: Direct Script
```bash
cd /Users/caboose/Documents/GitHub/trade-signal-backend
./start-tradesignal.sh
```

### Option 3: Terminal Command
```bash
npm start
```

## 🛑 Stopping the Server

### Option 1: Stop Script
```bash
cd /Users/caboose/Documents/GitHub/trade-signal-backend
./stop-tradesignal.sh
```

### Option 2: In Terminal
Press `Ctrl + C` in the terminal running the server

## 📱 Quick Links

After launching, these URLs will be available:

- **Main Dashboard**: http://localhost:3001/index.html
- **Live Signals**: http://localhost:3001/signals.html
- **Settings**: http://localhost:3001/settings.html
- **API Docs**: http://localhost:3001/api-docs

## 📁 Files Created

- `TradeSignal AI.app` - macOS application (in ~/Applications)
- `start-tradesignal.sh` - Startup script
- `stop-tradesignal.sh` - Stop script
- `launch-tradesignal.scpt` - AppleScript launcher

## 🔧 Troubleshooting

**If Spotlight doesn't find the app:**
1. Open Finder
2. Go to `~/Applications`
3. Drag "TradeSignal AI.app" to your Dock
4. Or double-click to launch

**If port 3001 is busy:**
Run the stop script first:
```bash
./stop-tradesignal.sh
```

**To rebuild Spotlight index:**
```bash
mdimport ~/Applications/TradeSignal\ AI.app
```

## 🎯 First Time Setup

The app is now installed in `~/Applications/TradeSignal AI.app`

You can:
- Launch it from Spotlight (Cmd+Space, type "TradeSignal")
- Drag it to your Dock for quick access
- Right-click and "Open" to bypass Gatekeeper if needed

## 📝 Auto-Start on Login (Optional)

To make TradeSignal AI start automatically when you log in:

1. Open **System Preferences** → **Users & Groups**
2. Click your username
3. Click **Login Items**
4. Click the **+** button
5. Navigate to `~/Applications/TradeSignal AI.app`
6. Click **Add**

Now TradeSignal AI will launch automatically when you start your Mac!
