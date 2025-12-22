
console.log(String.raw`%c
| ~ |                   |
|  //| |\  | _| |\ _|   |
|    | ---------------- |
| %cApliNi - pChat%c    [Q_Q]
`, 'color: #008fff', 'color: #17d9ff', 'color: #008fff');

if ('serviceWorker' in navigator) {
	navigator.serviceWorker.register('./sw.js', { scope: '/' });
}

import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.3.1/+esm';
import morphdom from 'https://cdn.jsdelivr.net/npm/morphdom@2.7.7/+esm';

window.addEventListener('DOMContentLoaded', async () => {

	const DOMPurifyConfig = {
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
	
	// --- Worker ---
	const worker = {
		worker: null,
		idx: 1,
		resolveQueue: {},

		run: (type, data) => new Promise((resolve, reject) => {
			const id = worker.idx++;
			worker.resolveQueue[id] = resolve;
			worker.worker.postMessage({ type, data, id });
		}),

		init: () => new Promise((resolve, reject) => {
			worker.worker = new Worker('./worker.js', { type: 'module' });

			worker.worker.onmessage = (event) => {
				const { type, data, id } = event.data;
				const cb = worker.resolveQueue[id];
				if(cb) cb(data);
				delete worker.resolveQueue[id];

				if(type === 'init') resolve();
			};
		}),
	};

	// --- IndexedDB Manager ---
	const IDBManager = {
		dbName: 'pChat.IpacEL.cc',
		version: 2,
		db: null,

		init() {
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
					alert('加载数据库时出现错误');
					reject(e);
				};
			});
		},

		getAllSessions() {
			return new Promise((resolve, reject) => {
				const tx = this.db.transaction('sessions', 'readonly');
				const store = tx.objectStore('sessions');
				const request = store.getAll();
				request.onsuccess = () => resolve(request.result || []);
				request.onerror = () => reject(request.error);
			});
		},

		saveSessionMeta(session) {
			return new Promise((resolve, reject) => {
				const tx = this.db.transaction('sessions', 'readwrite');
				const store = tx.objectStore('sessions');
				const request = store.put(session);
				request.onsuccess = () => resolve();
				request.onerror = () => reject(request.error);
			});
		},

		deleteSession(sessionId) {
			return new Promise((resolve, reject) => {
				const tx = this.db.transaction(['sessions', 'chats'], 'readwrite');
				tx.objectStore('sessions').delete(sessionId);
				tx.objectStore('chats').delete(sessionId);
				tx.oncomplete = () => resolve();
				tx.onerror = () => reject(tx.error);
			});
		},

		getSessionMessages(sessionId) {
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

		saveSessionMessages(sessionId, messages) {
			return new Promise((resolve, reject) => {
				const tx = this.db.transaction('chats', 'readwrite');
				const store = tx.objectStore('chats');
				const request = store.put({ id: sessionId, messages: messages });
				request.onsuccess = () => resolve();
				request.onerror = () => reject(request.error);
			});
		},
		
		getAllChats() {
			return new Promise((resolve, reject) => {
				const tx = this.db.transaction('chats', 'readonly');
				const store = tx.objectStore('chats');
				const request = store.getAll();
				request.onsuccess = () => resolve(request.result || []);
				request.onerror = () => reject(request.error);
			});
		},

		getConfig() {
			return new Promise(async (resolve, reject) => {
				if(!this.db) await this.init();
				const tx = this.db.transaction('config', 'readonly');
				const store = tx.objectStore('config');
				const request = store.getAll();
				request.onsuccess = () => {
					const config = {};
					request.result.forEach(item => {
						config[item.id] = item.value;
					});
					resolve(config);
				};
				request.onerror = () => reject(request.error);
			});
		},

		setConfig(id, value) {
			return new Promise(async (resolve, reject) => {
				const tx = this.db.transaction('config', 'readwrite');
				const store = tx.objectStore('config');
				const request = store.put({ id, value });
				request.onsuccess = () => resolve();
				request.onerror = () => reject(request.error);
			});
		},

		delConfig(id) {
			return new Promise(async (resolve, reject) => {
				const tx = this.db.transaction('config', 'readwrite');
				const store = tx.objectStore('config');
				const request = store.delete(id);
				request.onsuccess = () => resolve();
				request.onerror = () => reject();
			});
		},

		importBackup(data) {
			return new Promise((resolve, reject) => {
				const tx = this.db.transaction(['sessions', 'chats', 'config'], 'readwrite');

				const configStore = tx.objectStore('config');
				if (Array.isArray(data.config)) {
					data.config.forEach(cfg => configStore.put(cfg));
				}
				const sessionStore = tx.objectStore('sessions');
				if (Array.isArray(data.sessions)) {
					data.sessions.forEach(session => sessionStore.put(session));
				}
				const chatStore = tx.objectStore('chats');
				if (Array.isArray(data.chats)) {
					data.chats.forEach(chat => chatStore.put(chat));
				}

				tx.oncomplete = () => resolve();
				tx.onerror = () => reject(tx.error);
			});
		},
	};
	
	// 并行初始化
	await Promise.all([ worker.init(), IDBManager.init() ]).catch((err) => {
		console.log('初始化失败:', err);
		alert('初始化失败, 请尝试刷新页面');
	});

	let cfg = {
		lastSessionId: null,
		lastModel: null,
		defaultSystemPrompt: '',
		modelService: 'Puter.js',
		puterPriorityModels: ['qwen3-max', 'gemini-3-pro', 'gemini-2.5', 'deepseek-v3.2-exp', 'claude-sonnet-4-5', 'gpt-4.1'],
		openaiApiEndpoint: '',
		openaiApiKey: [],
		openaiPriorityModels: [],

		...await IDBManager.getConfig(),
		setItem: (id, value) => {
			cfg[id] = value;
			return IDBManager.setConfig(id, value);
		},
	};

	// --- DOM Elements ---
	const sidebarToggle = document.getElementById('sidebar-toggle');
	const rightPanel = document.getElementById('right-panel');
	const messageArea = document.getElementById('message-area');
	const imagePreviewContainer = document.getElementById('image-preview-container');
	const userInput = document.getElementById('user-input');
	const attachedImageBtn = document.getElementById('attached-image-btn');
	const attachedImageInput = document.getElementById('attached-image-input');
	const sendBtn = document.getElementById('send-btn');
	const statusDot = document.getElementById('status-dot');
	const modelSelect = document.getElementById('model-select');
	const historyList = document.getElementById('history-list');
	const newChatBtn = document.getElementById('new-chat-btn');
	const minimap = document.getElementById('minimap');
	const pipWindowBtn = document.getElementById('pip-window-btn');

	// --- State Management ---
	let chatHistory = [];
	let attachedImages = []; // 存储当前待发送的图片 [{id, base64, name}]
	let isProcessing = false;
	let sessions = [];
	let isAutoScroll = true;
	let interacted = false;

	// --- Utilities ---
	const generateId = () => 'msg_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
	const generateSessionId = () => 'sess_' + Date.now();

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

	async function vibrate(v) {
		if(!interacted) return;
		if ('vibrate' in navigator) navigator.vibrate(v);
	}

	// --- Storage Logic (Wrapper around IDBManager) ---
	async function loadSessionsIndex() {
		try {
			sessions = await IDBManager.getAllSessions();
			renderSidebar();
		} catch (err) {
			console.error('Failed to load sessions', err);
		}
	}

	async function saveSessionMetaLocal(session, _renderSidebar = true) {
		// Find if exists and update, or push
		const idx = sessions.findIndex(s => s.id === session.id);
		if (idx !== -1) {
			sessions[idx] = session;
		} else {
			sessions.push(session);
		}
		await IDBManager.saveSessionMeta(session);
		if(_renderSidebar) renderSidebar();
	}

	async function saveCurrentSession() {
		if (!cfg.lastSessionId) return;
		await IDBManager.saveSessionMessages(cfg.lastSessionId, chatHistory);
	}

	async function deleteSession(e, sessionId) {
		e.stopPropagation();
		// 不能删除正在运行的会话
		if(isProcessing && cfg.lastSessionId === sessionId) return;

		// 确认删除
		if (!confirm('确认: 永久删除这个会话')) return;

		// 1. 从内存和数据库中移除
		sessions = sessions.filter(s => s.id !== sessionId);
		await IDBManager.deleteSession(sessionId);

		// 2. 判断删除的是否是当前正在查看的会话
		if (sessionId === cfg.lastSessionId) {
			if (sessions.length > 0) {
				// 如果还有剩余会话，按时间排序找到最新的一个
				// (这一步是为了和侧边栏显示的顺序保持一致)
				sessions.sort((a, b) => b.timestamp - a.timestamp);
				
				// 切换到第一个(最新的)会话
				renderSidebar();
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

	async function renderSidebar(onlyHighlight = false) {
		if (onlyHighlight) {
			for(const el of historyList.querySelectorAll('.history-item.active')){
				el.classList.remove('active');
			}
			historyList.querySelector(`[data-session-id="${cfg.lastSessionId}"]`)?.classList?.add('active');
			return;
		}
		
		const html = await worker.run('renderSidebar', { sessions: [...sessions], lastSessionId: cfg.lastSessionId });
		historyList.innerHTML = html;
	}

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

		// --- 1. 点击事件委托 (切换 & 删除) ---
		historyList.addEventListener('click', (e) => {
			// 查找点击的是哪个会话项
			const item = e.target.closest('.history-item');
			if (!item) return;

			const sessionId = item.dataset.sessionId;

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

	async function switchSession(id) {
		if (isProcessing) return;
		if (cfg.lastSessionId === id && messageArea.innerHTML !== '') return;

		cfg.setItem('lastSessionId', id);

		const session = sessions.find(s => s.id === id);
		if (session) {
			updateTitle(session.title);
		}

		try {
			chatHistory = await IDBManager.getSessionMessages(id);
		} catch (err) {
			chatHistory = [];
		}
		
		messageArea.style.display = 'none';
		messageArea.innerHTML = '';
		rightPanel.scrollTop = 0;	// 防止继承上一个聊天的滚动位置
		minimap.innerHTML = '';
		
		for(const msg of chatHistory){
			const els = await appendMessageToDOM({ ...msg, animate: false, cursor: false });
		}

		messageArea.style.display = 'flex';

		// 欢迎会话不滚动到底部
		if(id !== 'sess_welcome'){
			scrollToBottom(true, true);
		}
		
		renderSidebar(true);

		// 震动反馈
		vibrate(25);
	}

	async function updateTitle(_title) {
		const title = _title || 'New Session';
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

		const text = `
# [ pChat - AI Chat Terminal ]

这是一个轻量级本地化 AI 聊天终端, 在浏览器上可用: https://pchat.ipacel.cc/

## 特性
- 免费: 无需注册, 无需登录, 无需支付. 支持通过 Puter.js 和 OpenAI-API 提供模型服务.
- 本地存储: 所有聊天记录通过 IndexedDB 存储在浏览器本地, 除 AI 推理外, 不上传到任何服务器.
- 离线运行: 通过 Service Worker 缓存资源, 使其能够脱机运行, 联机后自动更新资源.

## 界面
- 模型切换: 点击右上角下拉菜单切换模型. 记忆上次使用的模型.
- 会话管理: 左侧边栏选择支持 新建/切换/删除, 双击或长按标题可重命名. 记忆上次打开的会话.
- 设置: 点击左侧边栏下方的 [CONFIG] 按钮进入设置页面.
- 置顶窗口: 点击左侧边栏下方的 [PIP] 按钮打开画中画窗口.
- 小地图: 界面右侧的小地图可以快速定位到消息位置.
- 输入框: 支持粘贴图片 / 点击上传图标上传图片.

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

## 数据解析
- 图片: 支持添加任意浏览器支持的图片格式, 自动转换为 PNG 格式使用.

## 消息渲染
- 默认仅自动渲染 AI 消息.
- 折叠的消息将在打开时渲染.
- 记忆每条消息的渲染和折叠状态.
- 思考模型的思考内容渲染在蓝色 [THINK] 折叠框内.

## 设置页面
- 导入导出: 支持将聊天导出到 JSON 文件, 导入时与当前会话合并, 覆盖 ID 相同的会话.
- 模型服务:
	- "Puter.js": 支持清除 puter.js 身份验证信息和缓存.
	- "OpenAI-API": 支持配置标准 API 服务.

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
`.trim();

		// 2. 定义预设的聊天记录
		const introMessages = [
			{
				role: 'system',
				id: 'msg_system_intro',
				isCollapsed: false,
				isRaw: false,
				content: [
					{ type: 'text', text: text },
				],
			},
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
			isRaw: false,
			isCollapsed: true,
			content: cfg.defaultSystemPrompt,
			id: generateId(),
		};
		
		const newSession = {
			id: newId,
			title: '',
			timestamp: Date.now(),
		};

		cfg.setItem('lastSessionId', newId);

		chatHistory = [sysMsg];
		
		await saveSessionMetaLocal(newSession);
		await saveCurrentSession();

		messageArea.innerHTML = '';
		minimap.innerHTML = '';
		appendMessageToDOM({ ...sysMsg, model: 'SYSTEM' });
		
		renderSidebar();
		userInput.focus();
		updateTitle();

		// 震动反馈
		vibrate(25);
	}

	async function updateSessionTitleIfNeeded(userText) {
		const session = sessions.find(s => s.id === cfg.lastSessionId);
		if (session && session.title === '') {
			session.title = userText.trim().substring(0, 47).replace(/\s+/g, ' ');
			await saveSessionMetaLocal(session, false);
			updateTitle(session.title);
			historyList.querySelector(`[data-session-id="${cfg.lastSessionId}"] .history-title`).innerText = session.title;
		}
	}

	async function handleSend() {
		try{
			// 删除字符串开头的换行和末尾的空白字符 (防止删除缩进)
			const text = userInput.value.replace(/^\s*\n+|\s+$/g, '');
			if (!text || isProcessing) return;
			
			userInput.value = '';
			userInput.style.height = '0px';

			const msgContent = [
				...attachedImages,
				{ type: 'text', text: text || '' },
			];

			await updateSessionTitleIfNeeded(text || '[Image]');

			const userMsgId = generateId();
			const userMsg = { role: 'user', content: msgContent, id: userMsgId };
			chatHistory.push(userMsg);
			await appendMessageToDOM(userMsg);

			// 重置附件
			attachedImages = [];
			renderImagePreviews();

			await saveCurrentSession();
			// 不等待 AI 回复
			AIService.performAIRequest();

		}catch(err){
			console.error(err);

		}finally{
			// 不输入内容也滚动到底部
			setTimeout(() => {
				rightPanel.scrollTo({ top: rightPanel.scrollHeight, behavior: 'smooth' });
			}, 10);
		}
	}

	// --- AI Service Provider ---
	const AIService = {

		// 动态加载 puter.js
		async loadPuter() {
			if (!window.puter) {
				// 添加 script 标签并等待加载完毕
				const script = document.createElement('script');
				script.src = 'https://js.puter.com/v2/';
				document.body.appendChild(script);
				await new Promise(resolve => script.onload = resolve);
			}
		},

		// 负载均衡选择一个 API
		__getOpenAiApiIdx: -1,
		getOpenAiKey() {
			if(typeof cfg.openaiApiKey === 'string') cfg.openaiApiKey = [ cfg.openaiApiKey ]; // 兼容旧版本数据
			const length = cfg.openaiApiKey.length;
			if(AIService.__getOpenAiApiIdx === -1){
				AIService.__getOpenAiApiIdx = Math.floor(Math.random() * length);
			}
			AIService.__getOpenAiApiIdx = (AIService.__getOpenAiApiIdx + 1) % length;
			return cfg.openaiApiKey[AIService.__getOpenAiApiIdx];
		},

		// 获取模型列表
		async loadModels() {
			try {
				
				modelSelect.innerHTML = `
					<option class="loading" value="">/// Loading ///</option>
				`;

				let models;

				if (cfg.modelService === 'Puter.js') {

					if (!window.puter) await AIService.loadPuter();

					models = await window.puter.ai.listModels();
					models.map(m => ({ id: m.id, name: m.name || m.id }));
				}
				else if (cfg.modelService === 'OpenAI-API') {

					// 注销 puter.js
					if (window.puter) {
						
					}

					// OpenAI 模式
					if (!cfg.openaiApiEndpoint) models = [];
					const resp = await fetch(`${cfg.openaiApiEndpoint.replace(/\/+$/, '')}/models`, {
						method: 'GET',
						headers: {
							'Content-Type': 'application/json',
							'Authorization': `Bearer ${AIService.getOpenAiKey()}`
						},
					});
					const data = await resp.json();
					models = data.data.map(m => ({ id: m.id, name: m.id }));
				}
				
				// 过滤并排序
				models = models.filter(model => model.id).sort((a, b) => a.id.localeCompare(b.id));

				let createOptionCount = 0;
				const createOption = (m) => {
					createOptionCount ++;
					const opt = document.createElement('option');
					opt.value = m.id;
					opt.innerText = m.id;
					modelSelect.appendChild(opt);
				};

				// 优先显示模型
				const priorityList = cfg.modelService === 'Puter.js' ? cfg.puterPriorityModels : cfg.openaiPriorityModels;
				for(const model of models){
					if (priorityList.some(pid => model.id.includes(pid))) {
						createOption(model);
					}
				}

				if (createOptionCount !== 0) {
					const sep = document.createElement('option');
					sep.disabled = true;
					sep.innerText = '──────────';
					modelSelect.appendChild(sep);
				}

				// 其他模型
				for(const model of models){
					createOption(model);
				}

				// 恢复上次选择
				if (cfg.lastModel && Array.from(modelSelect.options).some(o => o.value === cfg.lastModel)) {
					modelSelect.value = cfg.lastModel;
				}

				modelSelect.querySelector('.loading').remove();
			} catch (err) {
				console.error('Failed to load models:', err);
			}
		},

		// 统一的流式输出 Generator
		async *chat(messages, model) {
			if (cfg.modelService === 'Puter.js') {

				if (!window.puter) await AIService.loadPuter();

				const response = await window.puter.ai.chat(messages, { model, stream: true });
				for await (const part of response) {
					yield {
						text: part.text || '',
						reasoning: part.reasoning || '',
					};
				}
			}
			else if (cfg.modelService === 'OpenAI-API') {
				// OpenAI 模式
				const response = await fetch(`${cfg.openaiApiEndpoint.replace(/\/+$/, '')}/chat/completions`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Authorization': `Bearer ${AIService.getOpenAiKey()}`
					},
					body: JSON.stringify({
						model: model,
						messages: messages,
						stream: true,
					}),
				});

				if (!response.ok) {
					const err = await response.json();
					throw new Error(err.error?.message || 'OpenAI API Request Failed');
				}

				const reader = response.body.getReader();
				const decoder = new TextDecoder();
				let buffer = '';

				while (true) {
					const { done, value } = await reader.read();
					if (done) break;

					buffer += decoder.decode(value, { stream: true });
					const lines = buffer.split('\n');
					buffer = lines.pop(); // 保持残余数据在缓冲区

					for (const line of lines) {
						const message = line.replace(/^data: /, '');
						if (!message || message === '[DONE]') continue;

						try {
							const parsed = JSON.parse(message);
							const delta = parsed.choices[0].delta;
							yield {
								text: (delta.content) || '',
								reasoning: (delta.reasoning ?? delta.reasoning_content) || '',
							};
						} catch (err) {}
					}
				}
			}
		},

		// LLM 请求并渲染消息
		async performAIRequest(msgId = null) {
			if (isProcessing) return;
			
			const currentModel = modelSelect.value;
			toggleState(true);

			let msgDiv, contextHistory, uiElements;

			if (msgId) {
				const targetIndex = chatHistory.findIndex(m => m.id === msgId);
				if (targetIndex === -1) { toggleState(false); return; }
				contextHistory = chatHistory.slice(0, targetIndex);
				
				msgDiv = document.getElementById(msgId);
				const contentDiv = msgDiv.querySelector('.content');
				const metaDiv = msgDiv.querySelector('.meta-stats');
				msgDiv.classList.add('isProcessing');
				msgDiv.dataset.rendered = 'true';
				msgDiv.querySelector('.btn-toggle').innerText = '[RAW]';
				contentDiv.contentEditable = 'false'; // 生成时禁止编辑

				msgDiv.querySelector('.role-label span:first-child').innerText = currentModel.toUpperCase();
				
				contentDiv.textContent = '';
				contentDiv.classList.add('cursor'); // 激活光标
				uiElements = { contentDiv, metaDiv };
			} else {
				msgId = generateId();
				contextHistory = [...chatHistory];
				uiElements = await appendMessageToDOM({ role: 'assistant', content: '', id: msgId, model: currentModel });
				msgDiv = document.getElementById(msgId);
				msgDiv.classList.add('isProcessing');
				uiElements.contentDiv.classList.add('cursor'); // 新消息也激活光标
			}

			uiElements.metaDiv.style.color = '';
			
			const startTime = Date.now();
			const timerInterval = setInterval(() => {
				const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
				uiElements.metaDiv.innerText = `GENERATING: ${elapsed}s`;
			}, 100);

			try {

				// 过滤无关的数据
				const apiHistory = contextHistory.map(({role, content}) => {
					if(!Array.isArray(content)) content = [ { type: 'text', text: content } ];

					const _content = content.map((c) => { switch (c.type) {
						case 'text':
							return { type: c.type, text: c.text };
						case 'image_url':
							return { type: c.type, image_url: { url: c.image_url.url } };
						default:
							return c;
					}});

					return { role: role, content: _content };
				});

				const responseStream = AIService.chat(apiHistory, currentModel);

				// 2. 循环处理流数据
				let isRendering = 0;
				let think = 0;
				let fullText = '';
				for await (const part of responseStream) {
					
					// 处理思考消息
					if(part.reasoning && think === 0){
						think = 1;
						fullText += `<details class="think __pChat__"><summary>[THINK]</summary>\n\n`;
					}
					if(part.reasoning){
						fullText += part.reasoning;
					}

					if(part.text){
						if (think === 1) {
							think = 2;
							fullText += `\n\n</details>\n\n`;
						}
						fullText += part.text;
					}

					// 延迟渲染, 防止卡顿
					if(isRendering > 1) continue;
					while(isRendering === 1) await new Promise((resolve) => setTimeout(resolve, 20));
					isRendering += 1;

					// 渲染新内容
					const newHtmlContent = DOMPurify.sanitize(await worker.run('renderMarkdown', fullText), DOMPurifyConfig);
					// const newHtmlContent = DOMPurify.sanitize(marked.parse(fullText), DOMPurifyConfig);
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

					if (think === 1) {
						uiElements.contentDiv.querySelector('.think.__pChat__').open = true;
					}

					// 思考完毕后折叠思考内容
					if (think === 2) {
						think = 0;
						setTimeout(() => {
							uiElements.contentDiv.querySelector('.think.__pChat__').open = false;
						}, 200);
					}

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

				// 震动反馈
				vibrate(50);

				const finalContent = [{ type: 'text', text: fullText }]; // 包装成数组

				// 4. 更新内存中的历史记录
				if (msgId) {
					const targetIndex = chatHistory.findIndex(m => m.id === msgId);
					if (targetIndex !== -1) {
						chatHistory[targetIndex].content = finalContent;
						chatHistory[targetIndex].model = currentModel;
						// [新增] 保存统计信息
						chatHistory[targetIndex].stats = statsText;
					}
				} else {
					chatHistory.push({
						role: 'assistant',
						content: finalContent,
						id: msgId,
						model: currentModel,
						stats: statsText,
					});
				}

				// 5. 最后再一次性保存到 IndexedDB (避免频繁 IO)
				await saveCurrentSession();

			} catch (err) {
				clearInterval(timerInterval);
				console.error(err);
				uiElements.contentDiv.textContent += `\n\n[SYSTEM ERROR]: ${err.message}`;
				uiElements.metaDiv.innerText = `FAIL`;
				uiElements.metaDiv.style.color = '#ff3333';
			} finally {
				// 移除光标样式，恢复按钮状态
				uiElements.contentDiv.classList.remove('cursor');
				msgDiv.classList.remove('isProcessing');
				toggleState(false);
				if (!msgId) scrollToBottom();
			}
		},
	};

	async function appendMessageToDOM({
		role,
		content,
		id,
		model = null,
		animate = true,
		stats = null,
		isCollapsed = false,
		isRaw = undefined,
		cursor = true,
		display = '',
	}) {
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
			<div class="content markdown-body ${(role === 'assistant' && cursor) ? 'cursor' : ''} ${isCollapsed ? 'collapsed' : ''}" contenteditable="${isRendered ? 'false' : 'plaintext-only'}" spellcheck="false"></div>
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

		// 兼容旧格式
		const contentArray = Array.isArray(content) ? content : [{ type: 'text', text: content || '' }];
		
		const previewContentArea = msgDiv.querySelector('.preview-content');
		const contentArea = msgDiv.querySelector('.content');

		// 始终渲染所有图片
		for(const item of contentArray){
			if(item.type === 'image_url'){
				previewContentArea.innerHTML += `
					<div id="${item.id}" class="preview-item">
						<img src="${item.image_url.url}">
						<span class="file-info">${item.name}</span>
						<span class="remove-img" onclick="removeAttachedImage('${item.id}', '${id}')">&times;</span>
					</div>
				`;
			}
		}

		if (isRendered && !isCollapsed) {
			// 正常渲染
			for(const item of contentArray){
				if(item.type === 'text'){
					contentArea.innerHTML += DOMPurify.sanitize(await worker.run('renderMarkdown', item.text), DOMPurifyConfig);
				}
			}
		} else {
			// 显示摘要
			for(const item of contentArray){
				if(item.type === 'text'){
					contentArea.textContent += item.text;
				}
			}
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

		messageArea.appendChild(msgDiv);

		addMinimapItem(role, id, isCollapsed);

		if(animate) scrollToBottom();

		return {
			contentDiv: contentArea,
			metaDiv: msgDiv.querySelector('.meta-stats'),
			msgDiv: msgDiv,
		};
	}

	async function updateHistoryContent(id, newText) {
		const item = chatHistory.find(m => m.id === id);
		if (item) {
			if(Array.isArray(item.content)){
				for(const c of item.content){
					if(c.type === 'text'){
						c.text = newText;
						break;
					}
				}
			}else{
				item.content = newText;
			}
			await saveCurrentSession();
		}
	}

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

	function renderImagePreviews(attachedImageElement = null, meta = null) {
		if(attachedImageElement && meta){
			const div = document.createElement('div');
			div.className = 'preview-item';
			div.innerHTML = `
				<span class="file-info">${meta.name}</span>
				<span class="remove-img" onclick="removeAttachedImage('${meta.id}', 'userInput')">&times;</span>
			`;
			div.insertBefore(attachedImageElement, div.firstChild);
			imagePreviewContainer.appendChild(div);
			return;
		}
		imagePreviewContainer.innerHTML = attachedImages.map((img) => `
			<div class="preview-item">
				<img src="${img.image_url.url}">
				<span class="file-info">${img.name}</span>
				<span class="remove-img" onclick="removeAttachedImage('${img.id}', 'userInput')">&times;</span>
			</div>
		`).join('');
	}

	async function attachedImage(fileName, imageBase64){
		const img = new Image();
		await new Promise((resolve) => {
			img.src = imageBase64;
			img.onload = resolve;
		});
		let zoom = 1;
		const canvas = document.createElement('canvas');
		canvas.width = img.width * zoom;
		canvas.height = img.height * zoom;
		canvas.getContext('2d').drawImage(img, 0, 0, img.width * zoom, img.height * zoom);
		const pngBase64 = canvas.toDataURL('image/png');

		// 如果 imageBase64 重复就不添加
		if(attachedImages.some(img => img.image_url.url === pngBase64)) return;

		const imgId = 'img_' + Date.now() + Math.random();
		attachedImages.push({
			type: 'image_url',
			image_url: { url: pngBase64 },
			id: imgId,
			name: fileName.replace(/\.[^\.]*$/, ''),
		});
		renderImagePreviews(img, attachedImages.at(-1));
	}

	window.regenerateMessage = function(id) {
		if (isProcessing) return;
		AIService.performAIRequest(id);
	}

	window.toggleMessageView = async function(id) {
		// 不能切换正在处理中的消息
		if (isProcessing && document.getElementById(id).classList.contains('isProcessing')) return;

		const msgDiv = document.getElementById(id);
		if (!msgDiv) return;

		const contentDiv = msgDiv.querySelector('.content');
		const toggleBtn = msgDiv.querySelector('.btn-toggle');
		
		// 获取当前状态
		const isRendered = msgDiv.dataset.rendered === 'true';
		
		// 获取当前对应的历史消息内容
		const msgItem = chatHistory.find(m => m.id === id);
		if (!msgItem) return;
		const rawContent = msgItem.content.find(c => c.type === 'text')?.text ?? '';

		if (isRendered) {
			// === 切换到源码模式 (RAW) ===
			// 1. 切换内容为纯文本
			contentDiv.textContent = rawContent;
			// 2. 允许编辑
			contentDiv.contentEditable = 'plaintext-only';
			contentDiv.classList.add('editable');
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
			contentDiv.innerHTML = DOMPurify.sanitize(await worker.run('renderMarkdown', currentRawText), DOMPurifyConfig);
			// contentDiv.innerHTML = DOMPurify.sanitize(marked.parse(currentRawText), DOMPurifyConfig);
			// 4. 禁止编辑 (渲染后的 HTML 不适合直接编辑)
			contentDiv.contentEditable = 'false';
			contentDiv.classList.remove('editable');
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
		
		const contentDiv = msgDiv.querySelector('.content');
		
		// 切换 collapsed 类
		contentDiv.classList.toggle('collapsed');
		
		const msgItem = chatHistory.find(m => m.id === id);
		msgItem.isCollapsed = contentDiv.classList.contains('collapsed');

		// 延迟渲染
		if (!msgItem.isCollapsed && !msgItem.isRaw && contentDiv.dataset.lazy === 'true') {
			// 从内存或 dom 中得到消息原始内容
			const rawText = msgItem ? msgItem.content : contentDiv.textContent;
			contentDiv.innerHTML = DOMPurify.sanitize(await worker.run('renderMarkdown', rawText), DOMPurifyConfig);
			// contentDiv.innerHTML = DOMPurify.sanitize(marked.parse(rawText), DOMPurifyConfig);
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
			await AIService.performAIRequest(nextMsg.id);
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
			await AIService.performAIRequest(newAiId);
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
		const currentTitle = sessions.find(s => s.id === cfg.lastSessionId)?.title || 'New Session';
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
			attachedImages = attachedImages.filter(img => img.id !== imgId);
			renderImagePreviews();
		} else {
			if(isProcessing) return;
			// 从当前聊天中删除图片并保存
			const msg = chatHistory.find(msg => msg.id === msgId);
			if(msg){
				msg.content = msg.content.filter(item => item.id !== imgId);
				saveCurrentSession();
				document.getElementById(imgId).remove();
			}
		}
	};

	// 监听模型改变，保存用户偏好
	modelSelect.addEventListener('change', () => {
		cfg.setItem('lastModel', modelSelect.value);
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

	userInput.addEventListener('paste', async (e) => {
		const items = Array.from(e.clipboardData?.items || e.originalEvent.clipboardData?.items);
		// 立即请求文件, 防止被清空
		const files = items.map(i => i.getAsFile());
		for(const file of files){
			if(!file.type.startsWith('image')) continue;
			await new Promise((resolve) => {
				const reader = new FileReader();
				reader.onload = async (event) => {
					await attachedImage(file.name || 'image', event.target.result);
					resolve();
				};
				reader.readAsDataURL(file);
			});
		}
	});

	attachedImageBtn.addEventListener('click', () => {
		attachedImageInput.value = '';
	    attachedImageInput.click();
	});

	attachedImageInput.addEventListener('change', async (e) => {
	    const files = e.target.files;
		for(const file of files){
			await new Promise((resolve) => {
				const reader = new FileReader();
				reader.onload = async (event) => {
					await attachedImage(file.name || 'image', event.target.result);
					resolve();
				};
				reader.readAsDataURL(file);
			});
		}
	});

	sendBtn.addEventListener('click', () => handleSend());

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

	// 监听滚动事件：碰到底部设为 true，离开底部设为 false
	rightPanel.addEventListener('scroll', () => {
		const threshold = 20;
		// 判断当前滚动位置是否在底部
		isAutoScroll = rightPanel.scrollTop + rightPanel.clientHeight >= rightPanel.scrollHeight - threshold;
	});

	// --- CONFIG PAGE ---
	if(true){

		// 加载配置页面内容
		document.querySelector('#config .content').innerHTML = `
<h2>数据</h2>
<p>在这里导入导出数据和配置:
	<button id="import-btn">[IMPORT]</button>
	<button id="export-btn">[EXPORT]</button>
	<input type="file" id="import-input" accept=".json" style="display: none;">
</p>
<p>注意: 导出文件包含模型配置和密钥等敏感信息</p>

<h2>会话</h2>

<p>默认系统提示词, 清空后跟随软件自动更新</p>
<pre id="defaultSystemPromptInput" contenteditable="plaintext-only">## Format
- All block tokens should have a blank line before and after them.
- Use \`\\n\\n$$ ... $$\\n\\n\` to display a block-level LaTeX formula.
---
You are a helpful coding assistant. Answer concisely.</pre>

<h2>模型</h2>
<p>关闭配置页面后自动刷新模型列表</p>

<details class="think model-service" data-service="Puter.js" open><summary>Puter.js</summary>
	<h2>优先显示模型</h2>
	<table class="input-config-table">
		<tr><td>优先匹配模型列表</td>
			<td><input id="puterPriorityModelsInput" name="puterPriorityModels" type="text" placeholder="qwen3-max, gemini-3-pro, deepseek-v3.2-exp" value=""></td>
		</tr>
	</table>
	<h2>登录状态</h2>
	<p>清除 puter.js 登录状态 (不会删除聊天记录): <button id="reset-puter-data">[LOGOUT]</button></p>
	<p>可能还需要前往 <a href="https://puter.com/" target="_blank">https://puter.com/</a> 删除所有 Cookie 来刷新账户</p>
	<p>禁用此服务后刷新页面以取消 puter.js 资源加载</p>
</details>

<details class="think model-service" data-service="OpenAI-API"><summary>OpenAI API</summary>
	<h2>API 配置</h2>
	<table class="input-config-table">
		<tr><td>BASE URL</td>
			<td><input id="openaiApiEndpointInput" name="openaiApiEndpoint" type="url" placeholder="https://api.openai.com/v1"></td>
		</tr>
		<tr><td>API 密钥 <code>[<span id="openaiApiKeyCount">0</span>]</code></td>
			<td><input id="openaiApiKeyInput" name="openaiApiKey" type="text" placeholder="sk-xxxxxx, sk-xxxxxx, sk-xxxxxx"></td>
		</tr>
		<tr><td>优先匹配模型列表</td>
			<td><input id="openaiPriorityModelsInput" name="openaiPriorityModels" type="text" placeholder="qwen3-max, gemini-3-pro, deepseek-v3.2-exp"></td>
		</tr>
	</table>
	<p>
		推荐使用 <a href="https://github.com/xixu-me/Xget?tab=readme-ov-file#ai-inference-providers" target="_blank">Xget</a> 代理,
		通过我们的部署, 例如: <code>https://xget.ipacel.cc/ip/openrouter/api/v1</code>
	</p>
	<p>支持添加多个 API 密钥, 轮询调用</p>
</details>
`;

		const configBtn = document.getElementById('config-btn');
		const importBtn = document.getElementById('import-btn');
		const exportBtn = document.getElementById('export-btn');
		const importInput = document.getElementById('import-input');
		const defaultSystemPromptInput = document.getElementById('defaultSystemPromptInput');
		const resetPuterData = document.getElementById('reset-puter-data');
		const puterPriorityModelsInput = document.getElementById('puterPriorityModelsInput');
		const openaiApiEndpointInput = document.getElementById('openaiApiEndpointInput');
		const openaiApiKeyInput = document.getElementById('openaiApiKeyInput');
		const openaiApiKeyCount = document.getElementById('openaiApiKeyCount');
		const openaiPriorityModelsInput = document.getElementById('openaiPriorityModelsInput');

		let openaiApiModify = false;

		// --- 配置页面数据更新和监听 ---

		// defaultSystemPrompt: '',
		const localDefaultSystemPrompt = defaultSystemPromptInput.textContent;
		if(cfg.defaultSystemPrompt){
			defaultSystemPromptInput.textContent = cfg.defaultSystemPrompt;
		}else{
			cfg.defaultSystemPrompt = localDefaultSystemPrompt;
		}
		defaultSystemPromptInput.addEventListener('input', () => {
			const str = defaultSystemPromptInput.textContent.replace(/^\s*\n+|\s+$/g, '');
			cfg.setItem('defaultSystemPrompt', str);
			if(!str) cfg.defaultSystemPrompt = localDefaultSystemPrompt;
		});

		// modelService: '',
		const modelServiceList = document.querySelectorAll('.config details.model-service');
		for(const e of modelServiceList){
			const service = e.dataset.service;
			e.open = cfg.modelService === service;
			e.addEventListener('toggle', () => {
				if(!e.open) return;
				// 折叠其他所有服务
				setTimeout(() => {
					for(const e2 of modelServiceList){
						if(service !== e2.dataset.service) e2.open = false;
					}
				}, 100);
				// 保存选择的服务
				cfg.setItem('modelService', service);
				// 切换服务后刷新模型列表, 忽略页面加载时的触发
				if(interacted) openaiApiModify = true;
			});
		}
		
		// puterPriorityModels: [],
		puterPriorityModelsInput.value = cfg.puterPriorityModels.join(', ');
		puterPriorityModelsInput.addEventListener('input', () => {
			const list = puterPriorityModelsInput.value.split(/\,|\;|，|；/).map(s => s.trim()).filter(s => s);
			cfg.setItem('puterPriorityModels', list);
		});

		// openaiApiEndpoint: '',
		openaiApiEndpointInput.value = cfg.openaiApiEndpoint;
		openaiApiEndpointInput.addEventListener('input', (event) => {
			cfg.setItem('openaiApiEndpoint', event.target.value);
			openaiApiModify = true;
		});

		// openaiApiKey: [],
		if(typeof cfg.openaiApiKey === 'string') cfg.openaiApiKey = [ cfg.openaiApiKey ]; // 兼容旧版本数据
		openaiApiKeyInput.value = cfg.openaiApiKey.join(', ');
		openaiApiKeyCount.innerText = cfg.openaiApiKey.length;
		openaiApiKeyInput.addEventListener('input', () => {
			const list = openaiApiKeyInput.value.split(/\,|\;|，|；/).map(s => s.trim()).filter(s => s);
			cfg.setItem('openaiApiKey', list);
			openaiApiKeyCount.innerText = list.length;
			openaiApiModify = true;
		});

		// openaiPriorityModels: [],
		openaiPriorityModelsInput.value = cfg.openaiPriorityModels.join(', ');
		openaiPriorityModelsInput.addEventListener('input', () => {
			const list = openaiPriorityModelsInput.value.split(/\,|\;|，|；/).map(s => s.trim()).filter(s => s);
			cfg.setItem('openaiPriorityModels', list);
			openaiApiModify = true;
		});

		// --- 配置页面 ---

		// 打开配置界面
		configBtn.addEventListener('click', async () => {
			configBtn.classList.toggle('open');
			if(configBtn.classList.contains('open')){

				// 重新填充默认提示词
				defaultSystemPromptInput.textContent = cfg.defaultSystemPrompt;

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

				// 重新加载模型列表
				if(openaiApiModify){
					openaiApiModify = false;
					AIService.loadModels();
				}
			}
			sidebarToggle.checked = false;
		});

		// 导出功能
		exportBtn.addEventListener('click', async () => {
			// 二次确认
			if (!confirm('确认: 导出数据')) {
				return;
			}

			const originalText = exportBtn.innerText;
			exportBtn.innerText += '...';

			try {
				const backupData = {
					timestamp: Date.now(),
					version: IDBManager.version,
					config: await IDBManager.getConfig(),
					sessions: await IDBManager.getAllSessions(),
					chats: await IDBManager.getAllChats(),
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

			} catch (err) {
				console.error('Export failed:', err);
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
			if (!confirm('确认: 导入并合并数据, ID 冲突的数据将被覆盖')) {
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

		// 重置 puter.js 登录
		resetPuterData.addEventListener('click', async () => {
			// 二次确认
			if (!confirm('确认: 清除 puter.js 登录状态')) {
				return;
			}
			if(window.puter) await window.puter.auth.logout();
			// 列出所有 data, 删除 "puter." 开头的数据
			for (let i = 0; i < localStorage.length; i++) {
				const key = localStorage.key(i);
				if (key.startsWith('puter.')) {
					await localStorage.removeItem(key);
					i--;
				}
			}
			// 删除数据库 puter_cache (不考虑锁)
			indexedDB.deleteDatabase('puter_cache');
			setTimeout(location.reload, 100);
		});
	}

	// 判断用户是否与网页交互过
	for(const eventType of [ 'click', 'touchstart', 'keydown', 'mousedown', 'touchend' ]){
		document.addEventListener(eventType, () => {
			interacted = true;
		}, { once: true });
	}

	// 阻止 pre 编辑
	document.addEventListener('beforeinput', (e) => {
		// 忽略可编辑的元素 (提高性能)
		if (e.target.tagName === 'INPUT' ||
			e.target.tagName === 'TEXTAREA' ||
			e.target.classList.contains('editable')) {
			return;
		}
		// 阻止编辑
		const pre = e.target.closest('.no-edit');
		if (pre) e.preventDefault();
	});

	// --- Initialization ---
	if(true){

		// 推迟加载公式字体
		const fontLink = document.createElement('link');
		fontLink.rel = 'stylesheet';
		fontLink.href = 'https://cdn.jsdelivr.net/npm/katex/dist/katex.min.css';
		document.querySelector('head').appendChild(fontLink);

		// 异步加载模型
		AIService.loadModels();

		// [修改] 1. 每次启动时，强制重置欢迎会话的内容到数据库
		await createIntroSession();

		// [修改] 2. 从数据库加载所有会话列表 (此时必定包含刚刚写入的 welcome 会话)
		await loadSessionsIndex();

		// 检查上一次的会话 ID 是否还存在于当前的会话列表中
		if (sessions.some(s => s.id === cfg.lastSessionId)) {
			// 如果上次的会话还存在，加载上次的
			await switchSession(cfg.lastSessionId);
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
	}

	// 删除旧数据
	setTimeout(async () => {
		await IDBManager.delConfig('puter_priorityModels');
	}, 2000);

});
