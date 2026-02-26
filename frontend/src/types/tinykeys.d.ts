declare module "tinykeys" {
  export type KeyBindingMap = Record<string, (event: KeyboardEvent) => void>;

  export interface Options {
    event?: "keydown" | "keyup";
    timeout?: number;
  }

  export function tinykeys(
    target: Window | HTMLElement,
    keybindings: KeyBindingMap,
    options?: Options,
  ): () => void;
}
