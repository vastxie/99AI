import { h, defineComponent, withDirectives, resolveDirective } from "vue";

export default defineComponent({
  name: "Motion",
  props: {
    delay:{
			type: Number,
      default: 50
		},
		y:{
			type: Number,
      default: 50
		},
		opacity:{
			type: Number,
      default: 0.5
		},
		scale: {
			type: Number,
      default: 1
		},
		duration:{
			type: Number,
      default: 350
		}
  },
  setup(props, { slots }) {
    // 使用 setup 函数的参数来访问 props 和 slots
    return () => {
      const motion = resolveDirective("motion");
      return withDirectives(
        h(
          "div",
          {},
          {
            default: () => [slots.default?.()]
          }
        ),
        [
          [
            motion,
            {
              initial: { opacity: props.opacity, y: props.y, scale: props.scale },
              enter: {
                opacity: 1,
                y: 0,
								scale: 1,
								transition : {
                  delay: props.delay,
									duration: props.duration
                }
              }
            }
          ]
        ]
      );
    };
  }
});
