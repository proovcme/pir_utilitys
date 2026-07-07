---
name: project-estimate-calculator-maintenance
description: Поддержка Tauri/React калькулятора оценки проектных работ ПД/РД/ФЗИП с локальным хранением, настройкой ставок и Excel-экспортом с формулами.
---

# Project Estimate Calculator Maintenance Skill

Use this skill when modifying or reviewing this repository:

```text
/Users/chernetchenko/Code/calc
```

The app is a Russian-language desktop calculator for project estimate pricing. The important promise is: the GUI must stay understandable for a non-developer estimator, and Excel export must stay auditable with formulas.

## Required first steps

1. Read `README.md`.
2. Read `docs/CODE_MAP.md`.
3. Read `docs/TEST_PROGRAM.md`.
4. Inspect current files before editing:
   - `src/App.tsx`
   - `src/domain/calculation.ts`
   - `src/domain/types.ts`
   - `src/services/excelExport.ts`
   - `src/styles/app.css`

## Architecture

- UI: `src/App.tsx`
- Domain math: `src/domain/calculation.ts`
- Data contracts: `src/domain/types.ts`
- Seed catalog: `src/data/seedCatalog.ts`
- Excel export: `src/services/excelExport.ts`
- Rate import/export: `src/services/rateExchange.ts`
- Storage: `src/services/storage.ts`
- Styling: `src/styles/app.css`
- Tauri shell: `src-tauri/`

## Non-negotiable invariants

- Do not put calculation math directly into UI handlers if it belongs in `calculation.ts`.
- Do not show technical IDs to the user unless they are explicitly needed for diagnostics.
- Do not show inactive catalog rows as zero-cost calculation rows.
- `Расчет` is where sets are applied to the current estimate.
- `Конфигурация` is where sets are created and edited.
- `Ставки` is where rate multiplier and role step live.
- `Итог` is for project parameters, totals, groups and commercial coefficients.
- `Оценка` sheet must reference `Конструктор` formulas, not freeze active rows as plain values.
- `Конструктор` sheet must keep formulas for active flag, salary lookup, FOT estimate, coefficient, work cost, buffer, commercial coefficient and m2 price.
- Workbook must set `fullCalcOnLoad = true`.
- Brand color is Mexican Red `#a72525`; active/darker red is `#7f1d1d`.

## UX rules

- Build real controls, not explanatory text.
- Keep screens dense but readable.
- Buttons must describe real actions:
  - `Ручная строка` adds a custom row.
  - `В раздел 5` adds a PД Раздел 5 child row.
  - `Из базы РД` opens checklist selection from RD reference.
- Sidebar brand is not clickable and must not look like a nav button.
- Long text such as row names must wrap cleanly.
- Manual amount/% input belongs visually in the `Стоимость` column.
- Stage duration belongs in compact `Дн.` column.

## Calculation rules

FOT line:

```text
baseRate = rateGroupMedian * rateMultiplier
chiefRate = baseRate * (1 + roleStepRate)
leadRate = baseRate
engineerRate = baseRate * (1 - roleStepRate)
monthlyDepreciation = (computerCost - computerSalvageValue) / computerUsefulLifeYears / 12
lineCost = sum(roleUnits * (roleRate + monthlyDepreciation) * durationDays / 30) * coefficient
```

Commercial totals:

```text
directWorks = sum(active workCost)
buffer = directWorks * bufferRate
totalWithBuffer = directWorks + buffer
overhead = totalWithBuffer * overheadRate
totalWithoutVat = totalWithBuffer * commercialCoefficient
profit = totalWithoutVat - (totalWithBuffer + overhead)
vat = totalWithoutVat * vatRate
totalWithVat = totalWithoutVat + vat
```

If commercial coefficient is `1` and overhead is `15%`, profit is negative. This is expected.

## Where to add common changes

### Add a new KPI

1. Add field to `EstimateTotals`.
2. Compute in `calculateEstimate`.
3. Render in `App.tsx`.
4. Add formula to `excelExport.ts`.
5. Extend tests.

### Change Excel columns

1. Update `constructor.getRow(1).values`.
2. Update row values.
3. Update formulas that refer to shifted columns.
4. Update column widths.
5. Update `constructor.autoFilter`.
6. Update `tests/excelExport.test.ts`.

### Add a rate group

1. Add definition to `rateDisciplineDefinitions` if system-level.
2. Add seed rates if baseline needs nonzero prices.
3. Ensure `getRateGroupCode` maps raw codes.
4. Check `Ставки` UI.
5. Check Excel `Справочники`.

## Required validation

Run:

```bash
npm run build
npm test
```

For UI-affecting work, also inspect the app at:

```text
http://127.0.0.1:1420/
```

For Excel-affecting work, the test must verify:

- key cells are formulas;
- formula count is nontrivial;
- formula text contains no `#REF!`, `#VALUE!`, `#DIV/0!`, `#NAME?`, `#N/A`.

## Common pitfalls

- Changing constructor columns without updating `Оценка` formulas.
- Showing raw rate codes in the main calculation dropdown.
- Putting rate multiplier back into `Итог`.
- Putting set application back into `Конфигурация`.
- Treating old `Ручная сумма` as a separate modern type instead of normalizing it to `Ручной`.
- Forgetting that section 5 child IDs intentionally start with `ПП87.ОКС.5.`.

## User tone/context

The user wants a practical estimating tool, not a demo. They will call out unclear UX directly. Prefer fixing the UI and naming over explaining why the previous layout made sense.
