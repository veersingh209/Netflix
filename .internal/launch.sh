#!/bin/bash

# Netflix Movie Library Explorer - Quick Launch Script
# This script starts both the FastAPI backend and the Vite frontend.

# Set explicit path for macOS background execution
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:$PATH"

# Get the absolute path to this script's directory
PROJECT_ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
echo "🚀 Launch script triggered at $(date)" > "$PROJECT_ROOT/launch_debug.log"
cd "$PROJECT_ROOT"

# Colors for better visibility
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to update status for the splash screen
update_status() {
    echo "{\"status\": \"$1\"}" > "$PROJECT_ROOT/status.json"
}

# 0. Start Splash Screen server and open it
update_status "Initializing services..."
# Start a simple HTTP server for the splash screen on port 9000
cd "$PROJECT_ROOT"
python3 -m http.server 9000 > splash_server.log 2>&1 &
SPLASH_PID=$!
sleep 1
# Open splash screen via HTTP
open "http://localhost:9000/splash.html"

# 0. Cleanup existing processes on ports 8002 and 7173
update_status "Cleaning up ports..."
echo -e "${BLUE}🧹 Cleaning up existing processes on ports 8002 and 7173...${NC}"
lsof -ti:8002,7173 | xargs kill -9 2>/dev/null || true

# 1. Start Backend
echo -e "${GREEN}📡 Starting Backend (FastAPI) on port 8002...${NC}"
cd backend

# Ensure .env exists for encryption key
if [ ! -f ".env" ]; then
    update_status "Initializing security configuration..."
    echo "ENCRYPTION_KEY=$(python3 -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())')" > .env
    echo -e "${BLUE}🔑 Generated new encryption key in backend/.env${NC}"
fi

# Robust venv check - check if uvicorn is actually importable
VENV_PYTHON="./venv/bin/python3"
if [ ! -f "$VENV_PYTHON" ] || ! "$VENV_PYTHON" -c "import uvicorn" 2>/dev/null; then
    update_status "Repairing backend environment (this may take a minute)..."
    echo -e "${BLUE}📦 Virtual environment broken, missing, or incomplete. Rebuilding...${NC}"
    rm -rf venv
    python3 -m venv venv
    source venv/bin/activate
    python3 -m pip install --upgrade pip
    python3 -m pip install -r requirements.txt
else
    source venv/bin/activate
fi

update_status "Starting backend server..."
# Run uvicorn in background using virtual environment Python directly
./venv/bin/python3 -m uvicorn app.main:app --port 8002 > backend.log 2>&1 &
BACKEND_PID=$!

# Wait a few seconds to check if it crashed immediately
sleep 2
if ! kill -0 $BACKEND_PID 2>/dev/null; then
    echo -e "${RED}❌ Backend failed to start. Check backend/backend.log for details:${NC}"
    cat backend.log
    exit 1
fi
cd ..

# 2. Start Frontend
echo -e "${GREEN}🎨 Starting Frontend (Vite) on port 7173...${NC}"
cd frontend
# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    update_status "Installing frontend dependencies..."
    echo -e "${BLUE}📦 Installing frontend dependencies...${NC}"
    npm install
fi

update_status "Starting frontend server..."
# Run vite in background
npm run dev &
FRONTEND_PID=$!
cd ..

# 3. Wait for services to be ready and then open browser
update_status "Finishing up..."
# 4. Wait for services to be responsive
update_status "Waiting for services..."
echo -e "${YELLOW}⏳ Waiting for backend and frontend to be ready...${NC}"
echo -e "${BLUE}💡 If this is your first time, check your browser for the Google Login page.${NC}"

# Wait for Frontend
while ! curl -s http://localhost:7173 > /dev/null; do
    sleep 1
done

# Wait for Backend (it might take longer due to OAuth/initialization)
# We don't block the script here so the user can see the terminal instructions
# but we wait before declaring full success.
(
    while ! curl -s http://localhost:8002/health > /dev/null; do
        sleep 1
    done
    echo -e "\n${GREEN}✅ Backend is now responsive!${NC}"
) &

echo -e "\n${GREEN}✨ Application is starting!${NC}"
echo -e "${BLUE}🔗 Backend:  http://localhost:8002${NC}"
echo -e "${BLUE}🔗 Frontend: http://localhost:7173${NC}"

# Open the browser via splash screen only (already handled in step 0)
# The splash screen will redirect to http://localhost:7173 when ready.
# open "http://localhost:7173"

echo -e "${BLUE}💡 Press Ctrl+C to stop all services.${NC}"

# Set up signal handling for graceful shutdown
cleanup() {
    echo -e "${YELLOW}🛑 Received shutdown signal. Cleaning up...${NC}"
    # Kill all background processes we started
    jobs -p | xargs kill 2>/dev/null || true
    lsof -ti:8002,7173,9000 | xargs kill -9 2>/dev/null || true
    exit 0
}

# Trap signals for cleanup
trap cleanup SIGINT SIGTERM

# Wait for background processes
wait
