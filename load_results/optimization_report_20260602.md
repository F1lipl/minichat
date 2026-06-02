# Minichat Backend Optimization Report

Date: 2026-06-02

## Changes

- Added sharded `LogicSystem` worker queues for both ChatServer nodes.
- Released the logic queue lock before running message callbacks.
- Added `MINICHAT_LOGIC_WORKERS` to tune business worker count.
- Added Redis connection pool sizing through `MINICHAT_REDIS_POOL_SIZE`.
- Added cross-server chat gRPC pool sizing through `MINICHAT_CHAT_GRPC_POOL_SIZE`.
- Added configurable Asio IO thread count through `MINICHAT_IO_THREADS`, defaulting to the original 2 threads.
- Changed text-message ACK to return after server acceptance instead of waiting for full recipient fanout.

## Runtime Config

- `MINICHAT_DISABLE_STD_LOG=1`
- `MINICHAT_LOGIC_WORKERS=8`
- `MINICHAT_IO_THREADS=2`
- `MINICHAT_REDIS_POOL_SIZE=64`
- `MINICHAT_CHAT_GRPC_POOL_SIZE=128`

## Test Scenario

- Users: 100
- Sessions per user: 100
- Total TCP connections: 10000
- Chat servers: 8090, 8091
- Stage duration: 6 seconds
- Settle time per stage: 45 seconds
- Build: Debug x64

## Optimized Stable Result

Summary file: `load_results/20260602_230208_optstable_conn10000_steps500_3000.summary.json`

| Target msg/s | Actual msg/s | ACK success | Notify success | ACK P95 | Notify P95 |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 500 | 500 | 100% | 100% | 584 ms | 641 ms |
| 1500 | 1500 | 100% | 100% | 5383 ms | 5386 ms |
| 3000 | 2997 | 100% | 100% | 25793 ms | 25800 ms |

Resource summary:

- CPU avg/max: 17.07% / 73.15%
- Memory avg/max: 492.46 MB / 500.01 MB
- Wall time: 165.63 seconds

## Interpretation

- Realtime-friendly range under this extreme 100x fanout test is about 500 msg/s.
- 1500 msg/s remains reliable but is no longer realtime because P95 is about 5.4 seconds.
- 3000 msg/s is reliable in this run, but latency is already about 25.8 seconds P95.
- The main remaining bottleneck is fanout write pressure: one logical chat message becomes 100 recipient notifications in this test.

## Notes

An experimental delivery-thread split was tested and removed because it increased IO pressure and made low-rate latency worse.
