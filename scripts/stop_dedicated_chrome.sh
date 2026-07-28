#!/bin/bash

set -u
set -o pipefail

readonly debug_port="9222"
readonly chrome_executable="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
readonly chrome_profile="${HOME}/.chrome-agent-debug"
readonly agent_browser="${FRONTEND_BROWSER_ANALYSIS_AGENT_BROWSER:-/usr/local/bin/agent-browser}"

listener_pids() {
  lsof -nP -t -iTCP:"${debug_port}" -sTCP:LISTEN 2>/dev/null | awk '!seen[$0]++'
}

is_target_command() {
  local command_line="$1"

  case "${command_line}" in
    "${chrome_executable}"|"${chrome_executable}"\ *)
      ;;
    *)
      return 1
      ;;
  esac

  case "${command_line}" in
    *"--remote-debugging-port=${debug_port}"*)
      ;;
    *)
      return 1
      ;;
  esac

  case "${command_line}" in
    *"--user-data-dir=${chrome_profile}"*)
      ;;
    *)
      return 1
      ;;
  esac
}

is_stopped() {
  local pid="$1"

  ! kill -0 "${pid}" 2>/dev/null &&
    ! listener_pids | grep -q .
}

wait_until_stopped() {
  local pid="$1"
  local attempt

  for attempt in {1..8}; do
    if is_stopped "${pid}"; then
      return 0
    fi
    sleep 0.25
  done

  return 1
}

main() {
  local pids
  local pid_count
  local pid
  local command_line
  local current_command

  pids="$(listener_pids)"
  if [ -z "${pids}" ]; then
    echo "Dedicated Chrome is already stopped; port ${debug_port} is not listening."
    return 0
  fi

  pid_count="$(printf '%s\n' "${pids}" | wc -l | tr -d ' ')"
  if [ "${pid_count}" -ne 1 ]; then
    echo "Refusing to stop Chrome: port ${debug_port} has multiple listener PIDs: ${pids}" >&2
    return 1
  fi

  pid="${pids}"
  command_line="$(ps -p "${pid}" -o command= 2>/dev/null)"
  if [ -z "${command_line}" ] || ! is_target_command "${command_line}"; then
    echo "Refusing to stop PID ${pid}: it is not the dedicated Chrome for ${chrome_profile} on port ${debug_port}." >&2
    echo "Observed command: ${command_line:-<unavailable>}" >&2
    return 1
  fi

  if [ -x "${agent_browser}" ]; then
    echo "Releasing the agent-browser CDP session for dedicated Chrome PID ${pid}."
    "${agent_browser}" --cdp "${debug_port}" close || true
    if wait_until_stopped "${pid}"; then
      echo "Dedicated Chrome stopped after the CDP session closed."
      return 0
    fi
  else
    echo "agent-browser is unavailable at ${agent_browser}; skipping CDP shutdown." >&2
  fi

  current_command="$(ps -p "${pid}" -o command= 2>/dev/null)"
  if [ "${current_command}" != "${command_line}" ] || ! is_target_command "${current_command}"; then
    echo "Refusing SIGTERM: PID ${pid} changed identity while shutdown was in progress." >&2
    return 1
  fi

  echo "Chrome remained alive after the CDP session closed; sending SIGTERM to dedicated Chrome PID ${pid}." >&2
  kill -TERM "${pid}"
  if wait_until_stopped "${pid}"; then
    echo "Dedicated Chrome stopped after SIGTERM."
    return 0
  fi

  echo "Dedicated Chrome is still running. Inspect PID ${pid}; this helper will not send SIGKILL." >&2
  return 1
}

main "$@"
