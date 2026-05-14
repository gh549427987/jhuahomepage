import { App, TFile } from 'obsidian';

// ==================== 公共类型定义 ====================
export interface CategoryItem {
  id: string;
  name: string;
  path: string;
  icon: string;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  items: CategoryItem[];
}

export interface TodoItem {
  id: string;
  content: string;
  completed: boolean;
  priority: 'high' | 'medium' | 'low';
  dueDate?: string;
  tags?: string[];
  createdAt: string;
}

export interface TodoCache {
  version: string;
  todos: TodoItem[];
  completedTodos: TodoItem[];
  settings: {
    showCompleted: boolean;
    sortBy: 'priority' | 'dueDate' | 'createdAt';
  };
}

export interface FileMetadata {
  type?: string;
  ddl?: string;
  progress?: string;
  remark?: string;
}

export interface ProjectItem {
  file: TFile;
  metadata: FileMetadata;
  tags: string[];
}

export interface CountdownEvent {
  id: string;
  name: string;
  date: string; // YYYY-MM-DD
  emoji: string;
}

export interface JhuaHPageSettings {
  todoCachePath: string;
  categories: Category[];
  bannerImage: string;
  bannerTitle: string;
  countdowns: { name: string; date: string; color: string; }[];
  projectCreateUri: string;
  unorganizedCreateUri: string;
  dailyNoteTemplate: string;
  todoSources: { id: string; alias: string; path: string; }[];
  currentTodoSourceId: string;
  // 待整理扫描路径集合
  unorganizedScanPaths: string[];
  // 倒数日数据
  countdownEvents: CountdownEvent[];
  // 天气配置
  weatherLatitude: number;
  weatherLongitude: number;
  weatherLocationName: string;
  // 模块配置
  modules: {
    [moduleId: string]: {
      enabled: boolean;
      order: number;
      span: number; // 占多少列，1-4
      config: Record<string, any>;
    }
  }
}

// ==================== 模块统一接口 ====================
export interface HPageModule {
  id: string;
  name: string;
  defaultConfig: Record<string, any>;
  
  /**
   * 渲染模块
   * @param app Obsidian App实例
   * @param config 模块配置
   * @param container 父容器（可选，模块可以自己创建根元素）
   */
  render(app: App, config: Record<string, any>, container?: HTMLElement): HTMLElement | Promise<HTMLElement>;
  
  /**
   * 更新模块（可选，配置变化时调用）
   */
  update?(config: Record<string, any>): void;
  
  /**
   * 销毁模块（可选，页面卸载时调用）
   */
  destroy?(): void;
}
