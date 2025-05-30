var F=Object.defineProperty;var b=Object.getOwnPropertySymbols;var _=Object.prototype.hasOwnProperty,D=Object.prototype.propertyIsEnumerable;var M=(a,t,e)=>t in a?F(a,t,{enumerable:!0,configurable:!0,writable:!0,value:e}):a[t]=e,C=(a,t)=>{for(var e in t||(t={}))_.call(t,e)&&M(a,e,t[e]);if(b)for(var e of b(t))D.call(t,e)&&M(a,e,t[e]);return a};var A=(a,t,e)=>new Promise((r,s)=>{var o=i=>{try{n(e.next(i))}catch(d){s(d)}},l=i=>{try{n(e.throw(i))}catch(d){s(d)}},n=i=>i.done?r(i.value):Promise.resolve(i.value).then(o,l);n((e=e.apply(a,t)).next())});import{p as P}from"./chunk-4BMEZGHF-450323fc.js";import{D as G,_ as c,s as z,g as V,n as W,o as B,b as H,c as j,l as N,E as w,F as L,t as U,I as X,P as Y}from"./chart-vendor-e1d59b84.js";import{p as Z}from"./mermaid-parser.core-a05879fd.js";import"./utils-vendor-c35799af.js";import"./vue-vendor-d751b0f5.js";import"./_baseUniq-5ee25ed9.js";import"./_basePickBy-a1ec2f81.js";import"./clone-92746810.js";var x={showLegend:!0,ticks:5,max:null,min:0,graticule:"circle"},T={axes:[],curves:[],options:x},h=structuredClone(T),q=G.radar,J=c(()=>w(C(C({},q),L().radar)),"getConfig"),O=c(()=>h.axes,"getAxes"),K=c(()=>h.curves,"getCurves"),Q=c(()=>h.options,"getOptions"),tt=c(a=>{h.axes=a.map(t=>{var e;return{name:t.name,label:(e=t.label)!=null?e:t.name}})},"setAxes"),et=c(a=>{h.curves=a.map(t=>{var e;return{name:t.name,label:(e=t.label)!=null?e:t.name,entries:at(t.entries)}})},"setCurves"),at=c(a=>{if(a[0].axis==null)return a.map(e=>e.value);const t=O();if(t.length===0)throw new Error("Axes must be populated before curves for reference entries");return t.map(e=>{const r=a.find(s=>{var o;return((o=s.axis)==null?void 0:o.$refText)===e.name});if(r===void 0)throw new Error("Missing entry for axis "+e.label);return r.value})},"computeCurveEntries"),rt=c(a=>{var e,r,s,o,l,n,i,d,u,p;const t=a.reduce((g,m)=>(g[m.name]=m,g),{});h.options={showLegend:(r=(e=t.showLegend)==null?void 0:e.value)!=null?r:x.showLegend,ticks:(o=(s=t.ticks)==null?void 0:s.value)!=null?o:x.ticks,max:(n=(l=t.max)==null?void 0:l.value)!=null?n:x.max,min:(d=(i=t.min)==null?void 0:i.value)!=null?d:x.min,graticule:(p=(u=t.graticule)==null?void 0:u.value)!=null?p:x.graticule}},"setOptions"),st=c(()=>{U(),h=structuredClone(T)},"clear"),f={getAxes:O,getCurves:K,getOptions:Q,setAxes:tt,setCurves:et,setOptions:rt,getConfig:J,clear:st,setAccTitle:z,getAccTitle:V,setDiagramTitle:W,getDiagramTitle:B,getAccDescription:H,setAccDescription:j},nt=c(a=>{P(a,f);const{axes:t,curves:e,options:r}=a;f.setAxes(t),f.setCurves(e),f.setOptions(r)},"populate"),ot={parse:c(a=>A(void 0,null,function*(){const t=yield Z("radar",a);N.debug(t),nt(t)}),"parse")},it=c((a,t,e,r)=>{var $;const s=r.db,o=s.getAxes(),l=s.getCurves(),n=s.getOptions(),i=s.getConfig(),d=s.getDiagramTitle(),u=X(t),p=lt(u,i),g=($=n.max)!=null?$:Math.max(...l.map(y=>Math.max(...y.entries))),m=n.min,v=Math.min(i.width,i.height)/2;ct(p,o,v,n.ticks,n.graticule),dt(p,o,v,i),S(p,o,l,m,g,n.graticule,i),R(p,l,n.showLegend,i),p.append("text").attr("class","radarTitle").text(d).attr("x",0).attr("y",-i.height/2-i.marginTop)},"draw"),lt=c((a,t)=>{const e=t.width+t.marginLeft+t.marginRight,r=t.height+t.marginTop+t.marginBottom,s={x:t.marginLeft+t.width/2,y:t.marginTop+t.height/2};return a.attr("viewbox",`0 0 ${e} ${r}`).attr("width",e).attr("height",r),a.append("g").attr("transform",`translate(${s.x}, ${s.y})`)},"drawFrame"),ct=c((a,t,e,r,s)=>{if(s==="circle")for(let o=0;o<r;o++){const l=e*(o+1)/r;a.append("circle").attr("r",l).attr("class","radarGraticule")}else if(s==="polygon"){const o=t.length;for(let l=0;l<r;l++){const n=e*(l+1)/r,i=t.map((d,u)=>{const p=2*u*Math.PI/o-Math.PI/2,g=n*Math.cos(p),m=n*Math.sin(p);return`${g},${m}`}).join(" ");a.append("polygon").attr("points",i).attr("class","radarGraticule")}}},"drawGraticule"),dt=c((a,t,e,r)=>{const s=t.length;for(let o=0;o<s;o++){const l=t[o].label,n=2*o*Math.PI/s-Math.PI/2;a.append("line").attr("x1",0).attr("y1",0).attr("x2",e*r.axisScaleFactor*Math.cos(n)).attr("y2",e*r.axisScaleFactor*Math.sin(n)).attr("class","radarAxisLine"),a.append("text").text(l).attr("x",e*r.axisLabelFactor*Math.cos(n)).attr("y",e*r.axisLabelFactor*Math.sin(n)).attr("class","radarAxisLabel")}},"drawAxes");function S(a,t,e,r,s,o,l){const n=t.length,i=Math.min(l.width,l.height)/2;e.forEach((d,u)=>{if(d.entries.length!==n)return;const p=d.entries.map((g,m)=>{const v=2*Math.PI*m/n-Math.PI/2,$=k(g,r,s,i),y=$*Math.cos(v),E=$*Math.sin(v);return{x:y,y:E}});o==="circle"?a.append("path").attr("d",I(p,l.curveTension)).attr("class",`radarCurve-${u}`):o==="polygon"&&a.append("polygon").attr("points",p.map(g=>`${g.x},${g.y}`).join(" ")).attr("class",`radarCurve-${u}`)})}c(S,"drawCurves");function k(a,t,e,r){const s=Math.min(Math.max(a,t),e);return r*(s-t)/(e-t)}c(k,"relativeRadius");function I(a,t){const e=a.length;let r=`M${a[0].x},${a[0].y}`;for(let s=0;s<e;s++){const o=a[(s-1+e)%e],l=a[s],n=a[(s+1)%e],i=a[(s+2)%e],d={x:l.x+(n.x-o.x)*t,y:l.y+(n.y-o.y)*t},u={x:n.x-(i.x-l.x)*t,y:n.y-(i.y-l.y)*t};r+=` C${d.x},${d.y} ${u.x},${u.y} ${n.x},${n.y}`}return`${r} Z`}c(I,"closedRoundCurve");function R(a,t,e,r){if(!e)return;const s=(r.width/2+r.marginRight)*3/4,o=-(r.height/2+r.marginTop)*3/4,l=20;t.forEach((n,i)=>{const d=a.append("g").attr("transform",`translate(${s}, ${o+i*l})`);d.append("rect").attr("width",12).attr("height",12).attr("class",`radarLegendBox-${i}`),d.append("text").attr("x",16).attr("y",0).attr("class","radarLegendText").text(n.label)})}c(R,"drawLegend");var pt={draw:it},ut=c((a,t)=>{let e="";for(let r=0;r<a.THEME_COLOR_LIMIT;r++){const s=a[`cScale${r}`];e+=`
		.radarCurve-${r} {
			color: ${s};
			fill: ${s};
			fill-opacity: ${t.curveOpacity};
			stroke: ${s};
			stroke-width: ${t.curveStrokeWidth};
		}
		.radarLegendBox-${r} {
			fill: ${s};
			fill-opacity: ${t.curveOpacity};
			stroke: ${s};
		}
		`}return e},"genIndexStyles"),gt=c(a=>{const t=Y(),e=L(),r=w(t,e.themeVariables),s=w(r.radar,a);return{themeVariables:r,radarOptions:s}},"buildRadarStyleOptions"),mt=c(({radar:a}={})=>{const{themeVariables:t,radarOptions:e}=gt(a);return`
	.radarTitle {
		font-size: ${t.fontSize};
		color: ${t.titleColor};
		dominant-baseline: hanging;
		text-anchor: middle;
	}
	.radarAxisLine {
		stroke: ${e.axisColor};
		stroke-width: ${e.axisStrokeWidth};
	}
	.radarAxisLabel {
		dominant-baseline: middle;
		text-anchor: middle;
		font-size: ${e.axisLabelFontSize}px;
		color: ${e.axisColor};
	}
	.radarGraticule {
		fill: ${e.graticuleColor};
		fill-opacity: ${e.graticuleOpacity};
		stroke: ${e.graticuleColor};
		stroke-width: ${e.graticuleStrokeWidth};
	}
	.radarLegendText {
		text-anchor: start;
		font-size: ${e.legendFontSize}px;
		dominant-baseline: hanging;
	}
	${ut(t,e)}
	`},"styles"),Mt={parser:ot,db:f,renderer:pt,styles:mt};export{Mt as diagram};
