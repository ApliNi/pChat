import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.3.1/+esm';
import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11.12.2/dist/mermaid.esm.min.mjs';
import { messageArea, minimap } from "./dom.js";
import { worker } from './worker.js';
import { scrollToBottom } from './util.js';
import { tmp } from './store.js';
import { saveCurrentSession } from './session.js';
import { templates } from './ui/templates.js';


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
	fromTopToBottom = false,
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

	msgDiv.innerHTML = templates.message({
		role,
		content,
		id,
		model,
		stats,
		isCollapsed,
		isRendered,
	});

	const previewContentArea = msgDiv.querySelector('.preview-content');
	const contentArea = msgDiv.querySelector('.content');

	// 始终渲染所有图片
	const contentArray = Array.isArray(content) ? content : [{ type: 'text', text: content || '' }];
	for(const item of contentArray){
		if(item.type === 'image_url'){
			previewContentArea.innerHTML += templates.imagePreview(item);
		}
	}

	// 正常渲染或显示摘要
	const renderedContent = await renderContent(contentArray, isRendered);
	if(!isRendered){
		contentArea.textContent += renderedContent;
	}else{
		contentArea.innerHTML += renderedContent;
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
	
	renderContentDOM(contentArea);

	addMinimapItem(role, id, isCollapsed, !fromTopToBottom);

	if(animate) scrollToBottom();

	return {
		contentArea: contentArea,
		metaDiv: msgDiv.querySelector('.meta-stats'),
		msgDiv: msgDiv,
	};
};

export const renderContentDOM = async (contentArea) => {
	
	const mermaidNodes = contentArea.querySelectorAll('.language-mermaid:not(.rendered)');
	if(mermaidNodes.length){
		for(const node of mermaidNodes){
			node.classList.add('rendered');
		}
		await mermaid.run({ nodes: mermaidNodes }).catch(err => console.error(err));
		scrollToBottom();
	}
};

// 添加小方块
export const addMinimapItem = (role, id, isCollapsed = false, fromTopToBottom = true) => {
	const item = templates.minimapItem(role, id, isCollapsed);
	
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
				fullText += /*html*/`<details class="think __pChat__"><summary>[THINK]</summary>\n\n${item.reasoning}\n\n</details>\n\n`;
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



