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
/* Check-in semanal: el coach elige el día (Perfil). La "semana de check-in" empieza ese día. */
const DOW = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const checkinDow = () => { const v = parseInt((S.settings || {}).checkin_day, 10); return v >= 0 && v <= 6 ? v : 1; };
/* Reglas según el plan (el nombre que se pone en Pagos). every: semanas entre check-ins; photos: semanas entre fotos; training: si incluye entreno.
   Para añadir un plan, añade una línea aquí y la misma en la función steps-reminder de Supabase. */
const PLAN_RULES = [
  {re: /basic/, every: 2, photos: 4, training: false},
];
const CK_ANCHOR = '2026-11-23'; // lunes de referencia para los check-ins cada 2 semanas que vienen del plan
const planRule = name => name ? PLAN_RULES.find(r => r.re.test(normEx(name))) || null : null;
const ruleOf = cid => cid && cid === S.me?.id ? S.myRule || null : (S.rules || {})[cid] || null;
const trainingOn = () => ruleOf(S.me?.id)?.training !== false;
/* Frecuencia: lo que el coach elija en la Ficha manda; si no eligió nada, la del plan; si tampoco, cada semana.
   Ficha guarda {clientId: {every: 1}} o {clientId: {every: 2, from: 'AAAA-MM-DD'}}. */
const ckFreqAll = () => { try { return JSON.parse((S.settings || {}).checkin_freq || '{}') || {}; } catch(e){ return {}; } };
const ckFreq = cid => {
  const f = ckFreqAll()[cid];
  if (f) return +f.every === 2 && f.from ? {every: 2, from: f.from, manual: true} : {every: 1, manual: true};
  return ruleOf(cid)?.every === 2 ? {every: 2, from: CK_ANCHOR} : {every: 1};
};
const isoOf = d => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
function checkinWindow(cid){
  const d = parseDate(today()), f = cid ? ckFreq(cid) : {every: 1};
  let back = (d.getDay() - checkinDow() + 7) % 7;
  if (f.every === 2){
    const last = new Date(d); last.setDate(d.getDate() - back);
    const wk = Math.round((last - parseDate(f.from)) / 864e5 / 7);
    if (((wk % 2) + 2) % 2 === 1) back += 7;
  }
  const st = new Date(d); st.setDate(d.getDate() - back);
  const nx = new Date(st); nx.setDate(st.getDate() + 7 * f.every);
  return {start: isoOf(st), back, dueToday: back === 0, day: DOW[checkinDow()], every: f.every, next: isoOf(nx)};
}
const isCheckin = m => m && (m.weight_kg != null || m.waist_cm != null) && (m.sleep != null || m.energy != null);
const checkinOf = (mets, w = checkinWindow(S.me?.id)) => [...mets].reverse().find(m => m.date >= w.start && isCheckin(m)) || null;
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
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  home:'<path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
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
  card:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>',
  ext:'<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/>',
  bell:'<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  heart:'<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z"/>',
};
/* ---------- Salud del iPhone: datos que se pueden compartir ---------- */
const HEALTH_CONSENT_V = '2026-11-22';
/* ---------- Avisos en el móvil (Web Push) ---------- */
const VAPID_PUBLIC = 'BBB7ImvcJcuCr0U3ETE3_9G6XQm1ojU-Xntoe8mfE7eUhYvpcfW-h8DiEXgsX0Sd7tJo6nGR8_wKcn2IprgfjTk';
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
const isStandalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
const b64uBytes = s => { const p = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4); return Uint8Array.from(atob(p), c => c.charCodeAt(0)); };
const swReady = () => Promise.race([navigator.serviceWorker.ready, new Promise((_, rej) => setTimeout(() => rej(new Error('La app aún se está instalando. Ciérrala, vuelve a abrirla y prueba otra vez.')), 6000))]);
async function pushState(){
  if (DEMO) return 'demo';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return isIOS && !isStandalone() ? 'install' : 'unsupported';
  if (isIOS && !isStandalone()) return 'install';
  if (Notification.permission === 'denied') return 'denied';
  try { const reg = await swReady(); return (await reg.pushManager.getSubscription()) ? 'on' : 'off'; } catch(e){ return 'off'; }
}
const HM = [
  {k:'steps', l:'Pasos', s:'Pasos', u:'', d:0, desc:'pasos del día'},
  {k:'sleep_h', l:'Sueño', s:'Sueño', u:'', d:1, desc:'lo que dormiste la noche anterior'},
  {k:'resting_hr', l:'FC en reposo', s:'FC', u:'lpm', d:0, desc:'pulsaciones en reposo'},
  {k:'hrv_ms', l:'VFC', s:'VFC', u:'ms', d:0, desc:'variabilidad cardiaca (recuperación)'},
  {k:'active_kcal', l:'Calorías activas', s:'kcal', u:'kcal', d:0, desc:'energía gastada al moverte'},
  {k:'weight_kg', l:'Peso', s:'Peso', u:'kg', d:1, desc:'si tienes báscula conectada a Salud'},
];
const hmOf = k => HM.find(m => m.k === k);
const fmtSleep = h => { if (h == null) return '-'; const m = Math.round(h * 60); return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`; };
const fmtH = (k, v) => v == null ? '-' : k === 'sleep_h' ? fmtSleep(v) : fmtNum(v, hmOf(k).d);
const newToken = () => Array.from(crypto.getRandomValues(new Uint8Array(18)), b => b.toString(16).padStart(2, '0')).join('');
const isoDaysAgo = n => { const x = new Date(); x.setDate(x.getDate() - n); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };
const ago = iso => { if (!iso) return 'todavía nada'; const s = (Date.now() - new Date(iso)) / 1000; if (s < 90) return 'hace un momento'; if (s < 3600) return `hace ${Math.round(s / 60)} min`; if (s < 86400) return `hace ${Math.round(s / 3600)} h`; return relDate(new Date(iso).toLocaleDateString('sv-SE')); };
function seedHealth(){
  const days = [];
  for (let k = 29; k >= 0; k--){
    const w = k % 7, r = Math.sin(k * 1.7);
    days.push({client_id:'demo-ana', day: isoDaysAgo(k), steps: k === 0 ? 6240 : Math.round(8200 + r * 2600 + (w === 0 ? -3000 : 0)), sleep_h: k === 0 ? 6.1 : +(7.2 + Math.sin(k * 2.3) * .8).toFixed(2),
      resting_hr: k === 0 ? 63 : Math.round(57 + Math.sin(k * .9) * 2), hrv_ms: k === 0 ? 38 : Math.round(52 + Math.sin(k * 1.3) * 7), active_kcal: k === 0 ? 310 : Math.round(480 + r * 140),
      weight_kg: k % 3 === 0 ? +(69.9 - (29 - k) * .03).toFixed(1) : null, updated_at: new Date(Date.now() - k * 864e5).toISOString()});
  }
  return {links: [{client_id:'demo-ana', token: 'demo' + '0'.repeat(28), metrics: HM.map(m => m.k), consent_version: HEALTH_CONSENT_V, consented_at: new Date(Date.now() - 30 * 864e5).toISOString(),
    last_sync_at: new Date(Date.now() - 40 * 60e3).toISOString(), last_payload: {steps: 6240, sueno: 366, fc_reposo: 63, vfc: 38, calorias: 310, peso: ''}}], days};
}

const icon = (n, fill) => `<svg viewBox="0 0 24 24" fill="${fill ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${I[n]}</svg>`;

const EXERCISES = ['Sentadilla','Sentadilla frontal','Sentadilla búlgara','Prensa de piernas','Peso muerto','Peso muerto rumano','Hip thrust','Puente de glúteo','Zancadas','Step up','Extensión de cuádriceps','Curl femoral tumbado','Curl femoral sentado','Elevación de gemelos','Press banca','Press banca inclinado','Press con mancuernas','Fondos','Flexiones','Aperturas','Press militar','Press de hombro con mancuernas','Elevaciones laterales','Pájaros','Face pull','Dominadas','Jalón al pecho','Remo con barra','Remo con mancuerna','Remo en polea','Pullover','Curl de bíceps','Curl martillo','Extensión de tríceps en polea','Press francés','Plancha','Plancha lateral','Rueda abdominal','Crunch en polea','Pallof press','Kettlebell swing','Farmer walk','Remo ergómetro','Bici','Cinta'];

/* =====================================================================
   Capa de datos: Supabase o demo local
   ===================================================================== */
const TABLES = {
  workout_plans: ['id','client_id','name','notes','days','active'],
  nutrition_plans: ['id','client_id','name','kcal','protein_g','carbs_g','fat_g','water_l','meals','guidelines','active'],
  workout_logs: ['id','client_id','plan_id','day_name','date','entries','rpe','notes'],
  body_metrics: ['id','client_id','date','weight_kg','height_cm','waist_cm','hip_cm','chest_cm','arm_cm','thigh_cm','body_fat','visceral_fat','muscle_kg','sleep','stress','energy','notes'],
  messages: ['id','client_id','sender_id','body'],
  progress_photos: ['id','client_id','date','pose','path','notes'],
  documents: ['id','client_id','name','kind','path','size_bytes'],
  billing: ['client_id','plan_name','amount_cents','currency','period','manual_until'],
  payments: ['id','client_id','amount_cents','currency','status','description','paid_at'],
};
const PROFILE_FIELDS_CLIENT = ['full_name','phone','birth_date','height_cm','goal','welcomed_at'];
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
        sb.from('body_metrics').select('client_id,date,weight_kg,waist_cm,sleep,energy').order('date', {ascending:false}).limit(2000).then(ok),
      ]);
      return {logs, mets};
    },
    async profile(id){ return ok(await sb.from('profiles').select('*').eq('id', id).single()); },
    async settings(){ const r = ok(await sb.from('app_settings').select('key,value')); return Object.fromEntries(r.map(x => [x.key, x.value])); },
    async saveSetting(key, value){ return ok(await sb.from('app_settings').upsert({key, value, updated_at: new Date().toISOString()})); },
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
    // Pagos
    billing: cid => sb.from('billing').select('*').eq('client_id', cid).maybeSingle().then(ok),
    allBilling: () => sb.from('billing').select('*').then(ok),
    saveBilling: row => sb.from('billing').upsert(pick(row, TABLES.billing)).select().single().then(ok),
    payments: cid => sb.from('payments').select('*').eq('client_id', cid).order('paid_at', {ascending:false}).limit(100).then(ok),
    addManualPayment: row => sb.from('payments').insert({...pick(row, TABLES.payments), method: 'manual'}).select().single().then(ok),
    deletePayment: id => del('payments', id),
    // Avisos en el móvil
    async pushSave(p){ return ok(await sb.from('push_subs').upsert({...p, user_id: S.me.id}, {onConflict: 'endpoint'})); },
    async pushDelete(endpoint){ return ok(await sb.from('push_subs').delete().eq('endpoint', endpoint)); },
    async pushCount(cid){ const {count, error} = await sb.from('push_subs').select('id', {count: 'exact', head: true}).eq('user_id', cid); if (error) throw error; return count || 0; },
    lastReminder: cid => sb.from('health_reminders').select('*').eq('client_id', cid).order('day', {ascending: false}).limit(1).maybeSingle().then(ok),
    async pushTest(){ const {data, error} = await sb.functions.invoke('steps-reminder', {body: {test: true}}); if (error) throw new Error('No se ha podido enviar el aviso de prueba'); return data; },
    // Salud del iPhone
    healthLink: cid => sb.from('health_links').select('*').eq('client_id', cid).maybeSingle().then(ok),
    async healthConnect(cid, metrics){ return ok(await sb.from('health_links').insert({client_id: cid, token: newToken(), metrics, consent_version: HEALTH_CONSENT_V}).select().single()); },
    healthSetMetrics: (cid, metrics) => sb.from('health_links').update({metrics}).eq('client_id', cid).select().single().then(ok),
    async healthDisconnect(cid, wipe){ ok(await sb.from('health_links').delete().eq('client_id', cid)); if (wipe) ok(await sb.from('health_daily').delete().eq('client_id', cid)); },
    healthDays: (cid, n = 60) => sb.from('health_daily').select('*').eq('client_id', cid).gte('day', isoDaysAgo(n)).order('day', {ascending: true}).then(ok),
    async healthOverview(){
      const [links, days] = await Promise.all([sb.from('health_links').select('client_id,last_sync_at').then(ok), sb.from('health_daily').select('client_id,day,steps,sleep_h').gte('day', isoDaysAgo(1)).then(ok)]);
      return {links, days};
    },
    subscribeHealth(cid, cb){
      const ch = sb.channel('salud-' + cid + '-' + Date.now())
        .on('postgres_changes', {event: '*', schema: 'public', table: 'health_daily', filter: `client_id=eq.${cid}`}, () => cb())
        .on('postgres_changes', {event: '*', schema: 'public', table: 'health_links', filter: `client_id=eq.${cid}`}, () => cb()).subscribe();
      return () => sb.removeChannel(ch);
    },
    async checkout(){ const {data, error} = await sb.functions.invoke('create-checkout', {body: {}}); if (error) throw await fnError(error); return data; },
    async portal(){ const {data, error} = await sb.functions.invoke('customer-portal', {body: {}}); if (error) throw await fnError(error); return data; },
  };
}
async function fnError(error){
  try { const j = await error.context.json(); return new Error(j.error || error.message); }
  catch(e){ return new Error(/fetch|network/i.test(error.message) ? 'Sin conexión. Inténtalo de nuevo.' : 'El sistema de pagos todavía no está activado. Avisa a tu coach.'); }
}

function DemoAPI(){
  const KEY = 'jpr-demo-v1', SKEY = 'jpr-demo-session';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || seed(); } catch(e){ return mem || (mem = seed()); } };
  let mem = null;
  let db = load();
  ['messages','progress_photos','documents','billing','payments'].forEach(k => { if (!db[k]) db[k] = []; });
  if (!db.health_links){ const h = seedHealth(); db.health_links = h.links; db.health_daily = h.days; }
  let hlisteners = [];
  const hl = cid => setTimeout(() => hlisteners.forEach(f => f(cid)), 30);
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
    async settings(){ return wait(db.settings || {}); },
    async saveSetting(key, value){ db.settings = {...(db.settings || {}), [key]: value}; save(); return wait(null); },
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
    billing: cid => wait(db.billing.find(b => b.client_id === cid) || null),
    allBilling: () => wait(db.billing),
    async saveBilling(row){
      const r = pick(row, TABLES.billing); let b = db.billing.find(x => x.client_id === r.client_id);
      if (!b){ b = {client_id: r.client_id, status: 'none', currency: 'eur'}; db.billing.push(b); }
      Object.assign(b, r, {updated_at: now()}); save(); return wait(b);
    },
    payments: cid => wait(db.payments.filter(x => x.client_id === cid).sort((a,b) => b.paid_at.localeCompare(a.paid_at))),
    async addManualPayment(row){ const r = {...pick(row, TABLES.payments), id: uid(), method: 'manual', status: 'paid', created_at: now()}; r.paid_at = r.paid_at || now(); db.payments.push(r); save(); return wait(r); },
    deletePayment: id => del('payments', id),
    async checkout(){
      const b = db.billing.find(x => x.client_id === sess);
      if (!b || !b.amount_cents) throw new Error('Tu coach todavía no ha configurado tu plan de pago.');
      const months = {month:1, quarter:3, semester:6, year:12}[b.period];
      const end = new Date(); if (months) end.setMonth(end.getMonth() + months);
      Object.assign(b, {status: months ? 'active' : 'paid_once', current_period_end: months ? end.toISOString() : null, stripe_customer_id: 'cus_demo', last_payment_at: now()});
      db.payments.push({id: uid(), client_id: sess, amount_cents: b.amount_cents, currency: 'eur', status: 'paid', method: 'stripe', description: 'Primer pago con tarjeta', paid_at: now(), created_at: now()});
      save(); return {demo: true};
    },
    async portal(){ return {demo: true}; },
    async pushSave(){ return wait(null); }, async pushDelete(){ return wait(null); },
    pushCount: cid => wait(cid === 'demo-ana' ? 1 : 0),
    lastReminder: cid => wait(cid === 'demo-ana' ? {day: isoDaysAgo(1), steps: 7420, goal: 10000, sent: 1} : null),
    async pushTest(){ return wait({ok: true}); },
    healthLink: cid => wait(db.health_links.find(x => x.client_id === cid) || null),
    async healthConnect(cid, metrics){ db.health_links = db.health_links.filter(x => x.client_id !== cid); const r = {client_id: cid, token: newToken(), metrics, consent_version: HEALTH_CONSENT_V, consented_at: now(), last_sync_at: null, last_payload: null}; db.health_links.push(r); save(); hl(cid); return wait(r); },
    async healthSetMetrics(cid, metrics){ const r = db.health_links.find(x => x.client_id === cid); r.metrics = metrics; save(); hl(cid); return wait(r); },
    async healthDisconnect(cid, wipe){ db.health_links = db.health_links.filter(x => x.client_id !== cid); if (wipe) db.health_daily = db.health_daily.filter(x => x.client_id !== cid); save(); hl(cid); },
    healthDays: (cid, n = 60) => wait(db.health_daily.filter(x => x.client_id === cid && x.day >= isoDaysAgo(n)).sort((a, b) => a.day.localeCompare(b.day))),
    healthOverview: () => wait({links: db.health_links, days: db.health_daily.filter(x => x.day >= isoDaysAgo(1))}),
    subscribeHealth(cid, cb){ const f = id => { if (id === cid) cb(); }; hlisteners.push(f); return () => { hlisteners = hlisteners.filter(x => x !== f); }; },
    async demoHealthSend(cid){
      const link = db.health_links.find(x => x.client_id === cid); if (!link) return;
      const h = new Date().getHours(), all = {steps: Math.round(600 * h + Math.random() * 900), sleep_h: +(6.3 + Math.random() * 1.8).toFixed(2), resting_hr: 55 + Math.round(Math.random() * 6), hrv_ms: 42 + Math.round(Math.random() * 18), active_kcal: Math.round(25 * h + Math.random() * 80), weight_kg: null};
      let r = db.health_daily.find(x => x.client_id === cid && x.day === today()); if (!r){ r = {client_id: cid, day: today()}; db.health_daily.push(r); }
      link.metrics.forEach(k => { if (all[k] != null) r[k] = all[k]; }); r.updated_at = now();
      link.last_sync_at = now(); link.last_payload = {pasos: all.steps, sueno: Math.round(all.sleep_h * 60) + ' min', fc_reposo: all.resting_hr, vfc: all.hrv_ms, calorias: all.active_kcal, peso: ''};
      save(); hl(cid);
    },
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
  const ana = {id:'demo-ana', email:'ana@demo', full_name:'Ana García', role:'client', status:'active', phone:'600 111 222', birth_date:'1990-04-12', height_cm:165, goal:'Perder grasa y ganar fuerza en tren inferior', notes:'Molestias leves en rodilla izquierda. Vigilar sentadilla profunda.', consent_at: ts(60), created_at: ts(60), welcomed_at: ts(60)};
  const luis = {id:'demo-luis', email:'luis@demo', full_name:'Luis Martín', role:'client', status:'active', height_cm:180, goal:'Ganar masa muscular', created_at: ts(30), consent_at: ts(30), welcomed_at: ts(30)};
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
  for (let k = 56; k >= 0; k -= 7){ const i = (56 - k) / 7; mets.push({id: uid(), client_id:'demo-ana', date: d(k), weight_kg: +(72.4 - i*0.45 + (i%2 ? .2 : 0)).toFixed(1), waist_cm: +(84 - i*0.6).toFixed(1), hip_cm: +(102 - i*0.3).toFixed(1), body_fat: +(29 - i*0.35).toFixed(1), visceral_fat: +(7 - i*0.15).toFixed(1), muscle_kg: +(24.1 + i*0.12).toFixed(1), height_cm: i === 0 ? 165 : undefined, sleep: 3 + (i%2), stress: 3, energy: 3 + (i>4?1:0), created_at: ts(k)}); }
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
  const nextMonth = new Date(); nextMonth.setDate(nextMonth.getDate() + 22);
  const billing = [
    {client_id:'demo-ana', plan_name:'Entreno + alimentación', amount_cents:7000, currency:'eur', period:'month', status:'active', current_period_end: nextMonth.toISOString(), stripe_customer_id:'cus_demo_ana', last_payment_at: ts(8)},
    {client_id:'demo-luis', plan_name:'Solo entreno', amount_cents:4500, currency:'eur', period:'month', status:'past_due', current_period_end: ts(2), stripe_customer_id:'cus_demo_luis', last_payment_at: ts(32)},
  ];
  const pay = (cid, c, st, n, desc, method = 'stripe') => ({id: uid(), client_id: cid, amount_cents: c, currency:'eur', status: st, method, description: desc, paid_at: ts(n), created_at: ts(n)});
  const payments = [pay('demo-ana', 7000, 'paid', 38, 'Primer pago con tarjeta'), pay('demo-ana', 7000, 'paid', 8, 'Cuota con tarjeta'),
    pay('demo-luis', 4500, 'paid', 32, 'Primer pago con tarjeta'), pay('demo-luis', 4500, 'failed', 2, 'Pago con tarjeta fallido')];
  return { profiles:[coach, ana, luis, marta], workout_plans:[plan], nutrition_plans:[nut], workout_logs: logs, body_metrics: mets, messages, progress_photos: [], documents: [], billing, payments };
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
function home(){ S.stack = []; go(S.me?.role === 'coach' ? 'clients' : 'today', {}, false); }
window.addEventListener('popstate', () => { if (S.stack.length) back(); });

