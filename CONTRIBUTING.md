# Contributing

PRs welcome! 请确保：

- 构建不报错：`bash scripts/build.sh`
- 类型检查通过：`npx tsc -p tsconfig.json --noEmit`
- 如果修改了 client 端，确认 `npm run build:client` 产出有效

项目结构：

```
src/index.ts           Host：同步核心 + auto-sync
src/client/index.ts    Client：settings.section slot UI
lib/                   构建产物（编译后）
cordis.patch.yml       bundle 装配声明
```

添加新功能后更新 `CHANGELOG.md`。