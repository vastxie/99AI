import{o as dt,c as ne,a,b as C,d as pe,f as Pe,i as ct,e as ut,g as Re,u as ht,h as Ae,r as m,j as vt,k as _,t as ft,l as mt,w as _e,m as pt,n as Ee,p as gt,q as Be,s as y,V as bt,v as wt,x as xt,y as yt,T as je,z as kt,A as ge,B as be,C as we,D as ke,E as P,F as Q,G as h,H as _t,I as Rt,J as $t,K as Ct,L as Ue,M as zt,N as xe,O as Mt,P as St,Q as j,R as A,S as Dt,U as De,W as Te,X as I,_ as Ie,Y as Ve,Z as ye,$ as Tt,a0 as It,a1 as Vt}from"./index-d574bfe0.js";import{c as Bt}from"./index-c94da121.js";function Fe(n){return window.TouchEvent&&n instanceof window.TouchEvent}function Ne(){const n=new Map,l=b=>d=>{n.set(b,d)};return dt(()=>{n.clear()}),[n,l]}const Lt=ne([a("slider",`
 display: block;
 padding: calc((var(--n-handle-size) - var(--n-rail-height)) / 2) 0;
 position: relative;
 z-index: 0;
 width: 100%;
 cursor: pointer;
 user-select: none;
 -webkit-user-select: none;
 `,[C("reverse",[a("slider-handles",[a("slider-handle-wrapper",`
 transform: translate(50%, -50%);
 `)]),a("slider-dots",[a("slider-dot",`
 transform: translateX(50%, -50%);
 `)]),C("vertical",[a("slider-handles",[a("slider-handle-wrapper",`
 transform: translate(-50%, -50%);
 `)]),a("slider-marks",[a("slider-mark",`
 transform: translateY(calc(-50% + var(--n-dot-height) / 2));
 `)]),a("slider-dots",[a("slider-dot",`
 transform: translateX(-50%) translateY(0);
 `)])])]),C("vertical",`
 padding: 0 calc((var(--n-handle-size) - var(--n-rail-height)) / 2);
 width: var(--n-rail-width-vertical);
 height: 100%;
 `,[a("slider-handles",`
 top: calc(var(--n-handle-size) / 2);
 right: 0;
 bottom: calc(var(--n-handle-size) / 2);
 left: 0;
 `,[a("slider-handle-wrapper",`
 top: unset;
 left: 50%;
 transform: translate(-50%, 50%);
 `)]),a("slider-rail",`
 height: 100%;
 `,[pe("fill",`
 top: unset;
 right: 0;
 bottom: unset;
 left: 0;
 `)]),C("with-mark",`
 width: var(--n-rail-width-vertical);
 margin: 0 32px 0 8px;
 `),a("slider-marks",`
 top: calc(var(--n-handle-size) / 2);
 right: unset;
 bottom: calc(var(--n-handle-size) / 2);
 left: 22px;
 font-size: var(--n-mark-font-size);
 `,[a("slider-mark",`
 transform: translateY(50%);
 white-space: nowrap;
 `)]),a("slider-dots",`
 top: calc(var(--n-handle-size) / 2);
 right: unset;
 bottom: calc(var(--n-handle-size) / 2);
 left: 50%;
 `,[a("slider-dot",`
 transform: translateX(-50%) translateY(50%);
 `)])]),C("disabled",`
 cursor: not-allowed;
 opacity: var(--n-opacity-disabled);
 `,[a("slider-handle",`
 cursor: not-allowed;
 `)]),C("with-mark",`
 width: 100%;
 margin: 8px 0 32px 0;
 `),ne("&:hover",[a("slider-rail",{backgroundColor:"var(--n-rail-color-hover)"},[pe("fill",{backgroundColor:"var(--n-fill-color-hover)"})]),a("slider-handle",{boxShadow:"var(--n-handle-box-shadow-hover)"})]),C("active",[a("slider-rail",{backgroundColor:"var(--n-rail-color-hover)"},[pe("fill",{backgroundColor:"var(--n-fill-color-hover)"})]),a("slider-handle",{boxShadow:"var(--n-handle-box-shadow-hover)"})]),a("slider-marks",`
 position: absolute;
 top: 18px;
 left: calc(var(--n-handle-size) / 2);
 right: calc(var(--n-handle-size) / 2);
 `,[a("slider-mark",`
 position: absolute;
 transform: translateX(-50%);
 white-space: nowrap;
 `)]),a("slider-rail",`
 width: 100%;
 position: relative;
 height: var(--n-rail-height);
 background-color: var(--n-rail-color);
 transition: background-color .3s var(--n-bezier);
 border-radius: calc(var(--n-rail-height) / 2);
 `,[pe("fill",`
 position: absolute;
 top: 0;
 bottom: 0;
 border-radius: calc(var(--n-rail-height) / 2);
 transition: background-color .3s var(--n-bezier);
 background-color: var(--n-fill-color);
 `)]),a("slider-handles",`
 position: absolute;
 top: 0;
 right: calc(var(--n-handle-size) / 2);
 bottom: 0;
 left: calc(var(--n-handle-size) / 2);
 `,[a("slider-handle-wrapper",`
 outline: none;
 position: absolute;
 top: 50%;
 transform: translate(-50%, -50%);
 cursor: pointer;
 display: flex;
 `,[a("slider-handle",`
 height: var(--n-handle-size);
 width: var(--n-handle-size);
 border-radius: 50%;
 overflow: hidden;
 transition: box-shadow .2s var(--n-bezier), background-color .3s var(--n-bezier);
 background-color: var(--n-handle-color);
 box-shadow: var(--n-handle-box-shadow);
 `,[ne("&:hover",`
 box-shadow: var(--n-handle-box-shadow-hover);
 `)]),ne("&:focus",[a("slider-handle",`
 box-shadow: var(--n-handle-box-shadow-focus);
 `,[ne("&:hover",`
 box-shadow: var(--n-handle-box-shadow-active);
 `)])])])]),a("slider-dots",`
 position: absolute;
 top: 50%;
 left: calc(var(--n-handle-size) / 2);
 right: calc(var(--n-handle-size) / 2);
 `,[C("transition-disabled",[a("slider-dot","transition: none;")]),a("slider-dot",`
 transition:
 border-color .3s var(--n-bezier),
 box-shadow .3s var(--n-bezier),
 background-color .3s var(--n-bezier);
 position: absolute;
 transform: translate(-50%, -50%);
 height: var(--n-dot-height);
 width: var(--n-dot-width);
 border-radius: var(--n-dot-border-radius);
 overflow: hidden;
 box-sizing: border-box;
 border: var(--n-dot-border);
 background-color: var(--n-dot-color);
 `,[C("active","border: var(--n-dot-border-active);")])])]),a("slider-handle-indicator",`
 font-size: var(--n-font-size);
 padding: 6px 10px;
 border-radius: var(--n-indicator-border-radius);
 color: var(--n-indicator-text-color);
 background-color: var(--n-indicator-color);
 box-shadow: var(--n-indicator-box-shadow);
 `,[Pe()]),a("slider-handle-indicator",`
 font-size: var(--n-font-size);
 padding: 6px 10px;
 border-radius: var(--n-indicator-border-radius);
 color: var(--n-indicator-text-color);
 background-color: var(--n-indicator-color);
 box-shadow: var(--n-indicator-box-shadow);
 `,[C("top",`
 margin-bottom: 12px;
 `),C("right",`
 margin-left: 12px;
 `),C("bottom",`
 margin-top: 12px;
 `),C("left",`
 margin-right: 12px;
 `),Pe()]),ct(a("slider",[a("slider-dot","background-color: var(--n-dot-color-modal);")])),ut(a("slider",[a("slider-dot","background-color: var(--n-dot-color-popover);")]))]),Ht=0,Pt=Object.assign(Object.assign({},Ae.props),{to:Be.propTo,defaultValue:{type:[Number,Array],default:0},marks:Object,disabled:{type:Boolean,default:void 0},formatTooltip:Function,keyboard:{type:Boolean,default:!0},min:{type:Number,default:0},max:{type:Number,default:100},step:{type:[Number,String],default:1},range:Boolean,value:[Number,Array],placement:String,showTooltip:{type:Boolean,default:void 0},tooltip:{type:Boolean,default:!0},vertical:Boolean,reverse:Boolean,"onUpdate:value":[Function,Array],onUpdateValue:[Function,Array],onDragstart:[Function],onDragend:[Function]}),Et=Re({name:"Slider",props:Pt,setup(n){const{mergedClsPrefixRef:l,namespaceRef:b,inlineThemeDisabled:d}=ht(n),v=Ae("Slider","-slider",Lt,kt,n,l),f=m(null),[V,M]=Ne(),[W,S]=Ne(),D=m(new Set),E=vt(n),{mergedDisabledRef:k}=E,z=_(()=>{const{step:e}=n;if(Number(e)<=0||e==="mark")return 0;const t=e.toString();let o=0;return t.includes(".")&&(o=t.length-t.indexOf(".")-1),o}),B=m(n.defaultValue),ae=ft(n,"value"),Z=mt(ae,B),R=_(()=>{const{value:e}=Z;return(n.range?e:[e]).map(ce)}),re=_(()=>R.value.length>2),$e=_(()=>n.placement===void 0?n.vertical?"right":"top":n.placement),se=_(()=>{const{marks:e}=n;return e?Object.keys(e).map(parseFloat):null}),$=m(-1),le=m(-1),L=m(-1),H=m(!1),O=m(!1),ee=_(()=>{const{vertical:e,reverse:t}=n;return e?t?"top":"bottom":t?"right":"left"}),ie=_(()=>{if(re.value)return;const e=R.value,t=Y(n.range?Math.min(...e):n.min),o=Y(n.range?Math.max(...e):e[0]),{value:s}=ee;return n.vertical?{[s]:`${t}%`,height:`${o-t}%`}:{[s]:`${t}%`,width:`${o-t}%`}}),K=_(()=>{const e=[],{marks:t}=n;if(t){const o=R.value.slice();o.sort((w,x)=>w-x);const{value:s}=ee,{value:u}=re,{range:p}=n,T=u?()=>!1:w=>p?w>=o[0]&&w<=o[o.length-1]:w<=o[0];for(const w of Object.keys(t)){const x=Number(w);e.push({active:T(x),label:t[w],style:{[s]:`${Y(x)}%`}})}}return e});function de(e,t){const o=Y(e),{value:s}=ee;return{[s]:`${o}%`,zIndex:t===$.value?1:0}}function r(e){return n.showTooltip||L.value===e||$.value===e&&H.value}function c(e){return H.value?!($.value===e&&le.value===e):!0}function i(e){var t;~e&&($.value=e,(t=V.get(e))===null||t===void 0||t.focus())}function F(){W.forEach((e,t)=>{r(t)&&e.syncPosition()})}function g(e){const{"onUpdate:value":t,onUpdateValue:o}=n,{nTriggerFormInput:s,nTriggerFormChange:u}=E;o&&ge(o,e),t&&ge(t,e),B.value=e,s(),u()}function Ce(e){const{range:t}=n;if(t){if(Array.isArray(e)){const{value:o}=R;e.join()!==o.join()&&g(e)}}else Array.isArray(e)||R.value[0]!==e&&g(e)}function X(e,t){if(n.range){const o=R.value.slice();o.splice(t,1,e),Ce(o)}else Ce(e)}function te(e,t,o){const s=o!==void 0;o||(o=e-t>0?1:-1);const u=se.value||[],{step:p}=n;if(p==="mark"){const x=U(e,u.concat(t),s?o:void 0);return x?x.value:t}if(p<=0)return t;const{value:T}=z;let w;if(s){const x=Number((t/p).toFixed(T)),N=Math.floor(x),Me=x>N?N:N-1,Se=x<N?N:N+1;w=U(t,[Number((Me*p).toFixed(T)),Number((Se*p).toFixed(T)),...u],o)}else{const x=q(e);w=U(e,[...u,x])}return w?ce(w.value):t}function ce(e){return Math.min(n.max,Math.max(n.min,e))}function Y(e){const{max:t,min:o}=n;return(e-o)/(t-o)*100}function ue(e){const{max:t,min:o}=n;return o+(t-o)*e}function q(e){const{step:t,min:o}=n;if(Number(t)<=0||t==="mark")return e;const s=Math.round((e-o)/t)*t+o;return Number(s.toFixed(z.value))}function U(e,t=se.value,o){if(!(t!=null&&t.length))return null;let s=null,u=-1;for(;++u<t.length;){const p=t[u]-e,T=Math.abs(p);(o===void 0||p*o>0)&&(s===null||T<s.distance)&&(s={index:u,distance:T,value:t[u]})}return s}function oe(e){const t=f.value;if(!t)return;const o=Fe(e)?e.touches[0]:e,s=t.getBoundingClientRect();let u;return n.vertical?u=(s.bottom-o.clientY)/s.height:u=(o.clientX-s.left)/s.width,n.reverse&&(u=1-u),ue(u)}function ze(e){if(k.value||!n.keyboard)return;const{vertical:t,reverse:o}=n;switch(e.key){case"ArrowUp":e.preventDefault(),he(t&&o?-1:1);break;case"ArrowRight":e.preventDefault(),he(!t&&o?-1:1);break;case"ArrowDown":e.preventDefault(),he(t&&o?1:-1);break;case"ArrowLeft":e.preventDefault(),he(!t&&o?1:-1);break}}function he(e){const t=$.value;if(t===-1)return;const{step:o}=n,s=R.value[t],u=Number(o)<=0||o==="mark"?s:s+o*e;X(te(u,s,e>0?1:-1),t)}function We(e){var t,o;if(k.value||!Fe(e)&&e.button!==Ht)return;const s=oe(e);if(s===void 0)return;const u=R.value.slice(),p=n.range?(o=(t=U(s,u))===null||t===void 0?void 0:t.index)!==null&&o!==void 0?o:-1:0;p!==-1&&(e.preventDefault(),i(p),Oe(),X(te(s,R.value[p]),p))}function Oe(){H.value||(H.value=!0,n.onDragstart&&ge(n.onDragstart),be("touchend",document,me),be("mouseup",document,me),be("touchmove",document,fe),be("mousemove",document,fe))}function ve(){H.value&&(H.value=!1,n.onDragend&&ge(n.onDragend),we("touchend",document,me),we("mouseup",document,me),we("touchmove",document,fe),we("mousemove",document,fe))}function fe(e){const{value:t}=$;if(!H.value||t===-1){ve();return}const o=oe(e);o!==void 0&&X(te(o,R.value[t]),t)}function me(){ve()}function Ke(e){$.value=e,k.value||(L.value=e)}function Xe(e){$.value===e&&($.value=-1,ve()),L.value===e&&(L.value=-1)}function Ye(e){L.value=e}function qe(e){L.value===e&&(L.value=-1)}_e($,(e,t)=>void ke(()=>le.value=t)),_e(Z,()=>{if(n.marks){if(O.value)return;O.value=!0,ke(()=>{O.value=!1})}ke(F)}),pt(()=>{ve()});const Le=_(()=>{const{self:{markFontSize:e,railColor:t,railColorHover:o,fillColor:s,fillColorHover:u,handleColor:p,opacityDisabled:T,dotColor:w,dotColorModal:x,handleBoxShadow:N,handleBoxShadowHover:Me,handleBoxShadowActive:Se,handleBoxShadowFocus:Ge,dotBorder:Je,dotBoxShadow:Qe,railHeight:Ze,railWidthVertical:et,handleSize:tt,dotHeight:ot,dotWidth:nt,dotBorderRadius:at,fontSize:rt,dotBorderActive:st,dotColorPopover:lt},common:{cubicBezierEaseInOut:it}}=v.value;return{"--n-bezier":it,"--n-dot-border":Je,"--n-dot-border-active":st,"--n-dot-border-radius":at,"--n-dot-box-shadow":Qe,"--n-dot-color":w,"--n-dot-color-modal":x,"--n-dot-color-popover":lt,"--n-dot-height":ot,"--n-dot-width":nt,"--n-fill-color":s,"--n-fill-color-hover":u,"--n-font-size":rt,"--n-handle-box-shadow":N,"--n-handle-box-shadow-active":Se,"--n-handle-box-shadow-focus":Ge,"--n-handle-box-shadow-hover":Me,"--n-handle-color":p,"--n-handle-size":tt,"--n-opacity-disabled":T,"--n-rail-color":t,"--n-rail-color-hover":o,"--n-rail-height":Ze,"--n-rail-width-vertical":et,"--n-mark-font-size":e}}),G=d?Ee("slider",void 0,Le,n):void 0,He=_(()=>{const{self:{fontSize:e,indicatorColor:t,indicatorBoxShadow:o,indicatorTextColor:s,indicatorBorderRadius:u}}=v.value;return{"--n-font-size":e,"--n-indicator-border-radius":u,"--n-indicator-box-shadow":o,"--n-indicator-color":t,"--n-indicator-text-color":s}}),J=d?Ee("slider-indicator",void 0,He,n):void 0;return{mergedClsPrefix:l,namespace:b,uncontrolledValue:B,mergedValue:Z,mergedDisabled:k,mergedPlacement:$e,isMounted:gt(),adjustedTo:Be(n),dotTransitionDisabled:O,markInfos:K,isShowTooltip:r,shouldKeepTooltipTransition:c,handleRailRef:f,setHandleRefs:M,setFollowerRefs:S,fillStyle:ie,getHandleStyle:de,activeIndex:$,arrifiedValues:R,followerEnabledIndexSet:D,handleRailMouseDown:We,handleHandleFocus:Ke,handleHandleBlur:Xe,handleHandleMouseEnter:Ye,handleHandleMouseLeave:qe,handleRailKeyDown:ze,indicatorCssVars:d?void 0:He,indicatorThemeClass:J==null?void 0:J.themeClass,indicatorOnRender:J==null?void 0:J.onRender,cssVars:d?void 0:Le,themeClass:G==null?void 0:G.themeClass,onRender:G==null?void 0:G.onRender}},render(){var n;const{mergedClsPrefix:l,themeClass:b,formatTooltip:d}=this;return(n=this.onRender)===null||n===void 0||n.call(this),y("div",{class:[`${l}-slider`,b,{[`${l}-slider--disabled`]:this.mergedDisabled,[`${l}-slider--active`]:this.activeIndex!==-1,[`${l}-slider--with-mark`]:this.marks,[`${l}-slider--vertical`]:this.vertical,[`${l}-slider--reverse`]:this.reverse}],style:this.cssVars,onKeydown:this.handleRailKeyDown,onMousedown:this.handleRailMouseDown,onTouchstart:this.handleRailMouseDown},y("div",{class:`${l}-slider-rail`},y("div",{class:`${l}-slider-rail__fill`,style:this.fillStyle}),this.marks?y("div",{class:[`${l}-slider-dots`,this.dotTransitionDisabled&&`${l}-slider-dots--transition-disabled`]},this.markInfos.map(v=>y("div",{key:v.label,class:[`${l}-slider-dot`,{[`${l}-slider-dot--active`]:v.active}],style:v.style}))):null,y("div",{ref:"handleRailRef",class:`${l}-slider-handles`},this.arrifiedValues.map((v,f)=>{const V=this.isShowTooltip(f);return y(bt,null,{default:()=>[y(wt,null,{default:()=>y("div",{ref:this.setHandleRefs(f),class:`${l}-slider-handle-wrapper`,tabindex:this.mergedDisabled?-1:0,style:this.getHandleStyle(v,f),onFocus:()=>{this.handleHandleFocus(f)},onBlur:()=>{this.handleHandleBlur(f)},onMouseenter:()=>{this.handleHandleMouseEnter(f)},onMouseleave:()=>{this.handleHandleMouseLeave(f)}},xt(this.$slots.thumb,()=>[y("div",{class:`${l}-slider-handle`})]))}),this.tooltip&&y(yt,{ref:this.setFollowerRefs(f),show:V,to:this.adjustedTo,enabled:this.showTooltip&&!this.range||this.followerEnabledIndexSet.has(f),teleportDisabled:this.adjustedTo===Be.tdkey,placement:this.mergedPlacement,containerClass:this.namespace},{default:()=>y(je,{name:"fade-in-scale-up-transition",appear:this.isMounted,css:this.shouldKeepTooltipTransition(f),onEnter:()=>{this.followerEnabledIndexSet.add(f)},onAfterLeave:()=>{this.followerEnabledIndexSet.delete(f)}},{default:()=>{var M;return V?((M=this.indicatorOnRender)===null||M===void 0||M.call(this),y("div",{class:[`${l}-slider-handle-indicator`,this.indicatorThemeClass,`${l}-slider-handle-indicator--${this.mergedPlacement}`],style:this.indicatorCssVars},typeof d=="function"?d(v):v)):null}})})]})})),this.marks?y("div",{class:`${l}-slider-marks`},this.markInfos.map(v=>y("div",{key:v.label,class:`${l}-slider-mark`,style:v.style},v.label))):null))}}),Ft={xmlns:"http://www.w3.org/2000/svg","xmlns:xlink":"http://www.w3.org/1999/xlink",viewBox:"0 0 512 512"},Nt=h("path",{d:"M315.27 33L96 304h128l-31.51 173.23a2.36 2.36 0 0 0 2.33 2.77h0a2.36 2.36 0 0 0 1.89-.95L416 208H288l31.66-173.25a2.45 2.45 0 0 0-2.44-2.75h0a2.42 2.42 0 0 0-1.95 1z",fill:"none",stroke:"currentColor","stroke-linecap":"round","stroke-linejoin":"round","stroke-width":"32"},null,-1),At=[Nt],jt=Re({name:"FlashOutline",render:function(l,b){return P(),Q("svg",Ft,At)}});function Ut(n,l){let b,d;return function(...f){d=f,b||(b=setTimeout(()=>{n.apply(this,d),b=null},l))}}const Wt={class:"min-h-full overflow-hidden flex flex-col"},Ot={class:"flex-1 min-h-full p-4 relative"},Kt=["id"],Xt=["id","src","onLoad","onError","onClick"],Yt={class:"menu p-2 text-[#cbd5e1]"},qt={class:"prompt"},Gt={class:"flex justify-end items-end space-x-2"},Jt=["onClick"],Qt={class:"text-sm dark:text-slate-400"},Zt=h("span",null,"画同款",-1),eo=["onClick"],to={class:"text-sm dark:text-slate-400"},oo=h("span",null,"使用当前画同款",-1),no=["onClick"],ao={class:"text-sm dark:text-slate-400"},ro=h("span",null,"复制提示词",-1),so=h("div",{id:"footer",class:"w-full absolute bottom-[350px]"},null,-1),lo=Re({__name:"index",props:{dataList:{},scaleWidth:{},isDrawLike:{type:Boolean},usePropmpt:{type:Boolean},copyPropmpt:{type:Boolean},gap:{default:5}},emits:["loadMore","usePropmptDraw"],setup(n,{emit:l}){var de;const b=_t(),d=n,v=l,f=(de=Rt())==null?void 0:de.appContext.config.globalProperties.$viewerApi,V=$t(),M=m({}),W=m(0),S=m(160),D=m(0),E=m([]),k=m(null),z=m(0),B=_(()=>b.isLogin),ae=_(()=>d.scaleWidth?Number(d.scaleWidth)*2+d.gap+150:150),Z=Ct();function R(){$e(),se();const r=D.value,c=S.value,i=[];d.dataList.forEach((F,g)=>{const X=F.drawRatio.split("x"),te=parseInt(X[0],10),ce=parseInt(X[1],10),Y=c/te,ue=ce*Y+d.gap+W.value,q=M.value[F.id];if(i.length<r)q.style.top="0px",q.style.left=`${(c+d.gap)*g}px`,i.push(ue);else{const U=Math.min.apply(null,i),oe=i.findIndex(ze=>ze===U);q.style.top=`${U+0}px`,q.style.left=`${oe*(S.value+d.gap)}px`,i[oe]+=ue}}),z.value=Math.max(...i)+100}function re(r,c){r&&c&&(M.value[c.id]=r)}function $e(){const{showName:r=0,showOther:c=0}={};W.value=[r,c].filter(i=>i).length*15}_e(()=>d.scaleWidth,r=>{K()}),_e(()=>d.dataList,r=>{r&&ke(()=>{K()})},{immediate:!0});function se(){if(!k.value)return;const r=k.value.clientWidth;D.value=Math.floor(r/ae.value);const c=r-D.value*ae.value,i=(D.value-1)*d.gap;c-i<0&&(D.value-=1),S.value=Math.floor((r-i)/D.value)}function $(r,c){E.value.push(c.id)}function le(r,c){E.value.push(c.id)}function L(r){if(!B.value)return b.setLoginDialog(!0);const{prompt:c}=r;Bt({text:c}),V.success("复制prompt成功")}function H(r){Z.push(`/midjourney?mjId=${r.id}`)}function O(r){const{fullPrompt:c}=r;v("usePropmptDraw",c)}function ee(r){console.log("handlePreview called with item:",r);const{drawUrl:c}=r;console.log("Image URL:",c),f({options:{},images:[c]})}const ie=_(()=>r=>{const c=r.drawRatio.split("x"),i=Number(c[0]);return Number(c[1])/(i/S.value)}),K=Ut(function(){R()},200);return Ue(async()=>{window.addEventListener("resize",K);const r=document.getElementById("footer");new IntersectionObserver((i,F)=>{i.forEach(g=>{g.isIntersecting&&v("loadMore")})}).observe(r)}),zt(()=>{window.removeEventListener("resize",K)}),(r,c)=>(P(),Q("div",Wt,[h("div",Ot,[h("div",{id:"wapper",ref_key:"wapperRef",ref:k,class:"wapper",style:xe({height:`${z.value}px`})},[(P(!0),Q(Mt,null,St(r.dataList,(i,F)=>(P(),Q("div",{id:i.id.toString(),key:F,ref_for:!0,ref:g=>re(g,i),class:"wapper-item",style:xe({width:`${S.value}px`})},[j(je,{name:"img",css:!0},{default:A(()=>[h("img",{id:i.id.toString(),class:"item-file rounded-sm",style:xe({width:`${S.value}px`,height:`${ie.value(i)}px`}),src:i.drawUrl,loading:"lazy",onLoad:g=>$(g,i),onError:g=>le(g,i),onClick:g=>ee(i)},null,44,Xt)]),_:2},1024),h("div",Yt,[h("div",qt,Dt(i.fullPrompt),1),h("div",Gt,[r.isDrawLike?(P(),De(I(Ve),{key:0,trigger:"hover"},{trigger:A(()=>[h("button",{class:"flex h-5 w-8 items-center justify-center rounded border transition hover:bg-[#666161] dark:border-neutral-700 dark:hover:bg-[#33373c]",onClick:Te(g=>H(i),["stop"])},[h("span",Qt,[j(I(Ie),{icon:"fluent:draw-image-24-regular",class:"text-sm"})])],8,Jt)]),default:A(()=>[Zt]),_:2},1024)):ye("",!0),r.usePropmpt?(P(),De(I(Ve),{key:1,trigger:"hover"},{trigger:A(()=>[h("button",{class:"flex h-5 w-8 items-center justify-center rounded border transition hover:bg-[#666161] dark:border-neutral-700 dark:hover:bg-[#33373c]",onClick:Te(g=>O(i),["stop"])},[h("span",to,[j(I(Ie),{icon:"fluent:draw-image-24-regular",class:"text-sm"})])],8,eo)]),default:A(()=>[oo]),_:2},1024)):ye("",!0),r.copyPropmpt?(P(),De(I(Ve),{key:2,trigger:"hover"},{trigger:A(()=>[h("button",{class:"flex h-5 w-8 items-center justify-center rounded border transition hover:bg-[#666161] dark:border-neutral-700 dark:hover:bg-[#33373c]",onClick:Te(g=>L(i),["stop"])},[h("span",ao,[j(I(Ie),{icon:"tabler:copy",class:"text-sm"})])],8,no)]),default:A(()=>[ro]),_:2},1024)):ye("",!0)])]),E.value.includes(i.id)?ye("",!0):(P(),Q("div",{key:0,class:"item-loading",style:xe({width:`${S.value}px`,height:`${ie.value(i)}px`})},null,4))],12,Kt))),128)),so],4)])]))}});const io={class:"bg-[#fff] h-[100vh] overflow-hidden p-4 pr-0 dark:bg-[#18181c] flex flex-col"},co={class:"p-4 flex pr-6 justify-between items-center"},uo=h("div",{class:"font-bold text-xl"},"AI绘画广场",-1),ho={class:"w-[200px] sm:w-[300px] flex justify-between"},vo=h("span",{class:"hidden sm:block"},"尺寸调整",-1),fo={class:"flex-1 ml-5"},mo={class:"px-4 mb-1 pr-5"},po={class:"market overflow-y-scroll flex-1 min-h-screen p-4 dark:bg-[#18181c] relative"},wo=Re({__name:"index",setup(n){const l=m([]),b=m(null),d=m(50),v=m(""),f=m(1),V=m(20),M=m(!1),W=m(!0),S=_(()=>v.value?l.value.filter(k=>{const{prompt:z}=k;return z.includes(v.value)}):l.value);async function D(){M.value=!0;const k=await Tt({page:f.value,size:V.value,rec:1});M.value=!1,W.value=V.value===k.data.rows.length,l.value=[...l.value,...k.data.rows]}Ue(async()=>{await D()});function E(){f.value=f.value+1,D()}return(k,z)=>(P(),Q("div",io,[h("div",co,[uo,h("div",ho,[vo,h("div",fo,[j(I(Et),{value:d.value,"onUpdate:value":z[0]||(z[0]=B=>d.value=B),step:10},null,8,["value"])])])]),h("div",mo,[j(I(Vt),{value:v.value,"onUpdate:value":z[1]||(z[1]=B=>v.value=B),placeholder:"prompt关键词搜索"},{prefix:A(()=>[j(I(It),{component:I(jt)},null,8,["component"])]),_:1},8,["value"])]),h("div",po,[h("div",{id:"wapper",ref_key:"wapperRef",ref:b,class:"wapper"},[j(lo,{onLoadMore:E,copyPropmpt:"",isDrawLike:"",dataList:S.value,scaleWidth:d.value},null,8,["dataList","scaleWidth"])],512)])]))}});export{wo as default};
