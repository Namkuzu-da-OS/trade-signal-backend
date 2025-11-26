#!/usr/bin/osascript

# AppleScript to create a Terminal window and run the startup script

tell application "Terminal"
    activate
    do script "cd /Users/caboose/Documents/GitHub/trade-signal-backend && ./start-tradesignal.sh"
end tell
