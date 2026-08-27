# Directional Guard V1 — Triangle Forward Guard

## 1. 目標

建立 Longsword 第一版三向防禦姿勢，作為 Directional Combat V1 的 Guard 視覺基礎。

核心不是單純把劍移到上／左／右，而是讓角色形成一個**緊湊、前壓、攻守一體的 Triangle Guard**：

- 右手持劍。
- 左手為空手，但必須主動參與防守姿勢，不可自然垂放。
- `劍尖 + 持劍手 + 空手` 形成朝向前方 Target 的視覺三角形。
- 劍與雙手都集中在角色中線附近，縮小胸口、腹部、腋下的視覺空隙。
- 劍尖持續威脅對手，不做只會「架著等挨打」的被動姿勢。
- TOP / RIGHT / LEFT 三方向必須在遠距離 silhouette 上可讀。

第一版先驗證：

> 即使不看 HUD，只看角色姿勢，也能大致判斷目前 Guard Direction。

---

## 2. 設計原則

### 2.1 Guard 不是 Block Reaction

必須分成兩個概念：

```text
Guard Stance
玩家正在主動防禦的持續姿勢

Block Reaction
敵方攻擊真正撞上防禦後的瞬間反應
```

不可用同一支動畫同時承擔兩者。

### 2.2 KayKit 動畫負責身體重量

不從零用程序化骨骼擺出整個 Guard。

使用 KayKit melee pack 作為 authored full-body base：

- `Melee_Block` — Guard Enter 候選。
- `Melee_Blocking` — Guard Hold / Guard Base 候選。
- `Melee_Block_Hit` — Successful Block Reaction 候選。
- `Melee_Block_Attack` — Guard Counter 候選。

這四支 clip 已存在於目前 repo 的 KayKit melee pack。

實作時必須先在 Guard Lab 中逐支檢查 source motion；若 clip 的實際內容與名稱語意不完全一致，可交換 Enter/Hold/Reaction 的用途，但不得改變本規格的狀態分層。

### 2.3 Directional Pose 使用 Additive Layer

三方向不是三支完全獨立的 full-body GLB。

推薦結構：

```text
KayKit Melee_Blocking
        ↓
Full-body authored motion
        ↓
Longsword Triangle Guard Additive Layer
        ↓
TOP / RIGHT / LEFT
```

Additive Layer 只調整必要的上半身骨骼，保留 KayKit 的腳步、骨盆、重心與身體生命感。

---

## 3. Triangle Forward 母姿勢

### 3.1 三角形定義

Triangle Guard 的主要視覺頂點：

```text
              Sword Tip
                 ▲
                / \
               /   \
      Off Hand •---• Weapon Hand
                 \
                  \
                Torso
```

三角形不要求幾何上完全等腰；要求的是 silhouette 上清楚形成「尖端朝敵人」的楔形結構。

### 3.2 劍尖

- 指向 Lock-on Target 的上胸至臉部區域。
- 不可長時間偏向地面或角色身側。
- 三向 Guard 切換時，劍尖仍應維持前向威脅感。
- 不要求每幀 IK 完全黏住 Target；第一版可先用 local pose offset，後續再評估 aim correction。

### 3.3 持劍手（右手）

- 拳頭保持在胸骨至下巴高度區間。
- 手肘內收，禁止大幅張開腋下。
- 不可讓右手離 torso 過遠，避免角色看起來像展示 Pose。
- Guard 切換主要靠肩、前臂、手腕重新排列，不靠整隻手臂大幅甩動。

### 3.4 空手（左手）

空手是本 Guard 的關鍵特色，不可垂放。

- 左前臂抬起。
- 左手保持在身體中線附近，約位於胸口至劍柄高度。
- 左手與右手必須形成可讀的三角形底邊。
- 左肘同樣內收。
- 視覺功能是保護中線、壓縮胸腹空隙、建立「隨時可撥、壓、干擾、反擊」的戰鬥感。
- 第一版不賦予空手獨立 hitbox 或抓取功能。

