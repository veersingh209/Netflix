#!/bin/bash

echo "🛑 Stopping Netflix Movie Library Explorer..."

# Kill processes on port 8002 (Backend) and 7173 (Frontend)
lsof -ti:8002,7173 | xargs kill -9 2>/dev/null || true

echo "✅ All services stopped."
sleep 1
