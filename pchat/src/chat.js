import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.3.1/+esm';
import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11.12.2/dist/mermaid.esm.min.mjs';
import { historyList, messageArea, sidebarToggle } from "./dom.js";
import { worker } from './worker.js';
import { scrollToBottom, toggleSessionPin, vibrate } from './util.js';
import { tmp } from './config.js';
import { deleteSession, renameSession, saveCurrentSession, switchSession } from './session.js';

export const DOMPurifyConfig = {
	IN_PLACE: true,
	// RETURN_DOM_FRAGMENT: true,
};

DOMPurify.addHook('uponSanitizeElement', (currentNode, data, config) => {
	if (currentNode.parentNode && data.allowedTags[data.tagName] !== true) {
		currentNode.parentNode.replaceChild(document.createTextNode(currentNode.outerHTML), currentNode);
	}
});

// A 标签添加 target="_blank"
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
	if ('target' in node) node.setAttribute('target', '_blank');
	if (!node.hasAttribute('target') && (node.hasAttribute('xlink:href') || node.hasAttribute('href'))) {
		node.setAttribute('xlink:show', 'new');
	}

	// 交互式发送消息功能
	if (node.hasAttribute('href')) {
		if (node.getAttribute('href').startsWith('#/user_send')) {
			node.classList.add('cmd_user_send');
			node.setAttribute('onclick', 'cmdFunc(this)');
			node.removeAttribute('target');
		}
	}
});

// PRE 添加只读属性
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
	if (node.tagName === 'PRE') {
		// 允许光标选择和全选
		node.setAttribute('contenteditable', 'plaintext-only');
		// 但不允许编辑内容
		node.classList.add('no-edit');
	}
});

mermaid.initialize({
	startOnLoad: false,
	theme: 'dark',
	themeVariables: {
		fontFamily: 'JetBrainsMono, HarmonyOS, Trebuchet MS, Segoe UI Emoji',
		primaryTextColor: '#adb4bc',
		pie1: '#0099ff',
		pie2: '#ff9900',
		pie3: '#ff3333',
		// pieStrokeWidth: '0px',
		// pieOuterStrokeWidth: '0px',
	},
});


