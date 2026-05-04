import { App, Modal, Notice, TFile } from 'obsidian';
import { HPageModule, TodoItem, TodoCache } from '../types';

// 直接内置TodoManager，避免导入问题
class TodoManager {
  private app: App;
  private plugin: any;
  private cachePath: string;
  private cache: TodoCache;

  constructor(app: App, plugin: any, cachePath: string) {
    this.app = app;
    this.plugin = plugin;
    this.cachePath = cachePath;
    this.cache = {
      version: '1.0',
      todos: [],
      completedTodos: [],
      settings: {
        showCompleted: false,
        sortBy: 'priority'
      }
    };
  }

  async load(): Promise<void> {
    try {
      const file = this.app.vault.getAbstractFileByPath(this.cachePath);
      if (file instanceof TFile) {
        const content = await this.app.vault.read(file);
        this.cache = JSON.parse(content);
      }
    } catch (e) {
      await this.save();
    }
  }

  async save(): Promise<void> {
    try {
      const dirPath = this.cachePath.substring(0, this.cachePath.lastIndexOf('/'));
      if (!this.app.vault.getAbstractFileByPath(dirPath)) {
        await this.app.vault.createFolder(dirPath);
      }
      
      const file = this.app.vault.getAbstractFileByPath(this.cachePath);
      const content = JSON.stringify(this.cache, null, 2);
      
      if (file instanceof TFile) {
        await this.app.vault.modify(file, content);
      } else {
        await this.app.vault.create(this.cachePath, content);
      }
    } catch (e) {
      console.error('保存待办缓存失败:', e);
    }
  }

  getTodos(): TodoItem[] {
    return this.cache.todos;
  }

  getCompletedTodos(): TodoItem[] {
    return this.cache.completedTodos;
  }

  async addTodo(content: string, priority: 'high' | 'medium' | 'low' = 'medium', dueDate?: string, tags?: string[]): Promise<TodoItem> {
    const todo: TodoItem = {
      id: `todo-${Date.now()}`,
      content,
      completed: false,
      priority,
      dueDate,
      tags,
      createdAt: new Date().toISOString()
    };
    this.cache.todos.push(todo);
    await this.save();
    return todo;
  }

  async toggleTodo(id: string): Promise<void> {
    const todo = this.cache.todos.find(t => t.id === id);
    if (todo) {
      todo.completed = !todo.completed;
      await this.save();
    }
  }

  async deleteTodo(id: string): Promise<void> {
    this.cache.todos = this.cache.todos.filter(t => t.id !== id);
    this.cache.completedTodos = this.cache.completedTodos.filter(t => t.id !== id);
    await this.save();
  }
  
  async getTodosFromCurrentSource(): Promise<TodoItem[]> {
    const todos: TodoItem[] = [];
    const currentSource = this.plugin.settings.todoSources.find(s => s.id === this.plugin.settings.currentTodoSourceId);
    if (!currentSource) return todos;

    const allFiles = this.app.vault.getMarkdownFiles().filter(file => 
      file.path.startsWith(currentSource.path)
    );

    for (const file of allFiles) {
      try {
        const content = await this.app.vault.read(file);
        const fileTodos = this.extractTodosFromContent(content, file.path);
        todos.push(...fileTodos);
      } catch (e) {
        console.error(`读取文件${file.path}失败:`, e);
      }
    }
    
    return todos;
  }
  
  private extractTodosFromContent(content: string, sourcePath: string): TodoItem[] {
    const todos: TodoItem[] = [];
    const lines = content.split('\n');
    
    for (const line of lines) {
      const match = line.match(/^\s*- \[([ x])\] (.+)$/);
      if (match) {
        const completed = match[1] === 'x';
          const todoContent = match[2].trim();
          
          // 源文件里的所有待办全部保留，不去重，确保重复粘贴的也能显示
          todos.push({
            id: `source-${sourcePath}-${Date.now()}-${Math.random()}`,
            content: todoContent,
            completed,
            priority: 'medium',
            dueDate: sourcePath,
            createdAt: new Date().toISOString()
          });
      }
    }
    
    return todos;
  }
}

