
/**
 * 由 Fantastic-admin 提供技术支持
 * Powered by Fantastic-admin
 * https://fantastic-admin.github.io
 */

import{d as i,u,r as _,o as f,a as d,c as x,b as o,e as t,w as p,f as m,_ as v,g as w,h as g,t as h,i as k,j as B,k as s}from"./index-6QRvoxq4.js";const N={class:"absolute left-[50%] top-[50%] flex flex-col items-center justify-between lg-flex-row -translate-x-50% -translate-y-50% lg-gap-12"},b={class:"flex flex-col gap-4"},S=t("h1",{class:"m-0 text-6xl font-sans"}," 404 ",-1),y=t("div",{class:"mx-0 text-xl text-stone-5"}," 抱歉，你访问的页面不存在 ",-1),I=i({__name:"[...all]",setup(C){const a=m(),l=u(),e=_({inter:Number.NaN,countdown:5});f(()=>{e.value.inter&&window.clearInterval(e.value.inter)}),d(()=>{e.value.inter=window.setInterval(()=>{e.value.countdown--,e.value.countdown===0&&(e.value.inter&&window.clearInterval(e.value.inter),n())},1e3)});function n(){a.push(l.settings.home.fullPath)}return(V,j)=>{const c=B,r=v;return w(),x("div",N,[o(c,{name:"404",class:"text-[300px] lg-text-[400px]"}),t("div",b,[S,y,t("div",null,[o(r,{onClick:n},{default:p(()=>[g(h(k(e).countdown)+" 秒后，返回首页 ",1)]),_:1})])])])}}});typeof s=="function"&&s(I);export{I as default};
