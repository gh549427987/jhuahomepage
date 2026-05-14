import { App, TFile } from 'obsidian';
import { HPageModule } from '../types';

export class UnorganizedFilesModule implements HPageModule {
  id = 'unorganized-files';
  name = '待整理';
  defaultConfig = {
    scanPaths: ['Inbox', '未命名'],
    maxItems: 10,
    sortBy: 'created' as 'created' | 'updated' | 'size',
    showFileSize: false,
  };

  private app: App;
  private container: HTMLElement;
  private files: TFile[] = [];
  private config: any;

  async render(app: App, config: Record<string, any>, container?: HTMLElement): Promise<HTMLElement> {
    this.app = app;
    this.config = config;
    
    // 创建模块根元素，复用原有样式
    this.container = container || document.createElement('div');
    this.container.className = 'jhua-hpage-module jhua-inbox-section';
    this.container.dataset.jhuaModule = this.id;
    
    // 清空原有内容
    this.container.empty();
    
    // 渲染头部
    const header = this.container.createDiv({ cls: 'jhua-todo-header' });
    header.createEl('h2', { text: '📥 待整理' });
    const buttonsContainer = header.createDiv({ cls: 'jhua-todo-header-buttons' });
    const addBtn = buttonsContainer.createEl('button', { cls: 'jhua-todo-add-btn', text: '+ 新建' });
    addBtn.addEventListener('click', () => {
      if (config.unorganizedCreateUri) {
        window.open(config.unorganizedCreateUri);
      } else {
        this.app.vault.create('Inbox/未命名笔记.md', '# 新笔记\n').then(file => {
          this.app.workspace.activeLeaf.openFile(file);
        });
      }
    });
    
    // 加载待整理文件
    await this.loadUnorganizedFiles(config.scanPaths || ['Inbox']);
    
    // 排序
    this.files.sort((a, b) => {
      if (config.sortBy === 'created') {
        return b.stat.ctime - a.stat.ctime;
      } else if (config.sortBy === 'size') {
        return b.stat.size - a.stat.size;
      } else { // updated
        return b.stat.mtime - a.stat.mtime;
      }
    });
    
    // 限制数量
    const showFiles = this.files.slice(0, config.maxItems || 10);
    
    // 渲染文件列表，用原来的jhua-file-list类
    const fileList = this.container.createDiv({ cls: 'jhua-file-list' });
    
    if (showFiles.length === 0) {
      fileList.createEl('div', { cls: 'empty-state', text: '所有文件都已整理完毕 🎉' });
      return this.container;
    }
    
    showFiles.forEach(file => {
      const fileItem = fileList.createDiv({ cls: 'jhua-file-item' });
      
      // 文件图标
      fileItem.createEl('span', { cls: 'file-icon', text: this.getFileIcon(file.extension) });
      
      // 文件信息
      const fileInfo = fileItem.createDiv({ cls: 'file-info' });
      fileInfo.createEl('div', { cls: 'file-name', text: file.basename });
      
      const meta = fileInfo.createDiv({ cls: 'file-meta' });
      const createTime = new Date(file.stat.ctime).toLocaleDateString('zh-CN');
      meta.createEl('span', { cls: 'file-time', text: `创建于 ${createTime}` });
      if (config.showFileSize) {
        meta.createEl('span', { cls: 'file-size', text: this.formatFileSize(file.stat.size) });
      }
      
      // 操作按钮
      const actions = fileItem.createDiv({ cls: 'file-actions' });
      const openBtn = actions.createEl('button', { cls: 'btn-open', text: '打开' });
      openBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.app.workspace.activeLeaf.openFile(file);
      });
      
      // 点击文件项打开
      fileItem.addEventListener('click', () => {
        this.app.workspace.activeLeaf.openFile(file);
      });
    });
    
    return this.container;
  }

  private async loadUnorganizedFiles(scanPaths: string[]): Promise<void> {
    this.files = this.app.vault.getFiles().filter(file => 
      file.extension === 'md' && scanPaths.some(path => file.path.startsWith(path))
    );
  }

  private getFileIcon(ext: string): string {
    const iconMap: Record<string, string> = {
      'md': '📝',
      'pdf': '📄',
      'png': '🖼️',
      'jpg': '🖼️',
      'jpeg': '🖼️',
      'docx': '📘',
      'xlsx': '📊',
      'pptx': '📽️',
    };
    return iconMap[ext.toLowerCase()] || '📄';
  }

  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  async update(config: Record<string, any>): Promise<void> {
    await this.render(this.app, config, this.container);
  }
}