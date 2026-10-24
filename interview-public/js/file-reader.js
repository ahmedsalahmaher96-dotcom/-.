/* قراءة الملفات واستخراج النص منها داخل المتصفح.
   - TXT/MD/CSV: قراءة مباشرة.
   - PDF: مكتبة pdf.js (تُحمَّل عند الحاجة من cdnjs).
   - DOCX: مكتبة mammoth (تُحمَّل عند الحاجة من cdnjs).
   لا يُرسل أي ملف إلى أي خادم في هذه المرحلة. */
window.IMS = window.IMS || {};

IMS.files = (function () {
  'use strict';

  const MAX_SIZE = 10 * 1024 * 1024;
  const KINDS = { txt: 'text', md: 'text', csv: 'text', pdf: 'pdf', docx: 'docx' };
  const ACCEPT = '.pdf,.docx,.txt,.md,.csv';

  const LIBS = {
    pdf: {
      url: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
      worker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
      global: 'pdfjsLib'
    },
    docx: {
      url: 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js',
      global: 'mammoth'
    }
  };
  const loading = {};

  function ext(name) {
    const m = /\.([a-z0-9]+)$/i.exec(name || '');
    return m ? m[1].toLowerCase() : '';
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' بايت';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' ك.ب';
    return (bytes / (1024 * 1024)).toFixed(2) + ' م.ب';
  }

  /* يعيد null إذا كان الملف مقبولاً، أو رسالة خطأ مفهومة */
  function validate(file) {
    const e = ext(file.name);
    if (e === 'doc') return 'صيغة DOC القديمة غير مدعومة. احفظ الملف بصيغة DOCX أو PDF ثم أعد رفعه.';
    if (!KINDS[e]) return `الصيغة «${e || 'غير معروفة'}» غير مدعومة. الصيغ المقبولة: PDF، DOCX، TXT، MD، CSV.`;
    if (file.size === 0) return 'الملف فارغ (حجمه صفر).';
    if (file.size > MAX_SIZE) return `حجم الملف ${formatSize(file.size)} يتجاوز الحد المسموح (10 م.ب).`;
    return null;
  }

  function loadLib(kind) {
    const lib = LIBS[kind];
    if (window[lib.global]) return Promise.resolve(window[lib.global]);
    if (loading[kind]) return loading[kind];
    loading[kind] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = lib.url;
      s.async = true;
      s.onload = () => {
        const g = window[lib.global];
        if (!g) { reject(new Error('lib')); return; }
        if (kind === 'pdf') g.GlobalWorkerOptions.workerSrc = lib.worker;
        resolve(g);
      };
      s.onerror = () => {
        delete loading[kind];
        s.remove();
        reject(new Error('تعذر تحميل أداة قراءة ' + (kind === 'pdf' ? 'PDF' : 'DOCX') + '. تحتاج هذه الخطوة إلى اتصال بالإنترنت لتحميل المكتبة مرة واحدة. يمكنك بدلاً من ذلك حفظ الملف بصيغة TXT.'));
      };
      document.head.appendChild(s);
    });
    return loading[kind];
  }

  async function readPdf(file) {
    const pdfjs = await loadLib('pdf');
    const data = await file.arrayBuffer();
    let doc;
    try {
      doc = await pdfjs.getDocument({ data }).promise;
    } catch (err) {
      if (err && err.name === 'PasswordException') throw new Error('ملف PDF محمي بكلمة مرور. أزل الحماية ثم أعد رفعه.');
      throw new Error('تعذر فتح ملف PDF؛ قد يكون تالفاً أو بصيغة غير قياسية.');
    }
    const parts = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      let line = '';
      const lines = [];
      content.items.forEach(it => {
        line += it.str;
        if (it.hasEOL) { lines.push(line); line = ''; } else if (it.str && !/\s$/.test(it.str)) { line += ' '; }
      });
      if (line.trim()) lines.push(line);
      parts.push(lines.join('\n'));
    }
    const text = parts.join('\n\n').replace(/[ \t]+\n/g, '\n').replace(/[ \t]{2,}/g, ' ').trim();
    const result = { text, pages: doc.numPages };
    if (text.replace(/\s/g, '').length < 30 * doc.numPages) {
      result.warning = 'تم استخراج نص قليل جداً من هذا الملف. يبدو أنه ملف PDF ممسوح ضوئياً (صور)، ويحتاج إلى أداة OCR لاستخراج النص قبل استخدامه.';
    }
    return result;
  }

  async function readDocx(file) {
    const mammoth = await loadLib('docx');
    const arrayBuffer = await file.arrayBuffer();
    try {
      const r = await mammoth.extractRawText({ arrayBuffer });
      return { text: (r.value || '').replace(/\n{3,}/g, '\n\n').trim() };
    } catch (err) {
      throw new Error('تعذر قراءة ملف DOCX؛ قد يكون تالفاً أو ليس ملف Word صالحاً.');
    }
  }

  async function readText(file) {
    const text = await file.text();
    if (/\uFFFD/.test(text.slice(0, 2000)) && !/[\u0600-\u06FF]/.test(text.slice(0, 2000))) {
      return { text: text.trim(), warning: 'قد يكون ترميز الملف غير UTF-8؛ إذا ظهرت رموز غير مفهومة فاحفظ الملف بترميز UTF-8.' };
    }
    return { text: text.trim() };
  }

  /* يستخرج النص ويعيد { text, pages?, warning? } أو يرمي خطأً برسالة عربية */
  async function extract(file) {
    const kind = KINDS[ext(file.name)];
    let r;
    if (kind === 'pdf') r = await readPdf(file);
    else if (kind === 'docx') r = await readDocx(file);
    else r = await readText(file);
    if (!r.text) {
      throw new Error(kind === 'pdf'
        ? 'لم يُعثر على أي نص في ملف PDF. إذا كان ممسوحاً ضوئياً فيحتاج إلى OCR أولاً.'
        : 'لم يُعثر على أي نص داخل الملف.');
    }
    return r;
  }

  /* يتعرف على الأسئلة في نص ملف الأسئلة مع الحفاظ على ترتيبها */
  function parseQuestions(text) {
    const marker = /^\s*(?:\(?[0-9٠-٩]{1,3}\s*[\).\-:ـ]|[-•*▪●◦]|س\s*[0-9٠-٩]*\s*[:.\-]|سؤال\s*[0-9٠-٩]*\s*[:.\-]|q\s*[0-9]*\s*[:.\-])\s*/i;
    const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const out = [];
    lines.forEach(l => {
      const hasMarker = marker.test(l);
      const clean = l.replace(marker, '').trim();
      const isQ = /[?؟]\s*$/.test(clean);
      if (clean.length >= 8 && (isQ || hasMarker)) out.push(clean);
    });
    /* حالة أسئلة متتابعة في فقرة واحدة */
    if (out.length <= 1) {
      const chunks = String(text || '').split(/(?<=[?؟])/).map(s => s.replace(marker, '').trim()).filter(s => /[?؟]$/.test(s) && s.length >= 8);
      if (chunks.length > out.length) return dedupe(chunks);
    }
    return dedupe(out);
  }

  function dedupe(list) {
    const seen = new Set();
    return list.filter(q => { const k = q.replace(/\s+/g, ' '); if (seen.has(k)) return false; seen.add(k); return true; });
  }

  return { validate, extract, formatSize, parseQuestions, ext, ACCEPT, MAX_SIZE };
})();
