
import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.3.1/+esm';
import hljs from 'https://cdn.jsdelivr.net/npm/highlight.js@11.11.1/+esm';
import Katex from 'https://cdn.jsdelivr.net/npm/katex@0.16.27/+esm';
import { Marked } from 'https://cdn.jsdelivr.net/npm/marked@17.0.1/+esm';
import { markedHighlight } from 'https://cdn.jsdelivr.net/npm/marked-highlight@2.2.3/+esm';
import markedKatex from 'https://cdn.jsdelivr.net/npm/marked-katex-extension@5.1.6/+esm';
import morphdom from 'https://cdn.jsdelivr.net/npm/morphdom@2.7.7/+esm';

// CONFIG
const priorityModels = ['qwen3-max', 'gemini-3-pro', 'gemini-2.5', 'deepseek-v3.2-exp', 'claude-sonnet-4-5', 'gpt-4.1'];

const marked = new Marked(
	markedHighlight({
		emptyLangClass: 'hljs',
		langPrefix: 'hljs language-',
		highlight(code, lang, info) {
			const language = hljs.getLanguage(lang) ? lang : 'plaintext';
			return hljs.highlight(code, { language }).value;
		}
	})
);

marked.setOptions({
	breaks: true,
	gfm: true,
});

marked.use(markedKatex({ throwOnError: false, nonStandard: true }));

const DOMPurifyConfig = {
	IN_PLACE: true,
};

DOMPurify.addHook('uponSanitizeElement', (currentNode, data, config) => {
	if (currentNode.parentNode && data.allowedTags[data.tagName] !== true) {
		currentNode.parentNode.replaceChild(document.createTextNode(currentNode.outerHTML), currentNode);
	}
});

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
	// set all elements owning target to target=_blank
	if ('target' in node) {
		node.setAttribute('target', '_blank');
	}
	// set non-HTML/MathML links to xlink:show=new
	if (!node.hasAttribute('target') && (node.hasAttribute('xlink:href') || node.hasAttribute('href'))) {
		node.setAttribute('xlink:show', 'new');
	}
});

