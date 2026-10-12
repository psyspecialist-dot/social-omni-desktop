import type { ReactNode } from 'react';
import { Link } from 'wouter';
import { AlertTriangle, BookOpen, Database, FileSpreadsheet, Gauge, ListFilter, MessageCircle, OctagonAlert, ShieldCheck, Languages, CheckCircle2, Compass } from 'lucide-react';
import { useI18n } from '@/i18n';

type Bi = { en: string; ar: string };
type Notice = { kind: 'warn' | 'stop' | 'ok'; text: Bi };
interface Section { id: string; icon: ReactNode; title: Bi; intro?: Bi; items?: Bi[]; ordered?: boolean; notices?: Notice[]; compare?: { a: { title: Bi; items: Bi[] }; b: { title: Bi; items: Bi[] } } }

const SECTIONS: Section[] = [
  {
    id: 'facebook', icon: <Compass size={18} />,
    title: { en: 'Facebook Groups guide', ar: 'دليل مجموعات فيسبوك' },
    intro: { en: 'The Facebook module works only in the desktop app. It has not been verified against live Facebook here; always check outcomes yourself.', ar: 'تعمل وحدة فيسبوك في تطبيق سطح المكتب فقط. لم يتم التحقق منها مع فيسبوك الحقيقي هنا؛ تحقق من النتائج بنفسك دائماً.' },
    items: [
      { en: 'Sign in manually in the visible desktop browser, including any checkpoint. Captchas are never bypassed.', ar: 'سجّل الدخول يدوياً في متصفح سطح المكتب الظاهر، بما في ذلك أي فحص أمني. لا يتم تجاوز الكابتشا أبداً.' },
      { en: 'Group search is read-only. Found groups are never joined or posted to automatically.', ar: 'بحث المجموعات للقراءة فقط. لا يتم الانضمام إلى المجموعات المكتشفة أو النشر فيها تلقائياً.' },
      { en: 'Joins are a separate task with their own consent. Membership questions must be answered manually.', ar: 'الانضمام مهمة منفصلة بموافقة مستقلة. أسئلة العضوية تُجاب يدوياً.' },
      { en: 'Posts go only to existing groups where you are authorized. Posting never joins a group; groups without a composer or membership are marked Needs review or Not posted.', ar: 'تُنشر المنشورات فقط في مجموعات موجودة ومصرّح لك فيها. النشر لا ينضم أبداً؛ المجموعات بلا مربع نشر أو عضوية تُوسم بـ يحتاج مراجعة أو لم يُنشر.' },
      { en: 'A post may include one saved image or video, or none. PDFs are not allowed.', ar: 'يمكن أن يتضمن المنشور صورة أو فيديو محفوظاً واحداً أو بدونهما. ملفات PDF غير مسموحة.' },
      { en: 'Search collects only real visible results. Coverage may be partial, and the limit (maximum 200) is a cap, not a guarantee.', ar: 'يجمع البحث النتائج الظاهرة الحقيقية فقط. قد تكون التغطية جزئية، والحد (الأقصى 200) سقف وليس ضماناً.' },
      { en: 'Posted is shown only when a newly observed post with matching text appears in the same group; its permalink is linked. Public visibility and moderator approval are not guaranteed. Media-only posts without a textual receipt stay Unconfirmed and need manual review.', ar: 'تظهر حالة تم النشر فقط عند ظهور منشور جديد مطابق للنص في المجموعة نفسها، ويُربط برابطه الدائم. لا يُضمن الظهور العام ولا موافقة المشرف. المنشورات بالوسائط فقط دون إيصال نصي تبقى غير مؤكدة وتحتاج مراجعة يدوية.' },
      { en: 'Schedules run only while the app is open. Uncertain outcomes are never retried automatically; check Facebook first.', ar: 'الجداول تعمل فقط والتطبيق مفتوح. النتائج غير المؤكدة لا تُعاد تلقائياً؛ تحقق من فيسبوك أولاً.' },
    ],
  },
  {
    id: 'start', icon: <Compass size={18} />,
    title: { en: 'Start here', ar: 'ابدأ من هنا' },
    intro: { en: 'Social Najhin keeps your records in a local SQLite database on this computer. Live browser actions run in visible local browser windows, and only after you start them.', ar: 'يحفظ Social Najhin سجلاتك في قاعدة بيانات SQLite محلية على هذا الجهاز. تعمل الإجراءات الحية في نوافذ متصفح محلية ظاهرة، ولا تبدأ إلا بعد أن تبدأها أنت.' },
    items: [
      { en: 'The home page shows every module as a node. Click a node to open it.', ar: 'تعرض الصفحة الرئيسية كل وحدة على شكل عقدة. انقر على العقدة لفتح الوحدة.' },
      { en: 'Live browser actions need the downloaded desktop app. The hosted preview only stores records and runs clearly labeled rehearsals.', ar: 'تحتاج الإجراءات الحية في المتصفح إلى تطبيق سطح المكتب المحمّل. أما المعاينة المستضافة فتحفظ السجلات وتشغّل تجارب تدريبية موسومة بوضوح فقط.' },
      { en: 'Use the language button in the header at any time to switch between English and Arabic. Your choice is saved locally.', ar: 'استخدم زر اللغة في الشريط العلوي في أي وقت للتبديل بين الإنجليزية والعربية. يُحفظ اختيارك محليًا.' },
    ],
  },
  {
    id: 'whatsapp', icon: <MessageCircle size={18} />,
    title: { en: 'WhatsApp sign-in and sessions', ar: 'تسجيل الدخول إلى واتساب والجلسات' },
    intro: { en: 'WhatsApp connects through a visible local browser window on your computer.', ar: 'يتصل واتساب عبر نافذة متصفح محلية ظاهرة على جهازك.' },
    ordered: true,
    items: [
      { en: 'Add a WhatsApp account label in Accounts Manager, then choose it in WhatsApp Marketing.', ar: 'أضف تسمية حساب واتساب في مدير الحسابات، ثم اخترها في تسويق واتساب.' },
      { en: 'Press the connect button. A browser window opens with the WhatsApp Web QR code.', ar: 'اضغط زر الاتصال. ستفتح نافذة متصفح تعرض رمز QR الخاص بواتساب ويب.' },
      { en: 'On your phone open WhatsApp, go to Linked devices, and scan the QR code yourself. Never share the QR code with anyone.', ar: 'على هاتفك افتح واتساب، ثم الأجهزة المرتبطة، وامسح رمز QR بنفسك. لا تشارك رمز QR مع أي شخص.' },
      { en: 'The session is kept in a private browser profile on this computer, so you normally do not scan again on the next launch. If WhatsApp signs you out, scan again.', ar: 'تُحفظ الجلسة في ملف تعريف متصفح خاص على هذا الجهاز، لذلك لا تحتاج عادةً إلى المسح مجددًا عند التشغيل التالي. إذا أنهى واتساب جلستك فامسح الرمز من جديد.' },
      { en: 'Removing an account label also deletes its local browser profile and saved session.', ar: 'حذف تسمية الحساب يحذف أيضًا ملف تعريف المتصفح المحلي والجلسة المحفوظة.' },
    ],
    notices: [{ kind: 'ok', text: { en: 'For WhatsApp, sign in only through the official QR flow. Never paste passwords, tokens or cookies into account-label fields. Separate SMTP and Telegram connection settings use the desktop encrypted credential vault.', ar: 'بالنسبة إلى واتساب، سجّل الدخول فقط عبر مسار QR الرسمي. لا تلصق كلمات مرور أو رموز وصول أو ملفات تعريف ارتباط في حقول تسمية الحساب. تستخدم إعدادات اتصال SMTP وتليجرام المنفصلة مخزن بيانات الاعتماد المشفّر في تطبيق سطح المكتب.' } }],
  },
  {
    id: 'extractors', icon: <Database size={18} />,
    title: { en: 'Extractors versus legacy Leads', ar: 'المستخرِجات مقابل صفحة العملاء المحتملين القديمة' },
    compare: {
      a: { title: { en: 'B2B & Data Extractors (/extractors)', ar: 'مستخرِجات B2B والبيانات (/extractors)' }, items: [
        { en: 'Runs REAL Google Maps, B2B and WhatsApp group member extraction tasks in a local browser.', ar: 'تشغّل مهام استخراج حقيقية من خرائط Google ومصادر B2B وأعضاء مجموعات واتساب في متصفح محلي.' },
        { en: 'For WhatsApp, choose an active account and enter the exact group name. Start the task in the desktop app, sign in and open that group manually within five minutes. Authorize collection first; membership is not consent to messages.', ar: 'لواتساب، اختر حساباً نشطاً وأدخل اسم المجموعة بالضبط. ابدأ المهمة في تطبيق سطح المكتب، وسجّل الدخول وافتح المجموعة يدوياً خلال خمس دقائق. يجب التصريح بجمع البيانات أولاً؛ العضوية ليست موافقة على المراسلة.' },
        { en: 'Only displayed names and international phone numbers are collected. Hidden phones stay blank, duplicate phone numbers are removed, and coverage may be partial. Export the filtered results with CSV or Excel; reaching your member limit is flagged for review.', ar: 'تُجمع الأسماء والأرقام الدولية الظاهرة فقط. تبقى الأرقام المخفية فارغة وتُزال الأرقام المكررة، وقد تكون النتائج جزئية. صدّر النتائج المصفّاة بصيغة CSV أو Excel؛ وعند بلوغ حد الأعضاء تُعلَّم المهمة للمراجعة.' },
        { en: 'Results are real records found at run time and can be reviewed and exported.', ar: 'النتائج سجلات حقيقية عُثر عليها أثناء التشغيل ويمكن مراجعتها وتصديرها.' },
        { en: 'Use this module for real work.', ar: 'استخدم هذه الوحدة للعمل الفعلي.' },
      ] },
      b: { title: { en: 'Google Maps Leads (/leads, legacy)', ar: 'عملاء خرائط Google (/leads، قديمة)' }, items: [
        { en: 'A legacy rehearsal that generates SIMULATED, synthetic leads.', ar: 'تجربة تدريبية قديمة تولّد عملاء محتملين وهميين مُحاكَين.' },
        { en: 'Nothing is scraped. Its records are kept only for backward compatibility.', ar: 'لا يُستخرج شيء. تُحفظ سجلاتها للتوافق مع الإصدارات السابقة فقط.' },
        { en: 'Do not treat these rows as real businesses.', ar: 'لا تعامل هذه الصفوف كأنها شركات حقيقية.' },
      ] },
    },
    notices: [{ kind: 'warn', text: { en: 'Real extraction can be incomplete. Websites change, and results may be missing or need review. Check the data before you rely on it.', ar: 'قد يكون الاستخراج الحقيقي ناقصًا. تتغير المواقع وقد تغيب نتائج أو تحتاج إلى مراجعة. تحقق من البيانات قبل الاعتماد عليها.' } }],
  },
  {
    id: 'exports', icon: <FileSpreadsheet size={18} />,
    title: { en: 'CSV and XLSX exports', ar: 'تصدير CSV وXLSX' },
    items: [
      { en: 'Export saved results as a clean CSV or XLSX file from the results table. Open them in Excel, Numbers or Google Sheets.', ar: 'صدّر النتائج المحفوظة كملف CSV أو XLSX نظيف من جدول النتائج. افتحه في Excel أو Numbers أو Google Sheets.' },
      { en: 'Exports contain the saved result columns only, so review the table first and delete rows you do not want.', ar: 'تحتوي الملفات المصدَّرة على أعمدة النتائج المحفوظة فقط، لذا راجع الجدول أولًا واحذف الصفوف غير المرغوبة.' },
      { en: 'In the desktop app a save dialog lets you pick the location. Cancelling the dialog does not create a file.', ar: 'في تطبيق سطح المكتب تتيح لك نافذة الحفظ اختيار الموقع. إلغاء النافذة لا ينشئ ملفًا.' },
    ],
  },
  {
    id: 'sms', icon: <MessageCircle size={18} />,
    title: { en: 'SMS Marketing (Twilio)', ar: 'التسويق عبر الرسائل النصية (Twilio)' },
    items: [
      { en: 'SMS works only in the desktop app, through your own Twilio account. The hosted preview shows the forms disabled, and a Replit connection does not transfer into the standalone app.', ar: 'تعمل الرسائل النصية في تطبيق سطح المكتب فقط، عبر حساب Twilio الخاص بك. تعرض المعاينة المستضافة النماذج معطلة، ولا ينتقل اتصال Replit إلى التطبيق المستقل.' },
      { en: 'Create an API key at console.twilio.com with Messaging read and send permissions. Enter Account SID (AC…), API Key SID (SK…) and the secret inside the app only; never paste secrets into chat. By default the secret stays in memory and expires when the app closes; you can store it encrypted instead.', ar: 'أنشئ مفتاح API من console.twilio.com بصلاحيات قراءة وإرسال الرسائل. أدخل Account SID (AC…) وAPI Key SID (SK…) والسر داخل التطبيق فقط ولا تلصقه في أي محادثة. افتراضيًا يبقى السر في الذاكرة وينتهي عند إغلاق التطبيق، ويمكنك حفظه مشفّرًا بدلًا من ذلك.' },
      { en: 'The From number must be a Twilio-owned, SMS-capable number in +country format. Trial accounts can reach only verified recipients, and regional registration rules may apply.', ar: 'يجب أن يكون رقم المرسل رقمًا تملكه في Twilio ويدعم الرسائل النصية بصيغة +رمز الدولة. الحسابات التجريبية تصل إلى المستلمين الموثّقين فقط وقد تنطبق قواعد التسجيل الإقليمية.' },
      { en: '“Connected” means only that authentication and read access worked. No message was sent and write permission is not claimed. One approved test message needs its own checkbox and an explicit click.', ar: '«متصل» يعني فقط نجاح المصادقة وصلاحية القراءة. لم تُرسل أي رسالة ولا يُدّعى وجود صلاحية الكتابة. رسالة الاختبار الواحدة تحتاج مربع موافقة خاصًا ونقرة صريحة.' },
      { en: 'Recipients: +number or Name <+number>, one per line, duplicates removed by full number, no country guessing. {{name}} and {{phone}} are personalized. Contacts marked opted out are blocked at preflight and before each send.', ar: 'المستلمون: +الرقم أو الاسم <+الرقم>، واحد في كل سطر، وتُزال التكرارات حسب الرقم الكامل دون تخمين الدولة. يعمل {{name}} و{{phone}}. تُحظر جهات الاتصال التي ألغت اشتراكها قبل التشغيل وقبل كل رسالة.' },
      { en: 'Segments: GSM-7 text fits 160 characters (153 per part); Arabic and other non-GSM text uses UCS-2 at 70 (67 per part). Each rendered message may be up to 1600 characters. Charges are per segment; the estimate is not an exact price.', ar: 'الأجزاء: نص GSM-7 يتسع 160 حرفًا (153 لكل جزء)، والعربية وغيرها تستخدم UCS-2 بواقع 70 (67 لكل جزء). يصل طول كل رسالة إلى 1600 حرف. التكلفة لكل جزء والتقدير ليس سعرًا دقيقًا.' },
      { en: 'Statuses: Accepted/queued is not delivered. Sent means submitted to the carrier. Delivered is carrier-reported, not read. Failed, Undelivered and Cancelled are final problems. Unknown or Unconfirmed outcomes are never retried automatically. “Refresh” only looks up status; it never resends.', ar: 'الحالات: «مقبولة/في الطابور» لا تعني التسليم. «مُرسلة» تعني التقديم إلى شركة الاتصالات. «تم التسليم» بحسب إبلاغ الشركة وليس القراءة. «فشلت» و«لم تُسلَّم» و«أُلغيت» مشكلات نهائية. النتائج المجهولة أو غير المؤكدة لا يُعاد إرسالها تلقائيًا. «تحديث» يستعلم عن الحالة فقط ولا يعيد الإرسال.' },
    ],
  },
  {
    id: 'wafilter', icon: <ListFilter size={18} />,
    title: { en: 'WaFilter, WA-CRM and opt-outs', ar: 'WaFilter وWA-CRM وإلغاء الاشتراك' },
    items: [
      { en: 'WaFilter checks each number against WhatsApp through your connected local session. Results are Active/Valid, Inactive, Unknown, or Unverified (not yet checked).', ar: 'يفحص WaFilter كل رقم مقابل واتساب عبر جلستك المحلية المتصلة. النتائج: نشط/صالح أو غير نشط أو غير معروف أو غير مُتحقَّق منه (لم يُفحص بعد).' },
      { en: 'Unknown means the check could not be completed or confirmed. It is not the same as Inactive, so do not discard Unknown numbers as invalid.', ar: 'غير معروف يعني أن الفحص لم يكتمل أو لم يتأكد. وهو ليس مثل غير نشط، فلا تتجاهل الأرقام غير المعروفة على أنها غير صالحة.' },
      { en: 'WA-CRM lists the chats seen by the local inbox listener and lets you keep notes per chat.', ar: 'يعرض WA-CRM المحادثات التي رصدها مستمع الوارد المحلي ويتيح لك حفظ ملاحظات لكل محادثة.' },
      { en: 'Organize opt-outs: mark people who ask to stop as opted out in Contacts and keep them out of every message list. Honor opt-out requests immediately.', ar: 'نظّم إلغاء الاشتراك: ضع علامة إلغاء الاشتراك على من يطلب التوقف في جهات الاتصال وأبقه خارج كل قوائم الرسائل. احترم طلبات إلغاء الاشتراك فورًا.' },
    ],
  },
  {
    id: 'rate', icon: <Gauge size={18} />,
    title: { en: 'Rate controls', ar: 'ضوابط الوتيرة' },
    intro: { en: 'Between live actions the app waits a randomized 5 to 12 seconds. This slows the pace and keeps runs easy to watch and stop.', ar: 'ينتظر التطبيق بين الإجراءات الحية مدة عشوائية من 5 إلى 12 ثانية. يبطّئ هذا الوتيرة ويجعل التشغيل سهل المراقبة والإيقاف.' },
    notices: [{ kind: 'warn', text: { en: 'These delays are rate controls only. They do NOT protect your account and are NOT a guarantee against bans, blocks or restrictions. Platforms decide independently.', ar: 'هذه التأخيرات ضوابط للوتيرة فقط. هي لا تحمي حسابك وليست ضمانًا ضد الحظر أو التقييد. المنصات تقرر بشكل مستقل.' } }],
  },
  {
    id: 'safety', icon: <OctagonAlert size={18} />,
    title: { en: 'Limits, consent and responsibility', ar: 'الحدود والموافقة والمسؤولية' },
    items: [
      { en: 'If a platform shows a restriction, verification or warning, the run stops. The app does not bypass it and does not retry automatically. Resolve it yourself on the platform.', ar: 'إذا أظهرت المنصة تقييدًا أو طلب تحقق أو تحذيرًا فيتوقف التشغيل. لا يتجاوز التطبيق ذلك ولا يعيد المحاولة تلقائيًا. عالج الأمر بنفسك على المنصة.' },
      { en: 'Contact only people who gave consent, and follow each platform’s rules and your local laws.', ar: 'تواصل فقط مع من منحوا موافقتهم، والتزم بقواعد كل منصة وبقوانين بلدك.' },
      { en: 'Email: the app can send through your own SMTP connection and check address format, but it cannot guarantee a message reaches an inbox or that a mailbox exists.', ar: 'البريد الإلكتروني: يمكن للتطبيق الإرسال عبر اتصال SMTP الخاص بك وفحص صيغة العنوان، لكنه لا يضمن وصول الرسالة إلى صندوق الوارد ولا وجود صندوق البريد.' },
      { en: 'Email setup: on the desktop app, enter your SMTP host, port 465 (SSL/TLS) or 587, username, password and From address. By default credentials stay in memory only and expire when you close the app; turn that off to keep them encrypted by your operating system. Send a test email first (it needs your explicit permission). “Queued” and “Accepted” mean the server took the message, not that it was delivered.', ar: 'إعداد البريد: في تطبيق سطح المكتب أدخل مضيف SMTP والمنفذ 465 (SSL/TLS) أو 587 واسم المستخدم وكلمة المرور وعنوان المرسل. افتراضيًا تبقى بيانات الاعتماد في الذاكرة فقط وتنتهي عند إغلاق التطبيق؛ أوقف ذلك لحفظها مشفّرة بواسطة نظام التشغيل. أرسل رسالة اختبار أولًا (تحتاج إلى إذنك الصريح). «في الطابور» و«مقبولة» تعنيان أن الخادم استلم الرسالة، لا أنها وصلت.' },
      { en: 'Email recipients: one per line, as an address or Name <email>. Duplicates are removed by address. {{name}} and {{email}} work in the subject and message; an inline name wins, then the name in Contacts, then the address. Contacts marked opted out are blocked. CSV import reads the email and name columns.', ar: 'مستلمو البريد: واحد في كل سطر، كعنوان أو الاسم <البريد>. تُزال التكرارات حسب العنوان. يعمل {{name}} و{{email}} في الموضوع والرسالة؛ الاسم المكتوب في السطر له الأولوية، ثم الاسم في جهات الاتصال، ثم العنوان. تُحظر جهات الاتصال التي ألغت اشتراكها. يقرأ استيراد CSV عمودي email وname.' },
    ],
    notices: [
      { kind: 'stop', text: { en: 'Actions already submitted to a platform (sent messages, joins, posts) cannot be undone from this app. Cancel stops only what has not started yet.', ar: 'الإجراءات التي أُرسلت بالفعل إلى المنصة (رسائل مرسلة أو انضمام أو منشورات) لا يمكن التراجع عنها من هذا التطبيق. الإلغاء يوقف فقط ما لم يبدأ بعد.' } },
    ],
  },
];

