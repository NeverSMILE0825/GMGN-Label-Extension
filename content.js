(function () {
  var LABEL_CLASS = "gmgn-team-label";
  var walletMap = new Map();
  var pending = 0;

  function addressFromHref(href) {
    var match = String(href || "").match(/\/address\/([^/?#]+)/i);
    if (!match) return "";
    try {
      return decodeURIComponent(match[1]);
    } catch (error) {
      return match[1];
    }
  }

  function findAddressLink(cell) {
    var marked = cell.querySelector('[data-sentry-component="WalletMarkEditButton"] a[href*="/address/"]');
    if (marked) return marked;

    var links = cell.querySelectorAll('a[href*="/address/"]');
    for (var i = 0; i < links.length; i += 1) {
      var link = links[i];
      if (link.querySelector("." + LABEL_CLASS)) return link;
      var text = (link.textContent || "").trim();
      if (!text || /^\d+$/.test(text)) continue;
      if (link.classList.contains("flex-shrink") || text.indexOf("...") !== -1 || /^0x/i.test(text)) {
        return link;
      }
    }
    return null;
  }

  function textElement(link) {
    return link.querySelector(":scope > div") || link;
  }

  function clearLabelState(textEl) {
    textEl.classList.remove(LABEL_CLASS);
    delete textEl.dataset.gmgnTeamLabel;
    delete textEl.dataset.gmgnTeamOrig;
    delete textEl.dataset.gmgnTeamKey;
    textEl.style.removeProperty("--gmgn-team-fg");
    textEl.style.removeProperty("--gmgn-team-bg");
    textEl.style.removeProperty("--gmgn-team-border");
    if (textEl.dataset.gmgnTeamTitle === "1") {
      textEl.removeAttribute("title");
      delete textEl.dataset.gmgnTeamTitle;
    }
  }

  function restore(textEl, raw) {
    if (!textEl.dataset.gmgnTeamLabel && !textEl.classList.contains(LABEL_CLASS)) return;
    var showingLabel = (textEl.textContent || "").trim() === textEl.dataset.gmgnTeamLabel;
    if (showingLabel) {
      var sameAddress = textEl.dataset.gmgnTeamKey === GMGNTeam.normalizeAddress(raw);
      textEl.textContent = sameAddress && textEl.dataset.gmgnTeamOrig
        ? textEl.dataset.gmgnTeamOrig
        : GMGNTeam.shortAddress(raw);
    }
    clearLabelState(textEl);
  }

  function paint(textEl, raw, key, label) {
    var current = (textEl.textContent || "").trim();
    if (textEl.dataset.gmgnTeamKey !== key) {
      if (current && current !== textEl.dataset.gmgnTeamLabel) textEl.dataset.gmgnTeamOrig = current;
      else delete textEl.dataset.gmgnTeamOrig;
    } else if (!textEl.dataset.gmgnTeamOrig && current && current !== label) {
      textEl.dataset.gmgnTeamOrig = current;
    }

    var colors = GMGNTeam.colorForLabel(label);
    textEl.dataset.gmgnTeamKey = key;
    textEl.dataset.gmgnTeamLabel = label;
    if (current !== label) textEl.textContent = label;
    textEl.classList.add(LABEL_CLASS);
    textEl.style.setProperty("--gmgn-team-fg", colors.fg);
    textEl.style.setProperty("--gmgn-team-bg", colors.bg);
    textEl.style.setProperty("--gmgn-team-border", colors.border);
    if (!textEl.getAttribute("title")) textEl.dataset.gmgnTeamTitle = "1";
    textEl.title = label + " · " + raw;
  }

  function applyLabels() {
    var cells = document.querySelectorAll('[data-testid="table-cell-maker"]');
    for (var i = 0; i < cells.length; i += 1) {
      var link = findAddressLink(cells[i]);
      if (!link) continue;
      var raw = addressFromHref(link.getAttribute("href"));
      if (!raw) continue;
      var key = GMGNTeam.normalizeAddress(raw);
      var label = walletMap.get(key) || "";
      var textEl = textElement(link);
      if (!label) restore(textEl, raw);
      else paint(textEl, raw, key, label);
    }
  }

  function schedule() {
    if (pending) return;
    pending = window.setTimeout(function () {
      pending = 0;
      applyLabels();
    }, 60);
  }

  function mutationMatters(mutations) {
    for (var i = 0; i < mutations.length; i += 1) {
      var mutation = mutations[i];
      var node = mutation.target && mutation.target.nodeType === 1
        ? mutation.target
        : mutation.target && mutation.target.parentElement;
      if (node && node.closest && node.closest('[data-testid="table-cell-maker"], [data-sentry-component="ActivityItemViewNew"]')) {
        return true;
      }
      var added = mutation.addedNodes || [];
      for (var n = 0; n < added.length; n += 1) {
        var addedNode = added[n];
        if (addedNode.nodeType !== 1) continue;
        if (addedNode.matches && addedNode.matches('[data-testid="table-cell-maker"], [data-sentry-component="ActivityItemViewNew"]')) {
          return true;
        }
        if (addedNode.querySelector && addedNode.querySelector('[data-testid="table-cell-maker"]')) return true;
      }
    }
    return false;
  }

  function setWalletText(text) {
    var parsed = GMGNTeam.parseWalletList(text);
    walletMap = new Map(parsed.entries.map(function (entry) {
      return [entry.address, entry.label];
    }));
    applyLabels();
  }

  function start() {
    var storage = globalThis.chrome && chrome.storage && chrome.storage.local;
    if (!storage || typeof GMGNTeam === "undefined") return;

    storage.get(["teamWalletsText"], function (data) {
      setWalletText((data && data.teamWalletsText) || "");
    });

    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== "local" || !changes.teamWalletsText) return;
      setWalletText(changes.teamWalletsText.newValue || "");
    });

    var observer = new MutationObserver(function (mutations) {
      if (mutationMatters(mutations)) schedule();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    window.setInterval(applyLabels, 1500);
    schedule();
  }

  start();
})();
