/* مخزن الإدارة: الأقسام والأسئلة، والرقم السري للوحة الإدارة.
   مصادر الأسئلة (تُدمج بهذا الترتيب، والأحدث يغلب عند تكرار المعرّف):
   1) قسم «مهندس التخطيط» المدمج من ملف الأسئلة المرفق (للعرض فقط).
   2) الأسئلة المنشورة في js/published-bank.js (تصل لأي جهاز يفتح النسخة العامة).
   3) ما أضافه المسؤول على هذا الجهاز (localStorage)، ويظهر فوراً في النسختين على الجهاز نفسه.
   الرقم السري يمنع فتح لوحة الإدارة على هذا الجهاز، لكنه ليس حماية أمنية قوية. */
window.IMS = window.IMS || {};

IMS.admin = (function () {
  'use strict';
  const KEY = 'ims.admin.v1';
  const UNLOCK_KEY = 'ims.admin.unlocked';
  const BANK = IMS.planningBank || null;
  const Q_AR = IMS.planningBankAr || {};
  const A_AR = IMS.planningBankAnswersAr || {};
  const PUB = Object.assign({ departments: [], questions: [] }, IMS.publishedBank || {});

  function read() { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } }
  let data = Object.assign({ pinHash: null, departments: [], questions: [], deleted: [] }, read() || {});
  function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); return true; } catch (e) { return false; } }
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  /* دمج المنشور مع المحلي حسب المعرّف، واستبعاد المحذوف */
  function merged(pub, local) {
    const map = new Map();
    pub.concat(local).forEach(x => { if (x && x.id) map.set(x.id, x); });
    return Array.from(map.values()).filter(x => !data.deleted.includes(x.id));
  }
  const allDepts = () => merged(PUB.departments, data.departments);
  const allQuestions = () => merged(PUB.questions, data.questions);
  /* تعديل عنصر منشور: تُنسخ منه نسخة محلية ثم تُعدّل */
  function localCopy(listName, id) {
    let x = data[listName].find(y => y.id === id);
    if (!x) {
      const src = (listName === 'departments' ? allDepts() : allQuestions()).find(y => y.id === id);
      if (!src) return null;
      x = Object.assign({}, src); data[listName].push(x);
    }
    return x;
  }

  /* ---------- الرقم السري ---------- */
  async function hash(pin) {
    const s = 'ims-admin:' + pin;
    if (window.crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return 'd' + h.toString(16);
  }
  const hasPin = () => !!data.pinHash;
  async function setPin(pin) { data.pinHash = await hash(pin); save(); unlock(); }
  async function checkPin(pin) { const ok = (await hash(pin)) === data.pinHash; if (ok) unlock(); return ok; }
  function unlock() { try { sessionStorage.setItem(UNLOCK_KEY, '1'); } catch (e) { /* تجاهل */ } }
  function lock() { try { sessionStorage.removeItem(UNLOCK_KEY); } catch (e) { /* تجاهل */ } }
  function isUnlocked() { try { return hasPin() && sessionStorage.getItem(UNLOCK_KEY) === '1'; } catch (e) { return false; } }

  /* ---------- الأقسام ---------- */
  const BUILTIN = BANK ? [{ id: 'planning', name: 'مهندس التخطيط والجدولة', icon: '📅', desc: 'أسئلة مقابلات مهندسي التخطيط والجدولة الزمنية (Primavera P6، المسار الحرج، القيمة المكتسبة، التأخير والتعافي).', builtin: true }] : [];
  function departments() { return BUILTIN.concat(allDepts()); }
  function department(id) { return departments().find(d => d.id === id) || null; }
  function addDepartment(d) { const dep = { id: 'd' + uid(), name: d.name.trim(), icon: d.icon || '🗂️', desc: (d.desc || '').trim() }; data.departments.push(dep); save(); return dep; }
  function updateDepartment(id, patch) { const d = localCopy('departments', id); if (!d) return false; Object.assign(d, patch); save(); return true; }
  function deleteDepartment(id) {
    const qIds = allQuestions().filter(q => q.deptId === id).map(q => q.id);
    data.departments = data.departments.filter(d => d.id !== id);
    data.questions = data.questions.filter(q => q.deptId !== id);
    data.deleted = data.deleted.concat([id], qIds);
    save();
  }

  /* ---------- الأسئلة ---------- */
  function builtinItems() {
    if (!BANK) return [];
    return BANK.questions.map(q => ({
      key: 'b:' + q.id, deptId: 'planning', builtin: true, source: 'bank', bankId: q.id,
      text: Q_AR[q.id] || q.question, textEn: Q_AR[q.id] ? q.question : null,
      answerAr: A_AR[q.id] || null, answerEn: q.answer,
      label: q.label, level: q.level, topic: q.topic, kind: q.kind, note: q.note, hasFigure: q.hasFigure
    }));
  }
  function customItems(deptId) {
    return allQuestions().filter(q => !deptId || q.deptId === deptId).map(q => ({
      key: 'c:' + q.id, deptId: q.deptId, builtin: false, source: 'admin', adminId: q.id,
      text: q.q, textEn: null, answerAr: q.a, answerEn: null, label: null, level: q.level || 'intermediate',
      topic: null, kind: 'technical', note: null, hasFigure: false
    }));
  }
  function questionsFor(deptId) { return (deptId === 'planning' ? builtinItems() : []).concat(customItems(deptId)); }
  function addQuestion(q) { const item = { id: 'q' + uid(), deptId: q.deptId, q: q.q.trim(), a: q.a.trim(), level: q.level || 'intermediate', at: Date.now() }; data.questions.push(item); save(); return item; }
  function updateQuestion(id, patch) { const q = localCopy('questions', id); if (!q) return false; Object.assign(q, patch); save(); return true; }
  function deleteQuestion(id) { data.questions = data.questions.filter(q => q.id !== id); data.deleted.push(id); save(); }
  function rawQuestion(id) { return allQuestions().find(q => q.id === id) || null; }

  /* الإجابة الصحيحة لسؤال مقابلة، يستخدمها محرك التقييم */
  function refFor(q) {
    if (!q) return null;
    let item = null;
    if (q.bankId) item = builtinItems().find(x => x.bankId === q.bankId);
    else if (q.adminId) item = customItems().find(x => x.adminId === q.adminId);
    if (!item) return null;
    const dep = department(item.deptId);
    return {
      label: item.label, answerAr: item.answerAr, answerEn: item.answerEn, kind: item.kind, note: item.note, hasFigure: item.hasFigure,
      topicLabel: item.topic && BANK ? BANK.topics[item.topic] : (dep ? dep.name : ''), builtin: item.builtin
    };
  }

  /* ---------- النشر والنسخ الاحتياطي ---------- */
  /* ملف js/published-bank.js الذي يوضع في مجلد النسخة العامة لتظهر الأسئلة على أي جهاز */
  function publishedFile() {
    const payload = { departments: allDepts(), questions: allQuestions() };
    return '/* أسئلة الأقسام المنشورة للنسخة العامة — أُنشئ من لوحة الإدارة في ' + new Date().toLocaleString('ar') + ' */\n'
      + 'window.IMS = window.IMS || {};\nIMS.publishedBank = ' + JSON.stringify(payload, null, 1) + ';\n';
  }
  function stats() {
    const pubIds = new Set(PUB.questions.map(q => q.id).concat(PUB.departments.map(d => d.id)));
    const unpublished = allQuestions().filter(q => !pubIds.has(q.id)).length + allDepts().filter(d => !pubIds.has(d.id)).length;
    return { published: PUB.questions.length, local: allQuestions().length, unpublished, deletedPublished: data.deleted.filter(id => pubIds.has(id)).length };
  }
  function exportData() { return { app: 'interview-simulator', version: 1, exportedAt: new Date().toISOString(), departments: allDepts(), questions: allQuestions() }; }
  function importData(obj) {
    if (!obj || !Array.isArray(obj.departments) || !Array.isArray(obj.questions)) throw new Error('الملف ليس نسخة احتياطية صالحة من لوحة الإدارة.');
    let d = 0, q = 0;
    obj.departments.forEach(x => {
      if (!x || !x.id || !x.name || allDepts().some(y => y.id === x.id)) return;
      data.departments.push({ id: String(x.id), name: String(x.name), icon: String(x.icon || '🗂️'), desc: String(x.desc || '') });
      data.deleted = data.deleted.filter(id => id !== x.id); d++;
    });
    obj.questions.forEach(x => {
      if (!x || !x.id || !x.q || !x.a || !x.deptId || allQuestions().some(y => y.id === x.id)) return;
      data.questions.push({ id: String(x.id), deptId: String(x.deptId), q: String(x.q), a: String(x.a), level: String(x.level || 'intermediate'), at: x.at || Date.now() });
      data.deleted = data.deleted.filter(id => id !== x.id); q++;
    });
    save();
    return { departments: d, questions: q };
  }

  return {
    hasPin, setPin, checkPin, lock, isUnlocked,
    departments, department, addDepartment, updateDepartment, deleteDepartment,
    questionsFor, addQuestion, updateQuestion, deleteQuestion, rawQuestion, refFor,
    publishedFile, stats, exportData, importData
  };
})();
