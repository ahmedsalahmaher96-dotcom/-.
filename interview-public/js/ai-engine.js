/* طبقة محرك الذكاء الاصطناعي — مستقلة عن الواجهة.
   كل مزود يطبق الواجهة نفسها:
     analyzeDocuments(ctx) · generateQuestions(ctx) · evaluateAnswer(ctx, question, answer)
     followUp(ctx, question, answer, evaluation) · finalReport(ctx, items)
   - DemoProvider: وضع تجريبي محلي. أسئلة من بنك ثابت وتقييم بقواعد محددة وشفافة (غير عشوائية)،
     وكل نتائجه موسومة بأنها تجريبية وليست تقييماً بالذكاء الاصطناعي.
   - RemoteProvider: يرسل الطلبات إلى خادم وسيط (server/server.js) يحتفظ بمفتاح API، ولا يوجد أي مفتاح هنا. */
window.IMS = window.IMS || {};

IMS.ai = (function () {
  'use strict';
  const D = IMS.data;

  /* ---------- أدوات نصية ---------- */
  function norm(s) {
    return String(s || '').toLowerCase()
      .replace(/[ً-ْـ]/g, '')
      .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
      .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660));
  }
  function words(s) { return norm(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean); }
  const STOP = new Set(words('في من على الى عن مع ما ماذا كيف لماذا متى هل او ثم التي الذي هذا هذه ذلك تلك كان كانت انت انك لك لديك به بها فيه فيها اذا قد كل اي عند بين بعد قبل وما وكيف the a an and or of to in on for with what how why when do you your is are was were did does can could would should about which that this from as at by it be have has'));
  /* تجذيع تقريبي: إزالة السوابق الشائعة ثم مقارنة أول 3 أحرف (يكفي لمطابقة مثل: عملت/أعمل، نفسك/النفس) */
  function stem(w) {
    if (/^[a-z]/.test(w)) return w.slice(0, 5);
    let s = w.replace(/^(و|ف)?(ب|ك|ل)?(ال|لل)?/, '');
    if (s.length >= 4) s = s.replace(/^[ايتن](?=...)/, '');
    return (s.length >= 3 ? s : w).slice(0, 3);
  }
  function contentStems(s) { return [...new Set(words(s).filter(w => w.length >= 3 && !STOP.has(w)).map(stem))]; }
  function has(textNorm, kw) { return textNorm.includes(norm(kw)); }
  function fill(t, ctx) {
    return t.replace(/\{title\}/g, ctx.title || '').replace(/\{sub\}/g, ctx.sub || '')
      .replace(/\{field\}/g, ctx.field || '').replace(/\{fieldEn\}/g, ctx.fieldEn || 'your field');
  }
  function rng(seed) {
    let s = Math.abs(Math.floor(seed)) % 2147483647; if (s <= 0) s += 2147483646;
    return () => (s = s * 16807 % 2147483647) / 2147483647;
  }
  function shuffle(arr, seed) {
    const r = rng(seed), a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function criteriaFor(ctx) { return D.CRITERIA[ctx.fieldId] || D.CRITERIA.other; }
  function isBehavioral(q) {
    if (q.type === 'behavioral' || q.type === 'document') return true;
    return /حدثنا عن موقف|صف موقف|اخبرنا عن|أخبرنا عن|tell me about a time|describe a (time|situation)/i.test(q.text);
  }

  /* يختار أسطراً مفيدة من نص مستند (متطلبات/خبرات) */
  function pickLines(text, max) {
    const lines = String(text || '').split(/\r?\n/).map(l => l.replace(/^\s*[-•*▪●◦\d.)]+\s*/, '').trim())
      .filter(l => l.length >= 25 && l.length <= 170 && !/@|https?:|\+?\d[\d\s-]{7,}/.test(l));
    return lines.slice(0, 40).filter((l, i, a) => a.indexOf(l) === i).slice(0, max);
  }

  /* ---------- بنك الأسئلة المرفق (مهندس التخطيط) ---------- */
  const BANK = window.IMS.planningBank || null;
  function bankItem(id) { return BANK ? BANK.questions.find(x => x.id === id) || null : null; }

  function bankQuestions(ctx) {
    if (!BANK) return [];
    /* null = الكل، والمصفوفة الفارغة = لا شيء */
    const topics = Array.isArray(ctx.bankTopics) ? ctx.bankTopics : Object.keys(BANK.topics);
    const levels = Array.isArray(ctx.bankLevels) ? ctx.bankLevels : Object.keys(BANK.levels);
    let list = BANK.questions.filter(q => topics.includes(q.topic) && levels.includes(q.level));
    if (ctx.bankOrder === 'mixed') list = shuffle(list, ctx.seed);
    if (ctx.bankCount && ctx.bankCount !== 'all') list = list.slice(0, +ctx.bankCount);
    if (ctx.bankOrder !== 'mixed') list.sort((a, b) => BANK.questions.indexOf(a) - BANK.questions.indexOf(b));
    /* يُطرح السؤال بترجمته العربية (من المنصة) ويُحتفظ بالنص الإنجليزي الأصلي من الملف بجانبه */
    const AR = window.IMS.planningBankAr || {};
    return list.map(q => ({ text: AR[q.id] || q.question, textEn: AR[q.id] ? q.question : null, type: 'bank', source: 'bank', bankId: q.id, label: q.label, topic: q.topic, level: q.level }));
  }

  /* مرادفات عربية للمصطلحات الإنجليزية الشائعة (من المنصة) حتى تُقارن الإجابات العربية بالمرجع الإنجليزي */
  const GLOSSARY = {
    float: ['فلوت', 'السماح', 'الفائض', 'الفتره الحره', 'تعويم'], slack: ['فلوت', 'السماح'], critical: ['حرج'], path: ['مسار'],
    baseline: ['خط الاساس', 'الخطه المرجعيه', 'بيس لاين', 'المرجعي'], schedule: ['جدول', 'البرنامج الزمني', 'برنامج زمني'],
    activit: ['نشاط', 'انشطه'], successor: ['لاحق', 'التالي'], predecessor: ['سابق'], milestone: ['معلم', 'مايلستون', 'حدث رئيسي'],
    duration: ['مده', 'مدة'], progress: ['تقدم', 'انجاز'], resource: ['مورد', 'موارد'], cost: ['تكلفه', 'تكاليف'], budget: ['ميزانيه', 'موازنه'],
    earned: ['مكتسب'], planned: ['مخطط'], actual: ['فعلي'], delay: ['تاخير', 'تاخر'], contract: ['عقد'], scope: ['نطاق'],
    change: ['تغيير'], quantit: ['كميه', 'كميات'], productiv: ['انتاجيه'], logic: ['منطق', 'علاقات'], relationship: ['علاقه', 'علاقات'],
    constraint: ['قيد', 'قيود'], drawing: ['رسومات', 'مخططات'], stakeholder: ['اصحاب المصلحه', 'الاطراف المعنيه'], recovery: ['تعافي', 'استرداد', 'استدراك'],
    compress: ['ضغط'], parallel: ['توازي', 'بالتوازي'], extension: ['تمديد'], negative: ['سالب'], early: ['مبكر'], late: ['متاخر'],
    forward: ['امامي'], backward: ['عكسي', 'خلفي'], payment: ['دفعه', 'مستخلص'], report: ['تقرير'], risk: ['مخاطر'], longest: ['اطول'],
    zero: ['صفر'], weekly: ['اسبوعي'], manhour: ['ساعات عمل', 'ساعات العمل'], 'man-hour': ['ساعات عمل', 'ساعات العمل'], curve: ['منحني'],
    project: ['مشروع'], plan: ['خطه'], update: ['تحديث'], drive: ['يقود', 'محرك'], level: ['مستوي', 'مستويات'], analysis: ['تحليل'],
    claim: ['مطالبه'], acceleration: ['تسريع'], crashing: ['ضغط بالموارد'], fast: ['توازي'], lag: ['تاخير زمني', 'لاج'], lead: ['تقديم', 'ليد'],
    program: ['برنامج'], approved: ['معتمد', 'اعتماد', 'موافق'], parties: ['الطرفين', 'طرفين', 'الاطراف'], measure: ['قياس', 'يقيس', 'نقيس'],
    benchmark: ['مرجع', 'معيار', 'مقارنه'], compar: ['مقارنه', 'نقارن'], total: ['الكلي', 'اجمالي'], free: ['الحر'], start: ['بدايه', 'بدء'],
    finish: ['نهايه', 'انتهاء'], minimum: ['اقل', 'الحد الادني'], performance: ['اداء'], indicator: ['مؤشر'], ratio: ['نسبه'],
    formula: ['معادله', 'صيغه'], calendar: ['تقويم'], document: ['مستندات', 'وثائق'], contractor: ['مقاول'], client: ['عميل', 'المالك'],
    owner: ['مالك'], software: ['برنامج', 'برمجيات'], technique: ['اسلوب', 'تقنيه', 'طريقه'], method: ['طريقه', 'اسلوب'],
    efficien: ['كفاءه'], output: ['مخرجات', 'انتاج'], input: ['مدخلات'], hours: ['ساعه', 'ساعات'], meeting: ['اجتماع'], team: ['فريق'],
    phase: ['مرحله'], deliverable: ['تسليمات', 'مخرجات'], hierarch: ['هرمي'], decomposition: ['تفكيك', 'تجزئه'], package: ['حزمه'],
    driving: ['يقود', 'المحرك'], sequence: ['تسلسل'], dates: ['تواريخ', 'تاريخ'], budgeted: ['ميزانيه', 'المخططه'], value: ['قيمه'],
    variance: ['انحراف', 'فرق'], forecast: ['توقع', 'تنبؤ'], cash: ['نقدي', 'السيوله'], scenario: ['سيناريو'], merge: ['دمج']
  };
  const REF_STOP = new Set('about above after again also although always another answer anything around based because before being below better between both called cannot could different does doing during either every example first following found further given going having however just know like little long make many more most much must need never normally nothing only other over particular rather really same should since some something still such than that their them then there these they thing think this those though through time under used using usually very want well what when where whether which while will with without would your read more here visit details different'.split(' '));
  const ACR_STOP = new Set(['I', 'A', 'OK', 'IT', 'MS', 'L.D', 'LD', 'PMI']);

  /* النقاط المفتاحية في الإجابة المرجعية: الاختصارات ثم المصطلحات الأكثر تكراراً */
  function keyPoints(ref) {
    /* تُستبعد إحالات الروابط في الملف (مثل: You can read more here...) من المقارنة فقط، ويبقى النص المعروض كما هو */
    ref = ref.replace(/[^.\n]*\b(read more|for more details|you can visit)\b[^.\n]*[.\n]?/gi, ' ').replace(/(\w)-(\w)/g, '$1 $2');
    const acr = [...new Set((ref.match(/\b[A-Z][A-Z0-9]{1,6}\b/g) || []).filter(a => !ACR_STOP.has(a)))].slice(0, 5);
    const freq = {};
    (ref.toLowerCase().match(/[a-z][a-z-]{4,}/g) || []).filter(w => !REF_STOP.has(w)).forEach(w => {
      const k = w.slice(0, 6); freq[k] = freq[k] || { w, n: 0 }; freq[k].n++;
    });
    const terms = Object.values(freq).sort((a, b) => b.n - a.n || b.w.length - a.w.length).map(x => x.w)
      .filter(w => !acr.some(a => a.toLowerCase() === w)).slice(0, Math.max(3, 9 - acr.length));
    return acr.map(a => ({ k: a, acr: true })).concat(terms.map(t => ({ k: t, acr: false })));
  }
  function pointMatched(p, ansRaw, ansNorm) {
    if (p.acr) return new RegExp('\\b' + p.k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(ansRaw);
    if (ansNorm.includes(p.k.slice(0, Math.min(6, p.k.length)))) return true;
    const keys = Object.keys(GLOSSARY);
    const g = keys.filter(k => p.k.startsWith(k)).sort((a, b) => b.length - a.length)[0] || keys.find(k => k.startsWith(p.k.slice(0, 6)));
    return !!(g && GLOSSARY[g].some(s => ansNorm.includes(norm(s))));
  }
  /* فحص الصحة الفنية للصيغ المعروفة (معرفة عامة من المنصة) */
  const FORMULAS = { CPI: ['EV', '/', 'AC'], SPI: ['EV', '/', 'PV'], CV: ['EV', '-', 'AC'], SV: ['EV', '-', 'PV'] };
  function formulaErrors(ans) {
    const errs = [];
    const re = /\b(CPI|SPI|CV|SV)\s*=\s*\(?\s*(EV|AC|PV)\s*([\/÷\-–])\s*(EV|AC|PV)\b/gi;
    let m;
    while ((m = re.exec(ans))) {
      const f = FORMULAS[m[1].toUpperCase()];
      const op = m[3] === '÷' ? '/' : (m[3] === '–' ? '-' : m[3]);
      if (m[2].toUpperCase() !== f[0] || op !== f[1] || m[4].toUpperCase() !== f[2]) {
        errs.push(`الصيغة «${m[0].trim()}» غير صحيحة؛ الصحيح: ${m[1].toUpperCase()} = ${f.join(' ')}.`);
      }
    }
    return errs;
  }

  /* ---------- النقاط المفتاحية في الإجابات الصحيحة العربية ---------- */
  const AR_STOP = new Set(words('التي الذي الذين هذه هذا ذلك تلك هناك عندما حيث ايضا مثل كل بعض يتم خلال بين علي الي عن من في مع او ثم لكن اذا هو هي هما نحن انا يمكن يجب عاده جميع اكثر اقل ليس كان كانت قد لقد فقط ان لا ما ماذا كيف لماذا لديك لدينا عليك عليه عليها منها منه فيها فيه انه انها بينهما كلاهما سواء غير حتي الا اما وهو وهي وهذا وهذه وذلك لان لذلك ولكن يكون تكون مثلا كما عند بعد قبل دون نحو اي الى على اذن وفي ومن خلالها خلاله بشكل اخري الاخري الاخر عليها لها له بها به وهناك يعني تعني'));
  function arStem(w) {
    let s = w;
    if (s.length > 4) s = s.replace(/^(و|ف)?(ب|ك|ل)?(ال|لل)/, '') || s;
    if (s.length > 4) s = s.replace(/(ات|ون|ين|ها|هم|هن|كم|نا|ان|يه|ه|ي)$/, '') || s;
    return s.slice(0, 4);
  }
  function arTokens(text) {
    return String(text || '').split(/[^\p{L}\p{N}]+/u).filter(Boolean)
      .map(raw => ({ raw, n: norm(raw) })).filter(t => /[؀-ۿ]/.test(t.n));
  }
  function arKeyPoints(ref) {
    const acr = [...new Set((ref.match(/\b[A-Z][A-Z0-9]{1,6}\b/g) || []).filter(a => !ACR_STOP.has(a)))].slice(0, 4);
    const freq = {};
    arTokens(ref).filter(t => t.n.length >= 4 && !AR_STOP.has(t.n)).forEach((t, i) => {
      const k = arStem(t.n); freq[k] = freq[k] || { k, w: t.raw, n: 0, first: i }; freq[k].n++;
    });
    const all = Object.values(freq);
    const take = Math.max(3, Math.min(8 - acr.length, Math.ceil(all.length * 0.35)));
    const terms = all.sort((a, b) => b.n - a.n || a.first - b.first).slice(0, take);
    return acr.map(a => ({ k: a, acr: true })).concat(terms.map(t => ({ k: t.w, stem: t.k, ar: true })));
  }
  function latinHeavy(s) { return (s.match(/[A-Za-z]/g) || []).length > (s.match(/[؀-ۿ]/g) || []).length; }

  function evaluateAgainstReference(ctx, q, answer, item) {
    const L = ctx.lang === 'en' ? 'en' : 'ar';
    const n = norm(answer).replace(/(\w)-(\w)/g, '$1 $2');
    const wc = words(answer).length;
    /* تُقارن الإجابة العربية بالإجابة الصحيحة العربية، والإجابة الإنجليزية بالنص الأصلي */
    const useEn = !item.answerAr || (item.answerEn && latinHeavy(answer));
    const refText = useEn ? item.answerEn : item.answerAr;
    const ansStems = new Set(arTokens(answer).map(t => arStem(t.n)));
    const points = useEn ? keyPoints(refText) : arKeyPoints(refText);
    const matched = points.filter(p => p.ar ? ansStems.has(p.stem) : pointMatched(p, answer, n));
    const missed = points.filter(p => !matched.includes(p));
    const need = Math.max(1, Math.min(points.length, Math.max(2, Math.ceil(points.length * 0.6))));
    const errors = formulaErrors(answer);
    const refWords = words(refText).length;
    const expected = Math.min(60, Math.max(Math.min(12, refWords), Math.round(refWords * 0.45)));
    const breakdown = [
      { label: 'تغطية المفاهيم الواردة في الإجابة المرجعية', got: Math.min(1, matched.length / need) * 5.5, max: 5.5 },
      { label: 'الصحة الفنية (فحص الصيغ المعروفة)', got: errors.length ? 0 : 1.5, max: 1.5 },
      { label: 'اكتمال الإجابة', got: Math.min(1, wc / expected) * 1.5, max: 1.5 },
      { label: 'الوضوح والتعليل والأمثلة', got: Math.min(1, (D.EXPLAIN.filter(k => has(n, k)).length + (/\d/.test(n) ? 1 : 0)) / 2) * 1.5, max: 1.5 }
    ];
    let score = breakdown.reduce((s, b) => s + b.got, 0);
    if (errors.length) score = Math.min(score, 4);
    if (wc < Math.min(4, refWords)) score = Math.min(score, 1.5);
    score = Math.round(score * 10) / 10;
    breakdown.forEach(b => { b.got = Math.round(b.got * 10) / 10; });
    const strengths = [];
    if (matched.length) strengths.push('ذكرت مفاهيم واردة في الإجابة الصحيحة: ' + matched.map(p => p.k).join('، ') + '.');
    if (wc >= expected) strengths.push('إجابة مكتملة بطول مناسب.');
    const weaknesses = [];
    if (matched.length < need) weaknesses.push(`غطّيت ${matched.length} من ${points.length} مفاهيم أساسية في الإجابة الصحيحة.`);
    if (wc < expected) weaknesses.push(`الإجابة مختصرة (${wc} كلمة)؛ الإجابة الصحيحة تتناول الفكرة بتفصيل أكبر.`);
    const topic = item.topicLabel || '';
    return {
      demo: true, score, breakdown, wrong: score < 6 || errors.length > 0,
      strengths: strengths.length ? strengths : ['حاولت الإجابة؛ قارن إجابتك بالإجابة الصحيحة.'],
      weaknesses, technicalErrors: errors,
      missing: missed.slice(0, 6).map(p => (p.acr ? 'الاختصار/المفهوم ' : 'المفهوم ') + '«' + p.k + '»'),
      improved: '', tip: errors.length ? 'راجع الصيغة الصحيحة واحفظها مع معنى كل رمز فيها.'
        : missed.length ? `ركّز على المفاهيم التي فاتتك (${missed.slice(0, 3).map(p => p.k).join('، ')}) واشرح علاقتها بالسؤال بمثال من مشروع.`
          : 'إجابتك تغطي المفاهيم الأساسية؛ أضف مثالاً عملياً من مشروع لتقوية الإجابة.',
      covered: score >= 6 ? [topic] : [], uncovered: score < 6 ? [topic] : [],
      followHint: (missed.find(p => !/^(project|activit|schedul|planning|program|plans?$|works?$)/.test(p.k) && !/^(ال)?(مشروع|نشاط|انشط|برنامج|جدول)/.test(norm(p.k))) || {}).k || null,
      reference: item, lang: L,
      method: 'مقارنة آلية بالمفاهيم الأساسية في الإجابة الصحيحة + فحص الصيغ المعروفة. لا تتحقق آلياً من كل جوانب الصحة الفنية؛ للتقييم الدقيق استخدم محرك الذكاء الاصطناعي.'
    };
  }
  /* الإجابة الصحيحة لسؤال المقابلة: من مخزن الإدارة (يشمل بنك مهندس التخطيط والأسئلة المضافة) */
  function refFor(q) {
    if (window.IMS.admin) return window.IMS.admin.refFor(q);
    const b = q.bankId ? bankItem(q.bankId) : null;
    return b ? { label: b.label, answerAr: null, answerEn: b.answer, kind: b.kind, note: b.note, hasFigure: b.hasFigure, topicLabel: BANK.topics[b.topic] } : null;
  }

  /* ---------- المزود التجريبي ---------- */
  const DemoProvider = {
    id: 'demo',
    isDemo: true,

    async analyzeDocuments(ctx) {
      const crit = criteriaFor(ctx);
      const scan = (t) => { const n = norm(t); return crit.filter(c => c.kw.some(k => has(n, k))).map(c => c.label); };
      const out = { demo: true, note: 'تحليل نصي آلي بسيط (مطابقة كلمات مفتاحية)، وليس تحليلاً بالذكاء الاصطناعي.' };
      if (ctx.cvText) out.cv = { chars: ctx.cvText.length, covered: scan(ctx.cvText), highlights: pickLines(ctx.cvText, 3) };
      if (ctx.jdText) out.jd = { chars: ctx.jdText.length, covered: scan(ctx.jdText), highlights: pickLines(ctx.jdText, 3) };
      if (out.cv && out.jd) out.gaps = out.jd.covered.filter(l => !out.cv.covered.includes(l));
      if (ctx.fileQuestions) out.questionsCount = ctx.fileQuestions.length;
      return out;
    },

    async generateQuestions(ctx) {
      const L = ctx.lang === 'en' ? 'en' : 'ar';
      const B = D.BANK;
      const mk = (text, type) => ({ text: fill(text, ctx), type, source: 'demo' });
      if (ctx.mode === 'file') return (ctx.fileQuestions || []).map(t => ({ text: t, type: 'file', source: 'file' }));
      if (ctx.mode === 'bank') return bankQuestions(ctx);

      const intro = mk(B.intro[L], 'general');
      const closing = mk(B.closing[L], 'general');
      const beh = shuffle(B.behavioral[L], ctx.seed).map(t => mk(t, 'behavioral'));
      let tech = (B.technical[ctx.fieldId] || B.technical.other)[L].concat(ctx.sub || L === 'en' ? B.templates[L] : []);
      if (ctx.diff === 'advanced' || ctx.diff === 'competitive') tech = tech.concat(B.advanced[L]);
      tech = shuffle(tech, ctx.seed + 7).map(t => mk(t, 'technical'));
      const n = Math.max(3, ctx.count || 6);
      let middle = [];

      if (ctx.mode === 'technical') middle = tech;
      else if (ctx.mode === 'behavioral') middle = beh;
      else if (ctx.mode === 'cvjd') {
        const docs = [];
        pickLines(ctx.jdText, 3).forEach(l => docs.push(mk(L === 'en'
          ? `The job description mentions: "${l}". How does your experience match this requirement? Give a concrete example.`
          : `ورد في الوصف الوظيفي: «${l}». كيف تنطبق خبرتك على هذا المتطلب؟ أعطِ مثالاً عملياً.`, 'document')));
        pickLines(ctx.cvText, 2).forEach(l => docs.push(mk(L === 'en'
          ? `Your CV mentions: "${l}". Tell me in detail about your role and the results you achieved.`
          : `ذكرت في سيرتك الذاتية: «${l}». حدثنا بالتفصيل عن دورك والنتائج التي حققتها.`, 'document')));
        middle = docs.concat(interleave(tech, beh));
      } else middle = interleave(tech, beh);

      return [intro].concat(middle.slice(0, n - 2), [closing]).slice(0, n);
    },

    async evaluateAnswer(ctx, q, answer) {
      const item = refFor(q);
      if (item && item.kind === 'technical') return evaluateAgainstReference(ctx, q, answer, item);
      const ev = await DemoProvider.evaluateGeneric(ctx, q, answer);
      /* أسئلة التجربة الشخصية: إجابة المؤلف تُعرض للاستئناس فقط ولا تُقارن بها إجابتك */
      if (item) Object.assign(ev, { reference: item, improved: '', improvedNote: '' });
      return ev;
    },

    async evaluateGeneric(ctx, q, answer) {
      const L = ctx.lang === 'en' ? 'en' : 'ar';
      const n = norm(answer);
      const wc = words(answer).length;
      const expected = { beginner: 30, intermediate: 50, advanced: 70, competitive: 90 }[ctx.diff] || 50;
      const crit = criteriaFor(ctx);
      const behavioral = isBehavioral(q);
      const breakdown = [];
      const strengths = [], weaknesses = [], missing = [];

      /* 1) الاكتمال والطول */
      const lenScore = Math.min(1, wc / expected) * 2.5;
      breakdown.push({ label: 'اكتمال الإجابة وتفصيلها', got: lenScore, max: 2.5 });
      if (wc >= expected) strengths.push('إجابة مفصلة بطول مناسب لمستوى الصعوبة المختار.');
      else weaknesses.push(`الإجابة مختصرة (${wc} كلمة)؛ المتوقع في هذا المستوى نحو ${expected} كلمة أو أكثر.`);

      /* 2) البنية */
      let structScore;
      if (behavioral) {
        const hit = D.STAR.filter(s => s.kw.some(k => has(n, k)));
        structScore = hit.length / 4 * 2.5;
        breakdown.push({ label: 'بنية STAR (موقف، مهمة، إجراء، نتيجة)', got: structScore, max: 2.5 });
        if (hit.length >= 3) strengths.push('بنية واضحة تغطي معظم عناصر STAR: ' + hit.map(h => h.part).join('، ') + '.');
        D.STAR.filter(s => !hit.includes(s)).forEach(s => missing.push('عنصر «' + s.part + '» في بنية STAR'));
        if (hit.length < 3) weaknesses.push('الإجابة لا تتبع بنية قصة واضحة (الموقف، المهمة، الإجراء، النتيجة).');
      } else {
        /* الأسئلة الفنية/العامة: يُقبل الشرح المتسلسل أو سرد مثال مهني منظم، وتؤخذ الأعلى */
        const hits = D.EXPLAIN.filter(k => has(n, k)).length;
        const starHits = D.STAR.filter(s => s.kw.some(k => has(n, k))).length;
        structScore = Math.max(Math.min(3, hits) / 3, starHits / 4) * 2.5;
        breakdown.push({ label: 'تسلسل الشرح وتنظيم الإجابة', got: structScore, max: 2.5 });
        if (structScore >= 1.6) strengths.push(hits >= 2 ? 'شرح متسلسل يتضمن تعليلاً أو خطوات.' : 'إجابة منظمة تسرد مثالاً مهنياً بتسلسل واضح.');
        else weaknesses.push('الإجابة تحتاج إلى تنظيم أوضح: خطوات مرتبة وتعليل (لماذا؟ وكيف؟).');
      }

      /* 3) الأدلة الملموسة */
      const hasNum = /\d|%|٪|بنسبة|percent/.test(n);
      const hasEx = ['مثال', 'مثلا', 'على سبيل', 'example', 'for instance', 'e.g'].some(k => has(n, k)) || D.STAR[0].kw.some(k => has(n, k));
      const specScore = (hasNum ? 1 : 0) + (hasEx ? 0.5 : 0);
      breakdown.push({ label: 'أدلة ملموسة (أرقام وأمثلة)', got: specScore, max: 1.5 });
      if (hasNum) strengths.push('استخدام أرقام أو نتائج قابلة للقياس.');
      else { weaknesses.push('لا توجد أرقام أو نتائج قابلة للقياس.'); missing.push('نتيجة رقمية أو أثر قابل للقياس'); }
      if (!hasEx) missing.push('مثال عملي محدد من خبرتك');

      /* 4) معايير التخصص */
      const covered = crit.filter(c => c.kw.some(k => has(n, k)));
      const domScore = Math.min(1, covered.length / 3) * 2;
      breakdown.push({ label: 'معايير التخصص (' + (ctx.field || '') + ')', got: domScore, max: 2 });
      if (covered.length) strengths.push('تطرقت إلى جوانب مهمة في تخصصك: ' + covered.map(c => c.label).join('، ') + '.');
      const uncovered = crit.filter(c => !covered.includes(c));
      if (covered.length < 2) weaknesses.push('ضعف الربط بمعايير التخصص المهنية.');
      uncovered.slice(0, 3).forEach(c => missing.push(c.label));

      /* 5) الارتباط بالسؤال */
      const qs = contentStems(q.text);
      const as = new Set(contentStems(answer));
      const ratio = qs.length ? qs.filter(s => as.has(s)).length / qs.length : 0.5;
      const relScore = Math.min(1, ratio / 0.3) * 1.5;
      breakdown.push({ label: 'الارتباط بمضمون السؤال', got: relScore, max: 1.5 });
      if (ratio >= 0.3) strengths.push('الإجابة مرتبطة مباشرة بمضمون السؤال.');
      else weaknesses.push('قد تكون الإجابة بعيدة عن جوهر السؤال؛ أعد صياغة فكرة السؤال في بدايتها.');

      let score = breakdown.reduce((s, b) => s + b.got, 0);
      if (wc < 8) score = Math.min(score, 2);
      score = Math.round(score * 10) / 10;
      breakdown.forEach(b => { b.got = Math.round(b.got * 10) / 10; });

      const focus = uncovered.slice(0, 2).map(c => c.label);
      const improved = behavioral ? (L === 'en'
        ? `Situation: At [company/project], we faced [a challenge directly related to the question].\nTask: I was responsible for [your specific role and the goal].\nAction: First I [step 1], then I [step 2], making sure to address ${focus.join(' and ') || 'the key standards of my field'}.\nResult: This led to [a measurable outcome, e.g. 20% less time], and I learned [lesson].`
        : `الموقف: في [اسم الجهة/المشروع] واجهنا [تحدياً مرتبطاً مباشرة بالسؤال].\nالمهمة: كانت مسؤوليتي [دورك المحدد والهدف المطلوب].\nالإجراء: قمت أولاً بـ[الخطوة 1]، ثم [الخطوة 2]، مع مراعاة ${focus.join(' و') || 'معايير التخصص الأساسية'}.\nالنتيجة: أدى ذلك إلى [نتيجة قابلة للقياس، مثل خفض الوقت 20%]، وتعلمت [الدرس المستفاد].`)
        : (L === 'en'
          ? `Start with the core principle behind the question, then explain your approach in steps: 1) [assess/gather information], 2) [apply method/tool], 3) [verify and follow up]. Mention ${focus.join(' and ') || 'the relevant standards'}, then give a short real example from your experience with a measurable result.`
          : `ابدأ بتوضيح المبدأ الأساسي الذي يتناوله السؤال، ثم اشرح منهجيتك بخطوات: 1) [التقييم وجمع المعلومات]، 2) [تطبيق الأسلوب أو الأداة المناسبة]، 3) [التحقق والمتابعة]. اذكر ${focus.join(' و') || 'المعايير المهنية ذات الصلة'}، ثم اختم بمثال قصير من خبرتك مع نتيجة قابلة للقياس.`);

      const weakest = breakdown.slice().sort((a, b) => a.got / a.max - b.got / b.max)[0];
      const TIPS = {
        'اكتمال الإجابة وتفصيلها': 'استهدف إجابة من دقيقة إلى دقيقتين: فكرة رئيسية، ثم تفاصيل، ثم خلاصة.',
        'أدلة ملموسة (أرقام وأمثلة)': 'أضف رقماً واحداً على الأقل يوضح الأثر: نسبة، مدة، تكلفة، أو عدد.',
        'الارتباط بمضمون السؤال': 'ابدأ إجابتك بجملة تعيد فيها صياغة السؤال، ثم أجب عنه مباشرة.'
      };
      const tip = TIPS[weakest.label] || (weakest.label.startsWith('بنية')
        ? 'جهّز مسبقاً 4–5 قصص مهنية بهيكل STAR واستخدمها في الأسئلة السلوكية.'
        : weakest.label.startsWith('تسلسل') ? 'رتّب إجابتك بخطوات واستخدم كلمات الربط: أولاً، ثم، لأن، على سبيل المثال؛ لتوضيح منطقك.'
          : 'اربط إجابتك صراحةً بمعايير تخصصك مثل: ' + (focus.join('، ') || crit[0].label) + '.');

      return {
        demo: true, score, breakdown,
        strengths: strengths.length ? strengths : ['حاولت الإجابة عن السؤال؛ ابنِ عليها بالتفاصيل.'],
        weaknesses, missing: [...new Set(missing)].slice(0, 5),
        improved, improvedNote: 'نموذج توضيحي عام (الوضع التجريبي): استبدل ما بين الأقواس بتفاصيلك الحقيقية.',
        tip, covered: covered.map(c => c.label), uncovered: uncovered.map(c => c.label)
      };
    },

    async followUp(ctx, q, answer, ev) {
      const L = ctx.lang === 'en' ? 'en' : 'ar';
      const n = norm(answer);
      if (ev && ev.followHint) return { text: L === 'en' ? `You did not mention "${ev.followHint}". How does it relate to this topic? Explain with a practical example.` : `لم تذكر «${ev.followHint}». ما علاقته بهذا الموضوع؟ اشرح بمثال عملي.` };
      if (q.bankId || q.adminId) return { text: L === 'en' ? 'Can you give a practical example from a project where you applied this?' : 'هل يمكنك إعطاء مثال عملي من مشروع طبّقت فيه ذلك؟' };
      if (!/\d|%|٪/.test(n)) return { text: L === 'en' ? 'What was the measurable outcome of what you described? Please give numbers if possible.' : 'ما النتيجة أو الأثر الذي تحقق مما ذكرته؟ اذكره بالأرقام إن أمكن.' };
      if (ev && ev.uncovered && ev.uncovered.length) return { text: L === 'en' ? `How did you take "${ev.uncovered[0]}" into account in this situation?` : `كيف راعيت جانب «${ev.uncovered[0]}» في هذا الموقف أو الحل؟` };
      return { text: L === 'en' ? 'If you faced the same situation today, what would you do differently and why?' : 'لو واجهت الموقف نفسه اليوم، ما الذي ستفعله بشكل مختلف ولماذا؟' };
    },

    async finalReport(ctx, items) {
      const answered = items.filter(i => i.evaluation);
      const count = (key) => {
        const m = {};
        answered.forEach(i => (i.evaluation[key] || []).forEach(l => { m[l] = (m[l] || 0) + 1; }));
        return Object.entries(m).sort((a, b) => b[1] - a[1]).map(e => e[0]);
      };
      const coveredTop = count('covered');
      const gapsTop = count('uncovered');
      const strengths = [];
      if (coveredTop.length) strengths.push('تكرر تطرقك إلى: ' + coveredTop.slice(0, 3).join('، ') + '.');
      const avgStruct = avgPart(answered, b => b.label.startsWith('بنية') || b.label.startsWith('تسلسل'));
      const avgSpec = avgPart(answered, b => b.label.startsWith('أدلة'));
      const avgLen = avgPart(answered, b => b.label.startsWith('اكتمال'));
      if (avgStruct >= 0.6) strengths.push('تنظيم جيد لإجاباتك وتسلسل منطقي.');
      if (avgSpec >= 0.6) strengths.push('دعم الإجابات بأرقام وأمثلة ملموسة.');
      if (avgLen >= 0.8) strengths.push('إجابات مفصلة ومكتملة.');
      const improvements = gapsTop.slice(0, 3).map(g => 'تعزيز جانب «' + g + '» في إجاباتك.');
      if (avgStruct < 0.6) improvements.push('تنظيم الإجابات (بنية STAR للأسئلة السلوكية، وخطوات واضحة للأسئلة الفنية).');
      if (avgSpec < 0.6) improvements.push('إضافة أرقام ونتائج قابلة للقياس.');
      if (avgLen < 0.8) improvements.push('التوسع في التفاصيل بما يناسب مستوى الصعوبة.');

      const recos = (D.RECOS[ctx.fieldId] || D.RECOS.other).slice();
      const weakTopics = topicAverages(items).filter(t => t.avg < 6);
      weakTopics.forEach(t => recos.unshift(`راجع موضوع «${t.label}» في بنك أسئلة مهندس التخطيط (متوسطك ${t.avg}/10) وقارن إجاباتك بالإجابات المرجعية.`));
      if (ctx.title) recos.unshift(`راجع متطلبات وظيفة «${ctx.title}» وجهّز مثالاً لكل متطلب رئيسي فيها.`);
      const g = gapsTop.length ? gapsTop : ['معايير التخصص الأساسية'];
      const plan = [
        { week: 'الأسبوع 1', focus: g[0], tasks: [`راجع أساسيات «${g[0]}» في سياق ${ctx.sub || ctx.field}.`, 'اكتب إجابتين نموذجيتين تتضمن هذا الجانب ودرّب نفسك على قولهما بصوت مسموع.'] },
        { week: 'الأسبوع 2', focus: 'القصص المهنية بهيكل STAR', tasks: ['جهّز 5 قصص مهنية تتضمن أرقاماً ونتائج.', 'سجّل إجاباتك صوتياً واستمع إليها لتحسين الوضوح والإيقاع.'] },
        { week: 'الأسبوع 3', focus: g[1] || 'الأسئلة الفنية في التخصص', tasks: [`تدرّب على 10 أسئلة فنية في ${ctx.sub || ctx.field}.`, 'ركّز على شرح منهجيتك خطوة بخطوة مع التعليل.'] },
        { week: 'الأسبوع 4', focus: 'محاكاة كاملة', tasks: ['أجرِ مقابلة شاملة جديدة على مستوى صعوبة أعلى.', 'قارن نتيجتك بهذا التقرير وحدد ما تحسن.'] }
      ];
      return {
        demo: true, strengths: strengths.length ? strengths : ['لا تتوفر نقاط قوة كافية للاستنتاج بعد؛ أجب عن مزيد من الأسئلة.'],
        improvements: [...new Set(improvements)], recommendations: recos, plan,
        summary: 'ملخص مبني على قواعد التقييم التجريبية المحددة (طول الإجابة، البنية، الأدلة، معايير التخصص، الارتباط بالسؤال).'
      };
    }
  };

  function interleave(a, b) {
    const out = []; const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) { if (a[i]) out.push(a[i]); if (b[i]) out.push(b[i]); }
    return out;
  }
  /* متوسط الدرجة لكل موضوع من مواضيع بنك الأسئلة */
  function topicAverages(items) {
    if (!BANK) return [];
    const m = {};
    items.forEach(i => {
      if (!i.question.topic || !i.evaluation) return;
      (m[i.question.topic] = m[i.question.topic] || []).push(i.evaluation.score);
    });
    return Object.entries(m).map(([k, v]) => ({ topic: k, label: BANK.topics[k], count: v.length, avg: Math.round(v.reduce((s, x) => s + x, 0) / v.length * 10) / 10 }))
      .sort((a, b) => a.avg - b.avg);
  }
  function avgPart(items, pred) {
    const vals = items.map(i => (i.evaluation.breakdown || []).find(pred)).filter(Boolean).map(b => b.got / b.max);
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
  }

  /* ---------- مزود خادم الذكاء الاصطناعي ---------- */
  function slim(ctx, withDocs) {
    const c = {
      field: ctx.field, sub: ctx.sub, title: ctx.title, experience: ctx.expLabel, difficulty: ctx.diffLabel,
      language: ctx.lang === 'en' ? 'English' : 'Arabic', market: ctx.market, mode: ctx.mode, count: ctx.count,
      criteria: criteriaFor(ctx).map(x => x.label)
    };
    if (withDocs) {
      const cut = (t) => t ? String(t).slice(0, 15000) : '';
      c.cvText = cut(ctx.cvText); c.jdText = cut(ctx.jdText); c.extraText = cut(ctx.extraText);
      c.fileQuestions = ctx.fileQuestions || [];
    }
    return c;
  }

  function RemoteProvider(apiBase) {
    const base = String(apiBase || '/api').replace(/\/+$/, '');
    async function call(task, payload) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 120000);
      try {
        const r = await fetch(base + '/interview', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ task, payload }), signal: ctrl.signal
        });
        const data = await r.json().catch(() => null);
        if (!r.ok || !data) throw new Error((data && data.error) || ('استجاب الخادم بخطأ (HTTP ' + r.status + ').'));
        return data;
      } catch (e) {
        if (e.name === 'AbortError') throw new Error('انتهت مهلة انتظار رد خادم الذكاء الاصطناعي.');
        if (e instanceof TypeError) throw new Error('تعذر الاتصال بخادم الذكاء الاصطناعي على ' + base + '. تأكد من تشغيله (راجع README).');
        throw e;
      } finally { clearTimeout(timer); }
    }
    const list = (v) => Array.isArray(v) ? v.map(String).filter(Boolean) : [];
    return {
      id: 'remote', isDemo: false,
      async analyzeDocuments(ctx) { return call('analyzeDocuments', slim(ctx, true)); },
      async generateQuestions(ctx) {
        if (ctx.mode === 'file') return (ctx.fileQuestions || []).map(t => ({ text: t, type: 'file', source: 'file' }));
        if (ctx.mode === 'bank') return bankQuestions(ctx);
        const r = await call('generateQuestions', slim(ctx, true));
        const qs = (r.questions || []).filter(q => q && q.text).map(q => ({ text: String(q.text), type: q.type || 'general', source: 'ai' }));
        if (!qs.length) throw new Error('لم يُرجع الخادم أي أسئلة.');
        return qs;
      },
      async evaluateAnswer(ctx, q, answer) {
        const item = refFor(q);
        const payload = { ctx: slim(ctx), question: q.textEn ? q.text + '\n(Original: ' + q.textEn + ')' : q.text, questionType: q.type, answer };
        if (item) payload.reference = { answer: item.answerAr || item.answerEn, original: item.answerAr ? item.answerEn : null, kind: item.kind, platformNote: item.note, hasFigure: item.hasFigure };
        const r = await call('evaluateAnswer', payload);
        const score = Math.max(0, Math.min(10, Number(r.score)));
        if (!isFinite(score)) throw new Error('رد الخادم لا يحتوي على درجة صالحة.');
        const ev = {
          demo: false, score: Math.round(score * 10) / 10,
          strengths: list(r.strengths), weaknesses: list(r.weaknesses), missing: list(r.missing),
          technicalErrors: list(r.technicalErrors),
          improved: String(r.improvedAnswer || ''), tip: String(r.tip || ''),
          covered: list(r.coveredCriteria), uncovered: list(r.missingCriteria)
        };
        if (item) {
          ev.reference = item; ev.wrong = score < 6 || ev.technicalErrors.length > 0;
          ev.covered = score >= 6 ? [item.topicLabel] : []; ev.uncovered = score < 6 ? [item.topicLabel] : [];
        }
        return ev;
      },
      async followUp(ctx, q, answer) {
        const r = await call('followUp', { ctx: slim(ctx), question: q.text, answer });
        if (!r.text) throw new Error('لم يُرجع الخادم سؤال متابعة.');
        return { text: String(r.text) };
      },
      async finalReport(ctx, items) {
        const r = await call('finalReport', {
          ctx: slim(ctx),
          items: items.map(i => ({ question: i.question.text, answer: i.answer || null, score: i.evaluation ? i.evaluation.score : null, skipped: !!i.skipped }))
        });
        return {
          demo: false, strengths: list(r.strengths), improvements: list(r.improvements),
          recommendations: list(r.recommendations), summary: String(r.summary || ''),
          plan: Array.isArray(r.plan) ? r.plan.map(p => ({ week: String(p.week || ''), focus: String(p.focus || ''), tasks: list(p.tasks) })) : []
        };
      }
    };
  }

  async function health(apiBase) {
    const base = String(apiBase || '/api').replace(/\/+$/, '');
    const r = await fetch(base + '/health', { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  function get(settings) {
    return settings.engine === 'remote' ? RemoteProvider(settings.apiBase) : DemoProvider;
  }

  return { get, health, DemoProvider, RemoteProvider, criteriaFor, bankQuestions, topicAverages };
})();
