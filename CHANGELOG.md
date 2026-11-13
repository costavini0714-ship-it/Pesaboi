# Histórico de versões do PesaBoi

- Inserido no `<head>` o snippet de verificação do Google AdSense informado pelo responsável do PesaBoi.
- Preenchido o ID de editor `ca-pub-3842159038545616` na configuração de monetização; veiculação manual permanece desligada até aprovação e ID de bloco.
- Criado `ads.txt` na raiz com o registro do publisher informado.
- Ajustado o carregador para reaproveitar a tag AdSense do cabeçalho e não duplicar a biblioteca.
- Atualizado o cache/service worker para a versão 3.12.
- Mantida a veiculação de blocos manuais desativada até a aprovação e configuração de `data-ad-slot`.

# PesaBoi 3.11 — Monetização web preparada

- Adicionado espaço responsivo para anúncio na tela inicial, separado dos botões e sem anúncios nas etapas de câmera, pesagem e relatórios individuais.
- Preparada integração opcional com Google AdSense em `monetization-config.js`, desligada por padrão até inserir IDs reais e obter aprovação do domínio.
- Adicionado consentimento de cookies publicitários com opções aceitar/recusar e alteração pelo rodapé.
- Adicionada Política de Privacidade inicial e modelo de referência para `ads.txt`.
- Adicionado cartão informativo do plano Premium. Cobrança e validação segura da assinatura ainda não estão conectadas; o app não finge ativar Premium.
- AdSense limitado à versão web HTTPS em navegador, não ao modo instalado/PWA.

# PesaBoi 3.10

- Removido o item visual “Seu rebanho” da tela inicial e o rótulo correspondente no Banco de Dados.
- Adicionado o botão “Salvar e voltar ao Banco de Dados” na tela DADOS DO BOI; a ficha é calculada e salva antes da navegação.
- Adicionado botão explícito para retornar ao Banco de Dados a partir do relatório individual.
- Preservadas as funcionalidades e os dados da versão 3.9.

# PesaBoi 3.9

## Alterações
- Removidos os controles manuais de calibração da fotografia: régua, marcação A/B/C/D, clique/arraste dos pontos e confirmação manual do enquadramento.
- Removidos os campos de fita métrica e ajuste manual do coeficiente K do fluxo de pesagem.
- Adicionada detecção bovina local no navegador com TensorFlow.js + COCO-SSD; não exige chave de API e a fotografia não é enviada ao servidor para detecção.
- O motor matemático usa a caixa visual detectada, proporções médias por raça/porte, seção torácica elíptica aproximada e fórmula morfométrica.
- O resultado é apresentado como pré-estimativa experimental, com faixa ampla de incerteza.
- Mantidos banco de dados, fotos, histórico, relatórios, saúde, vacinas e comparação posterior com pesagens reais de balança.

## Limitação importante
Uma imagem RGB comum não fornece escala física nem profundidade 3D. O detector localiza o bovino, mas as dimensões são aproximadas a partir de médias de raça/porte; isso não substitui uma balança nem uma câmera de profundidade calibrada. A faixa exibida não representa precisão validada.



## 3.13 — Central Agro + GPS Agrônomo
- Central Agro passa a ser a primeira tela após cadastro/login, com módulos separados PesaBoi e GPS Agrônomo.
- Preservado o fluxo existente do PesaBoi dentro do módulo próprio.
- Criado GPS Agrônomo sem IA: localização, mapa, trilha, talhões, cálculo UTM de hectares, linhas A/B/paralelas, desvio lateral, cadastro de máquinas, operações e calculadoras.
- Dados do GPS armazenados localmente e exportáveis em JSON; cache do shell atualizado.
- RTK/NTRIP/RBMC-IP apresentados com limites explícitos; integração real não é declarada como conectada.


## 3.14 — Permissões da câmera e consentimento do GPS
- Tela explicativa e ação explícita para solicitar a permissão da câmera do navegador quando ela ainda não foi concedida.
- Tratamento de permissão bloqueada com instruções para reativar a câmera nas configurações do site.
- Consentimento explícito para uso da localização e cartografia regional no GPS Agrônomo, com opção de revogação.
- Bloqueio de localização, gravação de trajetórias, pontos A/B e desenho de talhões até o consentimento.
- Política de Privacidade e cache do service worker atualizados para 3.14.


# PesaBoi 3.15 — acesso resiliente à câmera e GPS sem bloqueio interno

- O botão de abrir câmera dispara diretamente a solicitação nativa do navegador no gesto do usuário, sem consulta prévia de permissões que possa atrasar a abertura do prompt.
- Implementada segunda tentativa de abertura com `video: true` quando restrições de câmera, resolução ou dispositivo selecionado não são compatíveis.
- Mensagens de bloqueio do navegador explicam como alterar as permissões do site; a escolha de fotografia permanece disponível na própria tela de permissão.
- O consentimento interno do GPS tornou-se opcional e informativo; não impede solicitar localização, gravar trajetórias, demarcar ou salvar talhões.
- A localização real continua sob controle do navegador/sistema operacional e só é solicitada quando o usuário aciona um recurso GPS.
- Adicionada marcação manual dos pontos A/B clicando no mapa para uso quando a localização do dispositivo estiver indisponível.
- Política de Privacidade, versão da API, testes e cache do service worker atualizados.


## 3.16
- Adicionado acionamento do seletor nativo de câmera do aparelho (`capture=environment`) como alternativa independente à prévia ao vivo do navegador.
- Separados os caminhos de captura pelo aparelho e seleção de uma foto já salva.
- Instruções específicas para resolver permissão previamente negada e explicação clara dos limites de segurança do navegador/SO.
- Atualizados cache e versão de saúde para 3.16.


## 3.17 — Central Agro expandida

- Adicionados seis módulos: Sentinel-2/NDVI, clima/balanço hídrico, solo/ZARC, análise ambiental, pasto/ração/mercado e diagnóstico visual de pragas.
- GPS e mapas front-end migrados para OpenLayers, com base OpenStreetMap e interação Draw/Modify.
- Criados serviços de backend para Google Earth Engine, Open-Meteo, NASA POWER, SoilGrids, WMS SICAR/TerraBrasilis, MapBiomas e endpoints Hugging Face.
- Adicionadas rotas autenticadas Embrapa ClimAPI e SmartSolos Expert.
- O detector IP102 de pragas exige endpoint Hugging Face dedicado; TensorFlow.js local só ativa com modelo TF.js próprio instalado.
- Acrescentados testes de status, validação de coordenadas, exigência de credenciais e formato de perfis.


## 3.18 — refinamento de análise agronômica

- Datas no fuso local e validação de coordenadas vazias.
- Centralização do mapa Sentinel-2 por coordenadas digitadas e aproximação automática ao solicitar RGB/NDVI.
- Atualizados assets, cache PWA e health check para 3.18.
- Cotação CEPEA explicitamente manual; removida variável de ambiente de API genérica que não estava conectada.

- Acrescentada consulta oficial Embrapa AgroAPI Agritec v2: culturas com ZARC por município e janelas de plantio por código IBGE, ID da cultura e risco (20/30/40/todos).


## 3.19 — Gerenciador Central de Integrações
- Adicionada tela Central de Integrações à Central Agro.
- Adicionado endpoint `/api/integrations/status` sem exposição de segredos.
- Adicionado gerador local de `central-agro.env` para importação em lote no Render.
- Compatibilidade de Earth Engine com `GEE_SERVICE_ACCOUNT_JSON_B64`, mantendo o formato JSON legado.
- Atualizados assets, cache PWA, testes de versão e health check.
