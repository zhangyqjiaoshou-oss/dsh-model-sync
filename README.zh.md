# dsh-model-sync

**中文** | [English](./README.md)

一键同步 / 自动同步 DeepSeek Harness 供应商模型列表。插件会自动查询每个供应商的 `/v1/models` 接口，把配置里存储的模型列表**完全替换**为供应商返回的最新列表（下架的模型会移除，其他字段保留）。

## 功能 / Features

- **手动同步（Manual sync）**：设置页「模型同步」面板内一键同步所有已配置供应商。同步在浏览器内通过官方 `settings` / `llm` 接口完成，无需自定义 Host RPC。
- **自动同步（Auto-sync）**：打开任何会话页时自动重新同步（Host 端监听 `agent/session-start`，带 10 秒防抖）。开关状态持久化在本插件的 `model-sync` 设置命名空间 + localStorage。
- **完全替换语义**：发现列表即最终列表——供应商下架或新增的模型都会正确反映。
- **失败隔离**：单个供应商查询失败不影响其他供应商，失败的供应商保留原配置。

## 安装 / Installation

### `npx`（推荐，无需事先安装任何东西）

```bash
# 一键安装插件到当前 DSH web profile
npx github:zhangyqjiaoshou-oss/dsh-model-sync install
```

> 发布到 npm 后此命令会变为 `npx @dsh-external/dsh-model-sync install`。

### `dsh plugin add`（需 bundle 支持的环境）

```bash
dsh plugin --profile web add @dsh-external/dsh-model-sync
```

### 手动注入（通过 dsh-super-injector）

```bash
# 从源码构建
bash scripts/build.sh
# 注入到当前运行的 DSH
dev_inject_plugin C:/Users/niclas/Desktop/dsh/model-sync
```

## 使用方法 / Usage

1. 打开 **设置 → 模型同步**（Settings → Model Sync）。
2. 点 **同步所有模型**（Sync All Models）立即同步；或打开 **打开会话页时自动同步**（Auto-sync on conversation open）开关，之后每次打开会话页都会自动刷新模型。
3. 每个供应商显示 `✅ 共 N 个 (+新增 -移除)`，失败显示 `❌` 与原因。

## 配置 / Configuration

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `autoSync` | boolean | `false` | 打开会话页时自动同步模型 |
| `debounceMs` | number | `10000` | 两次自动同步的最小间隔（毫秒） |

自动同步开关也可在设置页 UI 里切换，改动写入 `model-sync` 命名空间。

## 工作原理 / How it works

```
打开会话页 → agent/session-start 事件（Host）
  → 重新查询每个供应商 /v1/models
  → settings.update 写入新模型列表
  → settings/document-updated 事件派发
  → 浏览器模型选择器自动刷新
```

手动同步完全走官方 wire API（`llm.discoverModels` + `settings.mutate`），不依赖任何自定义 Host RPC。

## 开发 / Development

```bash
bash scripts/build.sh          # 自动探测 DSH checkout / npm 全局安装
npx tsc -p tsconfig.json       # 类型检查
npx tsdown                     # client bundle（lib/client.js）
```

## 许可 / License

MIT