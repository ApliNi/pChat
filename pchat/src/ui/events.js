import { cfg, tmp } from "../store.js";
import { aiService } from "../aiService.js";
import { historyList, messageArea, sidebarToggle, userInput, imagePreviewContainer } from "../dom.js";
import { updateHistoryContent, renderContent, renderContentDOM, removeMinimapItem } from "../chat.js";
import { saveCurrentSession, switchSession, deleteSession, renameSession, saveSessionMetaLocal } from "../session.js";
import { toggleSessionPin, generateId, generateSessionId, vibrate, handleSend } from "../util.js";
import { IDBManager } from "../db.js";

/**
 * 初始化全局交互事件
 */
export const initEvents = () => {

	// --- 消息区域事件委托 ---
	messageArea.addEventListener('click', async (e) => {
		const target = e.target;
		const msgDiv = target.closest('.message');
		if (!msgDiv) return;
		const id = msgDiv.id;
		const msgItem = tmp.messages.find(m => m.id === id);
		if (!msgItem) return;

		// 1. 重新生成
		if (target.classList.contains('btn-regen')) {
			if (tmp.isProcessing) return;
			aiService.performAIRequest(id);
		}

		// 2. 重新生成响应
		if (target.classList.contains('btn-regen-response')) {
			if (tmp.isProcessing) return;
			regenerateResponseTo(id);
		}

		// 3. 复制会话 (Fork)
		if (target.classList.contains('btn-fork')) {
			forkSession(id);
		}

		// 4. 删除消息
		if (target.classList.contains('btn-del')) {
			confirmDeleteMsg(target, id);
		}

		// 5. 切换显示模式 (RAW/RENDER)
		if (target.classList.contains('btn-toggle')) {
			toggleMessageView(msgDiv, target, id);
		}

		// 6. 折叠消息
		if (target.classList.contains('btn-collapse')) {
			toggleMessageCollapse(msgDiv, target, id);
		}

		// 7. 点击已折叠的消息自动展开
		if (target.classList.contains('content') && target.classList.contains('collapsed')) {
			const btn = msgDiv.querySelector('.btn-collapse');
			toggleMessageCollapse(msgDiv, btn, id);
		}

		// 8. 交互式发送消息
		if (target.classList.contains('cmd_user_send')) {
			const msg = target.textContent;
			userInput.value = msg;
			handleSend();
		}
		
		// 9. 移除图片
		if(target.classList.contains('remove-img')){
			const imgId = target.dataset.imgId;
			await removeAttachedImage(imgId, id);
		}
	});

	// --- 输入预览区域事件委托 ---
	imagePreviewContainer.addEventListener('click', async (e) => {
		const target = e.target;
		if (target.classList.contains('remove-img')) {
			const imgId = target.dataset.imgId;
			const parentId = target.dataset.parentId;
			await removeAttachedImage(imgId, parentId);
		}
	});

	// --- 侧边栏事件委托 ---
	historyList.addEventListener('click', (e) => {
		const item = e.target.closest('.history-item');
		if (!item) return;
		const sessionId = item.dataset.sessionId;

		if (e.target.classList.contains('history-pin-btn')) {
			toggleSessionPin(e, sessionId);
		} else if (e.target.classList.contains('history-del-btn')) {
			deleteSession(e, sessionId);
		} else if (!e.target.isContentEditable) {
			switchSession(sessionId);
			sidebarToggle.checked = false;
		}
	});

	// PC 端双击重命名
	historyList.addEventListener('dblclick', (e) => {
		if (e.target.classList.contains('history-title')) {
			const item = e.target.closest('.history-item');
			if (item) makeTitleEditable(e.target, item.dataset.sessionId);
		}
	});

	// 侧边栏长按逻辑
	let pressTimer;
	const startPress = (e) => {
		const titleDiv = e.target.closest('.history-title');
		if (!titleDiv || titleDiv.isContentEditable) return;
		const duration = e.type === 'mousedown' ? 300 : 500;
		pressTimer = setTimeout(() => {
			vibrate(25);
			const item = titleDiv.closest('.history-item');
			makeTitleEditable(titleDiv, item.dataset.sessionId);
			pressTimer = null;
		}, duration);
	};
	const cancelPress = () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } };
	historyList.addEventListener('touchstart', startPress, { passive: true });
	historyList.addEventListener('touchend', cancelPress);
	historyList.addEventListener('touchmove', cancelPress);
	historyList.addEventListener('mousedown', startPress);
	historyList.addEventListener('mouseup', cancelPress);
	historyList.addEventListener('mouseleave', cancelPress);
	historyList.addEventListener('contextmenu', (e) => {
		if (e.target.closest('.history-title')) e.preventDefault();
	});
};

/**
 * 功能逻辑辅助函数 (原 global.js 逻辑)
 */

