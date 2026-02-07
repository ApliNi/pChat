
import { readFileSync, writeFileSync } from 'fs';

const log = (...args) => console.log('[pChat] [Build.mjs]', ...args);

log('Start');

if(true){
	log('update cache version');
	const ver_json = JSON.parse(readFileSync('./pchat/ver.json', 'utf8'));
	ver_json.cache_ver = Date.now();
	writeFileSync('./pchat/ver.json', JSON.stringify(ver_json, null, '\t'));
}

log('End');
