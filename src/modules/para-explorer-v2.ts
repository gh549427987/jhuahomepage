import { App, TFile, TFolder, TAbstractFile, Menu, MenuItem, Modal, Notice, Setting, FileSystemAdapter } from 'obsidian';
import { HPageModule } from '../types';
import { exec } from 'child_process';

// ==================== PARA 分区配置 ====================
interface ParaExplorerV2Params {
	P0?: string;
	A1?: string;
	R2?: string;
	A3?: string;
	view?: 'overview' | 'explorer';
	maxItems?: number;
}

type ParaSectionKey = 'P0' | 'A1' | 'R2' | 'A3';

interface SectionConfig {
	name: string;
	emoji: string;
	label: string;
	key: ParaSectionKey;
}

const SECTION_CONFIG: Record<ParaSectionKey, SectionConfig> = {
	P0: { name: 'Projects', emoji: '🚀', label: '项目', key: 'P0' },
	A1: { name: 'Areas', emoji: '📂', label: '领域', key: 'A1' },
	R2: { name: 'Resources', emoji: '📚', label: '资源', key: 'R2' },
	A3: { name: 'Archives', emoji: '📦', label: '档案', key: 'A3' }
};

const PROJECT_SECTION_KEY: ParaSectionKey = 'P0';
const ARCHIVE_SECTION_KEY: ParaSectionKey = 'A3';

// ==================== 模块类 ====================
export class ParaExplorerV2Module implements HPageModule {
	id = 'para-explorer-v2';
	name = 'PARA 文件管理器 V2';
	defaultConfig = {
		P0: '',
		A1: '',
		R2: '',
		A3: '',
		view: 'overview',
		maxItems: 8,
	};

	render(app: App, config: Record<string, any>, container?: HTMLElement): HTMLElement {
		const params: ParaExplorerV2Params = {};
		if (config.P0) params.P0 = config.P0;
		if (config.A1) params.A1 = config.A1;
		if (config.R2) params.R2 = config.R2;
		if (config.A3) params.A3 = config.A3;
		params.view = config.view || 'overview';
		params.maxItems = config.maxItems || 8;

		const rootEl = (container || document.body.createDiv()).createDiv({ cls: 'para-explorer-v2' });
		rootEl.dataset.jhuaModule = 'para-explorer-v2';

		const sectionKeys = (Object.keys(SECTION_CONFIG) as ParaSectionKey[])
			.filter(key => params[key] !== undefined);

		if (sectionKeys.length === 0) {
			rootEl.createEl('div', { text: '请配置至少一个目录参数 (P0, A1, R2, A3)', cls: 'para-explorer-error' });
			return rootEl;
		}

		// 概览模式排序状态（必须在 header 创建前声明，因为 sortBtn 引用了 overviewSortBy）
		const OVERVIEW_SORT_MODES = ['mtime-desc', 'name-asc', 'prefix-asc', 'name-desc', 'mtime-asc'] as const;
		const OVERVIEW_SORT_LABELS: Record<string, string> = {
			'mtime-desc': '🕐 最近修改',
			'mtime-asc': '🕐 最早修改',
			'name-asc': '🔤 名称 A→Z',
			'name-desc': '🔤 名称 Z→A',
			'prefix-asc': '🔢 前缀 0→9',
		};
		let overviewSortBy: string = 'mtime-desc';

		function getSortIcon(sortBy: string): string {
			switch (sortBy) {
				case 'name-asc': case 'name-desc': return '🔤';
				case 'prefix-asc': return '🔢';
				case 'mtime-asc': return '🕐';
				case 'mtime-desc': default: return '🕐';
			}
		}

		function getPrefixNumber(name: string): number {
			const match = name.match(/^(\d+)/);
			return match ? parseInt(match[1], 10) : 9999;
		}

		// ==================== 顶部标题栏 + 视图切换 ====================
		const headerEl = rootEl.createDiv({ cls: 'pe2-header' });
		const titleEl = headerEl.createDiv({ cls: 'pe2-title' });
		titleEl.textContent = '📂 PARA 管理器';

		const viewToggleEl = headerEl.createDiv({ cls: 'pe2-view-toggle' });

		// 概览排序按钮（放在概览/浏览按钮左侧，只显示 icon）
		const sortBtn = viewToggleEl.createEl('button', { cls: 'pe2-view-sort-btn', attr: { title: '切换排序规则' } });
		sortBtn.innerHTML = getSortIcon(overviewSortBy);
		sortBtn.addEventListener('click', () => {
			const currentIdx = OVERVIEW_SORT_MODES.indexOf(overviewSortBy as any);
			overviewSortBy = OVERVIEW_SORT_MODES[(currentIdx + 1) % OVERVIEW_SORT_MODES.length];
			sortBtn.innerHTML = getSortIcon(overviewSortBy);
			sortBtn.title = OVERVIEW_SORT_LABELS[overviewSortBy] || '切换排序规则';
			if (currentView === 'overview') renderOverview();
		});

		const overviewBtn = viewToggleEl.createEl('button', { cls: 'pe2-view-btn', text: '概览' });
		const explorerBtn = viewToggleEl.createEl('button', { cls: 'pe2-view-btn', text: '浏览' });

		// ==================== 视图容器 ====================
		const overviewContainer = rootEl.createDiv({ cls: 'pe2-overview' });
		const explorerContainer = rootEl.createDiv({ cls: 'pe2-explorer' });

		let currentView: 'overview' | 'explorer' = params.view || 'overview';

		// ==================== 浏览模式状态 ====================
		let explorerCurrentSection: ParaSectionKey = sectionKeys[0];
		let explorerHistory: string[] = [params[sectionKeys[0]]!];
		let explorerHistoryIndex = 0;

		// 每个section记住最后访问的路径和完整history，切换tab时恢复
		const sectionMemory: Record<string, { history: string[]; index: number }> = {};
		for (const key of sectionKeys) {
			sectionMemory[key] = { history: [params[key]!], index: 0 };
		}

		// 状态缓存：解决 setFolderStatus 后 metadataCache 未及时更新的问题
		const statusOverride: Map<string, string> = new Map();

		// ==================== 视图切换 ====================
		const switchView = (view: 'overview' | 'explorer') => {
			currentView = view;
			if (view === 'overview') {
				overviewContainer.style.display = '';
				explorerContainer.style.display = 'none';
				overviewBtn.addClass('pe2-view-btn-active');
				explorerBtn.removeClass('pe2-view-btn-active');
				renderOverview();
			} else {
				overviewContainer.style.display = 'none';
				explorerContainer.style.display = '';
				explorerBtn.addClass('pe2-view-btn-active');
				overviewBtn.removeClass('pe2-view-btn-active');
				// 同步sectionMemory：概览点击设置history后，切换到浏览模式时保存
				sectionMemory[explorerCurrentSection] = {
					history: [...explorerHistory],
					index: explorerHistoryIndex
				};
				renderExplorer();
			}
		};

		overviewBtn.addEventListener('click', () => switchView('overview'));
		explorerBtn.addEventListener('click', () => switchView('explorer'));

		// ==================== 辅助函数 ====================
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
			if (diffDays === 0) return '今天';
			if (diffDays === 1) return '昨天';
			if (diffDays < 7) return `${diffDays}天前`;
			if (diffDays < 30) return `${Math.floor(diffDays / 7)}周前`;
			return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
		}

		// 读取文件夹的 folder note frontmatter 中的 status
		function getFolderStatus(folder: TFolder): 'active' | 'paused' | 'completed' | null {
			// 优先使用覆盖缓存（setFolderStatus 写入后 metadataCache 可能还没更新）
			const override = statusOverride.get(folder.path);
			if (override) return override as any;
			const folderNote = app.vault.getAbstractFileByPath(`${folder.path}/${folder.name}.md`);
			if (!(folderNote instanceof TFile)) return null;
			const cache = app.metadataCache.getFileCache(folderNote);
			const status = cache?.frontmatter?.status;
			if (status === 'active' || status === 'paused' || status === 'completed') return status;
			return null;
		}

