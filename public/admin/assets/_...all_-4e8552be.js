
/**
 * 由 Fantastic-admin 提供技术支持
 * Powered by Fantastic-admin
 * Gitee  https://gitee.com/hooray/fantastic-admin
 * Github https://github.com/hooray/fantastic-admin
 */
  
import{d as u,r as i,s as p,x as f,o as v,c as m,e as a,a as o,f as h,j as b,_ as x,h as I,p as w,i as y,l as k,t as B,b as N,n as g,q as s}from"./index-e656eb90.js";const c=t=>(w("data-v-599b59df"),t=t(),y(),t),C={class:"notfound"},S={class:"content"},V=c(()=>o("h1",null,"404",-1)),R=c(()=>o("div",{class:"desc"}," 抱歉，你访问的页面不存在 ",-1)),_=u({__name:"[...all]",setup(t){const l=b(),e=i({inter:NaN,countdown:5});p(()=>{e.value.inter&&clearInterval(e.value.inter)}),f(()=>{e.value.inter=setInterval(()=>{e.value.countdown--,e.value.countdown===0&&(e.value.inter&&clearInterval(e.value.inter),n())},1e3)});function n(){l.push("/")}return(j,q)=>{const r=x,d=I("el-button");return v(),m("div",C,[a(r,{name:"404",class:"icon"}),o("div",S,[V,R,a(d,{type:"primary",onClick:n},{default:h(()=>[k(B(N(e).countdown)+" 秒后，返回首页 ",1)]),_:1})])])}}});typeof s=="function"&&s(_);const E=g(_,[["__scopeId","data-v-599b59df"]]);export{E as default};
