/*
 * Prototype behaviour, design system v1 (#50). Prototype only: apps/web never imports this file
 * (ADR-0006 section 3). Every behaviour is bound by event delegation on document, so markup added or
 * cloned later (the gallery's dark column) works without re-binding. The markup API is documented in
 * design/system/README.md, "proto.js API".
 */
(function () {
  "use strict";

  var TWO_PANE_QUERY = "(min-width: 1024px)"; // decision A8; the same 1024px as proto.css
  var CLICK_SLOP_PX = 4; // F9 split handle: a press that moves less than this is a click
  var SPLIT_STEP = 5; // arrow keys move the split by 5 % (F9)
  var STATE_PREFIX = "#state-";
  // The prototype's value of CHECK_STATUS_TEXT_GAP_MS (checks.md "Live regions", text gap: 100-150 ms, at
  // least one rendered frame; #34 sets the app's value). Applies only to the container below.
  var PROTO_STATUS_TEXT_GAP_MS = 150;
  var GAPPED_LIVE_KEY = "check-status";
  var LOCKABLE_INPUT = "input[type='radio'], input[type='checkbox']";
  var LOCKED_KEYS = [" ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
  var SCROLL_STOP = "[data-scroll-label]";
  var FOCUSABLE = [
    "a[href]",
    "button",
    "input",
    "select",
    "textarea",
    "summary",
    "[tabindex]:not([tabindex='-1'])",
  ].join(",");

  var WHITESPACE = new RegExp("\\s+"); // a RegExp literal here reads as a protocol-relative URL to the validator
  var root = document.documentElement;

  function words(text) {
    return (text || "").trim().split(WHITESPACE).filter(Boolean);
  }

  function isRendered(el) {
    return !el.closest("[hidden]") && el.getClientRects().length > 0;
  }

  function firstFocusable(container) {
    var candidates = container.querySelectorAll(FOCUSABLE);
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      if (el.getAttribute("tabindex") === "-1") continue;
      if (isRendered(el)) return el;
    }
    return null;
  }

  function focusInto(container) {
    var target = firstFocusable(container);
    if (target) {
      target.focus();
      return;
    }
    if (!container.hasAttribute("tabindex")) container.setAttribute("tabindex", "-1");
    container.focus();
  }

  /* ---------- Theme: follows prefers-color-scheme until the toggle is used ---------- */

  var schemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
  var themeChosenByHand = false;

  function setTheme(isDark) {
    root.classList.toggle("dark", isDark);
    document.querySelectorAll("[data-theme-toggle]").forEach(function (button) {
      button.setAttribute("aria-pressed", String(isDark));
    });
  }

  // <html data-theme-fixed> (the gallery) keeps the theme the markup sets: both themes side by side.
  var isThemeFixed = root.hasAttribute("data-theme-fixed");
  if (!isThemeFixed) setTheme(schemeQuery.matches);
  schemeQuery.addEventListener("change", function (event) {
    if (!themeChosenByHand && !isThemeFixed) setTheme(event.matches);
  });

  /* ---------- States: #state-<name> shows [data-state~="<name>"] ---------- */

  function stateNames() {
    var names = [];
    document.querySelectorAll("[data-state]").forEach(function (el) {
      words(el.getAttribute("data-state")).forEach(function (name) {
        if (name && names.indexOf(name) < 0) names.push(name);
      });
    });
    return names;
  }

  function isStateHash(hash) {
    return decodeURIComponent(hash || "").indexOf(STATE_PREFIX) === 0;
  }

  // A hash that is not #state- (the skip link, a table of contents, #<moduleId>) names an anchor, not
  // a state: the state already shown stays. No hash at all is the default state.
  function activeStateFromHash(names) {
    var hash = decodeURIComponent(window.location.hash || "");
    var fallback = root.getAttribute("data-default-state") || names[0] || "";
    if (isStateHash(hash)) {
      var requested = hash.slice(STATE_PREFIX.length);
      return names.indexOf(requested) >= 0 ? requested : fallback;
    }
    if (!hash) return fallback;
    var current = root.getAttribute("data-active-state");
    if (current && names.indexOf(current) >= 0) return current;
    return fallback;
  }

  function hasState(el, name, attribute) {
    return words(el.getAttribute(attribute || "data-state")).indexOf(name) >= 0;
  }

  function liveSourceFor(key, name) {
    var source = null;
    document.querySelectorAll("template[data-live-source]").forEach(function (template) {
      if (template.getAttribute("data-live-source") === key && hasState(template, name))
        source = template;
    });
    return source;
  }

  // A container may hold, in the page markup, the content it is loaded with (the nothing-to-run states,
  // checks.md "Containers and order"): on the first render the children whose data-state lists the loaded
  // state stay, so their text is there before any script runs and is not announced; the others go. Every
  // later state takes its content from the templates.
  function keepInitialContent(container, name) {
    var children = Array.prototype.slice.call(container.children);
    var kept = children.filter(function (child) {
      return hasState(child, name);
    });
    children.forEach(function (child) {
      if (kept.indexOf(child) < 0) child.remove();
    });
    return kept.length > 0;
  }

  // options.isInitial: the first render on load. options.mayResetEqual: a background change (B9), so a
  // check status text equal to the one shown is set again, a gap after an empty container.
  function fillLiveContainers(name, options) {
    document.querySelectorAll("[data-live-key]").forEach(function (container) {
      var key = container.getAttribute("data-live-key");
      if (options.isInitial && keepInitialContent(container, name)) return;
      var source = liveSourceFor(key, name);
      var content = source ? source.content.cloneNode(true) : null;
      if (key === GAPPED_LIVE_KEY && !options.isInitial) {
        scheduleStatusContent(container, content, options.mayResetEqual);
        return;
      }
      // R2: the container stays; only its content is replaced.
      if (content) container.replaceChildren(content);
      else container.replaceChildren();
    });
  }

  /* ---------- Status-text gap: the check status line (checks.md "Live regions", A69-24) ---------- */

  // A screen reader sees the accessibility tree once per rendered frame, so "X", "", "X" or two texts
  // inside one frame can reach it as no change. Two consecutive texts of the line, the empty one of a
  // re-set included, are therefore at least PROTO_STATUS_TEXT_GAP_MS apart, and the gap also counts from
  // the last dialog close, so a text set by a dialog button lands after the modal has gone (B6, B23).
  var lastDialogCloseAt = Number.NEGATIVE_INFINITY;

  function statusLineOf(container) {
    if (!container.protoStatusLine)
      container.protoStatusLine = { changedAt: Number.NEGATIVE_INFINITY, queue: [], timer: 0 };
    return container.protoStatusLine;
  }

  function scheduleStatusContent(container, content, mayResetEqual) {
    var line = statusLineOf(container);
    var text = content ? content.textContent.trim() : "";
    var shownText = container.textContent.trim();
    // Only the newest waiting text is set: a new change replaces whatever still waits. A text equal to the
    // one shown sets nothing (B11), and drops a waiting text that it replaces (usability n1); the B9
    // re-set happens only when nothing waits.
    var isWaiting = line.queue.length > 0;
    if (text !== shownText) line.queue = [content];
    else if (mayResetEqual && text && !isWaiting) line.queue = [null, content];
    else line.queue = [];
    flushStatusLine(container);
  }

  function flushStatusLine(container) {
    var line = statusLineOf(container);
    window.clearTimeout(line.timer);
    line.timer = 0;
    while (line.queue.length) {
      var dueAt = Math.max(line.changedAt, lastDialogCloseAt) + PROTO_STATUS_TEXT_GAP_MS;
      var wait = dueAt - performance.now();
      if (wait > 0) {
        line.timer = window.setTimeout(function () {
          flushStatusLine(container);
        }, wait);
        return;
      }
      var next = line.queue.shift();
      if (next) container.replaceChildren(next);
      else container.replaceChildren();
      line.changedAt = performance.now();
    }
  }

  function renderStateIndex(names, active) {
    document.querySelectorAll("[data-state-index]").forEach(function (index) {
      index.replaceChildren();
      names.forEach(function (name) {
        var labelSource = document.querySelector("[data-state-label][data-state~='" + name + "']");
        var link = document.createElement("a");
        link.href = STATE_PREFIX + name;
        link.textContent = labelSource ? labelSource.getAttribute("data-state-label") : name;
        if (name === active) link.setAttribute("aria-current", "true");
        index.appendChild(link);
      });
    });
  }

  var hasRendered = false;

  // options.keepTabs (a data-goto-state transition, A17): each tab list keeps its selected tab while the
  // new state still shows it. Without it (a hash load, Back, a typed #state-) data-select-in-states wins.
  // options.repairFocus: a change the learner did not activate here (window.proto.setState, a hash, Back);
  // focus that the change leaves on nothing is repaired (A69-19). options.focusReturn: the control Back
  // returns to. options.isBackground: window.proto.setState, which stands for a re-read or a stream event.
  function setState(name, options) {
    var settings = options || {};
    var isInitial = !hasRendered;
    hasRendered = true;
    var focusBefore = settings.repairFocus ? captureFocus() : null;
    var names = stateNames();
    var active = name || activeStateFromHash(names);
    var previous = root.getAttribute("data-active-state");
    document.querySelectorAll("[data-state]").forEach(function (el) {
      if (el.tagName === "TEMPLATE") return;
      el.hidden = !hasState(el, active);
    });
    root.setAttribute("data-active-state", active);
    applyStateOpenings(active, Boolean(settings.keepTabs));
    fillLiveContainers(active, {
      isInitial: isInitial,
      mayResetEqual: Boolean(settings.isBackground) && previous !== active,
    });
    syncNotifications();
    renderStateIndex(names, active);
    // Pages hook per-state setup (layout attributes, the shown pane) here; it runs before any focus move
    // of data-goto-state, so the focus target is already rendered.
    document.dispatchEvent(new CustomEvent("proto:statechange", { detail: { state: active } }));
    var returnTarget = backFocusTarget(settings.focusReturn);
    if (returnTarget) returnTarget.focus();
    else if (focusBefore) repairFocus(focusBefore);
  }

  // A control remembered inside a dialog is not Back's target: the dialog opens on its own initial
  // control every time, so Back to a dialog state lands on "Отмена", never on the action (F11.3, F13.1).
  // A control remembered inside a live container ("Открыть квиз" in the quiz notice) belonged to a clone
  // of its template, which the next state change detached; Back finds the re-rendered control by its id.
  function backFocusTarget(remembered) {
    var control =
      remembered && !remembered.isConnected && remembered.id
        ? document.getElementById(remembered.id)
        : remembered;
    if (!control || !isRendered(control)) return null;
    var dialog = control.closest("dialog");
    return dialog ? dialogInitialControl(dialog) : control;
  }

  function dialogInitialControl(dialog) {
    return dialog.querySelector("[autofocus]") || firstFocusable(dialog);
  }

  /* ---------- Background focus repair: data-focus-fallback (ia.md R2, A69-19) ---------- */

  // Taken before the change, because the focused element may be hidden or removed by it: the element,
  // the data-focus-fallback selectors of its ancestors, nearest first (a dialog's own attribute is one of
  // them), and the opener of the dialog it sits in.
  function captureFocus() {
    var el = document.activeElement;
    if (!el || el === document.body || el === root) return null;
    var fallbacks = [];
    var holder = el.closest("[data-focus-fallback]");
    while (holder) {
      fallbacks.push(holder.getAttribute("data-focus-fallback"));
      holder = holder.parentElement && holder.parentElement.closest("[data-focus-fallback]");
    }
    return { fallbacks: fallbacks, dialog: el.closest("dialog") };
  }

  function isFocusLost() {
    var active = document.activeElement;
    return !active || active === document.body || active === root || !isRendered(active);
  }

  function firstRendered(selector) {
    var matches = selector ? document.querySelectorAll(selector) : [];
    for (var i = 0; i < matches.length; i++) {
      if (isRendered(matches[i])) return matches[i];
    }
    return null;
  }

  // Focus moves only when the change left it on nothing: a page's own focus move in proto:statechange
  // (the lesson's per-state targets) and a focus still on a rendered control both stay.
  function repairFocus(before) {
    if (!isFocusLost()) return;
    var opener = before.dialog && before.dialog.protoOpener;
    // The close listener runs a task later; it must not move focus again over this repair.
    if (before.dialog) before.dialog.protoOpener = null;
    if (opener && isRendered(opener)) {
      opener.focus();
      return;
    }
    for (var i = 0; i < before.fallbacks.length; i++) {
      var target = firstRendered(before.fallbacks[i]);
      if (target) {
        focusElement(target);
        return;
      }
    }
    var main = document.querySelector("main");
    if (main && isRendered(main)) focusElement(main);
  }

  /* ---------- Back focus: the control activated from each history entry ---------- */

  // data-goto-state pushes an entry; the control activated from the entry it leaves is remembered, so
  // Back to that entry focuses it again when it is rendered (prototype only: the app pushes no entry per
  // action). Entry ids carry the load time, so entries of an earlier load never match this load's map.
  var ENTRY_PREFIX = String(Date.now()) + "-";
  var nextEntryNumber = 1;
  var activatedControls = {};

  function currentEntryId() {
    var state = history.state;
    if (state && typeof state.protoEntry === "string") return state.protoEntry;
    var id = ENTRY_PREFIX + nextEntryNumber++;
    history.replaceState({ protoEntry: id }, "");
    return id;
  }

  function rememberedControl() {
    var state = history.state;
    return (
      (state && typeof state.protoEntry === "string" && activatedControls[state.protoEntry]) || null
    );
  }

  function isTabShownIn(tab, name) {
    return !tab.hasAttribute("data-state") || hasState(tab, name);
  }

  // A tab list whose selected tab the state hides falls back to its data-select-in-states tab for the
  // state, else to its first tab the state shows, so a hidden tab never keeps its panel open.
  function applyTabSelection(list, name, keepTabs) {
    var tabs = Array.prototype.slice.call(list.querySelectorAll("[role='tab']"));
    var current = tabs.filter(function (tab) {
      return tab.getAttribute("aria-selected") === "true";
    })[0];
    if (keepTabs && current && isTabShownIn(current, name)) return;
    var chosen = tabs.filter(function (tab) {
      return hasState(tab, name, "data-select-in-states");
    })[0];
    if (!chosen && current && isTabShownIn(current, name)) return;
    if (!chosen)
      chosen = tabs.filter(function (tab) {
        return isTabShownIn(tab, name);
      })[0];
    if (chosen && chosen !== current) selectTab(chosen, false);
  }

  // data-select-in-states selects a tab, data-open-in-states opens a menu, dialog, tooltip or
  // collapsible, so a state can show "menu open" or "dialog open" without a click. Focus is not moved.
  function applyStateOpenings(name, keepTabs) {
    closeMenu(false);
    document.querySelectorAll("dialog[open]").forEach(closeDialog);
    document.querySelectorAll("[role='tablist']:not([data-pane-switch])").forEach(function (list) {
      if (list.querySelector("[role='tab'][data-select-in-states]"))
        applyTabSelection(list, name, keepTabs);
    });
    document.querySelectorAll("[data-open-in-states]").forEach(function (el) {
      var open = hasState(el, name, "data-open-in-states");
      if (el.tagName === "DIALOG") {
        if (open && typeof el.showModal === "function") el.showModal();
      } else if (el.hasAttribute("data-menu-trigger")) {
        if (open) showMenu(el, false);
      } else if (el.hasAttribute("data-tooltip")) {
        setTooltip(el, open);
      } else if (el.hasAttribute("data-collapsible")) {
        setCollapsible(el, open);
      }
    });
  }

  /* ---------- Notifications wrapper: a region only while a live container holds content (R2) ---------- */

  function syncNotifications() {
    document.querySelectorAll("[data-notifications]").forEach(function (wrapper) {
      var heading = wrapper.querySelector("[data-notifications-heading]");
      var hasContent = Array.prototype.some.call(
        wrapper.querySelectorAll("[data-live-key]"),
        function (container) {
          return container.childNodes.length > 0;
        },
      );
      if (hasContent) {
        wrapper.setAttribute("role", "region");
        if (heading && heading.id) wrapper.setAttribute("aria-labelledby", heading.id);
        if (heading) heading.hidden = false;
      } else {
        wrapper.removeAttribute("role");
        wrapper.removeAttribute("aria-labelledby");
        if (heading) heading.hidden = true;
      }
    });
  }

  /* ---------- Lesson layout: two panes or one pane (A8) ---------- */

  var twoPaneQuery = window.matchMedia(TWO_PANE_QUERY);

  function isOnePane(layout) {
    if (layout.getAttribute("data-environment") === "none") return false;
    var forced = layout.getAttribute("data-force-layout");
    if (forced === "one-pane") return true;
    if (forced === "two-pane") return false;
    return !twoPaneQuery.matches;
  }

  function applyLayout(layout) {
    var onePane = isOnePane(layout);
    var active = layout.getAttribute("data-active-pane") || "lesson";
    layout.classList.toggle("is-one-pane", onePane);
    layout.querySelectorAll(":scope > .pane[data-pane]").forEach(function (pane) {
      pane.hidden = onePane && pane.getAttribute("data-pane") !== active;
    });
    layout.querySelectorAll("[data-pane-switch] [role='tab']").forEach(function (tab) {
      var selected = tab.getAttribute("data-show-pane") === active;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
  }

  function layoutOf(el) {
    return (el && el.closest(".lesson-layout")) || document.querySelector(".lesson-layout");
  }

  function showPane(name, from) {
    var layout = layoutOf(from);
    if (!layout) return null;
    layout.setAttribute("data-active-pane", name);
    applyLayout(layout);
    return layout.querySelector(":scope > .pane[data-pane='" + name + "']");
  }

  function applyAllLayouts() {
    document.querySelectorAll(".lesson-layout").forEach(applyLayout);
  }
  twoPaneQuery.addEventListener("change", applyAllLayouts);

  /* ---------- Tabs (WAI-ARIA tabs, automatic activation) ---------- */

  function selectTab(tab, moveFocus) {
    var list = tab.closest("[role='tablist']");
    if (!list) return;
    if (list.hasAttribute("data-pane-switch")) {
      var pane = showPane(tab.getAttribute("data-show-pane"), tab);
      var twin =
        pane &&
        pane.querySelector(
          "[data-pane-switch] [data-show-pane='" + tab.getAttribute("data-show-pane") + "']",
        );
      if (twin && moveFocus !== false) twin.focus();
      return;
    }
    list.querySelectorAll("[role='tab']").forEach(function (other) {
      var selected = other === tab;
      other.setAttribute("aria-selected", String(selected));
      other.tabIndex = selected ? 0 : -1;
      var panel = document.getElementById(other.getAttribute("aria-controls"));
      if (panel) panel.hidden = !selected;
    });
  }

  function initTabs() {
    document.querySelectorAll("[role='tablist']:not([data-pane-switch])").forEach(function (list) {
      var tabs = list.querySelectorAll("[role='tab']");
      var selected = list.querySelector("[role='tab'][aria-selected='true']") || tabs[0];
      if (selected) selectTab(selected, false);
    });
  }

  function onTabKey(event, tab) {
    var list = tab.closest("[role='tablist']");
    var tabs = Array.prototype.filter.call(list.querySelectorAll("[role='tab']"), isRendered);
    var index = tabs.indexOf(tab);
    var next = null;
    if (event.key === "ArrowRight") next = tabs[(index + 1) % tabs.length];
    else if (event.key === "ArrowLeft") next = tabs[(index - 1 + tabs.length) % tabs.length];
    else if (event.key === "Home") next = tabs[0];
    else if (event.key === "End") next = tabs[tabs.length - 1];
    if (!next) return;
    event.preventDefault();
    next.focus();
    selectTab(next, true);
  }

  /* ---------- DropdownMenu ---------- */

  var openMenu = null;

  function menuItems(menu) {
    return Array.prototype.filter.call(menu.querySelectorAll("[role^='menuitem']"), isRendered);
  }

  function closeMenu(returnFocus) {
    if (!openMenu) return;
    var trigger = openMenu.trigger;
    openMenu.menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    openMenu = null;
    if (returnFocus) trigger.focus();
  }

  function showMenu(trigger, moveFocus) {
    var menu = document.getElementById(trigger.getAttribute("aria-controls"));
    if (!menu) return;
    closeMenu(false);
    menu.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    openMenu = { menu: menu, trigger: trigger };
    var items = menuItems(menu);
    if (moveFocus && items[0]) items[0].focus();
  }

  function onMenuKey(event) {
    var items = menuItems(openMenu.menu);
    var index = items.indexOf(document.activeElement);
    var next = null;
    if (event.key === "ArrowDown") next = items[(index + 1) % items.length];
    else if (event.key === "ArrowUp") next = items[(index - 1 + items.length) % items.length];
    else if (event.key === "Home") next = items[0];
    else if (event.key === "End") next = items[items.length - 1];
    else if (event.key === "Escape") {
      event.preventDefault();
      closeMenu(true);
      return;
    } else if (event.key === "Tab") {
      closeMenu(false);
      return;
    }
    if (next) {
      event.preventDefault();
      next.focus();
    }
  }

  /* ---------- AlertDialog (native <dialog>) ---------- */

  function closeDialog(dialog) {
    lastDialogCloseAt = performance.now();
    dialog.close();
  }

  function openDialog(id, opener) {
    var dialog = document.getElementById(id);
    if (!dialog || typeof dialog.showModal !== "function") return;
    dialog.protoOpener = opener;
    dialog.showModal();
    var initial = dialogInitialControl(dialog);
    if (initial) initial.focus();
  }

  // Focus after a close: the opener while it is rendered, else the dialog's own data-focus-fallback when
  // focus was left on nothing. A dialog opened by data-open-in-states has no opener, and it sits outside
  // the region it returns to, so only its own attribute can name the target (Esc, "Отмена").
  document.addEventListener(
    "close",
    function (event) {
      var dialog = event.target;
      if (dialog.tagName !== "DIALOG") return;
      lastDialogCloseAt = performance.now();
      var opener = dialog.protoOpener;
      dialog.protoOpener = null;
      if (opener && isRendered(opener)) {
        opener.focus();
        return;
      }
      var target = isFocusLost() ? firstRendered(dialog.getAttribute("data-focus-fallback")) : null;
      if (target) focusElement(target);
    },
    true,
  );

  /* ---------- Tooltip: hover and focus, hoverable, Esc closes (WCAG 1.4.13) ---------- */

  function tooltipFor(trigger) {
    return document.getElementById(trigger.getAttribute("data-tooltip"));
  }

  function setTooltip(trigger, visible) {
    var tip = tooltipFor(trigger);
    if (tip) tip.hidden = !visible;
  }

  document.addEventListener("pointerover", function (event) {
    var trigger = event.target.closest("[data-tooltip]");
    if (trigger) setTooltip(trigger, true);
  });
  // The anchor may itself be the trigger (the split handle is both), so it is checked before its children.
  function tooltipTriggerOf(anchor) {
    return anchor.matches("[data-tooltip]") ? anchor : anchor.querySelector("[data-tooltip]");
  }

  // Only keyboard focus keeps a tooltip open after the pointer leaves: a click also focuses the trigger,
  // and that focus must not pin the tooltip until Esc or blur.
  function isKeyboardFocused(el) {
    return el === document.activeElement && el.matches(":focus-visible");
  }

  document.addEventListener("pointerout", function (event) {
    var anchor = event.target.closest(".tooltip-anchor");
    if (!anchor || anchor.contains(event.relatedTarget)) return;
    var trigger = tooltipTriggerOf(anchor);
    if (trigger && !isKeyboardFocused(trigger)) setTooltip(trigger, false);
  });
  document.addEventListener("focusin", function (event) {
    var trigger = event.target.closest && event.target.closest("[data-tooltip]");
    if (trigger && trigger.matches(":focus-visible")) setTooltip(trigger, true);
  });
  document.addEventListener("focusout", function (event) {
    var trigger = event.target.closest && event.target.closest("[data-tooltip]");
    if (trigger) setTooltip(trigger, false);
  });

  /* ---------- Split handle: drag, click or Enter cycles presets, arrows, Home, End (F9.3) ---------- */

  function handleRange(handle) {
    return {
      min: Number(handle.getAttribute("aria-valuemin") || 25),
      max: Number(handle.getAttribute("aria-valuemax") || 75),
    };
  }

  function setSplit(handle, percent) {
    var range = handleRange(handle);
    var value = Math.round(Math.min(range.max, Math.max(range.min, percent)));
    var layout = layoutOf(handle);
    if (layout) layout.style.setProperty("--split-left", value + "%");
    handle.setAttribute("aria-valuenow", String(value));
    handle.setAttribute("aria-valuetext", value + " %");
  }

  // After a free drag the value matches no preset; the cycle then restarts at the first preset.
  function cyclePreset(handle) {
    var presets = words(handle.getAttribute("data-presets") || "50 35 65").map(Number);
    var current = Number(handle.getAttribute("aria-valuenow"));
    var index = presets.indexOf(current);
    setSplit(handle, presets[index < 0 ? 0 : (index + 1) % presets.length]);
  }

  var drag = null;

  document.addEventListener("pointerdown", function (event) {
    var handle = event.target.closest(".resizable-handle[role='separator']");
    if (!handle) return;
    drag = { handle: handle, startX: event.clientX, moved: false };
    handle.setPointerCapture(event.pointerId);
  });
  document.addEventListener("pointermove", function (event) {
    if (!drag) return;
    if (Math.abs(event.clientX - drag.startX) >= CLICK_SLOP_PX) drag.moved = true;
    if (!drag.moved) return;
    var layout = layoutOf(drag.handle);
    var box = layout.getBoundingClientRect();
    setSplit(drag.handle, ((event.clientX - box.left) / box.width) * 100);
  });
  document.addEventListener("pointerup", function () {
    if (!drag) return;
    if (!drag.moved) cyclePreset(drag.handle);
    drag.handle.focus();
    drag = null;
  });

  function onHandleKey(event, handle) {
    var range = handleRange(handle);
    var current = Number(handle.getAttribute("aria-valuenow"));
    if (event.key === "ArrowLeft") setSplit(handle, current - SPLIT_STEP);
    else if (event.key === "ArrowRight") setSplit(handle, current + SPLIT_STEP);
    else if (event.key === "Home") setSplit(handle, range.min);
    else if (event.key === "End") setSplit(handle, range.max);
    else if (event.key === "Enter") cyclePreset(handle);
    else return;
    event.preventDefault();
  }

  /* ---------- Region cycle: F6 / Shift+F6, Ctrl+Shift+. / Ctrl+Shift+, (R3) ---------- */

  function regionCandidates() {
    return Array.prototype.filter.call(
      document.querySelectorAll("[data-region]"),
      function (region) {
        if (region.hasAttribute("data-notifications") && region.getAttribute("role") !== "region")
          return false;
        var layout = region.closest(".lesson-layout");
        var hiddenPane =
          region.matches(".pane[data-pane]") &&
          region.hidden &&
          layout &&
          layout.classList.contains("is-one-pane");
        if (hiddenPane) return !region.parentElement.closest("[hidden]");
        return isRendered(region);
      },
    );
  }

  function cycleRegion(step) {
    var regions = regionCandidates();
    if (!regions.length) return;
    var active = document.activeElement;
    var current = -1;
    regions.forEach(function (region, i) {
      if (region.contains(active)) current = i;
    });
    var target;
    if (current >= 0) {
      target = regions[(current + step + regions.length) % regions.length];
    } else {
      // Focus outside every region (the split handle, body): take the nearest region in DOM order.
      var following = regions.filter(function (region) {
        return (
          active &&
          active !== document.body &&
          active.compareDocumentPosition(region) & Node.DOCUMENT_POSITION_FOLLOWING
        );
      });
      if (step > 0) target = following[0] || regions[0];
      else {
        var preceding = regions.filter(function (region) {
          return following.indexOf(region) < 0;
        });
        target = preceding[preceding.length - 1] || regions[regions.length - 1];
      }
    }
    if (target.matches(".pane[data-pane]") && target.hidden)
      showPane(target.getAttribute("data-pane"), target);
    focusInto(target);
  }

  function regionStep(event) {
    if (event.key === "F6" && !event.ctrlKey && !event.altKey && !event.metaKey)
      return event.shiftKey ? -1 : 1;
    if (event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey) {
      if (event.code === "Period") return 1;
      if (event.code === "Comma") return -1;
    }
    return 0;
  }

  // Capture phase, so the keys reach the page before a terminal (xterm in the app) handles them.
  window.addEventListener(
    "keydown",
    function (event) {
      var step = regionStep(event);
      if (!step || !document.querySelector("[data-region]")) return;
      if (document.querySelector("dialog[open]")) return;
      event.preventDefault();
      event.stopPropagation();
      closeMenu(false);
      cycleRegion(step);
    },
    true,
  );

  /* ---------- Collapsible ---------- */

  function setCollapsible(trigger, expanded) {
    trigger.setAttribute("aria-expanded", String(expanded));
    var content = document.getElementById(trigger.getAttribute("aria-controls"));
    if (content) content.hidden = !expanded;
    var label = trigger.getAttribute(expanded ? "data-label-expanded" : "data-label-collapsed");
    var labelTarget = trigger.querySelector("[data-collapsible-label]") || trigger;
    if (label) labelTarget.textContent = label;
  }

  /* ---------- In-page anchors: move focus, keep the state ---------- */

  // The element that receives focus for an anchor target: the target itself when it can take focus,
  // else its first heading with tabindex="-1" (a section whose heading is the landing point), else the
  // target made programmatically focusable.
  function anchorFocusTarget(target) {
    if (target.matches(FOCUSABLE) || target.hasAttribute("tabindex")) return target;
    var heading = target.querySelector(
      "h1[tabindex='-1'], h2[tabindex='-1'], h3[tabindex='-1'], h4[tabindex='-1']",
    );
    if (heading) return heading;
    target.setAttribute("tabindex", "-1");
    return target;
  }

  // A target inside a [data-anchor-block] (an option of a quiz question) scrolls the block's top into view,
  // so its heading and prompt show above the focused option; the second call brings the target back when
  // the block is taller than the viewport, and does nothing when it is already in view.
  function focusAnchor(id) {
    var target = id && document.getElementById(id);
    if (!target || target.closest("[hidden]")) return false;
    var focusTarget = anchorFocusTarget(target);
    var block = target.closest("[data-anchor-block]");
    focusTarget.focus({ preventScroll: true });
    (block || target).scrollIntoView({ block: "start" });
    if (block) target.scrollIntoView({ block: "nearest" });
    return true;
  }

  function anchorId(hash) {
    return decodeURIComponent((hash || "").slice(1));
  }

  // data-focus="<selector>": the element that takes focus after a simulated action. A target that cannot
  // take focus (a heading, a panel) is made programmatically focusable.
  function focusElement(target) {
    if (!target.matches(FOCUSABLE) && !target.hasAttribute("tabindex"))
      target.setAttribute("tabindex", "-1");
    target.focus();
  }

  function focusSelector(selector) {
    var target = selector && document.querySelector(selector);
    if (target) focusElement(target);
  }

  /* ---------- Simulated outcome: data-goto-state + data-focus ---------- */

  // A control with data-goto-state="<name>" fakes its outcome: a new history entry #state-<name> (Back
  // returns to the previous state through popstate or hashchange), the state is shown with every tab list
  // keeping its tab (A17), data-select-tab="<tab id>" then selects a tab the action names, and data-focus is
  // focused.
  function gotoState(trigger) {
    var name = trigger.getAttribute("data-goto-state");
    var dialog = trigger.closest("dialog");
    // The dialog's own close handler would return focus to its opener a task later, over data-focus.
    if (dialog) dialog.protoOpener = null;
    activatedControls[currentEntryId()] = trigger;
    history.pushState({ protoEntry: ENTRY_PREFIX + nextEntryNumber++ }, "", STATE_PREFIX + name);
    setState(name, { keepTabs: true });
    var namedTab = document.getElementById(trigger.getAttribute("data-select-tab") || "");
    if (namedTab) selectTab(namedTab, false);
    focusSelector(trigger.getAttribute("data-focus"));
  }

  /* ---------- Click and key delegation ---------- */

  // R1: an aria-disabled control stays focusable and does nothing when activated.
  document.addEventListener(
    "click",
    function (event) {
      if (event.target.closest("[aria-disabled='true']")) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );

  // R1 for a locked radio or checkbox (quiz answers while sending): Space and the arrow keys change
  // nothing. The click capture above cancels the click that Space, and in Chromium and WebKit an arrow key,
  // fires, and a cancelled click restores the checked state; but an arrow key still moves focus to the next
  // radio, which is then focused and unchecked. Cancelling the keys here keeps focus on the option, as the
  // app does by cancelling the arrow keys before Radix handles them (quiz.md "Sending").
  document.addEventListener(
    "keydown",
    function (event) {
      var el = event.target;
      if (!el.matches || !el.matches(LOCKABLE_INPUT)) return;
      if (!el.closest("[aria-disabled='true']")) return;
      if (LOCKED_KEYS.indexOf(event.key) !== -1) event.preventDefault();
    },
    true,
  );

  document.addEventListener("click", function (event) {
    var el = event.target;

    var themeToggle = el.closest("[data-theme-toggle]");
    if (themeToggle) {
      themeChosenByHand = true;
      setTheme(!root.classList.contains("dark"));
      return;
    }

    var tab = el.closest("[role='tab']");
    if (tab) {
      selectTab(tab, true);
      return;
    }

    var menuTrigger = el.closest("[data-menu-trigger]");
    if (menuTrigger) {
      if (openMenu && openMenu.trigger === menuTrigger) closeMenu(true);
      else showMenu(menuTrigger, true);
      return;
    }

    var menuItem = el.closest("[role^='menuitem']");
    if (menuItem && openMenu) {
      if (menuItem.getAttribute("role") === "menuitemcheckbox") {
        menuItem.setAttribute(
          "aria-checked",
          String(menuItem.getAttribute("aria-checked") !== "true"),
        );
        return;
      }
      var opener = openMenu.trigger;
      closeMenu(true);
      var menuDialog = menuItem.getAttribute("data-dialog-open");
      if (menuDialog) openDialog(menuDialog, opener);
      return;
    }
    if (openMenu && !openMenu.menu.contains(el)) closeMenu(false);

    var dialogOpener = el.closest("[data-dialog-open]");
    if (dialogOpener) {
      openDialog(dialogOpener.getAttribute("data-dialog-open"), dialogOpener);
      return;
    }

    var dialogCloser = el.closest("[data-dialog-close]");
    if (dialogCloser) {
      closeDialog(dialogCloser.closest("dialog"));
      return;
    }

    var collapsible = el.closest("[data-collapsible]");
    if (collapsible) {
      setCollapsible(collapsible, collapsible.getAttribute("aria-expanded") !== "true");
      return;
    }

    var paneControl = el.closest("[data-show-pane]");
    if (paneControl) {
      showPane(paneControl.getAttribute("data-show-pane"), paneControl);
      var tabId = paneControl.getAttribute("data-select-tab");
      if (tabId && document.getElementById(tabId)) selectTab(document.getElementById(tabId), false);
      focusSelector(paneControl.getAttribute("data-focus"));
      return;
    }

    var copy = el.closest("[data-copy]");
    if (copy) {
      var source = document.querySelector(copy.getAttribute("data-copy"));
      var denied = function () {
        var deniedLabel = copy.getAttribute("data-copy-denied");
        if (deniedLabel) copy.textContent = deniedLabel;
      };
      if (!source || !navigator.clipboard) {
        denied();
        return;
      }
      navigator.clipboard.writeText(source.textContent).catch(denied);
      return;
    }

    // An in-page link keeps the URL on its #state- hash, so a reload shows the same state.
    var anchor = el.closest("a[href^='#']");
    if (anchor && !event.defaultPrevented && !isStateHash(anchor.getAttribute("href"))) {
      if (focusAnchor(anchorId(anchor.getAttribute("href")))) event.preventDefault();
    }
  });

  // Registered after the dispatcher above, so it runs once a menu item or dialog button has done its own
  // work (closing the menu, closing the dialog); aria-disabled clicks never reach it (R1 capture above).
  document.addEventListener("click", function (event) {
    var trigger = event.target.closest("[data-goto-state]");
    if (trigger) gotoState(trigger);
  });

  document.addEventListener("keydown", function (event) {
    var el = event.target;
    if (openMenu && openMenu.menu.contains(el)) {
      onMenuKey(event);
      return;
    }
    if (event.key === "Escape") {
      document.querySelectorAll("[data-tooltip]").forEach(function (trigger) {
        setTooltip(trigger, false);
      });
    }
    var tab = el.closest && el.closest("[role='tab']");
    if (tab) {
      onTabKey(event, tab);
      return;
    }
    var handle = el.closest && el.closest(".resizable-handle[role='separator']");
    if (handle) onHandleKey(event, handle);
  });

  /* ---------- Scrollable code: a code block is a Tab stop only while it overflows (WCAG 2.1.1) ---------- */

  // Every element with data-scroll-label="<name>" (each .code-block pre: lesson prose, quiz prompt and
  // quiz explanation; README "Scrollable code") that scrolls sideways takes tabindex="0", role="group" and
  // that name; one that fits takes none of them, because there is nothing to scroll. A focused element
  // keeps them until it loses focus, so a resize that makes it fit never drops focus to body.
  function syncScrollStop(el) {
    if (el.scrollWidth > el.clientWidth) {
      el.setAttribute("tabindex", "0");
      el.setAttribute("role", "group");
      el.setAttribute("aria-label", el.getAttribute("data-scroll-label"));
    } else if (document.activeElement !== el) {
      el.removeAttribute("tabindex");
      el.removeAttribute("role");
      el.removeAttribute("aria-label");
    }
  }

  // Showing, hiding and resizing an element all change its box, so one observer covers states, the
  // one-pane switch and the window width.
  var scrollStopObserver = new ResizeObserver(function (entries) {
    entries.forEach(function (entry) {
      syncScrollStop(entry.target);
    });
  });

  document.addEventListener("focusout", function (event) {
    var el = event.target;
    if (el.matches && el.matches(SCROLL_STOP)) syncScrollStop(el);
  });

  /* ---------- Start ---------- */

  function start() {
    document.querySelectorAll(SCROLL_STOP).forEach(function (el) {
      scrollStopObserver.observe(el);
    });
    document.querySelectorAll(".dropdown-menu, .tooltip").forEach(function (el) {
      el.hidden = true;
    });
    document.querySelectorAll(".resizable-handle[role='separator']").forEach(function (handle) {
      setSplit(handle, Number(handle.getAttribute("aria-valuenow") || 50));
    });
    setTheme(root.classList.contains("dark"));
    document.querySelectorAll("[data-collapsible]").forEach(function (trigger) {
      setCollapsible(trigger, trigger.getAttribute("aria-expanded") === "true");
    });
    initTabs();
    applyAllLayouts();
    setState();
  }

  // Arrival with an anchor hash (#<moduleId> from the dashboard) lands focus on that anchor. It runs
  // after load and one task later, because the browser's own fragment navigation runs after
  // DOMContentLoaded and would otherwise leave focus on body.
  function focusArrivalAnchor() {
    window.setTimeout(function () {
      var hash = window.location.hash;
      if (hash && !isStateHash(hash)) focusAnchor(anchorId(hash));
    }, 0);
  }

  // A typed or history-restored anchor hash moves focus and leaves the state as it is. A state hash (Back,
  // Forward, a typed #state-, the state index) returns focus to the control activated from that entry, else
  // repairs focus the change left on nothing.
  function onHistoryMove() {
    if (!window.location.hash || isStateHash(window.location.hash))
      setState(null, { repairFocus: true, focusReturn: rememberedControl() });
    else focusAnchor(anchorId(window.location.hash));
  }

  // Back and Forward between two entries whose query differs as well as the hash (a page that writes its
  // query with replaceState, as the lesson writes ?tab=) fire popstate and no hashchange, so the state
  // follows popstate. A move that fires both is handled once: by popstate, which comes first.
  var popstateEntry = null;

  function historyEntryKey() {
    var state = history.state;
    var entry = state && typeof state.protoEntry === "string" ? state.protoEntry : "";
    return window.location.hash + " " + entry;
  }

  window.addEventListener("popstate", function () {
    popstateEntry = historyEntryKey();
    onHistoryMove();
  });
  window.addEventListener("hashchange", function () {
    var isHandled = popstateEntry === historyEntryKey();
    popstateEntry = null;
    if (!isHandled) onHistoryMove();
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
  if (document.readyState === "complete") focusArrivalAnchor();
  else window.addEventListener("load", focusArrivalAnchor);

  // window.proto.setState stands for a change the learner did not make here (a re-read on return to the
  // tab, a stream event): focus it leaves on nothing is repaired, and an equal check status text of
  // another state is set again (B9); the same state sets nothing (B11).
  // statusTextGapMs: the gap a page script waits after the check status line's last text before it writes
  // a container of its own that must be announced after it (the lesson's history status container), so the
  // value has one source.
  window.proto = {
    statusTextGapMs: PROTO_STATUS_TEXT_GAP_MS,
    setState: function (name) {
      setState(name, { repairFocus: true, isBackground: true });
    },
    showPane: showPane,
    syncNotifications: syncNotifications,
    setTheme: setTheme,
    focusAnchor: focusAnchor,
  };
})();
