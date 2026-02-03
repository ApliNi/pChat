import { aiService } from "./aiService.js";
import { appendMsgDOM } from "./chat.js";
import { renderSidebar } from './session.js';
import { switchSession } from './session.js';
import { updateSessionTitleIfNeeded } from './session.js';
import { saveCurrentSession } from './session.js';
import { tmp } from "./config.js";
import { imagePreviewContainer, rightPanel, sendBtn, statusDot, userInput } from "./dom.js";
import { IDBManager } from "./db.js";

export const generateId = () => 'msg_' + Date.now() + '_' + Math.floor(Math.random() * 10000);

export const generateSessionId = () => 'sess_' + Date.now();

export const vibrate = async (v) => {
	if(!tmp.interacted) return;
	if ('vibrate' in navigator) navigator.vibrate(v);
}

export const toggleState = (loading) => {
	tmp.isProcessing = loading;
	document.querySelectorAll('.destroy-btn').forEach(b => b.disabled = loading);

	if (loading) {
		statusDot.classList.add('active');
		sendBtn.innerText = 'STOP';
	} else {
		statusDot.classList.remove('active');
		sendBtn.innerText = 'SEND';
	}
};

export const toggleSessionPin = async (e, sessionId) => {
	e.stopPropagation();
	const session = tmp.sessions.find(s => s.id === sessionId);
	if (session) {
		session.pinned = !(session.pinned === true);
		session.timestamp = Date.now(); // 更新时间戳以改变排序
		await IDBManager.saveSessionMeta(session);
		renderSidebar();

		// 置顶后切换到该会话
		await switchSession(sessionId);
	}
};

export const scrollToBottom = (force = false, delay = 0) => {
	if(force) tmp.isAutoScroll = true;
	if(!tmp.isAutoScroll) return;
	if(delay > 0){
		setTimeout(() => { scrollToBottom(force); }, delay);
		return;
	}
	rightPanel.scrollTop = rightPanel.scrollHeight + 9999;
}

export const updateTitle = async (_title) => {
	const title = _title || 'New Session';
	if (window.matchMedia('(display-mode: standalone)').matches) {
		document.title = `${title}`;
		return;
	}
	document.title = `[Chat] ${title}`;
}

export const handleSend = async () => {
	try{
		// 删除字符串开头的换行和末尾的空白字符 (防止删除缩进)
		const text = userInput.value.replace(/^\s*\n+|\s+$/g, '');
		if (!text || tmp.isProcessing) return;
		
		userInput.value = '';

		const msgContent = [
			...tmp.attachedImages,
			{ type: 'text', text: text || '' },
		];

		await updateSessionTitleIfNeeded(text || '[Image]');

		const userMsgId = generateId();
		const userMsg = { role: 'user', content: msgContent, id: userMsgId, isRaw: true };
		tmp.chatHistory.push(userMsg);
		await appendMsgDOM(userMsg);

		// 重置附件
		tmp.attachedImages = [];
		renderImagePreviews();

		await saveCurrentSession();
		// 不等待 AI 回复
		aiService.performAIRequest();

	}catch(err){
		console.error(err);

	}finally{
		// 不输入内容也滚动到底部
		scrollToBottom(true, 70);
		// minimap.lastChild.click();
	}
}

export const renderImagePreviews = (attachedImageElement = null, meta = null) => {
	if(attachedImageElement && meta){
		const div = document.createElement('div');
		div.className = 'preview-item';
		div.innerHTML = `
			<span class="file-info">${meta.name}</span>
			<span class="remove-img" onclick="removeAttachedImage('${meta.id}', 'userInput')">&times;</span>
		`;
		attachedImageElement.loading = 'lazy';
		div.insertBefore(attachedImageElement, div.firstChild);
		imagePreviewContainer.appendChild(div);
		return;
	}
	imagePreviewContainer.innerHTML = tmp.attachedImages.map((img) => `
		<div class="preview-item">
			<img src="${img.image_url.url}" loading="lazy">
			<span class="file-info">${img.name}</span>
			<span class="remove-img" onclick="removeAttachedImage('${img.id}', 'userInput')">&times;</span>
		</div>
	`).join('');
}

export const attachedImage = async (fileName, imageBase64) => {
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
	if(tmp.attachedImages.some(img => img.image_url.url === pngBase64)) return;

	const imgId = 'img_' + Date.now() + Math.random();
	tmp.attachedImages.push({
		type: 'image_url',
		image_url: { url: pngBase64 },
		id: imgId,
		name: fileName.replace(/\.[^\.]*$/, ''),
	});
	renderImagePreviews(img, tmp.attachedImages.at(-1));
};

