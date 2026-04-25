# AGENTS.md

## 先信源码

- README 只记录当前 fork 的增量，旧规划可能过期；配置、脚本和源码优先于文档。
- 详细接手流程在 `docs/AI_DEV_WORKFLOW.md`，但本文件优先保留最容易漏掉的操作事实。
- 现有 `CLAUDE.md` 仍有可用架构说明；若冲突，以当前源码和脚本为准。

## 仓库边界

- pnpm workspace：`packages/*`、`shared`、`plugins/*`；包都是 ESM + TypeScript NodeNext。
- `shared` 是跨包类型；改 API payload、schema、bot profile、settings 时通常要先同步这里。
- `packages/database` 是 Drizzle + SQLite；`packages/database/src/client.ts` 开 WAL，供 core/panel 并发访问同一 DB。
- `packages/core` 是机器人进程：Discord、LLM、MCP、skills、plugins、Node 原生 `http` 内部 API。
- `packages/panel` 是 Nuxt 4 面板；server API 通过 `packages/panel/server/utils/core-client.ts` 调 core，也会使用同一 `ZAKOBOT_HOME`。
- `packages/cli` 只负责 `zakobot init|core|panel|start`，启动 core/panel 两个独立进程。

## 入口和联动点

- 系统启动：`packages/cli/src/index.ts`、`packages/core/src/index.ts`、`packages/core/src/api/server.ts`。
- Core 启动会 `import 'dotenv/config'`，创建 `ZAKOBOT_HOME` 下目录，调用 `seed(db)` 跑 migrations，再启动 API、plugins、MCP、bots。
- Discord 主路径：`packages/core/src/bot/discord-adapter.ts` -> `bot-manager.ts` -> `packages/core/src/llm/agent.ts`。
- Panel 调 core：`packages/panel/server/api/**` 和 `packages/panel/server/utils/core-client.ts`。
- 数据模型：`packages/database/src/schema/**`、`packages/database/src/queries/**`、`packages/database/migrations/**`、`shared/src/types/**`。

## 命令

- 安装/CI 环境：GitHub Actions 使用 Node 22、pnpm 10、`pnpm install --frozen-lockfile`、`pnpm build`。
- 全量构建：`pnpm build`；顺序是 `shared -> database -> core -> panel -> cli`。
- 单包构建：`pnpm --filter @zakobot/shared build`、`pnpm --filter @zakobot/database build`、`pnpm --filter @zakobot/core build`、`pnpm --filter @zakobot/panel build`。
- Panel 类型检查单独存在：`pnpm --filter @zakobot/panel typecheck`。
- 开发：`pnpm dev` 会先 build shared/database，再并发 watch deps、core、panel；只跑 core 用 `pnpm dev:core`，只跑 panel 用 `pnpm dev:panel`。
- 数据库：`pnpm --filter @zakobot/database db:generate`、`pnpm --filter @zakobot/database db:migrate`、`pnpm --filter @zakobot/database db:studio`。
- 当前没有发现测试文件或根 `test` 脚本；不要声称跑过测试，除非新增了对应脚本。

## 运行环境

- 默认本机端口是 core API `http://127.0.0.1:6325`，panel `http://127.0.0.1:6324`。
- CLI 会把 panel 的 `CORE_API_URL` 默认设为 `http://127.0.0.1:${CORE_API_PORT}`；Nuxt config 默认也是 `http://127.0.0.1:6325`。
- 默认 `ZAKOBOT_HOME=~/.zakobot`；当前 VPS 常用为 `/root/.zakobot`，数据库 `/root/.zakobot/data.db`，core 日志 `/root/.zakobot/logs/core.log`。
- `DATABASE_URL` 未设置时，core 使用 `$ZAKOBOT_HOME/data.db`；database 包的独立 migrate/drizzle 默认使用 `./data/zakobot.db`，线上迁移时要显式确认目标 DB。
- Panel 登录状态写在 `$ZAKOBOT_HOME/panel-auth.json`；默认密码逻辑在 `packages/panel/server/utils/panel-auth.ts`。

## 修改注意

- 改 schema：先改 `packages/database/src/schema`，生成并检查 migration，再同步 queries/shared/core/panel；不要手改线上 DB 后又忘记 `__drizzle_migrations`。
- 新增 bot 配置项通常要改：DB schema + migration、`shared/src/types/bot-instance.ts`、`packages/core/src/api/server.ts`、`packages/panel/components/BotEditorForm.vue`、`packages/panel/pages/bots/new.vue`、`packages/panel/pages/bots/[id].vue`、实际 runtime 使用点。
- 新增 `GeneralSettings` 字段要同步：`shared/src/types/general-settings.ts`、`packages/core/src/settings/general-settings.ts`、`packages/core/src/api/server.ts` 的解析、`packages/panel/pages/settings/general/index.vue`。
- 改模型列表/切换逻辑常看：`packages/core/src/llm/list-models.ts`、`packages/core/src/bot/model-command.ts`、`packages/core/src/bot/bot-manager.ts`、`packages/panel/composables/modelPlatforms.ts`。
- Discord 采用 `thread = session`；频道内 `@bot` 会新建 thread-backed session，`/new`、`/stop`、`/browser`、`/model` 都是现有行为，改回复逻辑时要回归这些路径。
- 长期记忆是本地 SQLite，不是 Mem0；关键文件在 `packages/core/src/memory/local-memory-service.ts`、`packages/core/src/settings/local-memory-settings.ts`、`packages/database/src/schema/local-memories.ts`、`packages/panel/pages/settings/memory/index.vue`。
- 持久浏览器当前走 Camoufox/noVNC；旧 Chromium/CDP 代码只在 `backups/chromium-browser-mcp-20260422/` 作为备份。

## 验证和服务

- 小改动先跑最小受影响包 build；联动改动按 `shared/database -> core -> panel` 验证。
- Runtime 变更不要未 build 就重启；常用流程：目标 build 通过后 `systemctl restart zako-bot.service`。
- 重启后验证：`systemctl is-active zako-bot.service`、`curl -fsS http://127.0.0.1:6325/status`、`journalctl -u zako-bot.service -n 100 --no-pager`。
- 遇到 bot 不回复，先查 `journalctl -u zako-bot.service` 和 `/root/.zakobot/logs/core.log`；遇到 core 起不来，优先排查 migration/schema 同步。

## Git 和发布

- 当前分支是 `lolover`；远端 `lolo-standalone` 是当前独立仓库，`origin` 是 upstream `Mooooooon/zako-bot`。
- 不要默认 push 到 `origin`；交付优先 `lolo-standalone/lolover`，除非用户明确要求其他远端。
- 提交前看 `git status --short --branch`、`git diff` 和最近提交风格；不要提交 `dist/`、`.nuxt/`、`.output/`、日志、数据库、`*.db-wal`、`*.db-shm`。
- 需要提交且未另行指定时，使用作者 `lolo-desu <copybackup0320@gmail.com>`。
