
/**
 * 由 Fantastic-admin 提供技术支持
 * Powered by Fantastic-admin
 * Gitee  https://gitee.com/hooray/fantastic-admin
 * Github https://github.com/hooray/fantastic-admin
 */
  
import{d as g,r as v,y as b,x as y,M as k,h as l,o as r,c as x,e as n,f as s,l as c,t as d,b as e,I as u,J as m,V as S,n as V}from"./index-e656eb90.js";const h=g({__name:"index",setup(w){const o=v(!1),t=b();return y(()=>{k.on("global-hotkeys-intro-toggle",()=>{o.value=!o.value})}),(B,i)=>{const a=l("el-descriptions-item"),_=l("el-descriptions"),p=l("el-drawer");return r(),x("div",null,[n(p,{modelValue:e(o),"onUpdate:modelValue":i[0]||(i[0]=f=>S(o)?o.value=f:null),title:"快捷键介绍",direction:"rtl",size:360},{default:s(()=>[n(_,{title:"全局",column:1,border:""},{default:s(()=>[n(a,{label:"查看系统信息"},{default:s(()=>[c(d(e(t).os==="mac"?"⌥":"Alt")+" + I ",1)]),_:1}),e(t).settings.navSearch.enable&&e(t).settings.navSearch.enableHotkeys?(r(),u(a,{key:0,label:"唤起导航搜索"},{default:s(()=>[c(d(e(t).os==="mac"?"⌥":"Alt")+" + S ",1)]),_:1})):m("",!0)]),_:1}),e(t).settings.menu.enableHotkeys&&["side","head"].includes(e(t).settings.menu.menuMode)?(r(),u(_,{key:0,title:"主导航",column:1,border:""},{default:s(()=>[n(a,{label:"激活下一个主导航"},{default:s(()=>[c(d(e(t).os==="mac"?"⌥":"Alt")+" + ` ",1)]),_:1})]),_:1})):m("",!0)]),_:1},8,["modelValue"])])}}});const I=V(h,[["__scopeId","data-v-59fcc97e"]]);export{I as default};
