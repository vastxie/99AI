import{ap as H,aQ as t,aR as I,ao as K,aq as o,b8 as E,d as se,ax as de,ay as O,aS as ce,r as P,aT as ue,aU as he,e as V,aB as be,b9 as U,aa as i,ba as f,bb as fe,aA as v,bc as M,bd as r,aM as ve,be as ge,aZ as j}from"./index-ff703318.js";const we=H("switch",`
 height: var(--n-height);
 min-width: var(--n-width);
 vertical-align: middle;
 user-select: none;
 -webkit-user-select: none;
 display: inline-flex;
 outline: none;
 justify-content: center;
 align-items: center;
`,[t("children-placeholder",`
 height: var(--n-rail-height);
 display: flex;
 flex-direction: column;
 overflow: hidden;
 pointer-events: none;
 visibility: hidden;
 `),t("rail-placeholder",`
 display: flex;
 flex-wrap: none;
 `),t("button-placeholder",`
 width: calc(1.75 * var(--n-rail-height));
 height: var(--n-rail-height);
 `),H("base-loading",`
 position: absolute;
 top: 50%;
 left: 50%;
 transform: translateX(-50%) translateY(-50%);
 font-size: calc(var(--n-button-width) - 4px);
 color: var(--n-loading-color);
 transition: color .3s var(--n-bezier);
 `,[I({left:"50%",top:"50%",originalTransform:"translateX(-50%) translateY(-50%)"})]),t("checked, unchecked",`
 transition: color .3s var(--n-bezier);
 color: var(--n-text-color);
 box-sizing: border-box;
 position: absolute;
 white-space: nowrap;
 top: 0;
 bottom: 0;
 display: flex;
 align-items: center;
 line-height: 1;
 `),t("checked",`
 right: 0;
 padding-right: calc(1.25 * var(--n-rail-height) - var(--n-offset));
 `),t("unchecked",`
 left: 0;
 justify-content: flex-end;
 padding-left: calc(1.25 * var(--n-rail-height) - var(--n-offset));
 `),K("&:focus",[t("rail",`
 box-shadow: var(--n-box-shadow-focus);
 `)]),o("round",[t("rail","border-radius: calc(var(--n-rail-height) / 2);",[t("button","border-radius: calc(var(--n-button-height) / 2);")])]),E("disabled",[E("icon",[o("rubber-band",[o("pressed",[t("rail",[t("button","max-width: var(--n-button-width-pressed);")])]),t("rail",[K("&:active",[t("button","max-width: var(--n-button-width-pressed);")])]),o("active",[o("pressed",[t("rail",[t("button","left: calc(100% - var(--n-offset) - var(--n-button-width-pressed));")])]),t("rail",[K("&:active",[t("button","left: calc(100% - var(--n-offset) - var(--n-button-width-pressed));")])])])])])]),o("active",[t("rail",[t("button","left: calc(100% - var(--n-button-width) - var(--n-offset))")])]),t("rail",`
 overflow: hidden;
 height: var(--n-rail-height);
 min-width: var(--n-rail-width);
 border-radius: var(--n-rail-border-radius);
 cursor: pointer;
 position: relative;
 transition:
 opacity .3s var(--n-bezier),
 background .3s var(--n-bezier),
 box-shadow .3s var(--n-bezier);
 background-color: var(--n-rail-color);
 `,[t("button-icon",`
 color: var(--n-icon-color);
 transition: color .3s var(--n-bezier);
 font-size: calc(var(--n-button-height) - 4px);
 position: absolute;
 left: 0;
 right: 0;
 top: 0;
 bottom: 0;
 display: flex;
 justify-content: center;
 align-items: center;
 line-height: 1;
 `,[I()]),t("button",`
 align-items: center; 
 top: var(--n-offset);
 left: var(--n-offset);
 height: var(--n-button-height);
 width: var(--n-button-width-pressed);
 max-width: var(--n-button-width);
 border-radius: var(--n-button-border-radius);
 background-color: var(--n-button-color);
 box-shadow: var(--n-button-box-shadow);
 box-sizing: border-box;
 cursor: inherit;
 content: "";
 position: absolute;
 transition:
 background-color .3s var(--n-bezier),
 left .3s var(--n-bezier),
 opacity .3s var(--n-bezier),
 max-width .3s var(--n-bezier),
 box-shadow .3s var(--n-bezier);
 `)]),o("active",[t("rail","background-color: var(--n-rail-color-active);")]),o("loading",[t("rail",`
 cursor: wait;
 `)]),o("disabled",[t("rail",`
 cursor: not-allowed;
 opacity: .5;
 `)])]),me=Object.assign(Object.assign({},O.props),{size:{type:String,default:"medium"},value:{type:[String,Number,Boolean],default:void 0},loading:Boolean,defaultValue:{type:[String,Number,Boolean],default:!1},disabled:{type:Boolean,default:void 0},round:{type:Boolean,default:!0},"onUpdate:value":[Function,Array],onUpdateValue:[Function,Array],checkedValue:{type:[String,Number,Boolean],default:!0},uncheckedValue:{type:[String,Number,Boolean],default:!1},railStyle:Function,rubberBand:{type:Boolean,default:!0},onChange:[Function,Array]});let k;const ye=se({name:"Switch",props:me,setup(e){k===void 0&&(typeof CSS<"u"?typeof CSS.supports<"u"?k=CSS.supports("width","max(1px)"):k=!1:k=!0);const{mergedClsPrefixRef:S,inlineThemeDisabled:m}=de(e),z=O("Switch","-switch",we,fe,e,S),l=ce(e),{mergedSizeRef:$,mergedDisabledRef:h}=l,p=P(e.defaultValue),B=ue(e,"value"),b=he(B,p),y=V(()=>b.value===e.checkedValue),g=P(!1),n=P(!1),s=V(()=>{const{railStyle:a}=e;if(a)return a({focused:n.value,checked:y.value})});function d(a){const{"onUpdate:value":C,onChange:R,onUpdateValue:_}=e,{nTriggerFormInput:F,nTriggerFormChange:T}=l;C&&j(C,a),_&&j(_,a),R&&j(R,a),p.value=a,F(),T()}function L(){const{nTriggerFormFocus:a}=l;a()}function X(){const{nTriggerFormBlur:a}=l;a()}function Y(){e.loading||h.value||(b.value!==e.checkedValue?d(e.checkedValue):d(e.uncheckedValue))}function q(){n.value=!0,L()}function Q(){n.value=!1,X(),g.value=!1}function Z(a){e.loading||h.value||a.key===" "&&(b.value!==e.checkedValue?d(e.checkedValue):d(e.uncheckedValue),g.value=!1)}function G(a){e.loading||h.value||a.key===" "&&(a.preventDefault(),g.value=!0)}const A=V(()=>{const{value:a}=$,{self:{opacityDisabled:C,railColor:R,railColorActive:_,buttonBoxShadow:F,buttonColor:T,boxShadowFocus:J,loadingColor:ee,textColor:te,iconColor:ae,[v("buttonHeight",a)]:c,[v("buttonWidth",a)]:ne,[v("buttonWidthPressed",a)]:ie,[v("railHeight",a)]:u,[v("railWidth",a)]:x,[v("railBorderRadius",a)]:oe,[v("buttonBorderRadius",a)]:re},common:{cubicBezierEaseInOut:le}}=z.value;let N,W,D;return k?(N=`calc((${u} - ${c}) / 2)`,W=`max(${u}, ${c})`,D=`max(${x}, calc(${x} + ${c} - ${u}))`):(N=M((r(u)-r(c))/2),W=M(Math.max(r(u),r(c))),D=r(u)>r(c)?x:M(r(x)+r(c)-r(u))),{"--n-bezier":le,"--n-button-border-radius":re,"--n-button-box-shadow":F,"--n-button-color":T,"--n-button-width":ne,"--n-button-width-pressed":ie,"--n-button-height":c,"--n-height":W,"--n-offset":N,"--n-opacity-disabled":C,"--n-rail-border-radius":oe,"--n-rail-color":R,"--n-rail-color-active":_,"--n-rail-height":u,"--n-rail-width":x,"--n-width":D,"--n-box-shadow-focus":J,"--n-loading-color":ee,"--n-text-color":te,"--n-icon-color":ae}}),w=m?be("switch",V(()=>$.value[0]),A,e):void 0;return{handleClick:Y,handleBlur:Q,handleFocus:q,handleKeyup:Z,handleKeydown:G,mergedRailStyle:s,pressed:g,mergedClsPrefix:S,mergedValue:b,checked:y,mergedDisabled:h,cssVars:m?void 0:A,themeClass:w==null?void 0:w.themeClass,onRender:w==null?void 0:w.onRender}},render(){const{mergedClsPrefix:e,mergedDisabled:S,checked:m,mergedRailStyle:z,onRender:l,$slots:$}=this;l==null||l();const{checked:h,unchecked:p,icon:B,"checked-icon":b,"unchecked-icon":y}=$,g=!(U(B)&&U(b)&&U(y));return i("div",{role:"switch","aria-checked":m,class:[`${e}-switch`,this.themeClass,g&&`${e}-switch--icon`,m&&`${e}-switch--active`,S&&`${e}-switch--disabled`,this.round&&`${e}-switch--round`,this.loading&&`${e}-switch--loading`,this.pressed&&`${e}-switch--pressed`,this.rubberBand&&`${e}-switch--rubber-band`],tabindex:this.mergedDisabled?void 0:0,style:this.cssVars,onClick:this.handleClick,onFocus:this.handleFocus,onBlur:this.handleBlur,onKeyup:this.handleKeyup,onKeydown:this.handleKeydown},i("div",{class:`${e}-switch__rail`,"aria-hidden":"true",style:z},f(h,n=>f(p,s=>n||s?i("div",{"aria-hidden":!0,class:`${e}-switch__children-placeholder`},i("div",{class:`${e}-switch__rail-placeholder`},i("div",{class:`${e}-switch__button-placeholder`}),n),i("div",{class:`${e}-switch__rail-placeholder`},i("div",{class:`${e}-switch__button-placeholder`}),s)):null)),i("div",{class:`${e}-switch__button`},f(B,n=>f(b,s=>f(y,d=>i(ve,null,{default:()=>this.loading?i(ge,{key:"loading",clsPrefix:e,strokeWidth:20}):this.checked&&(s||n)?i("div",{class:`${e}-switch__button-icon`,key:s?"checked-icon":"icon"},s||n):!this.checked&&(d||n)?i("div",{class:`${e}-switch__button-icon`,key:d?"unchecked-icon":"icon"},d||n):null})))),f(h,n=>n&&i("div",{key:"checked",class:`${e}-switch__checked`},n)),f(p,n=>n&&i("div",{key:"unchecked",class:`${e}-switch__unchecked`},n)))))}});export{ye as N};
