
import hljs from 'https://cdn.jsdelivr.net/npm/highlight.js@11.11.1/+esm';
import Katex from 'https://cdn.jsdelivr.net/npm/katex@0.16.27/+esm';
import { Marked } from 'https://cdn.jsdelivr.net/npm/marked@17.0.1/+esm';
import markedKatex from 'https://cdn.jsdelivr.net/npm/marked-katex-extension@5.1.6/+esm';

(async () => {

	// --- function ---

	const formatDate = (ts) => {
		const d = new Date(ts);
		const year = d.getFullYear();
		const month = (d.getMonth() + 1).toString().padStart(2, '0');
		const day = d.getDate().toString().padStart(2, '0');
		const hour = d.getHours().toString().padStart(2, '0');
		const minute = d.getMinutes().toString().padStart(2, '0');
		return `${year}/${month}/${day} ${hour}:${minute}`;
	};

	const str = (str) => `${str ?? ''}`
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');

	const marked = new Marked();

	marked.use(markedKatex({ throwOnError: false, nonStandard: true }));
	marked.use({
		// async: true,
		breaks: true,
		gfm: true,

		renderer: {

			image: (token) => {
				let { href, raw, text, title } = token;
				return `<img src="${href}" alt="${str(text)}" title="${str(title ?? text)}" class="img-node" loading="lazy" />`;
			},

			code: (token) => {
				let { lang, raw, text, html } = token;
				const language = hljs.getLanguage(lang) ? lang : 'plaintext';
				return `<pre><code class="hljs language-${str(lang || 'plaintext')}">${hljs.highlight(text, { language }).value}</code></pre>`;
			},

			codespan: (token) => {
				let { lang, raw, text } = token;
				return `<code class="hljs">${hljs.highlightAuto(text).value}</code>`;
			},

			// html: (token) => {
			// 	try{
			// 		return lib.htmlEscape(token.text);
			// 	}catch(err){
			// 		console.error(err);
			// 	}
			// 	return '';
			// },
		},

		// walkTokens: async (token) => {
		// 	if(token.type === 'code' && token.lang === 'mermaid'){
		// 		const { svg } = await mermaid.render('graphDiv', token.text);
		// 		token.html = `<div class="mermaid">${svg}</div>`;
		// 	}
		// },
	});

	// --- main ---

	self.addEventListener('message', async (event) => {
		// 主线程发送的数据通过 event.data 访问
		const { type, data, id } = event.data;

		const send = (data) => {
			self.postMessage({ type, data, id });
		};

		// 渲染 Markdown
		if (type === 'renderMarkdown') {
			const html = await marked.parse(data);
			send(html);
		}

		else if(type === 'renderSidebar') {
			const { sessions } = data;

			// 首先按置顶状态排序，然后按时间戳排序
			const sortedSessions = [...sessions].sort((a, b) => {
				// 置顶的会话排在前面
				if (a.pinned && !b.pinned) return -1;
				if (!a.pinned && b.pinned) return 1;
				// 如果都置顶或都不置顶，则按时间戳排序
				return b.timestamp - a.timestamp;
			});
			
			// 分离置顶会话和普通会话
			const pinnedSessions = sortedSessions.filter(session => session.pinned);
			const unpinnedSessions = sortedSessions.filter(session => !session.pinned);
			
			// 对普通会话按年-月分组
			const groupedSessions = {};
			unpinnedSessions.forEach(session => {
				const date = new Date(session.timestamp);
				const yearMonth = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
				if (!groupedSessions[yearMonth]) {
					groupedSessions[yearMonth] = [];
				}
				groupedSessions[yearMonth].push(session);
			});
			
			// 构建HTML
			let html = '';
			
			// 添加置顶会话
			if (pinnedSessions.length > 0) {
				html += `<details class="history-group pinned-group" open><summary class="history-group-title">PINNED</summary>`;
				pinnedSessions.forEach(session => {
					html += `
						<div class="history-item" data-session-id="${session.id}" data-session-pinned="${!!session.pinned}">
							<div class="history-info">
								<div class="history-title" title="Double click to rename">${str(session.title) || 'New Session'}</div>
								<div class="history-date">${formatDate(session.timestamp)}</div>
							</div>
							<button class="history-btn history-pin-btn ${session.pinned ? 'pinned' : ''}" title="Pin/Unpin this session"></button>
							<button class="history-btn history-del-btn"></button>
						</div>`;
				});
				html += '</details>';
			}
			
			// 添加按年-月分组的普通会话
			const sortedYearMonths = Object.keys(groupedSessions).sort((a, b) => b.localeCompare(a)); // 按时间倒序排列年月
			sortedYearMonths.forEach(yearMonth => {
				const groupSessions = groupedSessions[yearMonth];
				let time = `${yearMonth.split('-')[0]}-` + `${yearMonth.split('-')[1]}`.padStart(2, '0');
				if(time === '1970-01') time = 'SYSTEM';
				html += `<details class="history-group" open><summary class="history-group-title">${time}</summary>`;
				groupSessions.forEach(session => {
					html += `
						<div class="history-item" data-session-id="${session.id}" data-session-pinned="${!!session.pinned}">
							<div class="history-info">
								<div class="history-title" title="Double click to rename">${str(session.title) || 'New Session'}</div>
								<div class="history-date">${formatDate(session.timestamp)}</div>
							</div>
							<button class="history-btn history-pin-btn ${session.pinned ? 'pinned' : ''}" title="Pin/Unpin this session"></button>
							<button class="history-btn history-del-btn"></button>
						</div>`;
				});
				html += '</details>';
			});
			
			send(html);
		}
		
	});

	self.postMessage({ type: 'init', data: null, id: 0 });

})();
