var ae=Object.defineProperty;var ne=(e,t,s)=>t in e?ae(e,t,{enumerable:!0,configurable:!0,writable:!0,value:s}):e[t]=s;var b=(e,t,s)=>(ne(e,typeof t!="symbol"?t+"":t,s),s);var Rt=(e,t,s)=>new Promise((a,o)=>{var h=c=>{try{u(s.next(c))}catch(y){o(y)}},r=c=>{try{u(s.throw(c))}catch(y){o(y)}},u=c=>c.done?a(c.value):Promise.resolve(c.value).then(h,r);u((s=s.apply(e,t)).next())});import{g as le,s as oe}from"./chunk-RZ5BOZE2-2248c621.js";import{_ as p,l as v,$ as ce,d as A,e as j,t as he,g as ue,s as de,b as fe,c as pe,n as Se,o as ye,z as ge,u as Te}from"./chart-vendor-e1d59b84.js";var bt=function(){var e=p(function(P,l,d,n){for(d=d||{},n=P.length;n--;d[P[n]]=l);return d},"o"),t=[1,2],s=[1,3],a=[1,4],o=[2,4],h=[1,9],r=[1,11],u=[1,16],c=[1,17],y=[1,18],E=[1,19],m=[1,32],I=[1,20],G=[1,21],R=[1,22],S=[1,23],L=[1,24],O=[1,26],Y=[1,27],F=[1,28],w=[1,29],$=[1,30],et=[1,31],st=[1,34],it=[1,35],rt=[1,36],at=[1,37],X=[1,33],g=[1,4,5,16,17,19,21,22,24,25,26,27,28,29,33,35,37,38,42,45,48,49,50,51,54],nt=[1,4,5,14,15,16,17,19,21,22,24,25,26,27,28,29,33,35,37,38,42,45,48,49,50,51,54],At=[4,5,16,17,19,21,22,24,25,26,27,28,29,33,35,37,38,42,45,48,49,50,51,54],St={trace:p(function(){},"trace"),yy:{},symbols_:{error:2,start:3,SPACE:4,NL:5,SD:6,document:7,line:8,statement:9,classDefStatement:10,styleStatement:11,cssClassStatement:12,idStatement:13,DESCR:14,"-->":15,HIDE_EMPTY:16,scale:17,WIDTH:18,COMPOSIT_STATE:19,STRUCT_START:20,STRUCT_STOP:21,STATE_DESCR:22,AS:23,ID:24,FORK:25,JOIN:26,CHOICE:27,CONCURRENT:28,note:29,notePosition:30,NOTE_TEXT:31,direction:32,acc_title:33,acc_title_value:34,acc_descr:35,acc_descr_value:36,acc_descr_multiline_value:37,classDef:38,CLASSDEF_ID:39,CLASSDEF_STYLEOPTS:40,DEFAULT:41,style:42,STYLE_IDS:43,STYLEDEF_STYLEOPTS:44,class:45,CLASSENTITY_IDS:46,STYLECLASS:47,direction_tb:48,direction_bt:49,direction_rl:50,direction_lr:51,eol:52,";":53,EDGE_STATE:54,STYLE_SEPARATOR:55,left_of:56,right_of:57,$accept:0,$end:1},terminals_:{2:"error",4:"SPACE",5:"NL",6:"SD",14:"DESCR",15:"-->",16:"HIDE_EMPTY",17:"scale",18:"WIDTH",19:"COMPOSIT_STATE",20:"STRUCT_START",21:"STRUCT_STOP",22:"STATE_DESCR",23:"AS",24:"ID",25:"FORK",26:"JOIN",27:"CHOICE",28:"CONCURRENT",29:"note",31:"NOTE_TEXT",33:"acc_title",34:"acc_title_value",35:"acc_descr",36:"acc_descr_value",37:"acc_descr_multiline_value",38:"classDef",39:"CLASSDEF_ID",40:"CLASSDEF_STYLEOPTS",41:"DEFAULT",42:"style",43:"STYLE_IDS",44:"STYLEDEF_STYLEOPTS",45:"class",46:"CLASSENTITY_IDS",47:"STYLECLASS",48:"direction_tb",49:"direction_bt",50:"direction_rl",51:"direction_lr",53:";",54:"EDGE_STATE",55:"STYLE_SEPARATOR",56:"left_of",57:"right_of"},productions_:[0,[3,2],[3,2],[3,2],[7,0],[7,2],[8,2],[8,1],[8,1],[9,1],[9,1],[9,1],[9,1],[9,2],[9,3],[9,4],[9,1],[9,2],[9,1],[9,4],[9,3],[9,6],[9,1],[9,1],[9,1],[9,1],[9,4],[9,4],[9,1],[9,2],[9,2],[9,1],[10,3],[10,3],[11,3],[12,3],[32,1],[32,1],[32,1],[32,1],[52,1],[52,1],[13,1],[13,1],[13,3],[13,3],[30,1],[30,1]],performAction:p(function(l,d,n,T,_,i,K){var f=i.length-1;switch(_){case 3:return T.setRootDoc(i[f]),i[f];case 4:this.$=[];break;case 5:i[f]!="nl"&&(i[f-1].push(i[f]),this.$=i[f-1]);break;case 6:case 7:this.$=i[f];break;case 8:this.$="nl";break;case 12:this.$=i[f];break;case 13:const J=i[f-1];J.description=T.trimColon(i[f]),this.$=J;break;case 14:this.$={stmt:"relation",state1:i[f-2],state2:i[f]};break;case 15:const yt=T.trimColon(i[f]);this.$={stmt:"relation",state1:i[f-3],state2:i[f-1],description:yt};break;case 19:this.$={stmt:"state",id:i[f-3],type:"default",description:"",doc:i[f-1]};break;case 20:var V=i[f],z=i[f-2].trim();if(i[f].match(":")){var ot=i[f].split(":");V=ot[0],z=[z,ot[1]]}this.$={stmt:"state",id:V,type:"default",description:z};break;case 21:this.$={stmt:"state",id:i[f-3],type:"default",description:i[f-5],doc:i[f-1]};break;case 22:this.$={stmt:"state",id:i[f],type:"fork"};break;case 23:this.$={stmt:"state",id:i[f],type:"join"};break;case 24:this.$={stmt:"state",id:i[f],type:"choice"};break;case 25:this.$={stmt:"state",id:T.getDividerId(),type:"divider"};break;case 26:this.$={stmt:"state",id:i[f-1].trim(),note:{position:i[f-2].trim(),text:i[f].trim()}};break;case 29:this.$=i[f].trim(),T.setAccTitle(this.$);break;case 30:case 31:this.$=i[f].trim(),T.setAccDescription(this.$);break;case 32:case 33:this.$={stmt:"classDef",id:i[f-1].trim(),classes:i[f].trim()};break;case 34:this.$={stmt:"style",id:i[f-1].trim(),styleClass:i[f].trim()};break;case 35:this.$={stmt:"applyClass",id:i[f-1].trim(),styleClass:i[f].trim()};break;case 36:T.setDirection("TB"),this.$={stmt:"dir",value:"TB"};break;case 37:T.setDirection("BT"),this.$={stmt:"dir",value:"BT"};break;case 38:T.setDirection("RL"),this.$={stmt:"dir",value:"RL"};break;case 39:T.setDirection("LR"),this.$={stmt:"dir",value:"LR"};break;case 42:case 43:this.$={stmt:"state",id:i[f].trim(),type:"default",description:""};break;case 44:this.$={stmt:"state",id:i[f-2].trim(),classes:[i[f].trim()],type:"default",description:""};break;case 45:this.$={stmt:"state",id:i[f-2].trim(),classes:[i[f].trim()],type:"default",description:""};break}},"anonymous"),table:[{3:1,4:t,5:s,6:a},{1:[3]},{3:5,4:t,5:s,6:a},{3:6,4:t,5:s,6:a},e([1,4,5,16,17,19,22,24,25,26,27,28,29,33,35,37,38,42,45,48,49,50,51,54],o,{7:7}),{1:[2,1]},{1:[2,2]},{1:[2,3],4:h,5:r,8:8,9:10,10:12,11:13,12:14,13:15,16:u,17:c,19:y,22:E,24:m,25:I,26:G,27:R,28:S,29:L,32:25,33:O,35:Y,37:F,38:w,42:$,45:et,48:st,49:it,50:rt,51:at,54:X},e(g,[2,5]),{9:38,10:12,11:13,12:14,13:15,16:u,17:c,19:y,22:E,24:m,25:I,26:G,27:R,28:S,29:L,32:25,33:O,35:Y,37:F,38:w,42:$,45:et,48:st,49:it,50:rt,51:at,54:X},e(g,[2,7]),e(g,[2,8]),e(g,[2,9]),e(g,[2,10]),e(g,[2,11]),e(g,[2,12],{14:[1,39],15:[1,40]}),e(g,[2,16]),{18:[1,41]},e(g,[2,18],{20:[1,42]}),{23:[1,43]},e(g,[2,22]),e(g,[2,23]),e(g,[2,24]),e(g,[2,25]),{30:44,31:[1,45],56:[1,46],57:[1,47]},e(g,[2,28]),{34:[1,48]},{36:[1,49]},e(g,[2,31]),{39:[1,50],41:[1,51]},{43:[1,52]},{46:[1,53]},e(nt,[2,42],{55:[1,54]}),e(nt,[2,43],{55:[1,55]}),e(g,[2,36]),e(g,[2,37]),e(g,[2,38]),e(g,[2,39]),e(g,[2,6]),e(g,[2,13]),{13:56,24:m,54:X},e(g,[2,17]),e(At,o,{7:57}),{24:[1,58]},{24:[1,59]},{23:[1,60]},{24:[2,46]},{24:[2,47]},e(g,[2,29]),e(g,[2,30]),{40:[1,61]},{40:[1,62]},{44:[1,63]},{47:[1,64]},{24:[1,65]},{24:[1,66]},e(g,[2,14],{14:[1,67]}),{4:h,5:r,8:8,9:10,10:12,11:13,12:14,13:15,16:u,17:c,19:y,21:[1,68],22:E,24:m,25:I,26:G,27:R,28:S,29:L,32:25,33:O,35:Y,37:F,38:w,42:$,45:et,48:st,49:it,50:rt,51:at,54:X},e(g,[2,20],{20:[1,69]}),{31:[1,70]},{24:[1,71]},e(g,[2,32]),e(g,[2,33]),e(g,[2,34]),e(g,[2,35]),e(nt,[2,44]),e(nt,[2,45]),e(g,[2,15]),e(g,[2,19]),e(At,o,{7:72}),e(g,[2,26]),e(g,[2,27]),{4:h,5:r,8:8,9:10,10:12,11:13,12:14,13:15,16:u,17:c,19:y,21:[1,73],22:E,24:m,25:I,26:G,27:R,28:S,29:L,32:25,33:O,35:Y,37:F,38:w,42:$,45:et,48:st,49:it,50:rt,51:at,54:X},e(g,[2,21])],defaultActions:{5:[2,1],6:[2,2],46:[2,46],47:[2,47]},parseError:p(function(l,d){if(d.recoverable)this.trace(l);else{var n=new Error(l);throw n.hash=d,n}},"parseError"),parse:p(function(l){var d=this,n=[0],T=[],_=[null],i=[],K=this.table,f="",V=0,z=0,ot=2,J=1,yt=i.slice.call(arguments,1),D=Object.create(this.lexer),M={yy:{}};for(var gt in this.yy)Object.prototype.hasOwnProperty.call(this.yy,gt)&&(M.yy[gt]=this.yy[gt]);D.setInput(l,M.yy),M.yy.lexer=D,M.yy.parser=this,typeof D.yylloc=="undefined"&&(D.yylloc={});var Tt=D.yylloc;i.push(Tt);var ie=D.options&&D.options.ranges;typeof M.yy.parseError=="function"?this.parseError=M.yy.parseError:this.parseError=Object.getPrototypeOf(this).parseError;function re(C){n.length=n.length-2*C,_.length=_.length-C,i.length=i.length-C}p(re,"popStack");function Lt(){var C;return C=T.pop()||D.lex()||J,typeof C!="number"&&(C instanceof Array&&(T=C,C=T.pop()),C=d.symbols_[C]||C),C}p(Lt,"lex");for(var k,U,x,_t,H={},ct,N,It,ht;;){if(U=n[n.length-1],this.defaultActions[U]?x=this.defaultActions[U]:((k===null||typeof k=="undefined")&&(k=Lt()),x=K[U]&&K[U][k]),typeof x=="undefined"||!x.length||!x[0]){var Et="";ht=[];for(ct in K[U])this.terminals_[ct]&&ct>ot&&ht.push("'"+this.terminals_[ct]+"'");D.showPosition?Et="Parse error on line "+(V+1)+`:
`+D.showPosition()+`
Expecting `+ht.join(", ")+", got '"+(this.terminals_[k]||k)+"'":Et="Parse error on line "+(V+1)+": Unexpected "+(k==J?"end of input":"'"+(this.terminals_[k]||k)+"'"),this.parseError(Et,{text:D.match,token:this.terminals_[k]||k,line:D.yylineno,loc:Tt,expected:ht})}if(x[0]instanceof Array&&x.length>1)throw new Error("Parse Error: multiple actions possible at state: "+U+", token: "+k);switch(x[0]){case 1:n.push(k),_.push(D.yytext),i.push(D.yylloc),n.push(x[1]),k=null,z=D.yyleng,f=D.yytext,V=D.yylineno,Tt=D.yylloc;break;case 2:if(N=this.productions_[x[1]][1],H.$=_[_.length-N],H._$={first_line:i[i.length-(N||1)].first_line,last_line:i[i.length-1].last_line,first_column:i[i.length-(N||1)].first_column,last_column:i[i.length-1].last_column},ie&&(H._$.range=[i[i.length-(N||1)].range[0],i[i.length-1].range[1]]),_t=this.performAction.apply(H,[f,z,V,M.yy,x[1],_,i].concat(yt)),typeof _t!="undefined")return _t;N&&(n=n.slice(0,-1*N*2),_=_.slice(0,-1*N),i=i.slice(0,-1*N)),n.push(this.productions_[x[1]][0]),_.push(H.$),i.push(H._$),It=K[n[n.length-2]][n[n.length-1]],n.push(It);break;case 3:return!0}}return!0},"parse")},se=function(){var P={EOF:1,parseError:p(function(d,n){if(this.yy.parser)this.yy.parser.parseError(d,n);else throw new Error(d)},"parseError"),setInput:p(function(l,d){return this.yy=d||this.yy||{},this._input=l,this._more=this._backtrack=this.done=!1,this.yylineno=this.yyleng=0,this.yytext=this.matched=this.match="",this.conditionStack=["INITIAL"],this.yylloc={first_line:1,first_column:0,last_line:1,last_column:0},this.options.ranges&&(this.yylloc.range=[0,0]),this.offset=0,this},"setInput"),input:p(function(){var l=this._input[0];this.yytext+=l,this.yyleng++,this.offset++,this.match+=l,this.matched+=l;var d=l.match(/(?:\r\n?|\n).*/g);return d?(this.yylineno++,this.yylloc.last_line++):this.yylloc.last_column++,this.options.ranges&&this.yylloc.range[1]++,this._input=this._input.slice(1),l},"input"),unput:p(function(l){var d=l.length,n=l.split(/(?:\r\n?|\n)/g);this._input=l+this._input,this.yytext=this.yytext.substr(0,this.yytext.length-d),this.offset-=d;var T=this.match.split(/(?:\r\n?|\n)/g);this.match=this.match.substr(0,this.match.length-1),this.matched=this.matched.substr(0,this.matched.length-1),n.length-1&&(this.yylineno-=n.length-1);var _=this.yylloc.range;return this.yylloc={first_line:this.yylloc.first_line,last_line:this.yylineno+1,first_column:this.yylloc.first_column,last_column:n?(n.length===T.length?this.yylloc.first_column:0)+T[T.length-n.length].length-n[0].length:this.yylloc.first_column-d},this.options.ranges&&(this.yylloc.range=[_[0],_[0]+this.yyleng-d]),this.yyleng=this.yytext.length,this},"unput"),more:p(function(){return this._more=!0,this},"more"),reject:p(function(){if(this.options.backtrack_lexer)this._backtrack=!0;else return this.parseError("Lexical error on line "+(this.yylineno+1)+`. You can only invoke reject() in the lexer when the lexer is of the backtracking persuasion (options.backtrack_lexer = true).
`+this.showPosition(),{text:"",token:null,line:this.yylineno});return this},"reject"),less:p(function(l){this.unput(this.match.slice(l))},"less"),pastInput:p(function(){var l=this.matched.substr(0,this.matched.length-this.match.length);return(l.length>20?"...":"")+l.substr(-20).replace(/\n/g,"")},"pastInput"),upcomingInput:p(function(){var l=this.match;return l.length<20&&(l+=this._input.substr(0,20-l.length)),(l.substr(0,20)+(l.length>20?"...":"")).replace(/\n/g,"")},"upcomingInput"),showPosition:p(function(){var l=this.pastInput(),d=new Array(l.length+1).join("-");return l+this.upcomingInput()+`
`+d+"^"},"showPosition"),test_match:p(function(l,d){var n,T,_;if(this.options.backtrack_lexer&&(_={yylineno:this.yylineno,yylloc:{first_line:this.yylloc.first_line,last_line:this.last_line,first_column:this.yylloc.first_column,last_column:this.yylloc.last_column},yytext:this.yytext,match:this.match,matches:this.matches,matched:this.matched,yyleng:this.yyleng,offset:this.offset,_more:this._more,_input:this._input,yy:this.yy,conditionStack:this.conditionStack.slice(0),done:this.done},this.options.ranges&&(_.yylloc.range=this.yylloc.range.slice(0))),T=l[0].match(/(?:\r\n?|\n).*/g),T&&(this.yylineno+=T.length),this.yylloc={first_line:this.yylloc.last_line,last_line:this.yylineno+1,first_column:this.yylloc.last_column,last_column:T?T[T.length-1].length-T[T.length-1].match(/\r?\n?/)[0].length:this.yylloc.last_column+l[0].length},this.yytext+=l[0],this.match+=l[0],this.matches=l,this.yyleng=this.yytext.length,this.options.ranges&&(this.yylloc.range=[this.offset,this.offset+=this.yyleng]),this._more=!1,this._backtrack=!1,this._input=this._input.slice(l[0].length),this.matched+=l[0],n=this.performAction.call(this,this.yy,this,d,this.conditionStack[this.conditionStack.length-1]),this.done&&this._input&&(this.done=!1),n)return n;if(this._backtrack){for(var i in _)this[i]=_[i];return!1}return!1},"test_match"),next:p(function(){if(this.done)return this.EOF;this._input||(this.done=!0);var l,d,n,T;this._more||(this.yytext="",this.match="");for(var _=this._currentRules(),i=0;i<_.length;i++)if(n=this._input.match(this.rules[_[i]]),n&&(!d||n[0].length>d[0].length)){if(d=n,T=i,this.options.backtrack_lexer){if(l=this.test_match(n,_[i]),l!==!1)return l;if(this._backtrack){d=!1;continue}else return!1}else if(!this.options.flex)break}return d?(l=this.test_match(d,_[T]),l!==!1?l:!1):this._input===""?this.EOF:this.parseError("Lexical error on line "+(this.yylineno+1)+`. Unrecognized text.
`+this.showPosition(),{text:"",token:null,line:this.yylineno})},"next"),lex:p(function(){var d=this.next();return d||this.lex()},"lex"),begin:p(function(d){this.conditionStack.push(d)},"begin"),popState:p(function(){var d=this.conditionStack.length-1;return d>0?this.conditionStack.pop():this.conditionStack[0]},"popState"),_currentRules:p(function(){return this.conditionStack.length&&this.conditionStack[this.conditionStack.length-1]?this.conditions[this.conditionStack[this.conditionStack.length-1]].rules:this.conditions.INITIAL.rules},"_currentRules"),topState:p(function(d){return d=this.conditionStack.length-1-Math.abs(d||0),d>=0?this.conditionStack[d]:"INITIAL"},"topState"),pushState:p(function(d){this.begin(d)},"pushState"),stateStackSize:p(function(){return this.conditionStack.length},"stateStackSize"),options:{"case-insensitive":!0},performAction:p(function(d,n,T,_){switch(T){case 0:return 41;case 1:return 48;case 2:return 49;case 3:return 50;case 4:return 51;case 5:break;case 6:break;case 7:return 5;case 8:break;case 9:break;case 10:break;case 11:break;case 12:return this.pushState("SCALE"),17;case 13:return 18;case 14:this.popState();break;case 15:return this.begin("acc_title"),33;case 16:return this.popState(),"acc_title_value";case 17:return this.begin("acc_descr"),35;case 18:return this.popState(),"acc_descr_value";case 19:this.begin("acc_descr_multiline");break;case 20:this.popState();break;case 21:return"acc_descr_multiline_value";case 22:return this.pushState("CLASSDEF"),38;case 23:return this.popState(),this.pushState("CLASSDEFID"),"DEFAULT_CLASSDEF_ID";case 24:return this.popState(),this.pushState("CLASSDEFID"),39;case 25:return this.popState(),40;case 26:return this.pushState("CLASS"),45;case 27:return this.popState(),this.pushState("CLASS_STYLE"),46;case 28:return this.popState(),47;case 29:return this.pushState("STYLE"),42;case 30:return this.popState(),this.pushState("STYLEDEF_STYLES"),43;case 31:return this.popState(),44;case 32:return this.pushState("SCALE"),17;case 33:return 18;case 34:this.popState();break;case 35:this.pushState("STATE");break;case 36:return this.popState(),n.yytext=n.yytext.slice(0,-8).trim(),25;case 37:return this.popState(),n.yytext=n.yytext.slice(0,-8).trim(),26;case 38:return this.popState(),n.yytext=n.yytext.slice(0,-10).trim(),27;case 39:return this.popState(),n.yytext=n.yytext.slice(0,-8).trim(),25;case 40:return this.popState(),n.yytext=n.yytext.slice(0,-8).trim(),26;case 41:return this.popState(),n.yytext=n.yytext.slice(0,-10).trim(),27;case 42:return 48;case 43:return 49;case 44:return 50;case 45:return 51;case 46:this.pushState("STATE_STRING");break;case 47:return this.pushState("STATE_ID"),"AS";case 48:return this.popState(),"ID";case 49:this.popState();break;case 50:return"STATE_DESCR";case 51:return 19;case 52:this.popState();break;case 53:return this.popState(),this.pushState("struct"),20;case 54:break;case 55:return this.popState(),21;case 56:break;case 57:return this.begin("NOTE"),29;case 58:return this.popState(),this.pushState("NOTE_ID"),56;case 59:return this.popState(),this.pushState("NOTE_ID"),57;case 60:this.popState(),this.pushState("FLOATING_NOTE");break;case 61:return this.popState(),this.pushState("FLOATING_NOTE_ID"),"AS";case 62:break;case 63:return"NOTE_TEXT";case 64:return this.popState(),"ID";case 65:return this.popState(),this.pushState("NOTE_TEXT"),24;case 66:return this.popState(),n.yytext=n.yytext.substr(2).trim(),31;case 67:return this.popState(),n.yytext=n.yytext.slice(0,-8).trim(),31;case 68:return 6;case 69:return 6;case 70:return 16;case 71:return 54;case 72:return 24;case 73:return n.yytext=n.yytext.trim(),14;case 74:return 15;case 75:return 28;case 76:return 55;case 77:return 5;case 78:return"INVALID"}},"anonymous"),rules:[/^(?:default\b)/i,/^(?:.*direction\s+TB[^\n]*)/i,/^(?:.*direction\s+BT[^\n]*)/i,/^(?:.*direction\s+RL[^\n]*)/i,/^(?:.*direction\s+LR[^\n]*)/i,/^(?:%%(?!\{)[^\n]*)/i,/^(?:[^\}]%%[^\n]*)/i,/^(?:[\n]+)/i,/^(?:[\s]+)/i,/^(?:((?!\n)\s)+)/i,/^(?:#[^\n]*)/i,/^(?:%[^\n]*)/i,/^(?:scale\s+)/i,/^(?:\d+)/i,/^(?:\s+width\b)/i,/^(?:accTitle\s*:\s*)/i,/^(?:(?!\n||)*[^\n]*)/i,/^(?:accDescr\s*:\s*)/i,/^(?:(?!\n||)*[^\n]*)/i,/^(?:accDescr\s*\{\s*)/i,/^(?:[\}])/i,/^(?:[^\}]*)/i,/^(?:classDef\s+)/i,/^(?:DEFAULT\s+)/i,/^(?:\w+\s+)/i,/^(?:[^\n]*)/i,/^(?:class\s+)/i,/^(?:(\w+)+((,\s*\w+)*))/i,/^(?:[^\n]*)/i,/^(?:style\s+)/i,/^(?:[\w,]+\s+)/i,/^(?:[^\n]*)/i,/^(?:scale\s+)/i,/^(?:\d+)/i,/^(?:\s+width\b)/i,/^(?:state\s+)/i,/^(?:.*<<fork>>)/i,/^(?:.*<<join>>)/i,/^(?:.*<<choice>>)/i,/^(?:.*\[\[fork\]\])/i,/^(?:.*\[\[join\]\])/i,/^(?:.*\[\[choice\]\])/i,/^(?:.*direction\s+TB[^\n]*)/i,/^(?:.*direction\s+BT[^\n]*)/i,/^(?:.*direction\s+RL[^\n]*)/i,/^(?:.*direction\s+LR[^\n]*)/i,/^(?:["])/i,/^(?:\s*as\s+)/i,/^(?:[^\n\{]*)/i,/^(?:["])/i,/^(?:[^"]*)/i,/^(?:[^\n\s\{]+)/i,/^(?:\n)/i,/^(?:\{)/i,/^(?:%%(?!\{)[^\n]*)/i,/^(?:\})/i,/^(?:[\n])/i,/^(?:note\s+)/i,/^(?:left of\b)/i,/^(?:right of\b)/i,/^(?:")/i,/^(?:\s*as\s*)/i,/^(?:["])/i,/^(?:[^"]*)/i,/^(?:[^\n]*)/i,/^(?:\s*[^:\n\s\-]+)/i,/^(?:\s*:[^:\n;]+)/i,/^(?:[\s\S]*?end note\b)/i,/^(?:stateDiagram\s+)/i,/^(?:stateDiagram-v2\s+)/i,/^(?:hide empty description\b)/i,/^(?:\[\*\])/i,/^(?:[^:\n\s\-\{]+)/i,/^(?:\s*:[^:\n;]+)/i,/^(?:-->)/i,/^(?:--)/i,/^(?::::)/i,/^(?:$)/i,/^(?:.)/i],conditions:{LINE:{rules:[9,10],inclusive:!1},struct:{rules:[9,10,22,26,29,35,42,43,44,45,54,55,56,57,71,72,73,74,75],inclusive:!1},FLOATING_NOTE_ID:{rules:[64],inclusive:!1},FLOATING_NOTE:{rules:[61,62,63],inclusive:!1},NOTE_TEXT:{rules:[66,67],inclusive:!1},NOTE_ID:{rules:[65],inclusive:!1},NOTE:{rules:[58,59,60],inclusive:!1},STYLEDEF_STYLEOPTS:{rules:[],inclusive:!1},STYLEDEF_STYLES:{rules:[31],inclusive:!1},STYLE_IDS:{rules:[],inclusive:!1},STYLE:{rules:[30],inclusive:!1},CLASS_STYLE:{rules:[28],inclusive:!1},CLASS:{rules:[27],inclusive:!1},CLASSDEFID:{rules:[25],inclusive:!1},CLASSDEF:{rules:[23,24],inclusive:!1},acc_descr_multiline:{rules:[20,21],inclusive:!1},acc_descr:{rules:[18],inclusive:!1},acc_title:{rules:[16],inclusive:!1},SCALE:{rules:[13,14,33,34],inclusive:!1},ALIAS:{rules:[],inclusive:!1},STATE_ID:{rules:[48],inclusive:!1},STATE_STRING:{rules:[49,50],inclusive:!1},FORK_STATE:{rules:[],inclusive:!1},STATE:{rules:[9,10,36,37,38,39,40,41,46,47,51,52,53],inclusive:!1},ID:{rules:[9,10],inclusive:!1},INITIAL:{rules:[0,1,2,3,4,5,6,7,8,10,11,12,15,17,19,22,26,29,32,35,53,57,68,69,70,71,72,73,74,76,77,78],inclusive:!0}}};return P}();St.lexer=se;function lt(){this.yy={}}return p(lt,"Parser"),lt.prototype=St,St.Parser=lt,new lt}();bt.parser=bt;var Ke=bt,_e="TB",Ut="TB",Ot="dir",dt="state",vt="relation",Ee="classDef",me="style",De="applyClass",Z="default",jt="divider",zt="fill:none",Ht="fill: #333",Wt="c",Xt="text",Kt="normal",mt="rect",Dt="rectWithTitle",be="stateStart",ve="stateEnd",Nt="divider",wt="roundedWithTitle",ke="note",Ce="noteGroup",tt="statediagram",xe="state",Ae=`${tt}-${xe}`,Jt="transition",Le="note",Ie="note-edge",Re=`${Jt} ${Ie}`,Oe=`${tt}-${Le}`,Ne="cluster",we=`${tt}-${Ne}`,$e="cluster-alt",Pe=`${tt}-${$e}`,qt="parent",Qt="note",Be="state",xt="----",Ge=`${xt}${Qt}`,$t=`${xt}${qt}`,Zt=p((e,t=Ut)=>{if(!e.doc)return t;let s=t;for(const a of e.doc)a.stmt==="dir"&&(s=a.value);return s},"getDir"),Ye=p(function(e,t){return t.db.getClasses()},"getClasses"),Fe=p(function(e,t,s,a){return Rt(this,null,function*(){var E,m;v.info("REF0:"),v.info("Drawing state diagram (v2)",t);const{securityLevel:o,state:h,layout:r}=A();a.db.extract(a.db.getRootDocV2());const u=a.db.getData(),c=le(t,o);u.type=a.type,u.layoutAlgorithm=r,u.nodeSpacing=(h==null?void 0:h.nodeSpacing)||50,u.rankSpacing=(h==null?void 0:h.rankSpacing)||50,u.markers=["barb"],u.diagramId=t,yield ge(u,c);const y=8;Te.insertTitle(c,"statediagramTitleText",(E=h==null?void 0:h.titleTopMargin)!=null?E:25,a.db.getDiagramTitle()),oe(c,y,tt,(m=h==null?void 0:h.useMaxWidth)!=null?m:!0)})},"draw"),Je={getClasses:Ye,draw:Fe,getDir:Zt},ft=new Map,B=0;function pt(e="",t=0,s="",a=xt){const o=s!==null&&s.length>0?`${a}${s}`:"";return`${Be}-${e}${o}-${t}`}p(pt,"stateDomId");var Ve=p((e,t,s,a,o,h,r,u)=>{v.trace("items",t),t.forEach(c=>{switch(c.stmt){case dt:Q(e,c,s,a,o,h,r,u);break;case Z:Q(e,c,s,a,o,h,r,u);break;case vt:{Q(e,c.state1,s,a,o,h,r,u),Q(e,c.state2,s,a,o,h,r,u);const y={id:"edge"+B,start:c.state1.id,end:c.state2.id,arrowhead:"normal",arrowTypeEnd:"arrow_barb",style:zt,labelStyle:"",label:j.sanitizeText(c.description,A()),arrowheadStyle:Ht,labelpos:Wt,labelType:Xt,thickness:Kt,classes:Jt,look:r};o.push(y),B++}break}})},"setupDoc"),Pt=p((e,t=Ut)=>{let s=t;if(e.doc)for(const a of e.doc)a.stmt==="dir"&&(s=a.value);return s},"getDir");function q(e,t,s){if(!t.id||t.id==="</join></fork>"||t.id==="</choice>")return;t.cssClasses&&(Array.isArray(t.cssCompiledStyles)||(t.cssCompiledStyles=[]),t.cssClasses.split(" ").forEach(o=>{if(s.get(o)){const h=s.get(o);t.cssCompiledStyles=[...t.cssCompiledStyles,...h.styles]}}));const a=e.find(o=>o.id===t.id);a?Object.assign(a,t):e.push(t)}p(q,"insertOrUpdateNode");function te(e){var t,s;return(s=(t=e==null?void 0:e.classes)==null?void 0:t.join(" "))!=null?s:""}p(te,"getClassesFromDbInfo");function ee(e){var t;return(t=e==null?void 0:e.styles)!=null?t:[]}p(ee,"getStylesFromDbInfo");var Q=p((e,t,s,a,o,h,r,u)=>{var I,G;const c=t.id,y=s.get(c),E=te(y),m=ee(y);if(v.info("dataFetcher parsedItem",t,y,m),c!=="root"){let R=mt;t.start===!0?R=be:t.start===!1&&(R=ve),t.type!==Z&&(R=t.type),ft.get(c)||ft.set(c,{id:c,shape:R,description:j.sanitizeText(c,A()),cssClasses:`${E} ${Ae}`,cssStyles:m});const S=ft.get(c);t.description&&(Array.isArray(S.description)?(S.shape=Dt,S.description.push(t.description)):((I=S.description)==null?void 0:I.length)>0?(S.shape=Dt,S.description===c?S.description=[t.description]:S.description=[S.description,t.description]):(S.shape=mt,S.description=t.description),S.description=j.sanitizeTextOrArray(S.description,A())),((G=S.description)==null?void 0:G.length)===1&&S.shape===Dt&&(S.type==="group"?S.shape=wt:S.shape=mt),!S.type&&t.doc&&(v.info("Setting cluster for XCX",c,Pt(t)),S.type="group",S.isGroup=!0,S.dir=Pt(t),S.shape=t.type===jt?Nt:wt,S.cssClasses=`${S.cssClasses} ${we} ${h?Pe:""}`);const L={labelStyle:"",shape:S.shape,label:S.description,cssClasses:S.cssClasses,cssCompiledStyles:[],cssStyles:S.cssStyles,id:c,dir:S.dir,domId:pt(c,B),type:S.type,isGroup:S.type==="group",padding:8,rx:10,ry:10,look:r};if(L.shape===Nt&&(L.label=""),e&&e.id!=="root"&&(v.trace("Setting node ",c," to be child of its parent ",e.id),L.parentId=e.id),L.centerLabel=!0,t.note){const O={labelStyle:"",shape:ke,label:t.note.text,cssClasses:Oe,cssStyles:[],cssCompilesStyles:[],id:c+Ge+"-"+B,domId:pt(c,B,Qt),type:S.type,isGroup:S.type==="group",padding:A().flowchart.padding,look:r,position:t.note.position},Y=c+$t,F={labelStyle:"",shape:Ce,label:t.note.text,cssClasses:S.cssClasses,cssStyles:[],id:c+$t,domId:pt(c,B,qt),type:"group",isGroup:!0,padding:16,look:r,position:t.note.position};B++,F.id=Y,O.parentId=Y,q(a,F,u),q(a,O,u),q(a,L,u);let w=c,$=O.id;t.note.position==="left of"&&(w=O.id,$=c),o.push({id:w+"-"+$,start:w,end:$,arrowhead:"none",arrowTypeEnd:"",style:zt,labelStyle:"",classes:Re,arrowheadStyle:Ht,labelpos:Wt,labelType:Xt,thickness:Kt,look:r})}else q(a,L,u)}t.doc&&(v.trace("Adding nodes children "),Ve(t,t.doc,s,a,o,!h,r,u))},"dataFetcher"),Me=p(()=>{ft.clear(),B=0},"reset"),kt="[*]",Bt="start",Gt=kt,Yt="end",Ft="color",Vt="fill",Ue="bgFill",je=",";function Ct(){return new Map}p(Ct,"newClassesList");var Mt=p(()=>({relations:[],states:new Map,documents:{}}),"newDoc"),ut=p(e=>JSON.parse(JSON.stringify(e)),"clone"),W,qe=(W=class{constructor(t){b(this,"version");b(this,"nodes",[]);b(this,"edges",[]);b(this,"rootDoc",[]);b(this,"classes",Ct());b(this,"documents",{root:Mt()});b(this,"currentDocument",this.documents.root);b(this,"startEndCount",0);b(this,"dividerCnt",0);b(this,"getAccTitle",ue);b(this,"setAccTitle",de);b(this,"getAccDescription",fe);b(this,"setAccDescription",pe);b(this,"setDiagramTitle",Se);b(this,"getDiagramTitle",ye);this.clear(),this.version=t,this.setRootDoc=this.setRootDoc.bind(this),this.getDividerId=this.getDividerId.bind(this),this.setDirection=this.setDirection.bind(this),this.trimColon=this.trimColon.bind(this)}setRootDoc(t){v.info("Setting root doc",t),this.rootDoc=t,this.version===1?this.extract(t):this.extract(this.getRootDocV2())}getRootDoc(){return this.rootDoc}docTranslator(t,s,a){if(s.stmt===vt)this.docTranslator(t,s.state1,!0),this.docTranslator(t,s.state2,!1);else if(s.stmt===dt&&(s.id==="[*]"?(s.id=a?t.id+"_start":t.id+"_end",s.start=a):s.id=s.id.trim()),s.doc){const o=[];let h=[],r;for(r=0;r<s.doc.length;r++)if(s.doc[r].type===jt){const u=ut(s.doc[r]);u.doc=ut(h),o.push(u),h=[]}else h.push(s.doc[r]);if(o.length>0&&h.length>0){const u={stmt:dt,id:ce(),type:"divider",doc:ut(h)};o.push(ut(u)),s.doc=o}s.doc.forEach(u=>this.docTranslator(s,u,!0))}}getRootDocV2(){return this.docTranslator({id:"root"},{id:"root",doc:this.rootDoc},!0),{id:"root",doc:this.rootDoc}}extract(t){let s;t.doc?s=t.doc:s=t,v.info(s),this.clear(!0),v.info("Extract initial document:",s),s.forEach(r=>{switch(v.warn("Statement",r.stmt),r.stmt){case dt:this.addState(r.id.trim(),r.type,r.doc,r.description,r.note,r.classes,r.styles,r.textStyles);break;case vt:this.addRelation(r.state1,r.state2,r.description);break;case Ee:this.addStyleClass(r.id.trim(),r.classes);break;case me:{const u=r.id.trim().split(","),c=r.styleClass.split(",");u.forEach(y=>{let E=this.getState(y);if(E===void 0){const m=y.trim();this.addState(m),E=this.getState(m)}E.styles=c.map(m=>{var I;return(I=m.replace(/;/g,""))==null?void 0:I.trim()})})}break;case De:this.setCssClass(r.id.trim(),r.styleClass);break}});const a=this.getStates(),h=A().look;Me(),Q(void 0,this.getRootDocV2(),a,this.nodes,this.edges,!0,h,this.classes),this.nodes.forEach(r=>{if(Array.isArray(r.label)){if(r.description=r.label.slice(1),r.isGroup&&r.description.length>0)throw new Error("Group nodes can only have label. Remove the additional description for node ["+r.id+"]");r.label=r.label[0]}})}addState(t,s=Z,a=null,o=null,h=null,r=null,u=null,c=null){const y=t==null?void 0:t.trim();if(this.currentDocument.states.has(y)?(this.currentDocument.states.get(y).doc||(this.currentDocument.states.get(y).doc=a),this.currentDocument.states.get(y).type||(this.currentDocument.states.get(y).type=s)):(v.info("Adding state ",y,o),this.currentDocument.states.set(y,{id:y,descriptions:[],type:s,doc:a,note:h,classes:[],styles:[],textStyles:[]})),o&&(v.info("Setting state description",y,o),typeof o=="string"&&this.addDescription(y,o.trim()),typeof o=="object"&&o.forEach(E=>this.addDescription(y,E.trim()))),h){const E=this.currentDocument.states.get(y);E.note=h,E.note.text=j.sanitizeText(E.note.text,A())}r&&(v.info("Setting state classes",y,r),(typeof r=="string"?[r]:r).forEach(m=>this.setCssClass(y,m.trim()))),u&&(v.info("Setting state styles",y,u),(typeof u=="string"?[u]:u).forEach(m=>this.setStyle(y,m.trim()))),c&&(v.info("Setting state styles",y,u),(typeof c=="string"?[c]:c).forEach(m=>this.setTextStyle(y,m.trim())))}clear(t){this.nodes=[],this.edges=[],this.documents={root:Mt()},this.currentDocument=this.documents.root,this.startEndCount=0,this.classes=Ct(),t||he()}getState(t){return this.currentDocument.states.get(t)}getStates(){return this.currentDocument.states}logDocuments(){v.info("Documents = ",this.documents)}getRelations(){return this.currentDocument.relations}startIdIfNeeded(t=""){let s=t;return t===kt&&(this.startEndCount++,s=`${Bt}${this.startEndCount}`),s}startTypeIfNeeded(t="",s=Z){return t===kt?Bt:s}endIdIfNeeded(t=""){let s=t;return t===Gt&&(this.startEndCount++,s=`${Yt}${this.startEndCount}`),s}endTypeIfNeeded(t="",s=Z){return t===Gt?Yt:s}addRelationObjs(t,s,a){let o=this.startIdIfNeeded(t.id.trim()),h=this.startTypeIfNeeded(t.id.trim(),t.type),r=this.startIdIfNeeded(s.id.trim()),u=this.startTypeIfNeeded(s.id.trim(),s.type);this.addState(o,h,t.doc,t.description,t.note,t.classes,t.styles,t.textStyles),this.addState(r,u,s.doc,s.description,s.note,s.classes,s.styles,s.textStyles),this.currentDocument.relations.push({id1:o,id2:r,relationTitle:j.sanitizeText(a,A())})}addRelation(t,s,a){if(typeof t=="object")this.addRelationObjs(t,s,a);else{const o=this.startIdIfNeeded(t.trim()),h=this.startTypeIfNeeded(t),r=this.endIdIfNeeded(s.trim()),u=this.endTypeIfNeeded(s);this.addState(o,h),this.addState(r,u),this.currentDocument.relations.push({id1:o,id2:r,title:j.sanitizeText(a,A())})}}addDescription(t,s){const a=this.currentDocument.states.get(t),o=s.startsWith(":")?s.replace(":","").trim():s;a.descriptions.push(j.sanitizeText(o,A()))}cleanupLabel(t){return t.substring(0,1)===":"?t.substr(2).trim():t.trim()}getDividerId(){return this.dividerCnt++,"divider-id-"+this.dividerCnt}addStyleClass(t,s=""){this.classes.has(t)||this.classes.set(t,{id:t,styles:[],textStyles:[]});const a=this.classes.get(t);s!=null&&s.split(je).forEach(o=>{const h=o.replace(/([^;]*);/,"$1").trim();if(RegExp(Ft).exec(o)){const u=h.replace(Vt,Ue).replace(Ft,Vt);a.textStyles.push(u)}a.styles.push(h)})}getClasses(){return this.classes}setCssClass(t,s){t.split(",").forEach(a=>{let o=this.getState(a);if(o===void 0){const h=a.trim();this.addState(h),o=this.getState(h)}o.classes.push(s)})}setStyle(t,s){const a=this.getState(t);a!==void 0&&a.styles.push(s)}setTextStyle(t,s){const a=this.getState(t);a!==void 0&&a.textStyles.push(s)}getDirectionStatement(){return this.rootDoc.find(t=>t.stmt===Ot)}getDirection(){var t,s;return(s=(t=this.getDirectionStatement())==null?void 0:t.value)!=null?s:_e}setDirection(t){const s=this.getDirectionStatement();s?s.value=t:this.rootDoc.unshift({stmt:Ot,value:t})}trimColon(t){return t&&t[0]===":"?t.substr(1).trim():t.trim()}getData(){const t=A();return{nodes:this.nodes,edges:this.edges,other:{},config:t,direction:Zt(this.getRootDocV2())}}getConfig(){return A().state}},p(W,"StateDB"),b(W,"relationType",{AGGREGATION:0,EXTENSION:1,COMPOSITION:2,DEPENDENCY:3}),W),ze=p(e=>`
defs #statediagram-barbEnd {
    fill: ${e.transitionColor};
    stroke: ${e.transitionColor};
  }
g.stateGroup text {
  fill: ${e.nodeBorder};
  stroke: none;
  font-size: 10px;
}
g.stateGroup text {
  fill: ${e.textColor};
  stroke: none;
  font-size: 10px;

}
g.stateGroup .state-title {
  font-weight: bolder;
  fill: ${e.stateLabelColor};
}

g.stateGroup rect {
  fill: ${e.mainBkg};
  stroke: ${e.nodeBorder};
}

g.stateGroup line {
  stroke: ${e.lineColor};
  stroke-width: 1;
}

.transition {
  stroke: ${e.transitionColor};
  stroke-width: 1;
  fill: none;
}

.stateGroup .composit {
  fill: ${e.background};
  border-bottom: 1px
}

.stateGroup .alt-composit {
  fill: #e0e0e0;
  border-bottom: 1px
}

.state-note {
  stroke: ${e.noteBorderColor};
  fill: ${e.noteBkgColor};

  text {
    fill: ${e.noteTextColor};
    stroke: none;
    font-size: 10px;
  }
}

.stateLabel .box {
  stroke: none;
  stroke-width: 0;
  fill: ${e.mainBkg};
  opacity: 0.5;
}

.edgeLabel .label rect {
  fill: ${e.labelBackgroundColor};
  opacity: 0.5;
}
.edgeLabel {
  background-color: ${e.edgeLabelBackground};
  p {
    background-color: ${e.edgeLabelBackground};
  }
  rect {
    opacity: 0.5;
    background-color: ${e.edgeLabelBackground};
    fill: ${e.edgeLabelBackground};
  }
  text-align: center;
}
.edgeLabel .label text {
  fill: ${e.transitionLabelColor||e.tertiaryTextColor};
}
.label div .edgeLabel {
  color: ${e.transitionLabelColor||e.tertiaryTextColor};
}

.stateLabel text {
  fill: ${e.stateLabelColor};
  font-size: 10px;
  font-weight: bold;
}

.node circle.state-start {
  fill: ${e.specialStateColor};
  stroke: ${e.specialStateColor};
}

.node .fork-join {
  fill: ${e.specialStateColor};
  stroke: ${e.specialStateColor};
}

.node circle.state-end {
  fill: ${e.innerEndBackground};
  stroke: ${e.background};
  stroke-width: 1.5
}
.end-state-inner {
  fill: ${e.compositeBackground||e.background};
  // stroke: ${e.background};
  stroke-width: 1.5
}

.node rect {
  fill: ${e.stateBkg||e.mainBkg};
  stroke: ${e.stateBorder||e.nodeBorder};
  stroke-width: 1px;
}
.node polygon {
  fill: ${e.mainBkg};
  stroke: ${e.stateBorder||e.nodeBorder};;
  stroke-width: 1px;
}
#statediagram-barbEnd {
  fill: ${e.lineColor};
}

.statediagram-cluster rect {
  fill: ${e.compositeTitleBackground};
  stroke: ${e.stateBorder||e.nodeBorder};
  stroke-width: 1px;
}

.cluster-label, .nodeLabel {
  color: ${e.stateLabelColor};
  // line-height: 1;
}

.statediagram-cluster rect.outer {
  rx: 5px;
  ry: 5px;
}
.statediagram-state .divider {
  stroke: ${e.stateBorder||e.nodeBorder};
}

.statediagram-state .title-state {
  rx: 5px;
  ry: 5px;
}
.statediagram-cluster.statediagram-cluster .inner {
  fill: ${e.compositeBackground||e.background};
}
.statediagram-cluster.statediagram-cluster-alt .inner {
  fill: ${e.altBackground?e.altBackground:"#efefef"};
}

.statediagram-cluster .inner {
  rx:0;
  ry:0;
}

.statediagram-state rect.basic {
  rx: 5px;
  ry: 5px;
}
.statediagram-state rect.divider {
  stroke-dasharray: 10,10;
  fill: ${e.altBackground?e.altBackground:"#efefef"};
}

.note-edge {
  stroke-dasharray: 5;
}

.statediagram-note rect {
  fill: ${e.noteBkgColor};
  stroke: ${e.noteBorderColor};
  stroke-width: 1px;
  rx: 0;
  ry: 0;
}
.statediagram-note rect {
  fill: ${e.noteBkgColor};
  stroke: ${e.noteBorderColor};
  stroke-width: 1px;
  rx: 0;
  ry: 0;
}

.statediagram-note text {
  fill: ${e.noteTextColor};
}

.statediagram-note .nodeLabel {
  color: ${e.noteTextColor};
}
.statediagram .edgeLabel {
  color: red; // ${e.noteTextColor};
}

#dependencyStart, #dependencyEnd {
  fill: ${e.lineColor};
  stroke: ${e.lineColor};
  stroke-width: 1;
}

.statediagramTitleText {
  text-anchor: middle;
  font-size: 18px;
  fill: ${e.textColor};
}
`,"getStyles"),Qe=ze;export{qe as S,Qe as a,Je as b,Ke as s};
