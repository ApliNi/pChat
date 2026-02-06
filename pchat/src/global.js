import { aiService } from "./aiService.js";
import { appendMsgDOM, removeMinimapItem, renderContent, renderContentDOM, updateHistoryContent } from "./chat.js";
import { saveCurrentSession } from './session.js';
import { tmp } from "./config.js";
import { IDBManager } from "./db.js";
import { modelSelect, userInput } from "./dom.js";
import { generateId, generateSessionId, handleSend, renderImagePreviews } from "./util.js";
import { switchSession } from './session.js';
import { saveSessionMetaLocal } from './session.js';

window.cmdFunc = function(_this) {
	
	// 交互式发送消息功能
	if (_this.classList.contains('cmd_user_send')) {
		const msg = _this.textContent;
		userInput.value = msg;
		handleSend();
	}
}

window.regenerateMessage = function(id) {
	if (tmp.isProcessing) return;
	aiService.performAIRequest(id);
}

window.toggleMessageView = async function(id) {
	// 不能切换正在处理中的消息
	if (tmp.isProcessing && document.getElementById(id).classList.contains('isProcessing')) return;

	const msgDiv = document.getElementById(id);
	if (!msgDiv) return;

	const contentArea = msgDiv.querySelector('.content');
	const toggleBtn = msgDiv.querySelector('.btn-toggle');
	
	// 获取当前状态
	const isRendered = msgDiv.dataset.rendered === 'true';
	
	// 获取当前对应的历史消息内容
	const msgItem = tmp.messages.find(m => m.id === id);
	if (!msgItem) return;
	const rawContent = msgItem.content.find(c => c.type === 'text')?.text ?? '';

	if (isRendered) {
		// === 切换到源码模式 (RAW) ===
		// 1. 切换内容为纯文本
		contentArea.textContent = rawContent;
		// 2. 允许编辑
		contentArea.contentEditable = 'plaintext-only';
		contentArea.classList.add('editable');
		// 3. 更新状态标记
		msgDiv.dataset.rendered = 'false';
		// 4. 更新按钮文本 (现在显示的是源码，按钮提示用户点击可渲染)
		toggleBtn.innerText = '[RENDER]';
		
		// 稍微高亮一下表示可编辑
		contentArea.style.background = 'rgba(255,255,255,0.05)';
		setTimeout(() => contentArea.style.background = '', 300);

	} else {
		// === 切换到渲染模式 (RENDER) ===
		// 1. 获取当前编辑器里的文本 (用户可能刚刚修改过)
		const currentRawText = contentArea.innerText;
		// 2. 确保历史记录是最新的
		if (currentRawText !== rawContent) {
			await updateHistoryContent(id, currentRawText);
		}
		// 3. 渲染 Markdown
		contentArea.innerHTML = await renderContent(msgItem.content);
		await renderContentDOM(contentArea);
		// 4. 禁止编辑 (渲染后的 HTML 不适合直接编辑)
		contentArea.contentEditable = 'false';
		contentArea.classList.remove('editable');
		// 5. 更新状态标记
		msgDiv.dataset.rendered = 'true';
		// 6. 更新按钮文本
		toggleBtn.innerText = '[RAW]';
	}

	// 保存渲染切换状态
	msgItem.isRaw = isRendered;
	await saveCurrentSession();
}

// --- 折叠/展开消息 ---
window.toggleMessageCollapse = async function(id, btn) {
	const msgDiv = document.getElementById(id);
	if (!msgDiv) return;
	
	const contentArea = msgDiv.querySelector('.content');
	
	// 切换 collapsed 类
	contentArea.classList.toggle('collapsed');
	
	const msgItem = tmp.messages.find(m => m.id === id);
	msgItem.isCollapsed = contentArea.classList.contains('collapsed');

	btn.innerText = msgItem.isCollapsed ? '[+]' : '[-]';
	btn.dataset.isCollapsed = msgItem.isCollapsed;

	const minimapItem = document.querySelector(`.minimap-item[href="#${id}"]`);
	if (minimapItem) {
		if (msgItem.isCollapsed) {
			minimapItem.classList.add('collapsed');
		} else {
			minimapItem.classList.remove('collapsed');
		}
	}

	// 保存状态到 IndexedDB
	await saveCurrentSession();
}

