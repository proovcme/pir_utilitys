import { prikinatorNcsLines, type PrikinatorNcsLine, type PrikinatorObjectId } from "../data/prikinatorNcsLines";

export type PrikinatorBuildObject = {
  id: PrikinatorObjectId;
  label: string;
  hint: string;
};

export type PrikinatorWorkScenario = {
  id: "new" | "reconstruction" | "overhaul" | "modernization";
  label: string;
  hint: string;
  coefficient: number;
  note: string;
};

export type PrikinatorRegion = {
  id: string;
  label: string;
  coefficient: number;
};

export type NcsCapacityCalculation = {
  priceThousandRub: number;
  method: "exact" | "nearest" | "interpolation" | "boundary";
  note: string;
  lower?: PrikinatorNcsLine;
  upper?: PrikinatorNcsLine;
};

export type PrikinatorBuildCalculation = {
  capacity: number;
  unitPriceRub: number;
  baseCost: number;
  scenarioCost: number;
  regionalCost: number;
  vatAmount: number;
  totalWithVat: number;
  ncs: NcsCapacityCalculation;
};

export const prikinatorObjects: PrikinatorBuildObject[] = [
  { id: "residential", label: "Жилой дом", hint: "НЦС 01" },
  { id: "office", label: "Административное здание", hint: "НЦС 02" },
  { id: "school", label: "Образование", hint: "НЦС 03" },
  { id: "healthcare", label: "Медицина", hint: "НЦС 04" },
  { id: "sport", label: "Спорт", hint: "НЦС 05" },
  { id: "culture", label: "Культура", hint: "НЦС 06" },
  { id: "urban", label: "Городская инфраструктура", hint: "НЦС 19" },
];

export const prikinatorWorks: PrikinatorWorkScenario[] = [
  {
    id: "new",
    label: "Новое строительство",
    hint: "базовый сценарий",
    coefficient: 1,
    note: "Без сценарной поправки интерфейса.",
  },
  {
    id: "reconstruction",
    label: "Реконструкция",
    hint: "объект уже с характером",
    coefficient: 1.15,
    note: "Демо-поправка интерфейса. Для реального расчета нужен отдельный выбор нормативной базы и состава работ.",
  },
  {
    id: "overhaul",
    label: "Капитальный ремонт",
    hint: "нужна дефектовка",
    coefficient: 0.7,
    note: "Демо-поправка интерфейса. Капремонт нельзя честно посчитать без ведомости дефектов и объемов.",
  },
  {
    id: "modernization",
    label: "Техническое перевооружение",
    hint: "оборудование отдельно",
    coefficient: 0.55,
    note: "Демо-поправка интерфейса. Стоимость оборудования и специальные работы требуют отдельной детализации.",
  },
];

export const prikinatorRegions: PrikinatorRegion[] = [
  { id: "mo", label: "Московская область / базовый район", coefficient: 1 },
  { id: "moscow", label: "Москва", coefficient: 1.02 },
  { id: "spb", label: "Санкт-Петербург", coefficient: 1 },
  { id: "tatarstan", label: "Татарстан", coefficient: 0.81 },
  { id: "ural", label: "Свердловская область", coefficient: 0.94 },
  { id: "south", label: "Краснодарский край", coefficient: 0.84 },
  { id: "khmao", label: "ХМАО", coefficient: 1.12 },
  { id: "yanao", label: "ЯНАО", coefficient: 1.44 },
  { id: "sakha", label: "Якутия", coefficient: 1.6 },
];

export function linesForObject(objectId: PrikinatorObjectId) {
  return prikinatorNcsLines
    .filter((line) => line.objectId === objectId)
    .sort((left, right) => left.baseCapacity - right.baseCapacity);
}

export function linePriceRub(line: PrikinatorNcsLine) {
  return Math.round(line.priceThousandRub * 1000);
}

export function comparableLines(line: PrikinatorNcsLine) {
  return prikinatorNcsLines
    .filter((candidate) => candidate.objectId === line.objectId && candidate.table === line.table && candidate.unit === line.unit)
    .sort((left, right) => left.baseCapacity - right.baseCapacity);
}

export function ncsPriceForCapacity(line: PrikinatorNcsLine, capacityInput: number): NcsCapacityCalculation {
  const capacity = Math.max(0, Number.isFinite(capacityInput) ? capacityInput : line.baseCapacity);
  const peers = comparableLines(line);
  const exact = peers.find((peer) => peer.baseCapacity === capacity);
  if (exact) {
    return {
      priceThousandRub: exact.priceThousandRub,
      method: "exact",
      note: `Использована точная строка ${exact.code}.`,
      lower: exact,
      upper: exact,
    };
  }

  if (peers.length < 2) {
    return {
      priceThousandRub: line.priceThousandRub,
      method: "nearest",
      note: `Для выбранной строки нет соседних мощностей в справочнике. Взята цена строки ${line.code}.`,
      lower: line,
      upper: line,
    };
  }

  const lower = [...peers].reverse().find((peer) => peer.baseCapacity < capacity);
  const upper = peers.find((peer) => peer.baseCapacity > capacity);

  if (lower && upper) {
    const span = upper.baseCapacity - lower.baseCapacity;
    const ratio = span > 0 ? (capacity - lower.baseCapacity) / span : 0;
    const priceThousandRub = lower.priceThousandRub + (upper.priceThousandRub - lower.priceThousandRub) * ratio;
    return {
      priceThousandRub,
      method: "interpolation",
      note: `Цена единицы интерполирована между ${lower.code} и ${upper.code}.`,
      lower,
      upper,
    };
  }

  const boundary = lower ?? upper ?? line;
  return {
    priceThousandRub: boundary.priceThousandRub,
    method: "boundary",
    note: `Мощность вне интервала выбранной таблицы. Взята ближайшая строка ${boundary.code}.`,
    lower: boundary,
    upper: boundary,
  };
}

export function calculatePrikinatorBuild(input: {
  line: PrikinatorNcsLine;
  capacity: number;
  work: PrikinatorWorkScenario;
  region: PrikinatorRegion;
  vatRate: number;
}): PrikinatorBuildCalculation {
  const capacity = Math.max(0, Number.isFinite(input.capacity) ? input.capacity : input.line.baseCapacity);
  const ncs = ncsPriceForCapacity(input.line, capacity);
  const unitPriceRub = Math.round(ncs.priceThousandRub * 1000);
  const baseCost = capacity * unitPriceRub;
  const scenarioCost = baseCost * input.work.coefficient;
  const regionalCost = scenarioCost * input.region.coefficient;
  const vatAmount = regionalCost * Math.max(0, input.vatRate);

  return {
    capacity,
    unitPriceRub,
    baseCost,
    scenarioCost,
    regionalCost,
    vatAmount,
    totalWithVat: regionalCost + vatAmount,
    ncs,
  };
}
