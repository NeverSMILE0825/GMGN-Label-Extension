(function () {
  var labelInput = document.getElementById("label-name");
  var addressBox = document.getElementById("addresses");
  var addressCount = document.getElementById("address-count");
  var saveButton = document.getElementById("save");
  var clearButton = document.getElementById("clear");
  var status = document.getElementById("status");
  var errors = document.getElementById("errors");
  var savedList = document.getElementById("saved-list");
  var savedSummary = document.getElementById("saved-summary");
  var pageHint = document.getElementById("page-hint");

  var groups = [];
  var editingOriginal = "";
  var memoryText = "";

  function storageGet(callback) {
    var local = globalThis.chrome && chrome.storage && chrome.storage.local;
    if (!local) {
      callback({ teamWalletsText: memoryText });
      return;
    }
    local.get(["teamWalletsText"], callback);
  }

  function storageSet(text, callback) {
    var local = globalThis.chrome && chrome.storage && chrome.storage.local;
    if (!local) {
      memoryText = text;
      callback();
      return;
    }
    local.set({ teamWalletsText: text }, callback);
  }

  function setStatus(message, kind) {
    status.textContent = message || "";
    status.className = "status" + (kind ? " " + kind : "");
  }

  function sameLabel(left, right) {
    return String(left || "").toLowerCase() === String(right || "").toLowerCase();
  }

  function readAddresses(raw) {
    var lines = String(raw || "").split(/\r?\n/);
    var blocks = [];
    lines.forEach(function (line) {
      line.split(",").forEach(function (part) {
        var value = part.trim();
        if (value) blocks.push("Label " + value);
      });
    });
    var parsed = GMGNTeam.parseWalletList(blocks.join("\n"));
    var addresses = [];
    var seen = Object.create(null);
    parsed.entries.forEach(function (entry) {
      if (seen[entry.address]) return;
      seen[entry.address] = true;
      addresses.push(entry.address);
    });
    return { addresses: addresses, errors: parsed.errors };
  }

  function walletPhrase(count) {
    return count === 1 ? "1 wallet" : count + " wallets";
  }

  function labelPhrase(count) {
    return count === 1 ? "1 label" : count + " labels";
  }

  function renderSaved() {
    var wallets = groups.reduce(function (sum, group) {
      return sum + group.addresses.length;
    }, 0);
    savedSummary.textContent = labelPhrase(groups.length) + " · " + walletPhrase(wallets);
    savedList.replaceChildren();

    if (!groups.length) {
      var empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "No saved labels yet.";
      savedList.appendChild(empty);
      return;
    }

    groups.forEach(function (group) {
      var card = document.createElement("article");
      var main = document.createElement("div");
      var chip = document.createElement("span");
      var count = document.createElement("span");
      var actions = document.createElement("div");
      var edit = document.createElement("button");
      var remove = document.createElement("button");
      var colors = GMGNTeam.colorForLabel(group.label);

      card.className = "saved-card" + (sameLabel(group.label, editingOriginal) ? " editing" : "");
      main.className = "saved-main";
      chip.className = "chip";
      chip.textContent = group.label;
      chip.style.color = colors.fg;
      chip.style.background = colors.bg;
      chip.style.borderColor = colors.border;
      count.className = "wallet-count";
      count.textContent = walletPhrase(group.addresses.length);
      actions.className = "saved-actions";

      edit.type = "button";
      edit.className = "edit-btn";
      edit.textContent = "Edit";
      edit.addEventListener("click", function () { startEdit(group.label); });

      remove.type = "button";
      remove.className = "delete-btn";
      remove.textContent = "Delete";
      remove.addEventListener("click", function () { deleteLabel(group.label); });

      actions.append(edit, remove);
      main.append(chip, count);
      card.append(main, actions);
      savedList.appendChild(card);
    });
  }

  function showAddressCount() {
    var parsed = readAddresses(addressBox.value);
    var count = parsed.addresses.length;
    addressCount.textContent = count === 1 ? "1 address" : count + " addresses";
    return parsed;
  }

  function showErrors(items) {
    errors.replaceChildren();
    items.slice(0, 4).forEach(function (error) {
      var item = document.createElement("li");
      item.textContent = error.message;
      errors.appendChild(item);
    });
  }

  function clearEditor() {
    editingOriginal = "";
    labelInput.value = "";
    addressBox.value = "";
    showAddressCount();
    renderSaved();
  }

  function resetForm() {
    clearEditor();
    showErrors([]);
  }

  function startEdit(label) {
    var group = groups.filter(function (item) { return sameLabel(item.label, label); })[0];
    if (!group) return;
    editingOriginal = group.label;
    labelInput.value = group.label;
    addressBox.value = group.addresses.join("\n");
    setStatus("");
    showAddressCount();
    showErrors([]);
    renderSaved();
    labelInput.focus();
  }

  function persist(nextGroups, done) {
    var text = GMGNTeam.serializeWalletGroups(nextGroups);
    storageSet(text, function () {
      if (globalThis.chrome && chrome.runtime && chrome.runtime.lastError) {
        setStatus(chrome.runtime.lastError.message, "warn");
        return;
      }
      groups = nextGroups;
      done();
    });
  }

  function saveLabel() {
    var label = labelInput.value.trim();
    var parsed = showAddressCount();
    if (!label) {
      showErrors([{ message: "Add a label such as ETH or GTA." }]);
      setStatus("");
      return;
    }
    if (label.length > 32) {
      showErrors([{ message: "Label is longer than 32 characters." }]);
      setStatus("");
      return;
    }
    if (!parsed.addresses.length) {
      showErrors(parsed.errors.length ? parsed.errors : [{ message: "Add at least one wallet address." }]);
      setStatus("");
      return;
    }

    var next = groups.filter(function (group) {
      return !sameLabel(group.label, label) && !sameLabel(group.label, editingOriginal);
    }).map(function (group) {
      return {
        label: group.label,
        addresses: group.addresses.filter(function (address) {
          return parsed.addresses.indexOf(address) === -1;
        })
      };
    }).filter(function (group) { return group.addresses.length; });

    var updating = groups.some(function (group) { return sameLabel(group.label, label); }) || sameLabel(editingOriginal, label);
    next.push({ label: label, addresses: parsed.addresses.slice() });
    persist(next, function () {
      clearEditor();
      showErrors(parsed.errors);
      var verb = updating ? "Updated" : "Saved";
      setStatus(verb + " " + walletPhrase(parsed.addresses.length) + " as " + label + ". " + labelPhrase(next.length) + " saved.", parsed.errors.length ? "warn" : "");
    });
  }

  function deleteLabel(label) {
    var next = groups.filter(function (group) { return !sameLabel(group.label, label); });
    persist(next, function () {
      if (sameLabel(editingOriginal, label)) resetForm();
      else renderSaved();
      setStatus("Deleted " + label + ".");
    });
  }

  labelInput.addEventListener("input", function () { setStatus(""); });
  addressBox.addEventListener("input", function () {
    setStatus("");
    showAddressCount();
  });
  saveButton.addEventListener("click", saveLabel);
  clearButton.addEventListener("click", function () {
    resetForm();
    setStatus("");
  });

  storageGet(function (data) {
    groups = GMGNTeam.groupWalletList((data && data.teamWalletsText) || "").groups;
    renderSaved();
    showAddressCount();
  });

  if (globalThis.chrome && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== "local" || !changes.teamWalletsText) return;
      groups = GMGNTeam.groupWalletList(changes.teamWalletsText.newValue || "").groups;
      renderSaved();
    });
  }

  if (globalThis.chrome && chrome.tabs && chrome.tabs.query) {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      var url = (tabs && tabs[0] && tabs[0].url) || "";
      if (/^https:\/\/(www\.)?gmgn\.ai\/eth\//.test(url)) {
        pageHint.textContent = "GMGN ETH page detected";
        pageHint.className = "hint ok";
      } else if (/^https:\/\/(www\.)?gmgn\.ai\//.test(url)) {
        pageHint.textContent = "GMGN page detected. Labels apply on this tab.";
      } else if (url) {
        pageHint.textContent = "Open a GMGN Ethereum token page.";
      }
    });
  }
})();
