export type PrikinatorObjectId =
  | "residential"
  | "office"
  | "school"
  | "healthcare"
  | "sport"
  | "culture"
  | "urban";

export type PrikinatorNcsLine = {
  objectId: PrikinatorObjectId;
  code: string;
  table: string;
  title: string;
  sourceName: string;
  sourceUrl: string;
  page: number;
  unit: string;
  baseCapacity: number;
  priceThousandRub: number;
};

export const prikinatorNcsLines: PrikinatorNcsLine[] = [
  {
    "objectId": "residential",
    "code": "01-01-001-01",
    "table": "Таблица 01-01-001",
    "title": "Жилые здания усадебного типа общей площадью 75 м2",
    "sourceName": "НЦС 81-02-01-2026. Сборник N 01. Жилые здания",
    "sourceUrl": "https://k-css.ru/f/prikaz_159pr_sbornik_1.pdf",
    "page": 20,
    "unit": "м2 общей площади жилого дома",
    "baseCapacity": 75,
    "priceThousandRub": 79.21
  },
  {
    "objectId": "residential",
    "code": "01-03-001-03",
    "table": "Таблица 01-03-001",
    "title": "Жилые здания средней этажности (3-5 этажей) с несущими стенами из кирпича, площадь квартир 3 200 м2",
    "sourceName": "НЦС 81-02-01-2026. Сборник N 01. Жилые здания",
    "sourceUrl": "https://k-css.ru/f/prikaz_159pr_sbornik_1.pdf",
    "page": 21,
    "unit": "м2 общей площади квартир",
    "baseCapacity": 3200,
    "priceThousandRub": 72.42
  },
  {
    "objectId": "residential",
    "code": "01-05-004-01",
    "table": "Таблица 01-05-004",
    "title": "Жилые здания повышенной этажности (11-16 этажей), площадь квартир 4 000 м2",
    "sourceName": "НЦС 81-02-01-2026. Сборник N 01. Жилые здания",
    "sourceUrl": "https://k-css.ru/f/prikaz_159pr_sbornik_1.pdf",
    "page": 25,
    "unit": "м2 общей площади квартир",
    "baseCapacity": 4000,
    "priceThousandRub": 107.56
  },
  {
    "objectId": "residential",
    "code": "01-05-004-02",
    "table": "Таблица 01-05-004",
    "title": "Жилые здания повышенной этажности (11-16 этажей), площадь квартир 8 000 м2",
    "sourceName": "НЦС 81-02-01-2026. Сборник N 01. Жилые здания",
    "sourceUrl": "https://k-css.ru/f/prikaz_159pr_sbornik_1.pdf",
    "page": 25,
    "unit": "м2 общей площади квартир",
    "baseCapacity": 8000,
    "priceThousandRub": 105.09
  },
  {
    "objectId": "residential",
    "code": "01-05-004-03",
    "table": "Таблица 01-05-004",
    "title": "Жилые здания повышенной этажности (11-16 этажей), площадь квартир 17 300 м2",
    "sourceName": "НЦС 81-02-01-2026. Сборник N 01. Жилые здания",
    "sourceUrl": "https://k-css.ru/f/prikaz_159pr_sbornik_1.pdf",
    "page": 25,
    "unit": "м2 общей площади квартир",
    "baseCapacity": 17300,
    "priceThousandRub": 92.27
  },
  {
    "objectId": "residential",
    "code": "01-05-004-04",
    "table": "Таблица 01-05-004",
    "title": "Жилые здания повышенной этажности (11-16 этажей), площадь квартир 23 000 м2",
    "sourceName": "НЦС 81-02-01-2026. Сборник N 01. Жилые здания",
    "sourceUrl": "https://k-css.ru/f/prikaz_159pr_sbornik_1.pdf",
    "page": 25,
    "unit": "м2 общей площади квартир",
    "baseCapacity": 23000,
    "priceThousandRub": 93.71
  },
  {
    "objectId": "office",
    "code": "02-01-001-02",
    "table": "Таблица 02-01-001",
    "title": "Административные здания общей площадью 1 800 м2",
    "sourceName": "НЦС 81-02-02-2026. Сборник N 02. Административные здания",
    "sourceUrl": "https://k-css.ru/f/19032026_157_pr_sbornik_2.pdf",
    "page": 20,
    "unit": "м2 общей площади",
    "baseCapacity": 1800,
    "priceThousandRub": 115.06
  },
  {
    "objectId": "office",
    "code": "02-01-001-03",
    "table": "Таблица 02-01-001",
    "title": "Административные здания общей площадью 4 500 м2",
    "sourceName": "НЦС 81-02-02-2026. Сборник N 02. Административные здания",
    "sourceUrl": "https://k-css.ru/f/19032026_157_pr_sbornik_2.pdf",
    "page": 20,
    "unit": "м2 общей площади",
    "baseCapacity": 4500,
    "priceThousandRub": 107.45
  },
  {
    "objectId": "office",
    "code": "02-01-001-04",
    "table": "Таблица 02-01-001",
    "title": "Административные здания общей площадью 13 500 м2",
    "sourceName": "НЦС 81-02-02-2026. Сборник N 02. Административные здания",
    "sourceUrl": "https://k-css.ru/f/19032026_157_pr_sbornik_2.pdf",
    "page": 20,
    "unit": "м2 общей площади",
    "baseCapacity": 13500,
    "priceThousandRub": 100.05
  },
  {
    "objectId": "school",
    "code": "03-01-001-05",
    "table": "Таблица 03-01-001",
    "title": "Детский сад с несущими стенами из кирпича и облицовкой лицевым кирпичом на 330 мест",
    "sourceName": "НЦС 81-02-03-2026. Сборник N 03. Объекты образования",
    "sourceUrl": "https://k-css.ru/f/19032026_167_pr_sbornik_3.pdf",
    "page": 21,
    "unit": "место",
    "baseCapacity": 330,
    "priceThousandRub": 1281.12
  },
  {
    "objectId": "school",
    "code": "03-04-001-01",
    "table": "Таблица 03-04-001",
    "title": "Школа с бассейном, оборудованным одной чашей, на 425 мест",
    "sourceName": "НЦС 81-02-03-2026. Сборник N 03. Объекты образования",
    "sourceUrl": "https://k-css.ru/f/19032026_167_pr_sbornik_3.pdf",
    "page": 28,
    "unit": "место",
    "baseCapacity": 425,
    "priceThousandRub": 2234.17
  },
  {
    "objectId": "school",
    "code": "03-04-001-02",
    "table": "Таблица 03-04-001",
    "title": "Школа с бассейном, оборудованным одной чашей, на 700 мест",
    "sourceName": "НЦС 81-02-03-2026. Сборник N 03. Объекты образования",
    "sourceUrl": "https://k-css.ru/f/19032026_167_pr_sbornik_3.pdf",
    "page": 28,
    "unit": "место",
    "baseCapacity": 700,
    "priceThousandRub": 2074.23
  },
  {
    "objectId": "school",
    "code": "03-07-001-01",
    "table": "Таблица 03-07-001",
    "title": "Учебный, учебно-лабораторный корпус общей площадью 3 500 м2",
    "sourceName": "НЦС 81-02-03-2026. Сборник N 03. Объекты образования",
    "sourceUrl": "https://k-css.ru/f/19032026_167_pr_sbornik_3.pdf",
    "page": 30,
    "unit": "м2 общей площади здания",
    "baseCapacity": 3500,
    "priceThousandRub": 122.81
  },
  {
    "objectId": "school",
    "code": "03-07-001-02",
    "table": "Таблица 03-07-001",
    "title": "Учебный, учебно-лабораторный корпус общей площадью 11 100 м2",
    "sourceName": "НЦС 81-02-03-2026. Сборник N 03. Объекты образования",
    "sourceUrl": "https://k-css.ru/f/19032026_167_pr_sbornik_3.pdf",
    "page": 30,
    "unit": "м2 общей площади здания",
    "baseCapacity": 11100,
    "priceThousandRub": 93.78
  },
  {
    "objectId": "healthcare",
    "code": "04-04-001-01",
    "table": "Таблица 04-04-001",
    "title": "Поликлиника на 100 посещений в смену",
    "sourceName": "НЦС 81-02-04-2026. Сборник N 04. Объекты здравоохранения",
    "sourceUrl": "https://k-css.ru/f/19032026_160_pr_sbornik_4.pdf",
    "page": 21,
    "unit": "посещение в смену",
    "baseCapacity": 100,
    "priceThousandRub": 6354.29
  },
  {
    "objectId": "healthcare",
    "code": "04-04-001-02",
    "table": "Таблица 04-04-001",
    "title": "Поликлиника на 250 посещений в смену",
    "sourceName": "НЦС 81-02-04-2026. Сборник N 04. Объекты здравоохранения",
    "sourceUrl": "https://k-css.ru/f/19032026_160_pr_sbornik_4.pdf",
    "page": 21,
    "unit": "посещение в смену",
    "baseCapacity": 250,
    "priceThousandRub": 3591.93
  },
  {
    "objectId": "healthcare",
    "code": "04-04-001-03",
    "table": "Таблица 04-04-001",
    "title": "Поликлиника на 630 посещений в смену",
    "sourceName": "НЦС 81-02-04-2026. Сборник N 04. Объекты здравоохранения",
    "sourceUrl": "https://k-css.ru/f/19032026_160_pr_sbornik_4.pdf",
    "page": 21,
    "unit": "посещение в смену",
    "baseCapacity": 630,
    "priceThousandRub": 1484.05
  },
  {
    "objectId": "sport",
    "code": "05-01-001-01",
    "table": "Таблица 05-01-001",
    "title": "Арена ледовая крытая универсальная без зрительских мест на 40 посещений в смену",
    "sourceName": "НЦС 81-02-05-2026. Сборник N 05. Спортивные здания и сооружения",
    "sourceUrl": "https://k-css.ru/f/19032026_145_pr_sbornik_5.pdf",
    "page": 19,
    "unit": "посещение в смену",
    "baseCapacity": 40,
    "priceThousandRub": 6682.33
  },
  {
    "objectId": "sport",
    "code": "05-01-001-02",
    "table": "Таблица 05-01-001",
    "title": "Арена ледовая крытая универсальная без зрительских мест на 50 посещений в смену",
    "sourceName": "НЦС 81-02-05-2026. Сборник N 05. Спортивные здания и сооружения",
    "sourceUrl": "https://k-css.ru/f/19032026_145_pr_sbornik_5.pdf",
    "page": 19,
    "unit": "посещение в смену",
    "baseCapacity": 50,
    "priceThousandRub": 5730.57
  },
  {
    "objectId": "sport",
    "code": "05-01-001-03",
    "table": "Таблица 05-01-001",
    "title": "Арена ледовая крытая универсальная без зрительских мест на 100 посещений в смену",
    "sourceName": "НЦС 81-02-05-2026. Сборник N 05. Спортивные здания и сооружения",
    "sourceUrl": "https://k-css.ru/f/19032026_145_pr_sbornik_5.pdf",
    "page": 19,
    "unit": "посещение в смену",
    "baseCapacity": 100,
    "priceThousandRub": 4837.3
  },
  {
    "objectId": "culture",
    "code": "06-01-001-01",
    "table": "Таблица 06-01-001",
    "title": "Музей, выставочный зал общей площадью 1 450 м2",
    "sourceName": "НЦС 81-02-06-2026. Сборник N 06. Объекты культуры",
    "sourceUrl": "https://k-css.ru/f/19032026_149_pr_sbornik_6.pdf",
    "page": 18,
    "unit": "м2 общей площади",
    "baseCapacity": 1450,
    "priceThousandRub": 143.41
  },
  {
    "objectId": "culture",
    "code": "06-01-001-02",
    "table": "Таблица 06-01-001",
    "title": "Музей, выставочный зал общей площадью 20 000 м2",
    "sourceName": "НЦС 81-02-06-2026. Сборник N 06. Объекты культуры",
    "sourceUrl": "https://k-css.ru/f/19032026_149_pr_sbornik_6.pdf",
    "page": 18,
    "unit": "м2 общей площади",
    "baseCapacity": 20000,
    "priceThousandRub": 78.65
  },
  {
    "objectId": "urban",
    "code": "19-02-001-02",
    "table": "Таблица 19-02-001",
    "title": "Котельная на газообразном топливе мощностью 1 МВт",
    "sourceName": "НЦС 81-02-19-2026. Сборник N 19. Здания и сооружения городской инфраструктуры",
    "sourceUrl": "https://k-css.ru/f/19032026_166_pr_sbornik_19.pdf",
    "page": 24,
    "unit": "МВт",
    "baseCapacity": 1,
    "priceThousandRub": 14718.72
  },
  {
    "objectId": "urban",
    "code": "19-02-001-03",
    "table": "Таблица 19-02-001",
    "title": "Котельная на газообразном топливе мощностью 3 МВт",
    "sourceName": "НЦС 81-02-19-2026. Сборник N 19. Здания и сооружения городской инфраструктуры",
    "sourceUrl": "https://k-css.ru/f/19032026_166_pr_sbornik_19.pdf",
    "page": 24,
    "unit": "МВт",
    "baseCapacity": 3,
    "priceThousandRub": 12863.21
  },
  {
    "objectId": "urban",
    "code": "19-02-001-04",
    "table": "Таблица 19-02-001",
    "title": "Котельная на газообразном топливе мощностью 5 МВт",
    "sourceName": "НЦС 81-02-19-2026. Сборник N 19. Здания и сооружения городской инфраструктуры",
    "sourceUrl": "https://k-css.ru/f/19032026_166_pr_sbornik_19.pdf",
    "page": 24,
    "unit": "МВт",
    "baseCapacity": 5,
    "priceThousandRub": 8620.61
  }
];
