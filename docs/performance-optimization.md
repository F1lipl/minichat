# 性能压测与优化说明

最后更新：2026-06-02

## 1. 压测结论

本次压测在本地单机双 ChatServer Debug 环境下完成，GateServer、ChatServer1、ChatServer2、Redis、MySQL 和压测客户端均运行在同一台机器上。

最终可用于简历或答辩的表述：

> 单机双 ChatServer 支持 `10000` 条 TCP 长连接。在 `100` 倍 fanout 场景下，实时可用吞吐约 `500 message/s`，对应约 `50,000 notify/s` 实际推送，ACK/Notify 成功率 `100%`，Notify P95 `641ms`；可靠峰值样本约 `2997 message/s` / `299,500 notify/s`，成功率 `100%`，但 Notify P95 约 `25.8s`，不作为实时指标。

这里的 `message/s` 指发送方产生的逻辑聊天消息吞吐；`notify/s` 指服务端实际推送给接收端连接的通知吞吐。本轮测试中每个用户有 `100` 个在线连接，所以 `500 message/s` 会放大成约 `50,000 notify/s`。

## 2. 最新压测数据

来源文件：`load_results/20260602_230208_optstable_conn10000_steps500_3000.summary.json`

测试场景：

| 项目 | 配置 |
| --- | --- |
| 用户数 | `100` |
| 每用户连接数 | `100` |
| 总 TCP 连接数 | `10000` |
| ChatServer | `8090`, `8091` |
| fanout | `100` 通知 / 逻辑消息 |
| 单阶段时长 | `6s` |
| 阶段后等待 | `45s` |
| 构建环境 | Debug x64 |

结果汇总：

| 目标 message/s | 实际 message/s | 实际 notify/s | ACK 成功率 | Notify 成功率 | ACK P95 | Notify P95 | 结论 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 500 | 500 | 50,000 | 100% | 100% | 584ms | 641ms | 实时可用 |
| 1500 | 1500 | 150,000 | 100% | 100% | 5383ms | 5386ms | 可靠但非实时 |
| 3000 | 2997 | 299,500 | 100% | 100% | 25793ms | 25800ms | 可靠峰值样本，延迟过高 |

资源占用：

| 指标 | 结果 |
| --- | --- |
| CPU 平均 / 最大 | `17.07%` / `73.15%` |
| 内存平均 / 最大 | `492.46MB` / `500.01MB` |
| 压测总耗时 | `165.63s` |

## 3. 根据压测做的改进

压测早期版本在 `10000` 长连接下，实时可用吞吐约 `200 message/s`；关闭同步日志后吞吐明显提升，但高 fanout 场景下仍会出现业务队列排队。根据这些现象，本次主要做了以下优化：

| 优化项 | 作用 |
| --- | --- |
| 增加 `MINICHAT_DISABLE_STD_LOG` | 压测时关闭大量同步标准输出，减少控制台 IO 对吞吐和延迟的影响 |
| `LogicSystem` 改为多分片业务队列 | 避免所有聊天请求挤在单个逻辑队列和单个消费线程里 |
| 业务队列锁只保护入队/出队 | 回调执行前释放锁，降低锁竞争和队列阻塞 |
| 增加 `MINICHAT_LOGIC_WORKERS` | 支持按机器配置调整业务 worker 数 |
| Redis 连接池可配置 | 通过 `MINICHAT_REDIS_POOL_SIZE` 提高并发 Redis 访问能力 |
| 跨服 gRPC 连接池可配置 | 通过 `MINICHAT_CHAT_GRPC_POOL_SIZE` 提高跨 ChatServer 转发能力 |
| Asio IO 线程数可配置 | 通过 `MINICHAT_IO_THREADS` 支持不同机器上的网络线程调优 |
| 文本消息 ACK 前置 | 服务端接收消息后先返回 ACK，再继续 fanout / 离线保存，降低发送方感知延迟 |
| 压测脚本支持阶梯速率 | 通过 `--rate-steps` 和 `-RateSteps` 连续测试不同吞吐档位 |

稳定压测使用的运行参数：

```powershell
$env:MINICHAT_DISABLE_STD_LOG = "1"
$env:MINICHAT_LOGIC_WORKERS = "8"
$env:MINICHAT_IO_THREADS = "2"
$env:MINICHAT_REDIS_POOL_SIZE = "64"
$env:MINICHAT_CHAT_GRPC_POOL_SIZE = "128"
```

## 4. 当前瓶颈判断

当前瓶颈主要不是单条消息处理逻辑，而是高 fanout 下的实际推送压力：一条逻辑聊天消息会被放大成 `100` 次连接写入。随着 `message/s` 提升，通知写入和业务队列会累积排队，所以 `1500-3000 message/s` 虽然成功率仍为 `100%`，但 P95 延迟已经进入秒级到十秒级。

后续如果继续优化，优先方向是 Release 构建重新压测、服务端和压测客户端分机部署、消息写入批处理、异步日志系统、按用户或会话做更细粒度的推送调度，以及在生产架构中增加更多 ChatServer 节点。
