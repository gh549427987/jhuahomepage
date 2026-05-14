# Jhua Homepage Plugin

个人生活工作学习中控台 - 打造美观实用的Obsidian主页

## 🎯 功能特性

### 1. 横幅区域
- 智能问候语（根据时间段自动切换：早上好/下午好/晚上好）
- 实时日期时间显示

### 2. 倒数日
- 显示重要日期倒计时
- 支持自定义颜色标识
- 悬停动画效果

### 3. 导航网格
- 4个分类模块：Ob配置、个人、生活、工作
- 快速跳转到对应笔记
- 每个模块包含多个快捷入口

### 4. 待办事项
- 独立JSON缓存存储（支持同步）
- 三级优先级管理（高⏫、中🔼、低🔽）
- 截止日期设置
- 直接勾选完成
- 标签系统支持
- 统计信息展示

### 5. 日历
- 当月日历视图
- 今日高亮显示
- 点击日期快速操作

### 6. 最近文档
- 显示最近打开的笔记（最多5条）
- 相对时间显示
- 文件夹路径展示

### 7. 跑马灯
- 滚动显示快捷键提示
- 可自定义文本内容

## 🚀 快速开始

### 安装步骤

1. **插件已自动构建完成**
2. **重新加载Obsidian**
   - 按 `Ctrl+R` (Windows) 或 `Cmd+R` (Mac)
   - 或重启Obsidian

3. **启用插件**
   - 打开设置 → 第三方插件
   - 找到 "Jhua Homepage"
   - 点击启用

### 打开主页

**方法1：使用命令面板**
- 按 `Ctrl/Cmd + P` 打开命令面板
- 输入 "打开主页"
- 回车执行

**方法2：使用快捷键**
- 按 `Ctrl/Cmd + Shift + H`

**方法3：点击功能区图标**
- 在左侧功能区点击"家"图标

**方法4：添加待办快捷键**
- 按 `Ctrl/Cmd + N` 快速添加待办

## ⚙️ 配置说明

### 设置入口
设置 → 第三方插件 → Jhua Homepage → 设置图标

### 可配置项

#### 启动行为
- ✅ 启动时自动打开主页

#### 待办配置
- 待办缓存路径：`00-系统数据/jhua-hpage-todos.json`
- 默认优先级：高/中/低

#### 显示模块
- ✅ 显示待办事项
- ✅ 显示日历
- ✅ 显示最近文档
- ✅ 显示导航网格

#### 跑马灯
- ✅ 启用跑马灯
- 自定义滚动文本

## 📁 文件结构

```
.obsidian/plugins/jhua-hpage/
├── manifest.json       # 插件清单
├── package.json        # 依赖配置
├── tsconfig.json       # TypeScript配置
├── esbuild.config.mjs  # 构建配置
├── main.ts            # 源代码
├── main.js            # 编译后代码（自动生成）
├── styles.css         # 样式文件
└── README.md          # 说明文档
```

## 📝 待办数据存储

待办数据存储在独立的JSON文件中，便于同步和备份：

**默认路径**：`00-系统数据/jhua-hpage-todos.json`

**数据结构**：
```json
{
  "version": "1.0",
  "lastUpdated": "2024-12-18T09:30:00Z",
  "todos": [
    {
      "id": "todo-001",
      "text": "完成项目文档",
      "completed": false,
      "priority": "high",
      "dueDate": "2024-12-18",
      "createdDate": "2024-12-15T10:00:00Z",
      "tags": ["工作"],
      "notes": ""
    }
  ],
  "completedTodos": [],
  "settings": {}
}
```

## 🎨 主题适配

- ✅ 自动适配Obsidian深色/浅色主题
- ✅ 使用CSS变量保持一致性
- ✅ 流畅的过渡动画

## 🔧 开发相关

### 开发模式
```bash
npm run dev
```

### 生产构建
```bash
npm run build
```

## 📌 注意事项

1. **首次使用**：插件会自动创建 `00-系统数据` 目录和待办缓存文件
2. **数据同步**：待办JSON文件会通过Obsidian的同步机制自动同步
3. **自定义导航**：可在源代码中修改 `DEFAULT_SETTINGS.categories` 配置

## 🐛 问题反馈

如遇到问题，请检查：
1. Obsidian控制台是否有错误（Ctrl+Shift+I）
2. 插件是否正确启用
3. 文件路径是否正确

## 📄 License

MIT License

---

**Enjoy your personalized Obsidian homepage! 🎉**
