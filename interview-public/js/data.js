/* بيانات المنصة: المجالات، التخصصات، معايير التقييم لكل مجال، وبنك أسئلة الوضع التجريبي */
window.IMS = window.IMS || {};

IMS.data = (function () {
  'use strict';

  const FIELDS = [
    {
      id: 'engineering', icon: '🏗️', name: 'الهندسة', en: 'Engineering',
      groups: [
        { id: 'civil', name: 'الهندسة المدنية', items: ['التنفيذ والإشراف', 'التخطيط والجدولة الزمنية', 'إدارة المشاريع', 'الهندسة الإنشائية', 'الطرق والجسور', 'المياه والصرف الصحي', 'حصر الكميات والمستخلصات', 'ضبط الجودة', 'العقود والمطالبات', 'التكاليف', 'الأساسات والهندسة الجيوتقنية', 'نمذجة معلومات البناء BIM', 'السلامة المهنية'] },
        { id: 'arch', name: 'الهندسة المعمارية', items: ['التصميم المعماري', 'التصميم الداخلي', 'الرسومات التنفيذية', 'تنسيق المواقع', 'نمذجة معلومات البناء', 'الإشراف المعماري'] },
        { id: 'elec', name: 'الهندسة الكهربائية', items: ['القوى الكهربائية', 'أنظمة الجهد المنخفض', 'التيار الخفيف', 'التحكم والأتمتة', 'الطاقة المتجددة', 'الاختبارات والتشغيل'] },
        { id: 'mech', name: 'الهندسة الميكانيكية', items: ['التكييف والتهوية HVAC', 'أنظمة مكافحة الحريق', 'أنظمة السباكة', 'المعدات والآلات', 'الصيانة والتشغيل'] },
        { id: 'ind', name: 'الهندسة الصناعية', items: ['تحسين العمليات', 'الجودة', 'الإنتاج', 'سلاسل الإمداد', 'إدارة العمليات'] },
        { id: 'chem', name: 'الهندسة الكيميائية', items: ['العمليات الصناعية', 'الإنتاج والتشغيل', 'مراقبة الجودة', 'سلامة العمليات'] },
        { id: 'comp', name: 'هندسة الحاسب والبرمجيات', items: ['تطوير البرمجيات', 'تطوير الويب', 'الشبكات', 'الأمن السيبراني', 'الذكاء الاصطناعي', 'تحليل البيانات', 'قواعد البيانات'] }
      ]
    },
    {
      id: 'accounting', icon: '📊', name: 'المحاسبة والمالية', en: 'Accounting & Finance',
      groups: [{ id: 'acc', name: 'المحاسبة والمالية', items: ['المحاسبة المالية', 'المحاسبة الإدارية', 'محاسبة التكاليف', 'الضرائب والزكاة', 'التدقيق والمراجعة', 'الحسابات الدائنة والمدينة', 'الرواتب', 'التقارير المالية', 'التحليل المالي', 'إعداد الميزانيات', 'الخزينة', 'الرقابة المالية'] }]
    },
    {
      id: 'medical', icon: '🩺', name: 'الطب والرعاية الصحية', en: 'Medicine & Healthcare',
      groups: [{ id: 'med', name: 'الطب والرعاية الصحية', items: ['الطب البشري', 'طب الأسرة', 'الطب الباطني', 'الجراحة', 'طب الأطفال', 'طب الطوارئ', 'النساء والولادة', 'أمراض القلب', 'طب العظام', 'الأشعة', 'المختبرات الطبية', 'التمريض', 'الصيدلة', 'العلاج الطبيعي', 'الصحة العامة', 'إدارة المستشفيات'] }]
    },
    {
      id: 'it', icon: '💻', name: 'تقنية المعلومات والبرمجيات', en: 'IT & Software',
      groups: [{ id: 'it', name: 'تقنية المعلومات والبرمجيات', items: ['تطوير البرمجيات', 'تطوير الويب', 'تطوير تطبيقات الجوال', 'الحوسبة السحابية وDevOps', 'الشبكات', 'الأمن السيبراني', 'الذكاء الاصطناعي وتعلم الآلة', 'تحليل البيانات', 'قواعد البيانات', 'ضمان الجودة والاختبار', 'الدعم الفني', 'إدارة المنتجات التقنية'] }]
    },
    {
      id: 'business', icon: '💼', name: 'إدارة الأعمال', en: 'Business Administration',
      groups: [{ id: 'bus', name: 'إدارة الأعمال', items: ['التخطيط الاستراتيجي', 'إدارة المشاريع', 'إدارة العمليات', 'تطوير الأعمال', 'الاستشارات الإدارية', 'ريادة الأعمال', 'إدارة المكاتب والسكرتارية التنفيذية'] }]
    },
    {
      id: 'hr', icon: '🤝', name: 'الموارد البشرية', en: 'Human Resources',
      groups: [{ id: 'hr', name: 'الموارد البشرية', items: ['التوظيف والاستقطاب', 'التدريب والتطوير', 'التعويضات والمزايا', 'علاقات الموظفين', 'أنظمة الموارد البشرية HRIS', 'إدارة الأداء', 'الامتثال لأنظمة العمل'] }]
    },
    {
      id: 'marketing', icon: '📣', name: 'التسويق والمبيعات', en: 'Marketing & Sales',
      groups: [{ id: 'mkt', name: 'التسويق والمبيعات', items: ['التسويق الرقمي', 'صناعة المحتوى', 'إدارة وسائل التواصل', 'المبيعات بين الشركات B2B', 'مبيعات التجزئة', 'إدارة الحسابات الرئيسية', 'أبحاث السوق', 'إدارة العلامة التجارية', 'خدمة العملاء'] }]
    },
    {
      id: 'law', icon: '⚖️', name: 'القانون', en: 'Law',
      groups: [{ id: 'law', name: 'القانون', items: ['قانون الشركات', 'العقود', 'قانون العمل', 'التقاضي والمرافعات', 'الامتثال والحوكمة', 'الملكية الفكرية', 'القانون العقاري', 'الاستشارات القانونية'] }]
    },
    {
      id: 'education', icon: '🎓', name: 'التعليم والتدريب', en: 'Education & Training',
      groups: [{ id: 'edu', name: 'التعليم والتدريب', items: ['التعليم الابتدائي', 'التعليم المتوسط والثانوي', 'التعليم الجامعي', 'التدريب المؤسسي', 'التربية الخاصة', 'تصميم المناهج', 'القيادة التربوية', 'التعليم الإلكتروني'] }]
    },
    {
      id: 'supply', icon: '🚚', name: 'سلاسل الإمداد والخدمات اللوجستية', en: 'Supply Chain & Logistics',
      groups: [{ id: 'sc', name: 'سلاسل الإمداد والخدمات اللوجستية', items: ['المشتريات', 'إدارة المستودعات', 'النقل والتوزيع', 'إدارة المخزون', 'تخطيط الطلب', 'الاستيراد والتصدير والتخليص الجمركي', 'إدارة الأسطول'] }]
    },
    {
      id: 'design', icon: '🎨', name: 'التصميم والإبداع', en: 'Design & Creative',
      groups: [{ id: 'des', name: 'التصميم والإبداع', items: ['التصميم الجرافيكي', 'تصميم واجهات وتجربة المستخدم UI/UX', 'الموشن جرافيك', 'التصوير وصناعة الفيديو', 'الهوية البصرية', 'صناعة المحتوى الإبداعي', 'التصميم الصناعي'] }]
    },
    { id: 'other', icon: '✳️', name: 'تخصص آخر', en: 'Other', groups: [] }
  ];

  /* معايير التقييم الخاصة بكل مجال: تُستخدم في الوضع التجريبي (مطابقة كلمات) وتُرسل إلى نموذج الذكاء الاصطناعي في وضع API */
  const CRITERIA = {
    engineering: [
      { label: 'السلامة والالتزام بالكودات والمواصفات', kw: ['سلامة', 'كود', 'مواصفات', 'معايير', 'اشتراطات', 'safety', 'code', 'spec', 'standard', 'osha', 'iso'] },
      { label: 'الجودة والفحص والاستلام', kw: ['جودة', 'فحص', 'اختبار', 'استلام', 'quality', 'inspection', 'test', 'itp', 'ncr'] },
      { label: 'الجدول الزمني والتكلفة', kw: ['جدول', 'تكلفة', 'ميزانية', 'زمني', 'تأخير', 'schedule', 'cost', 'budget', 'primavera', 'baseline', 'delay'] },
      { label: 'الحلول الفنية والحسابات', kw: ['حساب', 'تصميم', 'تحليل', 'أحمال', 'مخطط', 'design', 'calculation', 'analysis', 'load', 'drawing'] },
      { label: 'التنسيق مع الأطراف', kw: ['تنسيق', 'فريق', 'استشاري', 'مقاول', 'مالك', 'coordination', 'team', 'consultant', 'contractor', 'client'] }
    ],
    accounting: [
      { label: 'المعايير المحاسبية', kw: ['ifrs', 'gaap', 'معايير', 'معيار', 'socpa', 'standard'] },
      { label: 'الدقة والتسويات والقيود', kw: ['تسوية', 'مطابقة', 'دقة', 'قيد', 'قيود', 'reconcil', 'accura', 'journal', 'entry'] },
      { label: 'الامتثال الضريبي والنظامي', kw: ['ضريبة', 'زكاة', 'امتثال', 'هيئة', 'vat', 'tax', 'compliance', 'zatca', 'audit', 'تدقيق'] },
      { label: 'التحليل وإعداد التقارير', kw: ['تقرير', 'تحليل', 'نسبة', 'قوائم', 'انحراف', 'report', 'analysis', 'ratio', 'statement', 'variance'] },
      { label: 'الأنظمة والأدوات المالية', kw: ['erp', 'sap', 'oracle', 'excel', 'اكسل', 'نظام', 'برنامج', 'quickbooks'] }
    ],
    medical: [
      { label: 'سلامة المريض', kw: ['سلامة', 'مريض', 'خطر', 'حساسية', 'patient', 'safety', 'risk', 'allerg'] },
      { label: 'البروتوكولات والممارسة المبنية على الدليل', kw: ['بروتوكول', 'إرشادات', 'دليل', 'دراسات', 'guideline', 'protocol', 'evidence'] },
      { label: 'التقييم السريري والتشخيص', kw: ['تشخيص', 'فحص', 'تاريخ مرضي', 'علامات', 'تحاليل', 'diagnos', 'assess', 'history', 'vital', 'exam'] },
      { label: 'الأخلاقيات والتواصل مع المريض', kw: ['موافقة', 'سرية', 'أخلاق', 'تواصل', 'أسرة', 'تعاطف', 'consent', 'confidential', 'ethic', 'communicat', 'empath'] },
      { label: 'العمل ضمن الفريق والإحالة', kw: ['فريق', 'إحالة', 'استشارة', 'تمريض', 'team', 'refer', 'multidisciplinary', 'consult'] }
    ],
    it: [
      { label: 'الأسس التقنية والتصميم المعماري', kw: ['خوارزمية', 'بنية', 'معمارية', 'قاعدة بيانات', 'api', 'algorithm', 'architect', 'complexity', 'database', 'design'] },
      { label: 'الجودة والاختبار', kw: ['اختبار', 'مراجعة', 'تصحيح', 'test', 'review', 'debug', 'ci', 'qa'] },
      { label: 'الأمان والأداء', kw: ['أمان', 'أداء', 'تحسين', 'ثغرة', 'security', 'performance', 'scal', 'cache', 'latency'] },
      { label: 'الأدوات والتقنيات', kw: ['git', 'docker', 'cloud', 'aws', 'azure', 'python', 'java', 'sql', 'react', 'linux', 'kubernetes'] },
      { label: 'التعاون ومنهجيات العمل', kw: ['فريق', 'توثيق', 'agile', 'scrum', 'sprint', 'documentation', 'stakeholder', 'team'] }
    ],
    business: [
      { label: 'التخطيط الاستراتيجي والأهداف', kw: ['استراتيجية', 'خطة', 'هدف', 'رؤية', 'strateg', 'plan', 'goal', 'okr', 'objective'] },
      { label: 'المؤشرات والنتائج', kw: ['مؤشر', 'نتيجة', 'عائد', 'نمو', 'إيرادات', 'kpi', 'roi', 'growth', 'revenue', 'result'] },
      { label: 'القيادة واتخاذ القرار', kw: ['قرار', 'قيادة', 'مخاطر', 'decision', 'lead', 'risk', 'prioriti'] },
      { label: 'العملاء والسوق', kw: ['عميل', 'عملاء', 'سوق', 'منافس', 'customer', 'market', 'competitor', 'client'] },
      { label: 'إدارة الموارد والتكاليف', kw: ['ميزانية', 'موارد', 'تكلفة', 'عمليات', 'budget', 'resource', 'cost', 'operation'] }
    ],
    hr: [
      { label: 'أنظمة العمل والسياسات', kw: ['نظام العمل', 'سياسة', 'لائحة', 'امتثال', 'policy', 'labor law', 'compliance', 'regulation'] },
      { label: 'الاستقطاب والاختيار', kw: ['توظيف', 'استقطاب', 'مرشح', 'مقابلة', 'recruit', 'hiring', 'candidate', 'interview', 'sourcing'] },
      { label: 'تجربة الموظف والاحتفاظ', kw: ['ارتباط', 'رضا', 'احتفاظ', 'ثقافة', 'engagement', 'retention', 'culture', 'satisfaction'] },
      { label: 'إدارة الأداء والتطوير', kw: ['أداء', 'تدريب', 'تطوير', 'performance', 'training', 'development', 'kpi'] },
      { label: 'البيانات وأنظمة الموارد البشرية', kw: ['hris', 'بيانات', 'تقرير', 'تحليل', 'data', 'report', 'analytics', 'system'] }
    ],
    marketing: [
      { label: 'فهم الجمهور والسوق', kw: ['جمهور', 'شريحة', 'عميل', 'سوق', 'audience', 'segment', 'persona', 'customer', 'market'] },
      { label: 'القنوات والحملات', kw: ['حملة', 'قناة', 'إعلان', 'محتوى', 'campaign', 'channel', 'ads', 'seo', 'social', 'content'] },
      { label: 'المؤشرات والتحليل', kw: ['تحويل', 'عائد', 'مؤشر', 'تحليل', 'roi', 'conversion', 'ctr', 'kpi', 'analytics'] },
      { label: 'البيع والتفاوض', kw: ['تفاوض', 'صفقة', 'إغلاق', 'اعتراض', 'negotiat', 'deal', 'closing', 'pipeline', 'objection'] },
      { label: 'العلامة التجارية والتموضع', kw: ['علامة', 'هوية', 'رسالة', 'تموضع', 'brand', 'positioning', 'message'] }
    ],
    law: [
      { label: 'السند النظامي والنصوص', kw: ['نظام', 'مادة', 'لائحة', 'قانون', 'نص', 'law', 'article', 'statute', 'regulation'] },
      { label: 'التحليل والتكييف القانوني', kw: ['تكييف', 'تحليل', 'دفوع', 'حجة', 'سابقة', 'analysis', 'argument', 'precedent'] },
      { label: 'العقود والصياغة', kw: ['عقد', 'بند', 'صياغة', 'contract', 'clause', 'draft'] },
      { label: 'المخاطر والامتثال', kw: ['مخاطر', 'امتثال', 'حوكمة', 'risk', 'compliance', 'governance'] },
      { label: 'الأخلاقيات المهنية', kw: ['سرية', 'تعارض', 'أخلاق', 'confidential', 'conflict', 'ethic'] }
    ],
    education: [
      { label: 'التخطيط وأهداف التعلم', kw: ['أهداف', 'خطة', 'منهج', 'objective', 'lesson plan', 'curriculum', 'outcome'] },
      { label: 'استراتيجيات التدريس', kw: ['استراتيجية', 'تعلم نشط', 'تعاوني', 'تمايز', 'active learning', 'differentiat', 'strategy'] },
      { label: 'التقويم والتغذية الراجعة', kw: ['تقويم', 'تقييم', 'اختبار', 'تغذية راجعة', 'assessment', 'rubric', 'feedback'] },
      { label: 'إدارة الصف والدافعية', kw: ['إدارة الصف', 'سلوك', 'دافعية', 'classroom', 'behavio', 'motivat'] },
      { label: 'التقنية التعليمية', kw: ['منصة', 'تقنية', 'رقمي', 'إلكتروني', 'lms', 'technolog', 'online', 'digital'] }
    ],
    supply: [
      { label: 'التخطيط والتنبؤ بالطلب', kw: ['تنبؤ', 'تخطيط', 'طلب', 'forecast', 'planning', 'demand', 'mrp'] },
      { label: 'المخزون والمستودعات', kw: ['مخزون', 'مستودع', 'جرد', 'inventory', 'warehouse', 'stock', 'fifo', 'wms'] },
      { label: 'الموردون والمشتريات', kw: ['مورد', 'شراء', 'مشتريات', 'تفاوض', 'supplier', 'procurement', 'vendor', 'sourcing'] },
      { label: 'التكلفة والكفاءة', kw: ['تكلفة', 'كفاءة', 'مهلة', 'cost', 'lead time', 'efficien', 'kpi', 'otif'] },
      { label: 'الأنظمة والامتثال', kw: ['erp', 'sap', 'جمارك', 'customs', 'compliance', 'incoterms'] }
    ],
    design: [
      { label: 'فهم المستخدم والجمهور', kw: ['مستخدم', 'بحث', 'احتياج', 'user', 'research', 'persona', 'usability'] },
      { label: 'العملية الإبداعية والتكرار', kw: ['فكرة', 'مسودة', 'نموذج أولي', 'sketch', 'wireframe', 'prototype', 'iterat'] },
      { label: 'المبادئ البصرية', kw: ['لون', 'ألوان', 'خط', 'تكوين', 'تباين', 'color', 'typograph', 'layout', 'hierarchy', 'grid'] },
      { label: 'الأدوات', kw: ['figma', 'photoshop', 'illustrator', 'after effects', 'adobe', 'blender', 'فيجما'] },
      { label: 'التعاون والتغذية الراجعة', kw: ['عميل', 'ملاحظات', 'فريق', 'feedback', 'client', 'stakeholder', 'brief'] }
    ],
    other: [
      { label: 'الأمثلة العملية', kw: ['مثال', 'مثلا', 'example', 'instance'] },
      { label: 'النتائج والأثر', kw: ['نتيجة', 'حقق', 'أثر', 'result', 'impact', 'achiev'] },
      { label: 'العمل الجماعي', kw: ['فريق', 'زملاء', 'team', 'colleague'] },
      { label: 'المهارات والأدوات', kw: ['مهارة', 'أداة', 'برنامج', 'skill', 'tool', 'software'] },
      { label: 'التعلم والتطوير', kw: ['تعلم', 'تطوير', 'دورة', 'learn', 'develop', 'course'] }
    ]
  };

  const STAR = [
    { part: 'الموقف', kw: ['موقف', 'عندما', 'كنت أعمل', 'في مشروع', 'في إحدى', 'situation', 'when i', 'at my', 'while working', 'once'] },
    { part: 'المهمة', kw: ['مهمتي', 'مسؤوليتي', 'كان المطلوب', 'الهدف', 'كان علي', 'my task', 'responsib', 'goal', 'needed to', 'had to'] },
    { part: 'الإجراء', kw: ['قمت', 'بدأت', 'نفذت', 'عملت على', 'تواصلت', 'قررت', 'اقترحت', 'i did', 'i implemented', 'i led', 'i decided', 'i created', 'i organized', 'i proposed'] },
    { part: 'النتيجة', kw: ['النتيجة', 'نتيجة', 'أدى', 'نتج', 'حققنا', 'تحسن', 'انخفض', 'زاد', 'result', 'led to', 'achieved', 'improved', 'reduced', 'increased'] }
  ];

  const EXPLAIN = ['لأن', 'بسبب', 'مثلا', 'على سبيل المثال', 'أولا', 'ثانيا', 'ثم', 'الخطوة', 'بعد ذلك', 'because', 'for example', 'first', 'then', 'step', 'e.g', 'finally'];

  /* بنك أسئلة الوضع التجريبي */
  const BANK = {
    intro: {
      ar: 'عرّفنا بنفسك وبمسيرتك المهنية باختصار، مع التركيز على ما يرتبط بوظيفة {title}.',
      en: 'Please introduce yourself and summarize your career, focusing on what is relevant to the {title} role.'
    },
    closing: {
      ar: 'لماذا ترغب في العمل بوظيفة {title}، ولماذا تعتقد أنك المرشح المناسب لها؟',
      en: 'Why do you want the {title} role, and why do you believe you are the right candidate?'
    },
    behavioral: {
      ar: [
        'حدثنا عن موقف واجهت فيه مشكلة صعبة في العمل، وكيف تعاملت معها، وما النتيجة؟',
        'صف موقفاً اختلفت فيه مع زميل أو مدير، وكيف وصلتما إلى حل؟',
        'أخبرنا عن إنجاز مهني تفخر به، وما الدور الذي قمت به تحديداً؟',
        'كيف تتعامل مع ضغط العمل والمواعيد النهائية المتزامنة؟ أعطِ مثالاً من تجربتك.',
        'حدثنا عن خطأ ارتكبته في العمل، وكيف عالجته، وما الذي تعلمته منه.',
        'صف موقفاً اضطررت فيه لتعلم مهارة أو أداة جديدة بسرعة.',
        'أين ترى نفسك مهنياً بعد ثلاث إلى خمس سنوات، وكيف تخطط للوصول إلى ذلك؟'
      ],
      en: [
        'Tell me about a time you faced a difficult problem at work. How did you handle it, and what was the result?',
        'Describe a situation where you disagreed with a colleague or manager. How did you reach a resolution?',
        'Tell me about a professional achievement you are proud of. What exactly was your role?',
        'How do you handle work pressure and competing deadlines? Give an example from your experience.',
        'Tell me about a mistake you made at work, how you fixed it, and what you learned.',
        'Describe a time you had to learn a new skill or tool quickly.',
        'Where do you see yourself professionally in three to five years, and how do you plan to get there?'
      ]
    },
    technical: {
      engineering: {
        ar: ['كيف تتأكد من مطابقة الأعمال المنفذة للمخططات والمواصفات قبل استلامها؟', 'كيف تتعامل مع تأخر المشروع عن الجدول الزمني المعتمد؟', 'ما الإجراءات التي تتبعها عند اكتشاف عيب أو حالة عدم مطابقة في الموقع أو التصميم؟'],
        en: ['How do you make sure executed works comply with drawings and specifications before handover?', 'How do you deal with a project that falls behind the approved schedule?', 'What steps do you follow when you discover a defect or non-conformance on site or in a design?']
      },
      accounting: {
        ar: ['اشرح خطوات إقفال الحسابات الشهرية التي تتبعها.', 'كيف تتعامل مع فرق غير مبرر يظهر في التسوية البنكية؟', 'ما الفرق بين أساس الاستحقاق والأساس النقدي، ومتى يؤثر ذلك على القوائم المالية؟'],
        en: ['Walk me through the month-end closing steps you follow.', 'How do you handle an unexplained difference in a bank reconciliation?', 'What is the difference between accrual and cash basis, and when does it affect the financial statements?']
      },
      medical: {
        ar: ['كيف تتعامل مع مريض يرفض الخطة العلاجية الموصى بها؟', 'صف طريقتك في تقييم حالة طارئة وتحديد أولويات التدخل.', 'ماذا تفعل إذا اكتشفت خطأً دوائياً أو إجرائياً حدث لمريض تحت رعايتك؟'],
        en: ['How do you handle a patient who refuses the recommended treatment plan?', 'Describe how you assess an emergency case and prioritize interventions.', 'What do you do if you discover a medication or procedural error affecting a patient under your care?']
      },
      it: {
        ar: ['كيف تصمم نظاماً قابلاً للتوسع ليتحمل زيادة كبيرة في عدد المستخدمين؟', 'صف طريقتك في تتبع خلل صعب في بيئة الإنتاج وحله.', 'كيف تضمن جودة الكود وأمانه داخل الفريق؟'],
        en: ['How would you design a system that scales to handle a large increase in users?', 'Describe how you track down and fix a hard bug in production.', 'How do you ensure code quality and security within a team?']
      },
      business: {
        ar: ['كيف تقيس نجاح مشروع أو مبادرة تجارية؟ وما المؤشرات التي تعتمد عليها؟', 'صف خطة وضعتها لتحسين أداء عملية أو قسم، وما نتائجها.', 'كيف تتخذ قراراً مهماً عندما تكون البيانات المتاحة غير مكتملة؟'],
        en: ['How do you measure the success of a project or business initiative? Which indicators do you rely on?', 'Describe a plan you created to improve a process or department and its results.', 'How do you make an important decision when the available data is incomplete?']
      },
      hr: {
        ar: ['كيف تصمم عملية توظيف فعالة لوظيفة يصعب شغلها؟', 'كيف تتعامل مع شكوى موظف ضد مديره المباشر؟', 'ما الإجراءات التي تتخذها لتقليل معدل دوران الموظفين؟'],
        en: ['How would you design an effective hiring process for a hard-to-fill role?', 'How do you handle an employee complaint against their direct manager?', 'What actions do you take to reduce employee turnover?']
      },
      marketing: {
        ar: ['كيف تخطط لحملة تسويقية لمنتج جديد، وكيف تقيس نجاحها؟', 'كيف تتعامل مع عميل محتمل يعترض على السعر؟', 'ما مؤشرات الأداء التي تتابعها أسبوعياً ولماذا؟'],
        en: ['How would you plan a marketing campaign for a new product, and how would you measure its success?', 'How do you handle a prospect who objects to the price?', 'Which performance indicators do you track weekly, and why?']
      },
      law: {
        ar: ['كيف تراجع عقداً تجارياً قبل توقيعه؟ وما البنود التي تركز عليها؟', 'كيف تتصرف إذا تبين لك وجود تعارض مصالح في قضية تعمل عليها؟', 'صف منهجيتك في إعداد مذكرة دفاع أو رأي قانوني.'],
        en: ['How do you review a commercial contract before signing? Which clauses do you focus on?', 'What do you do if you discover a conflict of interest in a case you are working on?', 'Describe your approach to preparing a legal memo or opinion.']
      },
      education: {
        ar: ['كيف تتعامل مع تفاوت مستويات الطلاب داخل الصف الواحد؟', 'كيف تقيس تحقق أهداف التعلم لدى الطلاب أو المتدربين؟', 'صف درساً أو برنامجاً تدريبياً صممته وكيف طورته بناءً على التغذية الراجعة.'],
        en: ['How do you handle mixed ability levels within one class?', 'How do you measure whether learning objectives were achieved?', 'Describe a lesson or training program you designed and how you improved it based on feedback.']
      },
      supply: {
        ar: ['كيف تتعامل مع نقص مفاجئ في مخزون صنف حرج؟', 'ما المعايير التي تعتمد عليها في تقييم الموردين واختيارهم؟', 'كيف تخفض تكاليف النقل أو التخزين دون التأثير على مستوى الخدمة؟'],
        en: ['How do you handle a sudden stock-out of a critical item?', 'Which criteria do you use to evaluate and select suppliers?', 'How do you reduce transport or storage costs without hurting service level?']
      },
      design: {
        ar: ['صف عمليتك التصميمية من استلام المتطلبات حتى التسليم النهائي.', 'كيف تتعامل مع ملاحظات عميل تتعارض مع مبادئ التصميم الجيد؟', 'كيف تتحقق من أن تصميمك يحقق هدفه لدى المستخدمين؟'],
        en: ['Describe your design process from receiving the brief to final delivery.', 'How do you handle client feedback that conflicts with good design principles?', 'How do you verify that your design achieves its goal with users?']
      },
      other: {
        ar: ['ما أهم المهارات الفنية التي تتطلبها وظيفة {title}، وكيف طورتها؟', 'صف يوم عمل نموذجياً في وظيفتك السابقة وأهم مسؤولياتك.', 'ما الأدوات أو الأنظمة التي تتقنها وترتبط بهذه الوظيفة؟'],
        en: ['What are the most important technical skills for the {title} role, and how did you develop them?', 'Describe a typical workday in your previous job and your main responsibilities.', 'Which tools or systems related to this role do you master?']
      }
    },
    templates: {
      ar: ['ما أهم المهارات والأدوات التي يحتاجها من يعمل في {sub}، وكيف استخدمتها عملياً؟', 'اشرح منهجيتك خطوة بخطوة عند تنفيذ مهمة نموذجية في مجال {sub}.', 'ما أبرز المعايير أو الأنظمة المهنية التي تلتزم بها في {sub}، ولماذا هي مهمة؟', 'صف مشكلة فنية واجهتها في {sub} وكيف حللتها.'],
      en: ['What key skills and tools does a {title} in {fieldEn} need, and how have you used them in practice?', 'Explain step by step how you carry out a typical task in your specialty.', 'Which professional standards or regulations do you follow in your work, and why do they matter?', 'Describe a technical problem you faced in your specialty and how you solved it.']
    },
    advanced: {
      ar: ['كيف توازن بين الجودة والتكلفة والوقت عند اتخاذ قرارات فنية في {sub}؟ أعطِ مثالاً لقرار صعب.', 'لو طُلب منك تحسين أداء فريق أو عملية في {sub} خلال 90 يوماً، فما خطتك؟'],
      en: ['How do you balance quality, cost and time when making technical decisions? Give an example of a hard trade-off.', 'If you were asked to improve a team or process in your area within 90 days, what would your plan be?']
    }
  };

  /* توصيات عامة لكل مجال (تظهر في التقرير) */
  const RECOS = {
    engineering: ['استعد بأمثلة رقمية من مشاريعك: حجم المشروع، المدة، نسب الإنجاز، والوفورات.', 'راجع الكودات والمواصفات المعتمدة في سوق العمل المستهدف وكن مستعداً لذكرها بالاسم.', 'جهّز قصة واضحة عن معالجة حالة عدم مطابقة أو تأخير.'],
    accounting: ['راجع المعايير الدولية IFRS والمتطلبات الضريبية في البلد المستهدف.', 'جهّز أمثلة عن تسويات معقدة وكيف اكتشفت الفروقات.', 'اذكر الأنظمة المحاسبية التي استخدمتها ومستوى إتقانك لـ Excel.'],
    medical: ['اربط إجاباتك دائماً بسلامة المريض والبروتوكولات المعتمدة.', 'تدرّب على عرض الحالات بهيكل واضح: التقييم، القرار، المتابعة.', 'جهّز أمثلة عن التواصل مع المرضى وذويهم والعمل ضمن فريق متعدد التخصصات.'],
    it: ['جهّز مشروعين أو ثلاثة تشرح فيها بنية الحل والقرارات التقنية والمقايضات.', 'تدرّب على شرح الأفكار التقنية بصوت مسموع وبخطوات.', 'راجع أساسيات الأمان والأداء والاختبار المرتبطة بتخصصك.'],
    business: ['قدّم نتائجك بالأرقام: نمو، وفورات، مؤشرات أداء.', 'جهّز مثالاً على قرار اتخذته في ظل عدم اليقين.', 'اربط خبرتك بأهداف الجهة التي تتقدم إليها.'],
    hr: ['راجع نظام العمل في البلد المستهدف والسياسات الشائعة.', 'جهّز أمثلة رقمية: مدة التوظيف، معدل الدوران، نسب الرضا.', 'تدرّب على الإجابة عن مواقف حساسة بحياد وسرية.'],
    marketing: ['اعرض نتائج حملاتك بمؤشرات واضحة مثل العائد ومعدل التحويل.', 'تدرّب على التعامل مع الاعتراضات بأسلوب منظم.', 'جهّز فهماً لجمهور الشركة المستهدفة ومنافسيها.'],
    law: ['استند في إجاباتك إلى نصوص نظامية محددة متى أمكن.', 'تدرّب على هيكلة الإجابة: الوقائع، التكييف، السند، الرأي.', 'جهّز أمثلة على صياغة عقود أو إدارة نزاعات.'],
    education: ['جهّز أمثلة عن دروس طبقت فيها التعلم النشط والتمايز.', 'اذكر أدوات التقويم التي تستخدمها وكيف تبني عليها.', 'وضّح كيف تتعامل مع السلوكيات الصعبة داخل الصف.'],
    supply: ['جهّز أرقاماً عن تحسين المخزون أو خفض التكاليف أو مهلة التوريد.', 'راجع مصطلحات Incoterms وأنظمة ERP المستخدمة.', 'تدرّب على وصف معالجة أزمة توريد خطوة بخطوة.'],
    design: ['جهّز ملف أعمال مختصراً تشرح فيه المشكلة والعملية والنتيجة لكل مشروع.', 'تدرّب على تبرير قراراتك التصميمية بمبادئ واضحة وبيانات المستخدمين.', 'اذكر الأدوات التي تتقنها وطريقتك في استقبال الملاحظات.'],
    other: ['جهّز ثلاث قصص مهنية بهيكل STAR تبرز مهاراتك.', 'ادرس الجهة والوظيفة جيداً واربط خبراتك بمتطلباتها.', 'استخدم أرقاماً وأمثلة ملموسة في إجاباتك.']
  };

  function fieldById(id) { return FIELDS.find(f => f.id === id) || null; }

  return { FIELDS, CRITERIA, STAR, EXPLAIN, BANK, RECOS, fieldById };
})();
