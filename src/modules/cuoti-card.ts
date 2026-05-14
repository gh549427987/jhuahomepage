import { App, TFile, Notice } from 'obsidian';

// ==================== 错题卡片参数接口 ====================
interface CuotiParams {
	T0: string;
	X1?: string;
	X2?: string;
	X3?: string;
	X4?: string;
	X5?: string;
	X6?: string;
	answer?: string;
	my_answer?: string;
	analysis?: string;
	easy_wrong?: string;
	source?: string;
	accuracy?: string;
	time_used?: string;
	kaodian?: string;
}

// ==================== 解析代码块参数 ====================
export function parseCuotiSource(source: string): CuotiParams {
	const params: CuotiParams = {} as CuotiParams;
	const lines = source.split('\n');
	let currentKey = '';
	let currentValue = '';

	for (const line of lines) {
		const trimmed = line.trim();

		const match = trimmed.match(/^(T0|X[1-6]|answer|my_answer|analysis|easy_wrong|source|accuracy|time_used|kaodian)[:=]\s*(.*)$/);
		if (match) {
			if (currentKey) {
				(params as any)[currentKey] = currentValue.trim();
			}
			currentKey = match[1];
			currentValue = match[2] || '';
		} else if (currentKey) {
			// 保留空行作为段落分隔符（对 analysis 等多行内容很重要）
			currentValue += '\n' + line;
		}
	}
	if (currentKey) {
		(params as any)[currentKey] = currentValue.trim();
	}

	return params;
}

// ==================== 解析图片路径 ====================
function resolveImageSrc(app: App, filename: string): string | null {
	const imageFile = app.vault.getFiles().find(f =>
		f.name === filename || f.path.endsWith('/' + filename)
	);
	if (imageFile) {
		return app.vault.getResourcePath(imageFile);
	}
	return null;
}

// ==================== 创建图片元素 ====================
function createImageEl(container: HTMLElement, filename: string, app: App, cls: string = 'cuoti-question-image') {
	const imgEl = container.createEl('img', {
		cls: cls,
		attr: { alt: filename, loading: 'lazy' }
	});
	// 外部URL直接使用（粉笔公式图片等）
	if (filename.startsWith('http://') || filename.startsWith('https://')) {
		imgEl.src = filename;
		imgEl.addClass('cuoti-external-image');
		return imgEl;
	}
	const src = resolveImageSrc(app, filename);
	if (src) {
		imgEl.src = src;
	} else {
		const adapter = app.vault.adapter as any;
		if (adapter.getBasePath) {
			imgEl.src = `app://local/${adapter.getBasePath()}/${filename}`;
		} else {
			imgEl.src = filename;
		}
		imgEl.addClass('cuoti-image-fallback');
	}
	return imgEl;
}

// ==================== 渲染单行富文本（高亮、加粗） ====================
function renderRichText(container: HTMLElement, text: string) {
	// ==高亮文本==
	const highlightRegex = /==([^=]+)==/g;
	let lastIndex = 0;
	let match;
	let hasHighlight = false;

	while ((match = highlightRegex.exec(text)) !== null) {
		hasHighlight = true;
		if (match.index > lastIndex) {
			container.createSpan({ text: text.substring(lastIndex, match.index) });
		}
		container.createSpan({ text: match[1], cls: 'cuoti-highlight' });
		lastIndex = match.index + match[0].length;
	}
	if (hasHighlight) {
		if (lastIndex < text.length) {
			container.createSpan({ text: text.substring(lastIndex) });
		}
	} else {
		container.createSpan({ text: text });
	}
}

