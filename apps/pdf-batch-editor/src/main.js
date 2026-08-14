import { open, save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import profile from "../profiles/spds_stamp_mvp.json";
import "./styles.css";

const clone = (value) => JSON.parse(JSON.stringify(value));
const state = {
  input: "",
  inputs: [],
  output: "",
  outputDir: "",
  makePreviews: true,
  rules: clone(profile.rules),
  selected: 0,
  screen: "stamp",
  inspection: null,
  inspecting: false,
  running: false,
  progress: null,
  previewPages: [],
  previewModalOpen: false,
  selectedPreviewPage: 1,
  message: "Выберите исходный PDF. Типовые настройки СПДС уже подготовлены.",
  messageType: "info",
};

const app = document.querySelector("#app");
const ruleById = (id) => state.rules.find((rule) => rule.id === id);
const selectedRule = () => state.rules[state.selected];
const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");

function input(bind, value, type = "text", extra = "") {
  return `<input data-bind="${bind}" type="${type}" value="${esc(value)}" ${extra}>`;
}

function select(bind, value, options) {
  return `<select data-bind="${bind}">${options.map(([key, label]) => `<option value="${key}" ${String(key) === String(value) ? "selected" : ""}>${label}</option>`).join("")}</select>`;
}

function field(label, control, hint = "") {
  return `<label class="field"><span>${label}</span><div class="field-body">${control}${hint ? `<small>${hint}</small>` : ""}</div></label>`;
}

function render() {
  app.innerHTML = `
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark">СПДС</div>
        <div>
          <h1>Переоформление штампов ПД</h1>
          <p>Автоматизированная обработка PDF по ГОСТ Р 21.101</p>
        </div>
      </div>
      <nav class="tabs">
        <button data-screen="stamp" class="${state.screen === "stamp" ? "active" : ""}">Штамп СПДС</button>
        <button data-screen="rules" class="${state.screen === "rules" ? "active" : ""}">Конструктор правил</button>
      </nav>
      <div class="profile-menu">
        <button id="apply-preset-tz" class="preset-btn" title="Загрузить параметры базового задания">⚡ Базовое задание</button>
        <button id="import-profile">Открыть профиль</button>
        <button id="export-profile">Сохранить профиль</button>
      </div>
    </header>

    <main>
      ${renderFiles()}
      ${state.screen === "stamp" ? renderQuick() : renderRules()}
      ${renderFooter()}
    </main>
    ${renderPreviewModal()}`;
  bindEvents();
}

function renderFiles() {
  const packageLabel = state.inputs.length > 1 ? `${state.inputs.length} PDF файлов в пакете` : state.input ? shortPath(state.input) : "Нажмите для выбора PDF…";
  const outputLabel = state.inputs.length > 1 ? (state.outputDir ? shortPath(state.outputDir) : "Выберите папку для сохранения…") : (state.output ? shortPath(state.output) : "Куда сохранить переоформленный PDF…");
  return `
    <section class="step-card files-card">
      <div class="step-heading">
        <span class="step-num">1</span>
        <div>
          <h2>Комплект документации</h2>
          <p>Исходные файлы остаются без изменений. Результат создаётся в новом файле.</p>
        </div>
      </div>
      <div class="file-pickers">
        <button id="pick-input" class="file-picker ${state.input ? "chosen" : ""}">
          <span class="picker-label">Исходный файл / пакет</span>
          <strong>${packageLabel}</strong>
        </button>
        <span class="arrow">→</span>
        <button id="pick-output" class="file-picker ${(state.output || state.outputDir) ? "chosen" : ""}">
          <span class="picker-label">${state.inputs.length > 1 ? "Папка результатов" : "Выходной PDF"}</span>
          <strong>${outputLabel}</strong>
        </button>
      </div>
    </section>`;
}

function renderQuick() {
  const surnames = ruleById("stamp-surnames") || state.rules[0];
  const organization = ruleById("stamp-organization") || state.rules[1];
  const noteTch = ruleById("note-tch") || state.rules[2];
  const documentText = ruleById("document-text") || state.rules[4];
  const logo = ruleById("document-logo") || state.rules[5];
  const logoKind = logo?.action?.content_kind || "image";
  const style = surnames?.action?.style || {};
  const yearsList = (surnames.match?.years || [2022, 2023]).join(", ");
  const isAllSurnames = !surnames.match?.text;

  return `
    <section class="step-card">
      <div class="step-heading">
        <span class="step-num">2</span>
        <div>
          <h2>Распознанный штамп и структура документа</h2>
          <p>Автоматическое определение основных надписей форм 3–6. Нажмите на строку для быстрой привязки.</p>
        </div>
      </div>
      ${renderStampPreview()}
    </section>

    <section class="step-card">
      <div class="step-heading">
        <span class="step-num">3</span>
        <div>
          <h2>Параметры переоформления</h2>
          <p>Настройки базового задания: замена фамилий, организации и добавление красной пометки.</p>
        </div>
      </div>
      <div class="task-grid">
        ${quickTask("stamp-surnames", "Фамилии в штампе (2022-2023)", "Заменит фамилии в строках с датами указанных годов", `
          ${field("Режим", select("quick.surnameMode", isAllSurnames ? "all" : "specific", [["all", "Все фамилии за указанные годы"], ["specific", "Только конкретную фамилию"]]))}
          ${!isAllSurnames ? field("Старая фамилия", input("quick.oldSurname", surnames.match.text || "")) : ""}
          ${field("Новая фамилия", input("quick.surname", surnames.action.text || "Прокофьев"))}
          ${field("Годы дат", input("quick.years", yearsList), "2022, 2023")}
          ${field("Страницы", input("quick.pages", surnames.selector.pages || "all"), "all или 3, 7-10")}`)}

        ${quickTask("stamp-organization", "Организация в штампе", "Заменит название в ячейке основной надписи", `
          ${field("Найти", input("quick.oldOrg", organization.match.text || "НижегородСантехПроект"))}
          ${field("Заменить на", `<textarea data-bind="quick.newOrg" rows="2">${organization.action.text || 'АНО "Управление водными ресурсами"'}</textarea>`)}`)}

        ${quickTask("note-tch", "Красная пометка СПДС", "В левом нижнем углу над штампом (ТЧ) и над рамкой (ГЧ)", `
          ${field("Текст пометки", `<textarea data-bind="quick.note" rows="2">${noteTch.action.text || "*В текущий лист изменения не вносились"}</textarea>`)}`)}

        ${quickTask("document-text", "Текст в документе", "Замена произвольного текста на листах с сохранением стиля", `
          ${field("Найти", input("quick.oldText", documentText.match.text || ""))}
          ${field("Заменить на", `<textarea data-bind="quick.newText" rows="2">${documentText.action.text || ""}</textarea>`)}
          ${field("Страницы", input("quick.textPages", documentText.selector.pages || "all"), "all, 1 или 1-5")}
          <label class="plain-check"><input data-bind="quick.preserveStyle" type="checkbox" ${documentText.action.style.preserve_source_style ? "checked" : ""}> Сохранять исходный шрифт и кегль</label>`)}

        ${quickTask("document-logo", "Логотип / изображение", "Замена или добавление логотипа организации", `
          ${field("Тип", select("quick.logoKind", logoKind, [["text", "Текстовый логотип"], ["image", "Графика (PNG/JPG)"]]))}
          ${logoKind === "text" ? `
            ${field("Старый текст", input("quick.oldLogoText", logo.match.text || ""))}
            ${field("Новый текст", `<textarea data-bind="quick.newLogoText" rows="2">${logo.action.text || ""}</textarea>`)}
          ` : `
            ${field("Файл логотипа", `<div class="font-file"><input value="${esc(logo.action.image_path || "Не выбран")}" readonly><button id="pick-logo">Выбрать…</button></div>`)}
            <div class="coords">${field("X, мм", input("quick.logoX", logo.selector.region.x_mm, "number", 'step="0.1"'))}${field("Y, мм", input("quick.logoY", logo.selector.region.y_mm, "number", 'step="0.1"'))}${field("Ширина", input("quick.logoW", logo.selector.region.width_mm, "number", 'step="0.1"'))}${field("Высота", input("quick.logoH", logo.selector.region.height_mm, "number", 'step="0.1"'))}</div>`}
          ${field("Страницы", input("quick.logoPages", logo.selector.pages || "all"))}`)}
      </div>
    </section>

    <section class="step-card">
      <div class="step-heading">
        <span class="step-num">4</span>
        <div>
          <h2>Типографика новой фамилии</h2>
          <p>Автоматическое масштабирование предотвращает пересечение текста с линиями таблицы.</p>
        </div>
      </div>
      <div class="style-row">
        ${field("Шрифт", select("quick.fontFamily", style.font_family || "Arial", [["Arial", "Arial"], ["Calibri", "Calibri"], ["Times New Roman", "Times New Roman"]]))}
        ${field("Файл шрифта", `<div class="font-file"><input value="${esc(style.font_file || "Системный шрифт")}" readonly><button id="pick-font">TTF/OTF…</button></div>`)}
        ${field("Кегль", input("quick.fontSize", style.font_size_pt || 9, "number", 'min="1" step="0.5"'))}
        ${field("Мин. кегль", input("quick.minFontSize", style.min_font_size_pt || 5.5, "number", 'min="1" step="0.5"'), "Порог предупреждения")}
        ${field("Цвет текста", `<div class="color-choice">${input("quick.color", style.color || "#000000", "color")}<span>${style.color || "#000000"}</span></div>`)}
        ${field("Выравнивание", select("quick.align", style.align || "left", [["left", "По левому краю"], ["center", "По центру"], ["right", "По правому краю"]]))}
      </div>
      <label class="plain-check" style="margin-top:12px"><input data-bind="quick.autoFit" type="checkbox" ${style.auto_fit ? "checked" : ""}> Автоматически уменьшать кегль при нехватке ширины ячейки</label>
    </section>`;
}

function renderStampPreview() {
  if (state.inspecting) return `<div class="stamp-empty"><strong>Распознавание штампа…</strong><span>Анализ структуры страниц, штампов и дат…</span></div>`;
  if (!state.input) return `<div class="stamp-empty"><strong>Выберите исходный PDF комплект</strong><span>После выбора здесь отобразится найденный штамп и поля.</span></div>`;
  const sample = state.inspection?.sample;
  if (!sample) return `<div class="stamp-empty error-box"><strong>Штамп СПДС не обнаружен автоматически</strong><span>Вы можете настроить области вручную во вкладке «Конструктор правил».</span></div>`;
  const detected = state.inspection.values || [];
  return `
    <div class="stamp-workspace">
      <div class="stamp-preview">
        <img src="data:image/png;base64,${sample.image}" alt="Штамп на странице ${sample.page}">
        ${sample.fields.map((item) => `<button class="stamp-hotspot" data-detected-name="${esc(item.text)}" data-detected-role="${esc(item.role)}" data-detected-pages="${sample.page}" title="${esc(item.role)}: ${esc(item.text)} (стр. ${sample.page})" style="left:${item.x}%;top:${item.y}%;width:${Math.max(item.width, 4)}%;height:${Math.max(item.height, 5)}%"></button>`).join("")}
      </div>
      <aside class="detected-panel">
        <strong>Структура комплекта</strong>
        <p>${state.inspection.page_count} стр. · со штампом: ${state.inspection.detected_stamp_pages.length} · титульные: ${(state.inspection.structure?.title_pages || []).join(", ") || "нет"}</p>
        <p class="format-chips">${Object.entries(state.inspection.structure?.formats || {}).map(([name, count]) => `<span class="chip">${name}: ${count}</span>`).join(" ")}</p>
        <strong>Найденные фамилии</strong>
        <div class="detected-list">
          ${detected.length ? detected.map((item) => `
            <div class="detected-item">
              <span class="role-tag">${esc(item.role)}</span>
              <b>${esc(item.text)}</b>
              <small>стр. ${item.pages.join(", ")}</small>
              <div class="item-btns">
                <button data-detected-name="${esc(item.text)}" data-detected-role="${esc(item.role)}" data-detected-pages="all">По комплекту</button>
                <button data-detected-name="${esc(item.text)}" data-detected-role="${esc(item.role)}" data-detected-pages="${item.pages[0]}">Стр. ${item.pages[0]}</button>
              </div>
            </div>`).join("") : `<span class="muted">Фамилии не распознаны.</span>`}
        </div>
      </aside>
    </div>`;
}

function quickTask(id, title, description, body) {
  const rule = ruleById(id);
  const linked = id === "note-tch" ? ruleById("note-gch") : null;
  const enabled = rule ? rule.enabled && (!linked || linked.enabled) : false;
  return `
    <article class="task-card ${enabled ? "enabled" : ""}">
      <label class="task-switch">
        <input data-quick-toggle="${id}" type="checkbox" ${enabled ? "checked" : ""}>
        <i></i>
        <span>
          <strong>${title}</strong>
          <small>${description}</small>
        </span>
      </label>
      <div class="task-body">${body}</div>
    </article>`;
}

function renderRules() {
  const rule = selectedRule();
  return `
    <section class="rules-workspace">
      <aside class="rules-list step-card">
        <div class="rules-title">
          <div>
            <h2>Список правил</h2>
            <p>Настройка зон поиска и параметров замены</p>
          </div>
          <button id="add-rule" class="secondary-btn">+ Добавить</button>
        </div>
        <div class="rules-scroll">
          ${state.rules.map((item, index) => `
            <button class="rule-row ${index === state.selected ? "active" : ""}" data-rule="${index}">
              <i class="${item.enabled ? "on" : ""}"></i>
              <span>
                <strong>${item.name}</strong>
                <small>${humanSummary(item)}</small>
              </span>
            </button>`).join("")}
        </div>
        <div class="list-actions">
          <button id="duplicate-rule">Дублировать</button>
          <button id="delete-rule" class="danger">Удалить</button>
        </div>
      </aside>
      <section class="rule-editor step-card">${rule ? renderEditor(rule) : "<p>Выберите или добавьте правило.</p>"}</section>
    </section>`;
}

function renderEditor(rule) {
  const { selector, match, action } = rule;
  const region = selector.region || {};
  const style = action.style || {};
  return `
    <div class="editor-title">
      <div>
        ${input("name", rule.name, "text", 'class="rule-name"')}
        <p>${humanSummary(rule)}</p>
      </div>
      <label class="plain-check"><input data-bind="enabled" type="checkbox" ${rule.enabled ? "checked" : ""}> Включено</label>
    </div>
    <div class="plain-language">
      <section>
        <h3><span class="num-badge">1</span> Где искать</h3>
        ${field("Страницы", input("selector.pages", selector.pages || "all"), "all или 1-5, 8")}
        ${field("Ориентация", select("selector.orientation", selector.orientation, [["any", "Любая"], ["portrait", "Книжные"], ["landscape", "Альбомные"]]))}
        ${field("Тип листа", select("selector.document_kind", selector.document_kind, [["any", "Любой"], ["ТЧ", "Текстовая часть (ТЧ)"], ["ГЧ", "Графическая часть (ГЧ)"]]))}
      </section>
      <section>
        <h3><span class="num-badge">2</span> Что найти</h3>
        ${field("Тип поиска", select("match.type", match.type, [["none", "Без поиска — вставка"], ["exact_text", "Точный текст"], ["regex_word", "Регулярное выражение"], ["date_linked_name", "Фамилия рядом с датой"]]))}
        ${match.type === "date_linked_name" ? `
          ${field("Фамилия", input("match.text", match.text || ""), "Оставьте пустым для всех фамилий")}
          ${field("Годы дат", input("match.years", (match.years || [2022, 2023]).join(", ")))}
        ` : match.type !== "none" ? field("Текст", input("match.text", match.text || "")) : ""}
      </section>
      <section>
        <h3><span class="num-badge">3</span> Действие</h3>
        ${field("Действие", select("action.type", action.type, [["replace", "Заменить текст"], ["add", "Добавить текст"], ["redact", "Удалить (закрасить)"], ["add_image", "Вставить картинку"], ["replace_image", "Заменить область картинкой"]]))}
        ${["add_image", "replace_image"].includes(action.type) ? `
          ${field("Картинка", `<div class="font-file"><input value="${esc(action.image_path || "Не выбрано")}" readonly><button id="pick-rule-image">PNG/JPG…</button></div>`)}
        ` : action.type !== "redact" ? `
          ${field("Новый текст", `<textarea data-bind="action.text" rows="3">${action.text || ""}</textarea>`)}
        ` : ""}
      </section>
    </div>
    <details class="advanced">
      <summary>Точные координаты области и стиль (мм)</summary>
      <div class="advanced-grid">
        <fieldset>
          <legend>Область (в миллиметрах)</legend>
          ${field("Привязка к", select("selector.region.anchor", region.anchor, [["page", "Левый верх листа"], ["spds_title_block", "Штамп СПДС (185×55)"], ["detected_title_block_top", "Верх фактического штампа"], ["bottom_left", "Левый нижний угол"]]))}
          <div class="coords">
            ${field("X", input("selector.region.x_mm", region.x_mm || 0, "number", 'step="0.1"'))}
            ${field("Y", input("selector.region.y_mm", region.y_mm || 0, "number", 'step="0.1"'))}
            ${field("Ширина", input("selector.region.width_mm", region.width_mm || 50, "number", 'step="0.1"'))}
            ${field("Высота", input("selector.region.height_mm", region.height_mm || 15, "number", 'step="0.1"'))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Оформление текста</legend>
          ${field("Гарнитура", select("action.style.font_family", style.font_family || "Arial", [["Arial", "Arial"], ["Calibri", "Calibri"], ["Times New Roman", "Times New Roman"]]))}
          ${field("Кегль", input("action.style.font_size_pt", style.font_size_pt || 9, "number", 'step="0.5"'))}
          ${field("Минимум", input("action.style.min_font_size_pt", style.min_font_size_pt || 5, "number", 'step="0.5"'))}
          ${field("Цвет", input("action.style.color", style.color || "#000000", "color"))}
          ${field("Выравнивание", select("action.style.align", style.align || "left", [["left", "Слева"], ["center", "По центру"], ["right", "Справа"]]))}
          <label class="plain-check"><input data-bind="action.style.auto_fit" type="checkbox" ${style.auto_fit ? "checked" : ""}> Автоподбор кегля</label>
        </fieldset>
      </div>
    </details>`;
}

function renderFooter() {
  const progress = state.progress;
  const percent = progress ? Math.round((progress.completed + progress.failed) / Math.max(1, progress.total) * 100) : 0;
  return `
    <section class="action-bar ${state.messageType}">
      <div class="status-info">
        <strong>${state.running ? `Обработка комплекта: ${percent}%` : state.messageType === "success" ? "Готово" : state.messageType === "error" ? "Ошибка" : "Информация"}</strong>
        <p>${state.message}</p>
        ${progress ? `<div class="progress-track"><i style="width:${percent}%"></i></div><small class="progress-caption">Готово: ${progress.completed} · Ошибок: ${progress.failed} · Всего: ${progress.total}</small>` : ""}
      </div>
      <div class="footer-actions">
        <label class="plain-check"><input id="previews" type="checkbox" ${state.makePreviews ? "checked" : ""}> Создать PNG-превью</label>
        ${state.previewPages.length > 0 ? `<button id="open-previews-btn" class="secondary-btn">🔍 Просмотр страниц (${state.previewPages.length})</button>` : ""}
        <button id="run" class="primary" ${state.running ? "disabled" : ""}>${state.running ? "Обработка…" : "🚀 Обработать PDF"}</button>
      </div>
    </section>`;
}

function renderPreviewModal() {
  if (!state.previewModalOpen || !state.previewPages.length) return "";
  const currentPage = state.previewPages.find((p) => p.page === state.selectedPreviewPage) || state.previewPages[0];
  return `
    <div class="modal-overlay">
      <div class="modal-card">
        <div class="modal-header">
          <h3>Просмотр переоформленных страниц (Лист ${currentPage.page} из ${state.previewPages.length})</h3>
          <button id="close-modal-btn" class="close-btn">✕</button>
        </div>
        <div class="modal-body">
          <div class="preview-stage">
            <img src="${currentPage.src}" alt="Лист ${currentPage.page}">
          </div>
          <div class="thumbnails-bar">
            ${state.previewPages.map((p) => `<button class="thumb-btn ${p.page === state.selectedPreviewPage ? "active" : ""}" data-page="${p.page}"><span>Лист ${p.page}</span></button>`).join("")}
          </div>
        </div>
      </div>
    </div>`;
}

function shortPath(path) {
  const parts = path.split(/[\\/]/);
  return parts.length > 2 ? `…\\${parts.slice(-2).join("\\")}` : path;
}

function humanSummary(rule) {
  const match = { none: "вставка", exact_text: "точный текст", regex_word: "шаблон", date_linked_name: "фамилия у даты" }[rule.match.type] || rule.match.type;
  const action = { add: "добавить", replace: "заменить", redact: "стереть", add_image: "вставить картинку", replace_image: "заменить картинкой" }[rule.action.type] || rule.action.type;
  return `${match} → ${action}`;
}

function setPath(target, path, value) {
  const parts = path.split(".");
  let cursor = target;
  for (const part of parts.slice(0, -1)) cursor = cursor[part];
  cursor[parts.at(-1)] = value;
}

function applyPresetTZ() {
  const surnameRule = ruleById("stamp-surnames");
  if (surnameRule) {
    surnameRule.enabled = true;
    surnameRule.match.text = "";
    surnameRule.match.role = "";
    surnameRule.match.years = [2022, 2023];
    surnameRule.action.text = "Прокофьев";
  }
  const orgRule = ruleById("stamp-organization");
  if (orgRule) {
    orgRule.enabled = true;
    orgRule.match.text = "НижегородСантехПроект";
    orgRule.action.text = 'АНО "Управление водными ресурсами"';
  }
  const noteTch = ruleById("note-tch");
  if (noteTch) {
    noteTch.enabled = true;
    noteTch.action.text = "*В текущий лист изменения не вносились";
  }
  const noteGch = ruleById("note-gch");
  if (noteGch) {
    noteGch.enabled = true;
    noteGch.action.text = "*В текущий лист изменения не вносились";
  }
  state.message = "Загружены параметры базового задания: фамилии 2022-2023 → Прокофьев, организация → АНО УВР, красная пометка.";
  state.messageType = "success";
  render();
}

function bindEvents() {
  document.querySelectorAll("[data-screen]").forEach((button) => button.onclick = () => { state.screen = button.dataset.screen; render(); });
  document.querySelectorAll("[data-rule]").forEach((button) => button.onclick = () => { state.selected = Number(button.dataset.rule); render(); });
  document.querySelector("#apply-preset-tz")?.addEventListener("click", applyPresetTZ);
  document.querySelectorAll("[data-detected-name]").forEach((button) => button.onclick = () => {
    const rule = ruleById("stamp-surnames");
    rule.match.text = button.dataset.detectedName;
    rule.match.role = button.dataset.detectedRole;
    rule.selector.pages = button.dataset.detectedPages || "all";
    state.message = `Выбрано: ${button.dataset.detectedRole} — ${button.dataset.detectedName} (стр. ${rule.selector.pages}).`;
    state.messageType = "info";
    render();
  });
  document.querySelectorAll("[data-bind]").forEach((element) => {
    const event = element.tagName === "SELECT" || element.type === "checkbox" || element.type === "color" ? "change" : "input";
    element.addEventListener(event, () => updateBinding(element));
  });
  document.querySelectorAll("[data-quick-toggle]").forEach((element) => element.onchange = () => {
    const id = element.dataset.quickToggle;
    ruleById(id).enabled = element.checked;
    if (id === "note-tch" && ruleById("note-gch")) ruleById("note-gch").enabled = element.checked;
    render();
  });
  document.querySelector("#pick-input")?.addEventListener("click", chooseInput);
  document.querySelector("#pick-output")?.addEventListener("click", chooseOutput);
  document.querySelector("#pick-font")?.addEventListener("click", chooseFont);
  document.querySelector("#pick-logo")?.addEventListener("click", () => chooseImage(ruleById("document-logo")));
  document.querySelector("#pick-rule-image")?.addEventListener("click", () => chooseImage(selectedRule()));
  document.querySelector("#previews")?.addEventListener("change", (event) => state.makePreviews = event.target.checked);
  document.querySelector("#run")?.addEventListener("click", runEngine);
  document.querySelector("#import-profile")?.addEventListener("click", importProfile);
  document.querySelector("#export-profile")?.addEventListener("click", exportProfile);
  document.querySelector("#add-rule")?.addEventListener("click", addRule);
  document.querySelector("#duplicate-rule")?.addEventListener("click", duplicateRule);
  document.querySelector("#delete-rule")?.addEventListener("click", deleteRule);
  document.querySelector("#open-previews-btn")?.addEventListener("click", () => { state.previewModalOpen = true; render(); });
  document.querySelector("#close-modal-btn")?.addEventListener("click", () => { state.previewModalOpen = false; render(); });
  document.querySelectorAll("[data-page]").forEach((btn) => btn.onclick = () => { state.selectedPreviewPage = Number(btn.dataset.page); render(); });
}

function updateBinding(element) {
  let value = element.type === "checkbox" ? element.checked : element.value;
  if (element.type === "number") value = Number(value);
  const bind = element.dataset.bind;
  if (bind === "quick.surnameMode") {
    const surnameRule = ruleById("stamp-surnames");
    if (value === "all") surnameRule.match.text = "";
    render();
    return;
  }
  const quickMap = {
    "quick.role": ["stamp-surnames", "match.role"],
    "quick.pages": ["stamp-surnames", "selector.pages"],
    "quick.oldSurname": ["stamp-surnames", "match.text"],
    "quick.surname": ["stamp-surnames", "action.text"],
    "quick.oldOrg": ["stamp-organization", "match.text"],
    "quick.newOrg": ["stamp-organization", "action.text"],
    "quick.note": ["note-tch", "action.text"],
    "quick.oldText": ["document-text", "match.text"],
    "quick.newText": ["document-text", "action.text"],
    "quick.textPages": ["document-text", "selector.pages"],
    "quick.preserveStyle": ["document-text", "action.style.preserve_source_style"],
    "quick.logoMode": ["document-logo", "action.type"],
    "quick.oldLogoText": ["document-logo", "match.text"],
    "quick.newLogoText": ["document-logo", "action.text"],
    "quick.logoPages": ["document-logo", "selector.pages"],
    "quick.logoX": ["document-logo", "selector.region.x_mm"],
    "quick.logoY": ["document-logo", "selector.region.y_mm"],
    "quick.logoW": ["document-logo", "selector.region.width_mm"],
    "quick.logoH": ["document-logo", "selector.region.height_mm"],
  };
  if (bind === "quick.logoKind") {
    const logoRule = ruleById("document-logo");
    logoRule.action.content_kind = value;
    logoRule.match.type = value === "text" ? "exact_text" : "none";
    logoRule.action.type = value === "text" ? "replace" : "add_image";
    render();
  } else if (bind === "quick.years") {
    ruleById("stamp-surnames").match.years = String(value).split(",").map((item) => Number(item.trim())).filter(Boolean);
  } else if (quickMap[bind]) {
    const [id, path] = quickMap[bind]; setPath(ruleById(id), path, value);
    if (bind === "quick.note" && ruleById("note-gch")) ruleById("note-gch").action.text = value;
  } else if (bind?.startsWith("quick.")) {
    const style = ruleById("stamp-surnames").action.style;
    const names = { fontFamily: "font_family", fontSize: "font_size_pt", minFontSize: "min_font_size_pt", color: "color", align: "align", autoFit: "auto_fit" };
    style[names[bind.slice(6)]] = value;
    if (element.type === "color") render();
  } else if (bind) {
    if (bind === "match.years") value = String(value).split(",").map((item) => Number(item.trim())).filter(Boolean);
    setPath(selectedRule(), bind, value);
    if (element.tagName === "SELECT" && ["match.type", "action.type"].includes(bind)) render();
  }
}

async function chooseInput() {
  const selected = await open({ multiple: true, filters: [{ name: "PDF", extensions: ["pdf"] }] });
  if (selected) {
    state.inputs = Array.isArray(selected) ? selected : [selected];
    state.input = state.inputs[0];
    state.output = state.input.replace(/\.pdf$/i, "_переоформлен.pdf");
    state.outputDir = state.inputs.length > 1 ? parentPath(state.input) : "";
    state.screen = "stamp";
    await inspectInput();
  }
}

async function inspectInput() {
  state.inspecting = true;
  state.inspection = null;
  state.message = "Распознавание штампа и полей…";
  state.messageType = "info";
  render();
  try {
    const output = await invoke("run_engine", { args: ["--inspect-json", JSON.stringify({ input_pdf: state.input })] });
    const result = JSON.parse(output.stdout.trim().split(/\r?\n/).at(-1) || output.stderr);
    if (!result.ok) throw new Error(result.error || "Не удалось распознать штамп");
    state.inspection = result;
    state.message = `Штамп найден на ${result.detected_stamp_pages.length} страницах. Нажмите «Обработать PDF».`;
    state.messageType = result.sample ? "success" : "warning";
  } catch (error) {
    state.message = `Ошибка распознавания: ${error.message || error}`;
    state.messageType = "error";
  } finally {
    state.inspecting = false;
    render();
  }
}

async function chooseOutput() {
  if (state.inputs.length > 1) {
    const path = await open({ directory: true, multiple: false });
    if (path) { state.outputDir = path; render(); }
  } else {
    const path = await save({ defaultPath: state.output || "результат.pdf", filters: [{ name: "PDF", extensions: ["pdf"] }] });
    if (path) { state.output = path; render(); }
  }
}

async function chooseFont() {
  const path = await open({ multiple: false, filters: [{ name: "Шрифты", extensions: ["ttf", "otf", "ttc"] }] });
  if (path) { ruleById("stamp-surnames").action.style.font_file = path; render(); }
}

async function chooseImage(rule) {
  const path = await open({ multiple: false, filters: [{ name: "Изображения", extensions: ["png", "jpg", "jpeg"] }] });
  if (path) { rule.action.image_path = path; render(); }
}

function addRule() {
  const fresh = clone(profile.rules[0]);
  fresh.id = `rule-${Date.now()}`;
  fresh.name = "Новое правило";
  fresh.match = { type: "exact_text", text: "" };
  fresh.action.text = "";
  state.rules.push(fresh);
  state.selected = state.rules.length - 1;
  render();
}

function duplicateRule() {
  const copy = clone(selectedRule());
  copy.id = `rule-${Date.now()}`;
  copy.name += " (копия)";
  state.rules.splice(state.selected + 1, 0, copy);
  state.selected++;
  render();
}

function deleteRule() {
  state.rules.splice(state.selected, 1);
  state.selected = Math.max(0, Math.min(state.selected, state.rules.length - 1));
  render();
}

async function exportProfile() {
  const path = await save({ defaultPath: "профиль-штампов.json", filters: [{ name: "JSON", extensions: ["json"] }] });
  if (!path) return;
  await invoke("write_text_file", { path, contents: JSON.stringify({ name: "Профиль СПДС", version: "0.0.1", rules: state.rules }, null, 2) });
  state.message = `Профиль сохранён: ${path}`;
  state.messageType = "success";
  render();
}

async function importProfile() {
  const path = await open({ multiple: false, filters: [{ name: "JSON", extensions: ["json"] }] });
  if (!path) return;
  try {
    const data = JSON.parse(await invoke("read_text_file", { path }));
    if (!Array.isArray(data.rules)) throw new Error("В файле отсутствует список rules");
    state.rules = data.rules;
    for (const builtin of profile.rules) {
      if (!state.rules.some((rule) => rule.id === builtin.id)) state.rules.push(clone(builtin));
    }
    state.selected = 0;
    state.message = "Профиль успешно загружен.";
    state.messageType = "success";
  } catch (error) {
    state.message = `Не удалось открыть профиль: ${error.message || error}`;
    state.messageType = "error";
  }
  render();
}

async function runEngine() {
  if (!state.inputs.length || (state.inputs.length === 1 ? !state.output : !state.outputDir)) {
    state.message = "Сначала выберите исходный PDF и путь сохранения.";
    state.messageType = "error";
    render();
    return;
  }
  if (!state.rules.some((rule) => rule.enabled)) {
    state.message = "Включите хотя бы одно правило переоформления.";
    state.messageType = "error";
    render();
    return;
  }
  state.running = true;
  state.progress = { total: state.inputs.length, completed: 0, failed: 0, results: [] };
  state.messageType = "info";
  render();

  for (let index = 0; index < state.inputs.length; index++) {
    const inputPdf = state.inputs[index];
    const outputPdf = state.inputs.length === 1 ? state.output : joinPath(state.outputDir, `${baseName(inputPdf)}_переоформлен.pdf`);
    state.message = `Обработка ${index + 1} из ${state.inputs.length}: ${shortPath(inputPdf)}`;
    render();
    try {
      const job = { input_pdf: inputPdf, output_pdf: outputPdf, make_previews: state.makePreviews, rules: state.rules };
      const output = await invoke("run_engine", { args: ["--job-json", JSON.stringify(job)] });
      const result = JSON.parse(output.stdout.trim().split(/\r?\n/).at(-1) || output.stderr);
      if (!result.ok) throw new Error(result.error || "Ошибка при выполнении движка");
      state.progress.completed++;
      state.progress.results.push({ input: inputPdf, ok: true, result });
    } catch (error) {
      state.progress.failed++;
      state.progress.results.push({ input: inputPdf, ok: false, error: String(error.message || error) });
    }
    render();
  }
  state.running = false;
  state.message = state.progress.failed
    ? `Пакет завершён. Успешно: ${state.progress.completed}; с ошибками: ${state.progress.failed}.`
    : `Готово! Успешно обработано: ${state.progress.completed} файлов.`;
  state.messageType = state.progress.failed ? "warning" : "success";
  render();
}

function parentPath(path) { return path.replace(/[\\/][^\\/]+$/, ""); }
function baseName(path) { return path.split(/[\\/]/).pop().replace(/\.pdf$/i, ""); }
function joinPath(folder, name) { return `${folder.replace(/[\\/]$/, "")}\\${name}`; }

render();
