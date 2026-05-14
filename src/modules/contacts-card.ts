import { App, Modal, Notice, TFile } from 'obsidian';
import { HPageModule } from '../types';

// 通讯录元数据结构（对应文档 YAML）
interface ContactInfo {
	name: string;
	性别: string;
	age: string;
	新历生日: string;
	手机: string;
	座机: string;
	介绍人: string;
	与本人关系: string;
	地址: string;
	tags: string[];
	remark: string;
	filePath: string;
}

// 新建通讯录弹窗
class ContactCreateModal extends Modal {
	private onSave: (contact: ContactInfo) => void;
	private nameInput: HTMLInputElement;
	private genderSelect: HTMLSelectElement;
	private phoneInput: HTMLInputElement;
	private birthdayInput: HTMLInputElement;
	private relationInput: HTMLInputElement;
	private introducerInput: HTMLInputElement;
	private addressInput: HTMLInputElement;
	private tagsInput: HTMLInputElement;
	private remarkInput: HTMLInputElement;

	constructor(app: App, onSave: (contact: ContactInfo) => void) {
		super(app);
		this.onSave = onSave;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.style.padding = '20px';

		contentEl.createEl('h2', { text: '📇 新建通讯录', attr: { style: 'margin-bottom: 16px;' } });

		// 姓名（必填）
		new (require('obsidian').Setting)(contentEl)
			.setName('姓名')
			.setDesc('必填，同时作为文件名')
			.addText(text => {
				this.nameInput = text.inputEl;
				text.setPlaceholder('输入姓名').inputEl.style.width = '100%';
			});

		// 性别
		new (require('obsidian').Setting)(contentEl)
			.setName('性别')
			.addDropdown(dd => {
				this.genderSelect = dd.selectEl;
				dd.addOption('', '未设置')
					.addOption('男', '男')
					.addOption('女', '女');
			});

		// 手机
		new (require('obsidian').Setting)(contentEl)
			.setName('手机')
			.addText(text => {
				this.phoneInput = text.inputEl;
				text.setPlaceholder('手机号码').inputEl.type = 'tel';
			});

		// 新历生日
		new (require('obsidian').Setting)(contentEl)
			.setName('生日（新历）')
			.addText(text => {
				this.birthdayInput = text.inputEl;
				text.inputEl.type = 'date';
			});

		// 与本人关系
		new (require('obsidian').Setting)(contentEl)
			.setName('与本人关系')
			.addText(text => {
				this.relationInput = text.inputEl;
				text.setPlaceholder('如：同事、朋友、亲戚…');
			});

		// 介绍人
		new (require('obsidian').Setting)(contentEl)
			.setName('介绍人')
			.addText(text => {
				this.introducerInput = text.inputEl;
				text.setPlaceholder('介绍人姓名');
			});

		// 地址
		new (require('obsidian').Setting)(contentEl)
			.setName('地址')
			.addText(text => {
				this.addressInput = text.inputEl;
				text.setPlaceholder('地址');
			});

		// 标签
		new (require('obsidian').Setting)(contentEl)
			.setName('标签')
			.setDesc('逗号分隔，如：同事, 朋友')
			.addText(text => {
				this.tagsInput = text.inputEl;
				text.setPlaceholder('同事, 朋友, 亲戚…');
			});

		// 备注
		new (require('obsidian').Setting)(contentEl)
			.setName('备注')
			.addTextArea(ta => {
				this.remarkInput = ta.inputEl;
				ta.setPlaceholder('备注信息');
				ta.inputEl.rows = 2;
				ta.inputEl.style.width = '100%';
			});

		// 按钮
		new (require('obsidian').Setting)(contentEl)
			.addButton(btn => btn
				.setButtonText('创建')
				.setCta()
				.onClick(() => {
					const name = this.nameInput.value.trim();
					if (!name) {
						new Notice('请输入姓名');
						return;
					}
					const contact: ContactInfo = {
						name,
						性别: this.genderSelect.value,
						age: '',
						新历生日: this.birthdayInput.value,
						手机: this.phoneInput.value.trim(),
						座机: '',
						介绍人: this.introducerInput.value.trim(),
						与本人关系: this.relationInput.value.trim(),
						地址: this.addressInput.value.trim(),
						tags: this.tagsInput.value.trim()
							? this.tagsInput.value.split(/[,，]/).map(t => t.trim()).filter(Boolean)
							: [],
						remark: this.remarkInput.value.trim(),
						filePath: '',
					};
					this.onSave(contact);
					this.close();
				}))
			.addButton(btn => btn
				.setButtonText('取消')
				.onClick(() => this.close()));
	}
}

