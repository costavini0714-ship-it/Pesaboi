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

