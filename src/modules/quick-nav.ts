import { App, Modal } from 'obsidian';
import { HPageModule, Category } from '../types';
import { NavigationSettingsModal } from '../../main';

export class QuickNavModule implements HPageModule {
  id = 'quick-nav';
  name = '快捷导航';
  defaultConfig = {
    showIcons: true,
    columns: 4,
    id: 'homepage', // 🆕 导航分组ID，不同ID对应不同的导航配置
  };

  private app: App;
  private container: HTMLElement;
  private categories: Category[] = [];
  private config: any;

  render(app: App, config: Record<string, any>, container?: HTMLElement): HTMLElement {
    this.app = app;
    this.config = config;
    
    // 🆕 按ID获取对应导航分组，默认id=homepage，没有则初始化新分组
    const navId = config.id || 'homepage';
    const plugin = config.plugin;
    
    // 确保settings.navGroups存在（操作plugin.settings持久存储，而非config浅拷贝）
    if (!plugin.settings.navGroups) {
      plugin.settings.navGroups = {
        homepage: plugin.settings.categories || []
      };
      plugin.saveSettings();
    }
    // 如果当前ID没有对应分组，自动创建空分组
    if (!plugin.settings.navGroups[navId]) {
      plugin.settings.navGroups[navId] = [];
      plugin.saveSettings();
    }
    this.categories = plugin.settings.navGroups[navId];
    
    // 创建模块根元素，用原来的样式类，直接复用已有的css
    this.container = container || document.createElement('div');
    this.container.className = 'jhua-hpage-module jhua-nav-section';
    this.container.dataset.jhuaModule = this.id;
    
    // 清空原有内容
    this.container.empty();
    
    // 渲染标题
    const header = this.container.createDiv({ cls: 'module-header' });
    header.createEl('h2', { text: '快捷导航' });
    // 按钮组：刷新 + 设置紧贴在一起
    const headerBtns = header.createDiv({ cls: 'jhua-nav-header-btns' });
    // 全局刷新按钮：刷新整个页面所有组件
    const refreshBtn = headerBtns.createEl('button', { cls: 'jhua-nav-settings-btn', text: '🔄', attr: { title: '刷新主页组件' } });
    refreshBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // 触发 Obsidian 重新渲染当前活跃叶（等效于 F5 刷新）
      const activeLeaf = this.app.workspace.activeLeaf;
      if (activeLeaf) {
        activeLeaf.rebuildView();
      }
    });
    // 全局设置按钮：管理分类（增删改）
    const globalSettingsBtn = headerBtns.createEl('button', { cls: 'jhua-nav-settings-btn', text: '⚙️' });
    globalSettingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const { NavigationSettingsModal } = require('../../main');
      new NavigationSettingsModal(this.app, config.plugin, () => {
        this.render(this.app, this.config, this.container);
      }, undefined, navId).open();
    });
    
    // 渲染导航网格，列数 = 实际分类数（上限为配置的columns），确保顶满宽度
    const colCount = Math.min(this.categories.length, config.columns || 4) || 1;
    const navGrid = this.container.createDiv({ 
      cls: 'jhua-nav-grid',
      attr: { style: `grid-template-columns: repeat(${colCount}, 1fr);` }
    });
    
    if (this.categories.length === 0) {
      // 🆕 空分组时显示添加分类按钮，引导用户创建第一个分类
      const emptyTip = navGrid.createDiv({ 
        cls: 'empty-state', 
        attr: { style: 'grid-column: 1 / -1; text-align: center; padding: 30px; border-radius: 8px; background: var(--background-secondary);' }
      });
      emptyTip.createEl('div', { text: '暂无导航分类', attr: { style: 'margin-bottom: 10px; color: var(--text-muted);' } });
      const addFirstCatBtn = emptyTip.createEl('button', { 
        text: '+ 添加第一个分类', 
        cls: 'jhua-todo-add-btn',
        attr: { style: 'padding: 8px 16px;' }
      });
      addFirstCatBtn.addEventListener('click', () => {
        const { CategoryEditModal } = require('../../main');
        new CategoryEditModal(this.app, config.plugin, null, () => {
          this.render(this.app, this.config, this.container);
        }, navId).open();
      });
      return this.container;
    }

    this.categories.forEach(category => {
      const categoryCard = navGrid.createDiv({ cls: 'jhua-category-card' });
      categoryCard.style.setProperty('--category-color', category.color);
      categoryCard.style.borderColor = category.color;
      categoryCard.style.backgroundColor = category.color + '20';

      const catHeader = categoryCard.createDiv({ cls: 'jhua-category-header' });
      if (config.showIcons) {
        catHeader.createEl('span', { cls: 'category-icon', text: category.icon });
      }
      catHeader.createEl('span', { cls: 'jhua-category-title', text: category.name });
      
      // 分类设置按钮：仅编辑当前分类下的所有导航项
      const catSettingsBtn = catHeader.createEl('button', { cls: 'jhua-nav-settings-btn', text: '⚙️' });
      catSettingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const { NavigationSettingsModal } = require('../../main');
        // 🆕 传入当前导航ID和分类ID，保存时自动对应到正确分组
        new NavigationSettingsModal(this.app, config.plugin, () => {
          this.render(this.app, this.config, this.container);
        }, category.id, navId).open();
      });

      const itemsContainer = categoryCard.createDiv({ cls: 'jhua-category-items' });
      for (const item of category.items) {
        const navItem = itemsContainer.createDiv({ cls: 'jhua-nav-item' });
        navItem.createEl('span', { text: `${config.showIcons ? item.icon + ' ' : ''}${item.name}` });
        
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
          if (/^[A-Za-z]:[\\/]/.test(path)) {
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
    });
    
    return this.container;
  }

  update(config: Record<string, any>): void {
    this.render(this.app, config, this.container);
  }
}
