
/**
 * 由 Fantastic-admin 提供技术支持
 * Powered by Fantastic-admin
 * https://fantastic-admin.github.io
 */

import{d as e,aS as a,aT as s,a0 as t,c as i,e as l,V as o,W as n,a6 as d,a2 as r,_ as u,h as c,t as b}from"./index-BERX8Mlm.js";const m={class:"inline-flex select-none items-center justify-center of-hidden rounded-md bg-stone-3 dark-bg-stone-7"},p=["disabled","onClick"],x=e({__name:"HCheckList",props:a({options:{},disabled:{type:Boolean,default:!1}},{modelValue:{},modelModifiers:{}}),emits:a(["change"],["update:modelValue"]),setup(e,{emit:a}){const x=a,y=s(e,"modelValue");return t(y,(e=>{x("change",e)})),(e,a)=>{const s=u;return l(),i("div",m,[(l(!0),i(o,null,n(e.options,(a=>(l(),i("button",{key:a.value,disabled:e.disabled||a.disabled,class:d(["flex cursor-pointer items-center truncate border-size-0 bg-inherit px-2 py-1.5 text-sm disabled-cursor-not-allowed disabled-opacity-50 hover-not-disabled-bg-ui-primary hover-not-disabled-text-ui-text",{"text-ui-text bg-ui-primary":y.value===a.value}]),onClick:e=>y.value=a.value},[a.icon?(l(),r(s,{key:0,name:a.icon},null,8,["name"])):(l(),i(o,{key:1},[c(b(a.label),1)],64))],10,p)))),128))])}}});export{x as _};
