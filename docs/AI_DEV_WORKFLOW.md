# AI Dev Workflow

这份文档写给接手这个 fork 的下一个 AI。目标不是解释“改了什么功能”，而是说明在这个仓库里应该如何定位、修改、构建、迁移、重启、验证和提交。

## 1. 当前仓库事实

- 本地仓库路径：`/root/zako-bot`
- 当前独立仓库：`https://github.com/lolo-desu/zako-bot-lolo`
- 旧 fork：`https://github.com/lolo-desu/zako-bot`
- upstream：`https://github.com/Mooooooon/zako-bot`
- 当前默认分支：`lolover`
- 当前运行数据目录：`/root/.zakobot`
- 当前 SQLite 数据库：`/root/.zakobot/data.db`
- 当前 core 状态接口：`http://127.0.0.1:6325/status`
- 当前 core 文件日志：`/root/.zakobot/logs/core.log`
- 当前常用服务管理：`systemctl status|restart zako-bot.service`

## 2. 项目结构

- `packages/core`
  机器人运行时、Discord 适配层、LLM 调用、MCP、内部 API。
- `packages/panel`
  Nuxt 管理面板。面板通过自己的 server api 转发到 core。
- `packages/database`
  Drizzle schema、query、migration。
- `packages/cli`
  `zakobot` 命令行入口。
- `shared`
  跨包类型。只要 schema / api payload / bot profile 变了，通常这里也要跟着变。

## 3. 先看哪里

### 入口文件

- `packages/core/src/index.ts`
- `packages/cli/src/index.ts`
- `packages/core/src/api/server.ts`

### Discord 相关

- `packages/core/src/bot/discord-adapter.ts`
- `packages/core/src/bot/bot-manager.ts`
- `packages/core/src/bot/model-command.ts`
- `packages/core/src/bot/discord-stream-renderer.ts`

### LLM / 对话相关

- `packages/core/src/llm/agent.ts`
- `packages/core/src/llm/client.ts`
- `packages/core/src/llm/conversation-service.ts`
- `packages/core/src/llm/list-models.ts`

### 浏览器 / noVNC 相关

- `packages/core/src/mcp/persistent-browser-mcp.ts`
- `scripts/launch-browser-stack.sh`
- `scripts/resolve-camoufox-options.py`
- `/etc/zako-browser/*.env`
- `/etc/zako-browser/mcp-profiles.json`

### Panel 相关

- `packages/panel/components/BotEditorForm.vue`
- `packages/panel/pages/chat.vue`
- `packages/panel/server/api/**`

### 数据模型相关

- `packages/database/src/schema/*.ts`
- `packages/database/src/queries/*.ts`
- `packages/database/migrations/*.sql`
- `shared/src/types/*.ts`

## 4. 修改原则

- 先读再改，不要凭感觉猜仓库结构。
- 优先做最小正确改动。
- 如果一个功能已经开始变复杂，及时拆模块，不要继续往 `discord-adapter.ts` 之类的大文件里堆。
- schema、shared type、api payload、panel form、runtime 过滤逻辑经常是联动的，改一处要顺手检查另外几处。
- 不要随手改用户已经在用的数据，尤其不要清空数据库里的现有配置。

## 5. 推荐修改流程

1. 先确认需求影响层级。
2. 用 `read` / `grep` / `glob` 找到入口文件和类型定义。
3. 如果改动涉及配置项：
   - 先改 `packages/database/src/schema`
   - 再改 `shared/src/types`
   - 再改 `packages/core/src/api/server.ts`
   - 最后改 panel 表单和运行时逻辑
4. 如果改动涉及 Discord 回复逻辑：
   - 优先看 `packages/core/src/bot/discord-adapter.ts`
   - 如果是正文切分/命令解析/独立职责，优先拆到 `packages/core/src/bot/` 下新文件
5. 改完先做针对性 build，不要一上来全量 build。
6. build 通过后再重启 core。
7. 最后做最小验证：状态接口、启动日志、关键命令或页面。

## 6. 构建方法

### 单包构建

- `pnpm --filter @zakobot/shared build`
- `pnpm --filter @zakobot/database build`
- `pnpm --filter @zakobot/core build`
- `pnpm --filter @zakobot/panel build`

### 全量构建

- `pnpm build`

### 实用规则

- 如果只改 `core` 内部实现，先跑：`pnpm --filter @zakobot/core build`
- 如果改了 `shared` 或 `database` 的类型 / schema，再跑：
  - `pnpm --filter @zakobot/shared build`
  - `pnpm --filter @zakobot/database build`
  - `pnpm --filter @zakobot/core build`
- 如果改了 panel 表单 / 页面 / server api，再补：`pnpm --filter @zakobot/panel build`

## 7. 数据库迁移方法

### 正常流程

1. 改 `packages/database/src/schema/*.ts`
2. 生成 migration：`pnpm --filter @zakobot/database db:generate`
3. 检查生成的 SQL
4. 执行 migration：`pnpm --filter @zakobot/database db:migrate`

