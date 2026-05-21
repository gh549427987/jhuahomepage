import { App, HPageModule } from '../types';
import { QuickNavModule } from './quick-nav';
import { TodoListModule } from './todo-list';
import { ProjectTrackingModule } from './project-tracking';
import { UnorganizedFilesModule } from './unorganized-files';
import { RecentFilesModule } from './recent-files';
import { CountdownCardModule } from './countdown-card';
import { WeatherCardModule } from './weather-card';
import { DailyTasksCardModule } from './daily-tasks';
import { LunarCardModule } from './lunar-card';
import { ParaExplorerModule } from './para-explorer';
import { ParaExplorerV2Module } from './para-explorer-v2';
import { ContactsCardModule } from './contacts-card';
import { DailyNoteModule } from './daily-note';
import { OwerCardModule } from './ower-card';
import { ProjectHomeModule } from './project-home';

// 所有模块统一注册在这里
export const MODULES: HPageModule[] = [
  new QuickNavModule(),
  new TodoListModule(),
  new ProjectTrackingModule(),
  new UnorganizedFilesModule(),
  new RecentFilesModule(),
  new CountdownCardModule(),
  new WeatherCardModule(),
  new DailyTasksCardModule(),
  new LunarCardModule(),
  new ParaExplorerModule(),
  new ParaExplorerV2Module(),
  new ContactsCardModule(),
  new DailyNoteModule(),
  new OwerCardModule(),
  new ProjectHomeModule(),
];

// 根据ID获取模块
export function getModuleById(id: string): HPageModule | undefined {
  return MODULES.find(m => m.id === id);
}

// 获取所有模块ID和名称
export function getModuleList(): { id: string; name: string }[] {
  return MODULES.map(m => ({ id: m.id, name: m.name }));
}

/**
 * 刷新页面上指定的模块（通过 data-jhua-module 属性找到容器并重新渲染）
 * 用于跨模块联动刷新，如创建待办后刷新今日任务卡片
 */
export async function refreshModules(app: App, moduleIds: string[], config?: Record<string, any>): Promise<void> {
  for (const moduleId of moduleIds) {
    const module = getModuleById(moduleId);
    if (!module) continue;

    // 查找页面上所有该模块的容器
    const containers = document.querySelectorAll(`[data-jhua-module="${moduleId}"]`);
    for (const container of containers) {
      if (container instanceof HTMLElement) {
        try {
          await module.render(app, config || (module as any).config || module.defaultConfig, container);
        } catch (e) {
          console.error(`刷新模块 ${moduleId} 失败:`, e);
        }
      }
    }
  }
}
