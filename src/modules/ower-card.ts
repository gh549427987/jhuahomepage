import { App, TFile, TFolder } from 'obsidian';
import { HPageModule } from '../types';

// ==================== 常量定义 ====================

/** 雷达图维度定义（8维，去掉属性） */
const RADAR_DIMENSIONS = [
	{ key: 'attachment', label: '附件', max: 200 },
	{ key: 'notes', label: '笔记', max: 500 },
	{ key: 'completion', label: '任务完成率', max: 100, unit: '%' },
	{ key: 'activity', label: '活跃度', max: 100, unit: '%' },
	{ key: 'tags', label: '标签', max: 100 },
	{ key: 'linkDensity', label: '链接密度', max: 100, unit: '%' },
	{ key: 'folders', label: '文件夹', max: 50 },
	{ key: 'diary', label: '日记', max: 200 },
];

/** 预设统计语句模板 */
export const STATS_TEMPLATES = [
	{ name: '人生旅程', template: '您来到世间已{daysAlive}天，共撰写了{totalNotes}篇笔记，以及{diaryCount}篇日记' },
	{ name: '效率概览', template: '已记录{totalNotes}篇笔记、{diaryCount}篇日记，完成率{taskCompletionRate}%' },
	{ name: '知识地图', template: '{daysAlive}天的旅程，{totalNotes}篇笔记，{tagCount}个标签' },
	{ name: '库总览', template: '知识库含{totalNotes}篇笔记、{folderCount}个文件夹、{tagCount}个标签' },
];

/** 可用模板参数说明 */
export const TEMPLATE_PARAMS = [
	{ param: 'daysAlive', desc: '距出生日天数' },
	{ param: 'totalNotes', desc: '笔记文档数' },
	{ param: 'diaryCount', desc: '日记数' },
	{ param: 'attachmentCount', desc: '附件数' },
	{ param: 'taskCompletionRate', desc: '任务完成率(%)' },
	{ param: 'tagCount', desc: '标签数' },
	{ param: 'linkDensity', desc: '链接密度(%)' },
	{ param: 'folderCount', desc: '文件夹数' },
	{ param: 'propertyCount', desc: '属性数' },
	{ param: 'activity', desc: '活跃度(%)' },
	{ param: 'activeDays', desc: '近30天活跃天数' },
];

/** 头像保存目录 */
export const AVATAR_DIR = 'VaultSources/主页数据';
export const AVATAR_FILENAME = 'ower-avatar.png';

// ==================== 数据计算 ====================

export interface VaultStats {
	attachmentCount: number;
	totalNotes: number;
	taskCompletionRate: number;
	activity: number;
	tagCount: number;
	linkDensity: number;
	folderCount: number;
	propertyCount: number;
	diaryCount: number;
	daysAlive: number;
	activeDays: number;
}

