
/**
 * 由 Fantastic-admin 提供技术支持
 * Powered by Fantastic-admin
 * https://fantastic-admin.github.io
 */

import{d as e,u as t,a,r as s,o as l,b as n,c as o,e as u,f as r,g as i,_ as c,w as x,h as f,t as d,i as v,j as w,k as p}from"./index-BERX8Mlm.js";const m={class:"absolute left-[50%] top-[50%] flex flex-col items-center justify-between lg-flex-row -translate-x-50% -translate-y-50% lg-gap-12"},g={class:"flex flex-col gap-4"},h=e({__name:"[...all]",setup(e){const p=t(),h=a(),b=s({inter:Number.NaN,countdown:5});function _(){p.push(h.settings.home.fullPath)}return l((()=>{b.value.inter&&window.clearInterval(b.value.inter)})),n((()=>{b.value.inter=window.setInterval((()=>{b.value.countdown--,0===b.value.countdown&&(b.value.inter&&window.clearInterval(b.value.inter),_())}),1e3)})),(e,t)=>{const a=c,s=w;return u(),o("div",m,[r(a,{name:"404",class:"text-[300px] lg-text-[400px]"}),i("div",g,[t[0]||(t[0]=i("h1",{class:"m-0 text-6xl font-sans"},"404",-1)),t[1]||(t[1]=i("div",{class:"mx-0 text-xl text-stone-5"},"抱歉，你访问的页面不存在",-1)),i("div",null,[r(s,{onClick:_},{default:x((()=>[f(d(v(b).countdown)+" 秒后，返回首页 ",1)])),_:1})])])])}}});"function"==typeof p&&p(h);export{h as default};
