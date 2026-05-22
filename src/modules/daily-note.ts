import { App, Notice, TFile } from 'obsidian';
import { HPageModule } from '../types';
import { refreshModules } from './index';

// ==================== 日记解析与渲染 ====================

/** 日记各板块的解析结构 */
interface DailyNoteData {
	filePath: string;
	frontmatter: Record<string, any>;
	tracking: { text: string; raw: string }[];  // 🚦Tracking 事件列表（纯列表，无勾选框）
	diary: string;      // 📒Diary 板块内容
	tasks: { text: string; completed: boolean; raw: string }[];    // 📖Tasks
	doneItems: { text: string; raw: string }[];  // 🎖️Done 列表项
	photos: string;     // 照片瀑布流 code block 内容
	rawContent: string; // 原始完整内容
}

/** 板块标题定义（与日记模板一致） */
const SECTION_HEADERS = [
	{ emoji: '🚦', key: 'Tracking', label: '追踪' },
	{ emoji: '📒', key: 'Diary', label: '日记' },
	{ emoji: '📖', key: 'Tasks', label: '待办' },
	{ emoji: '🎖️', key: 'Done', label: '已完成' },
];

// ==================== 常用 Tracking 标签持久化（含颜色） ====================

const TRACKING_TAGS_KEY = 'jhua-dn-tracking-tags';
const SHOW_CALENDAR_KEY = 'jhua-dn-show-calendar';

/** 预设颜色盘 */
const TAG_COLOR_PALETTE = [
	{ name: '珊瑚红', value: '#ef4444' },
	{ name: '橙色', value: '#f97316' },
	{ name: '琥珀', value: '#f59e0b' },
	{ name: '翠绿', value: '#22c55e' },
	{ name: '天蓝', value: '#3b82f6' },
	{ name: '紫罗兰', value: '#8b5cf6' },
	{ name: '粉色', value: '#ec4899' },
	{ name: '青色', value: '#06b6d4' },
	{ name: '靛蓝', value: '#6366f1' },
	{ name: '石灰', value: '#84cc16' },
];

/** 标签结构（含颜色） */
interface TrackingTag {
	name: string;
	color: string;
}

function loadTrackingTags(): TrackingTag[] {
	try {
		const raw = localStorage.getItem(TRACKING_TAGS_KEY);
		if (!raw) return getDefaultTags();
		const parsed = JSON.parse(raw);
		// 兼容旧版：如果是纯字符串数组，迁移为新格式
		if (parsed.length > 0 && typeof parsed[0] === 'string') {
			const migrated = (parsed as string[]).map((name: string, i: number) => ({
				name,
				color: TAG_COLOR_PALETTE[i % TAG_COLOR_PALETTE.length].value,
			}));
			saveTrackingTags(migrated);
			return migrated;
		}
		return parsed as TrackingTag[];
	} catch {
		return getDefaultTags();
	}
}

function getDefaultTags(): TrackingTag[] {
	return ['上班', '买菜', '午觉', '蛐蛐'].map((name, i) => ({
		name,
		color: TAG_COLOR_PALETTE[i % TAG_COLOR_PALETTE.length].value,
	}));
}

