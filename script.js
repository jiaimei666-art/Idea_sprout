(() => {
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const app = $('#app'), workspace = $('#workspace');
  const notesLayer = $('#notesLayer'), emptyHint = $('#emptyHint'), lineGroup = $('#lineGroup');
  const doodle = $('#doodleCanvas'), ctx = doodle.getContext('2d');
  const saveStatus = $('#saveStatus');
  const PROJECTS_KEY = 'ideaSproutProjectsV1', BOARD_PREFIX = 'ideaSproutBoard:';
  function ensureProjectId() {
    const params=new URLSearchParams(location.search);let id=params.get('project');let projects=[];
    try{projects=JSON.parse(localStorage.getItem(PROJECTS_KEY))||[];}catch(_){}
    if(!id){id=`${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}`;const old=localStorage.getItem('ideaSproutBoardV1');if(old)localStorage.setItem(BOARD_PREFIX+id,old);history.replaceState(null,'',`board.html?project=${encodeURIComponent(id)}`);}
    if(!projects.some(p=>p.id===id)){const now=Date.now();projects.push({id,title:'My bright ideas',createdAt:now,updatedAt:now,noteCount:0});localStorage.setItem(PROJECTS_KEY,JSON.stringify(projects));}
    return id;
  }
  const projectId=ensureProjectId(), STORAGE=BOARD_PREFIX+projectId;
  let state = { title: 'My bright ideas', notes: [], lines: [], drawing: null, hasDoodle: false };
  let tool = 'note', drawMode = 'pen', chosenColor = '#ffe678', chosenNoteSize = 'medium', connectingFrom = null, drag = null, drawing = false, drawStart = null, drawSnapshot = null, saveTimer;

  function uid() { return Math.random().toString(36).slice(2, 9); }
  function escapeText(value) { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE));
      if (saved) state = {...state, ...saved};
      state.hasDoodle = Boolean(state.hasDoodle || state.drawing);
      state.notes = state.notes.map(n => ({...n, size:['small','medium','large'].includes(n.size) ? n.size : 'medium', tags:Array.isArray(n.tags) ? n.tags : (n.tag ? [n.tag] : [])}));
    } catch (_) {}
  }
  function save() {
    state.drawing = doodle.toDataURL(); localStorage.setItem(STORAGE, JSON.stringify(state));
    try{const projects=JSON.parse(localStorage.getItem(PROJECTS_KEY))||[],p=projects.find(x=>x.id===projectId),now=Date.now();if(p){p.title=state.title||'Untitled project';p.updatedAt=now;p.noteCount=state.notes.length;}else projects.push({id:projectId,title:state.title||'Untitled project',createdAt:now,updatedAt:now,noteCount:state.notes.length});localStorage.setItem(PROJECTS_KEY,JSON.stringify(projects));}catch(_){}
    saveStatus.innerHTML = '<i></i> Saved';
  }
  function scheduleSave() { saveStatus.innerHTML = '<i style="background:#f2b84b"></i> Saving'; clearTimeout(saveTimer); saveTimer = setTimeout(save, 250); }
  function showApp() { if (app) app.hidden = false; resizeCanvas(true); renderAll(); }
  function renderAll() { $('#boardTitle').value = state.title; document.title=`${state.title || 'Idea Board'} — Idea Sprout`; renderNotes(); renderLines(); restoreDrawing(); }
  function noteTextColor(hex) {
    let value=String(hex||'#ffe678').replace('#','');if(value.length===3)value=value.split('').map(c=>c+c).join('');
    const rgb=[0,2,4].map(i=>parseInt(value.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4));
    const luminance=.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
    return (luminance+.05)/.05 >= 1.05/(luminance+.05) ? '#172044' : '#ffffff';
  }
  function updateEmptyHint(){emptyHint.hidden=state.notes.length>0||state.hasDoodle;}
  function renderNotes(animateId = null) {
    notesLayer.innerHTML = state.notes.map(n => {
      const tags = (n.tags || []).map((tag, i) => `<span class="tag-chip tone-${i % 4}"><span>#${escapeText(tag)}</span><button class="tag-remove" data-tag-index="${i}" aria-label="Remove ${escapeText(tag)} tag">×</button></span>`).join('');
      const size=n.size||'medium';
      return `<article class="note size-${size}${n.id === animateId ? ' new-note' : ''}" data-id="${n.id}" style="left:${n.x}px;top:${n.y}px;background:${n.color};--tilt:${n.tilt}deg;--note-text:${noteTextColor(n.color)}"><div class="note-handle" aria-label="Drag note"></div><button class="note-delete" aria-label="Delete note">×</button><textarea maxlength="220" aria-label="Idea text" placeholder="Type your idea...">${escapeText(n.text)}</textarea><div class="tag-row">${tags}<input class="tag-input" maxlength="20" aria-label="Add a tag" placeholder="+ tag"></div></article>`;
    }).join('');
    updateEmptyHint();
  }
  function createNote(x, y, text = '', color = chosenColor, tag = '', size = chosenNoteSize) {
    const sizes={small:[170,145],medium:[210,165],large:[260,210]},dims=sizes[size]||sizes.medium,w=Math.min(dims[0],workspace.clientWidth-16),h=dims[1];
    const maxX = Math.max(8, workspace.clientWidth - w - 8), maxY = Math.max(8, workspace.clientHeight - h - 8);
    const note = {id:uid(), x:Math.max(8, Math.min(x - w / 2, maxX)), y:Math.max(8, Math.min(y - 35, maxY)), text, tags:tag ? [tag.replace(/^#/, '')] : [], color, size, tilt:(Math.random()*4-2).toFixed(1)};
    state.notes.push(note); renderNotes(note.id); renderLines(); scheduleSave();
    const area = $(`.note[data-id="${note.id}"] textarea`); if (area && !text) area.focus();
    return note;
  }
  function renderLines() {
    lineGroup.innerHTML = '';
    state.lines = state.lines.filter(l => state.notes.some(n=>n.id===l.a) && state.notes.some(n=>n.id===l.b));
    state.lines.forEach(l => {
      const a = $(`.note[data-id="${l.a}"]`), b = $(`.note[data-id="${l.b}"]`); if (!a || !b) return;
      const ca = center(a), cb = center(b), p1 = edgePoint(a, cb), p2 = edgePoint(b, ca), bend = Math.max(35, Math.abs(p2.x-p1.x)*.18);
      const d = `M ${p1.x} ${p1.y} C ${p1.x+bend} ${p1.y}, ${p2.x-bend} ${p2.y}, ${p2.x} ${p2.y}`;
      lineGroup.insertAdjacentHTML('beforeend', `<path d="${d}"/><path class="hit" data-id="${l.id}" d="${d}"/>`);
    });
  }
  function center(el) { return {x:el.offsetLeft+el.offsetWidth/2, y:el.offsetTop+el.offsetHeight/2}; }
  function edgePoint(el, toward) {
    const c = center(el), dx = toward.x - c.x, dy = toward.y - c.y;
    if (!dx && !dy) return c;
    const tx = dx ? (el.offsetWidth / 2) / Math.abs(dx) : Infinity;
    const ty = dy ? (el.offsetHeight / 2) / Math.abs(dy) : Infinity;
    const scale = Math.min(tx, ty);
    return {x:c.x + dx * scale, y:c.y + dy * scale};
  }
  function setTool(next) {
    tool = next; connectingFrom = null; $$('.note').forEach(n=>n.classList.remove('connect-ready'));
    $$('.tool').forEach(b=>b.classList.toggle('active', b.dataset.tool === next));
    workspace.classList.toggle('draw-mode', next === 'draw'); workspace.classList.toggle('connect-mode', next === 'connect');
    $('#drawOptions').hidden = next !== 'draw'; $('#connectTip').hidden = next !== 'connect';
  }
  function resizeCanvas(preserve = false) {
    if (!app || app.hidden) return; const old = preserve && doodle.width ? doodle.toDataURL() : null;
    doodle.width = workspace.clientWidth * devicePixelRatio; doodle.height = workspace.clientHeight * devicePixelRatio;
    doodle.style.width = workspace.clientWidth+'px'; doodle.style.height = workspace.clientHeight+'px'; ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0); ctx.lineCap='round'; ctx.lineJoin='round';
    if (old) drawImage(old);
  }
  function drawImage(src) { if (!src) return; const img = new Image(); img.onload=()=>ctx.drawImage(img,0,0,workspace.clientWidth,workspace.clientHeight); img.src=src; }
  function restoreDrawing() { if (state.drawing) drawImage(state.drawing); }
  function point(e) { const r=workspace.getBoundingClientRect(), t=e.touches?.[0] || e; return {x:t.clientX-r.left,y:t.clientY-r.top}; }
  function drawCurrentShape(from,to) {
    ctx.globalCompositeOperation='source-over';ctx.strokeStyle=$('#penColor').value;ctx.lineWidth=Number($('#brushSize').value);ctx.beginPath();
    if(drawMode==='line'){ctx.moveTo(from.x,from.y);ctx.lineTo(to.x,to.y);}
    if(drawMode==='box'){ctx.rect(from.x,from.y,to.x-from.x,to.y-from.y);}
    if(drawMode==='circle'){const cx=(from.x+to.x)/2,cy=(from.y+to.y)/2,rx=Math.abs(to.x-from.x)/2,ry=Math.abs(to.y-from.y)/2;ctx.ellipse(cx,cy,rx,ry,0,0,Math.PI*2);}
    ctx.stroke();
  }

  if ($('#startBtn')) $('#startBtn').onclick = () => { window.location.href = 'board.html'; };
  if ($('#homeBtn')) $('#homeBtn').addEventListener('click', save);
  $('#boardTitle').addEventListener('input', e => { state.title=e.target.value; scheduleSave(); });
  $$('.tool').forEach(b => b.onclick = () => setTool(b.dataset.tool));
  $$('.color').forEach(b => b.onclick = () => { chosenColor=b.dataset.color; $$('.color').forEach(c=>c.classList.toggle('active',c===b)); });
  const customNoteColor = $('#customNoteColor');
  if (customNoteColor) customNoteColor.addEventListener('input', e => { chosenColor=e.target.value; $$('.color').forEach(c=>c.classList.remove('active')); });
  $$('.note-sizes button').forEach(b=>b.addEventListener('click',()=>{chosenNoteSize=b.dataset.noteSize;$$('.note-sizes button').forEach(x=>x.classList.toggle('active',x===b));}));
  $$('.shape-tool').forEach(b=>b.addEventListener('click',()=>{drawMode=b.dataset.shape;$$('.shape-tool').forEach(x=>x.classList.toggle('active',x===b));}));
  $('#brushSize').addEventListener('input',e=>{$('#brushSizeValue').value=e.target.value;});
  workspace.addEventListener('pointerdown', e => {
    if (tool !== 'note' || e.target !== workspace && e.target !== notesLayer && e.target !== emptyHint) return;
    const p=point(e); if (p.x < 225 && p.y < 300) return; createNote(p.x,p.y);
  });
  notesLayer.addEventListener('input', e => {
    const el=e.target.closest('.note'), n=state.notes.find(x=>x.id===el?.dataset.id); if(!n)return;
    if(e.target.matches('textarea')) { n.text=e.target.value; scheduleSave(); }
  });
  notesLayer.addEventListener('keydown', e => {
    if(!e.target.matches('.tag-input') || !['Enter', ','].includes(e.key)) return;
    e.preventDefault(); const el=e.target.closest('.note'), n=state.notes.find(x=>x.id===el.dataset.id);
    const additions=e.target.value.split(',').map(t=>t.trim().replace(/^#+/, '')).filter(Boolean);
    n.tags=n.tags||[];
    additions.forEach(tag=>{if(n.tags.length<5&&!n.tags.some(t=>t.toLowerCase()===tag.toLowerCase()))n.tags.push(tag.slice(0,20));});
    renderNotes(); renderLines(); scheduleSave(); $(`.note[data-id="${n.id}"] .tag-input`)?.focus();
  });
  notesLayer.addEventListener('click', e => {
    const el=e.target.closest('.note'); if(!el)return; const id=el.dataset.id;
    if(e.target.matches('.note-delete')) { state.notes=state.notes.filter(n=>n.id!==id); state.lines=state.lines.filter(l=>l.a!==id&&l.b!==id); renderNotes();renderLines();scheduleSave();return; }
    const remove=e.target.closest('.tag-remove');
    if(remove){const n=state.notes.find(x=>x.id===id);n.tags.splice(Number(remove.dataset.tagIndex),1);renderNotes();renderLines();scheduleSave();return;}
    if(tool==='connect') { e.preventDefault(); if(!connectingFrom){connectingFrom=id;el.classList.add('connect-ready');} else if(connectingFrom!==id){ if(!state.lines.some(l=>l.a===connectingFrom&&l.b===id))state.lines.push({id:uid(),a:connectingFrom,b:id}); connectingFrom=null; $$('.note').forEach(n=>n.classList.remove('connect-ready'));renderLines();scheduleSave();} }
  });
  notesLayer.addEventListener('pointerdown', e => {
    if(!e.target.matches('.note-handle') || tool==='draw' || tool==='connect')return; const el=e.target.closest('.note'), n=state.notes.find(x=>x.id===el.dataset.id), p=point(e); drag={el,n,dx:p.x-n.x,dy:p.y-n.y}; el.setPointerCapture(e.pointerId);
  });
  notesLayer.addEventListener('pointermove', e => { if(!drag)return; const p=point(e); drag.n.x=Math.max(0,Math.min(p.x-drag.dx,workspace.clientWidth-drag.el.offsetWidth));drag.n.y=Math.max(0,Math.min(p.y-drag.dy,workspace.clientHeight-drag.el.offsetHeight));drag.el.style.left=drag.n.x+'px';drag.el.style.top=drag.n.y+'px';renderLines(); });
  notesLayer.addEventListener('pointerup', () => { if(drag){drag=null;scheduleSave();} });
  lineGroup.addEventListener('click', e => { if(e.target.matches('.hit')){state.lines=state.lines.filter(l=>l.id!==e.target.dataset.id);renderLines();scheduleSave();} });
  doodle.addEventListener('pointerdown', e => {if(tool!=='draw')return;drawing=true;drawStart=point(e);if(drawMode!=='eraser'){state.hasDoodle=true;updateEmptyHint();}if(drawMode==='pen'||drawMode==='eraser'){ctx.beginPath();ctx.moveTo(drawStart.x,drawStart.y);}else{drawSnapshot=ctx.getImageData(0,0,doodle.width,doodle.height);}doodle.setPointerCapture(e.pointerId);});
  doodle.addEventListener('pointermove', e => {if(!drawing)return;const p=point(e);ctx.lineWidth=Number($('#brushSize').value);if(drawMode==='pen'||drawMode==='eraser'){ctx.globalCompositeOperation=drawMode==='eraser'?'destination-out':'source-over';ctx.strokeStyle=drawMode==='eraser'?'rgba(0,0,0,1)':$('#penColor').value;ctx.lineTo(p.x,p.y);ctx.stroke();}else{ctx.putImageData(drawSnapshot,0,0);drawCurrentShape(drawStart,p);}});
  doodle.addEventListener('pointerup', () => {if(drawing){ctx.globalCompositeOperation='source-over';drawing=false;drawSnapshot=null;scheduleSave();}});
  doodle.addEventListener('pointercancel', () => {if(drawing){if(drawSnapshot)ctx.putImageData(drawSnapshot,0,0);ctx.globalCompositeOperation='source-over';drawing=false;drawSnapshot=null;scheduleSave();}});
  $('#clearDrawing').onclick=()=>{ctx.clearRect(0,0,doodle.width,doodle.height);state.drawing=null;state.hasDoodle=false;updateEmptyHint();scheduleSave();};
  $('#helpBtn').onclick=()=>$('#helpDialog').showModal(); $('.dialog-close').onclick=()=>$('#helpDialog').close();
  $('#clearBtn').onclick=()=>$('#clearDialog').showModal(); $('#cancelClear').onclick=()=>$('#clearDialog').close();
  $('#confirmClear').onclick=()=>{state.notes=[];state.lines=[];state.drawing=null;state.hasDoodle=false;ctx.clearRect(0,0,doodle.width,doodle.height);renderNotes();renderLines();scheduleSave();$('#clearDialog').close();};
  addEventListener('resize',()=>{resizeCanvas(true);renderLines();});

  function registerTools(){ const mc=document.modelContext;if(!mc?.registerTool)return; const register=(spec)=>{try{Promise.resolve(mc.registerTool(spec)).catch(()=>{});}catch(_){}};
    register({name:'add_idea_note',title:'Add idea note',description:'Add a sticky note to the visible idea board.',inputSchema:{type:'object',properties:{text:{type:'string'},tag:{type:'string'},color:{type:'string',enum:['yellow','pink','mint','blue','purple']},size:{type:'string',enum:['small','medium','large']}},required:['text'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){if(!input||typeof input.text!=='string'||!input.text.trim())throw new Error('Text is required');if(app.hidden)showApp();const colors={yellow:'#ffe678',pink:'#ff9fb2',mint:'#9ee7d7',blue:'#a8c7ff',purple:'#d8b4fe'};const n=createNote(workspace.clientWidth/2,workspace.clientHeight/2,input.text.trim(),colors[input.color]||chosenColor,String(input.tag||''),input.size||chosenNoteSize);return{id:n.id,text:n.text,size:n.size};}});
    register({name:'read_idea_board',title:'Read idea board',description:'Read the current board title, notes, and connections.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute(){return{title:state.title,notes:state.notes.map(({id,text,tags,color,size})=>({id,text,tags,color,size})),connections:state.lines.map(({a,b})=>({from:a,to:b}))};}});
  }
  load(); registerTools();
  if (document.body.dataset.page === 'board') { resizeCanvas(false); renderAll(); }
})();