/* ---------- Render ---------- */
let renderSeq = 0;
async function render(){
  const seq = ++renderSeq;
  if (S.cleanup){ try { S.cleanup(); } catch(e){} S.cleanup = null; }
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
  const t = [['today','Hoy','home'],['train','Entreno','dumbbell'],['food','Dieta','food'],['progress','Progreso','chart'],['chat','Mensajes','chat'],['profile','Perfil','user']].filter(x => x[0] !== 'train' || trainingOn());
  return `<nav class="tabs n6">${t.map(([v,l,i]) => `<button class="${active === v ? 'on' : ''}" data-act="tab" data-v="${v}">${icon(i)}${l}${v === 'chat' ? `<span class="tb-badge hidden" data-badge="${esc(S.me.id)}"></span>` : ''}</button>`).join('')}</nav>`;
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
// Repeticiones objetivo de la serie i: "15/12/10/8" da 15, 12, 10, 8
const repsFor = (t, i) => { const rs = String(t?.reps || '').split('/'); return parseInt(rs[Math.min(i, rs.length - 1)]) || ''; };
/* Explicación corta de cada ejercicio. Se busca por palabras del nombre (de más concreto a más general).
   Si el coach escribe sus notas de técnica, salen además como "Nota del coach". */
const EX_TIPS = [
  [/bulgara/, 'Pie de atrás apoyado en un banco. Baja en vertical hasta que la rodilla de atrás casi toque el suelo y sube empujando con el talón de la pierna de delante.'],
  [/sentadilla frontal|front squat/, 'Barra apoyada delante, sobre los hombros, con los codos altos. Baja con el tronco lo más vertical posible y sube sin dejar caer los codos.'],
  [/sumo/, 'Pies más abiertos que los hombros y puntas hacia fuera. Baja con la espalda recta empujando las rodillas hacia fuera y sube apretando el glúteo.'],
  [/sentadilla|squat|goblet/, 'Pies a la anchura de los hombros. Baja con el pecho alto y las rodillas en la línea de los pies, hasta donde mantengas la espalda recta, y sube empujando el suelo.'],
  [/prensa/, 'Pies a media altura de la plataforma. Baja controlando sin que la cadera se despegue del respaldo y empuja sin bloquear del todo las rodillas.'],
  [/rumano|piernas rigidas/, 'Rodillas un poco flexionadas y fijas. Lleva la cadera atrás bajando el peso pegado a las piernas hasta notar el femoral estirado y sube apretando el glúteo.'],
  [/peso muerto/, 'Barra pegada a las espinillas, espalda recta y pecho fuera. Empuja el suelo con las piernas y estira la cadera al final sin echar el tronco hacia atrás.'],
  [/good morning|buenos dias/, 'Barra en la espalda y rodillas un poco flexionadas. Lleva la cadera atrás con la espalda recta hasta notar el femoral y sube apretando el glúteo.'],
  [/hip thrust/, 'Espalda alta apoyada en el banco y peso sobre la cadera. Sube hasta dejar el cuerpo recto de rodillas a hombros, aprieta el glúteo 1 segundo arriba y baja controlando.'],
  [/puente|elevacion(es)? de cadera/, 'Tumbado boca arriba con los pies cerca del culo. Sube la cadera apretando el glúteo, aguanta 1 segundo arriba y baja despacio.'],
  [/zancada|lunge|split/, 'Paso largo y baja en vertical hasta que la rodilla de atrás casi toque el suelo. La rodilla de delante va en la línea del pie. Sube empujando con el talón.'],
  [/step/, 'Sube al banco apoyando el pie entero y empuja con esa pierna, sin impulsarte con la de abajo. Baja controlando.'],
  [/hiperextension|lumbar/, 'Cadera apoyada en el borde. Baja con la espalda recta y sube hasta dejar el cuerpo en línea apretando el glúteo, sin pasarte arriba.'],
  [/extension de (cuadriceps|pierna)|cuadriceps/, 'Espalda pegada al respaldo. Estira las rodillas hasta arriba, aguanta 1 segundo y baja lento sin dejar caer el peso.'],
  [/femoral|isquio/, 'Piernas bien sujetas en la máquina. Lleva los talones hacia el culo doblando las rodillas, aguanta 1 segundo y vuelve lento.'],
  [/patada|kickback/, 'Tronco quieto y abdomen firme. Lleva la pierna hacia atrás y arriba apretando el glúteo, sin arquear la zona lumbar, y vuelve controlando.'],
  [/abduc|abiertas/, 'Espalda apoyada y movimiento controlado. Abre las piernas empujando con la parte de fuera del glúteo, aguanta 1 segundo fuera y cierra despacio.'],
  [/aduc|cerradas/, 'Cierra las piernas apretando la cara interna del muslo, aguanta 1 segundo y abre despacio sin dejar que el peso tire de ti.'],
  [/gemelo|pantorrilla|talones/, 'Sube de puntillas todo lo que puedas, aguanta 1 segundo arriba y baja hasta notar el gemelo estirado.'],
  [/cinta|bici|eliptica|ergometro|caminar|andar|cardio|carrera|correr/, 'Ritmo constante que te deje hablar con frases cortas, salvo que el plan diga otra cosa.'],
  [/inclinad/, 'Banco a unos 30 grados. Escápulas juntas y hacia abajo. Baja hasta la parte alta del pecho y empuja sin despegar los glúteos del banco.'],
  [/press (de )?banca|press de pecho|press plano|press con mancuernas|chest press/, 'Escápulas juntas y hacia abajo, pies firmes en el suelo. Baja controlando hasta el pecho y empuja sin rebotar.'],
  [/fondos|dips/, 'Tronco un poco inclinado hacia delante. Baja hasta que los codos lleguen a unos 90 grados y empuja hasta estirar los brazos.'],
  [/flexion/, 'Cuerpo recto de cabeza a talones y manos algo más abiertas que los hombros. Baja el pecho cerca del suelo y empuja sin hundir la cadera.'],
  [/apertura|cruce|pec ?deck|contractor/, 'Codos un poco doblados y fijos. Abre hasta notar el pecho estirado y cierra como si abrazaras un árbol.'],
  [/plancha lateral|side plank/, 'Apoyado en el antebrazo, cuerpo recto de cabeza a pies y cadera alta. Aguanta sin dejar que la cadera caiga.'],
  [/plancha|plank/, 'Antebrazos bajo los hombros, cuerpo recto y glúteo apretado. Aguanta sin hundir ni subir la cadera.'],
  [/face pull/, 'Cuerda a la altura de la cara. Tira hacia la frente separando las manos y abriendo los codos, aprieta la espalda alta y vuelve controlando.'],
  [/pajaro|posterior|reverse fly/, 'Tronco inclinado y espalda recta. Abre los brazos hacia los lados juntando las escápulas, sin subir los hombros, y baja controlando.'],
  [/lateral/, 'Codos un poco doblados. Sube los brazos hacia los lados hasta la altura de los hombros sin balancear el cuerpo y baja despacio.'],
  [/frontal/, 'Sube el peso por delante hasta la altura de los hombros sin balancearte y baja despacio.'],
  [/press militar|press de hombro|press hombro|arnold|shoulder press/, 'Abdomen y glúteo apretados para no arquear la espalda. Empuja por encima de la cabeza hasta estirar los brazos y baja hasta la altura de la barbilla.'],
  [/dominada|pull ?up|chin/, 'Agarre algo más abierto que los hombros. Tira llevando el pecho hacia la barra y los codos hacia abajo, y baja hasta casi estirar los brazos.'],
  [/jalon|pulldown/, 'Pecho fuera y algo inclinado hacia atrás. Lleva la barra a la parte alta del pecho tirando con los codos hacia abajo y sube controlando hasta estirar los brazos.'],
  [/remo|row/, 'Espalda recta y abdomen firme. Tira llevando los codos hacia atrás pegados al cuerpo, junta las escápulas al final y vuelve controlando.'],
  [/pullover/, 'Brazos casi estirados. Lleva el peso hacia atrás por encima de la cabeza hasta notar el dorsal estirado y vuelve tirando con la espalda.'],
  [/martillo|hammer/, 'Palmas mirándose entre sí y codos pegados al cuerpo. Sube sin balancearte y baja despacio.'],
  [/curl|biceps/, 'Codos pegados al cuerpo y quietos. Sube sin balancear el tronco, aprieta arriba y baja lento hasta estirar el brazo.'],
  [/frances/, 'Codos fijos apuntando al techo. Baja el peso hacia la frente doblando solo los codos y vuelve a estirar.'],
  [/triceps|extension/, 'Codos pegados y quietos. Estira los brazos del todo apretando el tríceps y vuelve controlando sin mover los hombros.'],
  [/rueda/, 'Desde rodillas y con el abdomen apretado, rueda hacia delante sin arquear la zona lumbar y vuelve tirando con el abdomen.'],
  [/pallof/, 'De lado a la polea y con los brazos al pecho. Estira los brazos al frente sin dejar que el cable te gire el tronco, aguanta y vuelve.'],
  [/crunch|encogimiento|abdominal|elevacion(es)? de piernas/, 'Enrolla el tronco llevando las costillas hacia la cadera, sin tirar del cuello, y vuelve despacio.'],
  [/swing|kettlebell/, 'El movimiento sale de la cadera, no de los brazos. Lleva la pesa entre las piernas con la espalda recta y empuja la cadera adelante apretando el glúteo.'],
  [/farmer|granjero|paseo/, 'Peso en cada mano, hombros atrás y abdomen firme. Camina con pasos cortos sin inclinarte hacia ningún lado.'],
];
const normEx = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const exTip = name => { const n = normEx(name); return (EX_TIPS.find(([re]) => re.test(n)) || [])[1] || ''; };
const coachNote = t => { const n = String(t?.notes || '').trim(); return n && !/^ver( el)?( video)?\.?$/i.test(normEx(n)) ? n : ''; };

/* Vídeos de ejercicios: YouTube y archivos de vídeo se ven dentro de la app; el resto se abre fuera */
const ytId = u => { const m = String(u).match(/(?:youtube\.com\/(?:shorts\/|embed\/|live\/|watch\?(?:.*&)?v=)|youtu\.be\/)([\w-]{11})/i); return m ? m[1] : null; };
const isVidFile = u => /\.(mp4|mov|m4v|webm)(\?|#|$)/i.test(u);
const videoLinks = (v, title = '') => String(v || '').split(/\s+/).filter(u => /^https?:\/\//i.test(u)).map((u, i, a) => {
  const label = `${icon('play', true)} ${a.length > 1 ? `Vídeo ${i + 1}` : 'Ver vídeo'}`;
  return ytId(u) || isVidFile(u) ? `<button type="button" class="vid" data-act="playVid" data-url="${esc(u)}" data-title="${esc(title)}">${label}</button>` : `<a class="vid" href="${esc(u)}" target="_blank" rel="noopener">${label}</a>`;
}).join('');
function playVideo(u, title = ''){
  const id = ytId(u), vertical = /\/shorts\//i.test(u);
  const player = id
    ? `<iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&rel=0&modestbranding=1&loop=1&playlist=${id}" title="${esc(title || 'Vídeo del ejercicio')}" referrerpolicy="strict-origin-when-cross-origin" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`
    : `<video src="${esc(u)}" controls autoplay loop playsinline muted></video>`;
  modal(`${title ? `<h2 style="margin-bottom:10px">${esc(title)}</h2>` : ''}<div class="vplayer ${vertical ? 'v' : ''}">${player}</div>
    <div class="row between" style="margin-top:12px;gap:10px">${id ? `<a class="small muted" href="${esc(u)}" target="_blank" rel="noopener">¿No carga? Ábrelo en YouTube</a>` : '<span></span>'}<button class="btn" data-x="ok">Cerrar</button></div>`,
    (m, close) => { m.classList.add('vmodal'); m.querySelector('[data-x=ok]').onclick = close; });
}
/* Descanso: lee "90 s", "2 min", "1'30\"", "1:30"... del ejercicio o, si no tiene, del nombre del día "(descansos 1'30")" */
function restSecs(txt){
  const t = String(txt || '').toLowerCase().replace(/[’´]/g, "'").replace(/[”″]/g, '"').replace(',', '.');
  let m = t.match(/(\d+)\s*[:']\s*(\d{1,2})/); if (m) return +m[1] * 60 + +m[2];
  m = t.match(/(\d+(?:\.\d+)?)\s*(min|m\b|')/); if (m) return Math.round(parseFloat(m[1]) * 60);
  m = t.match(/(\d+)\s*(s|seg|")/); if (m) return +m[1];
  m = t.match(/^\s*(\d+)\s*$/); if (m) return +m[1] <= 10 ? +m[1] * 60 : +m[1];
  return 0;
}
const restOf = (t, dayName) => { const own = restSecs(t?.rest); if (own) return own; const m = String(dayName || '').match(/descansos?\s*:?\s*([^)]+)/i); return m ? restSecs(m[1]) : 0; };
const mmss = n => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
let restT = null;
function restTimer(secs, label = ''){
  clearInterval(restT); let bar = document.getElementById('restbar');
  if (!secs){ bar && bar.remove(); return; }
  if (!bar){ bar = document.createElement('div'); bar.id = 'restbar'; document.body.appendChild(bar); }
  const end = Date.now() + secs * 1000; let fired = false;
  const draw = () => {
    if (S.view !== 'session'){ clearInterval(restT); bar.remove(); return; }
    const left = Math.max(0, Math.round((end - Date.now()) / 1000));
    bar.className = left ? '' : 'go';
    bar.innerHTML = left ? `<div class="grow"><small>Descanso${label ? ` · ${esc(label)}` : ''}</small><b>${mmss(left)}</b></div><button data-r="15">+15 s</button><button data-r="x">Saltar</button>`
      : `<div class="grow"><small>Descanso terminado</small><b>¡Siguiente serie!</b></div><button data-r="x">OK</button>`;
    bar.querySelectorAll('button').forEach(b => b.onclick = () => b.dataset.r === 'x' ? (clearInterval(restT), bar.remove()) : restTimer(left + 15, label));
    if (!left && !fired){ fired = true; clearInterval(restT); try { navigator.vibrate && navigator.vibrate([300, 150, 300]); } catch(e){}
      try { const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain(); o.frequency.value = 880; o.connect(g); g.connect(a.destination); g.gain.setValueAtTime(.25, a.currentTime); g.gain.exponentialRampToValueAtTime(.001, a.currentTime + .6); o.start(); o.stop(a.currentTime + .6); } catch(e){} }
  };
  draw(); restT = setInterval(draw, 500);
}
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
  const [clients, act, bills, hov] = await Promise.all([api.clients(), api.activity(), api.allBilling().catch(() => []), api.healthOverview().catch(() => ({links: [], days: []})), refreshSettings()]);
  S.rules = Object.fromEntries(bills.map(b => [b.client_id, planRule(b.plan_name)]));
  const cws = {}, cwOf = id => cws[id] || (cws[id] = checkinWindow(id)), ckDone = {}; act.mets.forEach(m => { if (m.date >= cwOf(m.client_id).start && isCheckin(m)) ckDone[m.client_id] = true; });
  const hToday = {}; hov.days.filter(d => d.day === today()).forEach(d => { hToday[d.client_id] = d; });
  const billOf = {}; bills.forEach(b => { billOf[b.client_id] = b; });
  const lastLog = {}, lastW = {};
  act.logs.forEach(l => { if (!lastLog[l.client_id] || l.date > lastLog[l.client_id]) lastLog[l.client_id] = l.date; });
  act.mets.forEach(m => { if (m.weight_kg != null && (!lastW[m.client_id] || m.date > lastW[m.client_id].date)) lastW[m.client_id] = m; });
  const q = (S.p.q || '').toLowerCase();
  const shown = clients.filter(c => !q || (c.full_name + ' ' + (c.email || '')).toLowerCase().includes(q));
  const pend = shown.filter(c => c.status === 'pending'), rest = shown.filter(c => c.status !== 'pending');
  const active = clients.filter(c => c.status === 'active').length;
  const trained7 = clients.filter(c => lastLog[c.id] && daysAgo(lastLog[c.id]) <= 7).length;
  const row = c => {
    const d = lastLog[c.id], since = d || (c.created_at || '').slice(0,10), late = c.status === 'active' && !!since && daysAgo(since) > 7;
    const ps = payState(billOf[c.id]);
    return `<div class="card tap item ${c.status === 'pending' ? 'pend' : (late || ps.k === 'late') ? 'late' : ''}" data-act="openClient" data-id="${esc(c.id)}">
      <div class="avatar">${esc(initials(c.full_name))}</div>
      <div class="grow"><b>${esc(c.full_name || c.email)}</b>
        <div class="small muted">Último entreno: <span class="${late ? 'up' : ''}">${relDate(d)}</span>${late ? '<span class="late-tag">+7 días</span>' : ''}${lastW[c.id] ? `, ${fmtNum(lastW[c.id].weight_kg)} kg` : ''}${c.status === 'active' ? (ckDone[c.id] ? '<span class="ck-tag ok">Check-in ✓</span>' : cwOf(c.id).back >= 1 ? '<span class="ck-tag">Check-in pendiente</span>' : '') : ''}${hToday[c.id]?.steps != null ? `<span class="hmini">${icon('heart')} ${fmtNum(hToday[c.id].steps, 0)} pasos hoy</span>` : ''}</div></div>
      <span class="cnt hidden" data-badge="${esc(c.id)}" title="Mensajes sin leer"></span>
      ${c.status === 'pending' ? `<button class="btn sm gold" data-act="activate" data-id="${esc(c.id)}">Activar</button>` : c.status === 'active' && ps.k !== 'none' ? `<span class="badge ${ps.cls}">${esc(ps.short)}</span>` : statusBadge(c.status)}
      <span class="chev">›</span></div>`;
  };
  return shell('Clientes', `
    <div class="stats" style="grid-template-columns:repeat(3,1fr)">
      <div class="stat"><small>Activos</small><b>${active}</b></div>
      <div class="stat"><small>Entrenaron 7 días</small><b>${trained7}</b><i class="muted">de ${active}</i></div>
      <div class="stat"><small>Pagos fallidos</small><b class="${bills.some(b => payState(b).k === 'late') ? 'up' : ''}">${bills.filter(b => payState(b).k === 'late').length}</b></div>
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

/* ---------- Bienvenida (primera vez que entra un cliente) ---------- */
const WELCOME_DEFAULT = {
  title: '¡Hola, {nombre}!',
  body: 'Te doy la bienvenida a JPR Coach. Desde hoy tienes aquí todo lo que vamos a trabajar juntos.\n\nEn Entreno está tu plan. Cuando acabes cada sesión, apunta los kilos y las repeticiones de cada serie. Así vemos semana a semana cómo vas mejorando.\n\nEn Dieta tienes tu plan, con varias opciones en cada comida para que puedas ir cambiando.\n\nEn Hoy tienes el entreno que te toca y, una vez por semana, tu check-in: peso, medidas, cómo ha ido la semana y fotos cuando te toquen.\n\nSi tienes cualquier duda, escríbeme por Mensajes. Te contesto yo personalmente.\n\n¡Vamos a por ello!\nJulián',
};
async function welcomeText(){
  const st = await api.settings().catch(() => ({}));
  return {title: st.welcome_title ?? WELCOME_DEFAULT.title, body: st.welcome_body ?? WELCOME_DEFAULT.body, mode: st.welcome_mode === 'first' ? 'first' : 'always'};
}
const fillName = (t, name) => String(t || '').replace(/\{nombre\}/gi, firstName(name) || '');
function showWelcome({title, body}, name, onDone){
  const paras = String(body || '').split(/\n\s*\n/).map(p => `<p>${esc(p.trim()).replace(/\n/g, '<br>')}</p>`).join('');
  const w = document.createElement('div'); w.className = 'welcome'; w.setAttribute('role', 'dialog'); w.setAttribute('aria-modal', 'true');
  w.innerHTML = `<div class="welcome-in"><img class="welcome-logo" src="assets/logo-light.png" alt="JPR Coach">
    <h1>${esc(fillName(title, name))}</h1><div class="welcome-txt">${paras}</div>
    <button class="btn gold block" data-x="go">Empezar</button></div>`;
  document.body.appendChild(w);
  const b = w.querySelector('[data-x=go]'); b.focus();
  b.onclick = () => { w.classList.add('out'); setTimeout(() => w.remove(), 250); onDone && onDone(); };
}
const WKEY = id => 'jpr-welcomed-' + id;
async function maybeWelcome(){
  const me = S.me;
  if (document.querySelector('.welcome')) return;
  if (!me || me.role !== 'client' || me.status !== 'active') return;
  const txt = await welcomeText();
  if (txt.mode === 'first'){
    if (me.welcomed_at) return;
    try { if (localStorage.getItem(WKEY(me.id))) return; } catch(e){}
  }
  showWelcome(txt, me.full_name, async () => {
    try { localStorage.setItem(WKEY(me.id), '1'); } catch(e){}
    try { S.me = await api.updateProfile(me.id, {welcomed_at: new Date().toISOString()}, false) || S.me; localStorage.removeItem(WKEY(me.id)); } catch(e){}
  });
}

VIEWS.coachProfile = async () => { const wt = await welcomeText(); await refreshSettings(); return shell('Perfil', `
  <div class="card item"><div class="avatar lg">${esc(initials(S.me.full_name))}</div><div><h2>${esc(S.me.full_name)}</h2><div class="muted small">${esc(S.me.email || '')}</div><span class="badge navy">Coach</span></div></div>
  <div class="sec-title">Cómo te pagan</div>
  <form class="card stack" id="fPayCfg">
    <label class="f">Forma de pago<select class="in" name="mode">
      <option value="transfer" ${payCfg().mode === 'transfer' ? 'selected' : ''}>Transferencia bancaria</option>
      <option value="card" ${payCfg().mode === 'card' ? 'selected' : ''}>Tarjeta (Stripe)</option></select></label>
    <label class="f">Titular de la cuenta<input class="in" name="holder" value="${esc(payCfg().holder)}" placeholder="${esc(CFG.COACH_NAME)}" maxlength="80"></label>
    <label class="f">IBAN<input class="in" name="iban" value="${esc(payCfg().iban ? ibanFmt(payCfg().iban) : '')}" placeholder="ES00 0000 0000 0000 0000 0000" autocomplete="off" autocapitalize="characters" spellcheck="false"></label>
    <label class="f">Concepto que deben poner<input class="in" name="concept" value="${esc(payCfg().concept)}" maxlength="60"></label>
    <p class="tiny muted" style="margin:-4px 0 0">{nombre} se cambia por el nombre y apellidos de cada cliente. Con transferencia, tus clientes ven estos datos en lugar del botón de pagar con tarjeta, y tú apuntas cada pago en Pagos, en Pago a mano.</p>
    <button class="btn" type="submit">${icon('check')} Guardar</button>
  </form>
  <div class="sec-title">Check-in semanal</div>
  <form class="card stack" id="fCheckin">
    <label class="f">Día del check-in<select class="in" name="day">${[1,2,3,4,5,6,0].map(d => `<option value="${d}" ${checkinDow() === d ? 'selected' : ''}>${cap(DOW[d])}</option>`).join('')}</select></label>
    <div class="grid2"><label class="f">Aviso al móvil<select class="in" name="on"><option value="on" ${(S.settings || {}).checkin_reminder !== 'off' ? 'selected' : ''}>Activado</option><option value="off" ${(S.settings || {}).checkin_reminder === 'off' ? 'selected' : ''}>Desactivado</option></select></label>
      <label class="f">Hora del aviso<select class="in" name="hour">${[8,9,10,11,12,13,17,18,19,20,21].map(h => `<option value="${h}" ${String((S.settings || {}).checkin_hour || '10') === String(h) ? 'selected' : ''}>${h}:00</option>`).join('')}</select></label></div>
    <p class="tiny muted" style="margin:-4px 0 0">Ese día tus clientes ven en Hoy que les toca el check-in y les llega un aviso al móvil a esa hora (si han activado los avisos en su Perfil). Si 2 días después sigue pendiente, les llega un recordatorio. Quién lo hace cada 2 semanas se elige en la Ficha de cada cliente. Cuando lo envían, te llega un resumen a Mensajes.</p>
    <button class="btn" type="submit">${icon('check')} Guardar</button>
  </form>
  <div class="sec-title">Salud del iPhone</div>
  <form class="card stack" id="fHealthUrl">
    <label class="f">Enlace de iCloud del atajo JPR Salud<input class="in" name="url" type="url" value="${esc((S.settings || {}).health_shortcut_url || '')}" placeholder="https://www.icloud.com/shortcuts/..." autocomplete="off" spellcheck="false"></label>
    <p class="tiny muted" style="margin:-4px 0 0">Tus clientes lo instalan desde Perfil › Salud del iPhone, después de dar su permiso. Tú ves sus datos en la pestaña Salud de cada ficha.</p>
    <button class="btn" type="submit">${icon('check')} Guardar</button>
  </form>
  <div class="sec-title">Aviso de pasos</div>
  <form class="card stack" id="fSteps">
    <label class="f">Aviso diario<select class="in" name="on"><option value="on" ${(S.settings || {}).steps_reminder !== 'off' ? 'selected' : ''}>Activado</option><option value="off" ${(S.settings || {}).steps_reminder === 'off' ? 'selected' : ''}>Desactivado</option></select></label>
    <div class="grid2"><label class="f">Meta de pasos<input class="in" name="goal" type="number" inputmode="numeric" min="1000" max="50000" step="500" value="${esc((S.settings || {}).steps_goal || '10000')}"></label>
      <label class="f">Hora del aviso<select class="in" name="hour">${[17,18,19,20,21,22,23].map(h => `<option value="${h}" ${String((S.settings || {}).steps_hour || '21') === String(h) ? 'selected' : ''}>${h}:00</option>`).join('')}</select></label></div>
    <p class="tiny muted" style="margin:-4px 0 0">Cada día a esa hora (hora de España), los clientes con Salud conectada que no lleguen a la meta reciben un aviso en el móvil, si han activado los avisos en su Perfil. Se cuenta con los pasos del último envío del atajo.</p>
    <button class="btn" type="submit">${icon('check')} Guardar</button>
  </form>
  <div class="sec-title">Mensaje de bienvenida</div>
  <form class="card stack" id="fWelcome">
    <label class="f">Cuándo sale<select class="in" name="mode">
      <option value="always" ${wt.mode === 'always' ? 'selected' : ''}>Cada vez que abren la app</option>
      <option value="first" ${wt.mode === 'first' ? 'selected' : ''}>Solo la primera vez que entran</option></select></label>
    <p class="small muted" style="margin:0">Lo ven tus clientes con la cuenta activada. Escribe {nombre} y saldrá el nombre de cada uno.</p>
    <label class="f">Título<input class="in" name="title" maxlength="80" value="${esc(wt.title)}"></label>
    <label class="f">Texto<textarea class="in" name="body" rows="12" maxlength="3000">${esc(wt.body)}</textarea></label>
    <p class="tiny muted" style="margin:-4px 0 0">Deja una línea en blanco para separar párrafos.</p>
    <div class="grid2"><button class="btn light" type="button" data-act="welcomePreview">Ver cómo queda</button><button class="btn" type="submit">${icon('check')} Guardar</button></div>
  </form>
  <div class="stack" style="margin-top:14px">
    <button class="btn light block" data-act="privacy">Ver política de privacidad (borrador)</button>
    ${DEMO ? '<button class="btn light block" data-act="resetDemo">Reiniciar datos de la demo</button>' : ''}
    <button class="btn danger block" data-act="logout">${icon('logout')} Cerrar sesión</button>
    <p class="tiny muted center" style="margin-top:10px">Versión ${APP_VERSION}</p>
  </div>`, {sub: CFG.BRAND, tabs: coachTabs('coachProfile')}); };
VIEWS.coachProfile.mount = () => {
  const fp = $('#fPayCfg');
  if (fp) fp.onsubmit = async e => {
    e.preventDefault();
    const iban = ibanClean(fp.iban.value);
    if (iban && !ibanOk(iban)) return toast('Ese IBAN no es correcto. Revisa que no falte ni sobre ningún número.', 4000);
    if (fp.mode.value === 'transfer' && !iban) return toast('Para cobrar por transferencia, escribe tu IBAN', 3500);
    const b = fp.querySelector('[type=submit]'); b.disabled = true;
    try {
      await api.saveSetting('pay_mode', fp.mode.value); await api.saveSetting('pay_holder', fp.holder.value.trim());
      await api.saveSetting('pay_iban', iban); await api.saveSetting('pay_concept', fp.concept.value.trim() || '{nombre} - cuota');
      await refreshSettings(); fp.iban.value = iban ? ibanFmt(iban) : ''; toast('Forma de pago guardada');
    } catch(err){ toast(err.message); }
    b.disabled = false;
  };
  const fc = $('#fCheckin');
  if (fc) fc.onsubmit = async e => { e.preventDefault(); try { await api.saveSetting('checkin_day', fc.day.value); await api.saveSetting('checkin_reminder', fc.on.value); await api.saveSetting('checkin_hour', fc.hour.value); await refreshSettings(); toast('Check-in guardado'); } catch(err){ toast(err.message); } };
  const fh = $('#fHealthUrl');
  if (fh) fh.onsubmit = async e => {
    e.preventDefault(); const u = fh.url.value.trim();
    if (u && !/^https:\/\/(www\.)?icloud\.com\/shortcuts\//i.test(u)) return toast('Pega el enlace que da Atajos al compartir: empieza por https://www.icloud.com/shortcuts/', 4500);
    try { await api.saveSetting('health_shortcut_url', u); await refreshSettings(); toast('Enlace del atajo guardado'); } catch(err){ toast(err.message); }
  };
  const fs = $('#fSteps');
  if (fs) fs.onsubmit = async e => {
    e.preventDefault(); const g = parseInt(fs.goal.value, 10);
    if (!(g >= 1000 && g <= 50000)) return toast('Pon una meta entre 1.000 y 50.000 pasos');
    try { await api.saveSetting('steps_reminder', fs.on.value); await api.saveSetting('steps_goal', String(g)); await api.saveSetting('steps_hour', fs.hour.value); await refreshSettings(); toast('Aviso de pasos guardado'); } catch(err){ toast(err.message); }
  };
  const f = $('#fWelcome'); if (!f) return;
  f.onsubmit = async e => {
    e.preventDefault(); const b = f.querySelector('[type=submit]'); b.disabled = true;
    try {
      const title = f.title.value.trim() || WELCOME_DEFAULT.title, body = f.body.value.trim() || WELCOME_DEFAULT.body;
      await api.saveSetting('welcome_title', title); await api.saveSetting('welcome_body', body); await api.saveSetting('welcome_mode', f.mode.value);
      toast('Mensaje de bienvenida guardado');
    } catch(err){ toast(err.message); }
    b.disabled = false;
  };
};

/* ---------- Ficha de cliente (coach) ---------- */
async function loadClient(id){
  const [c, plans, nuts, logs, mets] = await Promise.all([api.profile(id), api.plans(id), api.nutrition(id), api.logs(id), api.metrics(id)]);
  return {c, plans, nuts, logs, mets};
}
VIEWS.client = async () => {
  const tab = S.p.tab || 'summary';
  const {c, plans, nuts, logs, mets} = await loadClient(S.p.id);
  const tabs = [['summary','Resumen'],['health','Salud'],['train','Entreno'],['food','Alimentación'],['progress','Progreso'],['chat','Mensajes'],['pay','Pagos'],['info','Ficha']];
  let body = '';
  if (tab === 'summary'){ const h = await healthData(c.id); body = summaryHTML(c, plans, nuts, logs, mets) + healthSummaryHTML(h.link, h.days); }
  if (tab === 'health'){ const h = await healthData(c.id); body = healthCoachHTML(c, h.link, h.days); }
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
  if (tab === 'pay'){
    const [b, pays] = await Promise.all([api.billing(c.id).catch(() => null), api.payments(c.id).catch(() => [])]);
    S.cache.billing = b; body = coachPayHTML(c, b, pays);
  }
  if (tab === 'info') body = clientInfoHTML(c, (await welcomeText()).mode);
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
      <div class="stat"><small>Peso actual</small><b>${cur ? fmtNum(cur.weight_kg) : '-'}</b>${cur ? '<i>kg</i>' : ''}${diff != null ? `<i class="${diff > 0 ? 'up' : diff < 0 ? 'down' : ''}">${diff === 0 ? '±0' : sign(diff)} kg</i>` : ''}</div>
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
function clientInfoHTML(c, wmode = 'always'){
  return `<form class="stack" id="fInfo">
    <label class="f">Nombre y apellidos<input class="in" name="full_name" value="${esc(c.full_name)}"></label>
    <div class="grid2"><label class="f">Teléfono<input class="in" name="phone" type="tel" value="${esc(c.phone)}"></label>
    <label class="f">Estado<select class="in" name="status">${[['pending','Pendiente'],['active','Activo'],['paused','En pausa']].map(([v,l]) => `<option value="${v}" ${c.status === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
    <div class="grid2"><label class="f">Fecha de nacimiento<input class="in" name="birth_date" type="date" value="${esc(c.birth_date)}"></label>
    <label class="f">Altura (cm)<input class="in" name="height_cm" inputmode="decimal" value="${esc(c.height_cm)}"></label></div>
    <label class="f">Objetivo<input class="in" name="goal" value="${esc(c.goal)}"></label>
    <label class="f">Check-in<select class="in" name="ck_every">${(() => { const f = ckFreqAll()[c.id], cur = f ? String(+f.every === 2 ? 2 : 1) : 'auto', r = ruleOf(c.id);
      return [['auto', `Según su plan (${r?.every === 2 ? 'cada 2 semanas' : 'cada semana'}${r?.photos ? `, fotos cada ${r.photos} semanas` : ''})`], ['1', `Cada semana (los ${DOW[checkinDow()]})`], ['2', `Cada 2 semanas (los ${DOW[checkinDow()]})`]].map(([v, l]) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${esc(l)}</option>`).join(''); })()}</select></label>
    <label class="f">Notas privadas (el cliente no las ve)<textarea class="in" name="notes">${esc(c.notes)}</textarea></label>
    <div class="small muted">Email: ${esc(c.email || '-')}. ${c.consent_at ? `Consentimiento aceptado el ${fmtDate(c.consent_at.slice(0,10), {day:'numeric', month:'long', year:'numeric'})}.` : 'Sin consentimiento registrado.'}</div>
    <button class="btn block" type="submit">Guardar ficha</button></form>
    <div class="card row between" style="margin-top:14px;gap:12px"><div class="grow"><b>Mensaje de bienvenida</b><div class="small muted">${wmode === 'always' ? 'Lo ve cada vez que abre la app. Puedes cambiarlo en tu Perfil.' : c.welcomed_at ? `Lo vio el ${esc(fmtDate(c.welcomed_at.slice(0,10), {day:'numeric', month:'long', year:'numeric'}))}.` : 'Lo verá la próxima vez que entre a la app.'}</div></div>
    ${wmode === 'first' && c.welcomed_at ? `<button class="btn sm light" data-act="welcomeReset" data-id="${esc(c.id)}">Mostrar otra vez</button>` : ''}</div>`;
}
VIEWS.client.mount = () => {
  const f = $('#fInfo');
  if (f) f.onsubmit = async e => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(f)); fd.height_cm = num(fd.height_cm);
    const ck = fd.ck_every; delete fd.ck_every;
    try {
      await api.updateProfile(S.p.id, fd, true);
      const f0 = ckFreqAll()[S.p.id], cur = f0 ? String(+f0.every === 2 ? 2 : 1) : 'auto';
      if (ck !== cur){
        await refreshSettings(); const all = ckFreqAll();
        if (ck === 'auto') delete all[S.p.id]; else if (ck === '2') all[S.p.id] = {every: 2, from: checkinWindow().start}; else all[S.p.id] = {every: 1};
        await api.saveSetting('checkin_freq', JSON.stringify(all)); await refreshSettings();
      }
      toast('Ficha guardada'); render();
    } catch(err){ toast(err.message); }
  };
  mountProgress();
  if (S.p.tab === 'chat') mountChat(S.p.id);
  if (S.p.tab === 'pay') mountCoachPay(S.p.id);
  if (S.p.tab === 'health') mountHealthLive(S.p.id, true);
};

/* ---------- Importar plan desde PDF: reglas de lectura ---------- */
function parsePlanLines(lines, fileName = ''){
  const SPEC = /(\d{1,2})\s*[x×]\s*(\d{1,3}(?:\s*-\s*\d{1,3}|\+\d{1,3})?)(\s*(?:s|seg|segundos)\b|\s*["”″]|\s*min\b)?(\s+por\s+(?:pierna|brazo|lado))?/gi;
  const URL_RE = /https?:\/\/\S+/gi;
  const cap1 = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  const sentence = s => cap1(String(s).toLowerCase());
  const clean = s => String(s || '').replace(/\bV[ií]deo(\s*\d)?\b/gi, '').replace(URL_RE, '').replace(/\s*\|\s*/g, ' ').replace(/^[\s:,.+·|-]+|[\s:,+·|-]+$/g, '').replace(/\s{2,}/g, ' ').trim();
  const out = {name: '', notes: [], days: [], skipped: []};
  let day = null, mode = 'intro', section = '', pending = null, rest = '', lastEx = null;
  const dayNote = t => { if (day && t && !day.notes.includes(t)) day.notes.push(t); };
  for (const L of lines){
    const raw = (L.t || '').trim(); if (!raw) continue;
    const links = L.links || [];
    // Título del plan
    if (!out.name && !day && /semanas|bloque/i.test(raw) && raw.length < 90 && !/^[●•\d]/.test(raw)) out.name = clean(raw.replace(/^.*?·\s*/, '')) || '';
    // Encabezado de día
    const dm = raw.replace(/^[◆♦]\s*/, '').match(/^D[IÍ]A\s*(\d+)\s*[·.:\-]*\s*[·.:\-]*\s*(.*)$/i);
    if (dm){
      const rest0 = dm[2].replace(/^[·.:\-\s]+/, '').trim();
      day = {name: `Día ${dm[1]}${rest0 ? ': ' + sentence(rest0) : ''}`, exercises: [], notes: []};
      out.days.push(day); mode = 'main'; section = ''; pending = null; rest = ''; lastEx = null; continue;
    }
    if (/^◆|^♦/.test(raw)){
      const h = raw.replace(/^[◆♦]\s*/, '');
      if (/PROGRESI|PAUTAS Y NOTAS|SEGUIMIENTO/i.test(h) && day){ day = null; mode = 'end'; continue; }
      if (!day){ mode = /C[OÓ]MO ENTRENAR/i.test(h) ? 'howto' : 'intro'; continue; }
      if (/CALENTAMIENTO|ACTIVACI|MOVILIDAD/i.test(h)){ mode = 'warm'; continue; }
      section = /CARDIO/i.test(h) ? 'Cardio' : /CORE|ABDOMEN/i.test(h) ? 'Core' : '';
      mode = 'main';
      const rir = h.match(/RIR\s*(\d)\s*(EN TODAS LAS SERIES)?/i);
      if (rir){ const t = `RIR ${rir[1]}${rir[2] ? ' en todas las series' : ''}`; dayNote(t); }
      pending = null; continue;
    }
    if (!day){
      if (mode === 'howto' && /^[●•]/.test(raw)) out.notes.push(raw.replace(/^[●•]\s*/, ''));
      else if (mode === 'howto' && out.notes.length) out.notes[out.notes.length - 1] += ' ' + raw;
      else if (mode === 'intro' && /RIR\s*\d/i.test(raw) && /semana/i.test(raw) && raw.length < 120) out.notes.push(raw);
      continue;
    }
    const dr = raw.match(/^DESCANSOS?[^:]*:\s*(.+)$/i);
    if (dr){ rest = dr[1].replace(/aprox\.?/i, '').replace(/[’]/g, "'").trim(); continue; }
    if (mode === 'warm') continue;
    // Solo un enlace: es el vídeo del ejercicio anterior
    if (/^https?:\/\/\S+$/i.test(raw)){ if (lastEx) lastEx.video.push(raw); continue; }
    let cells = raw.split(/\s*\|\s*/);
    if (/^(calent|activaci|movilidad|fase\b)/i.test(cells[0])) continue;
    if (/^(ejercicio|orden)\b/i.test(cells[0]) || (/protocolo|series\/reps|series y repeticiones/i.test(raw) && !SPEC.test(raw))){ SPEC.lastIndex = 0; continue; }
    SPEC.lastIndex = 0;
    let ss = false;
    const om = cells[0].match(/^(\d{1,2})\s*(\(SS\))?$/i);
    if (om){ ss = !!om[2]; cells = cells.slice(1); }
    if (/^opcional$/i.test(cells[0])){ dayNote('Opcional: ' + clean(cells.slice(1).join(' '))); continue; }
    const text = cells.join(' | ');
    const matches = [...text.matchAll(SPEC)];
    const urls = [...links, ...(text.match(URL_RE) || [])].filter((u, i, a) => a.indexOf(u) === i);
    if (!matches.length){
      const t = clean(text);
      if (!t) continue;
      if (section && /^\d/.test(t) && t.length <= 90) dayNote(`${section}: ${text.split(/\s*\|\s*/).map(clean).filter(Boolean).join('. ')}`);
      else pending = t;
      continue;
    }
    // Agrupa las series: "2x12 2x10" es un ejercicio; "A 3x12 + B 3x15" son dos
    const exs = []; let pos = 0;
    for (const m of matches){
      let name = clean(text.slice(pos, m.index));
      if (!name && !exs.length && pending){ name = pending; }
      const g = {n: +m[1], r: m[2].replace(/\s+/g, ''), u: (m[3] || '').trim().replace(/["”″]/, 's').replace(/^seg(undos)?$/, 's'), por: (m[4] || '').trim()};
      if (!name && exs.length) exs.at(-1).groups.push(g);
      else exs.push({name, groups: [g], tail: ''});
      pos = m.index + m[0].length;
    }
    pending = null;
    exs.at(-1).tail = text.slice(pos);
    const rir = (text.match(/RIR\s*(\d\+?)/i) || [])[1];
    const kg = (text.match(/(\d+(?:[.,]\d+)?)\s*kg\b/i) || [])[1];
    const made = exs.map((e, i) => {
      let name = e.name || 'Ejercicio';
      let note = '';
      const cm = name.match(/^(.{3,}?),\s+((?:con|sin|en|a|al)\s.+)$/i);
      if (cm){ name = cm[1]; note = cap1(cm[2]); }
      const per = []; e.groups.forEach(g => { for (let k = 0; k < g.n; k++) per.push(g.r); });
      const u = e.groups[0].u, por = e.groups[0].por;
      const same = per.every(r => r === per[0]);
      const reps = (same ? per[0] : per.join('/')) + (u ? ' ' + u : '') + (por ? ' ' + por : '');
      const tail = e.tail.replace(/RIR\s*\d\+?/gi, '').replace(/(\d+(?:[.,]\d+)?)\s*kg\b/i, '').split(/\s*\|\s*/).map(clean).filter(Boolean).map(cap1).join('. ');
      const notes = [note, rir ? `RIR ${rir}` : '', tail, ss ? `Superserie con ${exs.filter((_, j) => j !== i).map(x => x.name.toLowerCase()).join(' y ')}` : ''].filter(Boolean).join('. ');
      return {name: cap1(name.replace(/\s*:$/, '')), sets: String(per.length), reps, rest, load: kg ? kg.replace('.', ',') + ' kg' : '', notes, video: []};
    });
    // Enlaces: uno por ejercicio si cuadran; si no, todos al primero
    if (urls.length){ if (urls.length === made.length) made.forEach((x, i) => x.video.push(urls[i])); else made[0].video.push(...urls); }
    day.exercises.push(...made); lastEx = made.at(-1);
  }
  out.days = out.days.filter(d => d.exercises.length || d.notes.length);
  out.days.forEach(d => d.exercises.forEach(x => { x.video = x.video.join(' '); }));
  out.notes = out.notes.join('\n');
  if (!out.name) out.name = clean(fileName.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ')) || 'Plan de entrenamiento';
  return out;
}

let _pdfjs = null;
async function loadPdfjs(){
  if (!_pdfjs){
    _pdfjs = await import(new URL('vendor/pdf.min.mjs', location.href).href);
    _pdfjs.GlobalWorkerOptions.workerSrc = new URL('vendor/pdf.worker.min.mjs', location.href).href;
  }
  return _pdfjs;
}
// Saca las líneas del PDF (con " | " entre columnas) y los enlaces de cada línea
async function pdfLines(data){
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({data, isEvalSupported: false}).promise;
  const out = [];
  for (let pn = 1; pn <= doc.numPages; pn++){
    const pg = await doc.getPage(pn);
    const tc = await pg.getTextContent();
    const items = tc.items.filter(it => it.str && it.str.trim()).map(it => ({s: it.str, x: it.transform[4], y: it.transform[5], w: it.width, h: Math.abs(it.transform[3]) || 10}));
    const anns = (await pg.getAnnotations().catch(() => [])).filter(a => a.subtype === 'Link' && a.url).map(a => ({url: a.url, x: a.rect[0], y1: Math.min(a.rect[1], a.rect[3]), y2: Math.max(a.rect[1], a.rect[3])}));
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    const rows = [];
    for (const it of items){
      const r = rows.find(r => Math.abs(r.y - it.y) < Math.max(2.5, it.h * 0.35));
      if (r) r.items.push(it); else rows.push({y: it.y, h: it.h, items: [it]});
    }
    rows.sort((a, b) => b.y - a.y);
    for (const r of rows){
      r.items.sort((a, b) => a.x - b.x);
      let txt = '', end = null;
      for (const it of r.items){
        if (end != null){ const gap = it.x - end; txt += gap > Math.max(14, it.h * 1.4) ? ' | ' : (gap > 0.5 && !/\s$/.test(txt) && !/^\s/.test(it.s) ? ' ' : ''); }
        txt += it.s; end = it.x + it.w;
      }
      const links = anns.filter(a => r.y >= a.y1 - 3 && r.y <= a.y2 + 3).sort((a, b) => a.x - b.x).map(a => a.url);
      out.push({t: txt.replace(/\s+/g, ' ').trim(), links});
    }
  }
  return out;
}
async function planFromPdf(data, fileName){
  const imp = parsePlanLines(await pdfLines(data), fileName);
  imp.nDays = imp.days.filter(d => d.exercises.length).length;
  imp.nEx = imp.days.reduce((a, d) => a + d.exercises.length, 0);
  return imp;
}
async function offerImport(imp, cid, src){
  if (!imp.nEx){ toast('No he encontrado ejercicios con series en este PDF. Puedes crear el plan a mano.', 5000); return; }
  const ok = await confirmBox('He leído el plan del PDF', `Tiene ${imp.nDays} ${imp.nDays === 1 ? 'día' : 'días'} y ${imp.nEx} ejercicios. ¿Quieres revisarlo y crear con él el plan de entreno de la app?`, 'Revisar plan');
  if (ok) go('planEdit', {clientId: cid, imported: imp, src});
}

/* ---------- Editor de plan de entreno ---------- */
const blankEx = () => ({name:'', sets:'3', reps:'10', rir:'', rest:'90 s', load:'', notes:''});
VIEWS.planEdit = async () => {
  if (!S.draft){
    if (S.p.planId){ const plans = await api.plans(S.p.clientId); S.draft = clone(plans.find(p => p.id === S.p.planId)); }
    else if (S.p.imported){ const im = S.p.imported; S.draft = {id: null, client_id: S.p.clientId, name: im.name, notes: im.notes || '', active: true,
      days: im.days.map(d => ({name: d.name, notes: (d.notes || []).join('\n'), exercises: d.exercises.length ? d.exercises : [blankEx()]}))}; }
    else S.draft = {id: null, client_id: S.p.clientId, name: 'Bloque 1', notes: '', active: true, days: [{name: 'Día A', exercises: [blankEx()]}]};
  }
  const p = S.draft;
  return shell(S.p.planId ? 'Editar plan' : 'Nuevo plan', `
    ${S.p.imported ? `<div class="card cream small" style="margin-bottom:14px"><b>Plan leído del PDF${S.p.src ? ` «${esc(S.p.src.replace(/\.pdf$/i, ''))}»` : ''}</b><br>Revisa los ejercicios, las series y las repeticiones antes de guardar. Los calentamientos y la movilidad no se pasan al plan, y el cardio y el core sin series quedan como notas del día. Al guardar, este pasa a ser el plan activo de tu cliente.</div>` : ''}
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
            <div class="grid4" style="grid-template-columns:.7fr 1.5fr .7fr 1fr 1fr">
              ${[['sets','Series'],['reps','Reps'],['rir','RIR'],['rest','Descanso'],['load','Carga']].map(([k,l]) => `<div><div class="lbl">${l}</div><input class="in" data-path="days.${di}.exercises.${xi}.${k}" value="${esc(x[k])}"></div>`).join('')}
            </div>
            <input class="in" data-path="days.${di}.exercises.${xi}.notes" value="${esc(x.notes)}" placeholder="${esc(exTip(x.name) ? 'Explicación automática: ' + exTip(x.name) : 'Notas de técnica (opcional)')}" style="font-size:14px;padding:9px 10px">
            <input class="in" type="url" data-path="days.${di}.exercises.${xi}.video" value="${esc(x.video || '')}" placeholder="Enlace del vídeo (opcional)" style="font-size:14px;padding:9px 10px;margin-top:6px">
          </div>`).join('')}
        <textarea class="in" data-path="days.${di}.notes" rows="2" placeholder="Notas del día: cardio, core, avisos (opcional)" style="font-size:14px;margin:8px 0 0">${esc(d.notes || '')}</textarea>
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
  const [{plan, logs}, docs, bill] = await Promise.all([myData(), api.docs(S.me.id).catch(() => []), api.billing(S.me.id).catch(() => null)]);
  const durls = await api.fileUrls(docs.map(d => d.path)).catch(() => ({}));
  const docBlock = docsHTML(docs, durls, 'entreno', false);
  const hello = `<div style="margin-bottom:6px"><h1>Hola, ${esc(firstName(S.me.full_name))}</h1><p class="muted small" style="margin:2px 0 0">${logs[0] ? `Tu último entreno fue ${relDate(logs[0].date)}.` : '¡A por el primer entreno!'}</p></div>` + payBanner(bill);
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
      return `<div class="card dcard ${i === nextIdx ? 'next' : ''}">
        <div class="dhead"><h3>${esc(d.name)}</h3>${i === nextIdx ? '<span class="badge tt">Te toca</span>' : ''}</div><div class="dbody">
        <div class="small muted">${d.exercises.length} ejercicios. ${last ? `Último: ${relDate(last.date)}` : 'Sin hacer todavía'}</div>
        <div class="target">${d.exercises.slice(0, 4).map(x => `<span class="chip">${esc(x.name || 'Ejercicio')}</span>`).join('')}${d.exercises.length > 4 ? `<span class="chip">+${d.exercises.length - 4}</span>` : ''}</div>
        <details class="exlist"><summary>Ver ejercicios, vídeos y cómo se hacen</summary>${d.exercises.map(x => `<div class="exrow">
          <div class="row between" style="gap:8px;align-items:flex-start"><b>${esc(x.name || 'Ejercicio')}</b><span class="tiny muted" style="white-space:nowrap">${[x.sets && `${esc(x.sets)} x ${esc(x.reps || '-')}`, x.rir && `RIR ${esc(x.rir)}`, restOf(x, d.name) && `desc. ${mmss(restOf(x, d.name))}`].filter(Boolean).join(' · ')}</span></div>
          ${exTip(x.name) ? `<div class="extip">${esc(exTip(x.name))}</div>` : ''}
          ${coachNote(x) ? `<div class="exnote"><b>Nota del coach:</b> ${esc(coachNote(x))}</div>` : ''}
          ${x.video ? `<div class="vids">${videoLinks(x.video, x.name)}</div>` : ''}</div>`).join('')}</details>
        <button class="btn block ${i === nextIdx ? 'gold' : 'light'}" style="margin-top:10px" data-act="startDay" data-d="${i}" data-notes="${esc(d.notes || '')}">${icon('play', true)} Empezar</button>
      </div></div>`; }).join('')}</div>
    ${docBlock}
    <div class="sec-title">Historial</div>${logsListHTML(logs.slice(0, 6))}
  `, {tabs: clientTabs('train'), sub: CFG.BRAND});
};

/* ---------- Hoy (pantalla de inicio del cliente) ---------- */
VIEWS.today = async () => {
  const [{plan, logs, mets}, bill, h] = await Promise.all([myData(), api.billing(S.me.id).catch(() => null), healthData(S.me.id).catch(() => ({})), refreshSettings()]);
  if (bill) S.myRule = planRule(bill.plan_name);
  const tr = trainingOn();
  const ws = mets.filter(m => m.weight_kg != null), cur = ws.at(-1), first = ws[0];
  const diff = cur && first && ws.length > 1 ? num(cur.weight_kg) - num(first.weight_kg) : null;
  const n7 = logs.filter(l => daysAgo(l.date) < 7).length;
  const w = checkinWindow(S.me.id), ck = checkinOf(mets, w);
  const ckCard = ck
    ? `<div class="card ck ok"><span class="mini">${icon('check')}</span><div class="grow"><b>Check-in enviado</b><div class="small muted">${esc(cap(fmtDate(ck.date, {weekday:'long', day:'numeric', month:'long'})))}. El siguiente es el ${esc(fmtDate(w.next, {weekday:'long', day:'numeric', month:'long'}))}.</div></div></div>`
    : `<div class="card ck due"><div class="row between" style="gap:10px"><div><b>${w.dueToday ? 'Hoy toca tu check-in' : `Check-in pendiente desde el ${esc(w.day)}`}</b>
        <div class="small muted">Peso, medidas, cómo ha ido la semana y fotos si te tocan. 3 minutos.</div></div><span class="mini">${icon('scale')}</span></div>
        <button class="btn gold block" style="margin-top:12px" data-act="checkinNew">Hacer check-in</button></div>`;
  let trainCard;
  if (!plan) trainCard = empty('Todavía no tienes plan', `${firstName(CFG.COACH_NAME) || 'Tu coach'} te lo preparará pronto.`);
  else {
    const lastDay = logs.find(l => l.plan_id === plan.id)?.day_name;
    const i = lastDay ? (plan.days.findIndex(d => d.name === lastDay) + 1) % plan.days.length : 0, d = plan.days[i];
    const doneToday = logs.some(l => l.date === today());
    trainCard = `<div class="card dcard next"><div class="dhead"><h3>${esc(d.name)}</h3><span class="badge tt">${doneToday ? 'El siguiente' : 'Te toca'}</span></div><div class="dbody">
      <div class="small muted">${d.exercises.length} ejercicios${doneToday ? '. Hoy ya has entrenado: ¡bien hecho!' : ''}</div>
      <div class="target">${d.exercises.slice(0, 4).map(x => `<span class="chip">${esc(x.name || 'Ejercicio')}</span>`).join('')}${d.exercises.length > 4 ? `<span class="chip">+${d.exercises.length - 4}</span>` : ''}</div>
      <button class="btn block gold" style="margin-top:10px" data-act="startDay" data-d="${i}" data-notes="${esc(d.notes || '')}">${icon('play', true)} Empezar entreno</button></div></div>`;
  }
  const hd = (h.days || []).find(x => x.day === today());
  const goal = parseInt((S.settings || {}).steps_goal, 10) || 10000;
  const steps = h.link && hd?.steps != null ? `<div class="card item"><span class="mini ic-health">${icon('heart')}</span><div class="grow"><b>${fmtNum(hd.steps, 0)} pasos hoy</b>
      <div class="bar"><i style="width:${Math.min(100, Math.round(hd.steps / goal * 100))}%"></i></div><div class="tiny muted">Meta: ${fmtNum(goal, 0)}</div></div></div>` : '';
  return shell('Hoy', `
    <div style="margin-bottom:10px"><h1>Hola, ${esc(firstName(S.me.full_name))}</h1>
      ${S.me.goal ? `<p class="small" style="margin:4px 0 0"><span class="muted">Tu objetivo:</span> <b>${esc(S.me.goal)}</b></p>` : ''}</div>
    ${payBanner(bill)}
    <div class="stats" ${tr ? '' : 'style="grid-template-columns:1fr 1fr"'}>
      <div class="stat"><small>Peso actual</small><b>${cur ? fmtNum(num(cur.weight_kg)) : '-'}</b>${cur ? '<i>kg</i>' : ''}</div>
      <div class="stat"><small>Desde el inicio</small><b class="${diff ? (diff > 0 ? 'up' : 'down') : ''}" style="font-size:30px">${diff == null ? '-' : diff === 0 ? '±0' : sign(diff)}</b>${diff == null ? '' : '<i>kg</i>'}</div>
      ${tr ? `<div class="stat"><small>Entrenos esta semana</small><b>${n7}</b></div>` : ''}
    </div>
    <div class="sec-title">${w.every === 2 ? 'Check-in cada 2 semanas' : 'Check-in semanal'}</div>${ckCard}
    ${tr ? `<div class="sec-title">Entreno de hoy</div>${trainCard}` : ''}
    ${tr && plan ? `<button class="btn light block" style="margin-top:10px" data-act="tab" data-v="train">Ver todo el plan</button>` : ''}
    ${steps ? `<div class="sec-title">Actividad</div>${steps}` : ''}
  `, {tabs: clientTabs('today'), sub: CFG.BRAND});
};

/* ---------- Check-in semanal (cliente) ---------- */
VIEWS.checkin = async () => {
  if (!S.draft){
    const {mets, logs} = await myData();
    const prev = [...mets].reverse().find(m => m.weight_kg != null) || null;
    S.draft = {id: uid(), client_id: S.me.id, date: today(), weight_kg:'', waist_cm:'', hip_cm:'', body_fat:'', visceral_fat:'', muscle_kg:'', chest_cm:'', arm_cm:'', thigh_cm:'',
      sleep:null, stress:null, energy:null, diet:null, comment:'', _prev: prev, _n7: logs.filter(l => daysAgo(l.date) < 7).length};
    S.ckPhotos = {};
  }
  const m = S.draft, prev = m._prev;
  const lastPhoto = (await api.photos(S.me.id).catch(() => []))[0]?.date;
  const pw = ruleOf(S.me.id)?.photos || 2, photosDue = !lastPhoto || daysAgo(lastPhoto) >= pw * 7 - 3;
  const scale = (k, l) => `<div><div class="small muted" style="margin-bottom:6px">${l}</div><div class="scale">${[1,2,3,4,5].map(v => `<button class="${m[k] === v ? 'on' : ''}" data-act="mscale" data-k="${k}" data-v="${v}">${v}</button>`).join('')}</div></div>`;
  const f = (k, l, u, ph = '') => `<label class="f">${l}${u ? ` (${u})` : ''}<input class="in" inputmode="decimal" data-path="${k}" value="${esc(m[k])}" placeholder="${esc(ph)}"></label>`;
  const step = (n, t) => `<div class="ck-step"><span>${n}</span>${t}</div>`;
  return shell('Check-in semanal', `
    <p class="small" style="margin:0 2px 12px">Pésate en ayunas, después de ir al baño. Mide la cintura a la altura del ombligo.</p>
    ${step(1, 'Peso y medidas')}
    <div class="card stack">
      <div class="grid2">${f('weight_kg', 'Peso', 'kg', prev ? fmtNum(num(prev.weight_kg)) : '')}${f('waist_cm', 'Cintura', 'cm', prev?.waist_cm != null ? fmtNum(num(prev.waist_cm)) : '')}</div>
      ${f('hip_cm', 'Cadera', 'cm', prev?.hip_cm != null ? fmtNum(num(prev.hip_cm)) : '')}
      ${prev ? `<p class="tiny muted" style="margin:-4px 0 0">En gris, lo que apuntaste la última vez (${esc(relDate(prev.date))}).</p>` : ''}
      <details><summary class="small">Más medidas (báscula de bioimpedancia, perímetros)</summary>
        <div class="stack" style="margin-top:10px"><div class="grid3">${f('body_fat','Grasa','%')}${f('visceral_fat','Visceral','nivel')}${f('muscle_kg','Músculo','kg')}</div>
        <div class="grid3">${f('chest_cm','Pecho','cm')}${f('arm_cm','Brazo','cm')}${f('thigh_cm','Muslo','cm')}</div></div></details>
    </div>
    ${step(2, 'Cómo ha ido la semana')}
    <div class="card stack">
      ${trainingOn() ? `<p class="small" style="margin:0">Entrenos en los últimos 7 días: <b>${m._n7}</b></p>` : ''}
      ${scale('diet', 'Dieta: 1 casi nada, 5 la he clavado')}
      ${scale('sleep', 'Sueño: 1 fatal, 5 genial')}
      ${scale('stress', 'Estrés: 1 nada, 5 mucho')}
      ${scale('energy', 'Energía: 1 sin fuerzas, 5 a tope')}
    </div>
    ${step(3, `Fotos ${photosDue ? '<em class="badge gold" style="font-style:normal">Te tocan</em>' : '<small class="muted">(opcional esta semana)</small>'}`)}
    <div class="card"><p class="small muted" style="margin:0 0 10px">${photosDue ? 'Frente, espalda y perfil. Misma luz, misma ropa y a la misma hora que las anteriores.' : `Tus últimas fotos son de ${esc(relDate(lastPhoto))}. Las siguientes, cuando pasen ${pw} semanas.`}</p>
      <div class="grid3">${['frente','espalda','perfil'].map(p => `<label class="upl"><input type="file" accept="image/*" data-pose="${p}" hidden><span class="upl-box ${S.ckPhotos[p] ? 'has' : ''}" data-prev="${p}" ${S.ckPhotos[p] ? `style="background-image:url('${URL.createObjectURL(S.ckPhotos[p])}')"` : ''}>${icon('camera')}<b>${cap(p)}</b><small>Toca aquí</small></span></label>`).join('')}</div></div>
    ${step(4, 'Para tu coach')}
    <label class="f"><textarea class="in" rows="4" data-path="comment" placeholder="Qué tal la semana, dudas, molestias, comidas fuera...">${esc(m.comment)}</textarea></label>
    <button class="btn gold block" style="margin-top:14px" data-act="checkinSave">${icon('send')} Enviar check-in</button>
    <p class="tiny muted center">${esc(firstName(CFG.COACH_NAME) || 'Tu coach')} lo recibe en Mensajes con un resumen.</p>
  `, {backBtn: true, sub: 'Seguimiento'});
};
VIEWS.checkin.mount = () => {
  bindDraft();
  document.querySelectorAll('.upl input[type=file]').forEach(inp => inp.onchange = () => {
    const f = inp.files[0]; if (!f) return; S.ckPhotos[inp.dataset.pose] = f;
    const box = document.querySelector(`[data-prev="${inp.dataset.pose}"]`); box.style.backgroundImage = `url("${URL.createObjectURL(f)}")`; box.classList.add('has');
  });
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
        return {exercise: x.name, _target: x, _last: last, sets: Array.from({length: n}, (_, i) => ({reps: '', kg: '', rir: '', _ph: last?.sets[i] || last?.sets.at(-1) || {}, _prev: last?.sets[i] || null, _i: i, _done: false}))};
      })};
  }
  const s = S.draft;
  const dayNotes = S.p.dayNotes || '';
  return shell(s.day_name, `
    ${dayNotes ? `<div class="card cream small" style="margin-bottom:10px">${esc(dayNotes).replace(/\n/g, '<br>')}</div>` : ''}
    <label class="f" style="margin-bottom:10px">Fecha<input class="in" type="date" data-path="date" value="${esc(s.date)}"></label>
    <div class="stack">${s.entries.map((e, ei) => {
      const t = e._target || {};
      return `<div class="exs">
        <div class="exs-head"><b>${esc(e.exercise)}</b>
          <div class="target">${t.sets ? `<span class="chip">${esc(t.sets)} series</span>` : ''}${t.reps ? `<span class="chip">${esc(t.reps)}${/^\d+(\s*[-/]\s*\d+)*$/.test(String(t.reps).trim()) ? ' reps' : ''}</span>` : ''}${t.rir ? `<span class="chip">RIR ${esc(t.rir)}</span>` : ''}${restOf(t, s.day_name) ? `<span class="chip rest">${icon('clock')} Descanso ${mmss(restOf(t, s.day_name))}</span>` : t.rest ? `<span class="chip">${esc(t.rest)}</span>` : ''}${t.load ? `<span class="chip gold">${esc(t.load)}</span>` : ''}</div>
          ${exTip(e.exercise) ? `<div class="extip">${esc(exTip(e.exercise))}</div>` : ''}
          ${coachNote(t) ? `<div class="exnote"><b>Nota del coach:</b> ${esc(coachNote(t))}</div>` : ''}
          ${t.video ? `<div class="vids">${videoLinks(t.video, e.exercise)}</div>` : ''}
          ${e._last ? `<div class="tiny muted" style="margin-top:4px">"Anterior" es lo que hiciste ${esc(relDate(e._last.date))}.</div>` : ''}
        </div>
        <div class="set-head"><span>Serie</span><span>Anterior</span><span>Kg</span><span>Reps</span><span>RIR</span><span></span></div>
        ${e.sets.map((st, si) => `<div class="set ${st._done ? 'done' : ''}" data-set="${ei}.${si}">
          <span class="n">${si + 1}</span>
          <span class="prev">${st._prev && (st._prev.kg || st._prev.reps) ? `${esc(st._prev.kg || '-')}<i>×</i>${esc(st._prev.reps || '-')}${st._prev.rir !== undefined && st._prev.rir !== '' ? `<em>RIR ${esc(st._prev.rir)}</em>` : ''}` : '-'}</span>
          <input class="in" inputmode="decimal" data-path="entries.${ei}.sets.${si}.kg" value="${esc(st.kg)}" placeholder="${esc(st._ph.kg || (t.load && parseFloat(t.load)) || '')}">
          <input class="in" inputmode="numeric" data-path="entries.${ei}.sets.${si}.reps" value="${esc(st.reps)}" placeholder="${esc(st._ph.reps || repsFor(t, si))}">
          <input class="in rir" inputmode="numeric" data-path="entries.${ei}.sets.${si}.rir" value="${esc(st.rir ?? '')}" placeholder="${esc(t.rir || st._ph.rir || '')}">
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
    <p class="tiny muted center">Marca cada serie con el check al terminarla: se rellena con lo que aparece en gris si no lo has cambiado y empieza a contar el descanso. RIR: repeticiones que te quedaban en reserva.</p>`, {backBtn: true, sub: 'Entreno de hoy'});
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
  const MET = [['weight_kg','Peso','kg'],['waist_cm','Cintura','cm'],['hip_cm','Cadera','cm'],['body_fat','% grasa','%'],['visceral_fat','Visceral',''],['muscle_kg','Músculo','kg']];
  const mPts = mets.filter(m => m[metric] != null).map(m => ({x: m.date, y: num(m[metric])}));
  return `
    ${asCoach ? '' : `<button class="btn gold block" data-act="metricNew">${icon('scale')} Registrar medidas de hoy</button>`}
    <div class="sec-title">Medidas</div>
    <div class="card">
      <div class="seg" style="margin-bottom:8px">${MET.map(([k,l]) => `<button class="${metric === k ? 'on' : ''}" data-act="pmetric" data-v="${k}">${l}</button>`).join('')}</div>
      ${lineChart(mPts)}
      ${mPts.length ? `<div class="row between small"><span class="muted">Primero: ${fmtNum(mPts[0].y)}</span><b>Ahora: ${fmtNum(mPts.at(-1).y)} ${MET.find(m => m[0] === metric)[2]}</b><span class="${mPts.at(-1).y - mPts[0].y > 0 ? 'up' : 'down'}">${mPts.length > 1 ? (mPts.at(-1).y - mPts[0].y > 0 ? '+' : '') + fmtNum(mPts.at(-1).y - mPts[0].y) : ''}</span></div>` : ''}
    </div>
    ${mets.length ? `<div class="tbl-wrap" style="margin-top:10px"><table class="tbl"><thead><tr><th>Fecha</th><th>Peso</th><th>Cint.</th><th>Cad.</th><th>Grasa</th><th>Visc.</th><th>Músc.</th><th>S/E/E</th><th></th></tr></thead><tbody>
      ${mets.slice().reverse().slice(0, 12).map(m => `<tr><td>${fmtDate(m.date)}${m._pending ? ' <span class="badge warn">pendiente</span>' : ''}</td><td>${fmtNum(m.weight_kg)}</td><td>${fmtNum(m.waist_cm)}</td><td>${fmtNum(m.hip_cm)}</td><td>${fmtNum(m.body_fat)}</td><td>${fmtNum(m.visceral_fat)}</td><td>${fmtNum(m.muscle_kg)}</td><td>${[m.sleep, m.stress, m.energy].map(v => v ?? '-').join('/')}</td>
      <td>${m._pending ? '' : `<button class="mini bad" data-act="delMetric" data-id="${esc(m.id)}" aria-label="Borrar">${icon('trash')}</button>`}</td></tr>`).join('')}</tbody></table></div>
      <p class="tiny muted">S/E/E: sueño, estrés y energía del 1 al 5.</p>` : ''}
    ${mets.length ? `<div class="sec-title">${asCoach ? 'Su cuerpo' : 'Tu cuerpo'}: inicio y ahora</div>${bodyTableHTML(mets, c)}` : ''}
    ${weeklyHTML(logs, mets)}
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
  document.querySelectorAll('.tbl.prog').forEach(t => { t.parentElement.scrollLeft = t.parentElement.scrollWidth; });
  const s = $('#exSel'); if (s) s.onchange = () => { S.p.ex = s.value; render(); };
}
function logsListHTML(logs, canDelete = false){
  if (!logs.length) return empty('Sin entrenos registrados', 'Aparecerán aquí en cuanto se guarde el primero.');
  return `<div class="list">${logs.map(l => `
    <details class="card"><summary class="row between" style="cursor:pointer;list-style:none">
      <div class="grow"><b>${esc(l.day_name || 'Entreno')}</b>${l._pending ? ' <span class="badge warn">pendiente</span>' : ''}<div class="small muted">${fmtDate(l.date, {weekday:'short', day:'numeric', month:'short'})}${l.rpe ? `, RPE ${esc(l.rpe)}` : ''}, ${fmtNum(volume(l) / 1000, 1)} t</div></div><span class="chev">›</span></summary>
      <div style="margin-top:10px" class="small">${(l.entries || []).map(e => `<div style="margin:6px 0"><b>${esc(e.exercise)}</b>: ${(e.sets || []).map(s => `${esc(s.kg || '-')} kg x ${esc(s.reps || '-')}${s.rir !== undefined && s.rir !== '' ? ` (RIR ${esc(s.rir)})` : ''}`).join(', ')}</div>`).join('')}
      ${l.notes ? `<div class="card cream" style="margin-top:8px;padding:10px">${esc(l.notes)}</div>` : ''}
      <div class="row" style="margin-top:8px;gap:8px;flex-wrap:wrap"><button class="btn sm" data-act="logSummary" data-id="${esc(l.id)}" data-cid="${esc(curCid())}">${icon('chart')} Ver resumen</button>
      ${canDelete && !l._pending ? `<button class="btn sm danger" data-act="delLog" data-id="${esc(l.id)}">${icon('trash')} Borrar entreno</button>` : ''}</div></div>
    </details>`).join('')}</div>`;
}

/* ---------- Resúmenes: entreno, semana y cuerpo ---------- */
// [campo, nombre, unidad, sentido bueno: -1 bajar, 1 subir, 0 depende del objetivo]
const BODY = [['weight_kg','Peso','kg',0],['height_cm','Altura','cm',0],['waist_cm','Cintura','cm',-1],['hip_cm','Cadera','cm',0],
  ['body_fat','Grasa','%',-1],['visceral_fat','Grasa visceral','',-1],['muscle_kg','Masa muscular','kg',1]];
const weekStart = s => { const d = parseDate(s); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return d.toLocaleDateString('sv-SE'); };
const weekLabel = ws => { const a = parseDate(ws), b = parseDate(ws); b.setDate(b.getDate() + 6);
  return a.getMonth() === b.getMonth() ? `${a.getDate()}-${fmtDate(b.toLocaleDateString('sv-SE'))}` : `${fmtDate(ws)} - ${fmtDate(b.toLocaleDateString('sv-SE'))}`; };
const nSets = l => (l.entries || []).reduce((a, e) => a + (e.sets || []).length, 0);
// Mejor serie: con peso manda el 1RM estimado; sin peso, las repeticiones
const topSet = sets => { let b = null; for (const x of sets || []){ const kg = num(x.kg), r = num(x.reps); if (kg == null && r == null) continue;
  const sc = kg ? kg * (1 + (r || 1) / 30) : (r || 0); if (!b || sc > b.sc) b = {kg, reps: r, sc}; } return b; };
const fmtSet = t => !t ? '-' : t.kg ? `${fmtNum(t.kg, 2)} x ${t.reps ?? '-'}` : `${t.reps}`;
const sign = (v, d = 1) => (v > 0 ? '+' : '') + fmtNum(v, d);
const cmpCls = (a, b) => a == null || b == null || Math.abs(a - b) < 1e-9 ? '' : a > b ? 'better' : 'worse';
function bodySeries(mets, c, k){
  const pts = mets.filter(m => m[k] != null && m[k] !== '').map(m => ({date: m.date, v: num(m[k])}));
  if (!pts.length && k === 'height_cm' && c?.height_cm) pts.push({date: null, v: num(c.height_cm)});
  return pts;
}
function bodyTableHTML(mets, c){
  const rows = BODY.map(([k, l, u, dir]) => ({k, l, u, dir, pts: bodySeries(mets, c, k)})).filter(r => r.pts.length);
  if (!rows.length) return '';
  const firstD = mets[0]?.date, lastD = mets.at(-1)?.date;
  return `<div class="tbl-wrap"><table class="tbl bodyt"><thead><tr><th>Medida</th><th>Inicio</th><th>Anterior</th><th>Ahora</th><th>Cambio</th></tr></thead><tbody>
    ${rows.map(r => { const a = r.pts[0].v, z = r.pts.at(-1).v, p = r.pts.length > 1 ? r.pts.at(-2).v : null, d = r.pts.length > 1 ? z - a : null;
      const cls = d == null || Math.abs(d) < 1e-9 || !r.dir ? '' : (d * r.dir > 0 ? 'better' : 'worse');
      return `<tr><td><b>${r.l}</b>${r.u ? ` <span class="muted tiny">${r.u}</span>` : ''}</td><td>${fmtNum(a)}</td><td>${fmtNum(p)}</td><td><b>${fmtNum(z)}</b></td><td class="${cls}">${d == null ? '-' : sign(d)}</td></tr>`; }).join('')}
  </tbody></table></div>
  <p class="tiny muted">${firstD && lastD && firstD !== lastD ? `Inicio: ${fmtDate(firstD, {day:'numeric', month:'short', year:'numeric'})}. Última medición: ${fmtDate(lastD, {day:'numeric', month:'short', year:'numeric'})}. ` : ''}En verde lo que va en buena dirección. Peso, altura y cadera van sin color porque depende del objetivo.</p>`;
}
function weeklyHTML(logs, mets){
  if (!logs.length) return '';
  const by = {};
  logs.forEach(l => { const w = weekStart(l.date); (by[w] = by[w] || []).push(l); });
  const weeks = Object.keys(by).sort().reverse().slice(0, 8);
  const wOf = w => { const ls = by[w] || []; return {n: ls.length, sets: ls.reduce((a, l) => a + nSets(l), 0), vol: ls.reduce((a, l) => a + volume(l), 0)}; };
  const weightIn = w => { const e = new Date(parseDate(w)); e.setDate(e.getDate() + 6); const ee = e.toLocaleDateString('sv-SE');
    return [...mets].reverse().find(m => m.date >= w && m.date <= ee && m.weight_kg != null)?.weight_kg; };
  const rows = weeks.map((w, i) => { const cur = wOf(w), prevKey = Object.keys(by).sort().reverse()[Object.keys(by).sort().reverse().indexOf(w) + 1];
    const prev = prevKey ? wOf(prevKey) : null; const dv = prev && prev.vol ? (cur.vol - prev.vol) / prev.vol * 100 : null;
    const live = w === weekStart(today());
    return `<tr><td class="wk"><b>${weekLabel(w)}</b></td><td>${cur.n}</td><td>${cur.sets}</td><td>${fmtNum(cur.vol / 1000, 1)} t</td>
      <td class="${live || dv == null ? '' : dv > 0.5 ? 'better' : dv < -0.5 ? 'worse' : ''}">${live ? '<span class="muted">en curso</span>' : dv == null ? '-' : sign(dv, 0) + ' %'}</td><td>${fmtNum(num(weightIn(w)))}</td></tr>`; }).join('');
  // Progresión por ejercicio: mejor serie de cada semana (las 6 últimas semanas con entrenos)
  const cols = Object.keys(by).sort().slice(-6);
  const exs = [...new Set(cols.flatMap(w => by[w].flatMap(l => (l.entries || []).map(e => e.exercise))).filter(Boolean))];
  const cell = (w, ex) => topSet(by[w].flatMap(l => (l.entries || []).filter(e => e.exercise === ex).flatMap(e => e.sets || [])));
  const grid = exs.map(ex => { let prev = null;
    return `<tr><td class="ex"><b>${esc(ex)}</b></td>${cols.map(w => { const t = cell(w, ex); const cls = t && prev ? cmpCls(t.sc, prev.sc) : ''; if (t) prev = t;
      return `<td class="${cls}">${t ? fmtSet(t) : '<span class="muted">-</span>'}</td>`; }).join('')}</tr>`; }).join('');
  return `<div class="sec-title">Resumen semanal</div>
    <div class="tbl-wrap"><table class="tbl wkt"><thead><tr><th>Semana</th><th>Entrenos</th><th>Series</th><th>Volumen</th><th>Vs. anterior</th><th>Peso</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="tiny muted">Volumen: kilos totales levantados (kg x repeticiones de todas las series). La semana actual se compara cuando termina.</p>
    <div class="sec-title">Progresión por ejercicio</div>
    <div class="tbl-wrap"><table class="tbl prog"><thead><tr><th>Ejercicio</th>${cols.map(w => `<th>${fmtDate(w)}</th>`).join('')}</tr></thead><tbody>${grid}</tbody></table></div>
    <p class="tiny muted">Mejor serie de cada semana (kg x repeticiones). En verde si mejora a la semana anterior, en rojo si baja.</p>`;
}

VIEWS.logSummary = async () => {
  const coach = S.me.role === 'coach', cid = S.p.cid || S.me.id;
  const d = coach ? await loadClient(cid) : {...await myData(), c: S.me};
  const {logs, mets, c} = d;
  const i = logs.findIndex(l => l.id === S.p.id), log = logs[i];
  if (!log) return shell('Resumen', empty('No encuentro este entreno', 'Puede que se haya borrado.'), {backBtn: true});
  const older = logs.slice(i + 1);
  const prevSame = older.find(l => l.day_name === log.day_name);
  const vol = volume(log), pvol = prevSame ? volume(prevSame) : null, dvol = pvol ? (vol - pvol) / pvol * 100 : null;
  let better = 0, records = 0;
  const exRows = (log.entries || []).map(e => {
    const t = topSet(e.sets);
    const prevE = older.find(l => (l.entries || []).some(x => x.exercise === e.exercise && topSet(x.sets)));
    const p = prevE ? topSet(prevE.entries.find(x => x.exercise === e.exercise).sets) : null;
    const best = older.reduce((m, l) => { (l.entries || []).filter(x => x.exercise === e.exercise).forEach(x => { const s = topSet(x.sets); if (s && (!m || s.sc > m.sc)) m = s; }); return m; }, null);
    const isPR = t && best && t.sc > best.sc + 1e-9;
    const cls = t && p ? cmpCls(t.sc, p.sc) : '';
    if (cls === 'better') better++; if (isPR) records++;
    const txt = !p ? 'Primera vez' : cls === 'better' ? 'Mejor que la última vez' : cls === 'worse' ? 'Por debajo de la última vez' : 'Igual que la última vez';
    return `<div class="exr"><div class="grow"><b>${esc(e.exercise)}</b>${isPR ? ' <span class="badge gold">Récord</span>' : ''}
        <div class="small muted">${(e.sets || []).map(x => x.kg ? `${esc(x.kg)} x ${esc(x.reps || '-')}` : esc(x.reps || '-')).join(', ')}</div>
        <div class="small"><span class="${cls}">${txt}</span>${p ? `<span class="muted">. Antes: ${fmtSet(p)} (${relDate(prevE.date)})</span>` : ''}</div></div>
      <div class="exr-top"><small>Mejor serie</small><b>${fmtSet(t)}</b></div></div>`;
  }).join('');
  const wk = weekStart(log.date), wLogs = logs.filter(l => weekStart(l.date) === wk);
  const metsThisWeek = mets.some(m => weekStart(m.date) === weekStart(today()));
  const who = coach ? firstName(c.full_name) : '';
  return shell('Resumen del entreno', `
    <div class="sum-head"><b>${esc(log.day_name || 'Entreno')}</b><span>${esc(cap(fmtDate(log.date, {weekday:'long', day:'numeric', month:'long'})))}${log.rpe ? `. Esfuerzo ${esc(log.rpe)} de 10` : ''}</span></div>
    <div class="stats">
      <div class="stat"><small>Series hechas</small><b>${nSets(log)}</b></div>
      <div class="stat"><small>Volumen</small><b>${fmtNum(vol / 1000, 1)}</b><i>t</i>${dvol != null ? `<i class="${dvol >= 0 ? 'down' : 'up'}">${sign(dvol, 0)} %</i>` : ''}</div>
      <div class="stat"><small>Ejercicios que mejoran</small><b>${better}</b><i>de ${(log.entries || []).length}</i></div>
    </div>
    <p class="small" style="margin:12px 2px 0">${records ? `${coach ? `${esc(who)} ha batido` : 'Has batido'} ${records === 1 ? 'un récord' : `${records} récords`} hoy. ` : ''}${dvol == null ? (prevSame ? '' : 'Es la primera vez que se registra este día, así que hoy marca el punto de partida.') : `${coach ? 'Ha' : 'Has'} movido un ${fmtNum(Math.abs(dvol), 0)} % ${dvol >= 0 ? 'más' : 'menos'} de kilos que la última vez que ${coach ? 'hizo' : 'hiciste'} este día.`} Esta semana ${coach ? 'lleva' : 'llevas'} ${wLogs.length} ${wLogs.length === 1 ? 'entreno' : 'entrenos'}.</p>
    ${log.notes ? `<div class="card cream" style="margin-top:10px;padding:10px 12px">${esc(log.notes)}</div>` : ''}
    <div class="sec-title">Ejercicio a ejercicio</div>
    <div class="card flush">${exRows}</div>
    <div class="sec-title">${coach ? 'Su cuerpo' : 'Tu cuerpo'}: inicio y ahora</div>
    ${bodyTableHTML(mets, c) || `<div class="card"><p class="muted small center" style="margin:0">Todavía no hay medidas registradas.</p></div>`}
    ${!coach && !metsThisWeek ? `<button class="btn gold block" style="margin-top:12px" data-act="metricNew">${icon('scale')} Registrar medidas de esta semana</button>` : ''}
    <button class="btn light block" style="margin-top:12px" data-act="${coach ? 'back' : 'home'}">${coach ? 'Volver' : 'Terminar'}</button>`, {backBtn: true, sub: coach ? c.full_name : CFG.BRAND});
};

/* ---------- Registrar medidas (cliente) ---------- */
VIEWS.metricNew = async () => {
  if (!S.draft){
    const {mets} = await myData();
    const lastH = [...mets].reverse().find(x => x.height_cm != null)?.height_cm ?? S.me.height_cm ?? '';
    S.draft = {id: uid(), client_id: S.me.id, date: today(), weight_kg:'', height_cm: lastH == null ? '' : String(lastH), waist_cm:'', hip_cm:'', chest_cm:'', arm_cm:'', thigh_cm:'', body_fat:'', visceral_fat:'', muscle_kg:'', sleep:null, stress:null, energy:null, notes:''};
  }
  const m = S.draft;
  const scale = (k, l) => `<div><div class="small muted" style="margin-bottom:6px">${l}</div><div class="scale">${[1,2,3,4,5].map(v => `<button class="${m[k] === v ? 'on' : ''}" data-act="mscale" data-k="${k}" data-v="${v}">${v}</button>`).join('')}</div></div>`;
  const f = (k, l, u) => `<label class="f">${l}${u ? ` (${u})` : ''}<input class="in" inputmode="decimal" data-path="${k}" value="${esc(m[k])}"></label>`;
  return shell('Medidas', `
    <div class="stack">
      <label class="f">Fecha<input class="in" type="date" data-path="date" value="${esc(m.date)}"></label>
      <div class="grid2">${f('weight_kg','Peso','kg')}${f('height_cm','Altura','cm')}</div>
      <div class="grid2">${f('waist_cm','Cintura','cm')}${f('hip_cm','Cadera','cm')}</div>
      <div class="form-h">Báscula de bioimpedancia</div>
      <div class="grid3">${f('body_fat','Grasa','%')}${f('visceral_fat','Visceral','nivel')}${f('muscle_kg','Músculo','kg')}</div>
      <p class="tiny muted" style="margin:-4px 0 0">Si tu báscula no da alguno de estos datos, déjalo en blanco.</p>
      <div class="form-h">Otros perímetros</div>
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
  const [bill, pays, hlink, pst] = await Promise.all([api.billing(c.id).catch(() => null), api.payments(c.id).catch(() => []), api.healthLink(c.id).catch(() => null), pushState()]);
  return shell('Perfil', `
    <div class="card item"><div class="avatar lg">${esc(initials(c.full_name))}</div><div><h2>${esc(c.full_name)}</h2><div class="muted small">${esc(c.email || '')}</div></div></div>
    ${c.goal ? `<div class="card cream" style="margin-top:10px"><div class="small muted">Tu objetivo</div><b>${esc(c.goal)}</b></div>` : ''}
    ${clientPayHTML(bill, pays)}
    ${healthCardHTML(hlink)}
    ${pushCardHTML(pst)}
    <div class="sec-title">Tus datos</div>
    <form class="stack" id="fMe">
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
    <p class="tiny muted center" style="margin-top:10px">Versión ${APP_VERSION}</p>
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
  if (S.p.prefill){ ta.value = S.p.prefill; S.p.prefill = null; grow(); ta.focus(); }
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
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden'){ hiddenAt = Date.now(); return; }
  // En el iPhone la app suele quedarse abierta en segundo plano: si vuelves tras 20 min, cuenta como abrirla
  if (S.me && hiddenAt && Date.now() - hiddenAt > 20 * 60 * 1000 && !document.querySelector('.welcome')) maybeWelcome();
  hiddenAt = 0;
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
      ${asCoach && kind === 'entreno' && urls[d.path] ? `<button class="btn sm" data-act="planFromDoc" data-id="${esc(d.id)}">Crear plan</button>` : ''}
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
    const cid = S.p.id, kind = t.dataset.docup;
    try { await api.uploadDoc({id: uid(), client_id: cid, name: f.name.replace(/\.pdf$/i, ''), kind}, f); toast('PDF subido. Tu cliente ya lo puede ver.'); render(); }
    catch(err){ return toast(isNetErr(err) ? 'Sin conexión. Inténtalo de nuevo.' : err.message); }
    if (kind === 'entreno'){
      try { const imp = await planFromPdf(new Uint8Array(await f.arrayBuffer()), f.name); if (imp.nEx) await offerImport(imp, cid, f.name); }
      catch(err){ console.warn('No se ha podido leer el PDF', err); }
    }
  }
});

/* =====================================================================
   Pagos
   ===================================================================== */
const PERIODS = [['month','Mensual','al mes',1],['quarter','Trimestral','cada 3 meses',3],['semester','Semestral','cada 6 meses',6],['year','Anual','al año',12],['once','Pago único','pago único',0]];
const periodOf = k => PERIODS.find(p => p[0] === k) || PERIODS[0];
const eur = c => c == null ? '-' : (c / 100).toLocaleString('es-ES', {style:'currency', currency:'EUR', minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2});
const euInput = c => c % 100 ? (c / 100).toFixed(2).replace('.', ',') : String(c / 100);
const priceTxt = b => `${eur(b.amount_cents)}${b.period === 'once' ? '' : ' ' + periodOf(b.period)[2]}`;
/* ---------- Pago por transferencia ---------- */
const ibanClean = v => String(v || '').replace(/\s+/g, '').toUpperCase();
const ibanFmt = v => ibanClean(v).replace(/(.{4})/g, '$1 ').trim();
function ibanOk(v){
  const x = ibanClean(v); if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(x)) return false;
  let m = 0; for (const ch of (x.slice(4) + x.slice(0, 4)).replace(/[A-Z]/g, c => c.charCodeAt(0) - 55)) m = (m * 10 + +ch) % 97;
  return m === 1;
}
const payCfg = () => { const st = S.settings || {}; return {mode: st.pay_mode === 'transfer' ? 'transfer' : 'card', holder: st.pay_holder || '', iban: st.pay_iban || '', concept: st.pay_concept || '{nombre} - cuota'}; };
async function refreshSettings(){ S.settings = await api.settings().catch(() => S.settings || {}); return S.settings; }
function transferHTML(b, name){
  const pc = payCfg();
  if (!pc.iban) return `<p class="small" style="margin:0">Escribe a ${esc(firstName(CFG.COACH_NAME) || 'tu coach')} por Mensajes y te dirá cómo pagar.</p>`;
  return `<div class="xfer">
    <div><small>Titular</small><b>${esc(pc.holder || CFG.COACH_NAME)}</b></div>
    <div class="row between" style="gap:10px"><div class="grow"><small>IBAN</small><b class="iban">${esc(ibanFmt(pc.iban))}</b></div><button class="btn sm" data-act="copyIban">${icon('copy')} Copiar</button></div>
    <div class="grid2"><div><small>Importe</small><b>${esc(eur(b.amount_cents))}</b></div><div><small>Concepto</small><b>${esc(String(pc.concept).replace(/\{nombre\}/gi, name || ''))}</b></div></div>
  </div>
  <p class="tiny muted" style="margin:8px 0 0">Cuando ${esc(firstName(CFG.COACH_NAME) || 'tu coach')} reciba la transferencia, la marcará como pagada y aquí saldrá al día.</p>`;
}
function payState(b){
  if (!b || !b.amount_cents) return {k:'none', short:'Sin plan', cls:'', label:'Sin plan de pago'};
  const end = b.current_period_end ? fmtDate(b.current_period_end.slice(0,10), {day:'numeric', month:'long'}) : '';
  if (b.manual_until && b.manual_until >= today()) return {k:'ok', short:'Al día', cls:'ok', label:`Pagado hasta el ${fmtDate(b.manual_until, {day:'numeric', month:'long'})}`};
  if (['active','trialing'].includes(b.status)) return {k:'ok', short:'Al día', cls:'ok', label: b.cancel_at_period_end ? `Al día. Se cancela el ${end}` : `Al día${end ? `. Próximo cobro el ${end}` : ''}`};
  if (b.status === 'paid_once') return {k:'ok', short:'Pagado', cls:'ok', label:'Pagado'};
  if (['past_due','unpaid','incomplete'].includes(b.status)) return {k:'late', short:'Pago fallido', cls:'bad', label:'El último cobro ha fallado'};
  if (b.status === 'canceled') return {k:'canceled', short:'Cancelado', cls:'warn', label:'Suscripción cancelada'};
  if (b.manual_until) return {k:'pending', short:'Toca pagar', cls:'gold', label:`Pagado hasta el ${fmtDate(b.manual_until, {day:'numeric', month:'long'})}. Toca renovar`};
  return {k:'pending', short:'Sin pagar', cls:'gold', label:'Pendiente del primer pago'};
}
function payBanner(b){
  const ps = payState(b);
  if ((ps.k === 'pending' || ps.k === 'canceled') && payCfg().mode === 'transfer') return `<div class="card paycard" style="margin:10px 0 4px"><div class="row between"><div><div class="small muted">Tu plan</div><b>${esc(b.plan_name)}</b><div class="small">${esc(priceTxt(b))}. Pago por transferencia</div></div>
    <button class="btn gold" data-act="payTransfer">${icon('card')} Cómo pagar</button></div></div>`;
  if (ps.k === 'pending' || ps.k === 'canceled') return `<div class="card paycard" style="margin:10px 0 4px"><div class="row between"><div><div class="small muted">Tu plan</div><b>${esc(b.plan_name)}</b><div class="small">${esc(priceTxt(b))}</div></div>
    <button class="btn gold" data-act="payNow">${icon('card')} Pagar</button></div></div>`;
  if (ps.k === 'late') return `<div class="card paycard bad" style="margin:10px 0 4px"><b>No se ha podido cobrar tu cuota</b><p class="small" style="margin:4px 0 10px">Revisa tu tarjeta para seguir con tu plan sin cortes.</p>
    <button class="btn block" data-act="payPortal">${icon('card')} Actualizar tarjeta</button></div>`;
  return '';
}
function paymentsTable(pays, asCoach){
  if (!pays.length) return '<p class="small muted" style="margin:4px 2px">Todavía no hay pagos registrados.</p>';
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Fecha</th><th>Concepto</th><th>Importe</th><th></th></tr></thead><tbody>
    ${pays.map(p => `<tr><td>${esc(fmtDate((p.paid_at || '').slice(0,10), {day:'numeric', month:'short', year:'2-digit'}))}</td>
      <td>${esc(p.description || (p.method === 'manual' ? 'Pago a mano' : 'Pago con tarjeta'))}${p.status === 'failed' ? ' <span class="badge bad">Fallido</span>' : ''}</td>
      <td><b>${eur(p.amount_cents)}</b></td>
      <td style="white-space:nowrap">${p.invoice_url ? `<a href="${esc(p.invoice_url)}" target="_blank" rel="noopener">Recibo</a>` : ''}${asCoach && p.method === 'manual' ? `<button class="mini bad" data-act="delPayment" data-id="${esc(p.id)}" aria-label="Borrar">${icon('trash')}</button>` : ''}</td></tr>`).join('')}
    </tbody></table></div>`;
}
function clientPayHTML(b, pays){
  if (!b || !b.amount_cents) return '';
  const ps = payState(b);
  return `<div class="sec-title">Mi plan</div>
    <div class="card paycard ${ps.k === 'late' ? 'bad' : ''}">
      <div class="row between"><div><b style="font-size:17px">${esc(b.plan_name)}</b><div class="small">${esc(priceTxt(b))}</div></div><span class="badge ${ps.cls}">${esc(ps.short)}</span></div>
      <p class="small muted" style="margin:8px 0 12px">${esc(ps.label)}.</p>
      ${payCfg().mode === 'transfer' ? (['pending','canceled'].includes(ps.k) ? `<div class="small" style="font-weight:700;margin:0 0 8px">Paga por transferencia con estos datos:</div>${transferHTML(b, S.me.full_name)}` : `<button class="btn light block" data-act="payTransfer">Ver datos para la transferencia</button>`) : ''}
      <div class="stack">
        ${['pending','canceled'].includes(ps.k) && payCfg().mode !== 'transfer' ? `<button class="btn gold block" data-act="payNow">${icon('card')} Pagar ahora</button>` : ''}
        ${b.stripe_customer_id ? `<button class="btn light block" data-act="payPortal">${icon('card')} ${ps.k === 'late' ? 'Actualizar tarjeta' : 'Gestionar pago y recibos'}</button>` : ''}
      </div>
    </div>
    <div class="sec-title">Mis pagos</div>${paymentsTable(pays.slice(0, 12), false)}`;
}
function coachPayHTML(c, b, pays){
  const ps = payState(b), bb = b || {plan_name:'', amount_cents:null, period:'month'};
  const hasSub = !!(b && b.period !== 'once' && (b.stripe_subscription_id || b.stripe_customer_id) && ['active','trialing','past_due','unpaid'].includes(b.status));
  const stripeUrl = b && b.stripe_customer_id && !String(b.stripe_customer_id).startsWith('cus_demo') ? `https://dashboard.stripe.com/${CFG.STRIPE_MODE === 'live' ? '' : 'test/'}customers/${encodeURIComponent(b.stripe_customer_id)}` : '';
  const def = new Date(); def.setMonth(def.getMonth() + (periodOf(bb.period)[3] || 1)); const defUntil = def.toLocaleDateString('sv-SE');
  return `
    <div class="card paycard ${ps.k === 'late' ? 'bad' : ''}">
      <div class="row between"><div><div class="small muted">Estado del pago</div><b style="font-size:18px">${esc(ps.label)}</b></div><span class="badge ${ps.cls}">${esc(ps.short)}</span></div>
      ${b && b.last_payment_at ? `<div class="small muted" style="margin-top:6px">Último pago: ${relDate(b.last_payment_at.slice(0,10))}</div>` : ''}
      ${stripeUrl ? `<a class="btn sm light" style="margin-top:10px" href="${esc(stripeUrl)}" target="_blank" rel="noopener">${icon('ext')} Ver en Stripe</a>` : ''}
    </div>
    <div class="sec-title">Plan de pago</div>
    <form class="card stack" id="fBill">
      <label class="f">Nombre del plan (lo verá el cliente)<input class="in" name="plan_name" value="${esc(bb.plan_name)}" placeholder="Por ejemplo: Entreno + alimentación" required></label>
      <div class="grid2">
        <label class="f">Precio (€, IVA incluido)<input class="in" name="amount" inputmode="decimal" value="${bb.amount_cents != null ? esc(euInput(bb.amount_cents)) : ''}" placeholder="60" required></label>
        <label class="f">Cada cuánto<select class="in" name="period">${PERIODS.map(p => `<option value="${p[0]}" ${bb.period === p[0] ? 'selected' : ''}>${p[1]}</option>`).join('')}</select></label>
      </div>
      ${hasSub ? '<p class="small info" style="margin:0">Este cliente ya tiene una suscripción en marcha. Si cambias el precio, se aplicará cuando vuelva a suscribirse. Para cambiarlo ya, cancélala desde Stripe y pídele que pague de nuevo.</p>' : ''}
      <button class="btn block" type="submit">${icon('check')} Guardar plan de pago</button>
      ${b && b.amount_cents ? `<button class="btn danger block" type="button" data-act="removePlan" data-sub="${hasSub ? 1 : 0}">${icon('trash')} Quitar plan</button>` : ''}
      ${!b || !b.amount_cents ? `<p class="small muted" style="margin:0">${payCfg().mode === 'transfer' ? `Al guardarlo, a ${esc(firstName(c.full_name))} le aparecerán en su app tus datos para la transferencia.` : `Al guardarlo, a ${esc(firstName(c.full_name))} le aparecerá el botón Pagar en su app.`}</p>` : ''}
    </form>
    <div class="sec-title">Pago a mano</div>
    <form class="card stack" id="fManual">
      <p class="small muted" style="margin:0">${payCfg().mode === 'transfer' ? 'Cuando te llegue la transferencia, apúntala aquí y el cliente saldrá al día hasta la fecha que pongas.' : 'Para quien te paga en efectivo, por Bizum o por transferencia.'}</p>
      <div class="grid2">
        <label class="f">Importe (€)<input class="in" name="amount" inputmode="decimal" value="${bb.amount_cents != null ? esc(euInput(bb.amount_cents)) : ''}" required></label>
        <label class="f">Al día hasta<input class="in" name="until" type="date" value="${defUntil}" required></label>
      </div>
      <label class="f">Concepto<input class="in" name="desc" value="${payCfg().mode === 'transfer' ? 'Transferencia' : 'Pago a mano'}" maxlength="80"></label>
      <button class="btn light block" type="submit">${icon('plus')} Apuntar pago</button>
    </form>
    <div class="sec-title">Historial de pagos</div>${paymentsTable(pays, true)}`;
}
function mountCoachPay(cid){
  const fb = $('#fBill');
  if (fb) fb.onsubmit = async e => {
    e.preventDefault();
    const amount = num(fb.amount.value);
    if (amount == null || amount <= 0) return toast('Pon un precio válido');
    try { await api.saveBilling({client_id: cid, plan_name: fb.plan_name.value.trim(), amount_cents: Math.round(amount * 100), currency: 'eur', period: fb.period.value}); toast('Plan de pago guardado'); render(); }
    catch(err){ toast(err.message); }
  };
  const fm = $('#fManual');
  if (fm) fm.onsubmit = async e => {
    e.preventDefault();
    const amount = num(fm.amount.value); if (amount == null || amount <= 0) return toast('Pon un importe válido');
    try {
      await api.addManualPayment({client_id: cid, amount_cents: Math.round(amount * 100), currency: 'eur', status: 'paid', description: fm.desc.value.trim() || 'Pago a mano', paid_at: new Date().toISOString()});
      const b = S.cache.billing || {};
      await api.saveBilling({client_id: cid, plan_name: b.plan_name || 'Plan', amount_cents: b.amount_cents ?? Math.round(amount * 100), currency: 'eur', period: b.period || 'month', manual_until: fm.until.value});
      toast('Pago apuntado'); render();
    } catch(err){ toast(err.message); }
  };
}
// Vuelta desde la página de pago de Stripe
(() => {
  const m = location.search.match(/[?&]pago=(ok|cancelado)/);
  if (!m) return;
  try { history.replaceState(null, '', location.pathname + location.hash); } catch(e){}
  setTimeout(() => {
    if (m[1] === 'ok'){ toast('¡Pago recibido! Gracias. En unos segundos lo verás al día.', 4000); setTimeout(() => { if (S.me) render(); }, 4000); }
    else toast('Pago cancelado. No se te ha cobrado nada.', 3500);
  }, 900);
})();

/* =====================================================================
   Acciones (delegación de eventos)
   ===================================================================== */
const reorder = (arr, i, dir) => { const j = i + dir; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; };
/* =====================================================================
   Salud del iPhone (atajo JPR Salud)
   ===================================================================== */
const coachFirst = () => esc(firstName(CFG.COACH_NAME) || 'tu coach');
async function healthData(cid){
  const coach = S.me.role === 'coach';
  const [link, days, pushN, rem] = await Promise.all([api.healthLink(cid).catch(() => null), api.healthDays(cid, 60).catch(() => []),
    coach ? api.pushCount(cid).catch(() => null) : null, coach ? api.lastReminder(cid).catch(() => null) : null]);
  S.cache.health = {link, days, pushN, rem}; return S.cache.health;
}
function pushCardHTML(state){
  const t = {
    on: ['Avisos activados', 'Te llegarán los recordatorios de tu coach, como el aviso de pasos de la noche.'],
    off: ['Activa los avisos', 'Recibe un aviso en el móvil si por la noche todavía no has llegado a tus pasos.'],
    install: ['Añade la app a tu pantalla de inicio', 'Para recibir avisos en el iPhone: en Safari toca Compartir › "Añadir a pantalla de inicio" y abre JPR Coach desde ese icono.'],
    denied: ['Avisos bloqueados', 'Los has bloqueado en el iPhone. Actívalos en Ajustes › Notificaciones › JPR Coach.'],
    unsupported: ['Avisos no disponibles', 'Este navegador no admite avisos. En iPhone, abre la app desde la pantalla de inicio.'],
    demo: ['Avisos en el móvil', 'En la demo no se envían avisos de verdad.'],
  }[state] || ['Avisos en el móvil', ''];
  const btns = state === 'on' ? `<div class="grid2" style="margin-top:10px"><button class="btn light sm" data-act="pushTest">${icon('send')} Probar aviso</button><button class="btn light sm" data-act="pushOff">Desactivar</button></div>`
    : state === 'off' ? `<button class="btn gold block" data-act="pushOn" style="margin-top:10px">${icon('bell')} Activar avisos</button>` : '';
  return `<div class="sec-title">Avisos en el móvil</div>
  <div class="card"><div class="item" style="padding:0"><span class="mini ${state === 'on' ? 'ic-ok' : 'ic-health'}">${icon('bell')}</span><div class="grow"><b>${t[0]}</b><div class="small muted">${t[1]}</div></div></div>${btns}</div>`;
}
function healthCardHTML(link){
  return `<div class="sec-title">Salud del iPhone</div>
  <div class="card tap item" data-act="openHealth"><span class="mini ic-health">${icon('heart')}</span>
    <div class="grow"><b>${link ? 'Conectado con Salud' : 'Conectar con Salud'}</b><div class="small muted">${link ? `Último envío: ${esc(ago(link.last_sync_at))}` : `Comparte tus pasos, tu sueño y tus pulsaciones con ${coachFirst()}`}</div></div><span class="chev">›</span></div>`;
}
// Lo que se lee de un vistazo: hoy (o el último día con datos), media de 7 días y avisos
function healthBoxHTML(link, days, asCoach){
  const ms = HM.filter(m => (link.metrics || []).includes(m.k));
  if (!ms.length) return empty('Nada que mostrar', 'No hay ningún dato marcado para compartir.');
  const fresh = link.last_sync_at && Date.now() - new Date(link.last_sync_at) < 36 * 3600e3;
  const latest = k => { for (let i = days.length - 1; i >= 0; i--) if (days[i][k] != null) return days[i]; return null; };
  const avg7 = (k, skipDay) => { const v = days.filter(d => d.day !== skipDay && daysAgo(d.day) <= 7 && d[k] != null).map(d => d[k]); return v.length >= 2 ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const tiles = ms.map(m => {
    const L = latest(m.k), a = L ? avg7(m.k, L.day) : null;
    const when = !L ? '' : L.day === today() ? 'hoy' : relDate(L.day);
    let cmp = '';
    if (L && a != null && m.k !== 'weight_kg'){
      const diff = L[m.k] - a, pct = a ? Math.round(diff / a * 100) : 0;
      const bad = (m.k === 'resting_hr' ? diff >= 5 : m.k === 'sleep_h' ? diff <= -0.75 : m.k === 'hrv_ms' ? pct <= -15 : false);
      cmp = `<div class="cmp ${bad ? 'up' : ''}">Media: ${fmtH(m.k, a)}${m.k === 'steps' && L.day === today() ? '' : Math.abs(pct) >= 3 ? ` (${pct > 0 ? '+' : ''}${pct} %)` : ''}</div>`;
    }
    return `<button class="htile ${S.p.hm === m.k ? 'on' : ''}" data-act="hMetric" data-v="${m.k}"><small>${m.l}${when ? ` · ${when}` : ''}</small><b>${L ? fmtH(m.k, L[m.k]) : '-'}${L && m.u ? `<i>${m.u}</i>` : ''}</b>${cmp || '<div class="cmp">&nbsp;</div>'}</button>`;
  }).join('');
  // Señales para el coach (o para el propio cliente)
  const sig = [];
  const sl = days.filter(d => daysAgo(d.day) <= 7 && d.sleep_h != null).map(d => d.sleep_h);
  if (ms.some(m => m.k === 'sleep_h') && sl.length >= 3){ const a = sl.reduce((x, y) => x + y, 0) / sl.length; if (a < 6.5) sig.push(`Duerme poco esta semana: ${fmtSleep(a)} de media.`); }
  const hr = latest('resting_hr'), hrA = hr ? avg7('resting_hr', hr.day) : null;
  if (ms.some(m => m.k === 'resting_hr') && hr && hrA != null && hr.resting_hr - hrA >= 5) sig.push(`Pulsaciones en reposo ${fmtNum(hr.resting_hr - hrA, 0)} por encima de su media: puede ir cargado o estar incubando algo.`);
  const hv = latest('hrv_ms'), hvA = hv ? avg7('hrv_ms', hv.day) : null;
  if (ms.some(m => m.k === 'hrv_ms') && hv && hvA && (hv.hrv_ms - hvA) / hvA <= -0.15) sig.push('VFC bastante por debajo de su media: recuperación baja.');
  const st = days.filter(d => daysAgo(d.day) >= 1 && daysAgo(d.day) <= 7 && d.steps != null).map(d => d.steps);
  if (ms.some(m => m.k === 'steps') && st.length >= 3 && st.reduce((x, y) => x + y, 0) / st.length < 5000) sig.push('Se mueve poco: menos de 5.000 pasos de media.');
  const sigTxt = asCoach ? sig : sig.map(s => s.replace('Duerme', 'Duermes').replace('su media', 'tu media').replace('Se mueve', 'Te mueves').replace('puede ir', 'puedes ir'));
  const m = ms.find(x => x.k === S.p.hm) || ms[0];
  const pts = days.filter(d => daysAgo(d.day) <= 30 && d[m.k] != null).map(d => ({x: d.day, y: +d[m.k]}));
  const week = days.filter(d => daysAgo(d.day) <= 6).slice().reverse();
  return `
    ${asCoach ? `<div class="card row between" style="gap:10px"><div><b><span class="live ${fresh ? '' : 'off'}"></span>${fresh ? 'Recibiendo datos' : link.last_sync_at ? 'Sin datos recientes' : 'Esperando el primer envío'}</b>
      <div class="small muted">Último envío: <span data-ago="${esc(link.last_sync_at || '')}">${esc(ago(link.last_sync_at))}</span></div></div>
      <span class="badge ok">Permiso dado</span></div>
    <div class="small muted" style="margin-top:8px">Avisos en el móvil: <b>${S.cache.health?.pushN == null ? '-' : S.cache.health.pushN ? 'activados' : 'no activados'}</b>${S.cache.health?.rem ? ` · último aviso de pasos ${esc(relDate(S.cache.health.rem.day))} (${fmtNum(S.cache.health.rem.steps, 0)} pasos)` : ''}</div>` : ''}
    ${sigTxt.length ? `<div class="card cream stack" style="margin-top:${asCoach ? 10 : 0}px;gap:4px">${sigTxt.map(s => `<div class="small"><b class="gold">›</b> ${esc(s)}</div>`).join('')}</div>` : ''}
    <div class="htiles" style="margin-top:10px">${tiles}</div>
    <p class="tiny muted" style="margin:6px 0 0">Media de los 7 días anteriores. Toca un dato para ver su gráfica.</p>
    <div class="sec-title">${esc(m.l)} <span class="r">últimos 30 días</span></div>
    <div class="card">${lineChart(pts, {decimals: m.k === 'sleep_h' ? 1 : m.d})}</div>
    ${week.length ? `<div class="sec-title">Última semana</div><div class="tbl-wrap"><table class="tbl wkt"><thead><tr><th>Día</th>${ms.map(x => `<th>${x.s}</th>`).join('')}</tr></thead><tbody>
      ${week.map(d => `<tr><td>${d.day === today() ? 'Hoy' : esc(fmtDate(d.day, {weekday:'short', day:'numeric'}))}</td>${ms.map(x => `<td>${fmtH(x.k, d[x.k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : ''}
    ${asCoach ? `<details class="small muted" style="margin-top:14px"><summary>Último envío recibido (para revisar el atajo)</summary><pre class="mono tiny" style="white-space:pre-wrap;margin:8px 0 0">${esc(JSON.stringify(link.last_payload || {}, null, 1))}</pre></details>
      <p class="tiny muted">Dio su permiso el ${esc(fmtDate(link.consented_at.slice(0, 10), {day:'numeric', month:'long', year:'numeric'}))}. Si lo retira, dejarás de recibir datos.</p>` : ''}`;
}
function healthSummaryHTML(link, days){
  const last = k => { for (let i = days.length - 1; i >= 0; i--) if (days[i][k] != null) return days[i][k]; return null; };
  const ms = link ? HM.filter(m => (link.metrics || []).includes(m.k) && ['steps','sleep_h','resting_hr'].includes(m.k)) : [];
  return `<div class="sec-title">Salud del iPhone</div>
  <div class="card tap item" data-act="ctab" data-v="health"><span class="mini ic-health">${icon('heart')}</span>
    <div class="grow"><b>${link ? ms.map(m => `${fmtH(m.k, last(m.k))}${m.u ? ' ' + m.u : ''} ${m.k === 'steps' ? 'pasos' : m.k === 'sleep_h' ? 'de sueño' : ''}`.trim()).join(' · ') || 'Conectado' : 'Sin conectar'}</b>
    <div class="small muted">${link ? `Último envío: ${esc(ago(link.last_sync_at))}` : 'Todavía no ha dado permiso para ver sus datos de Salud'}</div></div><span class="chev">›</span></div>`;
}
function healthCoachHTML(c, link, days){
  if (!link) return empty('Salud sin conectar', `${firstName(c.full_name) || 'Este cliente'} todavía no ha conectado la app Salud. Lo hace desde su Perfil, en Salud del iPhone, y tiene que dar su permiso.`,
    `<button class="btn sm" data-act="healthAsk">${icon('chat')} Pedírselo por mensaje</button>`)
    + (!(S.settings || {}).health_shortcut_url ? `<p class="tiny muted center">Antes, pon el enlace del atajo en tu Perfil, en Salud del iPhone.</p>` : '');
  return `<div id="healthBox">${healthBoxHTML(link, days, true)}</div>`;
}
// Refresca el apartado al llegar datos (tiempo real) y el "hace X min" cada 30 s
function mountHealthLive(cid, asCoach){
  if (!$('#healthBox')) return;
  const tick = setInterval(() => document.querySelectorAll('[data-ago]').forEach(el => { el.textContent = ago(el.dataset.ago || null); }), 30000);
  let unsub = () => {};
  try { unsub = api.subscribeHealth(cid, async () => {
    const {link, days} = await healthData(cid); const box = $('#healthBox'); if (!box) return;
    if (!link) return render();
    box.innerHTML = healthBoxHTML(link, days, asCoach); box.classList.remove('flash'); void box.offsetWidth; box.classList.add('flash');
  }); } catch(e){ console.warn(e); }
  S.cleanup = () => { clearInterval(tick); unsub(); };
}

VIEWS.healthConnect = async () => {
  const [link] = await Promise.all([api.healthLink(S.me.id).catch(() => null), refreshSettings()]);
  const url = (S.settings || {}).health_shortcut_url || '';
  const checks = sel => HM.map(m => `<label class="check"><input type="checkbox" name="m" value="${m.k}" ${sel.includes(m.k) ? 'checked' : ''}><span><b>${m.l}</b> <span class="muted small">· ${m.desc}</span></span></label>`).join('');
  if (!link) return shell('Conectar Salud', `
    <div class="card cream"><b>¿Para qué sirve?</b><p class="small" style="margin:6px 0 0">${coachFirst()} verá cada día tus pasos, cómo has dormido y tus pulsaciones en reposo. Con eso ajusta mejor tu entreno y tu descanso, sin que tengas que apuntar nada.</p></div>
    <form class="card stack" id="fHealth" style="margin-top:12px">
      <b>Elige qué compartes</b>
      ${checks(HM.map(m => m.k))}
      <div style="border-top:1px solid var(--rule-2);margin:4px 0 2px"></div>
      <label class="check"><input type="checkbox" name="consent"><span>Doy mi consentimiento para que ${esc(CFG.COACH_NAME || 'mi coach')} (${esc(CFG.BRAND || 'JPR Coach')}) reciba y guarde los datos de mi app Salud que he marcado, solo para seguir mi entrenamiento. Puedo desconectarlo cuando quiera desde aquí y pedir que se borren.</span></label>
      <button class="btn block" type="submit">${icon('check')} Aceptar y conectar</button>
    </form>
    <p class="tiny muted">Los datos los envía un atajo de la app Atajos de tu iPhone, varias veces al día. Se guardan en servidores de la Unión Europea y solo los veis tú y ${coachFirst()}. Lo que no marques no se guarda. Ver la <a href="#" data-act="privacy">política de privacidad</a>.</p>`,
    {backBtn: true, sub: CFG.BRAND});
  const [{days}, pst] = await Promise.all([healthData(S.me.id), pushState()]);
  return shell('Salud del iPhone', `
    <div class="card row between" style="gap:10px"><div><b><span class="live ${link.last_sync_at ? '' : 'off'}"></span>${link.last_sync_at ? 'Conectado' : 'Falta instalar el atajo'}</b><div class="small muted">Último envío: <span data-ago="${esc(link.last_sync_at || '')}">${esc(ago(link.last_sync_at))}</span></div></div>
      <span class="badge ${link.last_sync_at ? 'ok' : 'warn'}">${link.last_sync_at ? 'Recibiendo' : 'Pendiente'}</span></div>
    ${pst !== 'on' ? pushCardHTML(pst) : ''}
    <div class="sec-title">Instálalo en 3 pasos</div>
    <div class="card stack hsteps">
      <div><b>1. Copia tu código</b>
        <div class="row" style="margin-top:8px"><input class="in grow mono" readonly value="${esc(link.token)}" id="hTok"><button class="btn sm" data-act="copyTok" aria-label="Copiar código">${icon('copy')}</button></div>
        <p class="tiny muted" style="margin:6px 0 0">Es personal: con él tus datos llegan a tu ficha. No lo compartas.</p></div>
      <div><b>2. Instala el atajo y pega el código</b>
        ${url ? `<a class="btn gold block" href="${esc(url)}" target="_blank" rel="noopener" style="margin-top:8px">${icon('ext')} Instalar el atajo JPR Salud</a><p class="tiny muted" style="margin:6px 0 0">Se abre la app Atajos. Toca "Configurar atajo", pega el código y toca "Añadir atajo".</p>`
          : `<p class="small muted" style="margin:4px 0 0">${coachFirst()} todavía no ha puesto el enlace del atajo. Te avisará por Mensajes.</p>`}</div>
      <div><b>3. Ejecútalo una vez</b><p class="small muted" style="margin:4px 0 0">En la app Atajos, toca JPR Salud y luego Permitir en todo lo que te pregunte. Arriba cambiará a "Recibiendo".</p></div>
    </div>
    <div class="sec-title">Que se envíe solo</div>
    <div class="card small stack" style="gap:6px">
      <div>En Atajos, pestaña <b>Automatización</b>, toca <b>+</b> y crea estas dos. En las dos elige <b>Ejecutar inmediatamente</b> y el atajo <b>JPR Salud</b>:</div>
      <div><b>Al despertar:</b> Alarma › Al detenerse.</div>
      <div><b>Al cargar el móvil:</b> Cargador › Está conectado.</div>
      <div class="tiny muted">El iPhone solo deja leer Salud con el móvil desbloqueado, por eso usamos momentos en los que lo tienes en la mano.</div>
    </div>
    ${days.length ? `<div class="sec-title">Tus datos</div><div id="healthBox">${healthBoxHTML(link, days, false)}</div>` : '<div id="healthBox"></div>'}
    <div class="sec-title">Qué compartes</div>
    <form class="card stack" id="fHMetrics">${checks(link.metrics || [])}<button class="btn light block" type="submit">Guardar cambios</button></form>
    ${DEMO ? `<button class="btn gold block" data-act="demoHealthSend" style="margin-top:12px">${icon('send')} Simular un envío del atajo (demo)</button>` : ''}
    <button class="btn danger block" data-act="healthOff" style="margin-top:14px">Desconectar Salud</button>
    <p class="tiny muted">Diste tu permiso el ${esc(fmtDate(link.consented_at.slice(0, 10), {day:'numeric', month:'long', year:'numeric'}))}.</p>`,
    {backBtn: true, sub: CFG.BRAND});
};
VIEWS.healthConnect.mount = () => {
  const f = $('#fHealth');
  if (f) f.onsubmit = async e => {
    e.preventDefault();
    const ms = [...f.querySelectorAll('[name=m]:checked')].map(i => i.value);
    if (!ms.length) return toast('Marca al menos un dato');
    if (!f.consent.checked) return toast('Para conectar tienes que dar tu consentimiento', 3200);
    const b = f.querySelector('[type=submit]'); b.disabled = true;
    try { await api.healthConnect(S.me.id, ms); toast('Conectado. Ahora instala el atajo'); render(); }
    catch(err){ toast(err.message); b.disabled = false; }
  };
  const g = $('#fHMetrics');
  if (g) g.onsubmit = async e => {
    e.preventDefault();
    const ms = [...g.querySelectorAll('[name=m]:checked')].map(i => i.value);
    if (!ms.length) return toast('Marca al menos un dato. Para no compartir nada, desconecta Salud.', 3500);
    try { await api.healthSetMetrics(S.me.id, ms); toast('Guardado'); render(); } catch(err){ toast(err.message); }
  };
  if ($('#hTok')){
    // Si llega el primer envío mientras está en esta pantalla, se actualiza sola
    const tick = setInterval(() => document.querySelectorAll('[data-ago]').forEach(el => { el.textContent = ago(el.dataset.ago || null); }), 30000);
    let unsub = () => {}; try { unsub = api.subscribeHealth(S.me.id, () => render()); } catch(e){}
    S.cleanup = () => { clearInterval(tick); unsub(); };
  }
};

const ACT = {
  back, home, reload: () => boot(),
  nav: el => go(el.dataset.v, {}, false),
  tab: el => { S.stack = []; go(el.dataset.v, {}, false); },
  async demoLogin(el){ await api.signIn(el.dataset.id); await boot(); },
  async logout(){ if (!(await confirmBox('Cerrar sesión', '¿Seguro que quieres salir?', 'Salir'))) return; S.unsub && S.unsub(); S.unsub = null; S.unread = {}; await api.signOut(); S.me = null; S.stack = []; go('login', {}, false); },
  async resetDemo(){ if (!(await confirmBox('Reiniciar demo', 'Se borrarán los cambios y vuelven los datos de ejemplo.', 'Reiniciar', true))) return; api.reset(); toast('Demo reiniciada'); render(); },
  privacy: () => modal(PRIVACY_HTML + '<button class="btn block" data-x="ok" style="margin-top:12px">Cerrar</button>', (m, close) => m.querySelector('[data-x=ok]').onclick = close),
  copyLink: async () => { try { await navigator.clipboard.writeText(location.origin + location.pathname); toast('Enlace copiado'); } catch(e){ toast('Mantén pulsado el enlace para copiarlo'); } },

  // Avisos en el móvil
  async pushOn(el){
    if (!('Notification' in window)) return toast('Este navegador no admite avisos');
    el.disabled = true;
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted'){ toast('Sin permiso no te pueden llegar avisos. Puedes activarlos en Ajustes del iPhone › Notificaciones.', 4500); return render(); }
      const reg = await swReady();
      const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: b64uBytes(VAPID_PUBLIC)});
      const j = sub.toJSON();
      await api.pushSave({endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, ua: navigator.userAgent.slice(0, 140)});
      toast('Avisos activados'); render();
    } catch(err){ toast(err.message || 'No se han podido activar los avisos', 4000); el.disabled = false; }
  },
  async pushOff(){
    try { const reg = await swReady(); const sub = await reg.pushManager.getSubscription(); if (sub){ await api.pushDelete(sub.endpoint).catch(() => {}); await sub.unsubscribe(); } toast('Avisos desactivados'); render(); }
    catch(err){ toast(err.message); }
  },
  async pushTest(el){ el.disabled = true; try { const r = await api.pushTest(); toast(r && r.sent ? 'Aviso enviado: te llegará en unos segundos' : 'No se ha podido enviar. Desactiva y vuelve a activar los avisos.', 4000); } catch(err){ toast(err.message); } el.disabled = false; },

  // Salud del iPhone
  openHealth: () => go('healthConnect'),
  copyTok: async () => { const t = $('#hTok'); try { await navigator.clipboard.writeText(t.value); toast('Código copiado'); } catch(e){ t.select(); toast('Mantén pulsado el código para copiarlo'); } },
  async healthOff(){
    if (!(await confirmBox('Desconectar Salud', `${firstName(CFG.COACH_NAME) || 'Tu coach'} dejará de recibir tus datos y tu código dejará de funcionar. Después puedes borrar el atajo de la app Atajos.`, 'Desconectar', true))) return;
    const wipe = await confirmBox('¿Borrar también lo ya enviado?', 'Si dices que sí, se borran todos los datos de Salud que ya estaban guardados. Si cancelas, se quedan para ver tu evolución.', 'Sí, borrarlos', true);
    try { await api.healthDisconnect(S.me.id, wipe); toast(wipe ? 'Salud desconectada y datos borrados' : 'Salud desconectada'); render(); } catch(err){ toast(err.message); }
  },
  demoHealthSend: async () => { await api.demoHealthSend(S.me.id); toast('Datos enviados'); },
  hMetric: el => { S.p.hm = el.dataset.v; const h = S.cache.health, box = $('#healthBox'); if (h?.link && box) box.innerHTML = healthBoxHTML(h.link, h.days, S.me.role === 'coach'); },
  healthAsk: () => { S.p.tab = 'chat'; S.p.prefill = `Hola. Si te parece bien, conecta la app Salud de tu iPhone en JPR Coach: Perfil › Salud del iPhone. Así veo tus pasos, tu sueño y tus pulsaciones en reposo, y ajusto mejor el entreno. Eliges tú qué compartes y lo puedes quitar cuando quieras.`; render(); },

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
    p.days = p.days.map(d => ({name: d.name.trim() || 'Día', notes: (d.notes || '').trim(), exercises: d.exercises.filter(x => x.name.trim()).map(x => ({...x, name: x.name.trim(), video: (x.video || '').trim()}))}));
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
  startDay: el => go('session', {dayIdx: +el.dataset.d, dayNotes: el.dataset.notes || ''}),
  setDone: el => {
    const st = S.draft.entries[el.dataset.e].sets[el.dataset.s];
    st._done = !st._done;
    if (st._done){ if (!st.kg) st.kg = String(st._ph.kg || ''); if (!st.reps) st.reps = String(st._ph.reps || ''); }
    const t = S.draft.entries[el.dataset.e]._target || {};
    if (st._done && !st.kg && t.load) st.kg = String(parseFloat(t.load) || '');
    if (st._done && !st.reps && t.reps) st.reps = String(repsFor(t, +el.dataset.s));
    const row = el.closest('.set'); row.classList.toggle('done', st._done);
    if (st._done && (st.rir ?? '') === '' && t.rir) st.rir = String(parseInt(t.rir) || '');
    row.querySelector('[data-path$=".kg"]').value = st.kg; row.querySelector('[data-path$=".reps"]').value = st.reps;
    const ri = row.querySelector('[data-path$=".rir"]'); if (ri) ri.value = st.rir ?? '';
    const e = S.draft.entries[el.dataset.e], lastSet = +el.dataset.s === e.sets.length - 1;
    if (st._done) restTimer(restOf(t, S.draft.day_name), lastSet ? 'último de este ejercicio' : `antes de la serie ${+el.dataset.s + 2}`); else restTimer(0);
  },
  setAdd: el => { const e = S.draft.entries[el.dataset.e]; const last = e.sets.at(-1); e.sets.push({reps: '', kg: '', rir: '', _ph: {kg: last.kg || last._ph.kg, reps: last.reps || last._ph.reps, rir: last.rir || last._ph.rir}, _prev: e._last?.sets[e.sets.length] || null, _done: false}); render(); },
  setDel: el => { S.draft.entries[el.dataset.e].sets.pop(); render(); },
  rpe: el => { S.draft.rpe = +el.dataset.v; document.querySelectorAll('[data-act=rpe]').forEach(b => b.classList.toggle('on', b === el)); },
  async sessionSave(el){
    const s = S.draft;
    const entries = s.entries.map(e => ({exercise: e.exercise, sets: e.sets.map(st => { const o = {kg: String(st.kg || st._ph.kg || '').replace(',', '.'), reps: String(st.reps || st._ph.reps || '')}; if (String(st.rir ?? '').trim() !== '') o.rir = String(st.rir).trim(); return o; }).filter(st => st.kg || st.reps)})).filter(e => e.sets.length);
    if (!entries.length) return toast('Apunta al menos una serie');
    el.disabled = true;
    try {
      const r = await saveOrQueue('log', {id: s.id, client_id: s.client_id, plan_id: s.plan_id, day_name: s.day_name, date: s.date, entries, rpe: s.rpe, notes: s.notes});
      toast(r._pending ? 'Guardado en el móvil. Se enviará al volver la conexión.' : '¡Entreno guardado! Buen trabajo', 3000);
      S.stack = []; S.view = 'train'; S.p = {}; go('logSummary', {id: s.id});
    } catch(e){ toast(e.message); el.disabled = false; }
  },
  metricNew: () => go('metricNew'),
  checkinNew: () => go('checkin'),
  playVid: el => playVideo(el.dataset.url, el.dataset.title || el.closest('.exs')?.querySelector('.exs-head b')?.textContent || ''),
  async checkinSave(el){
    const d = S.draft, K = ['weight_kg','waist_cm','hip_cm','body_fat','visceral_fat','muscle_kg','chest_cm','arm_cm','thigh_cm'];
    const m = {id: d.id, client_id: d.client_id, date: d.date, sleep: d.sleep, stress: d.stress, energy: d.energy};
    K.forEach(k => m[k] = num(d[k]));
    if (m.weight_kg == null && m.waist_cm == null) return toast('Apunta al menos tu peso o tu cintura');
    if ([d.diet, d.sleep, d.stress, d.energy].some(v => v == null)) return toast('Puntúa dieta, sueño, estrés y energía del 1 al 5');
    m.notes = [`Dieta ${d.diet}/5`, d.comment.trim()].filter(Boolean).join('\n');
    el.disabled = true; el.textContent = 'Enviando...';
    try {
      const r = await saveOrQueue('metric', m);
      const photos = Object.entries(S.ckPhotos || {}); let up = 0, photoErr = false;
      for (const [pose, f] of photos){
        try { el.textContent = `Subiendo fotos ${up + 1} de ${photos.length}`; await api.uploadPhoto({id: uid(), client_id: d.client_id, date: d.date, pose}, await compressImage(f)); up++; }
        catch(e){ photoErr = true; }
      }
      const p = d._prev, dw = p && m.weight_kg != null ? m.weight_kg - num(p.weight_kg) : null;
      const line = (l, v, u, pv) => v == null ? null : `${l}: ${fmtNum(v)} ${u}${pv != null ? ` (${v - num(pv) === 0 ? '±0' : sign(v - num(pv))})` : ''}`;
      const body = ['Check-in',
        line('Peso', m.weight_kg, 'kg', p?.weight_kg), line('Cintura', m.waist_cm, 'cm', p?.waist_cm), line('Cadera', m.hip_cm, 'cm', p?.hip_cm),
        trainingOn() ? `Entrenos 7 días: ${d._n7}` : null, `Dieta ${d.diet}/5 · Sueño ${d.sleep}/5 · Estrés ${d.stress}/5 · Energía ${d.energy}/5`,
        up ? `Fotos: ${up}` : null, d.comment.trim() ? `\n${d.comment.trim()}` : null].filter(Boolean).join('\n');
      await saveOrQueue('msg', {id: uid(), client_id: d.client_id, sender_id: S.me.id, body}).catch(() => {});
      toast(photoErr ? 'Check-in enviado, pero alguna foto no se ha subido. Súbela luego en Progreso.' : r._pending ? 'Guardado en el móvil. Se enviará al volver la conexión.' : (dw != null && dw < 0 ? '¡Check-in enviado! Vas por buen camino' : '¡Check-in enviado!'), 4000);
      S.ckPhotos = {}; S.stack = []; go('today', {}, false);
    } catch(e){ toast(e.message); el.disabled = false; el.textContent = 'Enviar check-in'; }
  },
  async payTransfer(){
    const b = await api.billing(S.me.id).catch(() => null); if (!b) return;
    modal(`<h2>Pago por transferencia</h2><p class="small muted" style="margin:4px 0 12px">${esc(b.plan_name)}, ${esc(priceTxt(b))}.</p>${transferHTML(b, S.me.full_name)}
      <button class="btn light block" data-x="ok" style="margin-top:14px">Cerrar</button>`, (m, close) => m.querySelector('[data-x=ok]').onclick = close);
  },
  async copyIban(){ const v = ibanClean(payCfg().iban); try { await navigator.clipboard.writeText(v); toast('IBAN copiado'); } catch(e){ toast('Mantén pulsado el IBAN para copiarlo'); } },
  async planFromDoc(el){
    const d = (S.cache.docs || []).find(x => x.id === el.dataset.id); if (!d) return;
    el.disabled = true; toast('Leyendo el PDF', 15000);
    try {
      const urls = await api.fileUrls([d.path]); const res = await fetch(urls[d.path]); if (!res.ok) throw new Error('No se ha podido descargar el PDF');
      const imp = await planFromPdf(new Uint8Array(await res.arrayBuffer()), d.name + '.pdf');
      $('#toast')?.classList.remove('show'); await offerImport(imp, S.p.id, d.name);
    } catch(e){ toast(isNetErr(e) ? 'Sin conexión. Inténtalo de nuevo.' : 'No he podido leer este PDF. ' + (e.message || '')); }
    el.disabled = false;
  },
  welcomePreview: () => { const f = $('#fWelcome'); showWelcome({title: f.title.value || WELCOME_DEFAULT.title, body: f.body.value || WELCOME_DEFAULT.body}, 'Ana García'); },
  async welcomeReset(el){
    if (!(await confirmBox('Mostrar la bienvenida', 'Tu cliente volverá a ver el mensaje de bienvenida la próxima vez que entre.', 'Sí, mostrar'))) return;
    try { await api.updateProfile(el.dataset.id, {welcomed_at: null}, true); toast('La verá la próxima vez que entre'); render(); } catch(e){ toast(e.message); }
  },
  logSummary: el => go('logSummary', {id: el.dataset.id, cid: el.dataset.cid}),
  mscale: el => { S.draft[el.dataset.k] = +el.dataset.v; el.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === el)); },
  async metricSave(el){
    const m = {...S.draft}; ['weight_kg','height_cm','waist_cm','hip_cm','chest_cm','arm_cm','thigh_cm','body_fat','visceral_fat','muscle_kg'].forEach(k => m[k] = num(m[k]));
    if (['weight_kg','waist_cm','hip_cm','body_fat','visceral_fat','muscle_kg','sleep'].every(k => m[k] == null)) return toast('Apunta al menos una medida');
    if (m.height_cm != null && num(S.me.height_cm) !== m.height_cm) api.updateProfile(S.me.id, {height_cm: m.height_cm}, false).then(p => { if (p) S.me = p; }).catch(() => {});
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
  async payNow(el){
    el.disabled = true; const t = el.innerHTML; el.textContent = 'Abriendo pago seguro';
    try {
      const r = await api.checkout();
      if (r && r.demo){ toast('Demo: pago simulado. En la app real se abre la página segura de Stripe.', 3500); render(); return; }
      if (r && r.url) location.href = r.url; else throw new Error('No se ha podido abrir el pago');
    } catch(e){ toast(e.message); el.disabled = false; el.innerHTML = t; }
  },
  async payPortal(el){
    el.disabled = true;
    try {
      const r = await api.portal();
      if (r && r.demo){ toast('Demo: en la app real se abre la página segura de Stripe para cambiar la tarjeta, ver recibos o cancelar.', 4000); el.disabled = false; return; }
      if (r && r.url) location.href = r.url; else throw new Error('No se ha podido abrir la gestión de pagos');
    } catch(e){ toast(e.message); el.disabled = false; }
  },
  async removePlan(el){
    const cid = S.p.id, b = S.cache.billing;
    if (el.dataset.sub === '1'){
      return modal(`<h2>Primero cancela la suscripción</h2><p class="muted">Este cliente tiene una suscripción en marcha y Stripe le seguiría cobrando. Pulsa <b>Ver en Stripe</b>, cancela su suscripción y después ya podrás quitarle el plan aquí.</p><button class="btn block" data-x="ok" style="margin-top:12px">Entendido</button>`, (m, close) => { m.querySelector('[data-x=ok]').onclick = close; });
    }
    if (!(await confirmBox('Quitar plan de pago', 'El cliente dejará de ver el botón Pagar. El historial de pagos se conserva y podrás ponerle otro plan cuando quieras.', 'Quitar plan', true))) return;
    await api.saveBilling({client_id: cid, plan_name: null, amount_cents: null, currency: 'eur', period: (b && b.period) || 'month', manual_until: null});
    toast('Plan quitado'); render();
  },
  async delPayment(el){ if (!(await confirmBox('Borrar pago', 'Se borrará este pago apuntado a mano.', 'Borrar', true))) return; await api.deletePayment(el.dataset.id); toast('Pago borrado'); render(); },
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
<p><b>App Salud del iPhone (opcional):</b> solo si tú lo conectas y das tu permiso en Perfil › Salud del iPhone, recibimos los datos que marques (pasos, sueño, pulsaciones en reposo, variabilidad cardiaca, calorías activas y peso). Los envía un atajo de tu iPhone. Puedes cambiar qué compartes o desconectarlo cuando quieras, y borrar lo ya enviado.</p>
<p><b>Avisos en el móvil (opcional):</b> si los activas, guardamos la dirección de avisos de tu móvil para mandarte recordatorios, como el aviso de pasos de la noche. Puedes desactivarlos en Perfil o en los Ajustes del iPhone.</p>
<p><b>Base legal:</b> tu consentimiento explícito, que das al crear la cuenta y puedes retirar cuando quieras.</p>
<p><b>Quién los ve:</b> tú y tu coach. Se guardan en servidores de Supabase en la Unión Europea. No se venden ni se ceden a terceros.</p>
<p><b>Cuánto tiempo:</b> mientras seas cliente. Si te das de baja, se borran cuando lo pidas.</p>
<p><b>Tus derechos:</b> puedes pedir acceso, corrección, borrado o una copia de tus datos escribiendo a tu coach. También puedes reclamar ante la Agencia Española de Protección de Datos.</p>
</div>`;

/* =====================================================================
   Arranque
   ===================================================================== */
/* Actualizaciones: al volver a la app busca versión nueva y, cuando se instala, recarga (sin perder lo que se está escribiendo) */
const APP_VERSION = 21;
if ('serviceWorker' in navigator){
  const had = !!navigator.serviceWorker.controller; let pend = false;
  const reloadSafe = () => { if (!S.draft) location.reload(); else pend = true; };
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (had) reloadSafe(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    navigator.serviceWorker.getRegistration().then(r => r && r.update()).catch(() => {});
    if (pend && !S.draft) location.reload();
  });
}
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
    await refreshSettings();
    if (S.me.role !== 'coach'){ try { S.myRule = planRule((await api.billing(S.me.id))?.plan_name); } catch(e){} }
    home();
    maybeWelcome();
  } catch(e){
    console.error(e);
    if (isNetErr(e)) $('#app').innerHTML = authWrap(`<h1>Sin conexión</h1><p>No hemos podido conectar. Comprueba tu internet y vuelve a intentarlo.</p><button class="btn block" data-act="reload">Reintentar</button>`);
    else { S.me = null; go('login', {}, false); }
  }
}
api.onAuth((ev) => { if (ev === 'PASSWORD_RECOVERY'){ S.recovery = true; go('resetPw', {}, false); } });
boot();
})();
