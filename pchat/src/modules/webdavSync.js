import { cfg, tmp } from "../config.js";
import { IDBManager } from "../db.js";
import { refreshStatusDot } from "../util.js";

/**
 * WebDAV Sync Module
 */
export const webdavSync = {
	
	dirCache: new Set(),
	_isMainSyncing: false,
	_updateUI: null,

	/**
	 * Encryption/Decryption Helpers
	 */
	async _deriveKey(password, salt) {
		const encoder = new TextEncoder();
		const passwordKey = await crypto.subtle.importKey(
			'raw',
			encoder.encode(password),
			'PBKDF2',
			false,
			['deriveKey']
		);
		return crypto.subtle.deriveKey(
			{
				name: 'PBKDF2',
				salt: salt,
				iterations: 100000,
				hash: 'SHA-256'
			},
			passwordKey,
			{ name: 'AES-GCM', length: 256 },
			false,
			['encrypt', 'decrypt']
		);
	},

	async _encrypt(text, password) {
		const encoder = new TextEncoder();
		const data = encoder.encode(text);
		const salt = crypto.getRandomValues(new Uint8Array(16));
		const iv = crypto.getRandomValues(new Uint8Array(12));
		const key = await this._deriveKey(password, salt);
		const ciphertext = await crypto.subtle.encrypt(
			{ name: 'AES-GCM', iv: iv },
			key,
			data
		);

		const combined = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
		combined.set(salt, 0);
		combined.set(iv, salt.length);
		combined.set(new Uint8Array(ciphertext), salt.length + iv.length);
		return combined;
	},

	async _decrypt(encryptedData, password) {
		const salt = encryptedData.slice(0, 16);
		const iv = encryptedData.slice(16, 28);
		const ciphertext = encryptedData.slice(28);
		const key = await this._deriveKey(password, salt);
		const decrypted = await crypto.subtle.decrypt(
			{ name: 'AES-GCM', iv: iv },
			key,
			ciphertext
		);
		return new TextDecoder().decode(decrypted);
	},

	_formatDuration(ms) {
		if (ms < 1000) return `${ms}ms`;
		const s = ms / 1000;
		if (s < 60) return `${s.toFixed(1)}s`;
		const m = Math.floor(s / 60);
		const rs = (s % 60).toFixed(0);
		return `${m}m${rs}s`;
	},

	/**
	 * WebDAV Basic Auth header
	 */
	getAuthHeader() {
		const credentials = `${cfg.webdavUser}:${cfg.webdavPass}`;
		const encoder = new TextEncoder();
		const data = encoder.encode(credentials);
		let binString = "";
		for (const byte of data) {
			binString += String.fromCharCode(byte);
		}
		return `Basic ${btoa(binString)}`;
	},

	/**
	 * Perform WebDAV request
	 */
	async request(method, path, body = null, headers = {}) {
		const baseUrl = cfg.webdavUrl.endsWith('/') ? cfg.webdavUrl : cfg.webdavUrl + '/';
		const cleanPath = path.startsWith('/') ? path.substring(1) : path;
		const url = baseUrl + cleanPath;

		const defaultHeaders = {
			'Authorization': this.getAuthHeader(),
		};
		
		const response = await fetch(url, {
			method,
			headers: { ...defaultHeaders, ...headers },
			body
		});

		if (response.status === 401) {
			throw new Error('WebDAV 401 认证失败');
		}

		if (!response.ok && !(method === 'MKCOL' && response.status === 405)) {
			throw new Error(`WebDAV ${method} ${path} failed: ${response.status} ${response.statusText}`);
		}

		return response;
	},

	/**
	 * Ensure directory exists
	 */
	async ensureDir(path) {
		const cleanPath = path.replace(/\/$/, '');
		if (this.dirCache.has(cleanPath)) return;

		const parts = cleanPath.split('/').filter(p => p);
		let currentPath = '';
		for (const part of parts) {
			currentPath += (currentPath ? '/' : '') + part;
			if (this.dirCache.has(currentPath)) continue;

			try {
				await this.request('MKCOL', currentPath);
				this.dirCache.add(currentPath);
			} catch (e) {
				// 如果是认证失败, 应该直接抛出
				if (e.message.includes('401')) throw e;
				// 405 Method Not Allowed 通常表示目录已存在
				if (!e.message.includes('405')) {
					console.warn('MKCOL error ignored:', e);
				} else {
					this.dirCache.add(currentPath);
				}
			}
		}
	},

	/**
	 * Sync all sessions with WebDAV
	 */
	async sync(mode = 'sync-latest', onProgress = null) {
		if (this._isMainSyncing) return;
		this._isMainSyncing = true;
		refreshStatusDot(true);
		const startTime = Date.now();

		this._updateUI = (text, isError = false) => {
			const statusEl = document.getElementById('webdavSyncStatus');
			if (statusEl) {
				statusEl.style.color = isError ? '#ff4a4a' : '';
				statusEl.innerText = text;
			}
			if (onProgress) onProgress(0, 0, text);
		};

		try {
			if (!cfg.webdavUrl || !cfg.webdavUser || !cfg.webdavPass) {
				throw new Error('WebDAV configuration is incomplete');
			}

			this.dirCache.clear();
			const localSessions = (await IDBManager.getAllSessions()).filter(s => s.id !== 'sess_welcome');
			
			this._updateUI('连接服务器...');
			// 显式测试连接并验证凭据
			await this.request('PROPFIND', '', null, { Depth: '0' });
			
			await this.ensureDir('pChat/sync');

			this._updateUI('扫描远程文件...');
			const remoteFiles = await this.getAllRemoteFiles();
			
			const remoteLatestMap = new Map();
			for (const file of remoteFiles) {
				if (file.updateTime > (remoteLatestMap.get(file.id)?.updateTime || -1)) {
					remoteLatestMap.set(file.id, file);
				}
			}

			const localMap = new Map(localSessions.map(s => [s.id, s]));
			const allIds = new Set([...localMap.keys(), ...remoteLatestMap.keys()]);
			
			let count = 0;
			let downloadCount = 0;
			let uploadCount = 0;
			let deleteCount = 0;
			let failCount = 0;
			let skipCount = 0;
			const total = allIds.size;

			for (const id of allIds) {
				count++;
				const local = localMap.get(id);
				const remote = remoteLatestMap.get(id);
				const displayTitle = (local?.title || id).substring(0, 32);

				const localTime = local?.updateTime || 0;
				const remoteTime = remote?.updateTime || 0;

				let action = 'skip';
				if (remote?.isDelete) {
					const shouldDeleteLocal = (mode === 'force-download' || (mode !== 'force-upload' && cfg.webdavSyncDelete));
					action = local ? (mode === 'force-upload' ? 'upload' : (shouldDeleteLocal ? 'delete-local' : 'skip')) : 'skip';
				} else if (mode === 'force-upload') {
					if (local && localTime !== remoteTime) action = 'upload';
					else if (!local && remote) action = 'delete-remote';
				} else if (mode === 'force-download') {
					if (remote && remoteTime !== localTime) action = 'download';
					else if (local && !remote) action = 'delete-local';
				} else {
					// 普通同步：最新者优先
					if (local && localTime > remoteTime) action = 'upload';
					else if (remote && remoteTime > localTime) action = 'download';
				}

				if (action === 'upload') {
					if (local && (local.updateTime === undefined || local.updateTime === null)) {
						local.updateTime = 0;
					}

					this._updateUI(`[${count}/${total}] [UPLOAD] ${displayTitle}`);
					try {
						await this.uploadSession(local);
						await this.cleanupRemoteOldVersions(id, local.updateTime, remoteFiles);
						uploadCount++;
					} catch (e) {
						failCount++;
						if (e.message.includes('401')) throw e;
					}
				} else if (action === 'download') {
					this._updateUI(`[${count}/${total}] [DOWNLOAD] ${displayTitle}`);
					try {
						await this.downloadAndImportSession(remote);
						downloadCount++;
					} catch (e) {
						failCount++;
						if (e.message.includes('401')) throw e;
					}
				} else if (action === 'delete-remote') {
					this._updateUI(`[${count}/${total}] [DEL_REMOTE] ${displayTitle}`);
					try {
						await this.request('DELETE', remote.path);
						deleteCount++;
					} catch (e) {
						failCount++;
						if (e.message.includes('401')) throw e;
					}
				} else if (action === 'delete-local') {
					this._updateUI(`[${count}/${total}] [DEL_LOCAL] ${displayTitle}`);
					try {
						await IDBManager.deleteSession(id);
						deleteCount++;
					} catch (e) {
						failCount++;
					}
				} else {
					skipCount++;
				}
			}

			const duration = this._formatDuration(Date.now() - startTime);
			const finalStatus = `[同步完成] 跳过[${skipCount}] 上传[${uploadCount}] 下载[${downloadCount}] 删除[${deleteCount}] 失败[${failCount}] 耗时[${duration}]`;
			this._updateUI(finalStatus);

			if (downloadCount > 0 || mode === 'force-download' && deleteCount > 0) {
				if (confirm(`已从 WebDAV 更新了 ${downloadCount} 个会话. 是否刷新页面以重载数据?`)) {
					location.reload();
				}
			}
		} catch (err) {
			console.error('WebDAV Sync failed:', err);
			this._updateUI('同步失败: ' + err.message, true);
		} finally {
			this._isMainSyncing = false;
			refreshStatusDot(false);
			this._updateUI = null;
		}
	},

	/**
	 * Cleanup files marked as deleted on remote
	 */
	async cleanupRemoteDeleted() {
		if (this._isMainSyncing) return;
		this._isMainSyncing = true;
		refreshStatusDot(true);
		const startTime = Date.now();

		this._updateUI = (text, isError = false) => {
			const statusEl = document.getElementById('webdavSyncStatus');
			if (statusEl) {
				statusEl.style.color = isError ? '#ff4a4a' : '';
				statusEl.innerText = text;
			}
		};

		try {
			if (!cfg.webdavUrl || !cfg.webdavUser || !cfg.webdavPass) {
				throw new Error('WebDAV configuration is incomplete');
			}

			this._updateUI('扫描远程文件...');
			const remoteFiles = await this.getAllRemoteFiles();
			const deletedMarkers = remoteFiles.filter(f => f.isDelete);

			let count = 0;
			let failCount = 0;
			const total = deletedMarkers.length;

			for (const marker of deletedMarkers) {
				count++;
				this._updateUI(`[${count}/${total}] [CLEANUP] ${marker.name}`);
				try {
					await this.request('DELETE', marker.path);
				} catch (e) {
					failCount++;
					if (e.message.includes('401')) throw e;
				}
			}

			const duration = this._formatDuration(Date.now() - startTime);
			this._updateUI(`[清理完成] 清理[${total}] 失败[${failCount}] 耗时[${duration}]`);
		} catch (err) {
			console.error('Cleanup failed:', err);
			this._updateUI('清理失败: ' + err.message, true);
		} finally {
			this._isMainSyncing = false;
			refreshStatusDot(false);
			this._updateUI = null;
		}
	},

	/**
	 * Scan all monthly directories and return all file info
	 */
	async getAllRemoteFiles() {
		const rootFiles = await this.getDirFiles('pChat/sync', true);
		const monthDirs = rootFiles.filter(f => f.isDir && /^\d{4}-\d{2}$/.test(f.name));
		
		let allFiles = [];
		const ext = cfg.webdavFileExt || 'json';
		const regex = new RegExp(`^(sess_.*)@(?:T(\\d+)|(delete))\\.${ext}$`);

		for (const dir of monthDirs) {
			if (this._updateUI) this._updateUI(`扫描远程文件: ${dir.name}`);
			const files = await this.getDirFiles(`pChat/sync/${dir.name}`, false);
			for (const file of files) {
				const match = file.name.match(regex);
				if (match) {
					const isDelete = !!match[3];
					allFiles.push({
						id: match[1],
						updateTime: isDelete ? Infinity : parseInt(match[2]),
						isDelete,
						name: file.name,
						path: `pChat/sync/${dir.name}/${file.name}`
					});
				}
			}
		}
		return allFiles;
	},

	/**
	 * Get file list with directory info
	 */
	async getDirFiles(path, includeDir = false) {
		try {
			const res = await this.request('PROPFIND', path, null, { Depth: '1' });
			if (res.status !== 207) return [];

			const text = await res.text();
			const parser = new DOMParser();
			const xml = parser.parseFromString(text, 'text/xml');
			const responses = xml.getElementsByTagNameNS('*', 'response');
			
			const results = [];
			for (let i = 0; i < responses.length; i++) {
				if (i === 0) continue;
				const resp = responses[i];
				const href = resp.getElementsByTagNameNS('*', 'href')[0]?.textContent;
				if (href) {
					const decodedHref = decodeURIComponent(href).replace(/\/$/, '');
					const name = decodedHref.split('/').pop();
					if (!name) continue;

					const isDir = resp.getElementsByTagNameNS('*', 'collection').length > 0;
					if (isDir && !includeDir) continue;

					results.push({ name, isDir, path: decodedHref });
				}
			}
			return results;
		} catch (e) {
			if (e.message.includes('认证失败')) throw e;
			console.warn(`Failed to get dir files for ${path}:`, e);
			return [];
		}
	},

	/**
	 * Upload a single session
	 */
	async uploadSession(session) {
		const date = new Date(session.timestamp || Date.now());
		const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
		const dirPath = `pChat/sync/${yearMonth}`;
		await this.ensureDir(dirPath);

		const ext = cfg.webdavFileExt || 'json';
		const fileName = `${session.id}@T${session.updateTime || 0}.${ext}`;
		const messages = await IDBManager.getSessionMessages(session.id);
		const backupData = {
			version: IDBManager.version,
			sessions: [session],
			chats: [{ id: session.id, messages }],
		};

		let body = JSON.stringify(backupData, null, '\t');
		let contentType = 'application/json';

		if (cfg.webdavEncryptionKey) {
			body = await this._encrypt(body, cfg.webdavEncryptionKey);
			contentType = 'application/octet-stream';
		}

		await this.request('PUT', `${dirPath}/${fileName}`, body, {
			'Content-Type': contentType
		});
	},

	/**
	 * Download and import a single session
	 */
	async downloadAndImportSession(remoteFileInfo) {
		const res = await this.request('GET', remoteFileInfo.path);
		if (!res.ok) throw new Error(`Failed to download ${remoteFileInfo.path}`);
		
		const buffer = await res.arrayBuffer();
		let dataStr;

		if (cfg.webdavEncryptionKey) {
			try {
				dataStr = await this._decrypt(new Uint8Array(buffer), cfg.webdavEncryptionKey);
			} catch (e) {
				console.error('Decryption failed:', e);
				throw new Error('解密失败, 请检查密钥是否正确');
			}
		} else {
			dataStr = new TextDecoder().decode(buffer);
		}

		let data;
		try {
			data = JSON.parse(dataStr);
		} catch (e) {
			console.error('Failed to parse session data:', e);
			throw new Error('解析数据失败, 可能文件已加密或格式错误');
		}

		if (data.sessions && data.sessions[0]) {
			if (data.sessions[0].updateTime === undefined || data.sessions[0].updateTime === null) {
				data.sessions[0].updateTime = 0;
			}
		}
		await IDBManager.importBackup(data, false);
	},

	/**
	 * Cleanup old versions of a session on remote
	 */
	async cleanupRemoteOldVersions(sessionId, currentTimestamp, allRemoteFiles) {
		const oldVersions = allRemoteFiles.filter(f => f.id === sessionId && f.updateTime !== currentTimestamp);
		for (const old of oldVersions) {
			try {
				await this.request('DELETE', old.path);
			} catch (e) {
				console.warn(`Failed to delete old remote version ${old.path}:`, e);
			}
		}
	},

	/**
	 * Delete all versions of a session on remote
	 */
	async deleteRemoteSession(sessionId, timestamp) {
		refreshStatusDot(true);
		try {
			if (!timestamp) return;
			const date = new Date(timestamp);
			const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
			const dirPath = `pChat/sync/${yearMonth}`;
			await this.ensureDir(dirPath);

			const files = await this.getDirFiles(dirPath, false);
			const ext = cfg.webdavFileExt || 'json';
			const prefix = `${sessionId}@`;
			
			for (const f of files) {
				if (f.name.startsWith(prefix) && f.name.endsWith(`.${ext}`)) {
					await this.request('DELETE', `${dirPath}/${f.name}`);
				}
			}

			// 上传删除标记
			const markerName = `${sessionId}@delete.${ext}`;
			await this.request('PUT', `${dirPath}/${markerName}`, Date.now(), {
				'Content-Type': 'application/json'
			});
		} catch (e) {
			console.warn(`Failed to delete remote session ${sessionId}:`, e);
		} finally {
			refreshStatusDot(false);
		}
	}
};
