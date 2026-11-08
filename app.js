/* JPR Coach · app de entrenamiento y alimentación (fase 1) */
(() => {
'use strict';

const CFG = window.JPR_CONFIG || {};
const DEMO = !(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);

/* =====================================================================
   Utilidades
   ===================================================================== */
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random()*16|0; return (c === 'x' ? r : (r&3|8)).toString(16); }));
const clone = o => JSON.parse(JSON.stringify(o));
const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0,10); };
const num = v => { if (v === '' || v == null) return null; const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? null : n; };
const fmtNum = (n, d=1) => n == null ? '-' : (Math.round(n * 10**d) / 10**d).toLocaleString('es-ES');
const parseDate = s => { const [y,m,d] = String(s).slice(0,10).split('-').map(Number); return new Date(y, m-1, d); };
const fmtDate = (s, opts={day:'numeric', month:'short'}) => s ? parseDate(s).toLocaleDateString('es-ES', opts).replace('.', '') : '-';
const daysAgo = s => { if (!s) return null; return Math.round((parseDate(today()) - parseDate(s)) / 864e5); };
const relDate = s => { const d = daysAgo(s); if (d == null) return 'nunca'; if (d <= 0) return 'hoy'; if (d === 1) return 'ayer'; if (d < 7) return `hace ${d} días`; if (d < 14) return 'hace 1 semana'; if (d < 60) return `hace ${Math.floor(d/7)} semanas`; return fmtDate(s, {day:'numeric', month:'short', year:'numeric'}); };
const initials = n => (n || '?').trim().split(/\s+/).slice(0,2).map(w => w[0]).join('').toUpperCase() || '?';
const firstName = n => (n || '').trim().split(/\s+/)[0] || '';
const getPath = (o, p) => p.split('.').reduce((a,k) => a?.[k], o);
const setPath = (o, p, v) => { const ks = p.split('.'); let t = o; for (let i = 0; i < ks.length - 1; i++) t = t[ks[i]]; t[ks[ks.length-1]] = v; };

function toast(msg, ms = 2400){
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms);
}
function modal(html, onMount){
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<div class="sheet">${html}</div>`;
  document.body.appendChild(m);
  const close = () => m.remove();
  m.addEventListener('click', e => { if (e.target === m) close(); });
  onMount && onMount(m, close);
  return close;
}
function confirmBox(title, text, okLabel = 'Sí, continuar', danger = false){
  return new Promise(res => {
    modal(`<h2>${esc(title)}</h2><p class="muted">${esc(text)}</p>
      <div class="grid2" style="margin-top:14px"><button class="btn light" data-x="no">Cancelar</button>
      <button class="btn ${danger ? 'danger' : ''}" data-x="ok">${esc(okLabel)}</button></div>`, (m, close) => {
      m.querySelector('[data-x=no]').onclick = () => { close(); res(false); };
      m.querySelector('[data-x=ok]').onclick = () => { close(); res(true); };
    });
  });
}

/* ---------- Iconos ---------- */
const I = {
  dumbbell:'<path d="M6.5 6.5v11M3.5 9v6M17.5 6.5v11M20.5 9v6M6.5 12h11"/>',
  food:'<path d="M7 3v8a2 2 0 0 0 2 2v8M11 3v8a2 2 0 0 1-2 2M9 3v6M17 21V3c-2 0-3 2-3 5v5h3"/>',
  chart:'<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  users:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  back:'<path d="m15 18-6-6 6-6"/>',
  trash:'<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  check:'<path d="m5 12 5 5 9-10"/>',
  edit:'<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  logout:'<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11"/>',
  up:'<path d="m6 15 6-6 6 6"/>', down:'<path d="m6 9 6 6 6-6"/>',
  x:'<path d="M6 6l12 12M18 6 6 18"/>',
  scale:'<path d="M5 21h14l-1-14H6z"/><path d="M9 7a3 3 0 0 1 6 0"/>',
  play:'<path d="M7 4l13 8-13 8z"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  chat:'<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
  camera:'<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  file:'<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5"/>',
  send:'<path d="M4 12 20 4l-6 16-3-7z"/>',
  upload:'<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>',
};
const icon = (n, fill) => `<svg viewBox="0 0 24 24" fill="${fill ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${I[n]}</svg>`;

const EXERCISES = ['Sentadilla','Sentadilla frontal','Sentadilla búlgara','Prensa de piernas','Peso muerto','Peso muerto rumano','Hip thrust','Puente de glúteo','Zancadas','Step up','Extensión de cuádriceps','Curl femoral tumbado','Curl femoral sentado','Elevación de gemelos','Press banca','Press banca inclinado','Press con mancuernas','Fondos','Flexiones','Aperturas','Press militar','Press de hombro con mancuernas','Elevaciones laterales','Pájaros','Face pull','Dominadas','Jalón al pecho','Remo con barra','Remo con mancuerna','Remo en polea','Pullover','Curl de bíceps','Curl martillo','Extensión de tríceps en polea','Press francés','Plancha','Plancha lateral','Rueda abdominal','Crunch en polea','Pallof press','Kettlebell swing','Farmer walk','Remo ergómetro','Bici','Cinta'];

/* =====================================================================
   Capa de datos: Supabase o demo local
   ===================================================================== */
const TABLES = {
  workout_plans: ['id','client_id','name','notes','days','active'],
  nutrition_plans: ['id','client_id','name','kcal','protein_g','carbs_g','fat_g','water_l','meals','guidelines','active'],
  workout_logs: ['id','client_id','plan_id','day_name','date','entries','rpe','notes'],
  body_metrics: ['id','client_id','date','weight_kg','waist_cm','hip_cm','chest_cm','arm_cm','thigh_cm','body_fat','sleep','stress','energy','notes'],
  messages: ['id','client_id','sender_id','body'],
  progress_photos: ['id','client_id','date','pose','path','notes'],
  documents: ['id','client_id','name','kind','path','size_bytes'],
};
const PROFILE_FIELDS_CLIENT = ['full_name','phone','birth_date','height_cm','goal'];
const PROFILE_FIELDS_COACH = [...PROFILE_FIELDS_CLIENT, 'status', 'notes'];
const pick = (o, keys) => Object.fromEntries(keys.filter(k => k in o).map(k => [k, o[k] === '' ? null : o[k]]));

function SupabaseAPI(){
  const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  const ok = ({data, error}) => { if (error) throw error; return data; };
  const list = (t, cid, order = 'created_at', asc = false) => sb.from(t).select('*').eq('client_id', cid).order(order, {ascending: asc}).then(ok);
  const upsert = (t, row) => sb.from(t).upsert(pick(row, TABLES[t])).select().single().then(ok);
  const del = (t, id) => sb.from(t).delete().eq('id', id).then(ok);
  const setActive = async (t, row) => {
    const saved = await upsert(t, row);
    if (row.active) await sb.from(t).update({active:false}).eq('client_id', row.client_id).neq('id', saved.id).then(ok);
    return saved;
  };
  return {
    demo: false,
    onAuth(cb){ sb.auth.onAuthStateChange((ev, session) => cb(ev, session)); },
    async session(){ return ok(await sb.auth.getSession()).session; },
    async signIn(email, password){ return ok(await sb.auth.signInWithPassword({email, password})); },
    async signUp(email, password, full_name){
      return ok(await sb.auth.signUp({email, password, options:{ data:{ full_name, consent:'true' }, emailRedirectTo: location.origin + location.pathname }}));
    },
    async signOut(){ await sb.auth.signOut(); },
    async resetPassword(email){ return ok(await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname })); },
    async updatePassword(password){ return ok(await sb.auth.updateUser({password})); },
    async me(){ const s = await this.session(); if (!s) return null; return ok(await sb.from('profiles').select('*').eq('id', s.user.id).single()); },
    async clients(){ return ok(await sb.from('profiles').select('*').eq('role','client').order('full_name')); },
    async activity(){
      const [logs, mets] = await Promise.all([
        sb.from('workout_logs').select('client_id,date').order('date', {ascending:false}).limit(2000).then(ok),
        sb.from('body_metrics').select('client_id,date,weight_kg').order('date', {ascending:false}).limit(2000).then(ok),
      ]);
      return {logs, mets};
    },
    async profile(id){ return ok(await sb.from('profiles').select('*').eq('id', id).single()); },
    async updateProfile(id, patch, asCoach){ return ok(await sb.from('profiles').update(pick(patch, asCoach ? PROFILE_FIELDS_COACH : PROFILE_FIELDS_CLIENT)).eq('id', id).select().single()); },
    plans: cid => list('workout_plans', cid),
    savePlan: row => setActive('workout_plans', row),
    deletePlan: id => del('workout_plans', id),
    nutrition: cid => list('nutrition_plans', cid),
    saveNutrition: row => setActive('nutrition_plans', row),
    deleteNutrition: id => del('nutrition_plans', id),
    logs: cid => sb.from('workout_logs').select('*').eq('client_id', cid).order('date', {ascending:false}).order('created_at', {ascending:false}).limit(300).then(ok),
    saveLog: row => upsert('workout_logs', row),
    deleteLog: id => del('workout_logs', id),
    metrics: cid => list('body_metrics', cid, 'date', true),
    saveMetric: row => upsert('body_metrics', row),
    deleteMetric: id => del('body_metrics', id),
    // Mensajes
    messages: cid => sb.from('messages').select('*').eq('client_id', cid).order('created_at', {ascending:true}).limit(500).then(ok),
    sendMessage: row => sb.from('messages').upsert(pick(row, TABLES.messages)).select().single().then(ok),
    async markRead(cid, meId){ await sb.from('messages').update({read_at: new Date().toISOString()}).eq('client_id', cid).neq('sender_id', meId).is('read_at', null).then(ok); },
    async unread(meId){ const rows = await sb.from('messages').select('client_id').neq('sender_id', meId).is('read_at', null).limit(2000).then(ok); const m = {}; rows.forEach(r => { m[r.client_id] = (m[r.client_id] || 0) + 1; }); return m; },
    subscribe(cb){ const ch = sb.channel('mensajes').on('postgres_changes', {event:'INSERT', schema:'public', table:'messages'}, p => cb(p.new)).subscribe(); return () => sb.removeChannel(ch); },
    // Fotos y documentos (almacenamiento privado)
    photos: cid => list('progress_photos', cid, 'date', false),
    async uploadPhoto(row, blob){ const path = `${row.client_id}/photos/${row.id}.jpg`; ok(await sb.storage.from('jpr').upload(path, blob, {contentType:'image/jpeg', upsert:true})); return upsert('progress_photos', {...row, path}); },
    async deletePhoto(row){ await sb.storage.from('jpr').remove([row.path]); return del('progress_photos', row.id); },
    async fileUrls(paths){ if (!paths.length) return {}; const data = ok(await sb.storage.from('jpr').createSignedUrls(paths, 3600)); const m = {}; data.forEach(d => { if (d.signedUrl) m[d.path] = d.signedUrl; }); return m; },
    docs: cid => list('documents', cid),
    async uploadDoc(row, file){ const safe = (file.name || 'documento.pdf').normalize('NFD').replace(/[^\w.-]+/g, '_'); const path = `${row.client_id}/docs/${row.id}-${safe}`; ok(await sb.storage.from('jpr').upload(path, file, {contentType:'application/pdf', upsert:true})); return upsert('documents', {...row, path, size_bytes: file.size}); },
    async deleteDoc(row){ await sb.storage.from('jpr').remove([row.path]); return del('documents', row.id); },
  };
}

