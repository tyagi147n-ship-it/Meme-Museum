const $ = selector => document.querySelector(selector);
const pages = ['home','details','auth','upload','contact'];
let currentUser = null;
let authMode = 'login';
let activeMeme = null;
let sortMode = 'trending';
let toastTimer;

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { ...(options.body ? { 'Content-Type':'application/json' } : {}), ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}
function showToast(message) { const toast = $('#toast'); toast.textContent = message; toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 2600); }
function setPage(name) {
  pages.forEach(p => $(`#${p}-page`).classList.toggle('hidden', p !== name));
  document.querySelectorAll('[data-page]').forEach(a => a.classList.toggle('active', a.dataset.page === name));
  window.scrollTo({ top:0, behavior:'smooth' });
  if (name === 'home') loadMemes();
  if (name === 'auth') setAuthMode('login');
}
function navigate(name) { location.hash = name; if (location.hash === `#${name}`) setPage(name); }
function onHash() {
  const name = location.hash.slice(1) || 'home';
  if (name.startsWith('meme-')) { setPage('details'); showDetails(decodeURIComponent(name.slice(5))); }
  else setPage(pages.includes(name) ? name : 'home');
}
function updateUserUI() {
  $('#welcome').textContent = currentUser ? `Hi, ${currentUser.username}` : '';
  $('#auth-button').classList.toggle('hidden', !!currentUser);
  $('#logout-button').classList.toggle('hidden', !currentUser);
  $('#hero-upload').textContent = currentUser ? '＋ Upload a meme' : '＋ Sign in to upload';
}
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function card(m) {
  return `<article class="meme-card" data-id="${escapeHtml(m.id)}" tabindex="0" aria-label="View ${escapeHtml(m.caption)}"><img class="meme-image" src="${escapeHtml(m.image)}" alt="Meme: ${escapeHtml(m.caption)}"><div class="meme-info"><span class="meme-category">${escapeHtml(m.category)}</span><h3>${escapeHtml(m.caption)}</h3><div class="meme-meta"><span>by ${escapeHtml(m.username)}</span><span class="meme-stats"><span>♥ ${m.likes}</span><span>★ ${m.rating || '—'}</span></span></div></div></article>`;
}
async function loadMemes() {
  const query = encodeURIComponent($('#search-input').value.trim()); const category = encodeURIComponent($('#category-filter').value);
  try {
    const { memes, categories } = await api(`/api/memes?q=${query}&category=${category}&sort=${sortMode}`);
    const select = $('#category-filter'); const selected = select.value;
    const values = ['All', ...categories]; select.innerHTML = values.map(c => `<option value="${escapeHtml(c)}">${c === 'All' ? 'All categories' : escapeHtml(c)}</option>`).join(''); select.value = values.includes(selected) ? selected : 'All';
    $('#meme-grid').innerHTML = memes.map(card).join(''); $('#empty-state').classList.toggle('hidden', memes.length > 0);
    const popular = [...memes].sort((a,b) => b.likes-a.likes)[0];
    $('#popular-meme').innerHTML = popular ? `<img src="${escapeHtml(popular.image)}" alt=""><div>${escapeHtml(popular.caption)}<br><span>♥ ${popular.likes} likes · ${escapeHtml(popular.category)}</span></div>` : '<span>No memes yet — upload the first one!</span>';
  } catch (error) { showToast(error.message); }
}
async function showDetails(id) {
  try {
    const { meme:m } = await api(`/api/memes/${encodeURIComponent(id)}`); activeMeme = m;
    $('#details-content').innerHTML = `<div class="details-layout"><div><img class="details-image" src="${escapeHtml(m.image)}" alt="Meme: ${escapeHtml(m.caption)}"></div><div class="details-panel"><span class="meme-category">${escapeHtml(m.category)}</span><h1>${escapeHtml(m.caption)}</h1><p class="muted">Uploaded by ${escapeHtml(m.username)}</p><div class="details-actions"><button id="like-button" class="action-button" type="button">♥ Like · ${m.likes}</button><span class="muted">${m.rating ? `${m.rating} / 5 (${m.ratingCount} ratings)` : 'No ratings yet'}</span></div><div class="rating-row"><b>Rate it:</b>${[1,2,3,4,5].map(n=>`<button class="star" data-rating="${n}" aria-label="Rate ${n} out of 5" type="button">★</button>`).join('')}</div><h3>Comments (${m.comments.length})</h3><div class="comment-list">${m.comments.length ? m.comments.map(c=>`<p class="comment"><b>${escapeHtml(c.username)}</b>${escapeHtml(c.text)}</p>`).join('') : '<p class="muted">No comments yet. Start the conversation.</p>'}</div><form id="comment-form" class="inline-form"><input name="text" maxlength="500" placeholder="Write a comment…" required><button type="submit">Post</button></form><button class="report-link" id="report-button" type="button">Report inappropriate content</button></div></div>`;
    $('#like-button').addEventListener('click', async () => { try { await api(`/api/memes/${m.id}/like`,{method:'POST',body:'{}'}); await showDetails(m.id); } catch(e) { showToast(e.message); if(!currentUser) navigate('auth'); } });
    document.querySelectorAll('.star').forEach(button=>button.addEventListener('click',async()=>{try{await api(`/api/memes/${m.id}/rate`,{method:'POST',body:JSON.stringify({value:Number(button.dataset.rating)})});showToast('Your rating was saved.');await showDetails(m.id);}catch(e){showToast(e.message);if(!currentUser)navigate('auth');}}));
    $('#comment-form').addEventListener('submit',async event=>{event.preventDefault();const text=new FormData(event.currentTarget).get('text');try{await api(`/api/memes/${m.id}/comments`,{method:'POST',body:JSON.stringify({text})});await showDetails(m.id);}catch(e){showToast(e.message);if(!currentUser)navigate('auth');}});
    $('#report-button').addEventListener('click',async()=>{if(!currentUser){showToast('Please log in to report content.');return navigate('auth');}const reason=prompt('Why are you reporting this meme?');if(!reason)return;try{await api(`/api/memes/${m.id}/report`,{method:'POST',body:JSON.stringify({reason})});showToast('Thank you. Your report has been recorded.');}catch(e){showToast(e.message);}});
  } catch(error) { showToast(error.message); navigate('home'); }
}
function setAuthMode(mode) {
  authMode = mode; $('#auth-title').textContent = mode === 'login' ? 'Welcome back' : 'Create your account'; $('#auth-subtitle').textContent = mode === 'login' ? 'Log in to like, comment, and upload memes.' : 'It only takes a minute to join the community.';
  $('#name-field').classList.toggle('hidden', mode === 'login'); $('#name-field input').required = mode === 'register'; $('#auth-submit').textContent = mode === 'login' ? 'Log in' : 'Create account'; $('#auth-message').textContent = '';
  document.querySelectorAll('[data-auth-mode]').forEach(b => b.classList.toggle('active', b.dataset.authMode === mode));
}

