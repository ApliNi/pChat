import { cfg, tmp } from "../config.js";
import { IDBManager } from "../db.js";
import { sidebar, sidebarToggle, minimap, rightPanel, newChatBtn, historyList } from '../dom.js';


// 加载配置页面内容
document.querySelector('#config .content').innerHTML = `
<h2>数据</h2>
<p>在这里导入导出数据和配置:
	<button id="import-btn">[IMPORT]</button>
	<button id="export-btn">[EXPORT]</button>
	<button id="export-current-session-btn">[EXPORT_THIS_CHAT]</button>
	<input type="file" id="import-input" accept=".json" style="display: none;">
</p>
<p>注意: 导出文件包含模型配置和密钥等敏感信息</p>


<h2>模板</h2>
<details class="think library"><summary>pChat Library</summary>
	<div class="library-list">
		<p class="loading">Loading...</p>
	</div>
</details>


<h2>会话</h2>
<p>默认系统提示词, 清空后跟随软件自动更新</p>
<pre id="defaultSystemPromptInput" contenteditable="plaintext-only">## Format
- All block tokens should have a blank line before and after them.
- Use \`\\n\\n$$ ... $$\\n\\n\` to display a block-level LaTeX formula.
- Use \`[Hello](#/user_send)\`, After the user clicks, it will automatically send \`Hello\`
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
const exportCurrentSessionBtn = document.getElementById('export-current-session-btn');
const importInput = document.getElementById('import-input');
const defaultSystemPromptInput = document.getElementById('defaultSystemPromptInput');
const resetPuterData = document.getElementById('reset-puter-data');
const puterPriorityModelsInput = document.getElementById('puterPriorityModelsInput');
const openaiApiEndpointInput = document.getElementById('openaiApiEndpointInput');
const openaiApiKeyInput = document.getElementById('openaiApiKeyInput');
const openaiApiKeyCount = document.getElementById('openaiApiKeyCount');
const openaiPriorityModelsInput = document.getElementById('openaiPriorityModelsInput');
const library = document.querySelector('#config details.library');

let openaiApiModify = false;

// --- 模板页面 ---
library.addEventListener('toggle', async () => {
	const libraryList = library.querySelector('.library-list');
	if(library.open){
		const list = await fetch('./library/index.json').then(res => res.json()).catch(() => []);
		libraryList.innerHTML = '';
		for(const li of list){
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
				if(lock) return;
				lock = true;
				div.querySelector('.install-btn').classList.add('loading');
				try{
					const url = li.url.replace(/^\#/, 'library/data');
					const data = await fetch(url).then(res => res.json());
					const result = await IDBManager.importBackup(data, true);
					await cfg.setItem('lastSessionId', result.newId);
					location.reload();
				}catch(err){
					console.error('Install failed:', err);
					alert('导入失败');
				}
			});
			libraryList.appendChild(div);
		}
	}else{
		libraryList.innerHTML = '<p class="loading">Loading...</p>';
	}
});

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
		if(tmp.interacted) openaiApiModify = true;
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

// 记住滚动条状态
let rightPanelScrollTop = 0;
// 打开配置界面
configBtn.addEventListener('click', async () => {
	configBtn.classList.toggle('open');
	if(configBtn.classList.contains('open')){
		sidebar.classList.add('open-config');
		rightPanelScrollTop = rightPanel.scrollTop;

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
		sidebar.classList.remove('open-config');
		for(const e of rightPanel.querySelectorAll('& > *')){
			e.style.display = '';
		}
		minimap.style.display = '';
		newChatBtn.style.pointerEvents = '';
		historyList.style.pointerEvents = '';
		rightPanel.querySelector('& > .config').style.display = 'none';

		rightPanel.scrollTop = rightPanelScrollTop;

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
	if (!confirm('确认: 导出所有数据')) {
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

// 导出当前会话功能
exportCurrentSessionBtn.addEventListener('click', async () => {
	// 检查是否有当前会话
	if (!cfg.lastSessionId) {
		alert('没有可导出的会话');
		return;
	}

	// 二次确认
	if (!confirm('确认: 导出当前会话')) {
		return;
	}

	const originalText = exportCurrentSessionBtn.innerText;
	exportCurrentSessionBtn.innerText += '...';

	try {
		// 获取当前会话信息
		const currentSession = tmp.sessions.find(s => s.id === cfg.lastSessionId);
		if (!currentSession) {
			alert('当前会话不存在');
			return;
		}

		// 获取当前会话的消息历史
		const currentSessionMessages = await IDBManager.getSessionMessages(cfg.lastSessionId);

		// 构建导出数据
		const sessionData = {
			timestamp: Date.now(),
			version: IDBManager.version,
			sessions: [currentSession], // 只包含当前会话
			chats: [{ id: cfg.lastSessionId, messages: currentSessionMessages }], // 只包含当前会话的消息
		};

		// 创建 Blob 并下载
		const blob = new Blob([JSON.stringify(sessionData, null, '\t')], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `pChat_Session_${currentSession.title.replace(/[<>:"/\\|?*]/g, '_') || 'untitled'}_${new Date().toISOString().slice(0,10)}.json`;
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

// 导入按钮点击
importBtn.addEventListener('click', () => {
	importInput.value = '';
	importInput.click();
});

// 处理文件选择
importInput.addEventListener('change', (e) => {
	const file = e.target.files[0];
	if (!file) return;

	// 选择是否覆盖 ID 相同的会话 (是, 否, 取消)
	const compatible = !confirm(`是否覆盖 ID 相同的会话?\n  - 确定: 保留导入的版本\n  - 取消: 同时保留两者`);

	const reader = new FileReader();
	reader.onload = async (event) => {
		try {
			const data = JSON.parse(event.target.result);
			
			await IDBManager.importBackup(data, compatible);
			
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

