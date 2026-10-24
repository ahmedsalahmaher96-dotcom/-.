/* واجهة المستخدم: التوجيه بين الصفحات، الحالة، الحفظ المحلي، وربط الوحدات (الملفات، الصوت، محرك الذكاء الاصطناعي). */
(function () {
  'use strict';
  const D = IMS.data, F = IMS.files, S = IMS.speech, AI = IMS.ai, ADMIN = IMS.admin;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Math.random().toString(36).slice(2, 10);

  /* داخل إطار مستضاف (مثل صفحة منشورة) يُمنع الميكروفون والطباعة والاتصال بخوادم خارجية */
  const IN_FRAME = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();
  const STT = S.sttSupported && !IN_FRAME;

  const SESSION_KEY = 'ims.session.v1';
  const SETTINGS_KEY = 'ims.settings.v1';
  const store = {
    get(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* تجاهل */ } }
  };

  const EXP = { graduate: 'حديث تخرج', junior: 'مبتدئ', mid: 'متوسط', senior: 'خبير', manager: 'مدير' };
  const DIFF = { beginner: 'مبتدئ', intermediate: 'متوسط', advanced: 'متقدم', competitive: 'تنافسي' };
  const LANG = { ar: 'العربية', en: 'English (الإنجليزية)' };
  const BANK = IMS.planningBank || null;
  const MODES = {
    bank: { t: 'بنك أسئلة مهندس التخطيط (من ملفك)', d: `${BANK ? BANK.questions.length : 0} سؤالاً من الملف المرفق مع إجاباتها المرجعية، مصنفة حسب الموضوع والصعوبة.` },
    file: { t: 'اعتماداً على ملف الأسئلة', d: 'تُطرح أسئلة ملفك بالترتيب نفسه دون حذف.' },
    cvjd: { t: 'اعتماداً على السيرة الذاتية والوصف الوظيفي', d: 'أسئلة مبنية على متطلبات الوظيفة وخبراتك المذكورة.' },
    technical: { t: 'مقابلة فنية متخصصة', d: 'أسئلة تقنية في تخصصك ومعاييره المهنية.' },
    behavioral: { t: 'مقابلة سلوكية', d: 'مواقف مهنية تُقيَّم ببنية STAR.' },
    comprehensive: { t: 'مقابلة شاملة', d: 'مزيج متوازن من الأسئلة العامة والفنية والسلوكية.' }
  };
  const QTYPE = { bank: 'من ملف أسئلة مهندس التخطيط', general: 'عام', behavioral: 'سلوكي', technical: 'فني', file: 'من ملف الأسئلة', document: 'من السيرة/الوصف', followup: 'سؤال متابعة' };
  const SLOTS = [
    { key: 'cv', title: 'السيرة الذاتية (CV)', desc: 'تُستخدم لصياغة أسئلة عن خبراتك ومقارنتها بمتطلبات الوظيفة.' },
    { key: 'jd', title: 'الوصف الوظيفي (Job Description)', desc: 'يساعد على توجيه الأسئلة نحو متطلبات الوظيفة المستهدفة.' },
    { key: 'questions', title: 'ملف أسئلة المقابلة', desc: 'ضع كل سؤال في سطر مستقل (يُفضل ترقيمها). ستُطرح بالترتيب نفسه.' },
    { key: 'extra', title: 'ملفات إضافية', desc: 'أي ملفات ذات صلة (حتى 5 ملفات)، مثل ملخص مشاريع أو شهادات.', multiple: true }
  ];
  const FLOW = [
    { v: 'field', l: 'التخصص' }, { v: 'details', l: 'البيانات' }, { v: 'files', l: 'الملفات' },
    { v: 'setup', l: 'الإعداد' }, { v: 'interview', l: 'المقابلة' }, { v: 'report', l: 'التقرير' }
  ];

  /* ---------- الحالة ---------- */
  function freshState() {
    return {
      v: 1, seed: Date.now(), deptId: null, field: null, group: null, sub: null, customField: '', customSub: '',
      details: { title: '', exp: '', lang: 'ar', diff: 'intermediate', market: '' },
      files: { cv: null, jd: null, questions: null, extra: [] }, fileQuestions: null,
      storeFiles: false, analysis: null, analysisSig: '',
      setup: { mode: 'comprehensive', count: 6, bankTopics: null, bankLevels: null, bankOrder: 'file', bankCount: 'all' },
      questions: [], current: 0, answers: {}, drafts: {}, status: 'draft',
      startedAt: null, finishedAt: null, report: null
    };
  }
  let state = freshState();
  const defaults = { engine: 'demo', apiBase: location.protocol === 'file:' ? 'http://localhost:8787/api' : '/api', ttsRate: 1, autoSpeak: true, micExplained: false };
  let settings = Object.assign({}, defaults, store.get(SETTINGS_KEY) || {});
  if (IN_FRAME) settings.engine = 'demo';
  const ui = { retrying: false, recording: false, rec: null, lastEval: null, persistTimer: null };

  function saveSettings() { store.set(SETTINGS_KEY, settings); renderBadge(); }

  function persist() {
    const copy = JSON.parse(JSON.stringify(state));
    if (!copy.storeFiles) {
      ['cv', 'jd', 'questions'].forEach(k => { if (copy.files[k]) { copy.files[k].text = null; copy.files[k].notStored = true; } });
      copy.files.extra.forEach(f => { f.text = null; f.notStored = true; });
    }
    if (!store.set(SESSION_KEY, copy)) toast('تعذر حفظ الجلسة على هذا الجهاز (قد يكون التخزين ممتلئاً أو معطلاً).', 'error');
  }
  function persistSoon() { clearTimeout(ui.persistTimer); ui.persistTimer = setTimeout(persist, 600); }

  function restore() {
    const s = store.get(SESSION_KEY);
    if (s && s.v === 1 && s.field) {
      const fresh = freshState();
      state = Object.assign(fresh, s, { setup: Object.assign(fresh.setup, s.setup) });
      return true;
    }
    return false;
  }

  function hasProgress() { return !!state.field; }

  /* ---------- مشتقات ---------- */
  const field = () => state.field ? D.fieldById(state.field) : null;
  function fieldName() { return state.field === 'other' ? (state.customField.trim() || 'تخصص آخر') : (field() ? field().name : ''); }
  function groupName() { const f = field(); const g = f && f.groups.find(x => x.id === state.group); return g ? g.name : ''; }
  function subName() { return state.customSub.trim() || state.sub || ''; }
  function fileText(k) { const f = state.files[k]; return f && f.status !== 'error' && f.text ? f.text : ''; }
  function ctx() {
    const f = field();
    return {
      fieldId: state.field, field: fieldName(), fieldEn: f ? f.en : '', group: groupName(), sub: subName(),
      title: state.details.title.trim(), exp: state.details.exp, expLabel: EXP[state.details.exp] || '',
      lang: state.details.lang, diff: state.details.diff, diffLabel: DIFF[state.details.diff], market: state.details.market.trim(),
      mode: state.setup.mode, count: state.setup.count, seed: state.seed,
      bankTopics: state.setup.bankTopics, bankLevels: state.setup.bankLevels, bankOrder: state.setup.bankOrder, bankCount: state.setup.bankCount,
      cvText: fileText('cv'), jdText: fileText('jd'),
      extraText: state.files.extra.filter(x => x.text).map(x => x.text).join('\n\n'),
      fileQuestions: state.fileQuestions
    };
  }
  const fieldDone = () => !!(state.field && (state.field === 'other' ? state.customField.trim() && subName() : subName()));
  const detailsDone = () => fieldDone() && state.details.title.trim().length >= 2 && !!state.details.exp;
  const lastAttempt = (q) => { const a = state.answers[q.id]; return a && a.length ? a[a.length - 1] : null; };
  const isReading = () => ['cv', 'jd', 'questions'].some(k => state.files[k] && state.files[k].status === 'reading') || state.files.extra.some(f => f.status === 'reading');

  /* ---------- أدوات واجهة ---------- */
  function toast(msg, type) {
    const el = document.createElement('div');
    el.className = 'toast toast-' + (type || 'info');
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.innerHTML = `<span>${esc(msg)}</span><button type="button" class="icon-btn" aria-label="إغلاق التنبيه">✕</button>`;
    el.querySelector('button').onclick = () => el.remove();
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), type === 'error' ? 9000 : 5000);
  }

  function setLoading(on, text) {
    $('#loading').hidden = !on;
    if (text) $('#loadingText').textContent = text;
    document.body.setAttribute('aria-busy', on ? 'true' : 'false');
  }

  function modal(opts) {
    return new Promise(resolve => {
      const dlg = $('#modal');
      $('#modalTitle').textContent = opts.title;
      $('#modalBody').innerHTML = opts.html || '';
      const foot = $('#modalActions');
      foot.innerHTML = '';
      let done = false;
      const finish = (v) => { if (done) return; done = true; if (dlg.open) dlg.close(); resolve(v); };
      (opts.actions || [{ label: 'إغلاق', value: false, kind: 'secondary' }]).forEach(a => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'btn btn-' + (a.kind || 'secondary'); b.textContent = a.label;
        b.onclick = () => finish(a.value);
        foot.appendChild(b);
      });
      $('#modalClose').onclick = () => finish(false);
      dlg.oncancel = (e) => { e.preventDefault(); finish(false); };
      dlg.showModal();
      const primary = foot.querySelector('.btn-primary, .btn-danger') || foot.querySelector('button');
      if (primary) primary.focus();
    });
  }
  const confirmBox = (title, html, ok, kind) => modal({ title, html, actions: [{ label: 'إلغاء', value: false, kind: 'ghost' }, { label: ok || 'تأكيد', value: true, kind: kind || 'primary' }] });

  function renderBadge() {
    const b = $('#engineBadge');
    if (!b) return;
    if (settings.engine === 'remote') { b.className = 'engine-badge live'; b.textContent = 'محرك: خادم ذكاء اصطناعي'; b.title = 'يتم التقييم عبر خادم API: ' + settings.apiBase; }
    else { b.className = 'engine-badge demo'; b.textContent = 'الوضع التجريبي'; b.title = 'التقييم بقواعد محلية محددة وليس بالذكاء الاصطناعي. اضغط لتغيير المحرك.'; }
  }

  function renderStepper(view) {
    const nav = $('#stepper');
    const idx = FLOW.findIndex(s => s.v === view);
    if (idx < 0 || state.deptId) { nav.hidden = true; return; }
    nav.hidden = false;
    nav.innerHTML = `<ol class="container">${FLOW.map((s, i) => `<li class="${i < idx ? 'done' : i === idx ? 'current' : ''}" ${i === idx ? 'aria-current="step"' : ''}><span class="step-num">${i < idx ? '✓' : i + 1}</span><span class="step-label">${s.l}</span></li>`).join('')}</ol>`;
  }

  /* ---------- التوجيه ---------- */
  const VIEWS = ['home', 'field', 'details', 'files', 'setup', 'interview', 'report', 'settings', 'admin'];
  /* نسختان من الصفحة نفسها: admin.html تعرّف IMS_APP = 'admin'، وindex.html هي النسخة العامة للموظفين */
  const APP = window.IMS_APP === 'admin' ? 'admin' : 'public';
  /* الإعدادات في نسخة الإدارة فقط، وتنطبق على الجهاز الذي ضُبطت عليه */
  const ALLOWED = APP === 'admin' ? ['admin', 'settings'] : ['home', 'interview', 'report'];
  let currentView = null;

  function guard(v) {
    if (v === 'settings' && !ADMIN.isUnlocked()) return ['admin', 'أدخل الرقم السري لفتح الإعدادات.'];
    if (v === 'details' && !fieldDone()) return ['field', 'اختر المجال والتخصص أولاً.'];
    if ((v === 'files' || v === 'setup') && !detailsDone()) return [fieldDone() ? 'details' : 'field', 'أكمل بيانات المقابلة أولاً.'];
    if (v === 'interview' && !state.questions.length) return ['home', 'لا توجد مقابلة جارية. اختر قسمك لبدء المقابلة.'];
    if (v === 'report' && !state.report) return [state.questions.length ? 'interview' : 'home', 'لا يوجد تقرير بعد. أنهِ المقابلة أولاً لعرض التقرير.'];
    return null;
  }

  function route() {
    let v = (location.hash || '#' + ALLOWED[0]).slice(1);
    if (!ALLOWED.includes(v)) v = ALLOWED[0];
    const g = guard(v);
    if (g) { toast(g[1], 'info'); location.replace('#' + g[0]); return; }
    if (currentView === 'interview' && v !== 'interview') stopVoice();
    currentView = v;
    VIEWS.forEach(n => { const sec = $('#view-' + n); if (sec) sec.hidden = n !== v; });
    $$('.main-nav a').forEach(a => {
      const active = a.dataset.nav === v || (a.dataset.nav === 'field' && ['field', 'details', 'files', 'setup'].includes(v));
      if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    closeNav();
    renderStepper(v);
    render(v);
    window.scrollTo(0, 0);
    const h = $('#view-' + v + ' h1');
    if (h) h.focus({ preventScroll: true });
    if (v === 'setup') maybeAnalyze();
    if (v === 'interview') onEnterInterview();
  }
  const go = (v) => { if (location.hash === '#' + v) route(); else location.hash = v; };

  function render(v) {
    v = v || currentView;
    const el = $('#view-' + v);
    el.innerHTML = VIEW[v]();
  }

  /* ---------- الصفحات ---------- */
  const VIEW = {};

  /* الرئيسية للموظف: يختار قسمه ويبدأ المقابلة مباشرة. الأسئلة يضيفها المسؤول من لوحة الإدارة فقط */
  VIEW.home = () => {
    const resumable = state.deptId && state.questions.length && state.status !== 'done';
    const depts = ADMIN.departments().map(d => Object.assign({ count: ADMIN.questionsFor(d.id).length }, d)).filter(d => d.count > 0);
    return `
      <header class="view-head">
        <p class="eyebrow">محاكي مقابلات العمل</p>
        <h1 tabindex="-1">اختر قسمك وابدأ المقابلة</h1>
        <p class="lead">ستُطرح عليك أسئلة قسمك سؤالاً بعد سؤال. اكتب إجابتك أو قلها صوتياً، وبعد كل إجابة ستعرف تقييمك، وإن كانت إجابتك غير صحيحة ستظهر لك الإجابة الصحيحة.</p>
      </header>
      ${resumable ? `<div class="alert alert-info"><b>لديك مقابلة لم تكتمل:</b> ${esc(state.details.title)} — أجبت عن ${answeredCount()} من ${state.questions.length}.
        <div class="btn-row" style="margin-top:.5rem"><button type="button" class="btn btn-primary" data-action="resume">استكمال المقابلة</button></div></div>` : ''}
      ${state.deptId && state.status === 'done' ? `<p><a class="link" href="#report">عرض تقرير آخر مقابلة</a></p>` : ''}
      ${depts.length ? `<div class="dept-grid">${depts.map(d => `<button type="button" class="dept-card" data-action="pick-dept" data-id="${esc(d.id)}">
          <span class="fc-icon" aria-hidden="true">${esc(d.icon || '🗂️')}</span><span class="fc-name">${esc(d.name)}</span>
          <span class="fc-meta">${d.count} سؤالاً</span>${d.desc ? `<p>${esc(d.desc)}</p>` : ''}</button>`).join('')}</div>`
        : '<div class="alert alert-warn">لا توجد أقسام بها أسئلة حتى الآن. يضيف المسؤول الأقسام والأسئلة من لوحة الإدارة.</div>'}
      <section class="section" aria-labelledby="howTitle">
        <h2 id="howTitle">طريقة المقابلة</h2>
        <ol class="how-grid how-3">
          <li><span class="how-num">1</span><h3>اختر قسمك</h3><p>وحدد عدد الأسئلة التي تريد التدرب عليها.</p></li>
          <li><span class="how-num">2</span><h3>أجب عن كل سؤال</h3><p>استمع للسؤال، ثم اكتب إجابتك أو قلها صوتياً.</p></li>
          <li><span class="how-num">3</span><h3>تعلّم من الإجابة الصحيحة</h3><p>بعد كل إجابة ترى تقييمك والإجابة الصحيحة، وفي النهاية تقريراً كاملاً.</p></li>
        </ol>
      </section>`;
  };

  VIEW.field = () => {
    const f = field();
    return `
      <header class="view-head"><h1 tabindex="-1">اختر مجالك وتخصصك</h1><p>اختر المجال الرئيسي أولاً، وستظهر لك التخصصات التابعة له فقط.</p></header>
      <div class="panel">
        <h2 class="panel-title"><span class="num">1</span> المجال الرئيسي</h2>
        <div class="card-grid">
          ${D.FIELDS.map(x => {
            const n = x.groups.reduce((s, g) => s + g.items.length, 0);
            return `<button type="button" class="field-card ${state.field === x.id ? 'selected' : ''}" data-action="pick-field" data-id="${x.id}" aria-pressed="${state.field === x.id}">
              <span class="fc-icon" aria-hidden="true">${x.icon}</span><span class="fc-name">${esc(x.name)}</span>
              <span class="fc-meta">${n ? n + ' تخصصاً' : 'اكتبه يدوياً'}</span></button>`;
          }).join('')}
        </div>
      </div>
      ${f ? subPanel(f) : ''}
      <div class="actions-bar">
        <a href="#home" class="btn btn-ghost">رجوع</a>
        <button type="button" class="btn btn-primary" data-action="field-next" ${fieldDone() ? '' : 'disabled'}>التالي: بيانات المقابلة ←</button>
      </div>`;
  };

  function subPanel(f) {
    if (f.id === 'other') {
      return `<div class="panel" id="subPanel">
        <h2 class="panel-title"><span class="num">2</span> اكتب مجالك وتخصصك</h2>
        <div class="form-grid">
          <div class="form-row"><label for="customField">المجال <span class="req" aria-hidden="true">*</span></label>
            <input id="customField" type="text" data-bind="customField" value="${esc(state.customField)}" placeholder="مثال: الطيران، الإعلام، السياحة" autocomplete="off" required></div>
          <div class="form-row"><label for="customSub">التخصص الفرعي <span class="req" aria-hidden="true">*</span></label>
            <input id="customSub" type="text" data-bind="customSub" value="${esc(state.customSub)}" placeholder="مثال: مراقبة جوية" autocomplete="off" required></div>
        </div></div>`;
    }
    const multi = f.groups.length > 1;
    const g = multi ? f.groups.find(x => x.id === state.group) : f.groups[0];
    let html = '';
    if (multi) {
      html += `<div class="panel" id="groupPanel"><h2 class="panel-title"><span class="num">2</span> القسم داخل ${esc(f.name)}</h2>
        <div class="card-grid compact">${f.groups.map(x => `<button type="button" class="field-card small ${state.group === x.id ? 'selected' : ''}" data-action="pick-group" data-id="${x.id}" aria-pressed="${state.group === x.id}"><span class="fc-name">${esc(x.name)}</span><span class="fc-meta">${x.items.length} تخصصات</span></button>`).join('')}</div></div>`;
    }
    if (g) {
      html += `<div class="panel" id="subPanel"><h2 class="panel-title" id="subTitle"><span class="num">${multi ? 3 : 2}</span> التخصص الفرعي — ${esc(g.name)}</h2>
        <div class="radio-chips" role="radiogroup" aria-labelledby="subTitle">
          ${g.items.map(it => `<label class="radio-chip"><input type="radio" name="sub" value="${esc(it)}" ${state.sub === it && !state.customSub ? 'checked' : ''}><span>${esc(it)}</span></label>`).join('')}
        </div>
        <div class="form-row narrow"><label for="customSub">أو اكتب تخصصاً غير مدرج</label>
          <input id="customSub" type="text" data-bind="customSub" value="${esc(state.customSub)}" placeholder="اكتب تخصصك هنا" autocomplete="off"></div>
      </div>`;
    }
    return html;
  }

  VIEW.details = () => {
    const d = state.details;
    const pills = (name, map, val) => Object.entries(map).map(([k, l]) => `<label class="pill"><input type="radio" name="${name}" value="${k}" data-bind="details.${name}" ${val === k ? 'checked' : ''}><span>${esc(l)}</span></label>`).join('');
    return `
      <header class="view-head"><h1 tabindex="-1">بيانات المقابلة</h1><p>ساعدنا على تخصيص المقابلة لتناسب الوظيفة التي تستعد لها.</p></header>
      <form class="panel" id="detailsForm" novalidate>
        <div class="summary-line"><span>المجال: <b>${esc(fieldName())}</b></span>${groupName() && state.field !== 'other' && field().groups.length > 1 ? `<span>القسم: <b>${esc(groupName())}</b></span>` : ''}<span>التخصص: <b>${esc(subName())}</b></span><a href="#field" class="link">تعديل</a></div>
        <div class="form-row"><label for="jobTitle">المسمى الوظيفي <span class="req" aria-hidden="true">*</span></label>
          <input id="jobTitle" type="text" data-bind="details.title" value="${esc(d.title)}" placeholder="مثال: مهندس موقع، محاسب أول، ممرض طوارئ" required aria-describedby="jobTitleErr" autocomplete="organization-title">
          <p class="field-error" id="jobTitleErr" hidden>اكتب المسمى الوظيفي (حرفان على الأقل).</p></div>
        <fieldset class="form-row"><legend>مستوى الخبرة <span class="req" aria-hidden="true">*</span></legend>
          <div class="pills">${pills('exp', EXP, d.exp)}</div><p class="field-error" id="expErr" hidden>اختر مستوى الخبرة.</p></fieldset>
        <fieldset class="form-row"><legend>لغة المقابلة</legend><div class="pills">${pills('lang', LANG, d.lang)}</div>
          <p class="hint">واجهة المنصة عربية دائماً؛ هذا الخيار يحدد لغة الأسئلة والنطق والتعرف على الكلام.</p></fieldset>
        <fieldset class="form-row"><legend>مستوى الصعوبة</legend><div class="pills">${pills('diff', DIFF, d.diff)}</div></fieldset>
        <div class="form-row narrow"><label for="market">الدولة أو سوق العمل المستهدف (اختياري)</label>
          <input id="market" type="text" list="markets" data-bind="details.market" value="${esc(d.market)}" placeholder="مثال: السعودية">
          <datalist id="markets">${['السعودية', 'الإمارات', 'مصر', 'الكويت', 'قطر', 'عُمان', 'البحرين', 'الأردن', 'المغرب', 'الجزائر', 'تونس', 'العراق', 'لبنان', 'سوق دولي'].map(m => `<option value="${m}">`).join('')}</datalist></div>
      </form>
      <div class="actions-bar">
        <a href="#field" class="btn btn-ghost">→ رجوع: التخصص</a>
        <button type="button" class="btn btn-primary" data-action="details-next">التالي: الملفات ←</button>
      </div>`;
  };

  VIEW.files = () => `
      <header class="view-head"><h1 tabindex="-1">إرفاق الملفات</h1><p>جميع الملفات اختيارية، لكنها تجعل المقابلة أقرب إلى واقعك. تُقرأ الملفات داخل متصفحك ولا تُرفع إلى أي خادم في الوضع التجريبي.</p></header>
      <div class="upload-grid">${SLOTS.map(slotCard).join('')}</div>
      <div class="panel consent">
        <label class="check"><input type="checkbox" data-action="toggle-store" ${state.storeFiles ? 'checked' : ''}>
          <span><b>احفظ نصوص الملفات على هذا الجهاز</b> لاستكمال الجلسة لاحقاً. بدون هذه الموافقة يُحفظ اسم الملف فقط، ويُحذف نصه عند إغلاق الصفحة. يمكنك حذف البيانات في أي وقت من <a href="#settings">الإعدادات</a>.</span></label>
      </div>
      <div class="alert alert-info">ملاحظة: ملفات PDF الممسوحة ضوئياً (صور) لا تحتوي نصاً قابلاً للاستخراج وتحتاج إلى أداة OCR أولاً. قراءة PDF وDOCX تتطلب اتصالاً بالإنترنت لتحميل أداة القراءة مرة واحدة.</div>
      <div class="actions-bar">
        <a href="#details" class="btn btn-ghost">→ رجوع: البيانات</a>
        <button type="button" class="btn btn-primary" data-action="files-next">التالي: إعداد المقابلة ←</button>
      </div>`;

  function slotCard(slot) {
    const items = slot.multiple ? state.files.extra : (state.files[slot.key] ? [state.files[slot.key]] : []);
    const canAdd = slot.multiple ? items.length < 5 : !items.length;
    const inputId = 'file-' + slot.key;
    return `<div class="panel upload-card" data-drop="${slot.key}">
      <h2 class="upload-title">${esc(slot.title)}</h2><p class="hint">${esc(slot.desc)}</p>
      ${items.map(f => fileRow(slot, f)).join('')}
      ${slot.key === 'questions' && state.files.questions && state.files.questions.status !== 'reading' && state.fileQuestions ? questionsInfo() : ''}
      ${canAdd ? `<label class="dropzone" for="${inputId}">
        <input id="${inputId}" class="sr-only" type="file" accept="${F.ACCEPT}" data-file-input="${slot.key}" ${slot.multiple ? 'multiple' : ''}>
        <span class="dz-icon" aria-hidden="true">⬆</span><span>اسحب الملف هنا أو <u>اختر ملفاً</u></span>
        <small>PDF، DOCX، TXT، MD، CSV — حتى 10 م.ب</small></label>` : ''}
    </div>`;
  }

  function fileRow(slot, f) {
    const st = {
      reading: '<span class="status st-reading"><span class="spinner sm" aria-hidden="true"></span> جارٍ القراءة واستخراج النص…</span>',
      ok: `<span class="status st-ok">✓ تمت القراءة (${(f.chars || 0).toLocaleString('ar')} حرفاً${f.pages ? ' · ' + f.pages + ' صفحات' : ''})</span>`,
      warn: `<span class="status st-warn">⚠ تمت القراءة مع ملاحظة</span>`,
      error: '<span class="status st-error">✕ تعذر استخراج النص</span>'
    }[f.status] || '';
    const notStored = f.notStored && !f.text && f.status !== 'error';
    const replaceId = 'rep-' + f.id;
    return `<div class="file-row">
      <div class="file-meta"><span class="file-icon" aria-hidden="true">${(f.ext || '').toUpperCase()}</span>
        <div><p class="file-name">${esc(f.name)}</p><p class="file-size">${F.formatSize(f.size)}</p></div></div>
      <div class="file-state">${notStored ? '<span class="status st-warn">⚠ لم يُحفظ نص الملف — أعد رفعه لاستخدامه</span>' : st}
        ${f.message ? `<p class="file-msg ${f.status === 'error' ? 'err' : ''}">${esc(f.message)}</p>` : ''}</div>
      <div class="file-actions">
        ${f.text ? `<button type="button" class="btn btn-sm btn-secondary" data-action="view-file" data-slot="${slot.key}" data-id="${f.id}">عرض النص</button>` : ''}
        ${!slot.multiple ? `<label class="btn btn-sm btn-secondary" for="${replaceId}">استبدال<input id="${replaceId}" class="sr-only" type="file" accept="${F.ACCEPT}" data-file-input="${slot.key}"></label>` : ''}
        <button type="button" class="btn btn-sm btn-ghost danger-text" data-action="remove-file" data-slot="${slot.key}" data-id="${f.id}" aria-label="حذف الملف ${esc(f.name)}">حذف</button>
      </div></div>`;
  }

  function questionsInfo() {
    const n = state.fileQuestions.length;
    return n ? `<p class="alert alert-success sm">تم التعرف على <b>${n}</b> سؤالاً في الملف. <button type="button" class="link" data-action="view-questions">عرض الأسئلة</button></p>`
      : `<p class="alert alert-warn sm">لم نتمكن من التعرف على أسئلة في هذا الملف. تأكد أن كل سؤال في سطر مستقل وينتهي بعلامة استفهام أو يبدأ برقم.</p>`;
  }

  VIEW.setup = () => {
    const c = ctx();
    const nQ = (state.fileQuestions || []).length;
    const files = [];
    SLOTS.forEach(s => { const list = s.multiple ? state.files.extra : (state.files[s.key] ? [state.files[s.key]] : []); list.forEach(f => files.push(`${esc(s.title)}: ${esc(f.name)}${f.text ? '' : ' <span class="muted">(النص غير متاح)</span>'}`)); });
    const avail = { bank: !!BANK, file: nQ > 0, cvjd: !!(c.cvText || c.jdText), technical: true, behavioral: true, comprehensive: true };
    if (!avail[state.setup.mode]) state.setup.mode = 'comprehensive';
    const reason = { bank: 'ملف بنك الأسئلة غير محمّل.', file: 'يتطلب ملف أسئلة تم التعرف على أسئلته.', cvjd: 'يتطلب سيرة ذاتية أو وصفاً وظيفياً تمت قراءته.' };
    const recommended = /التخطيط|الجدولة|إدارة المشاريع|planning|schedul/i.test(c.sub + ' ' + c.title);
    const started = state.questions.length && Object.keys(state.answers).length;
    return `
      <header class="view-head"><h1 tabindex="-1">إعداد المقابلة</h1><p>راجع الملخص واختر نوع المقابلة ثم ابدأ.</p></header>
      <div class="setup-grid">
        <div class="panel">
          <h2 class="panel-title">ملخص المقابلة</h2>
          <dl class="summary">
            <div><dt>الوظيفة المستهدفة</dt><dd>${esc(c.title)}</dd></div>
            <div><dt>المجال</dt><dd>${esc(c.field)}</dd></div>
            <div><dt>التخصص</dt><dd>${esc(c.sub)}</dd></div>
            <div><dt>مستوى الخبرة</dt><dd>${esc(c.expLabel)}</dd></div>
            <div><dt>لغة المقابلة</dt><dd>${esc(LANG[c.lang])}</dd></div>
            <div><dt>الصعوبة</dt><dd>${esc(c.diffLabel)}</dd></div>
            ${c.market ? `<div><dt>سوق العمل</dt><dd>${esc(c.market)}</dd></div>` : ''}
            <div><dt>الملفات المرفقة</dt><dd>${files.length ? `<ul class="plain">${files.map(x => `<li>${x}</li>`).join('')}</ul>` : 'لا توجد ملفات'}</dd></div>
            ${state.files.questions ? `<div><dt>عدد الأسئلة في الملف</dt><dd>${nQ ? nQ + ' سؤالاً' : 'غير محدد'}</dd></div>` : ''}
          </dl>
          <div class="actions-inline"><a href="#details" class="link">تعديل البيانات</a> · <a href="#files" class="link">تعديل الملفات</a></div>
          <div id="analysisBox">${analysisHtml()}</div>
        </div>
        <div class="panel">
          <h2 class="panel-title" id="modeTitle">نوع المقابلة</h2>
          <div class="mode-list" role="radiogroup" aria-labelledby="modeTitle">
            ${Object.entries(MODES).map(([k, m]) => `<label class="mode-card ${avail[k] ? '' : 'disabled'}">
              <input type="radio" name="mode" value="${k}" data-bind="setup.mode" ${state.setup.mode === k ? 'checked' : ''} ${avail[k] ? '' : 'disabled'}>
              <span><b>${m.t}${k === 'bank' && recommended ? ' <span class="tag tag-ai">موصى به لتخصصك</span>' : ''}</b><small>${avail[k] ? m.d : reason[k]}</small></span></label>`).join('')}
          </div>
          <div class="form-row" id="countRow">
            ${state.setup.mode === 'bank' ? bankPanel() : state.setup.mode === 'file'
              ? `<p class="alert alert-info sm">ستُطرح <b>جميع</b> أسئلة الملف (${nQ}) بالترتيب نفسه. يمكنك تخطي أي سؤال مع توضيح ذلك في التقرير.</p>`
              : `<label for="qCount">عدد الأسئلة</label><select id="qCount" data-bind="setup.count">${[5, 6, 8, 10, 12].map(n => `<option value="${n}" ${+state.setup.count === n ? 'selected' : ''}>${n} أسئلة</option>`).join('')}</select>`}
          </div>
          <div class="alert ${settings.engine === 'remote' ? 'alert-success' : 'alert-warn'} sm">
            ${settings.engine === 'remote'
              ? 'المحرك: <b>خادم ذكاء اصطناعي</b> — ستُرسل بيانات المقابلة ونصوص الملفات إلى الخادم المحدد في الإعدادات.'
              : 'المحرك: <b>الوضع التجريبي</b> — أسئلة من بنك جاهز وتقييم بقواعد محددة، وليس بالذكاء الاصطناعي.'}
            <a href="#settings" class="link">تغيير</a></div>
        </div>
      </div>
      <div class="actions-bar">
        <a href="#files" class="btn btn-ghost">→ رجوع: الملفات</a>
        ${started ? `<a href="#interview" class="btn btn-secondary">العودة إلى المقابلة الجارية</a>` : ''}
        <button type="button" class="btn btn-primary btn-lg" data-action="start-interview">${started ? 'بدء مقابلة جديدة بهذه الإعدادات' : 'ابدأ المقابلة'}</button>
      </div>`;
  };

  function bankPanel() {
    const s = state.setup;
    const tSel = Array.isArray(s.bankTopics) ? s.bankTopics : Object.keys(BANK.topics);
    const lSel = Array.isArray(s.bankLevels) ? s.bankLevels : Object.keys(BANK.levels);
    const cnt = (pred) => BANK.questions.filter(pred).length;
    const matching = AI.bankQuestions(Object.assign(ctx(), { bankCount: 'all' })).length;
    return `<div class="bank-filters">
      <fieldset class="form-row"><legend>المواضيع <span class="muted sm">(تصنيف المنصة)</span></legend>
        <div class="check-grid">${Object.entries(BANK.topics).map(([k, l]) => `<label class="check sm"><input type="checkbox" id="bt-${k}" data-bank-filter="topic" value="${k}" ${tSel.includes(k) ? 'checked' : ''}><span>${esc(l)} <span class="muted">(${cnt(q => q.topic === k)})</span></span></label>`).join('')}</div></fieldset>
      <fieldset class="form-row"><legend>مستوى الصعوبة</legend>
        <div class="check-grid">${Object.entries(BANK.levels).map(([k, l]) => `<label class="check sm"><input type="checkbox" id="bl-${k}" data-bank-filter="level" value="${k}" ${lSel.includes(k) ? 'checked' : ''}><span>${esc(l)} <span class="muted">(${cnt(q => q.level === k)})</span></span></label>`).join('')}</div></fieldset>
      <div class="form-grid">
        <div class="form-row"><label for="bankCount">عدد الأسئلة</label><select id="bankCount" data-bind="setup.bankCount">
          ${['all', '5', '10', '15', '20', '30'].map(v => `<option value="${v}" ${String(s.bankCount) === v ? 'selected' : ''}>${v === 'all' ? `كل الأسئلة المطابقة (${matching})` : v + ' أسئلة'}</option>`).join('')}</select></div>
        <div class="form-row"><label for="bankOrder">الترتيب</label><select id="bankOrder" data-bind="setup.bankOrder">
          <option value="file" ${s.bankOrder !== 'mixed' ? 'selected' : ''}>ترتيب الملف الأصلي</option>
          <option value="mixed" ${s.bankOrder === 'mixed' ? 'selected' : ''}>مختلط</option></select></div>
      </div>
      <p class="alert ${matching ? 'alert-info' : 'alert-error'} sm">${matching ? `الأسئلة المطابقة للتصفية: <b>${matching}</b> من ${BANK.questions.length}.` : 'لا توجد أسئلة مطابقة؛ اختر موضوعاً ومستوى واحداً على الأقل.'}
        تُعرض الأسئلة بالعربية (ترجمة المنصة) مع النص الإنجليزي الأصلي أسفلها، ويمكنك الإجابة بالعربية أو الإنجليزية. <b>لا تظهر الإجابة المرجعية إلا بعد إرسال إجابتك</b>، وتبقى بالإنجليزية كما وردت في الملف.</p>
      <button type="button" class="btn btn-sm btn-secondary" data-action="bank-catalog">استعراض الأسئلة المصنفة (دون الإجابات)</button>
    </div>`;
  }

  function analysisHtml() {
    const a = state.analysis;
    if (!fileText('cv') && !fileText('jd')) return '';
    if (!a) return `<div class="analysis"><button type="button" class="btn btn-sm btn-secondary" data-action="analyze">تحليل السيرة الذاتية والوصف الوظيفي</button></div>`;
    if (a.loading) return `<div class="analysis"><p class="status st-reading"><span class="spinner sm" aria-hidden="true"></span> جارٍ تحليل الملفات…</p></div>`;
    if (a.error) return `<div class="analysis"><p class="alert alert-error sm">${esc(a.error)}</p><button type="button" class="btn btn-sm btn-secondary" data-action="analyze">إعادة المحاولة</button></div>`;
    const r = a.result;
    const list = (arr) => arr && arr.length ? `<ul class="plain">${arr.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="muted">لا شيء</p>';
    if (r.demo) {
      return `<div class="analysis"><h3>تحليل الملفات <span class="tag tag-demo">تجريبي</span></h3><p class="hint">${esc(r.note)}</p>
        ${r.cv ? `<h4>السيرة الذاتية — جوانب ورد ذكرها</h4>${list(r.cv.covered)}` : ''}
        ${r.jd ? `<h4>الوصف الوظيفي — جوانب مطلوبة</h4>${list(r.jd.covered)}` : ''}
        ${r.gaps ? `<h4>جوانب في الوصف الوظيفي لم تظهر في سيرتك</h4>${list(r.gaps)}` : ''}</div>`;
    }
    return `<div class="analysis"><h3>تحليل الملفات <span class="tag tag-ai">ذكاء اصطناعي</span></h3>
      ${r.cvSummary ? `<h4>ملخص السيرة الذاتية</h4><p>${esc(r.cvSummary)}</p>` : ''}
      ${r.jdSummary ? `<h4>ملخص الوصف الوظيفي</h4><p>${esc(r.jdSummary)}</p>` : ''}
      ${r.skills ? `<h4>المهارات المطابقة</h4>${list(r.skills)}` : ''}
      ${r.gaps ? `<h4>فجوات محتملة</h4>${list(r.gaps)}` : ''}</div>`;
  }

  function analysisSig() { return [settings.engine, (fileText('cv') || '').length, (fileText('jd') || '').length, state.field, subName()].join('|'); }
  async function analyze() {
    const sig = analysisSig();
    state.analysis = { loading: true };
    refreshAnalysis();
    try {
      const result = await AI.get(settings).analyzeDocuments(ctx());
      state.analysis = { result }; state.analysisSig = sig; persist();
    } catch (e) {
      state.analysis = { error: e.message };
    }
    refreshAnalysis();
  }
  function refreshAnalysis() { const box = $('#analysisBox'); if (box) box.innerHTML = analysisHtml(); }
  function maybeAnalyze() {
    if ((fileText('cv') || fileText('jd')) && settings.engine === 'demo' && (!state.analysis || state.analysisSig !== analysisSig())) analyze();
  }

  /* ---------- المقابلة ---------- */
  function answeredCount() { return state.questions.filter(q => { const a = lastAttempt(q); return a && !a.skipped; }).length; }

  VIEW.interview = () => {
    const qs = state.questions, i = state.current, q = qs[i];
    if (!q) return '<p>لا توجد أسئلة.</p>';
    const att = lastAttempt(q);
    const showEval = att && !ui.retrying;
    const pct = Math.round(qs.filter(x => lastAttempt(x)).length / qs.length * 100);
    const lang = state.details.lang;
    const draft = ui.retrying ? '' : (state.drafts[q.id] || '');
    return `
      <div class="interview-head">
        <div><h1 tabindex="-1" class="q-counter">السؤال ${i + 1} من ${qs.length}</h1>
          <p class="muted">${state.deptId ? 'القسم: ' + esc(state.details.title) : `${esc(state.details.title)} · ${esc(subName())} · ${esc(LANG[lang])}`}</p></div>
        <div class="head-actions">
          ${settings.engine === 'demo' ? '<span class="tag tag-demo" title="أسئلة وتقييم من الوضع التجريبي">وضع تجريبي</span>' : '<span class="tag tag-ai">ذكاء اصطناعي</span>'}
          <button type="button" class="btn btn-ghost danger-text" data-action="end-interview">إنهاء المقابلة</button>
        </div>
      </div>
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="نسبة التقدم في المقابلة"><span style="width:${pct}%"></span></div>
      <ol class="q-dots" aria-label="حالة الأسئلة">
        ${qs.map((x, k) => {
          const a = lastAttempt(x);
          const cls = k === i ? 'current' : a ? (a.skipped ? 'skipped' : 'done') : '';
          const label = `السؤال ${k + 1}${a ? (a.skipped ? ' — متخطى' : ' — تمت الإجابة') : ''}`;
          const mark = x.type === 'followup' ? '↳' : k + 1;
          /* يمكن الرجوع إلى أي سؤال سابق أو مُجاب عنه، دون كشف الأسئلة القادمة */
          const canGo = k !== i && (a || k < i);
          return `<li class="${cls}">${canGo ? `<button type="button" data-action="goto" data-index="${k}" aria-label="${label}" title="${label}">${mark}</button>` : `<span aria-label="${label}" title="${label}">${mark}</span>`}</li>`;
        }).join('')}
      </ol>

      <article class="panel question-card" aria-labelledby="qText">
        <div class="q-meta"><span class="tag">${q.source === 'admin' ? 'سؤال القسم' : (QTYPE[q.type] || 'سؤال')}</span>${q.source === 'demo' ? '<span class="tag tag-demo">سؤال تجريبي</span>' : ''}
          ${q.bankId && BANK ? `<span class="tag" dir="ltr">${esc(q.label)}</span><span class="tag">${esc(BANK.topics[q.topic])}</span><span class="tag">${esc(BANK.levels[q.level])}</span>` : ''}</div>
        <p id="qText" class="q-text" lang="${qLang(q)}" dir="${qLang(q) === 'en' ? 'ltr' : 'rtl'}">${esc(q.text)}</p>
        ${q.textEn ? `<details class="q-original"><summary>النص الأصلي بالإنجليزية</summary><span dir="ltr" lang="en">${esc(q.textEn)}</span></details>` : ''}
        <div class="tts-controls" role="group" aria-label="التحكم في نطق السؤال">
          ${S.ttsSupported ? `
            <button type="button" class="btn btn-sm btn-secondary" data-action="tts-play">▶ استمع للسؤال</button>
            <button type="button" class="btn btn-sm btn-ghost" data-action="tts-pause" id="ttsPause">⏸ إيقاف مؤقت</button>
            <button type="button" class="btn btn-sm btn-ghost" data-action="tts-stop">⏹ إيقاف</button>
            <button type="button" class="btn btn-sm btn-ghost" data-action="tts-play">↻ إعادة</button>
            <span id="ttsStatus" class="muted sm" aria-live="polite"></span>`
            : '<p class="muted sm">متصفحك لا يدعم نطق النصوص. اقرأ السؤال أعلاه.</p>'}
        </div>
      </article>

      ${showEval ? answeredBlock(q, att) : answerForm(q, draft)}
      <div id="evalArea" aria-live="polite">${showEval && !att.skipped ? evalHtml(att.evaluation, q) : ''}</div>
      <div class="alert alert-info sm voice-note">الإجابة الصوتية هنا تحويل للكلام إلى نص يمكنك مراجعته قبل الإرسال، وليست محادثة صوتية ذكية مباشرة. المحادثة الصوتية المتبادلة في الوقت الحقيقي تتطلب خدمة صوتية أو نموذج ذكاء اصطناعي يدعم ذلك.</div>`;
  };

  function answerForm(q, draft) {
    const lang = state.details.lang;
    return `<div class="panel answer-card">
      <div class="answer-head">
        <label for="answer" class="answer-label">إجابتك</label>
        ${STT
          ? `<button type="button" class="btn btn-mic ${ui.recording ? 'recording' : ''}" data-action="mic" aria-pressed="${ui.recording}">
              <span aria-hidden="true">🎙️</span> <span id="micLabel">${ui.recording ? 'إيقاف التسجيل' : 'أجب صوتياً'}</span></button>`
          : IN_FRAME ? '<span class="muted sm">الإجابة الصوتية غير متاحة في النسخة المنشورة (الميكروفون محجوب). اكتب إجابتك، أو استخدم النسخة المحلية للإجابة صوتياً.</span>'
          : '<span class="muted sm">التعرف على الكلام غير مدعوم في هذا المتصفح (جرّب Chrome أو Edge). يمكنك الكتابة.</span>'}
      </div>
      <p id="micStatus" class="mic-status" aria-live="polite" ${ui.recording ? '' : 'hidden'}><span class="rec-dot" aria-hidden="true"></span> يتم الاستماع الآن… تحدث بوضوح، وسيظهر النص في الحقل أدناه.</p>
      <textarea id="answer" rows="7" lang="${lang}" dir="${lang === 'en' ? 'ltr' : 'rtl'}" placeholder="اكتب إجابتك هنا، أو استخدم زر الإجابة الصوتية ثم صحّح النص قبل الإرسال.">${esc(draft)}</textarea>
      <div class="answer-foot">
        <span class="muted sm" id="wordCount">${wordCount(draft)} كلمة</span>
        <div class="btn-row">
          ${state.questions.length > 1 ? `<button type="button" class="btn btn-ghost" data-action="skip">تخطي السؤال</button>` : ''}
          ${ui.retrying ? `<button type="button" class="btn btn-ghost" data-action="cancel-retry">إلغاء إعادة المحاولة</button>` : ''}
          <button type="button" class="btn btn-primary" data-action="submit-answer">إرسال الإجابة</button>
        </div>
      </div></div>`;
  }

  function answeredBlock(q, att) {
    const n = (state.answers[q.id] || []).length;
    if (att.skipped) {
      return `<div class="panel answer-card"><p class="alert alert-warn sm">تم تخطي هذا السؤال وسيُذكر ذلك في التقرير.</p>
        <div class="btn-row"><button type="button" class="btn btn-secondary" data-action="retry">الإجابة عن السؤال</button>${navNext()}</div></div>`;
    }
    return `<div class="panel answer-card"><h2 class="answer-label">إجابتك ${n > 1 ? `(المحاولة ${n})` : ''}</h2>
      <p class="given-answer" dir="auto">${esc(att.text)}</p></div>`;
  }

  function navNext() {
    const last = state.current >= state.questions.length - 1;
    return last ? `<button type="button" class="btn btn-primary" data-action="finish">إنهاء وعرض التقرير</button>`
      : `<button type="button" class="btn btn-primary" data-action="next">السؤال التالي ←</button>`;
  }

  function evalHtml(ev, q) {
    const s = ev.score;
    const tone = s >= 7.5 ? 'good' : s >= 5 ? 'mid' : 'low';
    const list = (arr, cls) => arr && arr.length ? `<ul class="${cls}">${arr.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="muted">—</p>';
    const lang = state.details.lang;
    return `<section class="panel eval-card" aria-labelledby="evalTitle">
      <div class="eval-head">
        <div class="score-ring ${tone}" role="img" aria-label="الدرجة ${s} من 10"><strong>${s}</strong><span>/10</span></div>
        <div><h2 id="evalTitle">تقييم الإجابة</h2>
          ${ev.demo ? '<p class="tag tag-demo">تقييم تجريبي بقواعد محددة — ليس تقييماً بالذكاء الاصطناعي</p>' : '<p class="tag tag-ai">تقييم من نموذج ذكاء اصطناعي</p>'}
          ${ev.method ? `<p class="hint sm">${esc(ev.method)}</p>` : ''}</div>
      </div>
      ${verdictHtml(ev)}
      ${ev.technicalErrors && ev.technicalErrors.length ? `<div class="alert alert-error sm"><b>أخطاء فنية في إجابتك:</b><ul class="crosses">${ev.technicalErrors.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
      ${ev.reference ? referenceHtml(ev.reference, ev) : ''}
      ${ev.breakdown ? `<details class="breakdown"><summary>كيف حُسبت الدرجة؟</summary><ul>${ev.breakdown.map(b => `<li><span>${esc(b.label)}</span><span class="bar"><span style="width:${b.got / b.max * 100}%"></span></span><b>${b.got} / ${b.max}</b></li>`).join('')}</ul></details>` : ''}
      <div class="eval-grid">
        <div><h3 class="h-good">نقاط القوة</h3>${list(ev.strengths, 'ticks')}</div>
        <div><h3 class="h-bad">نقاط الضعف</h3>${list(ev.weaknesses, 'crosses')}</div>
        <div><h3 class="h-miss">ما ينقص الإجابة</h3>${list(ev.missing, 'dots')}</div>
      </div>
      ${ev.improved ? `<div class="improved"><h3>${ev.reference ? 'مثال على إجابة محسّنة (من المحرك)' : 'مثال على إجابة محسّنة'}</h3>${ev.improvedNote ? `<p class="hint">${esc(ev.improvedNote)}</p>` : ''}
        <p class="improved-text" dir="auto">${esc(ev.improved).replace(/\n/g, '<br>')}</p></div>` : ''}
      <p class="tip"><b>نصيحة عملية:</b> ${esc(ev.tip)}</p>
      <div class="btn-row eval-actions">
        <button type="button" class="btn btn-secondary" data-action="retry">↻ إعادة المحاولة</button>
        ${q.type !== 'followup' ? `<button type="button" class="btn btn-secondary" data-action="followup">سؤال متابعة</button>` : ''}
        ${navNext()}
      </div></section>`;
  }

  /* أسئلة بنك الملف بالإنجليزية كما وردت، فتُنطق بالإنجليزية بغض النظر عن لغة المقابلة */
  function qLang(q) {
    if (q && q.source === 'admin') return 'ar';
    return q && q.source === 'bank' ? (q.textEn ? 'ar' : 'en') : state.details.lang;
  }

  /* الإجابة الصحيحة: تظهر بعد الإجابة فقط، ويبرز عنوانها إذا كانت إجابة الموظف غير صحيحة أو ناقصة */
  function referenceHtml(r, ev) {
    const personal = r.kind === 'personal';
    const wrong = !personal && ev && ev.wrong;
    const title = personal ? 'مثال إجابة (تجربة شخصية للمؤلف — لا توجد إجابة صحيحة واحدة)'
      : wrong ? 'الإجابة الصحيحة' : 'الإجابة الصحيحة للمقارنة';
    const main = r.answerAr || r.answerEn;
    return `<div class="reference ${wrong ? 'ref-wrong' : 'ref-ok'}">
      <h3>${title} ${r.label ? `<span class="tag" dir="ltr">${esc(r.label)}</span>` : ''}</h3>
      <p class="improved-text" dir="${r.answerAr ? 'rtl' : 'ltr'}">${esc(main).replace(/\n/g, '<br>')}</p>
      ${r.hasFigure ? '<p class="hint">⚠ تشير هذه الإجابة في الملف الأصلي إلى رسم بياني لم يُستخرج لأنه صورة.</p>' : ''}
      ${r.note ? `<p class="alert alert-warn sm"><b>ملاحظة:</b> ${esc(r.note)}</p>` : ''}
      ${r.answerAr && r.answerEn ? `<details class="orig"><summary>النص الأصلي بالإنجليزية من الملف (الترجمة العربية من المنصة)</summary><p dir="ltr" lang="en">${esc(r.answerEn).replace(/\n/g, '<br>')}</p></details>` : ''}
    </div>`;
  }
  function verdictHtml(ev) {
    if (!ev.reference || ev.reference.kind === 'personal') return '';
    return ev.wrong
      ? `<p class="verdict verdict-bad" role="status">✕ إجابتك غير صحيحة أو ناقصة. راجع الإجابة الصحيحة أدناه ثم أعد المحاولة.</p>`
      : `<p class="verdict verdict-good" role="status">✓ إجابة جيدة. قارنها بالإجابة الصحيحة لتكملها.</p>`;
  }

  function wordCount(t) { return String(t || '').trim() ? String(t).trim().split(/\s+/).length : 0; }

  function onEnterInterview() {
    const q = state.questions[state.current];
    if (q && !lastAttempt(q) && settings.autoSpeak && S.ttsSupported) setTimeout(() => { if (currentView === 'interview') speakQuestion(); }, 350);
  }

  function speakQuestion() {
    const q = state.questions[state.current];
    if (!q) return;
    if (ui.recording) stopRec();
    const lang = qLang(q);
    const st = $('#ttsStatus');
    const r = S.speak(q.text, lang, {
      rate: settings.ttsRate,
      onstart: () => { if (st) st.textContent = 'جارٍ النطق…'; },
      onend: () => { const s2 = $('#ttsStatus'); if (s2) s2.textContent = ''; },
      onerror: (err) => { const s2 = $('#ttsStatus'); if (s2) s2.textContent = ''; toast('تعذر نطق السؤال (' + err + ').', 'error'); }
    });
    if (r.ok && !r.voiceFound) toast(lang === 'en' ? 'لا يتوفر صوت إنجليزي في جهازك؛ قد يستخدم المتصفح صوتاً افتراضياً.' : 'لا يتوفر صوت عربي مثبت في جهازك؛ قد يكون النطق غير دقيق. يمكنك تثبيت حزمة اللغة العربية من إعدادات النظام.', 'info');
  }

  function stopVoice() { S.stop(); stopRec(); }

  function toggleMic() { if (ui.recording) stopRec(); else startRec(); }

  async function startRec() {
    if (!STT) { toast('التعرف على الكلام غير مدعوم في هذا المتصفح. اكتب إجابتك.', 'error'); return; }
    if (!settings.micExplained) {
      const ok = await confirmBox('استخدام الميكروفون',
        `<p>لتسجيل إجابتك صوتياً سيطلب المتصفح إذنك لاستخدام الميكروفون. لن يعمل الميكروفون إلا عند ضغطك على زر «أجب صوتياً»، ويتوقف عند ضغط «إيقاف التسجيل».</p>
         <p class="hint">تنبيه: في بعض المتصفحات (مثل Chrome) تُعالَج خدمة التعرف على الكلام عبر خوادم مزود المتصفح، وتتطلب اتصالاً بالإنترنت. يمكنك دائماً الكتابة بدلاً من ذلك.</p>`, 'متابعة وطلب الإذن');
      if (!ok) return;
      settings.micExplained = true; saveSettings();
    }
    S.stop();
    const ta = $('#answer');
    if (!ta) return;
    const base = ta.value.trim() ? ta.value.trim() + ' ' : '';
    const rec = S.createRecognizer(state.details.lang, {
      onstart: () => { ui.recording = true; updateMicUi(); },
      onresult: (fin, interim) => {
        const t = $('#answer'); if (!t) return;
        t.value = base + fin + (interim ? ' ' + interim : '');
        onAnswerInput(t);
      },
      onerror: (msg) => toast(msg, 'error'),
      onend: () => { ui.recording = false; ui.rec = null; updateMicUi(); const t = $('#answer'); if (t && currentView === 'interview') { t.focus(); } }
    });
    ui.rec = rec;
    try { rec.start(); } catch (e) { ui.rec = null; toast('تعذر بدء التسجيل: ' + e.message, 'error'); }
  }
  function stopRec() { if (ui.rec) { try { ui.rec.stop(); } catch (e) { /* تجاهل */ } } ui.recording = false; updateMicUi(); }
  function updateMicUi() {
    const b = $('[data-action="mic"]'); if (!b) return;
    b.classList.toggle('recording', ui.recording);
    b.setAttribute('aria-pressed', String(ui.recording));
    $('#micLabel').textContent = ui.recording ? 'إيقاف التسجيل' : 'أجب صوتياً';
    $('#micStatus').hidden = !ui.recording;
  }

  function onAnswerInput(t) {
    const q = state.questions[state.current];
    if (!q) return;
    state.drafts[q.id] = t.value;
    const wc = $('#wordCount'); if (wc) wc.textContent = wordCount(t.value) + ' كلمة';
    persistSoon();
  }

  async function submitAnswer() {
    const ta = $('#answer');
    const text = ta ? ta.value.trim() : '';
    if (text.length < 2) { toast('اكتب إجابتك أو سجّلها صوتياً قبل الإرسال.', 'error'); if (ta) ta.focus(); return; }
    stopVoice();
    const q = state.questions[state.current];
    const btn = $('[data-action="submit-answer"]');
    if (btn) btn.disabled = true;
    setLoading(true, 'جارٍ تقييم إجابتك…');
    try {
      const evaluation = await AI.get(settings).evaluateAnswer(ctx(), q, text);
      (state.answers[q.id] = state.answers[q.id] || []).push({ text, evaluation, at: Date.now(), engine: settings.engine });
      delete state.drafts[q.id];
      state.status = 'active';
      ui.retrying = false;
      persist();
      render('interview');
      const ev = $('#evalTitle'); if (ev) { ev.setAttribute('tabindex', '-1'); ev.focus(); }
    } catch (e) {
      toast('تعذر تقييم الإجابة: ' + e.message + ' إجابتك محفوظة في الحقل؛ يمكنك المحاولة مجدداً.', 'error');
      if (btn) btn.disabled = false;
    } finally { setLoading(false); }
  }

  function nextQuestion() {
    stopVoice();
    if (state.current < state.questions.length - 1) { state.current++; ui.retrying = false; persist(); render('interview'); window.scrollTo(0, 0); $('#view-interview h1').focus(); onEnterInterview(); }
  }

  async function skipQuestion() {
    const q = state.questions[state.current];
    const fromFile = q.type === 'file';
    const ok = await confirmBox('تخطي السؤال؟', `<p>${fromFile ? 'هذا السؤال من <b>ملف الأسئلة الأساسي</b> الذي أرفقته.' : 'سيتم تخطي هذا السؤال.'} سيُسجَّل في التقرير أنه متخطى ويُحسب بدرجة صفر في التقييم الإجمالي، ويمكنك العودة إليه لاحقاً بإعادة المحاولة.</p>`, 'تخطي السؤال', 'danger');
    if (!ok) return;
    stopVoice();
    (state.answers[q.id] = state.answers[q.id] || []).push({ skipped: true, at: Date.now() });
    ui.retrying = false;
    persist();
    if (state.current < state.questions.length - 1) nextQuestion(); else render('interview');
  }

  async function addFollowUp() {
    const q = state.questions[state.current];
    const att = lastAttempt(q);
    if (!att || att.skipped) return;
    setLoading(true, 'جارٍ إعداد سؤال متابعة…');
    try {
      const r = await AI.get(settings).followUp(ctx(), q, att.text, att.evaluation);
      state.questions.splice(state.current + 1, 0, { id: uid(), text: r.text, type: 'followup', source: settings.engine === 'demo' ? 'demo' : 'ai', parentId: q.id });
      persist();
      setLoading(false);
      nextQuestion();
    } catch (e) { setLoading(false); toast('تعذر إنشاء سؤال متابعة: ' + e.message, 'error'); }
  }

  async function finishInterview(ask) {
    const answered = answeredCount();
    if (ask) {
      const rest = state.questions.length - state.questions.filter(q => lastAttempt(q)).length;
      const ok = await confirmBox('إنهاء المقابلة؟', `<p>أجبت عن ${answered} من ${state.questions.length} أسئلة.${rest ? ` الأسئلة المتبقية (${rest}) ستظهر في التقرير كأسئلة غير مُجاب عنها.` : ''}</p>`, 'إنهاء وعرض التقرير');
      if (!ok) return;
    }
    if (!answered) { toast('أجب عن سؤال واحد على الأقل لإنشاء تقرير.', 'error'); return; }
    stopVoice();
    setLoading(true, 'جارٍ إعداد التقرير النهائي…');
    try {
      const items = state.questions.map(q => { const a = lastAttempt(q); return { question: q, answer: a && !a.skipped ? a.text : null, evaluation: a && !a.skipped ? a.evaluation : null, skipped: !!(a && a.skipped) }; });
      const ai = await AI.get(settings).finalReport(ctx(), items);
      state.report = Object.assign({ at: Date.now(), engine: settings.engine }, ai);
      state.status = 'done'; state.finishedAt = Date.now();
      persist();
      go('report');
    } catch (e) {
      toast('تعذر إنشاء التقرير: ' + e.message, 'error');
    } finally { setLoading(false); }
  }

  async function startInterview() {
    const hasAnswers = Object.keys(state.answers).length;
    if (hasAnswers) {
      const ok = await confirmBox('بدء مقابلة جديدة؟', '<p>توجد إجابات في المقابلة الحالية. البدء من جديد سيحذف الإجابات والتقرير الحاليين.</p>', 'ابدأ من جديد', 'danger');
      if (!ok) return;
    }
    if (isReading()) { toast('انتظر حتى تنتهي قراءة الملفات.', 'info'); return; }
    setLoading(true, settings.engine === 'demo' ? 'جارٍ تجهيز الأسئلة…' : 'جارٍ إنشاء الأسئلة عبر خادم الذكاء الاصطناعي…');
    try {
      const qs = await AI.get(settings).generateQuestions(ctx());
      if (!qs.length) throw new Error('لم يتم إنشاء أي أسئلة.');
      state.questions = qs.map(q => Object.assign({ id: uid() }, q));
      state.current = 0; state.answers = {}; state.drafts = {}; state.report = null;
      state.status = 'active'; state.startedAt = Date.now(); state.finishedAt = null;
      ui.retrying = false;
      persist();
      go('interview');
    } catch (e) {
      toast('تعذر بدء المقابلة: ' + e.message, 'error');
    } finally { setLoading(false); }
  }

  /* ---------- التقرير ---------- */
  function stats() {
    const rows = state.questions.map((q, i) => { const a = lastAttempt(q); return { i, q, a, score: a && !a.skipped ? a.evaluation.score : null, skipped: !!(a && a.skipped) }; });
    const answered = rows.filter(r => r.score != null);
    const avg = answered.length ? answered.reduce((s, r) => s + r.score, 0) / answered.length : 0;
    const overall = Math.round(rows.reduce((s, r) => s + (r.score || 0), 0) / rows.length * 10);
    const sorted = answered.slice().sort((a, b) => b.score - a.score);
    const demoUsed = answered.some(r => r.a.evaluation.demo) || (state.report && state.report.demo);
    return { rows, answered, avg: Math.round(avg * 10) / 10, overall, best: sorted.filter(r => r.score >= 7).slice(0, 3), worst: sorted.slice().reverse().filter(r => r.score < 6).slice(0, 3), demoUsed, skipped: rows.filter(r => r.skipped).length, unanswered: rows.filter(r => !r.a).length };
  }

  VIEW.report = () => {
    const st = stats(), r = state.report, c = ctx();
    const list = (arr) => arr && arr.length ? `<ul class="ticks">${arr.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="muted">لا توجد بيانات كافية.</p>';
    const qItem = (row) => `<li><p class="rq"><b>س${row.i + 1}:</b> ${esc(row.q.text)}</p><p class="ra"><span class="score-pill">${row.score}/10</span> ${esc(row.a.text.length > 220 ? row.a.text.slice(0, 220) + '…' : row.a.text)}</p></li>`;
    const date = new Date(r.at).toLocaleDateString('ar', { year: 'numeric', month: 'long', day: 'numeric' });
    return `
      <header class="view-head report-head">
        <div><h1 tabindex="-1">التقرير النهائي</h1><p>${state.deptId ? 'القسم: ' + esc(c.title) : `${esc(c.title)} · ${esc(c.sub)} · ${esc(c.expLabel)} · ${esc(LANG[c.lang])}`} · ${date}</p></div>
        <div class="btn-row no-print">
          ${IN_FRAME ? '' : '<button type="button" class="btn btn-primary" data-action="print">طباعة / حفظ PDF</button>'}
          <a href="#interview" class="btn btn-secondary">مراجعة الإجابات</a>
          <button type="button" class="btn btn-ghost" data-action="new-session">مقابلة جديدة</button>
        </div>
      </header>
      ${st.demoUsed ? '<div class="alert alert-warn"><b>تقرير تجريبي:</b> الدرجات في هذا التقرير ناتجة عن قواعد تقييم محلية محددة (طول الإجابة، البنية، الأدلة الملموسة، معايير التخصص، الارتباط بالسؤال)، وليست تقييماً من نموذج ذكاء اصطناعي أو خبير بشري.</div>' : '<div class="alert alert-success">تم إنشاء هذا التقرير بالاعتماد على تقييمات نموذج الذكاء الاصطناعي المتصل. التقييمات إرشادية.</div>'}
      <div class="stat-grid">
        <div class="stat"><span class="stat-label">الأسئلة المكتملة</span><strong>${st.answered.length}<small> / ${st.rows.length}</small></strong>${st.skipped || st.unanswered ? `<span class="muted sm">${st.skipped ? st.skipped + ' متخطى' : ''}${st.skipped && st.unanswered ? ' · ' : ''}${st.unanswered ? st.unanswered + ' دون إجابة' : ''}</span>` : ''}</div>
        <div class="stat"><span class="stat-label">متوسط الدرجات</span><strong>${st.avg}<small> / 10</small></strong><span class="muted sm">للأسئلة المُجاب عنها</span></div>
        <div class="stat highlight"><span class="stat-label">التقييم الإجمالي</span><strong>${st.overall}<small> / 100</small></strong><span class="muted sm">غير المُجاب عنها تُحسب صفراً</span></div>
      </div>
      <section class="panel"><h2>درجة كل سؤال</h2>
        <ul class="score-bars">${st.rows.map(row => `<li><span class="sb-label">س${row.i + 1}${row.q.type === 'followup' ? ' (متابعة)' : ''}</span><span class="bar"><span style="width:${(row.score || 0) * 10}%" class="${row.score >= 7.5 ? 'good' : row.score >= 5 ? 'mid' : 'low'}"></span></span><b>${row.score != null ? row.score : row.skipped ? 'متخطى' : '—'}</b></li>`).join('')}</ul>
      </section>
      ${topicTable(st)}
      <div class="report-grid">
        <section class="panel"><h2 class="h-good">نقاط القوة</h2>${list(r.strengths)}</section>
        <section class="panel"><h2 class="h-bad">جوانب تحتاج إلى تطوير</h2>${list(r.improvements)}</section>
      </div>
      <div class="report-grid">
        <section class="panel"><h2>أفضل الإجابات</h2>${st.best.length ? `<ol class="qa-list">${st.best.map(qItem).join('')}</ol>` : '<p class="muted">لا توجد إجابات بدرجة 7 أو أعلى بعد.</p>'}</section>
        <section class="panel"><h2>إجابات تحتاج إلى تحسين</h2>${st.worst.length ? `<ol class="qa-list">${st.worst.map(qItem).join('')}</ol>` : '<p class="muted">لا توجد إجابات أقل من 6.</p>'}</section>
      </div>
      <section class="panel"><h2>توصيات خاصة بالوظيفة</h2>${list(r.recommendations)}</section>
      <section class="panel"><h2>خطة تدريب مقترحة</h2>
        ${r.plan && r.plan.length ? `<div class="plan-grid">${r.plan.map(p => `<div class="plan-item"><h3>${esc(p.week)}</h3><p class="plan-focus">${esc(p.focus)}</p><ul>${p.tasks.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>`).join('')}</div>` : '<p class="muted">—</p>'}
        ${r.summary ? `<p class="hint">${esc(r.summary)}</p>` : ''}
      </section>`;
  };

  function topicTable(st) {
    const t = AI.topicAverages(st.rows.map(r => ({ question: r.q, evaluation: r.score != null ? r.a.evaluation : null })));
    if (!t.length) return '';
    return `<section class="panel"><h2>النتائج حسب موضوع الأسئلة</h2>
      <ul class="score-bars topic-bars">${t.slice().sort((a, b) => b.avg - a.avg).map(x => `<li><span class="sb-label">${esc(x.label)} <span class="muted sm">(${x.count})</span></span><span class="bar"><span style="width:${x.avg * 10}%" class="${x.avg >= 7.5 ? 'good' : x.avg >= 5 ? 'mid' : 'low'}"></span></span><b>${x.avg}</b></li>`).join('')}</ul></section>`;
  }

  /* ---------- لوحة الإدارة (للمسؤول فقط) ---------- */
  const LEVELS = { basic: 'أساسي', intermediate: 'متوسط', advanced: 'متقدم' };

  VIEW.admin = () => {
    if (!ADMIN.hasPin()) {
      return `<header class="view-head"><h1 tabindex="-1">لوحة الإدارة</h1><p>أنشئ رقماً سرياً لحماية لوحة الإدارة على هذا الجهاز. لا تعطه للموظفين.</p></header>
        <div class="panel pin-box">
          <div class="form-row"><label for="pin1">الرقم السري (4 أرقام أو أكثر)</label><input id="pin1" type="password" inputmode="numeric" autocomplete="new-password"></div>
          <div class="form-row"><label for="pin2">تأكيد الرقم السري</label><input id="pin2" type="password" inputmode="numeric" autocomplete="new-password"></div>
          <button type="button" class="btn btn-primary" data-action="admin-create-pin">حفظ الرقم السري ودخول اللوحة</button>
        </div>`;
    }
    if (!ADMIN.isUnlocked()) {
      return `<header class="view-head"><h1 tabindex="-1">لوحة الإدارة</h1><p>هذه الصفحة للمسؤول فقط.</p></header>
        <div class="panel pin-box">
          <div class="form-row"><label for="pinIn">الرقم السري</label><input id="pinIn" type="password" inputmode="numeric" autocomplete="current-password"></div>
          <button type="button" class="btn btn-primary" data-action="admin-unlock">دخول</button>
        </div>`;
    }
    const depts = ADMIN.departments();
    if (!ui.adminDept || !ADMIN.department(ui.adminDept)) ui.adminDept = depts.length ? depts[0].id : null;
    const dep = ui.adminDept ? ADMIN.department(ui.adminDept) : null;
    const items = dep ? ADMIN.questionsFor(dep.id) : [];
    const custom = items.filter(i => !i.builtin), builtin = items.filter(i => i.builtin);
    const editing = ui.adminEditQ ? ADMIN.rawQuestion(ui.adminEditQ) : null;
    return `
      <header class="view-head report-head"><div><h1 tabindex="-1">لوحة الإدارة</h1>
        <p>أضف الأقسام والأسئلة وإجاباتها الصحيحة. يرى الموظف في النسخة العامة الأقسام التي بها أسئلة فقط، ولا يستطيع إضافة أو تعديل أي سؤال.</p></div>
        <button type="button" class="btn btn-ghost" data-action="admin-lock">قفل اللوحة</button></header>
      <div class="alert alert-info sm">البيانات محفوظة في متصفح هذا الجهاز فقط. لنقلها إلى جهاز آخر استخدم «تصدير الأسئلة» ثم «استيراد» على الجهاز الآخر.</div>

      <section class="panel" aria-labelledby="deptTitle"><h2 id="deptTitle">الأقسام</h2>
        <ul class="admin-list">${depts.map(d => {
          const n = ADMIN.questionsFor(d.id).length;
          return `<li><div><b>${esc(d.icon || '')} ${esc(d.name)}</b> ${d.builtin ? '<span class="tag">مدمج من الملف</span>' : ''} ${d.id === ui.adminDept ? '<span class="tag tag-ai">معروض أدناه</span>' : ''}
            <p class="q-a">${n} سؤالاً${n ? '' : ' — لن يظهر للموظفين حتى تضيف أسئلة'}${d.desc ? ' · ' + esc(d.desc) : ''}</p></div>
            <div class="btn-row"><button type="button" class="btn btn-sm btn-secondary" data-action="admin-select-dept" data-id="${esc(d.id)}">الأسئلة</button>
            ${d.builtin ? '' : `<button type="button" class="btn btn-sm btn-ghost" data-action="admin-rename-dept" data-id="${esc(d.id)}">تعديل</button>
            <button type="button" class="btn btn-sm btn-ghost danger-text" data-action="admin-del-dept" data-id="${esc(d.id)}">حذف</button>`}</div></li>`;
        }).join('')}</ul>
        <div class="form-grid" style="margin-top:1rem">
          <div class="form-row"><label for="newDeptName">اسم قسم جديد</label><input id="newDeptName" type="text" placeholder="مثال: محاسب تكاليف"></div>
          <div class="form-row"><label for="newDeptDesc">وصف مختصر (اختياري)</label><input id="newDeptDesc" type="text" placeholder="يظهر للموظف تحت اسم القسم"></div>
        </div>
        <button type="button" class="btn btn-secondary" data-action="admin-add-dept">إضافة القسم</button>
      </section>

      ${dep ? `<section class="panel" id="qPanel" aria-labelledby="qTitle"><h2 id="qTitle">أسئلة قسم «${esc(dep.name)}»</h2>
        <div class="q-form">
          <h3>${editing ? 'تعديل سؤال' : 'إضافة سؤال جديد'}</h3>
          <div class="form-row"><label for="aqText">السؤال</label><textarea id="aqText" rows="2" placeholder="اكتب السؤال كما سيظهر للموظف">${esc(editing ? editing.q : '')}</textarea></div>
          <div class="form-row"><label for="aqAnswer">الإجابة الصحيحة</label><textarea id="aqAnswer" rows="4" placeholder="اكتب الإجابة الصحيحة كاملة؛ تُقارن بها إجابة الموظف وتظهر له إذا أخطأ">${esc(editing ? editing.a : '')}</textarea></div>
          <div class="form-row narrow"><label for="aqLevel">مستوى الصعوبة</label><select id="aqLevel">${Object.entries(LEVELS).map(([k, l]) => `<option value="${k}" ${(editing ? editing.level : 'intermediate') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="btn-row"><button type="button" class="btn btn-primary" data-action="admin-save-q">${editing ? 'حفظ التعديل' : 'إضافة السؤال'}</button>
            ${editing ? '<button type="button" class="btn btn-ghost" data-action="admin-cancel-q">إلغاء</button>' : ''}</div>
        </div>
        <h3>الأسئلة المضافة (${custom.length})</h3>
        ${custom.length ? `<ul class="admin-list">${custom.map(q => `<li><div><b>${esc(q.text)}</b> <span class="tag">${esc(LEVELS[q.level] || '')}</span><p class="q-a">${esc(q.answerAr)}</p></div>
          <div class="btn-row"><button type="button" class="btn btn-sm btn-secondary" data-action="admin-edit-q" data-id="${esc(q.adminId)}">تعديل</button>
          <button type="button" class="btn btn-sm btn-ghost danger-text" data-action="admin-del-q" data-id="${esc(q.adminId)}">حذف</button></div></li>`).join('')}</ul>`
          : '<p class="muted">لم تُضف أسئلة لهذا القسم بعد.</p>'}
        ${builtin.length ? `<details class="builtin-list"><summary>أسئلة مدمجة من ملف مهندس التخطيط (${builtin.length}) — للعرض فقط</summary>
          <ol class="q-preview">${builtin.map(q => `<li>${esc(q.text)} <span class="tag">${esc(LEVELS[q.level] || '')}</span></li>`).join('')}</ol></details>` : ''}
      </section>` : ''}

      <section class="panel" aria-labelledby="pubTitle"><h2 id="pubTitle">نشر الأسئلة للنسخة العامة</h2>
        ${(() => { const s = ADMIN.stats(); return `<p>على هذا الجهاز تظهر أسئلتك للموظفين في النسخة العامة فوراً. ولتظهر على أجهزة أخرى نزّل ملف الأسئلة وضعه في مجلد النسخة العامة.</p>
          <p class="${s.unpublished || s.deletedPublished ? 'alert alert-warn sm' : 'hint'}">${s.unpublished || s.deletedPublished ? `توجد تغييرات لم تُنشر بعد (${s.unpublished} إضافة${s.deletedPublished ? ' و' + s.deletedPublished + ' حذف' : ''}).` : 'كل الأسئلة منشورة في ملف النسخة العامة الحالي.'}</p>`; })()}
        <div class="btn-row"><button type="button" class="btn btn-primary" data-action="admin-publish">تنزيل ملف الأسئلة للنسخة العامة</button>
          <a class="btn btn-secondary" href="index.html" target="_blank" rel="noopener">فتح النسخة العامة</a></div>
      </section>

      <section class="panel" aria-labelledby="bkTitle"><h2 id="bkTitle">نسخ احتياطي ونقل</h2>
        <p class="hint">التصدير يحفظ الأقسام والأسئلة التي أضفتها في ملف JSON. الاستيراد يضيف ما في الملف دون حذف أسئلتك الحالية.</p>
        <div class="btn-row"><button type="button" class="btn btn-secondary" data-action="admin-export">تصدير الأسئلة</button>
          <label class="btn btn-secondary" for="adminImport">استيراد من ملف<input id="adminImport" class="sr-only" type="file" accept=".json,application/json" data-admin-import="1"></label></div>
      </section>

      <section class="panel" aria-labelledby="pinTitle"><h2 id="pinTitle">تغيير الرقم السري</h2>
        <div class="form-row narrow"><label for="pinNew">الرقم السري الجديد</label><input id="pinNew" type="password" inputmode="numeric" autocomplete="new-password"></div>
        <button type="button" class="btn btn-secondary" data-action="admin-change-pin">تغيير</button>
      </section>`;
  };

  function adminRender(focusId) { render('admin'); const el = focusId && document.getElementById(focusId); if (el) el.focus(); }
  const pinOk = (p) => /^\d{4,}$/.test(p);

  /* ---------- الإعدادات ---------- */
  VIEW.settings = () => {
    const arV = S.findVoice('ar'), enV = S.findVoice('en');
    return `
      <header class="view-head"><h1 tabindex="-1">الإعدادات والخصوصية</h1></header>
      <section class="panel"><h2 class="panel-title" id="engTitle">محرك التقييم</h2>
        <div class="mode-list" role="radiogroup" aria-labelledby="engTitle">
          <label class="mode-card"><input type="radio" name="engine" value="demo" data-action="set-engine" ${settings.engine === 'demo' ? 'checked' : ''}>
            <span><b>الوضع التجريبي (محلي)</b><small>يعمل دون إنترنت أو خادم. أسئلة من بنك جاهز وتقييم بقواعد محددة وشفافة، وكل نتائجه موسومة بأنها تجريبية.</small></span></label>
          <label class="mode-card ${IN_FRAME ? 'disabled' : ''}"><input type="radio" name="engine" value="remote" data-action="set-engine" ${settings.engine === 'remote' ? 'checked' : ''} ${IN_FRAME ? 'disabled' : ''}>
            <span><b>خادم ذكاء اصطناعي (API)</b><small>يتطلب تشغيل الخادم الوسيط <code>server/server.js</code> الذي يحتفظ بمفتاح API في متغيرات البيئة. لا يُوضع أي مفتاح في المتصفح.</small></span></label>
        </div>
        <div class="form-row"><label for="apiBase">عنوان واجهة الخادم</label>
          <div class="input-row"><input id="apiBase" type="url" dir="ltr" value="${esc(settings.apiBase)}" data-action="api-base">
          <button type="button" class="btn btn-secondary" data-action="test-api">اختبار الاتصال</button></div>
          <p id="apiStatus" class="hint" aria-live="polite"></p></div>
      </section>
      <section class="panel"><h2 class="panel-title">الصوت</h2>
        <ul class="plain support-list">
          <li>نطق الأسئلة: ${S.ttsSupported ? '<b class="ok">مدعوم</b>' : '<b class="bad">غير مدعوم</b>'}</li>
          <li>صوت عربي مثبت: ${arV ? `<b class="ok">${esc(arV.name)}</b>` : '<b class="bad">غير متوفر</b> (قد يكون النطق غير دقيق)'}</li>
          <li>صوت إنجليزي مثبت: ${enV ? `<b class="ok">${esc(enV.name)}</b>` : '<b class="bad">غير متوفر</b>'}</li>
          <li>التعرف على الكلام (الإجابة الصوتية): ${IN_FRAME ? '<b class="bad">غير متاح في النسخة المنشورة</b> — أجب كتابياً' : S.sttSupported ? '<b class="ok">مدعوم</b>' : '<b class="bad">غير مدعوم</b> — استخدم Chrome أو Edge، أو أجب كتابياً'}</li>
        </ul>
        <label class="check"><input type="checkbox" data-action="auto-speak" ${settings.autoSpeak ? 'checked' : ''}><span>نطق كل سؤال تلقائياً عند عرضه</span></label>
        <div class="form-row narrow"><label for="ttsRate">سرعة النطق: <output id="rateOut">${settings.ttsRate}</output></label>
          <input id="ttsRate" type="range" min="0.6" max="1.4" step="0.1" value="${settings.ttsRate}" data-action="tts-rate"></div>
        <button type="button" class="btn btn-sm btn-secondary" data-action="test-voice">تجربة الصوت</button>
      </section>
      <section class="panel"><h2 class="panel-title">البيانات المحفوظة على هذا الجهاز</h2>
        <p>تُحفظ الجلسة في التخزين المحلي لمتصفحك فقط (localStorage): التخصص، بيانات الوظيفة، الأسئلة، الإجابات، التقييمات. لا توجد حسابات ولا مزامنة؛ ذلك يتطلب خادماً وقاعدة بيانات ونظام مصادقة.</p>
        <label class="check"><input type="checkbox" data-action="toggle-store" ${state.storeFiles ? 'checked' : ''}><span>حفظ نصوص الملفات المرفقة (السيرة الذاتية وغيرها) أيضاً</span></label>
        <div class="btn-row">
          <button type="button" class="btn btn-danger" data-action="clear-session">حذف بيانات الجلسة</button>
          <button type="button" class="btn btn-ghost danger-text" data-action="clear-all">حذف كل البيانات والإعدادات</button>
        </div>
      </section>`;
  };

  /* ---------- الملفات ---------- */
  async function handleFiles(key, fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const slot = SLOTS.find(s => s.key === key);
    if (slot.multiple) {
      const room = 5 - state.files.extra.length;
      if (files.length > room) toast(`يمكن إرفاق 5 ملفات إضافية كحد أقصى؛ تم قبول أول ${Math.max(room, 0)}.`, 'info');
      files.splice(Math.max(room, 0));
    } else files.splice(1);
    for (const file of files) {
      const err = F.validate(file);
      if (err) { toast(`«${file.name}»: ${err}`, 'error'); continue; }
      const entry = { id: uid(), name: file.name, size: file.size, ext: F.ext(file.name), status: 'reading', text: null, chars: 0 };
      if (slot.multiple) state.files.extra.push(entry); else { state.files[key] = entry; if (key === 'questions') state.fileQuestions = null; }
      state.analysis = null;
      refreshFiles();
      try {
        const r = await F.extract(file);
        Object.assign(entry, { text: r.text, chars: r.text.length, pages: r.pages || null, status: r.warning ? 'warn' : 'ok', message: r.warning || '' });
        if (key === 'questions') state.fileQuestions = F.parseQuestions(r.text);
        toast(`تمت قراءة «${file.name}» بنجاح.`, 'success');
      } catch (e) {
        Object.assign(entry, { status: 'error', message: e.message || 'حدث خطأ غير متوقع أثناء قراءة الملف.' });
        if (key === 'questions') state.fileQuestions = null;
        toast(`«${file.name}»: ${entry.message}`, 'error');
      }
      if (key === 'questions' && state.setup.mode === 'file' && !(state.fileQuestions || []).length) state.setup.mode = 'comprehensive';
      persist();
      refreshFiles();
    }
  }
  function refreshFiles() { if (currentView === 'files') { const ae = document.activeElement && document.activeElement.id; render('files'); if (ae && document.getElementById(ae)) document.getElementById(ae).focus(); } }

  function findFile(slot, id) { return slot === 'extra' ? state.files.extra.find(f => f.id === id) : state.files[slot]; }

  /* ---------- مقابلة القسم (مسار الموظف) ---------- */
  async function pickDept(id) {
    const dep = ADMIN.department(id);
    const items = ADMIN.questionsFor(id);
    if (!dep || !items.length) { toast('لا توجد أسئلة في هذا القسم.', 'error'); return; }
    const counts = [5, 10, 20, 30].filter(n => n < items.length);
    const choice = await modal({
      title: dep.name,
      html: `<p>عدد الأسئلة المتاحة: <b>${items.length}</b>.</p>
        <div class="form-row"><label for="deptCount">عدد الأسئلة في هذه المقابلة</label>
          <select id="deptCount">${counts.map(n => `<option value="${n}" ${n === 10 ? 'selected' : ''}>${n} أسئلة</option>`).join('')}<option value="all" ${counts.includes(10) ? '' : 'selected'}>كل الأسئلة (${items.length})</option></select></div>
        <div class="form-row"><label for="deptOrder">ترتيب الأسئلة</label>
          <select id="deptOrder"><option value="mixed">عشوائي (أسئلة مختلفة كل مرة)</option><option value="file">بالترتيب</option></select></div>
        ${state.deptId && state.questions.length && state.status !== 'done' ? '<p class="alert alert-warn sm">ستُستبدل المقابلة غير المكتملة الحالية.</p>' : ''}`,
      actions: [{ label: 'إلغاء', value: false, kind: 'ghost' }, { label: 'ابدأ المقابلة', value: 'go', kind: 'primary' }]
    });
    if (choice !== 'go') return;
    /* محتوى النافذة يبقى في الصفحة بعد إغلاقها حتى تُفتح نافذة أخرى */
    startDeptInterview(dep, items, $('#deptCount').value, $('#deptOrder').value);
  }

  function startDeptInterview(dep, items, count, order) {
    let list = items.slice();
    if (order === 'mixed') {
      for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
    }
    if (count !== 'all') list = list.slice(0, +count);
    stopVoice();
    state = freshState();
    Object.assign(state, { deptId: dep.id, field: 'other', customField: dep.name, customSub: dep.name, status: 'active', startedAt: Date.now() });
    Object.assign(state.details, { title: dep.name, exp: 'mid', lang: 'ar', diff: 'intermediate' });
    state.setup.mode = 'dept';
    state.questions = list.map(it => ({ id: uid(), text: it.text, textEn: it.textEn, type: 'bank', source: it.source, bankId: it.bankId || null, adminId: it.adminId || null, label: it.label, topic: it.topic, level: it.level }));
    ui.retrying = false;
    persist();
    go('interview');
  }

  /* ---------- الأحداث ---------- */
  const ACTIONS = {
    'new-session': () => { stopVoice(); go('home'); },
    'admin-create-pin': async () => {
      const a = $('#pin1').value.trim(), b = $('#pin2').value.trim();
      if (!pinOk(a)) { toast('الرقم السري يجب أن يكون 4 أرقام أو أكثر.', 'error'); $('#pin1').focus(); return; }
      if (a !== b) { toast('الرقمان غير متطابقين.', 'error'); $('#pin2').focus(); return; }
      await ADMIN.setPin(a); toast('تم حفظ الرقم السري.', 'success'); adminRender();
    },
    'admin-unlock': async () => {
      const p = $('#pinIn').value.trim();
      if (await ADMIN.checkPin(p)) adminRender(); else { toast('الرقم السري غير صحيح.', 'error'); $('#pinIn').select(); }
    },
    'admin-lock': () => { ADMIN.lock(); ui.adminEditQ = null; adminRender('pinIn'); },
    'admin-publish': () => {
      const js = ADMIN.publishedFile();
      if (IN_FRAME) { modal({ title: 'ملف الأسئلة للنسخة العامة', html: `<p class="hint">انسخ النص واحفظه باسم published-bank.js داخل مجلد js في النسخة العامة.</p><textarea rows="12" dir="ltr" readonly>${esc(js)}</textarea>` }); return; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([js], { type: 'text/javascript' }));
      a.download = 'published-bank.js';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      modal({ title: 'تم تنزيل ملف الأسئلة', html: `<ol><li>افتح مجلد النسخة العامة ثم مجلد <code>js</code>.</li><li>ضع الملف <code>published-bank.js</code> مكان الملف القديم بالاسم نفسه.</li><li>انسخ مجلد النسخة العامة إلى أجهزة الموظفين، أو ارفعه على الخادم الذي يفتحون منه.</li></ol>` });
    },
    'admin-change-pin': async () => {
      const p = $('#pinNew').value.trim();
      if (!pinOk(p)) { toast('الرقم السري يجب أن يكون 4 أرقام أو أكثر.', 'error'); return; }
      await ADMIN.setPin(p); $('#pinNew').value = ''; toast('تم تغيير الرقم السري.', 'success');
    },
    'admin-add-dept': () => {
      const name = $('#newDeptName').value.trim();
      if (name.length < 2) { toast('اكتب اسم القسم.', 'error'); $('#newDeptName').focus(); return; }
      if (ADMIN.departments().some(d => d.name === name)) { toast('يوجد قسم بهذا الاسم.', 'error'); return; }
      const d = ADMIN.addDepartment({ name, desc: $('#newDeptDesc').value });
      ui.adminDept = d.id; ui.adminEditQ = null;
      toast(`تمت إضافة قسم «${name}». أضف أسئلته الآن.`, 'success'); adminRender('aqText');
    },
    'admin-select-dept': (el) => { ui.adminDept = el.dataset.id; ui.adminEditQ = null; adminRender(); const p = $('#qPanel'); if (p) p.scrollIntoView({ behavior: 'smooth' }); },
    'admin-rename-dept': async (el) => {
      const d = ADMIN.department(el.dataset.id); if (!d) return;
      const ok = await modal({ title: 'تعديل القسم', html: `<div class="form-row"><label for="rnName">اسم القسم</label><input id="rnName" type="text" value="${esc(d.name)}"></div>
        <div class="form-row"><label for="rnDesc">الوصف</label><input id="rnDesc" type="text" value="${esc(d.desc || '')}"></div>`,
        actions: [{ label: 'إلغاء', value: false, kind: 'ghost' }, { label: 'حفظ', value: true, kind: 'primary' }] });
      if (!ok) return;
      const name = $('#rnName').value.trim();
      if (name.length < 2) { toast('اسم القسم قصير جداً.', 'error'); return; }
      ADMIN.updateDepartment(d.id, { name, desc: $('#rnDesc').value.trim() }); toast('تم حفظ القسم.', 'success'); adminRender();
    },
    'admin-del-dept': async (el) => {
      const d = ADMIN.department(el.dataset.id); if (!d) return;
      const n = ADMIN.questionsFor(d.id).length;
      const ok = await confirmBox('حذف القسم', `<p>حذف قسم «${esc(d.name)}» و${n} سؤالاً تابعة له نهائياً؟</p>`, 'حذف', 'danger');
      if (!ok) return;
      ADMIN.deleteDepartment(d.id); ui.adminDept = null; toast('تم حذف القسم.', 'success'); adminRender();
    },
    'admin-save-q': () => {
      const q = $('#aqText').value.trim(), a = $('#aqAnswer').value.trim(), level = $('#aqLevel').value;
      if (q.length < 5) { toast('اكتب نص السؤال.', 'error'); $('#aqText').focus(); return; }
      if (a.length < 3) { toast('اكتب الإجابة الصحيحة؛ بدونها لا يمكن تقييم إجابة الموظف.', 'error'); $('#aqAnswer').focus(); return; }
      if (ui.adminEditQ) { ADMIN.updateQuestion(ui.adminEditQ, { q, a, level }); toast('تم حفظ التعديل.', 'success'); }
      else { ADMIN.addQuestion({ deptId: ui.adminDept, q, a, level }); toast('تمت إضافة السؤال.', 'success'); }
      ui.adminEditQ = null; adminRender('aqText');
    },
    'admin-edit-q': (el) => { ui.adminEditQ = el.dataset.id; adminRender('aqText'); $('#qPanel').scrollIntoView({ behavior: 'smooth' }); },
    'admin-cancel-q': () => { ui.adminEditQ = null; adminRender(); },
    'admin-del-q': async (el) => {
      const q = ADMIN.rawQuestion(el.dataset.id); if (!q) return;
      const ok = await confirmBox('حذف السؤال', `<p>حذف السؤال «${esc(q.q)}» نهائياً؟</p>`, 'حذف', 'danger');
      if (!ok) return;
      ADMIN.deleteQuestion(q.id); if (ui.adminEditQ === q.id) ui.adminEditQ = null; toast('تم حذف السؤال.', 'success'); adminRender();
    },
    'admin-export': () => {
      const json = JSON.stringify(ADMIN.exportData(), null, 2);
      if (IN_FRAME) { modal({ title: 'تصدير الأسئلة', html: `<p class="hint">انسخ النص التالي واحفظه في ملف بامتداد .json.</p><textarea rows="12" dir="ltr" readonly>${esc(json)}</textarea>` }); return; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      a.download = 'interview-questions-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      toast('تم تصدير الأسئلة إلى ملف JSON.', 'success');
    },
    'pick-dept': (el) => pickDept(el.dataset.id),
    resume: () => {
      if (state.questions.length) go('interview');
      else if (detailsDone()) go('setup');
      else if (fieldDone()) go('details');
      else go('field');
    },
    'pick-field': (el) => {
      if (state.field !== el.dataset.id) { state.field = el.dataset.id; state.group = null; state.sub = null; state.customSub = ''; state.analysis = null; }
      const f = field();
      if (f.groups.length === 1) state.group = f.groups[0].id;
      persist(); render('field');
      const target = $('#groupPanel') || $('#subPanel');
      if (target) { target.scrollIntoView({ behavior: 'smooth', block: 'start' }); const first = target.querySelector('button, input'); if (first) first.focus({ preventScroll: true }); }
    },
    'pick-group': (el) => {
      if (state.group !== el.dataset.id) { state.group = el.dataset.id; state.sub = null; }
      persist(); render('field');
      const p = $('#subPanel'); if (p) { p.scrollIntoView({ behavior: 'smooth', block: 'start' }); const r = p.querySelector('input'); if (r) r.focus({ preventScroll: true }); }
    },
    'field-next': () => { if (fieldDone()) go('details'); else toast('اختر التخصص الفرعي أو اكتبه.', 'error'); },
    'details-next': () => {
      const tOk = state.details.title.trim().length >= 2, eOk = !!state.details.exp;
      $('#jobTitleErr').hidden = tOk; $('#expErr').hidden = eOk;
      $('#jobTitle').setAttribute('aria-invalid', String(!tOk));
      if (!tOk) { $('#jobTitle').focus(); return; }
      if (!eOk) { $('input[name="exp"]').focus(); return; }
      go('files');
    },
    'files-next': () => { if (isReading()) { toast('انتظر حتى تنتهي قراءة الملفات.', 'info'); return; } go('setup'); },
    'remove-file': async (el) => {
      const f = findFile(el.dataset.slot, el.dataset.id);
      if (!f) return;
      const ok = await confirmBox('حذف الملف', `<p>حذف «${esc(f.name)}» ونصه المستخرج من الجلسة؟</p>`, 'حذف', 'danger');
      if (!ok) return;
      if (el.dataset.slot === 'extra') state.files.extra = state.files.extra.filter(x => x.id !== f.id);
      else { state.files[el.dataset.slot] = null; if (el.dataset.slot === 'questions') { state.fileQuestions = null; if (state.setup.mode === 'file') state.setup.mode = 'comprehensive'; } }
      state.analysis = null; persist(); refreshFiles(); toast('تم حذف الملف.', 'success');
    },
    'view-file': (el) => {
      const f = findFile(el.dataset.slot, el.dataset.id);
      if (!f || !f.text) return;
      const shown = f.text.length > 20000 ? f.text.slice(0, 20000) + '\n\n… (تم اقتطاع العرض؛ النص الكامل محفوظ)' : f.text;
      modal({ title: 'النص المستخرج — ' + f.name, html: `<p class="hint">${f.chars.toLocaleString('ar')} حرفاً. هذا هو النص الذي سيُستخدم فعلياً؛ إذا كان غير صحيح فاستبدل الملف.</p><pre class="file-preview" dir="auto">${esc(shown)}</pre>` });
    },
    'view-questions': () => modal({ title: 'الأسئلة المستخرجة من الملف', html: `<ol class="q-preview">${(state.fileQuestions || []).map(q => `<li dir="auto">${esc(q)}</li>`).join('')}</ol>` }),
    'toggle-store': (el) => {
      state.storeFiles = el.checked; persist();
      toast(el.checked ? 'سيتم حفظ نصوص الملفات على هذا الجهاز.' : 'لن تُحفظ نصوص الملفات؛ ستبقى في الذاكرة حتى إغلاق الصفحة.', 'success');
    },
    analyze: () => analyze(),
    'bank-catalog': () => {
      const groups = Object.entries(BANK.topics).map(([k, l]) => {
        const qs = BANK.questions.filter(q => q.topic === k);
        const AR = IMS.planningBankAr || {};
        return `<h3>${esc(l)} <span class="muted sm">(${qs.length})</span></h3><ol class="q-preview catalog">${qs.map(q => `<li><span class="tag">${esc(BANK.levels[q.level])}</span> ${AR[q.id] ? `<b>${esc(AR[q.id])}</b><br>` : ''}<span class="muted sm" dir="ltr" lang="en">${esc(q.label)}: ${esc(q.question)}</span></li>`).join('')}</ol>`;
      }).join('');
      modal({ title: `أسئلة مهندس التخطيط — ${BANK.questions.length} سؤالاً`, html: `<p class="hint">التصنيف حسب الموضوع والصعوبة من المنصة وليس من الملف. الإجابات المرجعية مخفية هنا وتظهر فقط بعد الإجابة عن السؤال في المقابلة.</p>
        <ul class="hint">${BANK.source.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>${groups}` });
    },
    'start-interview': () => startInterview(),
    'tts-play': () => speakQuestion(),
    'tts-pause': (el) => {
      if (S.isPaused()) { S.resume(); el.textContent = '⏸ إيقاف مؤقت'; }
      else if (S.isSpeaking()) { S.pause(); el.textContent = '▶ استئناف'; }
    },
    'tts-stop': () => { S.stop(); const p = $('#ttsPause'); if (p) p.textContent = '⏸ إيقاف مؤقت'; const st = $('#ttsStatus'); if (st) st.textContent = ''; },
    mic: () => toggleMic(),
    'submit-answer': () => submitAnswer(),
    retry: () => { stopVoice(); ui.retrying = true; render('interview'); const t = $('#answer'); if (t) t.focus(); },
    'cancel-retry': () => { stopVoice(); ui.retrying = false; render('interview'); },
    next: () => nextQuestion(),
    goto: (el) => {
      stopVoice();
      state.current = +el.dataset.index; ui.retrying = false; persist();
      render('interview'); $('#view-interview h1').focus(); onEnterInterview();
    },
    skip: () => skipQuestion(),
    followup: () => addFollowUp(),
    finish: () => finishInterview(false),
    'end-interview': () => finishInterview(true),
    print: () => window.print(),
    'set-engine': (el) => { settings.engine = el.value; saveSettings(); state.analysis = null; toast(el.value === 'remote' ? 'تم اختيار خادم الذكاء الاصطناعي. اختبر الاتصال للتأكد من جاهزيته.' : 'تم التبديل إلى الوضع التجريبي.', 'success'); },
    'api-base': (el) => { settings.apiBase = el.value.trim() || defaults.apiBase; saveSettings(); },
    'test-api': async () => {
      const st = $('#apiStatus');
      settings.apiBase = $('#apiBase').value.trim() || defaults.apiBase; saveSettings();
      st.textContent = 'جارٍ الاختبار…';
      try {
        const h = await AI.health(settings.apiBase);
        st.innerHTML = h.configured ? `<b class="ok">✓ الخادم يعمل ومفتاح API مُعد على الخادم.</b> النموذج: ${esc(h.model || '')}` : '<b class="bad">الخادم يعمل لكن مفتاح API غير مُعد.</b> أضف ANTHROPIC_API_KEY في ملف server/.env ثم أعد تشغيل الخادم.';
      } catch (e) { st.innerHTML = `<b class="bad">تعذر الاتصال بالخادم على ${esc(settings.apiBase)}.</b> شغّل الخادم بالأمر <code dir="ltr">node server/server.js</code> (راجع README).`; }
    },
    'auto-speak': (el) => { settings.autoSpeak = el.checked; saveSettings(); },
    'tts-rate': (el) => { settings.ttsRate = +el.value; $('#rateOut').textContent = el.value; saveSettings(); },
    'test-voice': () => {
      if (!S.ttsSupported) { toast('نطق النصوص غير مدعوم في هذا المتصفح.', 'error'); return; }
      const r = S.speak(state.details.lang === 'en' ? 'Hello, this is a voice test for the interview simulator.' : 'مرحباً، هذه تجربة لصوت محاكي المقابلات.', state.details.lang, { rate: settings.ttsRate });
      if (!r.voiceFound) toast('لا يتوفر صوت مثبت لهذه اللغة؛ سيستخدم المتصفح صوتاً افتراضياً.', 'info');
    },
    'clear-session': async () => {
      const ok = await confirmBox('حذف بيانات الجلسة', '<p>سيتم حذف التخصص والبيانات والملفات والإجابات والتقرير من هذا الجهاز نهائياً.</p>', 'حذف', 'danger');
      if (!ok) return;
      stopVoice(); store.del(SESSION_KEY); state = freshState(); toast('تم حذف بيانات الجلسة.', 'success'); render('settings');
    },
    'clear-all': async () => {
      const ok = await confirmBox('حذف كل البيانات', '<p>سيتم حذف الجلسة وجميع الإعدادات (المحرك، الصوت، عنوان الخادم) من هذا الجهاز.</p>', 'حذف الكل', 'danger');
      if (!ok) return;
      stopVoice(); store.del(SESSION_KEY); store.del(SETTINGS_KEY); state = freshState(); settings = Object.assign({}, defaults); renderBadge(); toast('تم حذف كل البيانات.', 'success'); render('settings');
    }
  };

  const main = $('#main');
  main.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || el.tagName === 'INPUT') return;
    const fn = ACTIONS[el.dataset.action];
    if (fn) { e.preventDefault(); fn(el, e); }
  });

  main.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.fileInput) { handleFiles(t.dataset.fileInput, t.files); t.value = ''; return; }
    if (t.dataset.adminImport) {
      const f = t.files && t.files[0]; t.value = '';
      if (!f) return;
      f.text().then(txt => {
        const r = ADMIN.importData(JSON.parse(txt));
        toast(`تم الاستيراد: ${r.departments} قسماً و${r.questions} سؤالاً جديداً.`, 'success'); adminRender();
      }).catch(e => toast('تعذر الاستيراد: ' + (e instanceof SyntaxError ? 'الملف ليس JSON صالحاً.' : e.message), 'error'));
      return;
    }
    if (t.dataset.bankFilter) {
      const key = t.dataset.bankFilter === 'topic' ? 'bankTopics' : 'bankLevels';
      state.setup[key] = $$(`input[data-bank-filter="${t.dataset.bankFilter}"]:checked`).map(x => x.value);
      persist(); render('setup');
      const back = document.getElementById(t.id); if (back) back.focus();
      return;
    }
    if (t.dataset.action && ACTIONS[t.dataset.action]) { ACTIONS[t.dataset.action](t, e); return; }
    if (t.name === 'sub' && t.type === 'radio') {
      state.sub = t.value; state.customSub = ''; const c = $('#customSub'); if (c) c.value = '';
      persist(); updateFieldNext(); return;
    }
    if (t.dataset.bind) { bind(t); if (t.dataset.bind === 'setup.mode') { persist(); render('setup'); const r = $(`input[name="mode"][value="${state.setup.mode}"]`); if (r) r.focus(); } }
  });

  main.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'answer') { onAnswerInput(t); return; }
    if (t.dataset.action === 'tts-rate') { ACTIONS['tts-rate'](t); return; }
    if (t.dataset.bind && (t.type === 'text' || t.type === 'url')) {
      bind(t);
      if (t.dataset.bind === 'customSub' && t.value.trim()) { $$('input[name="sub"]').forEach(r => { r.checked = false; }); state.sub = null; }
      if (t.dataset.bind === 'details.title' && t.value.trim().length >= 2) { $('#jobTitleErr').hidden = true; t.removeAttribute('aria-invalid'); }
      updateFieldNext();
    }
  });

  function bind(t) {
    const path = t.dataset.bind.split('.');
    let obj = state;
    for (let i = 0; i < path.length - 1; i++) obj = obj[path[i]];
    obj[path[path.length - 1]] = path[0] === 'setup' && path[1] === 'count' ? +t.value : t.value;
    if (path[0] === 'details' && path[1] === 'exp') { const er = $('#expErr'); if (er) er.hidden = true; }
    persistSoon();
  }
  function updateFieldNext() { const b = $('[data-action="field-next"]'); if (b) b.disabled = !fieldDone(); }

  /* السحب والإفلات */
  main.addEventListener('dragover', (e) => { const z = e.target.closest('[data-drop]'); if (z) { e.preventDefault(); z.classList.add('drag'); } });
  main.addEventListener('dragleave', (e) => { const z = e.target.closest('[data-drop]'); if (z && !z.contains(e.relatedTarget)) z.classList.remove('drag'); });
  main.addEventListener('drop', (e) => {
    const z = e.target.closest('[data-drop]');
    if (!z) return;
    e.preventDefault(); z.classList.remove('drag');
    handleFiles(z.dataset.drop, e.dataTransfer.files);
  });

  /* اختصار لوحة المفاتيح: Ctrl+Enter لإرسال الإجابة */
  main.addEventListener('keydown', (e) => {
    if (e.target.id === 'answer' && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submitAnswer(); }
    if (e.key === 'Enter' && e.target.id === 'pinIn') { e.preventDefault(); ACTIONS['admin-unlock'](); }
    if (e.key === 'Enter' && e.target.id === 'pin2') { e.preventDefault(); ACTIONS['admin-create-pin'](); }
  });

  /* القائمة في الجوال */
  const toggle = $('.nav-toggle');
  function closeNav() { $('#mainNav').classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); }
  toggle.addEventListener('click', () => { const open = $('#mainNav').classList.toggle('open'); toggle.setAttribute('aria-expanded', String(open)); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeNav(); });

  S.onVoices(() => { if (currentView === 'settings') render('settings'); });
  window.addEventListener('beforeunload', () => { stopVoice(); });
  window.addEventListener('hashchange', route);

  restore();
  renderBadge();
  route();
})();
