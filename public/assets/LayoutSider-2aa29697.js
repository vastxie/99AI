import{ap as a,aq as d,aQ as l,ao as f,d as C,aa as s,as as N,bS as A,ay as P,aD as W,bT as U,r as y,e as p,aU as V,aT as _,bU as X,aV as q,bV as D,ax as H,aB as K,bm as Q,ar as x,bW as Z,aZ as m,bX as G}from"./index-ff703318.js";const J=a("layout-sider",`
 flex-shrink: 0;
 box-sizing: border-box;
 position: relative;
 z-index: 1;
 color: var(--n-text-color);
 transition:
 color .3s var(--n-bezier),
 border-color .3s var(--n-bezier),
 min-width .3s var(--n-bezier),
 max-width .3s var(--n-bezier),
 transform .3s var(--n-bezier),
 background-color .3s var(--n-bezier);
 background-color: var(--n-color);
 display: flex;
 justify-content: flex-end;
`,[d("bordered",[l("border",`
 content: "";
 position: absolute;
 top: 0;
 bottom: 0;
 width: 1px;
 background-color: var(--n-border-color);
 transition: background-color .3s var(--n-bezier);
 `)]),l("left-placement",[d("bordered",[l("border",`
 right: 0;
 `)])]),d("right-placement",`
 justify-content: flex-start;
 `,[d("bordered",[l("border",`
 left: 0;
 `)]),d("collapsed",[a("layout-toggle-button",[a("base-icon",`
 transform: rotate(180deg);
 `)]),a("layout-toggle-bar",[f("&:hover",[l("top",{transform:"rotate(-12deg) scale(1.15) translateY(-2px)"}),l("bottom",{transform:"rotate(12deg) scale(1.15) translateY(2px)"})])])]),a("layout-toggle-button",`
 left: 0;
 transform: translateX(-50%) translateY(-50%);
 `,[a("base-icon",`
 transform: rotate(0);
 `)]),a("layout-toggle-bar",`
 left: -28px;
 transform: rotate(180deg);
 `,[f("&:hover",[l("top",{transform:"rotate(12deg) scale(1.15) translateY(-2px)"}),l("bottom",{transform:"rotate(-12deg) scale(1.15) translateY(2px)"})])])]),d("collapsed",[a("layout-toggle-bar",[f("&:hover",[l("top",{transform:"rotate(-12deg) scale(1.15) translateY(-2px)"}),l("bottom",{transform:"rotate(12deg) scale(1.15) translateY(2px)"})])]),a("layout-toggle-button",[a("base-icon",`
 transform: rotate(0);
 `)])]),a("layout-toggle-button",`
 transition:
 color .3s var(--n-bezier),
 right .3s var(--n-bezier),
 left .3s var(--n-bezier),
 border-color .3s var(--n-bezier),
 background-color .3s var(--n-bezier);
 cursor: pointer;
 width: 24px;
 height: 24px;
 position: absolute;
 top: 50%;
 right: 0;
 border-radius: 50%;
 display: flex;
 align-items: center;
 justify-content: center;
 font-size: 18px;
 color: var(--n-toggle-button-icon-color);
 border: var(--n-toggle-button-border);
 background-color: var(--n-toggle-button-color);
 box-shadow: 0 2px 4px 0px rgba(0, 0, 0, .06);
 transform: translateX(50%) translateY(-50%);
 z-index: 1;
 `,[a("base-icon",`
 transition: transform .3s var(--n-bezier);
 transform: rotate(180deg);
 `)]),a("layout-toggle-bar",`
 cursor: pointer;
 height: 72px;
 width: 32px;
 position: absolute;
 top: calc(50% - 36px);
 right: -28px;
 `,[l("top, bottom",`
 position: absolute;
 width: 4px;
 border-radius: 2px;
 height: 38px;
 left: 14px;
 transition: 
 background-color .3s var(--n-bezier),
 transform .3s var(--n-bezier);
 `),l("bottom",`
 position: absolute;
 top: 34px;
 `),f("&:hover",[l("top",{transform:"rotate(12deg) scale(1.15) translateY(-2px)"}),l("bottom",{transform:"rotate(-12deg) scale(1.15) translateY(2px)"})]),l("top, bottom",{backgroundColor:"var(--n-toggle-bar-color)"}),f("&:hover",[l("top, bottom",{backgroundColor:"var(--n-toggle-bar-color-hover)"})])]),l("border",`
 position: absolute;
 top: 0;
 right: 0;
 bottom: 0;
 width: 1px;
 transition: background-color .3s var(--n-bezier);
 `),a("layout-sider-scroll-container",`
 flex-grow: 1;
 flex-shrink: 0;
 box-sizing: border-box;
 height: 100%;
 opacity: 0;
 transition: opacity .3s var(--n-bezier);
 max-width: 100%;
 `),d("show-content",[a("layout-sider-scroll-container",{opacity:1})]),d("absolute-positioned",`
 position: absolute;
 left: 0;
 top: 0;
 bottom: 0;
 `)]),ee=C({name:"LayoutToggleButton",props:{clsPrefix:{type:String,required:!0},onClick:Function},render(){const{clsPrefix:e}=this;return s("div",{class:`${e}-layout-toggle-button`,onClick:this.onClick},s(N,{clsPrefix:e},{default:()=>s(A,null)}))}}),oe=C({props:{clsPrefix:{type:String,required:!0},onClick:Function},render(){const{clsPrefix:e}=this;return s("div",{onClick:this.onClick,class:`${e}-layout-toggle-bar`},s("div",{class:`${e}-layout-toggle-bar__top`}),s("div",{class:`${e}-layout-toggle-bar__bottom`}))}}),te={position:Z,bordered:Boolean,collapsedWidth:{type:Number,default:48},width:{type:[Number,String],default:272},contentStyle:{type:[String,Object],default:""},collapseMode:{type:String,default:"transform"},collapsed:{type:Boolean,default:void 0},defaultCollapsed:Boolean,showCollapsedContent:{type:Boolean,default:!0},showTrigger:{type:[Boolean,String],default:!1},nativeScrollbar:{type:Boolean,default:!0},inverted:Boolean,scrollbarProps:Object,triggerStyle:[String,Object],collapsedTriggerStyle:[String,Object],"onUpdate:collapsed":[Function,Array],onUpdateCollapsed:[Function,Array],onAfterEnter:Function,onAfterLeave:Function,onExpand:[Function,Array],onCollapse:[Function,Array],onScroll:Function},le=C({name:"LayoutSider",props:Object.assign(Object.assign({},P.props),te),setup(e){const n=W(U),c=y(null),b=y(null),$=p(()=>x(h.value?e.collapsedWidth:e.width)),j=p(()=>e.collapseMode!=="transform"?{}:{minWidth:x(e.width)}),I=p(()=>n?n.siderPlacement:"left"),S=y(e.defaultCollapsed),h=V(_(e,"collapsed"),S);function O(r,o){if(e.nativeScrollbar){const{value:t}=c;t&&(o===void 0?t.scrollTo(r):t.scrollTo(r,o))}else{const{value:t}=b;t&&t.scrollTo(r,o)}}function E(){const{"onUpdate:collapsed":r,onUpdateCollapsed:o,onExpand:t,onCollapse:v}=e,{value:g}=h;o&&m(o,!g),r&&m(r,!g),S.value=!g,g?t&&m(t):v&&m(v)}let T=0,z=0;const Y=r=>{var o;const t=r.target;T=t.scrollLeft,z=t.scrollTop,(o=e.onScroll)===null||o===void 0||o.call(e,r)};X(()=>{if(e.nativeScrollbar){const r=c.value;r&&(r.scrollTop=z,r.scrollLeft=T)}}),q(D,{collapsedRef:h,collapseModeRef:_(e,"collapseMode")});const{mergedClsPrefixRef:k,inlineThemeDisabled:w}=H(e),B=P("Layout","-layout-sider",J,G,e,k);function L(r){var o,t;r.propertyName==="max-width"&&(h.value?(o=e.onAfterLeave)===null||o===void 0||o.call(e):(t=e.onAfterEnter)===null||t===void 0||t.call(e))}const M={scrollTo:O},R=p(()=>{const{common:{cubicBezierEaseInOut:r},self:o}=B.value,{siderToggleButtonColor:t,siderToggleButtonBorder:v,siderToggleBarColor:g,siderToggleBarColorHover:F}=o,i={"--n-bezier":r,"--n-toggle-button-color":t,"--n-toggle-button-border":v,"--n-toggle-bar-color":g,"--n-toggle-bar-color-hover":F};return e.inverted?(i["--n-color"]=o.siderColorInverted,i["--n-text-color"]=o.textColorInverted,i["--n-border-color"]=o.siderBorderColorInverted,i["--n-toggle-button-icon-color"]=o.siderToggleButtonIconColorInverted,i.__invertScrollbar=o.__invertScrollbar):(i["--n-color"]=o.siderColor,i["--n-text-color"]=o.textColor,i["--n-border-color"]=o.siderBorderColor,i["--n-toggle-button-icon-color"]=o.siderToggleButtonIconColor),i}),u=w?K("layout-sider",p(()=>e.inverted?"a":"b"),R,e):void 0;return Object.assign({scrollableElRef:c,scrollbarInstRef:b,mergedClsPrefix:k,mergedTheme:B,styleMaxWidth:$,mergedCollapsed:h,scrollContainerStyle:j,siderPlacement:I,handleNativeElScroll:Y,handleTransitionend:L,handleTriggerClick:E,inlineThemeDisabled:w,cssVars:R,themeClass:u==null?void 0:u.themeClass,onRender:u==null?void 0:u.onRender},M)},render(){var e;const{mergedClsPrefix:n,mergedCollapsed:c,showTrigger:b}=this;return(e=this.onRender)===null||e===void 0||e.call(this),s("aside",{class:[`${n}-layout-sider`,this.themeClass,`${n}-layout-sider--${this.position}-positioned`,`${n}-layout-sider--${this.siderPlacement}-placement`,this.bordered&&`${n}-layout-sider--bordered`,c&&`${n}-layout-sider--collapsed`,(!c||this.showCollapsedContent)&&`${n}-layout-sider--show-content`],onTransitionend:this.handleTransitionend,style:[this.inlineThemeDisabled?void 0:this.cssVars,{maxWidth:this.styleMaxWidth,width:x(this.width)}]},this.nativeScrollbar?s("div",{class:`${n}-layout-sider-scroll-container`,onScroll:this.handleNativeElScroll,style:[this.scrollContainerStyle,{overflow:"auto"},this.contentStyle],ref:"scrollableElRef"},this.$slots):s(Q,Object.assign({},this.scrollbarProps,{onScroll:this.onScroll,ref:"scrollbarInstRef",style:this.scrollContainerStyle,contentStyle:this.contentStyle,theme:this.mergedTheme.peers.Scrollbar,themeOverrides:this.mergedTheme.peerOverrides.Scrollbar,builtinThemeOverrides:this.inverted&&this.cssVars.__invertScrollbar==="true"?{colorHover:"rgba(255, 255, 255, .4)",color:"rgba(255, 255, 255, .3)"}:void 0}),this.$slots),b?b==="bar"?s(oe,{clsPrefix:n,style:c?this.collapsedTriggerStyle:this.triggerStyle,onClick:this.handleTriggerClick}):s(ee,{clsPrefix:n,style:c?this.collapsedTriggerStyle:this.triggerStyle,onClick:this.handleTriggerClick}):null,this.bordered?s("div",{class:`${n}-layout-sider__border`}):null)}});export{le as N};
