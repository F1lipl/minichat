# Minichat Push Throughput Report

Source summary: `load_results/20260602_230208_optstable_conn10000_steps500_3000.summary.json`

Scenario: 100 users, 100 sessions per user, 10000 TCP connections, fanout 100 notifications per logical message.

| Logical target msg/s | Logical actual msg/s | Real push notify/s | Notify success | Notify P95 | Notify P99 |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 500 | 500 | 50000 | 100% | 641 ms | 897 ms |
| 1500 | 1500 | 150000 | 100% | 5386 ms | 5745 ms |
| 3000 | 2997 | 299500.83 | 100% | 25800 ms | 27905 ms |

CPU avg/max: 17.07% / 73.15%
Memory avg/max: 492.46 MB / 500.01 MB

Interpretation: 500 logical msg/s corresponds to about 50000 real notifications/s with sub-second P95. Higher logical rates remain reliable in this run but accumulate seconds-level queueing latency.
