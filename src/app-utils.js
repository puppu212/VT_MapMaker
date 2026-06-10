export const TOOL_PRESENTATION = {
  pen: {
    label: "ペン",
    status: "ペン: 選択チップを配置します",
  },
  eraser: {
    label: "消去",
    status: "消去: 上のレイヤーから削除します",
  },
  fill: {
    label: "塗り",
    status: "塗り: 同じ地形をまとめて置換します",
  },
  unit: {
    label: "配置",
    status: "配置: ユニット名や特殊記号を配置します",
  },
  select: {
    label: "選択",
    status: "選択: コピーする範囲をドラッグします",
  },
  paste: {
    label: "貼付",
    status: "貼付: コピー内容をドラッグして離した位置へ配置します",
  },
  eyedropper: {
    label: "取得",
    status: "取得: 配置記号をクリックして設定を読み取ります",
  },
  pan: {
    label: "移動",
    status: "移動: マップをドラッグしてスクロールします",
  },
};

export function paletteFolderLabel(type) {
  return type === "field"
    ? "フィールドフォルダを読み込む"
    : "オブジェクトフォルダを読み込む";
}

export function unitDimensions(name) {
  if (name === "##") return { width: 3, height: 3 };
  if (name === "@ESC@") return { width: 3, height: 2 };
  return { width: 4, height: 1 };
}

export function rectFromPoints(start, end, mapWidth, mapHeight) {
  const left = Math.max(0, Math.min(start.x, end.x));
  const top = Math.max(0, Math.min(start.y, end.y));
  const right = Math.min(mapWidth - 1, Math.max(start.x, end.x));
  const bottom = Math.min(mapHeight - 1, Math.max(start.y, end.y));
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

export function clampPastePosition(cell, mapWidth, mapHeight, clipboard) {
  return {
    x: Math.max(0, Math.min(Math.max(0, mapWidth - clipboard.width), cell.x)),
    y: Math.max(0, Math.min(Math.max(0, mapHeight - clipboard.height), cell.y)),
  };
}

export function selectionSummary(selection, clipboard, placements) {
  if (!selection) {
    return clipboard
      ? `コピー: ${clipboard.width} × ${clipboard.height} / ${clipboard.items.length}項目`
      : "範囲未選択";
  }
  const selectedCount = placements.filter(item =>
    item.x >= selection.x && item.y >= selection.y &&
    item.x < selection.x + selection.width &&
    item.y < selection.y + selection.height
  ).length;
  const clipboardText = clipboard
    ? ` / コピー ${clipboard.width}×${clipboard.height}`
    : "";
  return `選択 ${selection.width} × ${selection.height} / ${selectedCount}項目${clipboardText}`;
}

export function transformClipboardData(source, kind) {
  let width = source.width;
  let height = source.height;
  const items = source.items.map(item => {
    let x = item.x;
    let y = item.y;
    if (kind === "left") {
      x = item.y;
      y = source.width - item.x - 1;
    } else if (kind === "right") {
      x = source.height - item.y - 1;
      y = item.x;
    } else if (kind === "horizontal") {
      x = source.width - item.x - 1;
    } else if (kind === "vertical") {
      y = source.height - item.y - 1;
    }
    return { ...item, x, y };
  });
  if (kind === "left" || kind === "right") {
    width = source.height;
    height = source.width;
  }
  return { width, height, items };
}

export function fingerprintBytes(filename, bytes) {
  let hash = 2166136261;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 16777619);
  }
  return `${filename}:${bytes.length}:${hash >>> 0}`;
}

export function storedBytesToBuffer(bytes) {
  if (bytes instanceof ArrayBuffer) return bytes;
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

export function formatDate(timestamp) {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(timestamp));
}
