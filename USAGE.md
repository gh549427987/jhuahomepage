# 📖 jhua-hpage 组件化主页使用文档
## 🚀 快速上手（复制直接用）
### ✅ 最新懒人首选：单个组件自带「左侧待办2/3 + 右侧待整理1/3」布局：
```markdown
{{jhua-hpage:todo-list?showCompleted=true&maxItems=8&sortBy=dueDate}}
```
> 💡 优势：没有组件渲染冲突，不需要写分栏代码，自动集成待办+待整理两个功能，滚动体验丝滑

### ✅ 推荐：用 `right` 参数实现左右并排布局
```markdown
{{jhua-hpage:todo-list?right=recent-files}}
```
> 💡 左侧自动占2/3宽度放待办（含待整理），右侧自动占1/3放指定模块，无需写分栏代码

### ✅ 新功能：卡片行布局（一行放最多4个正方形小卡片）
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
> 💡 一行最多4个模块，每个模块的span值代表占几列，span总和必须等于4
> 💡 小屏幕（<768px）自动切换为上下堆叠布局

### ✅ 新功能：农历+天气+倒数日+今日任务 四卡片行
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

### 旧版分栏写法（仍兼容，不推荐）：
```markdown
```jhua-hpage-columns
cols=2 gap=20 ratio=2:1
{{jhua-hpage:todo-list?showCompleted=true&maxItems=8&sortBy=dueDate}}
{{jhua-hpage:unorganized-files}}
```
```
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

用 ` ```jhua-hpage-row ` 代码块在一行中排列多个模块，每个模块指定span值，span总和必须为4。

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

也支持不均等分配：
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

> ⚠️ 一行最多4个模块，span总和必须为4，否则显示错误提示

### 可用的模块ID

| 模块ID | 名称 | 说明 |
|--------|------|------|
| `todo-list` | 待办事项 | 内置待整理区域，创建按钮添加待办到今日日记 |
| `recent-files` | 最近文档 | 格子渐变标签 |
| `quick-nav` | 快捷导航 | 支持多ID分组 |
| `project-tracking` | 项目跟踪 | 截止日期标色 |
| `unorganized-files` | 待整理文件 | 独立待整理板块 |
| `countdown-card` | 🩷 倒数日卡片 | 粉红色主题，支持添加/编辑/删除 |
| `weather-card` | 🌤️ 天气预报卡片 | 蓝色主题，Open-Meteo API |
| `daily-tasks` | 📋 今日任务卡片 | 绿色主题，显示当天日记中的待办 |
| `lunar-card` | 🏮 农历卡片 | 金红色主题，显示农历日期/干支/生肖/节日 |

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
---
## 🧩 单个组件支持的参数
每个组件都可以加自定义参数，放在`?`后面，多个参数用`&`连接：
### 待办组件 `todo-list`
```markdown
{{jhua-hpage:todo-list?showCompleted=true&maxItems=8&sortBy=dueDate}}
```
| 参数 | 说明 | 可选值 |
|------|------|--------|
| `showCompleted` | 是否显示已完成待办 | `true`/`false` |
| `maxItems` | 最多显示待办数量 | 数字 |
| `sortBy` | 排序方式 | `dueDate`按截止日期/`priority`按优先级/`created`按创建时间 |
| `span` | 宽度比例 | `1`/`2`/`3`/`4` |
| `right` | 右侧并排模块ID | 模块ID字符串 |
> 🆕 特性：此组件**内置右侧1/3宽度待整理文件区域**，自动显示最近7天配置扫描目录下修改的笔记，标题右侧自带新建按钮，无需额外调用`unorganized-files`组件
> 🆕 `span=2`时内部自动切换为上下堆叠布局（待办在上、待整理在下），避免半宽空间挤在一起
> 🆕 **创建按钮**：点击「+ 创建」弹出输入框，输入待办内容后自动添加到当天日记的 `# 📖Tasks` 区域下。如果当天日记不存在，会自动使用配置的日记模板创建

### 倒数日卡片 `countdown-card`
```markdown
{{jhua-hpage:countdown-card}}
```
| 参数 | 说明 | 可选值 |
|------|------|--------|
| `maxItems` | 最多显示倒数日数量 | 数字，默认4 |
| `span` | 宽度比例 | `1`/`2`/`3`/`4` |
> 🩷 粉红色渐变主题，支持添加/编辑/删除倒数日，数据保存在插件设置中
> 点击 `+` 按钮弹出添加弹窗，悬浮倒数日条目显示编辑/删除按钮

