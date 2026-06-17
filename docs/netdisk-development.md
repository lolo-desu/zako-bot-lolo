# ZakoBot 简易网盘开发文档

## 架构

新增独立 workspace 包 `@zakobot/netdisk`，作为公网文件服务运行。ZakoBot core 通过本地私有地址 `NETDISK_API_URL` 上传文件，netdisk 返回基于 `NETDISK_PUBLIC_URL` 的公网下载链接。

```text
ZakoBot file_write -> local file
ZakoBot netdisk_upload -> http://127.0.0.1:6330/api/files
Netdisk -> http://185.92.181.232:6330/f/<id>/<token>/<filename>
User -> download signed URL
```

## 包结构

```text
packages/netdisk/
  package.json
  tsconfig.json
  src/
    index.ts
    config.ts
    auth.ts
    file-safety.ts
    metadata-store.ts
    netdisk-service.ts
    http-server.ts
  test/
    *.test.ts
```

## HTTP 路由

- `GET /health`：健康检查。
- `GET /`：跳转到文件列表或登录页。
- `GET /login`、`POST /login`、`POST /logout`：管理登录。
- `GET /files`：管理文件列表。
- `GET /upload`、`POST /upload`：浏览器上传。
- `POST /api/files`：JSON base64 上传，支持管理员 session 或 Bearer token。
- `POST /api/shares`：基于多个已上传文件 ID 创建 48 小时过期的网页列表分享链接，需鉴权。
- `GET /api/files`：列出文件，需鉴权。
- `DELETE /api/files/:id`：删除文件，需鉴权。
- `GET /f/:id/:token/:filename`：签名下载，不需要登录，但需要 token 正确且未过期。
- `GET /s/:id/:token`：多文件分享网页，列出分享中的文件。
- `GET /s/:id/:token/files/:fileId`：从多文件分享页下载单个文件。

## 上传 JSON

```json
{
  "name": "report.txt",
  "mimeType": "text/plain",
  "contentBase64": "...",
  "ttlHours": 48
}
```

响应：

```json
{
  "id": "...",
  "url": "http://185.92.181.232:6330/f/...",
  "expiresAt": "2026-06-19T12:00:00.000Z"
}
```

## ZakoBot 工具

新增 core 内置工具：`netdisk_upload`。

参数：

- `path`：本地文件路径，单文件上传时使用。
- `paths`：本地文件路径数组，多文件上传时使用；返回网页列表分享链接。
- `name`：单文件下载文件名，或多文件分享页标题，可选。
- `ttlHours`：有效期小时数，可选，默认 48，最大 48。
- `mimeType`：MIME 类型，单文件上传时可选。

工具需要读取环境变量：

- `NETDISK_API_URL`
- `NETDISK_INTERNAL_TOKEN`
- `NETDISK_MAX_FILE_BYTES`

工具必须是 sensitive，让 Discord 审批流能拦截公网发布行为。

## 部署

### 构建

```bash
pnpm install
pnpm build
```

### 运行

单独启动 netdisk：

```bash
node packages/cli/dist/index.js netdisk
```

随 ZakoBot 一起启动：

```bash
NETDISK_ENABLED=true node packages/cli/dist/index.js start
```

默认 `zakobot start` 不启动 netdisk，避免未配置密码/token 时意外暴露公网服务。

### 185.92.181.232 示例环境

```env
ZAKOBOT_HOME=/root/.zakobot
CORE_API_PORT=6325
PANEL_PORT=6324
CORE_API_URL=http://127.0.0.1:6325

NETDISK_ENABLED=true
NETDISK_HOST=0.0.0.0
NETDISK_PORT=6330
NETDISK_API_URL=http://127.0.0.1:6330
NETDISK_PUBLIC_URL=http://185.92.181.232:6330
NETDISK_ADMIN_USERNAME=admin
NETDISK_ADMIN_PASSWORD=<strong-password>
NETDISK_INTERNAL_TOKEN=<random-32+-byte-token>
NETDISK_DEFAULT_TTL_HOURS=48
NETDISK_MAX_TTL_HOURS=48
NETDISK_MAX_FILE_BYTES=104857600
```

生产环境建议用 Nginx/Caddy 终止 HTTPS，再反代到 `127.0.0.1:6330`。如果直接暴露 `http://185.92.181.232:6330`，登录密码和下载链接会以明文传输。

## 验证

```bash
pnpm --filter @zakobot/netdisk test
pnpm --filter @zakobot/core test -- test/tools/netdisk-upload.test.ts
pnpm build
pnpm lint
```

手动验证：

1. `GET /health` 返回 ok。
2. 管理员登录成功。
3. 上传小文件后，列表能看到文件。
4. 下载链接能下载原内容。
5. 过期链接返回 `410 Gone`。
6. core 的 `netdisk_upload` 工具能把本地文件上传并返回公网 URL。
