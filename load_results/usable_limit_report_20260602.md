# MiniChat 极限可用压测报告

生成时间：2026-06-02 16:10  
测试目标：找出当前单机本地环境下的“实时可用”连接数与消息吞吐范围。

## 1. 可用判定标准

本报告将“实时可用”定义为：

- ACK 成功率 = 100%
- 消息通知成功率 = 100%
- ACK P95 延迟 <= 200ms
- Notify P95 延迟 <= 200ms

超过该标准但仍无丢包的结果，记为“可靠但不可实时使用”。

## 2. 最终结论

当前本地 Debug 环境下，MiniChat 的实时可用范围为：

- 可用长连接数：至少 10000 条 TCP 长连接
- 可用消息吞吐：约 200 msg/s
- 可靠但不可实时使用边界：约 250 msg/s 以上开始出现秒级排队
- 当前压测未出现 ACK 丢失、通知丢失或 socket 错误

最强可用样本：

| 指标 | 数值 |
|---|---:|
| 长连接数 | 10000 |
| 实际消息吞吐 | 202.70 msg/s |
| ACK 成功率 | 100% |
| Notify 成功率 | 100% |
| ACK 平均延迟 | 13.90 ms |
| ACK P95 | 26 ms |
| Notify 平均延迟 | 10.62 ms |
| Notify P95 | 23 ms |
| 服务端平均 CPU | 2.52% |
| 服务端峰值 CPU | 11.39% |
| 服务端平均内存 | 152.20 MB |
| 服务端峰值内存 | 189.58 MB |

不可用边界样本：

| 指标 | 数值 |
|---|---:|
| 长连接数 | 10000 |
| 实际消息吞吐 | 254.10 msg/s |
| ACK 成功率 | 100% |
| Notify 成功率 | 100% |
| ACK P95 | 3741 ms |
| Notify P95 | 3751 ms |
| 结论 | 可靠但实时不可用 |

因此，建议对外表述为：

> 本地单机双 ChatServer Debug 环境下，系统可实时支撑 10000 条 TCP 长连接、约 200 msg/s 消息吞吐，ACK/通知成功率 100%，P95 延迟约 20-30ms；当吞吐提升到约 250 msg/s 以上时，消息仍可可靠投递，但 P95 延迟上升到秒级。

## 3. 边界压测数据

| Label | 连接数 | 目标速率 | 实际速率 | ACK 成功率 | Notify 成功率 | ACK P95 | Notify P95 | CPU Avg/Max | Mem Avg/Max | 结论 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| usable_conn1000_rate250 | 1000 | 250 | 200.12 | 100% | 100% | 40ms | 36ms | 3.26% / 10.16% | 127.72MB / 130.30MB | 可用 |
| usable_conn1000_rate300_retest | 1000 | 300 | 253.89 | 100% | 100% | 3526ms | 3347ms | 3.65% / 10.76% | 124.06MB / 127.70MB | 不可实时使用 |
| usable_conn1000_rate350 | 1000 | 350 | 289.35 | 100% | 100% | 7218ms | 6782ms | 4.20% / 10.59% | 125.28MB / 139.66MB | 不可实时使用 |
| usable_conn1000_rate500 | 1000 | 500 | 302.27 | 100% | 100% | 9472ms | 8753ms | 4.63% / 10.59% | 135.44MB / 138.12MB | 不可实时使用 |
| usable_conn3000_rate200 | 3000 | 200 | 151.41 | 100% | 100% | 14ms | 12ms | 2.72% / 8.10% | 147.49MB / 157.05MB | 可用 |
| usable_conn3000_rate250 | 3000 | 250 | 200.58 | 100% | 100% | 40ms | 37ms | 2.82% / 10.13% | 136.69MB / 148.18MB | 可用 |
| usable_conn3000_rate300 | 3000 | 300 | 260.39 | 100% | 100% | 3129ms | 3215ms | 3.08% / 10.91% | 147.09MB / 161.43MB | 不可实时使用 |
| usable_conn5000_rate250 | 5000 | 250 | 199.32 | 100% | 100% | 92ms | 90ms | 2.59% / 10.58% | 136.75MB / 154.55MB | 可用 |
| usable_conn10000_rate250 | 10000 | 250 | 202.70 | 100% | 100% | 26ms | 23ms | 2.52% / 11.39% | 152.20MB / 189.58MB | 可用 |
| usable_conn10000_rate300 | 10000 | 300 | 254.10 | 100% | 100% | 3741ms | 3751ms | 2.58% / 11.01% | 137.62MB / 181.59MB | 不可实时使用 |

