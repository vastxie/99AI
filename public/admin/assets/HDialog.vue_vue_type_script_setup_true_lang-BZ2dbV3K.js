
/**
 * 由 Fantastic-admin 提供技术支持
 * Powered by Fantastic-admin
 * https://fantastic-admin.github.io
 */

import{d as h,as as i,at as w,U as b,r as k,n as C,g as d,z as B,w as t,b as s,i as e,ah as p,ai as c,e as o,Q as V,aj as T,au as j,h as S,t as F,al as N,P as u,c as $,A as z,an as M,ao as D,j as P}from"./index-nGFMSQGw.js";const A={class:"fixed inset-0 overflow-y-auto"},E={class:"min-h-full flex items-end justify-center p-4 text-center lg-items-center"},G={flex:"~ items-center justify-between","px-4":"","py-3":"","border-b":"~ solid stone/15","text-6":""},H={key:0,flex:"~ items-center justify-end","px-4":"","py-3":"","border-t":"~ solid stone/15"},O=h({__name:"HDialog",props:i({appear:{type:Boolean,default:!1},title:{},preventClose:{type:Boolean,default:!1},overlay:{type:Boolean,default:!1}},{modelValue:{type:Boolean,default:!1},modelModifiers:{}}),emits:i(["close"],["update:modelValue"]),setup(f,{emit:m}){const y=m,l=w(f,"modelValue"),v=b(),g=k({enter:"ease-in-out duration-500",enterFrom:"opacity-0",enterTo:"opacity-100",leave:"ease-in-out duration-500",leaveFrom:"opacity-100",leaveTo:"opacity-0"}),x=C(()=>({enter:"ease-out duration-300",enterFrom:"opacity-0 translate-y-4 lg-translate-y-0 lg-scale-95",enterTo:"opacity-100 translate-y-0 lg-scale-100",leave:"ease-in duration-200",leaveFrom:"opacity-100 translate-y-0 lg-scale-100",leaveTo:"opacity-0 translate-y-4 lg-translate-y-0 lg-scale-95"}));function n(){l.value=!1,y("close")}return(a,r)=>{const _=P;return d(),B(e(D),{as:"template",appear:a.appear,show:l.value},{default:t(()=>[s(e(M),{class:"fixed inset-0 z-2000 flex",onClose:r[0]||(r[0]=I=>!a.preventClose&&n())},{default:t(()=>[s(e(p),c({as:"template",appear:a.appear},e(g)),{default:t(()=>[o("div",{class:V(["fixed inset-0 bg-stone-2/75 transition-opacity dark-bg-stone-8/75",{"backdrop-blur-sm":a.overlay}])},null,2)]),_:1},16,["appear"]),o("div",A,[o("div",E,[s(e(p),c({as:"template",appear:a.appear},e(x)),{default:t(()=>[s(e(T),{class:"relative w-full flex flex-col overflow-hidden rounded-xl bg-white text-left shadow-xl lg-my-8 lg-max-w-lg dark-bg-stone-8"},{default:t(()=>[o("div",G,[s(e(j),{"m-0":"","text-lg":"","text-dark":"","dark-text-white":""},{default:t(()=>[S(F(a.title),1)]),_:1}),s(_,{name:"i-carbon:close","cursor-pointer":"",onClick:n})]),s(e(N),{"m-0":"","overflow-y-auto":"","p-4":""},{default:t(()=>[u(a.$slots,"default")]),_:3}),e(v).footer?(d(),$("div",H,[u(a.$slots,"footer")])):z("",!0)]),_:3})]),_:3},16,["appear"])])])]),_:3})]),_:3},8,["appear","show"])}}});export{O as _};