const toggleMessageView = async (msgDiv, toggleBtn, id) => {
	if (tmp.isProcessing && msgDiv.classList.contains('isProcessing')) return;
	const contentArea = msgDiv.querySelector('.content');
	const isRendered = msgDiv.dataset.rendered === 'true';
	const msgItem = tmp.messages.find(m => m.id === id);
	if (!msgItem) return;
	const rawContent = msgItem.content.find(c => c.type === 'text')?.text ?? '';

	if (isRendered) {
		contentArea.textContent = rawContent;
		contentArea.contentEditable = 'plaintext-only';
		contentArea.classList.add('editable');
		msgDiv.dataset.rendered = 'false';
		toggleBtn.innerText = '[RENDER]';
		contentArea.style.background = 'rgba(255,255,255,0.05)';
		setTimeout(() => contentArea.style.background = '', 300);
	} else {
		const currentRawText = contentArea.innerText;
		if (currentRawText !== rawContent) await updateHistoryContent(id, currentRawText);
		contentArea.innerHTML = await renderContent(msgItem.content);
		await renderContentDOM(contentArea);
		contentArea.contentEditable = 'false';
		contentArea.classList.remove('editable');
		msgDiv.dataset.rendered = 'true';
		toggleBtn.innerText = '[RAW]';
	}
	msgItem.isRaw = isRendered;
	await saveCurrentSession();
};

const toggleMessageCollapse = async (msgDiv, btn, id) => {
	const contentArea = msgDiv.querySelector('.content');
	contentArea.classList.toggle('collapsed');
	const msgItem = tmp.messages.find(m => m.id === id);
	msgItem.isCollapsed = contentArea.classList.contains('collapsed');
	btn.innerText = msgItem.isCollapsed ? '[+]' : '[-]';
	btn.dataset.isCollapsed = msgItem.isCollapsed;
	const minimapItem = document.querySelector(`.minimap-item[href="#${id}"]`);
	if (minimapItem) minimapItem.classList.toggle('collapsed', msgItem.isCollapsed);
	await saveCurrentSession();
};

const regenerateResponseTo = async (id) => {
	const userIndex = tmp.messages.findIndex(m => m.id === id);
	if (userIndex === -1) return;
	const nextMsg = tmp.messages[userIndex + 1];
	if (nextMsg && nextMsg.role === 'assistant') {
		await aiService.performAIRequest(nextMsg.id);
	} else {
		// 这里由于逻辑复杂，且依赖 appendMsgDOM 等，保持原有逻辑结构
		const currentModel = document.getElementById('model-select').value;
		const newAiId = generateId();
		const newMsgObj = { role: 'assistant', content: [ { type: 'text', text: '' } ], id: newAiId, model: currentModel };
		tmp.messages.splice(userIndex + 1, 0, newMsgObj);
		await (await import('../chat.js')).appendMsgDOM(newMsgObj); // 动态加载避免循环依赖
		const userDiv = document.getElementById(id);
		const newAiDiv = document.getElementById(newAiId);
		if (userDiv && newAiDiv) messageArea.insertBefore(newAiDiv, userDiv);
		await saveCurrentSession();
		await aiService.performAIRequest(newAiId);
	}
};

const confirmDeleteMsg = async (btn, id) => {
	if (btn.innerText === '[DEL]') {
		btn.innerText = '[CONFIRM DELETE ?]';
		btn.classList.add('confirm-state');
		btn.timer = setTimeout(() => {
			if (btn) { btn.innerText = '[DEL]'; btn.classList.remove('confirm-state'); btn.timer = null; }
		}, 2700);
	} else {
		if (btn.timer) clearTimeout(btn.timer);
		const el = document.getElementById(id);
		if (el) { el.style.opacity = '0'; setTimeout(() => el.remove(), 200); }
		removeMinimapItem(id);
		tmp.messages = tmp.messages.filter(item => item.id !== id);
		await saveCurrentSession();
	}
};

const forkSession = async (id) => {
	if (tmp.isProcessing) return;
	const index = tmp.messages.findIndex(m => m.id === id);
	if (index === -1) return;
	const forkedHistory = JSON.parse(JSON.stringify(tmp.messages.slice(0, index + 1)));
	const newSessionId = generateSessionId();
	const currentTitle = tmp.sessions.find(s => s.id === cfg.lastSessionId)?.title || 'New Session';
	let newTitle = currentTitle.startsWith('[Fork') 
		? `[Fork ${parseInt(currentTitle.match(/^\[Fork (\d+)\]/)?.[1] || '0') + 1}] ${currentTitle.replace(/^\[Fork( \d+)?\] /, '')}`
		: `[Fork] ${currentTitle}`;
	const newSession = { id: newSessionId, title: newTitle, timestamp: Date.now(), updateTime: Date.now() };
	await saveSessionMetaLocal(newSession);
	await IDBManager.saveSessionMessages(newSessionId, forkedHistory);
	await switchSession(newSessionId);
};

const removeAttachedImage = async (imgId, msgId) => {
	if (msgId === 'userInput') {
		tmp.attachedImages = tmp.attachedImages.filter(img => img.id !== imgId);
		(await import('../util.js')).renderImagePreviews();
	} else {
		if (tmp.isProcessing) return;
		const msg = tmp.messages.find(m => m.id === msgId);
		if (msg) {
			msg.content = msg.content.filter(item => item.id !== imgId);
			saveCurrentSession();
			document.getElementById(imgId).remove();
		}
	}
};

const makeTitleEditable = (element, sessionId) => {
	element.contentEditable = 'plaintext-only';
	element.style.textOverflow = 'clip';
	element.focus();
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
		element.style.textOverflow = 'ellipsis';
		await renameSession(null, sessionId, newTitle);
	};
	element.addEventListener('blur', save, { once: true });
	element.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); element.blur(); } });
};
