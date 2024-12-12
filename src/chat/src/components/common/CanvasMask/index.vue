<template>
  <div class="relative w-full h-full ">
		<canvas ref="backgroundCanvas" class="absolute left-0 top-0" :width="width" :height="height"></canvas>
		<canvas ref="canvas" class="absolute left-0 top-0" :width="width" :height="height"></canvas>
	</div>
</template>

<script lang="ts" setup>
import { ref,onMounted } from 'vue';

const props = defineProps({
	/* 图片地址 如果不是同源跨域 传入base64 */
  src: String,
	/* 图片 高度 宽度 不传就是用图片宽高、如果是缩略图 使用尺寸导出到原始尺寸 */
  width: Number,
  height: Number,
	/* 允许的画布最大宽度 限制区域 */
  max: {
    type: Number,
    default: 500
  },
	/*导出蒙版的底色背景色 */
	exportMaskBackgroundColor: {
		type: String,
		default: 'black'
	},
	/* 导出蒙版的绘制颜色 */
	exportMaskColor: {
		type: String,
		default: 'white'
	},
	penColor: {
		type: String,
		default: 'white'
	},
	penWidth: {
		type: Number,
		default: 20
	},
	updateFileInfo: Function
});

// TODO  如果动态变更了线宽颜色等 在导出的时候没有记录每一步的线宽 而是使用了最后的

const canvas = ref<any>(null);
const backgroundCanvas = ref<any>(null);
const paths = ref<any>([]);
let isDrawing = false;
let currentPath: any = [];
let baseImage: any = new Image()
const isEraserEnabled = ref(false);

const computedWidth = ref(0);
const computedHeight = ref(0);
const scaleRatio = ref(0)

onMounted(() => {
  const ctx: any = canvas.value.getContext('2d');
	const backgroundCtx = backgroundCanvas.value?.getContext('2d');
  baseImage.src = props.src;
  baseImage.onload = () => {
    const ratio = Math.min(props.max / baseImage.width, props.max / baseImage.height);
		scaleRatio.value = ratio
    computedWidth.value = props.width || (ratio < 1 ? baseImage.width * ratio : baseImage.width);
    computedHeight.value = props.height || (ratio < 1 ? baseImage.height * ratio : baseImage.height);
		props.updateFileInfo?.({
			width: baseImage.width,
			height: baseImage.height,
			scaleRatio: ratio.toFixed(3)
		})
    canvas.value.width = computedWidth.value;
    backgroundCanvas.value.width = computedWidth.value;
    canvas.value.height = computedHeight.value;
    backgroundCanvas.value.height = computedHeight.value;
    // ctx.drawImage(baseImage, 0, 0, computedWidth.value, computedHeight.value);
    backgroundCtx.drawImage(baseImage, 0, 0, computedWidth.value, computedHeight.value);
  };
  canvas.value.addEventListener('mousedown', startDrawing);
  canvas.value.addEventListener('mousemove', draw);
  canvas.value.addEventListener('mouseup', stopDrawing);
});

/* 开始绘制 */
const startDrawing = (e: any) => {
  isDrawing = true;
  const ctx = canvas.value.getContext('2d');
  ctx.beginPath();
  ctx.moveTo(e.offsetX, e.offsetY);
	currentPath = [{ type: isEraserEnabled.value ? 'erase' : 'draw', x: e.offsetX, y: e.offsetY }];
};

/* 绘制过程 */
const draw = (e: any) => {
  if (!isDrawing) return;
  const ctx = canvas.value.getContext('2d');
  ctx.lineTo(e.offsetX, e.offsetY);

  if (isEraserEnabled.value) {
    // 橡皮擦模式：清除画布上的内容
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineWidth = props.penWidth * 2; // 橡皮擦宽度可以调整
  } else {
    // 正常绘制模式
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = props.penColor;
    ctx.lineWidth = props.penWidth;
  }
  ctx.stroke();
	currentPath.push({ type: isEraserEnabled.value ? 'erase' : 'draw', x: e.offsetX, y: e.offsetY });
};
/* 完成单词绘制 */
const stopDrawing = () => {
  isDrawing = false;
	paths.value.push([...currentPath, { type: 'end' }]);
  currentPath = [];
};

