const DB_NAME = "vahren-mapmaker";
const DB_VERSION = 1;
const BACKUP_LIMIT = 10;

let databasePromise;

export async function getDraft() {
  return request("drafts", "readonly", store => store.get("current"));
}

export async function saveDraft(record) {
  const value = { ...record, id: "current", savedAt: Date.now() };
  await request("drafts", "readwrite", store => store.put(value));
  await request("backups", "readwrite", store => store.add({
    ...record,
    savedAt: value.savedAt,
  }));
  await trimBackups();
  return value;
}

export async function clearDraft() {
  await request("drafts", "readwrite", store => store.delete("current"));
}

export async function listBackups() {
  const values = await request("backups", "readonly", store => store.getAll());
  return values.sort((a, b) => b.savedAt - a.savedAt);
}

export async function clearBackups() {
  await request("backups", "readwrite", store => store.clear());
}

export async function saveMaterial(record) {
  return request("materials", "readwrite", store => store.put(record));
}

export async function listMaterials() {
  return request("materials", "readonly", store => store.getAll());
}

export async function clearMaterials() {
  await request("materials", "readwrite", store => store.clear());
}

export async function clearMaterialsByType(type) {
  const materials = await listMaterials();
  for (const material of materials) {
    if (material.type === type) {
      await request("materials", "readwrite", store => store.delete(material.key));
    }
  }
}

async function trimBackups() {
  const backups = await listBackups();
  for (const backup of backups.slice(BACKUP_LIMIT)) {
    await request("backups", "readwrite", store => store.delete(backup.id));
  }
}

function request(storeName, mode, operation) {
  return openDatabase().then(database => new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const result = operation(store);
    result.onsuccess = () => resolve(result.result);
    result.onerror = () => reject(result.error);
    transaction.onerror = () => reject(transaction.error);
  }));
}

function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = () => {
      const database = open.result;
      database.createObjectStore("drafts", { keyPath: "id" });
      database.createObjectStore("backups", { keyPath: "id", autoIncrement: true });
      database.createObjectStore("materials", { keyPath: "key" });
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
  return databasePromise;
}
