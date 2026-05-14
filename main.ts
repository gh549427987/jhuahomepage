import { App, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';
import { parse } from 'yaml';
import { MODULES, getModuleById } from './src/modules';
import { parseCuotiSource, renderCuotiCard } from './src/modules/cuoti-card';
import { parseProgressSource, renderProgressCard } from './src/modules/progress-card';
import { parseDailyNote } from './src/modules/daily-note';
import { CategoryItem, Category, JhuaHPageSettings } from './src/types';

const DEFAULT_SETTINGS: JhuaHPageSettings = {
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
        const moduleDefs: { id: string; span: number; config?: Record<string, any>; [key: string]: any }[] = config.modules || [];

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
        el.style.setProperty('align-items', 'stretch', 'important');

        // 行高参数：统一控制整行高度
        const rowHeight = config.rowHeight || '';
        if (rowHeight) {
          el.style.setProperty('height', rowHeight, 'important');
        }

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

          // 从模块定义中提取所有额外属性（排除 id 和 span），作为模块配置传入
          // 键名归一化：下划线/连字符转驼峰（如 max_items → maxItems）
          // 同时对于全小写复合词（如 maxitems），尝试匹配模块 defaultConfig 中的驼峰键
          const extraConfig: Record<string, any> = {};
          const moduleDefaultKeys = Object.keys(module.defaultConfig || {});
          const moduleDefaultKeysLower = moduleDefaultKeys.map(k => k.toLowerCase());

          for (const [key, value] of Object.entries(modDef)) {
            if (key === 'id' || key === 'span' || key === 'config') continue;
            // 下划线/连字符转驼峰
            const camelKey = key.replace(/[-_]([a-z])/g, (_, c) => c.toUpperCase());
            extraConfig[camelKey] = value;
            // 如果原始键和驼峰键不同，也存一份原始键（兼容）
            if (camelKey !== key) extraConfig[key] = value;
            // 尝试匹配模块 defaultConfig 中的驼峰键（如 maxitems → maxItems）
            const lowerIdx = moduleDefaultKeysLower.indexOf(key.toLowerCase());
            if (lowerIdx >= 0) {
              extraConfig[moduleDefaultKeys[lowerIdx]] = value;
            }
          }
          // 同时兼容嵌套的 config 字段（旧格式）
          if (modDef.config && typeof modDef.config === 'object') {
            Object.assign(extraConfig, modDef.config);
          }

          // 外层wrapper控制宽度
          const wrapper = document.createElement('div');
          wrapper.dataset.jhuaRendered = 'true';
          const pct = (modDef.span / 4) * 100;
          wrapper.style.setProperty('flex', `${modDef.span}`, 'important');
          wrapper.style.setProperty('min-width', '0', 'important');
          wrapper.style.setProperty('max-width', `${pct}%`, 'important');
          wrapper.style.setProperty('height', '100%', 'important');

          // 内层renderDiv
          const renderDiv = document.createElement('div');
          renderDiv.dataset.jhuaRendered = 'true';
          renderDiv.style.setProperty('width', '100%', 'important');
          renderDiv.style.setProperty('height', '100%', 'important');

          const moduleConfig = { ...module.defaultConfig, ...this.settings, plugin: this, span: modDef.span, ...extraConfig };
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

    // ==================== para-explorer 代码块处理器 ====================
    // 支持 ```para-explorer YAML格式（P0: xxx / A1: xxx / R2: xxx / A3: xxx）
    this.registerMarkdownCodeBlockProcessor('para-explorer', async (source, el, ctx) => {
      if (el.closest('[data-jhua-rendered="true"]')) return;
      el.dataset.jhuaRendered = 'true';

      try {
        const config: Record<string, any> = {};
        const lines = source.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const match = trimmed.match(/^(P0|A1|R2|A3)[:.\s]+(.+)$/);
          if (match) {
            const key = match[1];
            const value = match[2].trim();
            if (value) {
              config[key] = value;
            }
          }
        }

        const module = getModuleById('para-explorer');
        if (!module) {
          el.createEl('div', { text: '❌ para-explorer 模块未注册', cls: 'jhua-hpage-error' });
          return;
        }

        // 读取代码块中可能有的 span 参数（暂不支持，默认全宽）
        const finalConfig = { ...module.defaultConfig, ...this.settings, plugin: this, ...config };
        await module.render(this.app, finalConfig, el);
      } catch (e) {
        el.createEl('div', { text: `❌ para-explorer 渲染错误：${e}`, cls: 'jhua-hpage-error' });
      }
    });

    // ==================== para-explorer-v2 代码块处理器 ====================
    // 支持 ```para-explorer-v2 YAML格式（P0: xxx / A1: xxx / R2: xxx / A3: xxx / view: overview / maxItems: 8）
    this.registerMarkdownCodeBlockProcessor('para-explorer-v2', async (source, el, ctx) => {
      if (el.closest('[data-jhua-rendered="true"]')) return;
      el.dataset.jhuaRendered = 'true';

      try {
        const config: Record<string, any> = {};
        const lines = source.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const match = trimmed.match(/^(P0|A1|R2|A3|view|maxItems)[:.\s]+(.+)$/);
          if (match) {
            const key = match[1];
            let value: any = match[2].trim();
            if (key === 'maxItems') value = parseInt(value, 10) || 8;
            if (value) {
              config[key] = value;
            }
          }
        }

        const module = getModuleById('para-explorer-v2');
        if (!module) {
          el.createEl('div', { text: '❌ para-explorer-v2 模块未注册', cls: 'jhua-hpage-error' });
          return;
        }

        const finalConfig = { ...module.defaultConfig, ...this.settings, plugin: this, ...config };
        await module.render(this.app, finalConfig, el);
      } catch (e) {
        el.createEl('div', { text: `❌ para-explorer-v2 渲染错误：${e}`, cls: 'jhua-hpage-error' });
      }
    });

    // ==================== jhua-cuoti 错题卡片代码块处理器 ====================
    // 用法：```jhua-cuoti
    //   T0: 题目正文（支持 ![](图片.png)）
    //   X1: 选项A内容
    //   X2: 选项B内容
    //   X3: 选项C内容
    //   X4: 选项D内容
    //   answer: C
    //   my_answer: B
    //   analysis: 解析内容
    //   easy_wrong: A
    //   source: 粉笔
    //   accuracy: 48%
    //   time_used: 1秒
    //   kaodian: 考点
    //   ```
    this.registerMarkdownCodeBlockProcessor('jhua-cuoti', async (source, el, ctx) => {
      if (el.closest('[data-jhua-rendered="true"]')) return;
      el.dataset.jhuaRendered = 'true';

      try {
        const params = parseCuotiSource(source);
        renderCuotiCard(this.app, params, el, ctx);
      } catch (e) {
        el.createEl('div', { text: `❌ 错题卡片渲染错误：${e}`, cls: 'jhua-hpage-error' });
      }
    });

    // ==================== jhua-progress 进度记录卡片代码块处理器 ====================
    // 用法：```jhua-progress
    //   - 2026-05-06 | 初始创建，进度0% | -
    //   - 2026-05-10 | 完成开发，进度60% | 顺利
    //   ```
    this.registerMarkdownCodeBlockProcessor('jhua-progress', async (source, el, ctx) => {
      if (el.closest('[data-jhua-rendered="true"]')) return;
      el.dataset.jhuaRendered = 'true';

      try {
        const entries = parseProgressSource(source);
        renderProgressCard(this.app, entries, el, ctx);
      } catch (e) {
        el.createEl('div', { text: `❌ 进度记录卡片渲染错误：${e}`, cls: 'jhua-hpage-error' });
      }
    });

    // ==================== jhua-daily-note 一体化日记代码块处理器 ====================
    // 用法：```jhua-daily-note
    //   date: 2026-05-13
    //   showTracking: true
    //   showDairy: true
    //   showTasks: true
    //   showDone: true
    //   showPhotos: false
    //   showNav: true
    //   ```
    // 也可以无参数（默认今天）：
    //   ```jhua-daily-note
    //   ```
    this.registerMarkdownCodeBlockProcessor('jhua-daily-note', async (source, el, ctx) => {
      if (el.closest('[data-jhua-rendered="true"]')) return;
      el.dataset.jhuaRendered = 'true';

      try {
        const module = getModuleById('daily-note');
        if (!module) {
          el.createEl('div', { text: '❌ daily-note 模块未注册', cls: 'jhua-hpage-error' });
          return;
        }

        // 解析 key:value 参数
        const params: Record<string, any> = {};
        for (const line of source.split('\n')) {
          const match = line.trim().match(/^(\w+)\s*[:=]\s*(.*)$/);
          if (match) {
            const key = match[1];
            let value: any = match[2].trim();
            // 布尔值处理
           	if (value === 'true') value = true;
            else if (value === 'false') value = false;
           	else if (!isNaN(Number(value)) && value !== '') value = Number(value);
            params[key] = value;
          }
        }

        const finalConfig = { ...module.defaultConfig, ...this.settings, plugin: this, ...params };
        el.style.setProperty('width', '100%', 'important');
        el.style.setProperty('margin-bottom', '20px', 'important');
        await module.render(this.app, finalConfig, el);
      } catch (e) {
        el.createEl('div', { text: `❌ 日记组件渲染错误：${e}`, cls: 'jhua-hpage-error' });
      }
    });

    this.addSettingTab(new JhuaHPageSettingTab(this.app, this));

    // ==================== 注册 vault 事件监听，实现待办增量缓存失效 ====================
    // 文件修改时，使对应文件的待办缓存失效，下次 render 时自动重读
    this.registerEvent(this.app.vault.on('modify', (file) => {
      if (file instanceof TFile && file.extension === 'md') {
        const todoModule = getModuleById('todo-list') as any;
        if (todoModule?.todoManager) {
          todoModule.todoManager.invalidateFileCache(file.path);
        }
      }
    }));
    // 文件创建/删除时，同样使缓存失效
    this.registerEvent(this.app.vault.on('create', (file) => {
      if (file instanceof TFile && file.extension === 'md') {
        const todoModule = getModuleById('todo-list') as any;
        if (todoModule?.todoManager) {
          todoModule.todoManager.invalidateFileCache(file.path);
        }
      }
    }));
    this.registerEvent(this.app.vault.on('delete', (file) => {
      if (file instanceof TFile && file.extension === 'md') {
        const todoModule = getModuleById('todo-list') as any;
        if (todoModule?.todoManager) {
          todoModule.todoManager.invalidateFileCache(file.path);
        }
      }
    }));
    // 文件重命名时，旧路径失效 + 新路径也需要刷新
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      if (file instanceof TFile && file.extension === 'md') {
        const todoModule = getModuleById('todo-list') as any;
        if (todoModule?.todoManager) {
          todoModule.todoManager.invalidateFileCache(oldPath);
          todoModule.todoManager.invalidateFileCache(file.path);
        }
      }
    }));

    // ==================== 注册命令：刷新主页所有组件 ====================
    this.addCommand({
      id: 'refresh-hpage',
      name: '刷新主页组件',
      callback: () => {
        this.refreshAllModules();
      }
    });

    // ==================== 注册命令：打开今日日记（jhua-daily-note） ====================
    this.addCommand({
      id: 'open-daily-note',
      name: '打开今日日记',
      callback: async () => {
        // 使用本地日期格式化，避免 toISOString 的 UTC 时区偏移
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const basePath = this.settings.todoSources?.find((s: any) => s.id === this.settings.currentTodoSourceId)?.path
          || '01-领域（Areas）/00-日常记录/02-日记';
        const parts = today.split('-');
        const filePath = `${basePath}/${parts[0]}/${parts[0]}-${parts[1]}/${today}.md`;

        let file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) {
          // 自动创建日记
          const { DailyNoteModule } = require('./src/modules/daily-note');
          const module = new DailyNoteModule();
          const config = { ...module.defaultConfig, ...this.settings, plugin: this, date: today };
          await module.render(this.app, config);
          file = this.app.vault.getAbstractFileByPath(filePath);
        }

        if (file instanceof TFile) {
          await this.app.workspace.getLeaf(false).openFile(file);
        } else {
          new Notice('❌ 无法打开或创建日记');
        }
      }
    });
  }

  /**
   * 刷新页面上所有已渲染的 jhua-hpage 组件
   * 通过 data-jhua-module 属性找到所有容器，逐一重新渲染
   */
  private async refreshAllModules(): Promise<void> {
    const containers = document.querySelectorAll('[data-jhua-module]');
    if (containers.length === 0) {
      new Notice('当前页面没有 HPage 组件');
      return;
    }

    // 清空待办增量缓存，确保强制重新读取
    const todoModule = getModuleById('todo-list') as any;
    if (todoModule?.todoManager) {
      todoModule.todoManager.clearSourceCache();
    }

    let count = 0;
    for (const container of containers) {
      if (!(container instanceof HTMLElement)) continue;
      const moduleId = container.dataset.jhuaModule;
      if (!moduleId) continue;
      const module = getModuleById(moduleId);
      if (!module) continue;

      try {
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
        await module.render(this.app, config, container);
        count++;
      } catch (e) {
        console.error(`刷新组件 ${moduleId} 失败:`, e);
      }
    }

    new Notice(`🔄 已刷新 ${count} 个组件`);
  }

  onunload() {
    // 组件化方案，无需清理视图
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

}