function DemoAPI(){
  const KEY = 'jpr-demo-v1', SKEY = 'jpr-demo-session';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || seed(); } catch(e){ return mem || (mem = seed()); } };
  let mem = null;
  let db = load();
  ['messages','progress_photos','documents'].forEach(k => { if (!db[k]) db[k] = []; });
  let listeners = [];
  const files = {};
  const putFile = async (path, blob) => {
    files[path] = URL.createObjectURL(blob);
    try { const d = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); }); localStorage.setItem('jpr-demo-file:' + path, d); } catch(e){}
  };
  const getFile = path => {
    if (files[path]) return files[path];
    try { const d = localStorage.getItem('jpr-demo-file:' + path); if (d){ files[path] = URL.createObjectURL(dataURLtoBlob(d)); return files[path]; } } catch(e){}
    return null;
  };
  const delFile = path => { delete files[path]; try { localStorage.removeItem('jpr-demo-file:' + path); } catch(e){} };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch(e){ mem = db; } };
  const now = () => new Date().toISOString();
  const wait = v => new Promise(r => setTimeout(() => r(clone(v)), 60));
  const upsert = (t, row) => {
    const r = pick(row, TABLES[t]); r.id = r.id || uid();
    const i = db[t].findIndex(x => x.id === r.id);
    if (i >= 0) db[t][i] = {...db[t][i], ...r, updated_at: now()}; else db[t].push({...r, created_at: now(), updated_at: now()});
    if (r.active && (t === 'workout_plans' || t === 'nutrition_plans')) db[t].forEach(x => { if (x.client_id === r.client_id && x.id !== r.id) x.active = false; });
    save(); return wait(db[t].find(x => x.id === r.id));
  };
  const del = (t, id) => { db[t] = db[t].filter(x => x.id !== id); save(); return wait(null); };
  const byClient = (t, cid) => db[t].filter(x => x.client_id === cid);
  let sess = (() => { try { return localStorage.getItem(SKEY); } catch(e){ return null; } })();
  const setSess = v => { sess = v; try { v ? localStorage.setItem(SKEY, v) : localStorage.removeItem(SKEY); } catch(e){} };
  return {
    demo: true,
    onAuth(){},
    async session(){ return sess ? {user:{id:sess}} : null; },
    async signIn(id){ setSess(id); },
    async signUp(){ throw new Error('En el modo demo no se pueden crear cuentas. Usa los botones de entrada rápida.'); },
    async signOut(){ setSess(null); },
    async resetPassword(){ throw new Error('No disponible en el modo demo.'); },
    async updatePassword(){},
    reset(){ db = seed(); save(); },
    async me(){ return sess ? wait(db.profiles.find(p => p.id === sess) || null) : null; },
    async clients(){ return wait(db.profiles.filter(p => p.role === 'client').sort((a,b) => a.full_name.localeCompare(b.full_name))); },
    async activity(){ return wait({logs: db.workout_logs, mets: db.body_metrics}); },
    async profile(id){ return wait(db.profiles.find(p => p.id === id)); },
    async updateProfile(id, patch, asCoach){ const p = db.profiles.find(x => x.id === id); Object.assign(p, pick(patch, asCoach ? PROFILE_FIELDS_COACH : PROFILE_FIELDS_CLIENT)); save(); return wait(p); },
    plans: cid => wait(byClient('workout_plans', cid).sort((a,b) => b.created_at.localeCompare(a.created_at))),
    savePlan: row => upsert('workout_plans', row),
    deletePlan: id => del('workout_plans', id),
    nutrition: cid => wait(byClient('nutrition_plans', cid).sort((a,b) => b.created_at.localeCompare(a.created_at))),
    saveNutrition: row => upsert('nutrition_plans', row),
    deleteNutrition: id => del('nutrition_plans', id),
    logs: cid => wait(byClient('workout_logs', cid).sort((a,b) => (b.date + b.created_at).localeCompare(a.date + a.created_at))),
    saveLog: row => upsert('workout_logs', row),
    deleteLog: id => del('workout_logs', id),
    metrics: cid => wait(byClient('body_metrics', cid).sort((a,b) => a.date.localeCompare(b.date))),
    saveMetric: row => upsert('body_metrics', row),
    deleteMetric: id => del('body_metrics', id),
    messages: cid => wait(db.messages.filter(m => m.client_id === cid).sort((a,b) => a.created_at.localeCompare(b.created_at))),
    async sendMessage(row){ const r = {...pick(row, TABLES.messages), read_at: null, created_at: now()}; r.id = r.id || uid(); db.messages = db.messages.filter(m => m.id !== r.id); db.messages.push(r); save(); setTimeout(() => listeners.forEach(f => f(clone(r))), 30); return wait(r); },
    async markRead(cid, meId){ db.messages.forEach(m => { if (m.client_id === cid && m.sender_id !== meId && !m.read_at) m.read_at = now(); }); save(); },
    async unread(meId){ const m = {}; db.messages.forEach(r => { if (r.sender_id !== meId && !r.read_at && (sess === 'demo-coach' || r.client_id === sess)) m[r.client_id] = (m[r.client_id] || 0) + 1; }); return m; },
    subscribe(cb){ listeners.push(cb); return () => { listeners = listeners.filter(f => f !== cb); }; },
    photos: cid => wait(byClient('progress_photos', cid).sort((a,b) => b.date.localeCompare(a.date))),
    async uploadPhoto(row, blob){ const path = `${row.client_id}/photos/${row.id}.jpg`; await putFile(path, blob); return upsert('progress_photos', {...row, path}); },
    async deletePhoto(row){ delFile(row.path); return del('progress_photos', row.id); },
    async fileUrls(paths){ const m = {}; paths.forEach(p => { const u = getFile(p); if (u) m[p] = u; }); return m; },
    docs: cid => wait(byClient('documents', cid).sort((a,b) => b.created_at.localeCompare(a.created_at))),
    async uploadDoc(row, file){ const path = `${row.client_id}/docs/${row.id}.pdf`; await putFile(path, file); return upsert('documents', {...row, path, size_bytes: file.size}); },
    async deleteDoc(row){ delFile(row.path); return del('documents', row.id); },
  };
}

function dataURLtoBlob(d){
  const [h, b64] = d.split(','); const mime = (h.match(/:(.*?);/) || [])[1] || 'application/octet-stream';
  const bin = atob(b64); const arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], {type: mime});
}

function seed(){
  const d = n => { const x = new Date(); x.setDate(x.getDate() - n); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0,10); };
  const ts = n => new Date(Date.now() - n*864e5).toISOString();
  const coach = {id:'demo-coach', email:'coach@demo', full_name: CFG.COACH_NAME || 'Coach', role:'coach', status:'active', created_at: ts(200)};
  const ana = {id:'demo-ana', email:'ana@demo', full_name:'Ana García', role:'client', status:'active', phone:'600 111 222', birth_date:'1990-04-12', height_cm:165, goal:'Perder grasa y ganar fuerza en tren inferior', notes:'Molestias leves en rodilla izquierda. Vigilar sentadilla profunda.', consent_at: ts(60), created_at: ts(60)};
  const luis = {id:'demo-luis', email:'luis@demo', full_name:'Luis Martín', role:'client', status:'active', height_cm:180, goal:'Ganar masa muscular', created_at: ts(30), consent_at: ts(30)};
  const marta = {id:'demo-marta', email:'marta@demo', full_name:'Marta Ruiz', role:'client', status:'pending', goal:'', created_at: ts(1), consent_at: ts(1)};
  const ex = (name, sets, reps, rest, load, notes='') => ({name, sets, reps, rest, load, notes});
  const plan = {id:'demo-plan-ana', client_id:'demo-ana', name:'Bloque 1: base de fuerza', notes:'3 días por semana. Deja 1-2 repeticiones en reserva en todas las series.', active:true, created_at: ts(50), updated_at: ts(50), days:[
    {name:'Día A: pierna', exercises:[ex('Sentadilla','4','8-10','2 min','50 kg','Bajar controlado, 3 s'), ex('Peso muerto rumano','3','10','90 s','40 kg'), ex('Zancadas','3','12 por pierna','60 s','2x8 kg'), ex('Plancha','3','40 s','45 s','')]},
    {name:'Día B: torso', exercises:[ex('Press banca','4','8','2 min','30 kg'), ex('Remo con mancuerna','4','10','90 s','14 kg'), ex('Press militar','3','10','90 s','20 kg'), ex('Face pull','3','15','60 s','')]},
    {name:'Día C: glúteo y core', exercises:[ex('Hip thrust','4','10','2 min','60 kg'), ex('Sentadilla búlgara','3','10','90 s','2x6 kg'), ex('Curl femoral tumbado','3','12','60 s','25 kg'), ex('Pallof press','3','12','45 s','')]},
  ]};
  const logs = [];
  let w = 0;
  for (let k = 42; k >= 2; k -= 2){
    const day = plan.days[w % 3]; w++;
    const prog = Math.floor((42 - k) / 6) * 2.5;
    logs.push({id: uid(), client_id:'demo-ana', plan_id: plan.id, day_name: day.name, date: d(k), rpe: 7 + (k % 3 === 0 ? 1 : 0), notes: k === 4 ? 'Muy bien, la rodilla sin molestias' : '', created_at: ts(k),
      entries: day.exercises.slice(0,3).map(e => { const base = parseFloat(e.load) || 10; return {exercise: e.name, sets: Array.from({length: +e.sets || 3}, () => ({reps: String(parseInt(e.reps) || 10), kg: String(base + prog)}))}; })});
  }
  const mets = [];
  for (let k = 56; k >= 0; k -= 7){ const i = (56 - k) / 7; mets.push({id: uid(), client_id:'demo-ana', date: d(k), weight_kg: +(72.4 - i*0.45 + (i%2 ? .2 : 0)).toFixed(1), waist_cm: +(84 - i*0.6).toFixed(1), hip_cm: +(102 - i*0.3).toFixed(1), body_fat: +(29 - i*0.35).toFixed(1), sleep: 3 + (i%2), stress: 3, energy: 3 + (i>4?1:0), created_at: ts(k)}); }
  for (let k = 21; k >= 0; k -= 7){ const i = (21-k)/7; mets.push({id: uid(), client_id:'demo-luis', date: d(k), weight_kg: +(74 + i*0.3).toFixed(1), created_at: ts(k)}); }
  logs.push({id: uid(), client_id:'demo-luis', plan_id:null, day_name:'Torso', date: d(9), entries:[{exercise:'Press banca', sets:[{reps:'8', kg:'60'},{reps:'8', kg:'60'}]}], created_at: ts(9)});
  const opt = (...o) => o;
  const nut = {id:'demo-nut-ana', client_id:'demo-ana', name:'Alimentación: bloque 1', kcal:1750, protein_g:130, carbs_g:170, fat_g:60, water_l:2.5, active:true, created_at: ts(50), updated_at: ts(50),
    guidelines:'Pésate en ayunas 2 días por semana, siempre el mismo día.\nBebe de 2,5 a 3 L de agua al día.\nSi un día te pasas, no pasa nada: sigue con la siguiente comida normal.\nVerdura libre en comida y cena.',
    meals:[
      {name:'Desayuno', time:'08:00', notes:'', options: opt('60 g de copos de avena + 250 ml de leche semidesnatada + 1 plátano','2 tostadas de pan integral (70 g) + 80 g de pavo + 1 tomate','200 g de yogur griego natural + 30 g de cereales sin azúcar + 100 g de frutos rojos','2 huevos revueltos + 1 tostada integral (35 g) + 1 kiwi','1 tortilla de avena: 40 g de avena + 2 claras + 1 huevo + canela','250 g de queso fresco batido + 30 g de nueces + 1 manzana','Café con leche + 1 bocadillo pequeño (60 g de pan) con 60 g de jamón serrano')},
      {name:'Media mañana', time:'11:30', notes:'', options: opt('1 pieza de fruta + 20 g de almendras','1 yogur proteico','1 lata de atún al natural + 2 tortitas de arroz','Batido de proteína (30 g) con agua','150 g de queso fresco batido + 1 pera','2 huevos cocidos','1 barrita de proteína (menos de 200 kcal)')},
      {name:'Comida', time:'14:30', notes:'Plato de casa: la mitad verdura, un cuarto proteína y un cuarto hidrato.', options: opt('150 g de pechuga de pollo + 70 g de arroz integral (en crudo) + ensalada','150 g de salmón + 250 g de patata cocida + verdura salteada','Lentejas con verduras: 70 g de lentejas (en crudo) + 100 g de pollo','150 g de ternera magra + 70 g de pasta integral + pisto','200 g de merluza + 200 g de boniato asado + judías verdes','Garbanzos: 70 g (en crudo) con espinacas + 2 huevos duros','150 g de pavo a la plancha + 70 g de quinoa + verduras al horno')},
      {name:'Merienda', time:'18:00', notes:'', options: opt('1 yogur griego natural + 1 fruta','Tostada integral (35 g) + 50 g de pavo','30 g de proteína + 1 plátano','Batido: 200 ml de leche + 1 fruta + 15 g de crema de cacahuete','150 g de requesón + canela + 10 g de nueces','2 tortitas de arroz + 40 g de hummus + 1 fruta','1 pieza de fruta + 1 vaso de kéfir')},
      {name:'Cena', time:'21:30', notes:'', options: opt('Tortilla de 2 huevos + 2 claras con verduras + 1 tostada','200 g de pescado blanco + ensalada grande + 1 cucharada de aceite','150 g de pollo + verduras al horno + 100 g de patata','Ensalada de atún: 2 latas + huevo + maíz (50 g) + verdura','150 g de gambas o sepia a la plancha + revuelto de setas','Crema de verduras + 150 g de pavo o pollo','2 hamburguesas de pollo caseras + ensalada + 1 yogur')},
    ]};
  const msg = (from, body, n, read = true) => ({id: uid(), client_id:'demo-ana', sender_id: from, body, created_at: ts(n), read_at: read ? ts(n) : null});
  const messages = [
    msg('demo-coach', '¡Bienvenida, Ana! Ya tienes tu plan en la app. Cualquier duda me escribes por aquí.', 50),
    msg('demo-ana', '¡Gracias! Una duda: en la sentadilla, ¿bajo hasta paralelo?', 49.9),
    msg('demo-coach', 'Sí, hasta paralelo y sin rebotar. Si notas la rodilla, te quedas un poco por encima.', 49.8),
    msg('demo-ana', 'Hoy he subido a 65 kg en sentadilla y la rodilla perfecta', 0.05, false),
  ];
  return { profiles:[coach, ana, luis, marta], workout_plans:[plan], nutrition_plans:[nut], workout_logs: logs, body_metrics: mets, messages, progress_photos: [], documents: [] };
}

const api = DEMO ? DemoAPI() : SupabaseAPI();

/* ---------- Cola sin conexión (entrenos y medidas del cliente) ---------- */
const OUTBOX = 'jpr-outbox';
const outbox = { get(){ try { return JSON.parse(localStorage.getItem(OUTBOX)) || []; } catch(e){ return []; } }, set(v){ try { localStorage.setItem(OUTBOX, JSON.stringify(v)); } catch(e){} } };
const SAVE = { log: r => api.saveLog(r), metric: r => api.saveMetric(r), msg: r => api.sendMessage(r) };
const isNetErr = e => !navigator.onLine || /fetch|network|load failed|timeout/i.test(String(e && (e.message || e)));
async function saveOrQueue(kind, row){
  try { return await SAVE[kind](row); }
  catch(e){
    if (!isNetErr(e)) throw e;
    const q = outbox.get().filter(x => x.row.id !== row.id); q.push({kind, row}); outbox.set(q);
    return {...row, _pending: true};
  }
}
async function flushOutbox(){
  const q = outbox.get(); if (!q.length || !navigator.onLine) return;
  const rest = [];
  for (const it of q){ try { await SAVE[it.kind](it.row); } catch(e){ rest.push(it); } }
  outbox.set(rest);
  if (rest.length < q.length){ toast('Datos pendientes enviados'); if (['train','progress'].includes(S.view)) render(); }
}
const pendingFor = (kind, cid) => outbox.get().filter(x => x.kind === kind && x.row.client_id === cid).map(x => ({...x.row, _pending: true}));
const offBanner = () => { const b = $('#offl'); if (b) b.classList.toggle('hidden', navigator.onLine); };
window.addEventListener('online', () => { offBanner(); flushOutbox(); });
window.addEventListener('offline', offBanner);

