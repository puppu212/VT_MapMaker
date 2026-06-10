export class MapDocument {
  constructor(width = 60, height = 60) {
    this.width = width;
    this.height = height;
    this.placements = [];
    this.undoStack = [];
    this.redoStack = [];
    this.nextZ = 0;
  }

  load(data) {
    this.width = data.width;
    this.height = data.height;
    this.placements = data.placements.map((item, index) => ({ ...item, zIndex: index }));
    this.nextZ = this.placements.length;
    this.undoStack = [];
    this.redoStack = [];
  }

  checkpoint() {
    this.undoStack.push(this.snapshot());
    if (this.undoStack.length > 80) this.undoStack.shift();
    this.redoStack = [];
  }

  snapshot() {
    return {
      width: this.width,
      height: this.height,
      placements: this.placements.map(item => ({ ...item })),
      nextZ: this.nextZ,
    };
  }

  restore(snapshot) {
    this.width = snapshot.width;
    this.height = snapshot.height;
    this.placements = snapshot.placements.map(item => ({ ...item }));
    this.nextZ = snapshot.nextZ;
  }

  undo() {
    if (!this.undoStack.length) return false;
    this.redoStack.push(this.snapshot());
    this.restore(this.undoStack.pop());
    return true;
  }

  redo() {
    if (!this.redoStack.length) return false;
    this.undoStack.push(this.snapshot());
    this.restore(this.redoStack.pop());
    return true;
  }

  resize(width, height) {
    this.checkpoint();
    this.width = width;
    this.height = height;
    this.placements = this.placements.filter(item =>
      item.x >= 0 && item.y >= 0 && item.x < width && item.y < height
    );
  }

  expand(top, left, bottom, right) {
    const width = this.width + left + right;
    const height = this.height + top + bottom;
    if (width < 10 || width > 255 || height < 10 || height > 255) return false;
    this.checkpoint();
    this.width = width;
    this.height = height;
    this.placements = this.placements
      .map(item => ({ ...item, x: item.x + left, y: item.y + top }))
      .filter(item => item.x >= 0 && item.y >= 0 && item.x < width && item.y < height);
    return true;
  }

  itemsAt(x, y) {
    return this.placements
      .filter(item => item.x === x && item.y === y)
      .sort((a, b) => a.zIndex - b.zIndex);
  }

  itemsCovering(x, y) {
    return this.placements
      .filter(item => rectContains(placementRect(item), x, y))
      .sort((a, b) => a.zIndex - b.zIndex);
  }

  place(chip, x, y, typeOverride = null, options = {}) {
    if (!this.inBounds(x, y)) return false;
    const type = typeOverride ?? chip.type;
    const candidate = {
      name: chip.name,
      x,
      y,
      type,
      width: chip.width ?? 1,
      height: chip.height ?? 1,
    };
    if (type === 0) {
      this.placements = this.placements.filter(item => !(item.x === x && item.y === y && item.type === 0));
    } else if (type >= 2) {
      this.placements = this.placements.filter(item => !(item.x === x && item.y === y && item.type >= 2));
    } else {
      const overlaps = this.placements.filter(item =>
        item.type === 1 && rectsIntersect(placementRect(item), placementRect(candidate))
      );
      if (overlaps.length && !options.allowObjectOverlap) return false;
      if (overlaps.some(item => {
        if (item.name !== chip.name) return false;
        const spacing = Math.round(Math.min(candidate.width, candidate.height) * 0.5);
        return Math.hypot(item.x - x, item.y - y) < spacing;
      })) return false;
    }
    this.placements.push({
      id: crypto.randomUUID(),
      name: chip.name,
      x,
      y,
      type,
      width: candidate.width,
      height: candidate.height,
      zIndex: this.nextZ++,
    });
    return true;
  }

  erase(x, y, options = {}) {
    const items = this.itemsCovering(x, y);
    if (!items.length) return false;
    let target;
    if (options.preferField) {
      target = [...items].reverse().find(item => item.type === 0);
    } else {
      target = [...items].reverse().find(item => item.type === 1);
      const unit = [...items].reverse().find(item => item.type >= 2);
      if (!target && unit && options.protectUnits) return false;
      target ??= unit;
      target ??= [...items].reverse().find(item => item.type === 0);
    }
    if (!target) return false;
    this.removeById(target.id);
    return true;
  }

  removeById(id) {
    const length = this.placements.length;
    this.placements = this.placements.filter(item => item.id !== id);
    return this.placements.length !== length;
  }

  paste(items, destX, destY, options = {}) {
    let changed = false;
    for (const source of items) {
      const x = destX + source.x;
      const y = destY + source.y;
      if (!this.inBounds(x, y)) continue;

      if (source.type === 0) {
        this.placements = this.placements.filter(item =>
          !(item.x === x && item.y === y && item.type === 0)
        );
      } else if (source.type === 1) {
        this.placements = this.placements.filter(item =>
          !(item.x === x && item.y === y && item.type === 1)
        );
      } else if (!options.protectUnits) {
        this.placements = this.placements.filter(item =>
          !(item.x === x && item.y === y && item.type >= 2)
        );
      }

      this.placements.push({
        ...source,
        id: crypto.randomUUID(),
        x,
        y,
        zIndex: this.nextZ++,
      });
      changed = true;
    }
    return changed;
  }

  floodFill(chip, startX, startY) {
    if (!this.inBounds(startX, startY) || chip.type !== 0) return false;
    const start = this.itemsAt(startX, startY).find(item => item.type === 0);
    const targetName = start?.name ?? null;
    if (targetName === chip.name) return false;

    const byCell = new Map();
    for (const item of this.placements) {
      if (item.type === 0) byCell.set(`${item.x},${item.y}`, item);
    }

    const queue = [[startX, startY]];
    const visited = new Set();
    let changed = false;
    while (queue.length) {
      const [x, y] = queue.shift();
      const key = `${x},${y}`;
      if (visited.has(key) || !this.inBounds(x, y)) continue;
      visited.add(key);
      const current = byCell.get(key);
      if ((current?.name ?? null) !== targetName) continue;
      this.place(chip, x, y);
      changed = true;
      queue.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]);
    }
    return changed;
  }

  floodFillWithinObjects(chip, startX, startY) {
    if (!this.inBounds(startX, startY) || chip.type !== 0) return false;
    const blocked = new Set();
    for (const item of this.placements) {
      if (item.type !== 1) continue;
      const rect = placementRect(item);
      for (let y = rect.y; y < rect.y + rect.height; y++) {
        for (let x = rect.x; x < rect.x + rect.width; x++) {
          if (this.inBounds(x, y)) blocked.add(`${x},${y}`);
        }
      }
    }
    if (blocked.has(`${startX},${startY}`)) return false;

    const queue = [[startX, startY]];
    const visited = new Set();
    let changed = false;
    while (queue.length) {
      const [x, y] = queue.shift();
      const key = `${x},${y}`;
      if (visited.has(key) || blocked.has(key) || !this.inBounds(x, y)) continue;
      visited.add(key);
      this.place(chip, x, y);
      changed = true;
      queue.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]);
    }
    return changed;
  }

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }
}

export function placementRect(item) {
  const width = item.width ?? 1;
  const height = item.height ?? 1;
  if (item.type === 1) {
    return {
      x: item.x - Math.floor(width / 2),
      y: item.y + 1 - height,
      width,
      height,
    };
  }
  return { x: item.x, y: item.y, width, height };
}

function rectContains(rect, x, y) {
  return x >= rect.x && y >= rect.y &&
    x < rect.x + rect.width && y < rect.y + rect.height;
}

function rectsIntersect(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x &&
    a.y < b.y + b.height && a.y + a.height > b.y;
}
