import { aiService } from "../aiService.js";
import { cfg, tmp } from "../store.js";
import { IDBManager } from "../db.js";
import { sidebar, sidebarToggle, minimap, rightPanel, newChatBtn, historyList, configBtn, searchBtn, messageArea, inputContainer, headerH1 } from '../dom.js';
import { defaultSystemPrompt } from '../text.js';
import { webdavSync } from "./webdavSync.js";

const configContent = document.querySelector('#config .content');
configContent.innerHTML = '';

// 全局变量
let openaiApiModify = false;
let applyHeaderVisible = () => {};


// 界面
if (true) {
	configContent.insertAdjacentHTML('beforeend', /*html*/`
		<h2>界面</h2>
		<table class="input-config-table">
			<tr><td>Header 标题文本</td>
				<td><input id="headerTextInput" type="text" placeholder="[pChat.IpacEL.cc] (｡・̀ᴗ-)✧"></td>
			</tr>
			<tr><td>自动隐藏 Header</td>
				<td><label><input id="autoHideHeaderInput" type="checkbox"> 仅在打开配置时显示 (移动端模式无效)</label></td>
			</tr>
		</table>
	`);

	const headerTextInput = document.getElementById('headerTextInput');
	const autoHideHeaderInput = document.getElementById('autoHideHeaderInput');
	const header = document.querySelector('header');
	const defaultHeaderText = '[pChat.IpacEL.cc] (｡・̀ᴗ-)✧';

	applyHeaderVisible = () => {
		if (cfg.autoHideHeader && !configBtn.classList.contains('open')) {
			header.classList.add('hide');
		} else {
			header.classList.remove('hide');
		}
	};

	headerTextInput.value = cfg.headerText || '';
	headerTextInput.addEventListener('input', () => {
		cfg.setItem('headerText', headerTextInput.value);
		if (headerH1) headerH1.innerText = headerTextInput.value || defaultHeaderText;
	});

	autoHideHeaderInput.checked = cfg.autoHideHeader === true;
	autoHideHeaderInput.addEventListener('change', () => {
		cfg.setItem('autoHideHeader', autoHideHeaderInput.checked);
		applyHeaderVisible();
	});

	applyHeaderVisible();
}


