# JHUA HPage 插件架构方案

## 核心设计思想：低耦合模块化架构
每个功能板块完全独立开发、独立迭代，彻底解决样式冲突、互相影响的问题。

---

## 架构分层
```
├── main.ts                  # 插件主入口，负责模块加载、布局渲染
├── src/
│   ├── types.ts             # 统一类型定义 + 模块接口规范
│   └── modules/             # 所有功能板块独立存放
│       ├── index.ts         # 模块统一注册入口
│       ├── quick-nav.ts     # 快捷导航模块
│       ├── todo-list.ts     # 待办事项模块
│       ├── project-tracking.ts # 项目跟踪模块
│       ├── unorganized-files.ts # 待整理模块
│       └── recent-files.ts  # 最近文档模块
├── styles.css               # 全局样式 + 模块样式隔离
└── USAGE.md                 # 模块使用说明 + 可复制代码示例
```

---

## 模块规范
所有模块必须实现`HPageModule`统一接口：
```typescript
interface HPageModule {
  id: string;          // 模块唯一ID
  name: string;        // 模块显示名称
  defaultConfig: Record<string, any>; // 默认配置
  
  // 渲染方法（必须实现）
  render(app: App, config: Record<string, any>, container?: HTMLElement): HTMLElement;
  
  // 可选方法
  update?(config: Record<string, any>): void; // 配置更新时调用
  destroy?(): void; // 页面卸载时调用
}
```

---

## 样式隔离方案
1. **自动命名空间**：每个模块根元素自动添加`data-jhua-module="模块ID"`属性
2. **样式嵌套规则**：所有模块样式必须嵌套在命名空间下，完全避免冲突：
   ```css
   [data-jhua-module="quick-nav"] {
     /* 快捷导航模块所有样式都写在这里 */
     .module-header { ... }
     .nav-grid { ... }
   }
   [data-jhua-module="todo-list"] {
     /* 待办模块样式独立，完全不会影响其他模块 */
     .module-header { ... }
     .todo-list { ... }
   }
   ```

---

## 布局系统（解决横向排列问题）
采用4列Grid栅格布局系统，完全由主容器控制模块位置，模块本身不需要关心布局：
```css
.jhua-hpage-container {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  padding: 20px;
}
.jhua-hpage-module {
  grid-column: span var(--module-span, 1); /* 模块占多少列，由配置控制 */
}
```
- 两个模块横向排列：各设置`span:2`
- 三列布局：各设置`span:1`
- 侧边栏布局：导航`span:1` + 主内容`span:3`
- 通栏布局：设置`span:4`

---

## 支持三种渲染调用方式
### 1. 模板标签调用（最简洁，90%场景推荐）
```
{{jhua-hpage:模块ID}}
{{jhua-hpage:模块ID?参数1=值1&参数2=值2}}
```

### 2. 代码块调用（复杂配置场景）
```jhua-hpage
module: 模块ID
config:
  参数1: 值1
  参数2: 值2
```

### 3. 自动渲染（主页专用）
在插件设置里开关模块、调整位置和占比，打开主页自动渲染，不需要用户写任何代码。

---

## 优势
✅ 彻底避免样式冲突，模块完全独立迭代
✅ 布局完全灵活，支持任意横向/纵向排列组合
✅ 三种调用方式覆盖所有用户使用场景
✅ 低耦合易扩展，新增模块只需要新增一个文件，不需要修改现有代码
✅ 用户可自定义每个模块的开关、位置、占比、配置
