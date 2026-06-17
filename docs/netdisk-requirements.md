# ZakoBot 简易网盘需求文档

## 背景

ZakoBot 需要具备发送文件的能力：机器人可以先在本机创建文件，再发布到运行在 `185.92.181.232` 上的简易网盘，获得一个可分享的下载链接，并把链接发送给用户。

## 目标

- 提供一个独立的简易网盘 HTTP 服务。
- 外部访问管理界面需要账号密码登录。
- 支持浏览器上传文件、列出文件、删除文件、下载文件。
- 支持 ZakoBot 通过内部 API 上传本地文件并获取下载 URL。
- 下载 URL 默认且最长 48 小时过期。
- 下载 URL 为不可猜测的签名链接；用户打开 ZakoBot 返回的链接时不需要登录。

## 非目标

- 不把 core API 暴露到公网。
- 不把现有 panel 改造成公网文件服务器。
- 第一版不实现大文件流式 multipart 上传；使用 JSON base64 上传并通过大小限制控制风险。
- 第一版不自动给所有角色启用文件分享 Skill，仍由管理员导入并启用。

## 访问与鉴权

### 管理访问

管理页面和管理 API 需要满足以下任一条件：

- 浏览器已通过 `NETDISK_ADMIN_USERNAME` / `NETDISK_ADMIN_PASSWORD` 登录并持有 HTTP-only session cookie。
- 请求携带 `Authorization: Bearer <NETDISK_INTERNAL_TOKEN>`。

### 下载访问

ZakoBot 返回给用户的下载链接格式为签名链接。链接中包含随机 token，服务端只保存 token hash。下载时必须同时满足：

- 文件 ID 存在。
- token 校验通过。
- 当前时间未超过 `expiresAt`。

过期后下载返回 `410 Gone`。

## 文件生命周期

- 默认 TTL：48 小时。
- 最大 TTL：48 小时。
- 下载请求实时检查过期时间。
- 服务启动时清理过期文件、孤儿文件、缺失文件对应 metadata。
- 服务运行中按 `NETDISK_CLEANUP_INTERVAL_MINUTES` 周期清理。

## 存储

默认存储目录：

```text
$ZAKOBOT_HOME/netdisk/
  files/
    <generated-file-id>
  metadata.json
```

文件实际存储名只使用生成 ID；用户提供的文件名只作为下载显示名，必须清洗路径分隔符和危险字符。

## 配置

```env
NETDISK_ENABLED=true
NETDISK_HOST=0.0.0.0
NETDISK_PORT=6330
NETDISK_PUBLIC_URL=http://185.92.181.232:6330
NETDISK_API_URL=http://127.0.0.1:6330
NETDISK_ADMIN_USERNAME=admin
NETDISK_ADMIN_PASSWORD=<strong-password>
NETDISK_INTERNAL_TOKEN=<random-32+-byte-token>
NETDISK_MAX_FILE_BYTES=104857600
NETDISK_DEFAULT_TTL_HOURS=48
NETDISK_MAX_TTL_HOURS=48
NETDISK_CLEANUP_INTERVAL_MINUTES=60
```

## 安全要求

- 管理密码和内部 token 不能写入代码仓库。
- 下载 token 只保存 hash，比较时使用常量时间比较。
- `netdisk_upload` 工具必须标记为 sensitive。
- 所有文件读取、删除必须限制在 netdisk storage root 内。
- 生产环境建议使用 HTTPS 反向代理；直接使用 HTTP 会暴露密码和下载链接给网络中间人。
