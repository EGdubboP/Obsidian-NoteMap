import { NoteMap } from "../models/NoteMap";
import { NoteMapNode } from "../models/Node";

export class SearchBar {
  private el: HTMLElement | null = null;
  private results: NoteMapNode[] = [];
  private currentIndex = -1;

  constructor(
    private container: HTMLElement,
    private noteMap: NoteMap,
    private onNavigateToNode: (node: NoteMapNode) => void
  ) {}

  show(): void {
    if (this.el) { this.focus(); return; }

    this.el = this.container.createDiv({ cls: "notemap-searchbar" });

    const input = this.el.createEl("input", {
      cls: "notemap-search-input",
      attr: { type: "text", placeholder: "노드 검색..." },
    });

    const info = this.el.createSpan({ cls: "notemap-search-info" });

    const prevBtn = this.el.createEl("button", { cls: "notemap-search-nav", text: "▲" });
    const nextBtn = this.el.createEl("button", { cls: "notemap-search-nav", text: "▼" });
    const closeBtn = this.el.createEl("button", { cls: "notemap-search-close", text: "✕" });

    input.addEventListener("input", () => {
      const query = input.value.toLowerCase().trim();
      if (!query) {
        this.results = [];
        this.currentIndex = -1;
        info.textContent = "";
        return;
      }

      this.results = this.noteMap.nodes.filter(
        (n) =>
          n.content.title.toLowerCase().includes(query) ||
          n.content.body.toLowerCase().includes(query)
      );

      if (this.results.length > 0) {
        this.currentIndex = 0;
        info.textContent = `1 / ${this.results.length}`;
        this.onNavigateToNode(this.results[0]);
      } else {
        this.currentIndex = -1;
        info.textContent = "0건";
      }
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        if (e.shiftKey) this.prev(info);
        else this.next(info);
      }
      if (e.key === "Escape") this.hide();
    });

    prevBtn.addEventListener("click", () => this.prev(info));
    nextBtn.addEventListener("click", () => this.next(info));
    closeBtn.addEventListener("click", () => this.hide());

    input.focus();
  }

  hide(): void {
    if (this.el) {
      this.el.remove();
      this.el = null;
      this.results = [];
      this.currentIndex = -1;
    }
  }

  isVisible(): boolean {
    return this.el !== null;
  }

  private focus(): void {
    const input = this.el?.querySelector("input");
    if (input) input.focus();
  }

  private next(info: HTMLElement): void {
    if (this.results.length === 0) return;
    this.currentIndex = (this.currentIndex + 1) % this.results.length;
    info.textContent = `${this.currentIndex + 1} / ${this.results.length}`;
    this.onNavigateToNode(this.results[this.currentIndex]);
  }

  private prev(info: HTMLElement): void {
    if (this.results.length === 0) return;
    this.currentIndex = (this.currentIndex - 1 + this.results.length) % this.results.length;
    info.textContent = `${this.currentIndex + 1} / ${this.results.length}`;
    this.onNavigateToNode(this.results[this.currentIndex]);
  }
}
