import { downloadBytes, parseChipData, parseMap, serializeMap } from "./formats.js?v=2";
import { MapDocument, placementRect } from "./model.js?v=4";
import { classifyFolderAsType, classifyMaterialFiles } from "./materials.js?v=2";
import { importMaterialGroup as loadMaterialGroup } from "./material-loader.js?v=1";
import {
  clampPastePosition,
  formatDate,
  paletteFolderLabel,
  rectFromPoints,
  selectionSummary,
  storedBytesToBuffer,
  transformClipboardData,
  unitDimensions,
} from "./app-utils.js?v=1";
import { createBackupManager } from "./backup-manager.js?v=1";
import { createUiController } from "./ui-controller.js?v=1";
import {
  clearBackups,
  clearDraft,
  clearMaterials,
  clearMaterialsByType,
  getDraft,
  listBackups,
  listMaterials,
  saveDraft,
  saveMaterial,
} from "./storage.js?v=2";

const CELL_SOURCE = 32;
const MIN_CELL_SIZE = 12;
const MAX_CELL_SIZE = 96;
const state = {
  document: new MapDocument(),
  filename: "untitled.map",
  cellSize: 32,
  tool: "pen",
  paletteType: "field",
  selectedChip: null,
  chips: { field: [], object: [] },
  chipMap: new Map(),
  pointerDown: false,
  strokeChanged: false,
  lastCell: null,
  showGrid: true,
  showObjects: true,
  showUnits: true,
  gestureStartSize: 32,
  brushSize: 1,
  allowObjectOverlap: false,
  protectUnits: false,
  selection: null,
  selectionStart: null,
  clipboard: null,
  objectBoundaryFill: false,
  temporaryHideObjects: false,
  temporaryHideUnits: false,
  pastePreview: null,
  pasteDragging: false,
  panStart: null,
  spacePressed: false,
  storageAvailable: true,
};

const ui = Object.fromEntries([
  "map-canvas", "canvas-scroller", "palette", "selected-chip-name", "status",
  "cursor-x", "cursor-y", "document-name", "document-meta", "zoom", "zoom-value",
  "show-grid", "show-objects", "show-units", "map-width", "map-height",
  "unit-name", "unit-direction", "unit-form", "empty-hint", "new-dialog",
  "new-width", "new-height", "open-map", "import-chip",
  "brush-size", "brush-size-value", "allow-overlap", "protect-units",
  "selection-summary", "expand-top", "expand-left", "expand-bottom", "expand-right",
  "load-selection", "object-boundary-fill",
  "import-palette-folder", "palette-folder-label", "material-summary",
  "material-dialog", "import-material-set", "stored-material-counts",
  "backup-status", "restore-dialog", "restore-message",
  "active-tool-name", "toggle-tools-panel", "toggle-palette-panel",
  "close-palette-panel", "panel-backdrop",
].map(id => [id.replaceAll("-", "_"), document.getElementById(id)]));

const canvas = ui.map_canvas;
const ctx = canvas.getContext("2d", { alpha: false });
ctx.imageSmoothingEnabled = false;
let pendingDraft = null;
const uiController = createUiController({ document, window, ui, setStatus });
const backupManager = createBackupManager({
  getSnapshot: () => ({
    filename: state.filename,
    width: state.document.width,
    height: state.document.height,
    bytes: serializeMap(state.document),
  }),
  saveDraft,
  listBackups,
  clearBackups,
  clearDraft,
  setLabel: value => {
    ui.backup_status.textContent = value;
  },
});

boot().catch(error => {
  console.error(error);
  setStatus(`起動エラー: ${error.message}`, true);
});

async function boot() {
  bindEvents();
  uiController.syncResponsivePanels();
  setTool(state.tool);
  await Promise.all([
    loadSheet("field", "./assets/field/field.bmp", "./assets/field/fielddata.dat"),
    loadSheet("object", "./assets/object/object.png", "./assets/object/objectdata.dat"),
  ]);
  let draft = null;
  try {
    await restoreMaterials();
    draft = await getDraft();
  } catch (error) {
    console.warn("Persistent storage is unavailable", error);
    state.storageAvailable = false;
    backupManager.setAvailable(false);
  }
  state.chips.field.sort((a, b) => a.name.localeCompare(b.name));
  state.chips.object.sort((a, b) => a.name.localeCompare(b.name));
  selectChip(state.chips.field.find(chip => chip.name === "grass") ?? state.chips.field[0]);
  updatePaletteImportLabel();
  renderPalette();
  render();
  await updateStoredMaterialCounts();
  if (draft) showRestoreDialog(draft);
  backupManager.markCurrent();
  backupManager.updateStatus();
  window.setInterval(() => autoBackup(), 5000);
  setStatus(`${state.chips.field.length + state.chips.object.length} 個のチップを読み込みました`);
}

