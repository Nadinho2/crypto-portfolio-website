/**
 * CryptoVault — CoinGecko prices, wallet portfolio, nav/theme/mobile menu
 */
(function () {
  'use strict';

  const CG_BASE = 'https://api.coingecko.com/api/v3';

  const CHAIN_INFO = {
    '0x1': { name: 'Ethereum', cgId: 'ethereum' },
    '0xaa36a7': { name: 'Sepolia', cgId: 'ethereum' },
    '0x38': { name: 'BNB Chain', cgId: 'binancecoin' },
    '0x89': { name: 'Polygon', cgId: 'matic-network' },
    '0xa4b1': { name: 'Arbitrum One', cgId: 'ethereum' },
    '0x2105': { name: 'Base', cgId: 'ethereum' },
    '0xa': { name: 'Optimism', cgId: 'ethereum' },
    '0xa86a': { name: 'Avalanche C-Chain', cgId: 'avalanche-2' },
  };

  const ETH_MAINNET_ERC20 = [
    {
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      symbol: 'USDC',
      decimals: 6,
      cgId: 'usd-coin',
    },
    {
      address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      symbol: 'USDT',
      decimals: 6,
      cgId: 'tether',
    },
  ];

  const ERC20_MIN_ABI = [
    'function balanceOf(address owner) view returns (uint256)',
  ];

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function formatUsd(n) {
    if (n == null || Number.isNaN(n)) return '—';
    if (n >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(2) + 'K';
    if (n >= 1) return '$' + n.toLocaleString(undefined, { maximumFractionDigits: 2 });
    return '$' + n.toLocaleString(undefined, { maximumFractionDigits: 6 });
  }

  function formatPrice(n) {
    if (n == null || Number.isNaN(n)) return '—';
    if (n >= 1) return '$' + n.toLocaleString(undefined, { maximumFractionDigits: 2 });
    return '$' + n.toLocaleString(undefined, { maximumFractionDigits: 6 });
  }

  function pctClass(v) {
    if (v == null || Number.isNaN(v)) return '';
    return v >= 0 ? 'positive' : 'negative';
  }

  function formatPct(v) {
    if (v == null || Number.isNaN(v)) return '—';
    const sign = v > 0 ? '+' : '';
    return sign + v.toFixed(2) + '%';
  }

  function shortenAddr(addr) {
    if (!addr || addr.length < 10) return addr || '';
    return addr.slice(0, 6) + '…' + addr.slice(-4);
  }

  function formatWeiHexToEth(wei) {
    if (wei === 0n) return '0';
    const whole = wei / 10n ** 18n;
    const frac = wei % 10n ** 18n;
    if (whole >= 1n) {
      let fs = frac.toString().padStart(18, '0').slice(0, 6).replace(/0+$/, '');
      return fs ? whole.toString() + '.' + fs : whole.toString();
    }
    const sub = Number(wei) / 1e18;
    return sub.toExponential(4);
  }

  function weiToEthNumber(wei) {
    if (wei === 0n) return 0;
    const whole = wei / 10n ** 18n;
    const frac = wei % 10n ** 18n;
    return parseFloat(whole.toString() + '.' + frac.toString().padStart(18, '0')) || 0;
  }

  async function cgFetch(path) {
    const res = await fetch(CG_BASE + path);
    if (res.status === 429) throw new Error('Too many requests. Wait a minute and try Refresh.');
    if (!res.ok) throw new Error('Market data temporarily unavailable.');
    return res.json();
  }

  async function fetchTrendingMarkets() {
    const trending = await cgFetch('/search/trending');
    const ids = (trending.coins || [])
      .map(function (c) {
        return c.item && c.item.id;
      })
      .filter(Boolean)
      .slice(0, 18);
    if (!ids.length) throw new Error('No trending coins returned.');
    const idParam = encodeURIComponent(ids.join(','));
    const markets = await cgFetch(
      '/coins/markets?vs_currency=usd&ids=' +
        idParam +
        '&order=market_cap_desc&sparkline=false&price_change_percentage=24h,7d'
    );
    return Array.isArray(markets) ? markets : [];
  }

  async function fetchSimplePrices(ids) {
    const unique = [...new Set(ids)].filter(Boolean);
    if (!unique.length) return {};
    const q = encodeURIComponent(unique.join(','));
    return cgFetch('/simple/price?ids=' + q + '&vs_currencies=usd');
  }

  function renderMiniCoin(coin) {
    const ch24 = coin.price_change_percentage_24h;
    const sym = (coin.symbol || '').toUpperCase();
    const img = coin.image
      ? '<img class="coin-logo-img" src="' +
        coin.image +
        '" alt="" width="32" height="32" loading="lazy">'
      : '<span class="coin-logo-fallback">' +
        sym.slice(0, 1) +
        '</span>';
    return (
      '<div class="mini-coin" data-symbol="' +
      sym +
      '">' +
      '<div class="mini-coin-icon">' +
      img +
      '</div>' +
      '<h4>' +
      (coin.name || '') +
      ' (' +
      sym +
      ')</h4>' +
      '<p class="mini-coin-price" data-price>' +
      formatPrice(coin.current_price) +
      '</p>' +
      '<p class="' +
      pctClass(ch24) +
      '" data-pct24>' +
      formatPct(ch24) +
      ' (24h)</p>' +
      '</div>'
    );
  }

  function renderTableRow(coin, rank) {
    const ch24 = coin.price_change_percentage_24h;
    const ch7 = coin.price_change_percentage_7d_in_currency;
    const sym = (coin.symbol || '').toUpperCase();
    const img = coin.image
      ? '<img class="coin-logo-img sm" src="' +
        coin.image +
        '" alt="" width="28" height="28" loading="lazy">'
      : '<span class="coin-logo-fallback sm">' +
        sym.slice(0, 1) +
        '</span>';
    return (
      '<tr class="coin-row" data-symbol="' +
      sym +
      '" data-name="' +
      (coin.name || '').toLowerCase() +
      '">' +
      '<td data-label="#">' +
      rank +
      '</td>' +
      '<td data-label="Coin">' +
      '<div class="coin-name">' +
      '<span class="coin-logo-wrap">' +
      img +
      '</span>' +
      '<span>' +
      (coin.name || '') +
      ' <span class="coin-sym">' +
      sym +
      '</span></span>' +
      '</div>' +
      '</td>' +
      '<td data-label="Price">' +
      formatPrice(coin.current_price) +
      '</td>' +
      '<td data-label="24h" class="' +
      pctClass(ch24) +
      '">' +
      formatPct(ch24) +
      '</td>' +
      '<td data-label="7d" class="' +
      pctClass(ch7) +
      '">' +
      formatPct(ch7) +
      '</td>' +
      '<td data-label="Market Cap">' +
      formatUsd(coin.market_cap) +
      '</td>' +
      '<td data-label="Volume (24h)">' +
      formatUsd(coin.total_volume) +
      '</td>' +
      '<td data-label="">' +
      '<a class="btn-small btn-small-link" href="https://www.coingecko.com/en/coins/' +
      (coin.id || '') +
      '" target="_blank" rel="noopener noreferrer">View</a>' +
      '</td>' +
      '</tr>'
    );
  }

  let trendingCache = [];
  let homeRefreshBtn;
  let trendingRefreshBtn;

  function setRefreshLoading(btn, loading) {
    if (!btn) return;
    btn.disabled = loading;
    btn.classList.toggle('is-loading', loading);
  }

  async function loadHomePreview() {
    const el = $('#homeTrendingPreview');
    if (!el) return;
    setRefreshLoading(homeRefreshBtn, true);
    el.setAttribute('aria-busy', 'true');
    try {
      const markets = await fetchTrendingMarkets();
      trendingCache = markets;
      const slice = markets.slice(0, 4);
      el.innerHTML = slice.map(renderMiniCoin).join('');
      const updated = $('#homePricesUpdated');
      if (updated) updated.textContent = 'Updated ' + new Date().toLocaleString();
    } catch (e) {
      el.innerHTML =
        '<p class="price-error">Could not load prices. ' +
        (e.message || 'Try again.') +
        '</p>';
    } finally {
      setRefreshLoading(homeRefreshBtn, false);
      el.removeAttribute('aria-busy');
    }
  }

  async function loadTrendingTable() {
    const tbody = $('#coinTableBody');
    if (!tbody) return;
    setRefreshLoading(trendingRefreshBtn, true);
    tbody.setAttribute('aria-busy', 'true');
    try {
      const markets = await fetchTrendingMarkets();
      trendingCache = markets;
      tbody.innerHTML = markets
        .map(function (c, i) {
          return renderTableRow(c, i + 1);
        })
        .join('');
      applyTrendingFilters();
      const meta = $('#trendingMeta');
      if (meta)
        meta.textContent =
          'Live from CoinGecko · ' + markets.length + ' trending · ' + new Date().toLocaleString();
    } catch (e) {
      tbody.innerHTML =
        '<tr><td colspan="8" class="price-error-cell">' +
        (e.message || 'Failed to load.') +
        '</td></tr>';
    } finally {
      setRefreshLoading(trendingRefreshBtn, false);
      tbody.removeAttribute('aria-busy');
    }
  }

  function applyTrendingFilters() {
    const tbody = $('#coinTableBody');
    if (!tbody) return;
    const q = (($('#searchInput') && $('#searchInput').value) || '').trim().toLowerCase();
    const activeBtn = document.querySelector('.filter-btn.active');
    const filter = activeBtn ? activeBtn.getAttribute('data-filter') : 'all';
    const rows = [...tbody.querySelectorAll('.coin-row')];
    rows.forEach(function (row) {
      const sym = (row.getAttribute('data-symbol') || '').toLowerCase();
      const name = row.getAttribute('data-name') || '';
      const textOk = !q || sym.includes(q) || name.includes(q);
      const ch24Cell = row.querySelector('td:nth-child(4)');
      const raw = ch24Cell ? ch24Cell.textContent.replace(/[+%]/g, '') : '';
      const ch24 = parseFloat(raw);
      let filterOk = true;
      if (filter === 'gainers') filterOk = ch24 > 0;
      if (filter === 'losers') filterOk = ch24 < 0;
      row.style.display = textOk && filterOk ? '' : 'none';
    });
    let n = 0;
    rows.forEach(function (row) {
      if (row.style.display === 'none') return;
      n += 1;
      const rankCell = row.querySelector('td:first-child');
      if (rankCell) rankCell.textContent = String(n);
    });
  }

  function initTrendingPage() {
    trendingRefreshBtn = $('#refreshPricesBtn');
    if (trendingRefreshBtn) {
      trendingRefreshBtn.addEventListener('click', function () {
        loadTrendingTable();
      });
    }
    const search = $('#searchInput');
    if (search) {
      search.addEventListener('input', applyTrendingFilters);
    }
    document.querySelectorAll('.filter-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.filter-btn').forEach(function (b) {
          b.classList.remove('active');
        });
        btn.classList.add('active');
        applyTrendingFilters();
      });
    });
    const loadMore = $('#loadMoreCoinsBtn');
    if (loadMore) {
      loadMore.addEventListener('click', async function () {
        loadMore.disabled = true;
        try {
          const data = await cgFetch(
            '/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=30&page=1&sparkline=false&price_change_percentage=24h,7d'
          );
          const tbody = $('#coinTableBody');
          if (tbody && Array.isArray(data)) {
            const start = tbody.querySelectorAll('.coin-row').length;
            const extra = data
              .map(function (c, i) {
                return renderTableRow(c, start + i + 1);
              })
              .join('');
            tbody.insertAdjacentHTML('beforeend', extra);
            applyTrendingFilters();
          }
        } catch (e) {
          alert(e.message || 'Could not load more.');
        } finally {
          loadMore.disabled = false;
        }
      });
    }
    loadTrendingTable();
  }

  function initHomePreview() {
    homeRefreshBtn = $('#homeRefreshBtn');
    if (homeRefreshBtn) {
      homeRefreshBtn.addEventListener('click', loadHomePreview);
    }
    loadHomePreview();
  }

  /* ---------- Wallet ---------- */
  let walletAddress = null;
  let provider = null;

  function getEthereum() {
    return window.ethereum;
  }

  function openPortfolioPanel() {
    const p = $('#portfolioPanel');
    const o = $('#portfolioOverlay');
    if (p) p.classList.add('open');
    if (o) o.classList.add('open');
    document.body.classList.add('portfolio-open');
  }

  function closePortfolioPanel() {
    const p = $('#portfolioPanel');
    const o = $('#portfolioOverlay');
    if (p) p.classList.remove('open');
    if (o) o.classList.remove('open');
    document.body.classList.remove('portfolio-open');
  }

  function setWalletButtonLabel(text) {
    document.querySelectorAll('.btn-wallet-nav').forEach(function (b) {
      b.textContent = text;
    });
  }

  async function refreshPortfolioBalances() {
    const eth = getEthereum();
    const content = $('#portfolioContent');
    if (!eth || !walletAddress || !content) return;

    content.innerHTML =
      '<p class="portfolio-loading">Reading balances…</p>';

    const chainId = await eth.request({ method: 'eth_chainId' });
    const info = CHAIN_INFO[chainId] || { name: 'Unknown network', cgId: 'ethereum' };

    let nativeBal = '0';
    let nativeNum = 0;
    try {
      const hex = await eth.request({
        method: 'eth_getBalance',
        params: [walletAddress, 'latest'],
      });
      const wei = BigInt(hex);
      nativeBal = formatWeiHexToEth(wei);
      nativeNum = weiToEthNumber(wei);
    } catch (e) {
      nativeBal = '—';
    }

    const prices = await fetchSimplePrices([info.cgId]);
    const usdPx = prices[info.cgId] && prices[info.cgId].usd;
    const nativeUsd =
      usdPx != null && nativeNum >= 0 && !Number.isNaN(nativeNum)
        ? nativeNum * usdPx
        : null;

    let html =
      '<div class="portfolio-section">' +
      '<p class="portfolio-label">Network</p>' +
      '<p class="portfolio-value">' +
      info.name +
      '</p>' +
      '</div>' +
      '<div class="portfolio-section">' +
      '<p class="portfolio-label">Native balance</p>' +
      '<p class="portfolio-value">' +
      nativeBal +
      ' <span class="muted">(gas token)</span></p>' +
      (nativeUsd != null
        ? '<p class="portfolio-usd">≈ ' + formatUsd(nativeUsd) + '</p>'
        : '') +
      '</div>';

    if (chainId === '0x1' && typeof ethers !== 'undefined') {
      try {
        const browserProvider = new ethers.BrowserProvider(eth);
        const pricesTok = await fetchSimplePrices(
          ETH_MAINNET_ERC20.map(function (t) {
            return t.cgId;
          })
        );
        let tokensHtml = '<div class="portfolio-section"><p class="portfolio-label">Tokens (Ethereum)</p><ul class="token-list">';
        for (let i = 0; i < ETH_MAINNET_ERC20.length; i++) {
          const t = ETH_MAINNET_ERC20[i];
          const contract = new ethers.Contract(t.address, ERC20_MIN_ABI, browserProvider);
          const raw = await contract.balanceOf(walletAddress);
          const dec = t.decimals;
          const val = parseFloat(ethers.formatUnits(raw, dec));
          const pu = pricesTok[t.cgId] && pricesTok[t.cgId].usd;
          const usd = pu != null ? val * pu : null;
          if (val > 0) {
            tokensHtml +=
              '<li><span>' +
              t.symbol +
              '</span><span>' +
              val.toLocaleString(undefined, { maximumFractionDigits: 4 }) +
              (usd != null ? ' · ' + formatUsd(usd) : '') +
              '</span></li>';
          }
        }
        tokensHtml += '</ul>';
        const hasAny = tokensHtml.indexOf('<li>') !== -1;
        html += hasAny ? tokensHtml : '<p class="muted small">No USDC/USDT balance on this address (mainnet).</p>';
      } catch (e) {
        html +=
          '<p class="muted small">Could not load token balances. ' +
          (e.message || '') +
          '</p>';
      }
    } else if (chainId !== '0x1') {
      html +=
        '<p class="muted small">Switch to Ethereum mainnet in your wallet to see USDC & USDT.</p>';
    }

    html +=
      '<p class="portfolio-disclaimer">Estimates use CoinGecko USD prices. Not financial advice.</p>';
    content.innerHTML = html;
  }

  async function connectWallet() {
    const eth = getEthereum();
    if (!eth) {
      alert('No wallet detected. Install MetaMask or another Ethereum wallet.');
      return;
    }
    try {
      const accounts = await eth.request({ method: 'eth_requestAccounts' });
      walletAddress = accounts[0] || null;
      provider = eth;
      if (!walletAddress) return;
      setWalletButtonLabel(shortenAddr(walletAddress));
      const addrEl = $('#portfolioAddress');
      if (addrEl) addrEl.textContent = walletAddress;
      openPortfolioPanel();
      await refreshPortfolioBalances();

      if (typeof eth.removeListener === 'function') {
        eth.removeListener('chainChanged', onChainChanged);
        eth.removeListener('accountsChanged', onAccountsChanged);
      }
      if (typeof eth.on === 'function') {
        eth.on('chainChanged', onChainChanged);
        eth.on('accountsChanged', onAccountsChanged);
      }
    } catch (e) {
      if (e && e.code === 4001) return;
      alert(e.message || 'Could not connect wallet.');
    }
  }

  function onChainChanged() {
    if (walletAddress) refreshPortfolioBalances();
  }

  function onAccountsChanged(accs) {
    if (!accs || !accs.length) {
      disconnectWallet();
      return;
    }
    walletAddress = accs[0];
    setWalletButtonLabel(shortenAddr(walletAddress));
    const addrEl = $('#portfolioAddress');
    if (addrEl) addrEl.textContent = walletAddress;
    refreshPortfolioBalances();
  }

  function disconnectWallet() {
    walletAddress = null;
    provider = null;
    setWalletButtonLabel('Connect wallet');
    closePortfolioPanel();
    const eth = getEthereum();
    if (eth && eth.removeListener) {
      eth.removeListener('chainChanged', onChainChanged);
      eth.removeListener('accountsChanged', onAccountsChanged);
    }
  }

  function initWalletUi() {
    document.querySelectorAll('.btn-wallet-nav').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (walletAddress) {
          openPortfolioPanel();
          refreshPortfolioBalances();
        } else {
          connectWallet();
        }
      });
    });
    const closeBtn = $('#portfolioCloseBtn');
    if (closeBtn) closeBtn.addEventListener('click', closePortfolioPanel);
    const overlay = $('#portfolioOverlay');
    if (overlay) overlay.addEventListener('click', closePortfolioPanel);
    const refreshBal = $('#portfolioRefreshBtn');
    if (refreshBal) refreshBal.addEventListener('click', refreshPortfolioBalances);
    const disconnectBtn = $('#portfolioDisconnectBtn');
    if (disconnectBtn) {
      disconnectBtn.addEventListener('click', function () {
        disconnectWallet();
      });
    }
  }

  /* ---------- Nav / theme / mobile ---------- */
  function initNav() {
    const menuBtn = document.querySelector('.mobile-menu-btn');
    const navLinks = document.querySelector('.nav-links');
    if (menuBtn && navLinks) {
      menuBtn.addEventListener('click', function () {
        navLinks.classList.toggle('active');
        const open = navLinks.classList.contains('active');
        menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      navLinks.querySelectorAll('a').forEach(function (a) {
        a.addEventListener('click', function () {
          navLinks.classList.remove('active');
          menuBtn.setAttribute('aria-expanded', 'false');
        });
      });
    }

    const path = (window.location.pathname || '').split('/').pop() || 'index.html';
    document.querySelectorAll('.nav-links a').forEach(function (a) {
      const href = (a.getAttribute('href') || '').split('/').pop();
      a.classList.toggle('active', href === path || (path === '' && href === 'index.html'));
    });
  }

  function initTheme() {
    const key = 'cryptovault-theme';
    const root = document.documentElement;
    const saved = localStorage.getItem(key);
    if (saved === 'light') root.setAttribute('data-theme', 'light');

    function syncThemeIcons() {
      const light = root.getAttribute('data-theme') === 'light';
      document.querySelectorAll('.theme-toggle').forEach(function (b) {
        b.textContent = light ? '☀️' : '🌙';
      });
    }

    syncThemeIcons();

    document.querySelectorAll('.theme-toggle').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
        if (next === 'light') {
          root.setAttribute('data-theme', 'light');
          localStorage.setItem(key, 'light');
        } else {
          root.removeAttribute('data-theme');
          localStorage.removeItem(key);
        }
        syncThemeIcons();
      });
    });
  }

  function injectPortfolioShell() {
    if ($('#portfolioPanel')) return;
    const wrap = document.createElement('div');
    wrap.innerHTML =
      '<div id="portfolioOverlay" class="portfolio-overlay" aria-hidden="true"></div>' +
      '<aside id="portfolioPanel" class="portfolio-panel" role="dialog" aria-labelledby="portfolioTitle">' +
      '<div class="portfolio-panel-head">' +
      '<h2 id="portfolioTitle">Your wallet</h2>' +
      '<button type="button" class="icon-btn" id="portfolioCloseBtn" aria-label="Close">×</button>' +
      '</div>' +
      '<p id="portfolioAddress" class="portfolio-address mono"></p>' +
      '<div class="portfolio-actions">' +
      '<button type="button" class="btn-secondary btn-compact" id="portfolioRefreshBtn">Refresh balances</button>' +
      '<button type="button" class="btn-ghost btn-compact" id="portfolioDisconnectBtn">Disconnect</button>' +
      '</div>' +
      '<div id="portfolioContent" class="portfolio-content"></div>' +
      '</aside>';
    while (wrap.firstChild) {
      document.body.appendChild(wrap.firstChild);
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    injectPortfolioShell();
    initNav();
    initTheme();
    initWalletUi();
    if ($('#homeTrendingPreview')) initHomePreview();
    if ($('#coinTableBody')) initTrendingPage();
  });
})();
