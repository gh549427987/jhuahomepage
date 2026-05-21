import { App, TFile, TFolder, TAbstractFile, Modal, Notice, FuzzySuggestModal, Setting, Menu } from 'obsidian';
import { HPageModule } from '../types';
import { ParaExplorerV2Module } from './para-explorer-v2';

// ==================== 数据结构 ====================

interface ProjectLink {
	id: string;
	name: string;
	url: string;
	group: string;
	platform?: string; // 自动识别的平台tag
}

interface ProjectTodo {
	id: string;
	content: string;
	completed: boolean;
	priority: 'high' | 'medium' | 'low';
	createdAt: string;
}

interface ProjectLog {
	id: string;
	date: string;
	action: string;
	detail: string;
}

interface ProjectData {
	version: string;
	links: ProjectLink[];
	todos: ProjectTodo[];
	log: ProjectLog[];
}

interface ProjectHomeConfig {
	name: string;
	P0: string;
	A1: string;
	R2: string;
	A3: string;
	root: string;
}

type ParaKey = 'P0' | 'A1' | 'R2' | 'A3';

const PARA_META: Record<ParaKey, { emoji: string; label: string; color: string }> = {
	P0: { emoji: '🚀', label: '项目', color: '#8b5cf6' },
	A1: { emoji: '📂', label: '领域', color: '#3b82f6' },
	R2: { emoji: '📚', label: '资源', color: '#22c55e' },
	A3: { emoji: '📦', label: '档案', color: '#f59e0b' },
};

const PRIORITY_META: Record<string, { emoji: string; label: string }> = {
	high: { emoji: '🔴', label: '高' },
	medium: { emoji: '🟡', label: '中' },
	low: { emoji: '🟢', label: '低' },
};

const DATA_FILENAME = '_project-data.json';

// ==================== 平台识别 ====================

interface PlatformRule {
	key: string;       // 内部标识
	label: string;     // 显示标签
	pattern: RegExp;   // URL匹配
	color: string;     // 标签颜色
}

const PLATFORM_RULES: PlatformRule[] = [
	{ key: 'dingtalk', label: '钉钉', pattern: /dingtalk\.com/i, color: '#0089FF' },
	{ key: 'feishu', label: '飞书', pattern: /feishu\.cn|larksuite\.com/i, color: '#3370FF' },
	{ key: 'yuque', label: '语雀', pattern: /yuque\.com/i, color: '#25B864' },
	{ key: 'github', label: 'GitHub', pattern: /github\.com/i, color: '#8957e5' },
	{ key: 'gitlab', label: 'GitLab', pattern: /gitlab\./i, color: '#FC6D26' },
	{ key: 'notion', label: 'Notion', pattern: /notion\.so/i, color: '#000000' },
	{ key: 'figma', label: 'Figma', pattern: /figma\.com/i, color: '#A259FF' },
	{ key: 'confluence', label: 'Confluence', pattern: /confluence|atlassian\.(net|com)/i, color: '#172B4D' },
	{ key: 'jira', label: 'Jira', pattern: /jira/i, color: '#0052CC' },
	{ key: 'qqdoc', label: '腾讯文档', pattern: /docs\.qq\.com/i, color: '#1677FF' },
	{ key: 'shimo', label: '石墨', pattern: /shimo\.im/i, color: '#2D8CF0' },
	{ key: 'aliyun', label: '阿里云', pattern: /aliyun\.com/i, color: '#FF6A00' },
];

function detectPlatform(url: string): PlatformRule | null {
	for (const rule of PLATFORM_RULES) {
		if (rule.pattern.test(url)) return rule;
	}
	return null;
}

// ==================== 数据管理器 ====================

class ProjectDataManager {
	private app: App;
	private dataPath: string;
	private data: ProjectData;

	constructor(app: App, P0Path: string) {
		this.app = app;
		this.dataPath = `${P0Path}/${DATA_FILENAME}`;
		this.data = { version: '1.0', links: [], todos: [], log: [] };
	}

