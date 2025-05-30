var z=Object.defineProperty;var x=Object.getOwnPropertySymbols;var P=Object.prototype.hasOwnProperty,W=Object.prototype.propertyIsEnumerable;var C=(t,e,a)=>e in t?z(t,e,{enumerable:!0,configurable:!0,writable:!0,value:a}):t[e]=a,m=(t,e)=>{for(var a in e||(e={}))P.call(e,a)&&C(t,a,e[a]);if(x)for(var a of x(e))W.call(e,a)&&C(t,a,e[a]);return t};var $=(t,e,a)=>new Promise((i,n)=>{var o=l=>{try{c(a.next(l))}catch(s){n(s)}},r=l=>{try{c(a.throw(l))}catch(s){n(s)}},c=l=>l.done?i(l.value):Promise.resolve(l.value).then(o,r);c((a=a.apply(t,e)).next())});import{p as D}from"./chunk-4BMEZGHF-450323fc.js";import{D as T,s as E,g as _,n as A,o as N,b as I,c as L,_ as p,l as y,E as w,F as Y,t as M,I as O,k as G}from"./chart-vendor-e1d59b84.js";import{p as H}from"./mermaid-parser.core-a05879fd.js";import"./utils-vendor-c35799af.js";import"./vue-vendor-d751b0f5.js";import"./_baseUniq-5ee25ed9.js";import"./_basePickBy-a1ec2f81.js";import"./clone-92746810.js";var B={packet:[]},v=structuredClone(B),K=T.packet,R=p(()=>{const t=w(m(m({},K),Y().packet));return t.showBits&&(t.paddingY+=10),t},"getConfig"),U=p(()=>v.packet,"getPacket"),X=p(t=>{t.length>0&&v.packet.push(t)},"pushWord"),j=p(()=>{M(),v=structuredClone(B)},"clear"),h={pushWord:X,getPacket:U,getConfig:R,clear:j,setAccTitle:E,getAccTitle:_,setDiagramTitle:A,getDiagramTitle:N,getAccDescription:I,setAccDescription:L},q=1e4,J=p(t=>{D(t,h);let e=-1,a=[],i=1;const{bitsPerRow:n}=h.getConfig();for(let{start:o,end:r,label:c}of t.blocks){if(r&&r<o)throw new Error(`Packet block ${o} - ${r} is invalid. End must be greater than start.`);if(o!==e+1)throw new Error(`Packet block ${o} - ${r!=null?r:o} is not contiguous. It should start from ${e+1}.`);for(e=r!=null?r:o,y.debug(`Packet block ${o} - ${e} with label ${c}`);a.length<=n+1&&h.getPacket().length<q;){const[l,s]=Q({start:o,end:r,label:c},i,n);if(a.push(l),l.end+1===i*n&&(h.pushWord(a),a=[],i++),!s)break;({start:o,end:r,label:c}=s)}}h.pushWord(a)},"populate"),Q=p((t,e,a)=>{if(t.end===void 0&&(t.end=t.start),t.start>t.end)throw new Error(`Block start ${t.start} is greater than block end ${t.end}.`);return t.end+1<=e*a?[t,void 0]:[{start:t.start,end:e*a-1,label:t.label},{start:e*a,end:t.end,label:t.label}]},"getNextFittingBlock"),V={parse:p(t=>$(void 0,null,function*(){const e=yield H("packet",t);y.debug(e),J(e)}),"parse")},Z=p((t,e,a,i)=>{const n=i.db,o=n.getConfig(),{rowHeight:r,paddingY:c,bitWidth:l,bitsPerRow:s}=o,u=n.getPacket(),d=n.getDiagramTitle(),k=r+c,g=k*(u.length+1)-(d?0:r),f=l*s+2,b=O(e);b.attr("viewbox",`0 0 ${f} ${g}`),G(b,g,f,o.useMaxWidth);for(const[S,F]of u.entries())tt(b,F,S,o);b.append("text").text(d).attr("x",f/2).attr("y",g-k/2).attr("dominant-baseline","middle").attr("text-anchor","middle").attr("class","packetTitle")},"draw"),tt=p((t,e,a,{rowHeight:i,paddingX:n,paddingY:o,bitWidth:r,bitsPerRow:c,showBits:l})=>{const s=t.append("g"),u=a*(i+o)+o;for(const d of e){const k=d.start%c*r+1,g=(d.end-d.start+1)*r-n;if(s.append("rect").attr("x",k).attr("y",u).attr("width",g).attr("height",i).attr("class","packetBlock"),s.append("text").attr("x",k+g/2).attr("y",u+i/2).attr("class","packetLabel").attr("dominant-baseline","middle").attr("text-anchor","middle").text(d.label),!l)continue;const f=d.end===d.start,b=u-2;s.append("text").attr("x",k+(f?g/2:0)).attr("y",b).attr("class","packetByte start").attr("dominant-baseline","auto").attr("text-anchor",f?"middle":"start").text(d.start),f||s.append("text").attr("x",k+g).attr("y",b).attr("class","packetByte end").attr("dominant-baseline","auto").attr("text-anchor","end").text(d.end)}},"drawWord"),et={draw:Z},at={byteFontSize:"10px",startByteColor:"black",endByteColor:"black",labelColor:"black",labelFontSize:"12px",titleColor:"black",titleFontSize:"14px",blockStrokeColor:"black",blockStrokeWidth:"1",blockFillColor:"#efefef"},rt=p(({packet:t}={})=>{const e=w(at,t);return`
	.packetByte {
		font-size: ${e.byteFontSize};
	}
	.packetByte.start {
		fill: ${e.startByteColor};
	}
	.packetByte.end {
		fill: ${e.endByteColor};
	}
	.packetLabel {
		fill: ${e.labelColor};
		font-size: ${e.labelFontSize};
	}
	.packetTitle {
		fill: ${e.titleColor};
		font-size: ${e.titleFontSize};
	}
	.packetBlock {
		stroke: ${e.blockStrokeColor};
		stroke-width: ${e.blockStrokeWidth};
		fill: ${e.blockFillColor};
	}
	`},"styles"),kt={parser:V,db:h,renderer:et,styles:rt};export{kt as diagram};