		// 写入 folder note frontmatter status
		async function setFolderStatus(folder: TFolder, status: string) {
			// 立即更新覆盖缓存，确保 getFolderStatus 马上返回新值
			statusOverride.set(folder.path, status);
			let folderNotePath = `${folder.path}/${folder.name}.md`;
			let folderNote = app.vault.getAbstractFileByPath(folderNotePath);
			if (!folderNote) {
				// 创建 folder note
				try {
					folderNote = await app.vault.create(folderNotePath, `---\nstatus: ${status}\ncreated: ${new Date().toISOString().slice(0, 10)}\n---\n# ${folder.name}\n`);
				} catch (err: any) {
					new Notice(`创建 folder note 失败: ${err.message}`, 5000);
					statusOverride.delete(folder.path);
					return;
				}
			} else {
				await app.fileManager.processFrontMatter(folderNote, (fm: any) => {
					fm.status = status;
				});
			}
			// 短暂延迟后清除覆盖（等 metadataCache 刷新）
			setTimeout(() => statusOverride.delete(folder.path), 3000);
		}

		// 获取文件夹最近修改时间
		function getFolderMtime(folder: TFolder): number {
			let latest = 0;
			const recurse = (f: TFolder) => {
				for (const child of f.children) {
					if (child instanceof TFile) {
						if (child.stat.mtime > latest) latest = child.stat.mtime;
					} else if (child instanceof TFolder) {
						recurse(child);
					}
				}
			};
			recurse(folder);
			return latest;
		}

		// 统计文件夹内文件和子文件夹数量（仅直接子级）
		function countDirectChildren(folder: TFolder): { folders: number; files: number } {
			let folders = 0, files = 0;
			for (const child of folder.children) {
				if (child instanceof TFolder) folders++;
				else if (child instanceof TFile) files++;
			}
			return { folders, files };
		}

		// 递归统计文件数
		function countAllFiles(folder: TFolder): number {
			let count = 0;
			const recurse = (f: TFolder) => {
				for (const child of f.children) {
					if (child instanceof TFile) count++;
					else if (child instanceof TFolder) recurse(child);
				}
			};
			recurse(folder);
			return count;
		}

		// 在系统文件管理器中打开
		function openInSystemExplorer(item: TFile | TFolder) {
			try {
				const adapter = app.vault.adapter as FileSystemAdapter;
				const vaultPath = adapter.getBasePath();
				const dirPath = item instanceof TFolder ? item.path : item.parent?.path || '';
				const absolutePath = `${vaultPath}/${dirPath}`;
				exec(`explorer "${absolutePath.replace(/\//g, '\\')}"`);
			} catch (error: any) {
				new Notice(`打开失败: ${error.message}`, 5000);
			}
		}

		// revealFile 三级回退
		async function revealFileInExplorer(item: TFile | TFolder) {
			if (item instanceof TFile) {
				const leaf = app.workspace.getLeaf(true);
				await leaf.openFile(item);
			}
			try {
				const leaves = app.workspace.getLeavesOfType('file-explorer');
				if (leaves.length > 0) {
					const view = leaves[0].view as any;
					if (view.revealFile) { view.revealFile(item); return; }
				}
			} catch {}
			try {
				const fe = (app as any).internalPlugins?.plugins?.['file-explorer']?.instance;
				if (fe?.revealFile) { fe.revealFile(item); return; }
			} catch {}
			try {
				app.commands.executeCommandById('file-explorer:reveal-active-file-in-navigation');
			} catch {}
		}

