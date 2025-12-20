
const CACHE_NAME = 'v2';

self.addEventListener('install', (event) => {
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
	const cacheDest = [ 'document', 'style', 'script', 'font', 'image', 'manifest' ];
	if(!cacheDest.includes(event.request.destination)) return;

	event.respondWith((async () => {
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
