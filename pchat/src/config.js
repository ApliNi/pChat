import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.3.1/+esm';
import { IDBManager } from "./db.js";

export const cfg = {
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
window.cfg = cfg;

export const tmp = {
	messages: [],
	attachedImages: [],
	isProcessing: false,
	abortController: null,
	sessions: [],
	isAutoScroll: true,
	interacted: false,
};
window.tmp = tmp;
