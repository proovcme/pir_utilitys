import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import Database from "@tauri-apps/plugin-sql";
import type { CalculationSnapshot, Catalog, EstimateTemplate, ProjectInput } from "../domain/types";

export interface WorkingState {
  id: "current";
  project: ProjectInput;
  catalog: Catalog;
  updatedAt: string;
}

interface CalculatorDb extends DBSchema {
  templates: {
    key: string;
    value: EstimateTemplate;
    indexes: { "by-updated": string };
  };
  history: {
    key: string;
    value: CalculationSnapshot;
    indexes: { "by-created": string };
  };
  appState: {
    key: string;
    value: WorkingState;
  };
}

export interface StorageService {
  listTemplates(): Promise<EstimateTemplate[]>;
  saveTemplate(template: EstimateTemplate): Promise<void>;
  deleteTemplate(id: string): Promise<void>;
  listHistory(): Promise<CalculationSnapshot[]>;
  saveSnapshot(snapshot: CalculationSnapshot): Promise<void>;
  deleteSnapshot(id: string): Promise<void>;
  getWorkingState(): Promise<WorkingState | null>;
  saveWorkingState(state: WorkingState): Promise<void>;
}

const isTauriRuntime = () => "__TAURI_INTERNALS__" in window;

class IndexedDbStorage implements StorageService {
  private dbPromise: Promise<IDBPDatabase<CalculatorDb>>;

  constructor() {
    this.dbPromise = openDB<CalculatorDb>("project-estimate-calculator", 2, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("templates")) {
          const templates = db.createObjectStore("templates", { keyPath: "id" });
          templates.createIndex("by-updated", "updatedAt");
        }
        if (!db.objectStoreNames.contains("history")) {
          const history = db.createObjectStore("history", { keyPath: "id" });
          history.createIndex("by-created", "createdAt");
        }
        if (!db.objectStoreNames.contains("appState")) {
          db.createObjectStore("appState", { keyPath: "id" });
        }
      },
    });
  }

  async listTemplates() {
    const db = await this.dbPromise;
    return (await db.getAllFromIndex("templates", "by-updated")).reverse();
  }

  async saveTemplate(template: EstimateTemplate) {
    const db = await this.dbPromise;
    await db.put("templates", template);
  }

  async deleteTemplate(id: string) {
    const db = await this.dbPromise;
    await db.delete("templates", id);
  }

  async listHistory() {
    const db = await this.dbPromise;
    return (await db.getAllFromIndex("history", "by-created")).reverse();
  }

  async saveSnapshot(snapshot: CalculationSnapshot) {
    const db = await this.dbPromise;
    await db.put("history", snapshot);
  }

  async deleteSnapshot(id: string) {
    const db = await this.dbPromise;
    await db.delete("history", id);
  }

  async getWorkingState() {
    const db = await this.dbPromise;
    return (await db.get("appState", "current")) ?? null;
  }

  async saveWorkingState(state: WorkingState) {
    const db = await this.dbPromise;
    await db.put("appState", state);
  }
}

class SqliteStorage implements StorageService {
  private dbPromise: Promise<Database>;

  constructor() {
    this.dbPromise = this.init();
  }

  private async init() {
    const db = await Database.load("sqlite:project-estimate-calculator.db");
    await db.execute(
      "CREATE TABLE IF NOT EXISTS templates (id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, payload TEXT NOT NULL)",
    );
    await db.execute(
      "CREATE TABLE IF NOT EXISTS history (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, payload TEXT NOT NULL)",
    );
    await db.execute(
      "CREATE TABLE IF NOT EXISTS app_state (id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, payload TEXT NOT NULL)",
    );
    return db;
  }

  async listTemplates() {
    const db = await this.dbPromise;
    const rows = await db.select<Array<{ payload: string }>>(
      "SELECT payload FROM templates ORDER BY updated_at DESC",
    );
    return rows.map((row) => JSON.parse(row.payload) as EstimateTemplate);
  }

  async saveTemplate(template: EstimateTemplate) {
    const db = await this.dbPromise;
    await db.execute(
      "INSERT INTO templates (id, updated_at, payload) VALUES ($1, $2, $3) ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, payload = excluded.payload",
      [template.id, template.updatedAt, JSON.stringify(template)],
    );
  }

  async deleteTemplate(id: string) {
    const db = await this.dbPromise;
    await db.execute("DELETE FROM templates WHERE id = $1", [id]);
  }

  async listHistory() {
    const db = await this.dbPromise;
    const rows = await db.select<Array<{ payload: string }>>(
      "SELECT payload FROM history ORDER BY created_at DESC",
    );
    return rows.map((row) => JSON.parse(row.payload) as CalculationSnapshot);
  }

  async saveSnapshot(snapshot: CalculationSnapshot) {
    const db = await this.dbPromise;
    await db.execute(
      "INSERT INTO history (id, created_at, payload) VALUES ($1, $2, $3) ON CONFLICT(id) DO UPDATE SET created_at = excluded.created_at, payload = excluded.payload",
      [snapshot.id, snapshot.createdAt, JSON.stringify(snapshot)],
    );
  }

  async deleteSnapshot(id: string) {
    const db = await this.dbPromise;
    await db.execute("DELETE FROM history WHERE id = $1", [id]);
  }

  async getWorkingState() {
    const db = await this.dbPromise;
    const rows = await db.select<Array<{ payload: string }>>(
      "SELECT payload FROM app_state WHERE id = 'current' LIMIT 1",
    );
    return rows[0] ? (JSON.parse(rows[0].payload) as WorkingState) : null;
  }

  async saveWorkingState(state: WorkingState) {
    const db = await this.dbPromise;
    await db.execute(
      "INSERT INTO app_state (id, updated_at, payload) VALUES ($1, $2, $3) ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, payload = excluded.payload",
      [state.id, state.updatedAt, JSON.stringify(state)],
    );
  }
}

export const createStorageService = (): StorageService =>
  isTauriRuntime() ? new SqliteStorage() : new IndexedDbStorage();