/* =====================================================================
   Estado y navegación
   ===================================================================== */
const S = { me: null, view: 'loading', p: {}, stack: [], cache: {}, draft: null, unread: {}, unsub: null };
function go(view, p = {}, push = true){
  if (push && S.view !== 'loading') { S.stack.push({view: S.view, p: S.p}); try { history.pushState({n: S.stack.length}, ''); } catch(e){} }
  S.view = view; S.p = p; S.draft = null; window.scrollTo(0, 0); render();
}
function back(){
  const prev = S.stack.pop();
  if (prev){ S.view = prev.view; S.p = prev.p; S.draft = null; render(); }
  else home();
}
function home(){ S.stack = []; go(S.me?.role === 'coach' ? 'clients' : 'train', {}, false); }
window.addEventListener('popstate', () => { if (S.stack.length) back(); });

/* ---------- Render ---------- */
let renderSeq = 0;
async function render(){
  const seq = ++renderSeq;
  const V = VIEWS[S.view] || VIEWS.loading;
  let html;
  try { html = await V(); }
  catch(e){ console.error(e); html = shell('Error', `<div class="card"><b>Algo ha fallado</b><p class="muted small">${esc(e.message || e)}</p><button class="btn" data-act="home">Volver al inicio</button></div>`); }
  if (seq !== renderSeq) return;
  $('#app').innerHTML = html;
  document.body.classList.toggle('no-tabs', !$('#app .tabs'));
  const segOn = $('#app .seg button.on'); if (segOn && segOn.parentElement.scrollWidth > segOn.parentElement.clientWidth) segOn.parentElement.scrollLeft = segOn.offsetLeft - 40;
  V.mount && V.mount();
  updateBadges();
}

/* ---------- Plantillas comunes ---------- */
function topbar(title, sub, {backBtn = false, right = ''} = {}){
  return `<header class="top">
    ${backBtn ? `<button class="icon-btn" data-act="back" aria-label="Volver">${icon('back')}</button>` : `<img class="logo" src="assets/logo-light.png" alt="JPR Coach">`}
    <div class="title"><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div>
    ${DEMO ? '<span class="demo-flag">DEMO</span>' : ''}${right}
  </header><div class="offline ${navigator.onLine ? 'hidden' : ''}" id="offl">Sin conexión. Lo que registres se enviará al volver la conexión.</div>`;
}
function clientTabs(active){
  const t = [['train','Entreno','dumbbell'],['food','Alimentación','food'],['progress','Progreso','chart'],['chat','Mensajes','chat'],['profile','Perfil','user']];
  return `<nav class="tabs">${t.map(([v,l,i]) => `<button class="${active === v ? 'on' : ''}" data-act="tab" data-v="${v}">${icon(i)}${l}${v === 'chat' ? `<span class="tb-badge hidden" data-badge="${esc(S.me.id)}"></span>` : ''}</button>`).join('')}</nav>`;
}
function coachTabs(active){
  const t = [['clients','Clientes','users'],['coachProfile','Perfil','user']];
  return `<nav class="tabs">${t.map(([v,l,i]) => `<button class="${active === v ? 'on' : ''}" data-act="tab" data-v="${v}">${icon(i)}${l}${v === 'clients' ? '<span class="tb-badge hidden" data-badge="all"></span>' : ''}</button>`).join('')}</nav>`;
}
const shell = (title, body, opts = {}) => topbar(title, opts.sub, opts) + `<main>${body}</main>` + (opts.tabs || '');
const empty = (t, s, btn = '') => `<div class="card empty"><b>${esc(t)}</b>${esc(s)}${btn ? `<div style="margin-top:12px">${btn}</div>` : ''}</div>`;
const statusBadge = s => s === 'active' ? '<span class="badge ok">Activo</span>' : s === 'paused' ? '<span class="badge warn">En pausa</span>' : '<span class="badge gold">Pendiente</span>';

