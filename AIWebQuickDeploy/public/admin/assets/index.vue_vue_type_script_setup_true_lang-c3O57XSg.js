
/**
 * 由 Fantastic-admin 提供技术支持
 * Powered by Fantastic-admin
 * https://fantastic-admin.github.io
 */

import{d as m,U as b,r as f,g as o,c as a,P as n,A as r,e as g,i as s,b as u,Q as h,V as v,j as _,h as y,t as k}from"./index-6QRvoxq4.js";const C={key:0,class:"title-container border-b-1 border-b-[var(--g-bg)] border-b-solid px-5 py-4 transition-border-color-300"},S={class:"main-container p-5"},B=m({name:"PageMain",__name:"index",props:{title:{default:""},collaspe:{type:Boolean,default:!1},height:{default:""}},setup(l){const i=l,c=!!b().title,t=f(i.collaspe);function p(){t.value=!1}return(e,x)=>{const d=_;return o(),a("div",{class:h(["page-main relative m-4 flex flex-col bg-[var(--g-container-bg)] transition-background-color-300",{"of-hidden":s(t)}]),style:v({height:s(t)?e.height:""})},[c||e.title?(o(),a("div",C,[n(e.$slots,"title",{},()=>[y(k(e.title),1)])])):r("",!0),g("div",S,[n(e.$slots,"default")]),s(t)?(o(),a("div",{key:1,class:"collaspe absolute bottom-0 w-full cursor-pointer from-transparent to-[var(--g-container-bg)] bg-gradient-to-b pb-2 pt-10 text-center",onClick:p},[u(d,{name:"i-ep:arrow-down",class:"text-xl op-30 transition-opacity hover-op-100"})])):r("",!0)],6)}}});export{B as _};
