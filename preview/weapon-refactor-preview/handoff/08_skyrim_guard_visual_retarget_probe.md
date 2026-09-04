# G2 — Skyrim `shd_blockidle.hkx` Visual Retarget Probe

## 1. 目標

G2 只回答一個問題：

> `shd_blockidle.hkx` 在保留其 authored full-body weight / stance 的前提下，能否可靠地 retarget 到目前的 procedural Blockman rig，並成為 Longsword Guard Hold 的母姿勢？

本階段不是完成三向 Guard，也不是一次匯入整套 `shd_block*` 動作。

只測：

```text
shd_blockidle.hkx
        ↓
source skeleton decode
        ↓
retarget
        ↓
procedural Blockman rig
        ↓
Action Studio visual review
        ↓
ADOPT / ADOPT WITH CORRECTIONS / REJECT
```

若 `blockidle` 母姿勢不成立，停止 Skyrim Guard pipeline，不進一步浪費時間在 TOP / RIGHT / LEFT additive authoring。

---

## 2. 授權前提與資產邊界

目前 G2 以作者提供的 permission 為工程前提：

- Modification permission：允許修改檔案並發布修正／改善版本，需標註原作者。
- Conversion permission：允許轉換到其他遊戲使用，需標註原作者。

工程上因此允許進行：

- HKX decode / unpack。
- 骨架 retarget。
- 動畫 bake。
- 轉成 GLB / Three.js 可播放 animation clip。
- 為 Blockman rig 做必要的姿勢校正。

G2 仍採保守資產邊界：

- 原始 `.hkx` 不提交到 repository。
- 第一個 retarget 輸出先視為 experimental asset。
- 正式產品／公開資產包採用前，仍需在 credits / attribution 中保留作者資訊，並完成最後的 redistribution / commercial-use 檢查。

---

## 3. 為什麼先測 `shd_blockidle`

`shd_blockidle` 對目前 combat architecture 的角色最清楚：

```text
RMB down
  ↓
Guard Enter
  ↓
Guard Hold  ← G2 只驗證這裡
  ↓
Block / Parry / Counter
```

若 Guard Hold 成立，後續同一 retarget pipeline 才值得延伸到：

- `shd_blockanticipate` → Guard Enter
- `shd_blockhit` / `_vara` / `_varb` → Block Reaction
- `shd_blocktimed` → Perfect Guard / Parry presentation
- `shd_blockbash*` → Counter family

---

## 4. 技術前提

目前 repo 已具備：

- `THREE.Bone` procedural humanoid hierarchy。
- `AnimationMixer` external motion playback。
- external animation `source` abstraction。
- UAL1 / UAL2 retarget pipeline precedent。
- Action Studio Guard Source Review。

因此 G2 不新增第二套角色骨架，也不讓 runtime 直接讀 HKX。

瀏覽器 runtime 的目標格式仍然是 Three.js 可直接播放的 animation clip / GLB。

```text
HKX = authoring/import source
GLB = runtime/preview source
```

---

## 5. Offline Conversion Pipeline

### 5.1 Primary path

推薦優先採用能讀取 original Skyrim 32-bit HKX 的 Blender/Havok import workflow：

```text
shd_blockidle.hkx
+ matching Skyrim humanoid skeleton.hkx
        ↓
Blender source armature + action
        ↓
retarget to project semantic humanoid rig
        ↓
bake 30 fps
        ↓
GLB animation-only export
```

HKX animation 本身只提供匿名 bone track 順序，因此必須使用相符 `skeleton.hkx` 解出骨骼語意。

### 5.2 Fallback path

若 Blender importer 在當前環境不可用，可採：

```text
HKX
 ↓ hkxcmd / equivalent unpack
XML HKX or KF
 ↓ DCC import
source armature action
 ↓ retarget + bake
GLB
```

G2 不要求在 browser 端實作 Havok parser。

---

## 6. Source Skeleton Requirement

G2 的 blocking dependency：

> 必須取得與此動畫相符的 Skyrim humanoid `skeleton.hkx`。

原因：

- `hkaAnimationBinding` 只綁 transform-track index。
- animation file 不足以單獨可靠判定每一 track 是 pelvis、spine、upperarm 還是 hand。
- retarget 不可用猜測的 track index。

若沒有 matching skeleton，G2 只能完成 format probe，不能宣稱 visual retarget 成功。

---

## 7. Retarget Bone Scope V1

第一個 visual probe 只要求主要 humanoid chain：

| Source semantic | Blockman target |
|---|---|
| root | `root` |
| pelvis / hips | `hips` |
| lower spine | `spine` |
| upper spine / chest | `chest` |
| head | `head` |
| left upper arm | `upperarm.l` |
| left forearm | `lowerarm.l` |
| left hand | `wrist.l` / `hand.l` |
| right upper arm | `upperarm.r` |
| right forearm | `lowerarm.r` |
| right hand | `wrist.r` / `hand.r` |
| left thigh | `upperleg.l` |
| left calf | `lowerleg.l` |
| left foot | `foot.l` |
| right thigh | `upperleg.r` |
| right calf | `lowerleg.r` |
| right foot | `foot.r` |

G2 V1 忽略：

- fingers
- weapon bones
- shield bones
- twist bones
- IK helper bones
- facial bones
- cloth / physics helper bones

這些 source bones 不得阻止主要 body motion 的 visual probe。

---

## 8. Retarget Strategy V1

### 8.1 Rest-pose delta transfer

禁止直接複製 Skyrim local quaternion 到 Blockman bone。

基本策略：

```text
source rest transform
        ↓
source animated local transform
        ↓
extract local delta from source rest
        ↓
apply basis correction / axis correction
        ↓
compose onto Blockman rest transform
```