	async load(): Promise<ProjectData> {
		try {
			const file = this.app.vault.getAbstractFileByPath(this.dataPath);
			if (file instanceof TFile) {
				const content = await this.app.vault.read(file);
				this.data = JSON.parse(content);
			}
		} catch (e) {
			await this.save();
		}
		return this.data;
	}

	async save(): Promise<void> {
		try {
			const dirPath = this.dataPath.substring(0, this.dataPath.lastIndexOf('/'));
			if (!this.app.vault.getAbstractFileByPath(dirPath)) {
				await this.app.vault.createFolder(dirPath);
			}
			const file = this.app.vault.getAbstractFileByPath(this.dataPath);
			const content = JSON.stringify(this.data, null, 2);
			if (file instanceof TFile) {
				await this.app.vault.modify(file, content);
			} else {
				await this.app.vault.create(this.dataPath, content);
			}
		} catch (e) {
			console.error('保存项目数据失败:', e);
		}
	}

	getData(): ProjectData { return this.data; }

	async addLink(name: string, url: string, group: string): Promise<void> {
		const platform = detectPlatform(url);
		this.data.links.push({ id: `l-${Date.now()}`, name, url, group, platform: platform?.key });
		const pfLabel = platform ? `[${platform.label}]` : '';
		await this.addLog('add_link', `添加链接 ${pfLabel}${name}`);
		await this.save();
	}

	async removeLink(id: string): Promise<void> {
		const link = this.data.links.find(l => l.id === id);
		this.data.links = this.data.links.filter(l => l.id !== id);
		if (link) await this.addLog('remove_link', `移除链接：${link.name}`);
		await this.save();
	}

	async addTodo(content: string, priority: 'high' | 'medium' | 'low' = 'medium'): Promise<void> {
		this.data.todos.push({
			id: `t-${Date.now()}`, content, completed: false, priority,
			createdAt: new Date().toISOString(),
		});
		await this.addLog('add_todo', `添加待办：${content}`);
		await this.save();
	}

	async toggleTodo(id: string): Promise<void> {
		const todo = this.data.todos.find(t => t.id === id);
		if (todo) {
			todo.completed = !todo.completed;
			await this.addLog(todo.completed ? 'complete_todo' : 'reopen_todo', `${todo.completed ? '完成' : '重新打开'}：${todo.content}`);
			await this.save();
		}
	}

	async removeTodo(id: string): Promise<void> {
		const todo = this.data.todos.find(t => t.id === id);
		this.data.todos = this.data.todos.filter(t => t.id !== id);
		if (todo) await this.addLog('remove_todo', `删除待办：${todo.content}`);
		await this.save();
	}

	async addLog(action: string, detail: string): Promise<void> {
		this.data.log.push({ id: `log-${Date.now()}`, date: new Date().toISOString(), action, detail });
		if (this.data.log.length > 50) this.data.log = this.data.log.slice(-50);
	}
}

// ==================== 添加链接模态框 ====================

class AddLinkModal extends Modal {
	private onSave: (name: string, url: string, group: string) => void;
	private nameInput!: HTMLInputElement;
	private urlInput!: HTMLInputElement;
	private groupInput!: HTMLInputElement;
	private platformHint!: HTMLElement;

