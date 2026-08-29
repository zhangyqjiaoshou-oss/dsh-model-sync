# dsh-model-sync

[中文](./README.zh.md) | **English**

One-click / auto model sync for DeepSeek Harness providers. The plugin queries each provider's `/v1/models` endpoint and **replaces** the stored model list with what the endpoint advertises (models the endpoint no longer lists are removed; other provider fields are kept).

## Features

- **Manual sync** — one-click sync of every configured provider from the *Model Sync* panel in Settings. Sync runs in the browser through the official `settings` / `llm` APIs — no custom Host RPC.
- **Auto-sync** — re-syncs whenever a conversation page opens (Host listens on `agent/session-start`, 10s debounce). The toggle persists in the plugin's `model-sync` settings namespace + localStorage.
- **Replace semantics** — the discovered list IS the final list; provider models that were removed or added are reflected correctly.
- **Failure isolation** — a failing provider does not affect the others; failed providers keep their previous config.

## Installation

### `npx` (recommended — nothing to install first)

```bash
# One command installs the plugin into the current DSH web profile
npx github:zhangyqjiaoshou-oss/dsh-model-sync install
```

> After the package is published to npm, this becomes `npx @dsh-external/dsh-model-sync install`.

### `dsh plugin add` (bundle-capable environments)

```bash
dsh plugin --profile web add @dsh-external/dsh-model-sync
```

### Manual injection (via dsh-super-injector)

```bash
# Build from source
bash scripts/build.sh
# Inject into the running DSH
dev_inject_plugin C:/Users/niclas/Desktop/dsh/model-sync
```

## Usage

1. Open **Settings → Model Sync**.
2. Click **Sync All Models** to sync immediately, or turn on **Auto-sync on conversation open** to refresh the model list every time you open a conversation page.
3. Each provider reports `✅ N total (+added -removed)`; failures show `❌` with the reason.

## Configuration

| Field | Type | Default | Description |
|---|---|---|---|
| `autoSync` | boolean | `false` | Auto-sync model lists whenever a conversation page opens |
| `debounceMs` | number | `10000` | Minimum milliseconds between two automatic syncs |

The auto-sync switch can also be toggled in the Settings UI; changes are written to the `model-sync` namespace.

## How it works

```
Conversation page opens → agent/session-start event (Host)
  → re-query each provider's /v1/models
  → settings.update writes the new model list
  → settings/document-updated fires
  → browser model selector refreshes automatically
```

Manual sync uses only official wire APIs (`llm.discoverModels` + `settings.mutate`) — no custom Host RPC.

## Development

```bash
bash scripts/build.sh          # auto-detects a DSH checkout or npm global install
npx tsc -p tsconfig.json       # typecheck
npx tsdown                     # client bundle (lib/client.js)
```

## License

MIT