function bindEvents() {
  document.getElementById("tool-buttons").addEventListener("click", event => {
    const button = event.target.closest("[data-tool]");
    if (!button) return;
    setTool(button.dataset.tool);
    if (window.matchMedia("(max-width: 760px)").matches) uiController.closePanels();
  });
  document.querySelector(".palette-tabs").addEventListener("click", event => {
    const button = event.target.closest("[data-palette]");
    if (!button) return;
    state.paletteType = button.dataset.palette;
    document.querySelectorAll(".palette-tab").forEach(tab =>
      tab.classList.toggle("active", tab === button)
    );
    updatePaletteImportLabel();
    renderPalette();
  });

  document.getElementById("save-map").addEventListener("click", saveMap);
  ui.open_map.addEventListener("change", openMapFile);
  document.getElementById("new-map").addEventListener("click", () => ui.new_dialog.showModal());
  document.getElementById("create-map").addEventListener("click", createMap);
  document.getElementById("resize-map").addEventListener("click", resizeMap);
  document.getElementById("expand-map").addEventListener("click", expandMap);
  document.getElementById("undo").addEventListener("click", undo);
  document.getElementById("redo").addEventListener("click", redo);
  document.getElementById("copy-selection").addEventListener("click", copySelection);
  document.getElementById("rotate-left").addEventListener("click", () => transformClipboard("left"));
  document.getElementById("rotate-right").addEventListener("click", () => transformClipboard("right"));
  document.getElementById("flip-horizontal").addEventListener("click", () => transformClipboard("horizontal"));
  document.getElementById("flip-vertical").addEventListener("click", () => transformClipboard("vertical"));
  document.getElementById("save-selection").addEventListener("click", saveClipboard);
  ui.load_selection.addEventListener("change", loadClipboard);
  ui.import_chip.addEventListener("change", importChips);
  ui.import_palette_folder.addEventListener("change", importPaletteFolder);
  ui.import_material_set.addEventListener("change", importMaterialSet);
  document.getElementById("open-material-manager").addEventListener("click", openMaterialManager);
  document.getElementById("backup-now").addEventListener("click", () => autoBackup(true));
  document.getElementById("clear-backups").addEventListener("click", clearBackupHistory);
  document.getElementById("clear-field-materials").addEventListener("click", () => clearStoredMaterials("field"));
  document.getElementById("clear-object-materials").addEventListener("click", () => clearStoredMaterials("object"));
  document.getElementById("clear-materials").addEventListener("click", () => clearStoredMaterials());
  document.getElementById("restore-draft").addEventListener("click", restoreDraft);
  document.getElementById("discard-draft").addEventListener("click", discardDraft);
  ui.toggle_tools_panel.addEventListener("click", uiController.toggleToolsPanel);
  ui.toggle_palette_panel.addEventListener("click", () => uiController.setPalettePanelOpen(
    !document.body.classList.contains("palette-panel-open")
  ));
  ui.close_palette_panel.addEventListener("click", () => uiController.setPalettePanelOpen(false));
  ui.panel_backdrop.addEventListener("click", uiController.closePanels);

  ui.zoom.addEventListener("input", () => {
    setZoom(Number(ui.zoom.value));
  });
  ui.show_grid.addEventListener("change", () => { state.showGrid = ui.show_grid.checked; render(); });
  ui.show_objects.addEventListener("change", () => { state.showObjects = ui.show_objects.checked; render(); });
  ui.show_units.addEventListener("change", () => { state.showUnits = ui.show_units.checked; render(); });
  ui.brush_size.addEventListener("input", () => {
    state.brushSize = Number(ui.brush_size.value);
    ui.brush_size_value.value = String(state.brushSize);
  });
  ui.allow_overlap.addEventListener("change", () => {
    state.allowObjectOverlap = ui.allow_overlap.checked;
  });
  ui.protect_units.addEventListener("change", () => {
    state.protectUnits = ui.protect_units.checked;
  });
  ui.object_boundary_fill.addEventListener("change", () => {
    state.objectBoundaryFill = ui.object_boundary_fill.checked;
  });
  bindPeekButton("peek-objects", "temporaryHideObjects");
  bindPeekButton("peek-units", "temporaryHideUnits");

  canvas.addEventListener("contextmenu", event => event.preventDefault());
  canvas.addEventListener("pointerdown", pointerDown);
  canvas.addEventListener("pointermove", pointerMove);
  canvas.addEventListener("pointerup", pointerUp);
  canvas.addEventListener("pointercancel", pointerUp);
  canvas.addEventListener("pointerleave", () => {
    ui.cursor_x.textContent = "-";
    ui.cursor_y.textContent = "-";
  });
  ui.canvas_scroller.addEventListener("wheel", mapWheel, { passive: false });
  ui.canvas_scroller.addEventListener("gesturestart", gestureStart, { passive: false });
  ui.canvas_scroller.addEventListener("gesturechange", gestureChange, { passive: false });

  window.addEventListener("keydown", event => {
    if (event.key === "Escape") uiController.closePanels();
    if (event.target.matches("input, select")) return;
    const key = event.key.toLowerCase();
    if (event.code === "Space") {
      event.preventDefault();
      state.spacePressed = true;
      canvas.classList.add("is-panning");
      return;
    }
    if ((event.metaKey || event.ctrlKey) && key === "z") {
      event.preventDefault();
      event.shiftKey ? redo() : undo();
    } else if ((event.metaKey || event.ctrlKey) && key === "y") {
      event.preventDefault();
      redo();
    } else if (key === "p") setTool("pen");
    else if (key === "e") setTool("eraser");
    else if (key === "f") setTool("fill");
    else if (key === "u") setTool("unit");
    else if (key === "s") setTool("select");
    else if (key === "v") setTool("paste");
    else if (key === "i") setTool("eyedropper");
    else if (key === "h") setTool("pan");
    else if ((event.metaKey || event.ctrlKey) && key === "c") {
      event.preventDefault();
      copySelection();
    }
  });
  window.addEventListener("keyup", event => {
    if (event.code === "Space") {
      state.spacePressed = false;
      if (!state.panStart) canvas.classList.remove("is-panning");
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") autoBackup();
  });
  window.addEventListener("resize", uiController.syncResponsivePanels);
}

function bindPeekButton(id, stateKey) {
  const button = document.getElementById(id);
  const hide = event => {
    event.preventDefault();
    state[stateKey] = true;
    render();
  };
  const show = () => {
    state[stateKey] = false;
    render();
  };
  button.addEventListener("pointerdown", hide);
  button.addEventListener("pointerup", show);
  button.addEventListener("pointercancel", show);
  button.addEventListener("pointerleave", show);
}

function mapWheel(event) {
  const isPinch = event.ctrlKey || event.metaKey;
  const isMouseWheel = event.deltaMode !== WheelEvent.DOM_DELTA_PIXEL ||
    (Math.abs(event.deltaX) < 1 && Math.abs(event.deltaY) >= 40);
  if (!isPinch && !isMouseWheel) return;

  event.preventDefault();
  const direction = event.deltaY > 0 ? -1 : 1;
  const amount = isPinch
    ? Math.max(1, Math.min(4, Math.abs(event.deltaY) * 0.08))
    : 4;
  setZoom(state.cellSize + direction * amount, event.clientX, event.clientY);
}

function gestureStart(event) {
  event.preventDefault();
  state.gestureStartSize = state.cellSize;
}

function gestureChange(event) {
  event.preventDefault();
  setZoom(state.gestureStartSize * event.scale, event.clientX, event.clientY);
}

function setZoom(value, clientX = null, clientY = null) {
  const nextSize = Math.round(
    Math.max(MIN_CELL_SIZE, Math.min(MAX_CELL_SIZE, Number(value))) * 2
  ) / 2;
  if (nextSize === state.cellSize) return;

  const scroller = ui.canvas_scroller;
  const scrollerRect = scroller.getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect();
  const anchorClientX = clientX ?? scrollerRect.left + scroller.clientWidth / 2;
  const anchorClientY = clientY ?? scrollerRect.top + scroller.clientHeight / 2;
  const mapX = (anchorClientX - canvasRect.left) / state.cellSize;
  const mapY = (anchorClientY - canvasRect.top) / state.cellSize;

  state.cellSize = nextSize;
  ui.zoom.value = String(Math.round(nextSize / 2) * 2);
  ui.zoom_value.value = `${Math.round(nextSize / CELL_SOURCE * 100)}%`;
  render();

  const newCanvasRect = canvas.getBoundingClientRect();
  scroller.scrollLeft += newCanvasRect.left + mapX * nextSize - anchorClientX;
  scroller.scrollTop += newCanvasRect.top + mapY * nextSize - anchorClientY;
}

async function loadSheet(type, imageUrl, dataUrl) {
  const [image, response] = await Promise.all([loadImage(imageUrl), fetch(dataUrl)]);
  if (!response.ok) throw new Error(`${dataUrl} を取得できません`);
  const definition = parseChipData(await response.arrayBuffer());
  for (const entry of definition.entries) {
    const chipCanvas = document.createElement("canvas");
    chipCanvas.width = entry.width;
    chipCanvas.height = entry.height;
    const chipCtx = chipCanvas.getContext("2d");
    chipCtx.imageSmoothingEnabled = false;
    chipCtx.drawImage(
      image,
      entry.left, entry.top, entry.width, entry.height,
      0, 0, entry.width, entry.height
    );
    const chip = {
      name: entry.name,
      type: type === "field" ? 0 : 1,
      width: Math.max(1, entry.width / CELL_SOURCE),
      height: Math.max(1, entry.height / CELL_SOURCE),
      image: chipCanvas,
    };
    registerChip(type, chip);
  }
}

async function loadSheetFiles(type, imageFile, dataFile, skipNames = new Set(), persist = false) {
  const [image, definition] = await Promise.all([
    loadImageFile(imageFile),
    dataFile.arrayBuffer().then(parseChipData),
  ]);
  let count = 0;
  for (const entry of definition.entries) {
    if (skipNames.has(entry.name.toLowerCase())) continue;
    const chipCanvas = document.createElement("canvas");
    chipCanvas.width = entry.width;
    chipCanvas.height = entry.height;
    const chipCtx = chipCanvas.getContext("2d");
    chipCtx.imageSmoothingEnabled = false;
    chipCtx.drawImage(
      image,
      entry.left, entry.top, entry.width, entry.height,
      0, 0, entry.width, entry.height
    );
    const chip = {
      name: entry.name,
      type: type === "field" ? 0 : 1,
      width: Math.max(1, entry.width / CELL_SOURCE),
      height: Math.max(1, entry.height / CELL_SOURCE),
      image: chipCanvas,
    };
    registerChip(type, chip, true);
    if (persist) await persistChip(type, chip, await canvasToBlob(chipCanvas));
    count += 1;
  }
  return count;
}

function registerChip(type, chip, replace = false) {
  const key = `${chip.type}:${chip.name}`;
  if (state.chipMap.has(key) && !replace) return;
  if (replace && state.chipMap.has(key)) {
    state.chips[type] = state.chips[type].filter(item => item.name !== chip.name);
  }
  state.chips[type].push(chip);
  state.chipMap.set(key, chip);
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`${url} を画像として読めません`));
    image.src = url;
  });
}

