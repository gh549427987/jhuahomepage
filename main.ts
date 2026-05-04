import { App, Modal, Notice, Plugin, PluginSettingTab, Setting, ItemView, WorkspaceLeaf, TFile } from 'obsidian';
import { parse } from 'yaml';
import { MODULES, getModuleById } from './src/modules';
import { CategoryItem, Category, TodoItem, TodoCache, JhuaHPageSettings, FileMetadata, ProjectItem } from './src/types';

const DEFAULT_SETTINGS: JhuaHPageSettings = {
  todoCachePath: 'VaultSources/主页数据/todos.json',
  categories: [
    {
      id: 'cat-1',
      name: 'Obsidian',
      icon: '🪛',
      color: '#5B93D5',
      items: [
        { id: 'item-1', name: '设置', path: 'obsidian://show-settings', icon: '⚙️' },
        { id: 'item-2', name: '今日日记', path: 'obsidian://daily-note', icon: '📅' }
      ]
    },
    {
      id: 'cat-2',
      name: '个人',
      icon: '😏',
      color: '#E07B53',
      items: [
        { id: 'item-3', name: '主页', path: '01-领域（Areas）/00-日常记录/00-主页/主页.md', icon: '🏠' }
      ]
    }
  ],
  bannerImage: 'VaultSources/pasted_pics/【哲风壁纸】天空草地-少年奔跑.png',
  bannerTitle: '欢迎回来',
  countdowns: [],
  projectCreateUri: '',
  unorganizedCreateUri: '',
  dailyNoteTemplate: 'templates/11-日记模板.md',
  todoSources: [
    {
      id: 'default-diary',
      alias: '每日日记',
      path: '01-领域（Areas）/00-日常记录/02-日记'
    }
  ],
  currentTodoSourceId: 'default-diary',
  todoDocumentPath: '01-领域（Areas）/00-日常记录/02-日记/待办事项.md',
  // 待整理扫描路径：根目录md文档 + 碎片集合目录
  unorganizedScanPaths: ['/', '00-项目（Projects）/05-碎片集合'],
  // 倒数日数据
  countdownEvents: [],
  // 天气配置（默认：佛山南海区里水镇）
  weatherLatitude: 23.16,
  weatherLongitude: 113.15,
  weatherLocationName: '里水镇',
  // 新增模块配置
  modules: {
    'quick-nav': { enabled: true, order: 1, span: 4, config: {} },
    'todo-list': { enabled: true, order: 2, span: 2, config: {} },
    'project-tracking': { enabled: true, order: 3, span: 2, config: {} },
    'unorganized-files': { enabled: true, order: 4, span: 2, config: {} },
    'recent-files': { enabled: true, order: 5, span: 2, config: {} }
  }
};

// ==================== 待办管理器 ====================

export class TodoManager {
  private app: App;
  private plugin: JhuaHPagePlugin;
  private cachePath: string;
  private cache: TodoCache;

  constructor(app: App, plugin: JhuaHPagePlugin, cachePath: string) {
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
    // 挂载到全局，避免导入问题
    (window as any).TodoManager = TodoManager;
    (window as any).AddTodoModal = AddTodoModal;
    (window as any).TodoSourceSettingsModal = TodoSourceSettingsModal;
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
      if (todo.dueDate) {
        await this.syncTodoStatusToDailyNote(todo.dueDate, todo.content, todo.completed);
      }
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

    // 先过滤出当前源路径下的所有md文件，性能最优，因为vault已经有索引了，不需要遍历整个库
    const allFiles = this.app.vault.getMarkdownFiles().filter(file => 
      file.path.startsWith(currentSource.path)
    );

    // 遍历文件提取待办
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
      // 匹配所有层级的待办，支持缩进（嵌套待办）
      const match = line.match(/^\s*- \[([ x])\] (.+)$/);
      if (match) {
        const completed = match[1] === 'x';
        const todoContent = match[2].trim();
        
        const existsInCache = this.cache.todos.some(t => 
          t.content === todoContent && t.dueDate === sourcePath
        );
        
        if (!existsInCache && todoContent) {
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
    }
    
    return todos;
  }

  private async syncTodoStatusToDailyNote(dateStr: string, content: string, completed: boolean): Promise<void> {
    const dailyNotePath = this.getDailyNotePath(dateStr);
    
    try {
      let file = this.app.vault.getAbstractFileByPath(dailyNotePath);
      
      if (!(file instanceof TFile)) {
        await this.createDailyNoteWithURI(dateStr);
        await new Promise(resolve => setTimeout(resolve, 1000));
        file = this.app.vault.getAbstractFileByPath(dailyNotePath);
      }
      
      if (file instanceof TFile) {
        let fileContent = await this.app.vault.read(file);
        const checkbox = completed ? '- [x]' : '- [ ]';
        
        const escapedContent = content.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(- \\[([ x])\\] ${escapedContent})`, 'g');
        fileContent = fileContent.replace(regex, `${checkbox} ${content}`);
        
        await this.app.vault.modify(file, fileContent);
      }
    } catch (e) {
      console.error('同步待办状态到日记失败:', e);
    }
  }
  
  private async createDailyNoteWithURI(dateStr: string): Promise<void> {
    const uri = `obsidian://adv-uri?vault=JHUA-Obsidian-Vault&commandid=daily-notes`;
    window.open(uri, '_blank');
  }

  getDailyNotePath(dateStr: string): string {
    const [year, month] = dateStr.split('-');
    return `01-领域（Areas）/00-日常记录/02-日记/${year}/${year}-${month}/${dateStr}.md`;
  }
}

// ==================== 主页视图 ====================

const VIEW_TYPE_HOMEPAGE = 'jhua-hpage-view';

class HomepageView extends ItemView {
  private plugin: JhuaHPagePlugin;
  private todoManager: TodoManager;
  private refreshInterval: number | null = null;
  private projectSortState: { column: string; direction: 'asc' | 'desc' } = { column: 'ddl', direction: 'asc' };

  constructor(leaf: WorkspaceLeaf, plugin: JhuaHPagePlugin) {
    super(leaf);
    this.plugin = plugin;
    this.todoManager = new TodoManager(this.app, this.plugin, this.plugin.settings.todoCachePath);
  }

  getViewType(): string {
    return VIEW_TYPE_HOMEPAGE;
  }

  getDisplayText(): string {
    return '主页';
  }

  getIcon(): string {
    return 'home';
  }

  async onOpen(): Promise<void> {
    await this.todoManager.load();
    await this.render();
    this.refreshInterval = window.setInterval(() => {
      this.updateDateTime();
    }, 60000);
  }

  onClose(): Promise<void> {
    if (this.refreshInterval) {
      window.clearInterval(this.refreshInterval);
    }
    return Promise.resolve();
  }

  private async render(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass('jhua-hpage-container');

    this.renderBanner(container);
    this.renderNavigation(container);
    
    // 项目跟踪区域
    this.renderProjectTracking(container);
    
    // 创建两列布局容器
    const twoColumnContainer = container.createDiv({ cls: 'jhua-two-column' });
    const leftColumn = twoColumnContainer.createDiv({ cls: 'jhua-column jhua-column-left' });
    const rightColumn = twoColumnContainer.createDiv({ cls: 'jhua-column jhua-column-right' });
    
    // 待办事项在左侧
    await this.renderTodoList(leftColumn);
    
    // 待整理在右侧
    this.renderUnorganizedFiles(rightColumn);
    
    this.renderRecentFiles(container);
  }

  private renderBanner(container: HTMLElement): void {
    const banner = container.createDiv({ cls: 'jhua-banner' });
    
    const bgPath = this.plugin.settings.bannerImage;
    if (bgPath) {
      const bgFile = this.app.vault.getAbstractFileByPath(bgPath);
      if (bgFile instanceof TFile) {
        const resourcePath = this.app.vault.getResourcePath(bgFile);
        banner.style.backgroundImage = `url('${resourcePath}')`;
        banner.addClass('jhua-banner-with-bg');
      }
    }

    const content = banner.createDiv({ cls: 'jhua-banner-content' });
    
    const greeting = this.getGreeting();
    const welcomeText = this.plugin.settings.bannerTitle || '欢迎回来';
    content.createEl('h1', { text: `${greeting.emoji} ${greeting.text}，${welcomeText}！`, cls: 'jhua-greeting' });

    const dateTimeEl = content.createDiv({ cls: 'jhua-datetime' });
    dateTimeEl.createEl('span', { text: this.getFormattedDateTime() });

    const countdownsEl = content.createDiv({ cls: 'jhua-countdowns' });
    for (const countdown of this.plugin.settings.countdowns) {
      const days = this.getDaysUntil(countdown.date);
      if (days !== null) {
        const countdownItem = countdownsEl.createDiv({ cls: 'jhua-countdown-item' });
        countdownItem.createEl('span', { text: `⏰ 距离${countdown.name}还有 ${days} 天` });
      }
    }

    // 右下角按钮容器
    const buttonsContainer = banner.createDiv({ cls: 'jhua-banner-buttons' });
    
    // 刷新按钮
    const refreshBtn = buttonsContainer.createEl('button', { cls: 'jhua-banner-refresh' });
    refreshBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`;
    refreshBtn.addEventListener('click', async () => {
      await this.render();
    });

    // 设置按钮
    const settingsBtn = buttonsContainer.createEl('button', { cls: 'jhua-banner-settings' });
    settingsBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
    settingsBtn.addEventListener('click', () => {
      new BannerSettingsModal(this.app, this.plugin).open();
    });
  }

  private renderNavigation(container: HTMLElement): void {
    const navSection = container.createDiv({ cls: 'jhua-nav-section' });
    navSection.createEl('h2', { text: '快捷导航' });

    const navGrid = navSection.createDiv({ cls: 'jhua-nav-grid' });

    // 确保navGroups存在，优先从navGroups.homepage读取
    if (!this.plugin.settings.navGroups) {
      this.plugin.settings.navGroups = { homepage: this.plugin.settings.categories || [] };
    }
    const categories = this.plugin.settings.navGroups.homepage || this.plugin.settings.categories || [];
    for (const category of categories) {
      const categoryCard = navGrid.createDiv({ cls: 'jhua-category-card' });
      categoryCard.style.setProperty('--category-color', category.color);

      const header = categoryCard.createDiv({ cls: 'jhua-category-header' });
      header.createEl('span', { text: `${category.icon} ${category.name}`, cls: 'jhua-category-title' });

      const settingsBtn = header.createEl('button', { cls: 'jhua-nav-settings-btn', text: '⚙️' });
      settingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        new NavigationSettingsModal(this.app, this.plugin, () => this.render(), undefined, 'homepage').open();
      });

      const itemsContainer = categoryCard.createDiv({ cls: 'jhua-category-items' });
      for (const item of category.items) {
        const navItem = itemsContainer.createDiv({ cls: 'jhua-nav-item' });
        navItem.createEl('span', { text: `${item.icon} ${item.name}` });
        
        navItem.addEventListener('click', () => {
          const path = item.path;
          
          // 处理外部文件路径
          if (path.startsWith('file:///')) {
            const localPath = path.replace('file:///', '').replace(/\//g, '\\');
            try {
              const { shell } = require('electron');
              shell.openPath(localPath);
            } catch (e) {
              console.error('Failed to open external file:', e);
            }
            return;
          }
          
          // 处理 Windows 路径
          if (/^[A-Za-z]:[\\\/]/.test(path)) {
            try {
              const { shell } = require('electron');
              shell.openPath(path);
            } catch (e) {
              console.error('Failed to open external file:', e);
            }
            return;
          }
          
          // 处理 obsidian:// 协议
          if (path.startsWith('obsidian://')) {
            window.open(path, '_blank');
            return;
          }
          
          // 处理 http/https URL
          if (path.startsWith('http://') || path.startsWith('https://')) {
            window.open(path, '_blank');
            return;
          }
          
          // Obsidian 内部链接
          this.app.workspace.openLinkText(path, '', true);
        });
      }
    }
  }

  private async renderTodoList(container: HTMLElement): Promise<void> {
    const todoSection = container.createDiv({ cls: 'jhua-todo-section' });
    const header = todoSection.createDiv({ cls: 'jhua-todo-header' });
    
    // 标题 + 当前目录别名
    const titleContainer = header.createDiv({ cls: 'jhua-todo-title-container' });
    titleContainer.createEl('h2', { text: '📝 待办事项' });
    const currentSource = this.plugin.settings.todoSources.find(s => s.id === this.plugin.settings.currentTodoSourceId);
    if (currentSource) {
      titleContainer.createEl('span', { text: currentSource.alias, cls: 'jhua-todo-source-alias' });
    }

    const buttonsContainer = header.createDiv({ cls: 'jhua-todo-header-buttons' });
    
    // 设置按钮
    const settingsBtn = buttonsContainer.createEl('button', { cls: 'jhua-todo-settings-btn' });
    settingsBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
    settingsBtn.addEventListener('click', () => {
      new TodoSourceSettingsModal(this.app, this.plugin, () => this.render()).open();
    });

    // 添加按钮
    const addBtn = buttonsContainer.createEl('button', { text: '+ 创建', cls: 'jhua-todo-add-btn' });
    addBtn.addEventListener('click', () => {
      new AddTodoModal(this.app, this.todoManager, this.plugin, () => this.render()).open();
    });

    const todoList = todoSection.createDiv({ cls: 'jhua-todo-list' });
    
    const cachedTodos = this.todoManager.getTodos();
    const sourceTodos = await this.todoManager.getTodosFromCurrentSource();
    
    const uniqueSourceTodos = sourceTodos.filter(st => 
      !cachedTodos.some(ct => ct.content === st.content && ct.dueDate === st.dueDate)
    );
    
    const allTodos = [...cachedTodos, ...uniqueSourceTodos];
    
    const priorityOrder = { 'high': 0, 'medium': 1, 'low': 2 };
    const sortedTodos = [...allTodos].sort((a, b) => {
      if (a.completed !== b.completed) {
        return a.completed ? 1 : -1;
      }
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    // 过滤已完成的待办：只保留最近前后7天的
    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);
    const sevenDaysLater = new Date(today);
    sevenDaysLater.setDate(today.getDate() + 7);

    const filteredTodos = sortedTodos.filter(todo => {
      // 未完成的全部保留
      if (!todo.completed) return true;
      
      try {
        // 已完成的判断时间范围
        if (todo.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(todo.dueDate)) {
          const todoDate = new Date(todo.dueDate);
          return todoDate >= sevenDaysAgo && todoDate <= sevenDaysLater;
        } else if (todo.dueDate) {
          // 对于文件路径的待办，用文件修改时间判断
          const file = this.app.vault.getAbstractFileByPath(todo.dueDate);
          if (file instanceof TFile) {
            const modifyTime = new Date(file.stat.mtime);
            return modifyTime >= sevenDaysAgo;
          }
        }
        // 兜底：用创建时间判断
        const createTime = new Date(todo.createdAt);
        return createTime >= sevenDaysAgo;
      } catch {
        // 时间解析失败默认保留
        return true;
      }
    });

    for (const todo of filteredTodos) {
      const dueStatus = this.getDueDateStatus(todo.dueDate);
      const completedClass = todo.completed ? 'completed' : '';
      const isFromDailyNote = todo.id.startsWith('daily-');
      const todoItem = todoList.createDiv({ 
        cls: `jhua-todo-item priority-${todo.priority} ${dueStatus} ${completedClass}` 
      });
      
      const checkbox = todoItem.createEl('input', { type: 'checkbox', cls: 'jhua-todo-checkbox' });
      checkbox.checked = todo.completed;
      
      if (!isFromDailyNote) {
        checkbox.addEventListener('change', async () => {
          await this.todoManager.toggleTodo(todo.id);
          this.render();
        });
      } else {
        checkbox.addEventListener('change', async () => {
          if (todo.dueDate) {
            await this.todoManager.syncTodoStatusToDailyNote(todo.dueDate, todo.content, !todo.completed);
            this.render();
          }
        });
      }

      const todoContent = todoItem.createDiv({ cls: 'jhua-todo-content' });
      const dateLabel = todo.dueDate ? `(${todo.dueDate}) ` : '';
      todoContent.createEl('span', { text: `${dateLabel}${todo.content}`, cls: 'jhua-todo-text' });
      
      if (todo.dueDate) {
        todoContent.style.cursor = 'pointer';
        todoContent.addEventListener('click', (e) => {
          if ((e.target as HTMLElement).tagName !== 'INPUT') {
            const dailyNotePath = this.todoManager.getDailyNotePath(todo.dueDate!);
            this.app.workspace.openLinkText(dailyNotePath, '', true);
          }
        });
      }

      if (todo.tags && todo.tags.length > 0) {
        const tagsEl = todoItem.createDiv({ cls: 'jhua-todo-tags' });
        for (const tag of todo.tags) {
          tagsEl.createEl('span', { text: `#${tag}`, cls: 'jhua-todo-tag' });
        }
      }

      if (!isFromDailyNote) {
        const deleteBtn = todoItem.createEl('button', { text: '×', cls: 'jhua-todo-delete' });
        deleteBtn.addEventListener('click', async () => {
          await this.todoManager.deleteTodo(todo.id);
          this.render();
        });
      }
    }

    if (sortedTodos.length === 0) {
      todoList.createDiv({ cls: 'jhua-empty-state', text: '暂无待办事项，点击添加按钮创建' });
    }
  }

