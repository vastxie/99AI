
/**
 * 由 Fantastic-admin 提供技术支持
 * Powered by Fantastic-admin
 * https://fantastic-admin.github.io
 */

function e(e,t="YYYY-MM-DD hh:mm:ss"){const c=new Date(e).getTime(),l=new Date(c);let s=t.replace("YYYY",l.getFullYear().toString());return s=s.replace("MM",`0${l.getMonth()+1}`.slice(-2)),s=s.replace("DD",`0${l.getDate()}`.slice(-2)),s=s.replace("hh",`0${l.getHours()}`.slice(-2)),s=s.replace("mm",`0${l.getMinutes()}`.slice(-2)),s=s.replace("ss",`0${l.getSeconds()}`.slice(-2)),s}export{e as u};