		// ==================== 概览模式渲染 ====================
		function renderOverview() {
			overviewContainer.empty();

			// 同步排序按钮状态
			sortBtn.innerHTML = getSortIcon(overviewSortBy);
			sortBtn.title = OVERVIEW_SORT_LABELS[overviewSortBy] || '切换排序规则';

			const gridEl = overviewContainer.createDiv({ cls: 'pe2-overview-grid' });

			// 统计汇总
			let totalActive = 0, totalPaused = 0, totalFiles = 0;

			for (const key of sectionKeys) {
				const secConfig = SECTION_CONFIG[key];
				const basePath = params[key]!;
				const sectionEl = gridEl.createDiv({ cls: 'pe2-section' });

				// 栏标题
				const headerEl = sectionEl.createDiv({ cls: 'pe2-section-header' });
				const headerTitle = headerEl.createDiv({ cls: 'pe2-section-title' });
				headerTitle.textContent = `${secConfig.emoji} ${secConfig.label}`;

				const baseFolder = app.vault.getAbstractFileByPath(basePath);
				if (!(baseFolder instanceof TFolder)) {
					sectionEl.createEl('div', { text: `目录不存在: ${basePath}`, cls: 'para-explorer-error' });
					continue;
				}

				const isProjectSection = key === PROJECT_SECTION_KEY;
				const maxItems = params.maxItems || 8;

				// ---- 项目栏：一级分类标签 + 二级项目 ----
				if (isProjectSection) {
			// 收集一级分类（子文件夹）
				const categories = baseFolder.children
					.filter(c => c instanceof TFolder) as TFolder[];
				categories.sort((a, b) => {
					// 一级分类始终按数字前缀排序
					return getPrefixNumber(a.name) - getPrefixNumber(b.name) || a.name.localeCompare(b.name, 'zh-CN');
				});

					// 统计所有二级项目数
					let totalProjects = 0;
					for (const cat of categories) {
						totalProjects += cat.children.filter(c => c instanceof TFolder).length;
					}

					const headerCount = headerEl.createSpan({ cls: 'pe2-section-count' });
					headerCount.textContent = `${totalProjects}`;

					const listEl = sectionEl.createDiv({ cls: 'pe2-section-list' });

					let totalDisplayed = 0;
					for (const catFolder of categories) {
						// 二级项目
						const projects = (catFolder.children
							.filter(c => c instanceof TFolder) as TFolder[])
							.filter(p => {
								const st = getFolderStatus(p);
								return st !== 'completed'; // 已归档不显示
							});

						if (projects.length === 0) continue;

						// 分类标签头
						const catLabel = listEl.createDiv({ cls: 'pe2-category-label' });
						catLabel.textContent = catFolder.name;
						// 点击分类头进入浏览模式（该分类目录）
						catLabel.addEventListener('click', () => {
							explorerCurrentSection = key;
							explorerHistory = [catFolder.path];
							explorerHistoryIndex = 0;
							switchView('explorer');
						});

				// 排序：使用概览排序规则
					projects.sort((a, b) => {
						switch (overviewSortBy) {
							case 'name-asc': return a.name.localeCompare(b.name, 'zh-CN');
							case 'name-desc': return b.name.localeCompare(a.name, 'zh-CN');
							case 'prefix-asc': {
								const pa = getPrefixNumber(a.name);
								const pb = getPrefixNumber(b.name);
								if (pa !== pb) return pa - pb;
								return a.name.localeCompare(b.name, 'zh-CN');
							}
							case 'mtime-asc': return getFolderMtime(a) - getFolderMtime(b);
							case 'mtime-desc':
							default: return getFolderMtime(b) - getFolderMtime(a);
						}
					});

						for (const project of projects) {
							if (totalDisplayed >= maxItems) break;

							const status = getFolderStatus(project) || 'active';
							if (status === 'active') totalActive++;
							if (status === 'paused') totalPaused++;
							totalFiles += countAllFiles(project);

							const { folders: subF, files: subFi } = countDirectChildren(project);
							const mtime = getFolderMtime(project);
							const mtimeStr = mtime > 0 ? formatDate(mtime) : '';

							const itemEl = listEl.createDiv({ cls: `pe2-project-item pe2-project-${status}` });

							// 状态指示
							const statusEl = itemEl.createSpan({ cls: 'pe2-project-status' });
							if (status === 'active') statusEl.textContent = '🟢';
							else if (status === 'paused') statusEl.textContent = '🟡';
							else statusEl.textContent = '📁';

							// 名称与信息
							const infoContainer = itemEl.createDiv({ cls: 'pe2-project-info' });
							const nameEl = infoContainer.createDiv({ cls: 'pe2-project-name' });
							nameEl.textContent = project.name;

							const metaEl = infoContainer.createDiv({ cls: 'pe2-project-meta' });
							let metaText = `📁${subF} 📄${subFi}`;
							if (mtimeStr) metaText += ` · ${mtimeStr}`;
							if (status === 'paused') metaText += ' · 已暂停';
							metaEl.textContent = metaText;

							// 操作按钮（hover 显示）
							const actionsEl = itemEl.createDiv({ cls: 'pe2-project-actions' });

							if (status === 'active') {
								const pauseBtn = actionsEl.createEl('button', {
									cls: 'pe2-action-btn pe2-action-pause',
									text: '⏸',
									attr: { title: '暂停项目' }
								});
								pauseBtn.addEventListener('click', async (e) => {
									e.stopPropagation();
									await setFolderStatus(project, 'paused');
									new Notice(`已暂停: ${project.name}`);
									renderOverview();
								});
							} else if (status === 'paused') {
								const reactivateBtn = actionsEl.createEl('button', {
									cls: 'pe2-action-btn pe2-action-reactivate',
									text: '▶',
									attr: { title: '重新激活' }
								});
								reactivateBtn.addEventListener('click', async (e) => {
									e.stopPropagation();
									await setFolderStatus(project, 'active');
									new Notice(`已重新激活: ${project.name}`);
									renderOverview();
								});
							}

							if (status === 'active' || status === 'paused') {
								const archiveBtn = actionsEl.createEl('button', {
									cls: 'pe2-action-btn pe2-action-archive',
									text: '✅',
									attr: { title: '完成并归档' }
								});
								archiveBtn.addEventListener('click', (e) => {
									e.stopPropagation();
									showArchiveConfirmModal(project);
								});
							}

							// 点击进入浏览模式
							itemEl.addEventListener('click', () => {
								explorerCurrentSection = key;
								explorerHistory = [project.path];
								explorerHistoryIndex = 0;
								switchView('explorer');
							});

							// 右键菜单
							itemEl.addEventListener('contextmenu', (e) => {
								e.preventDefault();
								showOverviewContextMenu(e, project, key, status);
							});

							totalDisplayed++;
						}

						if (totalDisplayed >= maxItems) break;
					}

					// 超出提示
					if (totalProjects > maxItems) {
						const moreEl = listEl.createDiv({ cls: 'pe2-more-items' });
						moreEl.textContent = `...还有 ${totalProjects - maxItems} 个项目`;
						moreEl.addEventListener('click', () => {
							explorerCurrentSection = key;
							explorerHistory = [basePath];
							explorerHistoryIndex = 0;
							switchView('explorer');
						});
					}

					// 底部统计
					const footerEl = sectionEl.createDiv({ cls: 'pe2-section-footer' });
					const catCount = categories.length;
					footerEl.textContent = `🏷${catCount}个分类 · 🚀${totalProjects}个项目`;

					// 新建项目按钮
					const newProjectBtn = sectionEl.createEl('button', {
						cls: 'pe2-new-project-btn',
						text: '+ 新建项目'
					});
					newProjectBtn.addEventListener('click', () => {
						showNewProjectModal(basePath);
					});

				// ---- 其他栏（A1/R2/A3）：保持原有逻辑 ----
				} else {
					const children = baseFolder.children.slice();
					const { folders, files } = countDirectChildren(baseFolder);
					const itemCount = children.length;

					const headerCount = headerEl.createSpan({ cls: 'pe2-section-count' });
					headerCount.textContent = `${itemCount}`;

					const listEl = sectionEl.createDiv({ cls: 'pe2-section-list' });

					// 排序：文件夹优先，使用概览排序规则
					children.sort((a, b) => {
						const aIsFolder = a instanceof TFolder;
						const bIsFolder = b instanceof TFolder;
						if (aIsFolder !== bIsFolder) return aIsFolder ? -1 : 1;
						switch (overviewSortBy) {
							case 'name-asc': return a.name.localeCompare(b.name, 'zh-CN');
							case 'name-desc': return b.name.localeCompare(a.name, 'zh-CN');
							case 'prefix-asc': {
								const pa = getPrefixNumber(a.name);
								const pb = getPrefixNumber(b.name);
								if (pa !== pb) return pa - pb;
								return a.name.localeCompare(b.name, 'zh-CN');
							}
							case 'mtime-asc': return ((a as any).stat?.mtime || 0) - ((b as any).stat?.mtime || 0);
							case 'mtime-desc':
							default: return ((b as any).stat?.mtime || 0) - ((a as any).stat?.mtime || 0);
						}
					});

					let displayedCount = 0;
					for (const item of children) {
						if (displayedCount >= maxItems) break;

						if (item instanceof TFolder) {
							const { folders: subF, files: subFi } = countDirectChildren(item);
							const mtime = getFolderMtime(item);
							const mtimeStr = mtime > 0 ? formatDate(mtime) : '';
							totalFiles += countAllFiles(item);

							const itemEl = listEl.createDiv({ cls: 'pe2-project-item pe2-project-default' });

							// 状态指示
							const statusEl = itemEl.createSpan({ cls: 'pe2-project-status' });
							statusEl.textContent = '📁';

							// 名称与信息
							const infoContainer = itemEl.createDiv({ cls: 'pe2-project-info' });
							const nameEl = infoContainer.createDiv({ cls: 'pe2-project-name' });
							nameEl.textContent = item.name;

							const metaEl = infoContainer.createDiv({ cls: 'pe2-project-meta' });
							let metaText = `📁${subF} 📄${subFi}`;
							if (mtimeStr) metaText += ` · ${mtimeStr}`;
							metaEl.textContent = metaText;

							// 点击进入浏览模式
							itemEl.addEventListener('click', () => {
								explorerCurrentSection = key;
								explorerHistory = [item.path];
								explorerHistoryIndex = 0;
								switchView('explorer');
							});

							// 右键菜单
							itemEl.addEventListener('contextmenu', (e) => {
								e.preventDefault();
								showOverviewContextMenu(e, item, key, null);
							});

						} else {
							// 文件（非文件夹，在根目录下的散文件）
							const file = item as TFile;
							totalFiles++;
							const itemEl = listEl.createDiv({ cls: 'pe2-file-item' });
							const iconEl = itemEl.createSpan({ cls: 'pe2-file-icon' });
							iconEl.textContent = getFileIcon(file.extension);
							const nameEl = itemEl.createSpan({ cls: 'pe2-file-name' });
							nameEl.textContent = file.name;

							itemEl.addEventListener('click', async () => {
								const leaf = app.workspace.getLeaf(true);
								await leaf.openFile(file);
							});

						itemEl.addEventListener('contextmenu', (e) => {
							e.preventDefault();
							showFileContextMenu(e, file, key);
						});
						}

						displayedCount++;
					}

					// 超出提示
					if (children.length > maxItems) {
						const moreEl = listEl.createDiv({ cls: 'pe2-more-items' });
						moreEl.textContent = `...还有 ${children.length - maxItems} 项`;
						moreEl.addEventListener('click', () => {
							explorerCurrentSection = key;
							explorerHistory = [basePath];
							explorerHistoryIndex = 0;
							switchView('explorer');
						});
					}

					// 底部统计
					const footerEl = sectionEl.createDiv({ cls: 'pe2-section-footer' });
					footerEl.textContent = `📁${folders} 📄${files}`;
				}
			}

			// 顶部统计栏
			const statsBar = overviewContainer.createDiv({ cls: 'pe2-stats-bar' });
			const parts: string[] = [];
			if (params.P0) parts.push(`🚀 项目: ${totalActive}活跃${totalPaused > 0 ? ` / ${totalPaused}暂停` : ''}`);
			if (params.A1) {
				const a1Folder = app.vault.getAbstractFileByPath(params.A1);
				if (a1Folder instanceof TFolder) parts.push(`📂 领域: ${a1Folder.children.filter(c => c instanceof TFolder).length}`);
			}
			if (params.R2) {
				const r2Folder = app.vault.getAbstractFileByPath(params.R2);
				if (r2Folder instanceof TFolder) parts.push(`📚 资源: ${r2Folder.children.filter(c => c instanceof TFolder).length}`);
			}
			if (params.A3) {
				const a3Folder = app.vault.getAbstractFileByPath(params.A3);
				if (a3Folder instanceof TFolder) parts.push(`📦 档案: ${a3Folder.children.filter(c => c instanceof TFolder).length}`);
			}
			parts.push(`总文件: ${totalFiles}`);
			statsBar.textContent = parts.join('  |  ');
		}

