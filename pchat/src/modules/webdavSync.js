import { cfg } from "../store.js";
import { IDBManager } from "../db.js";
import { refreshStatusDot } from "../util.js";

/**
 * WebDAV Sync Module
 */
export const webdavSync = {
	_updateUI: null,
	_isMainSyncing: false,
	_existingDirs: new Set(), // 目录存在性缓存

	getAuthHeader() {
		const user = cfg.webdavUser;
		const pass = cfg.webdavPass;
		if (!user || !pass) return {};
		return {
			'Authorization': 'Basic ' + btoa(unescape(encodeURIComponent(user + ':' + pass)))
		};
	},

	async request(method, path, body = null, headers = {}) {
		const url = cfg.webdavUrl.replace(/\/$/, '') + '/' + path.replace(/^\//, '');
		const res = await fetch(url, {
			method,
			headers: {
				...this.getAuthHeader(),
				...headers
			},
			body
		});
		if (res.status === 401) throw new Error('WebDAV 401: Unauthorized');
		// WebDAV 207 是多状态响应，通常在 PROPFIND 中视为成功
		if (!res.ok && res.status !== 207) {
			throw new Error(`WebDAV ${res.status}: ${res.statusText}`);
		}
		return res;
	},

	_formatDuration(ms) {
		if (ms < 1000) return ms + 'ms';
		const s = Math.floor(ms / 1000);
		if (s < 60) return s + 's';
		const m = Math.floor(s / 60);
		return m + 'm' + (s % 60) + 's';
	},

	/**
	 * Ensure directory exists (check from target, go up if needed)
	 */
	async ensureDir(path) {
		const cleanPath = path.replace(/\/$/, '');
		if (!cleanPath || this._existingDirs.has(cleanPath)) return;

		const parts = cleanPath.split('/').filter(p => p);
		
		let startIndex = 0;
		for (let i = parts.length - 1; i >= 0; i--) {
			const checkPath = parts.slice(0, i + 1).join('/');
			if (this._existingDirs.has(checkPath)) {
				startIndex = i + 1;
				break;
			}
			try {
				const res = await this.request('PROPFIND', checkPath, null, { Depth: '0' });
				if (res.ok) {
					this._existingDirs.add(checkPath);
					startIndex = i + 1;
					break;
				}
			} catch (e) {
				if (e.message.includes('401')) throw e;
			}
		}

		for (let i = startIndex; i < parts.length; i++) {
			const currentPath = parts.slice(0, i + 1).join('/');
			try {
				await this.request('MKCOL', currentPath);
				this._existingDirs.add(currentPath);
			} catch (e) {
				if (e.message.includes('401')) throw e;
				if (e.message.includes('405')) {
					this._existingDirs.add(currentPath); // 目录已存在
				} else {
					console.warn(`Failed to create dir ${currentPath}:`, e);
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
		let statusInterval = null;

		this._updateUI = (text, isError = false) => {
			const statusEl = document.getElementById('webdavSyncStatus');
			if (statusEl) {
				if (typeof text === 'string') {
					statusEl.style.color = isError ? '#ff4a4a' : '';
					statusEl.innerText = text;
				} else {
					statusEl.style.color = '';
					statusEl.innerHTML = text;
				}
			}
			if (onProgress) onProgress(0, 0, typeof text === 'string' ? text : statusEl.innerText);
		};

		try {
			if (!cfg.webdavUrl || !cfg.webdavUser || !cfg.webdavPass) {
				throw new Error('WebDAV configuration is incomplete');
			}

			this._updateUI('扫描远程文件...');
			const localSessions = (await IDBManager.getAllSessions()).filter(s => s.id !== 'sess_welcome');
			const { allFiles: remoteFiles, redundantFiles, existingDirs: existingMonthDirs } = await this.getAllRemoteFiles();
			
			// 同步时更新目录缓存
			this._existingDirs.add('pChat');
			this._existingDirs.add('pChat/sync');
			existingMonthDirs.forEach(d => this._existingDirs.add(`pChat/sync/${d}`));

			const remoteLatestMap = new Map(remoteFiles.map(f => [f.id, f]));

			const localMap = new Map(localSessions.map(s => [s.id, s]));
			const allIds = new Set([...localMap.keys(), ...remoteLatestMap.keys()]);

			let downloadCount = 0;
			let uploadCount = 0;
			let deleteCount = 0;
			let failCount = 0;
			let skipCount = 0;
			const allIdsArray = Array.from(allIds);
			const total = allIdsArray.length;

			const updateRealtimeStatus = (isFinal = false) => {
				const duration = ((Date.now() - startTime) / 1000).toFixed(1);
				const processed = uploadCount + downloadCount + deleteCount + failCount + skipCount;
				const status = `[${processed}/${total}] 跳过[${skipCount}] 上传[${uploadCount}] 下载[${downloadCount}] 删除[${deleteCount}] 失败[${failCount}] 耗时[${duration}s]`;
				this._updateUI(isFinal ? `[同步完成] ${status}` : `[正在同步] ${status}`);
			};

			if (total === 0) {
				updateRealtimeStatus(true);
				return;
			}

			statusInterval = setInterval(() => updateRealtimeStatus(), 100);

			const threads = cfg.webdavSyncThreads || 1;
			let taskIndex = 0;

			if (mode !== 'force-download') {
				const neededDirs = new Set();
				for (const id of allIds) {
					const local = localMap.get(id);
					if (local) {
						const date = new Date(local.timestamp || Date.now());
						const dirName = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
						if (!existingMonthDirs.includes(dirName)) {
							neededDirs.add(dirName);
						}
					}
				}

				if (neededDirs.size > 0) {
					await Promise.all(Array.from(neededDirs).map(async (dirName) => {
						try {
							await this.request('MKCOL', `pChat/sync/${dirName}`);
							this._existingDirs.add(`pChat/sync/${dirName}`);
						} catch (e) {
							if (e.message.includes('401')) throw e;
						}
					}));
				}
			}

			const workers = Array.from({ length: threads }, async () => {
				while (true) {
					const currentIndex = taskIndex++;
					if (currentIndex >= allIdsArray.length) break;

					const id = allIdsArray[currentIndex];
					try {
						const local = localMap.get(id);
						const remote = remoteLatestMap.get(id);

						const localTime = local?.updateTime || 0;
						const remoteTime = remote?.updateTime || 0;

						let action = 'skip';
						if (remote?.isDelete) {
							const shouldDeleteLocal = (mode === 'force-download' || (mode !== 'force-upload' && cfg.webdavSyncDelete));
							action = local ? (mode === 'force-upload' ? 'upload' : (shouldDeleteLocal ? 'delete-local' : 'skip')) : 'skip';
						} else if (mode === 'force-upload') {
							if (local && (!remote || localTime !== remoteTime)) action = 'upload';
							else if (!local && remote) action = 'delete-remote';
						} else if (mode === 'force-download') {
							if (remote && (!local || remoteTime !== localTime)) action = 'download';
							else if (local && !remote) action = 'delete-local';
						} else {
							if (local && (!remote || localTime > remoteTime)) action = 'upload';
							else if (remote && (!local || remoteTime > localTime)) action = 'download';
						}

						if (action === 'upload') {
							if (local && (local.updateTime === undefined || local.updateTime === null)) {
								local.updateTime = 0;
							}
							let retries = 1;
							let success = false;
							while (retries >= 0) {
								try {
									await this.uploadSession(local);
									uploadCount++;
									success = true;
									break;
								} catch (e) {
									if (e.message.includes('401')) throw e;
									if (retries > 0) {
										retries--;
										await new Promise(resolve => setTimeout(resolve, 3000));
										continue;
									}
									console.error(`Upload ${id} failed:`, e);
									success = false;
									break;
								}
							}
							if (!success) failCount++;
						} else if (action === 'download') {
							try {
								const imported = await this.downloadAndImportSession(remote);
								if (imported) {
									downloadCount++;
									if (this.onSessionUpdate) await this.onSessionUpdate(id);
								} else {
									skipCount++;
								}
							} catch (e) {
								console.error(`Download ${id} failed:`, e);
								failCount++;
								if (e.message.includes('401')) throw e;
							}
						} else if (action === 'delete-remote') {
							deleteCount++;
						} else if (action === 'delete-local') {
							try {
								await IDBManager.deleteSession(id);
								deleteCount++;
								if (this.onSessionUpdate) await this.onSessionUpdate(id);
							} catch (e) {
								console.error(`Local delete ${id} failed:`, e);
								failCount++;
							}
						} else {
							skipCount++;
						}
					} catch (e) {
						if (e.message.includes('401')) throw e;
						console.error(`Task ${id} processing error:`, e);
						// 此处 catch 是为了防止 unexpected error 导致总计数丢失
						// upload/download/delete 已经分别有自己的计数逻辑，但这里多加一层兜底
						// 注意：只有在 above actions 都没捕获到的情况下才在此增加 failCount
					}
				}
			});

			await Promise.all(workers);

			updateRealtimeStatus(true);
		} catch (err) {
			console.error('WebDAV Sync failed:', err);
		} finally {
			if (statusInterval) clearInterval(statusInterval);
			this._isMainSyncing = false;
			refreshStatusDot(false);
			this._updateUI = null;
		}
	},

	async cleanupRemoteDeleted(paths = null) {
		const isInternal = !!paths;
		if (!isInternal && this._isMainSyncing) return;

		if (!isInternal) {
			this._isMainSyncing = true;
			refreshStatusDot(true);
			this._updateUI = (text, isError = false) => {
				const statusEl = document.getElementById('webdavSyncStatus');
				if (statusEl) {
					statusEl.style.color = isError ? '#ff4a4a' : '';
					statusEl.innerText = text;
				}
			};
		}

		const startTime = Date.now();
		try {
			if (!cfg.webdavUrl || !cfg.webdavUser || !cfg.webdavPass) {
				throw new Error('WebDAV configuration is incomplete');
			}
			
			let toDelete = [];
			if (isInternal) {
				toDelete = Array.from(paths).map(path => ({ 
					path, 
					name: path.split('/').pop() 
				}));
			} else {
				this._updateUI?.('扫描远程文件...');
				const { allFiles, redundantFiles } = await this.getAllRemoteFiles();
				// 清理: 多余的版本 + 所有的删除标记
				toDelete = [...redundantFiles, ...allFiles.filter(f => f.isDelete)];
			}

			let count = 0;
			let failCount = 0;
			const total = toDelete.length;
			if (total > 0) {
				for (const item of toDelete) {
					count++;
					this._updateUI?.(`[${count}/${total}] [清理] ${item.name}`);
					try {
						await this.request('DELETE', item.path);
					} catch (e) {
						failCount++;
						if (e.message.includes('401')) throw e;
					}
				}
			}

			if (!isInternal) {
				const duration = this._formatDuration(Date.now() - startTime);
				this._updateUI?.(`[清理完成] 清理[${total}] 失败[${failCount}] 耗时[${duration}]`);
			}
		} catch (err) {
			console.error('Cleanup failed:', err);
			if (!isInternal) this._updateUI?.(`[清理失败] ${err.message}`, true);
		} finally {
			if (!isInternal) {
				this._isMainSyncing = false;
				refreshStatusDot(false);
				this._updateUI = null;
			}
		}
	},

	async getAllRemoteFiles() {
		let rootFiles;
		try {
			rootFiles = await this.getDirFiles('pChat/sync', true);
		} catch (e) {
			if (e.message.includes('404')) {
				this._updateUI?.('创建同步目录...');
				await this.ensureDir('pChat/sync');
				return { allFiles: [], redundantFiles: [], existingDirs: [] };
			}
			throw e;
		}

		const monthDirs = rootFiles.filter(f => f.isDir && /^\d{4}-\d{2}$/.test(f.name));
		const existingDirs = monthDirs.map(d => d.name);

		const ext = cfg.webdavFileExt || 'json';
		const regex = new RegExp(`^(sess_.*)@(?:T(\\d+)|(delete))\\.${ext}$`);
		
		this._updateUI?.(`扫描远程目录 [0/${monthDirs.length}]`);
		let scannedCount = 0;
		
		const allFilesResults = await Promise.all(monthDirs.map(async (dir) => {
			try {
				const files = await this.getDirFiles(`pChat/sync/${dir.name}`, false);
				scannedCount++;
				this._updateUI?.(`扫描远程目录 [${scannedCount}/${monthDirs.length}]: ${dir.name}`);
				
				return files.map(file => {
					const match = file.name.match(regex);
					if (match) {
						const isDelete = !!match[3];
						return {
							id: match[1],
							updateTime: isDelete ? Infinity : parseInt(match[2]),
							isDelete,
							name: file.name,
							path: `pChat/sync/${dir.name}/${file.name}`
						};
					}
					return null;
				}).filter(f => f);
			} catch (e) {
				console.warn(`Failed to scan dir ${dir.name}:`, e);
				return [];
			}
		}));

		const allFiles = allFilesResults.flat();
		const latestMap = new Map();
		const redundantFiles = [];

		// 优先级: delete > 时间戳大 > 时间戳小
		for (const file of allFiles) {
			const existing = latestMap.get(file.id);
			if (!existing) {
				latestMap.set(file.id, file);
			} else {
				if (file.isDelete || (!existing.isDelete && file.updateTime > existing.updateTime)) {
					redundantFiles.push(existing);
					latestMap.set(file.id, file);
				} else {
					redundantFiles.push(file);
				}
			}
		}

		return {
			allFiles: Array.from(latestMap.values()),
			redundantFiles,
			existingDirs
		};
	},

	async getDirFiles(path, includeDir = false) {
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
	},

	async uploadSession(session) {
		const date = new Date(session.timestamp || Date.now());
		const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
		const dirPath = `pChat/sync/${yearMonth}`;
		const ext = cfg.webdavFileExt || 'json';
		const fileName = `${session.id}@T${session.updateTime || 0}.${ext}`;
		const messages = await IDBManager.getSessionMessages(session.id);
		const backupData = {
			uploadTime: Date.now(),
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

		const local = await IDBManager.getSession(remoteFileInfo.id);
		if (local && local.updateTime > remoteFileInfo.updateTime) {
			console.warn(`[WebDAV] Skip importing ${remoteFileInfo.id}: local is newer (${local.updateTime} > ${remoteFileInfo.updateTime})`);
			return false;
		}

		await IDBManager.importBackup(data, false);
		return true;
	},

	async _encrypt(text, keyStr) {
		const encoder = new TextEncoder();
		const data = encoder.encode(text);
		const hash = await crypto.subtle.digest('SHA-256', encoder.encode(keyStr));
		const key = await crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt']);
		const iv = crypto.getRandomValues(new Uint8Array(12));
		const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
		const combined = new Uint8Array(iv.length + encrypted.byteLength);
		combined.set(iv);
		combined.set(new Uint8Array(encrypted), iv.length);
		return combined;
	},

	async _decrypt(combined, keyStr) {
		const encoder = new TextEncoder();
		const hash = await crypto.subtle.digest('SHA-256', encoder.encode(keyStr));
		const key = await crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['decrypt']);
		const iv = combined.slice(0, 12);
		const data = combined.slice(12);
		const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
		return new TextDecoder().decode(decrypted);
	},

	async deleteRemoteSession(sessionId, timestamp) {
		refreshStatusDot(true);
		try {
			if (!timestamp) return;
			const date = new Date(timestamp);
			const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
			const dirPath = `pChat/sync/${yearMonth}`;
			const ext = cfg.webdavFileExt || 'json';

			// 获取该会话目录的文件列表以找到确切的时间戳文件名
			const files = await this.getDirFiles(dirPath, false);
			const sessionFiles = files.filter(f => f.name.startsWith(`${sessionId}@T`) && f.name.endsWith(`.${ext}`));
			
			if (sessionFiles.length > 0) {
				// 找到最新的一个版本
				sessionFiles.sort((a, b) => {
					const ta = parseInt(a.name.match(/@T(\d+)\./)?.[1] || 0);
					const tb = parseInt(b.name.match(/@T(\d+)\./)?.[1] || 0);
					return tb - ta;
				});

				const latest = sessionFiles[0];
				const newName = `${sessionId}@delete.${ext}`;
				const destPath = cfg.webdavUrl.replace(/\/$/, '') + '/' + `${dirPath}/${newName}`.replace(/^\//, '');
				
				// 仅重命名这一个文件，其余旧版本的清理交给 sync() 处理
				await this.request('MOVE', `${dirPath}/${latest.name}`, null, {
					'Destination': destPath
				});
			}
		} catch (e) {
			console.warn(`Failed to rename remote session ${sessionId}:`, e);
		} finally {
			refreshStatusDot(false);
		}
	},

	cancelUpdateRemoteSession(sessionId) {
		if (this._updateRemoteTimers[sessionId]) {
			clearTimeout(this._updateRemoteTimers[sessionId]);
			delete this._updateRemoteTimers[sessionId];
		}
	},

	_updateRemoteTimers: {},
	async updateRemoteSession(session) {
		if (!cfg.webdavUrl || !cfg.webdavUser || !cfg.webdavPass) return;
		
		const sessionId = session.id;
		this.cancelUpdateRemoteSession(sessionId);

		this._updateRemoteTimers[sessionId] = setTimeout(async () => {
			delete this._updateRemoteTimers[sessionId];
			refreshStatusDot(true);
			try {
				const date = new Date(session.timestamp || Date.now());
				const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
				const dirPath = `pChat/sync/${yearMonth}`;

				if (!this._existingDirs.has(dirPath)) {
					await this.ensureDir(dirPath);
				}

				// 仅执行上传，旧版本的清理交给 sync() 处理
				await this.uploadSession(session);
			} catch (e) {
				console.warn(`Failed to update remote session ${sessionId}:`, e);
			} finally {
				refreshStatusDot(false);
			}
		}, 15000); // 15 seconds debounce
	}
};
