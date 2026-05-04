import { App, Notice, TFile } from 'obsidian';
import { HPageModule, TodoItem } from '../types';

export class DailyTasksCardModule implements HPageModule {
	id = 'daily-tasks';
	name = '今日任务卡片';
	defaultConfig = {
		maxItems: 6,
	};

	private app: App;
	private container: HTMLElement;
	private config: any;

	async render(app: App, config: Record<string, any>, container?: HTMLElement): Promise<HTMLElement> {
		this.app = app;
		this.config = config;

		this.container = container || document.createElement('div');
		this.container.className = 'jhua-hpage-module jhua-card jhua-daily-tasks-card';
		this.container.dataset.jhuaModule = this.id;
		this.container.empty();

		// 头部
		const header = this.container.createDiv({ cls: 'jhua-card-header' });
		header.createEl('h3', { text: '📋 今日任务', cls: 'jhua-card-title' });

		// 内容区
		const content = this.container.createDiv({ cls: 'jhua-daily-tasks-content' });

		// 获取当天日记中的待办
		const todayTodos = await this.getTodayTodos(config);
		const pendingTodos = todayTodos.filter(t => !t.completed);
		const completedTodos = todayTodos.filter(t => t.completed);

		// 进度条
		const progressEl = this.container.createDiv({ cls: 'jhua-daily-progress' });
		const total = todayTodos.length;
		const done = completedTodos.length;
		const percent = total > 0 ? Math.round((done / total) * 100) : 0;
		
		const progressLabel = progressEl.createDiv({ cls: 'jhua-daily-progress-label' });
		progressLabel.createEl('span', { text: `${done}/${total}` });
		progressLabel.createEl('span', { text: `${percent}%`, cls: 'jhua-daily-progress-pct' });
		
		const progressBar = progressEl.createDiv({ cls: 'jhua-daily-progress-bar' });
		const progressFill = progressBar.createDiv({ cls: 'jhua-daily-progress-fill' });
		progressFill.style.setProperty('width', `${percent}%`);

		if (total === 0) {
			content.createEl('div', { text: '今天没有待办任务 🎉', cls: 'jhua-card-empty' });
			return this.container;
		}

		// 最大显示条数
		const maxItems = config.maxItems || 6;

		// 未完成任务
		if (pendingTodos.length > 0) {
			const pendingList = content.createDiv({ cls: 'jhua-daily-task-group' });
			pendingList.createEl('div', { text: `待完成 (${pendingTodos.length})`, cls: 'jhua-daily-task-group-label' });
			
			pendingTodos.slice(0, maxItems).forEach(todo => {
				const item = pendingList.createDiv({ cls: 'jhua-daily-task-item' });
				const checkbox = item.createEl('input', { type: 'checkbox', cls: 'jhua-daily-task-checkbox' });
				checkbox.checked = false;
				checkbox.addEventListener('change', async () => {
					await this.toggleTodo(todo, config);
					this.render(this.app, config, this.container);
				});
				item.createEl('span', { text: todo.content, cls: 'jhua-daily-task-text' });
				item.addEventListener('click', (e) => {
					if ((e.target as HTMLElement).tagName !== 'INPUT') {
						this.openTodoSource(todo);
					}
				});
			});
		}

		// 已完成任务（折叠）
		if (completedTodos.length > 0) {
			const completedList = content.createDiv({ cls: 'jhua-daily-task-group jhua-daily-completed-group' });
			const completedHeader = completedList.createEl('div', { 
				text: `✅ 已完成 (${completedTodos.length})`, 
				cls: 'jhua-daily-task-group-label jhua-daily-completed-toggle' 
			});
			const completedItems = completedList.createDiv({ cls: 'jhua-daily-completed-items', attr: { style: 'display: none;' } });
			
			completedHeader.addEventListener('click', () => {
				const isVisible = completedItems.style.display !== 'none';
				completedItems.style.display = isVisible ? 'none' : 'block';
			});

			completedTodos.slice(0, maxItems).forEach(todo => {
				const item = completedItems.createDiv({ cls: 'jhua-daily-task-item jhua-daily-task-completed' });
				const checkbox = item.createEl('input', { type: 'checkbox', cls: 'jhua-daily-task-checkbox' });
				checkbox.checked = true;
				checkbox.addEventListener('change', async () => {
					await this.toggleTodo(todo, config);
					this.render(this.app, config, this.container);
				});
				item.createEl('span', { text: todo.content, cls: 'jhua-daily-task-text' });
			});
		}

		return this.container;
	}

	/**
	 * 获取当天日记中的待办事项
	 * 仅从当天日记文件中提取，不扫描待办文档
	 */
	private async getTodayTodos(config: any): Promise<TodoItem[]> {
		const todos: TodoItem[] = [];
		const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

		// 从配置的待办源目录找当天日记
		const todoSources = config.todoSources || [];
		const currentSourceId = config.currentTodoSourceId;
		const currentSource = todoSources.find(s => s.id === currentSourceId);

		if (!currentSource) return todos;

		// 查找当天日记文件
		const allFiles = this.app.vault.getMarkdownFiles().filter(file =>
			file.path.startsWith(currentSource.path) && file.path.includes(today)
		);

		for (const file of allFiles) {
			try {
				const content = await this.app.vault.read(file);
				const lines = content.split('\n');
				for (const line of lines) {
					const match = line.match(/^\s*- \[([ x])\] (.+)$/);
					if (match) {
						todos.push({
							id: `daily-${file.path}-${Date.now()}-${Math.random()}`,
							content: match[2].trim(),
							completed: match[1] === 'x',
							priority: 'medium',
							dueDate: file.path,
							createdAt: new Date().toISOString()
						});
					}
				}
			} catch (e) {
				// 跳过读取失败的文件
			}
		}

		return todos;
	}

	private async toggleTodo(todo: TodoItem, config: any): Promise<void> {
		try {
			const filePath = todo.dueDate;
			if (!filePath) return;

			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (!(file instanceof TFile)) return;

			let content = await this.app.vault.read(file);
			const oldCheckbox = todo.completed ? '- [x]' : '- [ ]';
			const newCheckbox = todo.completed ? '- [ ]' : '- [x]';

			const lines = content.split('\n');
			let replaced = false;
			for (let i = 0; i < lines.length; i++) {
				const trimmed = lines[i].trimStart();
				if (trimmed.startsWith(`${oldCheckbox} ${todo.content}`)) {
					const indent = lines[i].substring(0, lines[i].length - trimmed.length);
					lines[i] = indent + newCheckbox + lines[i].substring(indent.length + oldCheckbox.length);
					replaced = true;
					break;
				}
			}

			if (replaced) {
				await this.app.vault.modify(file, lines.join('\n'));
			}
		} catch (e) {
			new Notice(`切换任务状态失败: ${e.message || '未知错误'}`);
		}
	}

	private openTodoSource(todo: TodoItem): void {
		if (todo.dueDate) {
			this.app.workspace.openLinkText(todo.dueDate, '', true);
		}
	}
}