async function loadImageFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let mime = file.type;
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) mime = "image/bmp";
  else if (bytes[0] === 0x89 && bytes[1] === 0x50) mime = "image/png";
  else if (!mime.startsWith("image/")) mime = "application/octet-stream";
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  try {
    return await loadImage(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error("チップ画像を保存できません"));
    }, "image/png");
  });
}

async function persistChip(type, chip, blob) {
  if (!state.storageAvailable) return;
  await saveMaterial({
    key: `${type}:${chip.name.toLowerCase()}`,
    type,
    name: chip.name,
    width: chip.width,
    height: chip.height,
    blob,
    savedAt: Date.now(),
  });
}

async function restoreMaterials() {
  const materials = await listMaterials();
  for (const record of materials) {
    const image = await loadImageFile(record.blob);
    registerChip(record.type, {
      name: record.name,
      type: record.type === "field" ? 0 : 1,
      width: record.width,
      height: record.height,
      image,
    }, true);
  }
  return materials.length;
}

function renderPalette() {
  ui.palette.textContent = "";
  for (const chip of state.chips[state.paletteType]) {
    const button = document.createElement("button");
    button.className = "chip-button";
    button.title = `${chip.name} (${chip.width}×${chip.height})`;
    button.classList.toggle("selected", state.selectedChip === chip);
    const preview = document.createElement("canvas");
    preview.width = chip.image.width;
    preview.height = chip.image.height;
    const previewCtx = preview.getContext("2d");
    previewCtx.imageSmoothingEnabled = false;
    previewCtx.drawImage(chip.image, 0, 0);
    button.append(preview);
    button.addEventListener("click", () => {
      selectChip(chip);
      renderPalette();
      if (window.matchMedia("(max-width: 1100px)").matches) uiController.closePanels();
    });
    ui.palette.append(button);
  }
}