### 3.5 軀幹

- 身體不可完全正面攤開。
- 骨盆／胸口略微側身，初始視覺目標約 `20°–35°`，最終以 Action Studio 實測為準。
- 胸口略收，肩膀不要向外展開。
- 頭部仍面向 Target。
- 可有輕微前壓，但不可駝背。

### 3.6 下半身

第一版下半身主要沿用 KayKit authored motion。

要求：

- 膝蓋有戰鬥準備感。
- 重心穩定，不後仰。
- 不因方向切換而重播 footwork。
- Additive Guard Layer V1 不直接覆寫 root / hips / legs。

---

## 4. 三方向 Guard 視覺規格

方向名稱一律以**防守者自己的 local view** 命名。

```text
TOP
RIGHT
LEFT
```

目前只定義姿勢語意，不在本階段決定 attacker-local attack direction 與 defender-local incoming sector 的最終鏡射規則。

### 4.1 TOP Guard

目標：封住頭頂／上中線，同時保持劍尖仍威脅前方。

- 右手提高至上胸／下巴以上。
- 劍身斜上，不可完全橫躺在頭頂。
- 劍尖仍朝 Target，而不是指向天空。
- 左手同步提高但保持在右手下方或左下方，維持三角底邊。
- 雙肘仍收，不做「雙手舉高露出整個腹部」的姿勢。
- silhouette 應該是三方向中最高、最尖的楔形。

### 4.2 RIGHT Guard

目標：右側封擋＋立即右側反擊的準備姿勢。

- 右手位於右胸前方，但距離 torso 不可過大。
- 劍身略偏角色右側。
- 劍尖仍向 Target 中線收回，避免整支劍平移到身體外側。
- 左手留在胸前中線偏左，與右手建立緊湊底邊。
- 胸口可有少量右側蓄勢，但不可把右肩完全打開。

### 4.3 LEFT Guard

目標：跨過中線封住左側，但仍保留右手持劍的不對稱美感。

- 右手向中線／左側移動，但不可像鏡像複製 RIGHT。
- 劍身跨過角色中線。
- 左手可略向前或向內收，避免右手跨線後與空手互相穿插。
- 胸口可有少量旋轉輔助，保持身體空隙小。
- silhouette 應明確與 RIGHT 不同，但仍能辨認同一套 Triangle Guard 語言。

---

## 5. Guard 動畫狀態流程

第一版 Action Studio / runtime presentation 狀態：

```text
Neutral / Lock Strafe
        ↓ RMB down
Guard Enter
        ↓
Guard Hold (TOP / RIGHT / LEFT)
        ├─ direction change → blend to another directional additive pose
        ├─ successful block → Block Hit
        ├─ perfect parry → Parry presentation / counter window
        └─ RMB up → Guard Exit / return to locomotion
```

KayKit 候選 mapping：

```text
Guard Enter      → Melee_Block
Guard Hold Base  → Melee_Blocking
Block Hit        → Melee_Block_Hit
Counter          → Melee_Block_Attack
```

`Melee_Blocking` 應作為可持續 Guard 的主要 authored body base；若它不是可自然 loop/hold 的 clip，Guard Lab 必須提供 freeze-at-pose / sample-time 的實驗模式，選出最適合的 hold frame 或改用 `Melee_Block` 的穩定段。

---

## 6. Direction Blend

第一版目標 blend：

```text
0.12s
```

Action Studio 必須允許調整：

```text
0.06s – 0.20s
```

驗收重點：

- 方向切換要快，但不能瞬間 snap。
- 快速 `LEFT → TOP → RIGHT` 時，角色不可出現手臂翻轉、穿胸或突然回 Neutral。
- 切方向不應重播 Guard Enter。
- 下半身 authored motion 必須保持連續。

---

## 7. Additive Bone Scope

V1 建議只允許以下骨骼進入 Directional Guard additive layer：

```text
chest
upperarm.r
lowerarm.r
wrist.r
upperarm.l
lowerarm.l
wrist.l
```

