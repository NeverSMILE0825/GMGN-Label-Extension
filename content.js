(function () {
  var LABEL_CLASS = "gmgn-team-label";
  var walletMap = new Map();
  var applying = false;

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

  function findBadge(link) {
    var children = link.children;
    for (var i = 0; i < children.length; i += 1) {
      if (children[i].classList.contains(LABEL_CLASS)) return children[i];
    }
    return null;
  }

  function addressNodes(link) {
    var nodes = [];
    var children = link.children;
    for (var i = 0; i < children.length; i += 1) {
      if (!children[i].classList.contains(LABEL_CLASS)) nodes.push(children[i]);
    }
    return nodes;
  }

  function isAddressText(text) {
    var value = (text || "").trim();
    return value.indexOf("...") !== -1 || /^0x/i.test(value);
  }

  function hideAddress(link) {
    var nodes = addressNodes(link);
    for (var i = 0; i < nodes.length; i += 1) {
      var node = nodes[i];
      if (!node.classList.contains("gmgn-team-hidden") && !isAddressText(node.textContent)) continue;
      if (!node.classList.contains("gmgn-team-hidden")) node.classList.add("gmgn-team-hidden");
    }
    var loose = [];
    for (var n = 0; n < link.childNodes.length; n += 1) {
      var child = link.childNodes[n];
      if (child.nodeType === 3 && isAddressText(child.textContent)) loose.push(child);
    }
    for (var t = 0; t < loose.length; t += 1) {
      var span = document.createElement("span");
      span.className = "gmgn-team-hidden";
      loose[t].parentNode.insertBefore(span, loose[t]);
      span.appendChild(loose[t]);
    }
  }

  function showAddress(link) {
    var badge = findBadge(link);
    if (badge) badge.remove();
    var hidden = link.querySelectorAll(".gmgn-team-hidden");
    for (var i = 0; i < hidden.length; i += 1) hidden[i].classList.remove("gmgn-team-hidden");
  }

  function paint(link, raw, key, label) {
    var badge = findBadge(link);
    if (!badge) {
      badge = document.createElement("span");
      badge.className = LABEL_CLASS;
      link.appendChild(badge);
    }
    if (badge.textContent !== label) badge.textContent = label;
    if (badge.dataset.gmgnTeamKey !== key) badge.dataset.gmgnTeamKey = key;
    var title = label + " · " + raw;
    if (badge.title !== title) badge.title = title;
    var colors = GMGNTeam.colorForLabel(label);
    if (badge.style.getPropertyValue("--gmgn-team-fg") !== colors.fg) {
      badge.style.setProperty("--gmgn-team-fg", colors.fg);
      badge.style.setProperty("--gmgn-team-bg", colors.bg);
      badge.style.setProperty("--gmgn-team-border", colors.border);
    }
    hideAddress(link);
  }

  function applyLabels() {
    if (applying) return;
    applying = true;
    try {
      var cells = document.querySelectorAll('[data-testid="table-cell-maker"]');
      for (var i = 0; i < cells.length; i += 1) {
        var link = findAddressLink(cells[i]);
        if (!link) continue;
        var raw = addressFromHref(link.getAttribute("href"));
        if (!raw) continue;
        var key = GMGNTeam.normalizeAddress(raw);
        var label = walletMap.get(key) || "";
        if (!label) showAddress(link);
        else paint(link, raw, key, label);
      }
    } finally {
      applying = false;
    }
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
      if (mutationMatters(mutations)) applyLabels();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    window.setInterval(applyLabels, 1500);
    applyLabels();
  }

  start();
})();
