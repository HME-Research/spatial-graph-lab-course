// Spatial Graph Lab tutorial: Windows / macOS tabs, kit tabs, your toolkit name filled into commands and
// prompts, small forms that fill commands (git identity, commit message, prompt blanks), one Copy button
// per command, tick-boxes, folding that remembers what you opened, and the side menu.
// Plain script, no libraries; works when a page is opened by double-click (file://) or online.
// Without JavaScript every page still reads: every section opens with a click, every tab panel shows.
// Everything typed is remembered only in this browser, for this address (file:// and online differ).
// Every access to localStorage is wrapped in try/catch: the pages work without it.
(function () {
  'use strict';
  var NAME_KEY = 'sgl-tutorial-toolkit-name'; // the toolkit name made on page 06 or 10, e.g. u123-hk-house
  var NAMER_KEY = 'sgl-tutorial-namer'; // { number (last 3 digits only), initials, name }
  var OS_KEY = 'sgl-tutorial-os';
  var CHECK_KEY = 'sgl-tutorial-setup';
  var VARS_KEY = 'sgl-tutorial-vars'; // values of the small forms: { name: value }
  var NAME_RULE = /^[a-z][a-z0-9_-]*$/; // what the app accepts as a toolkit folder name
  var NOREPLY = /^[^\s@]+@users\.noreply\.github\.com$/i;
  var PH_NAME = '<your-toolkit-name>';
  var PH_TAG = '<your-name-tag>'; // u123-hk: the first two parts of the toolkit name; the branch is toolkit/<your-name-tag>
  function tagOf(name) { return name ? name.split('-').slice(0, 2).join('-') : ''; }
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
  /** Placeholders still to replace: <your-toolkit-name>, <your-branch>, ___ … */
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
  // Other tabs (kits, VS Code or terminal): <div class="tabs" data-tabs="name" data-default="design">
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
      var first = saved[name];
      var known = false;
      for (var k = 0; k < choices.length; k++) if (choices[k][0] === first) known = true;
      pick(known ? first : box.getAttribute('data-default') || choices[0][0], false);
    });
  }

  // ---- Your toolkit name: U + last 3 digits of your student number + initials + toolkit name ----
  function slug(text) {
    var s = String(text || '');
    if (s.normalize) s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
  }
  var MAX_NAME = 40; // long names make long paths and branch names: cut at a word boundary
  /** { name, message, ok } for the three fields. `digits` holds digits only (the field removes the rest). */
  function buildName(digits, initials, name) {
    var d = String(digits || '');
    var typedA = String(initials || '').trim();
    var typedB = String(name || '').trim();
    var a = slug(initials).replace(/[^a-z]/g, ''); // "H.K." and "H K" are the initials hk
    var b = slug(name);
    if (!d && !typedA && !typedB) return { name: '', ok: false, message: '' };
    if (d.length < 3) return { name: '', ok: false, message: 'Type 3 digits after the U: the last 3 of your student number.' };
    if (!a) return { name: '', ok: false, message: typedA ? 'Write your initials with the letters a–z.' : 'Type your initials too.' };
    if (!b) return { name: '', ok: false, message: typedB ? 'Write the toolkit name with the letters a–z and digits.' : 'Type a short toolkit name too, e.g. House.' };
    var full = 'u' + d + '-' + a + '-' + b;
    if (full.length > MAX_NAME) {
      var cut = full.slice(0, MAX_NAME + 1);
      var at = cut.lastIndexOf('-');
      full = at > 6 + a.length ? cut.slice(0, at) : full.slice(0, MAX_NAME).replace(/-+$/, '');
    }
    return { name: full, ok: true, message: 'Your toolkit name is ' + full + '. The commands and prompts on this page use it.' };
  }
  /** A gentle hint: a toolkit name that repeats the initials. */
  function nameWarnings(initials, name) {
    var a = slug(initials).replace(/[^a-z]/g, '');
    var b = slug(name);
    if (a && b && (b === a || b.indexOf(a + '-') === 0)) return ['The toolkit name repeats your initials: they are added for you, so type only the toolkit name.'];
    if (a.length > 4) return ['That looks like a name, not initials: use 2–4 letters, e.g. HK.'];
    return [];
  }

  function currentName() {
    var n = get(NAME_KEY);
    return NAME_RULE.test(n) ? n : '';
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
  // Pages without the name form fill your toolkit name silently when one was saved; otherwise the
  // orange placeholder stays.
  function fill() {
    var name = currentName();
    each('pre[data-fill]', function (pre) {
      if (pre.getAttribute('data-original') === null) pre.setAttribute('data-original', pre.textContent);
      var text = pre.getAttribute('data-original');
      if (name) text = text.split(PH_NAME).join(name).split(PH_TAG).join(tagOf(name));
      text = text.replace(/<(your-github-username|your-no-reply-email|what-changed)>/g, function (m, v) { return varValue(v) || m; });
      paintPlaceholders(pre, text);
    });
    each('.code pre:not([data-fill]):not([data-build])', function (pre) {
      if (pre.getAttribute('data-painted') === null && PLACEHOLDER.test(pre.textContent)) {
        pre.setAttribute('data-painted', '');
        paintPlaceholders(pre, pre.textContent);
      }
    });
    each('[data-toolkit-name]', function (el) { el.textContent = name || PH_NAME; toggleClass(el, 'ph', !name); });
    each('[data-name-tag]', function (el) { el.textContent = tagOf(name) || PH_TAG; toggleClass(el, 'ph', !name); });
    each('a[data-localhost]', function (a) {
      a.href = 'http://localhost:5173/' + (name ? '?toolkit=' + name : '');
      a.textContent = 'http://localhost:5173/?toolkit=' + (name || PH_NAME);
    });
    if (window.sglBuildPrompts) window.sglBuildPrompts();
  }

  // The name form (pages 06 and 10; both share NAMER_KEY and NAME_KEY).
  function setUpNamers() {
    var stored = getJson(NAMER_KEY);
    each('[data-namer]', function (box) {
      var number = box.querySelector('[data-namer-number]');
      var initials = box.querySelector('[data-namer-initials]');
      var name = box.querySelector('[data-namer-name]');
      var msg = box.querySelector('[data-namer-msg]');
      var numberMsg = box.querySelector('[data-namer-number-msg]');
      var warn = box.querySelector('[data-namer-warn]');
      if (number) number.value = typeof stored.number === 'string' ? stored.number.replace(/\D/g, '').slice(-3) : '';
      if (initials) initials.value = typeof stored.initials === 'string' ? stored.initials : '';
      if (name) name.value = typeof stored.name === 'string' ? stored.name : '';
      function show(result) {
        if (!msg) return;
        msg.textContent = result.message;
        toggleClass(msg, 'bad', !result.ok && !!result.message);
        toggleClass(msg, 'good', result.ok);
      }
      // Digits only, and only the last 3 are kept (never the whole student number).
      function cleanNumber() {
        if (!number) return '';
        var typed = number.value;
        var note = '';
        var digits = typed.replace(/\D/g, '');
        if (digits !== typed) note = 'Digits only: letters and other signs are not part of it.';
        if (digits.length > 3) {
          digits = digits.slice(-3);
          if (!note) note = 'Kept the last 3 digits: ' + digits + '.';
        }
        if (digits !== typed) number.value = digits;
        if (numberMsg) { numberMsg.textContent = note; toggleClass(numberMsg, 'bad', /^Digits only/.test(note)); }
        return digits;
      }
      function update() {
        var values = { number: cleanNumber(), initials: initials ? initials.value : '', name: name ? name.value : '' };
        putJson(NAMER_KEY, values);
        var result = buildName(values.number, values.initials, values.name);
        show(result);
        if (warn) { var list = nameWarnings(values.initials, values.name); warn.textContent = list.join(' '); warn.hidden = list.length === 0; }
        if (number) toggleClass(number, 'invalid', !!result.message && !result.ok && values.number.length < 3);
        put(NAME_KEY, result.ok ? result.name : '');
        fill();
      }
      var inputs = [number, initials, name];
      for (var i = 0; i < inputs.length; i++) if (inputs[i]) inputs[i].addEventListener('input', update);
      var first = buildName(number ? number.value : '', initials ? initials.value : '', name ? name.value : '');
      if (first.ok) show(first);
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

  // ---- Copy buttons: one per command ----
  function setUpCopyButtons() {
    var hasNamer = !!document.querySelector('[data-namer]');
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
        // A form on this page fills these: a command is not copied until it has.
        var formVar = /<(your-github-username|your-no-reply-email|what-changed)>/.exec(text);
        if (!isPrompt && (formVar || (hasNamer && (text.indexOf(PH_NAME) >= 0 || text.indexOf(PH_TAG) >= 0)))) {
          done('Not yet', formVar ? 'Fill in the form above first (the orange part ' + formVar[0] + ').' : 'Make your toolkit name in the form above first.');
          return;
        }
        var other = /<[a-z][a-z0-9-]*>/.exec(text);
        var reminder = isPrompt && (other || text.indexOf('___') >= 0)
          ? 'Copied. Replace the orange parts in the chat before you send it.'
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
      var stored = getJson(storeKey);
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
          lines[fields[k].getAttribute('data-line')] = fields[k].value.replace(/^\s+|\s+$/g, '').replace(/\s*\n\s*/g, ' ');
        }
        putJson(storeKey, plan);
        var name = currentName();
        for (var t = 0; t < targets.length; t++) {
          var pre = targets[t];
          if (pre.getAttribute('data-template') === null) pre.setAttribute('data-template', pre.textContent);
          var out = pre.getAttribute('data-template').split('\n').map(function (line) {
            var m = /^(.*): ___$/.exec(line);
            if (m && m[1] === 'Toolkit name') return 'Toolkit name: ' + (name || '___');
            if (m && lines[m[1]] !== undefined) return m[1] + ': ' + (lines[m[1]] || '___');
            return name ? line.split(PH_NAME).join(name).split(PH_TAG).join(tagOf(name)) : line;
          });
          paintPlaceholders(pre, out.join('\n'));
        }
      }
      builders.push(build);
      build();
    });
    window.sglBuildPrompts = function () { for (var i = 0; i < builders.length; i++) builders[i](); };
  }

  // ---- Tick-boxes in step title rows: saved in this browser; the side menu marks ticked steps ----
  function setUpChecklist() {
    var boxes = document.querySelectorAll('input[data-check]');
    if (!boxes.length) return;
    var saved = getJson(CHECK_KEY);
    function sectionOf(el) {
      while (el && !(el.tagName === 'DETAILS' && el.id && /\bcard\b/.test(el.className))) el = el.parentNode;
      return el;
    }
    function render() {
      for (var i = 0; i < boxes.length; i++) {
        var section = sectionOf(boxes[i]);
        if (!section) continue;
        var ticks = section.querySelectorAll('input[data-check]');
        var all = true;
        for (var t = 0; t < ticks.length; t++) if (!ticks[t].checked) all = false;
        toggleClass(section, 'done-step', all);
        each('.toc a[href="#' + section.id + '"]', function (a) {
          toggleClass(a, 'done', all);
          var n = a.querySelector('.n');
          if (n) {
            if (n.getAttribute('data-n') === null) n.setAttribute('data-n', n.textContent);
            n.textContent = all ? '✓' : n.getAttribute('data-n');
          }
        });
      }
    }
    for (var i = 0; i < boxes.length; i++) {
      boxes[i].checked = saved[boxes[i].getAttribute('data-check')] === true;
      boxes[i].addEventListener('change', function () {
        var state = {};
        try { state = getJson(CHECK_KEY); } catch (e) { state = {}; }
        for (var j = 0; j < boxes.length; j++) {
          var k = boxes[j].getAttribute('data-check');
          if (boxes[j].checked) state[k] = true; else delete state[k];
        }
        putJson(CHECK_KEY, state);
        render();
      });
    }
    render();
  }

  // A tick-box in a step's title row: ticking it never folds or unfolds the step.
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

  // ---- Folding: every step and section is a <details class="fold">, closed at first.
  // What you open stays open: remembered per page in this browser. ----
  function setUpFolding() {
    var folds = document.querySelectorAll('main details.fold');
    if (!folds.length) return;
    var page = (location.pathname.split('/').pop() || 'page').replace(/\.html$/, '');
    var key = 'sgl-tutorial-opened-' + page;
    var state = getJson(key);
    var opened = Array.isArray(state.open) ? state.open : [];
    for (var i = 0; i < folds.length; i++) {
      if (opened.indexOf(folds[i].id) >= 0) folds[i].open = true;
      folds[i].addEventListener('toggle', remember);
    }
    // A toggle event arrives a moment after the click: save once more when the page is left.
    window.addEventListener('pagehide', remember);
    function remember() {
      var now = [];
      for (var j = 0; j < folds.length; j++) if (folds[j].open && folds[j].id) now.push(folds[j].id);
      state.open = now;
      putJson(key, state);
    }
    function nested() { return document.querySelectorAll('main details:not(.fold)'); }
    function showDetails(on) {
      var list = nested();
      for (var j = 0; j < list.length; j++) list[j].open = on;
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

  // ---- A link to a section inside a closed <details> opens it (e.g. a Help entry) ----
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
  // A click on a link in the side menu opens its section (also when the hash does not change).
  function setUpTocOpen() {
    each('.toc a[href^="#"]', function (a) {
      a.addEventListener('click', function () {
        var el = document.getElementById(a.getAttribute('href').slice(1));
        if (el && el.tagName === 'DETAILS') el.open = true;
      });
    });
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
    setUpVars();
    fill();
    setUpCopyButtons();
    setUpFolding();
    setUpSummaryTicks();
    setUpChecklist();
    setUpTocOpen();
    setUpSideMenu();
    openTarget();
    window.addEventListener('hashchange', openTarget);
  });
})();
