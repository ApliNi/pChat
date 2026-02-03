import { pipWindowBtn } from "../dom.js";

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