/* ---------- Gráfica de línea ---------- */
function lineChart(points, {unit = '', decimals = 1} = {}){
  const pts = points.filter(p => p.y != null);
  if (pts.length < 2) return `<p class="muted small center" style="margin:10px 0">Con 2 registros o más verás aquí la gráfica.</p>`;
  const W = 600, H = 190, L = 40, R = 14, T = 14, B = 26;
  const xs = pts.map(p => parseDate(p.x).getTime()), ys = pts.map(p => p.y);
  let x0 = Math.min(...xs), x1 = Math.max(...xs); if (x0 === x1) x1 = x0 + 1;
  let y0 = Math.min(...ys), y1 = Math.max(...ys); const pad = (y1 - y0) * .15 || 1; y0 -= pad; y1 += pad;
  const X = x => L + (x - x0) / (x1 - x0) * (W - L - R), Y = y => T + (1 - (y - y0) / (y1 - y0)) * (H - T - B);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(xs[i]).toFixed(1)},${Y(p.y).toFixed(1)}`).join('');
  const area = d + `L${X(xs.at(-1)).toFixed(1)},${H - B}L${X(xs[0]).toFixed(1)},${H - B}Z`;
  const grid = [0, .5, 1].map(f => { const v = y0 + (y1 - y0) * f; return `<line class="gl" x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end">${fmtNum(v, decimals)}</text>`; }).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfica">
    <defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9c7a3c" stop-opacity=".22"/><stop offset="1" stop-color="#9c7a3c" stop-opacity="0"/></linearGradient></defs>
    ${grid}<path class="ar" d="${area}"/><path class="ln" d="${d}"/>
    ${pts.map((p, i) => `<circle class="dt ${i === pts.length - 1 ? 'last' : ''}" cx="${X(xs[i]).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="${i === pts.length - 1 ? 5 : 3.2}"/>`).join('')}
    <text x="${L}" y="${H - 6}">${fmtDate(pts[0].x)}</text><text x="${W - R}" y="${H - 6}" text-anchor="end">${fmtDate(pts.at(-1).x)}</text>
  </svg>`;
}

/* ---------- Cálculos ---------- */
const bestSet = sets => sets.reduce((b, s) => { const kg = num(s.kg), r = num(s.reps); if (kg == null) return b; if (!b || kg > b.kg || (kg === b.kg && (r || 0) > (b.reps || 0))) return {kg, reps: r}; return b; }, null);
const e1rm = s => s && s.kg ? s.kg * (1 + (s.reps || 1) / 30) : null;
const volume = log => (log.entries || []).reduce((a, e) => a + (e.sets || []).reduce((b, s) => b + (num(s.kg) || 0) * (num(s.reps) || 0), 0), 0);
function lastFor(logs, exercise){
  for (const l of logs){ const e = (l.entries || []).find(x => x.exercise === exercise); if (e && e.sets?.some(s => s.kg || s.reps)) return {date: l.date, sets: e.sets}; }
  return null;
}

/* =====================================================================
   VISTAS
   ===================================================================== */
const VIEWS = {};
VIEWS.loading = async () => `<div class="spinner"></div>`;

/* ---------- Acceso ---------- */
function authWrap(inner){
  return `<div class="auth"><img class="logo" src="assets/logo-light.png" alt="JPR Coach"><div class="box">${inner}</div>
    <p class="alt">${DEMO ? 'Modo demo: los datos se guardan solo en este dispositivo.' : '&nbsp;'}</p></div>`;
}
VIEWS.login = async () => {
  if (DEMO) return authWrap(`<h1>Bienvenido</h1><p class="muted small">Esta es la versión de prueba. Entra como coach o como cliente para ver cómo funciona cada parte.</p>
    <div class="stack" style="margin-top:14px">
      <button class="btn block" data-act="demoLogin" data-id="demo-coach">${icon('users')} Entrar como coach</button>
      <button class="btn gold block" data-act="demoLogin" data-id="demo-ana">${icon('user')} Entrar como cliente (Ana)</button>
      <button class="btn light block" data-act="demoLogin" data-id="demo-marta">Cliente pendiente de activar (Marta)</button>
    </div>`);
  return authWrap(`<h1>Entrar</h1><p class="muted small">Accede con tu email y tu contraseña.</p>
    <form class="stack" id="fLogin" style="margin-top:14px">
      <div class="err hidden" id="err"></div>
      <label class="f">Email<input class="in" type="email" name="email" autocomplete="email" required></label>
      <label class="f">Contraseña<input class="in" type="password" name="password" autocomplete="current-password" required></label>
      <button class="btn block" type="submit">Entrar</button>
      <button class="btn ghost" type="button" data-act="nav" data-v="forgot">He olvidado mi contraseña</button>
    </form>
    <p class="center small" style="margin:12px 0 0">¿Primera vez? <a href="#" data-act="nav" data-v="register">Crea tu cuenta</a></p>`);
};
VIEWS.login.mount = () => {
  const f = $('#fLogin'); if (!f) return;
  f.onsubmit = async e => {
    e.preventDefault(); const b = f.querySelector('[type=submit]'); b.disabled = true;
    try { await api.signIn(f.email.value.trim(), f.password.value); await boot(); }
    catch(err){ showErr(err.message.includes('Invalid login') ? 'Email o contraseña incorrectos.' : err.message.includes('Email not confirmed') ? 'Todavía no has confirmado tu email. Revisa tu bandeja de entrada.' : err.message); b.disabled = false; }
  };
};
const showErr = m => { const e = $('#err'); if (e){ e.textContent = m; e.classList.remove('hidden'); } else toast(m); };

VIEWS.register = async () => authWrap(`<h1>Crear cuenta</h1><p class="muted small">Regístrate y ${esc(firstName(CFG.COACH_NAME) || 'tu coach')} activará tu cuenta.</p>
  <form class="stack" id="fReg" style="margin-top:14px">
    <div class="err hidden" id="err"></div>
    <label class="f">Nombre y apellidos<input class="in" name="name" autocomplete="name" required></label>
    <label class="f">Email<input class="in" type="email" name="email" autocomplete="email" required></label>
    <label class="f">Contraseña (mínimo 8 caracteres)<input class="in" type="password" name="password" minlength="8" autocomplete="new-password" required></label>
    <label class="check"><input type="checkbox" name="consent" required><span>Acepto la <a href="#" data-act="privacy">política de privacidad</a> y doy mi consentimiento para que se traten mis datos de salud y entrenamiento.</span></label>
    <button class="btn block" type="submit">Crear cuenta</button>
  </form>
  <p class="center small" style="margin:12px 0 0">¿Ya tienes cuenta? <a href="#" data-act="nav" data-v="login">Entra</a></p>`);
VIEWS.register.mount = () => {
  const f = $('#fReg');
  f.onsubmit = async e => {
    e.preventDefault(); const b = f.querySelector('[type=submit]'); b.disabled = true;
    try {
      const r = await api.signUp(f.email.value.trim(), f.password.value, f.name.value.trim());
      if (r && r.session) await boot();
      else $('#app').innerHTML = authWrap(`<h1>Revisa tu email</h1><p>Te hemos enviado un enlace a <b>${esc(f.email.value)}</b> para confirmar tu cuenta. Ábrelo desde este móvil y después entra con tu contraseña.</p><button class="btn block" data-act="nav" data-v="login">Ir a entrar</button>`);
    } catch(err){ showErr(/registered/i.test(err.message) ? 'Ya existe una cuenta con ese email.' : err.message); b.disabled = false; }
  };
};
VIEWS.forgot = async () => authWrap(`<h1>Recuperar contraseña</h1><p class="muted small">Te mandamos un enlace para poner una nueva.</p>
  <form class="stack" id="fForgot" style="margin-top:14px"><div class="err hidden" id="err"></div>
  <label class="f">Email<input class="in" type="email" name="email" required></label>
  <button class="btn block" type="submit">Enviar enlace</button>
  <button class="btn ghost" type="button" data-act="nav" data-v="login">Volver</button></form>`);
VIEWS.forgot.mount = () => {
  const f = $('#fForgot');
  f.onsubmit = async e => { e.preventDefault(); try { await api.resetPassword(f.email.value.trim()); $('#app').innerHTML = authWrap(`<h1>Enlace enviado</h1><p>Si el email está registrado, te llegará un enlace en unos minutos.</p><button class="btn block" data-act="nav" data-v="login">Volver</button>`); } catch(err){ showErr(err.message); } };
};
VIEWS.resetPw = async () => authWrap(`<h1>Nueva contraseña</h1><form class="stack" id="fReset" style="margin-top:14px"><div class="err hidden" id="err"></div>
  <label class="f">Nueva contraseña<input class="in" type="password" name="password" minlength="8" required autocomplete="new-password"></label>
  <button class="btn block" type="submit">Guardar</button></form>`);
VIEWS.resetPw.mount = () => {
  const f = $('#fReset');
  f.onsubmit = async e => { e.preventDefault(); try { await api.updatePassword(f.password.value); S.recovery = false; try { history.replaceState(null, '', location.pathname); } catch(_){} toast('Contraseña cambiada'); await boot(); } catch(err){ showErr(err.message); } };
};
VIEWS.pending = async () => authWrap(`<h1>Hola, ${esc(firstName(S.me?.full_name))}</h1>
  <p>Tu cuenta está creada. Falta que ${esc(firstName(CFG.COACH_NAME) || 'tu coach')} la active y te prepare el plan.</p>
  <p class="muted small">Te avisará cuando esté lista. Mientras tanto, puedes cerrar la app.</p>
  <div class="stack" style="margin-top:12px"><button class="btn block" data-act="reload">Comprobar de nuevo</button><button class="btn light block" data-act="logout">Salir</button></div>`);

/* =====================================================================
   COACH
   ===================================================================== */
VIEWS.clients = async () => {
  const [clients, act] = await Promise.all([api.clients(), api.activity()]);
  const lastLog = {}, lastW = {};
  act.logs.forEach(l => { if (!lastLog[l.client_id] || l.date > lastLog[l.client_id]) lastLog[l.client_id] = l.date; });
  act.mets.forEach(m => { if (m.weight_kg != null && (!lastW[m.client_id] || m.date > lastW[m.client_id].date)) lastW[m.client_id] = m; });
  const q = (S.p.q || '').toLowerCase();
  const shown = clients.filter(c => !q || (c.full_name + ' ' + (c.email || '')).toLowerCase().includes(q));
  const pend = shown.filter(c => c.status === 'pending'), rest = shown.filter(c => c.status !== 'pending');
  const active = clients.filter(c => c.status === 'active').length;
  const trained7 = clients.filter(c => lastLog[c.id] && daysAgo(lastLog[c.id]) <= 7).length;
  const row = c => {
    const d = lastLog[c.id], late = c.status === 'active' && (d == null || daysAgo(d) > 7);
    return `<div class="card tap item ${c.status === 'pending' ? 'pend' : late ? 'late' : ''}" data-act="openClient" data-id="${esc(c.id)}">
      <div class="avatar">${esc(initials(c.full_name))}</div>
      <div class="grow"><b>${esc(c.full_name || c.email)}</b>
        <div class="small muted">Último entreno: <span class="${late ? 'up' : ''}">${relDate(d)}</span>${late ? '<span class="late-tag">+7 días</span>' : ''}${lastW[c.id] ? `, ${fmtNum(lastW[c.id].weight_kg)} kg` : ''}</div></div>
      <span class="cnt hidden" data-badge="${esc(c.id)}" title="Mensajes sin leer"></span>
      ${c.status === 'pending' ? `<button class="btn sm gold" data-act="activate" data-id="${esc(c.id)}">Activar</button>` : statusBadge(c.status)}
      <span class="chev">›</span></div>`;
  };
  return shell('Clientes', `
    <div class="stats" style="grid-template-columns:repeat(3,1fr)">
      <div class="stat"><small>Activos</small><b>${active}</b></div>
      <div class="stat"><small>Entrenaron 7 días</small><b>${trained7}</b><i class="muted">de ${active}</i></div>
      <div class="stat"><small>Pendientes</small><b>${clients.filter(c => c.status === 'pending').length}</b></div>
    </div>
    <div style="position:relative;margin-top:12px"><input class="in" id="q" placeholder="Buscar cliente" value="${esc(S.p.q || '')}" style="padding-left:38px"><span style="position:absolute;left:12px;top:12px;width:18px;color:#a39a8c">${icon('search')}</span></div>
    ${pend.length ? `<div class="sec-title">Pendientes de activar</div><div class="list">${pend.map(row).join('')}</div>` : ''}
    <div class="sec-title">Tus clientes <span class="r muted">${rest.length}</span></div>
    <div class="list">${rest.map(row).join('') || empty('Aún no hay clientes', DEMO ? '' : 'Pásales el enlace de la app para que se registren. Aparecerán aquí para que los actives.')}</div>
    ${DEMO ? '' : `<div class="card cream" style="margin-top:14px"><b>Invitar clientes</b><p class="small muted" style="margin:4px 0 10px">Comparte este enlace. Se registran y te aparecen aquí como pendientes.</p><div class="row"><input class="in grow" readonly value="${esc(location.origin + location.pathname)}"><button class="btn sm" data-act="copyLink">${icon('copy')}</button></div></div>`}
  `, {sub: 'Panel del coach', tabs: coachTabs('clients')});
};
VIEWS.clients.mount = () => {
  const q = $('#q'); if (!q) return;
  q.oninput = () => { S.p.q = q.value; clearTimeout(q._t); q._t = setTimeout(async () => { const pos = q.selectionStart; await render(); const n = $('#q'); n.focus(); n.setSelectionRange(pos, pos); }, 250); };
};

VIEWS.coachProfile = async () => shell('Perfil', `
  <div class="card item"><div class="avatar lg">${esc(initials(S.me.full_name))}</div><div><h2>${esc(S.me.full_name)}</h2><div class="muted small">${esc(S.me.email || '')}</div><span class="badge navy">Coach</span></div></div>
  <div class="stack" style="margin-top:14px">
    <button class="btn light block" data-act="privacy">Ver política de privacidad (borrador)</button>
    ${DEMO ? '<button class="btn light block" data-act="resetDemo">Reiniciar datos de la demo</button>' : ''}
    <button class="btn danger block" data-act="logout">${icon('logout')} Cerrar sesión</button>
  </div>`, {sub: CFG.BRAND, tabs: coachTabs('coachProfile')});

/* ---------- Ficha de cliente (coach) ---------- */
async function loadClient(id){
  const [c, plans, nuts, logs, mets] = await Promise.all([api.profile(id), api.plans(id), api.nutrition(id), api.logs(id), api.metrics(id)]);
  return {c, plans, nuts, logs, mets};
}
VIEWS.client = async () => {
  const tab = S.p.tab || 'summary';
  const {c, plans, nuts, logs, mets} = await loadClient(S.p.id);
  const tabs = [['summary','Resumen'],['train','Entreno'],['food','Alimentación'],['progress','Progreso'],['chat','Mensajes'],['info','Ficha']];
  let body = '';
  if (tab === 'summary') body = summaryHTML(c, plans, nuts, logs, mets);
  if (tab === 'train' || tab === 'food'){
    const docs = await api.docs(c.id).catch(() => []); const urls = await api.fileUrls(docs.map(d => d.path)).catch(() => ({}));
    S.cache.docs = docs;
    body = tab === 'train' ? plansListHTML(c, plans, 'plan') + docsHTML(docs, urls, 'entreno', true) : plansListHTML(c, nuts, 'nut') + docsHTML(docs, urls, 'alimentacion', true);
  }
  if (tab === 'progress'){
    const photos = await api.photos(c.id).catch(() => []); const urls = await api.fileUrls(photos.map(p => p.path)).catch(() => ({}));
    S.cache.photos = photos; S.cache.urls = urls;
    body = progressHTML(c, logs, mets, true, photos, urls);
  }
  if (tab === 'chat'){
    const msgs = await api.messages(c.id);
    api.markRead(c.id, S.me.id).then(() => { S.unread[c.id] = 0; updateBadges(); }).catch(() => {});
    body = chatHTML(msgs);
  }
  if (tab === 'info') body = clientInfoHTML(c);
  return shell(c.full_name || c.email, `
    <div class="seg" style="margin-bottom:12px">${tabs.map(([k,l]) => `<button class="${tab === k ? 'on' : ''}" data-act="ctab" data-v="${k}">${l}${k === 'chat' ? ` <span class="cnt hidden" data-badge="${esc(c.id)}"></span>` : ''}</button>`).join('')}</div>
    ${body}`, {backBtn: true, sub: c.status === 'pending' ? 'Pendiente de activar' : c.goal || 'Cliente'});
};
function summaryHTML(c, plans, nuts, logs, mets){
  const ws = mets.filter(m => m.weight_kg != null);
  const cur = ws.at(-1), first = ws[0];
  const diff = cur && first && cur !== first ? cur.weight_kg - first.weight_kg : null;
  const n28 = logs.filter(l => daysAgo(l.date) <= 28).length;
  const activePlan = plans.find(p => p.active), activeNut = nuts.find(n => n.active);
  return `
    ${c.status === 'pending' ? `<div class="card cream row between"><div><b>Cuenta pendiente</b><div class="small muted">Actívala para que pueda usar la app.</div></div><button class="btn gold sm" data-act="activate" data-id="${esc(c.id)}">Activar</button></div>` : ''}
    <div class="stats" style="margin-top:${c.status === 'pending' ? 12 : 0}px">
      <div class="stat"><small>Peso actual</small><b>${cur ? fmtNum(cur.weight_kg) : '-'}</b>${diff != null ? `<i class="${diff > 0 ? 'up' : 'down'}">${diff > 0 ? '+' : ''}${fmtNum(diff)}</i>` : ''}</div>
      <div class="stat"><small>Entrenos 4 sem.</small><b>${n28}</b></div>
      <div class="stat"><small>Último entreno</small><b style="font-size:16px">${relDate(logs[0]?.date)}</b></div>
    </div>
    <div class="sec-title">Peso</div>
    <div class="card">${lineChart(ws.map(m => ({x: m.date, y: num(m.weight_kg)})))}</div>
    <div class="sec-title">Planes activos</div>
    <div class="list">
      <div class="card tap item" data-act="ctab" data-v="train"><span class="mini ic-train">${icon('dumbbell')}</span><div class="grow"><b>${activePlan ? esc(activePlan.name) : 'Sin plan de entreno'}</b><div class="small muted">${activePlan ? `${activePlan.days.length} días, actualizado ${relDate((activePlan.updated_at || activePlan.created_at || '').slice(0,10))}` : 'Toca para crear uno'}</div></div><span class="chev">›</span></div>
      <div class="card tap item" data-act="ctab" data-v="food"><span class="mini ic-food">${icon('food')}</span><div class="grow"><b>${activeNut ? esc(activeNut.name) : 'Sin plan de alimentación'}</b><div class="small muted">${activeNut ? `${activeNut.kcal || '-'} kcal, ${activeNut.meals.length} comidas` : 'Toca para crear uno'}</div></div><span class="chev">›</span></div>
    </div>
    <div class="sec-title">Últimos entrenos</div>
    ${logsListHTML(logs.slice(0, 5))}
    ${c.notes ? `<div class="sec-title">Tus notas</div><div class="card cream prose">${esc(c.notes)}</div>` : ''}`;
}
function plansListHTML(c, plans, kind){
  const isPlan = kind === 'plan';
  const label = isPlan ? 'plan de entreno' : 'plan de alimentación';
  const newBtn = `<button class="btn gold" data-act="${isPlan ? 'newPlan' : 'newNut'}">${icon('plus')} Nuevo ${label}</button>`;
  if (!plans.length) return empty(`Sin ${label}`, `Crea el primero para ${firstName(c.full_name)}.`, newBtn);
  return `<div class="list">${plans.map(p => `
    <div class="card">
      <div class="row between"><div class="grow"><h3>${esc(p.name)}</h3>
        <div class="small muted">${isPlan ? `${p.days.length} días, ${p.days.reduce((a,d) => a + d.exercises.length, 0)} ejercicios` : `${p.kcal || '-'} kcal, ${p.meals.length} comidas`}. Actualizado ${relDate((p.updated_at || p.created_at || '').slice(0,10))}</div></div>
        ${p.active ? '<span class="badge ok">Activo</span>' : '<span class="badge">Archivado</span>'}</div>
      <div class="row wrap" style="margin-top:10px">
        <button class="btn sm" data-act="${isPlan ? 'editPlan' : 'editNut'}" data-id="${esc(p.id)}">${icon('edit')} Editar</button>
        <button class="btn sm light" data-act="dupPlan" data-kind="${kind}" data-id="${esc(p.id)}">${icon('copy')} Duplicar</button>
        ${p.active ? '' : `<button class="btn sm light" data-act="activatePlan" data-kind="${kind}" data-id="${esc(p.id)}">Activar</button>`}
        <button class="mini bad" data-act="delPlan" data-kind="${kind}" data-id="${esc(p.id)}" aria-label="Borrar">${icon('trash')}</button>
      </div>
    </div>`).join('')}</div><div style="margin-top:12px">${newBtn}</div>
    <p class="small muted" style="margin-top:8px">El cliente solo ve el plan activo. Al activar uno, el anterior pasa a archivado.</p>`;
}
function clientInfoHTML(c){
  return `<form class="stack" id="fInfo">
    <label class="f">Nombre y apellidos<input class="in" name="full_name" value="${esc(c.full_name)}"></label>
    <div class="grid2"><label class="f">Teléfono<input class="in" name="phone" type="tel" value="${esc(c.phone)}"></label>
    <label class="f">Estado<select class="in" name="status">${[['pending','Pendiente'],['active','Activo'],['paused','En pausa']].map(([v,l]) => `<option value="${v}" ${c.status === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
    <div class="grid2"><label class="f">Fecha de nacimiento<input class="in" name="birth_date" type="date" value="${esc(c.birth_date)}"></label>
    <label class="f">Altura (cm)<input class="in" name="height_cm" inputmode="decimal" value="${esc(c.height_cm)}"></label></div>
    <label class="f">Objetivo<input class="in" name="goal" value="${esc(c.goal)}"></label>
    <label class="f">Notas privadas (el cliente no las ve)<textarea class="in" name="notes">${esc(c.notes)}</textarea></label>
    <div class="small muted">Email: ${esc(c.email || '-')}. ${c.consent_at ? `Consentimiento aceptado el ${fmtDate(c.consent_at.slice(0,10), {day:'numeric', month:'long', year:'numeric'})}.` : 'Sin consentimiento registrado.'}</div>
    <button class="btn block" type="submit">Guardar ficha</button></form>`;
}
VIEWS.client.mount = () => {
  const f = $('#fInfo');
  if (f) f.onsubmit = async e => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(f)); fd.height_cm = num(fd.height_cm);
    try { await api.updateProfile(S.p.id, fd, true); toast('Ficha guardada'); render(); } catch(err){ toast(err.message); }
  };
  mountProgress();
  if (S.p.tab === 'chat') mountChat(S.p.id);
};

