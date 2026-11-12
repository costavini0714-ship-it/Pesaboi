'use strict';

(function () {
  const config = window.PESABOI_MONETIZATION_CONFIG || {};
  const CONSENT_KEY = 'pesaboi_ads_consent_v1';
  const placement = document.getElementById('homeAdPlacement');
  const slot = document.getElementById('homeAdSlot');
  const consentPanel = document.getElementById('adsConsentPanel');
  const premiumStatus = document.getElementById('premiumStatus');
  const premiumAction = document.getElementById('premiumAction');
  let premium = false;
  let statusChecked = false;
  let adScriptPromise = null;
  let adRequested = false;

  function isBrowserWebPage() {
    const standalone = Boolean(window.matchMedia?.('(display-mode: standalone)')?.matches || navigator.standalone === true);
    return location.protocol === 'https:' && !standalone;
  }

  function configured() {
    return config.enabled === true &&
      /^ca-pub-\d{16}$/.test(String(config.publisherId || '')) &&
      /^\d{6,20}$/.test(String(config.homeAdSlot || ''));
  }

  function setConsentVisible(visible) {
    consentPanel?.classList.toggle('hidden', !visible);
  }

  function getConsent() {
    try { return localStorage.getItem(CONSENT_KEY); }
    catch { return null; }
  }

  function setConsent(value) {
    try { localStorage.setItem(CONSENT_KEY, value); }
    catch (error) { console.warn('Preferência de anúncios não pôde ser salva:', error); }
    setConsentVisible(false);
    if (value === 'accepted' && !document.getElementById('home')?.classList.contains('hidden')) loadAd();
    else hideAd();
  }

  function hideAd() {
    placement?.classList.add('hidden');
  }

  function loadAdScript() {
    if (adScriptPromise) return adScriptPromise;
    adScriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-pesaboi-adsense="true"]');
      if (existing?.dataset.loaded === 'true') return resolve();
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error('Falha ao carregar o AdSense.')), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.dataset.pesaboiAdsense = 'true';
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(config.publisherId)}`;
      script.onload = () => { script.dataset.loaded = 'true'; resolve(); };
      script.onerror = () => reject(new Error('O navegador não conseguiu carregar o serviço de anúncios.'));
      document.head.appendChild(script);
    });
    return adScriptPromise;
  }

  async function loadAd() {
    if (!configured() || premium || getConsent() !== 'accepted' || !isBrowserWebPage()) {
      hideAd();
      return;
    }
    if (adRequested) {
      placement?.classList.remove('hidden');
      return;
    }
    if (!slot || !placement) return;

    const ad = document.createElement('ins');
    ad.className = 'adsbygoogle';
    ad.style.display = 'block';
    ad.dataset.adClient = config.publisherId;
    ad.dataset.adSlot = config.homeAdSlot;
    ad.dataset.adFormat = 'auto';
    ad.dataset.fullWidthResponsive = 'true';
    slot.replaceChildren(ad);

    try {
      await loadAdScript();
      const homeScreen = document.getElementById('home');
      if (premium || getConsent() !== 'accepted' || !homeScreen || homeScreen.classList.contains('hidden')) { hideAd(); return; }
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      adRequested = true;
      placement.classList.remove('hidden');
    } catch (error) {
      hideAd();
      console.warn('PesaBoi anúncios:', error.message);
    }
  }

  async function checkPremium() {
    if (statusChecked) return premium;
    statusChecked = true;
    try {
      const endpoint = String(config.premiumStatusEndpoint || '/api/monetization/status');
      const response = await fetch(endpoint, { cache: 'no-store', credentials: 'same-origin' });
      if (response.ok) {
        const state = await response.json();
        premium = state?.premium === true;
        if (premiumStatus) premiumStatus.textContent = premium ? 'PREMIUM ATIVO' : 'EM CONFIGURAÇÃO';
        if (premiumAction) {
          premiumAction.disabled = !state?.premium_available;
          premiumAction.textContent = state?.premium_available ? 'Conhecer Premium' : 'Premium em breve';
        }
      }
    } catch (error) {
      console.warn('Não foi possível consultar o plano Premium:', error);
    }
    if (premium) hideAd();
    return premium;
  }

  async function onScreen(screenId, hasAccount) {
    if (screenId !== 'home' || !hasAccount) {
      hideAd();
      setConsentVisible(false);
      return;
    }
    await checkPremium();
    if (premium || !configured() || !isBrowserWebPage()) {
      hideAd();
      setConsentVisible(false);
      return;
    }
    const consent = getConsent();
    if (consent === 'accepted') await loadAd();
    else if (!consent) setConsentVisible(true);
    else hideAd();
  }

  document.getElementById('acceptAdsCookies')?.addEventListener('click', () => setConsent('accepted'));
  document.getElementById('rejectAdsCookies')?.addEventListener('click', () => setConsent('rejected'));
  document.getElementById('adPreferences')?.addEventListener('click', () => {
    if (configured() && !premium) setConsentVisible(true);
    else window.open('privacidade.html', '_blank', 'noopener');
  });

  window.PesaBoiMonetization = Object.freeze({ onScreen, configured });
})();