export class ContactsCardModule implements HPageModule {
	id = 'contacts-card';
	name = '通讯录卡片';
	defaultConfig = {
		scanPath: '01-领域（Areas）/03-生活领域/02-通讯录',
		maxItems: 8,
		groupBy: 'tags' as 'tags' | 'relation' | 'none',
		sortBy: 'recent' as 'recent' | 'name' | 'birthday' | 'relation',
	};

	private app: App;
	private container: HTMLElement;
	private config: any;
	private currentSortBy: string;

	async render(app: App, config: Record<string, any>, container?: HTMLElement): Promise<HTMLElement> {
		this.app = app;
		this.config = { ...this.defaultConfig, ...config };
		// 保持上次排序状态（如果容器上有记录）
		this.currentSortBy = this.container?.dataset?.sortBy || this.config.sortBy || 'recent';

		this.container = container || document.createElement('div');
		this.container.className = 'jhua-hpage-module jhua-card jhua-contacts-card';
		this.container.dataset.jhuaModule = this.id;
		this.container.dataset.sortBy = this.currentSortBy;
		this.container.empty();

		// 头部
		const header = this.container.createDiv({ cls: 'jhua-card-header' });
		header.createEl('h3', { text: '📇 通讯录', cls: 'jhua-card-title' });

		// 按钮组（排序 + 新建）
		const btnGroup = header.createDiv({ cls: 'jhua-card-header-btns' });

		// 排序按钮
		const sortBtn = btnGroup.createEl('button', { cls: 'jhua-card-sort-btn', attr: { title: '切换排序' } });
		sortBtn.innerHTML = this.getSortIcon(this.currentSortBy);
		sortBtn.addEventListener('click', async (e) => {
			e.stopPropagation();
			// 循环切换排序方式
			const sortModes = ['recent', 'name', 'birthday', 'relation'] as const;
			const currentIdx = sortModes.indexOf(this.currentSortBy as any);
			const nextIdx = (currentIdx + 1) % sortModes.length;
			this.currentSortBy = sortModes[nextIdx];
			this.container.dataset.sortBy = this.currentSortBy;
			// 重新渲染
			await this.render(this.app, this.config, this.container);
		});

		// "+" 按钮
		const addBtn = btnGroup.createEl('button', { cls: 'jhua-card-add-btn', text: '+' });
		addBtn.addEventListener('click', () => {
			new ContactCreateModal(this.app, async (contact) => {
				await this.createContactFile(contact);
				await this.render(this.app, this.config, this.container);
			}).open();
		});

		// 排序提示
		const sortLabel = this.container.createDiv({ cls: 'jhua-contacts-sort-label' });
		sortLabel.setText(this.getSortLabel(this.currentSortBy));

		// 内容区
		const content = this.container.createDiv({ cls: 'jhua-contacts-content' });

		// 从目录读取通讯录
		let contacts = await this.loadContacts();

		if (contacts.length === 0) {
			content.createEl('div', { text: '暂无通讯录 📭', cls: 'jhua-card-empty' });
			return this.container;
		}

		// 排序
		contacts = this.sortContacts(contacts, this.currentSortBy);

		// 分组：标签 > 关系 > 无分组
		const groupBy = this.config.groupBy || 'tags';
		const groups = this.groupContacts(contacts, groupBy);

		// 统计
		const statsEl = content.createDiv({ cls: 'jhua-contacts-stats' });
		statsEl.createEl('span', { text: `👥 ${contacts.length}` });

		// 全局最多显示条数
		const maxItems = this.config.maxItems || 8;

		// 渲染分组
		let displayedCount = 0;
		for (const [groupName, groupContacts] of groups) {
			if (displayedCount >= maxItems) break;

			if (groupBy !== 'none') {
				const groupHeader = content.createDiv({ cls: 'jhua-contacts-group-header' });
				groupHeader.createEl('span', { text: groupName, cls: 'jhua-contacts-group-name' });
				groupHeader.createEl('span', { text: `${groupContacts.length}`, cls: 'jhua-contacts-group-count' });
			}

			const list = content.createDiv({ cls: 'jhua-contacts-list' });
			// 本组可显示的剩余名额
			const remaining = maxItems - displayedCount;
			const displayContacts = groupContacts.slice(0, remaining);

			for (const contact of displayContacts) {
				const item = list.createDiv({ cls: 'jhua-contact-item' });

				// 头像圆点
				const avatar = item.createDiv({ cls: 'jhua-contact-avatar' });
				const initial = contact.name.charAt(0);
				avatar.setText(initial);
				// 根据性别配色
				if (contact.性别 === '女') {
					avatar.classList.add('jhua-contact-avatar-female');
				} else if (contact.性别 === '男') {
					avatar.classList.add('jhua-contact-avatar-male');
				}

				// 信息区
				const info = item.createDiv({ cls: 'jhua-contact-info' });
				const nameRow = info.createDiv({ cls: 'jhua-contact-name-row' });
				nameRow.createEl('span', { text: contact.name, cls: 'jhua-contact-name' });

				// 右侧标签
				if (contact.tags.length > 0) {
					const tag = contact.tags[0]; // 只显示第一个标签
					nameRow.createEl('span', { text: tag, cls: 'jhua-contact-tag' });
				}

				// 副标题行：关系 + 手机
				const subRow = info.createDiv({ cls: 'jhua-contact-sub' });
				const subParts: string[] = [];
				if (contact.与本人关系) subParts.push(contact.与本人关系);
				if (contact.手机) subParts.push(contact.手机);
				if (subParts.length > 0) {
					subRow.setText(subParts.join(' · '));
				}

				// 生日提醒
				if (contact.新历生日 && contact.新历生日 !== '1000-11-20') {
					const bday = this.getDaysUntilBirthday(contact.新历生日);
					if (bday !== null && bday <= 30) {
						const bdayEl = info.createDiv({ cls: 'jhua-contact-birthday' });
						if (bday === 0) {
							bdayEl.setText('🎂 今天生日！');
						} else {
							bdayEl.setText(`🎂 ${bday}天后生日`);
						}
					}
				}

				// 点击打开文档
				item.addEventListener('click', () => {
					if (contact.filePath) {
						this.app.workspace.openLinkText(contact.filePath, '', true);
					}
				});
				displayedCount++;
			}
		}

		// 显示数量提示
		if (contacts.length > maxItems) {
			const moreEl = content.createDiv({ cls: 'jhua-contacts-more' });
			moreEl.setText(`还有 ${contacts.length - maxItems} 位联系人…`);
		}

		return this.container;
	}

