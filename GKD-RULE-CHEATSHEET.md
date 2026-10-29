# GKD 规则语法速查（给 AI 看的版本）

> 资料来源（逐条核对原文，2026-10-29）：
> - 选择器语法 <https://gkd.li/guide/selector>
> - 属性/方法 <https://gkd.li/guide/node>
> - 选择示例 <https://gkd.li/guide/example>
> - 查询优化 <https://gkd.li/guide/optimize>
> - API 字段 <https://gkd.li/api/>（RawSubscription / RawApp / RawAppGroup / RawGroupProps / RawRuleProps / RawAppRuleProps / RawCommonProps / RawGlobalGroup / RawGlobalRuleProps / Position / IntegerMatcher / StringMatcher）
> - 第三方教程 <https://github.com/wtwang1998/notebook/.../gkd-rule-tutorial.md>
>
> 离线副本：`C:\Users\PSKJ\Documents\GKD_DOC\`（`语法介绍.md` / `属性方法.md` / `选择示例.md` / `查询优化.md`，即上面前 4 篇的中文原文）。
> 权威度：**官方 API 字段页 > 上述 4 篇指南 > 第三方教程**；本文件已按此顺序校对过一遍。
> 本仓库约定另见 `CONTRIBUTING.md`、`Selectors.md`。

---

## 0. 心智模型（先记住这 6 条，能省掉 90% 的坑）

1. **匹配顺序是从右往左**：先找"末尾属性选择器"（默认即目标/被点击的节点），再向左验证关系。
   → 所以**末尾选择器必须够稀有**，写成 `[index=2][clickable=true]` 这种宽泛条件会很慢。
2. **默认起点是"事件节点"不是根节点**（`matchRoot` 默认 `false`）。
   → 目标若不在该事件节点的子孙里，这次查询根本查不到。症状：**网页审查工具能查到、真机不触发或延迟几秒才触发**。解法：`matchRoot: true`。
3. **Android 只有 `findAccessibilityNodeInfosByViewId` / `findAccessibilityNodeInfosByText` 两个快速 API**。
   → 快速查询只认 `id` / `vid` / `text`，**`desc` 永远不支持快速查询**。
4. **`+` `-` `>` `<` `<<` 两侧必须留空格**（`A>B` 非法，`A > B` 合法）； `@` 指定真正被点击的节点，**一个 `@` 都没有时**才默认取最末尾的属性选择器。⚠️ "从末尾开始查找"是**查找起点**，不等于目标节点，别混（见 §2「目标节点怎么定」）。
5. **`matches` 写成数组是 AND 不是 OR**：`matches: ['A','B']` 要求两条都命中（点 `B` 的目标）；想要"任一命中"用 `anyMatches`，想要"多条独立规则"用 `rules: [...]`。这是最容易写错的地方。
6. **字符串字面量可用 `'` `"` `` ` `` 任意一种包裹**：文本里带单引号时换双引号或反引号，能省掉大量转义（详见 §2 转义）。

---

## 1. 订阅结构（JSON5 树）

```
subscription { id:int, name, version:int, author?, updateUrl?, checkUpdateUrl?, supportUri?, apps?, globalGroups?, categories? }
└─ app   { id(包名), name?, groups[] }
   └─ group { key:int(必,组内唯一,不可改), name(必), desc?, enable?=true, rules[], ...通用属性 }
      └─ rule  { matches?, anyMatches?, excludeMatches?, excludeAllMatches?, action?, ... }
```

- `id` / `version` / `key` 都是**整数**（不是字符串）；`id` 与 `version` 必填，`version` 只有比本地大才会更新；负数 `id` 被 GKD 内部占用。
- `updateUrl` 缺省时回退为"添加订阅时填写的链接"；`checkUpdateUrl` 是轻量探针（只含 `id`+`version`），且支持相对路径 `./xxx.version.json5`。

`rules` 简写（等价关系）：

```json5
{ rules: 'A > B' }              ≡ { rules: [{ matches: 'A > B' }] }
{ rules: ['A > B','C'] }        ≡ { rules: [{matches:'A > B'}, {matches:'C'}] }
{ rules: { matches: 'A > B' } } ≡ { rules: [{ matches: 'A > B' }] }
```

