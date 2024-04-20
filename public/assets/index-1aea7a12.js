import{o as ut,c as ne,a,b as C,d as pe,f as Ne,i as ht,e as ft,g as Re,u as vt,h as Ue,s as mt,r as m,j as pt,k as _,t as gt,l as bt,w as _e,m as wt,n as Fe,p as xt,q as Le,v as y,V as yt,x as kt,y as _t,z as Rt,T as We,A as ge,B as be,C as we,D as ke,E as P,F as Q,G as h,H as $t,I as Ct,J as zt,K as St,L as Oe,M as Mt,N as xe,O as Dt,P as Tt,Q as j,R as A,S as He,U as De,W as Te,X as z,_ as Ie,Y as Ve,Z as ye,$ as It,a0 as Be,a1 as Vt}from"./index-2efe4620.js";import{c as Bt}from"./index-c94da121.js";import{N as Lt}from"./Input-4816b01d.js";function Ae(n){return window.TouchEvent&&n instanceof window.TouchEvent}function je(){const n=new Map,l=b=>d=>{n.set(b,d)};return ut(()=>{n.clear()}),[n,l]}const Ht=ne([a("slider",`
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
 `,[Ne()]),a("slider-handle-indicator",`
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
 `),Ne()]),ht(a("slider",[a("slider-dot","background-color: var(--n-dot-color-modal);")])),ft(a("slider",[a("slider-dot","background-color: var(--n-dot-color-popover);")]))]),Pt=0,Et=Object.assign(Object.assign({},Ue.props),{to:Le.propTo,defaultValue:{type:[Number,Array],default:0},marks:Object,disabled:{type:Boolean,default:void 0},formatTooltip:Function,keyboard:{type:Boolean,default:!0},min:{type:Number,default:0},max:{type:Number,default:100},step:{type:[Number,String],default:1},range:Boolean,value:[Number,Array],placement:String,showTooltip:{type:Boolean,default:void 0},tooltip:{type:Boolean,default:!0},vertical:Boolean,reverse:Boolean,"onUpdate:value":[Function,Array],onUpdateValue:[Function,Array],onDragstart:[Function],onDragend:[Function]}),Nt=Re({name:"Slider",props:Et,setup(n){const{mergedClsPrefixRef:l,namespaceRef:b,inlineThemeDisabled:d}=vt(n),f=Ue("Slider","-slider",Ht,mt,n,l),v=m(null),[V,M]=je(),[W,D]=je(),T=m(new Set),E=pt(n),{mergedDisabledRef:k}=E,S=_(()=>{const{step:e}=n;if(Number(e)<=0||e==="mark")return 0;const t=e.toString();let o=0;return t.includes(".")&&(o=t.length-t.indexOf(".")-1),o}),B=m(n.defaultValue),ae=gt(n,"value"),Z=bt(ae,B),R=_(()=>{const{value:e}=Z;return(n.range?e:[e]).map(ce)}),re=_(()=>R.value.length>2),$e=_(()=>n.placement===void 0?n.vertical?"right":"top":n.placement),se=_(()=>{const{marks:e}=n;return e?Object.keys(e).map(parseFloat):null}),$=m(-1),le=m(-1),L=m(-1),H=m(!1),O=m(!1),ee=_(()=>{const{vertical:e,reverse:t}=n;return e?t?"top":"bottom":t?"right":"left"}),ie=_(()=>{if(re.value)return;const e=R.value,t=Y(n.range?Math.min(...e):n.min),o=Y(n.range?Math.max(...e):e[0]),{value:r}=ee;return n.vertical?{[r]:`${t}%`,height:`${o-t}%`}:{[r]:`${t}%`,width:`${o-t}%`}}),K=_(()=>{const e=[],{marks:t}=n;if(t){const o=R.value.slice();o.sort((w,x)=>w-x);const{value:r}=ee,{value:u}=re,{range:p}=n,I=u?()=>!1:w=>p?w>=o[0]&&w<=o[o.length-1]:w<=o[0];for(const w of Object.keys(t)){const x=Number(w);e.push({active:I(x),label:t[w],style:{[r]:`${Y(x)}%`}})}}return e});function de(e,t){const o=Y(e),{value:r}=ee;return{[r]:`${o}%`,zIndex:t===$.value?1:0}}function s(e){return n.showTooltip||L.value===e||$.value===e&&H.value}function c(e){return H.value?!($.value===e&&le.value===e):!0}function i(e){var t;~e&&($.value=e,(t=V.get(e))===null||t===void 0||t.focus())}function N(){W.forEach((e,t)=>{s(t)&&e.syncPosition()})}function g(e){const{"onUpdate:value":t,onUpdateValue:o}=n,{nTriggerFormInput:r,nTriggerFormChange:u}=E;o&&ge(o,e),t&&ge(t,e),B.value=e,r(),u()}function Ce(e){const{range:t}=n;if(t){if(Array.isArray(e)){const{value:o}=R;e.join()!==o.join()&&g(e)}}else Array.isArray(e)||R.value[0]!==e&&g(e)}function X(e,t){if(n.range){const o=R.value.slice();o.splice(t,1,e),Ce(o)}else Ce(e)}function te(e,t,o){const r=o!==void 0;o||(o=e-t>0?1:-1);const u=se.value||[],{step:p}=n;if(p==="mark"){const x=U(e,u.concat(t),r?o:void 0);return x?x.value:t}if(p<=0)return t;const{value:I}=S;let w;if(r){const x=Number((t/p).toFixed(I)),F=Math.floor(x),Se=x>F?F:F-1,Me=x<F?F:F+1;w=U(t,[Number((Se*p).toFixed(I)),Number((Me*p).toFixed(I)),...u],o)}else{const x=q(e);w=U(e,[...u,x])}return w?ce(w.value):t}function ce(e){return Math.min(n.max,Math.max(n.min,e))}function Y(e){const{max:t,min:o}=n;return(e-o)/(t-o)*100}function ue(e){const{max:t,min:o}=n;return o+(t-o)*e}function q(e){const{step:t,min:o}=n;if(Number(t)<=0||t==="mark")return e;const r=Math.round((e-o)/t)*t+o;return Number(r.toFixed(S.value))}function U(e,t=se.value,o){if(!(t!=null&&t.length))return null;let r=null,u=-1;for(;++u<t.length;){const p=t[u]-e,I=Math.abs(p);(o===void 0||p*o>0)&&(r===null||I<r.distance)&&(r={index:u,distance:I,value:t[u]})}return r}function oe(e){const t=v.value;if(!t)return;const o=Ae(e)?e.touches[0]:e,r=t.getBoundingClientRect();let u;return n.vertical?u=(r.bottom-o.clientY)/r.height:u=(o.clientX-r.left)/r.width,n.reverse&&(u=1-u),ue(u)}function ze(e){if(k.value||!n.keyboard)return;const{vertical:t,reverse:o}=n;switch(e.key){case"ArrowUp":e.preventDefault(),he(t&&o?-1:1);break;case"ArrowRight":e.preventDefault(),he(!t&&o?-1:1);break;case"ArrowDown":e.preventDefault(),he(t&&o?1:-1);break;case"ArrowLeft":e.preventDefault(),he(!t&&o?1:-1);break}}function he(e){const t=$.value;if(t===-1)return;const{step:o}=n,r=R.value[t],u=Number(o)<=0||o==="mark"?r:r+o*e;X(te(u,r,e>0?1:-1),t)}function Ke(e){var t,o;if(k.value||!Ae(e)&&e.button!==Pt)return;const r=oe(e);if(r===void 0)return;const u=R.value.slice(),p=n.range?(o=(t=U(r,u))===null||t===void 0?void 0:t.index)!==null&&o!==void 0?o:-1:0;p!==-1&&(e.preventDefault(),i(p),Xe(),X(te(r,R.value[p]),p))}function Xe(){H.value||(H.value=!0,n.onDragstart&&ge(n.onDragstart),be("touchend",document,me),be("mouseup",document,me),be("touchmove",document,ve),be("mousemove",document,ve))}function fe(){H.value&&(H.value=!1,n.onDragend&&ge(n.onDragend),we("touchend",document,me),we("mouseup",document,me),we("touchmove",document,ve),we("mousemove",document,ve))}function ve(e){const{value:t}=$;if(!H.value||t===-1){fe();return}const o=oe(e);o!==void 0&&X(te(o,R.value[t]),t)}function me(){fe()}function Ye(e){$.value=e,k.value||(L.value=e)}function qe(e){$.value===e&&($.value=-1,fe()),L.value===e&&(L.value=-1)}function Ge(e){L.value=e}function Je(e){L.value===e&&(L.value=-1)}_e($,(e,t)=>void ke(()=>le.value=t)),_e(Z,()=>{if(n.marks){if(O.value)return;O.value=!0,ke(()=>{O.value=!1})}ke(N)}),wt(()=>{fe()});const Pe=_(()=>{const{self:{markFontSize:e,railColor:t,railColorHover:o,fillColor:r,fillColorHover:u,handleColor:p,opacityDisabled:I,dotColor:w,dotColorModal:x,handleBoxShadow:F,handleBoxShadowHover:Se,handleBoxShadowActive:Me,handleBoxShadowFocus:Qe,dotBorder:Ze,dotBoxShadow:et,railHeight:tt,railWidthVertical:ot,handleSize:nt,dotHeight:at,dotWidth:rt,dotBorderRadius:st,fontSize:lt,dotBorderActive:it,dotColorPopover:dt},common:{cubicBezierEaseInOut:ct}}=f.value;return{"--n-bezier":ct,"--n-dot-border":Ze,"--n-dot-border-active":it,"--n-dot-border-radius":st,"--n-dot-box-shadow":et,"--n-dot-color":w,"--n-dot-color-modal":x,"--n-dot-color-popover":dt,"--n-dot-height":at,"--n-dot-width":rt,"--n-fill-color":r,"--n-fill-color-hover":u,"--n-font-size":lt,"--n-handle-box-shadow":F,"--n-handle-box-shadow-active":Me,"--n-handle-box-shadow-focus":Qe,"--n-handle-box-shadow-hover":Se,"--n-handle-color":p,"--n-handle-size":nt,"--n-opacity-disabled":I,"--n-rail-color":t,"--n-rail-color-hover":o,"--n-rail-height":tt,"--n-rail-width-vertical":ot,"--n-mark-font-size":e}}),G=d?Fe("slider",void 0,Pe,n):void 0,Ee=_(()=>{const{self:{fontSize:e,indicatorColor:t,indicatorBoxShadow:o,indicatorTextColor:r,indicatorBorderRadius:u}}=f.value;return{"--n-font-size":e,"--n-indicator-border-radius":u,"--n-indicator-box-shadow":o,"--n-indicator-color":t,"--n-indicator-text-color":r}}),J=d?Fe("slider-indicator",void 0,Ee,n):void 0;return{mergedClsPrefix:l,namespace:b,uncontrolledValue:B,mergedValue:Z,mergedDisabled:k,mergedPlacement:$e,isMounted:xt(),adjustedTo:Le(n),dotTransitionDisabled:O,markInfos:K,isShowTooltip:s,shouldKeepTooltipTransition:c,handleRailRef:v,setHandleRefs:M,setFollowerRefs:D,fillStyle:ie,getHandleStyle:de,activeIndex:$,arrifiedValues:R,followerEnabledIndexSet:T,handleRailMouseDown:Ke,handleHandleFocus:Ye,handleHandleBlur:qe,handleHandleMouseEnter:Ge,handleHandleMouseLeave:Je,handleRailKeyDown:ze,indicatorCssVars:d?void 0:Ee,indicatorThemeClass:J==null?void 0:J.themeClass,indicatorOnRender:J==null?void 0:J.onRender,cssVars:d?void 0:Pe,themeClass:G==null?void 0:G.themeClass,onRender:G==null?void 0:G.onRender}},render(){var n;const{mergedClsPrefix:l,themeClass:b,formatTooltip:d}=this;return(n=this.onRender)===null||n===void 0||n.call(this),y("div",{class:[`${l}-slider`,b,{[`${l}-slider--disabled`]:this.mergedDisabled,[`${l}-slider--active`]:this.activeIndex!==-1,[`${l}-slider--with-mark`]:this.marks,[`${l}-slider--vertical`]:this.vertical,[`${l}-slider--reverse`]:this.reverse}],style:this.cssVars,onKeydown:this.handleRailKeyDown,onMousedown:this.handleRailMouseDown,onTouchstart:this.handleRailMouseDown},y("div",{class:`${l}-slider-rail`},y("div",{class:`${l}-slider-rail__fill`,style:this.fillStyle}),this.marks?y("div",{class:[`${l}-slider-dots`,this.dotTransitionDisabled&&`${l}-slider-dots--transition-disabled`]},this.markInfos.map(f=>y("div",{key:f.label,class:[`${l}-slider-dot`,{[`${l}-slider-dot--active`]:f.active}],style:f.style}))):null,y("div",{ref:"handleRailRef",class:`${l}-slider-handles`},this.arrifiedValues.map((f,v)=>{const V=this.isShowTooltip(v);return y(yt,null,{default:()=>[y(kt,null,{default:()=>y("div",{ref:this.setHandleRefs(v),class:`${l}-slider-handle-wrapper`,tabindex:this.mergedDisabled?-1:0,style:this.getHandleStyle(f,v),onFocus:()=>{this.handleHandleFocus(v)},onBlur:()=>{this.handleHandleBlur(v)},onMouseenter:()=>{this.handleHandleMouseEnter(v)},onMouseleave:()=>{this.handleHandleMouseLeave(v)}},_t(this.$slots.thumb,()=>[y("div",{class:`${l}-slider-handle`})]))}),this.tooltip&&y(Rt,{ref:this.setFollowerRefs(v),show:V,to:this.adjustedTo,enabled:this.showTooltip&&!this.range||this.followerEnabledIndexSet.has(v),teleportDisabled:this.adjustedTo===Le.tdkey,placement:this.mergedPlacement,containerClass:this.namespace},{default:()=>y(We,{name:"fade-in-scale-up-transition",appear:this.isMounted,css:this.shouldKeepTooltipTransition(v),onEnter:()=>{this.followerEnabledIndexSet.add(v)},onAfterLeave:()=>{this.followerEnabledIndexSet.delete(v)}},{default:()=>{var M;return V?((M=this.indicatorOnRender)===null||M===void 0||M.call(this),y("div",{class:[`${l}-slider-handle-indicator`,this.indicatorThemeClass,`${l}-slider-handle-indicator--${this.mergedPlacement}`],style:this.indicatorCssVars},typeof d=="function"?d(f):f)):null}})})]})})),this.marks?y("div",{class:`${l}-slider-marks`},this.markInfos.map(f=>y("div",{key:f.label,class:`${l}-slider-mark`,style:f.style},f.label))):null))}}),Ft={xmlns:"http://www.w3.org/2000/svg","xmlns:xlink":"http://www.w3.org/1999/xlink",viewBox:"0 0 512 512"},At=h("path",{d:"M315.27 33L96 304h128l-31.51 173.23a2.36 2.36 0 0 0 2.33 2.77h0a2.36 2.36 0 0 0 1.89-.95L416 208H288l31.66-173.25a2.45 2.45 0 0 0-2.44-2.75h0a2.42 2.42 0 0 0-1.95 1z",fill:"none",stroke:"currentColor","stroke-linecap":"round","stroke-linejoin":"round","stroke-width":"32"},null,-1),jt=[At],Ut=Re({name:"FlashOutline",render:function(l,b){return P(),Q("svg",Ft,jt)}});function Wt(n,l){let b,d;return function(...v){d=v,b||(b=setTimeout(()=>{n.apply(this,d),b=null},l))}}const Ot={class:"min-h-full overflow-hidden flex flex-col"},Kt={class:"flex-1 min-h-full p-4 relative"},Xt=["id"],Yt=["id","src","onLoad","onError","onClick"],qt={class:"menu p-2 text-[#cbd5e1]"},Gt={class:"prompt"},Jt={class:"flex justify-end items-end space-x-2"},Qt=["onClick"],Zt={class:"text-sm dark:text-slate-400"},eo=h("span",null,"画同款",-1),to=["onClick"],oo={class:"text-sm dark:text-slate-400"},no=h("span",null,"使用当前画同款",-1),ao=["onClick"],ro={class:"text-sm dark:text-slate-400"},so=h("span",null,"复制提示词",-1),lo=h("div",{id:"footer",class:"w-full absolute bottom-[350px]"},null,-1),io=Re({__name:"index",props:{dataList:{},scaleWidth:{},isDrawLike:{type:Boolean},usePropmpt:{type:Boolean},copyPropmpt:{type:Boolean},gap:{default:5}},emits:["loadMore","usePropmptDraw"],setup(n,{emit:l}){var de;const b=$t(),d=n,f=l,v=(de=Ct())==null?void 0:de.appContext.config.globalProperties.$viewerApi,V=zt(),M=m({}),W=m(0),D=m(160),T=m(0),E=m([]),k=m(null),S=m(0),B=_(()=>b.isLogin),ae=_(()=>d.scaleWidth?Number(d.scaleWidth)*2+d.gap+150:150),Z=St();function R(){$e(),se();const s=T.value,c=D.value,i=[];d.dataList.forEach((N,g)=>{const X=N.drawRatio.split("x"),te=parseInt(X[0],10),ce=parseInt(X[1],10),Y=c/te,ue=ce*Y+d.gap+W.value,q=M.value[N.id];if(i.length<s)q.style.top="0px",q.style.left=`${(c+d.gap)*g}px`,i.push(ue);else{const U=Math.min.apply(null,i),oe=i.findIndex(ze=>ze===U);q.style.top=`${U+0}px`,q.style.left=`${oe*(D.value+d.gap)}px`,i[oe]+=ue}}),S.value=Math.max(...i)+100}function re(s,c){s&&c&&(M.value[c.id]=s)}function $e(){const{showName:s=0,showOther:c=0}={};W.value=[s,c].filter(i=>i).length*15}_e(()=>d.scaleWidth,s=>{K()}),_e(()=>d.dataList,s=>{s&&ke(()=>{K()})},{immediate:!0});function se(){if(!k.value)return;const s=k.value.clientWidth;T.value=Math.floor(s/ae.value);const c=s-T.value*ae.value,i=(T.value-1)*d.gap;c-i<0&&(T.value-=1),D.value=Math.floor((s-i)/T.value)}function $(s,c){E.value.push(c.id)}function le(s,c){E.value.push(c.id)}function L(s){if(!B.value)return b.setLoginDialog(!0);const{prompt:c}=s;Bt({text:c}),V.success("复制prompt成功")}function H(s){Z.push(`/midjourney?mjId=${s.id}`)}function O(s){const{fullPrompt:c}=s;f("usePropmptDraw",c)}function ee(s){const{drawUrl:c}=s;v({options:{},images:[c]})}const ie=_(()=>s=>{const c=s.drawRatio.split("x"),i=Number(c[0]);return Number(c[1])/(i/D.value)}),K=Wt(function(){R()},200);return Oe(async()=>{window.addEventListener("resize",K);const s=document.getElementById("footer");new IntersectionObserver((i,N)=>{i.forEach(g=>{g.isIntersecting&&f("loadMore")})}).observe(s)}),Mt(()=>{window.removeEventListener("resize",K)}),(s,c)=>(P(),Q("div",Ot,[h("div",Kt,[h("div",{id:"wapper",ref_key:"wapperRef",ref:k,class:"wapper",style:xe({height:`${S.value}px`})},[(P(!0),Q(Dt,null,Tt(s.dataList,(i,N)=>(P(),Q("div",{id:i.id.toString(),key:N,ref_for:!0,ref:g=>re(g,i),class:"wapper-item",style:xe({width:`${D.value}px`})},[j(We,{name:"img",css:!0},{default:A(()=>[h("img",{id:i.id.toString(),class:"item-file rounded-sm",style:xe({width:`${D.value}px`,height:`${ie.value(i)}px`}),src:i.drawUrl,loading:"lazy",onLoad:g=>$(g,i),onError:g=>le(g,i),onClick:g=>ee(i)},null,44,Yt)]),_:2},1024),h("div",qt,[h("div",Gt,He(i.fullPrompt),1),h("div",Jt,[s.isDrawLike?(P(),De(z(Ve),{key:0,trigger:"hover"},{trigger:A(()=>[h("button",{class:"flex h-5 w-8 items-center justify-center rounded border transition hover:bg-[#666161] dark:border-neutral-700 dark:hover:bg-[#33373c]",onClick:Te(g=>H(i),["stop"])},[h("span",Zt,[j(z(Ie),{icon:"fluent:draw-image-24-regular",class:"text-sm"})])],8,Qt)]),default:A(()=>[eo]),_:2},1024)):ye("",!0),s.usePropmpt?(P(),De(z(Ve),{key:1,trigger:"hover"},{trigger:A(()=>[h("button",{class:"flex h-5 w-8 items-center justify-center rounded border transition hover:bg-[#666161] dark:border-neutral-700 dark:hover:bg-[#33373c]",onClick:Te(g=>O(i),["stop"])},[h("span",oo,[j(z(Ie),{icon:"fluent:draw-image-24-regular",class:"text-sm"})])],8,to)]),default:A(()=>[no]),_:2},1024)):ye("",!0),s.copyPropmpt?(P(),De(z(Ve),{key:2,trigger:"hover"},{trigger:A(()=>[h("button",{class:"flex h-5 w-8 items-center justify-center rounded border transition hover:bg-[#666161] dark:border-neutral-700 dark:hover:bg-[#33373c]",onClick:Te(g=>L(i),["stop"])},[h("span",ro,[j(z(Ie),{icon:"tabler:copy",class:"text-sm"})])],8,ao)]),default:A(()=>[so]),_:2},1024)):ye("",!0)])]),E.value.includes(i.id)?ye("",!0):(P(),Q("div",{key:0,class:"item-loading",style:xe({width:`${D.value}px`,height:`${ie.value(i)}px`})},null,4))],12,Xt))),128)),lo],4)])]))}});const co={class:"bg-[#fff] h-[100vh] overflow-hidden p-4 pr-0 dark:bg-[#18181c] flex flex-col"},uo={class:"p-4 flex pr-6 justify-between items-center"},ho={class:"font-bold text-xl"},fo={class:"w-[200px] sm:w-[300px] flex justify-between"},vo={class:"hidden sm:block"},mo={class:"flex-1 ml-5"},po={class:"px-4 mb-1 pr-5"},go={class:"market overflow-y-scroll flex-1 min-h-screen p-4 dark:bg-[#18181c] relative"},yo=Re({__name:"index",setup(n){const l=m([]),b=m(null),d=m(50),f=m(""),v=m(1),V=m(20),M=m(!1),W=m(!0),D=_(()=>f.value?l.value.filter(k=>{const{prompt:S}=k;return S.includes(f.value)}):l.value);async function T(){M.value=!0;const k=await It({page:v.value,size:V.value,rec:1});M.value=!1,W.value=V.value===k.data.rows.length,l.value=[...l.value,...k.data.rows]}Oe(async()=>{await T()});function E(){v.value=v.value+1,T()}return(k,S)=>(P(),Q("div",co,[h("div",uo,[h("div",ho,He(z(Be)("draw.aiDrawingSquare")),1),h("div",fo,[h("span",vo,He(z(Be)("draw.sizeAdjustment")),1),h("div",mo,[j(z(Nt),{value:d.value,"onUpdate:value":S[0]||(S[0]=B=>d.value=B),step:10},null,8,["value"])])])]),h("div",po,[j(z(Lt),{value:f.value,"onUpdate:value":S[1]||(S[1]=B=>f.value=B),placeholder:z(Be)("draw.keywordSearchPlaceholder")},{prefix:A(()=>[j(z(Vt),{component:z(Ut)},null,8,["component"])]),_:1},8,["value","placeholder"])]),h("div",go,[h("div",{id:"wapper",ref_key:"wapperRef",ref:b,class:"wapper"},[j(io,{onLoadMore:E,copyPropmpt:"",isDrawLike:"",dataList:D.value,scaleWidth:d.value},null,8,["dataList","scaleWidth"])],512)])]))}});export{yo as default};