window.regenerateResponseTo = async function(id) {
	if (tmp.isProcessing) return;

	const userIndex = tmp.messages.findIndex(m => m.id === id);
	if (userIndex === -1) return;

	const nextMsg = tmp.messages[userIndex + 1];

	// 情况 1: 下一条消息存在且是 AI 回复 -> 直接重新生成该条
	if (nextMsg && nextMsg.role === 'assistant') {
		await aiService.performAIRequest(nextMsg.id);
	}
	// 情况 2: 下一条消息不存在，或者下一条是用户消息 (中间插入) -> 新建 AI 消息
	else {
		const currentModel = modelSelect.value;
		const newAiId = generateId();
		
		// 1. 在历史记录数组中，插入到该用户消息之后
		const newMsgObj = {
			role: 'assistant',
			content: [ { type: 'text', text: '' } ],
			id: newAiId,
			model: currentModel
		};
		tmp.messages.splice(userIndex + 1, 0, newMsgObj);

		// 2. 创建 DOM 元素
		// 先通过 appendMsgDOM 创建（默认会加到最后）
		await appendMsgDOM(newMsgObj);
		
		// 3. 将 DOM 元素移动到正确位置 (即 userId 对应的元素之后)
		const userDiv = document.getElementById(id);
		const newAiDiv = document.getElementById(newAiId);
		if (userDiv && newAiDiv) {
			if (userDiv.nextSibling) {
				messageArea.insertBefore(newAiDiv, userDiv.nextSibling);
			} else {
				messageArea.appendChild(newAiDiv);
			}
		}

		// 4. 保存状态并开始生成
		await saveCurrentSession();
		await aiService.performAIRequest(newAiId);
	}
}

window.confirmDeleteMsg = async function(id) {
	const btn = document.querySelector(`#${id} .btn-del`);
	if (!btn) return;

	if (btn.innerText === '[DEL]') {
		btn.innerText = '[CONFIRM DELETE ?]';
		btn.classList.add('confirm-state');
		btn.timer = setTimeout(() => {
			if (btn) {
				btn.innerText = '[DEL]';
				btn.classList.remove('confirm-state');
				btn.timer = null;
			}
		}, 2700);
	} else {
		if (btn.timer) clearTimeout(btn.timer);
		const el = document.getElementById(id);
		if (el) {
			el.style.opacity = '0';
			setTimeout(() => el.remove(), 200);
		}
		removeMinimapItem(id);
		tmp.messages = tmp.messages.filter(item => item.id !== id);
		await saveCurrentSession();
	}
}

window.forkSession = async function(id) {
	// 如果正在生成内容，禁止操作，防止数据不一致
	if (tmp.isProcessing) return;

	// 1. 找到当前点击消息的索引
	const index = tmp.messages.findIndex(m => m.id === id);
	if (index === -1) return;

	// 2. 截取历史记录：从开头到当前消息 (使用深拷贝断开引用关联)
	const forkedHistory = JSON.parse(JSON.stringify(tmp.messages.slice(0, index + 1)));

	// 3. 准备新会话的数据
	const newSessionId = generateSessionId();
	
	// 获取原标题，如果没有则叫 New Session
	const currentTitle = tmp.sessions.find(s => s.id === cfg.lastSessionId)?.title || 'New Session';
	let newTitle;
	if(currentTitle.startsWith('[Fork')){
		// 使用数值叠加 Fork 次数
		const forkCount = parseInt(currentTitle.match(/^\[Fork (\d+)\]/)?.[1] || '0');
		newTitle = `[Fork ${forkCount + 1}] ${currentTitle.replace(/^\[Fork( \d+)?\] /, '')}`;
	}else{
		newTitle = `[Fork] ${currentTitle}`;
	}

	const newSession = {
		id: newSessionId,
		title: newTitle,
		timestamp: Date.now(),
	};

	// 4. 保存新会话元数据到侧边栏列表
	await saveSessionMetaLocal(newSession);
	
	// 5. 保存截取后的消息内容到 IndexedDB
	await IDBManager.saveSessionMessages(newSessionId, forkedHistory);

	// 6. 切换到新会话
	await switchSession(newSessionId);
}

window.removeAttachedImage = (imgId, msgId) => {
	if(msgId === 'userInput'){
		tmp.attachedImages = tmp.attachedImages.filter(img => img.id !== imgId);
		renderImagePreviews();
	} else {
		if(tmp.isProcessing) return;
		// 从当前聊天中删除图片并保存
		const msg = tmp.messages.find(msg => msg.id === msgId);
		if(msg){
			msg.content = msg.content.filter(item => item.id !== imgId);
			saveCurrentSession();
			document.getElementById(imgId).remove();
		}
	}
}