/* ---------- Editor de plan de entreno ---------- */
const blankEx = () => ({name:'', sets:'3', reps:'10', rest:'90 s', load:'', notes:''});
VIEWS.planEdit = async () => {
  if (!S.draft){
    if (S.p.planId){ const plans = await api.plans(S.p.clientId); S.draft = clone(plans.find(p => p.id === S.p.planId)); }
    else S.draft = {id: null, client_id: S.p.clientId, name: 'Bloque 1', notes: '', active: true, days: [{name: 'Día A', exercises: [blankEx()]}]};
  }
  const p = S.draft;
  return shell(S.p.planId ? 'Editar plan' : 'Nuevo plan', `
    <div class="stack">
      <label class="f">Nombre del plan<input class="in" data-path="name" value="${esc(p.name)}"></label>
      <label class="f">Indicaciones generales<textarea class="in" data-path="notes" placeholder="Por ejemplo: 3 días por semana, deja 1-2 repeticiones en reserva">${esc(p.notes)}</textarea></label>
      <label class="check"><input type="checkbox" data-path="active" ${p.active ? 'checked' : ''}><span>Plan activo (es el que verá el cliente)</span></label>
    </div>
    <datalist id="exlist">${EXERCISES.map(e => `<option value="${esc(e)}">`).join('')}</datalist>
    ${p.days.map((d, di) => `
      <div class="sec-title">Día ${di + 1}</div>
      <div class="day">
        <div class="day-head"><input class="in grow" data-path="days.${di}.name" value="${esc(d.name)}" placeholder="Nombre del día">
          <button class="mini" data-act="dayMove" data-d="${di}" data-dir="-1" aria-label="Subir">${icon('up')}</button>
          <button class="mini" data-act="dayMove" data-d="${di}" data-dir="1" aria-label="Bajar">${icon('down')}</button>
          <button class="mini" data-act="dayDel" data-d="${di}" aria-label="Borrar día">${icon('trash')}</button></div>
        ${d.exercises.map((x, xi) => `
          <div class="ex">
            <div class="ex-top"><span class="ex-num">${xi + 1}</span>
              <input class="in grow" list="exlist" data-path="days.${di}.exercises.${xi}.name" value="${esc(x.name)}" placeholder="Ejercicio">
              <button class="mini" data-act="exMove" data-d="${di}" data-x="${xi}" data-dir="-1" aria-label="Subir">${icon('up')}</button>
              <button class="mini bad" data-act="exDel" data-d="${di}" data-x="${xi}" aria-label="Quitar">${icon('x')}</button></div>
            <div class="grid4">
              ${[['sets','Series'],['reps','Reps'],['rest','Descanso'],['load','Carga']].map(([k,l]) => `<div><div class="lbl">${l}</div><input class="in" data-path="days.${di}.exercises.${xi}.${k}" value="${esc(x[k])}"></div>`).join('')}
            </div>
            <input class="in" data-path="days.${di}.exercises.${xi}.notes" value="${esc(x.notes)}" placeholder="Notas de técnica (opcional)" style="font-size:14px;padding:9px 10px">
          </div>`).join('')}
        <div class="day-foot"><button class="btn sm light" data-act="exAdd" data-d="${di}">${icon('plus')} Añadir ejercicio</button></div>
      </div>`).join('')}
    <div class="stack" style="margin-top:14px">
      <button class="btn light block" data-act="dayAdd">${icon('plus')} Añadir día</button>
      <button class="btn gold block" data-act="planSave">${icon('check')} Guardar plan</button>
    </div>`, {backBtn: true, sub: 'Plan de entrenamiento'});
};
VIEWS.planEdit.mount = bindDraft;
function bindDraft(){
  document.querySelectorAll('[data-path]').forEach(el => {
    const ev = el.type === 'checkbox' ? 'change' : 'input';
    el.addEventListener(ev, () => setPath(S.draft, el.dataset.path, el.type === 'checkbox' ? el.checked : el.value));
  });
}

/* ---------- Editor de plan de alimentación ---------- */
const MEAL_NAMES = ['Desayuno','Media mañana','Comida','Merienda','Cena'];
VIEWS.nutEdit = async () => {
  if (!S.draft){
    if (S.p.planId){ const ns = await api.nutrition(S.p.clientId); S.draft = clone(ns.find(p => p.id === S.p.planId)); }
    else S.draft = {id:null, client_id:S.p.clientId, name:'Plan de alimentación', kcal:'', protein_g:'', carbs_g:'', fat_g:'', water_l:'2,5', guidelines:'', active:true,
      meals: MEAL_NAMES.map((n, i) => ({name:n, time:['08:00','11:30','14:30','18:00','21:30'][i], notes:'', options:[]}))};
    S.draft.meals.forEach(m => { m._text = (m.options || []).join('\n'); });
  }
  const p = S.draft;
  return shell(S.p.planId ? 'Editar alimentación' : 'Nueva alimentación', `
    <div class="stack">
      <label class="f">Nombre del plan<input class="in" data-path="name" value="${esc(p.name)}"></label>
      <div class="grid4">
        ${[['kcal','Kcal'],['protein_g','Proteína g'],['carbs_g','Hidratos g'],['fat_g','Grasa g']].map(([k,l]) => `<label class="f">${l}<input class="in" inputmode="numeric" data-path="${k}" value="${esc(p[k])}"></label>`).join('')}
      </div>
      <label class="f">Agua (litros al día)<input class="in" inputmode="decimal" data-path="water_l" value="${esc(p.water_l)}"></label>
      <label class="check"><input type="checkbox" data-path="active" ${p.active ? 'checked' : ''}><span>Plan activo (es el que verá el cliente)</span></label>
    </div>
    ${p.meals.map((m, mi) => {
      const n = (m._text || '').split('\n').filter(s => s.trim()).length;
      return `<div class="sec-title">Comida ${mi + 1}</div>
      <div class="meal">
        <div class="meal-head"><input class="in grow" data-path="meals.${mi}.name" value="${esc(m.name)}" style="background:rgba(255,255,255,.1);border-color:transparent;color:#fff;font-weight:700">
          <input class="in" data-path="meals.${mi}.time" value="${esc(m.time)}" style="width:84px;background:rgba(255,255,255,.1);border-color:transparent;color:#fff;text-align:center">
          <button class="mini" style="background:rgba(255,255,255,.12);color:#fff" data-act="mealDel" data-m="${mi}" aria-label="Quitar comida">${icon('trash')}</button></div>
        <div style="padding:12px" class="stack">
          <label class="f"><span class="row between">Opciones, una por línea <span class="${n >= 7 ? 'gold' : 'up'}" data-count="${mi}">${n} de 7</span></span>
            <textarea class="in" rows="7" data-path="meals.${mi}._text" data-counter="${mi}" placeholder="150 g de pechuga de pollo + 70 g de arroz integral + ensalada">${esc(m._text)}</textarea></label>
          <input class="in" data-path="meals.${mi}.notes" value="${esc(m.notes)}" placeholder="Nota para esta comida (opcional)" style="font-size:14px">
        </div>
      </div>`; }).join('')}
    <div class="stack" style="margin-top:14px">
      <button class="btn light block" data-act="mealAdd">${icon('plus')} Añadir comida</button>
      <label class="f">Pautas y notas generales<textarea class="in" rows="6" data-path="guidelines" placeholder="Una pauta por línea">${esc(p.guidelines)}</textarea></label>
      <button class="btn gold block" data-act="nutSave">${icon('check')} Guardar plan</button>
    </div>`, {backBtn: true, sub: 'Plan de alimentación'});
};
VIEWS.nutEdit.mount = () => {
  bindDraft();
  document.querySelectorAll('[data-counter]').forEach(t => t.addEventListener('input', () => {
    const n = t.value.split('\n').filter(s => s.trim()).length, el = document.querySelector(`[data-count="${t.dataset.counter}"]`);
    el.textContent = `${n} de 7`; el.className = n >= 7 ? 'gold' : 'up';
  }));
};

/* =====================================================================
   CLIENTE
   ===================================================================== */
async function myData(){
  const id = S.me.id;
  const [plans, nuts, logs, mets] = await Promise.all([api.plans(id), api.nutrition(id), api.logs(id).catch(() => []), api.metrics(id).catch(() => [])]);
  const pl = [...pendingFor('log', id), ...logs.filter(l => !outbox.get().some(o => o.row.id === l.id))].sort((a,b) => b.date.localeCompare(a.date));
  const pm = [...mets.filter(m => !outbox.get().some(o => o.row.id === m.id)), ...pendingFor('metric', id)].sort((a,b) => a.date.localeCompare(b.date));
  return {plan: plans.find(p => p.active), nut: nuts.find(n => n.active), logs: pl, mets: pm};
}
VIEWS.train = async () => {
  const [{plan, logs}, docs] = await Promise.all([myData(), api.docs(S.me.id).catch(() => [])]);
  const durls = await api.fileUrls(docs.map(d => d.path)).catch(() => ({}));
  const docBlock = docsHTML(docs, durls, 'entreno', false);
  const hello = `<div style="margin-bottom:6px"><h1>Hola, ${esc(firstName(S.me.full_name))}</h1><p class="muted small" style="margin:2px 0 0">${logs[0] ? `Tu último entreno fue ${relDate(logs[0].date)}.` : '¡A por el primer entreno!'}</p></div>`;
  if (!plan) return shell('Entreno', hello + (docBlock || empty('Todavía no tienes plan', `${firstName(CFG.COACH_NAME) || 'Tu coach'} te lo preparará pronto.`)), {tabs: clientTabs('train'), sub: CFG.BRAND});
  const lastDay = logs.find(l => l.plan_id === plan.id)?.day_name;
  const nextIdx = lastDay ? (plan.days.findIndex(d => d.name === lastDay) + 1) % plan.days.length : 0;
  const n7 = logs.filter(l => daysAgo(l.date) < 7).length;
  return shell('Entreno', `${hello}
    <div class="stats" style="grid-template-columns:1fr 1fr;margin-top:10px">
      <div class="stat"><small>Esta semana</small><b>${n7}</b><i class="muted">entrenos</i></div>
      <div class="stat"><small>Total</small><b>${logs.length}</b><i class="muted">entrenos</i></div>
    </div>
    <div class="sec-title">${esc(plan.name)}</div>
    ${plan.notes ? `<div class="card cream small prose" style="margin-bottom:10px">${esc(plan.notes)}</div>` : ''}
    <div class="list">${plan.days.map((d, i) => {
      const last = logs.find(l => l.plan_id === plan.id && l.day_name === d.name);
      return `<div class="card tap dcard ${i === nextIdx ? 'next' : ''}" data-act="startDay" data-d="${i}">
        <div class="dhead"><h3>${esc(d.name)}</h3>${i === nextIdx ? '<span class="badge tt">Te toca</span>' : ''}</div><div class="dbody">
        <div class="small muted">${d.exercises.length} ejercicios. ${last ? `Último: ${relDate(last.date)}` : 'Sin hacer todavía'}</div>
        <div class="target">${d.exercises.slice(0, 4).map(x => `<span class="chip">${esc(x.name || 'Ejercicio')}</span>`).join('')}${d.exercises.length > 4 ? `<span class="chip">+${d.exercises.length - 4}</span>` : ''}</div>
        <button class="btn block ${i === nextIdx ? 'gold' : 'light'}" style="margin-top:10px">${icon('play', true)} Empezar</button>
      </div></div>`; }).join('')}</div>
    ${docBlock}
    <div class="sec-title">Historial</div>${logsListHTML(logs.slice(0, 6))}
  `, {tabs: clientTabs('train'), sub: CFG.BRAND});
};

/* ---------- Sesión de entreno (cliente) ---------- */
VIEWS.session = async () => {
  if (!S.draft){
    const {plan, logs} = await myData();
    const day = plan.days[S.p.dayIdx];
    S.draft = {id: uid(), client_id: S.me.id, plan_id: plan.id, day_name: day.name, date: today(), rpe: null, notes: '',
      entries: day.exercises.map(x => {
        const last = lastFor(logs, x.name);
        const n = Math.max(1, parseInt(x.sets) || (last ? last.sets.length : 3));
        return {exercise: x.name, _target: x, _last: last, sets: Array.from({length: n}, (_, i) => ({reps: '', kg: '', _ph: last?.sets[i] || last?.sets.at(-1) || {}, _done: false}))};
      })};
  }
  const s = S.draft;
  return shell(s.day_name, `
    <label class="f" style="margin-bottom:10px">Fecha<input class="in" type="date" data-path="date" value="${esc(s.date)}"></label>
    <div class="stack">${s.entries.map((e, ei) => {
      const t = e._target || {};
      return `<div class="exs">
        <div class="exs-head"><b>${esc(e.exercise)}</b>
          <div class="target">${t.sets ? `<span class="chip">${esc(t.sets)} series</span>` : ''}${t.reps ? `<span class="chip">${esc(t.reps)}${/^\d+(\s*-\s*\d+)?$/.test(String(t.reps).trim()) ? ' reps' : ''}</span>` : ''}${t.rest ? `<span class="chip">${esc(t.rest)}</span>` : ''}${t.load ? `<span class="chip gold">${esc(t.load)}</span>` : ''}</div>
          ${t.notes ? `<div class="small muted" style="margin-top:6px">${esc(t.notes)}</div>` : ''}
          ${e._last ? `<div class="tiny muted" style="margin-top:4px">Última vez (${relDate(e._last.date)}): ${e._last.sets.map(x => `${esc(x.kg || '-')} kg x ${esc(x.reps || '-')}`).join(', ')}</div>` : ''}
        </div>
        <div class="set-head"><span>Serie</span><span>Kg</span><span>Reps</span><span></span></div>
        ${e.sets.map((st, si) => `<div class="set ${st._done ? 'done' : ''}" data-set="${ei}.${si}">
          <span class="n">${si + 1}</span>
          <input class="in" inputmode="decimal" data-path="entries.${ei}.sets.${si}.kg" value="${esc(st.kg)}" placeholder="${esc(st._ph.kg || (t.load && parseFloat(t.load)) || '')}">
          <input class="in" inputmode="numeric" data-path="entries.${ei}.sets.${si}.reps" value="${esc(st.reps)}" placeholder="${esc(st._ph.reps || parseInt(t.reps) || '')}">
          <button class="tick" data-act="setDone" data-e="${ei}" data-s="${si}" aria-label="Hecha">${icon('check')}</button>
        </div>`).join('')}
        <div class="exs-foot row between"><button class="btn ghost sm" data-act="setAdd" data-e="${ei}">${icon('plus')} Serie</button>${e.sets.length > 1 ? `<button class="btn ghost sm" data-act="setDel" data-e="${ei}">Quitar serie</button>` : ''}</div>
      </div>`; }).join('')}</div>
    <div class="sec-title">¿Cómo ha ido?</div>
    <div class="card stack">
      <div><div class="small muted" style="margin-bottom:6px">Esfuerzo (RPE): 1 muy fácil, 10 al límite</div>
        <div class="scale">${[5,6,7,8,9,10].map(v => `<button class="${s.rpe === v ? 'on' : ''}" data-act="rpe" data-v="${v}">${v}</button>`).join('')}</div></div>
      <label class="f">Notas o molestias<textarea class="in" data-path="notes" placeholder="Cómo te has sentido, alguna molestia...">${esc(s.notes)}</textarea></label>
    </div>
    <button class="btn gold block" style="margin-top:14px" data-act="sessionSave">${icon('check')} Guardar entreno</button>
    <p class="tiny muted center">Si dejas una casilla vacía se guarda lo que aparece en gris.</p>`, {backBtn: true, sub: 'Entreno de hoy'});
};
VIEWS.session.mount = bindDraft;