	constructor(app: App, onSave: (name: string, url: string, group: string) => void) {
		super(app);
		this.onSave = onSave;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: '📌 添加常用链接' });

		new Setting(contentEl)
			.setName('URL')
			.setDesc('粘贴链接地址，自动识别来源平台')
			.addText(text => {
				this.urlInput = text.inputEl;
				text.inputEl.style.width = '100%';
				text.setPlaceholder('https://...');
				text.inputEl.addEventListener('input', () => {
					const pf = detectPlatform(this.urlInput.value);
					this.platformHint.textContent = pf ? `✅ 已识别：${pf.label}` : '未识别到已知平台';
					this.platformHint.style.color = pf ? 'var(--text-success)' : 'var(--text-faint)';
				});
			});

		this.platformHint = contentEl.createDiv({ text: '未识别到已知平台', cls: 'ph-platform-hint' });

		new Setting(contentEl)
			.setName('链接名称')
			.setDesc('给链接起个名字')
			.addText(text => {
				this.nameInput = text.inputEl;
				text.inputEl.style.width = '100%';
				text.setPlaceholder('例如：项目文档');
			});

		new Setting(contentEl)
			.setName('分组')
			.setDesc('链接所属分组（可选）')
			.addText(text => {
				this.groupInput = text.inputEl;
				text.inputEl.style.width = '100%';
				text.setPlaceholder('例如：开发、文档、参考');
			});

		new Setting(contentEl)
			.addButton(btn => {
				btn.setButtonText('添加').setCta().onClick(() => {
					const name = this.nameInput.value.trim();
					const url = this.urlInput.value.trim();
					const group = this.groupInput.value.trim() || '默认';
					if (!name || !url) { new Notice('请填写名称和链接'); return; }
					this.onSave(name, url, group);
					this.close();
				});
			});
	}

	onClose() { this.contentEl.empty(); }
}

// ==================== 添加待办模态框 ====================

class AddTodoModal extends Modal {
	private onSave: (content: string, priority: 'high' | 'medium' | 'low') => void;
	private contentInput!: HTMLInputElement;
	private priority: 'high' | 'medium' | 'low' = 'medium';

	constructor(app: App, onSave: (content: string, priority: 'high' | 'medium' | 'low') => void) {
		super(app);
		this.onSave = onSave;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: '✅ 添加项目待办' });

		new Setting(contentEl)
			.setName('待办内容')
			.addText(text => {
				this.contentInput = text.inputEl;
				text.inputEl.style.width = '100%';
				text.setPlaceholder('例如：完成API设计');
				text.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
					if (e.key === 'Enter') this.submit();
				});
			});

		new Setting(contentEl)
			.setName('优先级')
			.addDropdown(dd => {
				dd.addOptions({ high: '🔴 高', medium: '🟡 中', low: '🟢 低' });
				dd.setValue('medium');
				dd.onChange((v: string) => { this.priority = v as any; });
			});

		new Setting(contentEl)
			.addButton(btn => btn.setButtonText('添加').setCta().onClick(() => this.submit()));
	}

	private submit() {
		const content = this.contentInput.value.trim();
		if (!content) { new Notice('请填写待办内容'); return; }
		this.onSave(content, this.priority);
		this.close();
	}

	onClose() { this.contentEl.empty(); }
}

// ==================== 创建QA文档模态框 ====================

class CreateQAModal extends Modal {
	private onSave: (title: string) => void;
	private titleInput!: HTMLInputElement;

	constructor(app: App, onSave: (title: string) => void) {
		super(app);
		this.onSave = onSave;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: '❓ 创建QA文档' });

		new Setting(contentEl)
			.setName('问题标题')
			.setDesc('将作为文档名称，建议用实际问题命名')
			.addText(text => {
				this.titleInput = text.inputEl;
				text.inputEl.style.width = '100%';
				text.setPlaceholder('例如：如何配置部署环境');
				text.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
					if (e.key === 'Enter') this.submit();
				});
			});

		new Setting(contentEl)
			.addButton(btn => btn.setButtonText('创建').setCta().onClick(() => this.submit()));
	}

	private submit() {
		const title = this.titleInput.value.trim();
		if (!title) { new Notice('请填写问题标题'); return; }
		this.onSave(title);
		this.close();
	}

	onClose() { this.contentEl.empty(); }
}

// ==================== QA搜索模态框 ====================

class QASearchModal extends FuzzySuggestModal<TFile> {
	private R2Path: string;
	private onChoose: (file: TFile) => void;

	constructor(app: App, R2Path: string, onChoose: (file: TFile) => void) {
		super(app);
		this.R2Path = R2Path;
		this.onChoose = onChoose;
		this.setPlaceholder('搜索QA文档...');
	}

