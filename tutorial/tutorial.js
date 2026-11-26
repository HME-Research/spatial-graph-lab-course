// Spatial Graph Lab tutorial: Windows / macOS tabs, kit tabs, your toolkit id filled into commands and
// prompts, small forms that fill commands (git identity, commit message, prompt blanks), one Copy button
// per command, the setup checklist and the side menu.
// Plain script, no libraries; works when a page is opened by double-click (file://) or online.
// Without JavaScript every page still reads: every tab panel shows, the side menu is a plain list.
// Everything typed is remembered only in this browser, for this address (file:// and online differ).
(function () {
  'use strict';
  var KEY = 'sgl-tutorial-toolkit-id'; // the final toolkit id (kept from the first tutorial version)
  var NAMER_KEY = 'sgl-tutorial-namer'; // { initials, name, own }
  var OS_KEY = 'sgl-tutorial-os';
  var CHECK_KEY = 'sgl-tutorial-setup';
  var VARS_KEY = 'sgl-tutorial-vars'; // values of the small forms: { name: value }
  var ID_RULE = /^[a-z][a-z0-9-]*$/; // the owner's convention
  var OWN_RULE = /^[a-z][a-z0-9_-]*$/; // what the app accepts for an id made earlier
  var NOREPLY = /^[^\s@]+@users\.noreply\.github\.com$/i;
  var root = document.documentElement;

  function get(key) {
    try { return localStorage.getItem(key) || ''; } catch (e) { return ''; }
  }
  function put(key, value) {
    try { if (value) localStorage.setItem(key, value); else localStorage.removeItem(key); } catch (e) { /* not stored: still shown */ }
  }
  function getJson(key) {
    try { return JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch (e) { return {}; }
  }
  function putJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* not stored */ }
  }
  function each(selector, fn, scope) {
    var list = (scope || document).querySelectorAll(selector);
    for (var i = 0; i < list.length; i++) fn(list[i], i);
  }
  function toggleClass(el, name, on) {
    if (el.classList) { if (on) el.classList.add(name); else el.classList.remove(name); }
  }
  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  /** Placeholders still to replace: <toolkit-id>, <your-github-username>, ___ … */
  var PLACEHOLDER = /<[a-z][a-z0-9-]*>|___/;
  function paintPlaceholders(el, text) {
    el.innerHTML = escapeHtml(text).replace(/&lt;[a-z][a-z0-9-]*&gt;|___/g, function (m) { return '<span class="ph">' + m + '</span>'; });
  }

  // ---- Windows / macOS: chosen before the page draws, so the other panel never flashes ----
  function detectOs() {
    var ua = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || navigator.userAgent || '';
    return /mac|iphone|ipad/i.test(ua) ? 'mac' : 'win';
  }
  var os = get(OS_KEY);
  if (os !== 'win' && os !== 'mac') os = detectOs();
  toggleClass(root, 'js', true);
  toggleClass(root, 'os-' + os, true);

  function setOs(value, remember) {
    os = value;
    toggleClass(root, 'os-win', value === 'win');
    toggleClass(root, 'os-mac', value === 'mac');
    if (remember) put(OS_KEY, value);
    each('.os-switch button', function (b) {
      var on = b.getAttribute('data-os-choice') === value;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    });
  }
  function makeSwitch(className, label, choices, onPick) {
    var bar = document.createElement('div');
    bar.className = className;
    bar.setAttribute('role', 'tablist');
    bar.setAttribute('aria-label', label);
    for (var i = 0; i < choices.length; i++) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('data-choice', choices[i][0]);
      b.textContent = choices[i][1];
      b.addEventListener('click', function (event) { onPick(event.currentTarget.getAttribute('data-choice')); });
      bar.appendChild(b);
    }
    return bar;
  }
  function setUpOsTabs() {
    each('.os-tabs', function (box) {
      var bar = makeSwitch('os-switch', 'Your computer', [['win', 'Windows'], ['mac', 'macOS']], function (v) { setOs(v, true); });
      each('button', function (b) { b.setAttribute('data-os-choice', b.getAttribute('data-choice')); }, bar);
      box.insertBefore(bar, box.firstChild);
    });
    setOs(os, false);
  }
  // Other tabs (the kits on pages 3 and 4): <div class="tabs" data-tabs="name" data-default="design">
  function setUpTabs() {
    var saved = getJson('sgl-tutorial-tabs');
    each('.tabs[data-tabs]', function (box) {
      var name = box.getAttribute('data-tabs');
      var panels = box.querySelectorAll(':scope > .tab-panel');
      var choices = [];
      for (var i = 0; i < panels.length; i++) choices.push([panels[i].getAttribute('data-tab'), panels[i].getAttribute('data-label')]);
      function pick(value, remember) {
        for (var j = 0; j < panels.length; j++) panels[j].hidden = panels[j].getAttribute('data-tab') !== value;
        each('button', function (b) { b.setAttribute('aria-selected', b.getAttribute('data-choice') === value ? 'true' : 'false'); }, bar);
        if (remember) { saved[name] = value; putJson('sgl-tutorial-tabs', saved); }
      }
      var bar = makeSwitch('tab-switch', box.getAttribute('data-tabs-label') || 'Choose', choices, function (v) { pick(v, true); });
      box.insertBefore(bar, box.firstChild);
      pick(saved[name] || box.getAttribute('data-default') || choices[0][0], false);
    });
  }

  // ---- Your toolkit id: initials + toolkit name -> toolkit id ----
  function slug(text) {
    var s = String(text || '');
    if (s.normalize) s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
  }
  var MAX_ID = 40; // long ids make long paths and branch names: cut at a word boundary
  /** { id, message, ok } for the two fields (and an optional id made earlier). */
  function buildId(initials, name, own) {
    own = String(own || '').trim().toLowerCase();
    if (own) {
      return OWN_RULE.test(own)
        ? { id: own, ok: true, message: 'Using your existing toolkit id ' + own + '.' }
        : { id: '', ok: false, message: 'That id is not valid: lowercase letters, digits, - or _, starting with a letter.' };
    }
    var typedA = String(initials || '').trim();
    var typedB = String(name || '').trim();
    var a = slug(initials).replace(/-/g, ''); // "H.K." and "H K" are the initials hk
    var b = slug(name);
    if (!typedA && !typedB) return { id: '', ok: false, message: '' };
    if (!a) return { id: '', ok: false, message: typedA ? 'Write your initials with the letters a–z.' : 'Type your initials too.' };
    if (!b) return { id: '', ok: false, message: typedB ? 'Write the toolkit name with the letters a–z and digits.' : 'Type your toolkit name too.' };
    var id = a + '-' + b;
    if (!ID_RULE.test(id)) return { id: '', ok: false, message: 'The id must start with a letter: start your initials with a letter.' };
    var shortened = false;
    if (id.length > MAX_ID) {
      var cut = id.slice(0, MAX_ID + 1);
      var at = cut.lastIndexOf('-');
      id = at > a.length ? cut.slice(0, at) : id.slice(0, MAX_ID).replace(/-+$/, '');
      shortened = true;
    }
    return {
      id: id,
      ok: true,
      message: 'Your toolkit id is ' + id + '.' + (shortened ? ' (Shortened: choose a shorter toolkit name if you like.)' : '') + ' Every command and prompt on these pages now uses it.',
    };
  }
  /** Gentle hints: initials that look like a full name, a toolkit name that repeats the initials. */
  function idWarnings(initials, name) {
    var out = [];
    var typedA = String(initials || '').trim();
    var a = slug(initials).replace(/-/g, '');
    var b = slug(name);
    if (/[a-z]{2,}\s+[a-z]{2,}/i.test(typedA) || a.length > 4) out.push('That looks like a name, not initials: use 2–4 letters, e.g. HK. Your id is public on GitHub.');
    if (a && b && (b === a || b.indexOf(a + '-') === 0)) out.push('The toolkit name repeats your initials: they are added for you, so type only the toolkit name.');
    return out;
  }

  function currentId() {
    var id = get(KEY);
    return OWN_RULE.test(id) ? id : '';
  }

  // ---- Values of the small forms (git identity, commit message): <placeholder> -> value ----
  var vars = getJson(VARS_KEY);
  /** The value that replaces <name> in commands, or '' while it is not valid. */
  function varValue(name) {
    var v = String(vars[name] || '').trim();
    if (name === 'your-no-reply-email') return NOREPLY.test(v) ? v : (v && /@/.test(v) ? v : '');
    if (name === 'your-github-username') return /^[A-Za-z0-9-]{1,39}$/.test(v) ? v : '';
    if (name === 'what-changed') return v.replace(/["`$\\]/g, '').replace(/\s+/g, ' ');
    return v;
  }

  // Each <pre data-fill> keeps its original text; placeholders are replaced by what you typed.
  function fill() {
    var id = currentId();
    each('pre[data-fill]', function (pre) {
      if (pre.getAttribute('data-original') === null) pre.setAttribute('data-original', pre.textContent);
      var text = pre.getAttribute('data-original');
      if (id) text = text.split('<toolkit-id>').join(id);
      text = text.replace(/<(your-github-username|your-no-reply-email|what-changed)>/g, function (m, name) { return varValue(name) || m; });
      paintPlaceholders(pre, text);
    });
    each('.code pre:not([data-fill]):not([data-build])', function (pre) {
      if (pre.getAttribute('data-painted') === null && PLACEHOLDER.test(pre.textContent)) {
        pre.setAttribute('data-painted', '');
        paintPlaceholders(pre, pre.textContent);
      }
    });
    each('[data-toolkit-id]', function (el) { el.textContent = id || '<toolkit-id>'; toggleClass(el, 'ph', !id); });
    each('a[data-localhost]', function (a) {
      var url = 'http://localhost:5173/' + (id ? '?toolkit=' + id : '');
      a.href = url;
      a.textContent = id ? url : 'http://localhost:5173/?toolkit=<toolkit-id>';
    });
    each('[data-chip]', function (chip) {
      var empty = chip.querySelector('[data-chip-empty]');
      var full = chip.querySelector('[data-chip-full]');
      if (empty) empty.hidden = !!id;
      if (full) full.hidden = !id;
    });
    if (window.sglBuildPrompts) window.sglBuildPrompts();
  }

  function setUpNamers() {
    var stored = getJson(NAMER_KEY);
    each('[data-namer]', function (box) {
      var initials = box.querySelector('[data-namer-initials]');
      var name = box.querySelector('[data-namer-name]');
      var own = box.querySelector('[data-namer-own]');
      var msg = box.querySelector('[data-namer-msg]');
      var warn = box.querySelector('[data-namer-warn]');
      if (initials) initials.value = typeof stored.initials === 'string' ? stored.initials : '';
      if (name) name.value = typeof stored.name === 'string' ? stored.name : '';
      if (own) own.value = typeof stored.own === 'string' ? stored.own : '';
      if (own && own.value) { var d = own.parentNode; while (d && d.tagName !== 'DETAILS') d = d.parentNode; if (d) d.open = true; }
      function show(result) {
        if (!msg) return;
        msg.textContent = result.message;
        toggleClass(msg, 'bad', !result.ok && !!result.message);
        toggleClass(msg, 'good', result.ok);
      }
      function showWarnings(values) {
        if (!warn) return;
        var list = values.own ? [] : idWarnings(values.initials, values.name);
        warn.textContent = list.join(' ');
        warn.hidden = list.length === 0;
      }
      function update() {
        var values = { initials: initials ? initials.value : '', name: name ? name.value : '', own: own ? own.value : '' };
        putJson(NAMER_KEY, values);
        var result = buildId(values.initials, values.name, values.own);
        show(result);
        showWarnings(values);
        if (initials) toggleClass(initials, 'invalid', !result.ok && !!result.message && !values.own && !slug(values.initials));
        if (name) toggleClass(name, 'invalid', !result.ok && !!result.message && !values.own && !slug(values.name));
        if (own) toggleClass(own, 'invalid', !!values.own && !result.ok);
        put(KEY, result.ok ? result.id : '');
        fill();
      }
      var inputs = [initials, name, own];
      for (var i = 0; i < inputs.length; i++) if (inputs[i]) inputs[i].addEventListener('input', update);
      // First show: keep an id saved earlier (also from the first tutorial version) when the fields are empty.
      var first = buildId(initials ? initials.value : '', name ? name.value : '', own ? own.value : '');
      showWarnings({ initials: initials ? initials.value : '', name: name ? name.value : '', own: own ? own.value : '' });
      if (first.ok) show(first);
      else if (currentId()) show({ ok: true, message: 'Your saved toolkit id is ' + currentId() + '. Type your initials and toolkit name to change it.' });
    });
  }

  // The one-line chip on pages 7, 8, 10 and 11: shows the id, or lets you type it on this page.
  function setUpChips() {
    each('[data-chip-input]', function (input) {
      var msg = input.parentNode.querySelector('[data-chip-msg]');
      input.addEventListener('change', save);
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') save(); });
      function save() {
        var v = input.value.trim().toLowerCase();
        if (!OWN_RULE.test(v)) { if (msg) msg.textContent = 'Lowercase letters, digits and -, starting with a letter, e.g. hk-small-library.'; return; }
        if (msg) msg.textContent = '';
        put(KEY, v);
        var stored = getJson(NAMER_KEY);
        stored.own = v; // keep it when the full form is opened later
        putJson(NAMER_KEY, stored);
        fill();
      }
    });
  }

  // Small forms: <input data-var="your-github-username"> fill <your-github-username> in commands.
  function setUpVars() {
    each('input[data-var]', function (input) {
      var name = input.getAttribute('data-var');
      var msg = document.querySelector('[data-var-msg="' + name + '"]');
      input.value = typeof vars[name] === 'string' ? vars[name] : '';
      function check() {
        var v = input.value.trim();
        var text = '';
        var bad = false;
        if (name === 'your-no-reply-email' && v && !NOREPLY.test(v)) {
          text = /@/.test(v)
            ? 'This is not a GitHub no-reply address: it will be public in every commit. Use the address that ends in @users.noreply.github.com (GitHub › Settings › Emails).'
            : 'Type the whole address, ending in @users.noreply.github.com.';
          bad = true;
        }
        if (name === 'your-github-username' && v && !/^[A-Za-z0-9-]{1,39}$/.test(v)) { text = 'A GitHub username has only letters, digits and -, no spaces and no @.'; bad = true; }
        if (msg) { msg.textContent = text; toggleClass(msg, 'bad', bad); }
        toggleClass(input, 'invalid', bad);
      }
      input.addEventListener('input', function () {
        vars[name] = input.value;
        putJson(VARS_KEY, vars);
        check();
        fill();
      });
      check();
    });
  }

  // ---- Copy buttons: one per command; refused while a placeholder is still in it ----
  function setUpCopyButtons() {
    each('.code pre', function (pre) {
      if (pre.hasAttribute('data-ref')) return; // a reference list: read it, type its lines one at a time
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'copy';
      button.textContent = 'Copy';
      var note = document.createElement('span');
      note.className = 'copy-note';
      note.setAttribute('role', 'status');
      button.addEventListener('click', function () {
        var text = pre.textContent;
        var isPrompt = (pre.getAttribute('data-block') || '').indexOf('prompt') === 0;
        var done = function (label, message) {
          button.textContent = label;
          note.textContent = message || '';
          toggleClass(button, 'refused', label === 'Not yet');
          setTimeout(function () { button.textContent = 'Copy'; toggleClass(button, 'refused', false); note.textContent = ''; }, message ? 4500 : 1500);
        };
        // A command with "<toolkit-id>" still in it fails with a confusing message in every terminal.
        // Commands are not copied then; a prompt is, with a reminder to fill in its blanks.
        var missing = /<(toolkit-id|your-github-username|your-no-reply-email|what-changed)>/.exec(text);
        if (missing && !isPrompt) {
          var what = missing[0] === '<toolkit-id>' ? 'your toolkit id (at the top of the page)' : 'the form above (the orange part ' + missing[0] + ')';
          done('Not yet', 'Fill in ' + what + ' first.');
          return;
        }
        var other = /<[a-z][a-z0-9-]*>/.exec(text);
        var reminder = isPrompt && (missing || text.indexOf('___') >= 0)
          ? 'Copied. Replace the orange parts (___) in the chat before you send it.'
          : other ? 'Copied. In the terminal, replace ' + other[0] + ' before you press Enter.' : '';
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () { done('Copied', reminder); }, function () { done('Select and copy'); });
        } else {
          done('Select and copy');
        }
      });
      pre.parentNode.appendChild(button);
      pre.parentNode.appendChild(note);
    });
  }

  // ---- Prompts filled from a form: <pre data-build="form-id">; lines "Label: ___" take the field with data-line="Label" ----
  function setUpPromptBuilders() {
    var builders = [];
    each('form[data-blanks]', function (form) {
      var storeKey = 'sgl-tutorial-blanks-' + form.id;
      var stored = form.id === 'prompt-form' ? getJson('sgl-tutorial-plan') : getJson(storeKey);
      var fields = form.querySelectorAll('[data-line]');
      for (var i = 0; i < fields.length; i++) {
        if (typeof stored[fields[i].name] === 'string') fields[i].value = stored[fields[i].name];
        fields[i].addEventListener('input', build);
      }
      var targets = document.querySelectorAll('pre[data-build="' + form.id + '"]');
      function build() {
        var plan = {};
        var lines = {};
        for (var k = 0; k < fields.length; k++) {
          plan[fields[k].name] = fields[k].value;
          var v = fields[k].value.replace(/^\s+|\s+$/g, '').replace(/\s*\n\s*/g, ' ');
          lines[fields[k].getAttribute('data-line')] = v;
        }
        putJson(form.id === 'prompt-form' ? 'sgl-tutorial-plan' : storeKey, plan);
        var id = currentId();
        for (var t = 0; t < targets.length; t++) {
          var pre = targets[t];
          if (pre.getAttribute('data-template') === null) pre.setAttribute('data-template', pre.textContent);
          var out = pre.getAttribute('data-template').split('\n').map(function (line) {
            var m = /^(.*): ___$/.exec(line);
            if (m && m[1] === 'Toolkit id') return 'Toolkit id: ' + (id || '___');
            if (m && lines[m[1]] !== undefined) return m[1] + ': ' + (lines[m[1]] || '___');
            return id ? line.split('<toolkit-id>').join(id) : line;
          });
          paintPlaceholders(pre, out.join('\n'));
        }
      }
      builders.push(build);
      build();
    });
    window.sglBuildPrompts = function () { for (var i = 0; i < builders.length; i++) builders[i](); };
  }

  // ---- Setup checklist (page 5): ticks and progress, saved in this browser ----
  function setUpChecklist() {
    var boxes = document.querySelectorAll('input[data-check]');
    if (!boxes.length) return;
    var saved = getJson(CHECK_KEY);
    function sectionOf(el) {
      while (el && !((el.tagName === 'SECTION' || el.tagName === 'DETAILS') && el.id && /\bcard\b/.test(el.className))) el = el.parentNode;
      return el;
    }
    // A step whose (last) tick-box is ticked folds to its title with a green badge.
    function foldTicked(first) {
      for (var i = 0; i < boxes.length; i++) {
        var card = sectionOf(boxes[i]);
        if (!card) continue;
        var ticks = card.querySelectorAll('input[data-check]');
        var all = true;
        for (var t = 0; t < ticks.length; t++) if (!ticks[t].checked) all = false;
        toggleClass(card, 'done-step', all);
        if (card.tagName === 'DETAILS' && all && (first || ticks[ticks.length - 1] === boxes[i])) card.open = false;
      }
    }
    function render() {
      var done = 0;
      for (var i = 0; i < boxes.length; i++) {
        if (boxes[i].checked) done++;
        var section = sectionOf(boxes[i]);
        var checked = boxes[i].checked;
        if (section) each('.toc a[href="#' + section.id + '"]', function (a) {
          toggleClass(a, 'done', checked);
          var n = a.querySelector('.n');
          if (n) {
            if (n.getAttribute('data-n') === null) n.setAttribute('data-n', n.textContent);
            n.textContent = checked ? '✓' : n.getAttribute('data-n');
          }
        });
      }
      each('[data-progress-count]', function (el) { el.textContent = done + ' / ' + boxes.length; });
      each('[data-progress-bar]', function (el) { el.style.width = Math.round((100 * done) / boxes.length) + '%'; });
      each('[data-progress-text]', function (el) {
        el.textContent = done === boxes.length ? 'All done: you are ready to plan your toolkit.' : 'Tick each step as you complete it.';
      });
    }
    function save() {
      var state = {};
      for (var i = 0; i < boxes.length; i++) if (boxes[i].checked) state[boxes[i].getAttribute('data-check')] = true;
      putJson(CHECK_KEY, state);
    }
    for (var i = 0; i < boxes.length; i++) {
      boxes[i].checked = saved[boxes[i].getAttribute('data-check')] === true;
      boxes[i].addEventListener('change', function (event) {
        save();
        render();
        if (event.target.checked) foldTicked(false);
        else { var c = sectionOf(event.target); if (c) { toggleClass(c, 'done-step', false); if (c.tagName === 'DETAILS') c.open = true; } }
      });
    }
    // "I did the Before Session 2 checklist": tick several at once, then go on.
    each('[data-tick-all]', function (button) {
      button.addEventListener('click', function () {
        var names = button.getAttribute('data-tick-all').split(' ');
        for (var j = 0; j < boxes.length; j++) if (names.indexOf(boxes[j].getAttribute('data-check')) >= 0) boxes[j].checked = true;
        save();
        render();
        foldTicked(true);
        var go = button.getAttribute('data-go');
        if (go) location.hash = go;
      });
    });
    each('[data-progress-reset]', function (button) {
      button.addEventListener('click', function () {
        for (var j = 0; j < boxes.length; j++) boxes[j].checked = false;
        save();
        render();
        foldTicked(true);
      });
    });
    render();
    foldTicked(true);
  }

  // A tick-box in a step's title row: ticking it never folds or unfolds the step by itself.
  function setUpSummaryTicks() {
    each('summary .tick-sum', function (label) {
      var input = label.querySelector('input');
      label.addEventListener('click', function (event) {
        event.stopPropagation();
        if (event.target !== input) {
          // a click on the words: tick the box ourselves, and keep the summary from toggling
          event.preventDefault();
          input.checked = !input.checked;
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      input.addEventListener('keydown', function (event) {
        if (event.key === ' ' || event.key === 'Enter') event.stopPropagation();
        if (event.key === 'Enter') event.preventDefault(); // Space ticks a checkbox; Enter must not fold the step
      });
    });
  }

  // ---- Fold and unfold: every step card and section is a <details class="fold">, remembered per page ----
  function setUpFolding() {
    var folds = document.querySelectorAll('main details.fold');
    if (!folds.length) return;
    var page = (location.pathname.split('/').pop() || 'page').replace(/\.html$/, '');
    var key = 'sgl-tutorial-fold-' + page;
    var state = getJson(key);
    var closed = Array.isArray(state.closed) ? state.closed : [];
    for (var i = 0; i < folds.length; i++) {
      if (closed.indexOf(folds[i].id) >= 0) folds[i].open = false;
      folds[i].addEventListener('toggle', remember);
    }
    function nested() { return document.querySelectorAll('main details:not(.fold)'); }
    function remember() {
      var now = [];
      for (var j = 0; j < folds.length; j++) if (!folds[j].open) now.push(folds[j].id);
      state.closed = now;
      putJson(key, state);
    }
    function showDetails(on) {
      var list = nested();
      for (var j = 0; j < list.length; j++) if (!list[j].classList.contains('before-details') || on) list[j].open = on;
      each('[data-fold-details]', function (box) { box.checked = on; });
      state.details = on;
      putJson(key, state);
    }
    each('[data-fold]', function (button) {
      button.addEventListener('click', function () {
        var open = button.getAttribute('data-fold') === 'open';
        for (var j = 0; j < folds.length; j++) folds[j].open = open;
        if (!open) showDetails(false);
        remember();
      });
    });
    each('[data-fold-details]', function (box) {
      box.addEventListener('change', function () {
        if (box.checked) for (var j = 0; j < folds.length; j++) folds[j].open = true;
        showDetails(box.checked);
        remember();
      });
    });
    if (state.details === true) showDetails(true);
  }

  // ---- A link to a section inside a closed <details> opens it (e.g. Set up › 03, a Help entry) ----
  function openTarget() {
    var id = decodeURIComponent((location.hash || '').slice(1));
    if (!id) return;
    var el = document.getElementById(id);
    if (!el) return;
    var d = el;
    while (d) { if (d.tagName === 'DETAILS') d.open = true; d = d.parentNode; }
    if (el.tagName === 'DETAILS') el.open = true;
    if (el.scrollIntoView) setTimeout(function () { el.scrollIntoView(); }, 0);
  }

  // ---- Side menu: closed on phones, the current section highlighted while you scroll ----
  function setUpSideMenu() {
    var narrow = window.matchMedia && window.matchMedia('(max-width: 880px)').matches;
    if (narrow) each('details.toc-box', function (d) { d.open = false; });
    var current = document.querySelector('nav.site a[aria-current="page"]');
    if (current && narrow) {
      var nav = current.closest ? current.closest('nav.site') : current.parentNode;
      nav.scrollLeft = Math.max(0, current.offsetLeft - nav.clientWidth / 2 + current.clientWidth / 2);
    }
    if (!('IntersectionObserver' in window)) return;
    var links = {};
    each('.toc a[href^="#"]', function (a) { links[a.getAttribute('href').slice(1)] = a; });
    var observer = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (!entries[i].isIntersecting) continue;
        var link = links[entries[i].target.id];
        if (!link) continue;
        each('.toc a.active', function (a) { toggleClass(a, 'active', false); });
        toggleClass(link, 'active', true);
      }
    }, { rootMargin: '0px 0px -70% 0px' });
    for (var id in links) {
      var target = document.getElementById(id);
      if (target) observer.observe(target);
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    setUpOsTabs();
    setUpTabs();
    setUpPromptBuilders();
    setUpNamers();
    setUpChips();
    setUpVars();
    fill();
    setUpCopyButtons();
    setUpFolding();
    setUpSummaryTicks();
    setUpChecklist();
    setUpSideMenu();
    openTarget();
    window.addEventListener('hashchange', openTarget);
  });
})();
