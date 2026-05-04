import { App, TFile } from 'obsidian';
import { HPageModule, ProjectItem } from '../types';

export class ProjectTrackingModule implements HPageModule {
  id = 'project-tracking';
  name = '项目跟踪';
  defaultConfig = {
    projectPath: '02-项目（Projects）',
    maxItems: 6,
    showProgress: true,
    showDueDate: true,
    sortBy: 'ddl' as 'ddl' | 'progress' | 'updated',
    showArchived: false, // 默认不显示已完成/归档项目
  };

  private app: App;
  private container: HTMLElement;
  private projects: ProjectItem[] = [];
  private config: any;

  async render(app: App, config: Record<string, any>, container?: HTMLElement): Promise<HTMLElement> {
    this.app = app;
    this.config = config;
    
    // 创建模块根元素，复用原有样式
    this.container = container || document.createElement('div');
    this.container.className = 'jhua-hpage-module jhua-project-section';
    this.container.dataset.jhuaModule = this.id;
    
    // 清空原有内容
    this.container.empty();
    
    // 渲染头部（固定在顶部，滚动不遮挡，和待办板块样式统一）
    const header = this.container.createDiv({ cls: 'jhua-todo-header' });
    header.style.position = 'sticky';
    header.style.top = '0';
    header.style.zIndex = '999';
    header.style.background = 'var(--background-secondary)';
    header.style.paddingTop = '16px';
    header.style.paddingBottom = '8px';
    header.style.borderBottom = '1px solid var(--background-modifier-border)';
    header.style.marginBottom = '10px';
    header.createEl('h2', { text: '📊 项目跟踪' });
    const buttonsContainer = header.createDiv({ cls: 'jhua-todo-header-buttons' });
    const addBtn = buttonsContainer.createEl('button', { cls: 'jhua-todo-add-btn', text: '+ 新建' });
    addBtn.addEventListener('click', () => {
      if (config.projectCreateUri) {
        window.open(config.projectCreateUri);
      } else {
        new (require('obsidian').Notice)('请先配置项目创建地址');
      }
    });
    
    // 移除整体滚动，内容自适应，和待办板块统一高度
    this.container.style.overflow = 'visible';
    this.container.style.maxHeight = 'unset';
    
    // 加载项目
    await this.loadProjects(config.projectPath || '02-项目（Projects）');
    
    // 排序
    this.projects.sort((a, b) => {
      if (config.sortBy === 'ddl') {
        if (!a.metadata.ddl) return 1;
        if (!b.metadata.ddl) return -1;
        return new Date(a.metadata.ddl).getTime() - new Date(b.metadata.ddl).getTime();
      } else if (config.sortBy === 'progress') {
        const progA = parseInt(a.metadata.progress || '0') || 0;
        const progB = parseInt(b.metadata.progress || '0') || 0;
        return progB - progA;
      } else { // updated
        return b.file.stat.mtime - a.file.stat.mtime;
      }
    });
    
    // 限制数量
    const showProjects = this.projects.slice(0, config.maxItems || 6);
    
    // 渲染项目列表，用原来的jhua-project-grid类
    const projectGrid = this.container.createDiv({ cls: 'jhua-project-grid' });
    
    if (showProjects.length === 0) {
      projectGrid.createEl('div', { cls: 'empty-state', text: '暂无进行中的项目' });
      return this.container;
    }
    
    showProjects.forEach(project => {
      const projectCard = projectGrid.createDiv({ cls: 'jhua-project-card' });
      
      // 项目标题
      const title = projectCard.createDiv({ cls: 'project-title' });
      title.createEl('span', { text: project.file.basename });
      projectCard.addEventListener('click', () => {
        this.app.workspace.activeLeaf.openFile(project.file);
      });
      
      // 进度条
      if (config.showProgress) {
        const progress = parseInt(project.metadata.progress || '0') || 0;
        const progressBar = projectCard.createDiv({ cls: 'progress-bar' });
        const progressFill = progressBar.createDiv({ cls: 'progress-fill' });
        progressFill.style.width = `${progress}%`;
        progressBar.createEl('span', { cls: 'progress-text', text: `${progress}%` });
      }
      
      // 元信息
      const meta = projectCard.createDiv({ cls: 'project-meta' });
      if (config.showDueDate && project.metadata.ddl) {
        meta.createEl('span', { cls: 'project-ddl', text: `⏰ ${project.metadata.ddl}` });
      }
      if (project.tags?.length) {
        project.tags.slice(0, 2).forEach(tag => {
          meta.createEl('span', { cls: 'project-tag', text: `#${tag}` });
        });
      }
      
      // 更新时间
      const updateTime = new Date(project.file.stat.mtime).toLocaleDateString('zh-CN');
      meta.createEl('span', { cls: 'project-update-time', text: `更新于 ${updateTime}` });
    });
    
    return this.container;
  }

  private async loadProjects(projectPath: string): Promise<void> {
    this.projects = [];
    const files = this.app.vault.getFiles().filter(file => 
      file.path.startsWith(projectPath) && file.extension === 'md'
    );
    
    for (const file of files) {
      const metadata = this.app.metadataCache.getFileCache(file);
      if (metadata?.frontmatter) {
        this.projects.push({
          file,
          metadata: {
            type: metadata.frontmatter.type,
            ddl: metadata.frontmatter.ddl,
            progress: metadata.frontmatter.progress,
            remark: metadata.frontmatter.remark,
          },
          tags: metadata.frontmatter.tags || metadata.tags?.map(t => t.tag) || [],
        });
      }
    }
  }

  async update(config: Record<string, any>): Promise<void> {
    await this.render(this.app, config, this.container);
  }
}