	/**
	 * 排序联系人
	 */
	private sortContacts(contacts: ContactInfo[], sortBy: string): ContactInfo[] {
		const sorted = [...contacts];
		switch (sortBy) {
			case 'name':
				sorted.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
				break;
			case 'birthday':
				// 即将过生日的排在最前
				sorted.sort((a, b) => {
					const da = this.getDaysUntilBirthday(a.新历生日);
					const db = this.getDaysUntilBirthday(b.新历生日);
					if (da === null && db === null) return 0;
					if (da === null) return 1;
					if (db === null) return -1;
					return da - db;
				});
				break;
			case 'relation':
				// 按与本人关系分组排序
				sorted.sort((a, b) => {
					const ra = a.与本人关系 || 'zzz';
					const rb = b.与本人关系 || 'zzz';
					return ra.localeCompare(rb, 'zh-CN');
				});
				break;
			case 'recent':
			default:
				// 按创建时间倒序（原默认行为）
				sorted.sort((a, b) => {
					const fileA = this.app.vault.getAbstractFileByPath(a.filePath);
					const fileB = this.app.vault.getAbstractFileByPath(b.filePath);
					if (fileA instanceof TFile && fileB instanceof TFile) {
						return fileB.stat.ctime - fileA.stat.ctime;
					}
					return 0;
				});
				break;
		}
		return sorted;
	}