function selectChip(chip) {
  state.selectedChip = chip ?? null;
  ui.selected_chip_name.textContent = chip?.name ?? "なし";
}

function setTool(tool) {
  state.tool = tool;
  if (tool !== "paste") state.pastePreview = null;
  uiController.presentTool(tool);
}

function pointerDown(event) {
  if (event.button !== 0 && event.button !== 1 && event.button !== 2) return;
  canvas.setPointerCapture(event.pointerId);
  const cell = eventCell(event);
  if (event.button === 1 || state.tool === "pan" || state.spacePressed) {
    state.pointerDown = true;
    state.panStart = {
      x: event.clientX,
      y: event.clientY,
      left: ui.canvas_scroller.scrollLeft,
      top: ui.canvas_scroller.scrollTop,
    };
    canvas.classList.add("is-panning");
    return;
  }
  if (state.tool === "select" && event.button === 0) {
    state.pointerDown = true;
    state.selectionStart = cell;
    state.selection = { x: cell.x, y: cell.y, width: 1, height: 1 };
    updateSelectionSummary();
    render();
    return;
  }
  if (state.tool === "paste" && event.button === 0) {
    if (!state.clipboard) {
      setStatus("コピー内容がありません", true);
      return;
    }
    state.pointerDown = true;
    state.pasteDragging = true;
    state.pastePreview = clampPastePosition(
      cell,
      state.document.width,
      state.document.height,
      state.clipboard
    );
    render();
    return;
  }
  if (state.tool === "eyedropper" && event.button === 0) {
    pickUnit(cell.x, cell.y);
    return;
  }
  state.pointerDown = true;
  state.strokeChanged = false;
  state.lastCell = null;
  state.document.checkpoint();
  applyPointer(event, event.button === 2);
}

function pointerMove(event) {
  const cell = eventCell(event);
  const coordinate = eventCoordinate(event);
  ui.cursor_x.textContent = coordinate.x;
  ui.cursor_y.textContent = coordinate.y;
  if (state.panStart) {
    ui.canvas_scroller.scrollLeft =
      state.panStart.left - (event.clientX - state.panStart.x);
    ui.canvas_scroller.scrollTop =
      state.panStart.top - (event.clientY - state.panStart.y);
    return;
  }
  if (state.tool === "paste" && state.clipboard) {
    state.pastePreview = clampPastePosition(
      cell,
      state.document.width,
      state.document.height,
      state.clipboard
    );
    if (state.pasteDragging || !state.pointerDown) render();
  }
  if (state.pointerDown && state.tool === "select" && state.selectionStart) {
    state.selection = rectFromPoints(
      state.selectionStart,
      cell,
      state.document.width,
      state.document.height
    );
    updateSelectionSummary();
    render();
    return;
  }
  if (state.pointerDown) applyPointer(event, (event.buttons & 2) !== 0);
}

function pointerUp(event) {
  if (!state.pointerDown) return;
  if (state.panStart) {
    state.pointerDown = false;
    state.panStart = null;
    if (!state.spacePressed) canvas.classList.remove("is-panning");
    return;
  }
  if (state.tool === "paste" && state.pasteDragging) {
    state.pointerDown = false;
    state.pasteDragging = false;
    if (state.pastePreview) pasteClipboard(state.pastePreview.x, state.pastePreview.y);
    return;
  }
  state.pointerDown = false;
  state.lastCell = null;
  if (state.tool === "select") {
    state.selectionStart = null;
    render();
    return;
  }
  if (!state.strokeChanged) state.document.undoStack.pop();
  render();
}

