import { App, TFile, TFolder, Menu, MenuItem, Modal, Notice, Setting, FileSystemAdapter } from 'obsidian';
import { HPageModule } from '../types';
import { exec } from 'child_process';

// ==================== PARA 分区配置 ====================
interface ParaExplorerParams {
	P0?: string;
	A1?: string;
	R2?: string;
	A3?: string;
}

const SECTION_CONFIG = {
	P0: { name: 'Projects', emoji: '🚀', label: '项目', key: 'P0' },
	A1: { name: 'Areas', emoji: '📂', label: '领域', key: 'A1' },
	R2: { name: 'Resources', emoji: '📚', label: '资源', key: 'R2' },
	A3: { name: 'Archives', emoji: '📦', label: '档案', key: 'A3' }
};

// ==================== 模块类 ====================
export class ParaExplorerModule implements HPageModule {
	id = 'para-explorer';
	name = 'PARA 文件管理器';
	defaultConfig = {
		P0: '',
		A1: '',
		R2: '',
		A3: '',
	};

	render(app: App, config: Record<string, any>, container?: HTMLElement): HTMLElement {
		const params: ParaExplorerParams = {};
		if (config.P0) params.P0 = config.P0;
		if (config.A1) params.A1 = config.A1;
		if (config.R2) params.R2 = config.R2;
		if (config.A3) params.A3 = config.A3;

		const explorerEl = (container || document.body.createDiv()).createDiv({ cls: 'para-explorer' });

		const sectionKeys = (Object.keys(params) as Array<keyof ParaExplorerParams>)
			.filter(key => params[key] !== undefined);

		if (sectionKeys.length === 0) {
			explorerEl.createEl('div', { text: '请配置至少一个目录参数 (P0, A1, R2, A3)', cls: 'para-explorer-error' });
			return explorerEl;
		}

		let currentSection = sectionKeys[0] as keyof typeof SECTION_CONFIG;
		let history: string[] = [params[currentSection]!];
		let historyIndex = 0;

		// Navigation bar
		const navEl = explorerEl.createDiv({ cls: 'para-explorer-nav' });
		const sectionButtons: Record<string, HTMLButtonElement> = {};

		sectionKeys.forEach(key => {
			const secConfig = SECTION_CONFIG[key];
			const btn = navEl.createEl('button', {
				cls: 'para-explorer-nav-btn',
				text: `${secConfig.emoji} ${secConfig.label}`
			});
			sectionButtons[key] = btn;
		});

		// Content area
		const contentEl = explorerEl.createDiv({ cls: 'para-explorer-content' });

		// Toolbar
		const toolbarEl = contentEl.createDiv({ cls: 'para-explorer-toolbar' });

		const newFileBtn = toolbarEl.createEl('button', {
			cls: 'para-explorer-toolbar-btn',
			text: '📄 新建文件',
			attr: { title: '在当前目录创建新文件' }
		});

		const newFolderBtn = toolbarEl.createEl('button', {
			cls: 'para-explorer-toolbar-btn',
			text: '📁 新建文件夹',
			attr: { title: '在当前目录创建新文件夹' }
		});

		// Sort dropdown
		const sortSelect = toolbarEl.createEl('select', { cls: 'para-explorer-sort-select' });
		sortSelect.createEl('option', { value: 'mtime-desc', text: '🕐 最近修改' });
		sortSelect.createEl('option', { value: 'mtime-asc', text: '🕐 最早修改' });
		sortSelect.createEl('option', { value: 'name-asc', text: '🔤 名称 A-Z' });
		sortSelect.createEl('option', { value: 'name-desc', text: '🔤 名称 Z-A' });
		sortSelect.createEl('option', { value: 'size-desc', text: '📦 大小 大→小' });
		sortSelect.createEl('option', { value: 'size-asc', text: '📦 大小 小→大' });

		// Stats display
		const statsEl = toolbarEl.createDiv({ cls: 'para-explorer-stats' });

		// Path bar
		const pathBarEl = contentEl.createDiv({ cls: 'para-explorer-pathbar' });

		const backBtn = pathBarEl.createEl('button', {
			cls: 'para-explorer-nav-arrow',
			text: '◀',
			attr: { title: '后退' }
		});

		const forwardBtn = pathBarEl.createEl('button', {
			cls: 'para-explorer-nav-arrow',
			text: '▶',
			attr: { title: '前进' }
		});

		const pathTextEl = pathBarEl.createSpan({ cls: 'para-explorer-path-text' });

		// File list
		const fileListEl = contentEl.createDiv({ cls: 'para-explorer-filelist' });

		const getCurrentPath = () => history[historyIndex];

		// ==================== updateView ====================
		const updateView = async () => {
			sectionKeys.forEach(key => {
				if (key === currentSection) {
					sectionButtons[key].addClass('para-explorer-nav-btn-active');
				} else {
					sectionButtons[key].removeClass('para-explorer-nav-btn-active');
				}
			});

			const currentPath = history[historyIndex];
			backBtn.disabled = historyIndex <= 0;
			forwardBtn.disabled = historyIndex >= history.length - 1;
			pathTextEl.textContent = currentPath;

			fileListEl.empty();

			const folder = app.vault.getAbstractFileByPath(currentPath);

			if (!(folder instanceof TFolder)) {
				fileListEl.createEl('div', {
					text: `目录不存在: ${currentPath}`,
					cls: 'para-explorer-error'
				});
				return;
			}

			let displayChildren = folder.children.slice();
			const basePath = params[currentSection]!;
			const isBaseDirectory = currentPath === basePath;

			// Calculate stats
			const fileCount = displayChildren.filter(item => item instanceof TFile).length;
			const folderCount = displayChildren.filter(item => item instanceof TFolder).length;
			statsEl.textContent = `📁 ${folderCount}  📄 ${fileCount}`;

			// Sort
			const sortValue = sortSelect.value || 'mtime-desc';
			displayChildren.sort((a, b) => {
				const aIsFolder = a instanceof TFolder;
				const bIsFolder = b instanceof TFolder;

				switch (sortValue) {
					case 'mtime-desc':
						return (b as any).stat?.mtime - (a as any).stat?.mtime;
					case 'mtime-asc':
						return (a as any).stat?.mtime - (b as any).stat?.mtime;
					case 'name-asc':
						return a.name.localeCompare(b.name);
					case 'name-desc':
						return b.name.localeCompare(a.name);
					case 'size-desc':
						return ((b as any).stat?.size || 0) - ((a as any).stat?.size || 0);
					case 'size-asc':
						return ((a as any).stat?.size || 0) - ((b as any).stat?.size || 0);
					default:
						return (b as any).stat?.mtime - (a as any).stat?.mtime;
				}
			});

			// Parent directory entry
			if (!isBaseDirectory) {
				const parentEl = fileListEl.createDiv({
					cls: 'para-explorer-item para-explorer-folder para-explorer-parent'
				});
				const iconEl = parentEl.createSpan({ cls: 'para-explorer-icon' });
				const nameEl = parentEl.createSpan({ cls: 'para-explorer-name' });
				iconEl.textContent = '⬆️';
				nameEl.textContent = '.. (上级目录)';

				parentEl.addEventListener('click', () => {
					const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/';
					history = history.slice(0, historyIndex + 1);
					history.push(parentPath);
					historyIndex++;
					updateView();
				});
			}

			// Render items
			let itemIndex = 1;
			for (const item of displayChildren) {
				const itemEl = fileListEl.createDiv({
					cls: `para-explorer-item ${item instanceof TFolder ? 'para-explorer-folder' : 'para-explorer-file'}`
				});

				itemEl.draggable = true;
				itemEl.dataset.path = item.path;

				const indexEl = itemEl.createSpan({ cls: 'para-explorer-index' });
				const iconEl = itemEl.createSpan({ cls: 'para-explorer-icon' });
				const nameEl = itemEl.createSpan({ cls: 'para-explorer-name' });
				const infoEl = itemEl.createSpan({ cls: 'para-explorer-info' });

				indexEl.textContent = `${itemIndex}.`;
				itemIndex++;

				if (item instanceof TFolder) {
					iconEl.textContent = '📁';
					nameEl.textContent = item.name;
					const subFileCount = item.children.filter(c => c instanceof TFile).length;
					const subFolderCount = item.children.filter(c => c instanceof TFolder).length;
					infoEl.textContent = `📁${subFolderCount} 📄${subFileCount}`;

					itemEl.addEventListener('click', (e) => {
						if ((e as MouseEvent).button === 0) {
							const newPath = item.path;
							history = history.slice(0, historyIndex + 1);
							history.push(newPath);
							historyIndex++;
							updateView();
						}
					});

					itemEl.addEventListener('contextmenu', (e) => {
						e.preventDefault();
						showContextMenu(e, item as TFolder);
					});

					setupDropTarget(itemEl, item as TFolder);
				} else {
					const file = item as TFile;
					iconEl.textContent = getFileIcon(file.extension);
					nameEl.textContent = item.name;
					const sizeStr = formatFileSize(file.stat.size);
					const dateStr = formatDate(file.stat.ctime);
					infoEl.textContent = `${sizeStr} · ${dateStr}`;

					itemEl.addEventListener('click', async () => {
						const leaf = app.workspace.getLeaf(true);
						await leaf.openFile(file);
					});

					itemEl.addEventListener('contextmenu', (e) => {
						e.preventDefault();
						showContextMenu(e, item as TFile);
					});
				}

				// Drag events
				itemEl.addEventListener('dragstart', (e) => {
					e.dataTransfer?.setData('text/plain', item.path);
					if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
					itemEl.addClass('para-explorer-dragging');
				});

				itemEl.addEventListener('dragend', () => {
					itemEl.removeClass('para-explorer-dragging');
					fileListEl.querySelectorAll('.para-explorer-drop-target').forEach(el => {
						el.removeClass('para-explorer-drop-target');
					});
					navEl.querySelectorAll('.para-explorer-nav-btn-drop-target').forEach(el => {
						el.removeClass('para-explorer-nav-btn-drop-target');
					});
				});
			}

			if (fileListEl.childElementCount === 0) {
				fileListEl.createEl('div', {
					text: '暂无文件或目录',
					cls: 'para-explorer-empty'
				});
			}
		};

		// ==================== Event Handlers ====================

		// Navigation arrows
		backBtn.addEventListener('click', () => {
			if (historyIndex > 0) {
				historyIndex--;
				updateView();
			}
		});

		forwardBtn.addEventListener('click', () => {
			if (historyIndex < history.length - 1) {
				historyIndex++;
				updateView();
			}
		});

		// Section nav buttons
		sectionKeys.forEach(key => {
			const btn = sectionButtons[key];
			const secConfig = SECTION_CONFIG[key];

			btn.addEventListener('click', () => {
				currentSection = key;
				const basePath = params[key]!;
				history = [basePath];
				historyIndex = 0;
				updateView();
			});

			// Drop target for cross-section move
			setupNavDropTarget(btn, params[key]!, secConfig.label);
		});

		// Sort
		sortSelect.addEventListener('change', () => {
			updateView();
		});

		// New file
		newFileBtn.addEventListener('click', () => {
			showCreateFileModal(getCurrentPath(), async (fileName) => {
				try {
					if (!fileName.endsWith('.md')) {
						fileName += '.md';
					}
					const filePath = `${getCurrentPath()}/${fileName}`;
					const newFile = await app.vault.create(filePath, '');
					new Notice(`创建文件: ${fileName}`);
					updateView();
					const leaf = app.workspace.getLeaf(true);
					await leaf.openFile(newFile);
				} catch (error: any) {
					new Notice(`创建失败: ${error.message}`, 5000);
				}
			});
		});

		// New folder
		newFolderBtn.addEventListener('click', () => {
			showCreateFolderModal(getCurrentPath(), async (folderName) => {
				try {
					const folderPath = `${getCurrentPath()}/${folderName}`;
					await app.vault.createFolder(folderPath);
					new Notice(`创建文件夹: ${folderName}`);
					updateView();
				} catch (error: any) {
					new Notice(`创建失败: ${error.message}`, 5000);
				}
			});
		});

		// ==================== Helper Functions ====================

		function setupNavDropTarget(
			btn: HTMLButtonElement,
			targetPath: string,
			targetName: string
		) {
			btn.addEventListener('dragover', (e) => {
				e.preventDefault();
				if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
				btn.addClass('para-explorer-nav-btn-drop-target');
			});

			btn.addEventListener('dragleave', () => {
				btn.removeClass('para-explorer-nav-btn-drop-target');
			});

			btn.addEventListener('drop', async (e) => {
				e.preventDefault();
				btn.removeClass('para-explorer-nav-btn-drop-target');

				const sourcePath = e.dataTransfer?.getData('text/plain');
				if (!sourcePath) return;

				const sourceItem = app.vault.getAbstractFileByPath(sourcePath);
				if (!sourceItem) return;
				if (sourceItem.parent?.path === targetPath) return;
				if (sourcePath === targetPath) return;
				if (targetPath.startsWith(sourcePath + '/')) return;

				try {
					const newPath = `${targetPath}/${sourceItem.name}`;
					await app.fileManager.renameFile(sourceItem, newPath);
					new Notice(`已移动到 ${targetName}`);
					updateView();
				} catch (error: any) {
					new Notice(`移动失败: ${error.message}`, 5000);
				}
			});
		}

		function setupDropTarget(itemEl: HTMLElement, targetFolder: TFolder) {
			itemEl.addEventListener('dragover', (e) => {
				e.preventDefault();
				if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
				itemEl.addClass('para-explorer-drop-target');
			});

			itemEl.addEventListener('dragleave', () => {
				itemEl.removeClass('para-explorer-drop-target');
			});

			itemEl.addEventListener('drop', async (e) => {
				e.preventDefault();
				itemEl.removeClass('para-explorer-drop-target');

				const sourcePath = e.dataTransfer?.getData('text/plain');
				if (!sourcePath) return;

				if (sourcePath === targetFolder.path) return;
				if (targetFolder.path.startsWith(sourcePath + '/')) return;

				const sourceItem = app.vault.getAbstractFileByPath(sourcePath);
				if (!sourceItem) return;

				try {
					const newPath = `${targetFolder.path}/${sourceItem.name}`;
					await app.fileManager.renameFile(sourceItem, newPath);
					new Notice(`已移动到 ${targetFolder.name}`);
					updateView();
				} catch (error: any) {
					new Notice(`移动失败: ${error.message}`, 5000);
				}
			});
		}

		function showContextMenu(e: MouseEvent, item: TFile | TFolder) {
			const menu = new Menu();

			const moveSection = sectionKeys.filter(key => params[key] && params[key] !== item.parent?.path);
			if (moveSection.length > 0) {
				menu.addItem((menuItem) => {
					menuItem
						.setTitle('移动到...')
						.setIcon('arrow-right');

					// @ts-ignore
					const subMenu = menuItem.setSubmenu();

					moveSection.forEach(key => {
						const secConfig = SECTION_CONFIG[key];
						const targetPath = params[key];
						if (!targetPath) return;

						subMenu.addItem((subItem: MenuItem) => {
							subItem
								.setTitle(`${secConfig.emoji} ${secConfig.label}`)
								.onClick(async () => {
									try {
										const newPath = `${targetPath}/${item.name}`;
										await app.fileManager.renameFile(item, newPath);
										new Notice(`已移动到 ${secConfig.label}`);
										updateView();
									} catch (error: any) {
										new Notice(`移动失败: ${error.message}`, 5000);
									}
								});
						});
					});
				});
			}

			menu.addSeparator();

			// 在系统文件管理器中打开
			menu.addItem((menuItem) => {
				menuItem
					.setTitle('文件管理器中打开')
					.setIcon('folder')
					.onClick(async () => {
						try {
							const adapter = app.vault.adapter as FileSystemAdapter;
							const vaultPath = adapter.getBasePath();
							// 对于文件夹，直接打开该文件夹；对于文件，打开其所在目录
							const dirPath = item instanceof TFolder ? item.path : item.parent?.path || '';
							const absolutePath = `${vaultPath}/${dirPath}`;
							exec(`explorer "${absolutePath.replace(/\//g, '\\')}"`);
						} catch (error: any) {
							new Notice(`打开失败: ${error.message}`, 5000);
						}
					});
			});

			menu.addSeparator();

			menu.addItem((menuItem) => {
				menuItem
					.setTitle('重命名')
					.setIcon('pencil')
					.onClick(() => {
						showRenameModal(item);
					});
			});

			menu.addItem((menuItem) => {
				menuItem
					.setTitle('删除')
					.setIcon('trash')
					.onClick(() => {
						showDeleteConfirm(item);
					});
			});

			menu.showAtMouseEvent(e);
		}

		function showCreateFileModal(currentPath: string, callback: (name: string) => void) {
			const modal = new Modal(app);
			modal.titleEl.setText('新建文件');
			modal.titleEl.style.marginBottom = '16px';

			let fileName = '';
			let textInput: HTMLInputElement;

			const content = modal.contentEl;
			content.style.display = 'flex';
			content.style.flexDirection = 'column';
			content.style.gap = '16px';

			new Setting(content)
				.setName('文件名')
				.setDesc('无需输入扩展名，自动添加 .md')
				.addText((text) => {
					textInput = text.inputEl;
					text.setPlaceholder('输入文件名（无需.md后缀）...');
					text.inputEl.style.width = '100%';
					text.onChange((value) => {
						fileName = value;
					});
				});

			const buttonContainer = content.createDiv();
			buttonContainer.style.display = 'flex';
			buttonContainer.style.justifyContent = 'flex-end';
			buttonContainer.style.gap = '8px';
			buttonContainer.style.marginTop = '8px';

			const cancelBtn = buttonContainer.createEl('button', { text: '取消' });
			cancelBtn.addEventListener('click', () => modal.close());

			const createBtn = buttonContainer.createEl('button', { text: '创建', cls: 'mod-cta' });
			const doCreate = () => {
				if (fileName.trim()) {
					callback(fileName.trim());
					modal.close();
				}
			};
			createBtn.addEventListener('click', doCreate);

			modal.contentEl.addEventListener('keydown', (e) => {
				if (e.key === 'Enter') {
					e.preventDefault();
					doCreate();
				}
			});

			modal.open();
			setTimeout(() => textInput?.focus(), 10);
		}

		function showCreateFolderModal(currentPath: string, callback: (name: string) => void) {
			const modal = new Modal(app);
			modal.titleEl.setText('新建文件夹');
			modal.titleEl.style.marginBottom = '16px';

			let folderName = '';
			let textInput: HTMLInputElement;

			const content = modal.contentEl;
			content.style.display = 'flex';
			content.style.flexDirection = 'column';
			content.style.gap = '16px';

			new Setting(content)
				.setName('文件夹名称')
				.addText((text) => {
					textInput = text.inputEl;
					text.setPlaceholder('输入文件夹名称...');
					text.inputEl.style.width = '100%';
					text.onChange((value) => {
						folderName = value;
					});
				});

			const buttonContainer = content.createDiv();
			buttonContainer.style.display = 'flex';
			buttonContainer.style.justifyContent = 'flex-end';
			buttonContainer.style.gap = '8px';
			buttonContainer.style.marginTop = '8px';

			const cancelBtn = buttonContainer.createEl('button', { text: '取消' });
			cancelBtn.addEventListener('click', () => modal.close());

			const createBtn = buttonContainer.createEl('button', { text: '创建', cls: 'mod-cta' });
			const doCreate = () => {
				if (folderName.trim()) {
					callback(folderName.trim());
					modal.close();
				}
			};
			createBtn.addEventListener('click', doCreate);

			modal.contentEl.addEventListener('keydown', (e) => {
				if (e.key === 'Enter') {
					e.preventDefault();
					doCreate();
				}
			});

			modal.open();
			setTimeout(() => textInput?.focus(), 10);
		}

		function showRenameModal(item: TFile | TFolder) {
			const modal = new Modal(app);
			modal.titleEl.setText('重命名');
			modal.titleEl.style.marginBottom = '16px';

			let newName = item.name;
			let textInput: HTMLInputElement;

			const content = modal.contentEl;
			content.style.display = 'flex';
			content.style.flexDirection = 'column';
			content.style.gap = '16px';

			new Setting(content)
				.setName('新名称')
				.addText((text) => {
					textInput = text.inputEl;
					text.setValue(item.name);
					text.inputEl.style.width = '100%';
					text.onChange((value) => {
						newName = value;
					});
				});

			const buttonContainer = content.createDiv();
			buttonContainer.style.display = 'flex';
			buttonContainer.style.justifyContent = 'flex-end';
			buttonContainer.style.gap = '8px';
			buttonContainer.style.marginTop = '8px';

			const cancelBtn = buttonContainer.createEl('button', { text: '取消' });
			cancelBtn.addEventListener('click', () => modal.close());

			const renameBtn = buttonContainer.createEl('button', { text: '重命名', cls: 'mod-cta' });
			const doRename = async () => {
				if (newName.trim() && newName !== item.name) {
					try {
						const parentPath = item.parent?.path || '';
						const newPath = parentPath ? `${parentPath}/${newName}` : newName;
						await app.fileManager.renameFile(item, newPath);
						new Notice('重命名成功');
						updateView();
					} catch (error: any) {
						new Notice(`重命名失败: ${error.message}`, 5000);
					}
				}
				modal.close();
			};
			renameBtn.addEventListener('click', doRename);

			modal.contentEl.addEventListener('keydown', (e) => {
				if (e.key === 'Enter') {
					e.preventDefault();
					doRename();
				}
			});

			modal.open();
			setTimeout(() => textInput?.focus(), 10);
		}

		function showDeleteConfirm(item: TFile | TFolder) {
			const modal = new Modal(app);
			modal.titleEl.setText('确认删除');
			modal.titleEl.style.marginBottom = '16px';

			const content = modal.contentEl;
			content.style.display = 'flex';
			content.style.flexDirection = 'column';
			content.style.gap = '16px';

			const isFolder = item instanceof TFolder;
			const warningText = content.createEl('p');
			warningText.textContent = `确定要删除${isFolder ? '文件夹' : '文件'} "${item.name}" 吗？`;
			warningText.style.margin = '0';

			if (isFolder) {
				const subWarning = content.createEl('p');
				subWarning.textContent = '⚠️ 文件夹内的所有内容将被删除！';
				subWarning.style.color = 'var(--text-error)';
				subWarning.style.margin = '0';
				subWarning.style.fontSize = '13px';
			}

			const buttonContainer = content.createDiv();
			buttonContainer.style.display = 'flex';
			buttonContainer.style.justifyContent = 'flex-end';
			buttonContainer.style.gap = '8px';
			buttonContainer.style.marginTop = '8px';

			const cancelBtn = buttonContainer.createEl('button', { text: '取消' });
			cancelBtn.addEventListener('click', () => modal.close());

			const deleteBtn = buttonContainer.createEl('button', { text: '删除', cls: 'mod-warning' });
			deleteBtn.addEventListener('click', async () => {
				try {
					if (isFolder) {
						await app.vault.delete(item as TFolder, true);
					} else {
						await app.vault.delete(item as TFile);
					}
					new Notice('删除成功');
					updateView();
				} catch (error: any) {
					new Notice(`删除失败: ${error.message}`, 5000);
				}
				modal.close();
			});

			modal.open();
		}

		function getFileIcon(extension: string): string {
			const ext = extension.toLowerCase();
			const iconMap: Record<string, string> = {
				'md': '📝', 'pdf': '📄', 'png': '🖼️', 'jpg': '🖼️', 'jpeg': '🖼️',
				'gif': '🖼️', 'svg': '🖼️', 'mp4': '🎬', 'mov': '🎬', 'mp3': '🎵',
				'wav': '🎵', 'zip': '📦', 'rar': '📦', '7z': '📦', 'js': '📜',
				'ts': '📜', 'json': '📋', 'css': '🎨', 'html': '🌐', 'py': '🐍',
				'java': '☕', 'cpp': '⚙️', 'c': '⚙️', 'go': '🐹', 'rs': '🦀',
				'rb': '💎', 'xlsx': '📊', 'xls': '📊', 'csv': '📊', 'docx': '📘',
				'doc': '📘', 'pptx': '📊', 'ppt': '📊'
			};
			return iconMap[ext] || '📄';
		}

		function formatFileSize(bytes: number): string {
			if (bytes === 0) return '0 B';
			const k = 1024;
			const sizes = ['B', 'KB', 'MB', 'GB'];
			const i = Math.floor(Math.log(bytes) / Math.log(k));
			return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
		}

		function formatDate(timestamp: number): string {
			const date = new Date(timestamp);
			const now = new Date();
			const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

			if (diffDays === 0) {
				return '今天';
			} else if (diffDays === 1) {
				return '昨天';
			} else if (diffDays < 7) {
				return `${diffDays} 天前`;
			} else if (diffDays < 30) {
				return `${Math.floor(diffDays / 7)} 周前`;
			} else {
				return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
			}
		}

		// Initial render
		updateView();

		return explorerEl;
	}
}