	/**
	 * 获取排序图标
	 */
	private getSortIcon(sortBy: string): string {
		switch (sortBy) {
			case 'name': return '🔤';
			case 'birthday': return '🎂';
			case 'relation': return '🔗';
			case 'recent': default: return '🕐';
		}
	}

	/**
	 * 获取排序提示文字
	 */
	private getSortLabel(sortBy: string): string {
		switch (sortBy) {
			case 'name': return '按姓名排序';
			case 'birthday': return '按生日排序';
			case 'relation': return '按关系排序';
			case 'recent': default: return '按最近创建排序';
		}
	}

	/**
	 * 从通讯录目录加载所有联系人（使用 metadataCache 零读取）
	 */
	private async loadContacts(): Promise<ContactInfo[]> {
		const contacts: ContactInfo[] = [];
		const scanPath = this.config.scanPath || this.defaultConfig.scanPath;

		const allFiles = this.app.vault.getMarkdownFiles().filter(file =>
			file.path.startsWith(scanPath + '/') || file.path === scanPath
		);

		for (const file of allFiles) {
			try {
				const contact = this.extractContactFromCache(file);
				if (contact) {
					contacts.push(contact);
				}
			} catch (e) {
				console.error(`提取通讯录${file.path}失败:`, e);
			}
		}

		return contacts;
	}