function applyPointer(event, forceErase) {
  const cell = eventCell(event);
  const key = `${cell.x},${cell.y}`;
  if (state.lastCell === key && state.tool !== "fill") return;
  state.lastCell = key;
  if (!state.document.inBounds(cell.x, cell.y)) return;

  let changed = false;
  if (forceErase || state.tool === "eraser") {
    changed = applyBrush(cell.x, cell.y, (x, y) =>
      state.document.erase(x, y, { protectUnits: state.protectUnits })
    );
  } else if (state.tool === "pen" && state.selectedChip) {
    changed = applyBrush(cell.x, cell.y, (x, y) =>
      state.document.place(state.selectedChip, x, y, null, {
        allowObjectOverlap: state.allowObjectOverlap,
      })
    );
  } else if (state.tool === "fill" && state.selectedChip?.type === 0) {
    changed = state.objectBoundaryFill
      ? state.document.floodFillWithinObjects(state.selectedChip, cell.x, cell.y)
      : state.document.floodFill(state.selectedChip, cell.x, cell.y);
    state.pointerDown = false;
  } else if (state.tool === "unit") {
    const name = ui.unit_name.value.trim();
    if (name) {
      const direction = Number(ui.unit_direction.selectedIndex);
      const form = Number(ui.unit_form.value);
      const type = name === "##" ? 3 : name === "@ESC@" ? 2 : ((form << 4) | (direction + 2));
      const dimensions = unitDimensions(name);
      changed = state.document.place({ name, type, ...dimensions }, cell.x, cell.y, type);
    }
  }
  state.strokeChanged ||= changed;
  if (changed) render();
}

function applyBrush(centerX, centerY, operation) {
  const size = state.tool === "unit" ? 1 : state.brushSize;
  const startX = centerX - Math.floor((size - 1) / 2);
  const startY = centerY - Math.floor((size - 1) / 2);
  let changed = false;
  for (let y = startY; y < startY + size; y++) {
    for (let x = startX; x < startX + size; x++) {
      if (state.document.inBounds(x, y)) changed = operation(x, y) || changed;
    }
  }
  return changed;
}

function eventCell(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.floor((event.clientX - rect.left) / state.cellSize),
    y: Math.floor((event.clientY - rect.top) / state.cellSize),
  };
}

function eventCoordinate(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.round((event.clientX - rect.left) * CELL_SOURCE / state.cellSize)),
    y: Math.max(0, Math.round((event.clientY - rect.top) * CELL_SOURCE / state.cellSize)),
  };
}

function render() {
  const { document: map, cellSize } = state;
  canvas.width = map.width * cellSize;
  canvas.height = map.height * cellSize;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#f7f4ec";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const ordered = [...map.placements].sort((a, b) => {
    const layerA = a.type === 0 ? 0 : a.type === 1 ? 1 : 2;
    const layerB = b.type === 0 ? 0 : b.type === 1 ? 1 : 2;
    return layerA - layerB || a.zIndex - b.zIndex || a.y - b.y;
  });

  for (const placement of ordered) {
    if (placement.type === 0) drawChip(placement);
  }
  if (state.showObjects && !state.temporaryHideObjects) {
    for (const placement of ordered) if (placement.type === 1) drawChip(placement);
  }
  if (state.showGrid) drawGrid();
  if (state.showUnits && !state.temporaryHideUnits) {
    for (const placement of ordered) if (placement.type >= 2) drawUnit(placement);
  }
  drawSelection();
  drawPastePreview();

  ui.map_width.value = map.width;
  ui.map_height.value = map.height;
  ui.document_name.textContent = state.filename;
  ui.document_meta.textContent = `${map.width} × ${map.height} / ${map.placements.length} items`;
  ui.empty_hint.classList.toggle("hidden", map.placements.length > 0);
}

function drawChip(placement) {
  const chip = state.chipMap.get(`${placement.type}:${placement.name}`) ??
    findFallbackChip(placement.type, placement.name);
  if (!chip) {
    drawMissing(placement);
    return;
  }
  const rect = placementRect({ ...placement, width: chip.width, height: chip.height });
  const x = rect.x * state.cellSize;
  const y = rect.y * state.cellSize;
  ctx.drawImage(
    chip.image,
    x, y,
    chip.width * state.cellSize,
    chip.height * state.cellSize
  );
}

function drawSelection() {
  if (!state.selection) return;
  const { x, y, width, height } = state.selection;
  const size = state.cellSize;
  ctx.save();
  ctx.fillStyle = "rgb(65 155 255 / 15%)";
  ctx.strokeStyle = "#54a8ff";
  ctx.lineWidth = 2;
  ctx.setLineDash([Math.max(4, size * 0.2), Math.max(3, size * 0.12)]);
  ctx.fillRect(x * size, y * size, width * size, height * size);
  ctx.strokeRect(x * size + 1, y * size + 1, width * size - 2, height * size - 2);
  ctx.restore();
}

