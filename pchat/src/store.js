import { IDBManager } from "./db.js";
import { defaultSystemPrompt } from './text.js';

// 初始状态
const initialState = {
	cfg: {
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
		webdavSyncDelete: false,
		webdavFileExt: 'json',
		webdavEncryptionKey: '',
		pinnedCollapsed: false,
		headerText: '',
		autoHideHeader: false,
		customCss: '',
		customJs: '',
	},
	tmp: {
		messages: [],
		attachedImages: [],
		isProcessing: false,
		syncTasks: 0,
		abortController: null,
		sessions: [],
		isAutoScroll: true,
		interacted: false,
	}
};

// 从数据库加载配置
const dbConfig = await IDBManager.getConfig();

export const cfg = { ...initialState.cfg, ...dbConfig };
export const tmp = { ...initialState.tmp };

// 简单的订阅机制
const _listeners = new Set();
export function subscribe(callback) {
	_listeners.add(callback);
	return () => _listeners.delete(callback);
}
function _notify(type, key, value) {
	_listeners.forEach(cb => cb({ type, key, value }));
}

// 更新配置并持久化
export async function setConfig(key, value) {
	cfg[key] = value;
	await IDBManager.setConfig(key, value);
	_notify('cfg', key, value);
}

// 更新临时状态
export function setTmp(key, value) {
	tmp[key] = value;
	_notify('tmp', key, value);
}

export const store = {
	cfg,
	tmp,
	setConfig,
	setTmp,
	subscribe
};

// 为了兼容旧代码，暂时保留全局引用，稍后逐步移除
window.cfg = cfg;
window.tmp = tmp;
// 注入 setItem 兼容旧代码
cfg.setItem = (id, value) => setConfig(id, value);