	getItems(): TFile[] {
		const folder = this.app.vault.getAbstractFileByPath(this.R2Path);
		if (!(folder instanceof TFolder)) return [];
		return this.getAllMdFiles(folder);
	}

	private getAllMdFiles(folder: TFolder): TFile[] {
		const files: TFile[] = [];
		for (const child of folder.children) {
			if (child instanceof TFile && child.extension === 'md') files.push(child);
			else if (child instanceof TFolder) files.push(...this.getAllMdFiles(child));
		}
		return files;
	}

	getItemText(item: TFile): string { return item.basename; }
	onChooseItem(item: TFile): void { this.onChoose(item); }
}

// ==================== 模块类 ====================

export class ProjectHomeModule implements HPageModule {
	id = 'project-home';
	name = '项目主页';
	defaultConfig: Record<string, any> = {
		name: '', P0: '', A1: '', R2: '', A3: '', root: 'A1',
	};

	render(app: App, config: Record<string, any>, container?: HTMLElement): HTMLElement {
		const cfg: ProjectHomeConfig = {
			name: config.name || '',
			P0: config.P0 || '',
			A1: config.A1 || '',
			R2: config.R2 || '',
			A3: config.A3 || '',
			root: config.root || 'A1',
		};

		const rootEl = (container || document.body.createDiv()).createDiv({ cls: 'project-home' });
		rootEl.dataset.jhuaModule = 'project-home';

		if (!cfg.name || !cfg.P0) {
			rootEl.createEl('div', { text: '❌ 请配置 name 和 P0 参数', cls: 'ph-error' });
			return rootEl;
		}

		const paraPaths: Record<ParaKey, string> = { P0: cfg.P0, A1: cfg.A1, R2: cfg.R2, A3: cfg.A3 };
		const rootPath = paraPaths[cfg.root as ParaKey] || cfg.A1 || cfg.P0;

		(rootEl as any)._phConfig = cfg;
		(rootEl as any)._phParaPaths = paraPaths;
		(rootEl as any)._phRootPath = rootPath;

		this.renderAsync(app, cfg, paraPaths, rootPath, rootEl);
		return rootEl;
	}

	private async renderAsync(app: App, cfg: ProjectHomeConfig, paraPaths: Record<ParaKey, string>, rootPath: string, rootEl: HTMLElement) {
		const manager = new ProjectDataManager(app, cfg.P0);
		const data = await manager.load();
		rootEl.empty();

		// ===== 顶部标题栏 =====
		this.renderHeader(cfg, data, rootEl);

		// ===== 主体双栏布局 =====
		const body = rootEl.createDiv({ cls: 'ph-body' });
		const leftCol = body.createDiv({ cls: 'ph-col ph-col-left' });
		const rightCol = body.createDiv({ cls: 'ph-col ph-col-right' });

		// 左列：常用链接 + 待办
		this.renderLinks(app, manager, data, leftCol);
		this.renderTodos(app, manager, data, leftCol);

		// 右列：碎片记录 + QA
		await this.renderUnorganized(app, cfg, manager, rootPath, paraPaths, rightCol);
		this.renderQA(app, cfg, manager, paraPaths, rightCol);

		// ===== PARA管理器：独占一行全宽 =====
		this.renderParaExplorer(app, paraPaths, rootEl);

		// ===== 底部：活动日志 =====
		this.renderLog(data, rootEl);
	}

	// ==================== 顶部标题栏 ====================

	private renderHeader(cfg: ProjectHomeConfig, data: ProjectData, rootEl: HTMLElement) {
		const header = rootEl.createDiv({ cls: 'ph-header' });
		const titleArea = header.createDiv({ cls: 'ph-header-title' });
		titleArea.createEl('span', { text: '🚀', cls: 'ph-header-emoji' });
		titleArea.createEl('span', { text: cfg.name, cls: 'ph-header-name' });

		// 统计指标
		const stats = header.createDiv({ cls: 'ph-header-stats' });
		const todoCount = data.todos.filter(t => !t.completed).length;
		const todoTotal = data.todos.length;
		this.createStatBadge(stats, '📋', `${todoCount}/${todoTotal}`);
		this.createStatBadge(stats, '🔗', `${data.links.length}`);
		this.createStatBadge(stats, '📅', `${data.log.length}`);
	}