| 类型 | 关键字段 |
| --- | --- |
| `RawSubscription` | `id` `name` `version`(只有更大才更新) `checkUpdateUrl`(只含 id+version 的小文件) `apps` `globalGroups` `categories` |
| `RawApp` | `id`(包名) `name` `groups` |
| `RawAppGroup` | `rules` `ignoreGlobalGroupMatch` + 组属性 + 应用属性 |
| `RawGlobalGroup` | `rules`(**每条 global rule 可单独写 `apps`**) `disableIfAppGroupMatch` + `RawGlobalRuleProps`(apps/matchAnyApp/matchLauncher/matchSystemApp) |

---

## 2. 属性选择器

```
@TextView[text="跳过"][text.length<10][clickable=true][visibleToUser=true]
│        └──── 逻辑表达式 ────┘  └─ 并列 [] 等价于 && ─┘
└─ @ = 指定此节点为"目标节点"(被点击的那个)
```

- 前缀 `TextView` ≡ `[name='TextView' || name$='.TextView']`；`*` = 任意节点，**可整段省略** → `[text="x"]`
- 并列 `[]` = AND；内部 `&&` 优先级高于 `||`
- 取反必须带括号：`[!(text*="取消" && text*="忽略")]`，`!!(...)` 非法
- 组合多个选择器时必须用 `()` 包裹：`(A + B) || (C > D)`，`(A + B) && (M > N)`（结果取右侧），`!(A + B)`
- `||` **短路**：从左到右取第一个命中的分支，目标节点是该分支自己的末尾节点（所以 `@` 可以写在任意分支里）
- 选择器**开头和结尾都必须是属性选择器**（`A B` 两端都不能是关系符）

### 目标节点怎么定（`@` 的唯一规则 · 极易混淆）

> 官方原文：`@` 表示选择此节点，一条规则最后属性选择器 `@` 生效，**如果没有 `@`，取最后一个属性选择器**。

- **查找起点在末尾（从右往左匹配）≠ 目标节点**。这两件事必须分开记：
  - 查找起点：永远是**最右**那个属性选择器（性能特征）
  - 目标节点：有 `@` 就是 `@` 标的那个；**一个 `@` 都没有时**才取最右
- 判断 `@` 能不能省，只问一句：**`@` 标的节点，是不是整条选择器里最右的那个属性选择器？**
  - 是 → 可以省（省了语义不变）
  - 不是 → **不能省**，省掉就点到别的节点

```text
@A <n B        // 末尾是 B，@ 标的是 A → @ 不能省，点 A
A <n B         // 没有 @ → 点 B（父节点），语义已变
@LinearLayout > TextView[text="不感兴趣"]   // 点祖先 LinearLayout，合法
B > A          // 末尾是 A，无 @ → 点 A（与 @A <n B 等价，且判定次数更少）
```

- ⚠️ `!(...)` 内部的 `@` **无效**：`!(@A + B)` 的匹配结果只能是末尾节点 `B`
- ⚠️ `||` 各分支各自算目标：取第一个命中的分支，并点**该分支自己的**末尾（或该分支里的 `@`）

### 值表达式与字面量

- 标识符正则 `^[_a-zA-Z][a-zA-Z0-9_]*$`，且不能是 `null`/`true`/`false` → `a.1`、`a.null` 非法
- 字面量 4 种：`null` / `true|false` / 整数（不支持 `+1` 写法）/ 字符串（`'` `` ` `` `"` 三种成对引号，不支持多行）
- 调用链不能用 `a()()`（调用者不能是调用表达式），但 `a.b(c).e(f)` 可以
- **类型必须匹配**，否则报"非法类型"：`a > ''` 非法；`^=` `*=` `$=` `~=` 只能用于 string，`< > <= >=` 只能用于 int

### 操作符

| 类别 | 操作符 | 合法类型 |
| --- | --- | --- |
| 相等 | `=` `!=` | null / boolean / int / string（任意） |
| 大小 | `>` `>=` `<` `<=` | **只有 int** |
| 字符串 | `^=`(开头) `!^=` `*=`(包含) `!*=` `$=`(结尾) `!$=` | 只有 string |
| 正则 | `~=`(匹配) `!~=`(不匹配) | 只有 string |