export default function Help() {
  const { lang, t } = useI18n();
  const L = (b: Bi) => b[lang];
  return <main className="page" data-testid="page-help">
    <div className="help-hero">
      <div className="eyebrow"><BookOpen size={12} style={{ verticalAlign: 'middle' }} /> {t('Help & Guidelines')}</div>
      <h1>{t('Help & Guidelines')}</h1>
      <p>{t('Plain answers about what each module really does, what it cannot do, and how to stay in control.')}</p>
      <div className="help-notice warn"><AlertTriangle size={16} /><span>{t('No tool can promise that an account will avoid restrictions. Use Social Najhin carefully, with consent, and watch every live run.')}</span></div>
    </div>
    <nav className="help-toc" aria-label={t('Guide sections')}>{SECTIONS.map(s => <a key={s.id} href={`#help-${s.id}`} onClick={e => { e.preventDefault(); document.getElementById(`help-${s.id}`)?.scrollIntoView({ behavior: 'smooth' }); }} data-testid={`link-help-${s.id}`}>{L(s.title)}</a>)}</nav>
    {SECTIONS.map(s => <section key={s.id} id={`help-${s.id}`} className="help-section" aria-labelledby={`help-h-${s.id}`} data-testid={`help-section-${s.id}`}>
      <h2 id={`help-h-${s.id}`}>{s.icon}{L(s.title)}</h2>
      {s.intro && <p>{L(s.intro)}</p>}
      {s.compare && <div className="help-compare">{[s.compare.a, s.compare.b].map((c, i) => <div key={i}><h3 dir="auto">{L(c.title)}</h3><ul>{c.items.map((it, j) => <li key={j}>{L(it)}</li>)}</ul></div>)}</div>}
      {s.items && (s.ordered ? <ol>{s.items.map((it, i) => <li key={i}>{L(it)}</li>)}</ol> : <ul>{s.items.map((it, i) => <li key={i}>{L(it)}</li>)}</ul>)}
      {s.notices?.map((n, i) => <div key={i} className={`help-notice ${n.kind}`} role={n.kind === 'stop' ? 'alert' : 'note'}>{n.kind === 'ok' ? <ShieldCheck size={16} /> : n.kind === 'stop' ? <OctagonAlert size={16} /> : <AlertTriangle size={16} />}<span>{L(n.text)}</span></div>)}
    </section>)}
    <section className="help-section" data-testid="help-section-links">
      <h2><CheckCircle2 size={18} />{t('Jump to a module')}</h2>
      <div className="help-toc" style={{ marginBottom: 0 }}>
        {[['/whatsapp', 'WhatsApp Marketing'], ['/extractors', 'B2B & Data Extractors'], ['/wafilter', 'WaFilter'], ['/wa-crm', 'WA-CRM'], ['/contacts', 'Contacts'], ['/settings', 'Settings & License']].map(([href, label]) => <Link key={href} href={href} data-testid={`link-help-module-${href.slice(1)}`}>{t(label)}</Link>)}
      </div>
      <p style={{ marginTop: 12 }}><Languages size={13} style={{ verticalAlign: 'middle' }} /> {t('Your own campaign names, messages and records are never translated.')}</p>
    </section>
  </main>;
}
