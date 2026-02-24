import morphdom from 'https://cdn.jsdelivr.net/npm/morphdom@2.7.7/+esm';
import { cfg, tmp } from "./config.js";
import { modelSelect } from "./dom.js";
import { generateId, scrollToBottom, toggleState, vibrate } from "./util.js";
import { appendMsgDOM, renderContent, renderContentDOM } from './chat.js';
import { saveCurrentSession } from './session.js';


export const aiService = {

	// 动态加载 puter.js
	loadPuter: async () => {
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
	getOpenAiKey: () => {
		if(typeof cfg.openaiApiKey === 'string') cfg.openaiApiKey = [ cfg.openaiApiKey ]; // 兼容旧版本数据
		const length = cfg.openaiApiKey.length;
		if(aiService.__getOpenAiApiIdx === -1){
			aiService.__getOpenAiApiIdx = Math.floor(Math.random() * length);
		}
		aiService.__getOpenAiApiIdx = (aiService.__getOpenAiApiIdx + 1) % length;
		return cfg.openaiApiKey[aiService.__getOpenAiApiIdx];
	},

	// 获取模型列表
	loadModels: async () => {
		try {
			
			modelSelect.innerHTML = `
				<option class="loading" value="">/// Loading ///</option>
			`;

			let models;

			if (cfg.modelService === 'Puter.js') {

				if (!window.puter) await aiService.loadPuter();

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
						'Authorization': `Bearer ${aiService.getOpenAiKey()}`
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
	chat: async function* (messages, model, signal = null) {
		if (cfg.modelService === 'Puter.js') {

			if (!window.puter) await aiService.loadPuter();

			// 注意：Puter.js 可能不直接支持中止信号，但我们仍然可以尽早退出循环
			const response = await window.puter.ai.chat(messages, { model, stream: true });
			for await (const part of response) {
				// 检查是否被中止
				if (signal && signal.aborted) {
					break;
				}
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
					'Authorization': `Bearer ${aiService.getOpenAiKey()}`
				},
				body: JSON.stringify({
					model: model,
					messages: messages,
					stream: true,
				}),
				signal: tmp.abortController.signal,
			});

			if (!response.ok) {
				const err = await response.json();
				throw new Error(err.error?.message || 'OpenAI API Request Failed');
			}

			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';

			_while: while (true) {
				// 检查是否被中止
				if (signal && signal.aborted) {
					reader.cancel();
					break;
				}
				
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop(); // 保持残余数据在缓冲区

				for (const line of lines) {
					// 检查是否被中止
					if (signal && signal.aborted) {
						reader.cancel();
						break;
					}
					
					const message = line.replace(/^data: /, '');
					if (!message) continue;
					if (message === '[DONE]') break _while;

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
	performAIRequest: async (msgId = null) => {
		if (tmp.isProcessing) return;
		
		// 创建一个新的AbortController用于中断请求
		tmp.abortController = new AbortController();
		
		toggleState(true);

		let msgIdx, msgDiv, contentHistory, uiElements, thisContent;

		if (msgId && document.getElementById(msgId)) {
			msgIdx = tmp.messages.findIndex(m => m.id === msgId);
			if (msgIdx === -1) {
				toggleState(false);
				return;
			}
			contentHistory = tmp.messages.slice(0, msgIdx);
			thisContent = tmp.messages[msgIdx];
			
			msgDiv = document.getElementById(msgId);
			const contentArea = msgDiv.querySelector('.content');
			const metaDiv = msgDiv.querySelector('.meta-stats');
			msgDiv.classList.add('isProcessing');
			msgDiv.dataset.rendered = 'true';
			msgDiv.querySelector('.btn-toggle').innerText = '[RAW]';
			contentArea.contentEditable = 'false'; // 生成时禁止编辑

			msgDiv.querySelector('.role-label span:first-child').innerText = cfg.lastModel.toUpperCase();
			
			contentArea.textContent = '';
			uiElements = { contentArea, metaDiv, msgDiv, };
		} else {
			contentHistory = [...tmp.messages];
			msgId = generateId();
			thisContent = {
				role: 'assistant',
				content: [ { type: 'text', text: '' } ],
				id: msgId,
				model: cfg.lastModel,
				stats: '',
				fromTopToBottom: false,
			};
			tmp.messages.push(thisContent);
			msgIdx = tmp.messages.length - 1;
			uiElements = await appendMsgDOM(thisContent);
			msgDiv = uiElements.msgDiv;
			msgDiv.classList.add('isProcessing');
		}

		uiElements.metaDiv.style.color = '';
		
		let startTime = Date.now();
		let loadingTime = 0;
		let firstTokenTime = null;
		let runTime = 0;
		const timerInterval = setInterval(() => {
			if(firstTokenTime === null){
				loadingTime = ((Date.now() - startTime) / 1000).toFixed(1);
				uiElements.metaDiv.innerText = `${loadingTime}s [Load]`;
			}else{
				runTime = ((Date.now() - firstTokenTime) / 1000).toFixed(1);
				uiElements.metaDiv.innerText = `${loadingTime}s | ${runTime}s [Run]`;
			}
		}, 100);

		try {

			// 过滤无关的数据
			const apiHistory = contentHistory.map(({role, content}) => {
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

			const responseStream = aiService.chat(apiHistory, cfg.lastModel, tmp.abortController.signal);

			// 2. 循环处理流数据
			let think = 0;
			let textItem = { type: 'text', text: '', reasoning: '' };
			for await (const part of responseStream) {
				// 检查是否被中止
				if (tmp.abortController.signal.aborted) {
					break;
				}

				if(firstTokenTime === null){
					firstTokenTime = Date.now();
				}
				
				if(part.reasoning){
					textItem.reasoning += part.reasoning;
				}

				if(part.text){
					textItem.text += part.text;
				}

				// 延迟渲染, 防止卡顿
				await new Promise((resolve) => requestAnimationFrame(resolve));

				// 渲染新内容
				const htmlContent = await renderContent([ textItem ]);
				morphdom(uiElements.contentArea, `<div>${htmlContent}</div>`, {
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

				// 处理思考框折叠
				const thinkEl = uiElements.contentArea.querySelector('.think.__pChat__');
				if(thinkEl){
					if(part.reasoning && think === 0){
						think = 1;
						thinkEl.open = true;
					}
					if(part.text && think === 1){
						think = 2;
						setTimeout(() => { thinkEl.open = false; }, 200);
					}
				}
				
				scrollToBottom();
			}
			
			await renderContentDOM(uiElements.contentArea);

			// 传输结束后的统计
			clearInterval(timerInterval);
			const duration = ((Date.now() - startTime) / 1000).toFixed(2);
			const estimatedTokens = Math.max(1, Math.round((textItem.text.length + textItem.reasoning.length) / 2.5)); // 估算 Token
			const tps = Math.round(estimatedTokens / duration);
			// 定义统计文本变量
			const statsText = `${Math.round(loadingTime)}s | ${Math.round(runTime)}s | ${tps} T/s`;
			uiElements.metaDiv.innerText = statsText;

			// 更新内存中的历史记录
			if(textItem.reasoning === '') delete textItem.reasoning;
			tmp.messages[msgIdx].content = [ textItem ];
			tmp.messages[msgIdx].model = cfg.lastModel;
			tmp.messages[msgIdx].stats = statsText;

			// 最后再一次性保存到 IndexedDB (避免频繁 IO)
			await saveCurrentSession();

			// 震动反馈
			vibrate(50);

		} catch (err) {
			clearInterval(timerInterval);
			// 如果是由于中断导致的错误，静默处理
			if (err.name === 'AbortError' || err.message.includes('aborted')) {
				uiElements.metaDiv.innerText = `STOPPED`;
				uiElements.metaDiv.style.color = '#ffcc33';
			} else {
				console.error(err);
				uiElements.metaDiv.innerText = `FAIL`;
				uiElements.metaDiv.style.color = '#ff3333';
			}
		} finally {
			msgDiv.classList.remove('isProcessing');
			toggleState(false);
			if (!msgId) scrollToBottom();
		}
	},
	
	// 停止AI输出
	stopAIOutput: () => {
		tmp.abortController?.abort();
	}
};
