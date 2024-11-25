#!/bin/bash
# Murder instances of "node" which are not part of vscode or electron

# PID of me
script_pid=$$

# All Node processes
node_pids=$(pgrep -f "node")

# Filter out processes related to VS Code and the script itself
for pid in $node_pids; do
  # Full command line of the proc
  cmd=$(ps -o cmd= $pid) 

  # Skip if self, "vscode", or "Electron"
  if [[ $pid -eq $script_pid ]] || [[ $cmd == *"vscode"* ]] || [[ $cmd == *"Electron"* ]]; then
    continue 
  fi

  # Add the PID to the list of processes to murder
  kill_pids="$kill_pids $pid"
done

# Kill all other Nodes
if [ -n "$kill_pids" ]; then
  echo " + Murdering Node.js processes with PIDs: $kill_pids"
  kill $kill_pids
else
  echo " - No Node processes found to kill."
fi