import{u as he}from"./useBasicLayout-a4f17bae.js";import{a as pe,u as ge,t as _,Z as ve}from"./index-d64a7cc4.js";import{i as ye,e as we,K as ce,z,Z as xe}from"./naive-ui-fedd20b1.js";import{b as be,M as Pe,F as le,t as Ae}from"./index-b71062e6.js";import{d as Ee,r as X,f as fe,Q as Te,U as Y,a3 as b,M as h,a4 as I,a5 as de,X as M,W as O,S as ee,c as W}from"./vue-10b4afc0.js";import"./vueuse-motion-d4cdaf7b.js";var me={exports:{}};(function(ue){(function(te){var c=Z(),B=Q(),$=g(),q=v(),J={imagePlaceholder:void 0,cacheBust:!1},p={toSvg:j,toPng:N,toJpeg:C,toBlob:ne,toPixelData:F,impl:{fontFaces:$,images:q,util:c,inliner:B,options:{}}};ue.exports=p;function j(t,e){return e=e||{},G(e),Promise.resolve(t).then(function(o){return K(o,e.filter,!0)}).then(re).then(ae).then(a).then(function(o){return oe(o,e.width||c.width(t),e.height||c.height(t))});function a(o){return e.bgcolor&&(o.style.backgroundColor=e.bgcolor),e.width&&(o.style.width=e.width+"px"),e.height&&(o.style.height=e.height+"px"),e.style&&Object.keys(e.style).forEach(function(u){o.style[u]=e.style[u]}),o}}function F(t,e){return V(t,e||{}).then(function(a){return a.getContext("2d").getImageData(0,0,c.width(t),c.height(t)).data})}function N(t,e){return V(t,e||{}).then(function(a){return a.toDataURL()})}function C(t,e){return e=e||{},V(t,e).then(function(a){return a.toDataURL("image/jpeg",e.quality||1)})}function ne(t,e){return V(t,e||{}).then(c.canvasToBlob)}function G(t){typeof t.imagePlaceholder>"u"?p.impl.options.imagePlaceholder=J.imagePlaceholder:p.impl.options.imagePlaceholder=t.imagePlaceholder,typeof t.cacheBust>"u"?p.impl.options.cacheBust=J.cacheBust:p.impl.options.cacheBust=t.cacheBust}function V(t,e){return j(t,e).then(c.makeImage).then(c.delay(100)).then(function(o){var u=a(t);return u.getContext("2d").drawImage(o,0,0),u});function a(o){var u=document.createElement("canvas");if(u.width=e.width||c.width(o),u.height=e.height||c.height(o),e.bgcolor){var s=u.getContext("2d");s.fillStyle=e.bgcolor,s.fillRect(0,0,u.width,u.height)}return u}}function K(t,e,a){if(!a&&e&&!e(t))return Promise.resolve();return Promise.resolve(t).then(o).then(function(r){return u(t,r,e)}).then(function(r){return s(t,r)});function o(r){return r instanceof HTMLCanvasElement?c.makeImage(r.toDataURL()):r.cloneNode(!1)}function u(r,i,w){var P=r.childNodes;if(P.length===0)return Promise.resolve(i);return m(i,c.asArray(P),w).then(function(){return i});function m(L,A,y){var E=Promise.resolve();return A.forEach(function(R){E=E.then(function(){return K(R,y)}).then(function(T){T&&L.appendChild(T)})}),E}}function s(r,i){if(!(i instanceof Element))return i;return Promise.resolve().then(w).then(P).then(m).then(L).then(function(){return i});function w(){A(window.getComputedStyle(r),i.style);function A(y,E){y.cssText?E.cssText=y.cssText:R(y,E);function R(T,U){c.asArray(T).forEach(function(n){U.setProperty(n,T.getPropertyValue(n),T.getPropertyPriority(n))})}}}function P(){[":before",":after"].forEach(function(y){A(y)});function A(y){var E=window.getComputedStyle(r,y),R=E.getPropertyValue("content");if(R===""||R==="none")return;var T=c.uid();i.className=i.className+" "+T;var U=document.createElement("style");U.appendChild(n(T,y,E)),i.appendChild(U);function n(l,d,f){var x="."+l+":"+d,S=f.cssText?ie(f):se(f);return document.createTextNode(x+"{"+S+"}");function ie(k){var D=k.getPropertyValue("content");return k.cssText+" content: "+D+";"}function se(k){return c.asArray(k).map(D).join("; ")+";";function D(H){return H+": "+k.getPropertyValue(H)+(k.getPropertyPriority(H)?" !important":"")}}}}}function m(){r instanceof HTMLTextAreaElement&&(i.innerHTML=r.value),r instanceof HTMLInputElement&&i.setAttribute("value",r.value)}function L(){i instanceof SVGElement&&(i.setAttribute("xmlns","http://www.w3.org/2000/svg"),i instanceof SVGRectElement&&["width","height"].forEach(function(A){var y=i.getAttribute(A);y&&i.style.setProperty(A,y)}))}}}function re(t){return $.resolveAll().then(function(e){var a=document.createElement("style");return t.appendChild(a),a.appendChild(document.createTextNode(e)),t})}function ae(t){return q.inlineAll(t).then(function(){return t})}function oe(t,e,a){return Promise.resolve(t).then(function(o){return o.setAttribute("xmlns","http://www.w3.org/1999/xhtml"),new XMLSerializer().serializeToString(o)}).then(c.escapeXhtml).then(function(o){return'<foreignObject x="0" y="0" width="100%" height="100%">'+o+"</foreignObject>"}).then(function(o){return'<svg xmlns="http://www.w3.org/2000/svg" width="'+e+'" height="'+a+'">'+o+"</svg>"}).then(function(o){return"data:image/svg+xml;charset=utf-8,"+o})}function Z(){return{escape:L,parseExtension:e,mimeType:a,dataAsUrl:m,isDataUrl:o,canvasToBlob:s,resolveUrl:r,getAndEncode:P,uid:i(),delay:A,asArray:y,escapeXhtml:E,makeImage:w,width:R,height:T};function t(){var n="application/font-woff",l="image/jpeg";return{woff:n,woff2:n,ttf:"application/font-truetype",eot:"application/vnd.ms-fontobject",png:"image/png",jpg:l,jpeg:l,gif:"image/gif",tiff:"image/tiff",svg:"image/svg+xml"}}function e(n){var l=/\.([^\.\/]*?)$/g.exec(n);return l?l[1]:""}function a(n){var l=e(n).toLowerCase();return t()[l]||""}function o(n){return n.search(/^(data:)/)!==-1}function u(n){return new Promise(function(l){for(var d=window.atob(n.toDataURL().split(",")[1]),f=d.length,x=new Uint8Array(f),S=0;S<f;S++)x[S]=d.charCodeAt(S);l(new Blob([x],{type:"image/png"}))})}function s(n){return n.toBlob?new Promise(function(l){n.toBlob(l)}):u(n)}function r(n,l){var d=document.implementation.createHTMLDocument(),f=d.createElement("base");d.head.appendChild(f);var x=d.createElement("a");return d.body.appendChild(x),f.href=l,x.href=n,x.href}function i(){var n=0;return function(){return"u"+l()+n++;function l(){return("0000"+(Math.random()*Math.pow(36,4)<<0).toString(36)).slice(-4)}}}function w(n){return new Promise(function(l,d){var f=new Image;f.onload=function(){l(f)},f.onerror=d,f.src=n})}function P(n){var l=3e4;return p.impl.options.cacheBust&&(n+=(/\?/.test(n)?"&":"?")+new Date().getTime()),new Promise(function(d){var f=new XMLHttpRequest;f.onreadystatechange=ie,f.ontimeout=se,f.responseType="blob",f.timeout=l,f.open("GET",n,!0),f.send();var x;if(p.impl.options.imagePlaceholder){var S=p.impl.options.imagePlaceholder.split(/,/);S&&S[1]&&(x=S[1])}function ie(){if(f.readyState===4){if(f.status!==200){x?d(x):k("cannot fetch resource: "+n+", status: "+f.status);return}var D=new FileReader;D.onloadend=function(){var H=D.result.split(/,/)[1];d(H)},D.readAsDataURL(f.response)}}function se(){x?d(x):k("timeout of "+l+"ms occured while fetching resource: "+n)}function k(D){console.error(D),d("")}})}function m(n,l){return"data:"+l+";base64,"+n}function L(n){return n.replace(/([.*+?^${}()|\[\]\/\\])/g,"\\$1")}function A(n){return function(l){return new Promise(function(d){setTimeout(function(){d(l)},n)})}}function y(n){for(var l=[],d=n.length,f=0;f<d;f++)l.push(n[f]);return l}function E(n){return n.replace(/#/g,"%23").replace(/\n/g,"%0A")}function R(n){var l=U(n,"border-left-width"),d=U(n,"border-right-width");return n.scrollWidth+l+d}function T(n){var l=U(n,"border-top-width"),d=U(n,"border-bottom-width");return n.scrollHeight+l+d}function U(n,l){var d=window.getComputedStyle(n).getPropertyValue(l);return parseFloat(d.replace("px",""))}}function Q(){var t=/url\(['"]?([^'"]+?)['"]?\)/g;return{inlineAll:u,shouldProcess:e,impl:{readUrls:a,inline:o}};function e(s){return s.search(t)!==-1}function a(s){for(var r=[],i;(i=t.exec(s))!==null;)r.push(i[1]);return r.filter(function(w){return!c.isDataUrl(w)})}function o(s,r,i,w){return Promise.resolve(r).then(function(m){return i?c.resolveUrl(m,i):m}).then(w||c.getAndEncode).then(function(m){return c.dataAsUrl(m,c.mimeType(r))}).then(function(m){return s.replace(P(r),"$1"+m+"$3")});function P(m){return new RegExp(`(url\\(['"]?)(`+c.escape(m)+`)(['"]?\\))`,"g")}}function u(s,r,i){if(w())return Promise.resolve(s);return Promise.resolve(s).then(a).then(function(P){var m=Promise.resolve(s);return P.forEach(function(L){m=m.then(function(A){return o(A,L,r,i)})}),m});function w(){return!e(s)}}}function g(){return{resolveAll:t,impl:{readAll:e}};function t(){return e().then(function(a){return Promise.all(a.map(function(o){return o.resolve()}))}).then(function(a){return a.join(`
`)})}function e(){return Promise.resolve(c.asArray(document.styleSheets)).then(o).then(a).then(function(s){return s.map(u)});function a(s){return s.filter(function(r){return r.type===CSSRule.FONT_FACE_RULE}).filter(function(r){return B.shouldProcess(r.style.getPropertyValue("src"))})}function o(s){var r=[];return s.forEach(function(i){try{c.asArray(i.cssRules||[]).forEach(r.push.bind(r))}catch(w){console.log("Error while reading CSS rules from "+i.href,w.toString())}}),r}function u(s){return{resolve:function(){var i=(s.parentStyleSheet||{}).href;return B.inlineAll(s.cssText,i)},src:function(){return s.style.getPropertyValue("src")}}}}}function v(){return{inlineAll:e,impl:{newImage:t}};function t(a){return{inline:o};function o(u){return c.isDataUrl(a.src)?Promise.resolve():Promise.resolve(a.src).then(u||c.getAndEncode).then(function(s){return c.dataAsUrl(s,c.mimeType(a.src))}).then(function(s){return new Promise(function(r,i){a.onload=r,a.onerror=i,a.src=s})})}}function e(a){if(!(a instanceof Element))return Promise.resolve(a);return o(a).then(function(){return a instanceof HTMLImageElement?t(a).inline():Promise.all(c.asArray(a.childNodes).map(function(u){return e(u)}))});function o(u){var s=u.style.getPropertyValue("background");return s?B.inlineAll(s).then(function(r){u.style.setProperty("background",r,u.style.getPropertyPriority("background"))}).then(function(){return u}):Promise.resolve(u)}}}})()})(me);var _e=me.exports;const Ce=ye(_e),Se={class:"flex grow flex-col sm:flex-row h-full bg-white dark:bg-gray-900"},Ie={class:"sm:pt-4 box-border bg-gray-50 dark:bg-gray-900 overflow-y-auto w-full sm:w-[20rem] shrink-0 border-r-2 border-[#ffffff17] flex flex-col"},Be={class:"flex-1 px-4 pb-2"},Ue={key:0,class:"flex items-center py-3"},ke={class:"font-bold text-2xl"},De={class:"mb-2"},Re={class:"flex my-4"},Me={class:"flex justify-between mb-2"},Ne={class:"font-bold"},Le={class:"py-3 bottom-0 border-t-2 border-[#00000014] w-full flex flex-col justify-center items-center"},Ve={class:"items-start mb-2"},Oe={class:"h-full flex-1 overflow-y-auto overflow-hidden min-h-[80vh] flex flex-col"},je={key:0,class:"flex items-center p-5"},Fe={class:"font-bold text-2xl"},Ge={class:"flex-1 w-full p-4"},He=`
# 会议流程

## 开场白
- 欢迎词
- 自我介绍

## 议程安排
- 介绍会议议程
- 确认议程是否被所有人接受

## 上一次会议的总结
- 回顾上次会议的议题及结果
- 确认上次会议的行动项是否已经完成

## 主题讨论
- 提出本次会议的主题
- 介绍主题相关背景信息
- 提出问题并进行讨论
- 形成共识或决策

## 行动项
- 确定行动项及责任人
- 确定完成时间和目标

## 公告和其他事项
- 公告即将到来的活动或项目
- 公告公司的其他事项

## 结束语
- 感谢所有人的参与
- 总结会议内容
- 确认下一次会议的时间和议题
`,ze=`# 如何高效使用AI助手

## 设定明确的使用目标
- 确定长期和短期的使用目标
- 细化目标为具体的任务和步骤

## 优化命令和提问方式
- 精确表达需求和期望结果
- 使用清晰和具体的命令提高回答准确度
- 减少不必要的交互

## 提高使用效率
- 避免重复或无关紧要的提问
- 明确询问信息的范围和深度

## 保持良好的使用习惯
- 学会灵活运用AI助手的多种功能
- 利用AI助手自动化日常任务和流程

## 持续学习和适应
- 了解AI助手的性能和限制
- 掌握AI助手的最新功能和更新

## 建立高效的交互模式
- 根据使用体验调整提问方式和任务分配
- 学会解读AI助手的回答，有效提取信息
- 合理安排AI助手的工作量

`,Ze=Ee({__name:"index",setup(ue){var Q;const te=pe(),c=ge(),B=we(),$=(Q=te.globalConfig)==null?void 0:Q.mindDefaultData,q=X(null),J=new be.Transformer,p=X(!1),{isMobile:j}=he(),F=X(""),N=X(),C=X("");function ne(){C.value=$||ze}fe(()=>{setTimeout(()=>{ne()},1e3)});let G;function V(){const g=new XMLSerializer().serializeToString(N.value),v=new Blob([g],{type:"image/svg+xml;charset=utf-8"});le.saveAs(v,"nineai-mind.svg")}async function K(){const v=`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Markmap Export</title>
</head>
<body>
  ${await Ce.toSvg(N.value)}
</body>
</html>`,t=new Blob([v],{type:"text/html;charset=utf-8"});le.saveAs(t,"nineai-mind.html")}async function re(){p.value=!0,C.value="";try{const g="";let v="";const t=()=>(C.value=v,p.value?!0:(C.value=v,!1)),e=setInterval(()=>{t()||clearInterval(e)},1e3);await(async()=>{let o=0;await ve({prompt:F.value,onDownloadProgress:({event:u})=>{const r=u.target.responseText,i=r.substring(o);o=r.length,i.trim().split(`
`).forEach(P=>{try{const m=JSON.parse(P);m.userBalance&&te.updateUserBalance(m.userBalance),m.text&&(v+=m.text)}catch{}})}}),p.value=!1})()}catch(g){p.value=!1;const{code:v=500,message:t="好像出错了，请稍后再试！"}=g;if(v===429&&t.includes("balance has been exhausted"))return B.error("当前系统Key余额耗尽、请联系管理员补充！");if(v===500){let e=(g==null?void 0:g.message)??"好像出错了，请稍后再试！";e==="Request failed with status code 401"&&(e="非法操作、请先登录后再进行问答使用！"),B.error(e);return}if(g.code===402){B.error(g.message,{duration:5e3}),c.updateGoodsDialog(!0);return}B.error("出了点小错误、请稍后试试吧！")}finally{p.value=!1}}async function ae(){const g=await Ae(N.value);le.saveAs(g,"markmap.png")}function oe(){C.value=He}const Z=()=>{const{root:g}=J.transform(C.value);G.setData(g),G.fit()};return fe(()=>{G=Pe.create(N.value),Z()}),Te(Z),(g,v)=>(ee(),Y("div",Se,[b("div",Ie,[b("div",Be,[h(j)?(ee(),Y("header",Ue,[b("h2",ke,I(h(_)("mindmap.title")),1)])):de("",!0),b("h4",De,I(h(_)("mindmap.yourNeeds")),1),M(h(ce),{ref_key:"inputRef",ref:q,value:F.value,"onUpdate:value":v[0]||(v[0]=t=>F.value=t),type:"textarea",disabled:p.value,autosize:{minRows:3},placeholder:h(_)("mindmap.inputPlaceholder")},null,8,["value","disabled","placeholder"]),b("div",Re,[M(h(z),{type:"primary",size:"small",style:{width:"100%"},loading:p.value,onClick:re},{default:O(()=>[W(I(h(_)("mindmap.generateMindMapButton")),1)]),_:1},8,["loading"])]),b("div",Me,[b("h4",Ne,I(h(_)("mindmap.contentRequirements")),1),M(h(z),{text:"",onClick:oe},{default:O(()=>[W(I(h(_)("mindmap.tryDemoButton")),1)]),_:1})]),M(h(ce),{value:C.value,"onUpdate:value":v[1]||(v[1]=t=>C.value=t),type:"textarea",disabled:p.value,autosize:{minRows:8,maxRows:24},placeholder:"请用markdown语法输入您想要生成思维导图的内容或在上方使用描述让AI帮您完善！"},null,8,["value","disabled"])]),b("div",Le,[b("div",Ve,I(h(_)("mindmap.usageCredits")),1),b("div",null,[M(h(xe),{size:"small"},{default:O(()=>[M(h(z),{type:"primary",onClick:K},{default:O(()=>[W(I(h(_)("mindmap.exportHTML")),1)]),_:1}),M(h(z),{type:"primary",onClick:ae},{default:O(()=>[W(I(h(_)("mindmap.exportPNG")),1)]),_:1}),M(h(z),{type:"warning",onClick:V},{default:O(()=>[W(I(h(_)("mindmap.exportSVG")),1)]),_:1})]),_:1})])])]),b("div",Oe,[h(j)?de("",!0):(ee(),Y("header",je,[b("h2",Fe,I(h(_)("mindmap.title")),1)])),b("div",Ge,[(ee(),Y("svg",{ref_key:"svgRef",ref:N,class:"box-border w-full h-full border rounded-md"},null,512))])])]))}});export{Ze as default};