### 天气预报卡片 `weather-card`
```markdown
{{jhua-hpage:weather-card}}
```
| 参数 | 说明 | 可选值 |
|------|------|--------|
| `latitude` | 纬度 | 数字，默认23.16（里水镇） |
| `longitude` | 经度 | 数字，默认113.15（里水镇） |
| `locationName` | 地区名 | 字符串，默认"里水镇" |
| `span` | 宽度比例 | `1`/`2`/`3`/`4` |
> 🌤️ 蓝色渐变主题，使用 Open-Meteo API
> 数据每30分钟自动刷新，网络异常时显示重试按钮
> 经纬度可在插件设置页的「天气预报设置」区域配置

### 今日任务卡片 `daily-tasks`
```markdown
{{jhua-hpage:daily-tasks}}
```
| 参数 | 说明 | 可选值 |
|------|------|--------|
| `maxItems` | 最多显示任务数量 | 数字，默认6 |
| `span` | 宽度比例 | `1`/`2`/`3`/`4` |
> 📋 绿色渐变主题，自动扫描**当天日记文件**中的待办任务（`- [ ]` / `- [x]`）
> 显示进度条（完成数/总数），已完成任务可折叠/展开
> 勾选复选框直接同步源文档，点击任务内容跳转到源文件

### 农历卡片 `lunar-card`
```markdown
{{jhua-hpage:lunar-card}}
```
| 参数 | 说明 | 可选值 |
|------|------|--------|
| `span` | 宽度比例 | `1`/`2`/`3`/`4` |
> 🏮 金红色渐变主题，显示当天农历日期、天干地支年、生肖、星期
> 自动识别农历节日（春节、元宵、端午、中秋等）和公历节日（元旦、国庆等）
> 内置1900-2100年农历算法，无需外部依赖

### 最近文档组件 `recent-files`
```markdown
{{jhua-hpage:recent-files?maxItems=10&sortBy=modified}}
```
| 参数 | 说明 | 可选值 |
|------|------|--------|
| `maxItems` | 最多显示文档数量 | 数字 |
| `sortBy` | 排序方式 | `modified`按修改时间/`created`按创建时间/`opened`按打开时间 |
| `span` | 宽度比例 | `1`/`2`/`3`/`4` |
| `right` | 右侧并排模块ID | 模块ID字符串 |
### 快捷导航 `quick-nav`
```markdown
{{jhua-hpage:quick-nav?id=homepage}}
{{jhua-hpage:quick-nav?id=study}}
```
| 参数 | 说明 | 可选值 |
|------|------|--------|
| `id` | 导航分组ID，不同ID数据完全隔离 | 任意字符串，默认`homepage` |
| `span` | 宽度比例 | `1`/`2`/`3`/`4` |
| `right` | 右侧并排模块ID | 模块ID字符串 |
### 其他组件
- 项目跟踪：`{{jhua-hpage:project-tracking?projectPath=你的项目路径}}`
- 待整理文件：`{{jhua-hpage:unorganized-files}}`
---
## ⚠️ 注意事项
1. **首次使用必须完全退出Obsidian**：右键任务栏托盘里的Obsidian→「退出」，不要只关窗口，清缓存才能加载新功能
2. `right` 参数指定的模块ID不存在时，会显示红色错误提示
3. `jhua-hpage-row` 代码块的span总和不为4时，会显示红色错误提示
4. 屏幕宽度小于768px时，所有并排布局会自动切换为上下堆叠
5. 待整理板块默认扫描路径可在插件设置页的「待整理扫描路径」区域自定义
6. 天气预报的经纬度可在插件设置页的「天气预报设置」区域配置，默认佛山南海区里水镇
7. 倒数日数据保存在插件设置中，卸载插件会丢失
8. 待办事项的「+ 创建」按钮会将待办添加到当天日记，日记不存在时自动使用配置的日记模板创建
9. 日记模板路径可在插件设置页的「日记模板路径」区域配置，默认 `templates/11-日记模板.md`
