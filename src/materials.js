export function classifyMaterialFiles(files) {
  const result = {
    field: { png: [], sheet: null, data: null },
    object: { png: [], sheet: null, data: null },
    ignored: [],
  };

  for (const file of files) {
    const path = normalizePath(file.webkitRelativePath || file.relativePath || file.name);
    const parts = path.split("/");
    const filename = parts.at(-1);
    const type = [...parts].reverse().find(part => part === "field" || part === "object");
    if (!type) {
      result.ignored.push(file);
      continue;
    }

    if (filename.endsWith(".png")) {
      result[type].png.push(file);
    } else if (filename === `${type}data.dat`) {
      result[type].data = file;
    } else if (filename === `${type}.dat` || filename === `${type}.bmp`) {
      result[type].sheet = file;
    } else {
      result.ignored.push(file);
    }
  }
  return result;
}

export function classifyFolderAsType(files, type) {
  if (type !== "field" && type !== "object") {
    throw new Error(`Unknown material type: ${type}`);
  }
  const result = { png: [], sheet: null, data: null, ignored: [] };
  for (const file of files) {
    const path = normalizePath(file.webkitRelativePath || file.relativePath || file.name);
    const filename = path.split("/").at(-1);
    if (filename.endsWith(".png")) {
      result.png.push(file);
    } else if (filename === `${type}data.dat`) {
      result.data = file;
    } else if (filename === `${type}.dat` || filename === `${type}.bmp`) {
      result.sheet = file;
    } else {
      result.ignored.push(file);
    }
  }
  return result;
}

function normalizePath(path) {
  return path.replaceAll("\\", "/").toLowerCase();
}
