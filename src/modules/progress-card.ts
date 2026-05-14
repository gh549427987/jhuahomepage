import { App, Modal, Notice, Setting, TFile, TFolder, Component } from 'obsidian';

// ==================== 数据解析 ====================

export interface ProgressEntry {
	date: string;
	update: string;
	note: string;
}

export function parseProgressSource(source: string): ProgressEntry[] {
	const entries: ProgressEntry[] = [];
	const lines = source.split('\n');
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		// 格式: - 日期 | 进度更新 | 备注
		const match = trimmed.match(/^-\s+(.+?)\s*\|\s*(.+?)\s*\|\s*(.*)$/);
		if (match) {
			entries.push({
				date: match[1].trim(),
				update: match[2].trim(),
				note: match[3].trim() || '-',
			});
		}
	}
	return entries;
}

function entriesToSource(entries: ProgressEntry[]): string {
	return entries.map(e => `- ${e.date} | ${e.update} | ${e.note}`).join('\n');
}

// ==================== 渲染 ====================

export function renderProgressCard(
	app: App,
	entries: ProgressEntry[],
	el: HTMLElement,
	ctx: any
): void {
	const container = el.createDiv({ cls: 'jhua-progress-card' });

	// 获取当前文件信息
	const file = ctx.sourcePath ? app.vault.getAbstractFileByPath(ctx.sourcePath) : null;
	if (!(file instanceof TFile)) {
		container.createEl('div', { text: '❌ 无法获取当前文件', cls: 'jhua-hpage-error' });
		return;
	}

	// 头部
	const header = container.createDiv({ cls: 'jp-header' });
	const title = header.createDiv({ cls: 'jp-title' });
	title.textContent = '📊 进度记录';

	const addBtn = header.createEl('button', { cls: 'jp-add-btn', text: '+ 记录' });
	addBtn.addEventListener('click', () => {
		showAddProgressModal(app, file, entries, container, ctx);
	});

	// 表格
	if (entries.length === 0) {
		const empty = container.createDiv({ cls: 'jp-empty' });
		empty.textContent = '暂无进度记录';
		return;
	}

	const tableEl = container.createEl('table', { cls: 'jp-table' });

	// 表头
	const thead = tableEl.createEl('thead');
	const headerRow = thead.createEl('tr');
	headerRow.createEl('th', { text: '📅 日期' });
	headerRow.createEl('th', { text: '📝 进度更新' });
	headerRow.createEl('th', { text: '📌 备注' });
	headerRow.createEl('th', { text: '' }); // 操作列

	// 表体（倒序：最新在上）
	const tbody = tableEl.createEl('tbody');
	const reversed = [...entries].reverse();
	for (let i = reversed.length - 1; i >= 0; i--) {
		const entry = reversed[i];
		const originalIndex = entries.length - 1 - i;
		const tr = tbody.createEl('tr');

		// 日期
		const dateCell = tr.createEl('td', { cls: 'jp-cell-date' });
		dateCell.textContent = entry.date;

		// 进度更新
		const updateCell = tr.createEl('td', { cls: 'jp-cell-update' });
		// 检测进度百分比文字高亮
		const progressMatch = entry.update.match(/(\d+)%/);
		if (progressMatch) {
			const pct = parseInt(progressMatch[1]);
			const before = entry.update.substring(0, progressMatch.index);
			const after = entry.update.substring((progressMatch.index || 0) + progressMatch[0].length);
			if (before) updateCell.appendChild(document.createTextNode(before));
			const badge = updateCell.createSpan({ cls: 'jp-pct-badge' });
			badge.textContent = `${pct}%`;
			if (pct >= 100) badge.addClass('jp-pct-done');
			else if (pct >= 50) badge.addClass('jp-pct-half');
			else badge.addClass('jp-pct-low');
			if (after) updateCell.appendChild(document.createTextNode(after));
		} else {
			updateCell.textContent = entry.update;
		}

		// 备注
		const noteCell = tr.createEl('td', { cls: 'jp-cell-note' });
		noteCell.textContent = entry.note;

		// 删除按钮
		const actionCell = tr.createEl('td', { cls: 'jp-cell-action' });
		const delBtn = actionCell.createEl('button', { cls: 'jp-del-btn', text: '✕', attr: { title: '删除此条' } });
		const idx = originalIndex;
		delBtn.addEventListener('click', async () => {
			const newEntries = entries.filter((_, j) => j !== idx);
			await updateFileSource(app, file, newEntries);
			new Notice('已删除进度记录');
			// 重新渲染
			container.empty();
			renderProgressCard(app, newEntries, container, ctx);
		});
	}

	// 统计
	const footer = container.createDiv({ cls: 'jp-footer' });
	footer.textContent = `共 ${entries.length} 条记录`;
}

