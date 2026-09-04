# 動作、操作與戰鬥系統

## 1. 戰鬥核心

核心循環：

```text
Lock-on
   ↓
Spacing
   ↓
Attack / Guard / Dodge
   ↓
Read Opponent
   ↓
Parry / Punish
   ↓
Reset Distance
```

---

## 2. 建議操作

### Keyboard + Mouse

| Input | Action |
|---|---|
| WASD | Move |
| Mouse | Camera |
| Q / MMB | Lock-on |
| Mouse Wheel | Switch Target |
| LMB | Light Attack |
| Hold LMB | Heavy Attack |
| RMB | Guard |
| Space | Dodge |
| Shift | Sprint |

技能鍵可在 Prototype 後決定：

- E
- R
- 或 LMB/RMB 組合

---

## 3. Free Movement

未 Lock-on：

- Camera-oriented movement
- Character 朝移動方向旋轉
- Sprint

---

## 4. Lock-on Movement

Lock-on 後切換到 Combat Strafe。

```text
W → 接近敵人
S → 後退
A → 繞左
D → 繞右
```

角色主要保持面向 Target。

---

## 5. Target Selection

Target Score 可綜合：

- Screen Center Distance
- World Distance
- Camera Angle
- Line of Sight
- Target Alive
- Target Threat

不應只找「世界距離最近」。

---

## 6. Target Switching

Mouse Wheel / Flick：

- Left Candidate
- Right Candidate

多名敵人時必須快速切換。

---

## 7. Light Attack

特色：

- Windup 短
- Recovery 短
- Damage 中低
- 可形成 Combo

用途：

- Punish
- Pressure
- Finish

---

## 8. Heavy Attack

特色：

- Windup 長
- Damage 高
- Stamina Cost 高
- Guard Damage 高

用途：

- Read Guard
- Punish Passive Player
- Zone Control

---

## 9. Guard

按住 RMB：

```text
Incoming Attack
→ Block
→ Stamina Damage
→ Recoil
```

若 Stamina 歸零：

```text
Guard Break
→ Stagger
→ Vulnerable
```

---

## 10. Perfect Guard / Parry

設計：

```text
Guard Input
   ↓
Perfect Window
   ↓
Incoming Hit
   ↓
PARRY
   ↓
Attacker Stagger
   ↓
Defender Counter Opportunity
```

Prototype 可先使用較寬容 Window，例如：

- 120 ms
- 150 ms
- 180 ms

再透過測試調整。

---

## 11. Counter

Parry 後不是自動造成巨大傷害。

建議：

> 給 Defender 一個高成功率 Counter Window。

玩家仍需按攻擊完成反擊。

好處：

- 保留操作感
- 不讓 Parry 變成單鍵必殺
- 不同武器可有不同 Counter

---

## 12. Dodge

Dodge 功能：

- Reposition
- Avoid Attack
- Break Pressure

可使用：

- Side Step
- Back Step
- Short Roll

Dodge 必須消耗 Stamina。

---

## 13. Stamina

Stamina 控制：

- Attack
- Heavy Attack
- Guard
- Dodge
- Sprint

避免玩家：

> 無限翻滾 + 無限攻擊。

---

## 14. Hitbox / Hurtbox

Hurtbox 建議：

- Torso
- Head
- Arms
- Legs

第一版不需要部位傷害。

Attack Hitbox：

- Sword Sweep
- Spear Thrust
- Arc
- Capsule / Segment Sweep

---

## 15. Attack Timeline

每個攻擊：

```text
START
  ↓
WINDUP
  ↓
ACTIVE
  ↓
RECOVERY
  ↓
END
```

只有 ACTIVE 可以造成傷害。

---

## 16. Combat State Machine

建議狀態：

```text
Idle
Move
Sprint
LockStrafe
AttackWindup
AttackActive
AttackRecovery
Guard
Parry
Stagger
Dodge
GuardBreak
Dead
```

避免多個動作互相覆蓋造成 Bug。

---

## 17. Cancel Rule

第一版必須非常保守。

例如：

- Light Attack Recovery 不可任意 Dodge Cancel
- Heavy Windup 某些早期 Frame 可 Cancel
- Parry Success 可進 Counter
- Dodge 可從 Neutral / Move 進入

Cancel Rule 是平衡的重要部分。

---

## 18. Hit Stop

命中：

- Light Hit：20～40ms
- Heavy Hit：40～70ms
- Parry：60～100ms

實際數值依感受調整。

Online 時 Hit Stop 主要是 Client Presentation，不能讓 Server Game Loop 暫停。

---

## 19. Multiplayer Combat

Client：

```text
Input
→ Local Animation
→ Prediction
→ Send Command
```

Server：

```text
Receive
→ Validate State
→ Resolve Combat
→ Broadcast Result
```

---

## 20. Lag Compensation

需要特別處理：

- Parry
- Dodge
- Fast Thrust
- Close-range Hit

可能使用：

- Client Input Timestamp
- Server History Buffer
- Limited Rewind

不能無限制相信 Client Timestamp。

---

## 21. 多人混戰問題

Battle Royale 最大風險：

> 3～4 人同時圍攻一人。

可使用以下機制控制：

- Target Lock Incentive
- Attack Recovery
- Friendly Collision / Body Blocking
- Limited Cleave
- Third-party Damage Tuning
- Guard Direction
- Target Switch Speed

先測試後再決定是否需要 Soft Duel 機制。

---

## 22. 核心成功條件

Combat Lab 完成標準：

> 即使只有一個 Dummy，玩家仍然願意反覆做 Attack、Guard、Parry、Dodge。

---

## 23. Directional Combat V1 — Longsword Canonical Light Attacks

三方向以**攻擊者自己的視角**命名，作為 Longsword 第一版共同戰鬥語言：

| Direction | External Motion | Natural Duration | Verified Contact |
|---|---|---:|---:|
| TOP | `UAL1/Sword_Attack` | 1.533s | **0.43s** |
| RIGHT | `UAL2/Sword_Regular_A` | 0.433s | **0.23s** |
| LEFT | `UAL2/Sword_Regular_B` | 0.533s | **0.30s** |

這三筆為 source-controlled canonical motion metadata，程式來源：

`src/combat/longsword-directional-metadata.js`

設計邊界：

- Direction / clip / contact timing 綁定於 motion metadata。
- Light / Heavy / Block / Parry 的 Combat Feel Profile **不綁動畫名稱**。
- Action Studio 可在本機用 slider 覆寫 contact timing 做實驗，但不會改掉 repository 中的 canonical 預設。
- `Fit + bind` 仍是明確的 authoring 操作；Natural Preview + Impact 使用 source 原速與 canonical contact。