		// ==================== 概览右键菜单 ====================
		function showOverviewContextMenu(e: MouseEvent, folder: TFolder, sectionKey: ParaSectionKey, status: string | null) {
			const menu = new Menu();

			// 移动到其他类目
			const moveSections = sectionKeys.filter(key => key !== sectionKey && params[key]);
			if (moveSections.length > 0) {
				menu.addItem((menuItem) => {
					menuItem.setTitle('移动到...').setIcon('arrow-right');
					// @ts-ignore
					const subMenu = menuItem.setSubmenu();
					moveSections.forEach(key => {
						const secConfig = SECTION_CONFIG[key];
						const targetPath = params[key];
						if (!targetPath) return;
						subMenu.addItem((subItem: MenuItem) => {
							subItem.setTitle(`${secConfig.emoji} ${secConfig.label}`)
								.onClick(async () => {
									try {
										const newPath = `${targetPath}/${folder.name}`;
										await app.fileManager.renameFile(folder, newPath);
										new Notice(`已移动到 ${secConfig.label}`);
										renderOverview();
									} catch (error: any) {
										new Notice(`移动失败: ${error.message}`, 5000);
									}
								});
						});
					});
				});
				menu.addSeparator();
			}

			// 生命周期操作（仅项目栏）
			if (sectionKey === PROJECT_SECTION_KEY) {
				if (status === 'active') {
					menu.addItem((mi) => {
						mi.setTitle('暂停项目').onClick(async () => {
							await setFolderStatus(folder, 'paused');
							new Notice(`已暂停: ${folder.name}`);
							renderOverview();
						});
					});
				}
				if (status === 'paused') {
					menu.addItem((mi) => {
						mi.setTitle('重新激活').onClick(async () => {
							await setFolderStatus(folder, 'active');
							new Notice(`已重新激活: ${folder.name}`);
							renderOverview();
						});
					});
				}
				if (status === 'active' || status === 'paused') {
					menu.addItem((mi) => {
						mi.setTitle('完成并归档').onClick(() => {
							showArchiveConfirmModal(folder);
						});
					});
				}
				menu.addSeparator();
			}

		// 档案栏：项目化（移回项目分类）
		if (sectionKey === ARCHIVE_SECTION_KEY) {
			menu.addItem((mi) => {
				mi.setTitle('🚀 项目化').onClick(() => {
					const detectedCategory = getDetectedProjectCategory(folder);
					showProjectizeModal({
						item: folder,
						itemType: 'folder',
						fromArchive: true,
						detectedCategory,
					});
				});
			});
			menu.addSeparator();
		}

		// 非项目栏（A1/R2/A3）：文件夹项目化
		if (sectionKey !== PROJECT_SECTION_KEY && sectionKey !== ARCHIVE_SECTION_KEY) {
			menu.addItem((mi) => {
				const hasSameName = hasSameNameMd(folder);
				mi.setTitle('🚀 项目化');
				if (!hasSameName) {
					mi.setDisabled(true);
				}
				mi.onClick(() => {
					if (!hasSameName) {
						new Notice('项目化需要目录下存在同名md文档', 4000);
						return;
					}
					showProjectizeModal({
						item: folder,
						itemType: 'folder',
					});
				});
			});
			menu.addSeparator();
		}

			menu.addItem((mi) => {
				mi.setTitle('文件管理器中打开').setIcon('folder').onClick(() => openInSystemExplorer(folder));
			});

			menu.addSeparator();

			menu.addItem((mi) => {
				mi.setTitle('重命名').setIcon('pencil').onClick(() => showRenameModal(folder));
			});

			menu.addItem((mi) => {
				mi.setTitle('删除').setIcon('trash').onClick(() => showDeleteConfirm(folder));
			});

			menu.showAtMouseEvent(e);
		}

	// 文件右键菜单
		function showFileContextMenu(e: MouseEvent, file: TFile, sectionKey?: ParaSectionKey) {
			const menu = new Menu();

			// 非项目栏文件：项目化
			if (sectionKey && sectionKey !== PROJECT_SECTION_KEY && sectionKey !== ARCHIVE_SECTION_KEY) {
				menu.addItem((mi) => {
					mi.setTitle('🚀 项目化').onClick(() => {
						showProjectizeModal({
							item: file,
							itemType: 'file',
						});
					});
				});
				menu.addSeparator();
			}

			const moveSections = sectionKeys.filter(key => params[key] && params[key] !== file.parent?.path);
			if (moveSections.length > 0) {
				menu.addItem((menuItem) => {
					menuItem.setTitle('移动到...').setIcon('arrow-right');
					// @ts-ignore
					const subMenu = menuItem.setSubmenu();
					moveSections.forEach(key => {
						const secConfig = SECTION_CONFIG[key];
						const targetPath = params[key];
						if (!targetPath) return;
						subMenu.addItem((subItem: MenuItem) => {
							subItem.setTitle(`${secConfig.emoji} ${secConfig.label}`)
								.onClick(async () => {
									try {
										const newPath = `${targetPath}/${file.name}`;
										await app.fileManager.renameFile(file, newPath);
										new Notice(`已移动到 ${secConfig.label}`);
										if (currentView === 'overview') renderOverview();
										else renderExplorer();
									} catch (error: any) {
										new Notice(`移动失败: ${error.message}`, 5000);
									}
								});
						});
					});
				});
				menu.addSeparator();
			}

			menu.addItem((mi) => {
				mi.setTitle('文件管理器中打开').setIcon('folder').onClick(() => openInSystemExplorer(file));
			});

			menu.addSeparator();

			menu.addItem((mi) => {
				mi.setTitle('重命名').setIcon('pencil').onClick(() => showRenameModal(file));
			});

			menu.addItem((mi) => {
				mi.setTitle('删除').setIcon('trash').onClick(() => showDeleteConfirm(file));
			});

			menu.showAtMouseEvent(e);
		}

		// ==================== 归档目录映射 ====================
		function mapProjectCategoryToArchive(categoryName: string): string {
			// 新规则：所有项目分类统一归档到 "00-已完成项目" 下对应的同名子目录
			// 如 "00-工作项目" → "00-已完成项目/00-工作项目"
			//     "05-碎片集合" → "00-已完成项目/05-碎片集合"
			return `00-已完成项目/${categoryName}`;
		}

		function getArchiveSubPath(folder: TFolder): string {
			// 根据项目的父目录确定归档目标子目录
			const archiveBase = params.A3;
			if (!archiveBase) return '';

			const parentFolder = folder.parent;
			if (!parentFolder) return `${archiveBase}/${folder.name}`;

			// 判断父目录是否为项目根目录的直接子目录（一级分类）
			const projectBase = params.P0;
			if (projectBase && parentFolder.path === projectBase) {
				// folder 本身就是一级分类目录（不应直接归档分类目录）
				return `${archiveBase}/${folder.name}`;
			}

			if (projectBase && parentFolder.parent && parentFolder.parent.path === projectBase) {
				// folder 是二级项目，parentFolder 是一级分类
				const archiveSubName = mapProjectCategoryToArchive(parentFolder.name);
				return `${archiveBase}/${archiveSubName}/${folder.name}`;
			}

			// 非项目目录下的文件夹，直接归到档案根目录
			return `${archiveBase}/${folder.name}`;
		}

	// ==================== 项目化辅助函数 ====================

		// 检查文件夹中是否存在同名md文档（不含后缀）
		function hasSameNameMd(folder: TFolder): boolean {
			return folder.children.some(c =>
				c instanceof TFile && c.extension === 'md' && c.basename === folder.name
			);
		}

		// 获取项目分类的一级子目录列表（如 00-工作项目, 01-学习项目 等）
		function getProjectSubCategories(): TFolder[] {
			const projectBase = params.P0;
			if (!projectBase) return [];
			const baseFolder = app.vault.getAbstractFileByPath(projectBase);
			if (!(baseFolder instanceof TFolder)) return [];
			return baseFolder.children.filter(c => c instanceof TFolder) as TFolder[];
		}

		// 从归档路径中推导出原项目分类名
		// 归档结构: A3/00-已完成项目/原分类名/项目文件夹
		// 返回原分类名，如 "00-工作项目"
		function getDetectedProjectCategory(folder: TFolder): string | null {
			const archiveBase = params.A3;
			if (!archiveBase) return null;

			// folder 必须在档案目录下
			if (!folder.path.startsWith(archiveBase + '/')) return null;

			// 检查 parent 是否为 "00-已完成项目/某分类"
			const parent = folder.parent;
			if (!parent) return null;

			// parent 路径应该形如 A3/00-已完成项目/某分类名
			const completedBase = `${archiveBase}/00-已完成项目`;
			if (parent.path.startsWith(completedBase + '/')) {
				// parent 是分类目录，返回其名称
				return parent.name;
			}
			// 如果 folder 直接在 A3 下，没有分类
			return null;
		}

		// 从归档路径推导项目分类 → 返回对应的项目子目录路径
		function getProjectSubPathFromArchive(folder: TFolder): string | null {
			const categoryName = getDetectedProjectCategory(folder);
			if (!categoryName) return null;
			const projectBase = params.P0;
			if (!projectBase) return null;
			return `${projectBase}/${categoryName}`;
		}