export class TodoListModule implements HPageModule {
  id = 'todo-list';
  name = '待办事项';
  defaultConfig = {
    showCompleted: false,
    maxItems: 10,
    sortBy: 'priority' as 'priority' | 'dueDate' | 'createdAt',
    showPriority: false,
    showDueDate: true,
  };

  private app: App;
  private container: HTMLElement;
  private todos: TodoItem[] = [];
  private config: any;
  private todoManager: any;

  async render(app: App, config: Record<string, any>, container?: HTMLElement): Promise<HTMLElement> {
    this.app = app;
    this.config = config;
    
    // 初始化todoManager
    if (!this.todoManager) {
      this.todoManager = new TodoManager(this.app, config.plugin, config.todoCachePath);
      await this.todoManager.load();
    }
    
    // 创建模块根元素，复用原有的样式类
    this.container = container || document.createElement('div');
    this.container.className = 'jhua-hpage-module jhua-todo-section';
    this.container.dataset.jhuaModule = this.id;
    
    // 清空原有内容
    this.container.empty();
    
    // 渲染头部（固定在顶部，滚动时不遮挡）
    const header = this.container.createDiv({ cls: 'jhua-todo-header' });
    header.style.position = 'sticky';
    header.style.top = '0';
    header.style.zIndex = '999';
    header.style.background = 'var(--background-secondary)';
    header.style.paddingTop = '16px';
    header.style.paddingBottom = '8px';
    header.style.borderBottom = '1px solid var(--background-modifier-border)';
    header.style.marginBottom = '10px';
    const titleContainer = header.createDiv({ cls: 'jhua-todo-title-container' });
    titleContainer.createEl('h2', { text: '📝 待办事项' });
    const currentSource = config.todoSources.find(s => s.id === config.currentTodoSourceId);
    if (currentSource) {
      titleContainer.createEl('span', { text: currentSource.alias, cls: 'jhua-todo-source-alias' });
    }

    const buttonsContainer = header.createDiv({ cls: 'jhua-todo-header-buttons' });
    
      // 设置按钮
      const settingsBtn = buttonsContainer.createEl('button', { cls: 'jhua-todo-settings-btn' });
      settingsBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
      settingsBtn.addEventListener('click', () => {
        // 弹出待办源设置模态框，用于设置待办目录和别名
        const { TodoSourceSettingsModal } = require('../../main');
        new TodoSourceSettingsModal(this.app, this.config.plugin, () => {
          // 保存后重新渲染待办列表
          this.render(this.app, this.config, this.container);
        }).open();
      });

      // 添加按钮
      const addBtn = buttonsContainer.createEl('button', { text: '+ 创建', cls: 'jhua-todo-add-btn' });
      addBtn.addEventListener('click', async () => {
        // 弹出输入框让用户输入待办内容
        const inputModal = new (require('obsidian').Modal)(this.app);
        inputModal.titleEl.setText('📝 新增待办到今日日记');
        inputModal.contentEl.style.padding = '16px';
        
        const inputWrapper = inputModal.contentEl.createDiv();
        inputWrapper.style.marginBottom = '12px';
        const input = inputWrapper.createEl('input', { 
          type: 'text', 
          placeholder: '输入待办内容...',
          cls: 'jhua-todo-input'
        });
        input.style.width = '100%';
        input.style.padding = '8px 12px';
        input.style.borderRadius = '6px';
        input.style.border = '1px solid var(--background-modifier-border)';
        input.style.background = 'var(--background-primary)';
        input.style.color = 'var(--text-normal)';
        input.style.fontSize = '0.95em';
        input.style.boxSizing = 'border-box';
        
        const btnRow = inputModal.contentEl.createDiv();
        btnRow.style.display = 'flex';
        btnRow.style.justifyContent = 'flex-end';
        btnRow.style.gap = '8px';
        
        const cancelBtn = btnRow.createEl('button', { text: '取消' });
        cancelBtn.style.padding = '6px 16px';
        cancelBtn.style.borderRadius = '6px';
        cancelBtn.style.border = '1px solid var(--background-modifier-border)';
        cancelBtn.style.background = 'var(--background-secondary)';
        cancelBtn.style.color = 'var(--text-normal)';
        cancelBtn.style.cursor = 'pointer';
        cancelBtn.addEventListener('click', () => inputModal.close());
        
        const confirmBtn = btnRow.createEl('button', { text: '✅ 添加', cls: 'mod-cta' });
        confirmBtn.style.padding = '6px 16px';
        confirmBtn.style.borderRadius = '6px';
        confirmBtn.style.border = 'none';
        confirmBtn.style.background = 'var(--interactive-accent)';
        confirmBtn.style.color = 'var(--text-on-accent)';
        confirmBtn.style.cursor = 'pointer';
        
        const doAdd = async () => {
          const todoContent = input.value.trim();
          if (!todoContent) {
            new Notice('请输入待办内容');
            return;
          }
          inputModal.close();
          
          try {
            // 获取当天日记路径
            const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
            const [year, month] = today.split('-');
            const dailyNotePath = `01-领域（Areas）/00-日常记录/02-日记/${year}/${year}-${month}/${today}.md`;
            
            let file = this.app.vault.getAbstractFileByPath(dailyNotePath);
            
            // 日记不存在则创建
            if (!(file instanceof TFile)) {
              const dirPath = `01-领域（Areas）/00-日常记录/02-日记/${year}/${year}-${month}`;
              if (!this.app.vault.getAbstractFileByPath(dirPath)) {
                await this.app.vault.createFolder(dirPath);
              }
              
              // 尝试使用模板
              const templatePath = this.config.dailyNoteTemplate || 'templates/11-日记模板.md';
              const templateFile = this.app.vault.getAbstractFileByPath(templatePath);
              
              let initialContent = `---\ntags:\n  - daily_note\n---\n# 🚦Tracking\n\n\n# 📒Dairy\n\n\n# 📖Tasks\n\n\n# 🎖️Done 完成的事！\n`;
              
              if (templateFile instanceof TFile) {
                initialContent = await this.app.vault.read(templateFile);
                // 移除Templater语法
                initialContent = initialContent.replace(/<%\*[\s\S]*?%>/g, '');
              }
              
              file = await this.app.vault.create(dailyNotePath, initialContent);
              new Notice('✅ 已创建今日日记');
            }
            
            // 在日记中找到 # 📖Tasks 或末尾追加待办
            let content = await this.app.vault.read(file as TFile);
            const checkbox = '- [ ] ' + todoContent + '\n';
            const tasksRegex = /(#\s*📖\s*Tasks\s*\n)/;
            
            if (tasksRegex.test(content)) {
              content = content.replace(tasksRegex, `$1${checkbox}`);
            } else {
              // 没有Tasks标题，追加到末尾
              content += '\n# 📖Tasks\n' + checkbox;
            }
            
            await this.app.vault.modify(file as TFile, content);
            new Notice('✅ 待办已添加到今日日记');
            
            // 重新渲染
            this.render(this.app, this.config, this.container);
          } catch (e) {
            new Notice(`❌ 添加失败：${e.message || '未知错误'}`);
          }
        };
        
        confirmBtn.addEventListener('click', doAdd);
        input.addEventListener('keydown', (e: KeyboardEvent) => {
          if (e.key === 'Enter') doAdd();
        });
        
        inputModal.open();
        // 自动聚焦输入框
        setTimeout(() => input.focus(), 100);
      });
    
    // 根据span参数决定布局方向：span<=2半宽时上下堆叠，否则左右2:1布局
    const span = parseInt(String(this.config.span)) || 4;
    const isNarrow = span <= 2;
    const flexDirection = isNarrow ? 'column' : 'row';
    const leftStyle = isNarrow
      ? 'width: 100%; padding-right: 0; border-bottom: 1px solid var(--background-modifier-border); padding-bottom: 12px; margin-bottom: 12px;'
      : 'flex: 2; min-width: 300px; padding-right: 8px;';
    const rightStyle = isNarrow
      ? 'width: 100%; padding-left: 0; border-left: none;'
      : 'flex: 1; min-width: 220px; border-left: 1px solid var(--background-modifier-border); padding-left: 16px;';

    // 创建两栏布局容器：宽屏左右2:1，窄屏上下堆叠，统一滚动
    const twoColumnContainer = this.container.createDiv({ 
      attr: { style: `display: flex; flex-direction: ${flexDirection}; gap: 16px; margin-top: 10px; overflow-y: auto; max-height: ${isNarrow ? '400px' : '320px'}; scrollbar-width: thin;` } 
    });
    const leftColumn = twoColumnContainer.createDiv({ 
      attr: { style: leftStyle } 
    });
    const rightColumn = twoColumnContainer.createDiv({ 
      attr: { style: rightStyle } 
    });

    // 右侧待整理标题（固定在右侧顶部，不随滚动）
    const unorganizedHeader = rightColumn.createDiv({ cls: 'jhua-todo-header' });
    unorganizedHeader.style.display = 'flex';
    unorganizedHeader.style.justifyContent = 'space-between';
    unorganizedHeader.style.alignItems = 'center';
    unorganizedHeader.style.paddingTop = '4px';
    unorganizedHeader.style.paddingBottom = '4px';
    unorganizedHeader.style.position = 'sticky';
    unorganizedHeader.style.top = '0';
    unorganizedHeader.style.background = 'var(--background-secondary)';
    unorganizedHeader.style.zIndex = '100';
    unorganizedHeader.createEl('h3', { text: '📥 待整理', attr: { style: 'font-size: 1em; margin: 0;' } });
    
    // 标题右侧的新建按钮，迷你样式
    const unorganizedAddBtn = unorganizedHeader.createEl('button', { 
      text: '+', 
      cls: 'jhua-todo-add-btn',
      attr: { style: 'font-size: 0.9em; padding: 2px 8px; border-radius: 4px;' }
    });
    unorganizedAddBtn.addEventListener('click', async () => {
      try {
        // 在碎片集合目录下新建笔记
        const scanPaths: string[] = this.config.unorganizedScanPaths || ['/', '00-项目（Projects）/05-碎片集合'];
        // 找第一个非根目录的路径作为新建目录，否则用根目录
        const targetDir = scanPaths.find(p => p !== '/') || '/';
        const fileName = `${targetDir === '/' ? '' : targetDir + '/'}碎片-${new Date().toISOString().slice(0,16).replace(/[-T:]/g, '')}.md`;
        // 确保目录存在
        if (targetDir !== '/') {
          const dir = this.app.vault.getAbstractFileByPath(targetDir);
          if (!dir) {
            await this.app.vault.createFolder(targetDir);
          }
        }
        const newFile = await this.app.vault.create(fileName, '---\ntype: 碎片\ntags:\n- 待整理\n---\n# 新碎片\n');
        this.app.workspace.activeLeaf?.openFile(newFile);
        new Notice('✅ 已创建新碎片笔记');
      } catch (e) {
        new Notice(`❌ 创建失败：${e.message || '未知错误'}`);
      }
    });
    
    const unorganizedList = rightColumn.createDiv({ cls: 'jhua-unorganized-list' });
    
    // 加载待整理文件：根据配置的扫描路径检索
    // 只要文件在配置目录下，不管任何元数据，全部检索
    const scanPaths: string[] = this.config.unorganizedScanPaths || ['/', '00-项目（Projects）/05-碎片集合'];
    const allFiles = this.app.vault.getMarkdownFiles();
    const sevenDaysAgoUnorganized = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const unorganizedFiles = allFiles
      .filter(file => {
        // 7天内修改
        if (file.stat.mtime <= sevenDaysAgoUnorganized) return false;
        // 匹配扫描路径：只要在配置目录下就检索，不管元数据
        return scanPaths.some(scanPath => {
          if (scanPath === '/') {
            // 根目录：只匹配根目录下的md文件（不含子目录）
            return !file.path.includes('/');
          }
          // 指定目录：匹配该目录及其子目录
          return file.path.startsWith(scanPath + '/') || file.path === scanPath;
        });
      })
      .sort((a, b) => b.stat.mtime - a.stat.mtime)
      .slice(0, 8);
    
    if (unorganizedFiles.length === 0) {
      unorganizedList.createEl('div', { cls: 'empty-state', text: '暂无待整理文件 ✨', attr: { style: 'font-size: 0.9em; color: var(--text-muted); padding: 10px 0;' } });
    } else {
      unorganizedFiles.forEach(file => {
        const fileItem = unorganizedList.createDiv({ 
          cls: 'todo-item', 
          attr: { style: 'padding: 6px 0; cursor: pointer; display: flex; align-items: center; gap: 8px;' }
        });
        fileItem.createEl('span', { text: '📄', attr: { style: 'font-size: 0.9em;' } });
        const fileName = fileItem.createEl('span', { 
          text: file.basename, 
          attr: { style: 'font-size: 0.9em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;' } 
        });
        // 点击打开文件
        fileItem.addEventListener('click', () => {
          this.app.workspace.openLinkText(file.path, '', true);
        });
      });
    }

    // 左侧待办列表
    const todoList = leftColumn.createDiv({ cls: 'jhua-todo-list' });
    
    // 获取待办数据
    const cachedTodos = this.todoManager.getTodos();
    const sourceTodos = await this.todoManager.getTodosFromCurrentSource();
    
    // 全部合并，不去重，确保所有待办都显示
    const allTodos = [...cachedTodos, ...sourceTodos];
    
    // 排序
    const priorityOrder = { 'high': 0, 'medium': 1, 'low': 2 };
    const sortedTodos = [...allTodos].sort((a: any, b: any) => {
      if (a.completed !== b.completed) {
        return a.completed ? 1 : -1;
      }
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

        // 过滤已完成的待办：只显示前后一周内的
        const today = new Date();
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(today.getDate() - 7);
        const sevenDaysLater = new Date(today);
        sevenDaysLater.setDate(today.getDate() + 7);

        const filteredTodos = sortedTodos.filter((todo: any) => {
          // 所有未完成的待办全部保留
          if (!todo.completed) return true;
          
          try {
            // 已完成的待办只保留在前后一周范围内的
            if (todo.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(todo.dueDate)) {
              // 有日期格式截止日期的，判断是否在前后7天内
              const todoDate = new Date(todo.dueDate);
              return todoDate >= sevenDaysAgo && todoDate <= sevenDaysLater;
            } else if (todo.dueDate) {
              // 源文件来的待办，判断源文件修改时间是否在近7天内
              const file = this.app.vault.getAbstractFileByPath(todo.dueDate);
              if (file instanceof (require('obsidian').TFile)) {
                const modifyTime = new Date(file.stat.mtime);
                return modifyTime >= sevenDaysAgo;
              }
            }
            // 其他待办，判断创建时间是否在近7天内
            const createTime = new Date(todo.createdAt);
            return createTime >= sevenDaysAgo;
          } catch {
            // 异常情况默认不显示
            return false;
          }
        }).slice(0, config.maxItems || 200);
    
    if (filteredTodos.length === 0) {
      todoList.createEl('div', { cls: 'empty-state', text: '暂无待办事项 🎉' });
      return this.container;
    }
    
    filteredTodos.forEach((todo: any) => {
      const todoItem = todoList.createDiv({ 
        cls: 'todo-item' + (todo.completed ? ' completed' : ''),
        attr: { 'data-todo-id': todo.id }
      });
      
      // 复选框（左侧）
      const checkbox = todoItem.createEl('input', { 
        type: 'checkbox', 
        cls: 'todo-checkbox'
      });
      checkbox.checked = todo.completed;
      
      checkbox.addEventListener('change', async (e) => {
        const isChecked = checkbox.checked;
        // 先立刻更新界面状态，保证用户看到勾选成功
        todo.completed = isChecked;
        todoItem.classList.toggle('completed', isChecked);
        
        // 只要有dueDate就尝试同步源文档，不管是缓存还是源提取的待办
        if (!todo.dueDate) return;
        
        // 异步处理状态同步，不影响界面操作
        try {
          let filePath = todo.dueDate;
          if (/^\d{4}-\d{2}-\d{2}$/.test(todo.dueDate)) {
            filePath = this.todoManager.getDailyNotePath(todo.dueDate);
          }
          
          // 调试：显示要同步的文件路径，用户可以确认路径是否正确
          new Notice(`尝试同步到文件：${filePath}`);
          
          const file = this.app.vault.getAbstractFileByPath(filePath);
          if (!(file instanceof TFile)) {
            new Notice(`找不到文件：${filePath}`);
            return;
          }
          
          let content = await this.app.vault.read(file);
          const oldCheckbox = isChecked ? '- [ ]' : '- [x]';
          const newCheckbox = isChecked ? '- [x]' : '- [ ]';
          
          // 调试：显示要匹配的待办内容
          new Notice(`匹配待办内容：${todo.content}`);
          
          // 直接全文本替换，不搞复杂正则，完全匹配待办行，保证100%能找到
          const lines = content.split('\n');
          let replaced = false;
          for (let i = 0; i < lines.length; i++) {
            // 去除前后空白后，检查是否以 `- [ ] 待办内容`或 `- [x] 待办内容`开头
            const trimmed = lines[i].trimStart();
            if (trimmed.startsWith(`${oldCheckbox} ${todo.content}`)) {
              // 保留原缩进 + 新复选框 + 后面的内容
              const indent = lines[i].substring(0, lines[i].length - trimmed.length);
              lines[i] = indent + newCheckbox + lines[i].substring(indent.length + oldCheckbox.length);
              replaced = true;
              break;
            }
          }
          
          if (replaced) {
            const newContent = lines.join('\n');
            await this.app.vault.modify(file, newContent);
            new Notice('✅ 待办状态已同步到源文档');
          } else {
            new Notice(`❌ 源文档中找不到匹配的待办内容`);
          }
        } catch (err) {
          console.error('同步待办状态失败:', err);
          new Notice(`❌ 同步失败：${err.message || '未知错误'}`);
          // 出错也不回滚界面勾选状态，优先保证用户操作成功
        }
      });
      
      // 待办内容（中间，占满剩余空间）
      const content = todoItem.createDiv({ cls: 'todo-content' });
      const todoTextEl = content.createEl('div', { cls: 'todo-text', text: todo.content });
      
      // 来源文档（右侧）
      const sourceEl = todoItem.createDiv({ cls: 'todo-source' });
      if (todo.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(todo.dueDate)) {
        const fileName = todo.dueDate.split('/').pop()?.replace('.md', '');
        sourceEl.createEl('span', { text: fileName || '未知文档', cls: 'todo-source-name' });
      } else if (todo.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(todo.dueDate)) {
        // 如果是日期格式的dueDate，显示日期
        sourceEl.createEl('span', { text: todo.dueDate, cls: 'todo-source-date' });
      }
      
      // 点击待办内容或来源时跳转到对应的文档，完全不绑定到todoItem，避免和复选框冲突
      const openDoc = () => {
        if (todo.dueDate) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(todo.dueDate)) {
            // 文件路径，直接打开
            this.app.workspace.openLinkText(todo.dueDate, '', true);
          } else {
            // 日期格式，打开对应日期的日记
            const dailyPath = this.todoManager.getDailyNotePath(todo.dueDate);
            this.app.workspace.openLinkText(dailyPath, '', true);
          }
        }
      };
      todoTextEl.addEventListener('click', openDoc);
      sourceEl.addEventListener('click', openDoc);
    });
    
    return this.container;
  }

  async update(config: Record<string, any>): Promise<void> {
    await this.render(this.app, config, this.container);
  }
}