- **除 `=`/`!=` 外，属性为 `null` 时结果一律 `false`**（`a!$='x'` 在 a 为 null 时也是 false；需要"null 或 不以 x 结尾"时写 `a=null || a!$='x'` 或 `!(a$='x')`）
- `~=` / `!~=` 右侧只能是**字面量正则**（`"..."` 里写，不能是变量）
- 正则优化（含 `!~=` 的三种取反形式）：`(?is)abc.*` → startsWith、`(?is).*abc.*` → contains、`(?is).*abc` → endsWith；`abc` 内不能有 `\^$.?*|+()[]{}` 且大小写折叠须为 ASCII，否则回退真正则
- 正则跨平台不一致：Android 用 Kotlin `Regex`，网页/Node 用 regex-wasm，别用 JVM 专属语法

### node 可用属性（`https://gkd.li/guide/node`）

| 类型 | 属性 |
| --- | --- |
| string | `id` `vid` `name` `text` `desc` |
| boolean | `clickable` `focusable` `checkable` `checked` `editable` `longClickable` `visibleToUser` |
| int | `left` `top` `right` `bottom` `width` `height` `childCount` `index` `depth` |
| node | `parent` |

方法：

| 调用者 | 可用 |
| --- | --- |
| node | `getChild(int)` → node |
| int | `plus` `minus` `times` `div` `rem`（四则/取余）、`more` `moreEqual` `less` `lessEqual`（比较）、`toString` |
| string | `length`、`get(i)` `at(i)`（`at` 支持负数从尾部取）、`substring(i)` `substring(a,b)`、`toInt`、`indexOf(s)` `indexOf(s,i)` |
| boolean | `toInt`（true=1）`or` `and` `not` `ifElse(T,T)` |
| context | 拥有 node 全部属性方法，额外 `prev` `current` `getPrev(int)`：`prev` = 右侧属性选择器的节点上下文（最右侧为 null），`current` = 当前节点（`current.id=id`），`getPrev(0)`=prev、`getPrev(1)`=prev.prev |
| global | 拥有 context 全部属性方法，额外 `equal(a,b)` `notEqual(a,b)`；**任何裸写 `xxx` / `xxx()` 都来自 global** |

⚠️ 调用者或参数为 null 时，属性/方法结果都是 null（`name.length`、`parent.getChild(0)` 都可能为 null）。

⚠️ `_id` / `_pid` **只在网页审查工具可用，真机不存在**，写规则禁止使用。

常用写法：

```
ImageView[index=parent.childCount.minus(1)]                      // 父节点下的最后一个子节点
ViewGroup[desc^="直播"][getChild(0).vid="cover_layout"]          // 第1个子节点的 vid
@[clickable=true][right<getPrev(1).width.div(2)] >(1,2) [vid="cover"] <<n [parent=null]
```

### 转义

选择器本身是字符串，放进 JSON/JSON5 又要转义一次。手写时：
- 想匹配 `\n` → 规则里写 `\\n`
- 想匹配 `\` → 规则里写 `\\\\`
- 正则 `\d` → 选择器里写 `\\d` → 规则里写 `\\\\d`

---

## 3. 关系选择器（6 个操作符）

| 操作符 | 名称 | 语义（`A op B`） |
| --- | --- | --- |
| `+` | 前置兄弟 | A 是 B **前面**的兄弟，默认 `A.index + 1 = B.index` |
| `-` | 后置兄弟 | A 是 B **后面**的兄弟，默认 `A.index = B.index + 1` |
| `>` | 祖先 | A 是 B 的祖先，默认 `A.depth + 1 = B.depth`（即直接父节点，同 CSS） |
| `<` | 子节点 | A 是 B 的子节点；`<3` = 第 3 个子节点（index=2）；`<n` = 任意子节点 |
| `<<` | 子孙 | A 是 B 的子孙，`A.order`（深度先序、0 基）= a_m-1 → `<<1` 首个后代、`<<n` 任意后代；几乎只用于 `<<n` 局部快速查找 |
| `->` | 之前节点 | 回到查询链上**已经查到的**第 n 个节点：`->1` 即紧邻右侧那个已匹配节点（等价 `prev`），`->2` 等价 `getPrev(1)`；只有右侧已经查出节点时才能用 |

### `<<n` 到底怎么读（最容易卡住的一个）

**一句话：`A <<n B` = "A 在 B 的子树里"；因为匹配从右往左，先定位 B（容器），再在 B 里找 A。**

```
@[vid="iv_close"] <<n [vid="include_ad"]
└──── 目标 ────┘        └── 容器 ──┘
① 先找 include_ad 这个广告容器 → ② 在它的所有后代里找 iv_close → ③ 点它
   （去掉 <<n [vid="include_ad"]，页面上任意 iv_close 都会被点＝误触）
