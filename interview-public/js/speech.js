/* الوظائف الصوتية: نطق الأسئلة (Speech Synthesis) والتعرف على الكلام (Speech Recognition).
   تعتمد كلياً على ما يدعمه المتصفح، ولا تمثل محادثة صوتية ذكية مباشرة. */
window.IMS = window.IMS || {};

IMS.speech = (function () {
  'use strict';

  const synth = window.speechSynthesis || null;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  let voices = [];
  const listeners = [];

  function langCode(lang) { return lang === 'en' ? 'en-US' : 'ar-SA'; }

  function loadVoices() {
    if (!synth) return;
    voices = synth.getVoices() || [];
    listeners.forEach(fn => fn(voices));
  }
  if (synth) {
    loadVoices();
    if (typeof synth.addEventListener === 'function') synth.addEventListener('voiceschanged', loadVoices);
    else synth.onvoiceschanged = loadVoices;
  }

  function findVoice(lang) {
    const code = langCode(lang).toLowerCase();
    const prefix = code.slice(0, 2);
    return voices.find(v => v.lang.toLowerCase() === code)
      || voices.find(v => v.lang.toLowerCase().replace('_', '-').startsWith(prefix)) || null;
  }

  /* تقسيم النص إلى مقاطع قصيرة لتجنب توقف بعض المتصفحات مع النصوص الطويلة */
  function chunk(text) {
    const parts = String(text).split(/(?<=[.!?؟،,؛;])\s+/);
    const out = [];
    let cur = '';
    parts.forEach(p => {
      if ((cur + ' ' + p).length > 180 && cur) { out.push(cur); cur = p; } else { cur = cur ? cur + ' ' + p : p; }
    });
    if (cur) out.push(cur);
    return out;
  }

  let speaking = false;
  let paused = false;
  let session = 0;

  function speak(text, lang, opts) {
    opts = opts || {};
    if (!synth) return { ok: false, reason: 'unsupported' };
    synth.cancel();
    const id = ++session;
    const voice = findVoice(lang);
    const pieces = chunk(text);
    speaking = true; paused = false;
    pieces.forEach((piece, i) => {
      const u = new SpeechSynthesisUtterance(piece);
      u.lang = langCode(lang);
      if (voice) u.voice = voice;
      u.rate = opts.rate || 1;
      if (i === 0) u.onstart = () => { if (id === session && opts.onstart) opts.onstart(); };
      if (i === pieces.length - 1) u.onend = () => { if (id === session) { speaking = false; paused = false; if (opts.onend) opts.onend(); } };
      u.onerror = (e) => {
        if (id !== session || e.error === 'interrupted' || e.error === 'canceled') return;
        speaking = false;
        if (opts.onerror) opts.onerror(e.error);
      };
      synth.speak(u);
    });
    return { ok: true, voiceFound: !!voice };
  }

  function pause() { if (synth && speaking) { synth.pause(); paused = true; } }
  function resume() { if (synth && paused) { synth.resume(); paused = false; } }
  function stop() { if (synth) { session++; synth.cancel(); speaking = false; paused = false; } }

  /* التعرف على الكلام */
  const ERRORS = {
    'not-allowed': 'تم رفض إذن استخدام الميكروفون. يمكنك السماح به من إعدادات الموقع في المتصفح، أو كتابة إجابتك نصياً.',
    'service-not-allowed': 'خدمة التعرف على الكلام غير مسموح بها في هذا المتصفح أو في هذا السياق. جرّب فتح المنصة عبر خادم محلي (localhost) أو اكتب إجابتك.',
    'audio-capture': 'لم يُعثر على ميكروفون متصل بالجهاز. تأكد من توصيله أو اكتب إجابتك نصياً.',
    'no-speech': 'لم يُلتقط أي كلام. تحدث بوضوح بالقرب من الميكروفون ثم أعد المحاولة.',
    'network': 'تتطلب خدمة التعرف على الكلام في هذا المتصفح اتصالاً بالإنترنت. تحقق من الاتصال أو اكتب إجابتك.',
    'language-not-supported': 'اللغة المختارة غير مدعومة للتعرف على الكلام في هذا المتصفح. اكتب إجابتك نصياً.',
    'aborted': null
  };

  function createRecognizer(lang, cb) {
    if (!SR) return null;
    const rec = new SR();
    rec.lang = langCode(lang);
    rec.continuous = true;
    rec.interimResults = true;
    let finalText = '';
    rec.onstart = () => cb.onstart && cb.onstart();
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += (finalText ? ' ' : '') + r[0].transcript.trim();
        else interim += r[0].transcript;
      }
      cb.onresult && cb.onresult(finalText, interim.trim());
    };
    rec.onerror = (e) => {
      const msg = e.error in ERRORS ? ERRORS[e.error] : 'حدث خطأ في التعرف على الكلام (' + e.error + '). يمكنك كتابة إجابتك نصياً.';
      if (msg && cb.onerror) cb.onerror(msg, e.error);
    };
    rec.onend = () => cb.onend && cb.onend(finalText);
    return rec;
  }

  return {
    ttsSupported: !!synth,
    sttSupported: !!SR,
    langCode,
    findVoice,
    voices: () => voices.slice(),
    onVoices: fn => listeners.push(fn),
    speak, pause, resume, stop,
    isSpeaking: () => speaking,
    isPaused: () => paused,
    createRecognizer
  };
})();
