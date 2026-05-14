# 📖 jhua-hpage 组件化主页使用文档

> 🎯 **纯组件化方案**：插件不再提供「打开主页」功能，所有模块均以组件标签形式嵌入到 Obsidian 文档中使用。
> 配合 [Homepage 插件](https://github.com/salt517/obsidian-homepage) 打开你的主页文档即可。

---

## 🚀 快速上手（复制直接用）

### ✅ 最简单：单个待办组件（内置左侧待办2/3 + 右侧待整理1/3）

```markdown
{{jhua-hpage:todo-list?showCompleted=true&maxItems=8&sortBy=dueDate}}
```

> 💡 没有组件渲染冲突，不需要写分栏代码，自动集成待办+待整理两个功能

### ✅ 用 `right` 参数实现左右并排

```markdown
{{jhua-hpage:todo-list?right=recent-files}}
```

> 💡 左侧自动占2/3宽度放待办（含待整理），右侧自动占1/3放指定模块

### ✅ 卡片行布局（一行放最多4个正方形小卡片）

```markdown
```jhua-hpage-row
modules:
  - id: lunar-card
    span: 1
  - id: weather-card
    span: 1
  - id: countdown-card
    span: 1
  - id: daily-tasks
    span: 1
```
```

> 💡 一行最多4个模块，每个模块的 span 值代表占几列，span 总和必须等于4
> 💡 小屏幕（<768px）自动切换为上下堆叠布局

---

## 🧩 通用布局参数

所有组件都支持 `span` 和 `right` 参数控制布局：

### `span` 参数 — 控制模块宽度

| span值 | 宽度 | 说明 |
|--------|------|------|
| `1` | 25% | 四分之一宽 |
| `2` | 50% | 半宽 |
| `3` | 75% | 四分之三宽 |
| `4` | 100%（默认） | 全宽 |

```markdown
{{jhua-hpage:todo-list?span=2}}
{{jhua-hpage:recent-files?span=2}}
```

### `right` 参数 — 指定右侧并排模块

用 `right=模块ID` 让两个模块自动左右并排，左侧主模块按 `span` 占宽度，右侧模块自动填充剩余空间。

```markdown
{{jhua-hpage:todo-list?right=recent-files}}
{{jhua-hpage:todo-list?span=3&right=quick-nav}}
```

| 用法 | 左侧 | 右侧 | 效果 |
|------|------|------|------|
| `?right=recent-files` | 待办（50%） | 最近文档（50%） | 默认1:1 |
| `?span=3&right=quick-nav` | 待办（75%） | 快捷导航（25%） | 3:1 |
| `?span=2&right=project-tracking` | 待办（50%） | 项目跟踪（50%） | 1:1 |

> 💡 不指定 `span` 时，`right` 参数会自动将 span 设为 2（半宽）
> 💡 小屏幕（<768px）自动切换为上下堆叠布局

### `jhua-hpage-row` 代码块 — 一行多卡片布局

用 ` ```jhua-hpage-row ` 代码块在一行中排列多个模块，每个模块指定 span 值，span 总和必须为4。

**均等分配：**
```markdown
```jhua-hpage-row
modules:
  - id: countdown-card
    span: 1
  - id: weather-card
    span: 1
  - id: daily-tasks
    span: 1
  - id: quick-nav
    span: 1
```
```

**不均等分配：**
```markdown
```jhua-hpage-row
modules:
  - id: todo-list
    span: 2
  - id: weather-card
    span: 1
  - id: countdown-card
    span: 1
```
```

> ⚠️ 一行最多4个模块，span 总和必须为4，否则显示错误提示

---

## 📋 可用模块总览

| 模块ID | 名称 | 调用方式 | 说明 |
|--------|------|----------|------|
| `todo-list` | 📝 待办事项 | 行内标签 | 内置待整理区域，创建按钮添加待办到今日日记 |
| `recent-files` | 📄 最近文档 | 行内标签 | 格子渐变标签 |
| `quick-nav` | 🧭 快捷导航 | 行内标签 | 支持多ID分组 |
| `project-tracking` | 📊 项目跟踪 | 行内标签 | 截止日期标色、进度显示 |
| `unorganized-files` | 📁 待整理文件 | 行内标签 | 独立待整理板块 |
| `countdown-card` | 🩷 倒数日卡片 | 行内标签 | 粉红色主题，支持添加/编辑/删除 |
| `weather-card` | 🌤️ 天气预报卡片 | 行内标签 | 蓝色主题，Open-Meteo API |
| `daily-tasks` | 📋 今日任务卡片 | 行内标签 | 绿色主题，显示当天日记中的待办 |
| `lunar-card` | 🏮 农历卡片 | 行内标签 | 金红色主题，农历日期/干支/生肖/节日 |
| `para-explorer` | 📂 PARA 文件管理器 | 行内标签 | PARA 四区浏览/拖拽/新建/右键菜单 |
| `para-explorer-v2` | 🗂️ PARA 文件管理器 V2 | 代码块 | 双视图(overview+explorer)/项目状态/归档映射/排序 |
| `contacts-card` | 👥 通讯录卡片 | 行内标签 | 多排序/分组方式 |
| `cuoti-card` | ❌ 错题卡片 | 代码块 | 题目+选项+解析可视化 |
| `progress-card` | 📈 进度记录卡片 | 代码块 | 时间线进度追踪 |

> 💡 **行内标签** = `{{jhua-hpage:模块ID?参数}}` 格式
> 💡 **代码块** = ` ```代码块名 ` + YAML/文本格式，见各组件说明

---

## 📚 各组件详细参数

### 待办组件 `todo-list`

```markdown
{{jhua-hpage:todo-list?showCompleted=true&maxItems=8&sortBy=dueDate}}
```

| 参数 | 说明 | 可选值 | 默认值 |
|------|------|--------|--------|
| `showCompleted` | 是否显示已完成待办 | `true` / `false` | `false` |
| `maxItems` | 最多显示待办数量 | 数字 | `10` |
| `sortBy` | 排序方式 | `dueDate` 按截止日期 / `priority` 按优先级 / `createdAt` 按创建时间 | `priority` |
| `showPriority` | 是否显示优先级标签 | `true` / `false` | `false` |
| `showDueDate` | 是否显示截止日期 | `true` / `false` | `true` |
| `span` | 宽度比例 | `1` / `2` / `3` / `4` | `4` |
| `right` | 右侧并排模块ID | 模块ID字符串 | — |

> 🆕 内置右侧1/3宽度待整理文件区域，自动显示最近7天配置扫描目录下修改的笔记
> 🆕 `span=2` 时内部自动切换为上下堆叠布局（待办在上、待整理在下）
> 🆕 **创建按钮**：点击「+ 创建」弹出输入框，输入待办内容后自动添加到当天日记的 `# 📖Tasks` 区域下。如果当天日记不存在，会自动使用配置的日记模板创建
> 🆕 待办数据源可在插件设置页的「待办数据源」区域配置（支持自定义路径、标签过滤等）

---

### 最近文档组件 `recent-files`

```markdown
{{jhua-hpage:recent-files?maxItems=10&sortBy=modified}}
```

| 参数 | 说明 | 可选值 | 默认值 |
|------|------|--------|--------|
| `maxItems` | 最多显示文档数量 | 数字 | `10` |
| `sortBy` | 排序方式 | `opened` 按打开时间 / `modified` 按修改时间 / `created` 按创建时间 | `opened` |
| `excludePaths` | 排除的路径前缀（逗号分隔） | 路径字符串 | `Inbox,.obsidian` |
| `showPreview` | 是否显示预览文本 | `true` / `false` | `false` |
| `showOpenTime` | 是否显示打开时间 | `true` / `false` | `true` |
| `span` | 宽度比例 | `1` / `2` / `3` / `4` | `4` |
| `right` | 右侧并排模块ID | 模块ID字符串 | — |

---

### 快捷导航 `quick-nav`

```markdown
{{jhua-hpage:quick-nav?id=homepage}}
{{jhua-hpage:quick-nav?id=study}}
```

| 参数 | 说明 | 可选值 | 默认值 |
|------|------|--------|--------|
| `id` | 导航分组ID，不同ID数据完全隔离 | 任意字符串 | `homepage` |
| `showIcons` | 是否显示图标 | `true` / `false` | `true` |
| `columns` | 导航列数 | 数字 | `4` |
| `span` | 宽度比例 | `1` / `2` / `3` / `4` | `4` |
| `right` | 右侧并排模块ID | 模块ID字符串 | — |

> 🆕 支持全局刷新命令「刷新主页组件」(refresh-hpage)，可自绑快捷键

---

### 项目跟踪 `project-tracking`

```markdown
{{jhua-hpage:project-tracking?projectPath=02-项目（Projects）}}
```

| 参数 | 说明 | 可选值 | 默认值 |
|------|------|--------|--------|
| `projectPath` | 项目文件夹路径 | Vault 中的文件夹路径 | `02-项目（Projects）` |
| `maxItems` | 最多显示项目数量 | 数字 | `6` |
| `showProgress` | 是否显示进度条 | `true` / `false` | `true` |
| `showDueDate` | 是否显示截止日期 | `true` / `false` | `true` |
| `sortBy` | 排序方式 | `ddl` 按截止日期 / `progress` 按进度 / `updated` 按更新时间 | `ddl` |
| `showArchived` | 是否显示已归档项目 | `true` / `false` | `false` |
| `span` | 宽度比例 | `1` / `2` / `3` / `4` | `4` |
| `right` | 右侧并排模块ID | 模块ID字符串 | — |

---

### 倒数日卡片 `countdown-card`

```markdown
{{jhua-hpage:countdown-card}}
```

| 参数 | 说明 | 可选值 | 默认值 |
|------|------|--------|--------|
| `maxItems` | 最多显示倒数日数量 | 数字 | `4` |
| `span` | 宽度比例 | `1` / `2` / `3` / `4` | `4` |

> 🩷 粉红色渐变主题，支持添加/编辑/删除倒数日，数据保存在插件设置中
> 点击 `+` 按钮弹出添加弹窗，悬浮倒数日条目显示编辑/删除按钮

---

### 天气预报卡片 `weather-card`

```markdown
{{jhua-hpage:weather-card}}
```

| 参数 | 说明 | 可选值 | 默认值 |
|------|------|--------|--------|
| `latitude` | 纬度 | 数字 | `23.16`（里水镇） |
| `longitude` | 经度 | 数字 | `113.15`（里水镇） |
| `locationName` | 地区名 | 字符串 | `里水镇` |
| `span` | 宽度比例 | `1` / `2` / `3` / `4` | `4` |

> 🌤️ 蓝色渐变主题，使用 Open-Meteo API
> 数据每30分钟自动刷新，网络异常时显示重试按钮
> 经纬度可在插件设置页的「天气预报设置」区域配置

---

### 今日任务卡片 `daily-tasks`

```markdown
{{jhua-hpage:daily-tasks}}
```

| 参数 | 说明 | 可选值 | 默认值 |
|------|------|--------|--------|
| `maxItems` | 最多显示任务数量 | 数字 | `6` |
| `span` | 宽度比例 | `1` / `2` / `3` / `4` | `4` |

> 📋 绿色渐变主题，自动扫描**当天日记文件**中的待办任务（`- [ ]` / `- [x]`）
> 显示进度条（完成数/总数），已完成任务可折叠/展开
> 勾选复选框直接同步源文档，点击任务内容跳转到源文件

---

### 农历卡片 `lunar-card`

```markdown
{{jhua-hpage:lunar-card}}
```

| 参数 | 说明 | 可选值 | 默认值 |
|------|------|--------|--------|
| `span` | 宽度比例 | `1` / `2` / `3` / `4` | `4` |

> 🏮 金红色渐变主题，显示当天农历日期、天干地支年、生肖、星期
> 自动识别农历节日（春节、元宵、端午、中秋等）和公历节日（元旦、国庆等）
> 内置1900-2100年农历算法，无需外部依赖

---

### 待整理文件 `unorganized-files`

```markdown
{{jhua-hpage:unorganized-files}}
```

| 参数 | 说明 | 可选值 | 默认值 |
|------|------|--------|--------|
| `scanPaths` | 扫描的目录路径（逗号分隔） | Vault 中的文件夹路径 | `Inbox,未命名` |
| `maxItems` | 最多显示文件数量 | 数字 | `10` |
| `sortBy` | 排序方式 | `created` 按创建时间 / `updated` 按修改时间 / `size` 按文件大小 | `created` |
| `showFileSize` | 是否显示文件大小 | `true` / `false` | `false` |
| `span` | 宽度比例 | `1` / `2` / `3` / `4` | `4` |

> 💡 待办组件(todo-list)已内置待整理区域，通常不需要单独使用此组件

---

### PARA 文件管理器 `para-explorer`

```markdown
{{jhua-hpage:para-explorer?P0=00-项目（Projects）&A1=01-领域（Areas）&R2=02-资源（Resources）&A3=03-档案（Archives）}}
```

| 参数 | 说明 | 可选值 | 默认值 |
|------|------|--------|--------|
| `P0` | 🚀 项目区路径 | Vault 中的文件夹路径 | 空 |
| `A1` | 📂 领市区路径 | Vault 中的文件夹路径 | 空 |
| `R2` | 📚 资源区路径 | Vault 中的文件夹路径 | 空 |
| `A3` | 📦 档案区路径 | Vault 中的文件夹路径 | 空 |
| `span` | 宽度比例 | `1` / `2` / `3` / `4` | `4` |

> 📂 顶部四区导航栏切换，支持文件夹浏览、前进/后退
> 📄📁 新建文件/文件夹，自动补 .md 后缀
> 🖱️ 右键菜单：移动到其他分区、重命名、删除
> 🔀 拖拽文件/文件夹到目标文件夹或分区导航按钮实现跨区移动
> 📊 排序：最近修改/最早修改/名称/大小，显示文件统计

---

### PARA 文件管理器 V2 `para-explorer-v2` （代码块）

```markdown
```para-explorer-v2
P0: 00-项目（Projects）
A1: 01-领域（Areas）
R2: 02-资源（Resources）
A3: 03-档案（Archives）
view: overview
maxItems: 8
```
```

| 参数 | 说明 | 可选值 | 默认值 |
|------|------|--------|--------|
| `P0` | 🚀 项目区路径 | Vault 中的文件夹路径 | 空 |
| `A1` | 📂 领市区路径 | Vault 中的文件夹路径 | 空 |
| `R2` | 📚 资源区路径 | Vault 中的文件夹路径 | 空 |
| `A3` | 📦 档案区路径 | Vault 中的文件夹路径 | 空 |
| `view` | 初始视图模式 | `overview` 概览 / `explorer` 浏览器 | `overview` |
| `maxItems` | 概览模式每区最大显示数 | 数字 | `8` |

> 🗂️ V2 相比 V1 新增：双视图切换(overview+explorer)、项目状态标签、归档映射（项目归档到「00-已完成项目」下同名子目录）、排序按钮
> 💡 归档映射规则：所有项目分类统一归档到 `00-已完成项目` 下同名子目录（如 `00-工作项目` → `00-已完成项目/00-工作项目`）

---

### 通讯录卡片 `contacts-card`

```markdown
{{jhua-hpage:contacts-card}}
```

| 参数 | 说明 | 可选值 | 默认值 |
|------|------|--------|--------|
| `scanPath` | 通讯录文件扫描路径 | Vault 中的文件夹路径 | `01-领域（Areas）/03-生活领域/02-通讯录` |
| `maxItems` | 最多显示联系人数量 | 数字 | `8` |
| `groupBy` | 分组方式 | `tags` 按标签 / `relation` 按关系 / `none` 不分组 | `tags` |
| `sortBy` | 排序方式 | `recent` 按最近 / `name` 按姓名 / `birthday` 按生日 / `relation` 按关系 | `recent` |
| `span` | 宽度比例 | `1` / `2` / `3` / `4` | `4` |

> 👥 多种排序🔄，按标签或关系分组展示联系人

---

### 错题卡片 `cuoti-card` （代码块）

```markdown
```jhua-cuoti
T0: 题目正文（支持 ![](图片.png) 嵌入图片）
X1: 选项A内容
X2: 选项B内容
X3: 选项C内容
X4: 选项D内容
answer: C
my_answer: B
analysis: 解析内容
easy_wrong: A
source: 粉笔
accuracy: 48%
time_used: 1秒
kaodian: 考点
```
```

| 参数 | 说明 | 必填 | 默认值 |
|------|------|------|--------|
| `T0` | 📝 题目正文（支持 `![](图片.png)` 嵌入图片） | ✅ | — |
| `X1`~`X6` | 🔤 选项内容（最多6个选项） | ❌ | — |
| `answer` | ✅ 正确答案 | ❌ | — |
| `my_answer` | ❌ 我的答案 | ❌ | — |
| `analysis` | 📖 解析内容 | ❌ | — |
| `easy_wrong` | ⚠️ 易错项 | ❌ | — |
| `source` | 📚 来源（粉笔/华图等） | ❌ | — |
| `accuracy` | 📊 正确率 | ❌ | — |
| `time_used` | ⏱️ 答题用时 | ❌ | — |
| `kaodian` | 🎯 考点 | ❌ | — |

> ❌ 可视化展示错题，正确答案绿色、错误答案红色、易错项黄色
> 💡 图片只写纯文件名即可（如 `![](17da920f607b2b9.png)`），Obsidian 自动搜索全库匹配

---

### 进度记录卡片 `progress-card` （代码块）

```markdown
```jhua-progress
- 2026-05-06 | 初始创建，进度0% | -
- 2026-05-10 | 完成开发，进度60% | 顺利
- 2026-05-15 | 测试通过，进度90% | 遇到小bug已修复
```
```

每行格式：`- 日期 | 进度更新 | 备注`

| 字段 | 说明 | 必填 | 默认值 |
|------|------|------|--------|
| 日期 | 📅 更新日期 | ✅ | — |
| 进度更新 | 📈 进度描述 | ✅ | — |
| 备注 | 📝 备注信息 | ❌ | `-` |

> 📈 时间线进度追踪，支持在卡片内添加/编辑/删除条目
> 💡 修改卡片内容会自动同步回源文件

---

## 📚 常用示例大全（复制直接用）

### 1. 农历+天气+倒数日+今日任务 四卡片行

```markdown
```jhua-hpage-row
modules:
  - id: lunar-card
    span: 1
  - id: weather-card
    span: 1
  - id: countdown-card
    span: 1
  - id: daily-tasks
    span: 1
```
```

### 2. 待办 + 最近文档 左右并排

```markdown
{{jhua-hpage:todo-list?right=recent-files}}
```

### 3. 待办占3/4 + 快捷导航占1/4

```markdown
{{jhua-hpage:todo-list?span=3&right=quick-nav}}
```

### 4. 待办全宽（含内置待整理）

```markdown
{{jhua-hpage:todo-list?showCompleted=true&maxItems=8}}
```

### 5. 两个半宽模块并排

```markdown
{{jhua-hpage:quick-nav?span=2}}
{{jhua-hpage:recent-files?span=2}}
```

### 6. 天气+倒数日+今日任务 三卡片行

```markdown
```jhua-hpage-row
modules:
  - id: weather-card
    span: 1
  - id: countdown-card
    span: 2
  - id: daily-tasks
    span: 1
```
```

### 7. PARA 文件管理器 V2

```markdown
```para-explorer-v2
P0: 00-项目（Projects）
A1: 01-领域（Areas）
R2: 02-资源（Resources）
A3: 03-档案（Archives）
view: overview
maxItems: 8
```
```

### 8. 通讯录卡片

```markdown
{{jhua-hpage:contacts-card?groupBy=relation&sortBy=name}}
```

### 9. 错题卡片

```markdown
```jhua-cuoti
T0: 下列哪个图形与其他三个不同？
X1: △
X2: ○
X3: □
X4: ☆
answer: D
my_answer: B
analysis: 前三个都是基本几何图形，☆是星形
easy_wrong: A
source: 粉笔
accuracy: 52%
time_used: 45秒
kaodian: 图形推理-共性规律
```
```

### 10. 进度记录卡片

```markdown
```jhua-progress
- 2026-05-06 | 初始创建，进度0% | -
- 2026-05-10 | 完成开发，进度60% | 顺利
- 2026-05-15 | 测试通过，进度90% | 小bug已修复
```
```

---

## ⚠️ 注意事项

1. **首次使用必须完全退出 Obsidian**：右键任务栏托盘里的 Obsidian →「退出」，不要只关窗口，清缓存才能加载新功能
2. `right` 参数指定的模块ID不存在时，会显示红色错误提示
3. `jhua-hpage-row` 代码块的 span 总和不为4时，会显示红色错误提示
4. 屏幕宽度小于768px时，所有并排布局会自动切换为上下堆叠
5. 待整理板块默认扫描路径可在插件设置页的「待整理扫描路径」区域自定义
6. 天气预报的经纬度可在插件设置页的「天气预报设置」区域配置，默认佛山南海区里水镇
7. 倒数日数据保存在插件设置中，卸载插件会丢失
8. 待办事项的「+ 创建」按钮会将待办添加到当天日记，日记不存在时自动使用配置的日记模板创建
9. 日记模板路径可在插件设置页的「日记模板路径」区域配置，默认 `templates/11-日记模板.md`
10. 待办数据源可在插件设置页的「待办数据源」区域配置，支持自定义路径和标签过滤
11. 全局刷新命令「刷新主页组件」(refresh-hpage) 已注册，可在 Obsidian 命令面板中搜索绑定快捷键
