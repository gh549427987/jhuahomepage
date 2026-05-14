import { App, Modal, Notice } from 'obsidian';
import { HPageModule } from '../types';

// 倒数日数据结构
interface CountdownEvent {
	id: string;
	name: string;
	date: string; // YYYY-MM-DD
	emoji: string;
}

// 编辑倒数日弹窗
class CountdownEditModal extends Modal {
	private onSave: (event: CountdownEvent) => void;
	private event?: CountdownEvent;
	private nameInput: HTMLInputElement;
	private dateInput: HTMLInputElement;
	private emojiInput: HTMLInputElement;

	constructor(app: App, onSave: (event: CountdownEvent) => void, event?: CountdownEvent) {
		super(app);
		this.onSave = onSave;
		this.event = event;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: this.event ? '编辑倒数日' : '添加倒数日' });

		new (require('obsidian').Setting)(contentEl)
			.setName('名称')
			.addText(text => {
				this.nameInput = text.inputEl;
				text.setValue(this.event?.name || '').setPlaceholder('例如：省考');
			});

		new (require('obsidian').Setting)(contentEl)
			.setName('日期')
			.addText(text => {
				this.dateInput = text.inputEl;
				text.inputEl.type = 'date';
				text.setValue(this.event?.date || '').setPlaceholder('YYYY-MM-DD');
			});

		new (require('obsidian').Setting)(contentEl)
			.setName('Emoji')
			.addText(text => {
				this.emojiInput = text.inputEl;
				text.setValue(this.event?.emoji || '🎯').setPlaceholder('🎯');
			});

		new (require('obsidian').Setting)(contentEl)
			.addButton(btn => btn
				.setButtonText('保存')
				.setCta()
				.onClick(() => {
					const name = this.nameInput.value.trim();
					const date = this.dateInput.value.trim();
					const emoji = this.emojiInput.value.trim() || '🎯';
					if (!name || !date) {
						new Notice('请填写名称和日期');
						return;
					}
					this.onSave({
						id: this.event?.id || `cd-${Date.now()}`,
						name, date, emoji
					});
					this.close();
				}));
	}
}

export class CountdownCardModule implements HPageModule {
	id = 'countdown-card';
	name = '倒数日卡片';
	defaultConfig = {
		maxItems: 4,
	};

	private app: App;
	private container: HTMLElement;
	private config: any;

	async render(app: App, config: Record<string, any>, container?: HTMLElement): Promise<HTMLElement> {
		this.app = app;
		this.config = config;

		this.container = container || document.createElement('div');
		this.container.className = 'jhua-hpage-module jhua-card jhua-countdown-card';
		this.container.dataset.jhuaModule = this.id;
		this.container.empty();

		const events: CountdownEvent[] = config.countdownEvents || [];

		// 头部
		const header = this.container.createDiv({ cls: 'jhua-card-header' });
		header.createEl('h3', { text: '🩷 倒数日', cls: 'jhua-card-title' });
		const addBtn = header.createEl('button', { text: '+', cls: 'jhua-card-add-btn' });
		addBtn.addEventListener('click', () => {
			new CountdownEditModal(this.app, async (evt) => {
				events.push(evt);
				config.countdownEvents = events;
				await this.saveCountdownEvents(config);
				this.render(this.app, config, this.container);
			}).open();
		});

		// 事件列表
		const list = this.container.createDiv({ cls: 'jhua-countdown-list' });

		if (events.length === 0) {
			list.createEl('div', { text: '点击 + 添加倒数日 ✨', cls: 'jhua-card-empty' });
			return this.container;
		}

		// 按日期排序
		const sorted = [...events].sort((a, b) => {
			const da = new Date(a.date).getTime();
			const db = new Date(b.date).getTime();
			return da - db;
		});

		const maxItems = config.maxItems || 4;
		sorted.slice(0, maxItems).forEach(evt => {
			const today = new Date();
			today.setHours(0, 0, 0, 0);
			const target = new Date(evt.date);
			target.setHours(0, 0, 0, 0);
			const diffMs = target.getTime() - today.getTime();
			const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

			const item = list.createDiv({ cls: 'jhua-countdown-item' });

			const isPast = days < 0;
			const isToday = days === 0;

			// 日期数字
			const numEl = item.createDiv({ cls: 'jhua-countdown-num' });
			if (isToday) {
				numEl.setText('🎉');
				numEl.addClass('jhua-countdown-today');
			} else if (isPast) {
				numEl.setText(`${Math.abs(days)}`);
				numEl.addClass('jhua-countdown-past');
			} else {
				numEl.setText(`${days}`);
			}

			// 单位
			const unitEl = item.createDiv({ cls: 'jhua-countdown-unit' });
			if (isToday) {
				unitEl.setText('就是今天！');
			} else if (isPast) {
				unitEl.setText('天前');
			} else {
				unitEl.setText('天');
			}

			// 名称+emoji
			const nameEl = item.createDiv({ cls: 'jhua-countdown-name' });
			nameEl.setText(`${evt.emoji} ${evt.name}`);

			// 日期
			const dateEl = item.createDiv({ cls: 'jhua-countdown-date' });
			dateEl.setText(evt.date);

			// 编辑/删除
			const actionsEl = item.createDiv({ cls: 'jhua-countdown-actions' });
			const editBtn = actionsEl.createEl('button', { text: '✏️', cls: 'jhua-countdown-action-btn' });
			editBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				new CountdownEditModal(this.app, async (updated) => {
					const idx = events.findIndex(ev => ev.id === updated.id);
					if (idx >= 0) events[idx] = updated;
					config.countdownEvents = events;
					await this.saveCountdownEvents(config);
					this.render(this.app, config, this.container);
				}, evt).open();
			});
			const delBtn = actionsEl.createEl('button', { text: '🗑️', cls: 'jhua-countdown-action-btn' });
			delBtn.addEventListener('click', async (e) => {
				e.stopPropagation();
				const idx = events.findIndex(ev => ev.id === evt.id);
				if (idx >= 0) events.splice(idx, 1);
				config.countdownEvents = events;
				await this.saveCountdownEvents(config);
				this.render(this.app, config, this.container);
			});
		});

		return this.container;
	}

	private async saveCountdownEvents(config: any): Promise<void> {
		try {
			const plugin = config.plugin;
			if (plugin && plugin.settings) {
				plugin.settings.countdownEvents = config.countdownEvents;
				await plugin.saveSettings();
			}
		} catch (e) {
			console.error('保存倒数日数据失败:', e);
		}
	}
}
