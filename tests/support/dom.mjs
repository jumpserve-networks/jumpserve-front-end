import {JSDOM} from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {url: 'http://localhost:6001', pretendToBeVisual: true});
// JSDOM 26 does not implement PointerEvent; Base UI synthesizes one when a
// checkbox is activated. Preserve pointer fields as well as mouse coordinates.
if (!dom.window.PointerEvent) {
  dom.window.PointerEvent = class PointerEvent extends dom.window.MouseEvent {
    constructor(type, options = {}) {
      super(type, options);
      for (const [key, fallback] of Object.entries({pointerId: 0, width: 1, height: 1, pressure: 0, pointerType: 'mouse', isPrimary: true})) {
        Object.defineProperty(this, key, {value: options[key] ?? fallback});
      }
    }
  };
}
globalThis.PointerEvent = dom.window.PointerEvent;
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLButtonElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'Element', 'Node', 'MutationObserver']) {
  Object.defineProperty(globalThis, name, {configurable: true, value: dom.window[name]});
}
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

export {dom};