	private createStatBadge(parent: HTMLElement, emoji: string, value: string) {
		const badge = parent.createDiv({ cls: 'ph-stat-badge' });
		badge.createEl('span', { text: emoji });
		badge.createEl('span', { text: value });
	}

	// ==================== 常用链接 ====================

	private renderLinks(app: App, manager: ProjectDataManager, data: ProjectData, col: HTMLElement) {
		const section = col.createDiv({ cls: 'ph-section' });
		const header = section.createDiv({ cls: 'ph-section-header' });
		header.createEl('span', { text: '📌 常用链接', cls: 'ph-section-title' });
		header.createEl('span', { text: `${data.links.length}个`, cls: 'ph-section-hint' });

		const addBtn = header.createEl('button', { text: '+', cls: 'ph-btn-add' });
		addBtn.title = '添加链接';
		addBtn.onclick = () => {
			new AddLinkModal(app, async (name, url, group) => {
				await manager.addLink(name, url, group);
				this.rerender(app, manager, col.closest('.project-home') as HTMLElement);
			}).open();
		};

		if (data.links.length === 0) {
			section.createDiv({ text: '暂无链接，点击 + 添加', cls: 'ph-empty' });
			return;
		}

		// 按分组展示
		const groups: Record<string, ProjectLink[]> = {};
		for (const link of data.links) {
			if (!groups[link.group]) groups[link.group] = [];
			groups[link.group].push(link);
		}

		const body = section.createDiv({ cls: 'ph-section-body' });

		for (const [group, links] of Object.entries(groups)) {
			if (Object.keys(groups).length > 1) {
				body.createEl('div', { text: group, cls: 'ph-group-label' });
			}
			const list = body.createDiv({ cls: 'ph-link-list' });
			for (const link of links) {
				const item = list.createDiv({ cls: 'ph-link-item' });

				// 平台tag
				const pf = link.platform ? PLATFORM_RULES.find(r => r.key === link.platform) : null;
				if (pf) {
					const tag = item.createEl('span', { text: pf.label, cls: 'ph-link-tag' });
					tag.style.setProperty('--pf-color', pf.color);
				}

				const anchor = item.createEl('a', {
					text: link.name,
					cls: 'ph-link-name',
					attr: { href: link.url, target: '_blank', rel: 'noopener' },
				});

				const delBtn = item.createEl('button', { text: '×', cls: 'ph-btn-del' });
				delBtn.onclick = async (e: Event) => {
					e.preventDefault();
					await manager.removeLink(link.id);
					this.rerender(app, manager, col.closest('.project-home') as HTMLElement);
				};
			}
		}
	}

	// ==================== 待办事项 ====================