export function computeVaultStats(app: App, birthday?: string): VaultStats {
	let attachmentCount = 0;
	let totalNotes = 0;
	let totalTasks = 0;
	let completedTasks = 0;
	const tagSet = new Set<string>();
	let totalLinks = 0;
	let folderCount = 0;
	let propertyCount = 0;
	let diaryCount = 0;
	let recentEdits = 0;
	const now = Date.now();
	const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

	const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp'];
	const mediaExts = ['mp3', 'mp4', 'wav', 'ogg', 'flac', 'pdf', 'zip', 'rar'];

	const walk = (folder: TFolder) => {
		for (const child of folder.children) {
			if (child instanceof TFile) {
				const ext = child.extension.toLowerCase();
				if (imageExts.includes(ext) || mediaExts.includes(ext)) {
					attachmentCount++;
				} else if (ext === 'md') {
					totalNotes++;
					// 判断是否为日记：文件名匹配 YYYY-MM-DD 或路径含"日记"
					if (/^\d{4}-\d{2}-\d{2}\.md$/.test(child.name) || child.path.includes('日记')) {
						diaryCount++;
					}
					// 读取缓存
					const cache = app.metadataCache.getFileCache(child);
					if (cache) {
						if (cache.tags) for (const t of cache.tags) tagSet.add(t.tag);
						if (cache.frontmatter?.tags) {
							const fmTags = cache.frontmatter.tags;
							if (Array.isArray(fmTags)) for (const t of fmTags) tagSet.add('#' + t);
							else if (typeof fmTags === 'string') tagSet.add('#' + fmTags);
						}
						if (cache.links) totalLinks += cache.links.length;
						if (cache.frontmatter) propertyCount += Object.keys(cache.frontmatter).length;
						if (cache.listItems) {
							for (const item of cache.listItems) {
								if (item.task) {
									totalTasks++;
									if (item.task !== ' ') completedTasks++;
								}
							}
						}
					}
					if (child.stat.mtime >= thirtyDaysAgo) recentEdits++;
				}
			} else if (child instanceof TFolder) {
				folderCount++;
				walk(child);
			}
		}
	};
	walk(app.vault.getRoot());

	const taskCompletionRate = totalTasks > 0 ? Math.round(completedTasks / totalTasks * 100) : 0;
	const activity = totalNotes > 0 ? Math.min(100, Math.round(recentEdits / Math.max(1, totalNotes) * 150)) : 0;
	const linkDensity = totalNotes > 0 ? Math.min(100, Math.round(totalLinks / totalNotes * 10)) : 0;

	let daysAlive = 0;
	if (birthday) {
		const birthDate = new Date(birthday);
		if (!isNaN(birthDate.getTime())) {
			daysAlive = Math.floor((now - birthDate.getTime()) / (24 * 60 * 60 * 1000));
		}
	}

	return {
		attachmentCount,
		totalNotes,
		taskCompletionRate,
		activity,
		tagCount: tagSet.size,
		linkDensity,
		folderCount,
		propertyCount,
		diaryCount,
		daysAlive,
		activeDays: Math.min(30, recentEdits),
	};
}

/** 渲染统计语句模板，参数值用高亮span包裹 */
export function renderStatsTemplate(template: string, stats: VaultStats, paramColor?: string, paramScale?: number): string {
	const color = paramColor || '#a78bfa';
	const scale = paramScale || 1.25;
	const wrap = (val: string | number) =>
		`<span class="jhua-ower-stats-param" style="color:${color};font-size:${scale}em">${val}</span>`;
	return template
		.replace(/\{daysAlive\}/g, wrap(stats.daysAlive))
		.replace(/\{totalNotes\}/g, wrap(stats.totalNotes))
		.replace(/\{diaryCount\}/g, wrap(stats.diaryCount))
		.replace(/\{attachmentCount\}/g, wrap(stats.attachmentCount))
		.replace(/\{taskCompletionRate\}/g, wrap(stats.taskCompletionRate))
		.replace(/\{tagCount\}/g, wrap(stats.tagCount))
		.replace(/\{linkDensity\}/g, wrap(stats.linkDensity))
		.replace(/\{folderCount\}/g, wrap(stats.folderCount))
		.replace(/\{propertyCount\}/g, wrap(stats.propertyCount))
		.replace(/\{activity\}/g, wrap(stats.activity))
		.replace(/\{activeDays\}/g, wrap(stats.activeDays));
}

// ==================== SVG 雷达图 ====================

/** hex转rgb数组 */
function hexToRgb(hex: string): [number, number, number] {
	const h = hex.replace('#', '');
	const r = parseInt(h.substring(0, 2), 16);
	const g = parseInt(h.substring(2, 4), 16);
	const b = parseInt(h.substring(4, 6), 16);
	return [r, g, b];
}

/** 调整颜色明暗：offset > 0 变亮（混白），offset < 0 变暗（混黑） */
function adjustBrightness(hex: string, offset: number): [number, number, number] {
	const [r, g, b] = hexToRgb(hex);
	if (offset >= 0) {
		const f = offset / 100;
		return [
			Math.round(r + (255 - r) * f),
			Math.round(g + (255 - g) * f),
			Math.round(b + (255 - b) * f),
		];
	} else {
		const f = -offset / 100;
		return [
			Math.round(r * (1 - f)),
			Math.round(g * (1 - f)),
			Math.round(b * (1 - f)),
		];
	}
}