export const appendMsgDOM = async ({
	role,
	content,
	id,
	model = null,
	animate = true,
	stats = null,
	isCollapsed = false,
	isRaw = undefined,
	display = '',
	fromTopToBottom = true,
}) => {
	const msgDiv = document.createElement('div');
	msgDiv.className = `message ${role}`;
	msgDiv.style.display = display;
	if(animate) msgDiv.style.animation = 'fadeIn 0.3s ease';
	msgDiv.id = id;

	// 默认仅渲染 AI 消息
	let isRendered;
	if (isRaw !== undefined) {
		isRendered = !isRaw;
	} else {
		isRendered = (role === 'assistant');
	}
	msgDiv.dataset.rendered = isRendered;

	let displayLabel = role.toUpperCase();
	if (role === 'assistant' && model) displayLabel = model.toUpperCase();

	let regenBtn = '';
	if (role === 'assistant') {
		regenBtn = `<button class="action-btn destroy-btn btn-regen" onclick="regenerateMessage('${id}')">[REGEN]</button>`;
	} else if (role === 'user') {
		regenBtn = `<button class="action-btn destroy-btn btn-regen" onclick="regenerateResponseTo('${id}')">[REGEN]</button>`;
	}

	let buttonsHtml = `
		<div class="left-actions">
			${regenBtn}
			<button class="action-btn destroy-btn btn-fork" onclick="forkSession('${id}')">[FORK]</button>
			<button class="action-btn destroy-btn btn-del" onclick="confirmDeleteMsg('${id}')">[DEL]</button>
		</div>
	`;

	msgDiv.innerHTML = `
		<span class="role-label">
			<span>${displayLabel}</span>
			<div class="role-header-right">
				${`<button class="action-btn btn-toggle" onclick="toggleMessageView('${id}')">${isRendered ? '[RAW]' : '[RENDER]'}</button>`}
				${`<button class="action-btn btn-collapse" onclick="toggleMessageCollapse('${id}', this)" data-is-collapsed="${isCollapsed}">${isCollapsed ? '[+]' : '[-]'}</button>`}
			</div>
		</span>
		
		<div class="preview-content ${isCollapsed ? 'collapsed' : ''}"></div>
		<div class="content markdown-body ${isCollapsed ? 'collapsed' : ''}" contenteditable="${isRendered ? 'false' : 'plaintext-only'}" spellcheck="false"></div>
		<div class="msg-footer">
			${buttonsHtml}
			<div class="meta-stats" title="Loading Time | Run Time | Token/s"></div>
		</div>
	`;

	msgDiv.querySelector('.content').addEventListener('click', function(event) {
		// click 事件名修正 (原代码写的是 onclick，但在 addEventListener 中应为 click)
		if(this.classList.contains('collapsed')){
			toggleMessageCollapse(id, msgDiv.querySelector('.role-header-right .btn-collapse'));
		}
	});

	// 兼容旧格式
	const contentArray = Array.isArray(content) ? content : [{ type: 'text', text: content || '' }];
	
	const previewContentArea = msgDiv.querySelector('.preview-content');
	const contentArea = msgDiv.querySelector('.content');

	// 始终渲染所有图片
	for(const item of contentArray){
		if(item.type === 'image_url'){
			previewContentArea.innerHTML += `
				<div id="${item.id}" class="preview-item">
					<img src="${item.image_url.url}" loading="lazy" class="img-node">
					<span class="file-info">${item.name}</span>
					<span class="remove-img" onclick="removeAttachedImage('${item.id}', '${id}')">&times;</span>
				</div>
			`;
		}
	}

	// 正常渲染或显示摘要
	const renderedContent = await renderContent(contentArray, isRendered);
	if(isRaw){
		contentArea.textContent += renderedContent;
	}else{
		contentArea.innerHTML += renderedContent;
	}

	if (stats) {
		msgDiv.querySelector('.meta-stats').innerText = stats;
	}

	contentArea.addEventListener('input', () => {
		if (msgDiv.dataset.rendered === 'false') {
			const newText = contentArea.innerText;
			updateHistoryContent(id, newText);
		}
	});

	if(fromTopToBottom){
		messageArea.appendChild(msgDiv);
	}else{
		messageArea.prepend(msgDiv);
	}
	
	await renderContentDOM(contentArea);

	addMinimapItem(role, id, isCollapsed, fromTopToBottom);

	if(animate) scrollToBottom();

	return {
		contentArea: contentArea,
		metaDiv: msgDiv.querySelector('.meta-stats'),
		msgDiv: msgDiv,
	};
};

// --- 点击事件委托 ---
if(true){

	const makeTitleEditable = (element, sessionId) => {
		element.contentEditable = 'plaintext-only';
		element.style.textOverflow = 'clip';
		element.focus();
		
		// Select all text
		const range = document.createRange();
		range.selectNodeContents(element);
		const sel = window.getSelection();
		sel.removeAllRanges();
		sel.addRange(range);

		const save = async () => {
			element.contentEditable = false;
			const oldTitle = element.innerText.trim() || 'Untitled Session';
			const newTitle = (element.innerText.replace(/\s+/g, ' ').trim() || oldTitle).substring(0, 47);
			element.innerText = newTitle;
			element.scrollLeft = 0;
			element.style.textOverflow = 'ellipsis';
			await renameSession(null, sessionId, newTitle);
		};

		const onKeyDown = (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				element.blur();
			}
		};

		element.addEventListener('blur', save, { once: true });
		element.addEventListener('keydown', onKeyDown);
	}

	let pressTimer; // 用于长按计时的全局变量

	// --- 1. 点击事件委托 (切换 & 删除 & 置顶) ---
	historyList.addEventListener('click', (e) => {
		// 查找点击的是哪个会话项
		const item = e.target.closest('.history-item');
		if (!item) return;

		const sessionId = item.dataset.sessionId;

		// 如果点击的是置顶按钮
		if (e.target.classList.contains('history-pin-btn')) {
			toggleSessionPin(e, sessionId);
			return;
		}

		// 如果点击的是删除按钮
		if (e.target.classList.contains('history-del-btn')) {
			deleteSession(e, sessionId);
			return;
		}

		// 如果点击的是整个会话项 (且当前不在编辑状态)
		if (!e.target.isContentEditable) {
			switchSession(sessionId);
			sidebarToggle.checked = false;
		}
	});

	// --- 2. 双击事件委托 (PC端重命名) ---
	historyList.addEventListener('dblclick', (e) => {
		if (e.target.classList.contains('history-title')) {
			const item = e.target.closest('.history-item');
			if (item) {
				makeTitleEditable(e.target, item.dataset.sessionId);
			}
		}
	});

	// --- 3. 长按逻辑处理函数 ---
	const startPress = (e) => {
		const titleDiv = e.target.closest('.history-title');
		if (!titleDiv || titleDiv.isContentEditable) return;

		// 区分鼠标和触摸的触发时长
		const duration = e.type === 'mousedown' ? 300 : 500;

		pressTimer = setTimeout(() => {
			// 震动反馈
			vibrate(25);
			
			const item = titleDiv.closest('.history-item');
			makeTitleEditable(titleDiv, item.dataset.sessionId);
			
			// 标记已触发长按，防止触发后续的 click 事件
			pressTimer = null;
		}, duration);
	};

	const cancelPress = () => {
		if (pressTimer) {
			clearTimeout(pressTimer);
			pressTimer = null;
		}
	};

	// --- 4. 绑定长按相关的事件委托 ---
	// 移动端
	historyList.addEventListener('touchstart', startPress, { passive: true });
	historyList.addEventListener('touchend', cancelPress);
	historyList.addEventListener('touchmove', cancelPress);
	
	// PC端 (模拟长按)
	historyList.addEventListener('mousedown', startPress);
	historyList.addEventListener('mouseup', cancelPress);
	historyList.addEventListener('mouseleave', cancelPress);

	// 屏蔽长按标题时的系统右键菜单
	historyList.addEventListener('contextmenu', (e) => {
		if (e.target.closest('.history-title')) {
			// 如果正在编辑，或者刚才触发了长按，则阻止菜单
			e.preventDefault();
		}
	});
}

