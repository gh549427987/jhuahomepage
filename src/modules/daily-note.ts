import { App, Notice, TFile } from 'obsidian';
import { HPageModule } from '../types';
import { refreshModules } from './index';

// ==================== 日记解析与渲染 ====================

/** 日记各板块的解析结构 */
interface DailyNoteData {
	filePath: string;
	frontmatter: Record<string, any>;
	tracking: { text: string; raw: string }[];  // 🚦Tracking 事件列表（纯列表，无勾选框）
	dairy: string;      // 📒Dairy 板块内容
	tasks: { text: string; completed: boolean; raw: string }[];    // 📖Tasks
	doneItems: { text: string; raw: string }[];  // 🎖️Done 列表项
	photos: string;     // 照片瀑布流 code block 内容
	rawContent: string; // 原始完整内容
}

/** 板块标题定义（与日记模板一致） */
const SECTION_HEADERS = [
	{ emoji: '🚦', key: 'Tracking', label: '追踪' },
	{ emoji: '📒', key: 'Dairy', label: '日记' },
	{ emoji: '📖', key: 'Tasks', label: '待办' },
	{ emoji: '🎖️', key: 'Done', label: '已完成' },
];

// ==================== 常用 Tracking 标签持久化 ====================

const TRACKING_TAGS_KEY = 'jhua-dn-tracking-tags';
const SHOW_CALENDAR_KEY = 'jhua-dn-show-calendar';

function loadTrackingTags(): string[] {
	try {
		const raw = localStorage.getItem(TRACKING_TAGS_KEY);
		return raw ? JSON.parse(raw) : ['上班', '买菜', '午觉', '蛐蛐'];
	} catch {
		return ['上班', '买菜', '午觉', '蛐蛐'];
	}
}

function saveTrackingTags(tags: string[]): void {
	localStorage.setItem(TRACKING_TAGS_KEY, JSON.stringify(tags));
}

function loadShowCalendar(): boolean {
	return localStorage.getItem(SHOW_CALENDAR_KEY) === 'true';
}

function saveShowCalendar(val: boolean): void {
	localStorage.setItem(SHOW_CALENDAR_KEY, val ? 'true' : 'false');
}

