import { TOOL_PRESENTATION } from "./app-utils.js";

export function createUiController({ document, window, ui, setStatus }) {
  function presentTool(tool) {
    const presentation = TOOL_PRESENTATION[tool];
    ui.active_tool_name.textContent = presentation?.label ?? tool;
    for (const name of Object.keys(TOOL_PRESENTATION)) {
      document.body.classList.toggle(`tool-${name}`, name === tool);
    }
    document.querySelectorAll("[data-tool]").forEach(button =>
      button.classList.toggle("active", button.dataset.tool === tool)
    );
    if (presentation) setStatus(presentation.status);
  }

  function toggleToolsPanel() {
    if (window.matchMedia("(max-width: 760px)").matches) {
      const open = !document.body.classList.contains("tools-panel-open");
      document.body.classList.toggle("tools-panel-open", open);
      if (open) setPalettePanelOpen(false);
      updatePanelAria();
      return;
    }
    document.body.classList.toggle("tools-panel-collapsed");
    updatePanelAria();
  }

  function setPalettePanelOpen(open) {
    document.body.classList.toggle("palette-panel-open", open);
    if (open) document.body.classList.remove("tools-panel-open");
    updatePanelAria();
  }

  function closePanels() {
    document.body.classList.remove("tools-panel-open", "palette-panel-open");
    updatePanelAria();
  }

  function syncResponsivePanels() {
    if (!window.matchMedia("(max-width: 760px)").matches) {
      document.body.classList.remove("tools-panel-open");
    }
    if (!window.matchMedia("(max-width: 1100px)").matches) {
      document.body.classList.remove("tools-panel-collapsed", "palette-panel-open");
    }
    updatePanelAria();
  }

  function updatePanelAria() {
    const mobile = window.matchMedia("(max-width: 760px)").matches;
    const toolsExpanded = mobile
      ? document.body.classList.contains("tools-panel-open")
      : !document.body.classList.contains("tools-panel-collapsed");
    ui.toggle_tools_panel.setAttribute("aria-expanded", String(toolsExpanded));
    ui.toggle_palette_panel.setAttribute(
      "aria-expanded",
      String(document.body.classList.contains("palette-panel-open"))
    );
  }

  return {
    closePanels,
    presentTool,
    setPalettePanelOpen,
    syncResponsivePanels,
    toggleToolsPanel,
  };
}
