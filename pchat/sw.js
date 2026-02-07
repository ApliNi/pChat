
const CACHE_NAME = 'v2';
const resMap = {};

self.addEventListener('install', async (event) => {
	self.skipWaiting();
});

self.addEventListener('activate', async (event) => {
	const keys = await caches.keys();
	return Promise.all(keys.map(key => key !== CACHE_NAME && caches.delete(key)));
});

self.addEventListener('fetch', (event) => {
	// console.log(event.request);

	// 绕过非 http/https 资源
	if(!event.request.url.startsWith('http')) return;

	// 绕过非资源文件请求
	const cacheDest = [ 'document', 'style', 'script', 'worker', 'font', 'image', 'manifest' ];
	if(!cacheDest.includes(event.request.destination)) return;

	event.respondWith((async () => {
		resMap[event.request.url] = event.request;
		
		const cache = await caches.open(CACHE_NAME);
		let res = await cache.match(event.request);
		if(res){
			// 异步更新缓存
			(async () => {
				const res = await fetch(event.request).catch(Response.error);
				if(res.ok) await cache.put(event.request, res.clone());
			})();
		}else{
			res = await fetch(event.request).catch(Response.error);
			if(res.ok) await cache.put(event.request, res.clone());
		}
		return res;
	})());
});

(async () => {

	const getVer = async () => await fetch('/ver.json')
		.then((res) => res.json())
		.then((v) => v.cache_ver)
		.catch(() => null);

	let ver = await getVer();

	let lock = false;
	setInterval(async () => {
		if(lock) return;
		lock = true;

		const newVer = await getVer();

		if(!ver && newVer) ver = newVer;

		if(ver && newVer && ver !== newVer){
			ver = newVer;
			console.log('[sw.js] cache ver changed, refreshing cache...');
			const cache = await caches.open(CACHE_NAME);
			for(const url in resMap){
				const request = resMap[url];
				const res = await fetch(request).catch(Response.error);
				if(res.ok) await cache.put(request, res.clone());
			}
		}
		lock = false;
	}, 120 * 1000);
})();

