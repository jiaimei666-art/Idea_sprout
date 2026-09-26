(() => {
  const PROJECTS_KEY = 'ideaSproutProjectsV1', OLD_BOARD_KEY = 'ideaSproutBoardV1', BOARD_PREFIX = 'ideaSproutBoard:';
  const $ = s => document.querySelector(s);
  const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}`;
  const escapeText = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let projects = [], pendingDeleteId = null;
  function loadProjects() {
    const hasProjectList = localStorage.getItem(PROJECTS_KEY) !== null;
    try { projects = JSON.parse(localStorage.getItem(PROJECTS_KEY)) || []; } catch (_) { projects = []; }
    const old = localStorage.getItem(OLD_BOARD_KEY);
    if (!hasProjectList && old) {
      try { const board=JSON.parse(old),id=uid(),now=Date.now();projects=[{id,title:board.title||'My bright ideas',createdAt:now,updatedAt:now,noteCount:(board.notes||[]).length}];localStorage.setItem(BOARD_PREFIX+id,old);localStorage.setItem(PROJECTS_KEY,JSON.stringify(projects));localStorage.removeItem(OLD_BOARD_KEY); } catch (_) {}
    }
    render();
  }
  function render() {
    projects.sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
    $('#projectCount').textContent=`${projects.length} ${projects.length===1?'project':'projects'}`;
    $('#projectEmpty').hidden=projects.length>0;$('#projectGrid').hidden=projects.length===0;
    $('#projectGrid').innerHTML=projects.map((p,i)=>`<article class="project-card" style="--card-color:${['#ffe678','#9ee7d7','#ff9fb2','#a8c7ff','#d8b4fe'][i%5]}"><a href="board.html?project=${encodeURIComponent(p.id)}" aria-label="Open ${escapeText(p.title)}"><div class="project-preview"><span></span><span></span><span></span><b>↗</b></div><div class="project-info"><h3>${escapeText(p.title)}</h3><p>${p.noteCount||0} ${(p.noteCount||0)===1?'note':'notes'}</p></div></a><button type="button" class="project-delete" data-id="${escapeText(p.id)}" aria-label="Delete ${escapeText(p.title)}">×</button></article>`).join('');
    document.querySelectorAll('.project-delete').forEach(button=>button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();requestDelete(button.dataset.id);}));
  }
  function openDialog(){ $('#projectDialog').showModal();$('#projectName').value='';setTimeout(()=>$('#projectName').focus(),0); }
  function closeDialog(){ $('#projectDialog').close(); }
  function createProject(name){const id=uid(),now=Date.now(),title=name.trim()||'Untitled project';projects.unshift({id,title,createdAt:now,updatedAt:now,noteCount:0});localStorage.setItem(PROJECTS_KEY,JSON.stringify(projects));localStorage.setItem(BOARD_PREFIX+id,JSON.stringify({title,notes:[],lines:[],drawing:null}));location.href=`board.html?project=${encodeURIComponent(id)}`;}
  function requestDelete(id){const p=projects.find(x=>String(x.id)===String(id));if(!p)return;pendingDeleteId=String(p.id);$('#deleteProjectName').textContent=`“${p.title}”`;$('#deleteProjectDialog').showModal();}
  function closeDeleteDialog(){pendingDeleteId=null;$('#deleteProjectDialog').close();}
  function removeProject(){if(!pendingDeleteId)return;const id=pendingDeleteId;projects=projects.filter(x=>String(x.id)!==id);localStorage.removeItem(BOARD_PREFIX+id);localStorage.setItem(PROJECTS_KEY,JSON.stringify(projects));localStorage.removeItem(OLD_BOARD_KEY);pendingDeleteId=null;$('#deleteProjectDialog').close();render();}
  document.querySelectorAll('.new-project-btn').forEach(b=>b.addEventListener('click',openDialog));
  $('#closeProjectDialog').onclick=closeDialog;$('#cancelProject').onclick=closeDialog;
  $('#closeDeleteDialog').onclick=closeDeleteDialog;$('#cancelDeleteProject').onclick=closeDeleteDialog;$('#confirmDeleteProject').onclick=removeProject;
  $('#projectForm').addEventListener('submit',e=>{e.preventDefault();createProject($('#projectName').value);});
  loadProjects();
})();
