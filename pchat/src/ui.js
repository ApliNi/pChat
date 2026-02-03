
console.log(String.raw`%c
| ~ |                   |
|  //| |\  | _| |\ _|   |
|    | ---------------- |
| %cApliNi - pChat%c    [Q_Q]
`, 'color: #008fff', 'color: #17d9ff', 'color: #008fff');

if ('serviceWorker' in navigator) {
	navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.3.1/+esm';
import morphdom from 'https://cdn.jsdelivr.net/npm/morphdom@2.7.7/+esm';
import { IDBManager } from './db.js';
import { cfg, tmp } from './config.js';
import { renderSidebar } from './session.js';
import { switchSession } from './session.js';
import { createIntroSession } from './session.js';
import { createNewSession } from './session.js';
import { aiService } from './aiService.js';
import { modelSelect } from './dom.js';

if(true){

	// 加载模块
	await import('./global.js');
	await import('./modules/configPage.js');
	await import('./modules/openImg.js');
	await import('./modules/pipWindow.js');

	// 推迟加载公式字体
	const fontLink = document.createElement('link');
	fontLink.rel = 'stylesheet';
	fontLink.href = 'https://cdn.jsdelivr.net/npm/katex/dist/katex.min.css';
	document.querySelector('head').appendChild(fontLink);

	// 异步加载模型
	aiService.loadModels().then(() => {
		// 保存当前选择的模型
		cfg.setItem('lastModel', modelSelect.value);
	});

	// 重置欢迎会话
	await createIntroSession();

	// 从数据库加载所有会话列表
	tmp.sessions = await IDBManager.getAllSessions();
	renderSidebar();

	// 检查上一次的会话 ID 是否还存在于当前的会话列表中
	if (tmp.sessions.some(s => s.id === cfg.lastSessionId)) {
		// 如果上次的会话还存在，加载上次的
		await switchSession(cfg.lastSessionId);
	} else {
		// 如果不存在（或是第一次来），加载时间最近的一个（通常就是刚刚创建的 Welcome）
		// 或者是列表中的第一个
		if (tmp.sessions.length > 0) {
			// 重新排序确保选中最新的
			const sorted = tmp.sessions.sort((a, b) => b.timestamp - a.timestamp);
			await switchSession(sorted[0].id);
		} else {
			// 理论上不会走到这里，因为 createIntroSession 保证了至少有一个会话
			await createNewSession();
		}
	}
}
