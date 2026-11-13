(function () {
  var NATIVE_ETH = "0x0000000000000000000000000000000000000000";
  var WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
  var MAX_PAGES = 500;
  var CACHE_VERSION = 2;
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

  function isEthQuote(address) {
    var quote = String(address || "").toLowerCase();
    return quote === NATIVE_ETH || quote === WETH;
  }

  function ingest(history) {
    var added = 0;
    (history || []).forEach(function (row) {
      if (!row || !row.id || trades.has(row.id)) return;
      if (!isEthQuote(row.quote_address)) return;
      var side = row.event === "buy" ? "b" : row.event === "sell" ? "s" : row.event === "add" ? "a" : row.event === "remove" ? "r" : "";
      if (!side) return;
      var amount = Number(row.quote_amount);
      if (!isFinite(amount) || amount < 0) amount = 0;
      var maker = GMGNTeam.normalizeAddress(row.maker);
      if (!maker) return;
      trades.set(row.id, {
        maker: maker,
        side: side,
        amount: amount
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
    trades.forEach(function (trade) {
      if (walletMap.has(trade.maker)) return;
      if (trade.side === "b") {
        buyEth += trade.amount;
        buys += 1;
      } else if (trade.side === "s") {
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
      trades: buys + sells
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
      '<footer class="gmgn-eth-foot">',
      '<span>POOLED ETH <b id="gmgn-eth-pooled">—</b></span>',
      '<span class="gas">GAS <b id="gmgn-eth-gas">—</b></span>',
      "</footer>"
    ].join("");
    card.querySelector(".gmgn-eth-hide").addEventListener("click", function () {
      setHidden(true);
    });
    showButton = document.createElement("button");
    showButton.type = "button";
    showButton.className = "gmgn-eth-show";
    showButton.textContent = "Unlabeled ETH";
    showButton.addEventListener("click", function () {
      setHidden(false);
    });
    document.body.appendChild(card);
    document.body.appendChild(showButton);
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
    var pooled = card.querySelector("#gmgn-eth-pooled");
    pooled.textContent = pooledEth == null ? "—" : formatEth(pooledEth, false) + " ETH";
    pooled.title = poolName || "";
    card.querySelector("#gmgn-eth-gas").textContent = gasGwei == null ? "—" : formatGas(gasGwei) + " gwei";
    card.hidden = hidden;
    showButton.hidden = !hidden;
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
        rows.push([id, trade.maker, trade.side, trade.amount]);
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
    local.get([key, "gmgnEthCardHidden"], function (data) {
      hidden = !!(data && data.gmgnEthCardHidden);
      var cached = data && data[key];
      if (cached && cached.version === CACHE_VERSION && cached.trades) {
        cached.trades.forEach(function (row) {
          trades.set(row[0], { maker: row[1], side: row[2], amount: row[3] });
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
    loadCache(function () {
      if (gen !== generation) return;
      render();
      refreshHead(gen);
      refreshGas(gen);
      refreshPool(gen);
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
