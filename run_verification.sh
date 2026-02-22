#!/bin/bash
set -e

# Kill existing server
kill $(lsof -t -i :5174) 2>/dev/null || true

# Build
echo "Building..."
npm run build

# Start server in background
echo "Starting server..."
npm start > server.log 2>&1 &
SERVER_PID=$!

# Wait for server to be ready
echo "Waiting for server to be ready..."
timeout 30 bash -c 'until curl -s http://localhost:5174 > /dev/null; do sleep 1; done'

# Install Playwright browsers (this might take time, but is necessary)
echo "Installing Playwright browsers..."
npx playwright install chromium

# Run test
echo "Running Playwright test..."
npx playwright test verify_3d.spec.ts

# Kill server
kill $SERVER_PID
echo "Done."
