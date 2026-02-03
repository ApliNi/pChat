
const imgBox = document.querySelector('#image');
const img = imgBox.querySelector('& > img');

export const openImg = async (src) => {
	img.src = '';
	img.src = src;
};

// 全局点击事件
document.addEventListener('click', (event) => {
	const node = event.target;

	// 图片查看器
	if (node.classList.contains('img-node')) {
		openImg(node.src);
	}
});

const onResize = () => {
	const x = (window.innerWidth - img.offsetWidth) / 2;
	const y = (window.innerHeight - img.offsetHeight) / 2;

	img.style.transition = `transform 0.4s ease, top 0.4s ease, left 0.4s ease, opacity 0.4s ease`;

	img.style.left = `${x}px`;
	img.style.top = `${y}px`;
};

img.addEventListener('load', () => {
	// 图片居中
	onResize();
	// 初始大小稍小于屏幕最大尺寸
	img.style.transform = `scale(0.85)`;
	imgBox.classList.add('open');
});
window.addEventListener('resize', onResize);

imgBox.addEventListener('mousedown', (event) => {
	// 要求左键点击
	if(event.button !== 0) return;

	let moveX = event.clientX;
	let moveY = event.clientY;

	const onMouseUp = () => {
		if(moveX === event.clientX && moveY === event.clientY){
			imgBox.classList.remove('open');
		}
		imgBox.removeEventListener('mouseup', onMouseUp);
		imgBox.removeEventListener('mouseup', onMouseMove);
	};

	const onMouseMove = (event) => {
		moveX = event.clientX;
		moveY = event.clientY;
	};

	imgBox.addEventListener('mouseup', onMouseUp);
	imgBox.addEventListener('mousemove', onMouseMove);
});

// 如果元素 (即将) 超出视口, 则重置位置
const runAway = async () => {
	const rect = img.getBoundingClientRect();
	const stat =	rect.left > (window.innerWidth - window.innerWidth * 0.1) ||
					rect.right < window.innerWidth * 0.1 ||
					rect.top > (window.innerHeight - window.innerHeight * 0.1) ||
					rect.bottom < window.innerHeight * 0.1;
	if(stat){
		onResize();
	}
};

let scale = 1;
imgBox.onwheel = (event) => {

	// (Abs(滚轮步进距离 / 1000), 限制不小于 0.01, 不大于 0.2. 乘 Abs(当前缩放比例)), 不小于 0.01
	const step = Math.max(Math.min(Math.max(Math.abs(event.deltaY / 1000), 0.01), 0.2) * Math.abs(scale), 0.01);

	if(step === 0.01){
		// 可能是通过触摸板进行缩放, 调低过度动画时间
		img.style.transition = `transform 0.25s ease, top 0.4s ease, left 0.4s ease, opacity 0.4s ease`;
	}else{
		img.style.transition = `transform 0.4s ease, top 0.4s ease, left 0.4s ease, opacity 0.4s ease`;
	}

	scale += (event.deltaY < 0)? step : -step;

	// 小数位数太多造成抖动
	img.style.transform = `scale(${scale.toFixed(4)})`;

	runAway();
};

img.addEventListener('mousedown', (event) => {
	const startMouseX = event.clientX;
	const startMouseY = event.clientY;
	const startX = img.offsetLeft;
	const startY = img.offsetTop;

	const onMouseMove = (event) => {

		img.style.transition = `transform 0.4s ease`;

		const dx = event.clientX - startMouseX;
		const dy = event.clientY - startMouseY;
		img.style.left = `${startX + dx}px`;
		img.style.top = `${startY + dy}px`;
	};

	const onMouseUp = () => {
		imgBox.removeEventListener('mousemove', onMouseMove);
		imgBox.removeEventListener('mouseup', onMouseUp);

		runAway();
	};

	imgBox.addEventListener('mousemove', onMouseMove);
	imgBox.addEventListener('mouseup', onMouseUp);
});
