/*
 * PesaBoi 3.11 — configuração de anúncios e Premium.
 * NÃO invente IDs: preencha somente com os identificadores fornecidos
 * pela sua própria conta Google AdSense depois que o site for aprovado.
 */
window.PESABOI_MONETIZATION_CONFIG = Object.freeze({
  provider: 'adsense',
  enabled: false,
  publisherId: '',       // Ex.: ca-pub-1234567890123456
  homeAdSlot: '',        // ID numérico do bloco de anúncio responsivo
  premiumStatusEndpoint: '/api/monetization/status'
});