// 数据
if (true) {
	configContent.insertAdjacentHTML('beforeend', /*html*/`
		<h2>数据</h2>
		<p>
			<span>在这里导入导出数据和配置:</span>
			<button id="import-btn" title="导入会话/配置 [覆盖相同会话]">[IMPORT]</button>
			<button id="export-btn" title="导出所有会话">[EXPORT]</button>
			<button id="export-current-session-btn" title="导出当前会话">[EXPORT_THIS_CHAT]</button>
			<button id="export-config-btn" title="导出配置">[EXPORT_CONFIG]</button>
		</p>
		<input type="file" id="import-input" accept=".json" style="display: none;">
		<p>注意: 导出文件包含对话记录/模型配置和密钥等敏感信息</p>
	`);

	const importBtn = document.getElementById('import-btn');
	const exportBtn = document.getElementById('export-btn');
	const exportCurrentSessionBtn = document.getElementById('export-current-session-btn');
	const exportConfigBtn = document.getElementById('export-config-btn');
	const importInput = document.getElementById('import-input');

	// 导出功能
	exportBtn.addEventListener('click', async () => {
		if (!confirm('确认: 导出所有会话')) return;
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
			const blob = new Blob([JSON.stringify(backupData, null, '\t')], { type: 'application/json' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `pChat_Backup_${new Date().toISOString().slice(0, 10)}.json`;
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

	// 导出当前会话功能
	exportCurrentSessionBtn.addEventListener('click', async () => {
		if (!cfg.lastSessionId) {
			alert('没有可导出的会话');
			return;
		}
		if (!confirm('确认: 导出当前会话')) return;
		const originalText = exportCurrentSessionBtn.innerText;
		exportCurrentSessionBtn.innerText += '...';
		try {
			const currentSession = tmp.sessions.find(s => s.id === cfg.lastSessionId);
			if (!currentSession) {
				alert('当前会话不存在');
				return;
			}
			const currentSessionMessages = await IDBManager.getSessionMessages(cfg.lastSessionId);
			const sessionData = {
				timestamp: Date.now(),
				version: IDBManager.version,
				sessions: [currentSession],
				chats: [{ id: cfg.lastSessionId, messages: currentSessionMessages }],
			};
			const blob = new Blob([JSON.stringify(sessionData, null, '\t')], { type: 'application/json' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `pChat_Session_${currentSession.title.replace(/[<>:"/\\|?*]/g, '_') || 'untitled'}_${new Date().toISOString().slice(0, 10)}.json`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
		} catch (err) {
			console.error('Export current session failed:', err);
			alert('导出当前会话失败');
		} finally {
			exportCurrentSessionBtn.innerText = originalText;
		}
	});

	// 导出配置功能
	exportConfigBtn.addEventListener('click', async () => {
		if (!confirm('确认: 导出配置 (包含密钥等敏感信息)')) return;
		const originalText = exportConfigBtn.innerText;
		exportConfigBtn.innerText += '...';
		try {
			const configData = {
				timestamp: Date.now(),
				version: IDBManager.version,
				config: await IDBManager.getConfig(),
			};
			const blob = new Blob([JSON.stringify(configData, null, '\t')], { type: 'application/json' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `pChat_Config_${new Date().toISOString().slice(0, 10)}.json`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
		} catch (err) {
			console.error('Export config failed:', err);
			alert('导出配置失败');
		} finally {
			exportConfigBtn.innerText = originalText;
		}
	});

	// 导入按钮点击
	importBtn.addEventListener('click', () => {
		importInput.value = '';
		importInput.click();
	});

	// 处理文件选择
	importInput.addEventListener('change', (e) => {
		const file = e.target.files[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = async (event) => {
			try {
				const data = JSON.parse(event.target.result);
				let compatible = false;
				if (data.sessions && data.sessions.length > 0) {
					compatible = !confirm(`检测到会话数据, 是否覆盖 ID 相同的会话?\n  - 确定: 保留导入的版本\n  - 取消: 同时保留两者`);
				}
				await IDBManager.importBackup(data, compatible);
				location.reload();
			} catch (err) {
				console.error(err);
				alert('Import failed: ' + err.message);
			}
		};
		reader.readAsText(file);
	});
}


// WebDAV 同步
if (true) {
	configContent.insertAdjacentHTML('beforeend', /*html*/`
		<h2>WebDAV 同步</h2>
		<table class="input-config-table">
			<tr><td>服务器/并发</td>
				<td style="display: flex; gap: 4px;">
					<input id="webdavUrlInput" type="url" placeholder="https://dav.example.com/dav">
					<input id="webdavSyncThreadsInput" type="number" placeholder="4" min="1" max="256" style="max-width: min-content;">
				</td>
			</tr>
			<tr><td>用户名/密码</td>
				<td style="display: flex; gap: 4px;">
					<input id="webdavUserInput" type="text" placeholder="username">
					<input id="webdavPassInput" class="password" type="text" placeholder="password">
				</td>
			</tr>
			<tr><td>加密密钥/文件后缀</td>
				<td style="display: flex; gap: 4px;">
					<input id="webdavEncryptionKeyInput" class="password" type="text" placeholder="留空将上传明文数据">
					<input id="webdavFileExtInput" type="text" placeholder="json" value="" style="max-width: min-content;">
				</td>
			</tr>
			<tr><td>同步模式</td>
				<td class="select-wrapper">
					<select id="webdavSyncModeSelect">
						<option value="sync-latest">同步到最新版本 [双向]</option>
						<option value="force-upload">强制上传 [本地 -> 远程] 覆盖远程所有数据</option>
						<option value="force-download">强制下载 [远程 -> 本地] 覆盖本地所有数据</option>
					</select>
				</td>
			</tr>
			<tr><td>同步选项</td>
				<td>
					<label title="启动后立即运行同步"><input id="webdavSyncOnStartInput" type="checkbox"> 启动时运行</label> |
					<label title="任何修改后延迟 15 秒同步"><input id="webdavSyncUpdateInput" type="checkbox"> 同步更新</label> |
					<label title="删除会话时同步"><input id="webdavSyncDeleteInput" type="checkbox"> 同步删除</label>
				</td>
			</tr>
		</table>
		<p>
			<span>目录: <code>./pChat/sync/{日期}/{会话文件}</code></span>
			<button id="webdav-sync-btn" title="立即运行同步">[RUN_SYNC]</button>
			<button id="webdav-cleanup-btn" title="清理远程文件和删除标记">[CLEAN]</button>
		</p>
		<p id="webdavSyncStatus" style="color: var(--text-color-muted);">同步未开始</p>
	`);

	const webdavUrlInput = document.getElementById('webdavUrlInput');
	const webdavUserInput = document.getElementById('webdavUserInput');
	const webdavPassInput = document.getElementById('webdavPassInput');
	const webdavSyncThreadsInput = document.getElementById('webdavSyncThreadsInput');
	const webdavSyncModeSelect = document.getElementById('webdavSyncModeSelect');
	const webdavFileExtInput = document.getElementById('webdavFileExtInput');
	const webdavEncryptionKeyInput = document.getElementById('webdavEncryptionKeyInput');
	const webdavSyncOnStartInput = document.getElementById('webdavSyncOnStartInput');
	const webdavSyncUpdateInput = document.getElementById('webdavSyncUpdateInput');
	const webdavSyncDeleteInput = document.getElementById('webdavSyncDeleteInput');
	const webdavSyncBtn = document.getElementById('webdav-sync-btn');
	const webdavCleanupBtn = document.getElementById('webdav-cleanup-btn');

	webdavUrlInput.value = cfg.webdavUrl;
	webdavUrlInput.addEventListener('input', () => cfg.setItem('webdavUrl', webdavUrlInput.value));
	webdavUserInput.value = cfg.webdavUser;
	webdavUserInput.addEventListener('input', () => cfg.setItem('webdavUser', webdavUserInput.value));
	webdavPassInput.value = cfg.webdavPass;
	webdavPassInput.addEventListener('input', () => cfg.setItem('webdavPass', webdavPassInput.value));

	webdavSyncThreadsInput.value = cfg.webdavSyncThreads;
	webdavSyncThreadsInput.addEventListener('input', () => {
		let val = parseInt(webdavSyncThreadsInput.value);
		if (val < 1) val = 1;
		if (val > 256) val = 256;
		cfg.setItem('webdavSyncThreads', val);
	});

	webdavSyncModeSelect.value = cfg.webdavSyncMode;
	webdavSyncModeSelect.addEventListener('change', () => cfg.setItem('webdavSyncMode', webdavSyncModeSelect.value));

	webdavFileExtInput.value = cfg.webdavFileExt;
	webdavFileExtInput.addEventListener('input', () => {
		const ext = webdavFileExtInput.value.replace(/^\.+/, '').trim() || 'json';
		cfg.setItem('webdavFileExt', ext);
	});

	webdavEncryptionKeyInput.value = cfg.webdavEncryptionKey;
	webdavEncryptionKeyInput.addEventListener('input', () => cfg.setItem('webdavEncryptionKey', webdavEncryptionKeyInput.value));

	webdavSyncOnStartInput.checked = cfg.webdavSyncOnStart;
	webdavSyncOnStartInput.addEventListener('change', () => cfg.setItem('webdavSyncOnStart', webdavSyncOnStartInput.checked));

	webdavSyncDeleteInput.checked = cfg.webdavSyncDelete;
	webdavSyncDeleteInput.addEventListener('change', () => cfg.setItem('webdavSyncDelete', webdavSyncDeleteInput.checked));

	webdavSyncUpdateInput.checked = cfg.webdavSyncUpdate;
	webdavSyncUpdateInput.addEventListener('change', () => cfg.setItem('webdavSyncUpdate', webdavSyncUpdateInput.checked));

	webdavSyncBtn.addEventListener('click', async () => {
		await webdavSync.sync(webdavSyncModeSelect.value);
	});

	webdavCleanupBtn.addEventListener('click', async () => {
		await webdavSync.cleanupRemoteDeleted();
	});
}


// 会话
if (true) {
	configContent.insertAdjacentHTML('beforeend', /*html*/`
		<h2>会话</h2>
		<p>默认系统提示词, 清空后跟随软件自动更新</p>
		<pre id="defaultSystemPromptInput" contenteditable="plaintext-only">${defaultSystemPrompt}</pre>
	`);

	const defaultSystemPromptInput = document.getElementById('defaultSystemPromptInput');

	const localDefaultSystemPrompt = defaultSystemPromptInput.textContent;
	if (cfg.defaultSystemPrompt) {
		defaultSystemPromptInput.textContent = cfg.defaultSystemPrompt;
	} else {
		cfg.defaultSystemPrompt = localDefaultSystemPrompt;
	}
	defaultSystemPromptInput.addEventListener('input', () => {
		const str = defaultSystemPromptInput.textContent.replace(/^\s*\n+|\s+$/g, '');
		cfg.setItem('defaultSystemPrompt', str);
		if (!str) cfg.defaultSystemPrompt = localDefaultSystemPrompt;
	});
}


// 模型
if (true) {
	configContent.insertAdjacentHTML('beforeend', /*html*/`
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
					<td><input id="openaiApiKeyInput" class="password" name="openaiApiKey" type="text" placeholder="sk-xxxxxx, sk-xxxxxx, sk-xxxxxx"></td>
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
	`);

	const resetPuterData = document.getElementById('reset-puter-data');
	const puterPriorityModelsInput = document.getElementById('puterPriorityModelsInput');
	const openaiApiEndpointInput = document.getElementById('openaiApiEndpointInput');
	const openaiApiKeyInput = document.getElementById('openaiApiKeyInput');
	const openaiApiKeyCount = document.getElementById('openaiApiKeyCount');
	const openaiPriorityModelsInput = document.getElementById('openaiPriorityModelsInput');

	const modelServiceList = document.querySelectorAll('.config details.model-service');
	for (const e of modelServiceList) {
		const service = e.dataset.service;
		e.open = cfg.modelService === service;
		e.addEventListener('toggle', () => {
			if (!e.open) return;
			setTimeout(() => {
				for (const e2 of modelServiceList) {
					if (service !== e2.dataset.service) e2.open = false;
				}
			}, 100);
			cfg.setItem('modelService', service);
			if (tmp.interacted) openaiApiModify = true;
		});
	}

	puterPriorityModelsInput.value = cfg.puterPriorityModels.join(', ');
	puterPriorityModelsInput.addEventListener('input', () => {
		const list = puterPriorityModelsInput.value.split(/\,|\;|，|；/).map(s => s.trim()).filter(s => s);
		cfg.setItem('puterPriorityModels', list);
	});

	openaiApiEndpointInput.value = cfg.openaiApiEndpoint;
	openaiApiEndpointInput.addEventListener('input', (event) => {
		cfg.setItem('openaiApiEndpoint', event.target.value);
		openaiApiModify = true;
	});

	if (typeof cfg.openaiApiKey === 'string') cfg.openaiApiKey = [cfg.openaiApiKey];
	openaiApiKeyInput.value = cfg.openaiApiKey.join(', ');
	openaiApiKeyCount.innerText = cfg.openaiApiKey.length;
	openaiApiKeyInput.addEventListener('input', () => {
		const list = openaiApiKeyInput.value.split(/\,|\;|，|；/).map(s => s.trim()).filter(s => s);
		cfg.setItem('openaiApiKey', list);
		openaiApiKeyCount.innerText = list.length;
		openaiApiModify = true;
	});

	openaiPriorityModelsInput.value = cfg.openaiPriorityModels.join(', ');
	openaiPriorityModelsInput.addEventListener('input', () => {
		const list = openaiPriorityModelsInput.value.split(/\,|\;|，|；/).map(s => s.trim()).filter(s => s);
		cfg.setItem('openaiPriorityModels', list);
		openaiApiModify = true;
	});

	resetPuterData.addEventListener('click', async () => {
		if (!confirm('确认: 清除 puter.js 登录状态')) return;
		if (window.puter) await window.puter.auth.logout();
		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i);
			if (key.startsWith('puter.')) {
				await localStorage.removeItem(key);
				i--;
			}
		}
		indexedDB.deleteDatabase('puter_cache');
		setTimeout(location.reload, 100);
	});
}


// 模板
if (true) {
	configContent.insertAdjacentHTML('beforeend', /*html*/`
		<h2>模板</h2>
		<details class="think library"><summary>pChat Library</summary>
			<div class="library-list">
				<p class="loading">Loading...</p>
			</div>
		</details>
	`);

	const library = document.querySelector('#config details.library');

	library.addEventListener('toggle', async () => {
		const libraryList = library.querySelector('.library-list');
		if (library.open) {
			const list = await fetch('./library/index.json').then(res => res.json()).catch(() => []);
			libraryList.innerHTML = '';
			for (const li of list) {
				const div = document.createElement('div');
				div.innerHTML = `
					<p class="name"></p>
					<p class="info"></p>
					<button class="install-btn"></button>
				`;
				div.querySelector('.name').textContent = li.name;
				div.querySelector('.info').textContent = li.info;
				let lock = false;
				div.querySelector('.install-btn').addEventListener('click', async () => {
					if (lock) return;
					lock = true;
					div.querySelector('.install-btn').classList.add('loading');
					try {
						const url = li.url.replace(/^\#/, 'library/data');
						const data = await fetch(url).then(res => res.json());
						const result = await IDBManager.importBackup(data, true);
						await cfg.setItem('lastSessionId', result.newId);
						location.reload();
					} catch (err) {
						console.error('Install failed:', err);
						alert('导入失败');
					}
				});
				libraryList.appendChild(div);
			}
		} else {
			libraryList.innerHTML = '<p class="loading">Loading...</p>';
		}
	});
}


// 自定义脚本
if (true) {
	configContent.insertAdjacentHTML('beforeend', /*html*/`
		<h2>自定义脚本</h2>
		<p>自定义 CSS, 修改后立即生效</p>
		<pre id="customCssInput" contenteditable="plaintext-only"></pre>
		<p>自定义 JS, 修改后刷新页面生效</p>
		<pre id="customJsInput" contenteditable="plaintext-only"></pre>
		<p>添加 URL 参数 <code>?safe</code> 临时禁用自定义脚本</p>
	`);

	const customCssInput = document.getElementById('customCssInput');
	const customJsInput = document.getElementById('customJsInput');

	customCssInput.textContent = cfg.customCss;
	customCssInput.addEventListener('input', () => {
		cfg.setItem('customCss', customCssInput.textContent);
		if (window.applyCustomStyles) window.applyCustomStyles();
	});

	customJsInput.textContent = cfg.customJs;
	customJsInput.addEventListener('input', () => {
		cfg.setItem('customJs', customJsInput.textContent);
	});
}


// 配置页面管理
if (true) {
	let scrollTop = 0;
	configBtn.addEventListener('click', async () => {
		const nowScrollTop = scrollTop;
		scrollTop = rightPanel.scrollTop;
		configBtn.classList.toggle('open');
		if (configBtn.classList.contains('open')) {
			if (searchBtn.classList.contains('open')) searchBtn.click();
			sidebar.classList.add('open-config');

			const defaultSystemPromptInput = document.getElementById('defaultSystemPromptInput');
			if (defaultSystemPromptInput) defaultSystemPromptInput.textContent = cfg.defaultSystemPrompt;

			for (const e of [messageArea, inputContainer]) {
				e.style.display = 'none';
			}
			minimap.style.display = 'none';
			newChatBtn.style.pointerEvents = 'none';
			historyList.style.pointerEvents = 'none';
			rightPanel.querySelector('& > .config').style.display = '';
			applyHeaderVisible();
		} else {
			sidebar.classList.remove('open-config');
			for (const e of [messageArea, inputContainer]) {
				e.style.display = '';
			}
			minimap.style.display = '';
			newChatBtn.style.pointerEvents = '';
			historyList.style.pointerEvents = '';
			rightPanel.querySelector('& > .config').style.display = 'none';

			applyHeaderVisible();

			if (openaiApiModify) {
				openaiApiModify = false;
				aiService.loadModels();
			}
		}
		sidebarToggle.checked = false;
		rightPanel.scrollTop = nowScrollTop;
	});
}
