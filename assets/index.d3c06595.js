import{_ as me}from"./log.d122ec0b.js";import{d as X,aH as a,C as o,aE as l,aG as e,aL as Y,aM as F,aF as ee,aI as t,D as H,aK as se,aJ as le,e as x,s as fe,c as te,u as s,G as r,k as W,b4 as ve,aY as ye,aZ as be,a_ as he,a$ as ge,b2 as ke,E as Se,aV as Ce}from"./arco.f573c5ac.js";import{g as ce,j as Te,s as D}from"./vue.67fd90f7.js";import{N as we,_ as ie,a as Z,u as re,U as xe,c as $e,Q as Ne}from"./index.b09ea387.js";import{_ as Ae}from"./index.vue_vue_type_style_index_0_lang.0930aec1.js";import{o as Le,T as Be}from"./index.e23201b4.js";import{p as Ve}from"./index.9f4fc664.js";import{u as ae,a as ue,_ as Re}from"./sider-tabs.87fae09a.js";import{_ as de}from"./empty-status.vue_vue_type_script_setup_true_name_EmptyStatus_lang.054077bf.js";import"./chart.ffdacf79.js";import"./index.a01c92ca.js";const Ie=X({__name:"logs",props:{logs:null,types:null},setup(_){const b=_;ce();const{clearLogs:C}=we(),p=()=>{C(b.types)};return($,h)=>{const T=a("a-button"),k=me,v=a("a-list"),m=a("a-card"),y=a("a-tab-pane"),c=a("a-tabs");return o(),l(c,{class:"result-tabs logs-tab",type:"rounded"},{extra:e(()=>[_.logs.length?(o(),l(T,{key:0,class:"clear-logs-button",type:"secondary",status:"danger",onClick:p},{default:e(()=>[Y(F($.$t("dashboard.clear")),1)]),_:1})):ee("",!0)]),default:e(()=>[t(y,{title:"Logs"},{default:e(()=>[t(m,{bordered:!1},{default:e(()=>[_.logs.length?(o(),l(v,{key:0,size:"small",hoverable:!0,bordered:!1},{default:e(()=>[(o(!0),H(se,null,le(_.logs,N=>(o(),l(k,{key:N,log:N},null,8,["log"]))),128))]),_:1})):ee("",!0)]),_:1})]),_:1})]),_:1})}}});const Ee=ie(Ie,[["__scopeId","data-v-604dd01e"]]),Ue={class:"mr-4"},ze={class:"mr-4"},Ke={class:"mr-4"},Me=X({__name:"py-editor",props:{spellcheck:{type:Boolean,default:!0},autofocus:{type:Boolean,default:!0},indentWithTab:{type:Boolean,default:!0},tabSize:{default:2}},setup(_){const b=ce(),C=Z(),{pythonCode:p,cursorAt:$,lastSavedCode:h,isNewScript:T,scriptName:k,isChanged:v,isButtonDisabled:m,scriptSaving:y,scriptRunning:c,selectAfterSave:N,createNewScript:G}=ae(),{save:I}=ae(),{runQuery:A}=re(),{getScriptsTable:g}=C,L="python",E=x(),B=x(),P=x(),V=fe(),u=x({scriptName:k}),S=te(()=>!!(!v.value&&p.value!==""&&u.value.scriptName)),w=i=>{V.value=i.view},f=()=>{if(V.value){const{state:i}=V.value,{ranges:d}=i.selection;if($.value=[d[0].from,d[0].to],E.value=i.doc.lineAt(d[0].from).number,B.value=i.doc.lineAt(d[0].to).number,i.doc.text)P.value=i.doc.text.slice(E.value-1,B.value).join(" ");else{let K=[];i.doc.children.forEach(q=>{K=K.concat(q.text)}),P.value=K.slice(E.value-1,B.value).join(" ")}}},U={height:"250px"},O=[Ve(),Le],z=async()=>{b.name;try{y.value=!0,await I(u.value.scriptName,p.value.trim()),await g(),N(u.value.scriptName)}catch{}y.value=!1},j=async()=>{b.name;try{c.value=!0,await I(u.value.scriptName,p.value.trim()),h.value=p.value,await A(u.value.scriptName,L),await g(),N(u.value.scriptName)}catch{}c.value=!1},Q=async()=>{b.name,c.value=!0,await A(u.value.scriptName,L),c.value=!1};return(i,d)=>{const K=a("a-input"),q=a("a-form-item"),R=a("a-form"),n=a("icon-loading"),M=a("icon-play-arrow"),oe=a("a-button"),ne=a("a-space"),pe=a("a-card");return o(),l(pe,{class:"editor-card padding-16",bordered:!1},{default:e(()=>[t(ne,{class:"form-space",size:"medium"},{default:e(()=>[t(R,{layout:"inline",model:s(u)},{default:e(()=>[t(q,{label:i.$t("dashboard.scriptName")},{default:e(()=>[t(K,{"model-value":s(u).scriptName,"onUpdate:modelValue":d[0]||(d[0]=J=>s(u).scriptName=J),disabled:!s(T),placeholder:i.$t("dashboard.input")},null,8,["model-value","disabled","placeholder"])]),_:1},8,["label"])]),_:1},8,["model"]),t(ne,null,{default:e(()=>[s(S)?(o(),l(oe,{key:0,disabled:s(m),onClick:d[1]||(d[1]=J=>Q())},{default:e(()=>[r("div",Ue,[s(c)?(o(),l(n,{key:0,spin:""})):(o(),l(M,{key:1}))]),Y(F(i.$t("dashboard.runScriptAction")),1)]),_:1},8,["disabled"])):(o(),l(ne,{key:1},{default:e(()=>[t(oe,{disabled:s(m),onClick:d[2]||(d[2]=J=>z())},{default:e(()=>[r("div",ze,[s(y)?(o(),l(n,{key:0,spin:""})):(o(),l(M,{key:1}))]),Y(F(i.$t("dashboard.saveScript")),1)]),_:1},8,["disabled"]),t(oe,{disabled:s(m),onClick:d[3]||(d[3]=J=>j())},{default:e(()=>[r("div",Ke,[s(c)?(o(),l(n,{key:0,spin:""})):(o(),l(M,{key:1}))]),Y(F(i.$t("dashboard.saveAndRun")),1)]),_:1},8,["disabled"])]),_:1}))]),_:1})]),_:1}),t(s(Be),{modelValue:s(p),"onUpdate:modelValue":d[4]||(d[4]=J=>W(p)?p.value=J:null),style:U,spellcheck:_.spellcheck,autofocus:_.autofocus,"indent-with-tab":_.indentWithTab,tabSize:_.tabSize,extensions:O,onReady:w,onUpdate:f},null,8,["modelValue","spellcheck","autofocus","indent-with-tab","tabSize"])]),_:1})}}}),_e=_=>(he("data-v-7af7c798"),_=_(),ge(),_),Pe=_e(()=>r("svg",{class:"icon"},[r("use",{href:"#search"})],-1)),Qe=_e(()=>r("svg",{class:"icon brand-color"},[r("use",{href:"#refresh"})],-1)),Fe=[Qe],Ge={key:0,class:"icon-16"},Oe=["href"],je={class:"tree-data"},qe={class:"data-title"},He={key:1,class:"data-title"},We={class:"tree-data"},Je={key:0,class:"div"},Ye={class:"data-type"},Ze=X({__name:"table-list",setup(_){const b=x(""),{text:C,copy:p,copied:$,isSupported:h}=Te({source:b}),T=ce();ae();const{tablesSearchKey:k,tablesTreeData:v}=ue(),{tablesLoading:m,originTablesTree:y}=D(Z()),{getTableByName:c,getTables:N,addChildren:G,generateTreeChildren:I}=Z(),A=x(),g=x(),L=()=>{k.value="",N(),A.value&&A.value.expandAll(!1)},E=u=>new Promise((S,w)=>{c(u.title).then(f=>{const{output:U}=f,{records:{rows:O,schema:{column_schemas:z}}}=U[0],{treeChildren:j,timeIndexName:Q}=I(u,O,z);G(u.key,j,Q),S()}).catch(()=>{w()})}),B={FIELD:"#value",TAG:"#primary-key",TIMESTAMP:"#time-index"},P={TABLE:[{value:"select*100",label:"Query table"}],FIELD:[{value:"select100",label:"Query column"},{value:"max",label:"Query max"},{value:"min",label:"Query min"}],TAG:[{value:"count",label:"Count by"},{value:"where=",label:"Filter by"}],TIMESTAMP:[{value:"select*100",label:"Query table"},{value:"where<",label:"Filter by"}]},V=(u,S)=>{var w;S.children&&((w=g.value)==null?void 0:w.includes(S.key))&&u.stopPropagation()};return(u,S)=>{const w=a("a-input"),f=a("a-space"),U=a("a-tooltip"),O=a("icon-more"),z=a("a-button"),j=Re,Q=a("a-spin"),i=a("a-doption"),d=a("a-dropdown"),K=a("IconDown"),q=a("a-tree"),R=de;return o(),l(Q,{style:{width:"100%"},loading:s(m)},{default:e(()=>[t(f,{class:"search-space"},{default:e(()=>[t(w,{modelValue:s(k),"onUpdate:modelValue":S[0]||(S[0]=n=>W(k)?k.value=n:null),"allow-clear":!0},{prefix:e(()=>[Pe]),_:1},8,["modelValue"]),r("div",{class:"icon-space pointer",onClick:L},Fe)]),_:1}),s(v)&&s(v).length>0?(o(),l(q,{key:0,class:"table-tree",ref_key:"treeRef",ref:A,"expanded-keys":s(g),"onUpdate:expandedKeys":S[1]||(S[1]=n=>W(g)?g.value=n:null),size:"small","action-on-node-click":"expand","block-node":!0,data:s(v),"load-more":E,animation:!1,"virtual-list-props":{height:"calc(100vh - 160px)"},"field-names":{children:"columns"}},{icon:e(n=>[t(U,{content:n.node.iconType},{default:e(()=>[n.node.iconType?(o(),H("svg",Ge,[r("use",{href:B[n.node.iconType]},null,8,Oe)])):ee("",!0)]),_:2},1032,["content"])]),title:e(n=>[r("div",je,[n.iconType?(o(),H("div",He,F(n.title),1)):(o(),l(U,{key:0,class:"data-type",mini:"",content:n.title},{default:e(()=>[r("div",qe,F(n.title),1)]),_:2},1032,["content"])),r("div",We,[n.iconType?(o(),H("div",Je,[t(ve,{name:"slide-fade"},{default:e(()=>[r("div",Ye,F(n.dataType),1)]),_:2},1024)])):ee("",!0),t(d,{class:"menu-dropdown",trigger:"click",position:"right",onClick:M=>V(M,n)},{content:e(()=>[(o(!0),H(se,null,le(P[n.iconType||"TABLE"],M=>ye((o(),l(i,null,{default:e(()=>[t(Q,{style:{width:"100%"},loading:n.children&&!n.children.length},{default:e(()=>[t(j,{type:M.value,node:n,parent:n.iconType?s(y)[n.parentKey]:n,label:M.label},null,8,["type","node","parent","label"])]),_:2},1032,["loading"])]),_:2},1536)),[[be,s(T).name==="query"]])),256)),t(i,null,{default:e(()=>[t(U,{content:"Copy to Clipboard"},{default:e(()=>[t(z,{type:"text",onClick:M=>s(p)(n.title)},{default:e(()=>[Y("Copy name")]),_:2},1032,["onClick"])]),_:2},1024)]),_:2},1024)]),default:e(()=>[t(z,{class:"menu-button",type:"text"},{icon:e(()=>[t(O,{class:"icon-18"})]),_:1})]),_:2},1032,["onClick"])])])]),"switcher-icon":e(()=>[t(K)]),_:1},8,["expanded-keys","data","virtual-list-props"])):(o(),l(R,{key:1,class:"empty"}))]),_:1},8,["loading"])}}});const Xe=ie(Ze,[["__scopeId","data-v-7af7c798"]]),De=r("svg",{class:"icon"},[r("use",{href:"#search"})],-1),et=r("svg",{class:"icon"},[r("use",{href:"#create"})],-1),tt=[et],at=r("svg",{class:"icon brand-color"},[r("use",{href:"#refresh"})],-1),st=[at],ot=X({__name:"scripts-list",setup(_){const b=x(),C=x();x("");const p={type:"outline"},$={type:"primary"},h=x(!1),{pythonCode:T,creating:k,lastSavedCode:v,scriptSelectedKeys:m,lastSelectedKey:y,modelVisible:c,isChanged:N,overwriteCode:G,createNewScript:I,resetScript:A}=ae(),{scriptsSearchKey:g,scriptsListData:L}=ue(),{scriptsLoading:E}=D(Z()),{getScriptsTable:B}=Z(),P=(w,f)=>{b.value=f.node,N.value?c.value=!0:G(f.node)},V=()=>{h.value?(g.value="",A(),B()):k.value?(T.value="",v.value="",I()):G(b.value),h.value=!1},u=()=>{m.value=y.value,h.value=!1},S=()=>{h.value=!0,N.value?c.value=!0:(g.value="",A(),B(),h.value=!1)};return(w,f)=>{const U=a("a-input"),O=a("a-tooltip"),z=a("a-space"),j=a("a-tree"),Q=de,i=a("a-scrollbar"),d=a("a-spin"),K=a("icon-exclamation-circle-fill"),q=a("a-modal");return o(),H(se,null,[t(d,{style:{width:"100%"},loading:s(E)},{default:e(()=>[t(z,{class:"search-space"},{default:e(()=>[t(U,{class:"scripts-search-input",modelValue:s(g),"onUpdate:modelValue":f[0]||(f[0]=R=>W(g)?g.value=R:null),"allow-clear":!0},{prefix:e(()=>[De]),_:1},8,["modelValue"]),t(O,{mini:"",content:w.$t("dashboard.create")},{default:e(()=>[r("div",{class:"icon-space pointer",onClick:f[1]||(f[1]=R=>s(I)())},tt)]),_:1},8,["content"]),r("div",{class:"icon-space pointer",onClick:S},st)]),_:1}),t(i,{class:"tree-scrollbar"},{default:e(()=>[s(L)&&s(L).length>0?(o(),l(j,{key:0,class:"script-tree",ref_key:"scriptsRef",ref:C,"selected-keys":s(m),"onUpdate:selectedKeys":f[2]||(f[2]=R=>W(m)?m.value=R:null),size:"small",blockNode:"",data:s(L),onSelect:P},null,8,["selected-keys","data"])):(o(),l(Q,{key:1}))]),_:1})]),_:1},8,["loading"]),t(q,{class:"change-modal",visible:s(c),"onUpdate:visible":f[3]||(f[3]=R=>W(c)?c.value=R:null),width:"auto",closable:!1,okButtonProps:p,cancelButtonProps:$,onOk:V,onCancel:u},{title:e(()=>[]),default:e(()=>[t(z,null,{default:e(()=>[t(K,{class:"warning-color icon-18"}),Y(F(w.$t("dashboard.question")),1)]),_:1})]),_:1},8,["visible"])],64)}}}),nt=X({__name:"list-tabs",props:{has:null},setup(_){const b=_,C=x(b.has.length-1),p=[{title:"Tables",component:Xe},{title:"Scripts",component:ot}],$=te(()=>p.filter(h=>b.has.includes(h.title)));return(h,T)=>{const k=a("a-card"),v=a("a-tab-pane"),m=a("a-tabs");return o(),l(m,{class:Se(["sider-tabs",{"one-tab":s($).length===1}]),"active-key":s(C),"onUpdate:activeKey":T[0]||(T[0]=y=>W(C)?C.value=y:null),type:"rounded"},{default:e(()=>[(o(!0),H(se,null,le(s($),(y,c)=>(o(),l(v,{key:c,title:y.title},{default:e(()=>[t(k,{class:"tree-card",bordered:!1},{default:e(()=>[(o(),l(ke(y.component)))]),_:2},1024)]),_:2},1032,["title"]))),128))]),_:1},8,["active-key","class"])}}});const lt=ie(nt,[["__scopeId","data-v-e9caefd7"]]),bt=X({__name:"index",setup(_){const{getResultsByType:b}=re(),{logs:C}=D(xe()),{codeType:p,guideModalVisible:$}=D($e()),{dataStatusMap:h}=D(Ne()),{getTables:T,getScriptsTable:k}=Z(),v=["python"],m=te(()=>b(v)),y=te(()=>C.value.filter(c=>v.includes(c.type)));return Ce(()=>{p.value="python",$.value||(h.value.scripts||k(),h.value.tables||T())}),(c,N)=>{const G=lt,I=a("a-layout-sider"),A=Me,g=Ae,L=Ee,E=a("a-space"),B=a("a-layout-content"),P=a("a-layout");return o(),l(P,{class:"layout"},{default:e(()=>[t(I,{"resize-directions":["right"],width:321},{default:e(()=>[t(G,{has:["Tables","Scripts"]})]),_:1}),t(B,null,{default:e(()=>[t(E,{class:"content-space",direction:"vertical",fill:"",size:"large"},{default:e(()=>{var V;return[t(A),(V=s(m))!=null&&V.length?(o(),l(g,{key:0,results:s(m),types:v},null,8,["results"])):ee("",!0),t(L,{logs:s(y),types:v},null,8,["logs"])]}),_:1})]),_:1})]),_:1})}}});export{bt as default};