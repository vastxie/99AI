
/**
 * 由 Fantastic-admin 提供技术支持
 * Powered by Fantastic-admin
 * Gitee  https://gitee.com/hooray/fantastic-admin
 * Github https://github.com/hooray/fantastic-admin
 */
  
import{d as _,O as f,r as g,o as a,c as s,N as c,R as y,k as v,t as h,J as i,b as o,e as r,f as k,G as C,H as S,_ as x,h as N,n as w}from"./index-4eef28ae.js";const B={key:0,class:"title-container"},V=_({name:"PageMain"}),$=_({...V,props:{title:{type:String,default:""},collaspe:{type:Boolean,default:!1},height:{type:String,default:""}},setup(e){const d=e,n=!!f().title,t=g(d.collaspe);function p(){t.value=!1}return(l,z)=>{const u=x,m=N("el-icon");return a(),s("div",{class:C(["page-main",{"is-collaspe":o(t)}]),style:S({height:o(t)?e.height:""})},[n||e.title?(a(),s("div",B,[n?c(l.$slots,"title",{key:0},void 0,!0):(a(),s(y,{key:1},[v(h(e.title),1)],64))])):i("",!0),c(l.$slots,"default",{},void 0,!0),o(t)?(a(),s("div",{key:1,class:"collaspe",title:"展开",onClick:p},[r(m,null,{default:k(()=>[r(u,{name:"ep:arrow-down"})]),_:1})])):i("",!0)],6)}}});const b=w($,[["__scopeId","data-v-847d7a8d"]]);export{b as _};
