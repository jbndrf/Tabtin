#!/bin/sh

# Process supervision: ensure container exits if either process dies
# This triggers Docker's restart policy instead of leaving a zombie container

# Set default body size limit if not provided
export BODY_SIZE_LIMIT="${BODY_SIZE_LIMIT:-50M}"

# Start Node.js in background
node build/index.js &
NODE_PID=$!

# Start nginx in background (daemon off keeps it in foreground so we can track the PID)
nginx -g 'daemon off;' &
NGINX_PID=$!

echo "Started Node.js (PID: $NODE_PID) and nginx (PID: $NGINX_PID)"

# Wait for either process to exit (POSIX-compatible, no bash-only wait -n)
while kill -0 $NODE_PID 2>/dev/null && kill -0 $NGINX_PID 2>/dev/null; do
  sleep 1
done

# Check which one died
if ! kill -0 $NODE_PID 2>/dev/null; then
  wait $NODE_PID
  EXIT_CODE=$?
else
  wait $NGINX_PID
  EXIT_CODE=$?
fi

# One process died - kill the other and exit
echo "Process exited with code $EXIT_CODE, shutting down container..."
kill $NODE_PID 2>/dev/null
kill $NGINX_PID 2>/dev/null

# Exit to trigger container restart
exit $EXIT_CODE
