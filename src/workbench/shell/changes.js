import {identity,request,capabilities,guardButton,refreshCapabilities,element as el,presentResult,technicalData} from '/client.js';
const account=await identity();
if(account.authenticated&&!account.legacy){
 let panelStatus=await capabilities(),selection=null,selectedObjectId=null,plan=null,accepted=null,proposal=null,lastLoggedSelection,busy=false,previewed=false,approved=false;
 const mount=document.getElementById('change-mount'),section=el('section',undefined,'change-panel');mount.append(section);
 const target=el('section'),explanation=el('section'),review=el('section');
 target.append(el('span','01 / YOUR INTENT','eyebrow'),el('h2','你希望这里发生什么？'));
 const selected=el('p','选择星盘、转场，或在网页里按 Alt+S 框选空白区域。','selection-summary');
 const intent=el('textarea');intent.setAttribute('aria-label','Companion intent');intent.placeholder='例如：在这个空白区域增加一段社团近况，沿用当前字体和网格。';
 const agentActions=el('div',undefined,'action-row');target.append(selected,intent,agentActions);
 explanation.append(el('span','02 / EXPLANATION','eyebrow'),el('h2','理解与建议'));
 const explanationOutput=el('div');explanationOutput.append(el('p','提出目标后，伴生 Agent 会在这里解释方案与约束。'));explanation.append(explanationOutput);
 review.append(el('span','03 / STRUCTURAL REVIEW','eyebrow'),el('h2','修改前后'));
 const reviewOutput=el('div');reviewOutput.append(el('p','生成计划后，在这里审阅结构差异、预览并批准。'));
 const staticLabel=el('label'),staticAcknowledgement=el('input');staticAcknowledgement.type='checkbox';staticLabel.append(staticAcknowledgement,document.createTextNode('已审阅静态 AST / 结构 Diff，理解本机可能未执行 SSR'));staticLabel.hidden=true;
 const transactionActions=el('div',undefined,'action-row'),transactionStatus=el('output');transactionStatus.setAttribute('aria-live','polite');review.append(reviewOutput,staticLabel,transactionActions,transactionStatus);
 section.append(target,explanation,review);
 const controls=[];
 function update(){for(const {button,action,when}of controls){guardButton(button,action,panelStatus);const reason=when?.();if(busy||reason){button.disabled=true;button.setAttribute('aria-disabled','true');if(reason)button.title=reason;}}}
 function button(host,label,action,run,{primary=false,when}={}){const button=el('button',label,primary?'primary':undefined);controls.push({button,action,when});host.append(button);button.addEventListener('click',async()=>{if(button.disabled)return;busy=true;update();transactionStatus.textContent='处理中…';try{await run();transactionStatus.textContent='操作完成';}catch(error){transactionStatus.textContent=error.message;transactionStatus.className='status-error';if(error.code==='RECOVERY_REQUIRED')panelStatus=await refreshCapabilities();}finally{busy=false;update();}});return button;}
 async function api(action,data={}){return request('/api/change/'+action,data);}
 function setPlan(next){plan=next;previewed=false;approved=false;staticAcknowledgement.checked=false;staticLabel.hidden=true;presentResult(reviewOutput,next,{title:'候选结构修改'});update();}
 const measure=s=>({...s.spatial,selectionId:s.selectionId,parentSourceId:s.parentSourceId,sampledAt:s.sampledAt,layoutFacts:s.layoutFacts,grid:s.grid,frameEpoch:s.frameEpoch,sourceRevisions:{project:s.docRevision},rects:s.spatial?.rects||{viewport:s.rect}});
 async function fresh(){const next=await new Promise((resolve,reject)=>window.dispatchEvent(new CustomEvent('companion:request-measure',{detail:{resolve,reject}})));selection=next;return measure(next);}
 for(const [capability,label]of [['modify','规划修改 ↗'],['analyze','分析'],['explain','解释']])button(agentActions,label,capability==='modify'?'propose':capability,async()=>{
  explanationOutput.replaceChildren(el('p','Pi 正在读取当前对象与项目契约…'));
  proposal=await api('agent',{capability,intent:intent.value,objectId:selectedObjectId,context:{selection:selectedObjectId?undefined:selection}});
  presentResult(explanationOutput,proposal,{title:capability==='modify'?'修改建议':capability==='analyze'?'分析结果':'对象解释'});
 },{primary:capability==='modify',when:()=>!intent.value.trim()?'请先描述目标':null});
 const cancel=el('button','取消 Pi');agentActions.append(cancel);guardButton(cancel,'analyze',panelStatus);cancel.addEventListener('click',async()=>{try{presentResult(explanationOutput,await api('agent-cancel'),{title:'任务取消'});}catch(error){transactionStatus.textContent=error.message;}});
 button(review,'采用 Agent 方案','propose',async()=>{setPlan(await api('plan',{entry:'object',ops:proposal.ops}));},{when:()=>!proposal?.ops?.length?'Agent 尚未提供可执行修改':null});
 button(transactionActions,'验证预览','preview',async()=>{const value=await api('preview',{changeId:plan.changeId});previewed=true;staticLabel.hidden=!value.requiresManualConfirmation;presentResult(reviewOutput,value,{title:'预览与结构差异'});},{when:()=>!plan?'请先生成计划':null});
 button(transactionActions,'批准','approve',async()=>{await api('approve',{changeId:plan.changeId,acknowledgeStatic:staticAcknowledgement.checked});approved=true;},{when:()=>!previewed?'请先验证预览':!staticLabel.hidden&&!staticAcknowledgement.checked?'请先确认静态预览限制':null});
 button(transactionActions,'Apply ↗','apply',async()=>{const latest=plan.entry==='spatial'?await fresh():null;const value=await api('apply',{changeId:plan.changeId,...(latest?{geometry:{before:accepted,after:latest}}:{})});approved=false;previewed=false;presentResult(reviewOutput,value,{title:'事务已执行'});},{primary:true,when:()=>!plan||!approved?'当前计划尚未批准':null});
 button(transactionActions,'Undo','undo',async()=>{const baseline=selection?measure(selection):null,latest=plan.entry==='spatial'?await fresh():null;presentResult(reviewOutput,await api('undo',{changeId:plan.changeId,...(latest?{geometry:{before:baseline,after:latest}}:{})}),{title:'逆事务撤销'});approved=false;previewed=false;},{when:()=>!plan?'请先打开一个计划':null});
 staticAcknowledgement.addEventListener('change',update);
 const manual=el('details'),manualTitle=el('summary','精确结构插入 / 高级');manual.append(manualTitle);
 const markup=el('textarea');markup.value='<section class="new-section"><p>新模块</p></section>';markup.setAttribute('aria-label','待插入静态结构');manual.append(el('p','在真实预览中按 Alt+S 框选。插入前将重新测量坐标和源码版本。'),markup);
 button(manual,'生成空间插入计划','propose',async()=>{const current=await fresh(),resolved=await api('resolve',{sourceId:selection.parentSourceId});accepted=current;setPlan(await api('plan',{entry:'spatial',geometry:{before:accepted,after:current},ops:[{file:resolved.file,type:'insertSibling',anchor:resolved.anchor,objectId:resolved.objectId,resultObjectId:'node.new.'+crypto.randomUUID(),expectedRevision:resolved.revision,position:'append',markup:markup.value,layoutFacts:selection.layoutFacts}]}));},{when:()=>!selection?'请先在预览中框选':null});target.append(manual);
 const specEditor=el('section',undefined,'spec-editor'),specText=el('textarea');specText.rows=24;specText.setAttribute('aria-label','XML architecture document');
 const specActions=el('div',undefined,'action-row'),specStatus=el('output'),mergeChoices=el('div');specStatus.setAttribute('aria-live','polite');
 specEditor.append(el('p','自然语言描述只生成规划；结构变更需通过 Diff、预览、批准和事务。'),specActions,specStatus,specText,mergeChoices);document.getElementById('spec-mount').append(specEditor);
 function showMerges(previews){mergeChoices.replaceChildren();for(const preview of previews){const group=el('fieldset'),legend=el('legend',preview.key+' / '+preview.status);group.append(legend);const columns=el('div',undefined,'merge-columns');for(const [key,label]of [['base','BASE / 基线'],['ours','SPEC / 文档'],['theirs','AST / 源码']]){const column=el('div'),value=preview.columns?.[key];column.append(el('small',label),el('pre',typeof value==='string'?value:JSON.stringify(value,null,2)));columns.append(column);}group.append(columns);const select=el('select');select.dataset.key=preview.key;select.dataset.digest=preview.digest;for(const [label,value]of [['请选择',''],['采用 Spec / ours','ours'],['采用 AST / theirs','theirs']]){const option=el('option',label);option.value=value;select.append(option);}select.setAttribute('aria-label',preview.key+' 冲突选择');group.append(select);mergeChoices.append(group);}}
 let specLoaded=false;
 async function loadSpec(){specStatus.textContent='读取架构文档…';const value=await api('spec-read');specText.value=value.spec;specLoaded=true;specStatus.textContent='已读取 / '+(value.astDrift?.length?value.astDrift.length+' 个文件存在 AST 漂移':'结构基线一致');}
 button(specActions,'读取文档','view',loadSpec);
 button(specActions,'回读 AST','view',async()=>{const result=await api('spec-observe');if(result.observedSpec)specText.value=result.observedSpec;specStatus.textContent='AST 观测完成；需审阅后生成计划';presentResult(reviewOutput,result,{title:'源码结构观测'});});
 button(specActions,'生成结构差异 ↗','propose',async()=>{const merges=[...mergeChoices.querySelectorAll('select')].filter(select=>select.value).map(select=>({key:select.dataset.key,digest:select.dataset.digest,choice:select.value})),result=await api('spec-plan',{spec:specText.value,merges,layoutFacts:selection?.layoutFacts});if(result.writePlan)setPlan(result.writePlan);else presentResult(reviewOutput,result,{title:'架构同步规划'});if(result.mergePreviews)showMerges(result.mergePreviews);specStatus.textContent='规划结果 / '+(result.proposal?.verdict||'已生成');window.dispatchEvent(new CustomEvent('companion:open-agent'));},{primary:true});
 window.addEventListener('companion:spec-open',()=>{if(!specLoaded)void loadSpec().catch(error=>{specStatus.textContent=error.message;});});
 const collaboration=el('details');collaboration.append(el('summary','草稿与项目审阅'));
 button(collaboration,'提交当前提案','propose',async()=>presentResult(reviewOutput,await api('submit',{changeId:plan.changeId}),{title:'已提交审阅'}),{when:()=>!plan?'请先生成计划':null});
 const choice=el('select');choice.setAttribute('aria-label','项目提案');collaboration.append(choice);
 button(collaboration,'刷新提案','view',async()=>{const proposals=await api('proposals');choice.replaceChildren();for(const proposal of proposals){const option=el('option',proposal.creator+' / '+proposal.visibility+' / '+proposal.changeId);option.value=proposal.changeId;choice.append(option);}transactionStatus.textContent=proposals.length+' 个可访问提案';});
 button(collaboration,'打开提案','view',async()=>setPlan(await api('open',{changeId:choice.value})),{when:()=>!choice.value?'请选择一个提案':null});choice.addEventListener('change',update);review.append(collaboration);
 window.addEventListener('companion:object',event=>{selectedObjectId=event.detail.objectId;selected.textContent='当前观测 / '+(event.detail.label||'已选中对象');selected.title=selectedObjectId;proposal=null;update();});
 window.addEventListener('companion:selection',event=>{selection=event.detail;selectedObjectId=null;selected.textContent='空间选区 / '+Math.round(selection.rect?.width||selection.spatial?.rects?.viewport?.width||0)+' × '+Math.round(selection.rect?.height||selection.spatial?.rects?.viewport?.height||0)+' CSS px';if(lastLoggedSelection!==selection.selectionId){lastLoggedSelection=selection.selectionId;void request('/api/memory/event',{kind:'selection',payload:selection}).catch(()=>{});window.dispatchEvent(new CustomEvent('companion:open-agent'));}update();});
 const draftKey='companion.draft.'+account.actor.projectId+'.'+account.actor.userId;try{const draft=JSON.parse(sessionStorage.getItem(draftKey)||'null');if(draft){markup.value=draft.markup||markup.value;intent.value=draft.intent||'';specText.value=draft.spec||'';specLoaded=!!draft.spec;}}catch{}
 for(const input of [markup,intent,specText])input.addEventListener('input',()=>{try{sessionStorage.setItem(draftKey,JSON.stringify({markup:markup.value,intent:intent.value,spec:specText.value}));}catch{}update();});
 window.addEventListener('companion:capabilities',event=>{panelStatus=event.detail;update();});update();
}
