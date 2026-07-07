# Карта кода

## Структура

```text
.
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── data/
│   │   └── seedCatalog.ts
│   ├── domain/
│   │   ├── calculation.ts
│   │   └── types.ts
│   ├── services/
│   │   ├── excelExport.ts
│   │   ├── rateExchange.ts
│   │   └── storage.ts
│   └── styles/
│       └── app.css
├── tests/
│   ├── calculation.test.ts
│   ├── excelExport.test.ts
│   └── setup.ts
├── scripts/
│   └── extract_seed.py
└── src-tauri/
    ├── src/
    │   ├── lib.rs
    │   └── main.rs
    └── tauri.conf.json
```

## Главные модули

### `src/App.tsx`

Главный React-компонент. Содержит экраны, состояние проекта, состояние каталога, обработчики UI и сборку видимых таблиц.

Ключевые зоны:

- Типы view: `summary`, `estimate`, `configuration`, `rates`, `templates`, `history`.
- `normalizeProject` и `normalizeCatalog` - миграция/нормализация старых данных.
- `visibleLines` - фильтрация строк для текущего экрана.
- `groupedVisibleStages` - группировка строк расчета по стадиям.
- `rateDisciplineSummary` - отображение стоимостных групп.
- `addManualLine` - добавление пользовательской строки.
- `addSectionFiveLine` - добавление строки внутрь Раздела 5 ПД.
- `createRdReferenceLine` / `addSelectedRdLines` - добавление РД из базы.
- `createPresetFromSelected` / `addSelectedToPresetSet` / `applyPresetSet` - работа с наборами.
- `saveCurrentTemplate`, `saveHistorySnapshot`, `exportWorkbook` - шаблоны, история и Excel.

Что менять здесь:

- UI-раскладку.
- Новые кнопки/экраны.
- Правила видимости строк.
- Поведение таблиц и массовых операций.

Что не менять здесь без необходимости:

- Математику расчета. Она должна оставаться в `domain/calculation.ts`.
- Структуру export workbook. Она должна оставаться в `services/excelExport.ts`.

### `src/domain/types.ts`

Единый контракт данных.

Главные типы:

- `ProjectInput` - параметры проекта и коэффициенты.
- `EstimateLine` - строка каталога/расчета.
- `RateGroup` - ставка или стоимостная группа.
- `PresetSet` - набор строк.
- `Catalog` / `SeedCatalog` - справочник и исходная модель.
- `CalculatedLine` - строка после расчета.
- `EstimateTotals` - итоговые показатели.
- `EstimateResult` - полный результат расчета.
- `EstimateTemplate` - редактируемый шаблон.
- `CalculationSnapshot` - неизменяемый снимок истории.
- `ExportOptions` - настройки Excel.

### `src/domain/calculation.ts`

Чистая доменная логика без UI и storage.

Главные функции:

- `rateDisciplineDefinitions` - укрупненные стоимостные группы.
- `getRateGroupCode` - нормализация сырого кода в группу.
- `getRateByGroupOrCode` - ставка группы как среднее по входящим кодам или прямая ставка.
- `normalizeCalculationType` - нормализация старых типов, например `ФО1` -> `ФОТ`.
- `getStaffRoleMultiplier` - множитель роли.
- `getLineStaffing` - состав строки по ролям.
- `resolveCostGroup` - стадия/группа затрат.
- `calculateMonthlyDepreciation` - амортизация техники.
- `calculateLine` - расчет одной строки.
- `calculateEstimate` - расчет всего проекта.
- `seedToCatalog` - преобразование seed в рабочий каталог.

Инварианты:

- `calculateEstimate` должен быть детерминированным.
- UI не должен дублировать формулы расчета.
- Активность строки определяется пресетами, ручным включением и исключением.
- Заголовки не считаются.
- Ручной тип считается только ручной суммой.
- `% от общего` считается после базовых строк.

### `src/data/seedCatalog.ts`

Версионированный исходный каталог, извлеченный из Excel.

Содержит:

