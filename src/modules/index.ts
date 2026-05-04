import { HPageModule } from '../types';
import { QuickNavModule } from './quick-nav';
import { TodoListModule } from './todo-list';
import { ProjectTrackingModule } from './project-tracking';
import { UnorganizedFilesModule } from './unorganized-files';
import { RecentFilesModule } from './recent-files';
import { CountdownCardModule } from './countdown-card';
import { WeatherCardModule } from './weather-card';
import { DailyTasksCardModule } from './daily-tasks';
import { LunarCardModule } from './lunar-card';

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
];

// 根据ID获取模块
export function getModuleById(id: string): HPageModule | undefined {
  return MODULES.find(m => m.id === id);
}

// 获取所有模块ID和名称
export function getModuleList(): { id: string; name: string }[] {
  return MODULES.map(m => ({ id: m.id, name: m.name }));
}
