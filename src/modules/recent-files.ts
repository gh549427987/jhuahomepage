import { App, TFile } from 'obsidian';
import { HPageModule } from '../types';

export class RecentFilesModule implements HPageModule {
  id = 'recent-files';
  name = '最近文档';
  defaultConfig = {
    maxItems: 10,
    excludePaths: ['Inbox', '.obsidian'],
    showPreview: false,
    showOpenTime: true,
    sortBy: 'opened' as 'opened' | 'modified' | 'created',
  };

  private app: App;
  private container: HTMLElement;
  private recentFiles: TFile[] = [];
  private config: any;

  async render(app: App, config: Record<string, any>, container?: HTMLElement): Promise<HTMLElement> {
    this.app = app;
    this.config = config;
    
    // 创建模块根元素，复用原有样式
    this.container = container || document.createElement('div');
    this.container.className = 'jhua-hpage-module jhua-recent-section';
    this.container.dataset.jhuaModule = this.id;
    
    // 清空原有内容
    this.container.empty();
    
    // 渲染头部
    const header = this.container.createDiv({ cls: 'jhua-todo-header' });
    header.createEl('h2', { text: '📄 最近文档' });
    
    // 加载最近文件
    await this.loadRecentFiles(config);
    
    // 双重去重，彻底解决重复显示问题
    const uniqueFiles = [];
    const seenPaths = new Set<string>();
    this.recentFiles.forEach(file => {
      if (!seenPaths.has(file.path.trim())) {
        seenPaths.add(file.path.trim());
        uniqueFiles.push(file);
      }
    });
    
    // 限制最多显示10个
    const showFiles = uniqueFiles.slice(0, 10);
    
    // 渲染标签流式布局
    const fileList = this.container.createDiv({ cls: 'jhua-file-tag-list' });
    
    if (showFiles.length === 0) {
      fileList.createEl('div', { cls: 'empty-state', text: '暂无最近打开的文档' });
      return this.container;
    }
    
    showFiles.forEach((file, index) => {
      const fileTag = fileList.createDiv({ cls: 'jhua-file-tag', attr: { 'data-index': index } });
      
      // 文档名称
      fileTag.createEl('div', { cls: 'file-tag-name', text: file.basename });
      
      // 编辑时间
      const time = config.sortBy === 'opened' ? file.stat.mtime : 
                   config.sortBy === 'modified' ? file.stat.mtime : file.stat.ctime;
      const timeText = this.formatRelativeTime(time);
      fileTag.createEl('div', { cls: 'file-tag-time', text: timeText });
      
      // 点击打开
      fileTag.addEventListener('click', () => {
        this.app.workspace.activeLeaf.openFile(file);
      });
    });
    
    return this.container;
  }

  private async loadRecentFiles(config: Record<string, any>): Promise<void> {
    // 过滤排除路径
    let files = this.app.vault.getFiles().filter(file => 
      file.extension === 'md' && 
      !config.excludePaths?.some((path: string) => file.path.startsWith(path))
    );
    
    // 根据文件路径去重，避免重复显示
    const uniquePaths = new Set<string>();
    files = files.filter(file => {
      if (uniquePaths.has(file.path)) return false;
      uniquePaths.add(file.path);
      return true;
    });
    
    // 排序
    files.sort((a, b) => {
      if (config.sortBy === 'created') {
        return b.stat.ctime - a.stat.ctime;
      } else if (config.sortBy === 'modified') {
        return b.stat.mtime - a.stat.mtime;
      } else { // opened
        return b.stat.mtime - a.stat.mtime; // Obsidian没有打开时间记录，用修改时间代替
      }
    });
    
    this.recentFiles = files;
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

  private formatRelativeTime(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    const week = 7 * day;
    
    if (diff < minute) return '刚刚';
    if (diff < hour) return `${Math.floor(diff / minute)}分钟前`;
    if (diff < day) return `${Math.floor(diff / hour)}小时前`;
    if (diff < week) return `${Math.floor(diff / day)}天前`;
    
    return new Date(timestamp).toLocaleDateString('zh-CN');
  }

  async update(config: Record<string, any>): Promise<void> {
    await this.render(this.app, config, this.container);
  }
}