	private renderTodos(app: App, manager: ProjectDataManager, data: ProjectData, col: HTMLElement) {
		const section = col.createDiv({ cls: 'ph-section' });
		const header = section.createDiv({ cls: 'ph-section-header' });
		const todoCount = data.todos.filter(t => !t.completed).length;
		header.createEl('span', { text: '✅ 待办事项', cls: 'ph-section-title' });
		header.createEl('span', { text: `${todoCount}项待完成`, cls: 'ph-section-hint' });

		const addBtn = header.createEl('button', { text: '+', cls: 'ph-btn-add' });
		addBtn.title = '添加待办';
		addBtn.onclick = () => {
			new AddTodoModal(app, async (content, priority) => {
				await manager.addTodo(content, priority);
				this.rerender(app, manager, col.closest('.project-home') as HTMLElement);
			}).open();
		};

		if (data.todos.length === 0) {
			section.createDiv({ text: '暂无待办，点击 + 添加', cls: 'ph-empty' });
			return;
		}

		const sorted = [...data.todos].sort((a, b) => {
			if (a.completed !== b.completed) return a.completed ? 1 : -1;
			const pOrder = { high: 0, medium: 1, low: 2 };
			return pOrder[a.priority] - pOrder[b.priority];
		});

		const body = section.createDiv({ cls: 'ph-section-body' });
		const list = body.createDiv({ cls: 'ph-todo-list' });

		for (const todo of sorted) {
			const item = list.createDiv({ cls: `ph-todo-item ${todo.completed ? 'ph-todo-done' : ''}` });

			const checkbox = item.createEl('input', { type: 'checkbox', cls: 'ph-todo-check' });
			checkbox.checked = todo.completed;
			checkbox.onchange = async () => {
				await manager.toggleTodo(todo.id);
				this.rerender(app, manager, col.closest('.project-home') as HTMLElement);
			};

			const pm = PRIORITY_META[todo.priority] || PRIORITY_META.medium;
			item.createEl('span', { text: pm.emoji, cls: 'ph-todo-priority' });
			item.createEl('span', { text: todo.content, cls: 'ph-todo-text' });

			const delBtn = item.createEl('button', { text: '×', cls: 'ph-btn-del' });
			delBtn.onclick = async () => {
				await manager.removeTodo(todo.id);
				this.rerender(app, manager, col.closest('.project-home') as HTMLElement);
			};
		}
	}

	// ==================== 碎片记录 ====================

	private async renderUnorganized(app: App, cfg: ProjectHomeConfig, manager: ProjectDataManager, rootPath: string, paraPaths: Record<ParaKey, string>, col: HTMLElement) {
		const section = col.createDiv({ cls: 'ph-section' });
		const header = section.createDiv({ cls: 'ph-section-header' });
		const rootLabel = PARA_META[cfg.root as ParaKey]?.label || cfg.root;
		header.createEl('span', { text: '📝 碎片记录', cls: 'ph-section-title' });
		header.createEl('span', { text: `${rootLabel}目录下未整理文档`, cls: 'ph-section-hint' });

		const rootFolder = app.vault.getAbstractFileByPath(rootPath);
		if (!(rootFolder instanceof TFolder)) {
			section.createDiv({ text: `目录不存在：${rootPath}`, cls: 'ph-empty' });
			return;
		}

		// 获取直接子.md文件，排除folder note同名文档和_project-data.json
		const rootBasename = rootFolder.name; // 目录名
		const unorganized = rootFolder.children.filter(child => {
			if (!(child instanceof TFile) || child.extension !== 'md') return false;
			if (child.name === DATA_FILENAME) return false;
			// 排除folder note：与目录同名的.md文件
			if (child.basename === rootBasename) return false;
			return true;
		}) as TFile[];

		if (unorganized.length === 0) {
			section.createDiv({ text: '暂无未整理文档', cls: 'ph-empty' });
			return;
		}

		const body = section.createDiv({ cls: 'ph-section-body' });
		const list = body.createDiv({ cls: 'ph-file-list' });

		for (const file of unorganized) {
			const item = list.createDiv({ cls: 'ph-file-item' });
			item.createEl('span', { text: '📄', cls: 'ph-file-icon' });
			const nameEl = item.createEl('span', { text: file.basename, cls: 'ph-file-name' });
			nameEl.onclick = async () => {
				await app.workspace.getLeaf(false).openFile(file);
			};

			if (paraPaths.A3) {
				const archiveBtn = item.createEl('button', { text: '📦 归档', cls: 'ph-btn-action' });
				archiveBtn.onclick = async () => {
					await this.archiveFile(app, file, paraPaths.A3, manager, col.closest('.project-home') as HTMLElement);
				};
			}
		}
	}

	private async archiveFile(app: App, file: TFile, archivePath: string, manager: ProjectDataManager, rootEl: HTMLElement) {
		try {
			if (!app.vault.getAbstractFileByPath(archivePath)) {
				await app.vault.createFolder(archivePath);
			}
			const newPath = `${archivePath}/${file.name}`;
			if (app.vault.getAbstractFileByPath(newPath)) {
				new Notice(`档案目录已存在同名文件：${file.name}`);
				return;
			}
			await app.fileManager.renameFile(file, newPath);
			await manager.addLog('archive', `归档：${file.basename} → ${archivePath}`);
			await manager.save();
			new Notice(`📦 已归档：${file.basename}`);
			this.rerender(app, manager, rootEl);
		} catch (e) {
			new Notice(`归档失败：${e}`);
		}
	}

