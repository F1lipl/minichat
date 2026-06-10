# FileServer · Go 文件上传服务

MiniChat 的文件上传微服务，使用 **Go 标准库**实现（零第三方依赖），负责图片与文件的上传、本地存储与回源下载。聊天前端通过 WeChatClient 桥接层访问本服务，文件引用以一条普通聊天消息的形式收发，因此天然复用消息持久化与跨服转发。

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/upload` | multipart 表单上传，字段名 `file`；校验大小与类型白名单，返回文件元信息 |
| `GET` | `/files/<id>` | 按 id 回源下载；图片 `inline` 预览，其它类型 `attachment` 下载，保留原始文件名 |
| `GET` | `/health` | 健康检查 |

上传成功返回：

```json
{ "error": 0, "file_id": "…", "name": "a.png", "size": 1234, "type": "image/png", "is_image": true }
```

## 设计要点

- **零依赖**：仅用 `net/http`、`mime`、`crypto/rand` 等标准库，`go build` 即可，便于部署。
- **类型白名单**：按扩展名校验，图片内联展示、其它类型作为可下载文件卡片。
- **大小限制**：`MaxBytesReader` + 显式校验双重拦截，默认 20MB。
- **路径穿越防护**：文件 id 为随机 hex，下载时严格校验 id 字符集，杜绝 `../` 穿越。
- **元信息旁车**：每个文件存 `<id>` 与 `<id>.json` 两个文件，下载时据此还原 `Content-Type` 与原始文件名（RFC 5987 编码，支持中文名）。
- **写入幂等回滚**：元信息写失败时回滚已落盘的文件，避免产生孤儿文件。

## 配置

复制 `config.example.json` 为 `config.json` 后按需修改；也可用环境变量覆盖：

| 配置项 | 环境变量 | 默认 |
| --- | --- | --- |
| `port` | `FILESERVER_PORT` | `8070` |
| `storage_dir` | `FILESERVER_STORAGE_DIR` | `./storage` |
| `max_upload_mb` | `FILESERVER_MAX_UPLOAD_MB` | `20` |
| `allowed_ext` | — | 图片 + 常见文档/压缩/媒体类型 |

## 运行

```bash
cd FileServer
go build -o fileserver .
./fileserver
# 或直接 go run .
```

> `storage/` 与 `config.json` 不入库（见 `.gitignore`）。