```

| 写法 | 范围 | 匹配时的动作 | 代价 |
| --- | --- | --- | --- |
| `<n` | **只算直接子节点** | 看容器下一层 | 文本在孙子层就匹配不到 |
| `<<n` | **任意层后代** | （可用快速 API）在容器子树里搜 | 便宜（局部快速查找） |
| `>n` | **任意层祖先**（B 的祖先里挑出 A） | 从 B 一层层 `parent` 往上爬 | 层级深就慢 |

> `A <<n B` 与 `B >n A` 是**同一个父子关系**，只是查询方向相反：`<<n` 向下搜、`>n` 向上爬。**已知容器、要找里面某个节点**时永远用 `<<n`。

- 数字写法 `<<1` / `<<2` 指的是"容器子树内**深度优先先序**的第 1/2 个节点"（`<<1` = 第一个直接子节点，`<<2` 可能是孙子），非常脆弱，实际几乎只用 `<<n`
- ⚠️ `<<n` 只取**第一个**命中，不是全部
- ⚠️ `A <<n [parent=null]` 不算优化（内部还是 n 次判断）；根节点优化请用 `<2 [parent=null]` / `[parent=null] >n X` 这类写法

实践示例：

```
[text="取消"] + [text="更新"]            // 目标是"更新"（末尾）→ 要点击"取消"得写 @[text="取消"] + [text="更新"]
[text="更新"] - [text="取消"]            // 同上，用 - 反转顺序，无需 @
[text="应用升级提醒"] +3 * > [text="取消"]
@[text="直播"] <<n [vid="live_text_container"]   // 在 container 子树里找 text=直播
```

### 关系表达式

- 元组：`(1,2,5)`，必须为**递增正整数**（`a_m` 表示"距离"，不是绝对 index）
- 多项式：`(an+b)`，取值集合 `{an+b | an+b>=1, n>=1}`；集合为空则**表达式非法**；`+(2n)`=偶数距、`+(2n-1)`/`+(2n+1)`=奇数距
- `a<=0` 等价于有限元组：`(-n+4)` ≡ `(1,2,3)`、`(-3n+10)` ≡ `(1,4,7)`
- 简写：`+(3n+0)`→`+3n`；`+(0n+3)`→`+3`；`(0n+1)`→`+`；`>(1n+0)`→`>n`→ 直接空格 `A B`

---

## 4. 查询优化（性能核心）

### 4.1 起点：`matchRoot`

- 默认 `false`：从**无障碍事件的事件节点**向下遍历其子孙
- 若匹配速度跟不上事件产生速度，起点会自动退化为根节点；反之若事件稀疏（只有一小块文本在变），起点会一直是那个节点
- 目标不在事件节点子树 → **匹配失败**（即使审查工具能查到）
- 解决：`matchRoot: true`（每次都从根节点匹配）

### 4.2 主动查询（省掉全树 DFS）

选择器里**只要出现一个 `[parent=null]`** 就算"声明了根节点"。把它写进选择器后，就不再需要从起点做 DFS 遍历 n 个节点：

```
A > @B <<n [parent=null]      // 等价于 A > B，但只判断一次
```
注意：子查询里用 `<<n` 会让内部判断回到 n 次，等于没优化。

**祖先方向也有专门优化**：`[parent=null] >n X` 中的根节点由 GKD 直接取 API，不需要一层层 `parent` 往上爬。

```
[parent=null] >n TextView      // 只调 1 次拿根节点，而不是爬 ancestor 链
```
⚠️ `<<n` 通常只取**第一个**命中的子孙（审查工具里也只显示一个结果），不要指望它遍历出全部候选。

### 4.3 快速查询 `fastQuery`

- 需要显式 `fastQuery: true`（默认 false），**按规则/规则组生效**
- 只有 `id` / `vid` / `text` 能被提取去调 Android 的两个快速 API
- 硬性格式：**末尾属性选择器的第一个属性选择表达式**必须是
  `[id='x']` `[vid='x']` `[text='x']` `[text^='x']` `[text*='x']` `[text$='x']`，或它们用 `||` 连接

| 选择器 | 能否快速查询 |
| --- | --- |
| `A > B + C[id='x'][childCount=2]` | ✅ |
| `A > B + C[childCount=2][id='x']` | ❌（id 不在第一位） |
| `[desc="发现新版本"] + [index=2][clickable=true]` | ❌（desc 不支持，index 也不是第一位） |

- **局部快速查找**：符合格式的属性选择器 + 右侧 `<<n`，例如 `A > C[id='x'] <<n D[id='y'] <<n E`（C 和 D 各自都能走快速 API）
- `||` 分支必须**每个分支**都符合才取并集，否则整体停用；`&&` 取并集（只有右分支符合时也能用右侧那条）；`!(...)` 会取消内部所有快速查询，但内部**局部**快速查找仍独立成立
  ```text
  (A + B[id='b']) || (C + D)          → 整体不用快速查询（左分支没有 id/vid/text）
  (A + B) && (C + D[id='d'])          → 用 id='d'
  (A + B[id='b']) && !(C + D[id='d']) → 用 id='b'
  ```
- **选择器不符合格式时，`fastQuery` 开不开都一样**（官方原文）；开了只会改变返回顺序（不保证深度优先），首个命中节点可能变
- ⚠️ 另一前提：该节点在快照面板必须被标注"可快速查找"，否则格式再对也**查不到**（表现为规则在真机上彻底不触发）

### 4.4 性能排查清单（匹配慢 / 延迟几秒 / 不触发）

1. `matchRoot` 是否为 `false` 且目标不在事件节点子树 → 加 `matchRoot: true`
2. 末尾选择器是否太宽泛（`[index=2][clickable=true]` 这类）→ 收紧（加 `childCount=0` / `name$=".ImageView"` / 宽高限制）
3. 能否改用 `id`/`vid`/`text` 命中快速查询 → 能则同时加 `fastQuery: true`
4. `desc` 无法快速查询，优先找 `vid`/`id`/`text`
5. 规则开太多被阻塞 → `priorityTime` / `order`
6. flutter / webview 不发无障碍事件 → `forcedTime`（主动轮询）

---

## 5. 字段速查

### 规则本体（RawRuleProps）

| 字段 | 说明 |
| --- | --- |
| `matches` | 全部选择器都匹配上 → 点击**最后一项**的目标节点；优先级高于 `anyMatches` |
| `anyMatches` | 任一命中即点击；全部不命中则停止匹配本规则；与 `matches` 同用时仍点 `matches` 的最后一项 |
| `excludeMatches` | 任一命中 → **停止匹配本规则**（排除） |
| `excludeAllMatches` | 全部命中 → 停止匹配本规则 |
| `key` / `name` | 规则标识 / 名称，`key` 设置后不可改 |
| `preKeys` | 要求某个 key 刚执行过才执行（用于"点关闭→选原因→确认"这类顺序链） |
| `action` | `click`(默认) `clickNode` `clickCenter` `back` `longClick` `longClickNode` `longClickCenter` `swipe` `none` |
| `position` | 自定义点击坐标（相对节点），存在时 `action` 默认变 `clickCenter` |
| `swipeArg` | 滑动参数，存在时 `action` 默认变 `swipe` |

`click` = 节点 clickable 就用 `clickNode`，否则 `clickCenter`；`clickNode` 未被执行时回退 `clickCenter`。
`clickNode` 能点到屏幕外/被遮挡的节点，但要求节点 clickable（`longClickNode` 同理，需 longClickable）。
`clickCenter` 算中心坐标：**坐标不在屏幕内 → 当作未匹配**；被其它节点遮挡 → 会点到最上层那个节点。
`longClickCenter` 长按 400ms；`back` = 返回键；`none` = 只匹配不动作（配合 `preKeys`/`matches` 做标记）。

### 通用计时/控制（RawCommonProps，组与规则都能写）

| 字段 | 默认 | 含义 |
| --- | --- | --- |
| `actionCd` | 1000 | 冷却时间 / 执行最小间隔 |
| `actionDelay` | - | 查到节点 → 等待 → 再查到才执行 |
| `fastQuery` | false | 开启快速查找优化 |
| `matchRoot` | false | 每次都从根节点开始匹配 |
| `matchDelay` | - | 规则被唤醒后延迟多久参与查询 |
| `matchTime` | - | **规则参与匹配的有效时长**，超时休眠（防误触，不是延迟！） |
| `forcedTime` | - | 开始匹配后一段时间内主动轮询屏幕（应对不发无障碍事件的页面） |
| `actionMaximum` | - | 最大执行次数，达到后休眠 |
| `resetMatch` | `'activity'` | 何时重置 matchTime/actionMaximum：`activity` / `match` / `app` |
| `actionCdKey` / `actionMaximumKey` | - | 与指定 key 的 rule 共享冷却 / 次数 |
| `order` | 0 | 匹配顺序，越小越先；同 order 按 `groups` 数组顺序；app 规则优先于 global 规则 |
| `priorityTime` / `priorityActionMaximum` | - / 1 | 优先级时间，防止被其它规则阻塞 |
| `snapshotUrls` / `excludeSnapshotUrls` / `exampleUrls` | - | 快照/排除快照/运行示例链接（**强烈建议必填**） |

> `matches` / `anyMatches` / `excludeMatches` / `excludeAllMatches` 的类型都是 **`string[]`**（传单个字符串会被规范化成数组）。

### 规则组（RawGroupProps）

`key`(必,不可改,组内唯一) `name`(必) `desc` `enable`(默认 true) `scopeKeys`(**其它 group 的 key 数组**：把那些组的全部 rule 借用进本组作用域)

- 组上的 `RawCommonProps` 与 `RawAppRuleProps` 会被组内每条 rule **继承**；子级重写即覆盖。想清空继承来的 `activityIds` 就写 `activityIds: []`。

### 应用规则专有（RawAppRuleProps）

- `activityIds` / `excludeActivityIds`：`startWith` 匹配；以 `.` 开头 ≡ `包名 + 该串`；**不填或 `[]` = 匹配所有界面**（`[]` 专用于屏蔽从组继承的值）
- `excludeActivityIds` 优先级高于 `activityIds`
- 版本限制：`versionCode`(IntegerMatcher) / `versionName`(StringMatcher) 是**新写法**；`versionNames` `excludeVersionNames` `versionCodes` `excludeVersionCodes` **已弃用**（仍可用，别在新规则里写）
  - IntegerMatcher：`{ exclude?, include?, minimum?, maximum? }`，优先级 `exclude > include > minimum/maximum`
  - StringMatcher：`{ exclude?, include?, pattern? }`，优先级 `exclude > include > pattern`（`pattern` 是正则）

### 全局规则专有（RawGlobalRuleProps / RawGlobalGroup）

- `disableIfAppGroupMatch: '更新提示'`：若某 app 下存在**名字以该串开头、且 `ignoreGlobalGroupMatch` 不为 `true`** 的规则组，则此全局组不匹配该 app；**只判断存在，不判断是否启用**
  - 值为 `''` ≡ 用当前全局组的 `name`；效果等价于在 `apps` 里自动写 `{ id: 'xxx', enable: false }`
- app 组可用 `ignoreGlobalGroupMatch: true` 豁免（避免被全局组"让位"）
- `matchAnyApp`(默认 `true`)：`false` 时只匹配 `apps` 里列出的应用
- `matchLauncher`(默认 `false`)：是否匹配桌面；切换桌面后需打开 GKD 界面触发识别
- `matchSystemApp`(默认 `false`)：是否匹配系统应用
- `apps: [{ id, enable? }]`：逐 app 开关，`enable: false` = 对该 app 禁用

### position（相对节点，不是相对屏幕）

合法组合：`left/right/x` 之一 + `top/bottom/y` 之一

```json5
{ left: 'width/2', top: 'height/2' }      // 节点中心
{ left: 0, top: 0 }                        // 左上顶点
{ right: 'width*0.1352', top: 'width*0.0852' }
{ x: 'screenWidth/2', y: 'screenHeight/2' } // 屏幕中心（分屏/小窗下可能点到窗口外）
```
表达式可用：`left top right bottom width height screenWidth screenHeight random`
- 支持 `+ - * / ^ %` 与括号，数字与"同内容字符串"等价（`2.5` ≡ `'2.5'`）
- `left/top` 的方向是**边 → 节点中心**，负数表示反方向（因此可以点到节点外部）；`right/bottom` 同理从右/下边往里算
- `x/y` 是**相对整屏**（不受应用窗口限制）；`random` 是 0-1 随机数，且**同一表达式内只取一次**（`'random-random'` 恒为 0）
- 计算出的坐标如果不在屏幕内 → 该次匹配视为**未匹配**（不是点歪，而是不点）

---

## 6. 本仓库（AIsouler/GKD_subscription）约定

- 每个 app 一个文件 `src/apps/<包名>.ts`，用 `defineGkdApp({ id, name, groups })`；`src/subscription.ts` 用 `batchImportApps` 自动汇总，无需手动注册
- **分类只能是 `src/categories.ts` 里这 11 个**（规则组名 = `分类` 或 `分类-场景`）：
  `开屏广告` `青少年模式` `更新提示` `评价提示` `通知提示` `权限提示` `局部广告` `全屏广告` `分段广告` `功能类` `其他`
- ⚠️ **名字前缀是有语义的**：全局组靠 `disableIfAppGroupMatch: '更新提示'` 之类的 `startsWith` 判断来给 app 组"让位"，所以 app 组名必须以这串开头（写 `更新提示`，不要写 `更新弹窗`）
- **`开屏广告*` 组的 `order` 由 `src/subscription.ts` 自动设为 `OPEN_AD_ORDER`**，文件里不用手写
- **更新提示**组的标准配置：`fastQuery: true` + `matchTime: 10000` + `actionMaximum: 1` + `resetMatch: 'app'`
- **开屏广告**组（app 侧）典型额外配置：`forcedTime`、`actionCdKey`、`actionMaximumKey`、`priorityTime`、`matchTime`、`actionMaximum`、`resetMatch: 'app'`
- **全局组**（`src/globalGroups.ts`）：`开屏广告-全局`(order -10, actionMaximum 2)、`更新提示-全局`(-9)、`青少年模式-全局`(-8)，都用 `apps` 白/黑名单（`globalDefaultApps.ts`）
- 每条规则必须带 `snapshotUrls`（否则无法维护）；被排除的界面写 `excludeSnapshotUrls`，交互过程给 `exampleUrls`
- 命令：`pnpm check`（tsc `--noEmit` + `checkApiVersion` + `checkSubscription`）、`pnpm build`（生成 `dist/` 与 README）
- `Selectors.md` 里有开屏/更新提示/青少年模式/弹窗广告等**通用规则可直接复用**
- 提交前 `pnpm lint` / `pnpm format`（prettier + eslint）；pre-commit 由 lint-staged 自动跑

---

## 7. 常用片段库

```
[parent=null] / [depth=0]                                  // 根节点
ImageView[index=parent.childCount.minus(1)]                // 最后一个子节点
@[text="取消"] + [text="更新"]                              // 目标在左侧时用 @
[vid="cover_layout"] +n [text$="顶级入耳"]                  // 任意距离的后续兄弟
[vid="cover_layout"] +(1,2) [id="x"]                       // 合并 1 或 2 两种距离
FrameLayout[vid="content_layout"] >n ImageView[vid="search_icon"]   // 任意层祖先
@[text="直播"] <<n [vid="live_text_container"]              // 限定在某个容器子树内查找
[text*="跳过"][text.length<10][clickable=true][visibleToUser=true]
[desc="发现新版本"] + [index=2][clickable=true]             // ❌ 反面教材：末尾太宽泛 + desc 不可快速查询
LinearLayout > @[text="直播"] <<n [vid="swipe_layout"]      // 在容器子树内查找"某个结构里"的节点
[text.at(-1)="集"][text.length<10]                          // at 支持负索引（从末尾取）
[text.length>0 && text.length<10][visibleToUser=true]       // 常用兜底过滤：非空 + 短文本 + 可见
```

