(function () {
  var textarea = document.getElementById("wallets");
  var saveButton = document.getElementById("save");
  var status = document.getElementById("status");
  var errors = document.getElementById("errors");
  var preview = document.getElementById("preview");
  var pageHint = document.getElementById("page-hint");

  function setStatus(message, kind) {
    status.textContent = message || "";
    status.className = "status" + (kind ? " " + kind : "");
  }

  function renderPreview() {
    var parsed = GMGNTeam.parseWalletList(textarea.value);
    errors.replaceChildren();
    preview.replaceChildren();

    parsed.errors.slice(0, 4).forEach(function (error) {
      var item = document.createElement("li");
      item.textContent = "Line " + error.line + ": " + error.message;
      errors.appendChild(item);
    });
    if (parsed.errors.length > 4) {
      var extra = document.createElement("li");
      extra.textContent = parsed.errors.length - 4 + " more lines need a fix.";
      errors.appendChild(extra);
    }

    var shown = parsed.entries.slice(0, 40);
    shown.forEach(function (entry) {
      var item = document.createElement("li");
      var chip = document.createElement("span");
      var addr = document.createElement("span");
      var colors = GMGNTeam.colorForLabel(entry.label);
      chip.className = "chip";
      chip.textContent = entry.label;
      chip.style.color = colors.fg;
      chip.style.background = colors.bg;
      chip.style.borderColor = colors.border;
      addr.className = "addr";
      addr.textContent = GMGNTeam.shortAddress(entry.address);
      addr.title = entry.address;
      item.append(chip, addr);
      preview.appendChild(item);
    });

    if (parsed.entries.length > shown.length) {
      var more = document.createElement("li");
      more.className = "more";
      more.textContent = "and " + (parsed.entries.length - shown.length) + " more";
      preview.appendChild(more);
    }

    return parsed;
  }

  function save() {
    var text = textarea.value;
    var parsed = renderPreview();
    var storage = globalThis.chrome && chrome.storage && chrome.storage.local;
    if (!storage) {
      setStatus("Open this from the extension icon to save.", "warn");
      return;
    }

    storage.set({ teamWalletsText: text }, function () {
      if (chrome.runtime && chrome.runtime.lastError) {
        setStatus(chrome.runtime.lastError.message, "warn");
        return;
      }
      var count = parsed.entries.length;
      if (!text.trim()) {
        setStatus("Cleared. Trader addresses show as usual.", "ok");
      } else if (parsed.errors.length) {
        setStatus("Saved " + count + " wallets. Some lines were skipped.", "warn");
      } else if (count === 1) {
        setStatus("Saved 1 team wallet.", "ok");
      } else {
        setStatus("Saved " + count + " team wallets.", "ok");
      }
      saveButton.classList.add("saved");
      saveButton.textContent = "Saved";
      window.setTimeout(function () {
        saveButton.classList.remove("saved");
        saveButton.textContent = "Save";
      }, 1200);
    });
  }

  textarea.addEventListener("input", function () {
    setStatus("");
    renderPreview();
  });
  saveButton.addEventListener("click", save);
  textarea.addEventListener("keydown", function (event) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      save();
    }
  });

  var storage = globalThis.chrome && chrome.storage && chrome.storage.local;
  if (storage) {
    storage.get(["teamWalletsText"], function (data) {
      textarea.value = (data && data.teamWalletsText) || "";
      renderPreview();
    });
  } else {
    renderPreview();
  }

  if (globalThis.chrome && chrome.tabs && chrome.tabs.query) {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      var url = tabs && tabs[0] && tabs[0].url || "";
      if (/^https:\/\/(www\.)?gmgn\.ai\//.test(url)) {
        pageHint.textContent = "This tab is GMGN. Save, and the trader column updates immediately.";
      } else if (url) {
        pageHint.textContent = "Open a gmgn.ai token page. Labels apply on that tab after you save.";
      }
    });
  }
})();