/** 安全的本地日期格式化（避免 toISOString 的 UTC 偏移问题） */
function formatDateLocal(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

/** 安全的日期加减（不依赖 toISOString，避免时区偏移） */
function addDays(dateStr: string, delta: number): string {
	const parts = dateStr.split('-');
	const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
	d.setDate(d.getDate() + delta);
	return formatDateLocal(d);
}

/** 解析日记 markdown 为结构化数据 */
export function parseDailyNote(content: string): DailyNoteData {
	const lines = content.split('\n');
	const data: DailyNoteData = {
		filePath: '',
		frontmatter: {},
		tracking: [],
		dairy: '',
		tasks: [],
		doneItems: [],
		photos: '',
		rawContent: content,
	};

	// 提取 frontmatter
	let inFrontmatter = false;
	let fmStart = -1;
	let fmEnd = -1;
	for (let i = 0; i < lines.length; i++) {
		if (lines[i].trim() === '---') {
			if (fmStart === -1) {
				fmStart = i;
				inFrontmatter = true;
			} else if (inFrontmatter) {
				fmEnd = i;
				inFrontmatter = false;
				for (let j = fmStart + 1; j < fmEnd; j++) {
					const line = lines[j];
					const match = line.match(/^(\w[\w_]*):\s*(.*)$/);
					if (match) {
						const key = match[1];
						let value: any = match[2].trim();
						if (value === '' && j + 1 < fmEnd && lines[j + 1].match(/^\s+-\s+/)) {
							value = [];
							let k = j + 1;
							while (k < fmEnd && lines[k].match(/^\s+-\s+/)) {
								value.push(lines[k].replace(/^\s+-\s+/, '').trim());
								k++;
							}
						} else if (!isNaN(Number(value)) && value !== '') {
							value = Number(value);
						}
						data.frontmatter[key] = value;
					}
				}
				break;
			}
		}
	}

	// 找各板块位置
	const sectionPositions: Record<string, number> = {};
	for (let i = 0; i < lines.length; i++) {
		for (const section of SECTION_HEADERS) {
			const re = new RegExp(`^#\\s*${section.emoji}\\s*${section.key}`, 'i');
			if (re.test(lines[i])) {
				sectionPositions[section.key] = i;
			}
		}
	}

	// 找照片瀑布流
	let photoStart = -1;
	for (let i = 0; i < lines.length; i++) {
		if (lines[i].trim().startsWith('```ad-col4')) {
			photoStart = i;
			break;
		}
	}

	// 提取 Tracking 内容（纯列表项，不使用 checkbox）
	if (sectionPositions['Tracking'] !== undefined) {
		const start = sectionPositions['Tracking'] + 1;
		const end = findNextSectionEnd(lines, start, sectionPositions);
		for (let i = start; i < end; i++) {
			const line = lines[i];
			// 匹配 checkbox 格式：转为纯列表项读取（兼容旧数据）
			const checkMatch = line.match(/^(\s*)- \[([ xX])\] (.+)$/);
			if (checkMatch) {
				data.tracking.push({
					text: checkMatch[3].trim(),
					raw: line,
				});
				continue;
			}
			// 匹配纯列表项: - 事件
			const listMatch = line.match(/^(\s*)- (.+)$/);
			if (listMatch && listMatch[1].trim()) {
				data.tracking.push({
					text: listMatch[1].trim(),
					raw: line,
				});
				continue;
			}
		}
	}

	// 提取 Dairy 内容
	if (sectionPositions['Dairy'] !== undefined) {
		const start = sectionPositions['Dairy'] + 1;
		const end = findNextSectionEnd(lines, start, sectionPositions);
		const dairyLines = lines.slice(start, end);
		data.dairy = dairyLines.join('\n').trim();
	}

	// 提取 Tasks（checkbox 列表）
	if (sectionPositions['Tasks'] !== undefined) {
		const start = sectionPositions['Tasks'] + 1;
		const end = findNextSectionEnd(lines, start, sectionPositions);
		for (let i = start; i < end; i++) {
			const match = lines[i].match(/^(\s*)- \[([ xX])\] (.+)$/);
			if (match) {
				data.tasks.push({
					text: match[3].trim(),
					completed: match[2] !== ' ',
					raw: lines[i],
				});
			}
		}
	}

	// 提取 Done 内容（纯列表项）
	if (sectionPositions['Done'] !== undefined) {
		const start = sectionPositions['Done'] + 1;
		const end = Math.min(
			photoStart >= 0 ? photoStart : lines.length,
			lines.length
		);
		// 找到下一个板块标题或照片
		let doneEnd = end;
		for (let i = start; i < end; i++) {
			if (/^#\s*[🚦📒📖🎖️🖼️]/.test(lines[i]) || lines[i].trim().startsWith('```ad-col4')) {
				doneEnd = i;
				break;
			}
		}
		for (let i = start; i < doneEnd; i++) {
			const line = lines[i];
			// 纯列表项: - 完成项目A
			const listMatch = line.match(/^(\s*)- (.+)$/);
			if (listMatch && listMatch[1].trim()) {
				data.doneItems.push({
					text: listMatch[1].trim(),
					raw: line,
				});
			}
		}
	}

	return data;
}

function findNextSectionEnd(lines: string[], start: number, sectionPositions: Record<string, number>): number {
	const positions = Object.values(sectionPositions).sort((a, b) => a - b);
	for (const pos of positions) {
		if (pos > start) return pos;
	}
	return lines.length;
}

/** 根据日期字符串计算日记文件路径 */
function getDailyNotePath(dateStr: string, basePath: string): string {
	const parts = dateStr.split('-');
	const year = parts[0];
	const month = parts[1];
	return `${basePath}/${year}/${year}-${month}/${dateStr}.md`;
}

/** 创建新日记文件 */
async function createDailyNote(app: App, dateStr: string, basePath: string): Promise<TFile | null> {
	const filePath = getDailyNotePath(dateStr, basePath);
	const existing = app.vault.getAbstractFileByPath(filePath);
	if (existing instanceof TFile) return existing;

	const dateParts = dateStr.split('-');
	const date = new Date(
		parseInt(dateParts[0]),
		parseInt(dateParts[1]) - 1,
		parseInt(dateParts[2])
	);
	const weekday = date.toLocaleDateString('zh-CN', { weekday: 'long' });

	const yesterdayStr = addDays(dateStr, -1);
	const tomorrowStr = addDays(dateStr, 1);

	const content = `---
author: jhua
title: ${dateStr}
tags:
  - daily_note
date: ${dateStr}
weekday: ${weekday}
create_time: ${formatDateLocal(new Date())} ${new Date().toTimeString().slice(0, 8)}
StudyMins: 0
StudyItems: 
SportMins: 0
SportItems: 0
PlayMins: 0
image: 
---
# 🚦Tracking


# 📒Dairy


# 📖Tasks

# 🎖️Done 完成的事！



\`\`\`ad-col4
title: 🖼️ 照片瀑布流
color: 215,155,255
collapse: close


\`\`\`

<< [[${yesterdayStr}]] > | [[${dateStr}]] | < [[${tomorrowStr}]] >>
`;

	// 递归创建目录
	const dir = filePath.substring(0, filePath.lastIndexOf('/'));
	const dirs = dir.split('/');
	let currentPath = '';
	for (const d of dirs) {
		currentPath = currentPath ? `${currentPath}/${d}` : d;
		if (!app.vault.getAbstractFileByPath(currentPath)) {
			try {
				await app.vault.createFolder(currentPath);
			} catch (e) {
				// 目录可能已存在
			}
		}
	}

	try {
		const file = await app.vault.create(filePath, content);
		new Notice(`✅ 日记已创建：${dateStr}`);
		return file;
	} catch (e: any) {
		new Notice(`创建日记失败: ${e.message || '未知错误'}`);
		return null;
	}
}

// ==================== 日历渲染（弹窗/内联共用） ====================

/** 渲染日历内容到指定容器 */
function renderCalendarContent(
	container: HTMLElement,
	app: App,
	currentDate: string,
	basePath: string,
	onSelect: (date: string) => void,
	showPinBtn: boolean = false,
	isPinned: boolean = false,
	onPinToggle?: () => void
): void {
	let viewYear: number;
	let viewMonth: number;
	const cp = currentDate.split('-');
	viewYear = parseInt(cp[0]);
	viewMonth = parseInt(cp[1]) - 1;

	function draw(): void {
		container.empty();

		// 月份导航
		const nav = container.createDiv({ cls: 'jhua-dn-cal-nav' });
		const prevMonthBtn = nav.createEl('button', { text: '◀', cls: 'jhua-dn-cal-nav-btn' });
		const monthLabel = nav.createDiv({ cls: 'jhua-dn-cal-month-label' });
		monthLabel.textContent = `${viewYear}年${viewMonth + 1}月`;
		const nextMonthBtn = nav.createEl('button', { text: '▶', cls: 'jhua-dn-cal-nav-btn' });

		// 右侧固定按钮
		if (showPinBtn && onPinToggle) {
			const pinBtn = nav.createEl('button', {
				text: isPinned ? '📌 已固定' : '📌 固定日历',
				cls: 'jhua-dn-cal-pin-btn' + (isPinned ? ' jhua-dn-cal-pin-active' : ''),
				attr: { title: isPinned ? '取消固定日历' : '固定日历到组件内' }
			});
			pinBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				onPinToggle();
			});
		}

		prevMonthBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			viewMonth--;
			if (viewMonth < 0) { viewMonth = 11; viewYear--; }
			draw();
		});
		nextMonthBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			viewMonth++;
			if (viewMonth > 11) { viewMonth = 0; viewYear++; }
			draw();
		});

		// 星期头
		const weekHeader = container.createDiv({ cls: 'jhua-dn-cal-week-header' });
		for (const w of ['日', '一', '二', '三', '四', '五', '六']) {
			weekHeader.createEl('span', { text: w, cls: 'jhua-dn-cal-week-cell' });
		}

		// 日期网格
		const grid = container.createDiv({ cls: 'jhua-dn-cal-grid' });
		const firstDay = new Date(viewYear, viewMonth, 1).getDay();
		const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
		const today = formatDateLocal(new Date());

		for (let i = 0; i < firstDay; i++) {
			grid.createEl('span', { cls: 'jhua-dn-cal-cell jhua-dn-cal-empty' });
		}

		for (let d = 1; d <= daysInMonth; d++) {
			const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
			const cell = grid.createEl('span', {
				text: String(d),
				cls: 'jhua-dn-cal-cell'
			});
			if (dateStr === today) cell.classList.add('jhua-dn-cal-today');
			if (dateStr === currentDate) cell.classList.add('jhua-dn-cal-selected');

			const filePath = getDailyNotePath(dateStr, basePath);
			const file = app.vault.getAbstractFileByPath(filePath);
			if (file instanceof TFile) {
				cell.classList.add('jhua-dn-cal-has-note');
			}

			cell.addEventListener('click', (e) => {
				e.stopPropagation();
				onSelect(dateStr);
			});
		}
	}

	draw();
}

