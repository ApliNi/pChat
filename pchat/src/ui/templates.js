
/**
 * UI 模板库 - 统一存放所有 HTML 结构
 */
export const templates = {
	
	/**
	 * 消息模板
	 */
	message: ({
		role,
		model = null,
		stats = null,
		isCollapsed = false,
		isRendered = true,
	}) => {
		const displayLabel = (role === 'assistant' && model) ? model.toUpperCase() : role.toUpperCase();
		
		let regenBtn = '';
		if (role === 'assistant') {
			regenBtn = /*html*/`<button class="action-btn destroy-btn btn-regen">[REGEN]</button>`;
		} else if (role === 'user') {
			regenBtn = /*html*/`<button class="action-btn destroy-btn btn-regen-response">[REGEN]</button>`;
		}

		const buttonsHtml = /*html*/`
			<div class="left-actions">
				${regenBtn}
				<button class="action-btn destroy-btn btn-fork">[FORK]</button>
				<button class="action-btn destroy-btn btn-del">[DEL]</button>
			</div>
		`;

		return /*html*/`
			<span class="role-label">
				<span>${displayLabel}</span>
				<div class="role-header-right">
					<button class="action-btn btn-toggle">${isRendered ? '[RAW]' : '[RENDER]'}</button>
					<button class="action-btn btn-collapse" data-is-collapsed="${isCollapsed}">${isCollapsed ? '[+]' : '[-]'}</button>
				</div>
			</span>
			
			<div class="preview-content ${isCollapsed ? 'collapsed' : ''}"></div>
			<div class="content markdown-body ${isCollapsed ? 'collapsed' : ''}" contenteditable="${isRendered ? 'false' : 'plaintext-only'}" spellcheck="false"></div>
			<div class="msg-footer">
				${buttonsHtml}
				<div class="meta-stats" title="Loading Time | Run Time | Token/s">${stats || ''}</div>
			</div>
		`;
	},

	/**
	 * 图片预览项目模板
	 */
	imagePreview: (item, parentId = '') => /*html*/`
		<div id="${item.id}" class="preview-item">
			<img src="${item.image_url.url}" loading="lazy" class="img-node">
			<span class="file-info">${item.name}</span>
			<span class="remove-img" data-img-id="${item.id}" data-parent-id="${parentId}">&times;</span>
		</div>
	`,

	/**
	 * 侧边栏分组模板
	 */
	historyGroup: (title, isOpen = true) => /*html*/`
		<details class="history-group" ${isOpen ? 'open' : ''}>
			<summary class="history-group-title">${title}</summary>
		</details>
	`,

	/**
	 * 小地图项模板
	 */
	minimapItem: (role, id, isCollapsed) => {
		const item = document.createElement('a');
		item.className = `minimap-item ${role} ${isCollapsed ? 'collapsed' : ''}`;
		item.href = `#${id}`;
		return item;
	}
};
