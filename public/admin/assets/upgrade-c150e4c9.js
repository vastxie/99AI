
/**
 * 由 Fantastic-admin 提供技术支持
 * Powered by Fantastic-admin
 * Gitee  https://gitee.com/hooray/fantastic-admin
 * Github https://github.com/hooray/fantastic-admin
 */
  
import{_ as h}from"./index-5e1cba81.js";import{a as w}from"./config-33902e1a.js";import{a as y}from"./userBalance-acf40cb3.js";import{d as x,r as i,x as k,w as C,b as r,o as B,c as V,e,f as t,k as N,a as u,h as a,X as S,q as _}from"./index-a4526b0d.js";const q=u("div",{class:"flex justify-between"},[u("b",null,"V1.5版本迁移助手")],-1),D=x({__name:"upgrade",setup(T){const o=i(!0),n=i(!1);async function s(){var l;const c=await w.queryConfig({keys:["upgradeStatus"]});o.value=((l=c.data)==null?void 0:l.upgradeStatus)==="1"}async function d(){n.value=!0,await y.upgradeBalance(),s(),setTimeout(()=>{s(),n.value=!1},3e4)}return k(()=>{s()}),(c,l)=>{const p=a("el-alert"),f=h,m=a("el-button"),g=a("el-tooltip"),b=a("el-card"),v=S("loading");return C((B(),V("div",null,[e(f,null,{default:t(()=>[e(p,{closable:!1,"show-icon":"",title:"V1.5版本迁移助手",description:"如果您是新部署的用户则无需点击、如果是你是老用户升级(1.6版本以下用户)、由于1.5的计费调整、造成了一定破坏性更新、需要在此进行数据迁移、请注意不要刷新网页、当前升级为危险操作、仅可点击一次、点击完成后请等待约一分钟后完成数据同步、我们将会对历史的用户余额、使用额度、基础模型、4、绘画等数据进行迁移、在迁移完成后即可正常工作了、在未迁移前您是无法查看用户管理下面的用户信息的详细余额的、迁移完毕前去访问您可以看到完整的用户信息包含其余额信息！",type:"error"})]),_:1}),e(b,{style:{margin:"20px"}},{header:t(()=>[q]),default:t(()=>[e(g,{content:` ${r(o)?"您已经升级过了、请勿重复操作":"当前升级是危险操作、请勿刷新或重复点击、等待加载完成后再进行其他工作！"}`,placement:"right","show-after":100},{default:t(()=>[e(m,{disabled:r(o),type:"warning",onClick:d},{default:t(()=>[N(" 点击升级 ")]),_:1},8,["disabled"])]),_:1},8,["content"])]),_:1})])),[[v,r(n)]])}}});typeof _=="function"&&_(D);export{D as default};
