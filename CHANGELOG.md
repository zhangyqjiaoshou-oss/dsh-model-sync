# Changelog

## 1.0.0 (2026-06-06)

### Features

- **Host**: reconcile core — query each provider's `/v1/models` endpoint, replace stored model list, keep other fields
- **Host**: auto-sync on `agent/session-start` (debounced, 10s cooldown)
- **Host**: own `model-sync` settings namespace for the auto-sync switch
- **Client**: settings.section slot — manual sync button drives official `llm.discoverModels` + `settings.mutate` RPCs
- **Client**: auto-sync toggle persisted to localStorage + `model-sync` namespace
- **Client**: per-provider sync report (added/removed/total/error)
- **Client**: "How it works" explanation section
- **Build**: `scripts/build.sh` with auto-detection (DSH_CHECKOUT / npm global install)
- **Build**: tsdown client bundle, tsc host compile
- **Ecosystem**: `dsh-plugin` GitHub topic, `dsh.bundle.patch` manifest, `cordis.patch.yml`