/* 获取Base图片 */
const exportImage = (): Promise<string> => {
  return new Promise((resolve, reject) => {
    const exportCanvas = document.createElement('canvas');
    const image: any = baseImage;
		exportCanvas.width = image.width;
		exportCanvas.height = image.height;
		const exportCtx = exportCanvas.getContext('2d');
		if (exportCtx) {
			exportCtx.fillStyle = props.exportMaskBackgroundColor;
      exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
			exportCtx.beginPath();
			const xRatio = image.width / computedWidth.value;
			const yRatio = image.height / computedHeight.value;
			exportCtx.beginPath();
			paths.value.forEach((pathArr: any[]) => {
				pathArr.forEach((path, index) => {
					if (path.type === 'begin' || path.type === 'draw') {
						if (index === 0 || pathArr[index - 1].type !== path.type) {
							exportCtx.beginPath();
						}
						exportCtx.lineTo(path.x * xRatio, path.y * yRatio);
						exportCtx.strokeStyle = props.exportMaskColor;
						exportCtx.lineWidth = props.penWidth * xRatio;
					}
					if (path.type === 'erase') {
						if (index === 0 || pathArr[index - 1].type !== path.type) {
							exportCtx.beginPath();
						}
						exportCtx.lineTo(path.x * xRatio, path.y * yRatio);
						exportCtx.strokeStyle = props.exportMaskBackgroundColor; // 擦除路径使用的颜色（黑色）
					}
					// 每当一个 'draw' 或 'erase' 类型的路径结束时，结束当前的路径
					if (index < pathArr.length - 1 && pathArr[index + 1].type !== path.type) {
						exportCtx.stroke();
					}
				});
				// 如果最后一个路径元素是 'draw' 或 'erase'，确保路径被结束
				if (pathArr[pathArr.length - 1].type !== 'begin') {
					exportCtx.stroke();
				}
			});
			const base64Image = exportCanvas.toDataURL('image/png');
			resolve(base64Image);
		} else {
			reject(new Error('无法获取canvas的2D渲染上下文'));
		}
  });
}

/* 清空画布并重置 */
function clear() {
  paths.value = [];
	const ctx = canvas.value.getContext('2d');
  ctx.clearRect(0, 0, canvas.value.width, canvas.value.height);
};

/* 获取绘制后的蒙版图片 */
async function getBase(){
	return await exportImage()
}

/* 返回上一步 */
function undo(){
  if (paths.value.length > 0) {
    paths.value.pop();
    redrawCanvas();
  }
};

/* 重新绘制 */
function redrawCanvas() {
  const ctx = canvas.value.getContext('2d');
  ctx.clearRect(0, 0, canvas.value.width, canvas.value.height);
  ctx.drawImage(baseImage, 0, 0, computedWidth.value, computedHeight.value);

  paths.value.forEach((pathArr: any[]) => {
    pathArr.forEach((path, index) => {
      if (index === 0 || pathArr[index - 1].type !== path.type) {
        ctx.beginPath();
      }
      if (path.type === 'erase') {
        ctx.globalCompositeOperation = "destination-out";
        ctx.strokeStyle = 'rgba(0,0,0,0)';
      } else {
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = 'white';
      }
      ctx.lineWidth = path.type === 'erase' ? props.penWidth * 2 : props.penWidth;
      ctx.lineTo(path.x, path.y);
      ctx.stroke();
      if (index === pathArr.length - 1 || pathArr[index + 1].type !== path.type) {
        ctx.closePath();
      }
    });
  });
  ctx.globalCompositeOperation = "source-over";
}



/* 切换橡皮擦模式 */
const toggleEraser = () => {
  isEraserEnabled.value = !isEraserEnabled.value;
};

defineExpose({
	getBase,
	undo,
	clear,
	toggleEraser
})


</script>

<style scoped>
  canvas {
    border: 1px solid #ddd;
  }
</style>

