#!/usr/bin/env bash
# Local dev stack: Supabase (db :55322, studio :55323) + Next.js (:3001); Ctrl+C or any crash tears it all down.

set -uo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

c_reset=$'\033[0m'; c_dim=$'\033[2m'; c_bold=$'\033[1m'
c_red=$'\033[31m'; c_grn=$'\033[32m'; c_ylw=$'\033[33m'; c_cyn=$'\033[36m'

say()  { printf '%s\n' "${c_bold}${c_cyn}▸ dev-stack${c_reset} $*"; }
warn() { printf '%s\n' "${c_bold}${c_ylw}▸ dev-stack${c_reset} $*"; }
die()  { printf '%s\n' "${c_bold}${c_red}▸ dev-stack${c_reset} $*" >&2; exit 1; }

SERVICE_PIDS=()
SERVICE_NAMES=()

# run <label> <color> <cmd...> — each service gets its own process group (set -m) so teardown kills its whole tree.
run() {
  local label=$1 color=$2; shift 2
  (
    "$@" 2>&1 | while IFS= read -r line; do
      printf '%s%-7s%s│ %s\n' "$color" "$label" "$c_reset" "$line"
    done
  ) &
  SERVICE_PIDS+=("$!")
  SERVICE_NAMES+=("$label")
}

CLEANED=0
cleanup() {
  [ "$CLEANED" -eq 1 ] && return
  CLEANED=1
  trap '' INT TERM

  printf '\n'
  say "${c_bold}Shutting down the local dev stack…${c_reset}"

  local pid
  for pid in "${SERVICE_PIDS[@]}"; do
    kill -TERM -- "-${pid}" 2>/dev/null || kill -TERM "${pid}" 2>/dev/null || true
  done
  sleep 1
  for pid in "${SERVICE_PIDS[@]}"; do
    kill -KILL -- "-${pid}" 2>/dev/null || true
  done

  say "Stopping Supabase…"
  supabase stop 2>/dev/null || warn "supabase stop failed (already stopped?)"

  say "${c_grn}Everything is down.${c_reset}"
}
trap cleanup EXIT
trap 'cleanup; exit 0' INT TERM

for tool in supabase docker pnpm; do
  command -v "$tool" >/dev/null 2>&1 || die "Required tool not found on PATH: $tool"
done

say "Starting Supabase (this blocks until the DB is ready)…"
supabase start || warn "supabase start returned non-zero (already running?) — continuing"

set -m
run "next" "$c_grn" pnpm dev:local
set +m
disown -a 2>/dev/null || true

printf '\n'
say "${c_bold}${c_grn}Stack is up.${c_reset}  App: http://localhost:3001"
say "Supabase Studio: http://localhost:55323"
say "${c_dim}Press Ctrl+C to tear everything down.${c_reset}"
printf '\n'

while true; do
  for i in "${!SERVICE_PIDS[@]}"; do
    if ! kill -0 "${SERVICE_PIDS[$i]}" 2>/dev/null; then
      warn "Service '${SERVICE_NAMES[$i]}' exited unexpectedly — tearing down the stack."
      exit 1
    fi
  done
  sleep 2
done
