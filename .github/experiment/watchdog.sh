#!/bin/bash
# EXPERIMENT — not for merge. Records the app's CPU once a second, and takes
# a stack sample when it has stayed above 85% for 5 s, and again at 30 s.
out="$1"
mkdir -p "$out/samples"
hot=0
while true; do
  pid="$(pgrep -x ns-marks-the-spot | head -1)"
  if [ -n "$pid" ]; then
    cpu="$(ps -o %cpu= -p "$pid" | tr -d ' ')"
    echo "$(date -u +%H:%M:%S) $pid ${cpu:-?}" >> "$out/cpu.log"
    if [ -n "$cpu" ] && [ "${cpu%.*}" -ge 85 ]; then
      hot=$((hot + 1))
    else
      hot=0
    fi
    if [ "$hot" -eq 5 ] || [ "$hot" -eq 30 ]; then
      sample "$pid" 3 -file "$out/samples/$(date -u +%H%M%S)-$pid.txt" > /dev/null 2>&1 &
    fi
  fi
  sleep 1
done
