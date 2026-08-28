# 武器、技能與道具

## 1. 設計原則

六把武器不是六個數值版本。

而是：

> 六種不同戰鬥人格。

每把武器都必須在以下至少兩項明顯不同：

- Range
- Speed
- Damage
- Recovery
- Guard Ability
- Mobility
- Skill
- Counter Style

---

# 2. Longsword

## 定位
Balanced / Beginner Friendly

## 特性
- 中等速度
- 中等距離
- 中等傷害
- Guard 穩定

## 招式
Light Combo：
- Slash
- Reverse Slash
- Thrust

Heavy：
- Overhead Strike

## Unique Skill — Guard Counter
成功 Block 後短時間內：

> 下一次 Attack 速度提升並具有額外 Stagger。

## 弱點
沒有極端優勢。

---

# 3. Katana

## 定位
Timing / Counter

## 特性
- 快速
- Recovery 短
- Guard 較弱
- 高度依賴 Timing

## 招式
Light：
- Quick Cut

Heavy：
- Draw Slash

## Unique Skill — Iai Counter
短暫進入 Iai Stance。

若敵人在 Window 內攻擊：

> 瞬間拔刀反擊。

如果沒有抓到 Timing：

> 產生明顯 Recovery。

## 弱點
持續 Guard 能力差。

---

# 4. Greatsword

## 定位
Power / Prediction

## 特性
- Damage 高
- Attack 慢
- Recovery 長
- Guard Damage 高
- 大範圍

## Light
- Heavy Horizontal Slash

## Heavy
- Charged Overhead

## Unique Skill — Unstoppable Cleave
短暫獲得高 Poise：

> 攻擊不容易被普通 Light Hit 打斷。

並造成大範圍 Slash。

## 弱點
Miss 之後容易被 Punish。

---

# 5. Spear

## 定位
Range Control

## 特性
- 最長攻擊距離
- Thrust 強
- 橫向範圍弱
- 貼身戰較差

## Light
- Quick Thrust

## Heavy
- Long Thrust

## Unique Skill — Lunge
向前快速突刺一段距離。

適合：

- Catch Roll
- Punish Retreat
- Finish

## 弱點
被快速武器貼身後壓力大。

---

# 6. Dual Blades

## 定位
Pressure / Mobility

## 特性
- 高攻速
- Combo 多
- Recovery 短
- 單擊 Damage 低
- Guard 弱

## Light
- Alternating Slash

## Heavy
- Double Cross Slash

## Unique Skill — Blade Rush
短距離高速連斬。

用途：

- Close Gap
- Pressure
- Finish

## 弱點
遇到 Greatsword / Perfect Guard 容易被反制。

---

# 7. Rapier

## 定位
Duel / Precision

## 特性
- 高精準
- 直刺
- Range 中長
- 橫向範圍小
- Counter 能力高

## Light
- Fast Thrust

## Heavy
- Piercing Thrust

## Unique Skill — Perfect Riposte
成功 Perfect Guard 後：

> 下一次 Thrust 具有極快 Startup 與高 Stagger。

## 弱點
被多人包圍非常弱。

---

# 8. 武器 Matchup

不是硬 Counter，而是傾向。

### Spear vs Dual Blades
Spear：
- 控距離有利

Dual Blades：
- 一旦貼身則有利

### Greatsword vs Dual Blades
Greatsword：
- 大範圍可懲罰 Rush

Dual Blades：
- 可利用 Greatsword Recovery

### Katana vs Longsword
Katana：
- Timing 優勢

Longsword：
- 穩定 Guard

### Rapier vs Greatsword
Rapier：
- 可懲罰大招空揮

Greatsword：
- 一次成功讀招可造成巨大壓力

---

# 9. Battle Royale 不採 Loot Power Creep

不建議：

```text
Common Sword
Rare Sword
Epic Sword
Legendary Sword
```

然後 Damage 越來越高。

原因：

- 技巧重要性下降
- 新玩家死於裝備差
- 容易變成一般 Loot Royale
- 武器平衡變複雜

---

# 10. 武器取得方式

推薦兩種方向。

## A. Match Start 選武器
玩家進場前選擇一把。

優點：
- 公平
- 容易學習
- 容易做 Matchup

## B. Spawn 區域取得
地圖開場提供六種固定武器。

優點：
- 有快速決策
- 仍不產生稀有度差距

第一版建議 A。

---

# 11. 道具設計

Battle Royale 可以有道具，但應偏 Utility。

### Healing Flask
- 少量補血
- 使用需要時間
- 可被打斷

### Stamina Tonic
- 短時間 Stamina Regen 加快

### Smoke Bomb
- 破壞視線
- Lock-on 暫時失效或距離降低

### Throwing Knife
- 低傷害
- 打斷 Healing
- 不作為主要輸出

### Shock Trap
- 地面短暫控制
- 使用數量有限

### Horn / Signal Item
- 可製造聲音誘導敵人
- 進階版本再考慮

---

# 12. 道具限制

為避免破壞決鬥核心：

- 每人道具槽少
- 每種道具效果短
- 不提供永久 Attack +30%
- 不提供永久 Defense +50%
- 不提供隨機傳說武器

核心仍是：

> Weapon Skill + Player Skill。

---

# 13. Final Duel 道具規則

Final Duel 可以：

### 方案 A
保留玩家剩餘道具。

### 方案 B
進入 Final Duel 時禁用部分 Utility。

### 方案 C
Final Duel 清除所有消耗品。

建議優先測試 A，再觀察是否會破壞最終公平性。

---

# 14. 第一版開發順序

不要一次做六把完整武器。

建議：

### Weapon Prototype 1
Longsword

驗證：
- Attack
- Guard
- Parry
- Dodge
- Lock-on

### Weapon Prototype 2
Greatsword

驗證：
- 武器速度差異
- Heavy Impact

### Weapon Prototype 3
Spear

驗證：
- Range Gameplay

確認三種武器已經真的玩起來不同，再擴充：

- Katana
- Dual Blades
- Rapier

---

# 15. 成功標準

六把武器完成後，玩家看到武器名稱時應該立刻知道：

- 我要怎麼打
- 我怕什麼
- 我擅長什麼
- 我的招牌技能是什麼

如果只是 Damage / Speed 不同，代表差異化還不夠。
