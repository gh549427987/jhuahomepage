import { App, ItemView, WorkspaceLeaf, TFile } from 'obsidian';
import {
	OwerCardModule,
	AVATAR_DIR,
	AVATAR_FILENAME,
	computeVaultStats,
	renderStatsTemplate,
	STATS_TEMPLATES,
	TEMPLATE_PARAMS,
} from './ower-card';

export const OWER_VIEW_TYPE = 'jhua-ower-view';

export class OwerView extends ItemView {
	private plugin: any;

	constructor(leaf: WorkspaceLeaf, plugin: any) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return OWER_VIEW_TYPE;
	}

	getDisplayText(): string {
		return '个人名片';
	}

	getIcon(): string {
		return 'user';
	}

	async onOpen() {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.classList.add('jhua-ower-sidebar');

		const owerConfig = this.plugin.settings.modules?.ower?.config || {};
		const config = {
			nickname: owerConfig.nickname || '',
			motto: owerConfig.motto || '',
			birthday: owerConfig.birthday || '',
			statsTemplate: owerConfig.statsTemplate || '{daysAlive}天的旅程，{totalNotes}篇笔记，{diaryCount}篇日记',
			statsParamColor: owerConfig.statsParamColor || '#a78bfa',
			statsParamScale: owerConfig.statsParamScale ?? 1.25,
			radarColor: owerConfig.radarColor || '#a78bfa',
			radarFillOpacity: owerConfig.radarFillOpacity ?? 0.35,
			radarGridOpacity: owerConfig.radarGridOpacity ?? 0.6,
			radarSize: owerConfig.radarSize ?? 220,
			radarColorLightness: owerConfig.radarColorLightness ?? 0,
		};

		// ===== 0. 右上角图标按钮 =====
		const toolbar = container.createDiv({ cls: 'jhua-ower-sb-toolbar' });
		toolbar.createEl('button', { cls: 'jhua-ower-sb-icon-btn', attr: { 'aria-label': '刷新数据' } }, (btn) => {
			btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>';
			btn.addEventListener('click', async () => {
				await this.onOpen();
			});
		});
		toolbar.createEl('button', { cls: 'jhua-ower-sb-icon-btn', attr: { 'aria-label': '设置' } }, (btn) => {
			btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
			btn.addEventListener('click', () => {
				(this.app as any).setting.open();
				setTimeout(() => {
					const owerHeading = document.querySelector('.jhua-settings-subtitle');
					if (owerHeading) {
						owerHeading.scrollIntoView({ behavior: 'smooth', block: 'start' });
					}
				}, 300);
			});
		});

		// ===== 1. 头像（左） + 昵称/座右铭（右） =====
		const profileRow = container.createDiv({ cls: 'jhua-ower-sb-profile' });

		const avatarWrap = profileRow.createDiv({ cls: 'jhua-ower-sb-avatar-wrap' });
		const avatarPath = `${AVATAR_DIR}/${AVATAR_FILENAME}`;
		const avatarFile = this.app.vault.getAbstractFileByPath(avatarPath);

		if (avatarFile instanceof TFile) {
			const img = avatarWrap.createEl('img', { cls: 'jhua-ower-sb-avatar' });
			img.src = this.app.vault.getResourcePath(avatarFile);
		} else {
			avatarWrap.createEl('span', { text: '👤', cls: 'jhua-ower-sb-avatar-fallback' });
		}

		const profileText = profileRow.createDiv({ cls: 'jhua-ower-sb-profile-text' });
		const nickname = config.nickname || '未设置昵称';
		profileText.createEl('div', { text: nickname, cls: 'jhua-ower-sb-nickname' });

		if (config.motto) {
			profileText.createEl('div', { cls: 'jhua-ower-sb-motto' }, (el) => {
				el.createEl('span', { text: '「', cls: 'jhua-ower-sb-motto-mark' });
				el.createEl('span', { text: config.motto });
				el.createEl('span', { text: '」', cls: 'jhua-ower-sb-motto-mark' });
			});
		}

		// ===== 2. 统计语句 =====
		const stats = computeVaultStats(this.app, config.birthday);
		const statsHtml = renderStatsTemplate(config.statsTemplate, stats, config.statsParamColor, config.statsParamScale);
		if (statsHtml.trim()) {
			const statsEl = container.createEl('div', { cls: 'jhua-ower-sb-stats' });
			statsEl.innerHTML = statsHtml;
		}

		// ===== 3. 雷达图 =====
		const radarSection = container.createDiv({ cls: 'jhua-ower-sb-radar' });

		// 用 OwerCardModule 的 render 方法获取雷达图（复用代码）
		const owerModule = new OwerCardModule();
		const moduleEl = await owerModule.render(this.app, config);
		// 提取雷达图部分
		const radarEl = moduleEl.querySelector('.jhua-ower-radar');
		if (radarEl) {
			radarSection.appendChild(radarEl.cloneNode(true) as HTMLElement);
		}
	}

	async onClose() {
		// 清理
	}
}
