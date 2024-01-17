
/**
 * 由 Fantastic-admin 提供技术支持
 * Powered by Fantastic-admin
 * Gitee  https://gitee.com/hooray/fantastic-admin
 * Github https://github.com/hooray/fantastic-admin
 */
  
function n(a,s="YYYY-MM-DD hh:mm:ss"){const c=new Date(a).getTime(),t=new Date(c);let e=s.replace("YYYY",t.getFullYear().toString());return e=e.replace("MM",`0${t.getMonth()+1}`.slice(-2)),e=e.replace("DD",`0${t.getDate()}`.slice(-2)),e=e.replace("hh",`0${t.getHours()}`.slice(-2)),e=e.replace("mm",`0${t.getMinutes()}`.slice(-2)),e=e.replace("ss",`0${t.getSeconds()}`.slice(-2)),e}export{n as u};