// ==================== 添加记录 Modal ====================

function showAddProgressModal(
	app: App,
	file: TFile,
	entries: ProgressEntry[],
	container: HTMLElement,
	ctx: any
): void {
	const modal = new Modal(app);
	modal.titleEl.setText('📝 添加进度记录');
	modal.titleEl.style.marginBottom = '16px';

	const content = modal.contentEl;
	content.style.display = 'flex';
	content.style.flexDirection = 'column';
	content.style.gap = '12px';

	const today = new Date().toISOString().slice(0, 10);

	// 日期
	let dateValue = today;
	new Setting(content)
		.setName('日期')
		.addText((text) => {
			text.inputEl.type = 'date';
			text.setValue(today);
			text.inputEl.style.width = '180px';
			text.onChange((v) => { dateValue = v || today; });
		});

	// 进度更新
	let updateValue = '';
	new Setting(content)
		.setName('进度更新')
		.setDesc('如 "完成前端开发，进度60%"')
		.addText((text) => {
			text.setPlaceholder('输入进度描述...');
			text.inputEl.style.width = '100%';
			text.onChange((v) => { updateValue = v; });
		});

	// 备注
	let noteValue = '';
	new Setting(content)
		.setName('备注')
		.addText((text) => {
			text.setPlaceholder('可选备注...');
			text.inputEl.style.width = '100%';
			text.onChange((v) => { noteValue = v; });
		});

	const buttonContainer = content.createDiv();
	buttonContainer.style.display = 'flex';
	buttonContainer.style.justifyContent = 'flex-end';
	buttonContainer.style.gap = '8px';
	buttonContainer.style.marginTop = '8px';

	const cancelBtn = buttonContainer.createEl('button', { text: '取消' });
	cancelBtn.addEventListener('click', () => modal.close());

	const addRecordBtn = buttonContainer.createEl('button', { text: '添加', cls: 'mod-cta' });
	const doAdd = async () => {
		const update = updateValue.trim();
		if (!update) {
			new Notice('请输入进度描述');
			return;
		}
		const newEntry: ProgressEntry = {
			date: dateValue,
			update,
			note: noteValue.trim() || '-',
		};
		const newEntries = [...entries, newEntry];
		await updateFileSource(app, file, newEntries);
		new Notice('已添加进度记录');
		modal.close();
		// 重新渲染
		container.empty();
		renderProgressCard(app, newEntries, container, ctx);

		// 同步更新 frontmatter 中的 progress 字段
		const progressMatch = update.match(/(\d+)%/);
		if (progressMatch) {
			const pct = parseInt(progressMatch[1]);
			try {
				await app.fileManager.processFrontMatter(file, (fm: any) => {
					fm.progress = pct;
				});
			} catch (e) {
				// frontmatter 更新失败不影响主流程
			}
		}
	};
	addRecordBtn.addEventListener('click', doAdd);
	content.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') { e.preventDefault(); doAdd(); }
	});

	modal.open();
}

// ==================== 更新文件源码 ====================

async function updateFileSource(app: App, file: TFile, entries: ProgressEntry[]): Promise<void> {
	const content = await app.vault.read(file);

	// 找到 jhua-progress 代码块并替换其内容
	const regex = /(```jhua-progress\n)([\s\S]*?)(```)/;
	const match = content.match(regex);
	if (!match) {
		throw new Error('未找到 jhua-progress 代码块');
	}

	const newSource = entriesToSource(entries);
	const newContent = content.replace(regex, `$1${newSource}\n$3`);
	await app.vault.modify(file, newContent);
}
