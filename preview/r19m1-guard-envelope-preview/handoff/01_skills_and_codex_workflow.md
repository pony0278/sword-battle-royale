# Skills 與 Codex 工作流

## 1. 目標

此專案的 Skill 配置不是追求「裝最多」，而是讓 Codex 在不同任務中能依照正確的工程流程工作。

核心需求分成五類：

1. Three.js 遊戲開發
2. 近戰戰鬥與 Game Feel
3. 第三人稱 Camera / Lock-on
4. 多人即時網路
5. QA / Debug / Release

---

## 2. 建議優先 Skill

### A. `develop-web-game`
用途：
- Web 遊戲開發流程
- 實際啟動遊戲
- Playwright 測試
- Console Error 檢查
- Screenshot / Smoke Test
- 修改後驗證

最重要的價值不是幫忙「寫更多程式」，而是強迫開發流程包含：

> 修改 → 啟動 → 實際操作 → 檢查錯誤 → 驗證結果

---

### B. Three.js Game Skills

建議能力範圍：

- `threejs-game-director`
- `threejs-gameplay-systems`
- `threejs-aaa-graphics-builder`
- `threejs-game-ui-designer`
- `threejs-debug-profiler`
- `threejs-qa-release`

在本專案中：

#### Gameplay Systems
負責：
- Combat state
- Attack timing
- Dodge
- Lock-on
- Stamina
- Hitbox
- Player controller

#### Graphics Builder
負責：
- Blocky 場景
- 武器材質
- Lighting
- Slash VFX
- Spark
- Impact VFX

#### UI Designer
負責：
- HP / Stamina
- Lock-on Marker
- Kill Feed
- Match Timer
- Shrinking Zone
- Final Duel UI

#### Debug Profiler
負責：
- FPS
- Draw Calls
- Memory
- Animation Bug
- Physics / Collision Debug
- Network Debug Overlay

#### QA Release
負責：
- Smoke Test
- Bot Match Test
- Match Completion
- Regression Test
- Build 驗證

---

### C. `game-feel`

此 Skill 對本專案非常重要。

需要集中處理：

- Hit Stop
- Camera Kick
- Camera Shake
- Impact Sound
- Weapon Trail
- Sparks
- Enemy Recoil
- Attack Anticipation
- Recovery
- Easing

Parry 應該是遊戲中最強烈的 Feedback Event 之一。

---

### D. `camera-systems`

用途：

- Third-person Camera
- Souls-like Lock-on
- Target Switching
- Camera Spring
- Collision Avoidance
- Camera Framing
- Multi-enemy Situation

此遊戲 Camera 不是單純跟隨玩家，而是戰鬥系統的一部分。

---

### E. `multiplayer-game`

正式進入 Online Multiplayer 階段才開啟高優先級。

用途：

- Room
- Matchmaking
- State Sync
- Server Authority
- Latency
- Prediction
- Interpolation
- Reconciliation
- Multiplayer QA

---

## 3. ChatGPT 與 Codex 分工

### ChatGPT
適合：
- 核心玩法
- 武器設計
- Combat Rules
- 技術方案討論
- 架構審查
- 平衡分析
- SRE 設計
- Roadmap

### Codex
適合：
- Repo 修改
- 寫程式
- 建立測試
- Debug
- 跑 Build
- 跑 Browser Test
- Commit / PR
- Regression Fix

---

## 4. 建議任務路由

### 任務：改善 Parry 手感
主要 Skill：
- game-feel
- threejs-gameplay-systems

### 任務：Lock-on Camera 抖動
主要 Skill：
- camera-systems
- threejs-debug-profiler

### 任務：多人 Attack 判定不同步
主要 Skill：
- multiplayer-game
- threejs-debug-profiler

### 任務：畫面掉幀
主要 Skill：
- performance-optimization
- threejs-debug-profiler

### 任務：改完是否真的正常
主要 Skill：
- develop-web-game
- threejs-qa-release

---

## 5. Skill 使用原則

不要每次任務把全部 Skill 都塞入 Context。

錯誤方式：

- multiplayer
- game design
- UI
- graphics
- SRE
- camera
- QA
- audio

全部同時參與一個很小的 Bug。

正確方式：

> 一個任務只調用 1～3 個最相關 Skill。

---

## 6. 第一階段 Skill 組合

Combat Lab 建議：

1. `develop-web-game`
2. `threejs-gameplay-systems`
3. `game-feel`
4. `camera-systems`
5. `threejs-debug-profiler`

暫時不需要：

- Multiplayer
- Redis
- Kubernetes
- Autoscaling
- Matchmaking

先證明戰鬥好玩。

---

## 7. Multiplayer 階段 Skill 組合

正式做 1v1 Online：

1. `multiplayer-game`
2. `develop-web-game`
3. `threejs-gameplay-systems`
4. `threejs-debug-profiler`
5. `threejs-qa-release`

SRE / Production 階段再加入：

- performance optimization
- observability
- CI/CD
- infrastructure / deployment 類 Skill