function saveTrackingTags(tags: TrackingTag[]): void {
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
		diary: '',
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
			// 匹配纯列表项: - 事件（修复：用 listMatch[2] 获取正文，而非 listMatch[1] 的空白）
			const listMatch = line.match(/^(\s*)- (.+)$/);
			if (listMatch && listMatch[2].trim()) {
				data.tracking.push({
					text: listMatch[2].trim(),
					raw: line,
				});
				continue;
			}
		}
	}

	// 提取 Diary 内容
	if (sectionPositions['Diary'] !== undefined) {
		const start = sectionPositions['Diary'] + 1;
		const end = findNextSectionEnd(lines, start, sectionPositions);
		const diaryLines = lines.slice(start, end);
		data.diary = diaryLines.join('\n').trim();
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

	// 提取 Done 内容（纯列表项，修复：用 listMatch[2] 获取正文）
	if (sectionPositions['Done'] !== undefined) {
		const start = sectionPositions['Done'] + 1;
		const end = Math.min(
			photoStart >= 0 ? photoStart : lines.length,
			lines.length
		);
		let doneEnd = end;
		for (let i = start; i < end; i++) {
			if (/^#\s*[🚦📒📖🎖️🖼️]/.test(lines[i]) || lines[i].trim().startsWith('```ad-col4')) {
				doneEnd = i;
				break;
			}
		}
		for (let i = start; i < doneEnd; i++) {
			const line = lines[i];
			// 纯列表项: - 完成项目A（修复：listMatch[2] 才是正文）
			const listMatch = line.match(/^(\s*)- (.+)$/);
			if (listMatch && listMatch[2].trim()) {
				data.doneItems.push({
					text: listMatch[2].trim(),
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

# 📒Diary

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

// ==================== 富文本编辑 Markdown ↔ HTML 转换 ====================

/** 将 Markdown 内联语法转换为 HTML（用于 contenteditable 显示） */
function markdownToHtml(md: string): string {
	const lines = md.split('\n');
	return lines.map(line => {
		// 分割线
		if (/^---+$/.test(line.trim())) return '<hr class="jhua-dn-hr">';
		if (/^\*\*\*+$/.test(line.trim())) return '<hr class="jhua-dn-hr">';
		// 标题（## ~ ####）
		const headingMatch = line.match(/^(#{2,4})\s+(.+)$/);
		if (headingMatch) {
			const level = headingMatch[1].length;
			return `<h${level} class="jhua-dn-heading">${processInlineMarkdown(headingMatch[2])}</h${level}>`;
		}
		// 引用块
		const quoteMatch = line.match(/^>\s?(.*)$/);
		if (quoteMatch) return `<blockquote class="jhua-dn-blockquote">${processInlineMarkdown(quoteMatch[1])}</blockquote>`;
		// 空行
		if (line.trim() === '') return '<br>';
		// 普通段落
		return `<div>${processInlineMarkdown(line)}</div>`;
	}).join('');
}

/** 处理内联 Markdown 语法（加粗、斜体、高亮、行内代码、字体颜色） */
function processInlineMarkdown(text: string): string {
	// 高亮 ==text== （默认黄色）
	text = text.replace(/==([^=]+)==/g, '<mark class="jhua-dn-highlight" style="background:rgba(250, 204, 21, 0.35)" data-hl-color="default">$1</mark>');
	// 带颜色高亮 <mark style="background:...">
	// （从 .md 中读取的带 style 的 mark 会被 DOMParser 保留，这里只处理 ==text== 简写）
	// 字体颜色 <span style="color:..."> （从 .md 中读取时保留）
	// 加粗 **text** 或 __text__
	text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
	text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');
	// 斜体 *text* 或 _text_（排除已匹配的加粗）
	text = text.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
	text = text.replace(/(?<!_)_([^_]+)_(?!_)/g, '<em>$1</em>');
	// 删除线 ~~text~~
	text = text.replace(/~~([^~]+)~~/g, '<del>$1</del>');
	// 行内代码 `code`
	text = text.replace(/`([^`]+)`/g, '<code class="jhua-dn-inline-code">$1</code>');
	return text;
}

/** 将 contenteditable 的 HTML 内容转换回 Markdown（用于保存到 .md 文件） */
function htmlToMarkdown(html: string): string {
	// 创建临时 DOM 解析
	const doc = new DOMParser().parseFromString(html, 'text/html');
	const body = doc.body;

	function convertNode(node: Node): string {
		if (node.nodeType === Node.TEXT_NODE) {
			return node.textContent || '';
		}
		if (node.nodeType !== Node.ELEMENT_NODE) return '';

		const el = node as HTMLElement;
		const tag = el.tagName.toLowerCase();
		const inner = Array.from(el.childNodes).map(convertNode).join('');

		switch (tag) {
			case 'strong': case 'b': return `**${inner}**`;
			case 'em': case 'i': return `*${inner}*`;
			case 'del': case 's': return `~~${inner}~~`;
			case 'mark': {
				// 带自定义颜色的高亮：保留为 HTML 标签
				const hlColor = el.getAttribute('data-hl-color');
				const bgStyle = el.getAttribute('style');
				if (hlColor && hlColor !== 'default') {
					return `<mark class="jhua-dn-highlight" style="background:${bgStyle?.match(/background:\s*([^;]+)/)?.[1] || hlColor}" data-hl-color="${hlColor}">${inner}</mark>`;
				}
				// 默认黄色高亮→==语法==
				return `==${inner}==`;
			}
			case 'span': {
				// 带字体颜色的 span：保留为 HTML 标签
				if (el.classList.contains('jhua-dn-forecolor')) {
					const fc = el.getAttribute('data-color') || el.style.color;
					return `<span style="color:${fc}">${inner}</span>`;
				}
				return inner;
			}
			case 'code': return `\`${inner}\``;
			case 'h2': return `## ${inner.trim()}`;
			case 'h3': return `### ${inner.trim()}`;
			case 'h4': return `#### ${inner.trim()}`;
			case 'blockquote': return `> ${inner.trim()}`;
			case 'hr': return '---';
			case 'p': return inner;
			case 'br': return '\n';
			case 'div': return inner + '\n';
			default: return inner;
		}
	}

	let result = Array.from(body.childNodes).map(convertNode).join('');
	// 清理多余空行：连续3个以上换行压缩为2个
	result = result.replace(/\n{3,}/g, '\n\n');
	return result.trim();
}

// ==================== DailyNote 模块 ====================

export class DailyNoteModule implements HPageModule {
	id = 'daily-note';
	name = '今日日记';
	defaultConfig = {
		date: '',
		showTracking: true,
		showDiary: true,
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
	private selectionChangeHandler: ((e: Event) => void) | null = null;

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

			// 标签管理浮层（absolute 定位，挂在 trackingSection 上避免被 code block 拦截事件）
			let tagMgrOpen = false;
			const tagMgrPanel = trackingSection.createDiv({ cls: 'jhua-dn-tag-mgr-popup', attr: { style: 'display: none;' } });
			// 关键：阻止浮层内所有事件冒泡，避免 Obsidian code block 处理器拦截
			tagMgrPanel.addEventListener('click', (e) => e.stopPropagation());
			tagMgrPanel.addEventListener('mousedown', (e) => e.stopPropagation());
			tagMgrPanel.addEventListener('mouseup', (e) => e.stopPropagation());
			tagMgrPanel.addEventListener('keydown', (e) => e.stopPropagation());
			tagMgrPanel.addEventListener('keypress', (e) => e.stopPropagation());
			tagMgrPanel.addEventListener('input', (e) => e.stopPropagation());

			tagMgrBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				e.preventDefault();
				tagMgrOpen = !tagMgrOpen;
				tagMgrPanel.style.display = tagMgrOpen ? 'block' : 'none';
				if (tagMgrOpen) {
					this.renderTagManager(tagMgrPanel, trackingBody);
				}
			});

			// 常用标签快捷区域（带颜色）
			const tags = loadTrackingTags();
			const tagBar = trackingBody.createDiv({ cls: 'jhua-dn-tracking-tags' });
			if (tags.length > 0) {
				for (const tag of tags) {
					const tagEl = tagBar.createEl('span', {
						text: tag.name,
						cls: 'jhua-dn-tracking-tag'
					});
					tagEl.style.setProperty('--tag-color', tag.color);
					tagEl.style.borderColor = tag.color;
					tagEl.style.color = tag.color;
					// 点击标签直接添加到今日 Tracking
					tagEl.addEventListener('click', async () => {
						await this.addTrackingItem(tag.name);
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

		// ===== 📒 Diary 板块 =====
		if (config.showDiary) {
			const diarySection = content.createDiv({ cls: 'jhua-dn-section' });
			diarySection.style.position = 'relative'; // 工具栏定位需要
			const diaryHeader = diarySection.createDiv({ cls: 'jhua-dn-section-header' });
			diaryHeader.createEl('span', { text: '📒 Diary', cls: 'jhua-dn-section-title' });
			diaryHeader.createEl('span', { text: '直接编辑，自动保存', cls: 'jhua-dn-section-hint' });

			const diaryBody = diarySection.createDiv({ cls: 'jhua-dn-section-body jhua-dn-diary-body' });

			// 富文本编辑器工具栏
			const toolbar = diaryBody.createDiv({ cls: 'jhua-dn-toolbar' });
			const toolbarActions: { icon: string; title: string; action: string }[] = [
				{ icon: 'B', title: '加粗 (Ctrl+B)', action: 'bold' },
				{ icon: 'I', title: '斜体 (Ctrl+I)', action: 'italic' },
				{ icon: 'S', title: '删除线', action: 'strikethrough' },
				{ icon: '🖍', title: '高亮（点击选色）', action: 'highlight' },
				{ icon: 'A', title: '字体颜色（点击选色）', action: 'forecolor' },
				{ icon: '—', title: '分割线', action: 'hr' },
				{ icon: 'H2', title: '二级标题', action: 'h2' },
				{ icon: 'H3', title: '三级标题', action: 'h3' },
				{ icon: '❝', title: '引用块', action: 'blockquote' },
				{ icon: '</>', title: '行内代码', action: 'code' },
			];
			for (const item of toolbarActions) {
				const btn = toolbar.createEl('button', {
					cls: 'jhua-dn-toolbar-btn',
					attr: { title: item.title, 'data-action': item.action }
				});
				btn.createEl('span', { text: item.icon, cls: 'jhua-dn-toolbar-btn-icon' });
				// 字体颜色和高亮按钮下方加色条指示
				if (item.action === 'forecolor') {
					btn.classList.add('jhua-dn-toolbar-btn-color');
					const bar = btn.createEl('span', { cls: 'jhua-dn-toolbar-color-bar' });
					bar.style.backgroundColor = '#ef4444';
				}
				if (item.action === 'highlight') {
					btn.classList.add('jhua-dn-toolbar-btn-color');
					const bar = btn.createEl('span', { cls: 'jhua-dn-toolbar-color-bar' });
					bar.style.backgroundColor = 'rgba(250, 204, 21, 0.5)';
				}
				btn.addEventListener('mousedown', (e) => {
					e.preventDefault(); // 阻止失焦
					e.stopPropagation();
				});
				btn.addEventListener('click', (e) => {
					e.preventDefault();
					e.stopPropagation();
					// 高亮和字体颜色：弹出颜色面板
					if (item.action === 'highlight' || item.action === 'forecolor') {
						this.showToolbarColorPicker(btn, item.action, editorEl);
					} else {
						this.executeToolbarAction(item.action, editorEl);
					}
				});
			}

			// contenteditable 富文本编辑区
			const editorEl = diaryBody.createDiv({
				cls: 'jhua-dn-diary-editor',
				attr: {
					contenteditable: 'true',
					'data-placeholder': '今天发生了什么？记录下来吧...',
				}
			});
			editorEl.innerHTML = this.currentData.diary.trim()
				? markdownToHtml(this.currentData.diary)
				: '<p><br></p>';

			// 编辑时自动显示工具栏，失焦时隐藏
			toolbar.style.display = 'none';

			editorEl.addEventListener('focus', () => {
				toolbar.style.display = 'flex';
				// 移除占位提示
				const placeholder = diaryBody.querySelector('.jhua-dn-placeholder');
				if (placeholder) placeholder.remove();
			});

			editorEl.addEventListener('blur', () => {
				// 延迟隐藏，避免点击工具栏时闪烁
				setTimeout(() => {
					if (!toolbar.matches(':hover') && !toolbar.querySelector('.jhua-dn-toolbar-btn:active')) {
						toolbar.style.display = 'none';
					}
				}, 200);
			});

			// 跟踪选区变化，更新工具栏按钮激活状态
			if (this.selectionChangeHandler) {
				document.removeEventListener('selectionchange', this.selectionChangeHandler);
			}
			this.selectionChangeHandler = () => {
				const sel = window.getSelection();
				if (!sel || sel.rangeCount === 0) return;
				// 检查选区是否在编辑器内
				const range = sel.getRangeAt(0);
				if (!editorEl.contains(range.commonAncestorContainer)) return;
				// 更新按钮激活状态
				toolbar.querySelectorAll('.jhua-dn-toolbar-btn').forEach(btn => {
					const action = (btn as HTMLElement).dataset.action || '';
					let active = false;
					switch (action) {
						case 'bold': active = document.queryCommandState('bold'); break;
						case 'italic': active = document.queryCommandState('italic'); break;
						case 'strikethrough': active = document.queryCommandState('strikeThrough'); break;
					case 'highlight': active = !!this.getClosestTag(range.commonAncestorContainer, 'MARK'); break;
					case 'forecolor': active = !!(this.getClosestTag(range.commonAncestorContainer, 'SPAN')?.classList.contains('jhua-dn-forecolor')); break;
					case 'code': active = !!this.getClosestTag(range.commonAncestorContainer, 'CODE'); break;
					case 'h2': active = !!this.getClosestTag(range.commonAncestorContainer, 'H2'); break;
					case 'h3': active = !!this.getClosestTag(range.commonAncestorContainer, 'H3'); break;
					case 'blockquote': active = !!this.getClosestTag(range.commonAncestorContainer, 'BLOCKQUOTE'); break;
					}
					btn.classList.toggle('jhua-dn-toolbar-btn-active', active);
				});
			};
			document.addEventListener('selectionchange', this.selectionChangeHandler);

			// 输入事件：防抖保存
			editorEl.addEventListener('input', () => {
				const md = htmlToMarkdown(editorEl.innerHTML);
				this.scheduleSave('Diary', md);
			});

			// 快捷键支持
			editorEl.addEventListener('keydown', (e) => {
				if (e.ctrlKey || e.metaKey) {
					if (e.key === 'b') { e.preventDefault(); this.executeToolbarAction('bold', editorEl); }
					if (e.key === 'i') { e.preventDefault(); this.executeToolbarAction('italic', editorEl); }
				}
			});

			if (!this.currentData.diary.trim()) {
				diaryBody.createEl('div', {
					text: '✍️ 点击上方区域开始写日记...',
					cls: 'jhua-dn-placeholder'
				});
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
			const addTaskInput = addTaskRow.createEl('input', {
				cls: 'jhua-dn-add-task-input',
				attr: { placeholder: '添加待办，回车确认...', type: 'text' }
			});
			addTaskInput.addEventListener('keydown', async (e) => {
				if (e.key === 'Enter' && addTaskInput.value.trim()) {
					await this.addTask(addTaskInput.value.trim());
					addTaskInput.value = '';
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
					// 修复：使用 vault.read 而非 cachedRead 确保读到最新内容
					await this.reloadAndRenderDone(doneList);
				}
			});
		}

		return this.container;
	}

	// ==================== 标签管理器（含颜色配置） ====================

	private renderTagManager(panel: HTMLElement, trackingBody: HTMLElement): void {
		panel.empty();
		const tags = loadTrackingTags();

		const title = panel.createDiv({ cls: 'jhua-dn-tag-mgr-title' });
		title.createEl('span', { text: '常用标签管理' });

		// 关闭按钮
		const closeBtn = title.createEl('button', {
			text: '✕',
			cls: 'jhua-dn-tag-mgr-close',
			attr: { title: '关闭' }
		});
		closeBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			e.preventDefault();
			panel.style.display = 'none';
		});

		const list = panel.createDiv({ cls: 'jhua-dn-tag-mgr-list' });
		for (let i = 0; i < tags.length; i++) {
			const row = list.createDiv({ cls: 'jhua-dn-tag-mgr-row' });

			// 颜色指示点
			const colorDot = row.createEl('span', { cls: 'jhua-dn-tag-mgr-color-dot' });
			colorDot.style.backgroundColor = tags[i].color;
			// 点击颜色点弹出颜色选择
			colorDot.addEventListener('mousedown', (e) => e.stopPropagation());
			colorDot.addEventListener('click', (e) => {
				e.stopPropagation();
				e.preventDefault();
				this.showColorPicker(row, tags[i].color, (newColor) => {
					tags[i].color = newColor;
					saveTrackingTags(tags);
					colorDot.style.backgroundColor = newColor;
					this.refreshTagBar(trackingBody);
				});
			});

			row.createEl('span', { text: tags[i].name, cls: 'jhua-dn-tag-mgr-label' });
			const delBtn = row.createEl('button', {
				text: '✕',
				cls: 'jhua-dn-tag-mgr-del',
				attr: { title: '删除此标签' }
			});
			const idx = i;
			delBtn.addEventListener('mousedown', (e) => e.stopPropagation());
			delBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				e.preventDefault();
				tags.splice(idx, 1);
				saveTrackingTags(tags);
				this.renderTagManager(panel, trackingBody);
				this.refreshTagBar(trackingBody);
			});
		}

		// 添加新标签
		const addRow = panel.createDiv({ cls: 'jhua-dn-tag-mgr-add' });
		const addInput = addRow.createEl('input', {
			cls: 'jhua-dn-tag-mgr-add-input',
			attr: { placeholder: '新标签名，回车添加...', type: 'text' }
		});
		// 必须阻止 mousedown 冒泡，否则 input 无法获得焦点
		addInput.addEventListener('mousedown', (e) => e.stopPropagation());
		addInput.addEventListener('keydown', (e) => {
			e.stopPropagation();
			if (e.key === 'Enter' && addInput.value.trim()) {
				e.preventDefault();
				const newTag = addInput.value.trim();
				if (!tags.some(t => t.name === newTag)) {
					// 自动分配颜色（轮盘取色）
					const colorIdx = tags.length % TAG_COLOR_PALETTE.length;
					tags.push({ name: newTag, color: TAG_COLOR_PALETTE[colorIdx].value });
					saveTrackingTags(tags);
					this.renderTagManager(panel, trackingBody);
					this.refreshTagBar(trackingBody);
				} else {
					new Notice('该标签已存在');
				}
			}
		});
	}

	/** 颜色选择器（内联色盘） */
	private showColorPicker(parentRow: HTMLElement, currentColor: string, onPick: (color: string) => void): void {
		// 移除已存在的色盘
		const existing = parentRow.querySelector('.jhua-dn-color-picker');
		if (existing) { existing.remove(); return; }

		const picker = parentRow.createDiv({ cls: 'jhua-dn-color-picker' });
		picker.addEventListener('mousedown', (e) => e.stopPropagation());
		picker.addEventListener('click', (e) => e.stopPropagation());

		for (const c of TAG_COLOR_PALETTE) {
			const swatch = picker.createEl('span', {
				cls: 'jhua-dn-color-swatch' + (c.value === currentColor ? ' jhua-dn-color-swatch-active' : ''),
			});
			swatch.style.backgroundColor = c.value;
			swatch.title = c.name;
			swatch.addEventListener('click', (e) => {
				e.stopPropagation();
				e.preventDefault();
				onPick(c.value);
				picker.remove();
			});
		}

		// 点击其他地方关闭
		const closePicker = (e: MouseEvent) => {
			if (!picker.contains(e.target as Node)) {
				picker.remove();
				document.removeEventListener('mousedown', closePicker);
			}
		};
		setTimeout(() => document.addEventListener('mousedown', closePicker), 50);
	}

	/** 刷新标签栏 */
	private refreshTagBar(trackingBody: HTMLElement): void {
		const tagBar = trackingBody.querySelector('.jhua-dn-tracking-tags') as HTMLElement;
		if (!tagBar) return;
		tagBar.empty();
		const tags = loadTrackingTags();
		for (const tag of tags) {
			const tagEl = tagBar.createEl('span', {
				text: tag.name,
				cls: 'jhua-dn-tracking-tag'
			});
			tagEl.style.setProperty('--tag-color', tag.color);
			tagEl.style.borderColor = tag.color;
			tagEl.style.color = tag.color;
			tagEl.addEventListener('click', async () => {
				await this.addTrackingItem(tag.name);
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

		const tags = loadTrackingTags();
		for (const item of this.currentData.tracking) {
			const row = container.createDiv({ cls: 'jhua-dn-tracking-item jhua-dn-item-row' });
			// 查找匹配的标签颜色
			const matchedTag = tags.find(t => t.name === item.text);
			const dot = row.createEl('span', { cls: 'jhua-dn-tracking-dot' });
			if (matchedTag) {
				dot.style.backgroundColor = matchedTag.color;
			}
			row.createEl('span', {
				text: item.text,
				cls: 'jhua-dn-tracking-text'
			});
			// 悬浮删除按钮
			const delBtn = row.createEl('span', { text: '✕', cls: 'jhua-dn-item-del', attr: { title: '删除' } });
			delBtn.addEventListener('click', async (e) => {
				e.stopPropagation();
				await this.removeLineFromSection('Tracking', item.raw);
				container.empty();
				this.renderTrackingList(container);
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
				const item = container.createDiv({ cls: 'jhua-dn-task-item jhua-dn-item-row' });
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
				// 悬浮删除按钮
				const delBtn = item.createEl('span', { text: '✕', cls: 'jhua-dn-item-del', attr: { title: '删除' } });
				delBtn.addEventListener('click', async (e) => {
					e.stopPropagation();
					await this.removeLineFromSection('Tasks', task.raw);
					container.empty();
					this.renderTaskList(container);
					await refreshModules(this.app, ['daily-tasks', 'todo-list'], this.config);
				});
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
				const item = completedList.createDiv({ cls: 'jhua-dn-task-item jhua-dn-task-completed jhua-dn-item-row' });
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
				// 悬浮删除按钮
				const delBtn = item.createEl('span', { text: '✕', cls: 'jhua-dn-item-del', attr: { title: '删除' } });
				delBtn.addEventListener('click', async (e) => {
					e.stopPropagation();
					await this.removeLineFromSection('Tasks', task.raw);
					container.empty();
					this.renderTaskList(container);
					await refreshModules(this.app, ['daily-tasks', 'todo-list'], this.config);
				});
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
		const content = await this.app.vault.read(this.currentFile);
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
			const row = container.createDiv({ cls: 'jhua-dn-done-item jhua-dn-item-row' });
			row.createEl('span', { cls: 'jhua-dn-done-dot' });
			row.createEl('span', {
				text: item.text,
				cls: 'jhua-dn-done-text'
			});
			// 悬浮删除按钮
			const delBtn = row.createEl('span', { text: '✕', cls: 'jhua-dn-item-del', attr: { title: '删除' } });
			delBtn.addEventListener('click', async (e) => {
				e.stopPropagation();
				await this.removeLineFromSection('Done', item.raw);
				container.empty();
				this.renderDoneList(container);
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
		// 修复：使用 vault.read 而非 cachedRead，确保读到最新写入的内容
		const content = await this.app.vault.read(this.currentFile);
		this.currentData = parseDailyNote(content);
		container.empty();
		this.renderDoneList(container);
	}

	// ==================== 通用工具 ====================

	/** 从指定板块删除一行（按 raw 原文精确匹配） */
	private async removeLineFromSection(section: string, rawLine: string): Promise<void> {
		if (!this.currentFile) return;
		try {
			let content = await this.app.vault.read(this.currentFile);
			const lines = content.split('\n');

			// 找到板块起始
			let sectionIdx = -1;
			for (let i = 0; i < lines.length; i++) {
				if (section === 'Tracking' && /^#\s*🚦\s*Tracking/i.test(lines[i])) { sectionIdx = i; break; }
				if (section === 'Tasks' && /^#\s*📖\s*Tasks/i.test(lines[i])) { sectionIdx = i; break; }
				if (section === 'Done' && /^#\s*🎖️\s*Done/i.test(lines[i])) { sectionIdx = i; break; }
			}
			if (sectionIdx === -1) return;

			// 找到下一板块起始
			let nextSectionIdx = lines.length;
			for (let i = sectionIdx + 1; i < lines.length; i++) {
				if (/^#\s*[🚦📒📖🎖️🖼️]/.test(lines[i]) || lines[i].trim().startsWith('```ad-col4')) {
					nextSectionIdx = i;
					break;
				}
			}

			// 在板块内查找匹配行并删除
			for (let i = sectionIdx + 1; i < nextSectionIdx; i++) {
				if (lines[i] === rawLine) {
					lines.splice(i, 1);
					await this.app.vault.modify(this.currentFile, lines.join('\n'));
					// 同步更新内存数据
					const freshContent = await this.app.vault.read(this.currentFile);
					this.currentData = parseDailyNote(freshContent);
					return;
				}
			}
		} catch (e) {
			console.error('删除行失败:', e);
		}
	}

	/** 辅助：从节点向上查找最近的指定标签 */
	private getClosestTag(node: Node, tagName: string): HTMLElement | null {
		let current = node instanceof HTMLElement ? node : node.parentElement;
		while (current) {
			if (current.tagName === tagName) return current;
			if (current === this.container) return null;
			current = current.parentElement;
		}
		return null;
	}

	/** 工具栏颜色选择面板（高亮/字体颜色） */
	private showToolbarColorPicker(btn: HTMLElement, action: string, editor: HTMLElement): void {
		// 移除已存在的面板
		const existing = btn.parentElement?.querySelector('.jhua-dn-toolbar-color-panel');
		if (existing) { existing.remove(); return; }

		const panel = btn.parentElement!.createDiv({ cls: 'jhua-dn-toolbar-color-panel' });
		panel.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
		panel.addEventListener('click', (e) => e.stopPropagation());

		// 高亮颜色预设（含透明度，适合做背景）
		const highlightColors = [
			{ name: '默认黄', value: 'rgba(250, 204, 21, 0.35)' },
			{ name: '珊瑚红', value: 'rgba(239, 68, 68, 0.25)' },
			{ name: '橙色', value: 'rgba(249, 115, 22, 0.25)' },
			{ name: '翠绿', value: 'rgba(34, 197, 94, 0.25)' },
			{ name: '天蓝', value: 'rgba(59, 130, 246, 0.25)' },
			{ name: '紫罗兰', value: 'rgba(139, 92, 246, 0.25)' },
			{ name: '粉色', value: 'rgba(236, 72, 153, 0.25)' },
			{ name: '青色', value: 'rgba(6, 182, 212, 0.25)' },
		];

		// 字体颜色预设
		const foreColors = [
			{ name: '珊瑚红', value: '#ef4444' },
			{ name: '橙色', value: '#f97316' },
			{ name: '琥珀', value: '#f59e0b' },
			{ name: '翠绿', value: '#22c55e' },
			{ name: '天蓝', value: '#3b82f6' },
			{ name: '紫罗兰', value: '#8b5cf6' },
			{ name: '粉色', value: '#ec4899' },
			{ name: '青色', value: '#06b6d4' },
		];

		const colors = action === 'highlight' ? highlightColors : foreColors;

		for (const c of colors) {
			const swatch = panel.createEl('span', {
				cls: 'jhua-dn-toolbar-color-swatch',
				attr: { title: c.name },
			});
			swatch.style.backgroundColor = c.value;
			// 字体颜色色块内加 A 字辅助辨识
			if (action === 'forecolor') {
				swatch.createEl('span', { text: 'A', cls: 'jhua-dn-toolbar-color-swatch-label' });
			}
			swatch.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
			swatch.addEventListener('click', (e) => {
				e.stopPropagation();
				e.preventDefault();
				this.executeToolbarAction(action, editor, c.value);
				// 更新按钮色条
				const bar = btn.querySelector('.jhua-dn-toolbar-color-bar') as HTMLElement;
				if (bar) bar.style.backgroundColor = c.value;
				panel.remove();
			});
		}

		// 清除颜色按钮
		const clearBtn = panel.createEl('button', {
			cls: 'jhua-dn-toolbar-color-clear',
			text: '✕ 清除',
			attr: { title: '清除颜色' },
		});
		clearBtn.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
		clearBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			e.preventDefault();
			this.executeToolbarAction(action === 'highlight' ? 'highlight-clear' : 'forecolor-clear', editor);
			panel.remove();
		});

		// 点击外部关闭
		const closePanel = (e: MouseEvent) => {
			if (!panel.contains(e.target as Node) && e.target !== btn) {
				panel.remove();
				document.removeEventListener('mousedown', closePanel);
			}
		};
		setTimeout(() => document.addEventListener('mousedown', closePanel), 50);
	}

	/** 执行工具栏格式化操作（即时生效） */
	private executeToolbarAction(action: string, editor: HTMLElement, color?: string): void {
		editor.focus(); // 确保编辑器有焦点

		switch (action) {
			case 'bold':
				document.execCommand('bold');
				break;
			case 'italic':
				document.execCommand('italic');
				break;
			case 'strikethrough':
				document.execCommand('strikeThrough');
				break;
			case 'forecolor': {
				const sel = window.getSelection();
				if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
					const range = sel.getRangeAt(0);
					const span = document.createElement('span');
					span.style.color = color || '#ef4444';
					span.className = 'jhua-dn-forecolor';
					span.setAttribute('data-color', color || '#ef4444');
					range.surroundContents(span);
				}
				break;
			}
			case 'forecolor-clear': {
				const sel2 = window.getSelection();
				if (sel2 && sel2.rangeCount > 0) {
					const range2 = sel2.getRangeAt(0);
					const span2 = this.getClosestTag(range2.commonAncestorContainer, 'SPAN');
					if (span2 && span2.classList.contains('jhua-dn-forecolor')) {
						const parent = span2.parentNode;
						while (span2.firstChild) parent?.insertBefore(span2.firstChild, span2);
						parent?.removeChild(span2);
					}
				}
				break;
			}
			case 'highlight': {
				const sel3 = window.getSelection();
				if (sel3 && sel3.rangeCount > 0 && !sel3.isCollapsed) {
					const range3 = sel3.getRangeAt(0);
					const existingMark = this.getClosestTag(range3.commonAncestorContainer, 'MARK');
					if (existingMark) {
						// 已高亮→更新颜色
						existingMark.style.background = color || 'rgba(250, 204, 21, 0.35)';
						existingMark.setAttribute('data-hl-color', color || 'default');
					} else {
						const mark = document.createElement('mark');
						mark.className = 'jhua-dn-highlight';
						mark.style.background = color || 'rgba(250, 204, 21, 0.35)';
						mark.setAttribute('data-hl-color', color || 'default');
						range3.surroundContents(mark);
					}
				}
				break;
			}
			case 'highlight-clear': {
				const sel4 = window.getSelection();
				if (sel4 && sel4.rangeCount > 0) {
					const range4 = sel4.getRangeAt(0);
					const existingMark2 = this.getClosestTag(range4.commonAncestorContainer, 'MARK');
					if (existingMark2) {
						const parent2 = existingMark2.parentNode;
						while (existingMark2.firstChild) parent2?.insertBefore(existingMark2.firstChild, existingMark2);
						parent2?.removeChild(existingMark2);
					}
				}
				break;
			}
			case 'hr':
				document.execCommand('insertHTML', false, '<hr class="jhua-dn-hr"><p><br></p>');
				break;
			case 'h2':
				document.execCommand('formatBlock', false, '<h2>');
				// 添加类名
				this.addClassToCurrentBlock(editor, 'h2', 'jhua-dn-heading');
				break;
			case 'h3':
				document.execCommand('formatBlock', false, '<h3>');
				this.addClassToCurrentBlock(editor, 'h3', 'jhua-dn-heading');
				break;
			case 'blockquote':
				document.execCommand('formatBlock', false, '<blockquote>');
				this.addClassToCurrentBlock(editor, 'blockquote', 'jhua-dn-blockquote');
				break;
			case 'code': {
				const sel = window.getSelection();
				if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
					const range = sel.getRangeAt(0);
					const code = document.createElement('code');
					code.className = 'jhua-dn-inline-code';
					range.surroundContents(code);
				}
				break;
			}
		}

		// 触发保存
		const md = htmlToMarkdown(editor.innerHTML);
		this.scheduleSave('Diary', md);
	}

	/** 为当前光标所在的块级元素添加类名 */
	private addClassToCurrentBlock(editor: HTMLElement, tagName: string, className: string): void {
		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0) return;
		const node = sel.anchorNode;
		if (!node) return;
		const el = node instanceof HTMLElement ? node : node.parentElement;
		if (el && el.tagName.toLowerCase() === tagName.toLowerCase()) {
			el.classList.add(className);
		}
	}

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
				if (section === 'Diary' && /^#\s*📒\s*Diary/i.test(lines[i])) {
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

			// 修复：newLines 不包含标题行（splice 从 sectionIdx+1 开始替换）
			const newLines = [
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