/** 渲染日历弹窗 */
function showCalendarPopup(
	container: HTMLElement,
	app: App,
	currentDate: string,
	basePath: string,
	onSelect: (date: string) => void
): void {
	const existing = container.querySelector('.jhua-dn-calendar-popup');
	if (existing) { existing.remove(); return; }

	const popup = container.createDiv({ cls: 'jhua-dn-calendar-popup' });
	popup.addEventListener('click', (e) => e.stopPropagation());

	const isPinned = loadShowCalendar();
	renderCalendarContent(popup, app, currentDate, basePath, (date) => {
		onSelect(date);
		popup.remove();
	}, true, isPinned, () => {
		const newPinned = !loadShowCalendar();
		saveShowCalendar(newPinned);
		popup.remove();
		// 重新渲染整个组件以应用变更
		const module = getModuleById('daily-note');
		if (module) {
			const cfg = { ...(module as any).config };
			module.render(app, cfg, container);
		}
	});

	// 点击外部关闭
	const closeHandler = (e: MouseEvent) => {
		if (!popup.contains(e.target as Node)) {
			popup.remove();
			document.removeEventListener('click', closeHandler);
		}
	};
	setTimeout(() => {
		document.addEventListener('click', closeHandler);
	}, 100);
}

// 需要在模块外部访问 getModuleById
import { getModuleById } from './index';

// ==================== DailyNote 模块 ====================

export class DailyNoteModule implements HPageModule {
	id = 'daily-note';
	name = '今日日记';
	defaultConfig = {
		date: '',
		showTracking: true,
		showDairy: true,
		showTasks: true,
		showDone: true,
		showPhotos: false,
		showCalendar: false,  // 内联日历（默认关闭，可通过日历弹窗的📌按钮开启）
	};

	private app: App;
	private container: HTMLElement;
	private config: any;
	private currentData: DailyNoteData | null = null;
	private currentFile: TFile | null = null;
	private currentFilePath: string = '';
	private currentDate: string = '';
	private basePath: string = '';
	private saveTimer: ReturnType<typeof setTimeout> | null = null;