function drawPastePreview() {
  if (state.tool !== "paste" || !state.clipboard || !state.pastePreview) return;
  ctx.save();
  ctx.globalAlpha = 0.58;
  for (const source of state.clipboard.items) {
    const placement = {
      ...source,
      x: state.pastePreview.x + source.x,
      y: state.pastePreview.y + source.y,
    };
    if (placement.type <= 1) drawChip(placement);
    else drawUnit(placement);
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "#69d5ff";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(
    state.pastePreview.x * state.cellSize + 1,
    state.pastePreview.y * state.cellSize + 1,
    state.clipboard.width * state.cellSize - 2,
    state.clipboard.height * state.cellSize - 2
  );
  ctx.restore();
}

function findFallbackChip(type, name) {
  const base = name.replace(/\d+.*$/, "");
  return state.chipMap.get(`${type}:${base}`);
}

function drawMissing(placement) {
  const size = state.cellSize;
  ctx.fillStyle = "#d65e6b";
  ctx.fillRect(placement.x * size + 2, placement.y * size + 2, size - 4, size - 4);
  ctx.fillStyle = "white";
  ctx.font = `bold ${Math.max(9, size * .34)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("?", (placement.x + .5) * size, (placement.y + .5) * size);
}

function drawGrid() {
  const size = state.cellSize;
  ctx.beginPath();
  ctx.strokeStyle = size <= 20 ? "rgb(22 28 34 / 18%)" : "rgb(22 28 34 / 28%)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= state.document.width; x++) {
    ctx.moveTo(x * size + .5, 0);
    ctx.lineTo(x * size + .5, canvas.height);
  }
  for (let y = 0; y <= state.document.height; y++) {
    ctx.moveTo(0, y * size + .5);
    ctx.lineTo(canvas.width, y * size + .5);
  }
  ctx.stroke();
}

function drawUnit(placement) {
  const size = state.cellSize;
  const x = placement.x * size;
  const y = placement.y * size;
  if (placement.name === "##") {
    ctx.fillStyle = "rgb(210 56 59 / 25%)";
    ctx.fillRect(x, y, size * 3, size * 3);
    ctx.strokeStyle = "rgb(220 50 55 / 95%)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, size * 3 - 2, size * 3 - 2);
    return;
  }
  if (placement.name === "@ESC@") {
    ctx.fillStyle = "rgb(55 185 220 / 25%)";
    ctx.fillRect(x, y, size * 3, size * 2);
    ctx.strokeStyle = "#d8fbff";
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, size * 3 - 2, size * 2 - 2);
    return;
  }

  const directionIndex = (placement.type & 0x0f) - 2;
  const formIndex = (placement.type & 0xff) >> 4;
  const directions = ["N", "NW", "W", "SW", "S", "SE", "E", "NE"];
  const defenseForms = ["自動横列", "方向横列", "自動密集", "方向密集"];
  const unitForms = ["方陣", "横列", "縦列", "密集"];
  const isDefense = placement.name.startsWith("@");
  const formName = (isDefense ? defenseForms : unitForms)[formIndex] ?? "";
  const label = `${directions[directionIndex] ?? ""} ${formName} ${placement.name}`.trim();
  ctx.font = `700 ${Math.max(9, Math.min(13, size * .38))}px ui-monospace, monospace`;
  const width = Math.min(size * 4, Math.max(size, ctx.measureText(label).width + 10));
  ctx.fillStyle = "rgb(16 20 26 / 82%)";
  ctx.fillRect(x + 2, y + 3, width, Math.max(18, size * .62));
  ctx.strokeStyle = "#f0b35d";
  ctx.strokeRect(x + 2.5, y + 3.5, width - 1, Math.max(17, size * .62 - 1));
  ctx.fillStyle = "#ffd99f";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + 7, y + 3 + Math.max(18, size * .62) / 2);
}

function saveMap() {
  const filename = state.filename.toLowerCase().endsWith(".map") ? state.filename : `${state.filename}.map`;
  downloadBytes(serializeMap(state.document), filename);
  setStatus(`${filename} を保存しました`);
}

function saveClipboard() {
  if (!state.clipboard) {
    setStatus("先に範囲をコピーしてください", true);
    return;
  }
  downloadBytes(serializeMap({
    width: state.clipboard.width,
    height: state.clipboard.height,
    placements: state.clipboard.items,
  }), "map-parts.map");
  setStatus("コピー内容を map-parts.map として保存しました");
}

async function loadClipboard(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const data = parseMap(await file.arrayBuffer());
    hydratePlacements(data.placements);
    state.clipboard = {
      width: data.width,
      height: data.height,
      items: data.placements.map(({ id, ...item }) => item),
    };
    state.selection = null;
    state.pastePreview = { x: 0, y: 0 };
    updateSelectionSummary();
    setTool("paste");
    render();
    setStatus(`${file.name} をコピー素材として読み込みました`);
  } catch (error) {
    setStatus(`素材読込エラー: ${error.message}`, true);
  } finally {
    event.target.value = "";
  }
}

async function openMapFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    state.document.load(parseMap(await file.arrayBuffer()));
    hydratePlacements(state.document.placements);
    state.filename = file.name;
    state.selection = null;
    render();
    setStatus(`${file.name} を開きました`);
  } catch (error) {
    setStatus(`読込エラー: ${error.message}`, true);
  } finally {
    event.target.value = "";
  }
}

function createMap(event) {
  event.preventDefault();
  const width = clampSize(ui.new_width.value);
  const height = clampSize(ui.new_height.value);
  state.document = new MapDocument(width, height);
  state.filename = "untitled.map";
  state.selection = null;
  state.clipboard = null;
  ui.new_dialog.close();
  render();
  setStatus(`${width} × ${height} のマップを作成しました`);
}

function resizeMap() {
  const width = clampSize(ui.map_width.value);
  const height = clampSize(ui.map_height.value);
  state.document.resize(width, height);
  render();
  setStatus(`マップを ${width} × ${height} に変更しました`);
}

function expandMap() {
  const top = clampDelta(ui.expand_top.value);
  const left = clampDelta(ui.expand_left.value);
  const bottom = clampDelta(ui.expand_bottom.value);
  const right = clampDelta(ui.expand_right.value);
  if (!state.document.expand(top, left, bottom, right)) {
    setStatus("増減後のサイズは10～255マスにしてください", true);
    return;
  }
  for (const input of [ui.expand_top, ui.expand_left, ui.expand_bottom, ui.expand_right]) {
    input.value = "0";
  }
  state.selection = null;
  render();
  setStatus(`マップを ${state.document.width} × ${state.document.height} に変更しました`);
}

function clampDelta(value) {
  return Math.max(-255, Math.min(255, Number(value) || 0));
}

function clampSize(value) {
  return Math.max(10, Math.min(255, Number(value) || 60));
}

function undo() {
  if (state.document.undo()) {
    render();
    setStatus("元に戻しました");
  }
}

function redo() {
  if (state.document.redo()) {
    render();
    setStatus("やり直しました");
  }
}

async function importChips(event) {
  const files = [...(event.target.files ?? [])];
  for (const file of files) {
    const image = await loadImageFile(file);
    const name = file.name.replace(/\.[^.]+$/, "");
    const chip = {
      name,
      type: state.paletteType === "field" ? 0 : 1,
      width: Math.max(1, image.naturalWidth / CELL_SOURCE),
      height: Math.max(1, image.naturalHeight / CELL_SOURCE),
      image,
    };
    registerChip(state.paletteType, chip, true);
    await persistChip(state.paletteType, chip, file);
  }
  state.chips[state.paletteType].sort((a, b) => a.name.localeCompare(b.name));
  renderPalette();
  await updateStoredMaterialCounts();
  setStatus(`${files.length} 個のPNGチップを追加しました`);
  event.target.value = "";
}

async function importPaletteFolder(event) {
  const files = [...(event.target.files ?? [])];
  if (!files.length) return;
  const type = state.paletteType;

  try {
    const group = classifyFolderAsType(files, type);
    const { count, warnings } = await loadMaterialGroupWithApp(type, group);
    renderPalette();
    hydratePlacements(state.document.placements);
    render();
    await updateStoredMaterialCounts();
    const suffix = warnings.length ? `（${warnings.join("、")}）` : "";
    const label = type === "field" ? "フィールド" : "オブジェクト";
    setStatus(`${label}フォルダから ${count} 個の素材を読み込みました${suffix}`);
  } catch (error) {
    setStatus(`素材読込エラー: ${error.message}`, true);
  } finally {
    event.target.value = "";
  }
}

async function importMaterialSet(event) {
  const files = [...(event.target.files ?? [])];
  if (!files.length) return;
  const materials = classifyMaterialFiles(files);
  const totals = { field: 0, object: 0 };
  const warnings = [];

  try {
    for (const type of ["field", "object"]) {
      const result = await loadMaterialGroupWithApp(type, materials[type]);
      totals[type] = result.count;
      warnings.push(...result.warnings);
    }
    renderPalette();
    hydratePlacements(state.document.placements);
    render();
    await updateStoredMaterialCounts();
    const suffix = warnings.length ? `（${warnings.join("、")}）` : "";
    setStatus(`素材セットを読み込みました: フィールド ${totals.field}、オブジェクト ${totals.object}${suffix}`);
  } catch (error) {
    setStatus(`素材読込エラー: ${error.message}`, true);
  } finally {
    event.target.value = "";
  }
}

async function loadMaterialGroupWithApp(type, group) {
  const result = await loadMaterialGroup({
    type,
    group,
    cellSource: CELL_SOURCE,
    loadSheetFiles,
    loadImageFile,
    registerChip,
    persistChip,
  });
  state.chips[type].sort((a, b) => a.name.localeCompare(b.name));
  return result;
}

function updatePaletteImportLabel() {
  ui.palette_folder_label.textContent = paletteFolderLabel(state.paletteType);
}

async function openMaterialManager() {
  ui.material_dialog.showModal();
  await updateStoredMaterialCounts();
}

async function updateStoredMaterialCounts() {
  if (!state.storageAvailable) {
    ui.material_summary.textContent = "ブラウザ内保存を利用できません";
    ui.stored_material_counts.textContent = "ブラウザ内保存を利用できません。";
    return;
  }
  const materials = await listMaterials();
  const fieldCount = materials.filter(material => material.type === "field").length;
  const objectCount = materials.filter(material => material.type === "object").length;
  const total = fieldCount + objectCount;
  ui.material_summary.textContent = total
    ? `保存済み: フィールド ${fieldCount} / オブジェクト ${objectCount}`
    : "標準素材を使用中";
  ui.stored_material_counts.textContent =
    `フィールド ${fieldCount} 個 / オブジェクト ${objectCount} 個`;
}

function hydratePlacements(placements) {
  for (const placement of placements) {
    if (placement.type <= 1) {
      const chip = state.chipMap.get(`${placement.type}:${placement.name}`) ??
        findFallbackChip(placement.type, placement.name);
      placement.width = chip?.width ?? 1;
      placement.height = chip?.height ?? 1;
    } else {
      Object.assign(placement, unitDimensions(placement.name));
    }
  }
}

function pickUnit(x, y) {
  const unit = [...state.document.itemsCovering(x, y)]
    .reverse()
    .find(item => item.type >= 2);
  if (!unit) {
    setStatus("この位置に配置記号はありません", true);
    return;
  }
  const direction = Math.max(0, Math.min(7, (unit.type & 0x0f) - 2));
  const form = Math.max(0, Math.min(3, (unit.type & 0xff) >> 4));
  ui.unit_name.value = unit.name;
  ui.unit_direction.selectedIndex = direction;
  ui.unit_form.value = String(form);
  setTool("unit");
  setStatus(`${unit.name} / ${ui.unit_direction.value} / ${ui.unit_form.selectedOptions[0].text} を取得しました`);
}

function copySelection() {
  if (!state.selection) {
    setStatus("先に選択ツールで範囲を指定してください", true);
    return;
  }
  const { x, y, width, height } = state.selection;
  const items = state.document.placements
    .filter(item => item.x >= x && item.y >= y && item.x < x + width && item.y < y + height)
    .map(item => {
      const { id, ...copy } = item;
      return { ...copy, x: item.x - x, y: item.y - y };
    });
  state.clipboard = { width, height, items };
  updateSelectionSummary();
  setTool("paste");
  setStatus(`${width} × ${height}、${items.length}項目をコピーしました`);
}

function pasteClipboard(x, y) {
  if (!state.clipboard) {
    setStatus("コピー内容がありません", true);
    setTool("select");
    return;
  }
  state.document.checkpoint();
  const changed = state.document.paste(state.clipboard.items, x, y, {
    protectUnits: state.protectUnits,
  });
  if (!changed) {
    state.document.undoStack.pop();
    return;
  }
  state.selection = {
    x,
    y,
    width: Math.min(state.clipboard.width, state.document.width - x),
    height: Math.min(state.clipboard.height, state.document.height - y),
  };
  render();
  updateSelectionSummary();
  setStatus(`${state.clipboard.items.length}項目を貼り付けました`);
}

function transformClipboard(kind) {
  if (!state.clipboard) {
    setStatus("先に範囲をコピーしてください", true);
    return;
  }
  state.clipboard = transformClipboardData(state.clipboard, kind);
  updateSelectionSummary();
  setTool("paste");
  setStatus(`コピー内容を${{
    left: "左へ90度回転",
    right: "右へ90度回転",
    horizontal: "左右反転",
    vertical: "上下反転",
  }[kind]}しました`);
}

function updateSelectionSummary() {
  ui.selection_summary.textContent = selectionSummary(
    state.selection,
    state.clipboard,
    state.document.placements
  );
}

async function autoBackup(force = false) {
  return backupManager.autoSave(force);
}

async function updateBackupStatus() {
  return backupManager.updateStatus();
}

function showRestoreDialog(draft) {
  pendingDraft = draft;
  ui.restore_message.textContent =
    `${draft.filename}（${draft.width} × ${draft.height}）\n` +
    `${formatDate(draft.savedAt)} に自動保存された作業を復元できます。`;
  ui.restore_dialog.showModal();
}

function restoreDraft(event) {
  event.preventDefault();
  if (!pendingDraft) return;
  const buffer = storedBytesToBuffer(pendingDraft.bytes);
  state.document.load(parseMap(buffer));
  hydratePlacements(state.document.placements);
  state.filename = pendingDraft.filename;
  state.selection = null;
  state.clipboard = null;
  backupManager.markCurrent();
  ui.restore_dialog.close();
  pendingDraft = null;
  render();
  updateBackupStatus();
  setStatus("前回の自動保存を復元しました");
}

async function discardDraft(event) {
  event.preventDefault();
  await clearDraft();
  pendingDraft = null;
  ui.restore_dialog.close();
  backupManager.markCurrent();
  updateBackupStatus();
  setStatus("前回の自動保存を破棄しました");
}

async function clearBackupHistory() {
  if (!window.confirm("自動バックアップ履歴をすべて削除しますか？")) return;
  await backupManager.clearHistory();
  setStatus("自動バックアップ履歴を削除しました");
}

async function clearStoredMaterials(type = null) {
  const label = type === "field"
    ? "フィールド素材"
    : type === "object"
      ? "オブジェクト素材"
      : "追加素材";
  if (!window.confirm(`永続保存した${label}${type ? "を" : "をすべて"}削除しますか？`)) return;
  if (type) await clearMaterialsByType(type);
  else await clearMaterials();
  ui.material_dialog.close();
  setStatus("追加素材を削除しました。標準素材へ戻すため再読み込みします");
  window.setTimeout(() => window.location.reload(), 300);
}

function setStatus(message, error = false) {
  ui.status.textContent = message;
  ui.status.style.color = error ? "var(--danger)" : "";
}
