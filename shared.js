(function (root) {
  var EVM_RE = /0x[a-fA-F0-9]{40}/gi;
  var SOL_RE = /(^|[^1-9A-HJ-NP-Za-km-z])([1-9A-HJ-NP-Za-km-z]{32,44})(?![1-9A-HJ-NP-Za-km-z])/g;

  function normalizeAddress(address) {
    var value = String(address || "").trim();
    if (/^0x[a-fA-F0-9]{40}$/.test(value)) return value.toLowerCase();
    return value;
  }

  function shortAddress(address) {
    var value = String(address || "");
    if (value.length <= 10) return value;
    return value.slice(0, 4) + "..." + value.slice(-4);
  }

  var PALETTE = [
    { fg: "#5ee0a0", bg: "rgba(94, 224, 160, 0.16)", border: "rgba(94, 224, 160, 0.85)" },
    { fg: "#ffc14d", bg: "rgba(255, 193, 77, 0.16)", border: "rgba(255, 193, 77, 0.9)" },
    { fg: "#6cb6ff", bg: "rgba(108, 182, 255, 0.16)", border: "rgba(108, 182, 255, 0.85)" },
    { fg: "#ff8ad4", bg: "rgba(255, 138, 212, 0.16)", border: "rgba(255, 138, 212, 0.85)" },
    { fg: "#ff9a62", bg: "rgba(255, 154, 98, 0.16)", border: "rgba(255, 154, 98, 0.9)" },
    { fg: "#c9a0ff", bg: "rgba(201, 160, 255, 0.16)", border: "rgba(201, 160, 255, 0.85)" },
    { fg: "#3ee0d2", bg: "rgba(62, 224, 210, 0.16)", border: "rgba(62, 224, 210, 0.85)" },
    { fg: "#f4f25a", bg: "rgba(244, 242, 90, 0.14)", border: "rgba(244, 242, 90, 0.8)" }
  ];

  function colorForLabel(label) {
    var text = String(label || "").toLowerCase();
    var hash = 2166136261;
    for (var i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return PALETTE[(hash >>> 0) % PALETTE.length];
  }

  function labelTokens(rest) {
    return String(rest || "")
      .replace(/[|,;:=]+/g, " ")
      .split(/\s+/)
      .filter(function (token) {
        if (!token) return false;
        if (/^https?$/i.test(token)) return false;
        if (token.indexOf("/") !== -1 || token.indexOf("\\") !== -1) return false;
        if (/^[.\-–—]+$/.test(token)) return false;
        if (/^https?:/i.test(token)) return false;
        return true;
      });
  }

  function extractAddresses(line) {
    var addresses = [];
    var rest = String(line).replace(EVM_RE, function (match) {
      addresses.push(match.toLowerCase());
      return " ";
    });
    rest = rest.replace(SOL_RE, function (full, prefix, address) {
      addresses.push(address);
      return prefix + " ";
    });
    return { addresses: addresses, rest: rest };
  }

  function parseWalletList(text) {
    var entries = [];
    var errors = [];
    var seen = Object.create(null);
    var currentLabel = "";
    var lines = String(text || "").split(/\r?\n/);

    lines.forEach(function (line, index) {
      var raw = line.trim();
      if (!raw) {
        currentLabel = "";
        return;
      }
      if (raw.charAt(0) === "#" || raw.indexOf("//") === 0) return;

      var extracted = extractAddresses(raw);
      var tokens = labelTokens(extracted.rest);
      var lineNo = index + 1;

      if (!extracted.addresses.length) {
        if (tokens.length === 1 && tokens[0].length <= 24) {
          currentLabel = tokens[0];
          return;
        }
        errors.push({ line: lineNo, message: "No wallet address found." });
        return;
      }

      var label = tokens.join(" ").trim() || currentLabel;
      if (!label) {
        errors.push({ line: lineNo, message: "Add a label such as ETH or GTA." });
        return;
      }
      if (label.length > 32) {
        errors.push({ line: lineNo, message: "Label is longer than 32 characters." });
        return;
      }

      currentLabel = tokens.length ? tokens.join(" ").trim() : currentLabel;
      extracted.addresses.forEach(function (address) {
        seen[address] = label;
        entries.push({ address: address, label: label, line: lineNo });
      });
    });

    var unique = [];
    Object.keys(seen).forEach(function (address) {
      unique.push({ address: address, label: seen[address] });
    });

    return { entries: unique, errors: errors };
  }

  function groupWalletList(text) {
    var parsed = parseWalletList(text);
    var groups = [];
    var index = Object.create(null);
    parsed.entries.forEach(function (entry) {
      if (index[entry.label] == null) {
        index[entry.label] = groups.length;
        groups.push({ label: entry.label, addresses: [] });
      }
      groups[index[entry.label]].addresses.push(entry.address);
    });
    return { groups: groups, errors: parsed.errors };
  }

  function serializeWalletGroups(groups) {
    return (groups || []).filter(function (group) {
      return group && group.label && group.addresses && group.addresses.length;
    }).map(function (group) {
      return [group.label].concat(group.addresses).join("\n");
    }).join("\n\n");
  }

  root.GMGNTeam = {
    normalizeAddress: normalizeAddress,
    shortAddress: shortAddress,
    colorForLabel: colorForLabel,
    parseWalletList: parseWalletList,
    groupWalletList: groupWalletList,
    serializeWalletGroups: serializeWalletGroups
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
