# 上报数据契约（Ingest Contract）

Agent 每 5 秒把这份 JSON `POST` 到 `<dashboard>/ingest`，并带上请求头
`Authorization: Bearer <token>` 和 `Content-Type: application/json`。

所有字节数值的单位是**字节（bytes）**；所有速率的单位是**字节/秒（bytes/second）**；
`cpu` 百分比取值 0–100；`ts` 是 **Unix 纪元秒**（整数）。

```json
{
  "vps_id": "vps-a",
  "label": "VPS-A Tokyo",
  "ts": 1716200000,
  "uptime_sec": 123456,
  "cpu": { "total_pct": 12.5, "per_core": [10.1, 14.9] },
  "load": { "load1": 0.30, "load5": 0.40, "load15": 0.50 },
  "mem": { "total": 2097152000, "used": 800000000, "available": 1200000000, "cached": 300000000 },
  "swap": { "total": 1048576000, "used": 0 },
  "disks": [
    { "mount": "/", "fstype": "ext4", "total": 50000000000, "used": 20000000000, "free": 30000000000, "percent": 40.0 }
  ],
  "disk_io": { "read_bps": 102400, "write_bps": 51200 },
  "nets": [
    { "iface": "eth0", "rx_bps": 1024, "tx_bps": 2048, "rx_total": 999999, "tx_total": 888888 }
  ],
  "traffic": { "month": "2026-05", "rx_bytes": 1234567, "tx_bytes": 7654321 },
  "top_proc_cpu": [ { "pid": 123, "name": "node", "cpu_pct": 30.0, "mem_pct": 5.0 } ],
  "top_proc_mem": [ { "pid": 456, "name": "postgres", "cpu_pct": 2.0, "mem_pct": 15.0 } ]
}
```

`traffic.month` 是计费周期起始月份，格式为 `YYYY-MM`。`top_proc_cpu` /
`top_proc_mem` 各最多保存 10 条。数组可以为空，但字段必须存在。
