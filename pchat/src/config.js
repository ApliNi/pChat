import { IDBManager } from "./db.js";
import { defaultSystemPrompt } from './text.js';

export const cfg = {
	lastSessionId: null,
	lastModel: null,
	defaultSystemPrompt: defaultSystemPrompt,

	modelService: 'Puter.js',
	puterPriorityModels: ['qwen', 'gemini', 'deepseek', 'claude'],
	openaiApiEndpoint: '',
	openaiApiKey: [],
	openaiPriorityModels: [],
	webdavUrl: '',
	webdavUser: '',
	webdavPass: '',
	webdavSyncMode: 'sync-latest',
	webdavSyncOnStart: false,
	webdavFileExt: 'json',
	webdavEncryptionKey: '',

	...(await IDBManager.getConfig()),
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
