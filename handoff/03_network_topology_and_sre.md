# 網路拓樸與 SRE 路線

## 1. 網路架構原則

此遊戲採：

> Server Authoritative Real-Time Multiplayer

原因：

- PvP
- Parry
- Damage
- Stamina
- Death
- Winner

都不能完全相信 Client。

---

## 2. 初始拓樸

```text
Player A ─┐
Player B ─┼── WSS ── Game Server
Player C ─┤
Player D ─┘
```

第一個 Online Prototype 只需要一台 Game Server。

---

## 3. Production 拓樸

```text
Players
   │
   ▼
Load Balancer
   │
   ├───────────────┐
   ▼               ▼
Game Server #1   Game Server #2
   │               │
 Rooms             Rooms
   │               │
   └───────┬───────┘
           ▼
         Redis
           │
           ▼
      PostgreSQL
```

---

## 4. Matchmaking Flow

```text
Browser
   ↓
Join Queue
   ↓
Matchmaker
   ↓
找到 8 名玩家
   ↓
Allocate Room
   ↓
取得 Server / Room
   ↓
WebSocket Connect
   ↓
Match Start
```

---

## 5. Redis 用途

不要拿 Redis 當永久資料庫。

適合：

- Presence
- Matchmaking Queue
- Session
- Room Registry
- Temporary Player State
- Rate Limiting

---

## 6. PostgreSQL 用途

永久資料：

- User
- Match Result
- Win / Loss
- Weapon Usage
- Statistics
- MMR
- Ranking
- Progression

---

## 7. Latency

近戰遊戲最敏感的是：

- Attack Input
- Dodge
- Guard
- Parry

必須量測：

- RTT
- Jitter
- Packet Loss
- Server Tick Time
- State Replication Delay

---

## 8. Parry 與網路

Client 畫面中的 Parry 不能直接代表 Server 判定成功。

基本流程：

```text
Client
Parry Input
   ↓
Timestamp
   ↓
Server
   ↓
檢查：
- Player State
- Stamina
- Attack Timeline
- Target
- Latency Compensation
   ↓
Resolve
   ↓
Broadcast Result
```

---

## 9. Server Tick

初期可評估：

- 20 Hz
- 30 Hz

不建議一開始追求 60 Hz Server Tick。

重要的是：

> 每個 Tick 都必須在預算內完成。

例如 30 Hz：

```text
1 second / 30
≈ 33.3 ms
```

Server 每個 Tick 的主要工作必須遠低於此預算，保留 GC / Network / Spike 空間。

---

## 10. SLI / SLO

### Availability
- Match service availability
- Game server availability

### Matchmaking
- P50 Queue Time
- P95 Queue Time
- Match Allocation Failure

### Game Server
- Tick P50 / P95 / P99
- Tick Overrun Count
- CPU
- Memory
- Active Rooms
- Connected Players

### Network
- Player RTT P50 / P95
- Jitter
- Disconnect Rate

### Gameplay Reliability
- Match Completion Rate
- Unexpected Match Abort Rate
- Duplicate Damage Event
- Invalid Combat State

---

## 11. 建議初期 SLO 範例

這些只作為工程目標起點，後續依實測修正。

```text
Match Completion Rate > 99%
Unexpected Disconnect < 1%
Matchmaking P95 < 5 sec
Tick P95 < Tick Budget 60%
Critical Server Error < 0.1%
```

---

## 12. Observability

推薦：

```text
Game Server
   │
   ├─ Metrics
   ├─ Logs
   └─ Traces
       │
       ▼
OpenTelemetry
   │
   ├─ Prometheus
   └─ Log / Trace Backend
       │
       ▼
Grafana
```

---

## 13. Grafana Dashboard

建議顯示：

### Service
- Online Players
- Active Matches
- Active Game Servers
- Match Start Rate
- Match Completion Rate

### Infrastructure
- CPU
- Memory
- Network
- Event Loop Lag

### Game Loop
- Tick P50
- Tick P95
- Tick Overrun

### Network
- RTT
- Disconnect
- Reconnect

### Gameplay
- Weapon Pick Rate
- Weapon Win Rate
- Average Damage
- Average Match Duration
- Parry Success Rate

---

## 14. Graceful Drain

部署時不能直接殺掉有玩家的 Game Server。

流程：

```text
ACTIVE
   ↓
DRAINING
   ↓
停止接受新 Match
   ↓
讓既有 Match 繼續
   ↓
Active Rooms = 0
   ↓
Terminate
```

---

## 15. Horizontal Scaling

當玩家增加：

```text
Game Server #1
Game Server #2
Game Server #3
...
```

Matchmaker 根據：

- CPU
- Memory
- Active Rooms
- Players
- Region

分配新 Room。

---

## 16. Autoscaling

可使用指標：

- CPU
- Active Rooms
- Connected Players
- Tick P95

不要只看 CPU。

Game Server 可能 CPU 不高，但 Active Room 已經達到可接受上限。

---

## 17. Failure Policy

短局 Battle Royale 不一定需要昂貴的 Match Migration。

第一版：

```text
Game Server Crash
→ Match Abort
→ 玩家回 Lobby
→ 記錄 Incident
```

先把：

- Crash Rate
- Root Cause
- Recovery Time

做好。

---

## 18. CI/CD

```text
Git Push
   ↓
GitHub Actions
   ↓
Type Check
   ↓
Unit Test
   ↓
Combat Tests
   ↓
Build
   ↓
Bot Match Test
   ↓
Docker Image
   ↓
Staging
   ↓
Smoke Test
   ↓
Production
```

---

## 19. Bot Match Test

每次部署自動測：

- 8 Bots Spawn
- Attack 正常
- Damage 正常
- Guard 正常
- Shrinking Zone 正常
- 玩家會死亡
- Match 只留下 1 Winner
- Room 正常結束

---

## 20. SRE 作品集價值

此專案可以實際展示：

- Real-time service
- WebSocket
- Server Authority
- Latency
- Reliability
- Observability
- Capacity Planning
- Load Balancing
- Graceful Deployment
- Incident Analysis
- CI/CD
- Autoscaling

重點不是「用了 Kubernetes」，而是能說明：

> 為什麼這樣設計、如何量測、故障時怎麼處理、如何知道系統正在變差。