// ==================== 渲染内容（含图片、高亮、步骤标题） ====================
function renderContent(container: HTMLElement, content: string, app: App) {
	if (!content) return;

	const lines = content.split('\n');
	// 追踪连续空行，用于段落分隔
	let prevWasEmpty = false;

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) {
			// 空行表示段落分隔：创建带 margin 的 <p> 间距
			if (prevWasEmpty) {
				// 连续空行只产生一个段落间距
				continue;
			}
			const spacer = container.createDiv({ cls: 'cuoti-paragraph-break' });
			prevWasEmpty = true;
			continue;
		}
		prevWasEmpty = false;

		// 独占一行的图片
		const standaloneImgMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/) ||
		                           trimmed.match(/^!\[\[([^\]]+)\]\]$/);
		if (standaloneImgMatch) {
			const filename = standaloneImgMatch[2] || standaloneImgMatch[1];
			createImageEl(container, filename, app);
			continue;
		}

		// 行内图片
		const inlineImgRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
		let lastIndex = 0;
		let inlineMatch;
		let hasInlineImage = false;

		while ((inlineMatch = inlineImgRegex.exec(trimmed)) !== null) {
			hasInlineImage = true;
			if (inlineMatch.index > lastIndex) {
				container.createSpan({ text: trimmed.substring(lastIndex, inlineMatch.index) });
			}
			createImageEl(container, inlineMatch[2], app, 'cuoti-question-image cuoti-inline-image');
			lastIndex = inlineMatch.index + inlineMatch[0].length;
		}

		if (hasInlineImage) {
			if (lastIndex < trimmed.length) {
				container.createSpan({ text: trimmed.substring(lastIndex) });
			}
			continue;
		}

		// 步骤标题加粗：第X步：、论点：、论据：等结构化标题
		const stepMatch = trimmed.match(/^(第[一二三四五六七八九十]+步[：:])/);
		const structMatch = !stepMatch && trimmed.match(/^(论点[：:]|论据[：:]|总结[：:]|综上[，,])/);

		if (stepMatch || structMatch) {
			const prefix = stepMatch ? stepMatch[1] : (structMatch as RegExpMatchArray)[1];
			const rest = trimmed.substring(prefix.length);
			const lineEl = container.createDiv({ cls: 'cuoti-step-line' });
			lineEl.createSpan({ text: prefix, cls: 'cuoti-step-title' });
			if (rest) {
				renderRichText(lineEl, rest);
			}
			continue;
		}

		// 普通行：渲染高亮等富文本
		renderRichText(container, trimmed);
	}
}

// ==================== 获取选项标签 ====================
function getOptionLabel(key: string): string {
	const map: Record<string, string> = {
		'X1': 'A', 'X2': 'B', 'X3': 'C', 'X4': 'D',
		'X5': 'E', 'X6': 'F'
	};
	return map[key] || key;
}