/* ---------- Alimentación (cliente) ---------- */
VIEWS.food = async () => {
  const [{nut}, docs] = await Promise.all([myData(), api.docs(S.me.id).catch(() => [])]);
  const durls = await api.fileUrls(docs.map(d => d.path)).catch(() => ({}));
  const docBlock = docsHTML(docs, durls, 'alimentacion', false);
  return shell('Alimentación', (nut || !docBlock ? nutritionViewHTML(nut) : '') + docBlock, {tabs: clientTabs('food'), sub: CFG.BRAND});
};
function nutritionViewHTML(nut){
  if (!nut) return empty('Todavía no tienes plan de alimentación', `${firstName(CFG.COACH_NAME) || 'Tu coach'} te lo preparará pronto.`);
  const g = (nut.guidelines || '').split('\n').filter(s => s.trim());
  return `<h2 style="margin-bottom:10px">${esc(nut.name)}</h2>
    ${nut.kcal || nut.protein_g ? `<div class="macros">
      <div class="macro"><b>${esc(nut.kcal || '-')}</b><small>kcal</small></div>
      <div class="macro"><b>${nut.protein_g ? esc(nut.protein_g) + '<i>g</i>' : '-'}</b><small>proteína</small></div>
      <div class="macro"><b>${nut.carbs_g ? esc(nut.carbs_g) + '<i>g</i>' : '-'}</b><small>hidratos</small></div>
      <div class="macro"><b>${nut.fat_g ? esc(nut.fat_g) + '<i>g</i>' : '-'}</b><small>grasa</small></div></div>` : ''}
    ${nut.water_l ? `<p class="small muted" style="margin:8px 2px 0">Agua: ${fmtNum(num(nut.water_l))} L al día.</p>` : ''}
    <p class="small" style="margin:12px 2px 0">Elige <b>una opción</b> en cada comida. Puedes cambiarlas entre sí cuando quieras.</p>
    ${nut.meals.map(m => `<div class="sec-title">${esc(m.name)}${m.time ? `<span class="r muted">${esc(m.time)}</span>` : ''}</div>
      <div class="meal">${(m.options || []).map((o, i) => `<div class="opt"><div class="k">${i + 1}</div><div class="v">${esc(o)}</div></div>`).join('') || '<div class="opt"><div class="k"></div><div class="v muted">Sin opciones todavía</div></div>'}
      ${m.notes ? `<div class="opt special"><div class="k">!</div><div class="v"><b>${esc(m.notes)}</b></div></div>` : ''}</div>`).join('')}
    ${g.length ? `<div class="sec-title">Pautas y notas generales</div><div class="card"><ul style="margin:0;padding-left:18px">${g.map(x => `<li style="margin:4px 0">${esc(x.replace(/^[-•●]\s*/, ''))}</li>`).join('')}</ul></div>` : ''}`;
}

