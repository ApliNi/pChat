

export const IDBManager = {
	dbName: 'pChat.IpacEL.cc',
	version: 3,
	db: null,

	init() {
		return new Promise((resolve, reject) => {
			const request = indexedDB.open(this.dbName, this.version);

			request.onupgradeneeded = (e) => {
				const db = e.target.result;
				if (!db.objectStoreNames.contains('sessions')) {
					db.createObjectStore('sessions', { keyPath: 'id' });
				}
				if (!db.objectStoreNames.contains('chats')) {
					db.createObjectStore('chats', { keyPath: 'id' });
				}
				if (!db.objectStoreNames.contains('config')) {
					db.createObjectStore('config', { keyPath: 'id' });
				}
			};

			request.onsuccess = (e) => {
				this.db = e.target.result;
				resolve(this.db);
			};

			request.onerror = (e) => {
				console.error('IndexedDB Error:', e);
				alert('加载数据库时出现错误');
				reject(e);
			};
		});
	},

	getAllSessions() {
		return new Promise((resolve, reject) => {
			const tx = this.db.transaction('sessions', 'readonly');
			const store = tx.objectStore('sessions');
			const request = store.getAll();
			request.onsuccess = () => resolve(request.result || []);
			request.onerror = () => reject(request.error);
		});
	},

	saveSessionMeta(session) {
		return new Promise((resolve, reject) => {
			const tx = this.db.transaction('sessions', 'readwrite');
			const store = tx.objectStore('sessions');
			const request = store.put(session);
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	},

	deleteSession(sessionId) {
		return new Promise((resolve, reject) => {
			const tx = this.db.transaction(['sessions', 'chats'], 'readwrite');
			tx.objectStore('sessions').delete(sessionId);
			tx.objectStore('chats').delete(sessionId);
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	},

	getSession(sessionId) {
		return new Promise((resolve, reject) => {
			const tx = this.db.transaction('sessions', 'readonly');
			const store = tx.objectStore('sessions');
			const request = store.get(sessionId);
			request.onsuccess = () => {
				const session = request.result;
				if (session && (session.pinned === undefined || session.pinned === null)) {
					session.pinned = false;
				}
				resolve(session);
			};
			request.onerror = () => reject(request.error);
		});
	},

	getSessionMessages(sessionId) {
		return new Promise((resolve, reject) => {
			const tx = this.db.transaction('chats', 'readonly');
			const store = tx.objectStore('chats');
			const request = store.get(sessionId);
			request.onsuccess = () => {
				const res = request.result;
				resolve(res ? res.messages : []);
			};
			request.onerror = () => reject(request.error);
		});
	},

	saveSessionMessages(sessionId, messages) {
		return new Promise((resolve, reject) => {
			const tx = this.db.transaction('chats', 'readwrite');
			const store = tx.objectStore('chats');
			const request = store.put({ id: sessionId, messages: messages });
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	},
	
	getAllChats() {
		return new Promise((resolve, reject) => {
			const tx = this.db.transaction('chats', 'readonly');
			const store = tx.objectStore('chats');
			const request = store.getAll();
			request.onsuccess = () => resolve(request.result || []);
			request.onerror = () => reject(request.error);
		});
	},

	getConfig() {
		return new Promise(async (resolve, reject) => {
			if(!this.db) await this.init();
			const tx = this.db.transaction('config', 'readonly');
			const store = tx.objectStore('config');
			const request = store.getAll();
			request.onsuccess = () => {
				const config = {};
				request.result.forEach(item => {
					config[item.id] = item.value;
				});
				resolve(config);
			};
			request.onerror = () => reject(request.error);
		});
	},

	setConfig(id, value) {
		return new Promise(async (resolve, reject) => {
			const tx = this.db.transaction('config', 'readwrite');
			const store = tx.objectStore('config');
			const request = store.put({ id, value });
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	},

	delConfig(id) {
		return new Promise(async (resolve, reject) => {
			const tx = this.db.transaction('config', 'readwrite');
			const store = tx.objectStore('config');
			const request = store.delete(id);
			request.onsuccess = () => resolve();
			request.onerror = () => reject();
		});
	},

	importBackup(data, compatible = false) {

		if (!data.hasOwnProperty('sessions') || !data.hasOwnProperty('chats')) {
			throw new Error('Invalid backup file format: Missing required fields (sessions/chats)');
		}
		if (!Array.isArray(data.sessions) || !Array.isArray(data.chats)) {
			throw new Error('Invalid backup file format: sessions and chats must be arrays');
		}

		// 兼容模式下重写所有 id
		let newId = '';
		if(compatible){
			const time = Date.now();
			for(let i = 0; i < data.sessions.length; i++){
				newId = `sess_${time + i}`;
				data.sessions[i].timestamp = time;
				data.sessions[i].id = newId;
				data.chats[i].id = newId;
			}
		}

		return new Promise((resolve, reject) => {
			const tx = this.db.transaction(['sessions', 'chats', 'config'], 'readwrite');

			const configStore = tx.objectStore('config');
			if (Array.isArray(data.config)) {
				data.config.forEach(cfg => configStore.put(cfg));
			}
			const sessionStore = tx.objectStore('sessions');
			if (Array.isArray(data.sessions)) {
				data.sessions.forEach(session => sessionStore.put(session));
			}
			const chatStore = tx.objectStore('chats');
			if (Array.isArray(data.chats)) {
				data.chats.forEach(chat => chatStore.put(chat));
			}

			tx.oncomplete = () => resolve({ newId });
			tx.onerror = () => reject(tx.error);
		});
	},
};

await IDBManager.init();

// 删除旧数据
setTimeout(async () => {
	await IDBManager.delConfig('puter_priorityModels');
}, 7000);
