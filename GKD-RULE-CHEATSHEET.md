# GKD 规则语法速查（给 AI 看的版本）

> 资料来源（已核实，2026-10）：
> - 选择器语法 <https://gkd.li/guide/selector>
> - 属性/方法 <https://gkd.li/guide/node>
> - 选择示例 <https://gkd.li/guide/example>
> - 查询优化 <https://gkd.li/guide/optimize>
> - API 字段 <https://gkd.li/api/>（RawSubscription / RawApp / RawAppGroup / RawRuleProps / RawGroupProps / RawAppRuleProps / RawCommonProps / RawGlobalGroup）
> - 第三方教程 <https://github.com/wtwang1998/notebook/.../gkd-rule-tutorial.md>
>
> 本仓库约定另见 `CONTRIBUTING.md`、`Selectors.md`。

---

## 0. 心智模型（先记住这 4 条，能省掉 90% 的坑）

1. **匹配顺序是从右往左**：先找"末尾属性选择器"（默认即目标/被点击的节点），再向左验证关系。
   → 所以**末尾选择器必须够稀有**，写成 `[index=2][clickable=true]` 这种宽泛条件会很慢。
2. **默认起点是"事件节点"不是根节点**（`matchRoot` 默认 `false`）。
   → 目标若不在该事件节点的子孙里，这次查询根本查不到。症状：**网页审查工具能查到、真机不触发或延迟几秒才触发**。解法：`matchRoot: true`。
3. **Android 只有 `findAccessibilityNodeInfosByViewId` / `findAccessibilityNodeInfosByText` 两个快速 API**。
   → 快速查询只认 `id` / `vid` / `text`，**`desc` 永远不支持快速查询**。
4. **`+` `-` `>` `<` `<<` 两侧必须留空格**（`A>B` 非法，`A > B` 合法）； `@` 指定真正被点击的节点，不写则默认取**最末尾**的属性选择器。

---

## 1. 订阅结构（JSON5 树）

```
subscription { id, name, version, author?, updateUrl?, checkUpdateUrl?, supportUri?, apps[], globalGroups[], categories[] }
└─ app   { id(包名), name?, groups[] }
   └─ group { key(必,不可改), name(必), desc?, enable?=true, rules[], ...通用属性 }
      └─ rule  { matches | anyMatches, excludeMatches?, excludeAllMatches?, ... }
```

`rules` 简写（等价关系）：

```json5
{ rules: 'A > B' }        ≡ { rules: [{ matches: 'A > B' }] }
{ rules: ['A > B','C'] }  ≡ { rules: [{matches:'A > B'}, {matches:'C'}] }
```

| 类型 | 关键字段 |
| --- | --- |
| `RawSubscription` | `id` `name` `version`(只有更大才更新) `checkUpdateUrl`(只含 id+version 的小文件) `apps` `globalGroups` `categories` |
| `RawApp` | `id`(包名) `name` `groups` |
| `RawAppGroup` | `rules` `ignoreGlobalGroupMatch` + 组属性 + 应用属性 |
| `RawGlobalGroup` | `rules` `disableIfAppGroupMatch` + `RawGlobalRuleProps`(apps/matchAnyApp/matchLauncher/matchSystemApp) |

---

## 2. 属性选择器

```
@TextView[text="跳过"][text.length<10][clickable=true][visibleToUser=true]
│        └──── 逻辑表达式 ────┘  └─ 并列 [] 等价于 && ─┘
└─ @ = 指定此节点为"目标节点"(被点击的那个)
```

- 前缀 `TextView` ≡ `[name='TextView' || name$='.TextView']`；`*` = 任意控件，**可整段省略** → `[text="x"]`
- 并列 `[]` = AND；内部 `&&` 优先级高于 `||`
- 取反必须带括号：`[!(text*="取消" && text*="忽略")]`，`!!(...)` 非法
- 组合多个选择器时必须用 `()` 包裹：`(A + B) || (C > D)`，`(A + B) && (M > N)`（结果取右侧），`!(A + B)`

### 操作符

| 类别 | 操作符 |
| --- | --- |
| 通用 | `=` `!=` `>` `>=` `<` `<=` |
| 字符串 | `^=`(开头) `!^=` `*=`(包含) `!*=` `$=`(结尾) `!$=` `~=`(正则) `!~=` |

- **除 `=`/`!=` 外，属性为 `null` 时结果一律 `false`**（`a!$='x'` 在 a 为 null 时也是 false）
- `~=` / `!~=` 右侧只能是**字面量正则**
- 正则有优化：`[text~="(?is)abc.*"]` → startsWith，`(?is).*abc.*` → contains，`(?is).*abc` → endsWith

### node 可用属性（`https://gkd.li/guide/node`）

| 类型 | 属性 |
| --- | --- |
| string | `id` `vid` `name` `text` `desc` |
| boolean | `clickable` `focusable` `checkable` `checked` `editable` `longClickable` `visibleToUser` |
| int | `left` `top` `right` `bottom` `width` `height` `childCount` `index` `depth` |
| node | `parent` |

方法：`getChild(int)`；int 的方法：`plus` `minus` `div`。
context 额外：`prev` `current` `getPrev(int)`（`prev` = 右侧属性选择器的节点上下文，最右侧为 null）。

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
| `<<` | 子孙 | A 是 B 的子孙（按深度先序 `order`）；几乎只用于 `<<n` 局部快速查找 |
| `->` | 之前节点 | 取查询链上已经查到的、位于右侧的第 n 个节点 |

实践示例：