/* ---------- Progreso (cliente y coach) ---------- */
VIEWS.progress = async () => {
  const [{logs, mets}, photos] = await Promise.all([myData(), api.photos(S.me.id).catch(() => [])]);
  const urls = await api.fileUrls(photos.map(p => p.path)).catch(() => ({}));
  S.cache.photos = photos; S.cache.urls = urls;
  return shell('Progreso', progressHTML(S.me, logs, mets, false, photos, urls), {tabs: clientTabs('progress'), sub: CFG.BRAND});
};
VIEWS.progress.mount = () => mountProgress();
function progressHTML(c, logs, mets, asCoach, photos = [], urls = {}){
  const ws = mets.filter(m => m.weight_kg != null);
  const exNames = [...new Set(logs.flatMap(l => (l.entries || []).map(e => e.exercise)).filter(Boolean))];
  const ex = S.p.ex && exNames.includes(S.p.ex) ? S.p.ex : exNames[0];
  const exPts = ex ? logs.slice().reverse().map(l => { const e = (l.entries || []).find(x => x.exercise === ex); const b = e && bestSet(e.sets || []); return b ? {x: l.date, y: b.kg, r: b.reps} : null; }).filter(Boolean) : [];
  const metric = S.p.metric || 'weight_kg';
  const MET = [['weight_kg','Peso','kg'],['waist_cm','Cintura','cm'],['hip_cm','Cadera','cm'],['body_fat','% grasa','%']];
  const mPts = mets.filter(m => m[metric] != null).map(m => ({x: m.date, y: num(m[metric])}));
  return `
    ${asCoach ? '' : `<button class="btn gold block" data-act="metricNew">${icon('scale')} Registrar medidas de hoy</button>`}
    <div class="sec-title">Medidas</div>
    <div class="card">
      <div class="seg" style="margin-bottom:8px">${MET.map(([k,l]) => `<button class="${metric === k ? 'on' : ''}" data-act="pmetric" data-v="${k}">${l}</button>`).join('')}</div>
      ${lineChart(mPts)}
      ${mPts.length ? `<div class="row between small"><span class="muted">Primero: ${fmtNum(mPts[0].y)}</span><b>Ahora: ${fmtNum(mPts.at(-1).y)} ${MET.find(m => m[0] === metric)[2]}</b><span class="${mPts.at(-1).y - mPts[0].y > 0 ? 'up' : 'down'}">${mPts.length > 1 ? (mPts.at(-1).y - mPts[0].y > 0 ? '+' : '') + fmtNum(mPts.at(-1).y - mPts[0].y) : ''}</span></div>` : ''}
    </div>
    ${mets.length ? `<div class="tbl-wrap" style="margin-top:10px"><table class="tbl"><thead><tr><th>Fecha</th><th>Peso</th><th>Cint.</th><th>Cad.</th><th>Grasa</th><th>S/E/E</th><th></th></tr></thead><tbody>
      ${mets.slice().reverse().slice(0, 12).map(m => `<tr><td>${fmtDate(m.date)}${m._pending ? ' <span class="badge warn">pendiente</span>' : ''}</td><td>${fmtNum(m.weight_kg)}</td><td>${fmtNum(m.waist_cm)}</td><td>${fmtNum(m.hip_cm)}</td><td>${fmtNum(m.body_fat)}</td><td>${[m.sleep, m.stress, m.energy].map(v => v ?? '-').join('/')}</td>
      <td>${m._pending ? '' : `<button class="mini bad" data-act="delMetric" data-id="${esc(m.id)}" aria-label="Borrar">${icon('trash')}</button>`}</td></tr>`).join('')}</tbody></table></div>
      <p class="tiny muted">S/E/E: sueño, estrés y energía del 1 al 5.</p>` : ''}
    ${photosHTML(photos, urls)}
    <div class="sec-title">Fuerza</div>
    <div class="card">
      ${exNames.length ? `<select class="in" id="exSel" style="margin-bottom:8px">${exNames.map(n => `<option ${n === ex ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
        ${lineChart(exPts)}
        ${exPts.length ? `<div class="row between small"><span class="muted">Mejor serie de cada día (kg)</span><b>Récord: ${fmtNum(Math.max(...exPts.map(p => p.y)))} kg</b></div>` : ''}` : '<p class="muted small center">Cuando registres entrenos verás aquí tu evolución en cada ejercicio.</p>'}
    </div>
    <div class="sec-title">Entrenos</div>${logsListHTML(logs.slice(0, 20), true)}`;
}
function mountProgress(){
  const s = $('#exSel'); if (s) s.onchange = () => { S.p.ex = s.value; render(); };
}
function logsListHTML(logs, canDelete = false){
  if (!logs.length) return empty('Sin entrenos registrados', 'Aparecerán aquí en cuanto se guarde el primero.');
  return `<div class="list">${logs.map(l => `
    <details class="card"><summary class="row between" style="cursor:pointer;list-style:none">
      <div class="grow"><b>${esc(l.day_name || 'Entreno')}</b>${l._pending ? ' <span class="badge warn">pendiente</span>' : ''}<div class="small muted">${fmtDate(l.date, {weekday:'short', day:'numeric', month:'short'})}${l.rpe ? `, RPE ${esc(l.rpe)}` : ''}, ${fmtNum(volume(l) / 1000, 1)} t</div></div><span class="chev">›</span></summary>
      <div style="margin-top:10px" class="small">${(l.entries || []).map(e => `<div style="margin:6px 0"><b>${esc(e.exercise)}</b>: ${(e.sets || []).map(s => `${esc(s.kg || '-')} kg x ${esc(s.reps || '-')}`).join(', ')}</div>`).join('')}
      ${l.notes ? `<div class="card cream" style="margin-top:8px;padding:10px">${esc(l.notes)}</div>` : ''}
      ${canDelete && !l._pending ? `<button class="btn sm danger" style="margin-top:8px" data-act="delLog" data-id="${esc(l.id)}">${icon('trash')} Borrar entreno</button>` : ''}</div>
    </details>`).join('')}</div>`;
}

/* ---------- Registrar medidas (cliente) ---------- */
VIEWS.metricNew = async () => {
  if (!S.draft) S.draft = {id: uid(), client_id: S.me.id, date: today(), weight_kg:'', waist_cm:'', hip_cm:'', chest_cm:'', arm_cm:'', thigh_cm:'', body_fat:'', sleep:null, stress:null, energy:null, notes:''};
  const m = S.draft;
  const scale = (k, l) => `<div><div class="small muted" style="margin-bottom:6px">${l}</div><div class="scale">${[1,2,3,4,5].map(v => `<button class="${m[k] === v ? 'on' : ''}" data-act="mscale" data-k="${k}" data-v="${v}">${v}</button>`).join('')}</div></div>`;
  const f = (k, l, u) => `<label class="f">${l} (${u})<input class="in" inputmode="decimal" data-path="${k}" value="${esc(m[k])}"></label>`;
  return shell('Medidas', `
    <div class="stack">
      <label class="f">Fecha<input class="in" type="date" data-path="date" value="${esc(m.date)}"></label>
      <div class="grid2">${f('weight_kg','Peso','kg')}${f('body_fat','Grasa','%')}</div>
      <div class="grid2">${f('waist_cm','Cintura','cm')}${f('hip_cm','Cadera','cm')}</div>
      <div class="grid3">${f('chest_cm','Pecho','cm')}${f('arm_cm','Brazo','cm')}${f('thigh_cm','Muslo','cm')}</div>
      <div class="card stack">${scale('sleep','Sueño: 1 fatal, 5 genial')}${scale('stress','Estrés: 1 nada, 5 mucho')}${scale('energy','Energía: 1 sin fuerzas, 5 a tope')}</div>
      <label class="f">Notas<textarea class="in" data-path="notes" placeholder="Cómo te has visto esta semana">${esc(m.notes)}</textarea></label>
      <p class="small muted">Pésate en ayunas, después de ir al baño. Mide la cintura a la altura del ombligo.</p>
      <button class="btn gold block" data-act="metricSave">${icon('check')} Guardar medidas</button>
    </div>`, {backBtn: true, sub: 'Seguimiento'});
};
VIEWS.metricNew.mount = bindDraft;

/* ---------- Perfil (cliente) ---------- */
VIEWS.profile = async () => {
  const c = S.me;
  return shell('Perfil', `
    <div class="card item"><div class="avatar lg">${esc(initials(c.full_name))}</div><div><h2>${esc(c.full_name)}</h2><div class="muted small">${esc(c.email || '')}</div></div></div>
    ${c.goal ? `<div class="card cream" style="margin-top:10px"><div class="tiny muted">TU OBJETIVO</div><b>${esc(c.goal)}</b></div>` : ''}
    <form class="stack" id="fMe" style="margin-top:12px">
      <label class="f">Nombre y apellidos<input class="in" name="full_name" value="${esc(c.full_name)}"></label>
      <div class="grid2"><label class="f">Teléfono<input class="in" name="phone" type="tel" value="${esc(c.phone)}"></label>
      <label class="f">Altura (cm)<input class="in" name="height_cm" inputmode="decimal" value="${esc(c.height_cm)}"></label></div>
      <label class="f">Fecha de nacimiento<input class="in" name="birth_date" type="date" value="${esc(c.birth_date)}"></label>
      <button class="btn block" type="submit">Guardar</button>
    </form>
    <div class="stack" style="margin-top:14px">
      <button class="btn light block" data-act="privacy">Política de privacidad</button>
      ${DEMO ? '<button class="btn light block" data-act="resetDemo">Reiniciar datos de la demo</button>' : ''}
      <button class="btn danger block" data-act="logout">${icon('logout')} Cerrar sesión</button>
    </div>`, {tabs: clientTabs('profile'), sub: CFG.BRAND});
};
VIEWS.profile.mount = () => {
  const f = $('#fMe');
  f.onsubmit = async e => {
    e.preventDefault(); const fd = Object.fromEntries(new FormData(f)); fd.height_cm = num(fd.height_cm);
    try { S.me = await api.updateProfile(S.me.id, fd, false); toast('Datos guardados'); render(); } catch(err){ toast(err.message); }
  };
};

/* =====================================================================
   Mensajes
   ===================================================================== */
const localDay = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('sv-SE'); };
const hhmm = iso => new Date(iso).toLocaleTimeString('es-ES', {hour:'2-digit', minute:'2-digit'});
const daySep = d => `<div class="daysep">${d === today() ? 'Hoy' : esc(fmtDate(d, {weekday:'long', day:'numeric', month:'long'}))}</div>`;
function bubble(m){
  const mine = m.sender_id === S.me.id;
  return `<div class="bub ${mine ? 'me' : ''} ${m._pending ? 'pend' : ''}" data-mid="${esc(m.id)}"><div class="bt">${esc(m.body)}</div>
    <div class="bm">${m._pending ? 'Pendiente de enviar' : hhmm(m.created_at)}${mine && !m._pending ? (m.read_at ? ' <b class="rd">✓✓</b>' : ' ✓') : ''}</div></div>`;
}
function chatHTML(msgs){
  let last = '';
  const inner = msgs.map(m => { const d = m.created_at ? localDay(m.created_at) : ''; const sep = d && d !== last ? daySep(d) : ''; if (d) last = d; return sep + bubble(m); }).join('');
  const who = S.me.role === 'coach' ? 'tu cliente' : (firstName(CFG.COACH_NAME) || 'tu coach');
  return `<div class="chat" id="chat" data-last="${last}">${inner || `<div class="empty" id="chatEmpty"><b>Sin mensajes todavía</b>Escribe a ${esc(who)} cuando quieras.</div>`}</div>
    <form class="composer" id="fChat"><textarea class="in" rows="1" placeholder="Escribe un mensaje" maxlength="4000"></textarea>
    <button class="btn gold" type="submit" aria-label="Enviar">${icon('send')}</button></form>`;
}
function appendMsg(m){
  const chat = $('#chat'); if (!chat) return;
  const ex = [...chat.querySelectorAll('[data-mid]')].find(x => x.dataset.mid === m.id);
  if (ex){ ex.outerHTML = bubble(m); return; }
  $('#chatEmpty')?.remove();
  const d = m.created_at ? localDay(m.created_at) : '';
  if (d && d !== chat.dataset.last){ chat.insertAdjacentHTML('beforeend', daySep(d)); chat.dataset.last = d; }
  chat.insertAdjacentHTML('beforeend', bubble(m));
  window.scrollTo(0, document.body.scrollHeight);
}
function mountChat(cid){
  const f = $('#fChat'); if (!f) return;
  const ta = f.querySelector('textarea');
  window.scrollTo(0, document.body.scrollHeight);
  const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(140, ta.scrollHeight) + 'px'; };
  ta.addEventListener('input', grow);
  f.onsubmit = async e => {
    e.preventDefault();
    const body = ta.value.trim(); if (!body) return;
    const row = {id: uid(), client_id: cid, sender_id: S.me.id, body};
    ta.value = ''; grow();
    appendMsg({...row, created_at: new Date().toISOString(), _pending: true});
    try { const r = await saveOrQueue('msg', row); if (!r._pending) appendMsg({...row, ...r}); else toast('Sin conexión. Se enviará al volver la conexión.'); }
    catch(err){ toast(err.message); }
  };
}
VIEWS.chat = async () => {
  const id = S.me.id;
  const msgs = await api.messages(id).catch(() => []);
  const pend = pendingFor('msg', id);
  api.markRead(id, id).then(() => { S.unread[id] = 0; updateBadges(); }).catch(() => {});
  return shell('Mensajes', chatHTML([...msgs.filter(m => !pend.some(p => p.id === m.id)), ...pend]), {tabs: clientTabs('chat'), sub: 'Con ' + (CFG.COACH_NAME || 'tu coach')});
};
VIEWS.chat.mount = () => mountChat(S.me.id);

async function refreshUnread(){ if (!S.me) return; try { S.unread = await api.unread(S.me.id); } catch(e){} updateBadges(); }
function updateBadges(){
  document.querySelectorAll('[data-badge]').forEach(el => {
    const k = el.dataset.badge;
    const n = k === 'all' ? Object.values(S.unread || {}).reduce((a, b) => a + b, 0) : ((S.unread || {})[k] || 0);
    el.textContent = n > 99 ? '99+' : n; el.classList.toggle('hidden', !n);
  });
}
function onNewMessage(m){
  if (!S.me || m.sender_id === S.me.id) return;
  const open = S.me.role === 'coach' ? (S.view === 'client' && S.p.tab === 'chat' && S.p.id === m.client_id) : S.view === 'chat';
  if (open){ appendMsg(m); api.markRead(m.client_id, S.me.id).catch(() => {}); return; }
  S.unread[m.client_id] = (S.unread[m.client_id] || 0) + 1; updateBadges();
  toast(S.me.role === 'coach' ? 'Nuevo mensaje de un cliente' : `Nuevo mensaje de ${firstName(CFG.COACH_NAME) || 'tu coach'}`);
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !S.me) return;
  refreshUnread();
  if (S.view === 'chat' || (S.view === 'client' && S.p.tab === 'chat')) render();
});

/* =====================================================================
   Fotos de progreso y documentos
   ===================================================================== */
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
const curCid = () => S.me.role === 'coach' ? S.p.id : S.me.id;
const fmtSize = b => !b ? '' : b >= 1e6 ? `${fmtNum(b / 1e6, 1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`;
async function compressImage(file, max = 1280, q = .8){
  let src;
  try { src = await createImageBitmap(file, {imageOrientation: 'from-image'}); }
  catch(e){ src = await new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = () => rej(new Error('No se ha podido leer la foto. Prueba con otra.')); img.src = URL.createObjectURL(file); }); }
  const k = Math.min(1, max / Math.max(src.width, src.height));
  const c = document.createElement('canvas'); c.width = Math.round(src.width * k); c.height = Math.round(src.height * k);
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', q));
  if (!blob) throw new Error('No se ha podido preparar la foto');
  return blob;
}
function photosHTML(photos, urls){
  const btn = `<button class="btn light block" data-act="photoNew">${icon('camera')} Subir fotos</button>`;
  if (!photos.length) return `<div class="sec-title">Fotos de progreso</div>${empty('Sin fotos todavía', 'Fotos de frente, espalda y perfil cada 2 a 4 semanas, con la misma luz y la misma ropa.', btn)}`;
  const dates = [...new Set(photos.map(p => p.date))].sort();
  const poses = ['frente','espalda','perfil','otra'].filter(p => new Set(photos.filter(x => x.pose === p).map(x => x.date)).size >= 2);
  const pose = poses.includes(S.p.cmpPose) ? S.p.cmpPose : poses[0];
  const pd = dates.filter(d => photos.some(x => x.pose === pose && x.date === d));
  const A = pd.includes(S.p.cmpA) ? S.p.cmpA : pd[0], B = pd.includes(S.p.cmpB) ? S.p.cmpB : pd[pd.length - 1];
  const long = d => fmtDate(d, {day:'numeric', month:'short', year:'numeric'});
  const fig = d => { const p = photos.find(x => x.pose === pose && x.date === d); return `<figure>${p && urls[p.path] ? `<img src="${esc(urls[p.path])}" alt="">` : '<div class="noimg"></div>'}<figcaption>${esc(long(d))}</figcaption></figure>`; };
  const sel = (k, v) => `<select class="in" data-cmp="${k}">${pd.map(d => `<option value="${d}" ${d === v ? 'selected' : ''}>${esc(long(d))}</option>`).join('')}</select>`;
  return `<div class="sec-title">Fotos de progreso</div>
    ${poses.length ? `<div class="card stack"><b>Antes y después</b>
      <div class="seg">${poses.map(p => `<button class="${p === pose ? 'on' : ''}" data-act="cmpPose" data-v="${p}">${cap(p)}</button>`).join('')}</div>
      <div class="grid2">${sel('cmpA', A)}${sel('cmpB', B)}</div><div class="cmp">${fig(A)}${fig(B)}</div></div>` : ''}
    ${dates.slice().reverse().map(d => `<div class="pdate">${esc(fmtDate(d, {weekday:'short', day:'numeric', month:'short', year:'numeric'}))}</div>
      <div class="pgrid">${photos.filter(p => p.date === d).map(p => `<button class="ph" data-act="photoView" data-id="${esc(p.id)}">${urls[p.path] ? `<img src="${esc(urls[p.path])}" loading="lazy" alt="">` : ''}<span>${esc(p.pose)}</span></button>`).join('')}</div>`).join('')}
    <div style="margin-top:10px">${btn}</div>`;
}
function photoModal(cid){
  const POS = ['frente','espalda','perfil'], chosen = {};
  modal(`<h2>Fotos de progreso</h2><p class="small muted">Misma luz, misma ropa y a la misma hora. Mejor por la mañana y en ayunas.</p>
    <label class="f" style="margin:10px 0">Fecha<input class="in" type="date" id="phDate" value="${today()}"></label>
    <div class="grid3">${POS.map(p => `<label class="upl"><input type="file" accept="image/*" data-pose="${p}" hidden><span class="upl-box" data-prev="${p}">${icon('camera')}<b>${cap(p)}</b><small>Toca aquí</small></span></label>`).join('')}</div>
    <div class="grid2" style="margin-top:14px"><button class="btn light" data-x="no">Cancelar</button><button class="btn gold" data-x="ok">Guardar</button></div>`, (m, close) => {
    m.querySelectorAll('input[type=file]').forEach(inp => inp.onchange = () => {
      const f = inp.files[0]; if (!f) return; chosen[inp.dataset.pose] = f;
      const box = m.querySelector(`[data-prev="${inp.dataset.pose}"]`); box.style.backgroundImage = `url("${URL.createObjectURL(f)}")`; box.classList.add('has');
    });
    m.querySelector('[data-x=no]').onclick = close;
    const ok = m.querySelector('[data-x=ok]');
    ok.onclick = async () => {
      const list = Object.entries(chosen); if (!list.length) return toast('Elige al menos una foto');
      ok.disabled = true; const date = m.querySelector('#phDate').value || today();
      try {
        let i = 0;
        for (const [pose, f] of list){ ok.textContent = `Subiendo ${++i} de ${list.length}`; const blob = await compressImage(f); await api.uploadPhoto({id: uid(), client_id: cid, date, pose}, blob); }
        close(); toast('Fotos guardadas'); render();
      } catch(e){ ok.disabled = false; ok.textContent = 'Guardar'; toast(isNetErr(e) ? 'Sin conexión. Las fotos necesitan internet.' : (e.message || 'Error al subir')); }
    };
  });
}
function docsHTML(docs, urls, kind, asCoach){
  const list = docs.filter(d => d.kind === kind);
  if (!asCoach && !list.length) return '';
  return `<div class="sec-title">${kind === 'entreno' ? 'Documentos de entreno' : 'Documentos de alimentación'}</div>
    <div class="list">${list.map(d => `<div class="card item"><span class="mini">${icon('file')}</span>
      <div class="grow"><b>${esc(d.name)}</b><div class="small muted">PDF${d.size_bytes ? `, ${fmtSize(d.size_bytes)}` : ''}, ${relDate((d.created_at || '').slice(0,10))}</div></div>
      ${urls[d.path] ? `<a class="btn sm light" href="${esc(urls[d.path])}" target="_blank" rel="noopener">Abrir</a>` : ''}
      ${asCoach ? `<button class="mini bad" data-act="docDel" data-id="${esc(d.id)}" aria-label="Borrar">${icon('trash')}</button>` : ''}</div>`).join('')
      || '<p class="small muted" style="margin:0 2px">Todavía no has subido ningún PDF. Tu cliente lo verá aquí y en su app.</p>'}</div>
    ${asCoach ? `<label class="btn light block" style="margin-top:8px">${icon('upload')} Subir PDF<input type="file" accept="application/pdf,.pdf" hidden data-docup="${kind}"></label>` : ''}`;
}
document.addEventListener('change', async e => {
  const t = e.target;
  if (t.matches && t.matches('[data-cmp]')){ S.p[t.dataset.cmp] = t.value; render(); }
  if (t.matches && t.matches('[data-docup]')){
    const f = t.files[0]; t.value = ''; if (!f) return;
    if (!/pdf$/i.test(f.type) && !/\.pdf$/i.test(f.name)) return toast('Solo se pueden subir archivos PDF');
    if (f.size > 15 * 1024 * 1024) return toast('El PDF pesa más de 15 MB');
    toast('Subiendo PDF', 15000);
    try { await api.uploadDoc({id: uid(), client_id: S.p.id, name: f.name.replace(/\.pdf$/i, ''), kind: t.dataset.docup}, f); toast('PDF subido. Tu cliente ya lo puede ver.'); render(); }
    catch(err){ toast(isNetErr(err) ? 'Sin conexión. Inténtalo de nuevo.' : err.message); }
  }
});

/* =====================================================================
   Acciones (delegación de eventos)
   ===================================================================== */
const reorder = (arr, i, dir) => { const j = i + dir; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; };
const ACT = {
  back, home, reload: () => boot(),
  nav: el => go(el.dataset.v, {}, false),
  tab: el => { S.stack = []; go(el.dataset.v, {}, false); },
  async demoLogin(el){ await api.signIn(el.dataset.id); await boot(); },
  async logout(){ if (!(await confirmBox('Cerrar sesión', '¿Seguro que quieres salir?', 'Salir'))) return; S.unsub && S.unsub(); S.unsub = null; S.unread = {}; await api.signOut(); S.me = null; S.stack = []; go('login', {}, false); },
  async resetDemo(){ if (!(await confirmBox('Reiniciar demo', 'Se borrarán los cambios y vuelven los datos de ejemplo.', 'Reiniciar', true))) return; api.reset(); toast('Demo reiniciada'); render(); },
  privacy: () => modal(PRIVACY_HTML + '<button class="btn block" data-x="ok" style="margin-top:12px">Cerrar</button>', (m, close) => m.querySelector('[data-x=ok]').onclick = close),
  copyLink: async () => { try { await navigator.clipboard.writeText(location.origin + location.pathname); toast('Enlace copiado'); } catch(e){ toast('Mantén pulsado el enlace para copiarlo'); } },

  // Coach
  openClient: el => go('client', {id: el.dataset.id, tab: 'summary'}),
  async activate(el, ev){ ev.stopPropagation(); await api.updateProfile(el.dataset.id, {status: 'active'}, true); toast('Cliente activado'); render(); },
  ctab: el => { S.p.tab = el.dataset.v; render(); },
  newPlan: () => go('planEdit', {clientId: S.p.id}),
  editPlan: el => go('planEdit', {clientId: S.p.id, planId: el.dataset.id}),
  newNut: () => go('nutEdit', {clientId: S.p.id}),
  editNut: el => go('nutEdit', {clientId: S.p.id, planId: el.dataset.id}),
  async dupPlan(el){
    const isPlan = el.dataset.kind === 'plan';
    const list = await (isPlan ? api.plans(S.p.id) : api.nutrition(S.p.id));
    const p = clone(list.find(x => x.id === el.dataset.id)); p.id = uid(); p.name += ' (copia)'; p.active = false;
    await (isPlan ? api.savePlan(p) : api.saveNutrition(p)); toast('Plan duplicado. Está archivado hasta que lo actives.'); render();
  },
  async activatePlan(el){
    const isPlan = el.dataset.kind === 'plan';
    const list = await (isPlan ? api.plans(S.p.id) : api.nutrition(S.p.id));
    const p = list.find(x => x.id === el.dataset.id); p.active = true;
    await (isPlan ? api.savePlan(p) : api.saveNutrition(p)); toast('Plan activado'); render();
  },
  async delPlan(el){
    if (!(await confirmBox('Borrar plan', 'Se borrará para siempre. Los entrenos ya registrados se conservan.', 'Borrar', true))) return;
    await (el.dataset.kind === 'plan' ? api.deletePlan(el.dataset.id) : api.deleteNutrition(el.dataset.id)); toast('Plan borrado'); render();
  },
  exAdd: el => { S.draft.days[el.dataset.d].exercises.push(blankEx()); render(); },
  exDel: el => { const ex = S.draft.days[el.dataset.d].exercises; ex.splice(el.dataset.x, 1); render(); },
  exMove: el => { reorder(S.draft.days[el.dataset.d].exercises, +el.dataset.x, +el.dataset.dir); render(); },
  dayAdd: () => { const n = S.draft.days.length; S.draft.days.push({name: `Día ${String.fromCharCode(65 + n)}`, exercises: [blankEx()]}); render(); },
  async dayDel(el){ if (S.draft.days.length === 1) return toast('El plan necesita al menos un día'); if (!(await confirmBox('Quitar día', `Se quitará "${S.draft.days[el.dataset.d].name}" con sus ejercicios.`, 'Quitar', true))) return; S.draft.days.splice(el.dataset.d, 1); render(); },
  dayMove: el => { reorder(S.draft.days, +el.dataset.d, +el.dataset.dir); render(); },
  async planSave(el){
    const p = clone(S.draft);
    p.name = p.name.trim() || 'Plan de entrenamiento';
    p.days = p.days.map(d => ({name: d.name.trim() || 'Día', exercises: d.exercises.filter(x => x.name.trim()).map(x => ({...x, name: x.name.trim()}))}));
    if (!p.days.some(d => d.exercises.length)) return toast('Añade al menos un ejercicio con nombre');
    p.id = p.id || uid(); el.disabled = true;
    try { await api.savePlan(p); toast('Plan guardado'); S.p.tab = 'train'; back(); } catch(e){ toast(e.message); el.disabled = false; }
  },
  mealAdd: () => { S.draft.meals.push({name: 'Comida', time: '', notes: '', options: [], _text: ''}); render(); },
  async mealDel(el){ if (!(await confirmBox('Quitar comida', `Se quitará "${S.draft.meals[el.dataset.m].name}" y sus opciones.`, 'Quitar', true))) return; S.draft.meals.splice(el.dataset.m, 1); render(); },
  async nutSave(el){
    const p = clone(S.draft);
    p.meals = p.meals.map(m => ({name: m.name.trim() || 'Comida', time: m.time, notes: m.notes, options: (m._text || '').split('\n').map(s => s.trim()).filter(Boolean)}));
    ['kcal','protein_g','carbs_g','fat_g'].forEach(k => { const v = num(p[k]); p[k] = v == null ? null : Math.round(v); });
    p.water_l = num(p.water_l); p.name = p.name.trim() || 'Plan de alimentación'; p.id = p.id || uid(); el.disabled = true;
    try { await api.saveNutrition(p); toast('Plan guardado'); S.p.tab = 'food'; back(); } catch(e){ toast(e.message); el.disabled = false; }
  },

  // Cliente
  startDay: el => go('session', {dayIdx: +el.dataset.d}),
  setDone: el => {
    const st = S.draft.entries[el.dataset.e].sets[el.dataset.s];
    st._done = !st._done;
    if (st._done){ if (!st.kg) st.kg = String(st._ph.kg || ''); if (!st.reps) st.reps = String(st._ph.reps || ''); }
    const t = S.draft.entries[el.dataset.e]._target || {};
    if (st._done && !st.kg && t.load) st.kg = String(parseFloat(t.load) || '');
    if (st._done && !st.reps && t.reps) st.reps = String(parseInt(t.reps) || '');
    const row = el.closest('.set'); row.classList.toggle('done', st._done);
    row.querySelector('[data-path$=".kg"]').value = st.kg; row.querySelector('[data-path$=".reps"]').value = st.reps;
  },
  setAdd: el => { const e = S.draft.entries[el.dataset.e]; const last = e.sets.at(-1); e.sets.push({reps: '', kg: '', _ph: {kg: last.kg || last._ph.kg, reps: last.reps || last._ph.reps}, _done: false}); render(); },
  setDel: el => { S.draft.entries[el.dataset.e].sets.pop(); render(); },
  rpe: el => { S.draft.rpe = +el.dataset.v; document.querySelectorAll('[data-act=rpe]').forEach(b => b.classList.toggle('on', b === el)); },
  async sessionSave(el){
    const s = S.draft;
    const entries = s.entries.map(e => ({exercise: e.exercise, sets: e.sets.map(st => ({kg: String(st.kg || st._ph.kg || '').replace(',', '.'), reps: String(st.reps || st._ph.reps || '')})).filter(st => st.kg || st.reps)})).filter(e => e.sets.length);
    if (!entries.length) return toast('Apunta al menos una serie');
    el.disabled = true;
    try {
      const r = await saveOrQueue('log', {id: s.id, client_id: s.client_id, plan_id: s.plan_id, day_name: s.day_name, date: s.date, entries, rpe: s.rpe, notes: s.notes});
      toast(r._pending ? 'Guardado en el móvil. Se enviará al volver la conexión.' : '¡Entreno guardado! Buen trabajo', 3000);
      S.stack = []; go('train', {}, false);
    } catch(e){ toast(e.message); el.disabled = false; }
  },
  metricNew: () => go('metricNew'),
  mscale: el => { S.draft[el.dataset.k] = +el.dataset.v; el.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === el)); },
  async metricSave(el){
    const m = {...S.draft}; ['weight_kg','waist_cm','hip_cm','chest_cm','arm_cm','thigh_cm','body_fat'].forEach(k => m[k] = num(m[k]));
    if (['weight_kg','waist_cm','hip_cm','body_fat','sleep'].every(k => m[k] == null)) return toast('Apunta al menos una medida');
    el.disabled = true;
    try { const r = await saveOrQueue('metric', m); toast(r._pending ? 'Guardado en el móvil. Se enviará al volver la conexión.' : 'Medidas guardadas'); S.stack = []; go('progress', {}, false); }
    catch(e){ toast(e.message); el.disabled = false; }
  },
  pmetric: el => { S.p.metric = el.dataset.v; render(); },
  async delLog(el){ if (!(await confirmBox('Borrar entreno', 'Se borrará este entreno del historial.', 'Borrar', true))) return; await api.deleteLog(el.dataset.id); toast('Entreno borrado'); render(); },
  cmpPose: el => { S.p.cmpPose = el.dataset.v; S.p.cmpA = S.p.cmpB = null; render(); },
  photoNew: () => photoModal(curCid()),
  photoView: el => {
    const p = (S.cache.photos || []).find(x => x.id === el.dataset.id); if (!p) return;
    const u = (S.cache.urls || {})[p.path];
    modal(`${u ? `<img src="${esc(u)}" style="width:100%;border-radius:12px;display:block" alt="">` : ''}
      <div class="row between" style="margin-top:10px"><div><b>${esc(cap(p.pose))}</b><div class="small muted">${esc(fmtDate(p.date, {day:'numeric', month:'long', year:'numeric'}))}</div></div>
      <button class="btn sm danger" data-x="del">${icon('trash')} Borrar</button></div>
      <button class="btn light block" data-x="ok" style="margin-top:12px">Cerrar</button>`, (m, close) => {
      m.querySelector('[data-x=ok]').onclick = close;
      m.querySelector('[data-x=del]').onclick = async () => { close(); if (!(await confirmBox('Borrar foto', 'Se borrará para siempre.', 'Borrar', true))) return; await api.deletePhoto(p); toast('Foto borrada'); render(); };
    });
  },
  async docDel(el){
    const d = (S.cache.docs || []).find(x => x.id === el.dataset.id); if (!d) return;
    if (!(await confirmBox('Borrar PDF', `Se borrará "${d.name}" y tu cliente dejará de verlo.`, 'Borrar', true))) return;
    await api.deleteDoc(d); toast('PDF borrado'); render();
  },
  async delMetric(el){ if (!(await confirmBox('Borrar medidas', 'Se borrará este registro.', 'Borrar', true))) return; await api.deleteMetric(el.dataset.id); toast('Registro borrado'); render(); },
};
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const fn = ACT[el.dataset.act]; if (!fn) return;
  if (el.tagName === 'A' || el.tagName === 'BUTTON') e.preventDefault();
  try { await fn(el, e); } catch(err){ console.error(err); toast(isNetErr(err) ? 'Sin conexión. Inténtalo de nuevo.' : (err.message || 'Error')); }
});

/* ---------- Política de privacidad (borrador) ---------- */
const PRIVACY_HTML = `<h2>Política de privacidad</h2>
<p class="tiny muted">Borrador pendiente de revisión legal.</p>
<div class="small" style="line-height:1.55">
<p><b>Responsable:</b> ${esc(CFG.COACH_NAME || 'el coach')} (${esc(CFG.BRAND || 'JPR Coach')}).</p>
<p><b>Qué datos tratamos:</b> nombre, email, teléfono, fecha de nacimiento, altura, peso, medidas corporales, entrenos y notas sobre tu estado (sueño, estrés, molestias). Algunos son datos de salud.</p>
<p><b>Para qué:</b> solo para preparar y seguir tu plan de entrenamiento y alimentación.</p>
<p><b>Base legal:</b> tu consentimiento explícito, que das al crear la cuenta y puedes retirar cuando quieras.</p>
<p><b>Quién los ve:</b> tú y tu coach. Se guardan en servidores de Supabase en la Unión Europea. No se venden ni se ceden a terceros.</p>
<p><b>Cuánto tiempo:</b> mientras seas cliente. Si te das de baja, se borran cuando lo pidas.</p>
<p><b>Tus derechos:</b> puedes pedir acceso, corrección, borrado o una copia de tus datos escribiendo a tu coach. También puedes reclamar ante la Agencia Española de Protección de Datos.</p>
</div>`;

/* =====================================================================
   Arranque
   ===================================================================== */
async function boot(){
  try {
    const sess = await api.session();
    if (!sess){ S.me = null; return go('login', {}, false); }
    S.me = await api.me();
    if (!S.me){ await api.signOut(); return go('login', {}, false); }
    if (S.recovery || /type=recovery/.test(location.hash)) { S.recovery = true; return go('resetPw', {}, false); }
    if (S.me.role !== 'coach' && S.me.status !== 'active') return go('pending', {}, false);
    flushOutbox();
    S.unread = S.unread || {};
    if (!S.unsub){ try { S.unsub = api.subscribe(onNewMessage); } catch(e){ console.warn(e); } }
    refreshUnread();
    home();
  } catch(e){
    console.error(e);
    if (isNetErr(e)) $('#app').innerHTML = authWrap(`<h1>Sin conexión</h1><p>No hemos podido conectar. Comprueba tu internet y vuelve a intentarlo.</p><button class="btn block" data-act="reload">Reintentar</button>`);
    else { S.me = null; go('login', {}, false); }
  }
}
api.onAuth((ev) => { if (ev === 'PASSWORD_RECOVERY'){ S.recovery = true; go('resetPw', {}, false); } });
boot();
})();
