#!/bin/bash
# dsh-model-sync build: compile src/ → lib/ (host) + bundle lib/client.js (web).
# Dependency source auto-probe:
#   1. $DSH_CHECKOUT — a deepseek-harness source checkout (packages/ layout)
#   2. npm global install — @deepseek-ai/dsh under the current npm root
#      (link targets are resolved from the global dsh's own node_modules)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# ── locate a dsh installation ───────────────────────────────────────────────
DSH_GLOBAL=""
if [ -z "${DSH_CHECKOUT:-}" ] || [ ! -d "${DSH_CHECKOUT:-}/packages" ]; then
  for candidate in "$HOME/dsh-harness" "$HOME/dsh" "$HOME/.dsh/dsh-harness"; do
    if [ -d "$candidate/packages" ]; then DSH_CHECKOUT="$candidate"; break; fi
  done
fi

if [ -n "${DSH_CHECKOUT:-}" ] && [ -d "$DSH_CHECKOUT/packages" ]; then
  echo "build: using source checkout $DSH_CHECKOUT"
  NM_ROOT="$DSH_CHECKOUT/node_modules"
  TSC="$DSH_CHECKOUT/node_modules/.bin/tsc"
  if [ ! -x "$TSC" ] && [ ! -f "$TSC.cmd" ]; then
    echo "build: tsc not found at $TSC" >&2
    exit 1
  fi
else
  # fall back to the npm global install of @deepseek-ai/dsh
  NPM_ROOT="$(npm root -g 2>/dev/null || echo)"
  if [ -n "$NPM_ROOT" ] && [ -d "$NPM_ROOT/@deepseek-ai/dsh" ]; then
    DSH_GLOBAL="$NPM_ROOT/@deepseek-ai/dsh"
    echo "build: using npm global install $DSH_GLOBAL"
    NM_ROOT="$DSH_GLOBAL/node_modules"
    TSC="$NM_ROOT/.bin/tsc"
    if [ ! -e "$TSC" ] && [ ! -f "$TSC.cmd" ]; then
      # typescript may be hoisted to the global root
      TSC="$NPM_ROOT/typescript/bin/tsc"
    fi
  fi
fi

if [ -z "$NM_ROOT" ] || [ ! -d "$NM_ROOT" ]; then
  echo "build: cannot locate a dsh checkout or npm global install (set DSH_CHECKOUT)" >&2
  exit 1
fi
if [ ! -f "$TSC" ] && [ ! -f "$TSC.cmd" ] && ! command -v tsc >/dev/null 2>&1; then
  echo "build: tsc not found (tried $TSC and PATH)" >&2
  exit 1
fi

link_pkg() {
  local target="$1" link="$2"
  if [ ! -e "$target" ]; then
    echo "build: dependency target missing: $target" >&2
    exit 1
  fi
  node -e "
    const fs = require('fs');
    const path = require('path');
    const link = path.resolve(process.argv[1]);
    const target = path.resolve(process.argv[2]);
    fs.rmSync(link, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(link), { recursive: true });
    fs.symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
  " "node_modules/$link" "$target"
}

echo "=== Linking build dependencies (nm root: $NM_ROOT) ==="
mkdir -p node_modules/@deepseek-ai
link_pkg "$NM_ROOT/@deepseek-ai/cordis" "@deepseek-ai/cordis"
link_pkg "$NM_ROOT/@deepseek-ai/schemastery" "@deepseek-ai/schemastery"
link_pkg "$NM_ROOT/@deepseek-ai/dsh-settings" "@deepseek-ai/dsh-settings"
link_pkg "$NM_ROOT/@deepseek-ai/dsh-llm" "@deepseek-ai/dsh-llm"
link_pkg "$NM_ROOT/@deepseek-ai/dsh-tools" "@deepseek-ai/dsh-tools"
link_pkg "$NM_ROOT/@deepseek-ai/dsh-client-connection" "@deepseek-ai/dsh-client-connection"
link_pkg "$NM_ROOT/@deepseek-ai/dsh-client-runtime" "@deepseek-ai/dsh-client-runtime"
link_pkg "$NM_ROOT/@deepseek-ai/dsh-client-ui-slots" "@deepseek-ai/dsh-client-ui-slots"
# @types/node (compile types; the dsh install carries them)
if [ -d "$NM_ROOT/@types/node" ]; then
  link_pkg "$NM_ROOT/@types/node" "@types/node"
fi

echo "=== Compiling src → lib ==="
if [ -f "$TSC.cmd" ]; then TSC_CMD="cmd //c \"$TSC\""; else TSC_CMD="node \"$TSC\""; fi
# simple portable invocation: prefer PATH tsc, else the resolved one via node
if command -v tsc >/dev/null 2>&1; then
  tsc -p tsconfig.json
else
  node "$TSC" -p tsconfig.json
fi
echo "=== Build complete ==="