	// ==================== QA记录 ====================

	private renderQA(app: App, cfg: ProjectHomeConfig, manager: ProjectDataManager, paraPaths: Record<ParaKey, string>, col: HTMLElement) {
		const section = col.createDiv({ cls: 'ph-section' });
		const header = section.createDiv({ cls: 'ph-section-header' });
		header.createEl('span', { text: '❓ QA记录', cls: 'ph-section-title' });

		const R2Path = paraPaths.R2;
		if (!R2Path) {
			header.createEl('span', { text: '未配置R2目录', cls: 'ph-section-hint' });
			section.createDiv({ text: '请配置 R2（资源）目录以使用QA功能', cls: 'ph-empty' });
			return;
		}

		const btns = header.createDiv({ cls: 'ph-header-btns' });
		const addBtn = btns.createEl('button', { text: '+创建', cls: 'ph-btn-action' });
		const searchBtn = btns.createEl('button', { text: '🔍搜索', cls: 'ph-btn-action' });

		addBtn.onclick = () => {
			new CreateQAModal(app, async (title) => {
				await this.createQADoc(app, R2Path, title, manager, col.closest('.project-home') as HTMLElement);
			}).open();
		};

		searchBtn.onclick = () => {
			new QASearchModal(app, R2Path, async (file) => {
				await app.workspace.getLeaf(false).openFile(file);
			}).open();
		};

		const folder = app.vault.getAbstractFileByPath(R2Path);
		if (!(folder instanceof TFolder)) {
			section.createDiv({ text: `R2目录不存在：${R2Path}`, cls: 'ph-empty' });
			return;
		}

		const qaFiles = folder.children.filter(c => c instanceof TFile && c.extension === 'md') as TFile[];
		if (qaFiles.length === 0) {
			section.createDiv({ text: '暂无QA文档', cls: 'ph-empty' });
			return;
		}

		const sorted = qaFiles.sort((a, b) => b.stat.mtime - a.stat.mtime).slice(0, 8);
		const body = section.createDiv({ cls: 'ph-section-body' });
		const list = body.createDiv({ cls: 'ph-file-list' });

		for (const file of sorted) {
			const item = list.createDiv({ cls: 'ph-file-item' });
			item.createEl('span', { text: '❓', cls: 'ph-file-icon' });
			const nameEl = item.createEl('span', { text: file.basename, cls: 'ph-file-name' });
			nameEl.onclick = async () => {
				await app.workspace.getLeaf(false).openFile(file);
			};
		}

		if (qaFiles.length > 8) {
			body.createDiv({ text: `还有 ${qaFiles.length - 8} 篇，点击🔍搜索查看全部`, cls: 'ph-more-hint' });
		}
	}

	private async createQADoc(app: App, R2Path: string, title: string, manager: ProjectDataManager, rootEl: HTMLElement) {
		try {
			if (!app.vault.getAbstractFileByPath(R2Path)) {
				await app.vault.createFolder(R2Path);
			}
			const filePath = `${R2Path}/${title}.md`;
			if (app.vault.getAbstractFileByPath(filePath)) {
				new Notice('该QA文档已存在');
				const existing = app.vault.getAbstractFileByPath(filePath);
				if (existing instanceof TFile) await app.workspace.getLeaf(false).openFile(existing);
				return;
			}

			const now = new Date();
			const pad = (n: number) => String(n).padStart(2, '0');
			const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

			const content = [
				'---',
				'tags: QA',
				'type: 工作',
				`created: ${ts}`,
				'---',
				'',
				`# ${title}`,
				`> 提问时间：${ts}`,
				'',
				'## 📝 问题描述',
				'<!-- 在此处描述你遇到的问题 -->',
				'',
				'## 💡 解答思路',
				'<!-- 在此处记录解答的核心思路 -->',
				'',
				'## 📖 最终答案',
				'<!-- 在此处填写完整的答案内容 -->',
				'',
				'## 📌 补充说明',
				'<!-- 可选：记录额外的注意事项、参考资料等 -->',
				'',
			].join('\n');

			const file = await app.vault.create(filePath, content);
			await manager.addLog('create_qa', `创建QA：${title}`);
			await manager.save();
			new Notice(`❓ 已创建QA：${title}`);
			await app.workspace.getLeaf(false).openFile(file);
			this.rerender(app, manager, rootEl);
		} catch (e) {
			new Notice(`创建QA失败：${e}`);
		}
	}

