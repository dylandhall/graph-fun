/*
 * Graph Fun — custom MathLive virtual keyboard layout.
 *
 * One layout (no layers), four rows of exactly 10 key-widths each: MathLive sizes a
 * keycap at 10% of the keyboard width on phones, so a wider row would overflow.
 * [backspace], [hide-keyboard] and [return] default to 1.5 widths, so they set width: 1.
 * a–d are slider variables (PLAN-v3 §C, §L.11); e^□ is a long-press on e, and clear
 * is a visible key (touch screens have no tooltips to discover a long-press with).
 * Left block = digits and operators, right block = functions (tinted via `gf-fn`)
 * and editing keys. Every function key inserts its own parentheses, so the
 * "function name takes the following product term" precedence rule never bites.
 *
 * Shape verified against node_modules/mathlive/types/virtual-keyboard.d.ts (0.111.0):
 * `id`, `label`, `displayEditToolbar` and `rows` are properties of the layout itself
 * (VirtualKeyboardLayoutCore & {rows}). A keycap object whose `label` names a
 * built-in shortcut such as '[backspace]' is merged with that shortcut, so we can
 * override just its width.
 */
(function (root, factory) {
  var isNode = typeof module === 'object' && module.exports;
  var api = factory();
  if (isNode) module.exports = api; else (root.GF = root.GF || {}).keyboard = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function fn(latex, label, extra) {
    var key = { latex: latex, class: 'gf-fn' };
    if (label) key.label = label;
    if (extra) for (var k in extra) key[k] = extra[k];
    return key;
  }

  // a–d: slider variables (PLAN-v3 §C.7)
  function param(name) { return { latex: name, class: 'gf-var gf-param', tooltip: name + ' (gets a slider)' }; }

  var LAYOUT = {
    id: 'graph-fun',
    label: 'f(x)',
    tooltip: 'Graph Fun keys',
    displayEditToolbar: false,
    rows: [
      [
        { latex: 'x', class: 'gf-var' }, '[7]', '[8]', '[9]', '[/]',
        fn('#@^{2}'), fn('#@^{#?}'), fn('\\sqrt{#0}'), fn('\\sqrt[#?]{#0}'),
        fn('\\left|#0\\right|', null, {
          tooltip: '|x| (long-press for sgn)',
          variants: [{ latex: '\\operatorname{sgn}\\left(#0\\right)', label: 'sgn' }]
        })
      ],
      [
        { latex: '\\pi', class: 'gf-var' }, '[4]', '[5]', '[6]', '[*]',
        fn('\\sin\\left(#0\\right)', 'sin'),
        fn('\\cos\\left(#0\\right)', 'cos'),
        fn('\\tan\\left(#0\\right)', 'tan'),
        fn('\\ln\\left(#0\\right)', 'ln'),
        fn('\\log_{#?}\\left(#0\\right)', '<span class="gf-log">log<sub>□</sub></span>', {
          tooltip: 'log base □ (long-press for log₁₀)',
          variants: [{ latex: '\\log\\left(#0\\right)', label: 'log₁₀' }]
        })
      ],
      [
        { latex: '\\exponentialE', label: 'e', class: 'gf-var', tooltip: 'e (long-press for e^□)',
          variants: [{ latex: '\\exponentialE^{#?}' }] },
        '[1]', '[2]', '[3]', '[-]',
        param('a'), param('b'), param('c'), param('d'),
        { label: '[backspace]', width: 1 }
      ],
      [
        '[(]', '[0]', '[.]', '[)]', '[+]', '[left]', '[right]',
        { label: 'clear', command: 'deleteAll', class: 'action small', width: 1, tooltip: 'Clear the formula' },
        { label: '[hide-keyboard]', width: 1 },
        { label: '[return]', width: 1, tooltip: 'Lock in' }
      ]
    ]
  };

  /** Install the layout on `window.mathVirtualKeyboard`. Returns true on success. */
  function install(vk) {
    if (!vk) return false;
    try {
      vk.layouts = [LAYOUT];
      try { vk.editToolbar = 'none'; } catch (e) { /* older API: ignore */ }
      return true;
    } catch (e) {
      if (typeof console !== 'undefined') console.warn('Graph Fun: could not install keyboard layout', e);
      return false;
    }
  }

  return { LAYOUT: LAYOUT, install: install };
});
