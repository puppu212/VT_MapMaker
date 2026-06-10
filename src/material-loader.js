export async function importMaterialGroup({
  type,
  group,
  cellSource,
  loadSheetFiles,
  loadImageFile,
  registerChip,
  persistChip,
}) {
  let count = 0;
  const warnings = [];
  const pngNames = new Set(group.png.map(file =>
    file.name.replace(/\.[^.]+$/, "").toLowerCase()
  ));

  if (group.sheet && group.data) {
    count += await loadSheetFiles(type, group.sheet, group.data, pngNames, true);
  } else if (group.sheet || group.data) {
    warnings.push(`${type === "field" ? "フィールド" : "オブジェクト"}: .datの組が不足`);
  }

  for (const file of group.png) {
    const image = await loadImageFile(file);
    const chip = {
      name: file.name.replace(/\.[^.]+$/, ""),
      type: type === "field" ? 0 : 1,
      width: Math.max(1, image.naturalWidth / cellSource),
      height: Math.max(1, image.naturalHeight / cellSource),
      image,
    };
    registerChip(type, chip, true);
    await persistChip(type, chip, file);
    count += 1;
  }

  return { count, warnings };
}
