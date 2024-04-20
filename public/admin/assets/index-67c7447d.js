
/**
 * 由 Fantastic-admin 提供技术支持
 * Powered by Fantastic-admin
 * Gitee  https://gitee.com/hooray/fantastic-admin
 * Github https://github.com/hooray/fantastic-admin
 */
  
import{d as v,y as C,A as M,r as B,h as T,o as e,I as f,f as p,b as s,c as o,a as n,e as i,m as x,S as h,U as w,J as a,T as N,G as V,t as H,_ as I,n as L}from"./index-e656eb90.js";import R from"./index-9f94fa8a.js";import{T as $}from"./index-ae957cc8.js";import{u as b}from"./useMenu-e606149a.js";import"./index-c0974f86.js";const z={key:0},A={class:"header-container"},D={class:"main"},E=["onClick"],F={key:1},G=v({name:"Header"}),J=v({...G,setup(U){const l=C(),_=M(),{switchTo:k}=b(),d=B();function y(r){d.value.scrollBy({left:(r.deltaY||r.detail)>0?50:-50})}return(r,W)=>{const g=I,S=T("el-icon");return e(),f(N,{name:"header"},{default:p(()=>[s(l).mode==="pc"&&s(l).settings.menu.menuMode==="head"?(e(),o("header",z,[n("div",A,[n("div",D,[i(R),n("div",{ref_key:"navRef",ref:d,class:"nav",onWheel:x(y,["prevent"])},[(e(!0),o(h,null,w(s(_).allMenus,(t,c)=>{var m,u;return e(),o(h,{key:c},[t.children&&t.children.length!==0?(e(),o("div",{key:0,class:V(["item-container",{active:c===s(_).actived}])},[n("div",{class:"item",onClick:Y=>s(k)(c)},[(m=t.meta)!=null&&m.icon?(e(),f(S,{key:0},{default:p(()=>[i(g,{name:t.meta.icon},null,8,["name"])]),_:2},1024)):a("",!0),(u=t.meta)!=null&&u.title?(e(),o("span",F,H(t.meta.title),1)):a("",!0)],8,E)],2)):a("",!0)],64)}),128))],544)]),i($)])])):a("",!0)]),_:1})}}});const Q=L(J,[["__scopeId","data-v-381f1d85"]]);export{Q as default};
