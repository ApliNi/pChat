import { tmp } from "../config.js";
import { IDBManager } from "../db.js";
import { sidebar, sidebarToggle, minimap, rightPanel, newChatBtn, historyList, searchBtn, searchPage, configBtn, messageArea, inputContainer } from '../dom.js';
import { switchSession } from '../session.js';

// 加载搜索页面内容
searchPage.querySelector('.content').innerHTML = `
	<div class="search-controls">
		<input type="text" id="search-input" placeholder="Search titles...">
		<button id="search-deep-btn" title="Search all chat contents">DEEP SEARCH</button>
	</div>
	<div id="search-results-list">
		<p class="loading">Type keywords to start searching</p>
	</div>
`;

const searchInput = document.getElementById('search-input');
const searchDeepBtn = document.getElementById('search-deep-btn');
const searchResultsList = document.getElementById('search-results-list');

let rightPanelScrollTop = 0;
let isDeepSearch = false;

// 分页相关变量
let allResults = [];
let displayedCount = 0;
const PAGE_SIZE = 200;

// 切换搜索界面
searchBtn.addEventListener('click', async () => {
	searchBtn.classList.toggle('open');
	if(searchBtn.classList.contains('open')){
		// 关闭配置页面（如果打开了）
		if(configBtn.classList.contains('open')) configBtn.click();
		// 隐藏聊天组件

		sidebar.classList.add('open-search');
		rightPanelScrollTop = rightPanel.scrollTop;

		for(const e of [messageArea, inputContainer]){
			e.style.display = 'none';
		}
		minimap.style.display = 'none';
		newChatBtn.style.pointerEvents = 'none';
		historyList.style.pointerEvents = 'none';
		searchPage.style.display = '';
		
		searchInput.focus();
	}else{
		sidebar.classList.remove('open-search');
		for(const e of [messageArea, inputContainer]){
			e.style.display = '';
		}
		minimap.style.display = '';
		newChatBtn.style.pointerEvents = '';
		historyList.style.pointerEvents = '';
		searchPage.style.display = 'none';

		rightPanel.scrollTop = rightPanelScrollTop;
	}
	sidebarToggle.checked = false;
});

// 搜索逻辑
const performSearch = async (deep = false) => {
	const query = searchInput.value.trim().toLowerCase();
	if(!query){
		searchResultsList.innerHTML = '<p class="loading">Type keywords to start searching</p>';
		return;
	}

	searchResultsList.innerHTML = '<p class="loading">Searching...</p>';

	// 获取排序后的会话列表 (参考 sidebar 排序逻辑: pinned 优先, 然后按时间戳倒序)
	const sortedSessions = [...tmp.sessions].sort((a, b) => {
		if (a.pinned && !b.pinned) return -1;
		if (!a.pinned && b.pinned) return 1;
		return b.timestamp - a.timestamp;
	});

	let results = [];
	
	if(deep){
		// 搜索所有内容
		const allChats = await IDBManager.getAllChats();
		const chatMap = new Map(allChats.map(chat => [chat.id, chat]));

		for(const session of sortedSessions){
			const titleMatch = session.title.toLowerCase().includes(query);
			const chat = chatMap.get(session.id);
			
			let contentMatch = null;
			if(chat){
				for(const msg of chat.messages){
					for(const content of msg.content){
						if(content.type === 'text' && content.text.toLowerCase().includes(query)){
							contentMatch = content.text;
							const idx = contentMatch.toLowerCase().indexOf(query);
							const start = Math.max(0, idx - 40);
							const end = Math.min(contentMatch.length, idx + query.length + 40);
							contentMatch = (start > 0 ? '...' : '') + contentMatch.substring(start, end) + (end < contentMatch.length ? '...' : '');
							break;
						}
					}
					if(contentMatch) break;
				}
			}

			if(titleMatch || contentMatch){
				results.push({
					id: session.id,
					title: session.title || 'Untitled',
					snippet: contentMatch || ''
				});
			}
		}
	} else {
		// 仅搜索标题 (按 sortedSessions 顺序)
		results = sortedSessions
			.filter(s => s.title.toLowerCase().includes(query))
			.map(s => ({ id: s.id, title: s.title, snippet: '' }));
	}

	renderResults(results, query);
};

const renderResults = (results, query) => {
	allResults = results;
	displayedCount = 0;
	searchResultsList.innerHTML = '';
	
	if(results.length === 0){
		searchResultsList.innerHTML = '<p>No results found</p>';
		return;
	}

	loadMoreResults(query);
};

const loadMoreResults = (query) => {
	const nextBatch = allResults.slice(displayedCount, displayedCount + PAGE_SIZE);
	if (nextBatch.length === 0) return;

	const fragment = document.createDocumentFragment();
	nextBatch.forEach(res => {
		const div = document.createElement('div');
		div.className = 'search-result-item';
		
		// 高亮逻辑
		const highlight = (text) => {
			if(!text) return '';
			// 转义正则特殊字符
			const safeQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			const regex = new RegExp(`(${safeQuery})`, 'gi');
			return text.replace(regex, '<mark>$1</mark>');
		};

		div.innerHTML = `
			<div class="search-result-title">${highlight(res.title)}</div>
			${res.snippet ? `<div class="search-result-snippet">${highlight(res.snippet)}</div>` : ''}
		`;

		div.addEventListener('click', () => {
			// 如果 searchBtn 处于打开状态，则触发点击以关闭它
			if (searchBtn.classList.contains('open')) {
				searchBtn.click();
			}
			switchSession(res.id);
		});

		fragment.appendChild(div);
	});

	searchResultsList.appendChild(fragment);
	displayedCount += nextBatch.length;

	// 如果还有更多，添加加载提示（可选）
	if (displayedCount < allResults.length) {
		const moreLabel = document.createElement('p');
		moreLabel.className = 'loading-more';
		moreLabel.textContent = `Scroll to load more (${displayedCount}/${allResults.length})`;
		searchResultsList.appendChild(moreLabel);
	}
};

// 监听滚动加载
rightPanel.addEventListener('scroll', () => {
	if (!searchBtn.classList.contains('open')) return;
	
	const { scrollTop, scrollHeight, clientHeight } = rightPanel;
	// 距离底部 500px 时开始加载
	if (scrollTop + clientHeight >= scrollHeight - 500) {
		// 移除之前的加载提示
		const oldLabel = searchResultsList.querySelector('.loading-more');
		if (oldLabel) oldLabel.remove();

		if (displayedCount < allResults.length) {
			loadMoreResults(searchInput.value.trim().toLowerCase());
		}
	}
});

searchInput.addEventListener('input', () => performSearch(isDeepSearch));
searchDeepBtn.addEventListener('click', () => {
	isDeepSearch = !isDeepSearch;
	searchDeepBtn.classList.toggle('active', isDeepSearch);
	searchInput.placeholder = isDeepSearch ? "Search all contents..." : "Search titles...";
	performSearch(isDeepSearch);
});
searchInput.addEventListener('keydown', (e) => {
	if(e.key === 'Enter') performSearch(isDeepSearch);
});
