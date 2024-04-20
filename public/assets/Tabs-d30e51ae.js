import{g as Q,r as A,cD as pt,cE as vt,v as c,cG as xe,cU as ht,cV as Z,bR as gt,c3 as mt,aK as $e,bm as xt,k as J,aj as yt,O as wt,bH as St,ch as Ct,bn as Rt,c9 as Tt,a as r,b as i,c as S,d as E,a3 as zt,u as $t,h as Pe,cW as Pt,cR as ye,cX as re,l as Wt,w as ne,L as Lt,aT as _t,t as k,cY as At,aN as Et,a5 as j,cM as K,n as Bt,a9 as we,cn as oe,A as q,a7 as kt,D as ie,ah as jt,ai as It,aZ as Ot,b3 as Ht}from"./index-2efe4620.js";import{A as Ft}from"./Add-1eab33c9.js";const Dt=xe(".v-x-scroll",{overflow:"auto",scrollbarWidth:"none"},[xe("&::-webkit-scrollbar",{width:0,height:0})]),Mt=Q({name:"XScroll",props:{disabled:Boolean,onScroll:Function},setup(){const e=A(null);function n(l){!(l.currentTarget.offsetWidth<l.currentTarget.scrollWidth)||l.deltaY===0||(l.currentTarget.scrollLeft+=l.deltaY+l.deltaX,l.preventDefault())}const d=pt();return Dt.mount({id:"vueuc/x-scroll",head:!0,anchorMetaName:vt,ssr:d}),Object.assign({selfRef:e,handleWheel:n},{scrollTo(...l){var x;(x=e.value)===null||x===void 0||x.scrollTo(...l)}})},render(){return c("div",{ref:"selfRef",onScroll:this.onScroll,onWheel:this.disabled?void 0:this.handleWheel,class:"v-x-scroll"},this.$slots)}});var Nt=/\s/;function Vt(e){for(var n=e.length;n--&&Nt.test(e.charAt(n)););return n}var Xt=/^\s+/;function Ut(e){return e&&e.slice(0,Vt(e)+1).replace(Xt,"")}var Se=0/0,Gt=/^[-+]0x[0-9a-f]+$/i,Yt=/^0b[01]+$/i,Kt=/^0o[0-7]+$/i,qt=parseInt;function Ce(e){if(typeof e=="number")return e;if(ht(e))return Se;if(Z(e)){var n=typeof e.valueOf=="function"?e.valueOf():e;e=Z(n)?n+"":n}if(typeof e!="string")return e===0?e:+e;e=Ut(e);var d=Yt.test(e);return d||Kt.test(e)?qt(e.slice(2),d?2:8):Gt.test(e)?Se:+e}var Jt=function(){return gt.Date.now()};const se=Jt;var Zt="Expected a function",Qt=Math.max,ea=Math.min;function ta(e,n,d){var p,l,x,v,f,m,h=0,g=!1,W=!1,L=!0;if(typeof e!="function")throw new TypeError(Zt);n=Ce(n)||0,Z(d)&&(g=!!d.leading,W="maxWait"in d,x=W?Qt(Ce(d.maxWait)||0,n):x,L="trailing"in d?!!d.trailing:L);function y(b){var R=p,F=l;return p=l=void 0,h=b,v=e.apply(F,R),v}function T(b){return h=b,f=setTimeout(P,n),g?y(b):v}function C(b){var R=b-m,F=b-h,N=n-R;return W?ea(N,x-F):N}function $(b){var R=b-m,F=b-h;return m===void 0||R>=n||R<0||W&&F>=x}function P(){var b=se();if($(b))return z(b);f=setTimeout(P,C(b))}function z(b){return f=void 0,L&&p?y(b):(p=l=void 0,v)}function H(){f!==void 0&&clearTimeout(f),h=0,p=m=l=f=void 0}function _(){return f===void 0?v:z(se())}function u(){var b=se(),R=$(b);if(p=arguments,l=this,m=b,R){if(f===void 0)return T(m);if(W)return clearTimeout(f),f=setTimeout(P,n),y(m)}return f===void 0&&(f=setTimeout(P,n)),v}return u.cancel=H,u.flush=_,u}var aa="Expected a function";function le(e,n,d){var p=!0,l=!0;if(typeof e!="function")throw new TypeError(aa);return Z(d)&&(p="leading"in d?!!d.leading:p,l="trailing"in d?!!d.trailing:l),ta(e,n,{leading:p,maxWait:n,trailing:l})}const be=mt("n-tabs"),We={tab:[String,Number,Object,Function],name:{type:[String,Number],required:!0},disabled:Boolean,displayDirective:{type:String,default:"if"},closable:{type:Boolean,default:void 0},tabProps:Object,label:[String,Number,Object,Function]},la=Q({__TAB_PANE__:!0,name:"TabPane",alias:["TabPanel"],props:We,setup(e){const n=$e(be,null);return n||xt("tab-pane","`n-tab-pane` must be placed inside `n-tabs`."),{style:n.paneStyleRef,class:n.paneClassRef,mergedClsPrefix:n.mergedClsPrefixRef}},render(){return c("div",{class:[`${this.mergedClsPrefix}-tab-pane`,this.class],style:this.style},this.$slots)}}),ra=Object.assign({internalLeftPadded:Boolean,internalAddable:Boolean,internalCreatedByPane:Boolean},Tt(We,["displayDirective"])),ce=Q({__TAB__:!0,inheritAttrs:!1,name:"Tab",props:ra,setup(e){const{mergedClsPrefixRef:n,valueRef:d,typeRef:p,closableRef:l,tabStyleRef:x,addTabStyleRef:v,tabClassRef:f,addTabClassRef:m,tabChangeIdRef:h,onBeforeLeaveRef:g,triggerRef:W,handleAdd:L,activateTab:y,handleClose:T}=$e(be);return{trigger:W,mergedClosable:J(()=>{if(e.internalAddable)return!1;const{closable:C}=e;return C===void 0?l.value:C}),style:x,addStyle:v,tabClass:f,addTabClass:m,clsPrefix:n,value:d,type:p,handleClose(C){C.stopPropagation(),!e.disabled&&T(e.name)},activateTab(){if(e.disabled)return;if(e.internalAddable){L();return}const{name:C}=e,$=++h.id;if(C!==d.value){const{value:P}=g;P?Promise.resolve(P(e.name,d.value)).then(z=>{z&&h.id===$&&y(C)}):y(C)}}}},render(){const{internalAddable:e,clsPrefix:n,name:d,disabled:p,label:l,tab:x,value:v,mergedClosable:f,trigger:m,$slots:{default:h}}=this,g=l??x;return c("div",{class:`${n}-tabs-tab-wrapper`},this.internalLeftPadded?c("div",{class:`${n}-tabs-tab-pad`}):null,c("div",Object.assign({key:d,"data-name":d,"data-disabled":p?!0:void 0},yt({class:[`${n}-tabs-tab`,v===d&&`${n}-tabs-tab--active`,p&&`${n}-tabs-tab--disabled`,f&&`${n}-tabs-tab--closable`,e&&`${n}-tabs-tab--addable`,e?this.addTabClass:this.tabClass],onClick:m==="click"?this.activateTab:void 0,onMouseenter:m==="hover"?this.activateTab:void 0,style:e?this.addStyle:this.style},this.internalCreatedByPane?this.tabProps||{}:this.$attrs)),c("span",{class:`${n}-tabs-tab__label`},e?c(wt,null,c("div",{class:`${n}-tabs-tab__height-placeholder`}," "),c(St,{clsPrefix:n},{default:()=>c(Ft,null)})):h?h():typeof g=="object"?g:Ct(g??d)),f&&this.type==="card"?c(Rt,{clsPrefix:n,class:`${n}-tabs-tab__close`,onClick:this.handleClose,disabled:p}):null))}}),na=r("tabs",`
 box-sizing: border-box;
 width: 100%;
 display: flex;
 flex-direction: column;
 transition:
 background-color .3s var(--n-bezier),
 border-color .3s var(--n-bezier);
`,[i("segment-type",[r("tabs-rail",[S("&.transition-disabled",[r("tabs-capsule",`
 transition: none;
 `)])])]),i("top",[r("tab-pane",`
 padding: var(--n-pane-padding-top) var(--n-pane-padding-right) var(--n-pane-padding-bottom) var(--n-pane-padding-left);
 `)]),i("left",[r("tab-pane",`
 padding: var(--n-pane-padding-right) var(--n-pane-padding-bottom) var(--n-pane-padding-left) var(--n-pane-padding-top);
 `)]),i("left, right",`
 flex-direction: row;
 `,[r("tabs-bar",`
 width: 2px;
 right: 0;
 transition:
 top .2s var(--n-bezier),
 max-height .2s var(--n-bezier),
 background-color .3s var(--n-bezier);
 `),r("tabs-tab",`
 padding: var(--n-tab-padding-vertical); 
 `)]),i("right",`
 flex-direction: row-reverse;
 `,[r("tab-pane",`
 padding: var(--n-pane-padding-left) var(--n-pane-padding-top) var(--n-pane-padding-right) var(--n-pane-padding-bottom);
 `),r("tabs-bar",`
 left: 0;
 `)]),i("bottom",`
 flex-direction: column-reverse;
 justify-content: flex-end;
 `,[r("tab-pane",`
 padding: var(--n-pane-padding-bottom) var(--n-pane-padding-right) var(--n-pane-padding-top) var(--n-pane-padding-left);
 `),r("tabs-bar",`
 top: 0;
 `)]),r("tabs-rail",`
 padding: 3px;
 border-radius: var(--n-tab-border-radius);
 width: 100%;
 background-color: var(--n-color-segment);
 transition: background-color .3s var(--n-bezier);
 display: flex;
 align-items: center;
 `,[r("tabs-capsule",`
 border-radius: var(--n-tab-border-radius);
 position: absolute;
 pointer-events: none;
 background-color: var(--n-tab-color-segment);
 box-shadow: 0 1px 3px 0 rgba(0, 0, 0, .08);
 transition: transform 0.3s var(--n-bezier);
 `),r("tabs-tab-wrapper",`
 flex-basis: 0;
 flex-grow: 1;
 display: flex;
 align-items: center;
 justify-content: center;
 `,[r("tabs-tab",`
 overflow: hidden;
 border-radius: var(--n-tab-border-radius);
 width: 100%;
 display: flex;
 align-items: center;
 justify-content: center;
 `,[i("active",`
 font-weight: var(--n-font-weight-strong);
 color: var(--n-tab-text-color-active);
 `),S("&:hover",`
 color: var(--n-tab-text-color-hover);
 `)])])]),i("flex",[r("tabs-nav",`
 width: 100%;
 position: relative;
 `,[r("tabs-wrapper",`
 width: 100%;
 `,[r("tabs-tab",`
 margin-right: 0;
 `)])])]),r("tabs-nav",`
 box-sizing: border-box;
 line-height: 1.5;
 display: flex;
 transition: border-color .3s var(--n-bezier);
 `,[E("prefix, suffix",`
 display: flex;
 align-items: center;
 `),E("prefix","padding-right: 16px;"),E("suffix","padding-left: 16px;")]),i("top, bottom",[r("tabs-nav-scroll-wrapper",[S("&::before",`
 top: 0;
 bottom: 0;
 left: 0;
 width: 20px;
 `),S("&::after",`
 top: 0;
 bottom: 0;
 right: 0;
 width: 20px;
 `),i("shadow-start",[S("&::before",`
 box-shadow: inset 10px 0 8px -8px rgba(0, 0, 0, .12);
 `)]),i("shadow-end",[S("&::after",`
 box-shadow: inset -10px 0 8px -8px rgba(0, 0, 0, .12);
 `)])])]),i("left, right",[r("tabs-nav-scroll-content",`
 flex-direction: column;
 `),r("tabs-nav-scroll-wrapper",[S("&::before",`
 top: 0;
 left: 0;
 right: 0;
 height: 20px;
 `),S("&::after",`
 bottom: 0;
 left: 0;
 right: 0;
 height: 20px;
 `),i("shadow-start",[S("&::before",`
 box-shadow: inset 0 10px 8px -8px rgba(0, 0, 0, .12);
 `)]),i("shadow-end",[S("&::after",`
 box-shadow: inset 0 -10px 8px -8px rgba(0, 0, 0, .12);
 `)])])]),r("tabs-nav-scroll-wrapper",`
 flex: 1;
 position: relative;
 overflow: hidden;
 `,[r("tabs-nav-y-scroll",`
 height: 100%;
 width: 100%;
 overflow-y: auto; 
 scrollbar-width: none;
 `,[S("&::-webkit-scrollbar",`
 width: 0;
 height: 0;
 `)]),S("&::before, &::after",`
 transition: box-shadow .3s var(--n-bezier);
 pointer-events: none;
 content: "";
 position: absolute;
 z-index: 1;
 `)]),r("tabs-nav-scroll-content",`
 display: flex;
 position: relative;
 min-width: 100%;
 min-height: 100%;
 width: fit-content;
 box-sizing: border-box;
 `),r("tabs-wrapper",`
 display: inline-flex;
 flex-wrap: nowrap;
 position: relative;
 `),r("tabs-tab-wrapper",`
 display: flex;
 flex-wrap: nowrap;
 flex-shrink: 0;
 flex-grow: 0;
 `),r("tabs-tab",`
 cursor: pointer;
 white-space: nowrap;
 flex-wrap: nowrap;
 display: inline-flex;
 align-items: center;
 color: var(--n-tab-text-color);
 font-size: var(--n-tab-font-size);
 background-clip: padding-box;
 padding: var(--n-tab-padding);
 transition:
 box-shadow .3s var(--n-bezier),
 color .3s var(--n-bezier),
 background-color .3s var(--n-bezier),
 border-color .3s var(--n-bezier);
 `,[i("disabled",{cursor:"not-allowed"}),E("close",`
 margin-left: 6px;
 transition:
 background-color .3s var(--n-bezier),
 color .3s var(--n-bezier);
 `),E("label",`
 display: flex;
 align-items: center;
 z-index: 1;
 `)]),r("tabs-bar",`
 position: absolute;
 bottom: 0;
 height: 2px;
 border-radius: 1px;
 background-color: var(--n-bar-color);
 transition:
 left .2s var(--n-bezier),
 max-width .2s var(--n-bezier),
 opacity .3s var(--n-bezier),
 background-color .3s var(--n-bezier);
 `,[S("&.transition-disabled",`
 transition: none;
 `),i("disabled",`
 background-color: var(--n-tab-text-color-disabled)
 `)]),r("tabs-pane-wrapper",`
 position: relative;
 overflow: hidden;
 transition: max-height .2s var(--n-bezier);
 `),r("tab-pane",`
 color: var(--n-pane-text-color);
 width: 100%;
 transition:
 color .3s var(--n-bezier),
 background-color .3s var(--n-bezier),
 opacity .2s var(--n-bezier);
 left: 0;
 right: 0;
 top: 0;
 `,[S("&.next-transition-leave-active, &.prev-transition-leave-active, &.next-transition-enter-active, &.prev-transition-enter-active",`
 transition:
 color .3s var(--n-bezier),
 background-color .3s var(--n-bezier),
 transform .2s var(--n-bezier),
 opacity .2s var(--n-bezier);
 `),S("&.next-transition-leave-active, &.prev-transition-leave-active",`
 position: absolute;
 `),S("&.next-transition-enter-from, &.prev-transition-leave-to",`
 transform: translateX(32px);
 opacity: 0;
 `),S("&.next-transition-leave-to, &.prev-transition-enter-from",`
 transform: translateX(-32px);
 opacity: 0;
 `),S("&.next-transition-leave-from, &.next-transition-enter-to, &.prev-transition-leave-from, &.prev-transition-enter-to",`
 transform: translateX(0);
 opacity: 1;
 `)]),r("tabs-tab-pad",`
 box-sizing: border-box;
 width: var(--n-tab-gap);
 flex-grow: 0;
 flex-shrink: 0;
 `),i("line-type, bar-type",[r("tabs-tab",`
 font-weight: var(--n-tab-font-weight);
 box-sizing: border-box;
 vertical-align: bottom;
 `,[S("&:hover",{color:"var(--n-tab-text-color-hover)"}),i("active",`
 color: var(--n-tab-text-color-active);
 font-weight: var(--n-tab-font-weight-active);
 `),i("disabled",{color:"var(--n-tab-text-color-disabled)"})])]),r("tabs-nav",[i("line-type",[i("top",[E("prefix, suffix",`
 border-bottom: 1px solid var(--n-tab-border-color);
 `),r("tabs-nav-scroll-content",`
 border-bottom: 1px solid var(--n-tab-border-color);
 `),r("tabs-bar",`
 bottom: -1px;
 `)]),i("left",[E("prefix, suffix",`
 border-right: 1px solid var(--n-tab-border-color);
 `),r("tabs-nav-scroll-content",`
 border-right: 1px solid var(--n-tab-border-color);
 `),r("tabs-bar",`
 right: -1px;
 `)]),i("right",[E("prefix, suffix",`
 border-left: 1px solid var(--n-tab-border-color);
 `),r("tabs-nav-scroll-content",`
 border-left: 1px solid var(--n-tab-border-color);
 `),r("tabs-bar",`
 left: -1px;
 `)]),i("bottom",[E("prefix, suffix",`
 border-top: 1px solid var(--n-tab-border-color);
 `),r("tabs-nav-scroll-content",`
 border-top: 1px solid var(--n-tab-border-color);
 `),r("tabs-bar",`
 top: -1px;
 `)]),E("prefix, suffix",`
 transition: border-color .3s var(--n-bezier);
 `),r("tabs-nav-scroll-content",`
 transition: border-color .3s var(--n-bezier);
 `),r("tabs-bar",`
 border-radius: 0;
 `)]),i("card-type",[E("prefix, suffix",`
 transition: border-color .3s var(--n-bezier);
 border-bottom: 1px solid var(--n-tab-border-color);
 `),r("tabs-pad",`
 flex-grow: 1;
 transition: border-color .3s var(--n-bezier);
 `),r("tabs-tab-pad",`
 transition: border-color .3s var(--n-bezier);
 `),r("tabs-tab",`
 font-weight: var(--n-tab-font-weight);
 border: 1px solid var(--n-tab-border-color);
 background-color: var(--n-tab-color);
 box-sizing: border-box;
 position: relative;
 vertical-align: bottom;
 display: flex;
 justify-content: space-between;
 font-size: var(--n-tab-font-size);
 color: var(--n-tab-text-color);
 `,[i("addable",`
 padding-left: 8px;
 padding-right: 8px;
 font-size: 16px;
 `,[E("height-placeholder",`
 width: 0;
 font-size: var(--n-tab-font-size);
 `),zt("disabled",[S("&:hover",`
 color: var(--n-tab-text-color-hover);
 `)])]),i("closable","padding-right: 8px;"),i("active",`
 background-color: #0000;
 font-weight: var(--n-tab-font-weight-active);
 color: var(--n-tab-text-color-active);
 `),i("disabled","color: var(--n-tab-text-color-disabled);")]),r("tabs-scroll-padding","border-bottom: 1px solid var(--n-tab-border-color);")]),i("left, right",[r("tabs-wrapper",`
 flex-direction: column;
 `,[r("tabs-tab-wrapper",`
 flex-direction: column;
 `,[r("tabs-tab-pad",`
 height: var(--n-tab-gap-vertical);
 width: 100%;
 `)])])]),i("top",[i("card-type",[r("tabs-tab",`
 border-top-left-radius: var(--n-tab-border-radius);
 border-top-right-radius: var(--n-tab-border-radius);
 `,[i("active",`
 border-bottom: 1px solid #0000;
 `)]),r("tabs-tab-pad",`
 border-bottom: 1px solid var(--n-tab-border-color);
 `),r("tabs-pad",`
 border-bottom: 1px solid var(--n-tab-border-color);
 `)])]),i("left",[i("card-type",[r("tabs-tab",`
 border-top-left-radius: var(--n-tab-border-radius);
 border-bottom-left-radius: var(--n-tab-border-radius);
 `,[i("active",`
 border-right: 1px solid #0000;
 `)]),r("tabs-tab-pad",`
 border-right: 1px solid var(--n-tab-border-color);
 `),r("tabs-pad",`
 border-right: 1px solid var(--n-tab-border-color);
 `)])]),i("right",[i("card-type",[r("tabs-tab",`
 border-top-right-radius: var(--n-tab-border-radius);
 border-bottom-right-radius: var(--n-tab-border-radius);
 `,[i("active",`
 border-left: 1px solid #0000;
 `)]),r("tabs-tab-pad",`
 border-left: 1px solid var(--n-tab-border-color);
 `),r("tabs-pad",`
 border-left: 1px solid var(--n-tab-border-color);
 `)])]),i("bottom",[i("card-type",[r("tabs-tab",`
 border-bottom-left-radius: var(--n-tab-border-radius);
 border-bottom-right-radius: var(--n-tab-border-radius);
 `,[i("active",`
 border-top: 1px solid #0000;
 `)]),r("tabs-tab-pad",`
 border-top: 1px solid var(--n-tab-border-color);
 `),r("tabs-pad",`
 border-top: 1px solid var(--n-tab-border-color);
 `)])])])]),oa=Object.assign(Object.assign({},Pe.props),{value:[String,Number],defaultValue:[String,Number],trigger:{type:String,default:"click"},type:{type:String,default:"bar"},closable:Boolean,justifyContent:String,size:{type:String,default:"medium"},placement:{type:String,default:"top"},tabStyle:[String,Object],tabClass:String,addTabStyle:[String,Object],addTabClass:String,barWidth:Number,paneClass:String,paneStyle:[String,Object],paneWrapperClass:String,paneWrapperStyle:[String,Object],addable:[Boolean,Object],tabsPadding:{type:Number,default:0},animated:Boolean,onBeforeLeave:Function,onAdd:Function,"onUpdate:value":[Function,Array],onUpdateValue:[Function,Array],onClose:[Function,Array],labelSize:String,activeName:[String,Number],onActiveNameChange:[Function,Array]}),da=Q({name:"Tabs",props:oa,setup(e,{slots:n}){var d,p,l,x;const{mergedClsPrefixRef:v,inlineThemeDisabled:f}=$t(e),m=Pe("Tabs","-tabs",na,Pt,e,v),h=A(null),g=A(null),W=A(null),L=A(null),y=A(null),T=A(null),C=A(!0),$=A(!0),P=ye(e,["labelSize","size"]),z=ye(e,["activeName","value"]),H=A((p=(d=z.value)!==null&&d!==void 0?d:e.defaultValue)!==null&&p!==void 0?p:n.default?(x=(l=re(n.default())[0])===null||l===void 0?void 0:l.props)===null||x===void 0?void 0:x.name:null),_=Wt(z,H),u={id:0},b=J(()=>{if(!(!e.justifyContent||e.type==="card"))return{display:"flex",justifyContent:e.justifyContent}});ne(_,()=>{u.id=0,V(),ue()});function R(){var a;const{value:t}=_;return t===null?null:(a=h.value)===null||a===void 0?void 0:a.querySelector(`[data-name="${t}"]`)}function F(a){if(e.type==="card")return;const{value:t}=g;if(!t)return;const o=t.style.opacity==="0";if(a){const s=`${v.value}-tabs-bar--disabled`,{barWidth:w,placement:I}=e;if(a.dataset.disabled==="true"?t.classList.add(s):t.classList.remove(s),["top","bottom"].includes(I)){if(fe(["top","maxHeight","height"]),typeof w=="number"&&a.offsetWidth>=w){const B=Math.floor((a.offsetWidth-w)/2)+a.offsetLeft;t.style.left=`${B}px`,t.style.maxWidth=`${w}px`}else t.style.left=`${a.offsetLeft}px`,t.style.maxWidth=`${a.offsetWidth}px`;t.style.width="8192px",o&&(t.style.transition="none"),t.offsetWidth,o&&(t.style.transition="",t.style.opacity="1")}else{if(fe(["left","maxWidth","width"]),typeof w=="number"&&a.offsetHeight>=w){const B=Math.floor((a.offsetHeight-w)/2)+a.offsetTop;t.style.top=`${B}px`,t.style.maxHeight=`${w}px`}else t.style.top=`${a.offsetTop}px`,t.style.maxHeight=`${a.offsetHeight}px`;t.style.height="8192px",o&&(t.style.transition="none"),t.offsetHeight,o&&(t.style.transition="",t.style.opacity="1")}}}function N(){if(e.type==="card")return;const{value:a}=g;a&&(a.style.opacity="0")}function fe(a){const{value:t}=g;if(t)for(const o of a)t.style[o]=""}function V(){if(e.type==="card")return;const a=R();a?F(a):N()}function ue(a){var t;const o=(t=y.value)===null||t===void 0?void 0:t.$el;if(!o)return;const s=R();if(!s)return;const{scrollLeft:w,offsetWidth:I}=o,{offsetLeft:B,offsetWidth:G}=s;w>B?o.scrollTo({top:0,left:B,behavior:"smooth"}):B+G>w+I&&o.scrollTo({top:0,left:B+G-I,behavior:"smooth"})}const X=A(null);let ee=0,O=null;function Le(a){const t=X.value;if(t){ee=a.getBoundingClientRect().height;const o=`${ee}px`,s=()=>{t.style.height=o,t.style.maxHeight=o};O?(s(),O(),O=null):O=s}}function _e(a){const t=X.value;if(t){const o=a.getBoundingClientRect().height,s=()=>{document.body.offsetHeight,t.style.maxHeight=`${o}px`,t.style.height=`${Math.max(ee,o)}px`};O?(O(),O=null,s()):O=s}}function Ae(){const a=X.value;if(a){a.style.maxHeight="",a.style.height="";const{paneWrapperStyle:t}=e;if(typeof t=="string")a.style.cssText=t;else if(t){const{maxHeight:o,height:s}=t;o!==void 0&&(a.style.maxHeight=o),s!==void 0&&(a.style.height=s)}}}const pe={value:[]},ve=A("next");function Ee(a){const t=_.value;let o="next";for(const s of pe.value){if(s===t)break;if(s===a){o="prev";break}}ve.value=o,Be(a)}function Be(a){const{onActiveNameChange:t,onUpdateValue:o,"onUpdate:value":s}=e;t&&q(t,a),o&&q(o,a),s&&q(s,a),H.value=a}function ke(a){const{onClose:t}=e;t&&q(t,a)}function he(){const{value:a}=g;if(!a)return;const t="transition-disabled";a.classList.add(t),V(),a.classList.remove(t)}const D=A(null);function te({transitionDisabled:a}){const t=h.value;if(!t)return;a&&t.classList.add("transition-disabled");const o=R();o&&D.value&&(D.value.style.width=`${o.offsetWidth}px`,D.value.style.height=`${o.offsetHeight}px`,D.value.style.transform=`translateX(${o.offsetLeft-t.offsetLeft-kt(getComputedStyle(t).paddingLeft)}px)`,a&&D.value.offsetWidth),a&&t.classList.remove("transition-disabled")}ne([_],()=>{e.type==="segment"&&ie(()=>{te({transitionDisabled:!1})})}),Lt(()=>{e.type==="segment"&&te({transitionDisabled:!0})});let ge=0;function je(a){var t;if(a.contentRect.width===0&&a.contentRect.height===0||ge===a.contentRect.width)return;ge=a.contentRect.width;const{type:o}=e;if((o==="line"||o==="bar")&&he(),o!=="segment"){const{placement:s}=e;ae((s==="top"||s==="bottom"?(t=y.value)===null||t===void 0?void 0:t.$el:T.value)||null)}}const Ie=le(je,64);ne([()=>e.justifyContent,()=>e.size],()=>{ie(()=>{const{type:a}=e;(a==="line"||a==="bar")&&he()})});const U=A(!1);function Oe(a){var t;const{target:o,contentRect:{width:s}}=a,w=o.parentElement.offsetWidth;if(!U.value)w<s&&(U.value=!0);else{const{value:I}=L;if(!I)return;w-s>I.$el.offsetWidth&&(U.value=!1)}ae(((t=y.value)===null||t===void 0?void 0:t.$el)||null)}const He=le(Oe,64);function Fe(){const{onAdd:a}=e;a&&a(),ie(()=>{const t=R(),{value:o}=y;!t||!o||o.scrollTo({left:t.offsetLeft,top:0,behavior:"smooth"})})}function ae(a){if(!a)return;const{placement:t}=e;if(t==="top"||t==="bottom"){const{scrollLeft:o,scrollWidth:s,offsetWidth:w}=a;C.value=o<=0,$.value=o+w>=s}else{const{scrollTop:o,scrollHeight:s,offsetHeight:w}=a;C.value=o<=0,$.value=o+w>=s}}const De=le(a=>{ae(a.target)},64);_t(be,{triggerRef:k(e,"trigger"),tabStyleRef:k(e,"tabStyle"),tabClassRef:k(e,"tabClass"),addTabStyleRef:k(e,"addTabStyle"),addTabClassRef:k(e,"addTabClass"),paneClassRef:k(e,"paneClass"),paneStyleRef:k(e,"paneStyle"),mergedClsPrefixRef:v,typeRef:k(e,"type"),closableRef:k(e,"closable"),valueRef:_,tabChangeIdRef:u,onBeforeLeaveRef:k(e,"onBeforeLeave"),activateTab:Ee,handleClose:ke,handleAdd:Fe}),At(()=>{V(),ue()}),Et(()=>{const{value:a}=W;if(!a)return;const{value:t}=v,o=`${t}-tabs-nav-scroll-wrapper--shadow-start`,s=`${t}-tabs-nav-scroll-wrapper--shadow-end`;C.value?a.classList.remove(o):a.classList.add(o),$.value?a.classList.remove(s):a.classList.add(s)});const Me={syncBarPosition:()=>{V()}},Ne=()=>{te({transitionDisabled:!0})},me=J(()=>{const{value:a}=P,{type:t}=e,o={card:"Card",bar:"Bar",line:"Line",segment:"Segment"}[t],s=`${a}${o}`,{self:{barColor:w,closeIconColor:I,closeIconColorHover:B,closeIconColorPressed:G,tabColor:Ve,tabBorderColor:Xe,paneTextColor:Ue,tabFontWeight:Ge,tabBorderRadius:Ye,tabFontWeightActive:Ke,colorSegment:qe,fontWeightStrong:Je,tabColorSegment:Ze,closeSize:Qe,closeIconSize:et,closeColorHover:tt,closeColorPressed:at,closeBorderRadius:rt,[j("panePadding",a)]:Y,[j("tabPadding",s)]:nt,[j("tabPaddingVertical",s)]:ot,[j("tabGap",s)]:it,[j("tabGap",`${s}Vertical`)]:st,[j("tabTextColor",t)]:lt,[j("tabTextColorActive",t)]:dt,[j("tabTextColorHover",t)]:ct,[j("tabTextColorDisabled",t)]:bt,[j("tabFontSize",a)]:ft},common:{cubicBezierEaseInOut:ut}}=m.value;return{"--n-bezier":ut,"--n-color-segment":qe,"--n-bar-color":w,"--n-tab-font-size":ft,"--n-tab-text-color":lt,"--n-tab-text-color-active":dt,"--n-tab-text-color-disabled":bt,"--n-tab-text-color-hover":ct,"--n-pane-text-color":Ue,"--n-tab-border-color":Xe,"--n-tab-border-radius":Ye,"--n-close-size":Qe,"--n-close-icon-size":et,"--n-close-color-hover":tt,"--n-close-color-pressed":at,"--n-close-border-radius":rt,"--n-close-icon-color":I,"--n-close-icon-color-hover":B,"--n-close-icon-color-pressed":G,"--n-tab-color":Ve,"--n-tab-font-weight":Ge,"--n-tab-font-weight-active":Ke,"--n-tab-padding":nt,"--n-tab-padding-vertical":ot,"--n-tab-gap":it,"--n-tab-gap-vertical":st,"--n-pane-padding-left":K(Y,"left"),"--n-pane-padding-right":K(Y,"right"),"--n-pane-padding-top":K(Y,"top"),"--n-pane-padding-bottom":K(Y,"bottom"),"--n-font-weight-strong":Je,"--n-tab-color-segment":Ze}}),M=f?Bt("tabs",J(()=>`${P.value[0]}${e.type[0]}`),me,e):void 0;return Object.assign({mergedClsPrefix:v,mergedValue:_,renderedNames:new Set,segmentCapsuleElRef:D,tabsPaneWrapperRef:X,tabsElRef:h,barElRef:g,addTabInstRef:L,xScrollInstRef:y,scrollWrapperElRef:W,addTabFixed:U,tabWrapperStyle:b,handleNavResize:Ie,mergedSize:P,handleScroll:De,handleTabsResize:He,cssVars:f?void 0:me,themeClass:M==null?void 0:M.themeClass,animationDirection:ve,renderNameListRef:pe,yScrollElRef:T,handleSegmentResize:Ne,onAnimationBeforeLeave:Le,onAnimationEnter:_e,onAnimationAfterEnter:Ae,onRender:M==null?void 0:M.onRender},Me)},render(){const{mergedClsPrefix:e,type:n,placement:d,addTabFixed:p,addable:l,mergedSize:x,renderNameListRef:v,onRender:f,paneWrapperClass:m,paneWrapperStyle:h,$slots:{default:g,prefix:W,suffix:L}}=this;f==null||f();const y=g?re(g()).filter(u=>u.type.__TAB_PANE__===!0):[],T=g?re(g()).filter(u=>u.type.__TAB__===!0):[],C=!T.length,$=n==="card",P=n==="segment",z=!$&&!P&&this.justifyContent;v.value=[];const H=()=>{const u=c("div",{style:this.tabWrapperStyle,class:[`${e}-tabs-wrapper`]},z?null:c("div",{class:`${e}-tabs-scroll-padding`,style:{width:`${this.tabsPadding}px`}}),C?y.map((b,R)=>(v.value.push(b.props.name),de(c(ce,Object.assign({},b.props,{internalCreatedByPane:!0,internalLeftPadded:R!==0&&(!z||z==="center"||z==="start"||z==="end")}),b.children?{default:b.children.tab}:void 0)))):T.map((b,R)=>(v.value.push(b.props.name),de(R!==0&&!z?ze(b):b))),!p&&l&&$?Te(l,(C?y.length:T.length)!==0):null,z?null:c("div",{class:`${e}-tabs-scroll-padding`,style:{width:`${this.tabsPadding}px`}}));return c("div",{ref:"tabsElRef",class:`${e}-tabs-nav-scroll-content`},$&&l?c(oe,{onResize:this.handleTabsResize},{default:()=>u}):u,$?c("div",{class:`${e}-tabs-pad`}):null,$?null:c("div",{ref:"barElRef",class:`${e}-tabs-bar`}))},_=P?"top":d;return c("div",{class:[`${e}-tabs`,this.themeClass,`${e}-tabs--${n}-type`,`${e}-tabs--${x}-size`,z&&`${e}-tabs--flex`,`${e}-tabs--${_}`],style:this.cssVars},c("div",{class:[`${e}-tabs-nav--${n}-type`,`${e}-tabs-nav--${_}`,`${e}-tabs-nav`]},we(W,u=>u&&c("div",{class:`${e}-tabs-nav__prefix`},u)),P?c(oe,{onResize:this.handleSegmentResize},{default:()=>c("div",{class:`${e}-tabs-rail`,ref:"tabsElRef"},c("div",{class:`${e}-tabs-capsule`,ref:"segmentCapsuleElRef"},c("div",{class:`${e}-tabs-wrapper`},c("div",{class:`${e}-tabs-tab`}))),C?y.map((u,b)=>(v.value.push(u.props.name),c(ce,Object.assign({},u.props,{internalCreatedByPane:!0,internalLeftPadded:b!==0}),u.children?{default:u.children.tab}:void 0))):T.map((u,b)=>(v.value.push(u.props.name),b===0?u:ze(u))))}):c(oe,{onResize:this.handleNavResize},{default:()=>c("div",{class:`${e}-tabs-nav-scroll-wrapper`,ref:"scrollWrapperElRef"},["top","bottom"].includes(_)?c(Mt,{ref:"xScrollInstRef",onScroll:this.handleScroll},{default:H}):c("div",{class:`${e}-tabs-nav-y-scroll`,onScroll:this.handleScroll,ref:"yScrollElRef"},H()))}),p&&l&&$?Te(l,!0):null,we(L,u=>u&&c("div",{class:`${e}-tabs-nav__suffix`},u))),C&&(this.animated&&(_==="top"||_==="bottom")?c("div",{ref:"tabsPaneWrapperRef",style:h,class:[`${e}-tabs-pane-wrapper`,m]},Re(y,this.mergedValue,this.renderedNames,this.onAnimationBeforeLeave,this.onAnimationEnter,this.onAnimationAfterEnter,this.animationDirection)):Re(y,this.mergedValue,this.renderedNames)))}});function Re(e,n,d,p,l,x,v){const f=[];return e.forEach(m=>{const{name:h,displayDirective:g,"display-directive":W}=m.props,L=T=>g===T||W===T,y=n===h;if(m.key!==void 0&&(m.key=h),y||L("show")||L("show:lazy")&&d.has(h)){d.has(h)||d.add(h);const T=!L("if");f.push(T?jt(m,[[It,y]]):m)}}),v?c(Ot,{name:`${v}-transition`,onBeforeLeave:p,onEnter:l,onAfterEnter:x},{default:()=>f}):f}function Te(e,n){return c(ce,{ref:"addTabInstRef",key:"__addable",name:"__addable",internalCreatedByPane:!0,internalAddable:!0,internalLeftPadded:n,disabled:typeof e=="object"&&e.disabled})}function ze(e){const n=Ht(e);return n.props?n.props.internalLeftPadded=!0:n.props={internalLeftPadded:!0},n}function de(e){return Array.isArray(e.dynamicProps)?e.dynamicProps.includes("internalLeftPadded")||e.dynamicProps.push("internalLeftPadded"):e.dynamicProps=["internalLeftPadded"],e}export{la as N,da as a,Ce as t};
