// Spatial Graph Lab tutorial: Windows / macOS tabs, your toolkit name filled into commands and
// prompts, Copy buttons, the setup checklist and the side menu.
// Plain script, no libraries; works when a page is opened by double-click (file://) or online.
// Without JavaScript every page still reads: both OS panels show, the side menu is a plain list.
(function () {
  'use strict';
  var KEY = 'sgl-tutorial-toolkit-id'; // the final toolkit id (kept from the first tutorial version)
  var NAMER_KEY = 'sgl-tutorial-namer'; // { initials, name, own }
  var OS_KEY = 'sgl-tutorial-os';
  var CHECK_KEY = 'sgl-tutorial-setup';
  var ID_RULE = /^[a-z][a-z0-9-]*$/; // the owner's convention
  var OWN_RULE = /^[a-z][a-z0-9_-]*$/; // what the app accepts for an id made earlier
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
  function each(selector, fn, scope) {
    var list = (scope || document).querySelectorAll(selector);
    for (var i = 0; i < list.length; i++) fn(list[i], i);
  }
  function toggleClass(el, name, on) {
    var has = (' ' + el.className + ' ').indexOf(' ' + name + ' ') >= 0;
    if (on && !has) el.className = (el.className + ' ' + name).replace(/^\s+/, '');
    if (!on && has) el.className = (' ' + el.className + ' ').replace(' ' + name + ' ', ' ').replace(/^\s+|\s+$/g, '');
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
  function setUpOsTabs() {
    each('.os-tabs', function (box) {
      var bar = document.createElement('div');
      bar.className = 'os-switch';
      bar.setAttribute('role', 'tablist');
      bar.setAttribute('aria-label', 'Your computer');
      var choices = [['win', 'Windows'], ['mac', 'macOS']];
      for (var i = 0; i < choices.length; i++) {
        var b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('role', 'tab');
        b.setAttribute('data-os-choice', choices[i][0]);
        b.textContent = choices[i][1];
        b.addEventListener('click', function (event) { setOs(event.currentTarget.getAttribute('data-os-choice'), true); });
        b.addEventListener('keydown', function (event) {
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            setOs(os === 'win' ? 'mac' : 'win', true);
            var next = event.currentTarget.parentNode.querySelector('[aria-selected="true"]');
            if (next) next.focus();
          }
        });
        bar.appendChild(b);
      }
      box.insertBefore(bar, box.firstChild);
    });
    setOs(os, false);
  }

  // ---- Your toolkit name: initials + toolkit name -> toolkit id ----
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
        ? { id: own, ok: true, message: 'Using your existing toolkit id.' }
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

  function currentId() {
    var id = get(KEY);
    return OWN_RULE.test(id) ? id : '';
  }

  // Each <pre data-fill> keeps its original text; "<toolkit-id>" is replaced by your id when there is one.
  function fill(id) {
    each('pre[data-fill]', function (pre) {
      if (pre.getAttribute('data-original') === null) pre.setAttribute('data-original', pre.textContent);
      var original = pre.getAttribute('data-original');
      pre.textContent = id ? original.split('<toolkit-id>').join(id).replace(/^Toolkit id: ___$/m, 'Toolkit id: ' + id) : original;
    });
    each('[data-toolkit-id]', function (el) { el.textContent = id || '<toolkit-id>'; });
    if (window.sglBuildPrompts) window.sglBuildPrompts();
  }

  function setUpNamers() {
    var stored = getJson(NAMER_KEY);
    each('[data-namer]', function (box) {
      var initials = box.querySelector('[data-namer-initials]');
      var name = box.querySelector('[data-namer-name]');
      var own = box.querySelector('[data-namer-own]');
      var msg = box.querySelector('[data-namer-msg]');
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
      function update() {
        var values = { initials: initials ? initials.value : '', name: name ? name.value : '', own: own ? own.value : '' };
        try { localStorage.setItem(NAMER_KEY, JSON.stringify(values)); } catch (e) { /* not stored */ }
        var result = buildId(values.initials, values.name, values.own);
        show(result);
        if (initials) toggleClass(initials, 'invalid', !result.ok && !!result.message && !values.own && !slug(values.initials));
        if (name) toggleClass(name, 'invalid', !result.ok && !!result.message && !values.own && !slug(values.name));
        if (own) toggleClass(own, 'invalid', !!values.own && !result.ok);
        put(KEY, result.ok ? result.id : '');
        fill(result.ok ? result.id : '');
      }
      var inputs = [initials, name, own];
      for (var i = 0; i < inputs.length; i++) if (inputs[i]) inputs[i].addEventListener('input', update);
      // First show: keep an id saved earlier (also from the first tutorial version) when the fields are empty.
      var first = buildId(initials ? initials.value : '', name ? name.value : '', own ? own.value : '');
      if (first.ok) show(first);
      else if (currentId()) show({ ok: true, message: 'Your saved toolkit id is ' + currentId() + '. Type your initials and toolkit name to change it.' });
    });
  }

  // ---- Copy buttons ----
  function setUpCopyButtons() {
    each('.code pre', function (pre) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'copy';
      button.textContent = 'Copy';
      button.addEventListener('click', function () {
        var text = pre.textContent;
        var done = function (label, ms) { button.textContent = label; setTimeout(function () { button.textContent = 'Copy'; }, ms || 1600); };
        // A command with "<toolkit-id>" still in it fails with a confusing message in every terminal.
        // Commands are not copied then; a prompt is, with a reminder to fill it in.
        var unfilled = text.indexOf('<toolkit-id>') >= 0;
        var isPrompt = (pre.getAttribute('data-block') || '').indexOf('prompt') === 0;
        if (unfilled && !isPrompt) {
          done('Type your toolkit id first (top of the page)', 3500);
          return;
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () { done(unfilled ? 'Copied: replace <toolkit-id> with your id' : 'Copied', unfilled ? 3500 : 0); }, function () { done('Select and copy'); });
        } else {
          done('Select and copy');
        }
      });
      pre.parentNode.appendChild(button);
    });
  }

  // ---- Plan page: build both prompts from the form ----
  function setUpPromptBuilder() {
    var form = document.getElementById('prompt-form');
    if (!form) return;
    var targets = document.querySelectorAll('pre[data-build]');
    var stored = getJson('sgl-tutorial-plan');
    var fields = form.querySelectorAll('textarea[name]');
    for (var i = 0; i < fields.length; i++) {
      if (typeof stored[fields[i].name] === 'string') fields[i].value = stored[fields[i].name];
      fields[i].addEventListener('input', build);
    }
    function value(name) {
      var el = form.querySelector('[name="' + name + '"]');
      var text = el ? el.value.replace(/^\s+|\s+$/g, '').replace(/\s*\n\s*/g, ' ') : '';
      return text || '___';
    }
    function build() {
      var plan = {};
      for (var k = 0; k < fields.length; k++) plan[fields[k].name] = fields[k].value;
      try { localStorage.setItem('sgl-tutorial-plan', JSON.stringify(plan)); } catch (e) { /* not stored */ }
      var id = currentId();
      for (var t = 0; t < targets.length; t++) {
        var pre = targets[t];
        if (pre.getAttribute('data-template') === null) pre.setAttribute('data-template', pre.textContent);
        var lines = pre.getAttribute('data-template').split('\n');
        var out = [];
        for (var l = 0; l < lines.length; l++) {
          var line = lines[l];
          if (line === 'Toolkit id: ___') line = 'Toolkit id: ' + (id || '___');
          else if (line === 'My idea: ___') line = 'My idea: ' + value('idea');
          else if (line === 'Functions (and their attributes): ___') line = 'Functions (and their attributes): ' + value('functions');
          else if (line === 'Algorithms: ___') line = 'Algorithms: ' + value('algorithms');
          else if (line === 'Example design: ___') line = 'Example design: ' + value('design');
          else if (id) line = line.split('<toolkit-id>').join(id);
          out.push(line);
        }
        pre.textContent = out.join('\n');
      }
    }
    window.sglBuildPrompts = build;
    build();
  }

  // ---- Setup checklist (page 5): ticks and progress, saved in this browser ----
  function setUpChecklist() {
    var boxes = document.querySelectorAll('input[data-check]');
    if (!boxes.length) return;
    var saved = getJson(CHECK_KEY);
    function sectionOf(el) {
      while (el && !(el.tagName === 'SECTION' && el.id)) el = el.parentNode;
      return el;
    }
    function render() {
      var done = 0;
      for (var i = 0; i < boxes.length; i++) {
        if (boxes[i].checked) done++;
        var section = sectionOf(boxes[i]);
        if (section) each('.toc a[href="#' + section.id + '"]', function (a) { toggleClass(a, 'done', boxes[i].checked); });
      }
      each('[data-progress-count]', function (el) { el.textContent = done + ' / ' + boxes.length; });
      each('[data-progress-bar]', function (el) { el.style.width = Math.round((100 * done) / boxes.length) + '%'; });
      each('[data-progress-text]', function (el) {
        el.textContent = done === boxes.length ? 'All done: you are ready to make a toolkit.' : 'Tick each step as you complete it.';
      });
    }
    function save() {
      var state = {};
      for (var i = 0; i < boxes.length; i++) if (boxes[i].checked) state[boxes[i].getAttribute('data-check')] = true;
      try { localStorage.setItem(CHECK_KEY, JSON.stringify(state)); } catch (e) { /* not stored */ }
    }
    for (var i = 0; i < boxes.length; i++) {
      boxes[i].checked = saved[boxes[i].getAttribute('data-check')] === true;
      boxes[i].addEventListener('change', function () { save(); render(); });
    }
    each('[data-progress-reset]', function (button) {
      button.addEventListener('click', function () {
        for (var j = 0; j < boxes.length; j++) boxes[j].checked = false;
        save();
        render();
      });
    });
    render();
  }

  // ---- Side menu: closed on phones, the current section highlighted while you scroll ----
  function setUpSideMenu() {
    var narrow = window.matchMedia && window.matchMedia('(max-width: 880px)').matches;
    if (narrow) each('details.toc-box', function (d) { d.open = false; });
    var current = document.querySelector('nav.site a[aria-current="page"]');
    if (current && current.scrollIntoView && narrow) {
      var nav = current.parentNode;
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
    setUpPromptBuilder();
    setUpNamers();
    fill(currentId());
    setUpCopyButtons();
    setUpChecklist();
    setUpSideMenu();
  });
})();