## 4. 测试环境

| 项目 | 配置 |
|---|---|
| OS | Microsoft Windows 11 家庭版 中文版, 10.0.26200, 64 位 |
| CPU | Intel(R) Core(TM) Ultra 9 185H |
| CPU 核心 | 16 核 / 22 逻辑处理器 |
| 内存 | 31.61 GB |
| Node.js | v24.11.1 |
| Redis | 5.0.14.1, 127.0.0.1:6380 |
| MySQL | 8.0.45, 127.0.0.1:3308 |
| GateServer | 0.0.0.0:8080 |
| ChatServer1 | TCP 8090, RPC 50055 |
| ChatServer2 | TCP 8091, RPC 50056 |
| 部署方式 | 客户端压测脚本、GateServer、ChatServer、Redis、MySQL 同机运行 |
| 编译环境 | 当前为 Debug/本地开发环境 |

## 5. 原始结果文件

| Label | Summary | Samples |
|---|---|---|
| usable_conn1000_rate250 | 20260602_153815_usable_conn1000_rate250.summary.json | 20260602_153815_usable_conn1000_rate250.samples.json |
| usable_conn1000_rate300_retest | 20260602_153602_usable_conn1000_rate300_retest.summary.json | 20260602_153602_usable_conn1000_rate300_retest.samples.json |
| usable_conn1000_rate350 | 20260602_153335_usable_conn1000_rate350.summary.json | 20260602_153335_usable_conn1000_rate350.samples.json |
| usable_conn1000_rate500 | 20260602_153052_usable_conn1000_rate500.summary.json | 20260602_153052_usable_conn1000_rate500.samples.json |
| usable_conn3000_rate200 | 20260602_152257_usable_conn3000_rate200.summary.json | 20260602_152257_usable_conn3000_rate200.samples.json |
| usable_conn3000_rate250 | 20260602_152653_usable_conn3000_rate250.summary.json | 20260602_152653_usable_conn3000_rate250.samples.json |
| usable_conn3000_rate300 | 20260602_152005_usable_conn3000_rate300.summary.json | 20260602_152005_usable_conn3000_rate300.samples.json |
| usable_conn5000_rate250 | 20260602_154022_usable_conn5000_rate250.summary.json | 20260602_154022_usable_conn5000_rate250.samples.json |
| usable_conn10000_rate250 | 20260602_154512_usable_conn10000_rate250.summary.json | 20260602_154512_usable_conn10000_rate250.samples.json |
| usable_conn10000_rate300 | 20260602_155430_usable_conn10000_rate300.summary.json | 20260602_155430_usable_conn10000_rate300.samples.json |

## 6. 备注

- 本轮压测是单机端到端压测，压测客户端和服务端同机运行，因此结果包含本机客户端调度、Windows 网络栈、Debug 构建和日志输出影响。
- 服务端 CPU 统计为被测服务聚合值并按 22 个逻辑处理器归一化。
- 当前瓶颈表现为消息速率超过约 250 msg/s 后出现明显排队，而不是连接数达到 10000 时崩溃。
- 生产化优化建议：Release 编译、异步日志、压测客户端与服务端分机、增加压测客户端并发进程、减少同步阻塞、批量化 Redis/DB 访问。
