import{g as se,cD as Mt,cE as It,L as Be,cF as vn,ce as gn,k as L,r as _,bZ as je,a7 as dt,a6 as Ve,v as c,aj as pn,cn as bt,cG as He,cq as bn,D as ht,ae as mn,cH as mt,m as _t,a as D,d as W,c as ae,u as Ye,h as be,cI as yn,bV as At,aK as vt,cJ as wn,a5 as ve,n as Ze,bH as Bt,cK as gt,ch as Te,T as Et,b as le,a3 as ut,f as Nt,b6 as Lt,t as oe,cL as xn,w as Oe,cM as Ae,aT as yt,a9 as wt,ab as Cn,ba as Sn,y as Rn,cN as Tn,cO as On,aN as kn,cP as Fn,an as nt,Y as Pn,O as zn,cQ as Mn,l as xt,cR as In,j as _n,p as An,q as ct,V as Bn,x as En,z as Nn,ah as Ln,ai as $n,b7 as Ct,cS as Dn,cT as Kn,A as ue}from"./index-2efe4620.js";import{a as Vn}from"./Input-4816b01d.js";function Ge(e,t){let{target:n}=e;for(;n;){if(n.dataset&&n.dataset[t]!==void 0)return!0;n=n.parentElement}return!1}function St(e){switch(typeof e){case"string":return e||void 0;case"number":return String(e);default:return}}function ot(e){const t=e.filter(n=>n!==void 0);if(t.length!==0)return t.length===1?t[0]:n=>{e.forEach(o=>{o&&o(n)})}}function Rt(e){return e&-e}class Wn{constructor(t,n){this.l=t,this.min=n;const o=new Array(t+1);for(let l=0;l<t+1;++l)o[l]=0;this.ft=o}add(t,n){if(n===0)return;const{l:o,ft:l}=this;for(t+=1;t<=o;)l[t]+=n,t+=Rt(t)}get(t){return this.sum(t+1)-this.sum(t)}sum(t){if(t===void 0&&(t=this.l),t<=0)return 0;const{ft:n,min:o,l}=this;if(t>l)throw new Error("[FinweckTree.sum]: `i` is larger than length.");let s=t*o;for(;t>0;)s+=n[t],t-=Rt(t);return s}getBound(t){let n=0,o=this.l;for(;o>n;){const l=Math.floor((n+o)/2),s=this.sum(l);if(s>t){o=l;continue}else if(s<t){if(n===l)return this.sum(n+1)<=t?n+1:l;n=l}else return l}return n}}let We;function jn(){return typeof document>"u"?!1:(We===void 0&&("matchMedia"in window?We=window.matchMedia("(pointer:coarse)").matches:We=!1),We)}let it;function Tt(){return typeof document>"u"?1:(it===void 0&&(it="chrome"in window?window.devicePixelRatio:1),it)}const Hn=He(".v-vl",{maxHeight:"inherit",height:"100%",overflow:"auto",minWidth:"1px"},[He("&:not(.v-vl--show-scrollbar)",{scrollbarWidth:"none"},[He("&::-webkit-scrollbar, &::-webkit-scrollbar-track-piece, &::-webkit-scrollbar-thumb",{width:0,height:0,display:"none"})])]),Gn=se({name:"VirtualList",inheritAttrs:!1,props:{showScrollbar:{type:Boolean,default:!0},items:{type:Array,default:()=>[]},itemSize:{type:Number,required:!0},itemResizable:Boolean,itemsStyle:[String,Object],visibleItemsTag:{type:[String,Object],default:"div"},visibleItemsProps:Object,ignoreItemResize:Boolean,onScroll:Function,onWheel:Function,onResize:Function,defaultScrollKey:[Number,String],defaultScrollIndex:Number,keyField:{type:String,default:"key"},paddingTop:{type:[Number,String],default:0},paddingBottom:{type:[Number,String],default:0}},setup(e){const t=Mt();Hn.mount({id:"vueuc/virtual-list",head:!0,anchorMetaName:It,ssr:t}),Be(()=>{const{defaultScrollIndex:w,defaultScrollKey:R}=e;w!=null?v({index:w}):R!=null&&v({key:R})});let n=!1,o=!1;vn(()=>{if(n=!1,!o){o=!0;return}v({top:p.value,left:u})}),gn(()=>{n=!0,o||(o=!0)});const l=L(()=>{const w=new Map,{keyField:R}=e;return e.items.forEach((T,j)=>{w.set(T[R],j)}),w}),s=_(null),a=_(void 0),r=new Map,b=L(()=>{const{items:w,itemSize:R,keyField:T}=e,j=new Wn(w.length,R);return w.forEach((U,q)=>{const Y=U[T],Z=r.get(Y);Z!==void 0&&j.add(q,Z)}),j}),h=_(0);let u=0;const p=_(0),k=je(()=>Math.max(b.value.getBound(p.value-dt(e.paddingTop))-1,0)),M=L(()=>{const{value:w}=a;if(w===void 0)return[];const{items:R,itemSize:T}=e,j=k.value,U=Math.min(j+Math.ceil(w/T+1),R.length-1),q=[];for(let Y=j;Y<=U;++Y)q.push(R[Y]);return q}),v=(w,R)=>{if(typeof w=="number"){F(w,R,"auto");return}const{left:T,top:j,index:U,key:q,position:Y,behavior:Z,debounce:te=!0}=w;if(T!==void 0||j!==void 0)F(T,j,Z);else if(U!==void 0)O(U,Z,te);else if(q!==void 0){const ee=l.value.get(q);ee!==void 0&&O(ee,Z,te)}else Y==="bottom"?F(0,Number.MAX_SAFE_INTEGER,Z):Y==="top"&&F(0,0,Z)};let S,K=null;function O(w,R,T){const{value:j}=b,U=j.sum(w)+dt(e.paddingTop);if(!T)s.value.scrollTo({left:0,top:U,behavior:R});else{S=w,K!==null&&window.clearTimeout(K),K=window.setTimeout(()=>{S=void 0,K=null},16);const{scrollTop:q,offsetHeight:Y}=s.value;if(U>q){const Z=j.get(w);U+Z<=q+Y||s.value.scrollTo({left:0,top:U+Z-Y,behavior:R})}else s.value.scrollTo({left:0,top:U,behavior:R})}}function F(w,R,T){s.value.scrollTo({left:w,top:R,behavior:T})}function z(w,R){var T,j,U;if(n||e.ignoreItemResize||V(R.target))return;const{value:q}=b,Y=l.value.get(w),Z=q.get(Y),te=(U=(j=(T=R.borderBoxSize)===null||T===void 0?void 0:T[0])===null||j===void 0?void 0:j.blockSize)!==null&&U!==void 0?U:R.contentRect.height;if(te===Z)return;te-e.itemSize===0?r.delete(w):r.set(w,te-e.itemSize);const re=te-Z;if(re===0)return;q.add(Y,re);const d=s.value;if(d!=null){if(S===void 0){const y=q.sum(Y);d.scrollTop>y&&d.scrollBy(0,re)}else if(Y<S)d.scrollBy(0,re);else if(Y===S){const y=q.sum(Y);te+y>d.scrollTop+d.offsetHeight&&d.scrollBy(0,re)}G()}h.value++}const m=!jn();let x=!1;function I(w){var R;(R=e.onScroll)===null||R===void 0||R.call(e,w),(!m||!x)&&G()}function B(w){var R;if((R=e.onWheel)===null||R===void 0||R.call(e,w),m){const T=s.value;if(T!=null){if(w.deltaX===0&&(T.scrollTop===0&&w.deltaY<=0||T.scrollTop+T.offsetHeight>=T.scrollHeight&&w.deltaY>=0))return;w.preventDefault(),T.scrollTop+=w.deltaY/Tt(),T.scrollLeft+=w.deltaX/Tt(),G(),x=!0,bn(()=>{x=!1})}}}function H(w){if(n||V(w.target)||w.contentRect.height===a.value)return;a.value=w.contentRect.height;const{onResize:R}=e;R!==void 0&&R(w)}function G(){const{value:w}=s;w!=null&&(p.value=w.scrollTop,u=w.scrollLeft)}function V(w){let R=w;for(;R!==null;){if(R.style.display==="none")return!0;R=R.parentElement}return!1}return{listHeight:a,listStyle:{overflow:"auto"},keyToIndex:l,itemsStyle:L(()=>{const{itemResizable:w}=e,R=Ve(b.value.sum());return h.value,[e.itemsStyle,{boxSizing:"content-box",height:w?"":R,minHeight:w?R:"",paddingTop:Ve(e.paddingTop),paddingBottom:Ve(e.paddingBottom)}]}),visibleItemsStyle:L(()=>(h.value,{transform:`translateY(${Ve(b.value.sum(k.value))})`})),viewportItems:M,listElRef:s,itemsElRef:_(null),scrollTo:v,handleListResize:H,handleListScroll:I,handleListWheel:B,handleItemResize:z}},render(){const{itemResizable:e,keyField:t,keyToIndex:n,visibleItemsTag:o}=this;return c(bt,{onResize:this.handleListResize},{default:()=>{var l,s;return c("div",pn(this.$attrs,{class:["v-vl",this.showScrollbar&&"v-vl--show-scrollbar"],onScroll:this.handleListScroll,onWheel:this.handleListWheel,ref:"listElRef"}),[this.items.length!==0?c("div",{ref:"itemsElRef",class:"v-vl-items",style:this.itemsStyle},[c(o,Object.assign({class:"v-vl-visible-items",style:this.visibleItemsStyle},this.visibleItemsProps),{default:()=>this.viewportItems.map(a=>{const r=a[t],b=n.get(r),h=this.$slots.default({item:a,index:b})[0];return e?c(bt,{key:r,onResize:u=>this.handleItemResize(r,u)},{default:()=>h}):(h.key=r,h)})})]):(s=(l=this.$slots).empty)===null||s===void 0?void 0:s.call(l)])}})}}),he="v-hidden",Un=He("[v-hidden]",{display:"none!important"}),Ot=se({name:"Overflow",props:{getCounter:Function,getTail:Function,updateCounter:Function,onUpdateCount:Function,onUpdateOverflow:Function},setup(e,{slots:t}){const n=_(null),o=_(null);function l(a){const{value:r}=n,{getCounter:b,getTail:h}=e;let u;if(b!==void 0?u=b():u=o.value,!r||!u)return;u.hasAttribute(he)&&u.removeAttribute(he);const{children:p}=r;if(a.showAllItemsBeforeCalculate)for(const z of p)z.hasAttribute(he)&&z.removeAttribute(he);const k=r.offsetWidth,M=[],v=t.tail?h==null?void 0:h():null;let S=v?v.offsetWidth:0,K=!1;const O=r.children.length-(t.tail?1:0);for(let z=0;z<O-1;++z){if(z<0)continue;const m=p[z];if(K){m.hasAttribute(he)||m.setAttribute(he,"");continue}else m.hasAttribute(he)&&m.removeAttribute(he);const x=m.offsetWidth;if(S+=x,M[z]=x,S>k){const{updateCounter:I}=e;for(let B=z;B>=0;--B){const H=O-1-B;I!==void 0?I(H):u.textContent=`${H}`;const G=u.offsetWidth;if(S-=M[B],S+G<=k||B===0){K=!0,z=B-1,v&&(z===-1?(v.style.maxWidth=`${k-G}px`,v.style.boxSizing="border-box"):v.style.maxWidth="");const{onUpdateCount:V}=e;V&&V(H);break}}}}const{onUpdateOverflow:F}=e;K?F!==void 0&&F(!0):(F!==void 0&&F(!1),u.setAttribute(he,""))}const s=Mt();return Un.mount({id:"vueuc/overflow",head:!0,anchorMetaName:It,ssr:s}),Be(()=>l({showAllItemsBeforeCalculate:!1})),{selfRef:n,counterRef:o,sync:l}},render(){const{$slots:e}=this;return ht(()=>this.sync({showAllItemsBeforeCalculate:!1})),c("div",{class:"v-overflow",ref:"selfRef"},[mn(e,"default"),e.counter?e.counter():c("span",{style:{display:"inline-block"},ref:"counterRef"}),e.tail?e.tail():null])}});function $t(e,t){t&&(Be(()=>{const{value:n}=e;n&&mt.registerHandler(n,t)}),_t(()=>{const{value:n}=e;n&&mt.unregisterHandler(n)}))}const qn=se({name:"Checkmark",render(){return c("svg",{xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 16 16"},c("g",{fill:"none"},c("path",{d:"M14.046 3.486a.75.75 0 0 1-.032 1.06l-7.93 7.474a.85.85 0 0 1-1.188-.022l-2.68-2.72a.75.75 0 1 1 1.068-1.053l2.234 2.267l7.468-7.038a.75.75 0 0 1 1.06.032z",fill:"currentColor"})))}}),Yn=se({name:"Empty",render(){return c("svg",{viewBox:"0 0 28 28",fill:"none",xmlns:"http://www.w3.org/2000/svg"},c("path",{d:"M26 7.5C26 11.0899 23.0899 14 19.5 14C15.9101 14 13 11.0899 13 7.5C13 3.91015 15.9101 1 19.5 1C23.0899 1 26 3.91015 26 7.5ZM16.8536 4.14645C16.6583 3.95118 16.3417 3.95118 16.1464 4.14645C15.9512 4.34171 15.9512 4.65829 16.1464 4.85355L18.7929 7.5L16.1464 10.1464C15.9512 10.3417 15.9512 10.6583 16.1464 10.8536C16.3417 11.0488 16.6583 11.0488 16.8536 10.8536L19.5 8.20711L22.1464 10.8536C22.3417 11.0488 22.6583 11.0488 22.8536 10.8536C23.0488 10.6583 23.0488 10.3417 22.8536 10.1464L20.2071 7.5L22.8536 4.85355C23.0488 4.65829 23.0488 4.34171 22.8536 4.14645C22.6583 3.95118 22.3417 3.95118 22.1464 4.14645L19.5 6.79289L16.8536 4.14645Z",fill:"currentColor"}),c("path",{d:"M25 22.75V12.5991C24.5572 13.0765 24.053 13.4961 23.5 13.8454V16H17.5L17.3982 16.0068C17.0322 16.0565 16.75 16.3703 16.75 16.75C16.75 18.2688 15.5188 19.5 14 19.5C12.4812 19.5 11.25 18.2688 11.25 16.75L11.2432 16.6482C11.1935 16.2822 10.8797 16 10.5 16H4.5V7.25C4.5 6.2835 5.2835 5.5 6.25 5.5H12.2696C12.4146 4.97463 12.6153 4.47237 12.865 4H6.25C4.45507 4 3 5.45507 3 7.25V22.75C3 24.5449 4.45507 26 6.25 26H21.75C23.5449 26 25 24.5449 25 22.75ZM4.5 22.75V17.5H9.81597L9.85751 17.7041C10.2905 19.5919 11.9808 21 14 21L14.215 20.9947C16.2095 20.8953 17.842 19.4209 18.184 17.5H23.5V22.75C23.5 23.7165 22.7165 24.5 21.75 24.5H6.25C5.2835 24.5 4.5 23.7165 4.5 22.75Z",fill:"currentColor"}))}}),Zn=se({props:{onFocus:Function,onBlur:Function},setup(e){return()=>c("div",{style:"width: 0; height: 0",tabindex:0,onFocus:e.onFocus,onBlur:e.onBlur})}});function kt(e){return Array.isArray(e)?e:[e]}const ft={STOP:"STOP"};function Dt(e,t){const n=t(e);e.children!==void 0&&n!==ft.STOP&&e.children.forEach(o=>Dt(o,t))}function Xn(e,t={}){const{preserveGroup:n=!1}=t,o=[],l=n?a=>{a.isLeaf||(o.push(a.key),s(a.children))}:a=>{a.isLeaf||(a.isGroup||o.push(a.key),s(a.children))};function s(a){a.forEach(l)}return s(e),o}function Jn(e,t){const{isLeaf:n}=e;return n!==void 0?n:!t(e)}function Qn(e){return e.children}function eo(e){return e.key}function to(){return!1}function no(e,t){const{isLeaf:n}=e;return!(n===!1&&!Array.isArray(t(e)))}function oo(e){return e.disabled===!0}function io(e,t){return e.isLeaf===!1&&!Array.isArray(t(e))}function lt(e){var t;return e==null?[]:Array.isArray(e)?e:(t=e.checkedKeys)!==null&&t!==void 0?t:[]}function rt(e){var t;return e==null||Array.isArray(e)?[]:(t=e.indeterminateKeys)!==null&&t!==void 0?t:[]}function lo(e,t){const n=new Set(e);return t.forEach(o=>{n.has(o)||n.add(o)}),Array.from(n)}function ro(e,t){const n=new Set(e);return t.forEach(o=>{n.has(o)&&n.delete(o)}),Array.from(n)}function ao(e){return(e==null?void 0:e.type)==="group"}function so(e){const t=new Map;return e.forEach((n,o)=>{t.set(n.key,o)}),n=>{var o;return(o=t.get(n))!==null&&o!==void 0?o:null}}class uo extends Error{constructor(){super(),this.message="SubtreeNotLoadedError: checking a subtree whose required nodes are not fully loaded."}}function co(e,t,n,o){return Ue(t.concat(e),n,o,!1)}function fo(e,t){const n=new Set;return e.forEach(o=>{const l=t.treeNodeMap.get(o);if(l!==void 0){let s=l.parent;for(;s!==null&&!(s.disabled||n.has(s.key));)n.add(s.key),s=s.parent}}),n}function ho(e,t,n,o){const l=Ue(t,n,o,!1),s=Ue(e,n,o,!0),a=fo(e,n),r=[];return l.forEach(b=>{(s.has(b)||a.has(b))&&r.push(b)}),r.forEach(b=>l.delete(b)),l}function at(e,t){const{checkedKeys:n,keysToCheck:o,keysToUncheck:l,indeterminateKeys:s,cascade:a,leafOnly:r,checkStrategy:b,allowNotLoaded:h}=e;if(!a)return o!==void 0?{checkedKeys:lo(n,o),indeterminateKeys:Array.from(s)}:l!==void 0?{checkedKeys:ro(n,l),indeterminateKeys:Array.from(s)}:{checkedKeys:Array.from(n),indeterminateKeys:Array.from(s)};const{levelTreeNodeMap:u}=t;let p;l!==void 0?p=ho(l,n,t,h):o!==void 0?p=co(o,n,t,h):p=Ue(n,t,h,!1);const k=b==="parent",M=b==="child"||r,v=p,S=new Set,K=Math.max.apply(null,Array.from(u.keys()));for(let O=K;O>=0;O-=1){const F=O===0,z=u.get(O);for(const m of z){if(m.isLeaf)continue;const{key:x,shallowLoaded:I}=m;if(M&&I&&m.children.forEach(V=>{!V.disabled&&!V.isLeaf&&V.shallowLoaded&&v.has(V.key)&&v.delete(V.key)}),m.disabled||!I)continue;let B=!0,H=!1,G=!0;for(const V of m.children){const w=V.key;if(!V.disabled){if(G&&(G=!1),v.has(w))H=!0;else if(S.has(w)){H=!0,B=!1;break}else if(B=!1,H)break}}B&&!G?(k&&m.children.forEach(V=>{!V.disabled&&v.has(V.key)&&v.delete(V.key)}),v.add(x)):H&&S.add(x),F&&M&&v.has(x)&&v.delete(x)}}return{checkedKeys:Array.from(v),indeterminateKeys:Array.from(S)}}function Ue(e,t,n,o){const{treeNodeMap:l,getChildren:s}=t,a=new Set,r=new Set(e);return e.forEach(b=>{const h=l.get(b);h!==void 0&&Dt(h,u=>{if(u.disabled)return ft.STOP;const{key:p}=u;if(!a.has(p)&&(a.add(p),r.add(p),io(u.rawNode,s))){if(o)return ft.STOP;if(!n)throw new uo}})}),r}function vo(e,{includeGroup:t=!1,includeSelf:n=!0},o){var l;const s=o.treeNodeMap;let a=e==null?null:(l=s.get(e))!==null&&l!==void 0?l:null;const r={keyPath:[],treeNodePath:[],treeNode:a};if(a!=null&&a.ignored)return r.treeNode=null,r;for(;a;)!a.ignored&&(t||!a.isGroup)&&r.treeNodePath.push(a),a=a.parent;return r.treeNodePath.reverse(),n||r.treeNodePath.pop(),r.keyPath=r.treeNodePath.map(b=>b.key),r}function go(e){if(e.length===0)return null;const t=e[0];return t.isGroup||t.ignored||t.disabled?t.getNext():t}function po(e,t){const n=e.siblings,o=n.length,{index:l}=e;return t?n[(l+1)%o]:l===n.length-1?null:n[l+1]}function Ft(e,t,{loop:n=!1,includeDisabled:o=!1}={}){const l=t==="prev"?bo:po,s={reverse:t==="prev"};let a=!1,r=null;function b(h){if(h!==null){if(h===e){if(!a)a=!0;else if(!e.disabled&&!e.isGroup){r=e;return}}else if((!h.disabled||o)&&!h.ignored&&!h.isGroup){r=h;return}if(h.isGroup){const u=pt(h,s);u!==null?r=u:b(l(h,n))}else{const u=l(h,!1);if(u!==null)b(u);else{const p=mo(h);p!=null&&p.isGroup?b(l(p,n)):n&&b(l(h,!0))}}}}return b(e),r}function bo(e,t){const n=e.siblings,o=n.length,{index:l}=e;return t?n[(l-1+o)%o]:l===0?null:n[l-1]}function mo(e){return e.parent}function pt(e,t={}){const{reverse:n=!1}=t,{children:o}=e;if(o){const{length:l}=o,s=n?l-1:0,a=n?-1:l,r=n?-1:1;for(let b=s;b!==a;b+=r){const h=o[b];if(!h.disabled&&!h.ignored)if(h.isGroup){const u=pt(h,t);if(u!==null)return u}else return h}}return null}const yo={getChild(){return this.ignored?null:pt(this)},getParent(){const{parent:e}=this;return e!=null&&e.isGroup?e.getParent():e},getNext(e={}){return Ft(this,"next",e)},getPrev(e={}){return Ft(this,"prev",e)}};function wo(e,t){const n=t?new Set(t):void 0,o=[];function l(s){s.forEach(a=>{o.push(a),!(a.isLeaf||!a.children||a.ignored)&&(a.isGroup||n===void 0||n.has(a.key))&&l(a.children)})}return l(e),o}function xo(e,t){const n=e.key;for(;t;){if(t.key===n)return!0;t=t.parent}return!1}function Kt(e,t,n,o,l,s=null,a=0){const r=[];return e.forEach((b,h)=>{var u;const p=Object.create(o);if(p.rawNode=b,p.siblings=r,p.level=a,p.index=h,p.isFirstChild=h===0,p.isLastChild=h+1===e.length,p.parent=s,!p.ignored){const k=l(b);Array.isArray(k)&&(p.children=Kt(k,t,n,o,l,p,a+1))}r.push(p),t.set(p.key,p),n.has(a)||n.set(a,[]),(u=n.get(a))===null||u===void 0||u.push(p)}),r}function Co(e,t={}){var n;const o=new Map,l=new Map,{getDisabled:s=oo,getIgnored:a=to,getIsGroup:r=ao,getKey:b=eo}=t,h=(n=t.getChildren)!==null&&n!==void 0?n:Qn,u=t.ignoreEmptyChildren?m=>{const x=h(m);return Array.isArray(x)?x.length?x:null:x}:h,p=Object.assign({get key(){return b(this.rawNode)},get disabled(){return s(this.rawNode)},get isGroup(){return r(this.rawNode)},get isLeaf(){return Jn(this.rawNode,u)},get shallowLoaded(){return no(this.rawNode,u)},get ignored(){return a(this.rawNode)},contains(m){return xo(this,m)}},yo),k=Kt(e,o,l,p,u);function M(m){if(m==null)return null;const x=o.get(m);return x&&!x.isGroup&&!x.ignored?x:null}function v(m){if(m==null)return null;const x=o.get(m);return x&&!x.ignored?x:null}function S(m,x){const I=v(m);return I?I.getPrev(x):null}function K(m,x){const I=v(m);return I?I.getNext(x):null}function O(m){const x=v(m);return x?x.getParent():null}function F(m){const x=v(m);return x?x.getChild():null}const z={treeNodes:k,treeNodeMap:o,levelTreeNodeMap:l,maxLevel:Math.max(...l.keys()),getChildren:u,getFlattenedNodes(m){return wo(k,m)},getNode:M,getPrev:S,getNext:K,getParent:O,getChild:F,getFirstAvailableNode(){return go(k)},getPath(m,x={}){return vo(m,x,z)},getCheckedKeys(m,x={}){const{cascade:I=!0,leafOnly:B=!1,checkStrategy:H="all",allowNotLoaded:G=!1}=x;return at({checkedKeys:lt(m),indeterminateKeys:rt(m),cascade:I,leafOnly:B,checkStrategy:H,allowNotLoaded:G},z)},check(m,x,I={}){const{cascade:B=!0,leafOnly:H=!1,checkStrategy:G="all",allowNotLoaded:V=!1}=I;return at({checkedKeys:lt(x),indeterminateKeys:rt(x),keysToCheck:m==null?[]:kt(m),cascade:B,leafOnly:H,checkStrategy:G,allowNotLoaded:V},z)},uncheck(m,x,I={}){const{cascade:B=!0,leafOnly:H=!1,checkStrategy:G="all",allowNotLoaded:V=!1}=I;return at({checkedKeys:lt(x),indeterminateKeys:rt(x),keysToUncheck:m==null?[]:kt(m),cascade:B,leafOnly:H,checkStrategy:G,allowNotLoaded:V},z)},getNonLeafKeys(m={}){return Xn(k,m)}};return z}const So=D("empty",`
 display: flex;
 flex-direction: column;
 align-items: center;
 font-size: var(--n-font-size);
`,[W("icon",`
 width: var(--n-icon-size);
 height: var(--n-icon-size);
 font-size: var(--n-icon-size);
 line-height: var(--n-icon-size);
 color: var(--n-icon-color);
 transition:
 color .3s var(--n-bezier);
 `,[ae("+",[W("description",`
 margin-top: 8px;
 `)])]),W("description",`
 transition: color .3s var(--n-bezier);
 color: var(--n-text-color);
 `),W("extra",`
 text-align: center;
 transition: color .3s var(--n-bezier);
 margin-top: 12px;
 color: var(--n-extra-text-color);
 `)]),Ro=Object.assign(Object.assign({},be.props),{description:String,showDescription:{type:Boolean,default:!0},showIcon:{type:Boolean,default:!0},size:{type:String,default:"medium"},renderIcon:Function}),To=se({name:"Empty",props:Ro,setup(e){const{mergedClsPrefixRef:t,inlineThemeDisabled:n}=Ye(e),o=be("Empty","-empty",So,yn,e,t),{localeRef:l}=At("Empty"),s=vt(wn,null),a=L(()=>{var u,p,k;return(u=e.description)!==null&&u!==void 0?u:(k=(p=s==null?void 0:s.mergedComponentPropsRef.value)===null||p===void 0?void 0:p.Empty)===null||k===void 0?void 0:k.description}),r=L(()=>{var u,p;return((p=(u=s==null?void 0:s.mergedComponentPropsRef.value)===null||u===void 0?void 0:u.Empty)===null||p===void 0?void 0:p.renderIcon)||(()=>c(Yn,null))}),b=L(()=>{const{size:u}=e,{common:{cubicBezierEaseInOut:p},self:{[ve("iconSize",u)]:k,[ve("fontSize",u)]:M,textColor:v,iconColor:S,extraTextColor:K}}=o.value;return{"--n-icon-size":k,"--n-font-size":M,"--n-bezier":p,"--n-text-color":v,"--n-icon-color":S,"--n-extra-text-color":K}}),h=n?Ze("empty",L(()=>{let u="";const{size:p}=e;return u+=p[0],u}),b,e):void 0;return{mergedClsPrefix:t,mergedRenderIcon:r,localizedDescription:L(()=>a.value||l.value.description),cssVars:n?void 0:b,themeClass:h==null?void 0:h.themeClass,onRender:h==null?void 0:h.onRender}},render(){const{$slots:e,mergedClsPrefix:t,onRender:n}=this;return n==null||n(),c("div",{class:[`${t}-empty`,this.themeClass],style:this.cssVars},this.showIcon?c("div",{class:`${t}-empty__icon`},e.icon?e.icon():c(Bt,{clsPrefix:t},{default:this.mergedRenderIcon})):null,this.showDescription?c("div",{class:`${t}-empty__description`},e.default?e.default():this.localizedDescription):null,e.extra?c("div",{class:`${t}-empty__extra`},e.extra()):null)}});function Oo(e,t){return c(Et,{name:"fade-in-scale-up-transition"},{default:()=>e?c(Bt,{clsPrefix:t,class:`${t}-base-select-option__check`},{default:()=>c(qn)}):null})}const Pt=se({name:"NBaseSelectOption",props:{clsPrefix:{type:String,required:!0},tmNode:{type:Object,required:!0}},setup(e){const{valueRef:t,pendingTmNodeRef:n,multipleRef:o,valueSetRef:l,renderLabelRef:s,renderOptionRef:a,labelFieldRef:r,valueFieldRef:b,showCheckmarkRef:h,nodePropsRef:u,handleOptionClick:p,handleOptionMouseEnter:k}=vt(gt),M=je(()=>{const{value:O}=n;return O?e.tmNode.key===O.key:!1});function v(O){const{tmNode:F}=e;F.disabled||p(O,F)}function S(O){const{tmNode:F}=e;F.disabled||k(O,F)}function K(O){const{tmNode:F}=e,{value:z}=M;F.disabled||z||k(O,F)}return{multiple:o,isGrouped:je(()=>{const{tmNode:O}=e,{parent:F}=O;return F&&F.rawNode.type==="group"}),showCheckmark:h,nodeProps:u,isPending:M,isSelected:je(()=>{const{value:O}=t,{value:F}=o;if(O===null)return!1;const z=e.tmNode.rawNode[b.value];if(F){const{value:m}=l;return m.has(z)}else return O===z}),labelField:r,renderLabel:s,renderOption:a,handleMouseMove:K,handleMouseEnter:S,handleClick:v}},render(){const{clsPrefix:e,tmNode:{rawNode:t},isSelected:n,isPending:o,isGrouped:l,showCheckmark:s,nodeProps:a,renderOption:r,renderLabel:b,handleClick:h,handleMouseEnter:u,handleMouseMove:p}=this,k=Oo(n,e),M=b?[b(t,n),s&&k]:[Te(t[this.labelField],t,n),s&&k],v=a==null?void 0:a(t),S=c("div",Object.assign({},v,{class:[`${e}-base-select-option`,t.class,v==null?void 0:v.class,{[`${e}-base-select-option--disabled`]:t.disabled,[`${e}-base-select-option--selected`]:n,[`${e}-base-select-option--grouped`]:l,[`${e}-base-select-option--pending`]:o,[`${e}-base-select-option--show-checkmark`]:s}],style:[(v==null?void 0:v.style)||"",t.style||""],onClick:ot([h,v==null?void 0:v.onClick]),onMouseenter:ot([u,v==null?void 0:v.onMouseenter]),onMousemove:ot([p,v==null?void 0:v.onMousemove])}),c("div",{class:`${e}-base-select-option__content`},M));return t.render?t.render({node:S,option:t,selected:n}):r?r({node:S,option:t,selected:n}):S}}),zt=se({name:"NBaseSelectGroupHeader",props:{clsPrefix:{type:String,required:!0},tmNode:{type:Object,required:!0}},setup(){const{renderLabelRef:e,renderOptionRef:t,labelFieldRef:n,nodePropsRef:o}=vt(gt);return{labelField:n,nodeProps:o,renderLabel:e,renderOption:t}},render(){const{clsPrefix:e,renderLabel:t,renderOption:n,nodeProps:o,tmNode:{rawNode:l}}=this,s=o==null?void 0:o(l),a=t?t(l,!1):Te(l[this.labelField],l,!1),r=c("div",Object.assign({},s,{class:[`${e}-base-select-group-header`,s==null?void 0:s.class]}),a);return l.render?l.render({node:r,option:l}):n?n({node:r,option:l,selected:!1}):r}}),ko=D("base-select-menu",`
 line-height: 1.5;
 outline: none;
 z-index: 0;
 position: relative;
 border-radius: var(--n-border-radius);
 transition:
 background-color .3s var(--n-bezier),
 box-shadow .3s var(--n-bezier);
 background-color: var(--n-color);
`,[D("scrollbar",`
 max-height: var(--n-height);
 `),D("virtual-list",`
 max-height: var(--n-height);
 `),D("base-select-option",`
 min-height: var(--n-option-height);
 font-size: var(--n-option-font-size);
 display: flex;
 align-items: center;
 `,[W("content",`
 z-index: 1;
 white-space: nowrap;
 text-overflow: ellipsis;
 overflow: hidden;
 `)]),D("base-select-group-header",`
 min-height: var(--n-option-height);
 font-size: .93em;
 display: flex;
 align-items: center;
 `),D("base-select-menu-option-wrapper",`
 position: relative;
 width: 100%;
 `),W("loading, empty",`
 display: flex;
 padding: 12px 32px;
 flex: 1;
 justify-content: center;
 `),W("loading",`
 color: var(--n-loading-color);
 font-size: var(--n-loading-size);
 `),W("header",`
 padding: 8px var(--n-option-padding-left);
 font-size: var(--n-option-font-size);
 transition: 
 color .3s var(--n-bezier),
 border-color .3s var(--n-bezier);
 border-bottom: 1px solid var(--n-action-divider-color);
 color: var(--n-action-text-color);
 `),W("action",`
 padding: 8px var(--n-option-padding-left);
 font-size: var(--n-option-font-size);
 transition: 
 color .3s var(--n-bezier),
 border-color .3s var(--n-bezier);
 border-top: 1px solid var(--n-action-divider-color);
 color: var(--n-action-text-color);
 `),D("base-select-group-header",`
 position: relative;
 cursor: default;
 padding: var(--n-option-padding);
 color: var(--n-group-header-text-color);
 `),D("base-select-option",`
 cursor: pointer;
 position: relative;
 padding: var(--n-option-padding);
 transition:
 color .3s var(--n-bezier),
 opacity .3s var(--n-bezier);
 box-sizing: border-box;
 color: var(--n-option-text-color);
 opacity: 1;
 `,[le("show-checkmark",`
 padding-right: calc(var(--n-option-padding-right) + 20px);
 `),ae("&::before",`
 content: "";
 position: absolute;
 left: 4px;
 right: 4px;
 top: 0;
 bottom: 0;
 border-radius: var(--n-border-radius);
 transition: background-color .3s var(--n-bezier);
 `),ae("&:active",`
 color: var(--n-option-text-color-pressed);
 `),le("grouped",`
 padding-left: calc(var(--n-option-padding-left) * 1.5);
 `),le("pending",[ae("&::before",`
 background-color: var(--n-option-color-pending);
 `)]),le("selected",`
 color: var(--n-option-text-color-active);
 `,[ae("&::before",`
 background-color: var(--n-option-color-active);
 `),le("pending",[ae("&::before",`
 background-color: var(--n-option-color-active-pending);
 `)])]),le("disabled",`
 cursor: not-allowed;
 `,[ut("selected",`
 color: var(--n-option-text-color-disabled);
 `),le("selected",`
 opacity: var(--n-option-opacity-disabled);
 `)]),W("check",`
 font-size: 16px;
 position: absolute;
 right: calc(var(--n-option-padding-right) - 4px);
 top: calc(50% - 7px);
 color: var(--n-option-check-color);
 transition: color .3s var(--n-bezier);
 `,[Nt({enterScale:"0.5"})])])]),Fo=se({name:"InternalSelectMenu",props:Object.assign(Object.assign({},be.props),{clsPrefix:{type:String,required:!0},scrollable:{type:Boolean,default:!0},treeMate:{type:Object,required:!0},multiple:Boolean,size:{type:String,default:"medium"},value:{type:[String,Number,Array],default:null},autoPending:Boolean,virtualScroll:{type:Boolean,default:!0},show:{type:Boolean,default:!0},labelField:{type:String,default:"label"},valueField:{type:String,default:"value"},loading:Boolean,focusable:Boolean,renderLabel:Function,renderOption:Function,nodeProps:Function,showCheckmark:{type:Boolean,default:!0},onMousedown:Function,onScroll:Function,onFocus:Function,onBlur:Function,onKeyup:Function,onKeydown:Function,onTabOut:Function,onMouseenter:Function,onMouseleave:Function,onResize:Function,resetMenuOnOptionsChange:{type:Boolean,default:!0},inlineThemeDisabled:Boolean,onToggle:Function}),setup(e){const{mergedClsPrefixRef:t,mergedRtlRef:n}=Ye(e),o=Lt("InternalSelectMenu",n,t),l=be("InternalSelectMenu","-internal-select-menu",ko,xn,e,oe(e,"clsPrefix")),s=_(null),a=_(null),r=_(null),b=L(()=>e.treeMate.getFlattenedNodes()),h=L(()=>so(b.value)),u=_(null);function p(){const{treeMate:d}=e;let y=null;const{value:X}=e;X===null?y=d.getFirstAvailableNode():(e.multiple?y=d.getNode((X||[])[(X||[]).length-1]):y=d.getNode(X),(!y||y.disabled)&&(y=d.getFirstAvailableNode())),j(y||null)}function k(){const{value:d}=u;d&&!e.treeMate.getNode(d.key)&&(u.value=null)}let M;Oe(()=>e.show,d=>{d?M=Oe(()=>e.treeMate,()=>{e.resetMenuOnOptionsChange?(e.autoPending?p():k(),ht(U)):k()},{immediate:!0}):M==null||M()},{immediate:!0}),_t(()=>{M==null||M()});const v=L(()=>dt(l.value.self[ve("optionHeight",e.size)])),S=L(()=>Ae(l.value.self[ve("padding",e.size)])),K=L(()=>e.multiple&&Array.isArray(e.value)?new Set(e.value):new Set),O=L(()=>{const d=b.value;return d&&d.length===0});function F(d){const{onToggle:y}=e;y&&y(d)}function z(d){const{onScroll:y}=e;y&&y(d)}function m(d){var y;(y=r.value)===null||y===void 0||y.sync(),z(d)}function x(){var d;(d=r.value)===null||d===void 0||d.sync()}function I(){const{value:d}=u;return d||null}function B(d,y){y.disabled||j(y,!1)}function H(d,y){y.disabled||F(y)}function G(d){var y;Ge(d,"action")||(y=e.onKeyup)===null||y===void 0||y.call(e,d)}function V(d){var y;Ge(d,"action")||(y=e.onKeydown)===null||y===void 0||y.call(e,d)}function w(d){var y;(y=e.onMousedown)===null||y===void 0||y.call(e,d),!e.focusable&&d.preventDefault()}function R(){const{value:d}=u;d&&j(d.getNext({loop:!0}),!0)}function T(){const{value:d}=u;d&&j(d.getPrev({loop:!0}),!0)}function j(d,y=!1){u.value=d,y&&U()}function U(){var d,y;const X=u.value;if(!X)return;const ce=h.value(X.key);ce!==null&&(e.virtualScroll?(d=a.value)===null||d===void 0||d.scrollTo({index:ce}):(y=r.value)===null||y===void 0||y.scrollTo({index:ce,elSize:v.value}))}function q(d){var y,X;!((y=s.value)===null||y===void 0)&&y.contains(d.target)&&((X=e.onFocus)===null||X===void 0||X.call(e,d))}function Y(d){var y,X;!((y=s.value)===null||y===void 0)&&y.contains(d.relatedTarget)||(X=e.onBlur)===null||X===void 0||X.call(e,d)}yt(gt,{handleOptionMouseEnter:B,handleOptionClick:H,valueSetRef:K,pendingTmNodeRef:u,nodePropsRef:oe(e,"nodeProps"),showCheckmarkRef:oe(e,"showCheckmark"),multipleRef:oe(e,"multiple"),valueRef:oe(e,"value"),renderLabelRef:oe(e,"renderLabel"),renderOptionRef:oe(e,"renderOption"),labelFieldRef:oe(e,"labelField"),valueFieldRef:oe(e,"valueField")}),yt(Tn,s),Be(()=>{const{value:d}=r;d&&d.sync()});const Z=L(()=>{const{size:d}=e,{common:{cubicBezierEaseInOut:y},self:{height:X,borderRadius:ce,color:xe,groupHeaderTextColor:Ce,actionDividerColor:fe,optionTextColorPressed:ie,optionTextColor:Se,optionTextColorDisabled:ge,optionTextColorActive:ke,optionOpacityDisabled:Fe,optionCheckColor:Pe,actionTextColor:ze,optionColorPending:me,optionColorActive:ye,loadingColor:Me,loadingSize:Ie,optionColorActivePending:_e,[ve("optionFontSize",d)]:Re,[ve("optionHeight",d)]:we,[ve("optionPadding",d)]:ne}}=l.value;return{"--n-height":X,"--n-action-divider-color":fe,"--n-action-text-color":ze,"--n-bezier":y,"--n-border-radius":ce,"--n-color":xe,"--n-option-font-size":Re,"--n-group-header-text-color":Ce,"--n-option-check-color":Pe,"--n-option-color-pending":me,"--n-option-color-active":ye,"--n-option-color-active-pending":_e,"--n-option-height":we,"--n-option-opacity-disabled":Fe,"--n-option-text-color":Se,"--n-option-text-color-active":ke,"--n-option-text-color-disabled":ge,"--n-option-text-color-pressed":ie,"--n-option-padding":ne,"--n-option-padding-left":Ae(ne,"left"),"--n-option-padding-right":Ae(ne,"right"),"--n-loading-color":Me,"--n-loading-size":Ie}}),{inlineThemeDisabled:te}=e,ee=te?Ze("internal-select-menu",L(()=>e.size[0]),Z,e):void 0,re={selfRef:s,next:R,prev:T,getPendingTmNode:I};return $t(s,e.onResize),Object.assign({mergedTheme:l,mergedClsPrefix:t,rtlEnabled:o,virtualListRef:a,scrollbarRef:r,itemSize:v,padding:S,flattenedNodes:b,empty:O,virtualListContainer(){const{value:d}=a;return d==null?void 0:d.listElRef},virtualListContent(){const{value:d}=a;return d==null?void 0:d.itemsElRef},doScroll:z,handleFocusin:q,handleFocusout:Y,handleKeyUp:G,handleKeyDown:V,handleMouseDown:w,handleVirtualListResize:x,handleVirtualListScroll:m,cssVars:te?void 0:Z,themeClass:ee==null?void 0:ee.themeClass,onRender:ee==null?void 0:ee.onRender},re)},render(){const{$slots:e,virtualScroll:t,clsPrefix:n,mergedTheme:o,themeClass:l,onRender:s}=this;return s==null||s(),c("div",{ref:"selfRef",tabindex:this.focusable?0:-1,class:[`${n}-base-select-menu`,this.rtlEnabled&&`${n}-base-select-menu--rtl`,l,this.multiple&&`${n}-base-select-menu--multiple`],style:this.cssVars,onFocusin:this.handleFocusin,onFocusout:this.handleFocusout,onKeyup:this.handleKeyUp,onKeydown:this.handleKeyDown,onMousedown:this.handleMouseDown,onMouseenter:this.onMouseenter,onMouseleave:this.onMouseleave},wt(e.header,a=>a&&c("div",{class:`${n}-base-select-menu__header`,"data-header":!0,key:"header"},a)),this.loading?c("div",{class:`${n}-base-select-menu__loading`},c(Cn,{clsPrefix:n,strokeWidth:20})):this.empty?c("div",{class:`${n}-base-select-menu__empty`,"data-empty":!0},Rn(e.empty,()=>[c(To,{theme:o.peers.Empty,themeOverrides:o.peerOverrides.Empty})])):c(Sn,{ref:"scrollbarRef",theme:o.peers.Scrollbar,themeOverrides:o.peerOverrides.Scrollbar,scrollable:this.scrollable,container:t?this.virtualListContainer:void 0,content:t?this.virtualListContent:void 0,onScroll:t?void 0:this.doScroll},{default:()=>t?c(Gn,{ref:"virtualListRef",class:`${n}-virtual-list`,items:this.flattenedNodes,itemSize:this.itemSize,showScrollbar:!1,paddingTop:this.padding.top,paddingBottom:this.padding.bottom,onResize:this.handleVirtualListResize,onScroll:this.handleVirtualListScroll,itemResizable:!0},{default:({item:a})=>a.isGroup?c(zt,{key:a.key,clsPrefix:n,tmNode:a}):a.ignored?null:c(Pt,{clsPrefix:n,key:a.key,tmNode:a})}):c("div",{class:`${n}-base-select-menu-option-wrapper`,style:{paddingTop:this.padding.top,paddingBottom:this.padding.bottom}},this.flattenedNodes.map(a=>a.isGroup?c(zt,{key:a.key,clsPrefix:n,tmNode:a}):c(Pt,{clsPrefix:n,key:a.key,tmNode:a})))}),wt(e.action,a=>a&&[c("div",{class:`${n}-base-select-menu__action`,"data-action":!0,key:"action"},a),c(Zn,{onFocus:this.onTabOut,key:"focus-detector"})]))}}),Po=ae([D("base-selection",`
 --n-padding-single: var(--n-padding-single-top) var(--n-padding-single-right) var(--n-padding-single-bottom) var(--n-padding-single-left);
 --n-padding-multiple: var(--n-padding-multiple-top) var(--n-padding-multiple-right) var(--n-padding-multiple-bottom) var(--n-padding-multiple-left);
 position: relative;
 z-index: auto;
 box-shadow: none;
 width: 100%;
 max-width: 100%;
 display: inline-block;
 vertical-align: bottom;
 border-radius: var(--n-border-radius);
 min-height: var(--n-height);
 line-height: 1.5;
 font-size: var(--n-font-size);
 `,[D("base-loading",`
 color: var(--n-loading-color);
 `),D("base-selection-tags","min-height: var(--n-height);"),W("border, state-border",`
 position: absolute;
 left: 0;
 right: 0;
 top: 0;
 bottom: 0;
 pointer-events: none;
 border: var(--n-border);
 border-radius: inherit;
 transition:
 box-shadow .3s var(--n-bezier),
 border-color .3s var(--n-bezier);
 `),W("state-border",`
 z-index: 1;
 border-color: #0000;
 `),D("base-suffix",`
 cursor: pointer;
 position: absolute;
 top: 50%;
 transform: translateY(-50%);
 right: 10px;
 `,[W("arrow",`
 font-size: var(--n-arrow-size);
 color: var(--n-arrow-color);
 transition: color .3s var(--n-bezier);
 `)]),D("base-selection-overlay",`
 display: flex;
 align-items: center;
 white-space: nowrap;
 pointer-events: none;
 position: absolute;
 top: 0;
 right: 0;
 bottom: 0;
 left: 0;
 padding: var(--n-padding-single);
 transition: color .3s var(--n-bezier);
 `,[W("wrapper",`
 flex-basis: 0;
 flex-grow: 1;
 overflow: hidden;
 text-overflow: ellipsis;
 `)]),D("base-selection-placeholder",`
 color: var(--n-placeholder-color);
 `,[W("inner",`
 max-width: 100%;
 overflow: hidden;
 `)]),D("base-selection-tags",`
 cursor: pointer;
 outline: none;
 box-sizing: border-box;
 position: relative;
 z-index: auto;
 display: flex;
 padding: var(--n-padding-multiple);
 flex-wrap: wrap;
 align-items: center;
 width: 100%;
 vertical-align: bottom;
 background-color: var(--n-color);
 border-radius: inherit;
 transition:
 color .3s var(--n-bezier),
 box-shadow .3s var(--n-bezier),
 background-color .3s var(--n-bezier);
 `),D("base-selection-label",`
 height: var(--n-height);
 display: inline-flex;
 width: 100%;
 vertical-align: bottom;
 cursor: pointer;
 outline: none;
 z-index: auto;
 box-sizing: border-box;
 position: relative;
 transition:
 color .3s var(--n-bezier),
 box-shadow .3s var(--n-bezier),
 background-color .3s var(--n-bezier);
 border-radius: inherit;
 background-color: var(--n-color);
 align-items: center;
 `,[D("base-selection-input",`
 font-size: inherit;
 line-height: inherit;
 outline: none;
 cursor: pointer;
 box-sizing: border-box;
 border:none;
 width: 100%;
 padding: var(--n-padding-single);
 background-color: #0000;
 color: var(--n-text-color);
 transition: color .3s var(--n-bezier);
 caret-color: var(--n-caret-color);
 `,[W("content",`
 text-overflow: ellipsis;
 overflow: hidden;
 white-space: nowrap; 
 `)]),W("render-label",`
 color: var(--n-text-color);
 `)]),ut("disabled",[ae("&:hover",[W("state-border",`
 box-shadow: var(--n-box-shadow-hover);
 border: var(--n-border-hover);
 `)]),le("focus",[W("state-border",`
 box-shadow: var(--n-box-shadow-focus);
 border: var(--n-border-focus);
 `)]),le("active",[W("state-border",`
 box-shadow: var(--n-box-shadow-active);
 border: var(--n-border-active);
 `),D("base-selection-label","background-color: var(--n-color-active);"),D("base-selection-tags","background-color: var(--n-color-active);")])]),le("disabled","cursor: not-allowed;",[W("arrow",`
 color: var(--n-arrow-color-disabled);
 `),D("base-selection-label",`
 cursor: not-allowed;
 background-color: var(--n-color-disabled);
 `,[D("base-selection-input",`
 cursor: not-allowed;
 color: var(--n-text-color-disabled);
 `),W("render-label",`
 color: var(--n-text-color-disabled);
 `)]),D("base-selection-tags",`
 cursor: not-allowed;
 background-color: var(--n-color-disabled);
 `),D("base-selection-placeholder",`
 cursor: not-allowed;
 color: var(--n-placeholder-color-disabled);
 `)]),D("base-selection-input-tag",`
 height: calc(var(--n-height) - 6px);
 line-height: calc(var(--n-height) - 6px);
 outline: none;
 display: none;
 position: relative;
 margin-bottom: 3px;
 max-width: 100%;
 vertical-align: bottom;
 `,[W("input",`
 font-size: inherit;
 font-family: inherit;
 min-width: 1px;
 padding: 0;
 background-color: #0000;
 outline: none;
 border: none;
 max-width: 100%;
 overflow: hidden;
 width: 1em;
 line-height: inherit;
 cursor: pointer;
 color: var(--n-text-color);
 caret-color: var(--n-caret-color);
 `),W("mirror",`
 position: absolute;
 left: 0;
 top: 0;
 white-space: pre;
 visibility: hidden;
 user-select: none;
 -webkit-user-select: none;
 opacity: 0;
 `)]),["warning","error"].map(e=>le(`${e}-status`,[W("state-border",`border: var(--n-border-${e});`),ut("disabled",[ae("&:hover",[W("state-border",`
 box-shadow: var(--n-box-shadow-hover-${e});
 border: var(--n-border-hover-${e});
 `)]),le("active",[W("state-border",`
 box-shadow: var(--n-box-shadow-active-${e});
 border: var(--n-border-active-${e});
 `),D("base-selection-label",`background-color: var(--n-color-active-${e});`),D("base-selection-tags",`background-color: var(--n-color-active-${e});`)]),le("focus",[W("state-border",`
 box-shadow: var(--n-box-shadow-focus-${e});
 border: var(--n-border-focus-${e});
 `)])])]))]),D("base-selection-popover",`
 margin-bottom: -3px;
 display: flex;
 flex-wrap: wrap;
 margin-right: -8px;
 `),D("base-selection-tag-wrapper",`
 max-width: 100%;
 display: inline-flex;
 padding: 0 7px 3px 0;
 `,[ae("&:last-child","padding-right: 0;"),D("tag",`
 font-size: 14px;
 max-width: 100%;
 `,[W("content",`
 line-height: 1.25;
 text-overflow: ellipsis;
 overflow: hidden;
 `)])])]),zo=se({name:"InternalSelection",props:Object.assign(Object.assign({},be.props),{clsPrefix:{type:String,required:!0},bordered:{type:Boolean,default:void 0},active:Boolean,pattern:{type:String,default:""},placeholder:String,selectedOption:{type:Object,default:null},selectedOptions:{type:Array,default:null},labelField:{type:String,default:"label"},valueField:{type:String,default:"value"},multiple:Boolean,filterable:Boolean,clearable:Boolean,disabled:Boolean,size:{type:String,default:"medium"},loading:Boolean,autofocus:Boolean,showArrow:{type:Boolean,default:!0},inputProps:Object,focused:Boolean,renderTag:Function,onKeydown:Function,onClick:Function,onBlur:Function,onFocus:Function,onDeleteOption:Function,maxTagCount:[String,Number],ellipsisTagPopoverProps:Object,onClear:Function,onPatternInput:Function,onPatternFocus:Function,onPatternBlur:Function,renderLabel:Function,status:String,inlineThemeDisabled:Boolean,ignoreComposition:{type:Boolean,default:!0},onResize:Function}),setup(e){const{mergedClsPrefixRef:t,mergedRtlRef:n}=Ye(e),o=Lt("InternalSelection",n,t),l=_(null),s=_(null),a=_(null),r=_(null),b=_(null),h=_(null),u=_(null),p=_(null),k=_(null),M=_(null),v=_(!1),S=_(!1),K=_(!1),O=be("InternalSelection","-internal-selection",Po,On,e,oe(e,"clsPrefix")),F=L(()=>e.clearable&&!e.disabled&&(K.value||e.active)),z=L(()=>e.selectedOption?e.renderTag?e.renderTag({option:e.selectedOption,handleClose:()=>{}}):e.renderLabel?e.renderLabel(e.selectedOption,!0):Te(e.selectedOption[e.labelField],e.selectedOption,!0):e.placeholder),m=L(()=>{const f=e.selectedOption;if(f)return f[e.labelField]}),x=L(()=>e.multiple?!!(Array.isArray(e.selectedOptions)&&e.selectedOptions.length):e.selectedOption!==null);function I(){var f;const{value:C}=l;if(C){const{value:J}=s;J&&(J.style.width=`${C.offsetWidth}px`,e.maxTagCount!=="responsive"&&((f=k.value)===null||f===void 0||f.sync({showAllItemsBeforeCalculate:!1})))}}function B(){const{value:f}=M;f&&(f.style.display="none")}function H(){const{value:f}=M;f&&(f.style.display="inline-block")}Oe(oe(e,"active"),f=>{f||B()}),Oe(oe(e,"pattern"),()=>{e.multiple&&ht(I)});function G(f){const{onFocus:C}=e;C&&C(f)}function V(f){const{onBlur:C}=e;C&&C(f)}function w(f){const{onDeleteOption:C}=e;C&&C(f)}function R(f){const{onClear:C}=e;C&&C(f)}function T(f){const{onPatternInput:C}=e;C&&C(f)}function j(f){var C;(!f.relatedTarget||!(!((C=a.value)===null||C===void 0)&&C.contains(f.relatedTarget)))&&G(f)}function U(f){var C;!((C=a.value)===null||C===void 0)&&C.contains(f.relatedTarget)||V(f)}function q(f){R(f)}function Y(){K.value=!0}function Z(){K.value=!1}function te(f){!e.active||!e.filterable||f.target!==s.value&&f.preventDefault()}function ee(f){w(f)}function re(f){if(f.key==="Backspace"&&!d.value&&!e.pattern.length){const{selectedOptions:C}=e;C!=null&&C.length&&ee(C[C.length-1])}}const d=_(!1);let y=null;function X(f){const{value:C}=l;if(C){const J=f.target.value;C.textContent=J,I()}e.ignoreComposition&&d.value?y=f:T(f)}function ce(){d.value=!0}function xe(){d.value=!1,e.ignoreComposition&&T(y),y=null}function Ce(f){var C;S.value=!0,(C=e.onPatternFocus)===null||C===void 0||C.call(e,f)}function fe(f){var C;S.value=!1,(C=e.onPatternBlur)===null||C===void 0||C.call(e,f)}function ie(){var f,C;if(e.filterable)S.value=!1,(f=h.value)===null||f===void 0||f.blur(),(C=s.value)===null||C===void 0||C.blur();else if(e.multiple){const{value:J}=r;J==null||J.blur()}else{const{value:J}=b;J==null||J.blur()}}function Se(){var f,C,J;e.filterable?(S.value=!1,(f=h.value)===null||f===void 0||f.focus()):e.multiple?(C=r.value)===null||C===void 0||C.focus():(J=b.value)===null||J===void 0||J.focus()}function ge(){const{value:f}=s;f&&(H(),f.focus())}function ke(){const{value:f}=s;f&&f.blur()}function Fe(f){const{value:C}=u;C&&C.setTextContent(`+${f}`)}function Pe(){const{value:f}=p;return f}function ze(){return s.value}let me=null;function ye(){me!==null&&window.clearTimeout(me)}function Me(){e.active||(ye(),me=window.setTimeout(()=>{x.value&&(v.value=!0)},100))}function Ie(){ye()}function _e(f){f||(ye(),v.value=!1)}Oe(x,f=>{f||(v.value=!1)}),Be(()=>{kn(()=>{const f=h.value;f&&(e.disabled?f.removeAttribute("tabindex"):f.tabIndex=S.value?-1:0)})}),$t(a,e.onResize);const{inlineThemeDisabled:Re}=e,we=L(()=>{const{size:f}=e,{common:{cubicBezierEaseInOut:C},self:{borderRadius:J,color:Xe,placeholderColor:Je,textColor:Ee,paddingSingle:Ne,paddingMultiple:Le,caretColor:Qe,colorDisabled:et,textColorDisabled:$e,placeholderColorDisabled:pe,colorActive:i,boxShadowFocus:g,boxShadowActive:P,boxShadowHover:$,border:E,borderFocus:A,borderHover:N,borderActive:Q,arrowColor:de,arrowColorDisabled:tt,loadingColor:Wt,colorActiveWarning:jt,boxShadowFocusWarning:Ht,boxShadowActiveWarning:Gt,boxShadowHoverWarning:Ut,borderWarning:qt,borderFocusWarning:Yt,borderHoverWarning:Zt,borderActiveWarning:Xt,colorActiveError:Jt,boxShadowFocusError:Qt,boxShadowActiveError:en,boxShadowHoverError:tn,borderError:nn,borderFocusError:on,borderHoverError:ln,borderActiveError:rn,clearColor:an,clearColorHover:sn,clearColorPressed:dn,clearSize:un,arrowSize:cn,[ve("height",f)]:fn,[ve("fontSize",f)]:hn}}=O.value,De=Ae(Ne),Ke=Ae(Le);return{"--n-bezier":C,"--n-border":E,"--n-border-active":Q,"--n-border-focus":A,"--n-border-hover":N,"--n-border-radius":J,"--n-box-shadow-active":P,"--n-box-shadow-focus":g,"--n-box-shadow-hover":$,"--n-caret-color":Qe,"--n-color":Xe,"--n-color-active":i,"--n-color-disabled":et,"--n-font-size":hn,"--n-height":fn,"--n-padding-single-top":De.top,"--n-padding-multiple-top":Ke.top,"--n-padding-single-right":De.right,"--n-padding-multiple-right":Ke.right,"--n-padding-single-left":De.left,"--n-padding-multiple-left":Ke.left,"--n-padding-single-bottom":De.bottom,"--n-padding-multiple-bottom":Ke.bottom,"--n-placeholder-color":Je,"--n-placeholder-color-disabled":pe,"--n-text-color":Ee,"--n-text-color-disabled":$e,"--n-arrow-color":de,"--n-arrow-color-disabled":tt,"--n-loading-color":Wt,"--n-color-active-warning":jt,"--n-box-shadow-focus-warning":Ht,"--n-box-shadow-active-warning":Gt,"--n-box-shadow-hover-warning":Ut,"--n-border-warning":qt,"--n-border-focus-warning":Yt,"--n-border-hover-warning":Zt,"--n-border-active-warning":Xt,"--n-color-active-error":Jt,"--n-box-shadow-focus-error":Qt,"--n-box-shadow-active-error":en,"--n-box-shadow-hover-error":tn,"--n-border-error":nn,"--n-border-focus-error":on,"--n-border-hover-error":ln,"--n-border-active-error":rn,"--n-clear-size":un,"--n-clear-color":an,"--n-clear-color-hover":sn,"--n-clear-color-pressed":dn,"--n-arrow-size":cn}}),ne=Re?Ze("internal-selection",L(()=>e.size[0]),we,e):void 0;return{mergedTheme:O,mergedClearable:F,mergedClsPrefix:t,rtlEnabled:o,patternInputFocused:S,filterablePlaceholder:z,label:m,selected:x,showTagsPanel:v,isComposing:d,counterRef:u,counterWrapperRef:p,patternInputMirrorRef:l,patternInputRef:s,selfRef:a,multipleElRef:r,singleElRef:b,patternInputWrapperRef:h,overflowRef:k,inputTagElRef:M,handleMouseDown:te,handleFocusin:j,handleClear:q,handleMouseEnter:Y,handleMouseLeave:Z,handleDeleteOption:ee,handlePatternKeyDown:re,handlePatternInputInput:X,handlePatternInputBlur:fe,handlePatternInputFocus:Ce,handleMouseEnterCounter:Me,handleMouseLeaveCounter:Ie,handleFocusout:U,handleCompositionEnd:xe,handleCompositionStart:ce,onPopoverUpdateShow:_e,focus:Se,focusInput:ge,blur:ie,blurInput:ke,updateCounter:Fe,getCounter:Pe,getTail:ze,renderLabel:e.renderLabel,cssVars:Re?void 0:we,themeClass:ne==null?void 0:ne.themeClass,onRender:ne==null?void 0:ne.onRender}},render(){const{status:e,multiple:t,size:n,disabled:o,filterable:l,maxTagCount:s,bordered:a,clsPrefix:r,ellipsisTagPopoverProps:b,onRender:h,renderTag:u,renderLabel:p}=this;h==null||h();const k=s==="responsive",M=typeof s=="number",v=k||M,S=c(Fn,null,{default:()=>c(Vn,{clsPrefix:r,loading:this.loading,showArrow:this.showArrow,showClear:this.mergedClearable&&this.selected,onClear:this.handleClear},{default:()=>{var O,F;return(F=(O=this.$slots).arrow)===null||F===void 0?void 0:F.call(O)}})});let K;if(t){const{labelField:O}=this,F=T=>c("div",{class:`${r}-base-selection-tag-wrapper`,key:T.value},u?u({option:T,handleClose:()=>{this.handleDeleteOption(T)}}):c(nt,{size:n,closable:!T.disabled,disabled:o,onClose:()=>{this.handleDeleteOption(T)},internalCloseIsButtonTag:!1,internalCloseFocusable:!1},{default:()=>p?p(T,!0):Te(T[O],T,!0)})),z=()=>(M?this.selectedOptions.slice(0,s):this.selectedOptions).map(F),m=l?c("div",{class:`${r}-base-selection-input-tag`,ref:"inputTagElRef",key:"__input-tag__"},c("input",Object.assign({},this.inputProps,{ref:"patternInputRef",tabindex:-1,disabled:o,value:this.pattern,autofocus:this.autofocus,class:`${r}-base-selection-input-tag__input`,onBlur:this.handlePatternInputBlur,onFocus:this.handlePatternInputFocus,onKeydown:this.handlePatternKeyDown,onInput:this.handlePatternInputInput,onCompositionstart:this.handleCompositionStart,onCompositionend:this.handleCompositionEnd})),c("span",{ref:"patternInputMirrorRef",class:`${r}-base-selection-input-tag__mirror`},this.pattern)):null,x=k?()=>c("div",{class:`${r}-base-selection-tag-wrapper`,ref:"counterWrapperRef"},c(nt,{size:n,ref:"counterRef",onMouseenter:this.handleMouseEnterCounter,onMouseleave:this.handleMouseLeaveCounter,disabled:o})):void 0;let I;if(M){const T=this.selectedOptions.length-s;T>0&&(I=c("div",{class:`${r}-base-selection-tag-wrapper`,key:"__counter__"},c(nt,{size:n,ref:"counterRef",onMouseenter:this.handleMouseEnterCounter,disabled:o},{default:()=>`+${T}`})))}const B=k?l?c(Ot,{ref:"overflowRef",updateCounter:this.updateCounter,getCounter:this.getCounter,getTail:this.getTail,style:{width:"100%",display:"flex",overflow:"hidden"}},{default:z,counter:x,tail:()=>m}):c(Ot,{ref:"overflowRef",updateCounter:this.updateCounter,getCounter:this.getCounter,style:{width:"100%",display:"flex",overflow:"hidden"}},{default:z,counter:x}):M&&I?z().concat(I):z(),H=v?()=>c("div",{class:`${r}-base-selection-popover`},k?z():this.selectedOptions.map(F)):void 0,G=v?Object.assign({show:this.showTagsPanel,trigger:"hover",overlap:!0,placement:"top",width:"trigger",onUpdateShow:this.onPopoverUpdateShow,theme:this.mergedTheme.peers.Popover,themeOverrides:this.mergedTheme.peerOverrides.Popover},b):null,w=(this.selected?!1:this.active?!this.pattern&&!this.isComposing:!0)?c("div",{class:`${r}-base-selection-placeholder ${r}-base-selection-overlay`},c("div",{class:`${r}-base-selection-placeholder__inner`},this.placeholder)):null,R=l?c("div",{ref:"patternInputWrapperRef",class:`${r}-base-selection-tags`},B,k?null:m,S):c("div",{ref:"multipleElRef",class:`${r}-base-selection-tags`,tabindex:o?void 0:0},B,S);K=c(zn,null,v?c(Pn,Object.assign({},G,{scrollable:!0,style:"max-height: calc(var(--v-target-height) * 6.6);"}),{trigger:()=>R,default:H}):R,w)}else if(l){const O=this.pattern||this.isComposing,F=this.active?!O:!this.selected,z=this.active?!1:this.selected;K=c("div",{ref:"patternInputWrapperRef",class:`${r}-base-selection-label`,title:this.patternInputFocused?void 0:St(this.label)},c("input",Object.assign({},this.inputProps,{ref:"patternInputRef",class:`${r}-base-selection-input`,value:this.active?this.pattern:"",placeholder:"",readonly:o,disabled:o,tabindex:-1,autofocus:this.autofocus,onFocus:this.handlePatternInputFocus,onBlur:this.handlePatternInputBlur,onInput:this.handlePatternInputInput,onCompositionstart:this.handleCompositionStart,onCompositionend:this.handleCompositionEnd})),z?c("div",{class:`${r}-base-selection-label__render-label ${r}-base-selection-overlay`,key:"input"},c("div",{class:`${r}-base-selection-overlay__wrapper`},u?u({option:this.selectedOption,handleClose:()=>{}}):p?p(this.selectedOption,!0):Te(this.label,this.selectedOption,!0))):null,F?c("div",{class:`${r}-base-selection-placeholder ${r}-base-selection-overlay`,key:"placeholder"},c("div",{class:`${r}-base-selection-overlay__wrapper`},this.filterablePlaceholder)):null,S)}else K=c("div",{ref:"singleElRef",class:`${r}-base-selection-label`,tabindex:this.disabled?void 0:0},this.label!==void 0?c("div",{class:`${r}-base-selection-input`,title:St(this.label),key:"input"},c("div",{class:`${r}-base-selection-input__content`},u?u({option:this.selectedOption,handleClose:()=>{}}):p?p(this.selectedOption,!0):Te(this.label,this.selectedOption,!0))):c("div",{class:`${r}-base-selection-placeholder ${r}-base-selection-overlay`,key:"placeholder"},c("div",{class:`${r}-base-selection-placeholder__inner`},this.placeholder)),S);return c("div",{ref:"selfRef",class:[`${r}-base-selection`,this.rtlEnabled&&`${r}-base-selection--rtl`,this.themeClass,e&&`${r}-base-selection--${e}-status`,{[`${r}-base-selection--active`]:this.active,[`${r}-base-selection--selected`]:this.selected||this.active&&this.pattern,[`${r}-base-selection--disabled`]:this.disabled,[`${r}-base-selection--multiple`]:this.multiple,[`${r}-base-selection--focus`]:this.focused}],style:this.cssVars,onClick:this.onClick,onMouseenter:this.handleMouseEnter,onMouseleave:this.handleMouseLeave,onKeydown:this.onKeydown,onFocusin:this.handleFocusin,onFocusout:this.handleFocusout,onMousedown:this.handleMouseDown},K,a?c("div",{class:`${r}-base-selection__border`}):null,a?c("div",{class:`${r}-base-selection__state-border`}):null)}});function qe(e){return e.type==="group"}function Vt(e){return e.type==="ignored"}function st(e,t){try{return!!(1+t.toString().toLowerCase().indexOf(e.trim().toLowerCase()))}catch{return!1}}function Mo(e,t){return{getIsGroup:qe,getIgnored:Vt,getKey(o){return qe(o)?o.name||o.key||"key-required":o[e]},getChildren(o){return o[t]}}}function Io(e,t,n,o){if(!t)return e;function l(s){if(!Array.isArray(s))return[];const a=[];for(const r of s)if(qe(r)){const b=l(r[o]);b.length&&a.push(Object.assign({},r,{[o]:b}))}else{if(Vt(r))continue;t(n,r)&&a.push(r)}return a}return l(e)}function _o(e,t,n){const o=new Map;return e.forEach(l=>{qe(l)?l[n].forEach(s=>{o.set(s[t],s)}):o.set(l[t],l)}),o}const Ao=ae([D("select",`
 z-index: auto;
 outline: none;
 width: 100%;
 position: relative;
 `),D("select-menu",`
 margin: 4px 0;
 box-shadow: var(--n-menu-box-shadow);
 `,[Nt({originalTransition:"background-color .3s var(--n-bezier), box-shadow .3s var(--n-bezier)"})])]),Bo=Object.assign(Object.assign({},be.props),{to:ct.propTo,bordered:{type:Boolean,default:void 0},clearable:Boolean,clearFilterAfterSelect:{type:Boolean,default:!0},options:{type:Array,default:()=>[]},defaultValue:{type:[String,Number,Array],default:null},keyboard:{type:Boolean,default:!0},value:[String,Number,Array],placeholder:String,menuProps:Object,multiple:Boolean,size:String,filterable:Boolean,disabled:{type:Boolean,default:void 0},remote:Boolean,loading:Boolean,filter:Function,placement:{type:String,default:"bottom-start"},widthMode:{type:String,default:"trigger"},tag:Boolean,onCreate:Function,fallbackOption:{type:[Function,Boolean],default:void 0},show:{type:Boolean,default:void 0},showArrow:{type:Boolean,default:!0},maxTagCount:[Number,String],ellipsisTagPopoverProps:Object,consistentMenuWidth:{type:Boolean,default:!0},virtualScroll:{type:Boolean,default:!0},labelField:{type:String,default:"label"},valueField:{type:String,default:"value"},childrenField:{type:String,default:"children"},renderLabel:Function,renderOption:Function,renderTag:Function,"onUpdate:value":[Function,Array],inputProps:Object,nodeProps:Function,ignoreComposition:{type:Boolean,default:!0},showOnFocus:Boolean,onUpdateValue:[Function,Array],onBlur:[Function,Array],onClear:[Function,Array],onFocus:[Function,Array],onScroll:[Function,Array],onSearch:[Function,Array],onUpdateShow:[Function,Array],"onUpdate:show":[Function,Array],displayDirective:{type:String,default:"show"},resetMenuOnOptionsChange:{type:Boolean,default:!0},status:String,showCheckmark:{type:Boolean,default:!0},onChange:[Function,Array],items:Array}),Lo=se({name:"Select",props:Bo,setup(e){const{mergedClsPrefixRef:t,mergedBorderedRef:n,namespaceRef:o,inlineThemeDisabled:l}=Ye(e),s=be("Select","-select",Ao,Mn,e,t),a=_(e.defaultValue),r=oe(e,"value"),b=xt(r,a),h=_(!1),u=_(""),p=L(()=>{const{valueField:i,childrenField:g}=e,P=Mo(i,g);return Co(R.value,P)}),k=L(()=>_o(V.value,e.valueField,e.childrenField)),M=_(!1),v=xt(oe(e,"show"),M),S=_(null),K=_(null),O=_(null),{localeRef:F}=At("Select"),z=L(()=>{var i;return(i=e.placeholder)!==null&&i!==void 0?i:F.value.placeholder}),m=In(e,["items","options"]),x=[],I=_([]),B=_([]),H=_(new Map),G=L(()=>{const{fallbackOption:i}=e;if(i===void 0){const{labelField:g,valueField:P}=e;return $=>({[g]:String($),[P]:$})}return i===!1?!1:g=>Object.assign(i(g),{value:g})}),V=L(()=>B.value.concat(I.value).concat(m.value)),w=L(()=>{const{filter:i}=e;if(i)return i;const{labelField:g,valueField:P}=e;return($,E)=>{if(!E)return!1;const A=E[g];if(typeof A=="string")return st($,A);const N=E[P];return typeof N=="string"?st($,N):typeof N=="number"?st($,String(N)):!1}}),R=L(()=>{if(e.remote)return m.value;{const{value:i}=V,{value:g}=u;return!g.length||!e.filterable?i:Io(i,w.value,g,e.childrenField)}});function T(i){const g=e.remote,{value:P}=H,{value:$}=k,{value:E}=G,A=[];return i.forEach(N=>{if($.has(N))A.push($.get(N));else if(g&&P.has(N))A.push(P.get(N));else if(E){const Q=E(N);Q&&A.push(Q)}}),A}const j=L(()=>{if(e.multiple){const{value:i}=b;return Array.isArray(i)?T(i):[]}return null}),U=L(()=>{const{value:i}=b;return!e.multiple&&!Array.isArray(i)?i===null?null:T([i])[0]||null:null}),q=_n(e),{mergedSizeRef:Y,mergedDisabledRef:Z,mergedStatusRef:te}=q;function ee(i,g){const{onChange:P,"onUpdate:value":$,onUpdateValue:E}=e,{nTriggerFormChange:A,nTriggerFormInput:N}=q;P&&ue(P,i,g),E&&ue(E,i,g),$&&ue($,i,g),a.value=i,A(),N()}function re(i){const{onBlur:g}=e,{nTriggerFormBlur:P}=q;g&&ue(g,i),P()}function d(){const{onClear:i}=e;i&&ue(i)}function y(i){const{onFocus:g,showOnFocus:P}=e,{nTriggerFormFocus:$}=q;g&&ue(g,i),$(),P&&fe()}function X(i){const{onSearch:g}=e;g&&ue(g,i)}function ce(i){const{onScroll:g}=e;g&&ue(g,i)}function xe(){var i;const{remote:g,multiple:P}=e;if(g){const{value:$}=H;if(P){const{valueField:E}=e;(i=j.value)===null||i===void 0||i.forEach(A=>{$.set(A[E],A)})}else{const E=U.value;E&&$.set(E[e.valueField],E)}}}function Ce(i){const{onUpdateShow:g,"onUpdate:show":P}=e;g&&ue(g,i),P&&ue(P,i),M.value=i}function fe(){Z.value||(Ce(!0),M.value=!0,e.filterable&&Le())}function ie(){Ce(!1)}function Se(){u.value="",B.value=x}const ge=_(!1);function ke(){e.filterable&&(ge.value=!0)}function Fe(){e.filterable&&(ge.value=!1,v.value||Se())}function Pe(){Z.value||(v.value?e.filterable?Le():ie():fe())}function ze(i){var g,P;!((P=(g=O.value)===null||g===void 0?void 0:g.selfRef)===null||P===void 0)&&P.contains(i.relatedTarget)||(h.value=!1,re(i),ie())}function me(i){y(i),h.value=!0}function ye(i){h.value=!0}function Me(i){var g;!((g=S.value)===null||g===void 0)&&g.$el.contains(i.relatedTarget)||(h.value=!1,re(i),ie())}function Ie(){var i;(i=S.value)===null||i===void 0||i.focus(),ie()}function _e(i){var g;v.value&&(!((g=S.value)===null||g===void 0)&&g.$el.contains(Dn(i))||ie())}function Re(i){if(!Array.isArray(i))return[];if(G.value)return Array.from(i);{const{remote:g}=e,{value:P}=k;if(g){const{value:$}=H;return i.filter(E=>P.has(E)||$.has(E))}else return i.filter($=>P.has($))}}function we(i){ne(i.rawNode)}function ne(i){if(Z.value)return;const{tag:g,remote:P,clearFilterAfterSelect:$,valueField:E}=e;if(g&&!P){const{value:A}=B,N=A[0]||null;if(N){const Q=I.value;Q.length?Q.push(N):I.value=[N],B.value=x}}if(P&&H.value.set(i[E],i),e.multiple){const A=Re(b.value),N=A.findIndex(Q=>Q===i[E]);if(~N){if(A.splice(N,1),g&&!P){const Q=f(i[E]);~Q&&(I.value.splice(Q,1),$&&(u.value=""))}}else A.push(i[E]),$&&(u.value="");ee(A,T(A))}else{if(g&&!P){const A=f(i[E]);~A?I.value=[I.value[A]]:I.value=x}Ne(),ie(),ee(i[E],i)}}function f(i){return I.value.findIndex(P=>P[e.valueField]===i)}function C(i){v.value||fe();const{value:g}=i.target;u.value=g;const{tag:P,remote:$}=e;if(X(g),P&&!$){if(!g){B.value=x;return}const{onCreate:E}=e,A=E?E(g):{[e.labelField]:g,[e.valueField]:g},{valueField:N,labelField:Q}=e;m.value.some(de=>de[N]===A[N]||de[Q]===A[Q])||I.value.some(de=>de[N]===A[N]||de[Q]===A[Q])?B.value=x:B.value=[A]}}function J(i){i.stopPropagation();const{multiple:g}=e;!g&&e.filterable&&ie(),d(),g?ee([],[]):ee(null,null)}function Xe(i){!Ge(i,"action")&&!Ge(i,"empty")&&i.preventDefault()}function Je(i){ce(i)}function Ee(i){var g,P,$,E,A;if(!e.keyboard){i.preventDefault();return}switch(i.key){case" ":if(e.filterable)break;i.preventDefault();case"Enter":if(!(!((g=S.value)===null||g===void 0)&&g.isComposing)){if(v.value){const N=(P=O.value)===null||P===void 0?void 0:P.getPendingTmNode();N?we(N):e.filterable||(ie(),Ne())}else if(fe(),e.tag&&ge.value){const N=B.value[0];if(N){const Q=N[e.valueField],{value:de}=b;e.multiple&&Array.isArray(de)&&de.some(tt=>tt===Q)||ne(N)}}}i.preventDefault();break;case"ArrowUp":if(i.preventDefault(),e.loading)return;v.value&&(($=O.value)===null||$===void 0||$.prev());break;case"ArrowDown":if(i.preventDefault(),e.loading)return;v.value?(E=O.value)===null||E===void 0||E.next():fe();break;case"Escape":v.value&&(Kn(i),ie()),(A=S.value)===null||A===void 0||A.focus();break}}function Ne(){var i;(i=S.value)===null||i===void 0||i.focus()}function Le(){var i;(i=S.value)===null||i===void 0||i.focusInput()}function Qe(){var i;v.value&&((i=K.value)===null||i===void 0||i.syncPosition())}xe(),Oe(oe(e,"options"),xe);const et={focus:()=>{var i;(i=S.value)===null||i===void 0||i.focus()},focusInput:()=>{var i;(i=S.value)===null||i===void 0||i.focusInput()},blur:()=>{var i;(i=S.value)===null||i===void 0||i.blur()},blurInput:()=>{var i;(i=S.value)===null||i===void 0||i.blurInput()}},$e=L(()=>{const{self:{menuBoxShadow:i}}=s.value;return{"--n-menu-box-shadow":i}}),pe=l?Ze("select",void 0,$e,e):void 0;return Object.assign(Object.assign({},et),{mergedStatus:te,mergedClsPrefix:t,mergedBordered:n,namespace:o,treeMate:p,isMounted:An(),triggerRef:S,menuRef:O,pattern:u,uncontrolledShow:M,mergedShow:v,adjustedTo:ct(e),uncontrolledValue:a,mergedValue:b,followerRef:K,localizedPlaceholder:z,selectedOption:U,selectedOptions:j,mergedSize:Y,mergedDisabled:Z,focused:h,activeWithoutMenuOpen:ge,inlineThemeDisabled:l,onTriggerInputFocus:ke,onTriggerInputBlur:Fe,handleTriggerOrMenuResize:Qe,handleMenuFocus:ye,handleMenuBlur:Me,handleMenuTabOut:Ie,handleTriggerClick:Pe,handleToggle:we,handleDeleteOption:ne,handlePatternInput:C,handleClear:J,handleTriggerBlur:ze,handleTriggerFocus:me,handleKeydown:Ee,handleMenuAfterLeave:Se,handleMenuClickOutside:_e,handleMenuScroll:Je,handleMenuKeydown:Ee,handleMenuMousedown:Xe,mergedTheme:s,cssVars:l?void 0:$e,themeClass:pe==null?void 0:pe.themeClass,onRender:pe==null?void 0:pe.onRender})},render(){return c("div",{class:`${this.mergedClsPrefix}-select`},c(Bn,null,{default:()=>[c(En,null,{default:()=>c(zo,{ref:"triggerRef",inlineThemeDisabled:this.inlineThemeDisabled,status:this.mergedStatus,inputProps:this.inputProps,clsPrefix:this.mergedClsPrefix,showArrow:this.showArrow,maxTagCount:this.maxTagCount,ellipsisTagPopoverProps:this.ellipsisTagPopoverProps,bordered:this.mergedBordered,active:this.activeWithoutMenuOpen||this.mergedShow,pattern:this.pattern,placeholder:this.localizedPlaceholder,selectedOption:this.selectedOption,selectedOptions:this.selectedOptions,multiple:this.multiple,renderTag:this.renderTag,renderLabel:this.renderLabel,filterable:this.filterable,clearable:this.clearable,disabled:this.mergedDisabled,size:this.mergedSize,theme:this.mergedTheme.peers.InternalSelection,labelField:this.labelField,valueField:this.valueField,themeOverrides:this.mergedTheme.peerOverrides.InternalSelection,loading:this.loading,focused:this.focused,onClick:this.handleTriggerClick,onDeleteOption:this.handleDeleteOption,onPatternInput:this.handlePatternInput,onClear:this.handleClear,onBlur:this.handleTriggerBlur,onFocus:this.handleTriggerFocus,onKeydown:this.handleKeydown,onPatternBlur:this.onTriggerInputBlur,onPatternFocus:this.onTriggerInputFocus,onResize:this.handleTriggerOrMenuResize,ignoreComposition:this.ignoreComposition},{arrow:()=>{var e,t;return[(t=(e=this.$slots).arrow)===null||t===void 0?void 0:t.call(e)]}})}),c(Nn,{ref:"followerRef",show:this.mergedShow,to:this.adjustedTo,teleportDisabled:this.adjustedTo===ct.tdkey,containerClass:this.namespace,width:this.consistentMenuWidth?"target":void 0,minWidth:"target",placement:this.placement},{default:()=>c(Et,{name:"fade-in-scale-up-transition",appear:this.isMounted,onAfterLeave:this.handleMenuAfterLeave},{default:()=>{var e,t,n;return this.mergedShow||this.displayDirective==="show"?((e=this.onRender)===null||e===void 0||e.call(this),Ln(c(Fo,Object.assign({},this.menuProps,{ref:"menuRef",onResize:this.handleTriggerOrMenuResize,inlineThemeDisabled:this.inlineThemeDisabled,virtualScroll:this.consistentMenuWidth&&this.virtualScroll,class:[`${this.mergedClsPrefix}-select-menu`,this.themeClass,(t=this.menuProps)===null||t===void 0?void 0:t.class],clsPrefix:this.mergedClsPrefix,focusable:!0,labelField:this.labelField,valueField:this.valueField,autoPending:!0,nodeProps:this.nodeProps,theme:this.mergedTheme.peers.InternalSelectMenu,themeOverrides:this.mergedTheme.peerOverrides.InternalSelectMenu,treeMate:this.treeMate,multiple:this.multiple,size:"medium",renderOption:this.renderOption,renderLabel:this.renderLabel,value:this.mergedValue,style:[(n=this.menuProps)===null||n===void 0?void 0:n.style,this.cssVars],onToggle:this.handleToggle,onScroll:this.handleMenuScroll,onFocus:this.handleMenuFocus,onBlur:this.handleMenuBlur,onKeydown:this.handleMenuKeydown,onTabOut:this.handleMenuTabOut,onMousedown:this.handleMenuMousedown,show:this.mergedShow,showCheckmark:this.showCheckmark,resetMenuOnOptionsChange:this.resetMenuOnOptionsChange}),{empty:()=>{var o,l;return[(l=(o=this.$slots).empty)===null||l===void 0?void 0:l.call(o)]},header:()=>{var o,l;return[(l=(o=this.$slots).header)===null||l===void 0?void 0:l.call(o)]},action:()=>{var o,l;return[(l=(o=this.$slots).action)===null||l===void 0?void 0:l.call(o)]}}),this.displayDirective==="show"?[[$n,this.mergedShow],[Ct,this.handleMenuClickOutside,void 0,{capture:!0}]]:[[Ct,this.handleMenuClickOutside,void 0,{capture:!0}]])):null}})})]}))}});export{Lo as N,Gn as V,Fo as a,Mo as b,Co as c,To as d,Ge as h,ot as m};