// ==================== 主渲染函数 ====================
export function renderCuotiCard(app: App, params: CuotiParams, el: HTMLElement, ctx?: any) {
	el.className = 'cuoti-card';
	el.dataset.jhuaRendered = 'true';

	const correctAnswer = (params.answer || '').toUpperCase().trim();
	const myAnswer = (params.my_answer || '').toUpperCase().trim();
	const easyWrong = (params.easy_wrong || '').toUpperCase().trim();

	// ====== 顶部信息栏（不含易错项） ======
	const headerEl = el.createDiv({ cls: 'cuoti-header' });
	const metaEl = headerEl.createDiv({ cls: 'cuoti-meta' });
	if (params.source) {
		metaEl.createSpan({ text: '📚 ' + params.source, cls: 'cuoti-meta-item' });
	}
	if (params.accuracy) {
		metaEl.createSpan({ text: '📊 全站正确率: ' + params.accuracy, cls: 'cuoti-meta-item' });
	}
	if (params.time_used) {
		metaEl.createSpan({ text: '⏱️ 用时: ' + params.time_used, cls: 'cuoti-meta-item' });
	}
	if (params.kaodian) {
		metaEl.createSpan({ text: '🎯 考点: ' + params.kaodian, cls: 'cuoti-meta-item' });
	}

	// ====== 题目区域 ======
	const questionEl = el.createDiv({ cls: 'cuoti-question' });
	const questionTitle = questionEl.createDiv({ cls: 'cuoti-section-title' });
	questionTitle.createSpan({ text: '📝', cls: 'cuoti-section-emoji' });
	questionTitle.createSpan({ text: '题目' });

	const questionContent = questionEl.createDiv({ cls: 'cuoti-question-content' });
	renderContent(questionContent, params.T0 || '（无题目内容）', app);

	// ====== 选项区域 ======
	const optionKeys = ['X1', 'X2', 'X3', 'X4', 'X5', 'X6'].filter(k => (params as any)[k] !== undefined);
	if (optionKeys.length === 0 && correctAnswer) {
		optionKeys.push('X1', 'X2', 'X3', 'X4');
	}

	if (optionKeys.length > 0) {
		const optionsEl = el.createDiv({ cls: 'cuoti-options' });

		// 答案与解析折叠区（默认收起）
		const answerSectionEl = el.createDiv({ cls: 'cuoti-answer-section cuoti-collapsed' });

		let answered = false;

		for (const key of optionKeys) {
			const label = getOptionLabel(key);
			const optionText = (params as any)[key] || '';

			const optionEl = optionsEl.createDiv({
				cls: 'cuoti-option',
				attr: { 'data-label': label }
			});

			const circleEl = optionEl.createDiv({ cls: 'cuoti-option-circle' });
			circleEl.createSpan({ text: label, cls: 'cuoti-option-label' });

			const contentEl = optionEl.createDiv({ cls: 'cuoti-option-text' });
			if (optionText.trim()) {
				renderContent(contentEl, optionText, app);
			} else {
				contentEl.createSpan({ text: '🖼️ 图片选项', cls: 'cuoti-option-image-hint' });
			}

			// 点击选项交互
			optionEl.addEventListener('click', async () => {
				if (answered) return;
				answered = true;

				// 标记所有选项状态
				const allOptions = optionsEl.querySelectorAll('.cuoti-option');
				allOptions.forEach((opt: any) => {
					if (!(opt instanceof HTMLElement)) return;
					const optLabel = opt.dataset.label || '';
					opt.classList.add('cuoti-option-disabled');

					if (correctAnswer.includes(optLabel)) {
						opt.classList.add('cuoti-option-correct');
					}
					if (optLabel === label && !correctAnswer.includes(optLabel)) {
						opt.classList.add('cuoti-option-wrong');
					}
				});

				const isWrong = !correctAnswer.includes(label);

				if (isWrong) {
					answerSectionEl.classList.remove('cuoti-collapsed');
					answerSectionEl.classList.add('cuoti-answer-wrong');

					if (ctx) {
						const now = new Date();
						const timeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
						const filePath = ctx?.sourcePath;
						if (filePath) {
							const file = app.vault.getAbstractFileByPath(filePath);
							if (file instanceof TFile) {
								await app.fileManager.processFrontMatter(file, (fm: any) => {
									fm.practise_count = (fm.practise_count || 0) + 1;
									fm.error_count = (fm.error_count || 0) + 1;
									fm.last_error = timeStr;
									fm['我的答案'] = label;
								});
							}
						}
					}

					new Notice('❌ 答错了！正确答案: ' + correctAnswer, 3000);
				} else {
					answerSectionEl.classList.add('cuoti-answer-correct');

					if (ctx) {
						const filePath = ctx?.sourcePath;
						if (filePath) {
							const file = app.vault.getAbstractFileByPath(filePath);
							if (file instanceof TFile) {
								await app.fileManager.processFrontMatter(file, (fm: any) => {
									fm.practise_count = (fm.practise_count || 0) + 1;
									fm['我的答案'] = label;
								});
							}
						}
					}

					new Notice('✅ 答对了！', 2000);
				}
			});

			// 初始化时不做任何高亮标记，用户点击后才显示
		}

		// ====== 答案与解析折叠区 ======
		const toggleBtn = answerSectionEl.createDiv({ cls: 'cuoti-answer-toggle' });
		toggleBtn.createSpan({ text: '🍕 ', cls: 'cuoti-section-emoji' });
		toggleBtn.createSpan({ text: '答案与解析', cls: 'cuoti-answer-toggle-text' });
		const arrowEl = toggleBtn.createSpan({ text: '▶', cls: 'cuoti-toggle-arrow' });

		const answerContentEl = answerSectionEl.createDiv({ cls: 'cuoti-answer-content' });

		if (params.kaodian) {
			const kaodianEl = answerContentEl.createDiv({ cls: 'cuoti-answer-row cuoti-kaodian-row' });
			kaodianEl.createSpan({ text: '🎯 考点: ', cls: 'cuoti-answer-label' });
			kaodianEl.createSpan({ text: params.kaodian, cls: 'cuoti-answer-value' });
		}

		if (correctAnswer) {
			const correctEl = answerContentEl.createDiv({ cls: 'cuoti-answer-row cuoti-correct-answer' });
			correctEl.createSpan({ text: '✅ 正确答案: ', cls: 'cuoti-answer-label' });
			correctEl.createSpan({ text: correctAnswer, cls: 'cuoti-answer-value' });
		}

		if (myAnswer) {
			const myEl = answerContentEl.createDiv({ cls: 'cuoti-answer-row cuoti-my-answer' });
			myEl.createSpan({ text: '❌ 我的答案: ', cls: 'cuoti-answer-label' });
			myEl.createSpan({ text: myAnswer, cls: 'cuoti-answer-value' });
		}

		if (easyWrong) {
			const easyWrongEl = answerContentEl.createDiv({ cls: 'cuoti-answer-row cuoti-easy-wrong-row' });
			easyWrongEl.createSpan({ text: '⚠️ 易错项: ', cls: 'cuoti-answer-label' });
			easyWrongEl.createSpan({ text: easyWrong, cls: 'cuoti-answer-value cuoti-easy-wrong-value' });
		}

		if (params.analysis) {
			const analysisEl = answerContentEl.createDiv({ cls: 'cuoti-analysis' });
			const analysisTitle = analysisEl.createDiv({ cls: 'cuoti-section-subtitle' });
			analysisTitle.createSpan({ text: '💡 ', cls: 'cuoti-section-emoji' });
			analysisTitle.createSpan({ text: '解析' });

			const analysisContent = analysisEl.createDiv({ cls: 'cuoti-analysis-content' });
			renderContent(analysisContent, params.analysis, app);
		}

		toggleBtn.addEventListener('click', () => {
			answerSectionEl.classList.toggle('cuoti-collapsed');
			arrowEl.textContent = answerSectionEl.classList.contains('cuoti-collapsed') ? '▶' : '▼';
		});
	}
}
