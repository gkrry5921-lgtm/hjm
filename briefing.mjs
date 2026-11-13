// 아침 알림 문구를 만드는 함수 모음 (아이폰 푸시 · 슬랙 공용)
export const WD = ['일', '월', '화', '수', '목', '금', '토'];
const CATS = ['NCMN', 'CGN', '개인일정', '퐁당'];
const KST = 9 * 3600 * 1000;

export const kstNow = () => new Date(Date.now() + KST);
export const ymd = d => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
const dOf = ds => new Date(ds + 'T00:00:00Z');
export const md = ds => { const d = dOf(ds); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`; };
export const label = ds => { const d = dOf(ds); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WD[d.getUTCDay()]})`; };
const addDays = (ds, n) => { const d = dOf(ds); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };
const diffDays = (a, b) => Math.round((dOf(b) - dOf(a)) / 86400000);
const catName = c => c === '개인일정' ? '개인' : (c || '');
const sortEvents = (a, b) =>
  Number(!!a.done) - Number(!!b.done) ||
  CATS.indexOf(a.cat) - CATS.indexOf(b.cat) ||
  String(a.title).localeCompare(String(b.title), 'ko');

export function weekRange(today) {
  const dow = dOf(today).getUTCDay();
  const ws = addDays(today, -((dow + 6) % 7));
  return { ws, we: addDays(ws, 6) };
}

export function todayEvents(events, today) {
  return events
    .filter(e => e.start && e.start <= today && (e.end || e.start) >= today)
    .sort(sortEvents);
}

// ---------------- 아이폰 푸시 ----------------
export function buildPush(events, today) {
  const list = todayEvents(events, today);
  if (!list.length) return { title: `${label(today)} 오늘 일정`, body: '오늘 등록된 일정이 없어요.' };
  const lines = list.map(e => {
    const end = e.end || e.start;
    const range = e.start !== end ? ` (~${md(end)})` : '';
    return `${e.done ? '✓' : '•'} [${catName(e.cat)}] ${e.title}${range}`;
  });
  let body = lines.join('\n');
  if (body.length > 1500) body = body.slice(0, 1500) + '\n…';
  return { title: `${label(today)} 오늘 일정 ${list.length}개`, body };
}

// ---------------- 슬랙 ----------------
const sx = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const repeatText = r => {
  if (!r.repeat) return '';
  if (r.repeat === 'weekly' && r.due) return `매주 ${WD[dOf(r.due).getUTCDay()]}`;
  if (r.repeat === 'monthly' && r.due) return `매월 ${dOf(r.due).getUTCDate()}일`;
  return r.repeat === 'daily' ? '매일' : '';
};

// 밤 11시에 보내는 '내일 준비' 브리핑. today = 보내는 날(오늘), tomorrow = 다음 날
export function buildSlack({ events = [], memos = [], routines = [] }, today, appUrl = '') {
  const tomorrow = addDays(today, 1);
  const { ws, we } = weekRange(today);
  const tw = weekRange(tomorrow);
  const evs = todayEvents(events, tomorrow);
  const ms = memos.filter(m => m.date === tomorrow);
  const open = routines.filter(r => !r.taskDone)
    .sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || (a.createdAt || 0) - (b.createdAt || 0));
  const unfinished = open.filter(r => r.due && r.due <= today);
  const tmr = open.filter(r => r.due === tomorrow);
  const later = open.filter(r => r.due && r.due > tomorrow && r.due <= tw.we);
  const nodue = open.filter(r => !r.due);
  const wkEv = events.filter(e => e.start && e.start <= we && (e.end || e.start) >= ws);
  const wkDone = wkEv.filter(e => e.done).length;
  const pct = wkEv.length ? Math.round(wkDone / wkEv.length * 100) : 0;
  const todayLeft = todayEvents(events, today).filter(e => !e.done);

  const evLine = e => {
    const end = e.end || e.start;
    const range = e.start !== end ? ` _(${md(e.start)}~${md(end)})_` : '';
    const dur = e.duration ? ` · ${sx(e.duration)}` : '';
    return `• [${sx(catName(e.cat))}] ${sx(e.title)}${range}${dur}`;
  };
  const taskLine = (r, kind) => {
    const rep = repeatText(r);
    let due = '';
    if (kind === 'late') { const d = diffDays(r.due, today); due = d === 0 ? ' · 오늘까지' : ` · *${d}일 지남*`; }
    else if (kind === 'later') due = ` · ${label(r.due)}`;
    return `• [${sx(catName(r.cat))}] ${sx(r.title)}${rep ? ` 🔁${rep}` : ''}${due}`;
  };
  const section = text => ({ type: 'section', text: { type: 'mrkdwn', text: text.length > 2900 ? text.slice(0, 2900) + '\n…' : text } });

  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: `🌙 내일 준비 · ${label(tomorrow)}`, emoji: true } },
    section(`*📅 내일 일정 ${evs.length}개*\n` + (evs.length ? evs.map(evLine).join('\n') : '내일 등록된 일정이 없어요.') +
      (ms.length ? `\n\n*📝 내일 메모*\n` + ms.map(m => `• ${sx(m.text)}`).join('\n') : '')),
    section(`*🗂 내일 마감 업무 ${tmr.length}개*\n` + (tmr.length ? tmr.map(r => taskLine(r, 'tmr')).join('\n') : '내일 마감인 업무가 없어요.')),
    { type: 'divider' }
  ];
  if (unfinished.length || todayLeft.length) {
    const parts = [];
    if (unfinished.length) parts.push(`*🔴 아직 안 끝난 업무 ${unfinished.length}개*\n` + unfinished.map(r => taskLine(r, 'late')).join('\n'));
    if (todayLeft.length) parts.push(`*오늘 일정 중 체크 안 된 것 ${todayLeft.length}개*\n` + todayLeft.map(evLine).join('\n'));
    blocks.push(section(parts.join('\n\n')));
  } else {
    blocks.push(section('*✅ 오늘까지 할 일은 모두 끝났어요.*'));
  }
  if (later.length) blocks.push(section(`*📌 ${tw.ws === ws ? '이번 주 남은 업무' : '다음 주 업무'} ${later.length}개*\n` + later.map(r => taskLine(r, 'later')).join('\n')));
  if (nodue.length) blocks.push(section(`*마감 없는 업무 ${nodue.length}개*\n` + nodue.slice(0, 5).map(r => taskLine(r, 'nodue')).join('\n') + (nodue.length > 5 ? `\n…외 ${nodue.length - 5}개` : '')));
  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: `이번 주(${md(ws)}~${md(we)}) 일정 ${wkEv.length}개 중 ${wkDone}개 완료 · ${pct}%` + (appUrl ? `  |  <${appUrl}|체크리스트 열기>` : '') }]
  });

  const text = `내일(${label(tomorrow)}) 준비 · 일정 ${evs.length}개, 마감 업무 ${tmr.length}개, 안 끝난 업무 ${unfinished.length}개`;
  return { text, blocks };
}
