# 技術選型與程式架構

## 1. 建議技術棧

### Client
- TypeScript
- Three.js
- Rapier 3D
- HTML / CSS
- Web Audio API

### Server
- Node.js
- TypeScript
- Colyseus

### Shared
- Shared TypeScript Types
- Shared Combat Data
- Shared Protocol Definitions

### Production
- Redis
- PostgreSQL
- Docker
- Reverse Proxy / Load Balancer
- Prometheus
- Grafana
- OpenTelemetry

---

## 2. 為什麼繼續使用 Three.js

此專案需要：

- Third-person 3D
- Blocky Character
- Weapon Animation
- Lock-on Camera
- VFX
- Web Browser Deployment

Three.js 已能提供：

- Scene
- Camera
- Mesh
- AnimationMixer
- GLTF
- Shader
- Instancing
- Post Processing

第一版甚至可以完全不使用正式角色 GLB。

---

## 3. 方塊人角色技術

角色外觀：

- Head
- Torso
- Upper Arm
- Lower Arm
- Hand
- Upper Leg
- Lower Leg
- Foot

每一部位為簡單 Box Mesh。

但內部仍建立：

- Hierarchy
- Joint Pivot
- Animation Rig

目的：

- 快速原型
- 動作輪廓清楚
- 低 Polygon
- 容易產生多人角色
- 容易換 Skin

---

## 4. Rapier 3D 職責

使用 Rapier 處理：

- Ground Collision
- World Collision
- Character Collision
- Raycast
- Shape Cast
- Obstacle Detection

不要讓 Rapier 主導：

- Sword Damage
- Attack Timing
- Parry Timing

武器攻擊應由 Combat Engine 管理。

---

## 5. Combat Engine

核心模組：

```text
CombatController
├─ CombatStateMachine
├─ AttackController
├─ GuardController
├─ DodgeController
├─ StaminaController
├─ TargetLockController
├─ HitboxSystem
├─ HurtboxSystem
└─ CombatEventBus
```

---

## 6. Attack 不採純物理碰撞

不建議：

```text
Sword RigidBody
→ Physics Collision
→ Damage
```

建議：

```text
Attack Timeline
→ Active Window
→ Sweep / Hitbox Query
→ Hurtbox
→ Combat Validation
→ Damage / Block / Parry
```

這樣更容易：

- 調平衡
- 重播
- Multiplayer Validation
- Lag Compensation
- Unit Test

---

## 7. Frame Data Driven

每個招式由資料定義。

範例：

```ts
type AttackDefinition = {
  id: string;
  windupMs: number;
  activeMs: number;
  recoveryMs: number;
  damage: number;
  staminaCost: number;
  moveDistance: number;
  hitboxProfile: string;
  guardDamage?: number;
  tags?: string[];
};
```

例如 Katana Light Attack：

```text
Windup      180 ms
Active      120 ms
Recovery    280 ms
Damage      22
Stamina     14
Move        0.7 m
```

Greatsword：

```text
Windup      420 ms
Active      180 ms
Recovery    620 ms
Damage      48
Stamina     32
```

---

## 8. Client / Server 責任切分

### Client
負責：

- Rendering
- Camera
- Input
- Local Animation
- Prediction
- VFX
- Audio
- UI
- Lock-on Composition

### Server
負責：

- Player Authoritative State
- HP
- Stamina Validation
- Attack Validation
- Parry Validation
- Death
- Match State
- Shrinking Zone
- Winner
- Anti-cheat 基礎

---

## 9. Shared Package

推薦 Monorepo：

```text
/apps
  /client
  /game-server

/packages
  /combat
  /protocol
  /shared-types
  /weapon-data
```

目的：

- Client / Server 使用相同武器數據
- 避免 Damage / Timing 各寫一份
- 減少版本漂移

---

## 10. Colyseus

主要用途：

- Rooms
- Matchmaking
- WebSocket
- State Synchronization
- Session
- Match Lifecycle

每個 Match 可以是一個 Room。

例如：

```text
GameServer #1
├─ Room A — 8 Players
├─ Room B — 6 Players
└─ Room C — Final Duel
```

---

## 11. 第一版不要急著加入

Combat Lab 階段不需要：

- Redis
- PostgreSQL
- Kubernetes
- Autoscaling
- Distributed Tracing

第一階段只需要：

```text
Vite
TypeScript
Three.js
Rapier
Combat Engine
```

---

## 12. 技術演進路線

### V0
Single Player Combat Lab

### V1
Player vs Bot

### V2
4 Bots FFA

### V3
Online 1v1

### V4
8 Player Battle Royale

### V5
Production Infrastructure