// --- IndexedDB Manager ---
const IDBManager = {
	dbName: 'pChat.IpacEL.cc',
	version: 1,
	db: null,

	async init() {
		return new Promise((resolve, reject) => {
			const request = indexedDB.open(this.dbName, this.version);

			request.onupgradeneeded = (e) => {
				const db = e.target.result;
				if (!db.objectStoreNames.contains('sessions')) {
					db.createObjectStore('sessions', { keyPath: 'id' });
				}
				if (!db.objectStoreNames.contains('chats')) {
					db.createObjectStore('chats', { keyPath: 'id' });
				}
				if (!db.objectStoreNames.contains('config')) {
					db.createObjectStore('config', { keyPath: 'id' });
				}
			};

			request.onsuccess = (e) => {
				this.db = e.target.result;
				resolve(this.db);
			};

			request.onerror = (e) => {
				console.error('IndexedDB Error:', e);
				reject(e);
			};
		});
	},

	async getAllSessions() {
		return new Promise((resolve, reject) => {
			const tx = this.db.transaction('sessions', 'readonly');
			const store = tx.objectStore('sessions');
			const request = store.getAll();
			request.onsuccess = () => resolve(request.result || []);
			request.onerror = () => reject(request.error);
		});
	},

	async saveSessionMeta(session) {
		return new Promise((resolve, reject) => {
			const tx = this.db.transaction('sessions', 'readwrite');
			const store = tx.objectStore('sessions');
			const request = store.put(session);
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	},

	async deleteSession(sessionId) {
		return new Promise((resolve, reject) => {
			const tx = this.db.transaction(['sessions', 'chats'], 'readwrite');
			tx.objectStore('sessions').delete(sessionId);
			tx.objectStore('chats').delete(sessionId);
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	},

	async getSessionMessages(sessionId) {
		return new Promise((resolve, reject) => {
			const tx = this.db.transaction('chats', 'readonly');
			const store = tx.objectStore('chats');
			const request = store.get(sessionId);
			request.onsuccess = () => {
				const res = request.result;
				resolve(res ? res.messages : []);
			};
			request.onerror = () => reject(request.error);
		});
	},

	async saveSessionMessages(sessionId, messages) {
		return new Promise((resolve, reject) => {
			const tx = this.db.transaction('chats', 'readwrite');
			const store = tx.objectStore('chats');
			const request = store.put({ id: sessionId, messages: messages });
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	},
	
	async getAllChats() {
		return new Promise((resolve, reject) => {
			const tx = this.db.transaction('chats', 'readonly');
			const store = tx.objectStore('chats');
			const request = store.getAll();
			request.onsuccess = () => resolve(request.result || []);
			request.onerror = () => reject(request.error);
		});
	},

	async getConfig() {
		// 将所有配置导出到对象
		
	},

	async importBackup(data) {
		return new Promise((resolve, reject) => {
			const tx = this.db.transaction(['sessions', 'chats', 'config'], 'readwrite');

			const sessionStore = tx.objectStore('sessions');
			if (Array.isArray(data.sessions)) {
				data.sessions.forEach(session => sessionStore.put(session));
			}
			const chatStore = tx.objectStore('chats');
			if (Array.isArray(data.chats)) {
				data.chats.forEach(chat => chatStore.put(chat));
			}
			const configStore = tx.objectStore('config');
			if (Array.isArray(data.config)) {
				data.config.forEach(cfg => configStore.put(cfg));
			}

			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	},
};

// --- DOM Elements ---
const sidebarToggle = document.getElementById('sidebar-toggle');
const rightPanel = document.getElementById('right-panel');
const messageArea = document.getElementById('message-area');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const statusDot = document.getElementById('status-dot');
const modelSelect = document.getElementById('model-select');
const historyList = document.getElementById('history-list');
const newChatBtn = document.getElementById('new-chat-btn');
const minimap = document.getElementById('minimap');
const importInput = document.getElementById('import-input');
const pipWindowBtn = document.getElementById('pip-window-btn');
const configBtn = document.getElementById('config-btn');
const importBtn = document.getElementById('import-btn');
const exportBtn = document.getElementById('export-btn');
const resetPuterData = document.getElementById('reset-puter-data');

// --- State Management ---
let chatHistory = [];
let isProcessing = false;
let currentSessionId = null;
let sessions = [];
let isAutoScroll = true;

// --- Utilities ---
const generateId = () => 'msg_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
const generateSessionId = () => 'sess_' + Date.now();

const formatDate = (ts) => {
	const d = new Date(ts);
	const year = d.getFullYear();
	const month = (d.getMonth() + 1).toString().padStart(2, '0');
	const day = d.getDate().toString().padStart(2, '0');
	const hour = d.getHours().toString().padStart(2, '0');
	const minute = d.getMinutes().toString().padStart(2, '0');
	return `${year}/${month}/${day} ${hour}:${minute}`;
};

// --- Minimap Functions ---

// 添加小方块
function addMinimapItem(role, id, isCollapsed = false) {
	const item = document.createElement('div');
	item.className = `minimap-item ${role} ${isCollapsed ? 'collapsed' : ''}`;
	item.dataset.targetId = id; // 绑定对应消息的 ID
	
	// 点击滚动到对应消息
	item.onclick = () => {
		const target = document.getElementById(id);
		if (target) {
			target.scrollIntoView({ behavior: 'smooth', block: 'start' });
			// 短暂高亮目标消息
			target.classList.add('highlight');
			setTimeout(() => target.classList.remove('highlight'), 300);
		}
	};
	
	minimap.appendChild(item);
	scrollToMinimapBottom();
}

// 移除小方块
function removeMinimapItem(id) {
	const item = minimap.querySelector(`.minimap-item[data-target-id="${id}"]`);
	if (item) item.remove();
}

// 小地图自动跟随底部
function scrollToMinimapBottom() {
	minimap.scrollTop = minimap.scrollHeight;
}

// --- Storage Logic (Wrapper around IDBManager) ---
async function loadSessionsIndex() {
	try {
		sessions = await IDBManager.getAllSessions();
		renderSidebar();
	} catch (e) {
		console.error('Failed to load sessions', e);
	}
}

async function saveSessionMetaLocal(session) {
	// Find if exists and update, or push
	const idx = sessions.findIndex(s => s.id === session.id);
	if (idx !== -1) {
		sessions[idx] = session;
	} else {
		sessions.push(session);
	}
	await IDBManager.saveSessionMeta(session);
	renderSidebar();
}

async function saveCurrentSession() {
	if (!currentSessionId) return;
	await IDBManager.saveSessionMessages(currentSessionId, chatHistory);
}

async function deleteSession(e, sessionId) {
	e.stopPropagation();
	if (!confirm('确认: 永久删除这个会话')) return;

	// 1. 从内存和数据库中移除
	sessions = sessions.filter(s => s.id !== sessionId);
	await IDBManager.deleteSession(sessionId);

	// 2. 判断删除的是否是当前正在查看的会话
	if (sessionId === currentSessionId) {
		if (sessions.length > 0) {
			// 如果还有剩余会话，按时间排序找到最新的一个
			// (这一步是为了和侧边栏显示的顺序保持一致)
			sessions.sort((a, b) => b.timestamp - a.timestamp);
			
			// 切换到第一个(最新的)会话
			await switchSession(sessions[0].id);
		} else {
			// 如果没有剩余会话，才新建
			await createNewSession();
		}
	} else {
		// 如果删除的不是当前会话，仅刷新侧边栏
		renderSidebar();
	}
}

async function renameSession(e, sessionId, newTitle) {
	const session = sessions.find(s => s.id === sessionId);
	if (session) {
		session.title = newTitle;
		await IDBManager.saveSessionMeta(session);
	}
}

// --- UI Logic: Sidebar ---
function renderSidebar() {
	historyList.innerHTML = '';
	const sortedSessions = [...sessions].sort((a, b) => b.timestamp - a.timestamp);

	sortedSessions.forEach(session => {
		const div = document.createElement('div');
		div.className = `history-item ${session.id === currentSessionId ? 'active' : ''}`;
		
		// 点击切换会话
		div.onclick = (e) => {
			// 关键检查：如果当前正在编辑标题，或者是通过长按触发的编辑状态，则不切换会话
			if (e.target.isContentEditable) return;
			
			switchSession(session.id);
			// 移动端点击后收起侧边栏
			if (window.innerWidth <= 768) {
				sidebarToggle.checked = false;
			}
		};
		
		div.innerHTML = `
			<div class="history-info">
				<div class="history-title" title="Double click to rename"></div>
				<div class="history-date">${formatDate(session.timestamp)}</div>
			</div>
			<button class="history-del-btn">×</button>
		`;

		div.querySelector('.history-title').innerText = session.title || 'New Session';

		// 删除按钮逻辑
		const delBtn = div.querySelector('.history-del-btn');
		delBtn.onclick = (e) => deleteSession(e, session.id);

		// --- 标题编辑逻辑 (双击 + 长按) ---
		const titleDiv = div.querySelector('.history-title');

		// 1. PC端：双击重命名
		titleDiv.ondblclick = (e) => {
			e.stopPropagation();
			makeTitleEditable(titleDiv, session.id);
		};

		// 2. 移动端：长按重命名
		let pressTimer;
		let longPressDuration = 500; // 长按 500ms 触发

		const touchstartFunc = (e) => {
			// 启动定时器
			pressTimer = setTimeout(() => {
				// 触发震动反馈 (如果设备支持)
				if (navigator.vibrate) navigator.vibrate(50);
				
				// 进入编辑模式
				makeTitleEditable(titleDiv, session.id);
				
				// 阻止默认菜单 (防止长按弹出浏览器菜单)
				e.preventDefault();
			}, longPressDuration);
		};
		const clearTimeoutFunc = () => {
			if (pressTimer) clearTimeout(pressTimer);
		};

		// 移动端按下
		titleDiv.addEventListener('touchstart', (e) => {
			longPressDuration = 500;
			touchstartFunc(e);
		}, { passive: false });

		// 鼠标按下
		titleDiv.addEventListener('mousedown', (e) => {
			longPressDuration = 300; // 鼠标点击响应更快
			touchstartFunc(e);
		}, { passive: false });

		// 抬起
		titleDiv.addEventListener('touchend', clearTimeoutFunc);
		titleDiv.addEventListener('mouseup', clearTimeoutFunc);
		// 移动
		titleDiv.addEventListener('touchmove', clearTimeoutFunc);
		
		// 防止长按默认弹出的上下文菜单干扰
		titleDiv.addEventListener('contextmenu', (e) => {
			if (pressTimer) e.preventDefault();
		});

		historyList.appendChild(div);
	});
}

function makeTitleEditable(element, sessionId) {
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

async function switchSession(id) {
	if (isProcessing) return;
	if (currentSessionId === id && messageArea.innerHTML !== '') return;

	localStorage.setItem('pChat.last.session.id', id);

	currentSessionId = id;
	const session = sessions.find(s => s.id === id);
	if (session) {
		updateTitle(session.title);
	}

	try {
		chatHistory = await IDBManager.getSessionMessages(id);
	} catch (e) {
		chatHistory = [];
	}
	
	rightPanel.scrollTop = 0;	// 防止继承上一个聊天的滚动位置
	messageArea.innerHTML = '';
	minimap.innerHTML = '';
	
	for(const msg of chatHistory){
		const els = appendMessageToDOM({ ...msg, animate: false });
		els.contentDiv.classList.remove('cursor');
	}
	
	renderSidebar();

	// 欢迎会话不滚动到底部
	if(id !== 'sess_welcome'){
		scrollToBottom(true, true);
	}
}

async function updateTitle(title) {
	if (window.matchMedia('(display-mode: standalone)').matches) {
		document.title = `${title}`;
		return;
	}
	document.title = `[Chat] ${title}`;
}

async function createIntroSession() {

	// 1. 定义欢迎会话的元数据
	const introSession = {
		id: 'sess_welcome', // 固定 ID
		title: 'Welcome 👋',
		timestamp: 0,
	};

	// 2. 定义预设的聊天记录
	const introMessages = [
		{
			role: 'system',
			id: 'msg_system_intro',
			isCollapsed: false,
			isRaw: false,
			content: `
# [ Puter.js AI Chat Terminal ]

这是一个基于 Puter.js 的本地化 AI 聊天终端.

## 特性
- 免费: 无需注册, 无需登录, 无需支付, 通过 Puter.js 提供完全免费的服务.
- 本地存储: 所有聊天记录通过 IndexedDB 存储在浏览器本地, 除 AI 推理外, 不上传到任何服务器.

## 界面
- 模型切换: 点击右上角下拉菜单切换模型. 记忆上次使用的模型.
- 会话管理: 左侧边栏选择支持 新建/切换/删除, 双击或长按标题可重命名. 记忆上次打开的会话.
- 导入导出: 点击左侧边栏下方的 [IMPORT] / [EXPORT] 按钮导出导出数据, 导入支持合并会话.
- 置顶窗口: 点击左侧边栏下方的 [PIP] 按钮打开画中画窗口.
- 小地图: 界面右侧的小地图可以快速定位到消息位置.

## 消息框
- 身份显示:
- 系统提示词显示为 SYSTEM (蓝色消息框)
- 用户消息显示为 USER (绿色消息框)
- AI 消息显示为对应模型的名称 (灰色消息框).
- 切换格式: 点击右上角 [RENDER] / [RAW] 切换渲染消息或原始内容.
- 折叠消息: 点击右上角 [+] / [-] 切换折叠消息, 同时小地图中的对应消息框会变为半透明.
- 重新生成: 点击左下角 [REGEN] 按钮重新生成 AI 消息.
- 分支消息: 点击左下角 [FORK] 按钮从这里创建新聊天.
- 删除消息: 点击左下角 [DEL] 按钮删除这条消息, 不影响其他消息.

## 消息渲染
- 默认仅自动渲染 AI 消息.
- 折叠的消息将在打开时渲染.
- 记忆每条消息的渲染和折叠状态.
- 思考模型的思考内容渲染在蓝色 [THINK] 折叠框内.

## 前端库
- [Puter.js](https://github.com/heyPuter/puter) - 提供 AI 服务
- [DOMPurify](https://github.com/cure53/DOMPurify) - XSS 过滤器
- [Highlight.js](https://github.com/highlightjs/highlight.js) - 代码高亮
- [KaTeX](https://github.com/KaTeX/KaTeX) - LaTeX 公式渲染
- [Marked](https://github.com/markedjs/marked) - Markdown 文档渲染
- [MarkedHighlight](https://github.com/markedjs/marked-highlight) - Markdown 代码高亮
- [MarkedKatex](https://github.com/UziTech/marked-katex-extension) - Markdown LaTeX 公式渲染
- [Morphdom](https://github.com/patrick-steele-idem/morphdom) - DOM 差异更新

## 字体
- [HarmonyOS Sans](https://developer.huawei.com/consumer/cn/doc/design-guides-V1/font-0000001157868583-V1) - 全局中文字体
- [JetBrainsMono](https://www.jetbrains.com/lp/mono/) - 全局等宽字体
- [Ubuntu](https://design.ubuntu.com/font) - 标题字体

## 开源
- GitHub: [pChat](https://github.com/ApliNi/pChat)
- Author: [ApliNi](https://github.com/ApliNi)

---

注意: 这个欢迎会话始终自动重置.
> 点击左上角 \`[ + NEW SESSION ]\` 创建一个新会话.
`.trim(),	},
	];

	// 3. 强制写入/覆盖到数据库 (IndexedDB)
	// 注意：这里不更新内存中的 sessions 数组，因为稍后 loadSessionsIndex 会统一加载
	await IDBManager.saveSessionMeta(introSession);
	await IDBManager.saveSessionMessages(introSession.id, introMessages);
}

async function createNewSession() {
	if (isProcessing) return;
	
	const newId = generateSessionId();
	const sysMsg = {
		role: 'system',
		isCollapsed: true,
		content: `
## Format
- All block tokens should have a blank line before and after them.
- Use \`\\n\\n$$ ... $$\\n\\n\` to display a block-level LaTeX formula.
---
You are a helpful coding assistant. Answer concisely.
`.trim(),
		id: generateId(),
	};
	
	const newSession = {
		id: newId,
		title: '',
		timestamp: Date.now(),
	};

	currentSessionId = newId;

	localStorage.setItem('pChat.last.session.id', newId);

	chatHistory = [sysMsg];
	
	await saveSessionMetaLocal(newSession);
	await saveCurrentSession();

	messageArea.innerHTML = '';
	minimap.innerHTML = '';
	appendMessageToDOM({ ...sysMsg, model: 'SYSTEM' });
	
	renderSidebar();
	userInput.focus();
	updateTitle('New Session');
}

async function updateSessionTitleIfNeeded(userText) {
	const session = sessions.find(s => s.id === currentSessionId);
	if (session && session.title === '') {
		session.title = userText.trim().substring(0, 47).replace(/\s+/g, ' ');
		await saveSessionMetaLocal(session);
		updateTitle(session.title);
	}
}

// --- Initialization ---
window.addEventListener('DOMContentLoaded', async () => {
	await IDBManager.init();
	
	// 异步加载模型
	loadModels();

	// [修改] 1. 每次启动时，强制重置欢迎会话的内容到数据库
	await createIntroSession();

	// [修改] 2. 从数据库加载所有会话列表 (此时必定包含刚刚写入的 welcome 会话)
	await loadSessionsIndex();

	// [修改] 3. 恢复上次会话逻辑
	// 获取上次保存的 ID
	let lastId = localStorage.getItem('pChat.last.session.id');

	// 检查该 ID 是否还存在于当前的会话列表中
	const lastSessionExists = sessions.some(s => s.id === lastId);

	if (lastSessionExists) {
		// 如果上次的会话还存在，加载上次的
		await switchSession(lastId);
	} else {
		// 如果不存在（或是第一次来），加载时间最近的一个（通常就是刚刚创建的 Welcome）
		// 或者是列表中的第一个
		if (sessions.length > 0) {
				// 重新排序确保选中最新的
			const sorted = sessions.sort((a, b) => b.timestamp - a.timestamp);
			await switchSession(sorted[0].id);
		} else {
			// 理论上不会走到这里，因为 createIntroSession 保证了至少有一个会话
			await createNewSession();
		}
	}
});

// --- 获取并渲染模型列表 ---
async function loadModels() {
	try {
		// 1. 获取模型列表
		let models = await puter.ai.listModels();
		
		// 2. 按提供商或名称简单排序 (可选)
		models.sort((a, b) => a.id.localeCompare(b.id));

		// 过滤无效的模型
		models = models.filter(model => model.name);

		modelSelect.innerHTML = '';
		
		// 先添加优先模型
		priorityModels.forEach(pid => {
			const m = models.find(x => x.id.includes(pid));
			if(m) createOption(m);
		});
		
		const separator = document.createElement('option');
		separator.disabled = true;
		separator.innerText = '──────────';
		modelSelect.appendChild(separator);

		models.forEach(m => {
			createOption(m);
		});

		// 恢复上次选择的模型 (如果有)
		const savedModel = localStorage.getItem('pChat.last.model');
		if (savedModel && Array.from(modelSelect.options).some(o => o.value === savedModel)) {
			modelSelect.value = savedModel;
		}

	} catch (err) {
		console.error('Failed to load models:', err);
	}
}

function createOption(model) {
	const opt = document.createElement('option');
	opt.value = model.id;
	// 显示 模型ID 或 更友好的 Name
	opt.innerText = model.name || model.id;
	modelSelect.appendChild(opt);
}

// 监听模型改变，保存用户偏好
modelSelect.addEventListener('change', () => {
	localStorage.setItem('pChat.last.model', modelSelect.value);
});

newChatBtn.addEventListener('click', () => {
	createNewSession();
	sidebarToggle.checked = false;
});

// --- Chat Logic ---
userInput.addEventListener('input', function() {
	this.style.height = (this.scrollHeight) + 'px';
	if(this.value === '') this.style.height = '0px';
});

userInput.addEventListener('keydown', (e) => {
	if (e.key === 'Enter' && !e.shiftKey) {
		e.preventDefault();
		handleSend();
	}
});

sendBtn.addEventListener('click', () => handleSend());

async function handleSend() {
	try{
		// 删除字符串开头的换行和末尾的空白字符 (防止删除缩进)
		const text = userInput.value.replace(/^\s*\n+|\s+$/g, '');
		if (!text || isProcessing) return;
		
		userInput.value = '';
		userInput.style.height = '0px';

		await updateSessionTitleIfNeeded(text);

		const userMsgId = generateId();
		const userMsg = { role: 'user', content: text, id: userMsgId };
		chatHistory.push(userMsg);
		appendMessageToDOM({ role: 'user', content: text, id: userMsgId });

		await saveCurrentSession();
		// 不等待 AI 回复
		performAIRequest();

	}catch(err){
		console.error(err);

	}finally{
		// 不输入内容也滚动到底部
		setTimeout(() => {
			rightPanel.scrollTo({
				top: rightPanel.scrollHeight,
				behavior: 'smooth',
			});
		}, 1);
	}
}

async function performAIRequest(targetId = null) {
	if (isProcessing) return;
	
	const currentModel = modelSelect.value;
	toggleState(true);

	let aiMsgId, contextHistory;
	let uiElements;
	let fullText = ''; // 用于累积完整的回答

	if (targetId) {
		aiMsgId = targetId;
		const targetIndex = chatHistory.findIndex(m => m.id === targetId);
		if (targetIndex === -1) { toggleState(false); return; }
		contextHistory = chatHistory.slice(0, targetIndex);
		
		const msgDiv = document.getElementById(targetId);
		const contentDiv = msgDiv.querySelector('.content');
		const metaDiv = msgDiv.querySelector('.meta-stats');
		msgDiv.dataset.rendered = 'true';
		msgDiv.querySelector('.btn-toggle').innerText = '[RAW]';
		contentDiv.contentEditable = 'false'; // 生成时禁止编辑

		msgDiv.querySelector('.role-label span:first-child').innerText = currentModel.toUpperCase();
		
		contentDiv.textContent = '';
		contentDiv.classList.add('cursor'); // 激活光标
		uiElements = { contentDiv, metaDiv };
	} else {
		aiMsgId = generateId();
		contextHistory = [...chatHistory];
		uiElements = appendMessageToDOM({ role: 'assistant', content: '', id: aiMsgId, model: currentModel });
		uiElements.contentDiv.classList.add('cursor'); // 新消息也激活光标
	}
	
	const startTime = Date.now();
	const timerInterval = setInterval(() => {
		const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
		uiElements.metaDiv.innerText = `GENERATING: ${elapsed}s`;
	}, 100);

	try {
		const apiHistory = contextHistory.map(({role, content}) => ({role, content}));
		
		const response = await puter.ai.chat(apiHistory, {
			model: currentModel,
			stream: true,
		});

		// 2. 循环处理流数据
		let isRendering = 0;
		let think = false;
		for await (const part of response) {

			// 处理不同输出
			if(part.type === 'reasoning'){
				// 添加思考折叠框
				if(think === false) fullText += `<details class="think"><summary>[THINK]</summary>\n\n`;
				think = true;
				fullText += (part?.reasoning || '');
			}
			if(part.type === 'text'){
				// 结束思考折叠框
				if(think === true) fullText += `\n\n</details>\n\n`;
				think = false;
				fullText += (part?.text || '');
			}

			// 延迟渲染, 防止卡顿
			if(isRendering > 1) continue;
			while(isRendering === 1) await new Promise((resolve) => setTimeout(resolve, 100));
			isRendering += 1;

			// 渲染新内容
			const newHtmlContent = DOMPurify.sanitize(marked.parse(fullText), DOMPurifyConfig);
			morphdom(uiElements.contentDiv, `<div>${newHtmlContent}</div>`, {
				childrenOnly: true,
				onBeforeElUpdated: (from, to) => {
					// 如果节点内容完全一致, 直接跳过更新
					if (from.isEqualNode(to)) {
						return false;
					}

					// 保持 details 的打开状态
					if (from.tagName === 'DETAILS') {
						to.open = from.open;
					}

					// 保持 pre 的滚动条状态
					if (from.tagName === 'PRE') {
						to.scrollLeft = from.scrollLeft;
						to.scrollTop = from.scrollTop;
					}

					return true;
				},
			});

			// 等待浏览器刷新一帧
			requestAnimationFrame(() => {
				isRendering -= 1;
			});
			
			scrollToBottom();
		}

		// 3. 传输结束后的统计
		clearInterval(timerInterval);
		const duration = ((Date.now() - startTime) / 1000).toFixed(2);
		const estimatedTokens = Math.max(1, Math.round(fullText.length / 2.5)); // 估算 Token
		const tps = (estimatedTokens / duration).toFixed(1);
		
		// [修改] 定义统计文本变量
		const statsText = `Time: ${duration}s | ${tps} Token/s`;
		uiElements.metaDiv.innerText = statsText;

		// 4. 更新内存中的历史记录
		if (targetId) {
			const targetIndex = chatHistory.findIndex(m => m.id === targetId);
			if (targetIndex !== -1) {
				chatHistory[targetIndex].content = fullText;
				chatHistory[targetIndex].model = currentModel;
				// [新增] 保存统计信息
				chatHistory[targetIndex].stats = statsText;
			}
		} else {
			chatHistory.push({
				role: 'assistant',
				content: fullText,
				id: aiMsgId,
				model: currentModel,
				stats: statsText,
			});
		}

		// 5. 最后再一次性保存到 IndexedDB (避免频繁 IO)
		await saveCurrentSession();

	} catch (error) {
		clearInterval(timerInterval);
		console.error(error);
		uiElements.contentDiv.textContent += `\n\n[SYSTEM ERROR]: ${error.message}`;
		uiElements.metaDiv.innerText = `FAIL`;
		uiElements.metaDiv.style.color = '#ff3333';
	} finally {
		// 移除光标样式，恢复按钮状态
		uiElements.contentDiv.classList.remove('cursor');
		toggleState(false);
		if (!targetId) scrollToBottom();
	}
}

function appendMessageToDOM({
	role,
	content,
	id,
	model = null,
	animate = true,
	stats = null,
	isCollapsed = false,
	isRaw = undefined,
}) {
	const msgDiv = document.createElement('div');
	msgDiv.className = `message ${role}`;
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
		<!-- [修改] 添加 collapsedClass -->
		<div class="content markdown-body ${(role === 'assistant' && content === '') ? 'cursor' : ''} ${isCollapsed ? 'collapsed' : ''}" contenteditable="${isRendered ? 'false' : 'plaintext-only'}" spellcheck="false"></div>
		<div class="msg-footer">
			${buttonsHtml}
			<div class="meta-stats"></div>
		</div>
	`;

	msgDiv.querySelector('.content').addEventListener('click', function(event) {
		// click 事件名修正 (原代码写的是 onclick，但在 addEventListener 中应为 click)
		if(this.classList.contains('collapsed')){
			toggleMessageCollapse(id, msgDiv.querySelector('.role-header-right .btn-collapse'));
		}
	});
	
	const contentArea = msgDiv.querySelector('.content');
	
	if (isRendered) {
		if (isCollapsed) {
			// 延迟渲染折叠的消息
			contentArea.textContent = content;
			contentArea.dataset.lazy = 'true';
		} else {
			// 立即渲染未折叠的消息
			if (content) {
				contentArea.innerHTML = DOMPurify.sanitize(marked.parse(content), DOMPurifyConfig);
			}
		}
	} else {
		contentArea.textContent = content;
	}

	messageArea.appendChild(msgDiv);

	addMinimapItem(role, id, isCollapsed);

	if(animate) scrollToBottom();

	contentArea.addEventListener('input', () => {
		if (msgDiv.dataset.rendered === 'false') {
			const newText = contentArea.innerText;
			updateHistoryContent(id, newText);
		}
	});

	if (stats) {
		msgDiv.querySelector('.meta-stats').innerText = stats;
	}

	return {
		contentDiv: contentArea,
		metaDiv: msgDiv.querySelector('.meta-stats')
	};
}

async function updateHistoryContent(id, newText) {
	const item = chatHistory.find(m => m.id === id);
	if (item) {
		item.content = newText;
		await saveCurrentSession();
	}
}

window.regenerateMessage = function(id) {
	if (isProcessing) return;
	performAIRequest(id);
}

window.toggleMessageView = async function(id) {
	// 如果正在生成回复，暂不建议切换，防止流式传输冲突（可选限制）
	if (isProcessing) return;

	const msgDiv = document.getElementById(id);
	if (!msgDiv) return;

	const contentDiv = msgDiv.querySelector('.content');
	const toggleBtn = msgDiv.querySelector('.btn-toggle');
	
	// 获取当前状态
	const isRendered = msgDiv.dataset.rendered === 'true';
	
	// 获取当前对应的历史消息内容
	const msgItem = chatHistory.find(m => m.id === id);
	if (!msgItem) return;
	const rawContent = msgItem.content;

	if (isRendered) {
		// === 切换到源码模式 (RAW) ===
		// 1. 切换内容为纯文本
		contentDiv.textContent = rawContent;
		// 2. 允许编辑
		contentDiv.contentEditable = 'plaintext-only';
		// 3. 更新状态标记
		msgDiv.dataset.rendered = 'false';
		// 4. 更新按钮文本 (现在显示的是源码，按钮提示用户点击可渲染)
		toggleBtn.innerText = '[RENDER]';
		
		// 稍微高亮一下表示可编辑
		contentDiv.style.background = 'rgba(255,255,255,0.05)';
		setTimeout(() => contentDiv.style.background = '', 300);

	} else {
		// === 切换到渲染模式 (RENDER) ===
		// 1. 获取当前编辑器里的文本 (用户可能刚刚修改过)
		const currentRawText = contentDiv.innerText;
		
		// 2. 确保历史记录是最新的
		if (currentRawText !== rawContent) {
			updateHistoryContent(id, currentRawText);
		}

		// 3. 渲染 Markdown
		contentDiv.innerHTML = DOMPurify.sanitize(marked.parse(currentRawText), DOMPurifyConfig);
		
		// 4. 禁止编辑 (渲染后的 HTML 不适合直接编辑)
		contentDiv.contentEditable = 'false';
		
		// 5. 更新状态标记
		msgDiv.dataset.rendered = 'true';
		// 6. 更新按钮文本
		toggleBtn.innerText = '[RAW]';
	}

	// 保存渲染切换状态
	msgItem.isRaw = isRendered;
	await saveCurrentSession();
}

// --- 新增：折叠/展开消息 ---
window.toggleMessageCollapse = async function(id, btn) {
	const msgDiv = document.getElementById(id);
	if (!msgDiv) return;
	
	const contentDiv = msgDiv.querySelector('.content');
	
	// 切换 collapsed 类
	contentDiv.classList.toggle('collapsed');
	
	const msgItem = chatHistory.find(m => m.id === id);
	msgItem.isCollapsed = contentDiv.classList.contains('collapsed');

	// 延迟渲染
	if (!msgItem.isCollapsed && !msgItem.isRaw && contentDiv.dataset.lazy === 'true') {
		// 从内存或 dom 中得到消息原始内容
		const rawText = msgItem ? msgItem.content : contentDiv.textContent;
		contentDiv.innerHTML = DOMPurify.sanitize(marked.parse(rawText), DOMPurifyConfig);
		contentDiv.dataset.lazy = 'false';
	}

	btn.innerText = msgItem.isCollapsed ? '[+]' : '[-]';
	btn.dataset.isCollapsed = msgItem.isCollapsed;

	const minimapItem = document.querySelector(`.minimap-item[data-target-id="${id}"]`);
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
	if (isProcessing) return;

	const userIndex = chatHistory.findIndex(m => m.id === id);
	if (userIndex === -1) return;

	const nextMsg = chatHistory[userIndex + 1];

	// 情况 1: 下一条消息存在且是 AI 回复 -> 直接重新生成该条
	if (nextMsg && nextMsg.role === 'assistant') {
		await performAIRequest(nextMsg.id);
	}
	// 情况 2: 下一条消息不存在，或者下一条是用户消息 (中间插入) -> 新建 AI 消息
	else {
		const currentModel = modelSelect.value;
		const newAiId = generateId();
		
		// 1. 在历史记录数组中，插入到该用户消息之后
		const newMsgObj = {
			role: 'assistant',
			content: '',
			id: newAiId,
			model: currentModel
		};
		chatHistory.splice(userIndex + 1, 0, newMsgObj);

		// 2. 创建 DOM 元素
		// 先通过 appendMessageToDOM 创建（默认会加到最后）
		appendMessageToDOM({ role: 'assistant', content: '', id: newAiId, model: currentModel });
		
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
		await performAIRequest(newAiId);
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
		chatHistory = chatHistory.filter(item => item.id !== id);
		await saveCurrentSession();
	}
}

window.forkSession = async function(id) {
	// 如果正在生成内容，禁止操作，防止数据不一致
	if (isProcessing) return;

	// 1. 找到当前点击消息的索引
	const index = chatHistory.findIndex(m => m.id === id);
	if (index === -1) return;

	// 2. 截取历史记录：从开头到当前消息 (使用深拷贝断开引用关联)
	const forkedHistory = JSON.parse(JSON.stringify(chatHistory.slice(0, index + 1)));

	// 3. 准备新会话的数据
	const newSessionId = generateSessionId();
	
	// 获取原标题，如果没有则叫 New Session
	const currentTitle = sessions.find(s => s.id === currentSessionId)?.title || 'New Session';
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

// 打开配置界面
configBtn.addEventListener('click', async () => {
	configBtn.classList.toggle('open');
	if(configBtn.classList.contains('open')){
		for(const e of rightPanel.querySelectorAll('& > *')){
			e.style.display = 'none';
		}
		minimap.style.display = 'none';
		newChatBtn.style.pointerEvents = 'none';
		historyList.style.pointerEvents = 'none';
		rightPanel.querySelector('& > .config').style.display = '';
	}else{
		for(const e of rightPanel.querySelectorAll('& > *')){
			e.style.display = '';
		}
		minimap.style.display = '';
		newChatBtn.style.pointerEvents = '';
		historyList.style.pointerEvents = '';
		rightPanel.querySelector('& > .config').style.display = 'none';
	}
	sidebarToggle.checked = false;
});

// 导出功能
exportBtn.addEventListener('click', async () => {
		// 二次确认
	if (!confirm('确认: 将导出所有聊天记录为一个 JSON 文件')) {
		return;
	}

	const originalText = exportBtn.innerText;
	exportBtn.innerText += '...';

	try {
		// 1. 获取所有数据
		const sessionsData = await IDBManager.getAllSessions();
		const chatsData = await IDBManager.getAllChats();

		// 2. 构造 JSON 对象
		const backupData = {
			version: 1,
			timestamp: Date.now(),
			sessions: sessionsData,
			chats: chatsData
		};

		// 3. 创建 Blob 并下载
		const blob = new Blob([JSON.stringify(backupData, null, '\t')], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `pChat_Backup_${new Date().toISOString().slice(0,10)}.json`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);

	} catch (e) {
		console.error('Export failed:', e);
		alert('导出失败');
	} finally {
		exportBtn.innerText = originalText;
	}
});

// 导入按钮点击
importBtn.addEventListener('click', () => {
	importInput.click();
});

// 处理文件选择
importInput.addEventListener('change', (e) => {
	const file = e.target.files[0];
	if (!file) return;

	// 二次确认
	if (!confirm('确认: 导入将合并数据. 具有相同 ID 的会话将被覆盖')) {
		importInput.value = ''; // 清空选择
		return;
	}

	const reader = new FileReader();
	reader.onload = async (event) => {
		try {
			const data = JSON.parse(event.target.result);
			
			// 简单校验格式
			if (!data.sessions || !data.chats) {
				throw new Error('Invalid backup file format');
			}

			// 执行导入
			await IDBManager.importBackup(data);
			
			location.reload(); // 刷新页面以加载新数据

		} catch (err) {
			console.error(err);
			alert('Import failed: ' + err.message);
		}
	};
	reader.readAsText(file);
});

// 重置 data
resetPuterData.addEventListener('click', async () => {
	// 二次确认
	if (!confirm('确认: 删除 puter.js 相关的数据 (不会删除聊天记录)')) {
		return;
	}
	// 删除数据库 puter_cache (不考虑锁)
	indexedDB.deleteDatabase('puter_cache');
	// 列出所有 data, 删除 "puter." 开头的数据
	for (let i = 0; i < localStorage.length; i++) {
		const key = localStorage.key(i);
		if (key.startsWith('puter.')) {
			await localStorage.removeItem(key);
			i--;
		}
	}
	location.reload();
});

// 画中画窗口
pipWindowBtn.addEventListener('click', async () => {
	if (!('documentPictureInPicture' in window)) {
		alert('当前浏览器不支持文档画中画 API');
		return;
	}

	const pipWindow = await window.documentPictureInPicture.requestWindow({
		width: 450,
		height: 570,
	});

	pipWindow.document.body.style.backgroundColor = '#000';
	pipWindow.document.body.style.overflowX = 'hidden';
	pipWindow.document.body.style.overflowY = 'hidden';
	pipWindow.document.body.style.margin = '0';
	pipWindow.document.body.style.padding = '0';
	pipWindow.document.body.style.lineHeight = '0';
	pipWindow.document.body.style.fontSize = '0';
	pipWindow.document.body.style.height = '100vh';
	const iframe = document.createElement('iframe');
	iframe.src = './';
	iframe.frameborder = '0';
	iframe.style.width = '100%';
	iframe.style.height = '100vh';
	iframe.style.border = 'none';
	pipWindow.document.body.append(iframe);
});

function toggleState(loading) {
	isProcessing = loading;
	sendBtn.disabled = loading;
	document.querySelectorAll('.destroy-btn').forEach(b => b.disabled = loading);

	if (loading) {
		statusDot.classList.add('active');
		sendBtn.innerText = 'BUSY';
	} else {
		statusDot.classList.remove('active');
		sendBtn.innerText = 'SEND';
	}
}

// 监听滚动事件：碰到底部设为 true，离开底部设为 false
rightPanel.addEventListener('scroll', () => {
	const threshold = 20;
	// 判断当前滚动位置是否在底部
	isAutoScroll = rightPanel.scrollTop + rightPanel.clientHeight >= rightPanel.scrollHeight - threshold;
});

function scrollToBottom(force = false, delay = false) {
	if(force) isAutoScroll = true;
	if(!isAutoScroll) return;
	rightPanel.scrollTop = rightPanel.scrollHeight;
	// 用于解决 content-visibility: auto; 导致滚动失效的问题
	if(delay){
		setTimeout(() => {
			rightPanel.scrollTop = rightPanel.scrollHeight;
		}, 1);
	}
}