		// ==================== 项目化 Modal ====================
		function showProjectizeModal(opts: {
			item: TFile | TFolder;
			itemType: 'file' | 'folder';
			fromArchive?: boolean;
			detectedCategory?: string | null;
		}) {
			const { item, itemType, fromArchive = false, detectedCategory = null } = opts;
			const modal = new Modal(app);
			modal.titleEl.setText('🚀 项目化');
			modal.titleEl.style.marginBottom = '16px';

			const content = modal.contentEl;
			content.style.display = 'flex';
			content.style.flexDirection = 'column';
			content.style.gap = '16px';

			const projectBase = params.P0;
			if (!projectBase) {
				content.createEl('div', { text: '❌ 未配置项目目录 (P0)', cls: 'para-explorer-error' });
				const closeBtn = content.createEl('button', { text: '关闭' });
				closeBtn.addEventListener('click', () => modal.close());
				modal.open();
				return;
			}

			const subCategories = getProjectSubCategories();

			if (itemType === 'folder') {
				// 文件夹项目化
				const folder = item as TFolder;
				const desc = content.createEl('p');
				desc.textContent = `将「${folder.name}」项目化，移回项目分类？`;
				desc.style.margin = '0';

				if (fromArchive && detectedCategory) {
					// 已归档项目：自动检测到原分类
					const autoInfo = content.createEl('p');
					autoInfo.textContent = `🔍 检测到原分类: ${detectedCategory}`;
					autoInfo.style.margin = '0';
					autoInfo.style.color = 'var(--text-accent)';
					autoInfo.style.fontSize = '13px';
				}

				let selectedCategory = '';
				if (subCategories.length > 0) {
					new Setting(content)
						.setName('目标分类')
						.setDesc('选择项目要放入的项目子分类')
						.addDropdown((dropdown) => {
							for (const sf of subCategories) {
								dropdown.addOption(sf.path, sf.name);
							}
							// 如果检测到原分类，默认选中它
							if (fromArchive && detectedCategory) {
								const matchSub = subCategories.find(sf => sf.name === detectedCategory);
								if (matchSub) {
									dropdown.setValue(matchSub.path);
									selectedCategory = matchSub.path;
								}
							}
							if (!selectedCategory && subCategories.length > 0) {
								selectedCategory = subCategories[0].path;
							}
							dropdown.onChange((value) => { selectedCategory = value; });
						});
				}

				const buttonContainer = content.createDiv();
				buttonContainer.style.display = 'flex';
				buttonContainer.style.justifyContent = 'flex-end';
				buttonContainer.style.gap = '8px';
				buttonContainer.style.marginTop = '8px';

				const cancelBtn = buttonContainer.createEl('button', { text: '取消' });
				cancelBtn.addEventListener('click', () => modal.close());

				const confirmBtn = buttonContainer.createEl('button', { text: '项目化', cls: 'mod-cta' });
				confirmBtn.addEventListener('click', async () => {
					if (!selectedCategory) {
						new Notice('请选择目标分类', 3000);
						return;
					}
					const targetPath = `${selectedCategory}/${folder.name}`;
					try {
						// 检查目标是否已存在
						const existing = app.vault.getAbstractFileByPath(targetPath);
						if (existing) {
							new Notice(`目标位置已存在: ${targetPath}`, 5000);
							return;
						}
						await app.fileManager.renameFile(folder, targetPath);
						// 更新 folder note 状态
						const movedFolder = app.vault.getAbstractFileByPath(targetPath);
						if (movedFolder instanceof TFolder) {
							await setFolderStatus(movedFolder, 'active');
						}
						new Notice(`已项目化: ${folder.name}`);
						modal.close();
						if (currentView === 'overview') renderOverview();
						else renderExplorer();
					} catch (error: any) {
						new Notice(`项目化失败: ${error.message}`, 5000);
					}
				});

			} else {
				// 单文件项目化
				const file = item as TFile;
				const baseName = file.basename; // 不含后缀的文件名

				const desc = content.createEl('p');
				desc.textContent = `将文件「${file.name}」项目化？`;
				desc.style.margin = '0';

				const tipInfo = content.createEl('p');
				tipInfo.textContent = `📁 将创建同名目录「${baseName}」，并将文件移入其中`;
				tipInfo.style.margin = '0';
				tipInfo.style.color = 'var(--text-muted)';
				tipInfo.style.fontSize = '13px';

				let selectedCategory = '';
				if (subCategories.length > 0) {
					new Setting(content)
						.setName('目标分类')
						.setDesc('选择项目要放入的项目子分类')
						.addDropdown((dropdown) => {
							for (const sf of subCategories) {
								dropdown.addOption(sf.path, sf.name);
							}
							// 默认选中 05-碎片集合
							const defaultSub = subCategories.find(sf => sf.name === '05-碎片集合');
							if (defaultSub) {
								dropdown.setValue(defaultSub.path);
								selectedCategory = defaultSub.path;
							} else if (subCategories.length > 0) {
								selectedCategory = subCategories[0].path;
							}
							dropdown.onChange((value) => { selectedCategory = value; });
						});
				}

				const buttonContainer = content.createDiv();
				buttonContainer.style.display = 'flex';
				buttonContainer.style.justifyContent = 'flex-end';
				buttonContainer.style.gap = '8px';
				buttonContainer.style.marginTop = '8px';

				const cancelBtn = buttonContainer.createEl('button', { text: '取消' });
				cancelBtn.addEventListener('click', () => modal.close());

				const confirmBtn = buttonContainer.createEl('button', { text: '项目化', cls: 'mod-cta' });
				confirmBtn.addEventListener('click', async () => {
					if (!selectedCategory) {
						new Notice('请选择目标分类', 3000);
						return;
					}
					const newFolderPath = `${selectedCategory}/${baseName}`;
					try {
						// 检查目标目录是否已存在
						const existingDir = app.vault.getAbstractFileByPath(newFolderPath);
						if (existingDir) {
							new Notice(`目标目录已存在: ${newFolderPath}`, 5000);
							return;
						}
						// 创建同名目录
						await app.vault.createFolder(newFolderPath);
						// 将文件移入（保持原文件名）
						const newFilePath = `${newFolderPath}/${file.name}`;
						await app.fileManager.renameFile(file, newFilePath);
						// 更新 folder note 状态
						const movedFolder = app.vault.getAbstractFileByPath(newFolderPath);
						if (movedFolder instanceof TFolder) {
							await setFolderStatus(movedFolder, 'active');
						}
						new Notice(`已项目化: ${baseName}`);
						modal.close();
						if (currentView === 'overview') renderOverview();
						else renderExplorer();
					} catch (error: any) {
						new Notice(`项目化失败: ${error.message}`, 5000);
					}
				});
			}

			modal.open();
		}

		// ==================== 归档确认 Modal ====================
		function showArchiveConfirmModal(folder: TFolder) {
			const modal = new Modal(app);
			modal.titleEl.setText('完成并归档');
			modal.titleEl.style.marginBottom = '16px';

			const content = modal.contentEl;
			content.style.display = 'flex';
			content.style.flexDirection = 'column';
			content.style.gap = '16px';

			const desc = content.createEl('p');
			desc.textContent = `将「${folder.name}」归档到档案？`;
			desc.style.margin = '0';

			const archiveBase = params.A3;
			if (!archiveBase) {
				content.createEl('div', { text: '❌ 未配置档案目录 (A3)', cls: 'para-explorer-error' });
				const closeBtn = content.createEl('button', { text: '关闭' });
				closeBtn.addEventListener('click', () => modal.close());
				modal.open();
				return;
			}

			const targetPath = getArchiveSubPath(folder);
			const targetInfo = content.createEl('p');
			targetInfo.textContent = `目标: ${targetPath}`;
			targetInfo.style.margin = '0';
			targetInfo.style.color = 'var(--text-muted)';
			targetInfo.style.fontSize = '13px';

			const buttonContainer = content.createDiv();
			buttonContainer.style.display = 'flex';
			buttonContainer.style.justifyContent = 'flex-end';
			buttonContainer.style.gap = '8px';
			buttonContainer.style.marginTop = '8px';

			const cancelBtn = buttonContainer.createEl('button', { text: '取消' });
			cancelBtn.addEventListener('click', () => modal.close());

			const archiveBtn = buttonContainer.createEl('button', { text: '归档', cls: 'mod-cta' });
			archiveBtn.addEventListener('click', async () => {
				try {
					// 确保目标子目录存在（递归创建所有中间目录）
					const pathParts = targetPath.split('/');
					pathParts.pop(); // 去掉最后的 folder.name，得到目标父目录
					const parentArchivePath = pathParts.join('/');
					// 逐级创建：从 archiveBase 之后开始，依次创建每一级
					const baseParts = archiveBase.split('/');
					let currentPath = '';
					for (const part of pathParts) {
						currentPath = currentPath ? `${currentPath}/${part}` : part;
						if (currentPath.length <= archiveBase.length) continue; // archiveBase 本身已存在
						const existingDir = app.vault.getAbstractFileByPath(currentPath);
						if (!existingDir) {
							await app.vault.createFolder(currentPath);
						}
					}

					await app.fileManager.renameFile(folder, targetPath);
					// 更新状态为 completed
					const movedFolder = app.vault.getAbstractFileByPath(targetPath);
					if (movedFolder instanceof TFolder) {
						await setFolderStatus(movedFolder, 'completed');
					}
					new Notice(`已归档: ${folder.name}`);
					modal.close();
					if (currentView === 'overview') renderOverview();
					else renderExplorer();
				} catch (error: any) {
					new Notice(`归档失败: ${error.message}`, 5000);
				}
			});

			modal.open();
		}

