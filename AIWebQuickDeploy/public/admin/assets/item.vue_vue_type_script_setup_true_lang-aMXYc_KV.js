
/**
 * 由 Fantastic-admin 提供技术支持
 * Powered by Fantastic-admin
 * https://fantastic-admin.github.io
 */

import{d as t,u as a,c as e,e as s,g as o,t as r,a6 as p,aj as c}from"./index-BERX8Mlm.js";const i={class:"breadcrumb-item flex items-center text-dark dark-text-white"},n={class:"separator mx-2"},l=t({__name:"item",props:{to:{},replace:{type:Boolean},separator:{default:"/"}},setup(t){const l=t,m=a();function u(){l.to&&(l.replace?m.replace(l.to):m.push(l.to))}return(t,a)=>(s(),e("div",i,[o("span",n,r(t.separator),1),o("span",{class:p(["text flex items-center opacity-60",{"is-link cursor-pointer transition-opacity hover-opacity-100":!!l.to}]),onClick:u},[c(t.$slots,"default")],2)]))}});export{l as _};