export const updateHistoryContent = async (id, newText) => {
	const item = tmp.messages.find(m => m.id === id);
	if (item) {
		if(!Array.isArray(item.content)) item.content = [ { type: 'text', text: item.content } ];
		for(const c of item.content){
			if(c.type === 'text'){
				c.text = newText;
				break;
			}
		}
		await saveCurrentSession();
	}
};

export const renderContent = async (content, renderHTML = true) => {
	if(!Array.isArray(content)) content = [ { type: 'text', text: content } ];

	let fullText = '';
	for(const item of content){
		if(item.type === 'text'){
			if(item.reasoning && renderHTML){
				fullText += `<details class="think __pChat__"><summary>[THINK]</summary>\n\n${item.reasoning}\n\n</details>\n\n`;
			}
			fullText += item.text;
		}
	}

	if(renderHTML){
		return DOMPurify.sanitize(await worker.run('renderMarkdown', fullText), DOMPurifyConfig);
	}else{
		return fullText;
	}
};

export const renderContentDOM = async (contentArea) => {
	
	const mermaidNodes = contentArea.querySelectorAll('.language-mermaid:not(.rendered)');
	if(mermaidNodes.length){
		for(const node of mermaidNodes){
			node.classList.add('rendered');
		}
		await mermaid.run({ nodes: mermaidNodes }).catch(err => console.error(err));
	}
};

// 添加小方块
export const addMinimapItem = (role, id, isCollapsed = false, fromTopToBottom = true) => {
	const item = document.createElement('a');
	item.className = `minimap-item ${role} ${isCollapsed ? 'collapsed' : ''}`;
	item.href = `#${id}`;
	
	// 点击滚动到对应消息
	item.onclick = function(event) {
		event.preventDefault();
		const target = document.getElementById(id);
		if (target) {
			target.scrollIntoView({ behavior: 'smooth', block: 'start' });
			// 短暂高亮目标消息
			target.classList.add('highlight');
			setTimeout(() => target.classList.remove('highlight'), 300);
		}
	};
	
	if(fromTopToBottom){
		minimap.appendChild(item);
	}else{
		minimap.prepend(item);
	}
	scrollToMinimapBottom();
};

// 移除小方块
export const removeMinimapItem = (id) => {
	const item = minimap.querySelector(`.minimap-item[href="#${id}"]`);
	if (item) item.remove();
};

// 小地图自动跟随底部
export const scrollToMinimapBottom = () => {
	minimap.scrollTop = minimap.scrollHeight;
};


