import { appendMsgDOM, scrollToMinimapBottom } from "./chat.js";
import { cfg, tmp } from "./config.js";
import { IDBManager } from "./db.js";
import { historyList, messageArea, rightPanel, userInput } from "./dom.js";
import { introSessionText } from "./text.js";
import { generateId, generateSessionId, scrollToBottom, updateTitle, vibrate } from "./util.js";
import { worker } from "./worker.js";


export const saveCurrentSession = async () => {
	if (!cfg.lastSessionId) return;
	await IDBManager.saveSessionMessages(cfg.lastSessionId, tmp.messages);
};

export const saveSessionMetaLocal = async (session, _renderSidebar = true) => {
	// Find if exists and update, or push
	const idx = tmp.sessions.findIndex(s => s.id === session.id);
	if (idx !== -1) {
		tmp.sessions[idx] = session;
	} else {
		tmp.sessions.push(session);
	}
	await IDBManager.saveSessionMeta(session);
	if (_renderSidebar) renderSidebar();
};

export const updateSessionTitleIfNeeded = async (userText) => {
	const session = tmp.sessions.find(s => s.id === cfg.lastSessionId);
	if (session && session.title === '') {
		session.title = userText.trim().substring(0, 47).replace(/\s+/g, ' ');
		await saveSessionMetaLocal(session, false);
		updateTitle(session.title);
		historyList.querySelector(`[data-session-id="${cfg.lastSessionId}"] .history-title`).innerText = session.title;
	}
};

export const createNewSession = async () => {
	if (tmp.isProcessing) return;

	const newId = generateSessionId();
	const sysMsg = {
		role: 'system',
		isRaw: false,
		isCollapsed: true,
		content: [
			{ type: 'text', text: cfg.defaultSystemPrompt },
		],
		id: generateId(),
	};

	const newSession = {
		id: newId,
		title: '',
		timestamp: Date.now(),
		pinned: false,
	};

	cfg.setItem('lastSessionId', newId);

	tmp.messages = [sysMsg];

	await saveSessionMetaLocal(newSession);
	await saveCurrentSession();

	messageArea.innerHTML = '';
	minimap.innerHTML = '';
	appendMsgDOM({ ...sysMsg, model: 'SYSTEM' });

	renderSidebar();
	userInput.focus();
	updateTitle();

	// 震动反馈
	vibrate(25);
};

export const createIntroSession = async () => {

	// 1. 定义欢迎会话的元数据
	const introSession = {
		id: 'sess_welcome', // 固定 ID
		title: 'Welcome 👋',
		timestamp: 0,
		pinned: false,
	};

	// 2. 定义预设的聊天记录
	const introMessages = [
		{
			role: 'system',
			id: 'msg_system_intro',
			isCollapsed: false,
			isRaw: false,
			content: [
				{ type: 'text', text: introSessionText },
			],
		},
	];

	// 3. 强制写入/覆盖到数据库 (IndexedDB)
	await IDBManager.saveSessionMeta(introSession);
	await IDBManager.saveSessionMessages(introSession.id, introMessages);
};

let switchSessionLock = '';
export const switchSession = async (id) => {
	if (tmp.isProcessing) return;
	if (cfg.lastSessionId === id && messageArea.innerHTML !== '') return;

	cfg.setItem('lastSessionId', id);

	// 等待上一个渲染任务完成
	const nowSessionId = cfg.lastSessionId;
	if(switchSessionLock !== ''){
		switchSessionLock = 'end';
		while(switchSessionLock !== '') await new Promise((resolve) => requestAnimationFrame(resolve));
	}
	switchSessionLock = nowSessionId;

	try {
		const session = await IDBManager.getSession(id);
		updateTitle(session.title);
		tmp.messages = await IDBManager.getSessionMessages(id);
	} catch (err) {
		tmp.messages = [];
	}

	// 滚动到底部
	const chatScrollToBottom = () => {
		// 欢迎会话不滚动到底部
		if (id !== 'sess_welcome') {
			scrollToBottom(true);
		}
	};

	renderSidebar(true);
	vibrate(25);

	// messageArea.style.display = 'none';
	messageArea.innerHTML = '';
	rightPanel.scrollTop = 0; // 防止继承上一个聊天的滚动位置
	minimap.style.display = 'none';
	minimap.innerHTML = '';

	let cssAnimation = true;
	setTimeout(() => {
		cssAnimation = false;
	}, 700);

	// 假设可视范围最多容纳 n 条消息
	const visibleMsgs = 20;

	// 逆向遍历 tmp.chatHistory
	for (let i = tmp.messages.length - 1; i >= 0; i--) {
		const msg = tmp.messages[i];
		const count = tmp.messages.length - i;

		await appendMsgDOM({ ...msg, animate: false, fromTopToBottom: false, animate: false });
		if(count < visibleMsgs || cssAnimation) chatScrollToBottom(true);

		// 如果渲染过程中切换会话则停止
		if(nowSessionId !== switchSessionLock) break;

		// 延迟渲染避免卡顿
		await new Promise((resolve) => requestAnimationFrame(resolve));
	}

	minimap.style.display = 'flex';
	scrollToMinimapBottom();

	switchSessionLock = '';

	// for (const msg of tmp.chatHistory) {
	// 	const els = await appendMsgDOM({ ...msg, animate: false });
	// }

	// messageArea.style.display = 'flex';
};

export const renderSidebar = async (onlyHighlight = false, scrollIntoViewBlock = 'center') => {
	if(onlyHighlight){
		for (const el of historyList.querySelectorAll('.history-item.active')) {
			el.classList.remove('active');
		}
	}else{
		const html = await worker.run('renderSidebar', { sessions: [...tmp.sessions] });
		historyList.innerHTML = html;
	}

	const active = historyList.querySelector(`[data-session-id="${cfg.lastSessionId}"]`);
	active?.classList?.add('active');
	active?.scrollIntoView({ behavior: 'smooth', block: scrollIntoViewBlock });
};

export const renameSession = async (e, sessionId, newTitle) => {
	const session = tmp.sessions.find(s => s.id === sessionId);
	if (session) {
		session.title = newTitle;
		await IDBManager.saveSessionMeta(session);
	}
};

export const deleteSession = async (e, sessionId) => {
	e.stopPropagation();
	// 不能删除正在运行的会话
	if (tmp.isProcessing && cfg.lastSessionId === sessionId) return;

	// 确认删除
	if (!confirm('确认: 永久删除这个会话')) return;

	// 1. 从内存和数据库中移除
	tmp.sessions = tmp.sessions.filter(s => s.id !== sessionId);
	await IDBManager.deleteSession(sessionId);

	// 2. 判断删除的是否是当前正在查看的会话
	if (sessionId === cfg.lastSessionId) {
		if (tmp.sessions.length > 0) {
			// 如果还有剩余会话，按时间排序找到最新的一个
			// (这一步是为了和侧边栏显示的顺序保持一致)
			tmp.sessions.sort((a, b) => b.timestamp - a.timestamp);

			// 切换到第一个(最新的)会话
			renderSidebar();
			await switchSession(tmp.sessions[0].id);
		} else {
			// 如果没有剩余会话，才新建
			await createNewSession();
		}
	} else {
		// 如果删除的不是当前会话，仅刷新侧边栏
		renderSidebar();
	}
};