```
[text="取消"] + [text="更新"]            // 目标是"更新"（末尾）→ 要点击"取消"得写 @[text="取消"] + [text="更新"]
[text="更新"] - [text="取消"]            // 同上，用 - 反转顺序，无需 @
[text="应用升级提醒"] +3 * > [text="取消"]
@[text="直播"] <<n [vid="live_text_container"]   // 在 container 子树里找 text=直播
```

### 关系表达式

- 元组：`(1,2,5)`，必须为**递增正整数**
- 多项式：`(an+b)`，取值集合 `{an+b | an+b>=1, n>=1}`；`+(2n)`=偶数，`+(2n-1)`=奇数
- 简写：`+(3n+0)`→`+3n`；`+(0n+3)`→`+3`；`(0n+1)`→`+`；`>(1n+0)`→`>n`→ 直接空格 `A B`

---

## 4. 查询优化（性能核心）

### 4.1 起点：`matchRoot`

- 默认 `false`：从**无障碍事件的事件节点**向下遍历其子孙
- 事件密集时起点会自动退化为根节点
- 目标不在事件节点子树 → **匹配失败**（即使审查工具能查到）
- 解决：`matchRoot: true`（每次都从根节点匹配）

### 4.2 主动查询（省掉全树 DFS）

把根节点写在**右侧**结尾，可把"遍历 n 个节点"降到"判断 1 次"：

```
A > @B <<n [parent=null]      // 等价于 A > B，但只判断一次
```
注意：子查询里用 `<<n` 会让内部判断回到 n 次，等于没优化。

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

- **局部快速查找**：符合格式的属性选择器 + 右侧 `<<n`，例如 `A > C[id='x'] <<n D[id='y'] <<n E`
- `||` 分支必须**每个分支**都符合才取并集，否则整体停用；`&&` 取并集；`!(...)` 会取消内部所有快速查询
- **选择器不符合格式时，`fastQuery` 开不开都一样**（官方原文）；开了只会改变返回顺序，不保证深度优先顺序

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

`click` = 节点 clickable 就用 `clickNode`，否则 `clickCenter`；`clickNode` 失败会回退 `clickCenter`。
`clickNode` 能点到屏幕外/被遮挡的节点但要求节点 clickable；`clickCenter` 算中心坐标，被遮挡会点错。

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
| `order` | 0 | 匹配顺序，越小越先；app 规则优先于 global 规则 |
| `priorityTime` / `priorityActionMaximum` | - / 1 | 优先级时间，防止被其它规则阻塞 |
| `snapshotUrls` / `excludeSnapshotUrls` / `exampleUrls` | - | 快照与示例链接（**强烈建议必填**） |

### 规则组（RawGroupProps）

`key`(必,不可改) `name`(必) `desc` `enable`(默认 true) `scopeKeys`(跨组引用 rule key)

### 应用规则专有（RawAppRuleProps）

- `activityIds` / `excludeActivityIds`：`startWith` 匹配；以 `.` 开头 ≡ `包名 + 该串`；**不填或 `[]` = 匹配所有界面**
- `excludeActivityIds` 优先级高于 `activityIds`
- 版本限制：`versionNames` `excludeVersionNames` `versionCodes` `excludeVersionCodes`，以及 `versionCode`(IntegerMatcher) / `versionName`(StringMatcher)
  - IntegerMatcher：`{ exclude?, include?, minimum?, maximum? }`，优先级 `exclude > include > minimum/maximum`

### 全局规则组专有

- `disableIfAppGroupMatch: '更新提示'`：若某 app 下存在名字以该串开头的规则组，则此全局组不匹配该 app（只判断存在，不判断是否启用）
- app 组可用 `ignoreGlobalGroupMatch: true` 豁免

### position（相对节点，不是相对屏幕）

合法组合：`left/right/x` 之一 + `top/bottom/y` 之一

```json5
{ left: 'width/2', top: 'height/2' }      // 节点中心
{ left: 0, top: 0 }                        // 左上顶点
{ right: 'width*0.1352', top: 'width*0.0852' }
{ x: 'screenWidth/2', y: 'screenHeight/2' } // 屏幕中心（分屏/小窗下可能点到窗口外）
```
表达式可用：`left top right bottom width height screenWidth screenHeight random`（`random` 是 0-1 随机数，同一表达式内固定）

---

## 6. 本仓库（AIsouler/GKD_subscription）约定

- 每个 app 一个文件 `src/apps/<包名>.ts`，用 `defineGkdApp({ id, name, groups })`
- 规则组命名：`分类-场景`，如 `开屏广告-首页...`、`更新提示-首页...`、`青少年模式-...`
  （全局组靠 `disableIfAppGroupMatch` 匹配这个名字前缀来自动让位）
- **更新提示**组的标准配置：`fastQuery: true` + `matchTime: 10000` + `actionMaximum: 1` + `resetMatch: 'app'`
- **开屏广告**组：`order: OPEN_AD_ORDER(-10)`，另配 `forcedTime`、`actionCdKey`、`actionMaximumKey`、`priorityTime`、`disableIfAppGroupMatch`
- 每条规则必须带 `snapshotUrls`（否则无法维护）
- 顺序常量在 `src/globalGroups.ts`：`OPEN_AD_ORDER=-10` `UPDATE_PROMPT_ORDER=-9` `YOUTH_MODE_ORDER=-8`
- 命令：`pnpm check`（tsc `--noEmit` + `checkSubscription`）、`pnpm build`
- `Selectors.md` 里有开屏/更新提示/青少年模式/弹窗广告等**通用规则可直接复用**
- 提交前 `pnpm lint` / `pnpm format`（prettier + eslint）

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
```