	async render(app: App, config: Record<string, any>, container?: HTMLElement): Promise<HTMLElement> {
		this.app = app;
		this.config = config;

		this.container = container || document.createElement('div');
		this.container.className = 'jhua-hpage-module jhua-daily-note';
		this.container.dataset.jhuaModule = this.id;
		this.container.empty();

		const targetDate = config.date || formatDateLocal(new Date());
		this.currentDate = targetDate;
		this.basePath = config.todoSources?.find((s: any) => s.id === config.currentTodoSourceId)?.path
			|| '01-领域（Areas）/00-日常记录/02-日记';
		this.currentFilePath = getDailyNotePath(targetDate, this.basePath);

		// ===== 头部 =====
		const header = this.container.createDiv({ cls: 'jhua-dn-header' });

		const navArea = header.createDiv({ cls: 'jhua-dn-nav' });
		const prevBtn = navArea.createEl('button', { text: '◀', cls: 'jhua-dn-nav-btn', attr: { title: '前一天' } });
		const dateDisplay = navArea.createDiv({ cls: 'jhua-dn-date-display' });

		const dp = targetDate.split('-');
		const dateObj = new Date(parseInt(dp[0]), parseInt(dp[1]) - 1, parseInt(dp[2]));
		const weekday = dateObj.toLocaleDateString('zh-CN', { weekday: 'long' });
		const isToday = targetDate === formatDateLocal(new Date());

		dateDisplay.createEl('span', { text: `${dp[0]}年${dp[1]}月${dp[2]}日`, cls: 'jhua-dn-date-text' });
		dateDisplay.createEl('span', { text: weekday, cls: 'jhua-dn-weekday' });
		if (isToday) {
			dateDisplay.createEl('span', { text: '今天', cls: 'jhua-dn-today-badge' });
		}

		const nextBtn = navArea.createEl('button', { text: '▶', cls: 'jhua-dn-nav-btn', attr: { title: '后一天' } });

		prevBtn.addEventListener('click', () => {
			const newDate = addDays(this.currentDate, -1);
			this.config.date = newDate;
			this.render(this.app, this.config, this.container);
		});

		nextBtn.addEventListener('click', async () => {
			const newDate = addDays(this.currentDate, 1);
			this.config.date = newDate;
			const newPath = getDailyNotePath(newDate, this.basePath);
			const existingFile = this.app.vault.getAbstractFileByPath(newPath);
			if (!(existingFile instanceof TFile)) {
				await createDailyNote(this.app, newDate, this.basePath);
			}
			this.render(this.app, this.config, this.container);
		});

		const actions = header.createDiv({ cls: 'jhua-dn-actions' });
		const calendarBtn = actions.createEl('button', { text: '📅', cls: 'jhua-dn-action-btn', attr: { title: '日历选择日期' } });
		const openBtn = actions.createEl('button', { text: '📝', cls: 'jhua-dn-action-btn', attr: { title: '在编辑器中打开' } });
		const refreshBtn = actions.createEl('button', { text: '🔄', cls: 'jhua-dn-action-btn', attr: { title: '刷新' } });

		calendarBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			showCalendarPopup(this.container, this.app, this.currentDate, this.basePath, async (date: string) => {
				this.config.date = date;
				const newPath = getDailyNotePath(date, this.basePath);
				const existingFile = this.app.vault.getAbstractFileByPath(newPath);
				if (!(existingFile instanceof TFile)) {
					await createDailyNote(this.app, date, this.basePath);
				}
				this.render(this.app, this.config, this.container);
			});
		});

		openBtn.addEventListener('click', () => {
			if (this.currentFile) {
				this.app.workspace.getLeaf(false).openFile(this.currentFile);
			}
		});

		refreshBtn.addEventListener('click', () => {
			this.render(this.app, this.config, this.container);
		});

		// 内容区
		const content = this.container.createDiv({ cls: 'jhua-dn-content' });

		// ===== 内联日历（如果开启） =====
		const showCalendar = config.showCalendar || loadShowCalendar();
		if (showCalendar) {
			const calSection = content.createDiv({ cls: 'jhua-dn-section' });
			const calHeader = calSection.createDiv({ cls: 'jhua-dn-section-header' });
			calHeader.createEl('span', { text: '📅 日历', cls: 'jhua-dn-section-title' });
			// 取消固定按钮
			const unpinBtn = calHeader.createEl('button', {
				text: '✕ 取消固定',
				cls: 'jhua-dn-cal-unpin-btn',
				attr: { title: '取消固定日历' }
			});
			unpinBtn.addEventListener('click', () => {
				saveShowCalendar(false);
				this.config.showCalendar = false;
				this.render(this.app, this.config, this.container);
			});

			const calBody = calSection.createDiv({ cls: 'jhua-dn-cal-inline' });
			renderCalendarContent(calBody, this.app, this.currentDate, this.basePath, async (date) => {
				this.config.date = date;
				const newPath = getDailyNotePath(date, this.basePath);
				const existingFile = this.app.vault.getAbstractFileByPath(newPath);
				if (!(existingFile instanceof TFile)) {
					await createDailyNote(this.app, date, this.basePath);
				}
				this.render(this.app, this.config, this.container);
			}, false, false, undefined);
		}

		// 查找或创建日记文件
		let file = app.vault.getAbstractFileByPath(this.currentFilePath);
		if (!(file instanceof TFile)) {
			file = await createDailyNote(app, targetDate, this.basePath);
		}

		if (!(file instanceof TFile)) {
			content.createEl('div', {
				text: `❌ 无法找到或创建日记：${targetDate}`,
				cls: 'jhua-dn-error'
			});
			return this.container;
		}

		this.currentFile = file;

		const raw = await app.vault.read(file);
		this.currentData = parseDailyNote(raw);

		// ===== 元数据面板 =====
		const metaPanel = content.createDiv({ cls: 'jhua-dn-meta' });
		this.renderMetaPanel(metaPanel);

		// ===== 🚦 Tracking 板块 =====
		if (config.showTracking) {
			const trackingSection = content.createDiv({ cls: 'jhua-dn-section' });
			const trackingHeader = trackingSection.createDiv({ cls: 'jhua-dn-section-header' });
			trackingHeader.createEl('span', { text: '🚦 Tracking', cls: 'jhua-dn-section-title' });
			trackingHeader.createEl('span', { text: '今天做了什么', cls: 'jhua-dn-section-hint' });

			// 右侧 "+" 按钮，管理常用标签
			const tagMgrBtn = trackingHeader.createEl('button', {
				text: '＋',
				cls: 'jhua-dn-tag-mgr-btn',
				attr: { title: '管理常用标签' }
			});

			const trackingBody = trackingSection.createDiv({ cls: 'jhua-dn-section-body jhua-dn-tracking-body' });

			// 常用标签浮窗（点击 + 切换）
			let tagMgrOpen = false;
			const tagMgrPanel = trackingBody.createDiv({ cls: 'jhua-dn-tag-mgr', attr: { style: 'display: none;' } });

			tagMgrBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				tagMgrOpen = !tagMgrOpen;
				tagMgrPanel.style.display = tagMgrOpen ? 'block' : 'none';
				if (tagMgrOpen) {
					renderTagManager(tagMgrPanel, trackingBody);
				}
			});

			// 常用标签快捷区域
			const tags = loadTrackingTags();
			const tagBar = trackingBody.createDiv({ cls: 'jhua-dn-tracking-tags' });
			if (tags.length > 0) {
				for (const tag of tags) {
					const tagEl = tagBar.createEl('span', {
						text: tag,
						cls: 'jhua-dn-tracking-tag'
					});
					// 点击标签直接添加到今日 Tracking
					tagEl.addEventListener('click', async () => {
						await this.addTrackingItem(tag);
						// 刷新列表
						const newList = trackingBody.querySelector('.jhua-dn-tracking-list') as HTMLElement;
						if (newList) {
							newList.empty();
							this.renderTrackingList(newList);
						}
					});
				}
			}

			// 渲染已有追踪事件
			const trackingList = trackingBody.createDiv({ cls: 'jhua-dn-tracking-list' });
			this.renderTrackingList(trackingList);

			// 内联添加事件
			const addTrackRow = trackingBody.createDiv({ cls: 'jhua-dn-add-tracking' });
			const addInput = addTrackRow.createEl('input', {
				cls: 'jhua-dn-add-tracking-input',
				attr: { placeholder: '添加事件，回车确认...', type: 'text' }
			});
			addInput.addEventListener('keydown', async (e) => {
				if (e.key === 'Enter' && addInput.value.trim()) {
					await this.addTrackingItem(addInput.value.trim());
					addInput.value = '';
					const newList = trackingBody.querySelector('.jhua-dn-tracking-list') as HTMLElement;
					if (newList) {
						newList.empty();
						this.renderTrackingList(newList);
					}
				}
			});
		}

		// ===== 📒 Dairy 板块 =====
		if (config.showDairy) {
			const dairySection = content.createDiv({ cls: 'jhua-dn-section' });
			const dairyHeader = dairySection.createDiv({ cls: 'jhua-dn-section-header' });
			dairyHeader.createEl('span', { text: '📒 Dairy', cls: 'jhua-dn-section-title' });
			dairyHeader.createEl('span', { text: '直接编辑，自动保存', cls: 'jhua-dn-section-hint' });

			const dairyBody = dairySection.createDiv({ cls: 'jhua-dn-section-body jhua-dn-dairy-body' });

			const dairyText = dairyBody.createEl('textarea', {
				cls: 'jhua-dn-dairy-editor',
				attr: { placeholder: '今天发生了什么？记录下来吧...' }
			});
			dairyText.value = this.currentData.dairy;
			this.autoResizeTextarea(dairyText);
			dairyText.addEventListener('input', () => {
				this.autoResizeTextarea(dairyText);
				this.scheduleSave('Dairy', dairyText.value);
			});

			if (!this.currentData.dairy.trim()) {
				dairyBody.createEl('div', {
					text: '✍️ 点击上方区域开始写日记...',
					cls: 'jhua-dn-placeholder'
				});
				dairyText.addEventListener('focus', () => {
					const placeholder = dairyBody.querySelector('.jhua-dn-placeholder');
					if (placeholder) placeholder.remove();
				}, { once: true });
			}
		}

		// ===== 📖 Tasks 板块 =====
		if (config.showTasks) {
			const tasksSection = content.createDiv({ cls: 'jhua-dn-section' });
			const tasksHeader = tasksSection.createDiv({ cls: 'jhua-dn-section-header' });
			tasksHeader.createEl('span', { text: '📖 Tasks', cls: 'jhua-dn-section-title' });

			const tasksBody = tasksSection.createDiv({ cls: 'jhua-dn-section-body jhua-dn-tasks-body' });

			const taskList = tasksBody.createDiv({ cls: 'jhua-dn-task-list' });
			this.renderTaskList(taskList);

			const addTaskRow = tasksBody.createDiv({ cls: 'jhua-dn-add-task' });
			const addInput = addTaskRow.createEl('input', {
				cls: 'jhua-dn-add-task-input',
				attr: { placeholder: '添加待办，回车确认...', type: 'text' }
			});
			addInput.addEventListener('keydown', async (e) => {
				if (e.key === 'Enter' && addInput.value.trim()) {
					await this.addTask(addInput.value.trim());
					addInput.value = '';
					taskList.empty();
					await this.reloadAndRenderTasks(taskList);
					await refreshModules(this.app, ['daily-tasks', 'todo-list'], this.config);
				}
			});
		}

		// ===== 🎖️ Done 板块 =====
		if (config.showDone) {
			const doneSection = content.createDiv({ cls: 'jhua-dn-section' });
			const doneHeader = doneSection.createDiv({ cls: 'jhua-dn-section-header' });
			doneHeader.createEl('span', { text: '🎖️ Done', cls: 'jhua-dn-section-title' });

			const doneBody = doneSection.createDiv({ cls: 'jhua-dn-section-body jhua-dn-done-body' });

			// 渲染已完成列表
			const doneList = doneBody.createDiv({ cls: 'jhua-dn-done-list' });
			this.renderDoneList(doneList);

			// 内联添加完成事项
			const addDoneRow = doneBody.createDiv({ cls: 'jhua-dn-add-done' });
			const addDoneInput = addDoneRow.createEl('input', {
				cls: 'jhua-dn-add-done-input',
				attr: { placeholder: '记录完成的事，回车确认...', type: 'text' }
			});
			addDoneInput.addEventListener('keydown', async (e) => {
				if (e.key === 'Enter' && addDoneInput.value.trim()) {
					await this.addDoneItem(addDoneInput.value.trim());
					addDoneInput.value = '';
					doneList.empty();
					await this.reloadAndRenderDone(doneList);
				}
			});
		}

		return this.container;
	}

	// ==================== 标签管理器 ====================

	private renderTagManager(panel: HTMLElement, trackingBody: HTMLElement): void {
		panel.empty();
		const tags = loadTrackingTags();

		const title = panel.createDiv({ cls: 'jhua-dn-tag-mgr-title' });
		title.textContent = '常用标签管理';

		const list = panel.createDiv({ cls: 'jhua-dn-tag-mgr-list' });
		for (let i = 0; i < tags.length; i++) {
			const row = list.createDiv({ cls: 'jhua-dn-tag-mgr-row' });
			row.createEl('span', { text: tags[i], cls: 'jhua-dn-tag-mgr-label' });
			const delBtn = row.createEl('button', {
				text: '✕',
				cls: 'jhua-dn-tag-mgr-del',
				attr: { title: '删除此标签' }
			});
			delBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				tags.splice(i, 1);
				saveTrackingTags(tags);
				this.renderTagManager(panel, trackingBody);
				// 同步刷新标签栏
				this.refreshTagBar(trackingBody);
			});
		}

		// 添加新标签
		const addRow = panel.createDiv({ cls: 'jhua-dn-tag-mgr-add' });
		const addInput = addRow.createEl('input', {
			cls: 'jhua-dn-tag-mgr-add-input',
			attr: { placeholder: '新标签名，回车添加...', type: 'text' }
		});
		addInput.addEventListener('keydown', (e) => {
			e.stopPropagation();
			if (e.key === 'Enter' && addInput.value.trim()) {
				const newTag = addInput.value.trim();
				if (!tags.includes(newTag)) {
					tags.push(newTag);
					saveTrackingTags(tags);
					this.renderTagManager(panel, trackingBody);
					this.refreshTagBar(trackingBody);
				} else {
					new Notice('该标签已存在');
				}
			}
		});
	}

	/** 刷新标签栏 */
	private refreshTagBar(trackingBody: HTMLElement): void {
		const tagBar = trackingBody.querySelector('.jhua-dn-tracking-tags') as HTMLElement;
		if (!tagBar) return;
		tagBar.empty();
		const tags = loadTrackingTags();
		for (const tag of tags) {
			const tagEl = tagBar.createEl('span', {
				text: tag,
				cls: 'jhua-dn-tracking-tag'
			});
			tagEl.addEventListener('click', async () => {
				await this.addTrackingItem(tag);
				const newList = trackingBody.querySelector('.jhua-dn-tracking-list') as HTMLElement;
				if (newList) {
					newList.empty();
					this.renderTrackingList(newList);
				}
			});
		}
	}

	// ==================== 元数据面板 ====================

	private renderMetaPanel(panel: HTMLElement): void {
		if (!this.currentData) return;
		const fm = this.currentData.frontmatter;

		const stats = panel.createDiv({ cls: 'jhua-dn-meta-stats' });

		const studyMins = fm.StudyMins || 0;
		const sportMins = fm.SportMins || 0;
		const playMins = fm.PlayMins || 0;

		stats.createDiv({ cls: 'jhua-dn-meta-item jhua-dn-meta-study' })
			.createEl('span', { text: `📖 学习 ${studyMins}min` });
		stats.createDiv({ cls: 'jhua-dn-meta-item jhua-dn-meta-sport' })
			.createEl('span', { text: `🏃 运动 ${sportMins}min` });
		stats.createDiv({ cls: 'jhua-dn-meta-item jhua-dn-meta-play' })
			.createEl('span', { text: `🎮 娱乐 ${playMins}min` });

		const editStatsBtn = stats.createEl('button', { text: '⚡', cls: 'jhua-dn-meta-edit-btn', attr: { title: '快速修改时长' } });
		editStatsBtn.addEventListener('click', () => {
			this.showInlineStatsEditor(panel);
		});
	}

	private showInlineStatsEditor(panel: HTMLElement): void {
		const existing = panel.querySelector('.jhua-dn-meta-editor');
		if (existing) { existing.remove(); return; }

		const fm = this.currentData?.frontmatter || {};
		const editor = panel.createDiv({ cls: 'jhua-dn-meta-editor' });

		const fields = [
			{ key: 'StudyMins', label: '📖 学习(min)', value: fm.StudyMins || 0 },
			{ key: 'SportMins', label: '🏃 运动(min)', value: fm.SportMins || 0 },
			{ key: 'PlayMins', label: '🎮 娱乐(min)', value: fm.PlayMins || 0 },
		];

		const inputs: Record<string, HTMLInputElement> = {};

		for (const field of fields) {
			const row = editor.createDiv({ cls: 'jhua-dn-meta-editor-row' });
			row.createEl('label', { text: field.label });
			const input = row.createEl('input', {
				cls: 'jhua-dn-meta-editor-input',
				attr: { type: 'number', min: '0', value: String(field.value) }
			});
			inputs[field.key] = input;
		}

		const btnRow = editor.createDiv({ cls: 'jhua-dn-meta-editor-btns' });
		const saveBtn = btnRow.createEl('button', { text: '保存', cls: 'jhua-dn-meta-save-btn' });
		const cancelBtn = btnRow.createEl('button', { text: '取消', cls: 'jhua-dn-meta-cancel-btn' });

		saveBtn.addEventListener('click', async () => {
			if (!this.currentFile) return;
			try {
				await this.app.fileManager.processFrontMatter(this.currentFile, (fm: any) => {
					fm.StudyMins = parseInt(inputs['StudyMins'].value) || 0;
					fm.SportMins = parseInt(inputs['SportMins'].value) || 0;
					fm.PlayMins = parseInt(inputs['PlayMins'].value) || 0;
				});
				this.currentData!.frontmatter.StudyMins = parseInt(inputs['StudyMins'].value) || 0;
				this.currentData!.frontmatter.SportMins = parseInt(inputs['SportMins'].value) || 0;
				this.currentData!.frontmatter.PlayMins = parseInt(inputs['PlayMins'].value) || 0;
				editor.remove();
				panel.empty();
				this.renderMetaPanel(panel);
				new Notice('✅ 时长已更新');
			} catch (e: any) {
				new Notice(`更新失败: ${e.message || '未知错误'}`);
			}
		});

		cancelBtn.addEventListener('click', () => {
			editor.remove();
		});
	}

	// ==================== Tracking ====================

	/** 渲染 Tracking 事件列表（纯文本列表，无勾选框） */
	private renderTrackingList(container: HTMLElement): void {
		if (!this.currentData) return;

		if (this.currentData.tracking.length === 0) {
			container.createEl('div', { text: '暂无追踪记录，点击标签或下方添加 ✨', cls: 'jhua-dn-empty-hint' });
			return;
		}

		for (const item of this.currentData.tracking) {
			const row = container.createDiv({ cls: 'jhua-dn-tracking-item' });
			// 圆点标记而非 checkbox
			row.createEl('span', { cls: 'jhua-dn-tracking-dot' });
			row.createEl('span', {
				text: item.text,
				cls: 'jhua-dn-tracking-text'
			});
		}
	}

	/** 添加 Tracking 事件（纯列表格式 `- 事件名`，不含勾选框） */
	private async addTrackingItem(text: string): Promise<void> {
		if (!this.currentFile) return;
		try {
			let content = await this.app.vault.read(this.currentFile);
			const lines = content.split('\n');

			let trackingIdx = -1;
			for (let i = 0; i < lines.length; i++) {
				if (/^#\s*🚦\s*Tracking/i.test(lines[i])) {
					trackingIdx = i;
					break;
				}
			}

			if (trackingIdx === -1) return;

			let insertIdx = trackingIdx + 1;
			while (insertIdx < lines.length && lines[insertIdx].trim() === '') {
				insertIdx++;
			}
			let lastListIdx = -1;
			for (let i = insertIdx; i < lines.length; i++) {
				if (/^\s*(- \[[ xX]\]|- )/.test(lines[i])) {
					lastListIdx = i;
				} else if (lines[i].startsWith('#')) {
					break;
				}
			}

			if (lastListIdx >= 0) {
				insertIdx = lastListIdx + 1;
			}

			// 纯列表格式，不使用 checkbox
			lines.splice(insertIdx, 0, `- ${text}`);
			await this.app.vault.modify(this.currentFile, lines.join('\n'));

			this.currentData?.tracking.push({ text, raw: `- ${text}` });
		} catch (e: any) {
			new Notice(`添加事件失败: ${e.message || '未知错误'}`);
		}
	}

	// ==================== Tasks ====================

	private renderTaskList(container: HTMLElement): void {
		if (!this.currentData) return;

		if (this.currentData.tasks.length === 0) {
			container.createEl('div', { text: '暂无待办 🎉', cls: 'jhua-dn-empty-hint' });
			return;
		}

		const pending = this.currentData.tasks.filter(t => !t.completed);
		const completed = this.currentData.tasks.filter(t => t.completed);

		if (pending.length > 0) {
			for (const task of pending) {
				const item = container.createDiv({ cls: 'jhua-dn-task-item' });
				const checkbox = item.createEl('input', {
					type: 'checkbox',
					cls: 'jhua-dn-task-checkbox'
				});
				checkbox.checked = false;
				checkbox.addEventListener('change', async () => {
					await this.toggleTask(task, true);
					task.completed = true;
					container.empty();
					this.renderTaskList(container);
					await refreshModules(this.app, ['daily-tasks', 'todo-list'], this.config);
				});
				item.createEl('span', { text: task.text, cls: 'jhua-dn-task-text' });
			}
		}

		if (completed.length > 0) {
			const completedGroup = container.createDiv({ cls: 'jhua-dn-completed-group' });
			const toggle = completedGroup.createEl('div', {
				text: `✅ 已完成 (${completed.length})`,
				cls: 'jhua-dn-completed-toggle'
			});
			const completedList = completedGroup.createDiv({ cls: 'jhua-dn-completed-items', attr: { style: 'display: none;' } });

			toggle.addEventListener('click', () => {
				const visible = completedList.style.display !== 'none';
				completedList.style.display = visible ? 'none' : 'block';
			});

			for (const task of completed) {
				const item = completedList.createDiv({ cls: 'jhua-dn-task-item jhua-dn-task-completed' });
				const checkbox = item.createEl('input', {
					type: 'checkbox',
					cls: 'jhua-dn-task-checkbox'
				});
				checkbox.checked = true;
				checkbox.addEventListener('change', async () => {
					await this.toggleTask(task, false);
					task.completed = false;
					container.empty();
					this.renderTaskList(container);
					await refreshModules(this.app, ['daily-tasks', 'todo-list'], this.config);
				});
				item.createEl('span', { text: task.text, cls: 'jhua-dn-task-text' });
			}
		}
	}

	private async toggleTask(task: { text: string; completed: boolean; raw: string }, toCompleted: boolean): Promise<void> {
		if (!this.currentFile) return;
		try {
			let content = await this.app.vault.read(this.currentFile);
			const oldCheckbox = task.completed ? '- [x]' : '- [ ]';
			const newCheckbox = toCompleted ? '- [x]' : '- [ ]';

			const lines = content.split('\n');
			for (let i = 0; i < lines.length; i++) {
				const trimmed = lines[i].trimStart();
				if (trimmed.startsWith(`${oldCheckbox} ${task.text}`)) {
					const indent = lines[i].substring(0, lines[i].length - trimmed.length);
					lines[i] = indent + newCheckbox + ' ' + task.text;
					break;
				}
			}
			await this.app.vault.modify(this.currentFile, lines.join('\n'));
		} catch (e: any) {
			new Notice(`切换任务失败: ${e.message || '未知错误'}`);
		}
	}

	private async addTask(text: string): Promise<void> {
		if (!this.currentFile) return;
		try {
			let content = await this.app.vault.read(this.currentFile);
			const lines = content.split('\n');

			let tasksIdx = -1;
			for (let i = 0; i < lines.length; i++) {
				if (/^#\s*📖\s*Tasks/i.test(lines[i])) {
					tasksIdx = i;
					break;
				}
			}

			if (tasksIdx === -1) return;

			let insertIdx = tasksIdx + 1;
			while (insertIdx < lines.length && lines[insertIdx].trim() === '') {
				insertIdx++;
			}
			let lastCheckboxIdx = -1;
			for (let i = insertIdx; i < lines.length; i++) {
				if (/^\s*- \[[ xX]\]/.test(lines[i])) {
					lastCheckboxIdx = i;
				} else if (lines[i].startsWith('#')) {
					break;
				}
			}

			if (lastCheckboxIdx >= 0) {
				insertIdx = lastCheckboxIdx + 1;
			}

			lines.splice(insertIdx, 0, `- [ ] ${text}`);
			await this.app.vault.modify(this.currentFile, lines.join('\n'));

			this.currentData?.tasks.push({ text, completed: false, raw: `- [ ] ${text}` });
		} catch (e: any) {
			new Notice(`添加任务失败: ${e.message || '未知错误'}`);
		}
	}

	private async reloadAndRenderTasks(container: HTMLElement): Promise<void> {
		if (!this.currentFile) return;
		const content = await this.app.vault.cachedRead(this.currentFile);
		this.currentData = parseDailyNote(content);
		container.empty();
		this.renderTaskList(container);
	}

	// ==================== Done ====================

	/** 渲染 Done 列表 */
	private renderDoneList(container: HTMLElement): void {
		if (!this.currentData) return;

		if (this.currentData.doneItems.length === 0) {
			container.createEl('div', { text: '暂无完成记录', cls: 'jhua-dn-empty-hint' });
			return;
		}

		for (const item of this.currentData.doneItems) {
			const row = container.createDiv({ cls: 'jhua-dn-done-item' });
			row.createEl('span', { cls: 'jhua-dn-done-dot' });
			row.createEl('span', {
				text: item.text,
				cls: 'jhua-dn-done-text'
			});
		}
	}

	/** 添加 Done 列表项（写入文件 🎖️Done 板块） */
	private async addDoneItem(text: string): Promise<void> {
		if (!this.currentFile) return;
		try {
			let content = await this.app.vault.read(this.currentFile);
			const lines = content.split('\n');

			let doneIdx = -1;
			for (let i = 0; i < lines.length; i++) {
				if (/^#\s*🎖️\s*Done/i.test(lines[i])) {
					doneIdx = i;
					break;
				}
			}

			if (doneIdx === -1) return;

			let insertIdx = doneIdx + 1;
			while (insertIdx < lines.length && lines[insertIdx].trim() === '') {
				insertIdx++;
			}
			let lastListIdx = -1;
			for (let i = insertIdx; i < lines.length; i++) {
				if (/^\s*(- \[[ xX]\]|- )/.test(lines[i])) {
					lastListIdx = i;
				} else if (lines[i].startsWith('#') || lines[i].trim().startsWith('```ad-col4')) {
					break;
				}
			}

			if (lastListIdx >= 0) {
				insertIdx = lastListIdx + 1;
			}

			lines.splice(insertIdx, 0, `- ${text}`);
			await this.app.vault.modify(this.currentFile, lines.join('\n'));

			this.currentData?.doneItems.push({ text, raw: `- ${text}` });
		} catch (e: any) {
			new Notice(`添加完成事项失败: ${e.message || '未知错误'}`);
		}
	}

	private async reloadAndRenderDone(container: HTMLElement): Promise<void> {
		if (!this.currentFile) return;
		const content = await this.app.vault.cachedRead(this.currentFile);
		this.currentData = parseDailyNote(content);
		container.empty();
		this.renderDoneList(container);
	}

	// ==================== 通用工具 ====================

	private autoResizeTextarea(el: HTMLTextAreaElement): void {
		el.style.height = 'auto';
		const newHeight = Math.max(80, Math.min(600, el.scrollHeight));
		el.style.height = newHeight + 'px';
	}

	private scheduleSave(section: string, value: string): void {
		if (this.saveTimer) clearTimeout(this.saveTimer);
		this.saveTimer = setTimeout(async () => {
			await this.saveSection(section, value);
		}, 1500);
	}

	private async saveSection(section: string, value: string): Promise<void> {
		if (!this.currentFile) return;
		try {
			let content = await this.app.vault.read(this.currentFile);
			const lines = content.split('\n');

			let sectionIdx = -1;
			for (let i = 0; i < lines.length; i++) {
				if (section === 'Dairy' && /^#\s*📒\s*Dairy/i.test(lines[i])) {
					sectionIdx = i;
					break;
				}
				if (section === 'Tracking' && /^#\s*🚦\s*Tracking/i.test(lines[i])) {
					sectionIdx = i;
					break;
				}
				if (section === 'Done' && /^#\s*🎖️\s*Done/i.test(lines[i])) {
					sectionIdx = i;
					break;
				}
			}

			if (sectionIdx === -1) return;

			let nextSectionIdx = lines.length;
			for (let i = sectionIdx + 1; i < lines.length; i++) {
				if (/^#\s*[🚦📒📖🎖️🖼️]/.test(lines[i]) || lines[i].trim().startsWith('```ad-col4')) {
					nextSectionIdx = i;
					break;
				}
			}

			const newLines = [
				lines[sectionIdx],
				'',
				...value.split('\n'),
				'',
			];

			lines.splice(sectionIdx + 1, nextSectionIdx - sectionIdx - 1, ...newLines);
			await this.app.vault.modify(this.currentFile, lines.join('\n'));
		} catch (e) {
			console.error('保存日记板块失败:', e);
		}
	}

	update?(config: Record<string, any>): void {
		this.render(this.app, config, this.container);
	}
}