	// ==================== PARA管理器（内嵌 para-explorer-v2） ====================

	private renderParaExplorer(app: App, paraPaths: Record<ParaKey, string>, parentEl: HTMLElement) {
		// 构建 para-explorer-v2 的配置
		const pe2Config: Record<string, any> = {
			view: 'overview',
			maxItems: 8,
		};
		if (paraPaths.P0) pe2Config.P0 = paraPaths.P0;
		if (paraPaths.A1) pe2Config.A1 = paraPaths.A1;
		if (paraPaths.R2) pe2Config.R2 = paraPaths.R2;
		if (paraPaths.A3) pe2Config.A3 = paraPaths.A3;

		const hasPaths = paraPaths.P0 || paraPaths.A1 || paraPaths.R2 || paraPaths.A3;
		if (!hasPaths) return;

		// 全宽容器，独占一行
		const wrapper = parentEl.createDiv({ cls: 'ph-para-fullwidth' });

		// 直接调用 ParaExplorerV2Module.render() 嵌入
		const pe2 = new ParaExplorerV2Module();
		pe2.render(app, pe2Config, wrapper);
	}

	// ==================== 活动日志 ====================

	private renderLog(data: ProjectData, rootEl: HTMLElement) {
		if (data.log.length === 0) return;

		const section = rootEl.createDiv({ cls: 'ph-section ph-section-log' });
		const header = section.createDiv({ cls: 'ph-section-header' });
		header.createEl('span', { text: '📅 活动日志', cls: 'ph-section-title' });

		const recent = [...data.log].reverse().slice(0, 10);
		const body = section.createDiv({ cls: 'ph-section-body' });
		const list = body.createDiv({ cls: 'ph-log-list' });

		for (const entry of recent) {
			const item = list.createDiv({ cls: 'ph-log-item' });
			const date = new Date(entry.date);
			const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
			item.createEl('span', { text: dateStr, cls: 'ph-log-date' });
			item.createEl('span', { text: entry.detail, cls: 'ph-log-detail' });
		}
	}

	// ==================== 重新渲染 ====================

	private async rerender(app: App, manager: ProjectDataManager, rootEl: HTMLElement) {
		if (!rootEl) return;
		const cfg: ProjectHomeConfig = (rootEl as any)._phConfig;
		const paraPaths: Record<ParaKey, string> = (rootEl as any)._phParaPaths;
		const rootPath: string = (rootEl as any)._phRootPath;
		if (!cfg) return;

		const data = manager.getData();
		rootEl.empty();
		this.renderHeader(cfg, data, rootEl);

		const body = rootEl.createDiv({ cls: 'ph-body' });
		const leftCol = body.createDiv({ cls: 'ph-col ph-col-left' });
		const rightCol = body.createDiv({ cls: 'ph-col ph-col-right' });

		this.renderLinks(app, manager, data, leftCol);
		this.renderTodos(app, manager, data, leftCol);
		await this.renderUnorganized(app, cfg, manager, rootPath, paraPaths, rightCol);
		this.renderQA(app, cfg, manager, paraPaths, rightCol);
		this.renderParaExplorer(app, paraPaths, rootEl);
		this.renderLog(data, rootEl);
	}
}