$('#auth-button').addEventListener('click',()=>navigate('auth'));
$('#logout-button').addEventListener('click',async()=>{await api('/api/logout',{method:'POST',body:'{}'});currentUser=null;updateUserUI();showToast('You have logged out.');navigate('home');});
$('#hero-upload').addEventListener('click',()=>currentUser?navigate('upload'):navigate('auth'));
$('#back-home').addEventListener('click',()=>navigate('home'));
$('#show-all').addEventListener('click',()=>{sortMode=sortMode==='trending'?'newest':'trending';$('#show-all').textContent=sortMode==='trending'?'Newest first ↓':'Trending first ↗';loadMemes();});
$('#search-input').addEventListener('input',()=>{clearTimeout(window.searchDelay);window.searchDelay=setTimeout(loadMemes,180);});
$('#category-filter').addEventListener('change',loadMemes);
$('#meme-grid').addEventListener('click',e=>{const c=e.target.closest('.meme-card');if(c)navigate(`meme-${encodeURIComponent(c.dataset.id)}`);});
$('#meme-grid').addEventListener('keydown',e=>{const c=e.target.closest('.meme-card');if(c&&(e.key==='Enter'||e.key===' ')){e.preventDefault();navigate(`meme-${encodeURIComponent(c.dataset.id)}`);}});
document.querySelectorAll('[data-auth-mode]').forEach(b=>b.addEventListener('click',()=>setAuthMode(b.dataset.authMode)));
$('#auth-form').addEventListener('submit',async event=>{event.preventDefault();const form=Object.fromEntries(new FormData(event.currentTarget));$('#auth-message').textContent='Please wait…';try{const result=await api(`/api/${authMode}`,{method:'POST',body:JSON.stringify(form)});currentUser=result.user;updateUserUI();showToast(authMode==='login'?'You are logged in!':'Your account is ready!');navigate('home');}catch(error){$('#auth-message').textContent=error.message;}});
$('#upload-form').addEventListener('change',event=>{if(event.target.name!=='image')return;const file=event.target.files[0];if(!file)return;const box=$('#image-preview');box.innerHTML=`<img src="${URL.createObjectURL(file)}" alt="Selected meme preview">`;box.classList.remove('hidden');});
$('#upload-form').addEventListener('submit',async event=>{event.preventDefault();if(!currentUser){showToast('Please log in first.');return navigate('auth');}const uploadForm=event.currentTarget;const form=new FormData(uploadForm);const file=form.get('image');const message=$('#upload-message');if(!file||!file.size)return; if(file.size>5*1024*1024){message.textContent='Image must be smaller than 5 MB.';return;}const reader=new FileReader();reader.onload=async()=>{message.textContent='Uploading…';try{await api('/api/upload',{method:'POST',body:JSON.stringify({caption:form.get('caption'),category:form.get('category'),imageData:reader.result})});uploadForm.reset();$('#image-preview').classList.add('hidden');showToast('Your meme is now in the museum!');navigate('home');}catch(error){message.textContent=error.message;}};reader.readAsDataURL(file);});
$('#contact-form').addEventListener('submit',async event=>{event.preventDefault();const form=Object.fromEntries(new FormData(event.currentTarget));try{const result=await api('/api/contact',{method:'POST',body:JSON.stringify(form)});$('#contact-message').textContent=result.message;event.currentTarget.reset();}catch(error){$('#contact-message').textContent=error.message;}});
window.addEventListener('hashchange',onHash);
(async()=>{try{const result=await api('/api/me');currentUser=result.user;updateUserUI();}catch{}onHash();})();
