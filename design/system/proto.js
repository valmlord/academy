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
  var FOCUSABLE = [
    "a[href]", "button", "input", "select", "textarea", "summary",
    "[tabindex]:not([tabindex='-1'])"
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

  function fillLiveContainers(name) {
    document.querySelectorAll("[data-live-key]").forEach(function (container) {
      var key = container.getAttribute("data-live-key");
      var source = null;
      document.querySelectorAll("template[data-live-source]").forEach(function (template) {
        if (template.getAttribute("data-live-source") === key && hasState(template, name)) source = template;
      });
      // R2: the container stays; only its content is replaced.
      if (source) container.replaceChildren(source.content.cloneNode(true));
      else container.replaceChildren();
    });
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

  // options.keepTabs (a data-goto-state transition, A17): each tab list keeps its selected tab while the
  // new state still shows it. Without it (a hash load, Back, a typed #state-) data-select-in-states wins.
  function setState(name, options) {
    var keepTabs = Boolean(options && options.keepTabs);
    var names = stateNames();
    var active = name || activeStateFromHash(names);
    document.querySelectorAll("[data-state]").forEach(function (el) {
      if (el.tagName === "TEMPLATE") return;
      el.hidden = !hasState(el, active);
    });
    root.setAttribute("data-active-state", active);
    applyStateOpenings(active, keepTabs);
    fillLiveContainers(active);
    syncNotifications();
    renderStateIndex(names, active);
    // Pages hook per-state setup (layout attributes, the shown pane) here; it runs before any focus move
    // of data-goto-state, so the focus target is already rendered.
    document.dispatchEvent(new CustomEvent("proto:statechange", { detail: { state: active } }));
  }

  function isTabShownIn(tab, name) {
    return !tab.hasAttribute("data-state") || hasState(tab, name);
  }

  // A tab list whose selected tab the state hides falls back to its data-select-in-states tab for the
  // state, else to its first tab the state shows, so a hidden tab never keeps its panel open.
  function applyTabSelection(list, name, keepTabs) {
    var tabs = Array.prototype.slice.call(list.querySelectorAll("[role='tab']"));
    var current = tabs.filter(function (tab) { return tab.getAttribute("aria-selected") === "true"; })[0];
    if (keepTabs && current && isTabShownIn(current, name)) return;
    var chosen = tabs.filter(function (tab) { return hasState(tab, name, "data-select-in-states"); })[0];
    if (!chosen && current && isTabShownIn(current, name)) return;
    if (!chosen) chosen = tabs.filter(function (tab) { return isTabShownIn(tab, name); })[0];
    if (chosen && chosen !== current) selectTab(chosen, false);
  }

  // data-select-in-states selects a tab, data-open-in-states opens a menu, dialog, tooltip or
  // collapsible, so a state can show "menu open" or "dialog open" without a click. Focus is not moved.
  function applyStateOpenings(name, keepTabs) {
    closeMenu(false);
    document.querySelectorAll("dialog[open]").forEach(function (dialog) { dialog.close(); });
    document.querySelectorAll("[role='tablist']:not([data-pane-switch])").forEach(function (list) {
      if (list.querySelector("[role='tab'][data-select-in-states]")) applyTabSelection(list, name, keepTabs);
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
      var hasContent = Array.prototype.some.call(wrapper.querySelectorAll("[data-live-key]"), function (container) {
        return container.childNodes.length > 0;
      });
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
      var twin = pane && pane.querySelector("[data-pane-switch] [data-show-pane='" + tab.getAttribute("data-show-pane") + "']");
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
    else if (event.key === "Escape") { event.preventDefault(); closeMenu(true); return; }
    else if (event.key === "Tab") { closeMenu(false); return; }
    if (next) { event.preventDefault(); next.focus(); }
  }

  /* ---------- AlertDialog (native <dialog>) ---------- */

  function openDialog(id, opener) {
    var dialog = document.getElementById(id);
    if (!dialog || typeof dialog.showModal !== "function") return;
    dialog.protoOpener = opener;
    dialog.showModal();
    var initial = dialog.querySelector("[autofocus]") || firstFocusable(dialog);
    if (initial) initial.focus();
  }

  document.addEventListener("close", function (event) {
    var dialog = event.target;
    if (dialog.tagName === "DIALOG" && dialog.protoOpener) {
      dialog.protoOpener.focus();
      dialog.protoOpener = null;
    }
  }, true);

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
      max: Number(handle.getAttribute("aria-valuemax") || 75)
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
    return Array.prototype.filter.call(document.querySelectorAll("[data-region]"), function (region) {
      if (region.hasAttribute("data-notifications") && region.getAttribute("role") !== "region") return false;
      var layout = region.closest(".lesson-layout");
      var hiddenPane = region.matches(".pane[data-pane]") && region.hidden && layout && layout.classList.contains("is-one-pane");
      if (hiddenPane) return !region.parentElement.closest("[hidden]");
      return isRendered(region);
    });
  }

  function cycleRegion(step) {
    var regions = regionCandidates();
    if (!regions.length) return;
    var active = document.activeElement;
    var current = -1;
    regions.forEach(function (region, i) { if (region.contains(active)) current = i; });
    var target;
    if (current >= 0) {
      target = regions[(current + step + regions.length) % regions.length];
    } else {
      // Focus outside every region (the split handle, body): take the nearest region in DOM order.
      var following = regions.filter(function (region) {
        return active && active !== document.body &&
          (active.compareDocumentPosition(region) & Node.DOCUMENT_POSITION_FOLLOWING);
      });
      if (step > 0) target = following[0] || regions[0];
      else {
        var preceding = regions.filter(function (region) { return following.indexOf(region) < 0; });
        target = preceding[preceding.length - 1] || regions[regions.length - 1];
      }
    }
    if (target.matches(".pane[data-pane]") && target.hidden) showPane(target.getAttribute("data-pane"), target);
    focusInto(target);
  }

  function regionStep(event) {
    if (event.key === "F6" && !event.ctrlKey && !event.altKey && !event.metaKey) return event.shiftKey ? -1 : 1;
    if (event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey) {
      if (event.code === "Period") return 1;
      if (event.code === "Comma") return -1;
    }
    return 0;
  }

  // Capture phase, so the keys reach the page before a terminal (xterm in the app) handles them.
  window.addEventListener("keydown", function (event) {
    var step = regionStep(event);
    if (!step || !document.querySelector("[data-region]")) return;
    if (document.querySelector("dialog[open]")) return;
    event.preventDefault();
    event.stopPropagation();
    closeMenu(false);
    cycleRegion(step);
  }, true);

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
    var heading = target.querySelector("h1[tabindex='-1'], h2[tabindex='-1'], h3[tabindex='-1'], h4[tabindex='-1']");
    if (heading) return heading;
    target.setAttribute("tabindex", "-1");
    return target;
  }

  function focusAnchor(id) {
    var target = id && document.getElementById(id);
    if (!target || target.closest("[hidden]")) return false;
    var focusTarget = anchorFocusTarget(target);
    focusTarget.focus({ preventScroll: true });
    target.scrollIntoView({ block: "start" });
    return true;
  }

  function anchorId(hash) {
    return decodeURIComponent((hash || "").slice(1));
  }

  // data-focus="<selector>": the element that takes focus after a simulated action. A target that cannot
  // take focus (a heading, a panel) is made programmatically focusable.
  function focusSelector(selector) {
    var target = selector && document.querySelector(selector);
    if (!target) return;
    if (!target.matches(FOCUSABLE) && !target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus();
  }

  /* ---------- Simulated outcome: data-goto-state + data-focus ---------- */

  // A control with data-goto-state="<name>" fakes its outcome: a new history entry #state-<name> (Back
  // returns to the previous state through hashchange), the state is shown with every tab list keeping its
  // tab (A17), data-select-tab="<tab id>" then selects a tab the action names, and data-focus is focused.
  function gotoState(trigger) {
    var name = trigger.getAttribute("data-goto-state");
    var dialog = trigger.closest("dialog");
    // The dialog's own close handler would return focus to its opener a task later, over data-focus.
    if (dialog) dialog.protoOpener = null;
    history.pushState(null, "", STATE_PREFIX + name);
    setState(name, { keepTabs: true });
    var namedTab = document.getElementById(trigger.getAttribute("data-select-tab") || "");
    if (namedTab) selectTab(namedTab, false);
    focusSelector(trigger.getAttribute("data-focus"));
  }

  /* ---------- Click and key delegation ---------- */

  // R1: an aria-disabled control stays focusable and does nothing when activated.
  document.addEventListener("click", function (event) {
    if (event.target.closest("[aria-disabled='true']")) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  document.addEventListener("click", function (event) {
    var el = event.target;

    var themeToggle = el.closest("[data-theme-toggle]");
    if (themeToggle) {
      themeChosenByHand = true;
      setTheme(!root.classList.contains("dark"));
      return;
    }

    var tab = el.closest("[role='tab']");
    if (tab) { selectTab(tab, true); return; }

    var menuTrigger = el.closest("[data-menu-trigger]");
    if (menuTrigger) {
      if (openMenu && openMenu.trigger === menuTrigger) closeMenu(true);
      else showMenu(menuTrigger, true);
      return;
    }

    var menuItem = el.closest("[role^='menuitem']");
    if (menuItem && openMenu) {
      if (menuItem.getAttribute("role") === "menuitemcheckbox") {
        menuItem.setAttribute("aria-checked", String(menuItem.getAttribute("aria-checked") !== "true"));
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
    if (dialogOpener) { openDialog(dialogOpener.getAttribute("data-dialog-open"), dialogOpener); return; }

    var dialogCloser = el.closest("[data-dialog-close]");
    if (dialogCloser) { dialogCloser.closest("dialog").close(); return; }

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
      if (!source || !navigator.clipboard) { denied(); return; }
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
    if (openMenu && openMenu.menu.contains(el)) { onMenuKey(event); return; }
    if (event.key === "Escape") {
      document.querySelectorAll("[data-tooltip]").forEach(function (trigger) { setTooltip(trigger, false); });
    }
    var tab = el.closest && el.closest("[role='tab']");
    if (tab) { onTabKey(event, tab); return; }
    var handle = el.closest && el.closest(".resizable-handle[role='separator']");
    if (handle) onHandleKey(event, handle);
  });

  /* ---------- Start ---------- */

  function start() {
    document.querySelectorAll(".dropdown-menu, .tooltip").forEach(function (el) { el.hidden = true; });
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

  // A typed or history-restored anchor hash moves focus and leaves the state as it is.
  window.addEventListener("hashchange", function () {
    if (!window.location.hash || isStateHash(window.location.hash)) setState();
    else focusAnchor(anchorId(window.location.hash));
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
  if (document.readyState === "complete") focusArrivalAnchor();
  else window.addEventListener("load", focusArrivalAnchor);

  window.proto = {
    setState: setState, showPane: showPane, syncNotifications: syncNotifications, setTheme: setTheme,
    focusAnchor: focusAnchor
  };
})();
