/* PesaBoi 3.19 — assistente local para preparar um único arquivo de variáveis do Render.
   Credenciais digitadas aqui nunca são enviadas ao servidor nem persistidas no navegador. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  let initialized = false;

  async function readGatewayStatus() {
    const target = $('integrationStatusCards');
    const badge = $('integrationGatewayBadge');
    if (target) target.textContent = 'Consultando o gateway…';
    try {
      const response = await fetch('/api/integrations/status', { cache: 'no-store', headers: { Accept: 'application/json' } });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || `HTTP ${response.status}`);
      if (badge) badge.textContent = `${data.gateway} · v${data.version}`;
      renderStatus(data);
    } catch (error) {
      if (badge) badge.textContent = 'Gateway indisponível';
      if (target) target.textContent = `Não foi possível consultar o status: ${error.message}`;
    }
  }

  function renderStatus(data) {
    const target = $('integrationStatusCards');
    if (!target) return;
    target.replaceChildren();
    const cards = [ ...(data.providers || []), ...(data.publicServices || []) ];
    for (const provider of cards) {
      const card = document.createElement('article');
      card.className = 'integration-status-card';
      const title = document.createElement('strong'); title.textContent = provider.name;
      const desc = document.createElement('small');
      desc.textContent = provider.note || (provider.uses || []).join(' · ') || (provider.credentialRequired === false ? 'Acesso sem chave privada nesta versão.' : 'Serviço com credenciais próprias.');
      const pill = document.createElement('span');
      pill.className = `integration-status-pill ${provider.credentialRequired === false || provider.configured ? (provider.configured ? 'ready' : 'public') : ''}`;
      pill.textContent = provider.credentialRequired === false ? 'Sem chave privada' : provider.configured ? 'Credenciais presentes' : 'Configuração pendente';
      card.append(title, desc, pill); target.append(card);
    }
    const note = document.createElement('p');
    note.className = 'form-help';
    note.textContent = data.setupHint || 'A presença de credenciais não substitui um teste real de autenticação.';
    target.append(note);
  }

  function base64Utf8(value) {
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  }

  function envValue(value) {
    // O formato dotenv com aspas preserva espaços e caracteres especiais em tokens.
    return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n')}"`;
  }

  function makeEnv() {
    const project = $('intGeeProject').value.trim();
    const geeText = $('intGeeJson').value.trim();
    const embrapa = $('intEmbrapaToken').value.trim();
    const endpoint = $('intHFEndpoint').value.trim();
    const hfToken = $('intHFToken').value.trim();
    const hfModel = $('intHFModel').value.trim();
    const lines = [
      '# Central Agro — arquivo de variáveis do servidor PesaBoi',
      '# Não publique este arquivo no GitHub nem compartilhe suas credenciais.',
      '# Adicione no Render: Environment > Add from .env',
      ''
    ];

    if (Boolean(project) !== Boolean(geeText)) throw new Error('Para configurar o Earth Engine, preencha tanto o ID do projeto quanto o JSON da conta de serviço.');
    if (geeText) {
      let key;
      try { key = JSON.parse(geeText); } catch { throw new Error('O JSON da conta de serviço do Google está inválido.'); }
      if (key.type !== 'service_account' || !key.client_email || !key.private_key) throw new Error('O JSON do Google precisa ser uma chave de conta de serviço com type, client_email e private_key.');
      if (/\r|\n/.test(project)) throw new Error('O ID do projeto contém quebra de linha inválida.');
      lines.push('# Google Earth Engine / Sentinel-2', `GEE_PROJECT_ID=${envValue(project)}`, `GEE_SERVICE_ACCOUNT_JSON_B64=${base64Utf8(JSON.stringify(key))}`, '');
    }

    if (embrapa) {
      if (/\r|\n/.test(embrapa)) throw new Error('O token Embrapa deve estar em uma única linha.');
      lines.push('# Embrapa AgroAPI', `EMBRAPA_AGROAPI_TOKEN=${envValue(embrapa)}`, '');
    }

    if (Boolean(endpoint) !== Boolean(hfToken)) throw new Error('Para Hugging Face, informe tanto a URL do endpoint quanto o token de inferência.');
    if (endpoint) {
      let url;
      try { url = new URL(endpoint); } catch { throw new Error('A URL do endpoint Hugging Face é inválida.'); }
      const host = url.hostname.toLowerCase();
      const allowed = url.protocol === 'https:' && (host === 'router.huggingface.co' || host.endsWith('.endpoints.huggingface.cloud'));
      if (!allowed) throw new Error('Use HTTPS em router.huggingface.co ou em um domínio *.endpoints.huggingface.cloud.');
      if (/\r|\n/.test(hfToken)) throw new Error('O token Hugging Face deve estar em uma única linha.');
      lines.push('# Hugging Face Inference Endpoint', `HF_PEST_ENDPOINT_URL=${envValue(url.toString().replace(/\/$/, ''))}`, `HF_TOKEN=${envValue(hfToken)}`);
      if (hfModel) lines.push(`HF_PEST_MODEL=${envValue(hfModel)}`);
      lines.push('');
    }

    if (!geeText && !embrapa && !endpoint) throw new Error('Preencha pelo menos uma integração que exija credenciais. Open-Meteo e NASA POWER não precisam de chave nesta versão.');
    lines.push('# Open-Meteo, NASA POWER, OpenStreetMap e WMS públicos não precisam de chave neste arquivo.');
    return lines.join('\n') + '\n';
  }

  function downloadEnv() {
    const out = $('integrationExportStatus');
    try {
      const text = makeEnv();
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'central-agro.env';
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      if (out) out.textContent = 'Arquivo central-agro.env gerado no seu computador. Nenhuma credencial foi enviada ao site. Agora importe-o em Render → Environment → Add from .env e publique novamente.';
    } catch (error) {
      if (out) out.textContent = error.message;
    }
  }

  function clearForm() {
    ['intGeeProject','intGeeJson','intEmbrapaToken','intHFEndpoint','intHFToken'].forEach(id => { if ($(id)) $(id).value = ''; });
    if ($('intHFModel')) $('intHFModel').value = 'underdogquality/yolo11s-pest-detection';
    if ($('integrationExportStatus')) $('integrationExportStatus').textContent = 'Campos limpos. Nenhuma credencial foi salva no navegador.';
  }

  function init() {
    if (!initialized) {
      $('integrationConfigForm')?.addEventListener('submit', event => event.preventDefault());
      $('refreshIntegrationStatus')?.addEventListener('click', readGatewayStatus);
      $('generateCentralEnv')?.addEventListener('click', downloadEnv);
      $('clearIntegrationForm')?.addEventListener('click', clearForm);
      initialized = true;
    }
    readGatewayStatus();
  }

  window.IntegrationManager = { init, refresh: readGatewayStatus };
})();