目標是保留「動作變化量」，而不是假設兩套 skeleton rest orientation 相同。

### 8.2 Rotation first

Guard Idle 第一版以 rotation retarget 為主。

- root motion：強制 in-place。
- hips translation：只有確認不造成漂移時才保留極少量 vertical/body-weight motion。
- limbs：不複製 source bone length / scale。
- target bone scale：保持 Blockman canonical rest scale。

### 8.3 30 fps bake

第一個輸出統一：

```text
30 fps
QuaternionKeyframeTrack
in-place
loop candidate
```

輸出 clip id：

```text
SKYRIM_GUARD/shd_blockidle
```

---

## 9. Shield-animation 特殊風險

`shd_blockidle` 很可能是 shield-oriented authored stance。

因此 G2 不用「左手看起來不像 Longsword Guard」作為立即 reject 條件。

我們分開評估兩層：

### Full-body value

重點：

- pelvis / foot stance
- weight distribution
- spine compression
- shoulder readiness
- combat breathing / life
- body silhouette stability

### Arm correction cost

重點：

- 左臂是否只需局部修正即可從 shield arm 轉成 off-hand Triangle Guard。
- 右手／右腕是否能自然承接 Longsword socket。
- 是否需要大量重做肩膀與 spine 才能救回姿勢。

只要 full-body value 高、arm correction cost 可接受，就仍可判定為 `ADOPT WITH CORRECTIONS`。

---

## 10. Action Studio G2 Review Mode

沿用現有 `Guard Source Review`，G2 增加 Skyrim visual probe 的最小能力即可，不先建立完整 Directional Guard Lab。

最低 UI：

```text
G2 Skyrim Guard Probe

Source
SKYRIM_GUARD/shd_blockidle

[ Play Natural ]
[ Loop ]
[ Freeze ]
[ Rest Pose ]

View
[ Front ] [ 3/4 ] [ Side ] [ Back ]

Debug
[ ] Show skeleton joints
[ ] Show sword hand socket
[ ] Show off-hand point
[ ] Show torso center line

Decision
[ ADOPT ]
[ ADOPT WITH CORRECTIONS ]
[ REJECT ]
```

G2 不加入 TOP / RIGHT / LEFT buttons。

---

## 11. Visual Acceptance Criteria

### 11.1 Hard fail

任一條成立即不能直接進下一階段：

- upper/lower arm 明顯翻轉 90° / 180°。
- 左右肢體互換。
- 肩膀或腿因 axis mismatch 爆開。
- pelvis/root 持續漂移。
- feet 大量滑動或離地。
- animation loop 時 rest-basis 不連續。
- sword socket orientation 無法用合理 calibration 修正。

### 11.2 Pass quality

希望達到：

- 頭、胸、骨盆方向自然一致。
- 重心看起來像主動防守，而不是 T-pose 上抬手。
- 雙腿提供穩定 combat base。
- shoulders 有 authored weight，而非程序化僵硬感。
- Guard Hold loop / sampled hold frame 至少有一種可用策略。

### 11.3 Triangle Guard compatibility

G2 只做 compatibility score，不在此階段正式 author Triangle Guard：

```text
A — 很容易校正成 Triangle Guard
B — 需要中等 upper-body additive correction
C — 幾乎要重做整個 upper body
```

只有 A / B 進 G3。

---

## 12. G2 子階段

### G2.1 — Decode Proof

產出：

- 確認可解碼 `shd_blockidle.hkx`。
- 取得 duration。
- 取得 transform track count。
- 確認 matching skeleton 可解析 bone order。

Pass：

> animation + skeleton 可以穩定讀出。

### G2.2 — Semantic Bone Mapping

產出：

- source semantic bone map。
- target Blockman bone map。
- axis / rest-pose correction table。

Pass：

> 主要 torso / arms / legs chain 全部有明確 mapping，不用猜 track index。

### G2.3 — First Bake

產出：

```text
SKYRIM_GUARD/shd_blockidle
30 fps
in-place
```

Pass：

> Three.js AnimationMixer 可以播放且無結構性爆骨。

### G2.4 — Action Studio Visual Review

測試：

- natural play
- loop
- freeze at representative frames
- front / side / 3/4 silhouette
- sword equipped

Pass：

> 可以做出 ADOPT / ADOPT WITH CORRECTIONS / REJECT 判斷。

### G2.5 — Decision Record

若通過，記錄：

```text
source: skyrim
clipId: SKYRIM_GUARD/shd_blockidle
role: guard-hold-base
retargetFps: 30
inPlace: true
triangleCompatibility: A | B
requiredCorrections: [...]
```

若 Reject，保留 G2 文件與測試結果，不讓 runtime / combat metadata 依賴此 clip。

---

## 13. G2 通過後才做的工作

只有 G2 判定 A / B 才進：

### G3 — Skyrim Guard Family Retarget

```text
blockanticipate
blockhit
blockhit_vara
blockhit_varb
blocktimed
blockbashintro
blockbash
blockbashpower
blockbashsprint
```

### G4 — Triangle Guard Additive Authoring

```text
Skyrim Guard Hold Base
        +
TOP / RIGHT / LEFT local quaternion offsets
```

### G5 — Runtime Guard State Integration

```text
RMB
→ Guard Enter
→ directional Guard Hold
→ Block / Perfect Guard
→ Counter
```

---

## 14. G2 最終成功定義

G2 完成不是「HKX 成功轉檔」。

真正成功定義是：

> 在目前 Blockman + Longsword 上播放 `shd_blockidle` 後，角色的 full-body authored weight 明顯優於純程序化 Guard；上半身只需要有限校正，就能繼續發展成 Triangle Forward Guard。

若達不到這個標準，即使技術上能播放，也應 Reject 此 source。