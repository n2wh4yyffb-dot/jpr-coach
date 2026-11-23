// JPR Coach · función health-ingest
// Recibe los datos que envía el atajo "JPR Salud" desde el iPhone de cada cliente.
// Supabase > Edge Functions > Deploy a new function > Via Editor > nombre: health-ingest
// Después, en los detalles de la función, desactivar "Verify JWT".
import { createClient } from 'npm:@supabase/supabase-js@2';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

// Convierte lo que manda Atajos en número: 8432, "8432", "8.432 pasos", "7,5 h", "58 lpm"…
export function toNum(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (Array.isArray(v)) { const ns = v.map(toNum).filter((n): n is number => n != null); return ns.length ? ns.reduce((a, b) => a + b, 0) : null; }
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).trim().replace(/ | /g, ' ');
  const m = s.match(/-?\d[\d.,\s]*/); if (!m) return null;
  s = m[0].replace(/\s/g, '');
  const lastC = s.lastIndexOf(','), lastD = s.lastIndexOf('.');
  if (lastC >= 0 && lastD >= 0) {
    // el último separador es el decimal: "1.234,5" o "1,234.5"
    s = lastC > lastD ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastC >= 0) {
    s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (lastD >= 0 && /^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, ''); // "8.432" en español = ocho mil
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

// El sueño puede llegar en horas, minutos o segundos según la versión de iOS
export function sleepHours(v: unknown): number | null {
  if (Array.isArray(v)) { const hs = v.map(sleepHours).filter((n): n is number => n != null); return hs.length ? hs.reduce((a, b) => a + b, 0) : null; }
  const raw = String(v ?? '').trim();
  if (/\n/.test(raw)) return sleepHours(raw.split(/\n+/).map(x => x.trim()).filter(Boolean)); // lista de tramos
  const hms = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);            // "7:20" o "7:20:00"
  if (hms) return +hms[1] + +hms[2] / 60 + (+(hms[3] || 0)) / 3600;
  const hm = raw.match(/(\d+(?:[.,]\d+)?)\s*h\D*?(\d+)\s*min/i);       // "7 h 20 min"
  if (hm) return toNum(hm[1])! + +hm[2] / 60;
  let n = toNum(v); if (n == null) return null;
  if (/min/i.test(raw)) n = n / 60;
  else if (/\bs\b|seg|sec/i.test(raw)) n = n / 3600;
  else if (n > 1440) n = n / 3600; else if (n > 24) n = n / 60;
  return n;
}

const madridDay = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date());
const inRange = (n: number | null, lo: number, hi: number) => (n != null && n >= lo && n <= hi ? n : null);
const round = (n: number | null, d = 1) => (n == null ? null : Math.round(n * 10 ** d) / 10 ** d);

export function parsePayload(b: Record<string, unknown>) {
  return {
    steps: round(inRange(toNum(b.steps ?? b.pasos), 0, 150000), 0),
    active_kcal: round(inRange(toNum(b.active_kcal ?? b.calorias), 0, 15000), 0),
    resting_hr: round(inRange(toNum(b.resting_hr ?? b.fc_reposo), 25, 150), 0),
    hrv_ms: round(inRange(toNum(b.hrv_ms ?? b.vfc), 1, 300), 0),
    sleep_h: round(inRange(sleepHours(b.sleep_h ?? b.sueno), 0, 20), 2),
    weight_kg: round(inRange(toNum(b.weight_kg ?? b.peso), 25, 350), 1),
  };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'Usa POST' }, 405);
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return json({ ok: false, error: 'El atajo no ha enviado datos válidos' }, 400); }

  const token = String(body.token ?? body.codigo ?? req.headers.get('x-jpr-token') ?? '').trim();
  if (token.length < 24) return json({ ok: false, error: 'Falta tu código de JPR Coach' }, 401);

  const { data: link, error: e1 } = await sb.from('health_links').select('client_id, metrics').eq('token', token).maybeSingle();
  if (e1) return json({ ok: false, error: 'Error del servidor' }, 500);
  if (!link) return json({ ok: false, error: 'Código no válido. Vuelve a conectar Salud en la app JPR Coach.' }, 401);

  const parsed = parsePayload(body);
  const allowed = new Set(link.metrics || []);
  const row: Record<string, unknown> = { client_id: link.client_id, day: madridDay(), updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(parsed)) if (allowed.has(k) && v != null) row[k] = v; // solo lo que el cliente aceptó

  if (Object.keys(row).length > 3) {
    const { error: e2 } = await sb.from('health_daily').upsert(row, { onConflict: 'client_id,day' });
    if (e2) return json({ ok: false, error: 'No se ha podido guardar' }, 500);
  }
  // Lo que llegó (sin el código), para revisar el atajo si algo no cuadra
  const raw: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) if (!['token', 'codigo'].includes(k)) raw[k] = typeof v === 'string' ? v.slice(0, 80) : v;
  await sb.from('health_links').update({ last_sync_at: new Date().toISOString(), last_payload: raw }).eq('client_id', link.client_id);

  return json({ ok: true, guardado: Object.keys(row).filter(k => !['client_id', 'day', 'updated_at'].includes(k)) });
});
