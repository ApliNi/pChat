
// --- Worker ---
export const worker = {
	worker: null,
	idx: 1,
	resolveQueue: {},

	run: (type, data) => new Promise((resolve, reject) => {
		const id = worker.idx++;
		worker.resolveQueue[id] = resolve;
		worker.worker.postMessage({ type, data, id });
	}),

	init: () => new Promise((resolve, reject) => {
		worker.worker = new Worker('/src/workers/worker.js', { type: 'module' });

		worker.worker.onmessage = (event) => {
			const { type, data, id } = event.data;
			const cb = worker.resolveQueue[id];
			if(cb) cb(data);
			delete worker.resolveQueue[id];

			if(type === 'init') resolve();
		};
	}),
};

await worker.init();