  private getDueDateStatus(dueDate?: string): string {
    if (!dueDate) return '';
    try {
      const due = new Date(dueDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      due.setHours(0, 0, 0, 0);
      const diff = (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
      if (diff < 0) return 'due-overdue';
      if (diff === 0) return 'due-today';
      return 'due-future';
    } catch {
      return '';
    }
  }

  private renderRecentFiles(container: HTMLElement): void {
    const recentSection = container.createDiv({ cls: 'jhua-recent-section' });
    recentSection.createEl('h2', { text: '📄 最近文档' });

    const recentList = recentSection.createDiv({ cls: 'jhua-recent-list' });
    const files = this.app.vault.getMarkdownFiles()
      .sort((a, b) => b.stat.mtime - a.stat.mtime)
      .slice(0, 10);

    for (const file of files) {
      const fileItem = recentList.createDiv({ cls: 'jhua-recent-item' });
      fileItem.createEl('span', { text: file.basename, cls: 'jhua-recent-name' });
      fileItem.createEl('span', { text: this.formatRelativeTime(file.stat.mtime), cls: 'jhua-recent-time' });
      
      fileItem.addEventListener('click', () => {
        this.app.workspace.openLinkText(file.path, '', true);
      });
    }
  }

  // ==================== 待整理区域 ====================
  
  private renderUnorganizedFiles(container: HTMLElement): void {
    const section = container.createDiv({ cls: 'jhua-unorganized-section' });
    const header = section.createDiv({ cls: 'jhua-unorganized-header' });
    header.createEl('h2', { text: '📚 待整理' });
    
    if (this.plugin.settings.unorganizedCreateUri) {
      const createBtn = header.createEl('button', { text: '+ 创建', cls: 'jhua-section-create-btn' });
      createBtn.addEventListener('click', () => {
        window.open(this.plugin.settings.unorganizedCreateUri, '_blank');
      });
    }
    
    const filesList = section.createDiv({ cls: 'jhua-unorganized-list' });
    
    const targetFolder = '00-项目（Projects）/05-碎片集合';
    const allFiles = this.app.vault.getMarkdownFiles();
    const unorganizedFiles = allFiles.filter(file => file.path.startsWith(targetFolder));
    
    unorganizedFiles.sort((a, b) => b.stat.mtime - a.stat.mtime);
    
    if (unorganizedFiles.length === 0) {
      filesList.createDiv({ cls: 'jhua-empty-state', text: '该目录下暂无文件' });
      return;
    }
    
    for (const file of unorganizedFiles) {
      const fileItem = filesList.createDiv({ cls: 'jhua-unorganized-item' });
      
      const nameEl = fileItem.createDiv({ cls: 'jhua-unorganized-name' });
      nameEl.createEl('span', { text: file.basename });
      
      const tagsEl = fileItem.createDiv({ cls: 'jhua-unorganized-tags' });
      
      this.getFileTags(file).then(tags => {
        if (tags && tags.length > 0) {
          const tagColors: Record<string, string> = {
            'work': 'jhua-tag-work',
            'study': 'jhua-tag-study',
            'life': 'jhua-tag-life',
            'project': 'jhua-tag-project',
            'plan': 'jhua-tag-plan',
            'pending': 'jhua-tag-pending',
            'progress': 'jhua-tag-progress',
            'done': 'jhua-tag-done',
            'important': 'jhua-tag-important',
            'idea': 'jhua-tag-idea'
          };
          for (const tag of tags) {
            const cleanTag = tag.replace(/^- /, '').trim().toLowerCase();
            const tagEl = tagsEl.createEl('span', { text: `#${cleanTag}`, cls: 'jhua-tag' });
            const tagClass = tagColors[cleanTag];
            if (tagClass) {
              tagEl.addClass(tagClass);
            }
          }
        }
      });
      
      fileItem.addEventListener('click', () => {
        this.app.workspace.openLinkText(file.path, '', true);
      });
    }
  }

  // ==================== 项目跟踪区域 ====================
  
  private renderProjectTracking(container: HTMLElement): void {
    const section = container.createDiv({ cls: 'jhua-project-tracking-section' });
    const header = section.createDiv({ cls: 'jhua-project-tracking-header' });
    header.createEl('h2', { text: '📊 项目跟踪' });
    
    if (this.plugin.settings.projectCreateUri) {
      const createBtn = header.createEl('button', { text: '+ 创建', cls: 'jhua-section-create-btn' });
      createBtn.addEventListener('click', () => {
        window.open(this.plugin.settings.projectCreateUri, '_blank');
      });
    }
    
    const filesList = section.createDiv({ cls: 'jhua-project-list' });
    
    const targetFolder = '00-项目（Projects）';
    const allFiles = this.app.vault.getMarkdownFiles();
    const projectFiles = allFiles.filter(file => file.path.startsWith(targetFolder));
    
    this.loadProjectFiles(filesList, projectFiles);
  }
  
  private async loadProjectFiles(filesList: HTMLElement, projectFiles: TFile[]): Promise<void> {
    const projectItems: ProjectItem[] = [];
    
    for (const file of projectFiles) {
      const metadata = await this.getFileMetadata(file);
      const tags = await this.getFileTags(file);
      if (metadata && metadata.type && metadata.ddl && metadata.progress) {
        projectItems.push({
          file,
          metadata,
          tags
        });
      }
    }
    
    // 创建表头
    const tableHeader = filesList.createDiv({ cls: 'jhua-project-table-header' });
    
    const columns = [
      { key: 'name', label: '项目名称', class: 'jhua-th-name' },
      { key: 'type', label: '类型', class: 'jhua-th-type' },
      { key: 'progress', label: '进度', class: 'jhua-th-progress' },
      { key: 'remark', label: '备注', class: 'jhua-th-remark' },
      { key: 'tags', label: '标签', class: 'jhua-th-tags' },
      { key: 'ddl', label: '截止日期', class: 'jhua-th-ddl' }
    ];
    
    for (const col of columns) {
      const th = tableHeader.createEl('span', { cls: `jhua-project-th ${col.class}` });
      th.createEl('span', { text: col.label });
      
      const sortIndicator = th.createEl('span', { cls: 'jhua-sort-indicator' });
      if (this.projectSortState.column === col.key) {
        sortIndicator.textContent = this.projectSortState.direction === 'asc' ? ' ↑' : ' ↓';
        sortIndicator.addClass('jhua-sort-active');
      }
      
      th.addEventListener('click', () => {
        if (this.projectSortState.column === col.key) {
          this.projectSortState.direction = this.projectSortState.direction === 'asc' ? 'desc' : 'asc';
        } else {
          this.projectSortState.column = col.key;
          this.projectSortState.direction = 'asc';
        }
        this.render();
      });
      
      th.addClass('jhua-sortable');
    }
    
    const sortedItems = this.sortProjectItems(projectItems);
    
    if (sortedItems.length === 0) {
      filesList.createDiv({ cls: 'jhua-empty-state', text: '该目录下暂无符合条件的项目文件（需要type、ddl、progress元数据）' });
      return;
    }
    
    for (const item of sortedItems) {
      const row = filesList.createDiv({ cls: 'jhua-project-row' });
      
      // 项目名称
      const nameCell = row.createDiv({ cls: 'jhua-project-cell jhua-cell-name' });
      nameCell.createEl('span', { text: item.file.basename, cls: 'jhua-project-link' });
      nameCell.addEventListener('click', () => {
        this.app.workspace.openLinkText(item.file.path, '', true);
      });

      // 类型
      const typeCell = row.createDiv({ cls: 'jhua-project-cell jhua-cell-type' });
      const typeBadge = typeCell.createEl('span', { text: item.metadata.type!, cls: 'jhua-meta-badge jhua-type-badge' });

      const typeColors: Record<string, string> = {
        '工作': 'jhua-type-work',
        '学习': 'jhua-type-study',
        '生活': 'jhua-type-life',
        '项目': 'jhua-type-project',
        '计划': 'jhua-type-plan',
        '其他': 'jhua-type-other',
        '待完成': 'jhua-status-pending',
        '进行中': 'jhua-status-progress',
        '已完成': 'jhua-status-done'
      };
      const typeClass = typeColors[item.metadata.type!] || 'jhua-type-default';
      typeBadge.addClass(typeClass);

      // 类型点击修改
      typeBadge.addEventListener('click', async (e) => {
        e.stopPropagation();
        e.preventDefault();
        new TypeSelectModal(
          this.app,
          '选择类型',
          ['待完成', '进行中', '已完成', '工作', '学习', '生活', '项目', '计划', '其他'],
          item.metadata.type!,
          async (newType) => {
            if (newType !== null && newType !== item.metadata.type) {
              const success = await this.updateFileField(item.file, 'type', newType);
              if (success) {
                item.metadata.type = newType;
                typeBadge.textContent = newType;
                typeBadge.className = 'jhua-meta-badge jhua-type-badge';
                const newClass = typeColors[newType] || 'jhua-type-default';
                typeBadge.addClass(newClass);
                new Notice('类型已更新');
              } else {
                new Notice('更新失败');
              }
            }
          }
        ).open();
      });

      // 进度
      const progressCell = row.createDiv({ cls: 'jhua-project-cell jhua-cell-progress' });
      const progressValue = parseFloat(item.metadata.progress!) || 0;
      const progressBadge = progressCell.createEl('span', { cls: 'jhua-meta-badge jhua-progress-badge' });
      progressBadge.textContent = `${progressValue}%`;

      // 进度点击修改 - 预设选项
      progressBadge.addEventListener('click', async (e) => {
        e.stopPropagation();
        e.preventDefault();
        new TypeSelectModal(
          this.app,
          '选择进度',
          ['0', '30', '60', '90', '100'],
          item.metadata.progress || '0',
          async (newProgress) => {
            if (newProgress !== null && newProgress !== item.metadata.progress) {
              const value = parseInt(newProgress) || 0;
              const success = await this.updateFileField(item.file, 'progress', newProgress);
              if (success) {
                item.metadata.progress = newProgress;
                progressBadge.textContent = `${value}%`;
                progressFill.style.width = `${value}%`;
                progressFill.className = 'jhua-progress-fill';
                if (value >= 80) {
                  progressFill.addClass('jhua-progress-high');
                } else if (value >= 50) {
                  progressFill.addClass('jhua-progress-medium');
                } else {
                  progressFill.addClass('jhua-progress-low');
                }
                new Notice('进度已更新');
              } else {
                new Notice('更新失败');
              }
            }
          }
        ).open();
      });

      const progressBar = progressCell.createDiv({ cls: 'jhua-progress-bar' });
      const progressFill = progressBar.createDiv({ cls: 'jhua-progress-fill' });
      progressFill.style.width = `${Math.min(progressValue, 100)}%`;

      if (progressValue >= 80) {
        progressFill.addClass('jhua-progress-high');
      } else if (progressValue >= 50) {
        progressFill.addClass('jhua-progress-medium');
      } else {
        progressFill.addClass('jhua-progress-low');
      }

      // 备注
      const remarkCell = row.createDiv({ cls: 'jhua-project-cell jhua-cell-remark' });
      const remarkText = item.metadata.remark || '点击添加';
      const remarkSpan = remarkCell.createEl('span', { text: remarkText, cls: 'jhua-remark-text' });
      remarkSpan.addEventListener('click', async (e) => {
        e.stopPropagation();
        e.preventDefault();
        
        new InputPromptModal(
          this.app,
          '编辑备注',
          '请输入备注内容',
          item.metadata.remark || '',
          async (newRemark) => {
            if (newRemark !== null && newRemark !== item.metadata.remark) {
              const success = await this.updateFileRemark(item.file, newRemark);
              if (success) {
                item.metadata.remark = newRemark;
                remarkSpan.textContent = newRemark || '点击添加';
                new Notice('备注已更新');
              } else {
                new Notice('更新失败');
              }
            }
          }
        ).open();
      });
      
      // 标签
      // 标签
      const tagsCell = row.createDiv({ cls: 'jhua-project-cell jhua-cell-tags' });
      const tagColors: Record<string, string> = {
        '待完成': 'jhua-tag-pending',
        '进行中': 'jhua-tag-progress',
        '已完成': 'jhua-tag-done',
        '审核中': 'jhua-tag-review',
        '重要': 'jhua-tag-important',
        '紧急': 'jhua-tag-urgent',
        '工作': 'jhua-tag-work',
        '学习': 'jhua-tag-study',
        '生活': 'jhua-tag-life',
        '项目': 'jhua-tag-project',
        '计划': 'jhua-tag-plan',
        '想法': 'jhua-tag-idea'
      };

      if (item.tags && item.tags.length > 0) {
        for (let i = 0; i < item.tags.length; i++) {
          const tag = item.tags[i];
          const cleanTag = tag.replace(/^- /, '').trim();
          const tagContainer = tagsCell.createDiv({ cls: 'jhua-tag-container' });
          const tagEl = tagContainer.createEl('span', { text: `#${cleanTag}`, cls: 'jhua-tag' });
          const tagClass = tagColors[cleanTag];
          if (tagClass) {
            tagEl.addClass(tagClass);
          }
        }
      } else {
        tagsCell.createEl('span', { text: '点击添加', cls: 'jhua-tag-placeholder' });
      }

      // 点击标签列打开标签管理弹窗
      tagsCell.addEventListener('click', async (e) => {
        e.stopPropagation();
        e.preventDefault();
        new TagManageModal(
          this.app,
          item.file,
          item.tags,
          async (newTags) => {
            const success = await this.updateFileTags(item.file, newTags);
            if (success) {
              new Notice('标签已更新');
              this.render();
            } else {
              new Notice('更新失败');
            }
          }
        ).open();
      });

      // DDL
      const ddlCell = row.createDiv({ cls: 'jhua-project-cell jhua-cell-ddl' });
      const ddlDate = new Date(item.metadata.ddl!);
      const today = new Date();
      const daysLeft = Math.ceil((ddlDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      const ddlBadge = ddlCell.createEl('span', { cls: 'jhua-meta-badge jhua-ddl-badge' });
      ddlBadge.textContent = item.metadata.ddl!;

      if (daysLeft < 0) {
        ddlBadge.addClass('jhua-ddl-overdue');
      } else if (daysLeft <= 3) {
        ddlBadge.addClass('jhua-ddl-urgent');
      } else if (daysLeft <= 7) {
        ddlBadge.addClass('jhua-ddl-soon');
      }

      // 截止日期点击修改
      ddlBadge.addEventListener('click', async (e) => {
        e.stopPropagation();
        e.preventDefault();
        new DateSelectModal(
          this.app,
          '选择截止日期',
          item.metadata.ddl || '',
          async (newDdl) => {
            if (newDdl !== null && newDdl !== item.metadata.ddl) {
              const success = await this.updateFileField(item.file, 'ddl', newDdl);
              if (success) {
                item.metadata.ddl = newDdl;
                ddlBadge.textContent = newDdl || '未设置';
                ddlBadge.className = 'jhua-meta-badge jhua-ddl-badge';
                if (newDdl) {
                  const newDdlDate = new Date(newDdl);
                  const newDaysLeft = Math.ceil((newDdlDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                  if (newDaysLeft < 0) {
                    ddlBadge.addClass('jhua-ddl-overdue');
                  } else if (newDaysLeft <= 3) {
                    ddlBadge.addClass('jhua-ddl-urgent');
                  } else if (newDaysLeft <= 7) {
                    ddlBadge.addClass('jhua-ddl-soon');
                  }
                }
                new Notice('截止日期已更新');
              } else {
                new Notice('更新失败');
              }
            }
          }
        ).open();
      });
    }
  }

  private sortProjectItems(items: ProjectItem[]): ProjectItem[] {
    const sortedItems = [...items];
    const { column, direction } = this.projectSortState;
    const multiplier = direction === 'asc' ? 1 : -1;
    
    sortedItems.sort((a, b) => {
      let compareResult = 0;
      
      switch (column) {
        case 'name':
          compareResult = a.file.basename.localeCompare(b.file.basename, 'zh-CN');
          break;
        case 'type':
          compareResult = (a.metadata.type || '').localeCompare(b.metadata.type || '', 'zh-CN');
          break;
        case 'progress':
          const progressA = parseFloat(a.metadata.progress!) || 0;
          const progressB = parseFloat(b.metadata.progress!) || 0;
          compareResult = progressA - progressB;
          break;
        case 'remark':
          compareResult = (a.metadata.remark || '').localeCompare(b.metadata.remark || '', 'zh-CN');
          break;
        case 'tags':
          const tagsA = (a.tags || []).length;
          const tagsB = (b.tags || []).length;
          compareResult = tagsA - tagsB;
          break;
        case 'ddl':
          try {
            const ddlA = new Date(a.metadata.ddl!);
            const ddlB = new Date(b.metadata.ddl!);
            compareResult = ddlA.getTime() - ddlB.getTime();
          } catch (e) {
            compareResult = 0;
          }
          break;
      }
      
      return compareResult * multiplier;
    });
    
    return sortedItems;
  }

  // ==================== 文件元数据操作 ====================
  
  private async getFileTags(file: TFile): Promise<string[]> {
    try {
      const content = await this.app.vault.read(file);
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (frontmatterMatch) {
        const frontmatter = frontmatterMatch[1];
        const tagsMatch = frontmatter.match(/tags:\s*\[?([^\]\n]+)\]?/);
        if (tagsMatch) {
          let tags = tagsMatch[1];
          tags = tags.replace(/[\[\]"']/g, '').split(',').map(t => t.trim()).filter(t => t);
          return tags;
        }
        const listMatch = frontmatter.match(/tags:\s*\n(\s+- .+\n?)+/);
        if (listMatch) {
          const tags = listMatch[0].match(/- (.+)/g);
          if (tags) {
            return tags.map(t => t.replace('- ', '').trim());
          }
        }
      }
      return [];
    } catch (e) {
      return [];
    }
  }
  
  private async getFileMetadata(file: TFile): Promise<FileMetadata | null> {
    try {
      const content = await this.app.vault.read(file);
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (frontmatterMatch) {
        const frontmatter = frontmatterMatch[1];
        const metadata: FileMetadata = {};
        
        const typeMatch = frontmatter.match(/type:\s*(.+)/);
        if (typeMatch) {
          metadata.type = typeMatch[1].trim().replace(/["']/g, '');
        }
        
        const ddlMatch = frontmatter.match(/ddl:\s*(.+)/);
        if (ddlMatch) {
          metadata.ddl = ddlMatch[1].trim().replace(/["']/g, '');
        }
        
        const progressMatch = frontmatter.match(/progress:\s*(.+)/);
        if (progressMatch) {
          metadata.progress = progressMatch[1].trim().replace(/["']/g, '');
        }
        
        const remarkMatch = frontmatter.match(/remark:\s*(.+)/);
        if (remarkMatch) {
          metadata.remark = remarkMatch[1].trim().replace(/["']/g, '');
        }
        
        return metadata;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  private async updateFileField(file: TFile, field: string, value: string): Promise<boolean> {
    try {
      const content = await this.app.vault.read(file);
      const frontmatterMatch = content.match(/^(---\n[\s\S]*?\n---)/);
      if (frontmatterMatch) {
        let frontmatter = frontmatterMatch[1];
        const fieldRegex = new RegExp(`${field}:\\s*.+`);
        if (fieldRegex.test(frontmatter)) {
          frontmatter = frontmatter.replace(fieldRegex, `${field}: ${value}`);
        } else {
          frontmatter = frontmatter.replace(/\n---$/, `\n${field}: ${value}\n---`);
        }
        const newContent = content.replace(/^---\n[\s\S]*?\n---/, frontmatter);
        await this.app.vault.modify(file, newContent);
        return true;
      }
      return false;
    } catch (e) {
      console.error(`更新${field}失败:`, e);
      return false;
    }
  }

  private async updateFileRemark(file: TFile, newRemark: string): Promise<boolean> {
    try {
      const content = await this.app.vault.read(file);
      const frontmatterMatch = content.match(/^(---\n[\s\S]*?\n---)/);
      if (frontmatterMatch) {
        let frontmatter = frontmatterMatch[1];
        
        if (/remark:\s*.+/.test(frontmatter)) {
          frontmatter = frontmatter.replace(/remark:\s*.+/, `remark: ${newRemark}`);
        } else {
          frontmatter = frontmatter.replace(/\n---$/, `\nremark: ${newRemark}\n---`);
        }
        
        const newContent = content.replace(/^---\n[\s\S]*?\n---/, frontmatter);
        await this.app.vault.modify(file, newContent);
        return true;
      }
      return false;
    } catch (e) {
      console.error('更新remark失败:', e);
      return false;
    }
  }
  
  private async updateFileTags(file: TFile, tags: string[]): Promise<boolean> {
    try {
      const content = await this.app.vault.read(file);
      const frontmatterMatch = content.match(/^(---\n[\s\S]*?\n---)/);
      if (frontmatterMatch) {
        let frontmatter = frontmatterMatch[1];
        
        const tagsYaml = tags.length > 0 
          ? `tags:\n${tags.map(t => `  - ${t}`).join('\n')}` 
          : 'tags: []';
        
        if (/tags:\s*\n(\s+- .+\n?)+/.test(frontmatter)) {
          frontmatter = frontmatter.replace(/tags:\s*\n(\s+- .+\n?)+/, tagsYaml + '\n');
        } else if (/tags:\s*\[.+\]/.test(frontmatter)) {
          frontmatter = frontmatter.replace(/tags:\s*\[.+\]/, tagsYaml);
        } else if (/tags:\s*.+/.test(frontmatter)) {
          frontmatter = frontmatter.replace(/tags:\s*.+/, tagsYaml);
        } else {
          frontmatter = frontmatter.replace(/\n---$/, `\n${tagsYaml}\n---`);
        }
        
        const newContent = content.replace(/^---\n[\s\S]*?\n---/, frontmatter);
        await this.app.vault.modify(file, newContent);
        return true;
      }
      return false;
    } catch (e) {
      console.error('更新tags失败:', e);
      return false;
    }
  }

  private getGreeting(): { emoji: string; text: string } {
    const hour = new Date().getHours();
    if (hour < 6) return { emoji: '🌙', text: '夜深了' };
    if (hour < 12) return { emoji: '☀️', text: '早上好' };
    if (hour < 18) return { emoji: '🌤️', text: '下午好' };
    return { emoji: '🌙', text: '晚上好' };
  }

  private getFormattedDateTime(): string {
    const now = new Date();
    const days = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    return `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 ${days[now.getDay()]} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }

  private updateDateTime(): void {
    const dateTimeEl = this.containerEl.querySelector('.jhua-datetime span');
    if (dateTimeEl) {
      dateTimeEl.textContent = this.getFormattedDateTime();
    }
  }

  private getDaysUntil(dateStr: string): number | null {
    try {
      const target = new Date(dateStr);
      const now = new Date();
      const diff = target.getTime() - now.getTime();
      return Math.ceil(diff / (1000 * 60 * 60 * 24));
    } catch {
      return null;
    }
  }

  private formatRelativeTime(timestamp: number): string {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    return `${days}天前`;
  }
}

// ==================== 输入弹窗 ====================

class InputPromptModal extends Modal {
  private title: string;
  private placeholder: string;
  private defaultValue: string;
  private onSubmit: (value: string | null) => void;
  private inputValue: string;

  constructor(
    app: App,
    title: string,
    placeholder: string = '',
    defaultValue: string = '',
    onSubmit: (value: string | null) => void
  ) {
    super(app);
    this.title = title;
    this.placeholder = placeholder;
    this.defaultValue = defaultValue;
    this.onSubmit = onSubmit;
    this.inputValue = defaultValue;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('jhua-input-prompt-modal');
    contentEl.createEl('h2', { text: this.title });

    new Setting(contentEl)
      .addText(text => text
        .setPlaceholder(this.placeholder)
        .setValue(this.defaultValue)
        .onChange(value => {
          this.inputValue = value;
        })
        .inputEl.style.width = '100%');

    new Setting(contentEl)
      .addButton(button => button
        .setButtonText('取消')
        .onClick(() => {
          this.close();
        }))
      .addButton(button => button
        .setButtonText('确定')
        .setCta()
        .onClick(() => {
          this.onSubmit(this.inputValue);
          this.close();
        }));
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

// ==================== 类型选择弹窗 ====================

class TypeSelectModal extends Modal {
  private title: string;
  private options: string[];
  private currentValue: string;
  private onSelect: (value: string | null) => void;

  constructor(
    app: App,
    title: string,
    options: string[],
    currentValue: string,
    onSelect: (value: string | null) => void
  ) {
    super(app);
    this.title = title;
    this.options = options;
    this.currentValue = currentValue;
    this.onSelect = onSelect;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('jhua-type-select-modal');
    contentEl.createEl('h2', { text: this.title });

    const optionsContainer = contentEl.createDiv({ cls: 'jhua-select-options' });
    for (const option of this.options) {
      const optionEl = optionsContainer.createDiv({ cls: 'jhua-select-option' });
      if (option === this.currentValue) {
        optionEl.addClass('jhua-select-option-active');
      }
      optionEl.createEl('span', { text: option });
      optionEl.addEventListener('click', () => {
        this.onSelect(option);
        this.close();
      });
    }

    new Setting(contentEl).addButton((button) =>
      button.setButtonText('取消').onClick(() => {
        this.close();
      })
    );
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

// ==================== 日期选择弹窗 ====================

class DateSelectModal extends Modal {
  private title: string;
  private currentValue: string;
  private onSelect: (value: string | null) => void;
  private selectedDate: string;

  constructor(
    app: App,
    title: string,
    currentValue: string,
    onSelect: (value: string | null) => void
  ) {
    super(app);
    this.title = title;
    this.currentValue = currentValue;
    this.onSelect = onSelect;
    this.selectedDate = currentValue;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('jhua-date-select-modal');
    contentEl.createEl('h2', { text: this.title });

    const dateInput = contentEl.createEl('input', { cls: 'jhua-date-input' });
    dateInput.type = 'date';
    dateInput.value = this.currentValue || new Date().toISOString().split('T')[0];
    dateInput.addEventListener('change', () => {
      this.selectedDate = dateInput.value;
    });

    const buttonsContainer = contentEl.createDiv({ cls: 'jhua-date-buttons' });
    const todayBtn = buttonsContainer.createEl('button', { text: '今天', cls: 'jhua-date-today-btn' });
    todayBtn.addEventListener('click', () => {
      const today = new Date().toISOString().split('T')[0];
      dateInput.value = today;
      this.selectedDate = today;
    });

    const clearBtn = buttonsContainer.createEl('button', { text: '清除', cls: 'jhua-date-clear-btn' });
    clearBtn.addEventListener('click', () => {
      dateInput.value = '';
      this.selectedDate = '';
    });

    new Setting(contentEl)
      .addButton((button) =>
        button.setButtonText('取消').onClick(() => {
          this.close();
        })
      )
      .addButton((button) =>
        button.setButtonText('确定').setCta().onClick(() => {
          this.onSelect(this.selectedDate);
          this.close();
        })
      );
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

// ==================== 标签管理弹窗 ====================

class TagManageModal extends Modal {
  private file: TFile;
  private tags: string[];
  private onSave: (tags: string[]) => Promise<void>;
  private tagColors: Record<string, string>;

  constructor(
    app: App,
    file: TFile,
    tags: string[],
    onSave: (tags: string[]) => Promise<void>
  ) {
    super(app);
    this.file = file;
    this.tags = [...(tags || [])];
    this.onSave = onSave;
    this.tagColors = {
      '待完成': 'jhua-tag-pending',
      '进行中': 'jhua-tag-progress',
      '已完成': 'jhua-tag-done',
      '审核中': 'jhua-tag-review',
      '重要': 'jhua-tag-important',
      '紧急': 'jhua-tag-urgent',
      '工作': 'jhua-tag-work',
      '学习': 'jhua-tag-study',
      '生活': 'jhua-tag-life',
      '项目': 'jhua-tag-project',
      '计划': 'jhua-tag-plan',
      '想法': 'jhua-tag-idea'
    };
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('jhua-tag-manage-modal');
    contentEl.createEl('h2', { text: '标签管理' });

    this.renderTags();

    const inputContainer = contentEl.createDiv({ cls: 'jhua-tag-input-container' });
    const input = inputContainer.createEl('input', {
      cls: 'jhua-tag-input',
      attr: { placeholder: '输入新标签，按回车添加' }
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && input.value.trim()) {
        this.tags.push(input.value.trim());
        input.value = '';
        this.renderTags();
      }
    });

    new Setting(contentEl)
      .addButton((button) =>
        button.setButtonText('取消').onClick(() => {
          this.close();
        })
      )
      .addButton((button) =>
        button.setButtonText('保存').setCta().onClick(async () => {
          await this.onSave(this.tags);
          this.close();
        })
      );
  }

  private renderTags() {
    let tagsList = this.contentEl.querySelector('.jhua-tag-manage-list') as HTMLDivElement;
    if (tagsList) {
      tagsList.empty();
    } else {
      tagsList = this.contentEl.createDiv({ cls: 'jhua-tag-manage-list' });
      this.contentEl.insertBefore(tagsList, this.contentEl.querySelector('.jhua-tag-input-container'));
    }

    if (this.tags.length === 0) {
      tagsList.createDiv({ cls: 'jhua-tag-empty', text: '暂无标签，请添加' });
      return;
    }

    for (let i = 0; i < this.tags.length; i++) {
      const tag = this.tags[i];
      const tagItem = tagsList.createDiv({ cls: 'jhua-tag-manage-item' });

      const tagEl = tagItem.createEl('span', { text: `#${tag}`, cls: 'jhua-tag' });
      const tagClass = this.tagColors[tag];
      if (tagClass) {
        tagEl.addClass(tagClass);
      }

      const editBtn = tagItem.createEl('button', { cls: 'jhua-tag-edit-btn', text: '✎' });
      editBtn.addEventListener('click', () => {
        new InputPromptModal(
          this.app,
          '编辑标签',
          '请输入新标签（不需要输入#）',
          tag,
          (newTag) => {
            if (newTag && newTag.trim() && newTag.trim() !== tag) {
              this.tags[i] = newTag.trim();
              this.renderTags();
            }
          }
        ).open();
      });

      const deleteBtn = tagItem.createEl('button', { cls: 'jhua-tag-delete-btn', text: '×' });
      deleteBtn.addEventListener('click', () => {
        this.tags.splice(i, 1);
        this.renderTags();
      });
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

// ==================== 添加待办弹窗 ====================

class AddTodoModal extends Modal {
  private app: App;
  private todoManager: TodoManager;
  private plugin: JhuaHPagePlugin;
  private onSave: () => void;
  private content_text: string = '';
  private priority: 'high' | 'medium' | 'low' = 'medium';
  private dueDate: string = '';
  private tags: string[] = [];
  private syncToDaily: boolean = true;

  constructor(app: App, todoManager: TodoManager, plugin: JhuaHPagePlugin, onSave: () => void) {
    super(app);
    this.app = app;
    this.todoManager = todoManager;
    this.plugin = plugin;
    this.onSave = onSave;
    this.dueDate = new Date().toISOString().split('T')[0];
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('jhua-add-todo-modal');
    contentEl.createEl('h2', { text: '添加待办' });

    new Setting(contentEl)
      .setName('待办内容')
      .addText(text => text
        .setPlaceholder('输入待办事项...')
        .onChange(value => this.content_text = value));

    new Setting(contentEl)
      .setName('优先级')
      .addDropdown(dropdown => dropdown
        .addOption('low', '低')
        .addOption('medium', '中')
        .addOption('high', '高')
        .setValue('medium')
        .onChange(value => this.priority = value as 'high' | 'medium' | 'low'));

    new Setting(contentEl)
      .setName('截止日期')
      .setDesc('格式: YYYY-MM-DD，默认为今天')
      .addText(text => text
        .setValue(this.dueDate)
        .onChange(value => this.dueDate = value));

    new Setting(contentEl)
      .setName('标签')
      .setDesc('用逗号分隔多个标签，如: 工作,重要')
      .addText(text => text
        .setPlaceholder('标签1, 标签2')
        .onChange(value => {
          this.tags = value.split(',').map(t => t.trim()).filter(t => t);
        }));

    new Setting(contentEl)
      .setName('同步到日记')
      .setDesc('将待办同步到对应日期的日记文件中')
      .addToggle(toggle => toggle
        .setValue(this.syncToDaily)
        .onChange(value => this.syncToDaily = value));

    new Setting(contentEl)
      .addButton(button => button
        .setButtonText('添加')
        .setCta()
        .onClick(async () => {
          if (!this.content_text.trim()) {
            new Notice('请输入待办内容');
            return;
          }
          
          await this.todoManager.addTodo(
            this.content_text,
            this.priority,
            this.dueDate || undefined,
            this.tags.length > 0 ? this.tags : undefined
          );
          
          if (this.syncToDaily && this.dueDate) {
            await this.syncTodoToDailyNote(this.dueDate, this.content_text, false);
          }
          
          new Notice('添加成功！');
          this.onSave();
          this.close();
        }));
  }

  private async syncTodoToDailyNote(dateStr: string, content: string, completed: boolean): Promise<void> {
    const dailyNotePath = this.getDailyNotePath(dateStr);
    
    try {
      let file = this.app.vault.getAbstractFileByPath(dailyNotePath);
      
      if (!(file instanceof TFile)) {
        await this.createDailyNote(dateStr);
        file = this.app.vault.getAbstractFileByPath(dailyNotePath);
      }
      
      if (file instanceof TFile) {
        let fileContent = await this.app.vault.read(file);
        
        const tasksRegex = /(#[📖\s]*Tasks\s*\n)/;
        const checkbox = completed ? '- [x]' : '- [ ]';
        const newTodoLine = `${checkbox} ${content}\n`;
        
        if (tasksRegex.test(fileContent)) {
          fileContent = fileContent.replace(tasksRegex, `$1${newTodoLine}`);
        } else {
          fileContent += `\n# 📖Tasks\n${newTodoLine}`;
        }
        
        await this.app.vault.modify(file, fileContent);
      }
    } catch (e) {
      console.error('同步待办到日记失败:', e);
    }
  }

  private getDailyNotePath(dateStr: string): string {
    const [year, month] = dateStr.split('-');
    return `01-领域（Areas）/00-日常记录/02-日记/${year}/${year}-${month}/${dateStr}.md`;
  }

  private async createDailyNote(dateStr: string): Promise<void> {
    const [year, month] = dateStr.split('-');
    const dirPath = `01-领域（Areas）/00-日常记录/02-日记/${year}/${year}-${month}`;
    
    if (!this.app.vault.getAbstractFileByPath(dirPath)) {
      await this.app.vault.createFolder(dirPath);
    }
    
    const templatePath = this.plugin.settings.dailyNoteTemplate;
    const templateFile = this.app.vault.getAbstractFileByPath(templatePath);
    
    let initialContent = `---
tags:
  - daily_note
---
# 🚦Tracking


# 📒Dairy


# 📖Tasks


# 🎖️Done 完成的事！
`;
    
    if (templateFile instanceof TFile) {
      initialContent = await this.app.vault.read(templateFile);
      initialContent = initialContent.replace(/<%\*[\s\S]*?%>/g, '');
    }
    
    const filePath = `${dirPath}/${dateStr}.md`;
    await this.app.vault.create(filePath, initialContent);
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

// ==================== 导航设置模态框 ====================

export class NavigationSettingsModal extends Modal {
  plugin: JhuaHPagePlugin;
  onCloseCallback: () => void;
  filterCategoryId?: string;
  navId: string; // 🆕 导航分组ID

  constructor(app: App, plugin: JhuaHPagePlugin, onCloseCallback: () => void = () => {}, filterCategoryId?: string, navId: string = 'homepage') {
    super(app);
    this.plugin = plugin;
    this.onCloseCallback = onCloseCallback;
    this.filterCategoryId = filterCategoryId;
    this.navId = navId;
    // 确保当前分组存在
    if (!this.plugin.settings.navGroups) {
      this.plugin.settings.navGroups = { homepage: this.plugin.settings.categories || [] };
    }
    if (!this.plugin.settings.navGroups[this.navId]) {
      this.plugin.settings.navGroups[this.navId] = [];
    }
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('jhua-nav-settings-modal');
    
    contentEl.createEl('h2', { text: this.filterCategoryId ? '编辑当前分类' : '导航设置' });
    
    if (!this.filterCategoryId) {
      new Setting(contentEl)
        .setName('添加新分类')
        .addButton(button => button
          .setButtonText('+ 添加分类')
          .setCta()
          .onClick(() => {
            new CategoryEditModal(this.app, this.plugin, null, () => {
              this.onOpen();
            }, this.navId).open();
          }));
    }

    for (const category of this.plugin.settings.navGroups[this.navId] || []) {
      if (this.filterCategoryId && category.id !== this.filterCategoryId) continue;
      
      const categorySection = contentEl.createDiv({ cls: 'jhua-category-section' });
      
      const categoryHeader = categorySection.createDiv({ cls: 'jhua-category-header' });
      categoryHeader.createEl('span', { text: `${category.icon} ${category.name}`, cls: 'jhua-category-title' });
      
      const categoryActions = categoryHeader.createDiv({ cls: 'jhua-category-actions' });
      
      categoryActions.createEl('button', { text: '编辑分类', cls: 'jhua-btn-small' })
        .addEventListener('click', () => {
          new CategoryEditModal(this.app, this.plugin, category, () => {
            this.onOpen();
          }, this.navId).open();
        });
      
      if (!this.filterCategoryId) {
        categoryActions.createEl('button', { text: '删除', cls: 'jhua-btn-small jhua-btn-danger' })
          .addEventListener('click', async () => {
            if (confirm(`确定删除分类"${category.name}"？`)) {
              this.plugin.settings.navGroups[this.navId] = this.plugin.settings.navGroups[this.navId].filter(c => c.id !== category.id);
              await this.plugin.saveSettings();
              this.onOpen();
            }
          });
      }
      
      const itemsList = categorySection.createDiv({ cls: 'jhua-items-list' });
      
      for (const item of category.items) {
        const itemRow = itemsList.createDiv({ cls: 'jhua-item-row' });
        itemRow.createEl('span', { text: `${item.icon} ${item.name}` });
        itemRow.createEl('span', { text: item.path, cls: 'jhua-item-path' });
        
        const itemActions = itemRow.createDiv({ cls: 'jhua-item-actions' });
        
        itemActions.createEl('button', { text: '编辑', cls: 'jhua-btn-small' })
          .addEventListener('click', () => {
            new ItemEditModal(this.app, this.plugin, category.id, item, () => {
              this.onOpen();
            }, this.navId).open();
          });
        
        itemActions.createEl('button', { text: '删除', cls: 'jhua-btn-small jhua-btn-danger' })
          .addEventListener('click', async () => {
            if (confirm(`确定删除"${item.name}"？`)) {
              category.items = category.items.filter(i => i.id !== item.id);
              await this.plugin.saveSettings();
              this.onOpen();
            }
          });
      }
      
      const addItemBtn = categorySection.createEl('button', { 
        text: '+ 添加导航项', 
        cls: 'jhua-add-item-btn' 
      });
      addItemBtn.addEventListener('click', () => {
        new ItemEditModal(this.app, this.plugin, category.id, null, () => {
          this.onOpen();
        }, this.navId).open();
      });
    }

    new Setting(contentEl)
      .addButton(button => button
        .setButtonText('保存并关闭')
        .setCta()
        .onClick(async () => {
          await this.plugin.saveSettings();
          new Notice('配置已保存');
          this.onCloseCallback();
          this.close();
        }));
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
    this.onCloseCallback();
  }
}

// ==================== 分类编辑模态框 ====================

export class CategoryEditModal extends Modal {
  plugin: JhuaHPagePlugin;
  category: Category | null;
  onSave: () => void;
  navId: string; // 🆕 导航分组ID
  
  name: string = '';
  icon: string = '📁';
  color: string = '#5B93D5';

  constructor(app: App, plugin: JhuaHPagePlugin, category: Category | null, onSave: () => void, navId: string = 'homepage') {
    super(app);
    this.plugin = plugin;
    this.category = category;
    this.onSave = onSave;
    this.navId = navId;
    
    // 确保navGroups存在
    if (!this.plugin.settings.navGroups) {
      this.plugin.settings.navGroups = { homepage: this.plugin.settings.categories || [] };
    }
    if (!this.plugin.settings.navGroups[this.navId]) {
      this.plugin.settings.navGroups[this.navId] = [];
    }
    
    if (category) {
      this.name = category.name;
      this.icon = category.icon;
      this.color = category.color;
    }
  }

  onOpen() {
    const { contentEl } = this;
    
    contentEl.createEl('h2', { text: this.category ? '编辑分类' : '添加分类' });
    
    new Setting(contentEl)
      .setName('分类名称')
      .addText(text => text
        .setPlaceholder('例如：工作')
        .setValue(this.name)
        .onChange(value => {
          this.name = value;
        }));
    
    new Setting(contentEl)
      .setName('图标')
      .setDesc('使用emoji图标')
      .addText(text => text
        .setValue(this.icon)
        .onChange(value => {
          this.icon = value;
        }));
    
    new Setting(contentEl)
      .setName('颜色')
      .addColorPicker(picker => picker
        .setValue(this.color)
        .onChange(value => {
          this.color = value;
        }));
    
    new Setting(contentEl)
      .addButton(button => button
        .setButtonText('保存')
        .setCta()
        .onClick(async () => {
          if (!this.name) {
            new Notice('请输入分类名称');
            return;
          }
          
          if (this.category) {
            this.category.name = this.name;
            this.category.icon = this.icon;
            this.category.color = this.color;
          } else {
            const newCategory: Category = {
              id: `cat-${Date.now()}`,
              name: this.name,
              icon: this.icon,
              color: this.color,
              items: []
            };
            // 🆕 写入对应navId分组，不影响其他分组
            this.plugin.settings.navGroups[this.navId].push(newCategory);
          }
          
          await this.plugin.saveSettings();
          new Notice('保存成功！');
          this.onSave();
          this.close();
        }));
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

// ==================== 项目编辑模态框 ====================

class ItemEditModal extends Modal {
  plugin: JhuaHPagePlugin;
  categoryId: string;
  item: CategoryItem | null;
  onSave: () => void;
  navId: string; // 🆕 导航分组ID
  
  name: string = '';
  path: string = '';
  icon: string = '📄';

  constructor(app: App, plugin: JhuaHPagePlugin, categoryId: string, item: CategoryItem | null, onSave: () => void, navId: string = 'homepage') {
    super(app);
    this.plugin = plugin;
    this.categoryId = categoryId;
    this.item = item;
    this.onSave = onSave;
    this.navId = navId;
    
    // 确保navGroups存在
    if (!this.plugin.settings.navGroups) {
      this.plugin.settings.navGroups = { homepage: this.plugin.settings.categories || [] };
    }
    if (!this.plugin.settings.navGroups[this.navId]) {
      this.plugin.settings.navGroups[this.navId] = [];
    }
    
    if (item) {
      this.name = item.name;
      this.path = item.path;
      this.icon = item.icon;
    }
  }

  onOpen() {
    const { contentEl } = this;
    
    contentEl.createEl('h2', { text: this.item ? '编辑导航项' : '添加导航项' });
    
    new Setting(contentEl)
      .setName('名称')
      .addText(text => text
        .setPlaceholder('例如：工作笔记')
        .setValue(this.name)
        .onChange(value => {
          this.name = value;
        }));
    
    new Setting(contentEl)
      .setName('路径')
      .setDesc('笔记路径或AdvancedURI（obsidian://...）')
      .addText(text => text
        .setPlaceholder('文件夹/笔记名 或 obsidian://...')
        .setValue(this.path)
        .onChange(value => {
          this.path = value;
        }));
    
    new Setting(contentEl)
      .setName('图标')
      .setDesc('使用emoji图标')
      .addText(text => text
        .setValue(this.icon)
        .onChange(value => {
          this.icon = value;
        }));
    
    new Setting(contentEl)
      .addButton(button => button
        .setButtonText('保存')
        .setCta()
        .onClick(async () => {
          if (!this.name || !this.path) {
            new Notice('请输入名称和路径');
            return;
          }
          
          const category = this.plugin.settings.navGroups[this.navId].find((c: Category) => c.id === this.categoryId);
          if (!category) {
            new Notice('分类不存在');
            return;
          }
          
          if (this.item) {
            this.item.name = this.name;
            this.item.path = this.path;
            this.item.icon = this.icon;
          } else {
            const newItem: CategoryItem = {
              id: `item-${Date.now()}`,
              name: this.name,
              path: this.path,
              icon: this.icon
            };
            category.items.push(newItem);
          }
          
          await this.plugin.saveSettings();
          new Notice('保存成功！');
          this.onSave();
          this.close();
        }));
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

// ==================== 待办源设置模态框 ====================

export class TodoSourceSettingsModal extends Modal {
  plugin: JhuaHPagePlugin;
  onSave: () => void;
  
  constructor(app: App, plugin: JhuaHPagePlugin, onSave: () => void) {
    super(app);
    this.plugin = plugin;
    this.onSave = onSave;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('jhua-todo-settings-modal');
    
    contentEl.createEl('h2', { text: '待办目录设置' });
    
    // 当前选中的源
    const currentSource = this.plugin.settings.todoSources.find(s => s.id === this.plugin.settings.currentTodoSourceId);
    
    new Setting(contentEl)
      .setName('当前显示目录')
      .setDesc('选择要显示待办的目录')
      .addDropdown(dropdown => {
        this.plugin.settings.todoSources.forEach(source => {
          dropdown.addOption(source.id, source.alias);
        });
        dropdown.setValue(this.plugin.settings.currentTodoSourceId);
        dropdown.onChange(async (value) => {
          this.plugin.settings.currentTodoSourceId = value;
          await this.plugin.saveSettings();
        });
      });
    
    // 源列表
    contentEl.createEl('h3', { text: '目录配置', cls: 'jhua-settings-subtitle' });
    
    this.plugin.settings.todoSources.forEach((source, index) => {
      const setting = new Setting(contentEl)
        .setName(`目录 ${index + 1}`)
        .addText(text => text
          .setPlaceholder('别名，例如：工作待办')
          .setValue(source.alias)
          .onChange(async (value) => {
            this.plugin.settings.todoSources[index].alias = value;
            await this.plugin.saveSettings();
          }))
        .addText(text => text
          .setPlaceholder('路径，例如：01-领域/工作待办')
          .setValue(source.path)
          .onChange(async (value) => {
            this.plugin.settings.todoSources[index].path = value;
            await this.plugin.saveSettings();
          }))
        .addButton(button => button
          .setButtonText('删除')
          .setWarning()
          .onClick(async () => {
            if (this.plugin.settings.todoSources.length <= 1) {
              new Notice('至少保留一个待办目录');
              return;
            }
            this.plugin.settings.todoSources.splice(index, 1);
            // 如果删除的是当前选中的，默认选第一个
            if (source.id === this.plugin.settings.currentTodoSourceId) {
              this.plugin.settings.currentTodoSourceId = this.plugin.settings.todoSources[0].id;
            }
            await this.plugin.saveSettings();
            this.close();
            new TodoSourceSettingsModal(this.app, this.plugin, this.onSave).open();
          }));
    });
    
    // 添加新目录
    new Setting(contentEl)
      .addButton(button => button
        .setButtonText('+ 添加目录')
        .setCta()
        .onClick(async () => {
          const newSource = {
            id: `todo-source-${Date.now()}`,
            alias: '新目录',
            path: ''
          };
          this.plugin.settings.todoSources.push(newSource);
          await this.plugin.saveSettings();
          this.close();
          new TodoSourceSettingsModal(this.app, this.plugin, this.onSave).open();
        }));
    
    // 保存按钮
    new Setting(contentEl)
      .addButton(button => button
        .setButtonText('保存并刷新')
        .setCta()
        .onClick(async () => {
          await this.plugin.saveSettings();
          new Notice('待办目录配置已保存');
          this.onSave();
          this.close();
        }));
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

// ==================== Banner设置模态框 ====================

class BannerSettingsModal extends Modal {
  plugin: JhuaHPagePlugin;

  constructor(app: App, plugin: JhuaHPagePlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('jhua-banner-settings-modal');
    
    contentEl.createEl('h2', { text: 'Banner设置' });
    
    new Setting(contentEl)
      .setName('背景图片路径')
      .setDesc('Banner的背景图片，支持png/jpg/webp')
      .addText(text => text
        .setPlaceholder('VaultSources/pasted_pics/xxx.png')
        .setValue(this.plugin.settings.bannerImage)
        .onChange(async (value) => {
          this.plugin.settings.bannerImage = value;
          await this.plugin.saveSettings();
        }));

    new Setting(contentEl)
      .setName('欢迎语')
      .setDesc('Banner显示的欢迎文字')
      .addText(text => text
        .setPlaceholder('欢迎回来')
        .setValue(this.plugin.settings.bannerTitle)
        .onChange(async (value) => {
          this.plugin.settings.bannerTitle = value;
          await this.plugin.saveSettings();
        }));
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

// ==================== 插件设置页 ====================

class JhuaHPageSettingTab extends PluginSettingTab {
  plugin: JhuaHPagePlugin;

  constructor(app: App, plugin: JhuaHPagePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Jhua主页插件设置' });

    new Setting(containerEl)
      .setName('待办缓存路径')
      .setDesc('待办事项JSON缓存文件的存储路径')
      .addText(text => text
        .setPlaceholder('VaultSources/主页数据/todos.json')
        .setValue(this.plugin.settings.todoCachePath)
        .onChange(async (value) => {
          this.plugin.settings.todoCachePath = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('待办事项文档路径')
      .setDesc('点击创建按钮直接打开的待办文档路径')
      .addText(text => text
        .setPlaceholder('01-领域（Areas）/00-日常记录/02-日记/待办事项.md')
        .setValue(this.plugin.settings.todoDocumentPath)
        .onChange(async (value) => {
          this.plugin.settings.todoDocumentPath = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Banner背景图')
      .setDesc('Banner区域的背景图片路径')
      .addText(text => text
        .setPlaceholder('VaultSources/pasted_pics/xxx.png')
        .setValue(this.plugin.settings.bannerImage)
        .onChange(async (value) => {
          this.plugin.settings.bannerImage = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Banner标题')
      .setDesc('Banner区域显示的欢迎语')
      .addText(text => text
        .setPlaceholder('欢迎回来')
        .setValue(this.plugin.settings.bannerTitle)
        .onChange(async (value) => {
          this.plugin.settings.bannerTitle = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('日记模板路径')
      .setDesc('创建日记时使用的模板文件路径')
      .addText(text => text
        .setPlaceholder('templates/11-日记模板.md')
        .setValue(this.plugin.settings.dailyNoteTemplate)
        .onChange(async (value) => {
          this.plugin.settings.dailyNoteTemplate = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('项目跟踪创建URI')
      .setDesc('项目跟踪区域创建按钮的AdvancedURI')
      .addText(text => text
        .setPlaceholder('obsidian://adv-uri?vault=...')
        .setValue(this.plugin.settings.projectCreateUri)
        .onChange(async (value) => {
          this.plugin.settings.projectCreateUri = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('待整理创建URI')
      .setDesc('待整理区域创建按钮的AdvancedURI')
      .addText(text => text
        .setPlaceholder('obsidian://adv-uri?vault=...')
        .setValue(this.plugin.settings.unorganizedCreateUri)
        .onChange(async (value) => {
          this.plugin.settings.unorganizedCreateUri = value;
          await this.plugin.saveSettings();
        }));

    // 待整理扫描路径设置
    containerEl.createEl('h3', { text: '📥 待整理扫描路径' });
    containerEl.createEl('p', { text: '配置待整理区域检索的文件夹路径。"/"表示仓库根目录（仅扫描根目录下的md文件，不含子目录）。', attr: { style: 'color: var(--text-muted); font-size: 0.9em; margin-bottom: 12px;' } });
    
    const pathsContainer = containerEl.createDiv({ cls: 'jhua-scan-paths-container' });
    const renderPaths = () => {
      pathsContainer.empty();
      const paths = this.plugin.settings.unorganizedScanPaths || [];
      paths.forEach((path: string, index: number) => {
        new Setting(pathsContainer)
          .setName(`路径 ${index + 1}`)
          .addText(text => text
            .setPlaceholder('例如：/ 或 00-项目（Projects）/05-碎片集合')
            .setValue(path)
            .onChange(async (value) => {
              this.plugin.settings.unorganizedScanPaths[index] = value;
              await this.plugin.saveSettings();
            }))
          .addExtraButton(btn => btn
            .setIcon('trash')
            .setTooltip('删除此路径')
            .onClick(async () => {
              this.plugin.settings.unorganizedScanPaths.splice(index, 1);
              await this.plugin.saveSettings();
              renderPaths();
            }));
      });
    };
    renderPaths();
    
    new Setting(containerEl)
      .setName('添加扫描路径')
      .addButton(button => button
        .setButtonText('+ 添加路径')
        .setCta()
        .onClick(async () => {
          if (!this.plugin.settings.unorganizedScanPaths) {
            this.plugin.settings.unorganizedScanPaths = [];
          }
          this.plugin.settings.unorganizedScanPaths.push('');
          await this.plugin.saveSettings();
          renderPaths();
        }));

    new Setting(contentEl)
      .setName('导航设置')
      .setDesc('配置导航分类和项目')
      .addButton(button => button
        .setButtonText('打开导航设置')
        .onClick(() => {
          new NavigationSettingsModal(this.app, this.plugin).open();
        }));

    // ==================== 天气设置 ====================
    contentEl.createEl('h3', { text: '🌤️ 天气预报设置', cls: 'jhua-settings-subtitle' });
    contentEl.createEl('p', { text: '使用 Open-Meteo 免费API，无需申请Key。默认定位佛山南海区里水镇。', attr: { style: 'color: var(--text-muted); font-size: 0.9em; margin-bottom: 12px;' } });

    new Setting(contentEl)
      .setName('地区名称')
      .setDesc('天气卡片显示的地区名')
      .addText(text => text
        .setPlaceholder('里水镇')
        .setValue(this.plugin.settings.weatherLocationName || '里水镇')
        .onChange(async (value) => {
          this.plugin.settings.weatherLocationName = value;
          await this.plugin.saveSettings();
        }));

    new Setting(contentEl)
      .setName('纬度')
      .setDesc('地区纬度（里水镇: 23.16）')
      .addText(text => text
        .setPlaceholder('23.16')
        .setValue(String(this.plugin.settings.weatherLatitude || 23.16))
        .onChange(async (value) => {
          const num = parseFloat(value);
          if (!isNaN(num)) {
            this.plugin.settings.weatherLatitude = num;
            await this.plugin.saveSettings();
          }
        }));

    new Setting(contentEl)
      .setName('经度')
      .setDesc('地区经度（里水镇: 113.15）')
      .addText(text => text
        .setPlaceholder('113.15')
        .setValue(String(this.plugin.settings.weatherLongitude || 113.15))
        .onChange(async (value) => {
          const num = parseFloat(value);
          if (!isNaN(num)) {
            this.plugin.settings.weatherLongitude = num;
            await this.plugin.saveSettings();
          }
        }));

    // ==================== 新增：模块列表和使用说明 ====================
    contentEl.createEl('h3', { text: '可用模块列表及使用说明', cls: 'jhua-settings-subtitle' });
    
    // 导入模块列表
    const { MODULES } = require('./src/modules');
    
    MODULES.forEach(module => {
      const moduleSection = contentEl.createDiv({ cls: 'jhua-module-section' });
      
      // 模块基础信息
      const moduleHeader = moduleSection.createDiv({ cls: 'jhua-module-header' });
      moduleHeader.createEl('span', { text: `📦 ${module.name}`, cls: 'jhua-module-name' });
      moduleHeader.createEl('span', { text: `ID: ${module.id}`, cls: 'jhua-module-id' });
      
      // 调用示例
      const exampleSection = moduleSection.createDiv({ cls: 'jhua-example-section' });
      exampleSection.createEl('div', { text: '🔖 标签调用示例：', cls: 'jhua-example-title' });
      exampleSection.createEl('code', { text: `{{jhua-hpage:${module.id}}}`, cls: 'jhua-code' });
      exampleSection.createEl('div', { text: '带参数示例：', cls: 'jhua-example-desc' });
      exampleSection.createEl('code', { text: `{{jhua-hpage:${module.id}?参数名=值}}`, cls: 'jhua-code' });
      
      exampleSection.createEl('div', { text: '📝 代码块调用示例：', cls: 'jhua-example-title' });
      exampleSection.createEl('pre', { text: ```jhua-hpage
module: ${module.id}
config:
  参数名: 值
      ```, cls: 'jhua-code-block' });
      
      // 参数说明
      const paramSection = moduleSection.createDiv({ cls: 'jhua-param-section' });
      paramSection.createEl('div', { text: '⚙️ 支持的参数：', cls: 'jhua-param-title' });
      const paramList = paramSection.createEl('ul', { cls: 'jhua-param-list' });
      
      // 通用参数
      const commonParams = [
        { name: 'span', desc: '模块占列数，1~4，默认根据模块自动适配' },
      ];
      commonParams.forEach(p => {
        const li = paramList.createEl('li');
        li.createEl('strong', { text: p.name });
        li.createEl('span', { text: `：${p.desc}` });
      });
      
      // 模块特有参数
      Object.entries(module.defaultConfig).forEach(([key, defaultValue]) => {
        const li = paramList.createEl('li');
        li.createEl('strong', { text: key });
        li.createEl('span', { text: `：默认值 ${JSON.stringify(defaultValue)}` });
      });
      
      // 分隔线
      contentEl.createEl('hr', { cls: 'jhua-separator' });
    });
  }
}

// ==================== 主插件类 ====================

export default class JhuaHPagePlugin extends Plugin {
  settings: JhuaHPageSettings;

  async onload() {
    await this.loadSettings();

    this.registerView(VIEW_TYPE_HOMEPAGE, (leaf) => new HomepageView(leaf, this));

    this.addRibbonIcon('home', '打开主页', () => {
      this.activateView();
    });

    this.addCommand({
      id: 'open-homepage',
      name: '打开主页',
      callback: () => {
        this.activateView();
      }
    });

    // ==================== 注册模板标签解析器（{{jhua-hpage:xxx}}） ====================
    this.registerMarkdownPostProcessor(async (el, ctx) => {
      // 跳过已经渲染过的内容，避免重复刷新
      if (el.closest('[data-jhua-rendered="true"]')) return;
      
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        // 跳过空文本和已经在渲染容器里的内容
        if (!node.textContent?.trim() || node.parentElement?.closest('[data-jhua-rendered="true"]')) continue;
        
        const text = node.textContent || '';
        const regex = /{{jhua-hpage:([a-z-]+)(\?.*?)?}}/g;
        let match: RegExpExecArray | null;
        
        while ((match = regex.exec(text)) !== null) {
          const moduleId = match[1];
          const queryString = match[2] || '';
          const module = getModuleById(moduleId);
          
          if (!module) continue;
          
          // 解析查询参数
          const config = { ...module.defaultConfig, ...this.settings, plugin: this };
          // 传递倒数日和天气配置
          if (moduleId === 'countdown-card') {
            config.countdownEvents = this.settings.countdownEvents || [];
          }
          if (moduleId === 'weather-card') {
            config.latitude = this.settings.weatherLatitude || 23.16;
            config.longitude = this.settings.weatherLongitude || 113.15;
            config.locationName = this.settings.weatherLocationName || '里水镇';
          }
          let span = 4; // 默认全宽
          let rightModuleId: string | null = null;
          if (queryString) {
            const params = new URLSearchParams(queryString.slice(1));
            params.forEach((value, key) => {
              try {
                config[key] = JSON.parse(value);
              } catch {
                config[key] = value;
              }
              if (key === 'span') {
                span = parseInt(value) || 4;
              }
              if (key === 'right') {
                rightModuleId = value;
              }
            });
          }
          
          // 如果指定了right模块，自动将span降为2（半宽），除非用户已显式指定
          if (rightModuleId && span === 4) {
            span = 2;
            config.span = 2;
          }
          
          // 判断是否有right参数，需要并排布局
          const rightModule = rightModuleId ? getModuleById(rightModuleId) : null;
          
          let finalContainer: HTMLElement;
          
          if (rightModule) {
            // 创建flex行容器，左右并排
            finalContainer = document.createElement('div');
            finalContainer.className = 'jhua-hpage-inline-render jhua-row-layout';
            finalContainer.dataset.jhuaRendered = 'true';
            finalContainer.style.setProperty('display', 'flex', 'important');
            finalContainer.style.setProperty('gap', '16px', 'important');
            finalContainer.style.setProperty('margin-bottom', '20px', 'important');
            finalContainer.style.setProperty('width', '100%', 'important');
            
            // 左侧：主模块 — 用外层div控制宽度，内层div作为render容器
            const leftWrapper = document.createElement('div');
            leftWrapper.dataset.jhuaRendered = 'true';
            if (span === 2) {
              leftWrapper.style.setProperty('width', '50%', 'important');
              leftWrapper.style.setProperty('min-width', '300px', 'important');
            } else if (span === 1) {
              leftWrapper.style.setProperty('width', '25%', 'important');
              leftWrapper.style.setProperty('min-width', '200px', 'important');
            } else if (span === 3) {
              leftWrapper.style.setProperty('width', '75%', 'important');
            }
            leftWrapper.style.setProperty('flex-shrink', '0', 'important');
            
            const leftRenderDiv = document.createElement('div');
            leftRenderDiv.dataset.jhuaRendered = 'true';
            leftRenderDiv.style.setProperty('width', '100%', 'important');
            await module.render(this.app, config, leftRenderDiv);
            leftWrapper.appendChild(leftRenderDiv);
            finalContainer.appendChild(leftWrapper);
            
            // 右侧：指定模块 — 用外层div控制flex填充，内层div作为render容器
            const rightWrapper = document.createElement('div');
            rightWrapper.dataset.jhuaRendered = 'true';
            rightWrapper.style.setProperty('flex', '1', 'important');
            rightWrapper.style.setProperty('min-width', '200px', 'important');
            
            const rightRenderDiv = document.createElement('div');
            rightRenderDiv.dataset.jhuaRendered = 'true';
            rightRenderDiv.style.setProperty('width', '100%', 'important');
            const rightSpan = 4 - span;
            const rightConfig = { ...rightModule.defaultConfig, ...this.settings, plugin: this, span: rightSpan };
            await rightModule.render(this.app, rightConfig, rightRenderDiv);
            rightWrapper.appendChild(rightRenderDiv);
            finalContainer.appendChild(rightWrapper);
            
          } else if (rightModuleId) {
            // right指定了但模块不存在，显示错误
            finalContainer = document.createElement('div');
            finalContainer.className = 'jhua-hpage-inline-render';
            finalContainer.dataset.jhuaRendered = 'true';
            finalContainer.style.setProperty('width', '100%', 'important');
            finalContainer.style.setProperty('margin-bottom', '20px', 'important');
            finalContainer.createEl('div', { 
              text: `❌ right参数指定的模块不存在：${rightModuleId}`, 
              cls: 'jhua-hpage-error',
              attr: { style: 'padding: 12px; background: var(--background-modifier-error); border-radius: 8px; color: var(--text-error);' }
            });
          } else {
            // 无right参数，保持原有逻辑
            finalContainer = document.createElement('div');
            finalContainer.className = `jhua-hpage-inline-render jhua-span-${span}`;
            finalContainer.dataset.jhuaRendered = 'true';
            
            finalContainer.style.setProperty('display', 'inline-block', 'important');
            finalContainer.style.setProperty('vertical-align', 'top', 'important');
            finalContainer.style.setProperty('margin-right', '20px', 'important');
            finalContainer.style.setProperty('margin-bottom', '20px', 'important');
            
            if (span === 2) {
              finalContainer.style.setProperty('width', 'calc(50% - 10px)', 'important');
              finalContainer.style.setProperty('min-width', '300px', 'important');
            } else if (span === 1) {
              finalContainer.style.setProperty('width', 'calc(25% - 5px)', 'important');
              finalContainer.style.setProperty('min-width', '200px', 'important');
            } else if (span === 3) {
              finalContainer.style.setProperty('width', 'calc(75% - 15px)', 'important');
            } else { // span=4 全宽
              finalContainer.style.setProperty('width', '100%', 'important');
              finalContainer.style.setProperty('margin-right', '0', 'important');
            }
            
            if (finalContainer.nextElementSibling === null) {
              finalContainer.style.setProperty('margin-right', '0', 'important');
            }
            
            module.render(this.app, config, finalContainer);
          }
          
          const parent = node.parentElement;
          if (parent) {
            parent.replaceChild(finalContainer, node);
          }
        }
      }
    });

    // ==================== 注册代码块处理器（```jhua-hpage```） ====================
    this.registerMarkdownCodeBlockProcessor('jhua-hpage', async (source, el, ctx) => {
      // 跳过已经渲染过的内容
      if (el.closest('[data-jhua-rendered="true"]')) return;
      el.dataset.jhuaRendered = 'true'; // 添加渲染标记
      
      try {
        const config = parse(source);
        const module = getModuleById(config.module);
        if (!module) {
          el.createEl('div', { text: `❌ 不存在的模块：${config.module}`, cls: 'jhua-hpage-error' });
          return;
        }
        
        // 合并配置
        const finalConfig = { ...module.defaultConfig, ...this.settings, plugin: this, ...(config.config || {}) };
        // 读取span参数
        let span = finalConfig.span || 4;
        // 读取right参数
        const rightModuleId = finalConfig.right || null;
        const rightModule = rightModuleId ? getModuleById(rightModuleId) : null;
        
        // 如果指定了right模块，自动将span降为2（半宽），除非用户已显式指定
        if (rightModule && span === 4) {
          span = 2;
          finalConfig.span = 2;
        }
        
        el.dataset.jhuaRendered = 'true'; // 添加渲染标记
        
        if (rightModule) {
          // flex行布局：左侧主模块 + 右侧指定模块
          el.className = 'jhua-hpage-inline-render jhua-row-layout';
          el.style.setProperty('display', 'flex', 'important');
          el.style.setProperty('gap', '16px', 'important');
          el.style.setProperty('margin-bottom', '20px', 'important');
          el.style.setProperty('width', '100%', 'important');
          
          // 左侧主模块 — 外层div控制宽度，内层div作为render容器
          const leftWrapper = el.createDiv({ attr: { 'data-jhua-rendered': 'true' } });
          if (span === 2) {
            leftWrapper.style.setProperty('width', '50%', 'important');
            leftWrapper.style.setProperty('min-width', '300px', 'important');
          } else if (span === 1) {
            leftWrapper.style.setProperty('width', '25%', 'important');
            leftWrapper.style.setProperty('min-width', '200px', 'important');
          } else if (span === 3) {
            leftWrapper.style.setProperty('width', '75%', 'important');
          }
          leftWrapper.style.setProperty('flex-shrink', '0', 'important');
          
          const leftRenderDiv = leftWrapper.createDiv({ attr: { 'data-jhua-rendered': 'true' } });
          leftRenderDiv.style.setProperty('width', '100%', 'important');
          await module.render(this.app, finalConfig, leftRenderDiv);
          
          // 右侧指定模块 — 外层div控制flex填充，内层div作为render容器
          const rightWrapper = el.createDiv({ attr: { 'data-jhua-rendered': 'true' } });
          rightWrapper.style.setProperty('flex', '1', 'important');
          rightWrapper.style.setProperty('min-width', '200px', 'important');
          
          const rightRenderDiv = rightWrapper.createDiv({ attr: { 'data-jhua-rendered': 'true' } });
          rightRenderDiv.style.setProperty('width', '100%', 'important');
          const rightSpan = 4 - span;
          const rightConfig = { ...rightModule.defaultConfig, ...this.settings, plugin: this, span: rightSpan };
          await rightModule.render(this.app, rightConfig, rightRenderDiv);
          
        } else if (rightModuleId) {
          // right指定了但模块不存在
          el.className = 'jhua-hpage-inline-render';
          el.style.setProperty('width', '100%', 'important');
          el.createEl('div', { 
            text: `❌ right参数指定的模块不存在：${rightModuleId}`, 
            cls: 'jhua-hpage-error',
            attr: { style: 'padding: 12px; background: var(--background-modifier-error); border-radius: 8px; color: var(--text-error);' }
          });
        } else {
          // 无right参数，保持原有逻辑
          el.addClass(`jhua-span-${span}`);
          
          el.style.setProperty('display', 'inline-block', 'important');
          el.style.setProperty('vertical-align', 'top', 'important');
          el.style.setProperty('margin-right', '20px', 'important');
          el.style.setProperty('margin-bottom', '20px', 'important');
          
          if (span === 2) {
            el.style.setProperty('width', 'calc(50% - 10px)', 'important');
            el.style.setProperty('min-width', '300px', 'important');
          } else if (span === 1) {
            el.style.setProperty('width', 'calc(25% - 5px)', 'important');
            el.style.setProperty('min-width', '200px', 'important');
          } else if (span === 3) {
            el.style.setProperty('width', 'calc(75% - 15px)', 'important');
          } else { // span=4 全宽
            el.style.setProperty('width', '100%', 'important');
            el.style.setProperty('margin-right', '0', 'important');
          }
          
          if (el.nextElementSibling === null) {
            el.style.setProperty('margin-right', '0', 'important');
          }
          
          // 渲染模块
          await module.render(this.app, finalConfig, el);
        }
      } catch (e) {
        el.createEl('div', { text: `❌ 配置解析错误：${e}`, cls: 'jhua-hpage-error' });
      }
    });

    // ==================== 注册行布局代码块处理器（```jhua-hpage-row```） ====================
    // 用法：```jhua-hpage-row\nmodules:\n  - id: countdown-card\n    span: 1\n  - id: weather-card\n    span: 1\n  - id: daily-tasks\n    span: 1\n  - id: quick-nav\n    span: 1\n    ```
    // 一行最多4个模块，span总和必须为4
    this.registerMarkdownCodeBlockProcessor('jhua-hpage-row', async (source, el, ctx) => {
      if (el.closest('[data-jhua-rendered="true"]')) return;
      el.dataset.jhuaRendered = 'true';

      try {
        const config = parse(source);
        const moduleDefs: { id: string; span: number; config?: Record<string, any> }[] = config.modules || [];

        // 校验span总和
        const totalSpan = moduleDefs.reduce((sum, m) => sum + (m.span || 1), 0);
        if (totalSpan !== 4) {
          el.createEl('div', { 
            text: `❌ 行布局span总和必须为4，当前为${totalSpan}`, 
            cls: 'jhua-hpage-error',
            attr: { style: 'padding: 12px; background: var(--background-modifier-error); border-radius: 8px; color: var(--text-error);' }
          });
          return;
        }

        if (moduleDefs.length > 4) {
          el.createEl('div', { 
            text: '❌ 一行最多4个模块', 
            cls: 'jhua-hpage-error',
            attr: { style: 'padding: 12px; background: var(--background-modifier-error); border-radius: 8px; color: var(--text-error);' }
          });
          return;
        }

        // 创建flex行容器
        el.className = 'jhua-hpage-inline-render jhua-row-layout';
        el.style.setProperty('display', 'flex', 'important');
        el.style.setProperty('gap', '12px', 'important');
        el.style.setProperty('margin-bottom', '20px', 'important');
        el.style.setProperty('width', '100%', 'important');
        el.style.setProperty('flex-wrap', 'nowrap', 'important');

        for (const modDef of moduleDefs) {
          const module = getModuleById(modDef.id);
          if (!module) {
            const errDiv = el.createDiv({ 
              text: `❌ 模块不存在：${modDef.id}`, 
              cls: 'jhua-hpage-error',
              attr: { style: 'padding: 8px; background: var(--background-modifier-error); border-radius: 8px; color: var(--text-error); font-size: 0.9em;' }
            });
            errDiv.style.setProperty('flex', `${modDef.span}`, 'important');
            continue;
          }

          // 外层wrapper控制宽度
          const wrapper = document.createElement('div');
          wrapper.dataset.jhuaRendered = 'true';
          const pct = (modDef.span / 4) * 100;
          wrapper.style.setProperty('flex', `${modDef.span}`, 'important');
          wrapper.style.setProperty('min-width', '0', 'important');
          wrapper.style.setProperty('max-width', `${pct}%`, 'important');

          // 内层renderDiv
          const renderDiv = document.createElement('div');
          renderDiv.dataset.jhuaRendered = 'true';
          renderDiv.style.setProperty('width', '100%', 'important');

          const moduleConfig = { ...module.defaultConfig, ...this.settings, plugin: this, span: modDef.span, ...(modDef.config || {}) };
          // 传递倒数日和天气配置
          if (modDef.id === 'countdown-card') {
            moduleConfig.countdownEvents = this.settings.countdownEvents || [];
          }
          if (modDef.id === 'weather-card') {
            moduleConfig.latitude = this.settings.weatherLatitude || 23.16;
            moduleConfig.longitude = this.settings.weatherLongitude || 113.15;
            moduleConfig.locationName = this.settings.weatherLocationName || '里水镇';
          }

          await module.render(this.app, moduleConfig, renderDiv);
          wrapper.appendChild(renderDiv);
          el.appendChild(wrapper);
        }
      } catch (e) {
        el.createEl('div', { text: `❌ 行布局配置解析错误：${e}`, cls: 'jhua-hpage-error' });
      }
    });

    this.addSettingTab(new JhuaHPageSettingTab(this.app, this));
  }

  onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_HOMEPAGE);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async activateView() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_HOMEPAGE);

    const leaf = this.app.workspace.getLeaf(false);
    await leaf.setViewState({
      type: VIEW_TYPE_HOMEPAGE,
      active: true
    });

    this.app.workspace.revealLeaf(leaf);
  }
}
