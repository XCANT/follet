/* Terminal : xterm.js + node-pty, couleurs accordees au theme Material. */
/* global Terminal, FitAddon, WebglAddon */
I.view('term', {
  label: 'Terminal', icon: 'terminal',
  html: `<div class="term-wrap"></div>`,

  init(el) { this.el = el; I.on('theme', () => this.term && (this.term.options.theme = this.theme())); },
  theme() {
    const v = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    return {
      background: v('--md-surface-container-lowest'), foreground: v('--md-on-surface'), cursor: v('--md-primary'), cursorAccent: v('--md-surface-container-lowest'),
      selectionBackground: v('--md-primary') + '55',
      black: '#45475a', red: '#f38ba8', green: '#a6e3a1', yellow: '#f9e2af', blue: '#89b4fa', magenta: '#f5c2e7', cyan: '#94e2d5', white: '#bac2de',
      brightBlack: '#585b70', brightRed: '#f38ba8', brightGreen: '#a6e3a1', brightYellow: '#f9e2af', brightBlue: '#89b4fa', brightMagenta: '#f5c2e7', brightCyan: '#94e2d5', brightWhite: '#a6adc8',
    };
  },
  show() {
    if (this.term) { setTimeout(() => { this.fit.fit(); this.term.focus(); if (!this.running) this.start(); }, 60); return; }
    const term = (this.term = new Terminal({ fontFamily: '"JetBrainsMono Nerd Font", "Cascadia Mono", monospace', fontSize: 13, lineHeight: 1.15, cursorStyle: 'bar', cursorBlink: true, theme: this.theme(), allowProposedApi: true, scrollback: 5000 }));
    this.fit = new FitAddon.FitAddon(); term.loadAddon(this.fit);
    const wrap = $('.term-wrap', this.el);
    term.open(wrap);
    try { const gl = new WebglAddon.WebglAddon(); gl.onContextLoss(() => gl.dispose()); term.loadAddon(gl); } catch { /* rendu DOM */ }
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true;
      if (e.ctrlKey && e.key === 'c' && term.hasSelection()) { navigator.clipboard.writeText(term.getSelection()); term.clearSelection(); return false; }
      if (e.ctrlKey && e.key === 'v') { navigator.clipboard.readText().then((t) => follet.ptyWrite(t)); return false; }
      return true;
    });
    term.onData((d) => follet.ptyWrite(d));
    follet.onPtyData((d) => term.write(d));
    follet.onPtyExit(() => { term.write('\r\n\x1b[90m[session terminée — rouvre l\'onglet pour relancer]\x1b[0m\r\n'); this.running = false; });
    new ResizeObserver(() => { if (I.tab === 'term' && I.mode === 'expanded') { try { this.fit.fit(); follet.ptyResize(term.cols, term.rows); } catch { } } }).observe(wrap);
    setTimeout(() => this.start(), 80);
  },
  async start() { this.fit.fit(); if (!this.running) { this.running = true; await follet.ptyStart(this.term.cols, this.term.rows); } this.term.focus(); },
});