	/**
	 * 从 metadataCache 提取联系人元数据
	 */
	private extractContactFromCache(file: TFile): ContactInfo | null {
		const cache = this.app.metadataCache.getFileCache(file);
		const fm = cache?.frontmatter;
		if (!fm) return null;

		// 必须有 name 或者 归属 = 通讯录
		const belong = fm['归属'];
		if (belong !== '通讯录') return null;

		// 解析 tags：可能是数组、字符串或 undefined
		let tags: string[] = [];
		if (Array.isArray(fm['tags'])) {
			tags = fm['tags']
				.map((t: string) => String(t).replace(/^#/, ''))
				.filter((t: string) => t && t !== '通讯录');
		} else if (typeof fm['tags'] === 'string') {
			tags = [fm['tags'].replace(/^#/, '')].filter(t => t && t !== '通讯录');
		}

		return {
			name: fm['name'] || file.basename,
			性别: fm['性别'] || '',
			age: fm['age'] || '',
			新历生日: fm['新历生日'] || '',
			手机: fm['手机'] || '',
			座机: fm['座机'] || '',
			介绍人: fm['介绍人'] || '',
			与本人关系: fm['与本人关系'] || '',
			地址: fm['地址'] || '',
			tags,
			remark: fm['remark'] || '',
			filePath: file.path,
		};
	}

	/**
	 * 分组联系人
	 */
	private groupContacts(contacts: ContactInfo[], groupBy: string): Map<string, ContactInfo[]> {
		const groups = new Map<string, ContactInfo[]>();

		if (groupBy === 'none') {
			groups.set('全部', contacts);
			return groups;
		}

		for (const contact of contacts) {
			let groupNames: string[];

			if (groupBy === 'tags' && contact.tags.length > 0) {
				groupNames = contact.tags;
			} else if (groupBy === 'relation' && contact.与本人关系) {
				groupNames = [contact.与本人关系];
			} else {
				groupNames = ['未分类'];
			}

			for (const gn of groupNames) {
				if (!groups.has(gn)) {
					groups.set(gn, []);
				}
				groups.get(gn)!.push(contact);
			}
		}

		return groups;
	}

	/**
	 * 计算距离下次生日的天数
	 */
	private getDaysUntilBirthday(birthday: string): number | null {
		try {
			const match = birthday.match(/(\d{1,2})-(\d{1,2})$/);
			if (!match) {
				// 完整日期 YYYY-MM-DD
				if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday)) return null;
			}

			const today = new Date();
			const year = today.getFullYear();

			let bdayStr: string;
			if (/^\d{4}-\d{2}-\d{2}$/.test(birthday)) {
				const [, m, d] = birthday.split('-');
				bdayStr = `${year}-${m}-${d}`;
			} else {
				bdayStr = `${year}-${birthday}`;
			}

			const bday = new Date(bdayStr);
			if (isNaN(bday.getTime())) return null;

			// 如果今年生日已过，看明年的
			if (bday < today) {
				bday.setFullYear(year + 1);
			}

			const diff = bday.getTime() - today.getTime();
			return Math.ceil(diff / (1000 * 60 * 60 * 24));
		} catch {
			return null;
		}
	}

	/**
	 * 创建通讯录文档
	 */
	private async createContactFile(contact: ContactInfo): Promise<void> {
		try {
			const scanPath = this.config.scanPath || this.defaultConfig.scanPath;
			const filePath = `${scanPath}/${contact.name}.md`;

			// 检查是否已存在
			const existing = this.app.vault.getAbstractFileByPath(filePath);
			if (existing instanceof TFile) {
				new Notice(`❌ 通讯录「${contact.name}」已存在`);
				return;
			}

			// 构建 YAML
			const now = new Date();
			const createTime = now.toISOString().slice(0, 19).replace('T', ' ');
			const tagsYaml = contact.tags.length > 0
				? `\ntags:\n${contact.tags.map(t => `  - ${t}`).join('\n')}`
				: '\ntags:';

			const yaml = [
				'---',
				`name: ${contact.name}`,
				`性别: ${contact.性别 || ''}`,
				'age:',
				`新历生日: ${contact.新历生日 || ''}`,
				`手机: ${contact.手机 || ''}`,
				'座机:',
				`介绍人: ${contact.介绍人 || ''}`,
				`与本人关系: ${contact.与本人关系 || ''}`,
				`地址: ${contact.地址 || ''}`,
				`create_time: ${createTime}`,
				tagsYaml,
				'归属: 通讯录',
				contact.remark ? `remark: ${contact.remark}` : '',
				'---',
			].filter(line => line !== undefined).join('\n');

			const body = [
				``,
				`# 📇 ${contact.name} 通讯录详情`,
				``,
				`## 一、关键备注`,
				`> 用于记录核心信息、特殊偏好、禁忌、重要特征等（快速查阅核心要点）`,
				`- `,
				`- `,
				`- `,
				``,
				`## 二、互动记录`,
				`| 日期       | 互动方式       | 互动内容                                                                 |`,
				`| :--------- | :------------- | :---------------------------------------------------------------------- |`,
				`|            |                |                                                                         |`,
				``,
			].join('\n');

			const content = yaml + body;
			const newFile = await this.app.vault.create(filePath, content);
			this.app.workspace.activeLeaf?.openFile(newFile);
			new Notice(`✅ 已创建通讯录「${contact.name}」`);
		} catch (e) {
			new Notice(`❌ 创建失败：${e.message || '未知错误'}`);
		}
	}

	async update(config: Record<string, any>): Promise<void> {
		await this.render(this.app, config, this.container);
	}
}