可選：

```text
spine
head / neck（只做極小 correction）
```

禁止 V1 Direction Layer 直接覆寫：

```text
root
hips
upperleg.*
lowerleg.*
foot.*
```

實作建議：

```text
sample KayKit base quaternion
        ×
local directional quaternion offset
        ↓
final guard pose
```

offset 應以 local quaternion 表示，不使用 hard-coded world Euler 作為 runtime 最終資料。

---

## 8. 建議資料結構

新增 source-controlled metadata，例如：

`src/combat/longsword-guard-metadata.js`

建議概念：

```js
export const LONGSWORD_GUARD = {
  weapon: 'longsword',
  base: {
    enterClipId: 'Melee_Block',
    holdClipId: 'Melee_Blocking',
    blockHitClipId: 'Melee_Block_Hit',
    counterClipId: 'Melee_Block_Attack',
  },
  blendSeconds: 0.12,
  directions: {
    top: {
      offsets: {
        // local quaternion offsets, authored in Guard Lab
      },
    },
    right: {
      offsets: {},
    },
    left: {
      offsets: {},
    },
  },
};
```

注意：本規格**不要求現在手算 quaternion 數字**。這些 offset 應在 Guard Lab 實際調 Pose 後再固化為 canonical metadata。

---

## 9. Action Studio — Directional Guard Lab V1

新增一個獨立區塊：

```text
Directional Guard Lab

Base Motion
KayKit Melee

[ ▶ Guard Enter ]
[ Hold Guard ]

Direction
[ LEFT ] [ TOP ] [ RIGHT ]

Blend
[ 0.12s ]

Triangle Debug
[ ] Show hand triangle
[ ] Show sword-tip forward ray
[ ] Show torso center line

[ ▶ Block Hit ]
[ ▶ Counter ]

[ Reset Direction Offsets ]
[ Export Guard Metadata ]
```

### 9.1 必要 Debug Visuals

`Show hand triangle`：

- 在 `Sword Tip`、`Weapon Hand`、`Off Hand` 三點畫 debug line。
- 目的是檢查三角形是否緊湊、是否朝 Target。
- 只屬於 authoring/debug，不進正式遊戲畫面。

`Show sword-tip forward ray`：

- 顯示劍尖朝向。
- 用來確認三方向切換後仍大致對著 Target。

`Show torso center line`：

- 協助判斷雙手是否離中線太遠、胸口空隙是否過大。

### 9.2 Guard Pose Authoring Controls

Guard Lab 不必一開始做完整動畫編輯器。

最低需求：

- 選方向。
- 選骨骼。
- 用既有 Action Studio gizmo / rotation editing 調 local offset。
- 可即時從 LEFT / TOP / RIGHT 來回切換比較。
- 可 reset 單一方向。
- 可 export/copy canonical offsets。

---

## 10. Attack / Guard Direction Schema 邊界

目前已存在 Longsword attack motion metadata：

```text
TOP   → UAL1/Sword_Attack      → 0.43s
RIGHT → UAL2/Sword_Regular_A   → 0.23s
LEFT  → UAL2/Sword_Regular_B   → 0.30s
```

Guard V1 先使用：

```text
guardDirection = 'top' | 'right' | 'left'
```

未來 authoritative combat 應明確區分：

```text
attackDirection   // attacker-local
incomingDirection // defender-local
guardDirection    // defender-local
```

不要讓單一 `direction` 同時代表三種座標語意。

**本 Guard Lab PR 不實作 attack → incoming sector 的正式判定。**

---

## 11. Block / Parry Presentation Boundary

Guard Lab 只負責 presentation / authoring。

### Normal Block Presentation

候選：

```text
Melee_Block_Hit
+
Combat Feel: Block
```

包含：

- client-side hitstop
- spark / flash
- attacker recoil presentation
- camera impulse
- defender block reaction

### Perfect Parry Presentation

使用現有 `Perfect Parry` Combat Feel Profile。