		// ==================== 项目类型映射 ====================
		const SUBFOLDER_TO_TYPE: Record<string, string> = {
			'00-工作项目': '工作',
			'01-学习项目': '学习',
			'02-生活项目': '生活',
			'03-其他项目': '其他',
			'05-碎片集合': '碎片',
		};

		function getSubFolderType(subFolderName: string): string {
			return SUBFOLDER_TO_TYPE[subFolderName] || '其他';
		}

		function generateProjectNoteContent(projectName: string, projectType: string, projectPath: string): string {
			const today = new Date().toISOString().slice(0, 10);
			const ddl = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
			return `---
type: ${projectType}
progress: 0  # 取值范围0-100
tags: 未完成
ddl: ${ddl}
status: active
created: ${today}
---

# ${projectName}

## 项目描述
<!-- 简要说明项目目标、核心任务 -->


## 关键节点
<!-- 预计完成时间 -->
- [ ] 

## 进度记录

\`\`\`jhua-progress
- ${today} | 初始创建，进度0% | -
\`\`\`

\`\`\`para-explorer
P0: ${projectPath}
A1:
R2: 
A3: 

\`\`\`

## 备注
<!-- 记录项目中的问题、调整等 -->
`;
		}

		// ==================== 新建项目 Modal ====================
		function showNewProjectModal(basePath: string) {
			const modal = new Modal(app);
			modal.titleEl.setText('新建项目');
			modal.titleEl.style.marginBottom = '16px';

			const content = modal.contentEl;
			content.style.display = 'flex';
			content.style.flexDirection = 'column';
			content.style.gap = '16px';

			let projectName = '';
			let selectedSubFolder = '';
			let nameInput: HTMLInputElement;

			// 项目名称
			new Setting(content)
				.setName('项目名称')
				.addText((text) => {
					nameInput = text.inputEl;
					text.setPlaceholder('输入项目名称...');
					text.inputEl.style.width = '100%';
					text.onChange((value) => { projectName = value; });
				});

			// 子分类选择（无"根目录"选项，默认00-工作项目）
			const baseFolder = app.vault.getAbstractFileByPath(basePath);
			if (baseFolder instanceof TFolder) {
				const subFolders = baseFolder.children.filter(c => c instanceof TFolder) as TFolder[];
				if (subFolders.length > 0) {
					subFolders.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
					// 默认选中"00-工作项目"，找不到则取排序后第一个
					const defaultSub = subFolders.find(sf => sf.name === '00-工作项目') || subFolders[0];
					selectedSubFolder = defaultSub.path;

					new Setting(content)
						.setName('子分类')
						.setDesc('选择项目所在子文件夹')
						.addDropdown((dropdown) => {
							for (const sf of subFolders) {
								dropdown.addOption(sf.path, sf.name);
							}
							dropdown.setValue(defaultSub.path);
							dropdown.onChange((value) => { selectedSubFolder = value; });
						});
				}
			}

			const buttonContainer = content.createDiv();
			buttonContainer.style.display = 'flex';
			buttonContainer.style.justifyContent = 'flex-end';
			buttonContainer.style.gap = '8px';
			buttonContainer.style.marginTop = '8px';

			const cancelBtn = buttonContainer.createEl('button', { text: '取消' });
			cancelBtn.addEventListener('click', () => modal.close());

			const createBtn = buttonContainer.createEl('button', { text: '创建', cls: 'mod-cta' });
			const doCreate = async () => {
				const name = projectName.trim();
				if (!name) return;
				if (!selectedSubFolder) {
					new Notice('请选择子分类', 3000);
					return;
				}
				const targetPath = `${selectedSubFolder}/${name}`;
				try {
					// 检查并创建目录
					const existing = app.vault.getAbstractFileByPath(targetPath);
					if (existing) {
						new Notice('该项目已存在', 5000);
						return;
					}
					await app.vault.createFolder(targetPath);

				// 从子分类推导项目类型
				const subFolderName = selectedSubFolder.split('/').pop() || '';
				const projectType = getSubFolderType(subFolderName);

					// 创建 folder note（参照项目模板格式）
					const folderNotePath = `${targetPath}/${name}.md`;
					const noteContent = generateProjectNoteContent(name, projectType, targetPath);
					await app.vault.create(folderNotePath, noteContent);
					new Notice(`已创建项目: ${name}`);
					modal.close();
					if (currentView === 'overview') renderOverview();
					else renderExplorer();
				} catch (error: any) {
					new Notice(`创建失败: ${error.message}`, 5000);
				}
			};
			createBtn.addEventListener('click', doCreate);

			modal.contentEl.addEventListener('keydown', (e) => {
				if (e.key === 'Enter') { e.preventDefault(); doCreate(); }
			});

			modal.open();
			setTimeout(() => nameInput?.focus(), 10);
		}

