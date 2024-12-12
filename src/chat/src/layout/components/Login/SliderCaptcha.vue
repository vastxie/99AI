<template>
  <!-- 本体部分 -->
  <div
    :class="['vue-puzzle-vcode', { show_: show }]"
    @mousedown="onCloseMouseDown"
    @mouseup="onCloseMouseUp"
    @touchstart="onCloseMouseDown"
    @touchend="onCloseMouseUp"
  >
    <div
      class="vue-auth-box_ rounded-lg bg-white dark:bg-gray-800"
      @mousedown.stop
      @touchstart.stop
    >
      <div class="auth-body_" :style="`height: ${canvasHeight}px`">
        <!-- 主图，有缺口 -->
        <canvas
          ref="canvas1"
          :width="canvasWidth"
          :height="canvasHeight"
          :style="`width:${canvasWidth}px;height:${canvasHeight}px`"
        />
        <!-- 成功后显示的完整图 -->
        <canvas
          ref="canvas3"
          :class="['auth-canvas3_', { show: isSuccess }]"
          :width="canvasWidth"
          :height="canvasHeight"
          :style="`width:${canvasWidth}px;height:${canvasHeight}px`"
        />
        <!-- 小图 -->
        <canvas
          :width="puzzleBaseSize"
          class="auth-canvas2_"
          :height="canvasHeight"
          ref="canvas2"
          :style="`width:${puzzleBaseSize}px;height:${canvasHeight}px;transform:translateX(${
            styleWidth -
            sliderBaseSize -
            (puzzleBaseSize - sliderBaseSize) *
              ((styleWidth - sliderBaseSize) / (canvasWidth - sliderBaseSize))
          }px)`"
        />
        <div :class="['loading-box_', { hide_: !loading }]">
          <div class="loading-gif_">
            <span></span>
            <span></span>
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
        <div
          :class="['info-box_', { show: infoBoxShow }, { fail: infoBoxFail }]"
        >
          {{ infoText }}
        </div>
        <div
          :class="['flash_', { show: isSuccess }]"
          :style="`transform: translateX(${
            isSuccess
              ? `${canvasWidth + canvasHeight * 0.578}px`
              : `-${canvasHeight * 0.578}px`
          }) skew(-30deg, 0);`"
        ></div>
        <img class="reset_" @click="reset" :src="resetSvg" />
      </div>
      <div class="auth-control_">
        <div
          class="range-box bg-gray-100 dark:bg-gray-700"
          :style="`height:${sliderBaseSize}px`"
        >
          <div class="range-text">{{ sliderText }}</div>
          <div
            class="range-slider"
            ref="range-slider"
            :style="`width:${styleWidth}px`"
          >
            <div
              :class="['range-btn', { isDown: mouseDown }]"
              :style="`width:${sliderBaseSize}px`"
              @mousedown="onRangeMouseDown($event)"
              @touchstart="onRangeMouseDown($event)"
            >
              <div></div>
              <div></div>
              <div></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
<script>
import resetSvg from '@/assets/reset.png';
export default {
  props: {
    canvasWidth: { type: Number, default: 310 }, // 主canvas的宽
    canvasHeight: { type: Number, default: 160 }, // 主canvas的高
    // 是否出现，由父级控制
    show: { type: Boolean, default: false },
    puzzleScale: { type: Number, default: 1 }, // 拼图块的大小缩放比例
    sliderSize: { type: Number, default: 40 }, // 滑块的大小
    range: { type: Number, default: 10 }, // 允许的偏差值
    // 所有的背景图片
    imgs: {
      type: Array,
    },
    successText: {
      type: String,
      default: '验证通过！',
    },
    failText: {
      type: String,
      default: '验证失败，请重试',
    },
    sliderText: {
      type: String,
      default: '拖动滑块完成拼图',
    },
  },

  data() {
    return {
      mouseDown: false, // 鼠标是否在按钮上按下
      startWidth: 50, // 鼠标点下去时父级的width
      startX: 0, // 鼠标按下时的X
      newX: 0, // 鼠标当前的偏移X
      pinX: 0, // 拼图的起始X
      pinY: 0, // 拼图的起始Y
      loading: false, // 是否正在加在中，主要是等图片onload
      isCanSlide: false, // 是否可以拉动滑动条
      error: false, // 图片加在失败会出现这个，提示用户手动刷新
      infoBoxShow: false, // 提示信息是否出现
      infoText: '', // 提示等信息
      infoBoxFail: false, // 是否验证失败
      timer1: null, // setTimout1
      closeDown: false, // 为了解决Mac上的click BUG
      isSuccess: false, // 验证成功
      imgIndex: -1, // 用于自定义图片时不会随机到重复的图片
      isSubmting: false, // 是否正在判定，主要用于判定中不能点击重置按钮
      resetSvg,
    };
  },

  /** 生命周期 **/
  mounted() {
    document.body.appendChild(this.$el);
    document.addEventListener('mousemove', this.onRangeMouseMove, false);
    document.addEventListener('mouseup', this.onRangeMouseUp, false);

    document.addEventListener('touchmove', this.onRangeMouseMove, {
      passive: false,
    });
    document.addEventListener('touchend', this.onRangeMouseUp, false);
    if (this.show) {
      document.body.classList.add('vue-puzzle-overflow');
      this.reset();
    }
  },
  beforeDestroy() {
    clearTimeout(this.timer1);
    document.body.removeChild(this.$el);
    document.removeEventListener('mousemove', this.onRangeMouseMove, false);
    document.removeEventListener('mouseup', this.onRangeMouseUp, false);

    document.removeEventListener('touchmove', this.onRangeMouseMove, {
      passive: false,
    });
    document.removeEventListener('touchend', this.onRangeMouseUp, false);
  },

  /** 监听 **/
  watch: {
    show(newV) {
      // 每次出现都应该重新初始化
      if (newV) {
        document.body.classList.add('vue-puzzle-overflow');
        this.reset();
      } else {
        this.isSubmting = false;
        this.isSuccess = false;
        this.infoBoxShow = false;
        document.body.classList.remove('vue-puzzle-overflow');
      }
    },
  },

  /** 计算属性 **/
  computed: {
    // styleWidth是底部用户操作的滑块的父级，就是轨道在鼠标的作用下应该具有的宽度
    styleWidth() {
      const w = this.startWidth + this.newX - this.startX;
      return w < this.sliderBaseSize
        ? this.sliderBaseSize
        : w > this.canvasWidth
        ? this.canvasWidth
        : w;
    },
    // 图中拼图块的60 * 用户设定的缩放比例计算之后的值 0.2~2
    puzzleBaseSize() {
      return Math.round(
        Math.max(Math.min(this.puzzleScale, 2), 0.2) * 52.5 + 6
      );
    },
    // 处理一下sliderSize，弄成整数，以免计算有偏差
    sliderBaseSize() {
      return Math.max(
        Math.min(
          Math.round(this.sliderSize),
          Math.round(this.canvasWidth * 0.5)
        ),
        10
      );
    },
  },

  /** 方法 **/
  methods: {
    // 关闭
    onClose() {
      if (!this.mouseDown && !this.isSubmting) {
        clearTimeout(this.timer1);
        this.$emit('close');
      }
    },
    onCloseMouseDown() {
      this.closeDown = true;
    },
    onCloseMouseUp() {
      if (this.closeDown) {
        this.onClose();
      }
      this.closeDown = false;
    },
    // 鼠标按下准备拖动
    onRangeMouseDown(e) {
      if (this.isCanSlide) {
        this.mouseDown = true;
        this.startWidth = this.$refs['range-slider'].clientWidth;
        this.newX = e.clientX || e.changedTouches[0].clientX;
        this.startX = e.clientX || e.changedTouches[0].clientX;
      }
    },
    // 鼠标移动
    onRangeMouseMove(e) {
      if (this.mouseDown) {
        e.preventDefault();
        this.newX = e.clientX || e.changedTouches[0].clientX;
      }
    },
    // 鼠标抬起
    onRangeMouseUp() {
      if (this.mouseDown) {
        this.mouseDown = false;
        this.submit();
      }
    },
    /**
     * 开始进行
     * @param withCanvas 是否强制使用canvas随机作图
     */
    init(withCanvas) {
      // 防止重复加载导致的渲染错误
      if (this.loading && !withCanvas) {
        return;
      }
      this.loading = true;
      this.isCanSlide = false;
      const c = this.$refs.canvas1;
      const c2 = this.$refs.canvas2;
      const c3 = this.$refs.canvas3;
      const ctx = c.getContext('2d');
      const ctx2 = c2.getContext('2d');
      const ctx3 = c3.getContext('2d');
      const isFirefox =
        navigator.userAgent.indexOf('Firefox') >= 0 &&
        navigator.userAgent.indexOf('Windows') >= 0; // 是windows版火狐
      const img = document.createElement('img');
      ctx.fillStyle = 'rgba(255,255,255,1)';
      ctx3.fillStyle = 'rgba(255,255,255,1)';
      ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
      ctx2.clearRect(0, 0, this.canvasWidth, this.canvasHeight);

      // 取一个随机坐标，作为拼图块的位置
      this.pinX = this.getRandom(
        this.puzzleBaseSize,
        this.canvasWidth - this.puzzleBaseSize - 20
      ); // 留20的边距
      this.pinY = this.getRandom(
        20,
        this.canvasHeight - this.puzzleBaseSize - 20
      ); // 主图高度 - 拼图块自身高度 - 20边距
      img.crossOrigin = 'anonymous'; // 匿名，想要获取跨域的图片
      img.onload = () => {
        const [x, y, w, h] = this.makeImgSize(img);
        ctx.save();
        // 先画小图
        this.paintBrick(ctx);
        ctx.closePath();
        if (!isFirefox) {
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;
          ctx.shadowColor = '#000';
          ctx.shadowBlur = 3;
          ctx.fill();
          ctx.clip();
        } else {
          ctx.clip();
          ctx.save();
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;
          ctx.shadowColor = '#000';
          ctx.shadowBlur = 3;
          ctx.fill();
          ctx.restore();
        }

        ctx.drawImage(img, x, y, w, h);
        ctx3.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
        ctx3.drawImage(img, x, y, w, h);

        // 设置小图的内阴影
        ctx.globalCompositeOperation = 'source-atop';

        this.paintBrick(ctx);

        ctx.arc(
          this.pinX + Math.ceil(this.puzzleBaseSize / 2),
          this.pinY + Math.ceil(this.puzzleBaseSize / 2),
          this.puzzleBaseSize * 1.2,
          0,
          Math.PI * 2,
          true
        );
        ctx.closePath();
        ctx.shadowColor = 'rgba(255, 255, 255, .8)';
        ctx.shadowOffsetX = -1;
        ctx.shadowOffsetY = -1;
        ctx.shadowBlur = Math.min(Math.ceil(8 * this.puzzleScale), 12);
        ctx.fillStyle = '#ffffaa';
        ctx.fill();

        // 将小图赋值给ctx2
        const imgData = ctx.getImageData(
          this.pinX - 3, // 为了阴影 是从-3px开始截取，判定的时候要+3px
          this.pinY - 20,
          this.pinX + this.puzzleBaseSize + 5,
          this.pinY + this.puzzleBaseSize + 5
        );
        ctx2.putImageData(imgData, 0, this.pinY - 20);

        // ctx2.drawImage(c, this.pinX - 3,this.pinY - 20,this.pinX + this.puzzleBaseSize + 5,this.pinY + this.puzzleBaseSize + 5,
        // 0, this.pinY - 20, this.pinX + this.puzzleBaseSize + 5, this.pinY + this.puzzleBaseSize + 5);

        // 清理
        ctx.restore();
        ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);

        // 画缺口
        ctx.save();
        this.paintBrick(ctx);
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.restore();

        // 画缺口的内阴影
        ctx.save();
        ctx.globalCompositeOperation = 'source-atop';
        this.paintBrick(ctx);
        ctx.arc(
          this.pinX + Math.ceil(this.puzzleBaseSize / 2),
          this.pinY + Math.ceil(this.puzzleBaseSize / 2),
          this.puzzleBaseSize * 1.2,
          0,
          Math.PI * 2,
          true
        );
        ctx.shadowColor = '#000';
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
        ctx.shadowBlur = 16;
        ctx.fill();
        ctx.restore();

        // 画整体背景图
        ctx.save();
        ctx.globalCompositeOperation = 'destination-over';
        ctx.drawImage(img, x, y, w, h);
        ctx.restore();

        this.loading = false;
        this.isCanSlide = true;
      };
      img.onerror = () => {
        this.init(true); // 如果图片加载错误就重新来，并强制用canvas随机作图
      };

      if (!withCanvas && this.imgs && this.imgs.length) {
        let randomNum = this.getRandom(0, this.imgs.length - 1);
        if (randomNum === this.imgIndex) {
          if (randomNum === this.imgs.length - 1) {
            randomNum = 0;
          } else {
            randomNum++;
          }
        }
        this.imgIndex = randomNum;
        img.src = this.imgs[randomNum];
      } else {
        img.src = this.makeImgWithCanvas();
      }
    },
    // 工具 - 范围随机数
    getRandom(min, max) {
      return Math.ceil(Math.random() * (max - min) + min);
    },
    // 工具 - 设置图片尺寸cover方式贴合canvas尺寸 w/h
    makeImgSize(img) {
      const imgScale = img.width / img.height;
      const canvasScale = this.canvasWidth / this.canvasHeight;
      let x = 0,
        y = 0,
        w = 0,
        h = 0;
      if (imgScale > canvasScale) {
        h = this.canvasHeight;
        w = imgScale * h;
        y = 0;
        x = (this.canvasWidth - w) / 2;
      } else {
        w = this.canvasWidth;
        h = w / imgScale;
        x = 0;
        y = (this.canvasHeight - h) / 2;
      }
      return [x, y, w, h];
    },
    // 绘制拼图块的路径
    paintBrick(ctx) {
      const moveL = Math.ceil(15 * this.puzzleScale); // 直线移动的基础距离
      ctx.beginPath();
      ctx.moveTo(this.pinX, this.pinY);
      ctx.lineTo(this.pinX + moveL, this.pinY);
      ctx.arcTo(
        this.pinX + moveL,
        this.pinY - moveL / 2,
        this.pinX + moveL + moveL / 2,
        this.pinY - moveL / 2,
        moveL / 2
      );
      ctx.arcTo(
        this.pinX + moveL + moveL,
        this.pinY - moveL / 2,
        this.pinX + moveL + moveL,
        this.pinY,
        moveL / 2
      );
      ctx.lineTo(this.pinX + moveL + moveL + moveL, this.pinY);
      ctx.lineTo(this.pinX + moveL + moveL + moveL, this.pinY + moveL);
      ctx.arcTo(
        this.pinX + moveL + moveL + moveL + moveL / 2,
        this.pinY + moveL,
        this.pinX + moveL + moveL + moveL + moveL / 2,
        this.pinY + moveL + moveL / 2,
        moveL / 2
      );
      ctx.arcTo(
        this.pinX + moveL + moveL + moveL + moveL / 2,
        this.pinY + moveL + moveL,
        this.pinX + moveL + moveL + moveL,
        this.pinY + moveL + moveL,
        moveL / 2
      );
      ctx.lineTo(
        this.pinX + moveL + moveL + moveL,
        this.pinY + moveL + moveL + moveL
      );
      ctx.lineTo(this.pinX, this.pinY + moveL + moveL + moveL);
      ctx.lineTo(this.pinX, this.pinY + moveL + moveL);

      ctx.arcTo(
        this.pinX + moveL / 2,
        this.pinY + moveL + moveL,
        this.pinX + moveL / 2,
        this.pinY + moveL + moveL / 2,
        moveL / 2
      );
      ctx.arcTo(
        this.pinX + moveL / 2,
        this.pinY + moveL,
        this.pinX,
        this.pinY + moveL,
        moveL / 2
      );
      ctx.lineTo(this.pinX, this.pinY);
    },
    // 用canvas随机生成图片
    makeImgWithCanvas() {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = this.canvasWidth;
      canvas.height = this.canvasHeight;
      ctx.fillStyle = `rgb(${this.getRandom(100, 255)},${this.getRandom(
        100,
        255
      )},${this.getRandom(100, 255)})`;
      ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
      // 随机画10个图形
      for (let i = 0; i < 12; i++) {
        ctx.fillStyle = `rgb(${this.getRandom(100, 255)},${this.getRandom(
          100,
          255
        )},${this.getRandom(100, 255)})`;
        ctx.strokeStyle = `rgb(${this.getRandom(100, 255)},${this.getRandom(
          100,
          255
        )},${this.getRandom(100, 255)})`;

        if (this.getRandom(0, 2) > 1) {
          // 矩形
          ctx.save();
          ctx.rotate((this.getRandom(-90, 90) * Math.PI) / 180);
          ctx.fillRect(
            this.getRandom(-20, canvas.width - 20),
            this.getRandom(-20, canvas.height - 20),
            this.getRandom(10, canvas.width / 2 + 10),
            this.getRandom(10, canvas.height / 2 + 10)
          );
          ctx.restore();
        } else {
          // 圆
          ctx.beginPath();
          const ran = this.getRandom(-Math.PI, Math.PI);
          ctx.arc(
            this.getRandom(0, canvas.width),
            this.getRandom(0, canvas.height),
            this.getRandom(10, canvas.height / 2 + 10),
            ran,
            ran + Math.PI * 1.5
          );
          ctx.closePath();
          ctx.fill();
        }
      }
      return canvas.toDataURL('image/png');
    },
    // 开始判定
    submit() {
      this.isSubmting = true;
      // 偏差 x = puzzle的起始X - (用户真滑动的距离) + (puzzle的宽度 - 滑块的宽度) * （用户真滑动的距离/canvas总宽度）
      // 最后+ 的是补上slider和滑块宽度不一致造成的缝隙
      const x = Math.abs(
        this.pinX -
          (this.styleWidth - this.sliderBaseSize) +
          (this.puzzleBaseSize - this.sliderBaseSize) *
            ((this.styleWidth - this.sliderBaseSize) /
              (this.canvasWidth - this.sliderBaseSize)) -
          3
      );
      if (x < this.range) {
        // 成功
        this.infoText = this.successText;
        this.infoBoxFail = false;
        this.infoBoxShow = true;
        this.isCanSlide = false;
        this.isSuccess = true;
        // 成功后准备关闭
        clearTimeout(this.timer1);
        this.timer1 = setTimeout(() => {
          // 成功的回调
          this.isSubmting = false;
          this.$emit('success', x);
        }, 800);
      } else {
        // 失败
        this.infoText = this.failText;
        this.infoBoxFail = true;
        this.infoBoxShow = true;
        this.isCanSlide = false;
        // 失败的回调
        this.$emit('fail', x);
        // 800ms后重置
        clearTimeout(this.timer1);
        this.timer1 = setTimeout(() => {
          this.isSubmting = false;
          this.reset();
        }, 800);
      }
    },
    // 重置 - 重新设置初始状态
    resetState() {
      this.infoBoxFail = false;
      this.infoBoxShow = false;
      this.isCanSlide = false;
      this.isSuccess = false;
      this.startWidth = this.sliderBaseSize; // 鼠标点下去时父级的width
      this.startX = 0; // 鼠标按下时的X
      this.newX = 0; // 鼠标当前的偏移X
    },

    // 重置
    reset() {
      if (this.isSubmting) {
        return;
      }
      this.resetState();
      this.init();
    },
  },
};
</script>
<style lang="less">
.vue-puzzle-vcode {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  right: 0;
  background-color: rgba(0, 0, 0, 0.3);
  z-index: 999;
  opacity: 0;
  pointer-events: none;
  transition: opacity 200ms;
  &.show_ {
    opacity: 1;
    pointer-events: auto;
  }
}
.vue-auth-box_ {
  position: absolute;
  top: 45%;
  left: 50%;
  transform: translate(-50%, -50%);
  padding: 20px;
  // background: #fff;
  user-select: none;
  // border-radius: 3px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  .auth-body_ {
    position: relative;
    overflow: hidden;
    border-radius: 3px;
    .loading-box_ {
      position: absolute;
      top: 0;
      left: 0;
      bottom: 0;
      right: 0;
      background-color: rgba(0, 0, 0, 0.8);
      z-index: 20;
      opacity: 1;
      transition: opacity 200ms;
      display: flex;
      align-items: center;
      justify-content: center;
      &.hide_ {
        opacity: 0;
        pointer-events: none;
        .loading-gif_ {
          span {
            animation-play-state: paused;
          }
        }
      }
      .loading-gif_ {
        flex: none;
        height: 5px;
        line-height: 0;
        @keyframes load {
          0% {
            opacity: 1;
            transform: scale(1.3);
          }
          100% {
            opacity: 0.2;
            transform: scale(0.3);
          }
        }
        span {
          display: inline-block;
          width: 5px;
          height: 100%;
          margin-left: 2px;
          border-radius: 50%;
          background-color: #888;
          animation: load 1.04s ease infinite;
          &:nth-child(1) {
            margin-left: 0;
          }
          &:nth-child(2) {
            animation-delay: 0.13s;
          }
          &:nth-child(3) {
            animation-delay: 0.26s;
          }
          &:nth-child(4) {
            animation-delay: 0.39s;
          }
          &:nth-child(5) {
            animation-delay: 0.52s;
          }
        }
      }
    }
    .info-box_ {
      position: absolute;
      bottom: 0;
      left: 0;
      width: 100%;
      height: 24px;
      line-height: 24px;
      text-align: center;
      overflow: hidden;
      font-size: 13px;
      background-color: #83ce3f;
      opacity: 0;
      transform: translateY(24px);
      transition: all 200ms;
      color: #fff;
      z-index: 10;
      &.show {
        opacity: 0.95;
        transform: translateY(0);
      }
      &.fail {
        background-color: #ce594b;
      }
    }
    .auth-canvas2_ {
      position: absolute;
      top: 0;
      left: 0;
      width: 60px;
      height: 100%;
      z-index: 2;
    }
    .auth-canvas3_ {
      position: absolute;
      top: 0;
      left: 0;
      opacity: 0;
      transition: opacity 600ms;
      z-index: 3;
      &.show {
        opacity: 1;
      }
    }
    .flash_ {
      position: absolute;
      top: 0;
      left: 0;
      width: 30px;
      height: 100%;
      background-color: rgba(255, 255, 255, 0.1);
      z-index: 3;
      &.show {
        transition: transform 600ms;
      }
    }
    .reset_ {
      position: absolute;
      top: 2px;
      right: 2px;
      width: 35px;
      height: auto;
      z-index: 12;
      cursor: pointer;
      transition: transform 200ms;
      transform: rotate(0deg);
      &:hover {
        transform: rotate(-90deg);
      }
    }
  }
  .auth-control_ {
    .range-box {
      position: relative;
      width: 100%;
      // background-color: #eef1f8;
      margin-top: 20px;
      border-radius: 3px;
      box-shadow: 0 0 8px rgba(240, 240, 240, 0.6) inset;
      .range-text {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: 14px;
        color: #b7bcd1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        text-align: center;
        width: 100%;
      }
      .range-slider {
        position: absolute;
        height: 100%;
        width: 50px;
        background-color: rgba(106, 160, 255, 0.8);
        border-radius: 3px;
        .range-btn {
          position: absolute;
          display: flex;
          align-items: center;
          justify-content: center;
          right: 0;
          width: 50px;
          height: 100%;
          background-color: #fff;
          border-radius: 3px;
          box-shadow: 0 0 4px #ccc;
          cursor: pointer;
          & > div {
            width: 0;
            height: 40%;

            transition: all 200ms;
            &:nth-child(2) {
              margin: 0 4px;
            }
            border: solid 1px #6aa0ff;
          }
          &:hover,
          &.isDown {
            & > div:first-child {
              border: solid 4px transparent;
              height: 0;
              border-right-color: #6aa0ff;
            }
            & > div:nth-child(2) {
              border-width: 3px;
              height: 0;
              border-radius: 3px;
              margin: 0 6px;
              border-right-color: #6aa0ff;
            }
            & > div:nth-child(3) {
              border: solid 4px transparent;
              height: 0;
              border-left-color: #6aa0ff;
            }
          }
        }
      }
    }
  }
}
.vue-puzzle-overflow {
  overflow: hidden !important;
}
</style>