### 当前仓库的实际注意点

- core 启动时会执行 `seed()`，其中会跑 migration。
- 如果你手动改过线上数据库，再新增同样的 migration，core 启动时可能因为“列已存在”直接失败。
- 所以不要在“已经有 migration 的前提下”又手工改线上 schema，除非你知道自己在同步 `__drizzle_migrations`。
- 最稳妥的方法还是：先生成 migration，再用 migration 改库。

## 8. 开发运行方法

### 本地开发

- `pnpm dev`
- `pnpm dev:core`
- `pnpm dev:panel`

### 正式构建后运行

- `pnpm start`

### 当前服务器上最常用的重启方式

重启服务：

```bash
systemctl restart zako-bot.service
```

验证状态：

```bash
systemctl is-active zako-bot.service
curl -fsS "http://127.0.0.1:6325/status"
```

看日志：

```bash
journalctl -u zako-bot.service -n 100 --no-pager
Read /root/.zakobot/logs/core.log
```

## 9. 当前运行验证习惯

改动完成后，至少做下面几项中的相关项：

- `core` build 通过
- `panel` build 通过（如果改过 panel）
- `curl http://127.0.0.1:6325/status` 返回 `ok: true`
- `/tmp/zakobot-core.log` 里看到：
  - `ApiServer Listening`
  - `McpManager Connected`
  - Discord bot 登录成功
- 如果改了 Discord 行为：
  - 看目标 bot 是否只在允许频道/子区响应
  - 看目标 bot 是否只对允许用户响应
  - 看 `/new` `/stop` `/browser` `/model` 是否还正常
- 如果改了 noVNC / 浏览器：
  - 看 `manual_login` 是否能起 headed browser
  - 看 noVNC 地址是否可达

## 10. 常见联动点

### 新增 bot 配置项时

通常至少需要改这几处：

- `packages/database/src/schema/bot-instances.ts`
- `packages/database/migrations/*.sql`
- `shared/src/types/bot-instance.ts`
- `packages/core/src/api/server.ts`
- `packages/panel/components/BotEditorForm.vue`
- `packages/panel/pages/bots/new.vue`
- `packages/panel/pages/bots/[id].vue`
- 使用该配置的 runtime 文件，例如 `packages/core/src/bot/discord-adapter.ts`

### 新增 Discord 命令时

通常需要改：

- `packages/core/src/bot/discord-adapter.ts`
- 如果逻辑够独立，额外拆出一个 `packages/core/src/bot/*.ts`
- 若涉及持久化，则继续联动 `bot-manager` / `api/server` / `shared` / panel

### 新增模型平台 / 模型切换逻辑时

通常需要改：

- `packages/core/src/llm/list-models.ts`
- `packages/core/src/bot/model-command.ts`
- `packages/core/src/bot/bot-manager.ts`
- `packages/panel/composables/modelPlatforms.ts`

## 11. 当前 fork 的几个关键实现事实

- Discord 采用 `thread = session`
- 频道内直接 `@bot` 会新建 thread + session
- `/model` 已支持列出可用模型并按编号永久切换
- Discord 回复正文和工具过程已拆成两条消息流
- 持久浏览器当前走 Camoufox，不再走旧 Chromium/CDP 路径
- `backups/chromium-browser-mcp-20260422/` 保存了旧浏览器实现备份

## 12. Git 工作流

### 当前远端

- `origin`：原仓库 `Mooooooon/zako-bot`
- `lolo-fork`：旧 fork `lolo-desu/zako-bot`
- `lolo-standalone`：当前独立仓库 `lolo-desu/zako-bot-lolo`

### 当前推荐分支策略

- 当前独立仓库默认分支：`lolover`
- 新改动优先推到 `lolo-standalone/lolover`
- 不要默认把改动推回 `origin`

### 提交前建议

- 先 `git status --short --branch`
- 看清是不是有别人留下的未提交改动
- 不要把无关生成物、临时日志、数据库文件一起提交

### contribution 相关

- 如果希望 GitHub contribution graph 记到 `lolo-desu` 账号：
  - commit author 邮箱必须是 GitHub 账号绑定邮箱
  - 默认分支最好是 `lolover`，当前已经是
- 如果提交作者不对，需要重写作者后再 push

## 13. 不要做的事

- 不要随便 `git reset --hard`
- 不要 `git checkout -- <file>` 回滚用户改动
- 不要把多个复杂能力继续堆回 `discord-adapter.ts`
- 不要手动改线上数据库后又忘记 migration 记录
- 不要在没 build 的情况下直接重启 core

## 14. 最后建议

- 小改动：先单包 build，再重启
- 联动改动：先 `shared/database`，再 `core`，最后 `panel`
- 遇到“看起来 bot 没回复”：先看 `journalctl -u zako-bot.service` 和 `/root/.zakobot/logs/core.log`
- 遇到“core 起不来”：先看是不是 migration 或 schema 同步问题
- 遇到“panel 类型不对”：通常先补 `shared` build，再重新 build panel/core
