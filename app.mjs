import {PRESETS,shape,baseAt,sample,matrixElement,tile,bounds,descriptor,physicalBytes} from './engine.mjs';
const $=id=>document.getElementById(id);
const state={cfg:{...PRESETS.first},preset:'first',mode:'window',start:0,r:0,s:0,c0:0,cpp:1,count:6,step:0,page:0,stage:0};
let timer=null;
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tuple=(...n)=>`(${n.join(', ')})`;
const hex=n=>n===null?'—':`0x${n.toString(16).toUpperCase().padStart(4,'0')}`;
const fields=[['N','Batch N',[1,2]],['H','输入高度 H',[3,4,5,6]],['W','输入宽度 W',[3,4,5,6]],['C','通道 C',[1,2,4,8]],['R','核高度 R',[1,2,3]],['S','核宽度 S',[1,2,3]],['stride','卷积 stride',[1,2,3]],['dilation','核内 dilation',[1,2]],['pad','四周 padding',[0,1,2]]];
const options=(values,current,labels)=>values.map((v,i)=>`<option value="${v}" ${v===current?'selected':''}>${escape(labels?labels[i]:v)}</option>`).join('');
function stop(){if(timer)clearInterval(timer);timer=null;$('play').textContent='播放取数';}
function opts(){return {start:state.start,count:state.count,r:state.r,s:state.s,c0:state.c0,cpp:state.cpp};}
function current(){return sample(state.cfg,state.mode==='tma'?state.start+state.step:state.start,state.r,state.s,state.c0);}
function syncStep(){
  if(state.mode==='window'){
    const c=state.cfg;state.c0=state.step%c.C;
    const rs=Math.floor(state.step/c.C);state.r=Math.floor(rs/c.S);state.s=rs%c.S;
  }
}
function maxStep(){return state.mode==='window'?shape(state.cfg).K-1:state.count-1;}
function selectSample(m,r,s){stop();state.start=m;state.r=r;state.s=s;state.step=state.mode==='window'?(r*state.cfg.S+s)*state.cfg.C+state.c0:0;render();}
function applyPreset(key){
  stop();Object.assign(state,{cfg:{...PRESETS[key]},preset:key,start:key==='batch'?7:0,r:0,s:0,c0:0,cpp:key==='channels'?8:1,count:6,step:0,page:0});
  renderConfig();render();
}
function renderConfig(){
  $('config-fields').innerHTML=fields.map(([key,label,values])=>`<label>${label}<select data-field="${key}" aria-label="${label}">${options(values,state.cfg[key])}</select></label>`).join('');
  $('config-fields').querySelectorAll('select').forEach(el=>el.addEventListener('change',()=>{
    stop();state.cfg[el.dataset.field]=Number(el.value);state.preset='custom';state.start=0;state.step=0;state.page=0;state.r=0;state.s=0;state.c0=0;state.cpp=Math.min(state.cpp,state.cfg.C);render();
  }));
}
function renderPresets(){
  $('presets').innerHTML=Object.entries(PRESETS).map(([k,p])=>`<button class="preset ${state.preset===k?'active':''}" data-preset="${k}" aria-pressed="${state.preset===k}">${p.name}</button>`).join('');
  $('presets').querySelectorAll('button').forEach(b=>b.onclick=()=>applyPreset(b.dataset.preset));
}
function renderControls(){
  const c=state.cfg,g=shape(c);
  $('start-output').innerHTML=options(Array.from({length:g.M},(_,i)=>i),state.start,Array.from({length:g.M},(_,m)=>{const b=baseAt(c,m);return `${m} · n,p,q=${tuple(b.n,b.p,b.q)}`;}));
  $('kernel-offset').innerHTML=options(Array.from({length:c.R*c.S},(_,i)=>i),state.r*c.S+state.s,Array.from({length:c.R*c.S},(_,i)=>tuple(Math.floor(i/c.S),i%c.S)));
  $('channel').innerHTML=options(Array.from({length:c.C},(_,i)=>i),state.c0);
  const channelSizes=[1,2,4,8].filter(x=>x<=c.C);
  state.cpp=channelSizes.includes(state.cpp)?state.cpp:channelSizes[channelSizes.length-1];
  $('channel-count').innerHTML=options(channelSizes,state.cpp);
  $('pixel-count').value=String(state.count);
  document.querySelectorAll('.tma-control').forEach(x=>x.hidden=state.mode!=='tma');
  document.querySelectorAll('[data-mode]').forEach(x=>{x.classList.toggle('active',x.dataset.mode===state.mode);x.setAttribute('aria-pressed',String(x.dataset.mode===state.mode));});
  $('shape-bar').innerHTML=`<div class="shape-stat">输入 NHWC<b>${c.N} × ${c.H} × ${c.W} × ${c.C}</b></div><div class="shape-stat">每张图输出 P×Q<b>${g.P} × ${g.Q}</b></div><div class="shape-stat">逻辑矩阵 A · M×K<b>${g.M} × ${g.K}</b></div>`;
  $('lab-intro').innerHTML=state.mode==='window'?'<b>窗口视角：</b>固定一个输出位置，把这个窗口里的核位置与通道逐个展开。矩阵中高亮一行；点击矩阵单元可以反查输入来源。':'<b>TMA 视角：</b>固定核内偏移，连续遍历指定数量的窗口基准位置；每个位置取一段通道。矩阵中的高亮竖带对应这次请求的一部分。';
}
function renderInput(){
  const c=state.cfg,a=current(),g=shape(c),p=c.pad;
  const curBase=baseAt(c,a.m),batch=a.n;
  const samples=state.mode==='tma'?tile(c,opts()).map(x=>x.lanes[0]):Array.from({length:c.R*c.S},(_,k)=>sample(c,state.start,Math.floor(k/c.S),k%c.S,state.c0));
  const grid=$('input-grid');grid.style.gridTemplateColumns=`20px repeat(${c.W+2*p},minmax(0,1fr))`;
  let html='<div class="grid-axis">h/w</div>';
  for(let w=-p;w<c.W+p;w++)html+=`<div class="grid-axis">${w}</div>`;
  for(let h=-p;h<c.H+p;h++){
    html+=`<div class="grid-axis">${h}</div>`;
    for(let w=-p;w<c.W+p;w++){
      const valid=batch<c.N&&h>=0&&h<c.H&&w>=0&&w<c.W;
      const inWindow=state.mode==='window'&&h>=curBase.h&&h<curBase.h+g.effectiveH&&w>=curBase.w&&w<curBase.w+g.effectiveW;
      const included=samples.some(x=>x.n===batch&&x.h===h&&x.w===w);
      const selected=a.h===h&&a.w===w;
      const v=valid?1+(((batch*c.H+h)*c.W+w)*c.C+state.c0):0;
      const cls=['pixel',!valid?'pad':'',inWindow?'window':'',included&&state.mode==='tma'?'in-tile':'',selected?'current':''].filter(Boolean).join(' ');
      html+=`<div class="${cls}" title="X${tuple(batch,h,w,state.c0)} = ${v}${!valid?'（越界补零）':''}">${v}${included&&state.mode==='window'?'<span class="sample-dot" aria-hidden="true"></span>':''}${h===curBase.h&&w===curBase.w?'<span class="base-origin" aria-hidden="true">◇</span>':''}</div>`;
    }
  }
  grid.innerHTML=html;
  $('input-slice').textContent=`n=${batch}${batch>=c.N?' · batch 越界':''}, c=${state.c0}`;
  $('input-caption').textContent=state.mode==='window'?`窗口基准 ${tuple(curBase.h,curBase.w)}；当前核内位置 ${tuple(state.r,state.s)}。小点表示真实采样点；dilation 增大时，窗口内会有跳过的位置。`:`本次取数跨 ${new Set(samples.map(x=>x.n)).size} 个 batch 编号；当前只显示 n=${batch}、c=${state.c0} 切片。其他通道和图像见下方目标数据。`;
}
function renderMatrix(){
  const c=state.cfg,g=shape(c),selected=current();
  state.page=Math.max(0,Math.min(state.page,Math.floor((g.M-1)/9)));
  const first=state.page*9,last=Math.min(first+9,g.M),grid=$('matrix-grid');
  grid.style.gridTemplateColumns=`52px repeat(${c.R*c.S},minmax(24px,1fr))`;
  let html='<div class="matrix-head">m / r,s</div>';
  for(let k=0;k<c.R*c.S;k++)html+=`<div class="matrix-head">${Math.floor(k/c.S)},${k%c.S}</div>`;
  for(let m=first;m<last;m++){
    const b=baseAt(c,m);html+=`<button class="matrix-row-label" data-row="${m}" title="n,p,q = ${tuple(b.n,b.p,b.q)}">m=${m}</button>`;
    for(let k=0;k<c.R*c.S;k++){
      const r=Math.floor(k/c.S),s=k%c.S,v=sample(c,m,r,s,state.c0);
      const active=m===selected.m&&r===state.r&&s===state.s;
      const inTile=state.mode==='tma'&&m>=state.start&&m<state.start+state.count&&r===state.r&&s===state.s;
      const cls=['matrix-cell',!v.valid?'oob':'',state.mode==='window'&&m===state.start?'in-row':'',inTile?'in-tile':'',active?'current':''].filter(Boolean).join(' ');
      html+=`<button class="${cls}" data-m="${m}" data-r="${r}" data-s="${s}" aria-label="输出 ${m}，核位置 ${r},${s}，通道 ${state.c0}，值 ${v.value}">${v.value}</button>`;
    }
  }
  grid.innerHTML=html;
  grid.querySelectorAll('.matrix-cell').forEach(b=>b.onclick=()=>selectSample(Number(b.dataset.m),Number(b.dataset.r),Number(b.dataset.s)));
  grid.querySelectorAll('[data-row]').forEach(b=>b.onclick=()=>selectSample(Number(b.dataset.row),state.r,state.s));
  $('matrix-slice').textContent=`c=${state.c0} 切片`;
  $('matrix-caption').textContent=`每行 = 一个输出位置；每列 = 当前通道下的核内位置。${c.C>1?`完整 A 有 ${g.K} 列，这里仅显示通道 ${state.c0} 的 ${c.R*c.S} 列。`:'此例为单通道，显示全部 K 列。'}此矩阵用于解释逻辑，不代表已在显存生成。`;
  $('matrix-page').textContent=`行 ${first}–${last-1} / ${g.M}`;
  $('matrix-prev').disabled=state.page===0;$('matrix-next').disabled=last>=g.M;
}
function rowsForDisplay(){
  const c=state.cfg;
  if(state.mode==='tma')return tile(c,opts());
  return Array.from({length:c.R*c.S},(_,rs)=>({i:rs,m:state.start,base:baseAt(c,state.start),lanes:Array.from({length:c.C},(_,ch)=>({...sample(c,state.start,Math.floor(rs/c.S),rs%c.S,ch),destination:(rs*c.C+ch)*c.bytes}))}));
}
function renderDestination(){
  const c=state.cfg,rows=rowsForDisplay(),isTma=state.mode==='tma',selected=current();
  $('destination-kicker').textContent=isTma?'SHARED MEMORY · 本次请求':'ONE LOGICAL ROW · 当前窗口';
  $('destination-title').textContent=isTma?'一次搬运，得到这个 tile':'把一个窗口排成一行';
  $('destination-size').textContent=isTma?`${state.count} 位置 × ${state.cpp} 通道 × ${c.bytes}B`:`${c.R*c.S} 核位置 × ${c.C} 通道`;
  $('destination-grid').innerHTML=rows.map(row=>{
    const active=isTma?row.i===state.step:row.i===state.r*c.S+state.s;
    const label=isTma?`i=${row.i} · m=${row.m}`:`r,s=${tuple(Math.floor(row.i/c.S),row.i%c.S)}`;
    return `<div class="dest-group ${active?'active':''}"><div class="dest-label">${label}</div><div class="lanes">${row.lanes.map(x=>`<span class="lane ${!x.valid?'zero':''} ${active&&x.ch===state.c0?'selected':''}" title="c=${x.ch} · dst=${hex(x.destination)}">${x.value}</span>`).join('')}</div></div>`;
  }).join('');
  if(isTma){const info=physicalBytes(c,opts());$('destination-caption').textContent=`每个小组先放 Channels-per-Pixel 个通道，然后放下一个位置。总输出 ${info.payload}B，其中 ${info.zeroElements} 个元素补零。此处没有拼出整个 R×S 窗口；换核内 offset 要发起后续请求。`;}
  else $('destination-caption').textContent='这里展示传统展开的逻辑顺序 (r,s,c)，不是一次普通 TMA im2col 请求。切到「TMA 搬运」看硬件一次会准备哪一片数据。';
  const list=rows.flatMap(row=>row.lanes.map(x=>({...x,i:row.i})));
  $('trace-body').innerHTML=list.map((x,i)=>`<tr class="${x.m===selected.m&&x.r===selected.r&&x.s===selected.s&&x.ch===selected.ch?'highlight':''}"><td>${i}</td><td>${tuple(x.base.n,x.base.h,x.base.w)}</td><td>${tuple(x.n,x.h,x.w,x.ch)}</td><td>${x.valid?hex(x.address):'<span class="zero-value">越界 → 不读</span>'}</td><td>${hex(x.destination)}</td><td class="${!x.valid?'zero-value':''}">${x.value}</td></tr>`).join('');
}
function renderReadout(){
  const c=state.cfg,a=current();
  $('selection-readout').innerHTML=`<span>基准 <code>${tuple(a.base.h,a.base.w)}</code> + 偏移 <code>${tuple(state.r*c.dilation,state.s*c.dilation)}</code></span><span>→ X<code>${tuple(a.n,a.h,a.w,a.ch)}</code></span><span class="${!a.valid?'oob-text':''}">${a.valid?`读 ${hex(a.address)} → 值 ${a.value}`:'越界 → 生成 0，不向该坐标发读请求'}</span>`;
  $('step').max=String(maxStep());$('step').value=String(state.step);
  $('step-label').textContent=state.mode==='window'?`第 ${state.step+1} / ${maxStep()+1} 个窗口元素`:`第 ${state.step+1} / ${state.count} 个位置（该位置全部通道一起观察）`;
  $('prev').disabled=state.step===0;$('next').disabled=state.step>=maxStep();
  const d=descriptor(c,opts());$('descriptor').textContent=JSON.stringify(d,null,2);
  const b=bounds(c);
  $('descriptor-explanation').innerHTML=`<h4>描述符中相对稳定的配置</h4><p>输入尺寸 / 字节跨度、bounding box、每位置通道数、位置数量、遍历步长、填充与目标排布。</p><h4>每次指令提供的参数</h4><p>起始坐标 (c,w,h,n) 与 offset (Δw,Δh)。注意这里按低维在前排列，和人通常书写的 NHWC 顺序不同。</p><h4>本例窗口基准位置的范围</h4><p>h₀：${b.lowerH} … ${c.H-1+b.upperH}<br>w₀：${b.lowerW} … ${c.W-1+b.upperW}<br>每次推进 ${c.stride}，到行末换行，再到下一张图。</p><h4>请求长度并不等于范围面积</h4><p>本次从 m=${state.start} 开始请求 ${state.count} 个位置；不足一行会停止，跨行会继续，超出 batch 则按本例补零。</p>`;
}
const stages=[
  {name:'配置与解码',label:'接口设计建议',title:'把“需要哪些输入”描述完整。',body:'新增模式需要明确卷积坐标和输出 tile 的合同。可以参考 NVIDIA 的拆分：描述符保存几何信息，每条请求指定起点与当前核偏移。',items:['候选复用：命令队列、decode、参数锁存。','需要定义：输入尺寸、空间 / 通道起点、边界、步长、PPC / CPP、填充值。','不从 conv 标志或旧 descriptor 的可编码性推断已有 im2col 支持。'],live:(a,c)=>`起点 (c,w₀,h₀,n) = ${tuple(state.c0,a.base.w,a.base.h,a.n)}\n当前 offset (Δw,Δh) = ${tuple(state.s*c.dilation,state.r*c.dilation)}\n输出 ${state.count} 个位置 × ${state.cpp} 个通道`},
  {name:'卷积坐标生成',label:'核心新增建议',title:'把输出位置翻译成输入坐标。',body:'普通连续搬运的计数器并不知道卷积窗口。这里需要推进窗口基准位置，并加上固定核偏移；跨行、跨 batch 时按几何规则回卷。',items:['可复用现有计数 / 地址生成结构，但要补充卷积遍历语义。','stride 控制窗口起点间隔；dilation 作用于核内 offset。','软件也可以展开成多条命令，但命令与索引开销需要测量。'],live:(a,c)=>`h = p×stride − pad + r×dilation\n  = ${a.base.p}×${c.stride} − ${c.pad} + ${state.r}×${c.dilation} = ${a.h}\nw = ${a.base.q}×${c.stride} − ${c.pad} + ${state.s}×${c.dilation} = ${a.w}`},
  {name:'越界与补零',label:'核心新增建议',title:'先判断坐标，再形成合法读请求。',body:'padding 位置也占用输出 tile 的槽位。必须保留这一位置的身份，由零值路径提供数据，避免把负坐标当作正常地址发出去。',items:['检查 batch、空间维度和通道尾段。','Bounding box 的范围与真实输入边界是两种不同检查。','本页按零填充示意；量化系统的 padding 值需另外约定。'],live:(a,c)=>`0 ≤ n < ${c.N}; 0 ≤ h < ${c.H}\n0 ≤ w < ${c.W}; 0 ≤ c < ${c.C}\n本笔 ${tuple(a.n,a.h,a.w,a.ch)} → ${a.valid?'有效，进入读路径':'越界，走补零路径'}`},
  {name:'读请求与返回',label:'候选复用 + 扩展',title:'保持每段返回数据的身份。',body:'项目已有请求、返回、缓存与反压职责可作为基础。im2col 生成的不连续区域怎样合并成事务、如何与补零片段合流，需要和实际总线接口一起设计。',items:['记录像素序号、通道段及目标位置。','不把元素级地址表直接当成总线 burst 计划。','既有 gather 需要索引生成、对齐与 OOB 配合，不能仅凭名称判断能替代 im2col。'],live:(a,c)=>a.valid?`byte offset = (((n×H+h)×W+w)×C+c)×${c.bytes}\n当前源偏移：${hex(a.address)}\n示意：有效数据返回后携带目标位置标签。`:`本笔不发真实读请求。\n生成值 0，仍保留对应目标槽位。`},
  {name:'打包与写 L1',label:'候选复用 + 新约定',title:'把一串通道段排成消费端需要的 tile。',body:'本例按 [pixel, channel] 紧凑写出。项目的实际落地格式应与后续矩阵计算通路对齐；如需要折叠或转置，再叠加对应的目的布局变换。',items:['每个 pixel 的通道段连续，接着放下一个 pixel。','im2col 本身不必经过转置引擎。','新 tile 的 stride、对齐、尾段与已有 Act / K 布局需定义清楚。'],live:(a,c)=>`dst_offset(i,j) = (i×CPP+j)×${c.bytes}\nCPP = ${state.cpp}; PPC = ${state.count}\n本次逻辑载荷 = ${state.count*state.cpp*c.bytes}B\n本页关闭 swizzle / interleave。`},
  {name:'完成与同步',label:'需要明确验证',title:'完成意味着消费端真的可以使用数据。',body:'请求发完、读数据返回、写数据发出、写完成或可见，是不同的时刻。项目需要定义 done 与目标存储接口的合同，不能直接照搬 NVIDIA 的同步名称。',items:['真实读、补零片段和目标输出都必须计入。','存在未决事务、反压或异常时，完成不能提前。','这条流程仅表达职责关系，不代表真实周期精度。'],live:(a,c)=>`检查：读返回 / 补零 / 打包 / 写完成\n目标应产生 ${state.count*state.cpp} 个元素\n再按项目约定发出 done / 可用通知。`}
];
function renderStage(){
  $('stage-tabs').innerHTML=stages.map((s,i)=>`<button class="stage-tab ${state.stage===i?'active':''}" data-stage="${i}" aria-pressed="${state.stage===i}"><small>0${i+1} ${i<5?'→':''}</small><strong>${s.name}</strong></button>`).join('');
  $('stage-tabs').querySelectorAll('button').forEach(x=>x.onclick=()=>{state.stage=Number(x.dataset.stage);renderStage();});
  const s=stages[state.stage],a=shape(state.cfg).M?current():null;
  $('stage-detail').innerHTML=`<div><span class="tag green">${s.label}</span><h3>${s.title}</h3><p>${s.body}</p><ul>${s.items.map(x=>`<li>${x}</li>`).join('')}</ul></div><div class="stage-live"><span>沿用上方实验的当前取数</span><code>${escape(a?s.live(a,state.cfg):'先选择能产生输出的卷积参数。')}</code></div>`;
}
const quizzes=[
  {q:'3×3 卷积核，Pixels-per-Column=64。一次普通 im2col 请求一定读完整的 64 个 3×3 窗口吗？',a:['是，64 个完整窗口','否，固定一个核内偏移'],correct:1,why:'普通 .im2col 请求固定空间 offset，并遍历 64 个基准位置；每个位置读 CPP 个通道。核内其余位置由后续请求覆盖。'},
  {q:'把 dilation 从 1 改成 2，最直接改变的是什么？',a:['窗口起点前进两格','核内采样点间隔变大'],correct:1,why:'stride 改窗口基准位置的推进间隔；dilation 改核内 r、s 对应的输入偏移。两者在地址公式里处于不同位置。'},
  {q:'读到 padding 区域时，这个位置会从输出 tile 里消失吗？',a:['不会，保留位置并填值','会，跳过这个位置'],correct:0,why:'它仍然对应矩阵中的一个元素。本例补零，而且不向这个越界坐标发读请求；否则矩阵形状和后续位置会错位。'},
  {q:'已有 transpose 和 gather，就能直接证明项目支持 TMA im2col 吗？',a:['能，都是数据重排','不能，还要核对取数语义'],correct:1,why:'还要证明卷积索引生成、跨行与跨 batch、负空间坐标、OOB / 通道尾段、目标打包与完成语义。已有结构可能复用，但功能不自动等价。'}
];
function renderQuiz(){
  $('quiz-list').innerHTML=quizzes.map((q,i)=>`<article class="quiz-card"><span class="quiz-no">QUESTION 0${i+1}</span><h3>${q.q}</h3><div class="quiz-options">${q.a.map((v,j)=>`<button data-q="${i}" data-a="${j}" aria-pressed="false">${v}</button>`).join('')}</div><p class="quiz-feedback" id="quiz-feedback-${i}" hidden aria-live="polite"></p></article>`).join('');
  $('quiz-list').querySelectorAll('button').forEach(b=>b.onclick=()=>{
    const i=Number(b.dataset.q),answer=Number(b.dataset.a),q=quizzes[i],correct=answer===q.correct;
    b.parentElement.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
    const feedback=$(`quiz-feedback-${i}`);feedback.hidden=false;feedback.className=`quiz-feedback ${correct?'correct':'incorrect'}`;feedback.textContent=`${correct?'判断正确。':'再想一下：'}${q.why}`;
  });
}
function render(){
  const g=shape(state.cfg);renderPresets();$('invalid').hidden=g.M>0;$('lab-content').hidden=g.M===0;
  if(!g.M){$('invalid').textContent='当前有效卷积核大于补齐后的输入，输出为空。减小核 / dilation，或增加输入 / padding。';$('shape-bar').innerHTML='';renderStage();return;}
  state.start=Math.min(state.start,g.M-1);state.step=Math.min(state.step,maxStep());
  renderControls();renderInput();renderMatrix();renderDestination();renderReadout();renderStage();
}
function advance(delta){state.step=Math.max(0,Math.min(maxStep(),state.step+delta));syncStep();const m=state.mode==='tma'?state.start+state.step:state.start;if(m<shape(state.cfg).M)state.page=Math.floor(m/9);render();}
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{stop();state.mode=b.dataset.mode;state.step=state.mode==='window'?(state.r*state.cfg.S+state.s)*state.cfg.C+state.c0:0;render();});
$('start-output').onchange=e=>{stop();state.start=Number(e.target.value);state.step=state.mode==='window'?(state.r*state.cfg.S+state.s)*state.cfg.C+state.c0:0;state.page=Math.floor(state.start/9);render();};
$('kernel-offset').onchange=e=>{stop();const v=Number(e.target.value);state.r=Math.floor(v/state.cfg.S);state.s=v%state.cfg.S;state.step=state.mode==='window'?v*state.cfg.C+state.c0:0;render();};
$('channel').onchange=e=>{stop();state.c0=Number(e.target.value);state.step=state.mode==='window'?(state.r*state.cfg.S+state.s)*state.cfg.C+state.c0:state.step;render();};
$('pixel-count').onchange=e=>{stop();state.count=Number(e.target.value);state.step=0;render();};
$('channel-count').onchange=e=>{stop();state.cpp=Number(e.target.value);render();};
$('step').oninput=e=>{stop();state.step=Number(e.target.value);syncStep();const m=state.mode==='tma'?state.start+state.step:state.start;state.page=Math.floor(Math.min(m,shape(state.cfg).M-1)/9);render();};
$('prev').onclick=()=>{stop();advance(-1);};$('next').onclick=()=>{stop();advance(1);};
$('restart').onclick=()=>{stop();state.step=0;syncStep();state.page=Math.floor(state.start/9);render();};
$('play').onclick=()=>{if(timer){stop();return;}if(state.step>=maxStep()){state.step=0;syncStep();render();}$('play').textContent='暂停';timer=setInterval(()=>{if(state.step>=maxStep()){stop();return;}advance(1);},850);};
$('matrix-prev').onclick=()=>{state.page--;renderMatrix();};$('matrix-next').onclick=()=>{state.page++;renderMatrix();};
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
renderConfig();renderQuiz();render();
// Read-only state snapshot for browser QA; all lesson computation is local.
window.im2colLab={snapshot:()=>JSON.parse(JSON.stringify({...state,shape:shape(state.cfg),current:shape(state.cfg).M?current():null}))};