- `projectInput` по умолчанию.
- строки ПП87, РД, Общие, ручные заготовки.
- ставки.
- справочник РД.
- справочник ПП87.
- базовые наборы.

Менять вручную можно, но осторожно: этот файл является базой миграции и тестов.

### `src/services/excelExport.ts`

Генерация `.xlsx` через ExcelJS.

Листы:

- `Итог`.
- `Оценка`.
- `Конструктор`.
- `Справочники`.
- `Пульт`.

Ключевые правила:

- В расчетных областях должны быть формулы.
- `Оценка` должна ссылаться на `Конструктор`, а не хранить застывшие значения.
- `Конструктор` должен содержать формулы активности, ставки, ФОТ, коэффициента, стоимости, буфера, коммерческого коэффициента, стоимости за м2 и контроля.
- `Пульт` должен содержать входные параметры и итоговые формулы.
- Workbook должен иметь `fullCalcOnLoad = true`.

### `src/services/rateExchange.ts`

Импорт/экспорт ставок CSV/XLSX.

Используется для обмена ставками между машинами и людьми. UI показывает стоимостные группы, но файл обмена хранит детальные коды.

### `src/services/storage.ts`

Абстракция локального хранения.

Реализации:

- `IndexedDbStorage` для browser/dev.
- `SqliteStorage` для Tauri desktop.

API:

- шаблоны;
- история;
- рабочее состояние.

### `src/styles/app.css`

Визуальная система приложения.

Базовый бренд-цвет:

```css
--brand: #a72525;
--brand-strong: #7f1d1d;
--nav: #a72525;
--nav-active: #7f1d1d;
```

Основные UI-правила:

- Sidebar brand выглядит как заголовок, а не кнопка.
- Таблицы плотные, но читаемые.
- Табличные заголовки красные.
- Цена имеет градиент по величине.
- Стадии показываются как строки-заголовки таблицы.

## Поток данных

```text
seedCatalog
  -> normalizeCatalog
  -> App state catalog/project
  -> calculateEstimate(project, catalog)
  -> UI screens
  -> exportEstimateWorkbook(snapshot)
  -> .xlsx
```

## Где добавлять типовую функциональность

### Новый итоговый показатель

1. Добавить поле в `EstimateTotals` в `types.ts`.
2. Посчитать в `calculateEstimate`.
3. Показать в `App.tsx`.
4. Добавить формулу в `excelExport.ts`.
5. Добавить тест в `calculation.test.ts` и/или `excelExport.test.ts`.

### Новая колонка расчета

1. Добавить поле в `EstimateLine` или `CalculatedLine`, если оно нужно в модели.
2. Добавить UI в таблицу `Расчет`.
3. Если влияет на расчет, менять `calculation.ts`.
4. Если должно быть в Excel, менять `excelExport.ts`.
5. Проверить ширины и mobile/desktop вид.

### Новая стоимостная группа

1. Добавить в `rateDisciplineDefinitions`, если группа системная.
2. Если группа пользовательская, создать через UI `Ставки`.
3. Убедиться, что `getRateGroupCode` нормализует сырой код в нужную группу.
4. Добавить/обновить ставки в `seedCatalog.ts`, если нужно для baseline.

### Новый набор

Пользовательский путь:

1. Открыть `Конфигурация`.
2. Выбрать строки.
3. Ввести имя набора.
4. Нажать `Создать набор`.

Кодовый путь:

1. Добавить `PresetSet` в `seedCatalog.ts`.
2. Указать `lineIds`, если набор должен иметь сохраненный состав.

## Критические места

- Формулы Excel по колонкам `Конструктор`: при изменении порядка колонок обязательно обновить `excelExport.test.ts`.
- `visibleLines` в `App.tsx`: влияет на то, что пользователь видит в расчете.
- `normalizeCatalog`: влияет на старые сохраненные состояния и шаблоны.
- `rateDisciplineDefinitions`: влияет на ставки, выпадающие списки и Excel-справочник.
- `calculateEstimate`: любые изменения меняют golden totals.