Parry 是否成功仍由未來 authoritative combat rule 判定；Guard Lab 只需要提供手動 Preview 按鈕測效果。

Server simulation 絕不能因 presentation hitstop 暫停。

---

## 12. 第一版不做的事情

Directional Guard Lab V1 明確 Out of Scope：

- 不實作完整 PvP block resolution。
- 不實作 network authority。
- 不實作 stamina damage。
- 不實作 guard break。
- 不實作 attack incoming-sector 鏡射規則。
- 不實作 off-hand 抓劍／推人 hitbox。
- 不為 TOP / RIGHT / LEFT 製作三支新的 GLB。
- 不改已確認的 Longsword attack contact metadata。
- 不把 Combat Feel Profile 綁死到 Guard animation。

---

## 13. 實作階段

### G1 — KayKit Guard Source Review

- Action Studio 快速播放 `Melee_Block`。
- 播放 `Melee_Blocking`。
- 播放 `Melee_Block_Hit`。
- 播放 `Melee_Block_Attack`。
- 確認各 clip duration、loop/hold 行為與武器姿態。
- 選定 Guard Hold 的 base clip / sample strategy。

完成條件：

> 找到一個可穩定承載 Triangle Guard additive layer 的 authored base。

### G2 — Triangle Guard Lab

- 新增 LEFT / TOP / RIGHT 選擇。
- 新增 local additive pose layer。
- 新增 blend。
- 新增 triangle / sword ray / center-line debug。

完成條件：

> 三向都形成緊湊 Triangle Guard，而且快速切換不破圖。

### G3 — Canonical Guard Metadata

- 將實測完成的 local quaternion offsets 存進 `longsword-guard-metadata.js`。
- 加入 tests 驗證三方向 metadata 完整。
- local UI 實驗值與 canonical repo defaults 分離。

完成條件：

> 每次開 Action Studio 都能重現相同 Longsword 三向 Guard。

### G4 — Block / Parry Preview

- 接 `Melee_Block_Hit`。
- 接 Block Combat Feel。
- 接 Perfect Parry Combat Feel 的手動 preview。
- 接 `Melee_Block_Attack` Counter preview。

完成條件：

> 單一 Dummy 場景可完整預覽 Guard → Block / Parry → Counter 的 presentation chain。

### G5 — Directional Combat Runtime（後續 PR）

只有 G1–G4 視覺與操作語言確認後才開始：

- `ActionDefinition` direction schema。
- attackDirection / incomingDirection / guardDirection。
- block match rule。
- perfect parry timing。
- authoritative combat integration。

---

## 14. 視覺驗收條件

Triangle Guard V1 必須全部通過：

1. 角色在 Guard 時不能像普通 Idle 加一支劍。
2. 空手不可垂放。
3. 劍尖、持劍手、空手形成明確前向三角。
4. 雙肘不可大幅外張。
5. 胸口／腹部的視覺空隙明顯小於原 KayKit Block base。
6. 劍尖大致威脅 Lock-on Target。
7. TOP / RIGHT / LEFT 不看 HUD 仍可辨識。
8. `LEFT → TOP → RIGHT` 連續快速切換無 snap、穿模、手臂翻轉。
9. Guard direction change 不重播 Guard Enter。
10. Block Hit 之後能自然回到目前 Guard Direction，而不是回 Neutral。
11. Counter 結束後可回 Neutral 或 Guard，由之後 combat state rule 決定，但不得卡在反擊最後一幀。
12. 全部 Guard presentation 不影響 authoritative server tick。

---

## 15. 成功標準

Directional Guard V1 的成功不是「三個方向能切換」。

真正成功條件：

> 玩家看到角色縮成一個劍尖朝敵、雙手護住中線的 Triangle Guard 時，會直覺覺得這是一個隨時能擋、撥、刺、反擊的戰鬥姿勢；三個方向只是同一套戰鬥語言的不同封鎖面。

在這個視覺語言成立以前，不進入正式 Directional Combat 判定實作。