function createRadarSVG(values: number[], labels: string[], color: string = '#a78bfa', fillOpacity: number = 0.35, gridOpacity: number = 0.6, maxSize: number = 220, colorLightness: number = 0): string {
	const n = values.length;
	const cx = 250, cy = 180, r = 95;
	const levels = 4;
	const [cr, cg, cb] = adjustBrightness(color, colorLightness);

	const pt = (i: number, ratio: number): [number, number] => {
		const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
		return [cx + r * ratio * Math.cos(angle), cy + r * ratio * Math.sin(angle)];
	};

	const polyPts = (ratio: number) =>
		Array.from({ length: n }, (_, i) => pt(i, ratio).join(',')).join(' ');

	// 网格（蛛网背景线）
	let svg = '';
	for (let lv = 1; lv <= levels; lv++) {
		const ratio = lv / levels;
		svg += `<polygon points="${polyPts(ratio)}" fill="none" stroke="var(--text-faint)" stroke-width="1.0" opacity="${gridOpacity}"/>`;
	}

	// 轴线
	for (let i = 0; i < n; i++) {
		const [x, y] = pt(i, 1);
		svg += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="var(--text-faint)" stroke-width="0.8" opacity="${gridOpacity}"/>`;
	}

	// 数据多边形
	const dataPts = values.map((v, i) => pt(i, Math.min(Math.max(v, 0.02), 1)).join(',')).join(' ');
	svg += `<polygon points="${dataPts}" fill="rgba(${cr},${cg},${cb},${fillOpacity})" stroke="rgb(${cr},${cg},${cb})" stroke-width="1.8" stroke-linejoin="round"/>`;

	// 数据点
	for (let i = 0; i < n; i++) {
		const [x, y] = pt(i, Math.min(Math.max(values[i], 0.02), 1));
		svg += `<circle cx="${x}" cy="${y}" r="3.5" fill="rgb(${cr},${cg},${cb})" stroke="var(--background-primary)" stroke-width="1"/>`;
	}

	// 标签（radius 1.55，缩小雷达圈给文本腾出空间）
	for (let i = 0; i < n; i++) {
		const [x, y] = pt(i, 1.55);
		const anchor = x < cx - 8 ? 'end' : x > cx + 8 ? 'start' : 'middle';
		const dy = y < cy - 8 ? '-0.2em' : y > cy + 8 ? '1.1em' : '0.4em';
		svg += `<text x="${x}" y="${y}" text-anchor="${anchor}" dy="${dy}" fill="var(--text-normal)" font-size="13" font-family="var(--font-interface)">${labels[i]}</text>`;
	}

	return `<svg viewBox="0 0 500 360" xmlns="http://www.w3.org/2000/svg" class="jhua-ower-radar-svg" style="max-width:${maxSize}px">` + svg + `</svg>`;
}

// ==================== 递归创建目录 ====================

async function ensureFolder(app: App, folderPath: string): Promise<void> {
	const parts = folderPath.split('/');
	let current = '';
	for (const part of parts) {
		current = current ? `${current}/${part}` : part;
		const existing = app.vault.getAbstractFileByPath(current);
		if (!existing) {
			await app.vault.createFolder(current);
		}
	}
}

// ==================== OwerCard 模块 ====================

export class OwerCardModule implements HPageModule {
	id = 'ower';
	name = '个人名片';

	defaultConfig = {
		nickname: '',
		motto: '',
		birthday: '',
		statsTemplate: '{daysAlive}天的旅程，{totalNotes}篇笔记，{diaryCount}篇日记',
		statsParamColor: '#a78bfa',
		statsParamScale: 1.25,
		radarColor: '#a78bfa',
		radarFillOpacity: 0.35,
		radarGridOpacity: 0.6,
		radarSize: 220,
		radarColorLightness: 0,
	};

	private app: App;
	private container: HTMLElement;

	render(app: App, config: Record<string, any>, container?: HTMLElement): HTMLElement {
		this.app = app;
		this.container = container || document.createElement('div');
		this.container.className = 'jhua-hpage-module jhua-card jhua-ower';
		this.container.dataset.jhuaModule = this.id;
		this.container.empty();

		const content = this.container.createDiv({ cls: 'jhua-ower-content' });

		// ===== 1. 头像（左） + 昵称/座右铭（右） =====
		const profileRow = content.createDiv({ cls: 'jhua-ower-profile' });

		const avatarWrap = profileRow.createDiv({ cls: 'jhua-ower-avatar-wrap' });
		const avatarPath = `${AVATAR_DIR}/${AVATAR_FILENAME}`;
		const avatarFile = app.vault.getAbstractFileByPath(avatarPath);

		if (avatarFile instanceof TFile) {
			const img = avatarWrap.createEl('img', { cls: 'jhua-ower-avatar' });
			img.src = app.vault.getResourcePath(avatarFile);
		} else {
			avatarWrap.createEl('span', { text: '👤', cls: 'jhua-ower-avatar-fallback' });
		}

		const profileText = profileRow.createDiv({ cls: 'jhua-ower-profile-text' });
		const nickname = config.nickname || '未设置昵称';
		profileText.createEl('div', { text: nickname, cls: 'jhua-ower-nickname' });

		if (config.motto) {
			profileText.createEl('div', { cls: 'jhua-ower-motto' }, (el) => {
				el.createEl('span', { text: '「', cls: 'jhua-ower-motto-mark' });
				el.createEl('span', { text: config.motto });
				el.createEl('span', { text: '」', cls: 'jhua-ower-motto-mark' });
			});
		}

		// ===== 2. 统计语句 =====
		const stats = computeVaultStats(app, config.birthday);
		const template = config.statsTemplate || this.defaultConfig.statsTemplate;
		const statsHtml = renderStatsTemplate(
			template, stats,
			config.statsParamColor || this.defaultConfig.statsParamColor,
			config.statsParamScale ?? this.defaultConfig.statsParamScale,
		);
		if (statsHtml.trim()) {
			const statsEl = content.createEl('div', { cls: 'jhua-ower-stats' });
			statsEl.innerHTML = statsHtml;
		}

		// ===== 3. 雷达图 =====
		const radarSection = content.createDiv({ cls: 'jhua-ower-radar' });

		// 归一化到 0-1（去掉 properties）
		const rawValues: number[] = [
			stats.attachmentCount,
			stats.totalNotes,
			stats.taskCompletionRate,
			stats.activity,
			stats.tagCount,
			stats.linkDensity,
			stats.folderCount,
			stats.diaryCount,
		];
		const normalized = RADAR_DIMENSIONS.map((dim, i) =>
			Math.min(rawValues[i] / dim.max, 1)
		);
		// 标签带数量括号，如 "附件(32)"
		const radarLabels = RADAR_DIMENSIONS.map((d, i) =>
			`${d.label}(${rawValues[i]}${d.unit || ''})`
		);
		radarSection.innerHTML = createRadarSVG(
			normalized,
			radarLabels,
			config.radarColor || '#a78bfa',
			config.radarFillOpacity ?? 0.35,
			config.radarGridOpacity ?? 0.6,
			config.radarSize ?? 220,
			config.radarColorLightness ?? 0
		);

		// 数值行
		const valuesRow = radarSection.createDiv({ cls: 'jhua-ower-radar-vals' });
		const displayItems = RADAR_DIMENSIONS.map((dim, i) => ({
			label: dim.label,
			value: rawValues[i] + (dim.unit || ''),
		}));
		for (const item of displayItems) {
			const cell = valuesRow.createDiv({ cls: 'jhua-ower-radar-cell' });
			cell.createEl('span', { text: item.value, cls: 'jhua-ower-radar-num' });
			cell.createEl('span', { text: item.label, cls: 'jhua-ower-radar-label' });
		}

		return this.container;
	}

	update(config: Record<string, any>): void {
		this.render(this.app, config, this.container);
	}

	/** 上传头像到 Vault */
	static async uploadAvatar(app: App, file: File): Promise<string> {
		await ensureFolder(app, AVATAR_DIR);
		const arrayBuffer = await file.arrayBuffer();
		const path = `${AVATAR_DIR}/${AVATAR_FILENAME}`;
		// 如果已存在则先删除
		const existing = app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFile) {
			await app.vault.delete(existing);
		}
		await app.vault.createBinary(path, arrayBuffer);
		return path;
	}
}
