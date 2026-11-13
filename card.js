(function () {
  var NATIVE_ETH = "0x0000000000000000000000000000000000000000";
  var WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
  var MAX_PAGES = 500;
  var CACHE_VERSION = 5;
  var walletMap = new Map();
  var trades = new Map();
  var hidden = false;
  var token = "";
  var generation = 0;
  var backfillCursor = "";
  var historyDone = false;
  var seenTrades = 0;
  var pooledEth = null;
  var poolName = "";
  var gasGwei = null;
  var historyPartial = false;
  var fillingGen = 0;
  var loops = [];
  var card;
  var showButton;
  var saveTimer = 0;
  var showDetails = false;
  var totalSupply = 0;
  var tokenSymbol = "";
  var detailsTimer = 0;
  var modal;

  function tokenFromUrl() {
    var match = location.pathname.match(/\/eth\/token\/(0x[a-fA-F0-9]{40})/i);
    return match ? match[1].toLowerCase() : "";
  }

  function storageArea() {
    return globalThis.chrome && chrome.storage && chrome.storage.local;
  }

  function formatCount(value) {
    return Math.round(value).toLocaleString("en-US");
  }

  function formatEth(value, withSign) {
    if (value == null || !isFinite(value)) return "—";
    var abs = Math.abs(value);
    var digits = abs >= 100 ? 2 : abs >= 1 ? 4 : 6;
    var text = abs.toFixed(digits).replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
    if (text.indexOf(".") === -1) text += ".00";
    var sign = "";
    if (withSign) sign = value > 0 ? "+" : value < 0 ? "-" : "";
    else if (value < 0) sign = "-";
    return sign + text;
  }

  function formatGas(value) {
    if (value == null || !isFinite(value)) return "—";
    var digits = value >= 10 ? 1 : 2;
    return value.toFixed(digits).replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
  }

  function finiteOrNull(value) {
    var number = Number(value);
    return isFinite(number) ? number : null;
  }

  function trimFixed(value, digits) {
    return value.toFixed(digits).replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
  }

  function truncateFixed(value, digits) {
    var factor = Math.pow(10, digits);
    var cut = Math.floor(Math.abs(value) * factor + 1e-8) / factor;
    return trimFixed(cut, digits);
  }

  function formatAmount(value) {
    if (value == null || !isFinite(value)) return "—";
    var abs = Math.abs(value);
    var sign = value < 0 ? "-" : "";
    if (abs >= 1e9) return sign + trimFixed(abs / 1e9, 2) + "B";
    if (abs >= 1e6) return sign + trimFixed(abs / 1e6, 1) + "M";
    if (abs >= 1e3) return sign + trimFixed(abs / 1e3, 1) + "K";
    if (abs >= 1) return sign + trimFixed(abs, 2);
    if (abs === 0) return "0";
    return sign + trimFixed(abs, 4);
  }

  function formatMc(price) {
    if (price == null || !isFinite(price) || !totalSupply) return "—";
    var mc = price * totalSupply;
    var abs = Math.abs(mc);
    var sign = mc < 0 ? "-" : "";
    if (abs >= 1e9) return sign + "$" + truncateFixed(abs / 1e9, 2) + "B";
    if (abs >= 1e6) return sign + "$" + truncateFixed(abs / 1e6, 2) + "M";
    if (abs >= 1e3) return sign + "$" + truncateFixed(abs / 1e3, 0) + "K";
    if (abs >= 1) return sign + "$" + trimFixed(abs, 2);
    return sign + "$" + trimFixed(abs, 4);
  }

  function formatTotalUsd(value) {
    if (value == null || !isFinite(value)) return "—";
    var abs = Math.abs(value);
    var sign = value < 0 ? "-" : "";
    if (abs >= 1e6) return sign + "$" + truncateFixed(abs / 1e6, 2) + "M";
    if (abs >= 1e3) return sign + "$" + truncateFixed(abs / 1e3, 2) + "K";
    if (abs >= 100) return sign + "$" + truncateFixed(abs, 1);
    if (abs >= 1) return sign + "$" + truncateFixed(abs, 2);
    if (abs === 0) return "$0";
    return sign + "$" + truncateFixed(abs, 4);
  }

  function formatGasUsd(value) {
    if (value == null || !isFinite(value)) return "—";
    var abs = Math.abs(value);
    var sign = value < 0 ? "-" : "";
    if (abs === 0) return "$0";
    if (abs >= 1) return sign + "$" + trimFixed(abs, 2);
    return sign + "$" + trimFixed(abs, 3);
  }

  function formatExactTime(ts) {
    if (!ts) return "—";
    var date = new Date(ts * 1000);
    if (!isFinite(date.getTime())) return "—";
    var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    function pad(value) { return value < 10 ? "0" + value : String(value); }
    return months[date.getMonth()] + " " + date.getDate() + ", " + pad(date.getHours()) + ":" + pad(date.getMinutes()) + ":" + pad(date.getSeconds());
  }

  function formatExactEth(value, raw) {
    var text = String(raw || "").trim();
    if (text && isFinite(Number(text))) {
      text = text.replace(/^[+]/, "").replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
      return text + " ETH";
    }
    if (value == null || !isFinite(value)) return "—";
    if (value === 0) return "0 ETH";
    text = Math.abs(value).toFixed(12).replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
    return (value < 0 ? "-" : "") + text + " ETH";
  }

  function formatUsdAmount(value) {
    if (value == null || !isFinite(value)) return "—";
    var abs = Math.abs(value);
    var digits = abs >= 1 ? 2 : abs >= 0.01 ? 3 : 4;
    var text = abs.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
    return (value < 0 ? "-$" : "$") + text;
  }

  function typeLabel(side) {
    if (side === "b") return "Buy";
    if (side === "s") return "Sell";
    if (side === "a") return "Add";
    if (side === "r") return "Remove";
    return "—";
  }

  function typeClass(side) {
    if (side === "b") return "buy";
    if (side === "s") return "sell";
    if (side === "a") return "add";
    if (side === "r") return "remove";
    return "";
  }

  function isEthQuote(address) {
    var quote = String(address || "").toLowerCase();
    return quote === NATIVE_ETH || quote === WETH;
  }

  function sideOf(event) {
    var name = String(event || "").toLowerCase();
    if (name === "buy") return "b";
    if (name === "sell") return "s";
    if (name === "add") return "a";
    if (name === "remove") return "r";
    return "";
  }

  function ingest(history) {
    var added = 0;
    (history || []).forEach(function (row) {
      if (!row || !row.id || trades.has(row.id)) return;
      var side = sideOf(row.event);
      if (!side) return;
      var ethQuote = isEthQuote(row.quote_address);
      var amount = 0;
      if ((side === "b" || side === "s") && ethQuote) {
        amount = Number(row.quote_amount);
        if (!isFinite(amount) || amount < 0) amount = 0;
      }
      var maker = GMGNTeam.normalizeAddress(row.maker);
      if (!maker) return;
      var gasNative = finiteOrNull(row.gas_native);
      trades.set(row.id, {
        maker: maker,
        side: side,
        amount: amount,
        eth: (side === "b" || side === "s") && ethQuote,
        base: finiteOrNull(row.base_amount),
        usd: finiteOrNull(row.amount_usd),
        price: finiteOrNull(row.price_usd),
        gasNative: gasNative == null || gasNative < 0 ? 0 : gasNative,
        gasUsd: finiteOrNull(row.gas_usd),
        ts: Number(row.timestamp) || 0,
        quoteText: (side === "b" || side === "s") && ethQuote ? String(row.quote_amount || "") : ""
      });
      added += 1;
    });
    if (added) scheduleSave();
    return added;
  }

  function totals() {
    var buyEth = 0;
    var sellEth = 0;
    var buys = 0;
    var sells = 0;
    var adds = 0;
    var removes = 0;
    var gasEth = 0;
    var gasUsd = 0;
    var unlabeled = 0;
    trades.forEach(function (trade) {
      gasEth += trade.gasNative || 0;
      gasUsd += trade.gasUsd || 0;
      if (walletMap.has(trade.maker)) return;
      unlabeled += 1;
      if (trade.eth && trade.side === "b") {
        buyEth += trade.amount;
        buys += 1;
      } else if (trade.eth && trade.side === "s") {
        sellEth += trade.amount;
        sells += 1;
      } else if (trade.side === "a") {
        adds += 1;
      } else if (trade.side === "r") {
        removes += 1;
      }
    });
    return {
      buyEth: buyEth,
      sellEth: sellEth,
      net: buyEth - sellEth,
      buys: buys,
      sells: sells,
      adds: adds,
      removes: removes,
      trades: buys + sells,
      gasEth: gasEth,
      gasUsd: gasUsd,
      unlabeled: unlabeled
    };
  }

  function ensureCard() {
    if (card) return;
    card = document.createElement("section");
    card.className = "gmgn-eth-card";
    card.innerHTML = [
      '<header><span>UNLABELED TOTAL ETH</span><button type="button" class="gmgn-eth-hide">Hide</button></header>',
      '<div class="gmgn-eth-main"><span class="gmgn-eth-chip">ETH</span><strong class="gmgn-eth-net" id="gmgn-eth-net">—</strong></div>',
      '<div class="gmgn-eth-meta" id="gmgn-eth-stats"></div>',
      '<div class="gmgn-eth-meta" id="gmgn-eth-split"></div>',
      '<div class="gmgn-eth-meta" id="gmgn-eth-liq"></div>',
      '<div class="gmgn-eth-note" id="gmgn-eth-note">Buys add, sells subtract. Full pair history.</div>',
      '<div class="gmgn-eth-spent">Total gas spent <b id="gmgn-eth-spent">—</b></div>',
      '<label class="gmgn-eth-details-toggle"><input type="checkbox" id="gmgn-eth-details"> Show Details</label>',
      '<footer class="gmgn-eth-foot">',
      '<span>POOLED ETH <b id="gmgn-eth-pooled">—</b></span>',
      '<span class="gas">GAS <b id="gmgn-eth-gas">—</b></span>',
      "</footer>"
    ].join("");
    card.querySelector(".gmgn-eth-hide").addEventListener("click", function () {
      setHidden(true);
    });
    card.querySelector("#gmgn-eth-details").addEventListener("change", function (event) {
      setShowDetails(event.target.checked);
    });
    showButton = document.createElement("button");
    showButton.type = "button";
    showButton.className = "gmgn-eth-show";
    showButton.textContent = "Unlabeled ETH";
    showButton.addEventListener("click", function () {
      setHidden(false);
    });
    modal = document.createElement("section");
    modal.className = "gmgn-eth-modal";
    modal.hidden = true;
    modal.innerHTML = [
      '<div class="gmgn-eth-dialog" role="dialog" aria-label="Unlabeled trades">',
      '<header><span>Unlabeled trades</span><b id="gmgn-eth-detail-count"></b></header>',
      '<div class="gmgn-eth-table-wrap"><table>',
      "<thead><tr>",
      "<th>Time</th><th>Type</th><th>MC</th><th id=\"gmgn-eth-amount-head\">Total</th><th>Total ETH</th><th>Gas</th><th>Trader</th>",
      "</tr></thead><tbody></tbody></table></div>",
      '<p class="gmgn-eth-detail-note" id="gmgn-eth-detail-note"></p>',
      "</div>"
    ].join("");
    document.body.appendChild(modal);
    document.body.appendChild(card);
    document.body.appendChild(showButton);
  }

  function detailRows() {
    var rows = [];
    trades.forEach(function (trade) {
      if (walletMap.has(trade.maker)) return;
      rows.push(trade);
    });
    rows.sort(function (a, b) { return b.ts - a.ts; });
    return rows;
  }

  function paintDetails() {
    if (!modal) return;
    var open = showDetails && !hidden && !!token;
    modal.hidden = !open;
    if (!open) return;
    var rows = detailRows();
    var count = modal.querySelector("#gmgn-eth-detail-count");
    count.textContent = formatCount(rows.length) + (rows.length === 1 ? " trade" : " trades");
    var note = modal.querySelector("#gmgn-eth-detail-note");
    if (!rows.length && !historyDone) note.textContent = "Loading full history…";
    else if (!rows.length) note.textContent = "No unlabeled trades.";
    else if (!historyDone && !historyPartial) note.textContent = "Loading the rest of the pair history.";
    else note.textContent = "";
    var amountHead = modal.querySelector("#gmgn-eth-amount-head");
    amountHead.textContent = tokenSymbol ? "Total " + tokenSymbol : "Total";
    var html = rows.map(function (trade) {
      var kind = typeClass(trade.side);
      var href = "/eth/address/" + trade.maker;
      var ethText = formatExactEth(trade.eth ? trade.amount : null, trade.quoteText);
      return "<tr>" +
        "<td>" + formatExactTime(trade.ts) + "</td>" +
        '<td class="' + kind + '">' + typeLabel(trade.side) + "</td>" +
        "<td>" + formatMc(trade.price) + "</td>" +
        "<td>" + formatAmount(trade.base) + "</td>" +
        '<td class="gmgn-eth-pair"><span>' + ethText + "</span><span class=\"sub\">" + formatTotalUsd(trade.usd) + "</span></td>" +
        "<td>" + formatGasUsd(trade.gasUsd) + "</td>" +
        '<td><a href="' + href + '">' + GMGNTeam.shortAddress(trade.maker) + "</a></td>" +
        "</tr>";
    }).join("");
    modal.querySelector("tbody").innerHTML = html;
  }

  function scheduleDetails() {
    if (!showDetails || hidden || !token) {
      if (modal) modal.hidden = true;
      return;
    }
    if (detailsTimer) return;
    detailsTimer = window.setTimeout(function () {
      detailsTimer = 0;
      paintDetails();
    }, 200);
  }

  function render() {
    if (!token) return;
    ensureCard();
    var stats = totals();
    var net = card.querySelector("#gmgn-eth-net");
    net.textContent = formatEth(stats.net, true) + " ETH";
    net.className = "gmgn-eth-net " + (stats.net < 0 ? "down" : "up");
    card.querySelector("#gmgn-eth-stats").textContent = formatCount(stats.trades) + " trades · " + formatCount(stats.buys) + " buys · " + formatCount(stats.sells) + " sells";
    card.querySelector("#gmgn-eth-split").textContent = "Buy " + formatEth(stats.buyEth, false) + " ETH · Sell " + formatEth(stats.sellEth, false) + " ETH";
    card.querySelector("#gmgn-eth-liq").textContent = formatCount(stats.adds) + " adds · " + formatCount(stats.removes) + " removes";
    var note = card.querySelector("#gmgn-eth-note");
    if (!historyDone && !historyPartial) note.textContent = "Loading full history… " + formatCount(seenTrades) + " trades";
    else if (historyPartial) note.textContent = "Buys add, sells subtract. Latest " + formatCount(MAX_PAGES * 50) + " trades.";
    else note.textContent = "Buys add, sells subtract. Full pair history.";
    var spent = card.querySelector("#gmgn-eth-spent");
    spent.textContent = formatEth(stats.gasEth, false) + " ETH · " + formatUsdAmount(stats.gasUsd);
    spent.title = "Gas paid by every trade in this pair, including labeled wallets.";
    var details = card.querySelector("#gmgn-eth-details");
    details.checked = showDetails;
    var pooled = card.querySelector("#gmgn-eth-pooled");
    pooled.textContent = pooledEth == null ? "—" : formatEth(pooledEth, false) + " ETH";
    pooled.title = poolName || "";
    card.querySelector("#gmgn-eth-gas").textContent = gasGwei == null ? "—" : formatGas(gasGwei) + " gwei";
    card.hidden = hidden;
    showButton.hidden = !hidden;
    scheduleDetails();
  }

  function setShowDetails(next) {
    showDetails = !!next;
    render();
    var local = storageArea();
    if (local) local.set({ gmgnShowTradeDetails: showDetails });
  }

  function setHidden(next) {
    hidden = next;
    render();
    var local = storageArea();
    if (local) local.set({ gmgnEthCardHidden: hidden });
  }

  function cacheKey() {
    return "gmgnEthFlow_" + token;
  }

  function scheduleSave() {
    if (saveTimer || !storageArea()) return;
    saveTimer = window.setTimeout(function () {
      saveTimer = 0;
      var rows = [];
      trades.forEach(function (trade, id) {
        rows.push([
          id,
          trade.maker,
          trade.side,
          trade.amount,
          trade.base,
          trade.usd,
          trade.price,
          trade.gasNative,
          trade.gasUsd,
          trade.ts,
          trade.eth ? 1 : 0,
          trade.quoteText || ""
        ]);
      });
      var payload = {};
      payload[cacheKey()] = {
        cursor: backfillCursor,
        version: CACHE_VERSION,
        done: historyDone,
        partial: historyPartial,
        trades: rows
      };
      storageArea().set(payload);
    }, 800);
  }

  function loadCache(done) {
    var local = storageArea();
    if (!local) {
      done();
      return;
    }
    var key = cacheKey();
    local.get([key, "gmgnEthCardHidden", "gmgnShowTradeDetails"], function (data) {
      hidden = !!(data && data.gmgnEthCardHidden);
      showDetails = !!(data && data.gmgnShowTradeDetails);
      var cached = data && data[key];
      if (cached && cached.version === CACHE_VERSION && cached.trades) {
        cached.trades.forEach(function (row) {
          trades.set(row[0], {
            maker: row[1],
            side: row[2],
            amount: row[3],
            base: row[4],
            usd: row[5],
            price: row[6],
            gasNative: row[7] || 0,
            gasUsd: row[8],
            ts: row[9] || 0,
            eth: !!row[10],
            quoteText: row[11] || ""
          });
        });
        backfillCursor = cached.cursor || "";
        historyDone = !!cached.done;
        historyPartial = !!cached.partial;
        seenTrades = cached.trades.length;
      }
      done();
    });
  }

  function loadWallets(data) {
    var next = new Map();
    var groups = data && data.teamWalletGroups;
    if (groups && groups.length) {
      groups.forEach(function (group) {
        (group.addresses || []).forEach(function (address) {
          var key = GMGNTeam.normalizeAddress(address);
          if (key) next.set(key, group.label || "");
        });
      });
    } else if (typeof GMGNTeam !== "undefined") {
      var parsed = GMGNTeam.parseWalletList((data && data.teamWalletsText) || "");
      parsed.entries.forEach(function (entry) {
        next.set(entry.address, entry.label);
      });
    }
    walletMap = next;
    render();
  }

  function fetchJson(url) {
    return fetch(url, { credentials: "include" }).then(function (response) {
      if (!response.ok) throw new Error("bad status");
      return response.json();
    });
  }

  function tradesUrl(cursor) {
    var url = "https://gmgn.ai/vas/api/mul-region/token_trades_v2/eth/" + token + "?limit=50";
    if (cursor) url += "&cursor=" + encodeURIComponent(cursor);
    return url;
  }

  function refreshHead(gen) {
    return fetchJson(tradesUrl("")).then(function (json) {
      if (gen !== generation) return;
      var history = (json.data && json.data.history) || [];
      seenTrades = Math.max(seenTrades, history.length);
      ingest(history);
      if (!backfillCursor && !historyDone && !historyPartial) backfillCursor = (json.data && json.data.next) || "";
      if (!backfillCursor && !historyPartial) historyDone = true;
      render();
      maybeBackfill(gen);
    }).catch(function () {});
  }

  function maybeBackfill(gen) {
    if (fillingGen === gen || historyDone || historyPartial || !backfillCursor) return;
    fillingGen = gen;
    backfill(gen);
  }

  function backfill(gen) {
    var pages = 0;
    function step() {
      if (gen !== generation || historyDone || !backfillCursor || pages >= MAX_PAGES) {
        if (gen === generation && pages >= MAX_PAGES && backfillCursor) historyPartial = true;
        render();
        scheduleSave();
        return;
      }
      var cursor = backfillCursor;
      fetchJson(tradesUrl(cursor)).then(function (json) {
        if (gen !== generation) return;
        var history = (json.data && json.data.history) || [];
        pages += 1;
        seenTrades += history.length;
        ingest(history);
        var next = (json.data && json.data.next) || "";
        if (!history.length || !next || next === cursor) {
          historyDone = true;
          backfillCursor = "";
        } else {
          backfillCursor = next;
        }
        render();
        window.setTimeout(step, 70);
      }).catch(function () {
        if (gen === generation) window.setTimeout(step, 1500);
      });
    }
    step();
  }

  function refreshGas(gen) {
    fetchJson("https://gmgn.ai/api/v1/gas_price_list").then(function (json) {
      if (gen !== generation) return;
      var prices = (json.data && json.data.gas_prices) || [];
      var eth = null;
      prices.forEach(function (item) {
        if (item.chain === "eth") eth = item;
      });
      if (!eth) return;
      var wei = Number(eth.suggest_base_fee || eth.average);
      if (isFinite(wei)) gasGwei = wei / 1e9;
      render();
    }).catch(function () {});
  }

  function refreshPool(gen) {
    if (!globalThis.chrome || !chrome.runtime || !chrome.runtime.sendMessage) return;
    chrome.runtime.sendMessage({ type: "gmgn-pooled-eth", token: token }, function (data) {
      if (gen !== generation) return;
      if (chrome.runtime.lastError || !data) return;
      pooledEth = data.pooledEth == null ? null : Number(data.pooledEth);
      poolName = data.poolName || "";
      render();
    });
  }

  function refreshSupply(gen) {
    fetch("https://gmgn.ai/api/v1/mutil_window_token_info", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chain: "eth", addresses: [token] })
    }).then(function (response) {
      if (!response.ok) throw new Error("bad status");
      return response.json();
    }).then(function (json) {
      if (gen !== generation) return;
      var row = json && json.data && json.data[0];
      var supply = Number(row && (row.total_supply || row.circulating_supply));
      if (isFinite(supply) && supply > 0) totalSupply = supply;
      tokenSymbol = String((row && row.symbol) || "").trim();
      render();
    }).catch(function () {});
  }

  function clearLoops() {
    loops.forEach(function (id) { window.clearInterval(id); });
    loops = [];
  }

  function boot(nextToken) {
    clearLoops();
    generation += 1;
    fillingGen = 0;
    var gen = generation;
    token = nextToken;
    trades = new Map();
    backfillCursor = "";
    historyDone = false;
    historyPartial = false;
    seenTrades = 0;
    pooledEth = null;
    poolName = "";
    totalSupply = 0;
    tokenSymbol = "";
    loadCache(function () {
      if (gen !== generation) return;
      render();
      refreshHead(gen);
      refreshGas(gen);
      refreshPool(gen);
      refreshSupply(gen);
      loops.push(window.setInterval(function () { refreshHead(gen); }, 2500));
      loops.push(window.setInterval(function () { refreshGas(gen); }, 12000));
      loops.push(window.setInterval(function () { refreshPool(gen); }, 20000));
    });
  }

  function watchUrl() {
    var current = tokenFromUrl();
    if (current === token) return;
    if (!current) {
      token = "";
      generation += 1;
      clearLoops();
      if (card) card.hidden = true;
      if (showButton) showButton.hidden = true;
      if (modal) modal.hidden = true;
      return;
    }
    boot(current);
  }

  function start() {
    if (typeof GMGNTeam === "undefined") return;
    var local = storageArea();
    if (local) {
      local.get(["teamWalletGroups", "teamWalletsText"], loadWallets);
      chrome.storage.onChanged.addListener(function (changes, area) {
        if (area !== "local") return;
        if (changes.teamWalletGroups || changes.teamWalletsText) {
          local.get(["teamWalletGroups", "teamWalletsText"], loadWallets);
        }
      });
    }
    watchUrl();
    window.setInterval(watchUrl, 1000);
  }

  start();
})();
