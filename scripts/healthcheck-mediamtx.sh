#!/bin/bash

RTMP_PORT=1935
API_PORT=9997

if ! nc -z localhost $RTMP_PORT 2>/dev/null; then
  echo "Port RTMP $RTMP_PORT non accessible"
  exit 1
fi

if ! curl -sf "http://localhost:$API_PORT/v1/paths/list" > /dev/null 2>&1; then
  echo "API MediaMTX sur port $API_PORT non responsive"
  exit 1
fi

exit 0
