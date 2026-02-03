import { aiService } from "./aiService.js";
import { cfg, tmp } from "./config.js";
import { attachedImageInput } from "./dom.js";
import { attachedImage, handleSend } from "./util.js";
import { createNewSession } from './session.js';

// 全局跳转事件
navigation.addEventListener('navigate', (event) => {
	const url = new URL(event.destination.url);
	// 忽略命令功能
	if (url.hash.startsWith('#/')) {
		event.preventDefault();
	}
});

// 监听模型改变，保存用户偏好
modelSelect.addEventListener('change', () => {
	cfg.setItem('lastModel', modelSelect.value);
});

newChatBtn.addEventListener('click', () => {
	createNewSession();
	sidebarToggle.checked = false;
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
	const files = items
					.filter(i => i.type.startsWith('image'))
					.map(i => i.getAsFile());
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

sendBtn.addEventListener('click', () => {
	// 如果正在处理（AI输出中），则停止AI输出
	if (tmp.isProcessing) {
		aiService.stopAIOutput();
	} else {
		handleSend();
	}
});

// 监听滚动事件：碰到底部设为 true，离开底部设为 false
rightPanel.addEventListener('scroll', () => {
	const threshold = 20;
	// 判断当前滚动位置是否在底部
	tmp.isAutoScroll = rightPanel.scrollTop + rightPanel.clientHeight >= rightPanel.scrollHeight - threshold;
});

// 判断用户是否与网页交互过
for(const eventType of [ 'click', 'touchstart', 'keydown', 'mousedown', 'touchend' ]){
	document.addEventListener(eventType, () => {
		tmp.interacted = true;
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
