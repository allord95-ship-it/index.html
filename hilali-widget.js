// هلالي — كود الويدجت الأساسي (Scriptable)
// هذا الملف ينزل تلقائياً من المحمّل اللي في Scriptable، فلا تنسخه يدوياً.
// أي تعديل هنا يوصل للويدجت في أول تحديث له.
module.exports = async ({ args, config }) => {
  const SCRIPT_VERSION = 6;
  const fm = FileManager.local();
  const filePath = fm.joinPath(fm.documentsDirectory(), "hilali_events.json");

  function loadEvents() {
    if (fm.fileExists(filePath)) {
      try { return JSON.parse(fm.readString(filePath)); } catch (e) {}
    }
    return [];
  }

  function saveEvents(list) {
    fm.writeString(filePath, JSON.stringify(list));
  }

  const settingsPath = fm.joinPath(fm.documentsDirectory(), "hilali_settings.json");
  function loadSettings() {
    if (fm.fileExists(settingsPath)) {
      try { return JSON.parse(fm.readString(settingsPath)); } catch (e) {}
    }
    return { offset: 0, salary: true };
  }

  function localYMD(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  let events = loadEvents();
  let settings = loadSettings();
  const qp = args.queryParameters || {};

  if (qp.events) {
    try {
      const incoming = JSON.parse(qp.events);
      if (Array.isArray(incoming)) {
        // نحتفظ بالمواعيد المضافة من Scriptable ونستبدل مواعيد الصفحة فقط
        const local = events.filter(ev => ev.src !== "web");
        events = local.concat(incoming.map(ev => ({ title: ev.title, date: ev.date, src: "web" })));
        saveEvents(events);
      }
    } catch (e) {}
  }

  if (qp.offset !== undefined || qp.salary !== undefined || qp.v !== undefined) {
    if (qp.v !== undefined) settings.latest = parseInt(qp.v, 10) || 0;
    if (qp.offset !== undefined) settings.offset = parseInt(qp.offset, 10) || 0;
    if (qp.salary !== undefined) settings.salary = qp.salary === "1";
    fm.writeString(settingsPath, JSON.stringify(settings));
  }

  if (!config.runsInWidget && !qp.events) {
    const menu = new Alert();
    menu.title = "مواعيد هلالي";
    menu.addAction("إضافة موعد جديد");
    menu.addAction("حذف موعد");
    menu.addAction("معاينة الويدجت");
    menu.addCancelAction("إغلاق");
    const choice = await menu.presentSheet();

    if (choice === 0) {
      const add = new Alert();
      add.title = "موعد جديد";
      add.addTextField("اسم الموعد", "");
      add.addTextField("التاريخ (YYYY-MM-DD)", localYMD(new Date()));
      add.addAction("حفظ");
      add.addCancelAction("إلغاء");
      if (await add.presentAlert() === 0) {
        const title = add.textFieldValue(0).trim();
        const date = add.textFieldValue(1).trim();
        if (title && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
          events.push({ title, date });
          saveEvents(events);
        }
      }
    } else if (choice === 1 && events.length > 0) {
      const del = new Alert();
      del.title = "اختر الموعد لحذفه";
      events.forEach(ev => del.addDestructiveAction(`${ev.title} (${ev.date})`));
      del.addCancelAction("إلغاء");
      const idx = await del.presentSheet();
      if (idx !== -1) {
        events.splice(idx, 1);
        saveEvents(events);
      }
    }
  }

  const widget = new ListWidget();
  widget.setPadding(14, 16, 14, 16);
  const grad = new LinearGradient();
  grad.locations = [0, 1];
  grad.colors = [new Color("#0F172A"), new Color("#162032")];
  widget.backgroundGradient = grad;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // التاريخ بالأرقام: الجمعة 10/06/1448هـ  و  20/11/2026م
  const p2 = n => String(n).padStart(2, "0");
  const hDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (settings.offset || 0));
  const hp = {};
  new Intl.DateTimeFormat("en-US-u-ca-islamic-umalqura", { day: "numeric", month: "numeric", year: "numeric" })
    .formatToParts(hDate).forEach(x => { if (x.type !== "literal") hp[x.type] = parseInt(x.value, 10); });
  const weekday = new Intl.DateTimeFormat("ar-SA", { weekday: "long" }).format(now);
  const LRI = "\u2066", PDI = "\u2069"; // يمنع الاتجاه العربي من قلب الأرقام
  const hijriFull = `${weekday} ${LRI}${p2(hp.day)}/${p2(hp.month)}/${hp.year}${PDI}هـ`;
  const gregShort = `${LRI}${p2(now.getDate())}/${p2(now.getMonth() + 1)}/${now.getFullYear()}${PDI}م`;

  const header = widget.addStack();
  header.layoutHorizontally();
  header.centerAlignContent();

  const gText = header.addText(gregShort);
  gText.font = Font.semiboldSystemFont(13);
  gText.textColor = new Color("#94A3B8");
  gText.lineLimit = 1;
  gText.minimumScaleFactor = 0.7;
  header.addSpacer(6);
  header.addSpacer();

  const hText = header.addText(hijriFull);
  hText.font = Font.boldSystemFont(14);
  hText.textColor = new Color("#34D399");
  hText.lineLimit = 1;
  hText.minimumScaleFactor = 0.7;
  hText.rightAlignText();

  // تنبيه إذا الصفحة أحدث من هذا الكود
  if ((settings.latest || 0) > SCRIPT_VERSION) {
    widget.addSpacer(4);
    const warn = widget.addText("⚠️ حدّث كود السكربت من تبويب الويدجت");
    warn.font = Font.semiboldSystemFont(11);
    warn.textColor = new Color("#F59E0B");
    warn.lineLimit = 1;
    warn.minimumScaleFactor = 0.7;
  }

  widget.addSpacer(8);
  const divider = widget.addStack();
  divider.backgroundColor = new Color("#FFFFFF", 0.08);
  divider.size = new Size(0, 1);
  widget.addSpacer(8);

  function getDaysInfo(dateStr) {
    const target = new Date(dateStr + "T00:00:00");
    const diff = Math.round((target - startOfToday) / (1000 * 60 * 60 * 24));
    if (isNaN(diff) || diff < 0) return null;
    let text = diff === 0 ? "اليوم" : diff === 1 ? "غداً" : diff === 2 ? "بعد يومين" : diff <= 10 ? `باقي ${diff} أيام` : `باقي ${diff} يوم`;
    return { diff, text };
  }

  const SALARY_TITLE = "💰 يوم الرواتب";
  const maxRows = config.widgetFamily === "large" ? 6 : 3;

  // باقي المواعيد (بدون الراتب، عشان ما يتكرر لو وصل من الصفحة)
  const others = events
    .filter(ev => ev.title !== SALARY_TITLE)
    .map(ev => ({ ...ev, info: getDaysInfo(ev.date) }))
    .filter(ev => ev.info !== null)
    .sort((a, b) => a.info.diff - b.info.diff);

  // الراتب له مكان محجوز دايماً في الويدجت
  let salary = null;
  if (settings.salary !== false) {
    let pay = new Date(now.getFullYear(), now.getMonth(), 27);
    if (pay < startOfToday) pay = new Date(now.getFullYear(), now.getMonth() + 1, 27);
    const date = localYMD(pay);
    salary = { title: SALARY_TITLE, date, info: getDaysInfo(date) };
  }

  const upcoming = (salary ? others.slice(0, maxRows - 1).concat(salary) : others.slice(0, maxRows))
    .sort((a, b) => a.info.diff - b.info.diff);

  if (upcoming.length === 0) {
    widget.addSpacer();
    const emptyStack = widget.addStack();
    emptyStack.layoutHorizontally();
    emptyStack.addSpacer();
    const emptyText = emptyStack.addText("لا توجد مواعيد قادمة");
    emptyText.font = Font.systemFont(13);
    emptyText.textColor = new Color("#64748B");
    widget.addSpacer();
  } else {
    const palette = ["#34D399", "#F59E0B", "#38BDF8", "#A78BFA"];
    for (let i = 0; i < upcoming.length; i++) {
      const ev = upcoming[i];
      const color = palette[i % palette.length];
      const row = widget.addStack();
      row.layoutHorizontally();
      row.centerAlignContent();
      row.backgroundColor = new Color("#FFFFFF", 0.05);
      row.cornerRadius = 10;
      row.setPadding(7, 10, 7, 12);

      const badgeBox = row.addStack();
      badgeBox.backgroundColor = new Color(color, 0.18);
      badgeBox.cornerRadius = 6;
      badgeBox.setPadding(3, 8, 3, 8);
      const badgeTxt = badgeBox.addText(ev.info.text);
      badgeTxt.font = Font.boldSystemFont(11);
      badgeTxt.textColor = new Color(color);

      row.addSpacer();
      const titleTxt = row.addText(ev.title);
      titleTxt.font = Font.semiboldSystemFont(13);
      titleTxt.textColor = Color.white();
      titleTxt.rightAlignText();
      titleTxt.lineLimit = 1;

      row.addSpacer(8);
      const dot = row.addText("●");
      dot.font = Font.systemFont(8);
      dot.textColor = new Color(color);

      if (i < upcoming.length - 1) widget.addSpacer(6);
    }
  }

  widget.addSpacer();
  Script.setWidget(widget);
  if (!config.runsInWidget) await widget.presentMedium();
  Script.complete();
};
