const CELL_END = 0xff;
const NAME_END = 0xfe;

export function parseMap(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 2) throw new Error("ファイルが短すぎます");

  const width = bytes[0];
  const height = bytes[1];
  if (width < 1 || height < 1) throw new Error("マップサイズが不正です");

  const placements = [];
  let index = 2;
  let x = 0;
  let y = 0;

  while (y < height && index < bytes.length) {
    const type = bytes[index++];
    if (type === CELL_END) {
      x += 1;
      if (x >= width) {
        x = 0;
        y += 1;
      }
      continue;
    }

    const nameBytes = [];
    while (index < bytes.length && bytes[index] !== NAME_END && bytes[index] !== CELL_END) {
      nameBytes.push(bytes[index++]);
    }
    if (index >= bytes.length) throw new Error("チップ名が途中で終わっています");
    if (bytes[index] === CELL_END) {
      throw new Error(`セル (${x}, ${y}) のチップ名終端がありません`);
    }
    index += 1;

    placements.push({
      id: crypto.randomUUID(),
      name: decodeName(nameBytes),
      x,
      y,
      type,
      zIndex: placements.length,
    });
  }

  if (y !== height) throw new Error("マップデータが途中で終わっています");
  return { width, height, placements };
}

export function serializeMap(document) {
  const cells = Array.from({ length: document.width * document.height }, () => []);
  for (const placement of document.placements) {
    if (placement.x < 0 || placement.y < 0 ||
        placement.x >= document.width || placement.y >= document.height) continue;
    cells[placement.y * document.width + placement.x].push(placement);
  }

  const output = [document.width & 0xff, document.height & 0xff];
  for (const cell of cells) {
    cell.sort((a, b) => a.zIndex - b.zIndex);
    for (const placement of cell) {
      output.push(placement.type & 0xff);
      for (const char of placement.name) output.push(char.charCodeAt(0) & 0xff);
      output.push(NAME_END);
    }
    output.push(CELL_END);
  }
  return new Uint8Array(output);
}

export function parseChipData(buffer) {
  const view = new DataView(buffer);
  if (view.byteLength < 12) throw new Error("チップ定義が短すぎます");
  let offset = 0;
  const sheetWidth = view.getUint32(offset, true); offset += 4;
  const sheetHeight = view.getUint32(offset, true); offset += 4;
  const transparentColor = view.getUint32(offset, true); offset += 4;
  const entries = [];

  while (offset < view.byteLength) {
    const nameBytes = [];
    while (offset < view.byteLength) {
      const value = view.getUint8(offset++);
      if (value === 0) break;
      nameBytes.push(value);
    }
    const name = decodeName(nameBytes);
    if (!name || name === "________") break;
    if (offset + 16 > view.byteLength) break;
    const left = view.getInt32(offset, true); offset += 4;
    const top = view.getInt32(offset, true); offset += 4;
    const right = view.getInt32(offset, true); offset += 4;
    const bottom = view.getInt32(offset, true); offset += 4;
    entries.push({ name, left, top, width: right - left, height: bottom - top });
  }

  return { sheetWidth, sheetHeight, transparentColor, entries };
}

function decodeName(bytes) {
  const data = new Uint8Array(bytes);
  try {
    return new TextDecoder("shift-jis").decode(data);
  } catch {
    return String.fromCharCode(...data);
  }
}

export function downloadBytes(bytes, filename) {
  const blob = new Blob([bytes], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
