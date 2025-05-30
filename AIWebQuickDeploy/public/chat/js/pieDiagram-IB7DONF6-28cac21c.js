var F=(e,t,p)=>new Promise((n,o)=>{var m=a=>{try{d(p.next(a))}catch(l){o(l)}},h=a=>{try{d(p.throw(a))}catch(l){o(l)}},d=a=>a.done?n(a.value):Promise.resolve(a.value).then(m,h);d((p=p.apply(e,t)).next())});import{p as U}from"./chunk-4BMEZGHF-450323fc.js";import{D as V,n as Z,o as j,s as q,g as H,c as J,b as K,_ as s,l as $,t as Q,d as X,E as Y,I as ee,L as te,M as G,N as ae,k as re,O as ie}from"./chart-vendor-e1d59b84.js";import{p as se}from"./mermaid-parser.core-a05879fd.js";import"./utils-vendor-c35799af.js";import"./vue-vendor-d751b0f5.js";import"./_baseUniq-5ee25ed9.js";import"./_basePickBy-a1ec2f81.js";import"./clone-92746810.js";var M=V.pie,A={sections:new Map,showData:!1,config:M},D=A.sections,_=A.showData,ne=structuredClone(M),oe=s(()=>structuredClone(ne),"getConfig"),le=s(()=>{D=new Map,_=A.showData,Q()},"clear"),ce=s(({label:e,value:t})=>{D.has(e)||(D.set(e,t),$.debug(`added new section: ${e}, with value: ${t}`))},"addSection"),pe=s(()=>D,"getSections"),de=s(e=>{_=e},"setShowData"),ge=s(()=>_,"getShowData"),O={getConfig:oe,clear:le,setDiagramTitle:Z,getDiagramTitle:j,setAccTitle:q,getAccTitle:H,setAccDescription:J,getAccDescription:K,addSection:ce,getSections:pe,setShowData:de,getShowData:ge},ue=s((e,t)=>{U(e,t),t.setShowData(e.showData),e.sections.map(t.addSection)},"populateDb"),fe={parse:s(e=>F(void 0,null,function*(){const t=yield se("pie",e);$.debug(t),ue(t,O)}),"parse")},me=s(e=>`
  .pieCircle{
    stroke: ${e.pieStrokeColor};
    stroke-width : ${e.pieStrokeWidth};
    opacity : ${e.pieOpacity};
  }
  .pieOuterCircle{
    stroke: ${e.pieOuterStrokeColor};
    stroke-width: ${e.pieOuterStrokeWidth};
    fill: none;
  }
  .pieTitleText {
    text-anchor: middle;
    font-size: ${e.pieTitleTextSize};
    fill: ${e.pieTitleTextColor};
    font-family: ${e.fontFamily};
  }
  .slice {
    font-family: ${e.fontFamily};
    fill: ${e.pieSectionTextColor};
    font-size:${e.pieSectionTextSize};
    // fill: white;
  }
  .legend text {
    fill: ${e.pieLegendTextColor};
    font-family: ${e.fontFamily};
    font-size: ${e.pieLegendTextSize};
  }
`,"getStyles"),he=me,ve=s(e=>{const t=[...e.entries()].map(n=>({label:n[0],value:n[1]})).sort((n,o)=>o.value-n.value);return ie().value(n=>n.value)(t)},"createPieArcs"),Se=s((e,t,p,n)=>{$.debug(`rendering pie chart
`+e);const o=n.db,m=X(),h=Y(o.getConfig(),m.pie),d=40,a=18,l=4,g=450,C=g,w=ee(t),u=w.append("g");u.attr("transform","translate("+C/2+","+g/2+")");const{themeVariables:i}=m;let[v]=te(i.pieOuterStrokeWidth);v!=null||(v=2);const E=h.textPosition,S=Math.min(C,g)/2-d,I=G().innerRadius(0).outerRadius(S),L=G().innerRadius(S*E).outerRadius(S*E);u.append("circle").attr("cx",0).attr("cy",0).attr("r",S+v/2).attr("class","pieOuterCircle");const b=o.getSections(),y=ve(b),P=[i.pie1,i.pie2,i.pie3,i.pie4,i.pie5,i.pie6,i.pie7,i.pie8,i.pie9,i.pie10,i.pie11,i.pie12],f=ae(P);u.selectAll("mySlices").data(y).enter().append("path").attr("d",I).attr("fill",r=>f(r.data.label)).attr("class","pieCircle");let k=0;b.forEach(r=>{k+=r}),u.selectAll("mySlices").data(y).enter().append("text").text(r=>(r.data.value/k*100).toFixed(0)+"%").attr("transform",r=>"translate("+L.centroid(r)+")").style("text-anchor","middle").attr("class","slice"),u.append("text").text(o.getDiagramTitle()).attr("x",0).attr("y",-(g-50)/2).attr("class","pieTitleText");const T=u.selectAll(".legend").data(f.domain()).enter().append("g").attr("class","legend").attr("transform",(r,c)=>{const x=a+l,N=x*f.domain().length/2,W=12*a,B=c*x-N;return"translate("+W+","+B+")"});T.append("rect").attr("width",a).attr("height",a).style("fill",f).style("stroke",f),T.data(y).append("text").attr("x",a+l).attr("y",a-l).text(r=>{const{label:c,value:x}=r.data;return o.getShowData()?`${c} [${x}]`:c});const R=Math.max(...T.selectAll("text").nodes().map(r=>{var c;return(c=r==null?void 0:r.getBoundingClientRect().width)!=null?c:0})),z=C+d+a+l+R;w.attr("viewBox",`0 0 ${z} ${g}`),re(w,g,z,h.useMaxWidth)},"draw"),xe={draw:Se},be={parser:fe,db:O,renderer:xe,styles:he};export{be as diagram};