		// ==================== 重命名 Modal ====================
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
					text.onChange((value) => { newName = value; });
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
						if (currentView === 'overview') renderOverview();
						else renderExplorer();
					} catch (error: any) {
						new Notice(`重命名失败: ${error.message}`, 5000);
					}
				}
				modal.close();
			};
			renameBtn.addEventListener('click', doRename);

			modal.contentEl.addEventListener('keydown', (e) => {
				if (e.key === 'Enter') { e.preventDefault(); doRename(); }
			});

			modal.open();
			setTimeout(() => textInput?.focus(), 10);
		}

		// ==================== 删除确认 Modal ====================
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
					if (currentView === 'overview') renderOverview();
					else renderExplorer();
				} catch (error: any) {
					new Notice(`删除失败: ${error.message}`, 5000);
				}
				modal.close();
			});

			modal.open();
		}

		// ==================== 浏览模式渲染（保留原 para-explorer 全部功能） ====================
		function renderExplorer() {
			explorerContainer.empty();

			const navEl = explorerContainer.createDiv({ cls: 'para-explorer-nav' });
			const sectionButtons: Record<string, HTMLButtonElement> = {};

			sectionKeys.forEach(key => {
				const secConfig = SECTION_CONFIG[key];
				const btn = navEl.createEl('button', {
					cls: 'para-explorer-nav-btn',
					text: `${secConfig.emoji} ${secConfig.label}`
				});
				sectionButtons[key] = btn;
			});

			// 返回概览按钮
			const backToOverview = navEl.createEl('button', {
				cls: 'para-explorer-nav-btn pe2-back-overview-btn',
				text: '◀ 概览'
			});
			backToOverview.addEventListener('click', () => switchView('overview'));

			const contentEl = explorerContainer.createDiv({ cls: 'para-explorer-content' });

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

			// Sort
			const sortSelect = toolbarEl.createEl('select', { cls: 'para-explorer-sort-select' });
			sortSelect.createEl('option', { value: 'mtime-desc', text: '🕐 最近修改' });
			sortSelect.createEl('option', { value: 'mtime-asc', text: '🕐 最早修改' });
			sortSelect.createEl('option', { value: 'name-asc', text: '🔤 名称 A→Z' });
			sortSelect.createEl('option', { value: 'name-desc', text: '🔤 名称 Z→A' });
			sortSelect.createEl('option', { value: 'prefix-asc', text: '🔢 前缀 0→9' });
			sortSelect.createEl('option', { value: 'size-desc', text: '📦 大小 大→小' });
			sortSelect.createEl('option', { value: 'size-asc', text: '📦 大小 小→大' });

			const statsEl = toolbarEl.createDiv({ cls: 'para-explorer-stats' });

			// Path bar
			const pathBarEl = contentEl.createDiv({ cls: 'para-explorer-pathbar' });
			const backBtn = pathBarEl.createEl('button', { cls: 'para-explorer-nav-arrow', text: '◀', attr: { title: '后退' } });
			const forwardBtn = pathBarEl.createEl('button', { cls: 'para-explorer-nav-arrow', text: '▶', attr: { title: '前进' } });
			const pathTextEl = pathBarEl.createSpan({ cls: 'para-explorer-path-text' });

			// File list
			const fileListEl = contentEl.createDiv({ cls: 'para-explorer-filelist' });

			const getCurrentPath = () => explorerHistory[explorerHistoryIndex];

			// ==================== updateView ====================
			const updateExplorerView = async () => {
				sectionKeys.forEach(key => {
					if (key === explorerCurrentSection) {
						sectionButtons[key].addClass('para-explorer-nav-btn-active');
					} else {
						sectionButtons[key].removeClass('para-explorer-nav-btn-active');
					}
				});

				const currentPath = explorerHistory[explorerHistoryIndex];
				backBtn.disabled = explorerHistoryIndex <= 0;
				forwardBtn.disabled = explorerHistoryIndex >= explorerHistory.length - 1;
				pathTextEl.textContent = currentPath;

				fileListEl.empty();

				const folder = app.vault.getAbstractFileByPath(currentPath);
				if (!(folder instanceof TFolder)) {
					fileListEl.createEl('div', { text: `目录不存在: ${currentPath}`, cls: 'para-explorer-error' });
					return;
				}

				let displayChildren = folder.children.slice();
				const basePath = params[explorerCurrentSection]!;
				const isBaseDirectory = currentPath === basePath;

				const fileCount = displayChildren.filter(item => item instanceof TFile).length;
				const folderCount = displayChildren.filter(item => item instanceof TFolder).length;
				statsEl.textContent = `📁 ${folderCount}  📄 ${fileCount}`;

				// Sort
				const sortValue = sortSelect.value || 'mtime-desc';
				displayChildren.sort((a, b) => {
					const aIsFolder = a instanceof TFolder;
					const bIsFolder = b instanceof TFolder;
					switch (sortValue) {
						case 'mtime-desc': return (b as any).stat?.mtime - (a as any).stat?.mtime;
						case 'mtime-asc': return (a as any).stat?.mtime - (b as any).stat?.mtime;
						case 'name-asc': return a.name.localeCompare(b.name, 'zh-CN');
						case 'name-desc': return b.name.localeCompare(a.name, 'zh-CN');
						case 'prefix-asc': {
							const pa = getPrefixNumber(a.name);
							const pb = getPrefixNumber(b.name);
							if (pa !== pb) return pa - pb;
							return a.name.localeCompare(b.name, 'zh-CN');
						}
						case 'size-desc': return ((b as any).stat?.size || 0) - ((a as any).stat?.size || 0);
						case 'size-asc': return ((a as any).stat?.size || 0) - ((b as any).stat?.size || 0);
						default: return (b as any).stat?.mtime - (a as any).stat?.mtime;
					}
				});

				// 状态标签（项目子文件夹显示状态）
				const isProjectSection = explorerCurrentSection === PROJECT_SECTION_KEY;

				// Parent directory
				if (!isBaseDirectory) {
					const parentEl = fileListEl.createDiv({ cls: 'para-explorer-item para-explorer-folder para-explorer-parent' });
					parentEl.createSpan({ cls: 'para-explorer-icon' }).textContent = '⬆️';
					parentEl.createSpan({ cls: 'para-explorer-name' }).textContent = '.. (上级目录)';
					parentEl.addEventListener('click', () => {
						const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/';
						explorerHistory = explorerHistory.slice(0, explorerHistoryIndex + 1);
						explorerHistory.push(parentPath);
						explorerHistoryIndex++;
						updateExplorerView();
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
						// 项目状态指示
						if (isProjectSection) {
							const status = getFolderStatus(item);
							if (status === 'paused') {
								iconEl.textContent = '🟡';
							} else if (status === 'completed') {
								iconEl.textContent = '✅';
							} else {
								iconEl.textContent = '📁';
							}
						} else {
							iconEl.textContent = '📁';
						}

						nameEl.textContent = item.name;
						const subFileCount = item.children.filter(c => c instanceof TFile).length;
						const subFolderCount = item.children.filter(c => c instanceof TFolder).length;
						let infoText = `📁${subFolderCount} 📄${subFileCount}`;
						if (isProjectSection) {
							const status = getFolderStatus(item);
							if (status === 'paused') infoText += ' · 已暂停';
							if (status === 'completed') infoText += ' · 已完成';
						}
						infoEl.textContent = infoText;

						itemEl.addEventListener('click', (e) => {
							if ((e as MouseEvent).button === 0) {
								explorerHistory = explorerHistory.slice(0, explorerHistoryIndex + 1);
								explorerHistory.push(item.path);
								explorerHistoryIndex++;
								updateExplorerView();
							}
						});

						itemEl.addEventListener('contextmenu', (e) => {
							e.preventDefault();
							showExplorerContextMenu(e, item);
						});

						setupDropTarget(itemEl, item);
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
							showExplorerContextMenu(e, item);
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
						fileListEl.querySelectorAll('.para-explorer-drop-target').forEach(el => el.removeClass('para-explorer-drop-target'));
						navEl.querySelectorAll('.para-explorer-nav-btn-drop-target').forEach(el => el.removeClass('para-explorer-nav-btn-drop-target'));
					});
				}

				if (fileListEl.childElementCount === 0) {
					fileListEl.createEl('div', { text: '暂无文件或目录', cls: 'para-explorer-empty' });
				}

				// 同步sectionMemory，确保切tab后再切回来能恢复
				sectionMemory[explorerCurrentSection] = {
					history: [...explorerHistory],
					index: explorerHistoryIndex
				};
			};

			// ==================== 浏览模式右键菜单 ====================
			function showExplorerContextMenu(e: MouseEvent, item: TFile | TFolder) {
				const menu = new Menu();

				// 移动到其他类目
				const moveSection = sectionKeys.filter(key => params[key] && params[key] !== item.parent?.path);
				if (moveSection.length > 0) {
					menu.addItem((menuItem) => {
						menuItem.setTitle('移动到...').setIcon('arrow-right');
						// @ts-ignore
						const subMenu = menuItem.setSubmenu();
						moveSection.forEach(key => {
							const secConfig = SECTION_CONFIG[key];
							const targetPath = params[key];
							if (!targetPath) return;
							subMenu.addItem((subItem: MenuItem) => {
								subItem.setTitle(`${secConfig.emoji} ${secConfig.label}`)
									.onClick(async () => {
										try {
											const newPath = `${targetPath}/${item.name}`;
											await app.fileManager.renameFile(item, newPath);
											new Notice(`已移动到 ${secConfig.label}`);
											updateExplorerView();
										} catch (error: any) {
											new Notice(`移动失败: ${error.message}`, 5000);
										}
									});
							});
						});
					});
					menu.addSeparator();
				}

				// 生命周期操作（项目文件夹）
				if (item instanceof TFolder && explorerCurrentSection === PROJECT_SECTION_KEY) {
					const status = getFolderStatus(item);
					if (status === 'active') {
						menu.addItem((mi) => {
							mi.setTitle('暂停项目').onClick(async () => {
								await setFolderStatus(item, 'paused');
								new Notice(`已暂停: ${item.name}`);
								updateExplorerView();
							});
						});
					}
					if (status === 'paused') {
						menu.addItem((mi) => {
							mi.setTitle('重新激活').onClick(async () => {
								await setFolderStatus(item, 'active');
								new Notice(`已重新激活: ${item.name}`);
								updateExplorerView();
							});
						});
					}
					if (status === 'active' || status === 'paused') {
						menu.addItem((mi) => {
							mi.setTitle('完成并归档').onClick(() => showArchiveConfirmModal(item));
						});
					}
					menu.addSeparator();
				}

			// 档案栏：项目化
			if (item instanceof TFolder && explorerCurrentSection === ARCHIVE_SECTION_KEY) {
				menu.addItem((mi) => {
					mi.setTitle('🚀 项目化').onClick(() => {
						const detectedCategory = getDetectedProjectCategory(item);
						showProjectizeModal({
							item: item,
							itemType: 'folder',
							fromArchive: true,
							detectedCategory,
						});
					});
				});
				menu.addSeparator();
			}

			// 非项目栏（A1/R2）：文件夹项目化
			if (item instanceof TFolder && explorerCurrentSection !== PROJECT_SECTION_KEY && explorerCurrentSection !== ARCHIVE_SECTION_KEY) {
				menu.addItem((mi) => {
					const hasSameName = hasSameNameMd(item);
					mi.setTitle('🚀 项目化');
					if (!hasSameName) {
						mi.setDisabled(true);
					}
					mi.onClick(() => {
						if (!hasSameName) {
							new Notice('项目化需要目录下存在同名md文档', 4000);
							return;
						}
						showProjectizeModal({
							item: item,
							itemType: 'folder',
						});
					});
				});
				menu.addSeparator();
			}

			// 非项目栏（A1/R2/A3）：文件项目化
			if (item instanceof TFile && explorerCurrentSection !== PROJECT_SECTION_KEY) {
				menu.addItem((mi) => {
					mi.setTitle('🚀 项目化').onClick(() => {
						showProjectizeModal({
							item: item,
							itemType: 'file',
						});
					});
				});
				menu.addSeparator();
			}

			menu.addItem((mi) => {
				mi.setTitle('文件管理器中打开').setIcon('folder').onClick(() => openInSystemExplorer(item));
			});

			menu.addSeparator();

			menu.addItem((mi) => {
				mi.setTitle('重命名').setIcon('pencil').onClick(() => showRenameModal(item));
			});

			menu.addItem((mi) => {
				mi.setTitle('删除').setIcon('trash').onClick(() => showDeleteConfirm(item));
			});

			menu.showAtMouseEvent(e);
		}

			function setupDropTarget(itemEl: HTMLElement, targetFolder: TFolder) {
				itemEl.addEventListener('dragover', (e) => {
					e.preventDefault();
					if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
					itemEl.addClass('para-explorer-drop-target');
				});
				itemEl.addEventListener('dragleave', () => itemEl.removeClass('para-explorer-drop-target'));
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
						updateExplorerView();
					} catch (error: any) {
						new Notice(`移动失败: ${error.message}`, 5000);
					}
				});
			}

			// Nav drop targets (cross-section move via drag)
			sectionKeys.forEach(key => {
				const btn = sectionButtons[key];
				const secConfig = SECTION_CONFIG[key];
				btn.addEventListener('dragover', (e) => {
					e.preventDefault();
					if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
					btn.addClass('para-explorer-nav-btn-drop-target');
				});
				btn.addEventListener('dragleave', () => btn.removeClass('para-explorer-nav-btn-drop-target'));
				btn.addEventListener('drop', async (e) => {
					e.preventDefault();
					btn.removeClass('para-explorer-nav-btn-drop-target');
					const sourcePath = e.dataTransfer?.getData('text/plain');
					if (!sourcePath) return;
					const targetPath = params[key]!;
					const sourceItem = app.vault.getAbstractFileByPath(sourcePath);
					if (!sourceItem) return;
					if (sourceItem.parent?.path === targetPath) return;
					if (sourcePath === targetPath) return;
					if (targetPath.startsWith(sourcePath + '/')) return;
					try {
						const newPath = `${targetPath}/${sourceItem.name}`;
						await app.fileManager.renameFile(sourceItem, newPath);
						new Notice(`已移动到 ${secConfig.label}`);
						updateExplorerView();
					} catch (error: any) {
						new Notice(`移动失败: ${error.message}`, 5000);
					}
				});
			});

		// Section nav buttons：切换tab时保存/恢复history，再次点击同tab回根目录
		sectionKeys.forEach(key => {
			sectionButtons[key].addEventListener('click', () => {
				if (explorerCurrentSection === key) {
					// 再次点击同tab：回到该tab根目录
					const rootPath = params[key]!;
					if (explorerHistory[explorerHistoryIndex] === rootPath) return;
					explorerHistory = explorerHistory.slice(0, explorerHistoryIndex + 1);
					explorerHistory.push(rootPath);
					explorerHistoryIndex++;
				} else {
					// 切换到不同tab：保存当前tab状态，恢复目标tab状态
					sectionMemory[explorerCurrentSection] = {
						history: [...explorerHistory],
						index: explorerHistoryIndex
					};
					explorerCurrentSection = key;
					const mem = sectionMemory[key];
					explorerHistory = [...mem.history];
					explorerHistoryIndex = mem.index;
				}
				updateExplorerView();
			});
		});

			// Navigation arrows
			backBtn.addEventListener('click', () => {
				if (explorerHistoryIndex > 0) { explorerHistoryIndex--; updateExplorerView(); }
			});
			forwardBtn.addEventListener('click', () => {
				if (explorerHistoryIndex < explorerHistory.length - 1) { explorerHistoryIndex++; updateExplorerView(); }
			});

			// Sort
			sortSelect.addEventListener('change', () => updateExplorerView());

			// New file
			newFileBtn.addEventListener('click', () => {
				const modal = new Modal(app);
				modal.titleEl.setText('新建文件');
				modal.titleEl.style.marginBottom = '16px';
				let fileName = '';
				let textInput: HTMLInputElement;
				const content = modal.contentEl;
				content.style.display = 'flex';
				content.style.flexDirection = 'column';
				content.style.gap = '16px';
				new Setting(content).setName('文件名').setDesc('无需输入扩展名，自动添加 .md')
					.addText((text) => {
						textInput = text.inputEl;
						text.setPlaceholder('输入文件名...');
						text.inputEl.style.width = '100%';
						text.onChange((v) => { fileName = v; });
					});
				const btns = content.createDiv();
				btns.style.display = 'flex'; btns.style.justifyContent = 'flex-end'; btns.style.gap = '8px'; btns.style.marginTop = '8px';
				btns.createEl('button', { text: '取消' }).addEventListener('click', () => modal.close());
				const createBtn = btns.createEl('button', { text: '创建', cls: 'mod-cta' });
				const doCreate = async () => {
					if (!fileName.trim()) return;
					try {
						if (!fileName.endsWith('.md')) fileName += '.md';
						const filePath = `${getCurrentPath()}/${fileName}`;
						const newFile = await app.vault.create(filePath, '');
						new Notice(`创建文件: ${fileName}`);
						updateExplorerView();
						const leaf = app.workspace.getLeaf(true);
						await leaf.openFile(newFile);
					} catch (error: any) {
						new Notice(`创建失败: ${error.message}`, 5000);
					}
					modal.close();
				};
				createBtn.addEventListener('click', doCreate);
				modal.contentEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doCreate(); } });
				modal.open();
				setTimeout(() => textInput?.focus(), 10);
			});

			// New folder
			newFolderBtn.addEventListener('click', () => {
				const modal = new Modal(app);
				modal.titleEl.setText('新建文件夹');
				modal.titleEl.style.marginBottom = '16px';
				let folderName = '';
				let textInput: HTMLInputElement;
				const content = modal.contentEl;
				content.style.display = 'flex';
				content.style.flexDirection = 'column';
				content.style.gap = '16px';
				new Setting(content).setName('文件夹名称')
					.addText((text) => {
						textInput = text.inputEl;
						text.setPlaceholder('输入文件夹名称...');
						text.inputEl.style.width = '100%';
						text.onChange((v) => { folderName = v; });
					});
				const btns = content.createDiv();
				btns.style.display = 'flex'; btns.style.justifyContent = 'flex-end'; btns.style.gap = '8px'; btns.style.marginTop = '8px';
				btns.createEl('button', { text: '取消' }).addEventListener('click', () => modal.close());
				const createBtn = btns.createEl('button', { text: '创建', cls: 'mod-cta' });
				const doCreate = async () => {
					if (!folderName.trim()) return;
					try {
						const folderPath = `${getCurrentPath()}/${folderName}`;
						await app.vault.createFolder(folderPath);
						new Notice(`创建文件夹: ${folderName}`);
						updateExplorerView();
					} catch (error: any) {
						new Notice(`创建失败: ${error.message}`, 5000);
					}
					modal.close();
				};
				createBtn.addEventListener('click', doCreate);
				modal.contentEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doCreate(); } });
				modal.open();
				setTimeout(() => textInput?.focus(), 10);
			});

			// Initial render
			updateExplorerView();
		}

		// ==================== 初始化视图 ====================
		switchView(currentView);

		return rootEl;
	}
}
