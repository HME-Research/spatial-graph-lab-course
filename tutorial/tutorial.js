// Spatial Graph Lab tutorial: Copy buttons, and your toolkit id filled into commands and prompts.
// Plain script, no libraries; works when a page is opened by double-click (file://) or online.
(function () {
  'use strict';
  var KEY = 'sgl-tutorial-toolkit-id';
  var ID_RULE = /^[a-z][a-z0-9_-]*$/;

  function load() {
    try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; }
  }
  function save(value) {
    try { if (value) localStorage.setItem(KEY, value); else localStorage.removeItem(KEY); } catch (e) { /* not stored: still shown */ }
  }

  // Each <pre data-fill> keeps its original text; "<toolkit-id>" is replaced by your id when it is valid.
  function fill(id) {
    var blocks = document.querySelectorAll('pre[data-fill]');
    for (var i = 0; i < blocks.length; i++) {
      var pre = blocks[i];
      if (pre.dataset.original === undefined) pre.dataset.original = pre.textContent;
      pre.textContent = id ? pre.dataset.original.split('<toolkit-id>').join(id) : pre.dataset.original;
    }
    var names = document.querySelectorAll('[data-toolkit-id]');
    for (var j = 0; j < names.length; j++) names[j].textContent = id || '<toolkit-id>';
  }

  function setUpIdBoxes() {
    var inputs = document.querySelectorAll('input[data-id-input]');
    var id = load();
    for (var i = 0; i < inputs.length; i++) {
      var input = inputs[i];
      input.value = id;
      input.addEventListener('input', function (event) {
        var value = event.target.value.trim();
        var ok = value === '' || ID_RULE.test(value);
        event.target.classList.toggle('invalid', !ok);
        var hint = event.target.parentNode.querySelector('[data-id-hint]');
        if (hint) hint.textContent = ok ? '' : 'Lowercase letters, digits, - or _, starting with a letter.';
        if (ok) { save(value); fill(value); if (window.sglBuildPrompts) window.sglBuildPrompts(); }
      });
    }
    fill(ID_RULE.test(id) ? id : '');
  }

  function setUpCopyButtons() {
    var blocks = document.querySelectorAll('.code pre');
    for (var i = 0; i < blocks.length; i++) {
      (function (pre) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'copy';
        button.textContent = 'Copy';
        button.addEventListener('click', function () {
          var text = pre.textContent;
          var done = function (label) { button.textContent = label; setTimeout(function () { button.textContent = 'Copy'; }, 1600); };
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () { done('Copied'); }, function () { done('Select and copy'); });
          } else {
            done('Select and copy');
          }
        });
        pre.parentNode.appendChild(button);
      })(blocks[i]);
    }
  }

  // Plan page: build both prompts from the form.
  function setUpPromptBuilder() {
    var form = document.getElementById('prompt-form');
    if (!form) return;
    var targets = document.querySelectorAll('pre[data-build]');
    var stored = {};
    try { stored = JSON.parse(localStorage.getItem('sgl-tutorial-plan') || '{}') || {}; } catch (e) { stored = {}; }
    var fields = form.querySelectorAll('textarea[name]');
    for (var i = 0; i < fields.length; i++) {
      if (typeof stored[fields[i].name] === 'string') fields[i].value = stored[fields[i].name];
      fields[i].addEventListener('input', build);
    }
    function value(name) {
      var el = form.querySelector('[name="' + name + '"]');
      var text = el ? el.value.trim().replace(/\s*\n\s*/g, ' ') : '';
      return text || '___';
    }
    function build() {
      var plan = {};
      for (var k = 0; k < fields.length; k++) plan[fields[k].name] = fields[k].value;
      try { localStorage.setItem('sgl-tutorial-plan', JSON.stringify(plan)); } catch (e) { /* not stored */ }
      var id = load();
      if (!ID_RULE.test(id)) id = '';
      for (var t = 0; t < targets.length; t++) {
        var pre = targets[t];
        if (pre.dataset.template === undefined) pre.dataset.template = pre.textContent;
        var lines = pre.dataset.template.split('\n');
        var out = lines.map(function (line) {
          if (line === 'Toolkit id: ___') return 'Toolkit id: ' + (id || '___');
          if (line === 'My idea: ___') return 'My idea: ' + value('idea');
          if (line === 'Functions (and their attributes): ___') return 'Functions (and their attributes): ' + value('functions');
          if (line === 'Algorithms: ___') return 'Algorithms: ' + value('algorithms');
          if (line === 'Example design: ___') return 'Example design: ' + value('design');
          return id ? line.split('<toolkit-id>').join(id) : line;
        });
        pre.textContent = out.join('\n');
      }
    }
    window.sglBuildPrompts = build;
    build();
  }

  document.addEventListener('DOMContentLoaded', function () {
    setUpIdBoxes();
    setUpPromptBuilder();
    setUpCopyButtons();
  });
})();
