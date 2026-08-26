# 視覺風格與美術方向

## 1. 核心風格

建議定位：

> Blocky / Low-Poly Competitive Sword Combat

不是 Minecraft Clone。

角色可以由方塊構成，但：

- 比例更適合戰鬥
- 動作更流暢
- 武器更有輪廓
- VFX 更具有競技遊戲可讀性

---

## 2. 角色設計

推薦比例：

- 頭部略大
- 軀幹寬
- 四肢清楚
- 手臂長度足以讀出劍路
- 腿部不宜過短

目的：

> 玩家在 10～20 公尺距離仍能看出對手正在做什麼。

---

## 3. 方塊人不是「僵硬動畫」

視覺方塊化，但動畫必須：

- Anticipation
- Follow Through
- Recovery
- Weight Shift
- Foot Placement
- Upper / Lower Body Coordination

尤其重武器要有重量感。

---

## 4. 武器輪廓

六把武器必須不用 UI 也能一眼辨識。

### Longsword
- 中等長度
- 標準護手
- 平衡比例

### Katana
- 細長
- 單刃
- 明顯東方輪廓

### Greatsword
- 大尺寸
- 厚
- 明顯重量感

### Spear
- 極長輪廓
- 尖端清楚

### Dual Blades
- 左右手雙武器
- 快速視覺節奏

### Rapier
- 細長直刺
- 輕巧護手

---

## 5. 色彩

第一版不需要高寫實 PBR。

推薦：

- 低飽和場景
- 玩家略高對比
- Weapon VFX 使用清楚的高亮
- Team / Target / Danger 用 UI 而不是改整個模型顏色

---

## 6. Lock-on 視覺

鎖定目標時：

- 目標腳下 Ring
- 或胸口小型 Reticle
- Target HP
- Target Distance 可選

避免太大的 MMO UI。

---

## 7. 攻擊視覺

每個攻擊至少包含：

- Weapon Trail
- Body Motion
- Contact Spark
- Recoil
- Sound
- Camera Impulse

不要讓傷害只靠數字表示。

---

## 8. Block

普通格擋：

- 小型金屬火花
- 劍停頓
- 小 Camera Impulse
- 低強度金屬聲

---

## 9. Perfect Guard / Parry

Parry 必須視覺高於普通 Block 一個等級。

建議：

- 大量火花
- 武器彈開
- 0.06～0.10 秒 Hit Stop
- 強烈音效
- Camera Kick
- Attacker Stagger Pose
- 短暫高亮 VFX

---

## 10. Dodge

Dodge 不一定要 Souls 式翻滾。

Blocky 角色可嘗試：

- Quick Side Step
- Back Step
- Short Roll

第一版建議優先 Side Step / Back Step，動作更清楚且不容易讓 Camera 混亂。

---

## 11. 場景

第一版 Combat Lab：

- 灰盒 Arena
- 平地
- 少量柱子
- 不做複雜高低差

正式 Arena 再加入：

- Ruins
- Bridge
- Tower
- Courtyard
- Small Elevation
- Cover

---

## 12. Battle Royale 場景原則

地圖不要大。

目標：

> 玩家 20～30 秒內可以橫跨主要區域。

Battle Royale 的用途不是探索，而是：

> 讓玩家持續遇敵。

---

## 13. Final Duel

最後兩人時：

- 音樂轉換
- UI 顯示 FINAL DUEL
- 外圍視覺降低
- Arena 收縮
- Camera 更偏決鬥構圖
- 觀戰焦點集中

讓每局最後 20～40 秒具有宣傳片價值。

---

## 14. Skin 系統

因為角色為 Blocky：

可低成本製作：

- 頭部
- 身體
- 肩甲
- Cape
- Helmet
- Weapon Skin

Skin 不應影響 Hitbox 或武器判定。

---

## 15. 美術優先級

優先：

1. Animation Readability
2. Hit Feel
3. Weapon Silhouette
4. Camera
5. Lighting
6. Environment Detail

不優先：

- 高解析材質
- 寫實臉部
- 複雜毛髮
- 大量骨骼細節
