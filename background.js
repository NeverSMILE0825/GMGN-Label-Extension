var NATIVE_ETH = "0x0000000000000000000000000000000000000000";
var WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";

function isEthQuote(pool) {
  var rel = pool.relationships && pool.relationships.quote_token && pool.relationships.quote_token.data;
  var quoteId = String((rel && rel.id) || "").toLowerCase();
  if (quoteId.indexOf(NATIVE_ETH) !== -1 || quoteId.indexOf(WETH) !== -1) return true;
  var name = String((pool.attributes && pool.attributes.name) || "");
  return /\/ ETH\b|\/ WETH\b/i.test(name);
}

function notifyTrade(message) {
  var title = message.side === "sell" ? "New sell detected!" : "New buy detected!";
  var body = [
    "Time: " + String(message.time || "—"),
    "Total ETH: " + String(message.eth || "—"),
    "Maker: " + String(message.maker || "—")
  ].join("\n");
  chrome.notifications.create("gmgn-alert-" + Date.now(), {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon128.png"),
    title: title,
    message: body,
    priority: 2
  }, function () {
    if (chrome.runtime.lastError) return;
  });
}

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (!message) return;
  if (message.type === "gmgn-trade-alert") {
    notifyTrade(message);
    return;
  }
  if (message.type !== "gmgn-pooled-eth" || !message.token) return;
  var token = String(message.token).toLowerCase();
  fetch("https://api.geckoterminal.com/api/v2/networks/eth/tokens/" + token + "/pools?page=1", {
    headers: { accept: "application/json" }
  }).then(function (response) {
    return response.json();
  }).then(function (json) {
    var best = null;
    (json.data || []).forEach(function (pool) {
      if (!isEthQuote(pool) || !pool.attributes) return;
      var usd = Number(pool.attributes.reserve_in_usd) || 0;
      var price = Number(pool.attributes.quote_token_price_usd) || 0;
      if (!best || usd > best.usd) {
        best = { usd: usd, price: price, name: pool.attributes.name || "ETH pool" };
      }
    });
    if (!best || !best.price) {
      sendResponse({ pooledEth: null, poolName: "" });
      return;
    }
    sendResponse({
      pooledEth: (best.usd / 2) / best.price,
      poolName: best.name
    });
  }).catch(function () {
    sendResponse({ pooledEth: null, poolName: "" });
  });
  return true;
});
