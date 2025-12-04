#!/bin/sh

# Process supervision: ensure container exits if either process dies
# This triggers Docker's restart policy instead of leaving a zombie container

# Start Node.js in background
node build/index.js &
NODE_PID=$!

# Start nginx in background
nginx &
NGINX_PID=$!

echo "Started Node.js (PID: $NODE_PID) and nginx (PID: $NGINX_PID)"

# Wait for either process to exit
wait -n $NODE_PID $NGINX_PID
EXIT_CODE=$?

# One process died - kill the other and exit
echo "Process exited with code $EXIT_CODE, shutting down container..."
kill $NODE_PID 2>/dev/null
kill $NGINX_PID 2>/dev/null

# Exit to trigger container restart
exit $EXIT_CODE
