# PesaBoi 3.19 — Central Agro e Gerenciador Unificado de Integrações

O PesaBoi 3.19 mantém a análise visual experimental e simplifica a navegação. A versão 3.9 removeu a etapa de calibração manual da fotografia. O usuário não precisa marcar pontos, colocar régua, informar distâncias em pixels ou medir o tórax com fita no fluxo de pesagem.

## Fluxo
1. Abra a câmera e fotografe o bovino de lado, com o corpo inteiro e boa iluminação.
2. O detector COCO-SSD é carregado no navegador e procura a classe `cow` na fotografia; ele fornece uma caixa de localização e uma pontuação de detecção, não pontos anatômicos bovinos.
3. O usuário informa raça e porte; nome e brinco continuam opcionais.
4. O motor matemático combina a caixa visual detectada com proporções morfométricas médias de raça/porte, estima uma seção torácica elíptica e calcula uma pré-estimativa pela fórmula de Crevat.
5. O resultado, sua faixa ampla de incerteza, a fotografia e os dados ficam salvos na ficha individual.
6. Quando o peso real da balança é registrado, o histórico pode ser comparado e, após pelo menos cinco comparações válidas, calcular um coeficiente K empírico para aquela raça/porte.

## Detecção local
- TensorFlow.js 4.22.0 e COCO-SSD 2.2.3 são carregados por CDN na primeira utilização.
- Não é necessária chave de API nem conta em um serviço de visão computacional.
- Após o download dos arquivos de modelo, a inferência da imagem é executada no navegador. A fotografia não é enviada ao servidor PesaBoi para a detecção.
- A detecção pode falhar em fotos muito escuras, com obstruções, animais pequenos ou ângulos frontais/traseiros. Nesses casos o sistema pede outra fotografia, sem gerar peso.

## Limitação científica e de segurança
Uma fotografia RGB comum não revela, por si só, a escala física nem a profundidade 3D do bovino. O COCO-SSD fornece uma caixa de detecção, não pontos anatômicos bovinos nem medidas reais. Por isso, o comprimento e o perímetro torácico desta versão são aproximados a partir de médias morfométricas de raça/porte e da proporção da caixa visual. O peso é uma **pré-estimativa experimental de baixa confiança**, não uma pesagem real. A faixa ampla exibida é indicativa, não um intervalo de confiança validado.

Não use a pré-estimativa como única referência para venda, dosagem de medicamentos, vacinação ou decisões veterinárias. Confirme o peso em balança e procure um veterinário para avaliação de saúde. A câmera comum também não diagnostica doenças.

## Design e dados
- Tema azul-marinho/cobre e fundo rural mantidos.
- Nome e brinco opcionais; raça e porte obrigatórios.
- Banco de dados local, fotos, relatório individual, status de saúde, vacinas e histórico preservados.
- A visão noturna continua limitada ao realce digital e ao suporte de lanterna/IR do aparelho.

## Executar localmente
1. Instale Python 3.
2. Extraia o ZIP.
3. Execute `ABRIR-PESABOI.bat`.
4. Autorize o acesso à câmera.
5. Na primeira análise, mantenha a internet ativa para baixar os arquivos do detector. Depois, o navegador pode reutilizar o cache local.

## Publicar pelo GitHub e Render
1. Crie um repositório novo no GitHub.
2. Extraia o ZIP e envie **todos os arquivos e pastas que estão dentro de `PesaBoi-3.19`** para a raiz do repositório. O arquivo `render.yaml` deve ficar na raiz, ao lado de `server.py` e `requirements.txt`.
3. No Render, escolha **New > Blueprint**, conecte o repositório e confirme o serviço descrito em `render.yaml`.
4. O Render usará automaticamente:
   - Runtime: Python
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `python server.py`
   - Health Check: `/api/health`
5. Aguarde o deploy terminar e abra o endereço `*.onrender.com` gerado pelo Render.

A câmera do navegador em produção requer HTTPS. O Render fornece HTTPS para o domínio `onrender.com`.


## Alterações da versão 3.10

- Removido o cartão/aba visual identificado como “Seu rebanho” da tela inicial e removido o rótulo repetido da página Banco de Dados.
- A tela DADOS DO BOI agora oferece a ação **Salvar e voltar ao Banco de Dados**, que executa a mesma análise e grava a ficha antes de retornar à lista.
- O relatório individual também possui um botão explícito **Voltar ao Banco de Dados**.
- Os demais dados, cálculos e funcionalidades da versão 3.9 foram preservados.


## Monetização — versão 3.12

- O snippet do Google AdSense fornecido pelo responsável foi inserido em `index.html`, dentro de `<head>`, para permitir a verificação do site.
- O ID de editor `ca-pub-3842159038545616` foi preenchido em `monetization-config.js`; `enabled` permanece `false` e `homeAdSlot` vazio até a aprovação do site e a criação de um bloco de anúncio.
- Foi adicionado o arquivo `/ads.txt` na raiz com a linha `google.com, pub-3842159038545616, DIRECT, f08c47fec0942fa0`. Se o painel do AdSense mostrar uma linha diferente, prevalece a linha exata do painel.
- O carregador usa o snippet já inserido no cabeçalho para evitar carregar a biblioteca AdSense duas vezes.
- Os blocos manuais continuam limitados à tela inicial, em HTTPS e navegador web; não aparecem na câmera, captura, pesagem ou relatórios individuais.
- Após o deploy, confira `https://pesaboi.onrender.com/ads.txt`, volte ao AdSense e clique em Verificar. A aprovação ainda depende da análise do Google.
- Após a aprovação, crie um bloco Display responsivo, copie o `data-ad-slot`, defina `enabled: true` e preencha `homeAdSlot`. O consentimento do usuário continua sendo solicitado antes de inserir os blocos manuais.
- Não clique nos próprios anúncios nem incentive terceiros a clicar.

### Plano Premium

A interface do Premium está preparada como apresentação, mas pagamento e confirmação segura de assinatura ainda não estão conectados. O endpoint `/api/monetization/status` informa explicitamente que o Premium está indisponível; nenhum usuário é marcado como Premium por um valor guardado no navegador. Não há cobrança nesta versão. Para liberar assinaturas e remover anúncios automaticamente, será necessário integrar um gateway de pagamento e validação de assinatura no servidor.

### Arquivos de monetização

- `monetization-config.js`: identificador do editor e bloco de anúncios.
- `monetization.js`: carregamento condicional, consentimento e regras de exibição.
- `privacidade.html`: política de privacidade inicial. Atualize com a identificação e contato do responsável antes de publicar comercialmente.
- `ads.txt.modelo`: modelo de referência; não publicar sem os dados oficiais da conta.

Referências oficiais: [conectar e aprovar o site no AdSense](https://support.google.com/adsense/answer/7584263?hl=pt-BR) e [políticas de posicionamento de anúncios](https://support.google.com/adsense/answer/1346295?hl=pt-BR).


## Central Agro e GPS Agrônomo — versão 3.13

Após o cadastro, o usuário entra na **Central Agro**, que separa os módulos PesaBoi e GPS Agrônomo. O módulo PesaBoi mantém as telas e registros anteriores. O GPS Agrônomo é independente e não utiliza inteligência artificial.

### Recursos incluídos no GPS Agrônomo
- Geolocalização do navegador com indicação da precisão informada pelo receptor.
- Mapa OpenLayers com base OpenStreetMap, desenho e edição de geometrias; as ferramentas nativas do OpenLayers substituem o Geoman, que é um plugin de Leaflet.
- Gravação de trajetória, distância e velocidade informada pelo dispositivo.
- Cadastro de talhões por vértices no mapa e cálculo de área em UTM/WGS84, com resultado em hectares.
- Marcação de pontos A/B, geração matemática de linhas paralelas, largura útil, sobreposição, passada e desvio lateral.
- Cadastro de máquinas e implementos; registro de operações agrícolas.
- Calculadoras de capacidade operacional, pulverização, população de sementes, fertilizante e inclinação.
- Dados de GPS, talhões e operações guardados localmente por conta, com exportação JSON.
- GPS, cálculos e registros locais disponíveis offline. O mapa base online e correções NTRIP dependem de conexão ou de mapas previamente armazenados.

### Limites de precisão e RTK
A posição comum vem do navegador/aparelho. Receptores externos podem ser usados quando expõem localização ao dispositivo por uma interface compatível. A tela de configuração descreve GNSS diferencial, RTK e RBMC-IP/IBGE, mas **não declara uma conexão NTRIP ativa**: esta versão não inclui cliente NTRIP nem autenticação RBMC-IP. Precisão centimétrica só pode ser anunciada após conectar e validar receptor, antena, correções e fluxo de dados.

### Fórmulas e observações
- Distância entre posições: Haversine; distância e área dos talhões: projeção UTM/WGS84.
- Área (ha) = área projetada em m² ÷ 10.000.
- Velocidade = distância ÷ tempo; prefere-se a velocidade reportada pelo GNSS quando disponível.
- Espaçamento útil = largura do implemento − sobreposição.
- Capacidade teórica (ha/h) = largura (m) × velocidade (km/h) ÷ 10.
- Pulverização (L/ha) = 600 × vazão total (L/min) ÷ velocidade (km/h) ÷ largura (m).
- Sementes/ha = população desejada ÷ (germinação × emergência), com percentuais convertidos em fração.
- Fertilizante (kg) = dose (kg/ha) × área (ha). Inclinação (%) = desnível ÷ distância horizontal × 100.

A cobertura calculada a partir de distância × largura útil é uma estimativa operacional, não um mapa de cobertura real com detecção de cada passada. A orientação AB é assistida e não controla o trator nem substitui piloto automático agrícola certificado.

### Atualização
Substitua o conteúdo do repositório pelo conteúdo completo deste ZIP. O arquivo `render.yaml` continua na raiz e o deploy usa `python server.py`.


## 3.14 — permissões da câmera e consentimento interno do GPS (histórico)

- A versão 3.14 incluiu explicação e botão para solicitar a permissão da câmera; também mantinha um consentimento interno obrigatório no GPS. Essa exigência interna foi removida na versão 3.15 porque duplicava a permissão do navegador e bloqueava funções que não precisavam dela.
- O texto de privacidade informava que o mapa integrado utilizava cartografia OpenStreetMap e que imagens aéreas/satélite dependiam de uma fonte compatível ainda não integrada.


## 3.15 — câmera resiliente e GPS sem bloqueio por consentimento interno

- Ao tocar em abrir câmera, o aplicativo chama diretamente `getUserMedia` para permitir que o navegador mostre sua solicitação nativa de acesso no mesmo gesto do usuário.
- Removida a consulta prévia à Permissions API, que podia atrasar a solicitação e não consegue reabrir um prompt quando a permissão já foi negada.
- Adicionada tentativa secundária com restrições simples de vídeo quando a câmera escolhida ou as restrições ideais não são suportadas.
- Em caso de bloqueio do navegador, a tela explica como alterar a permissão do site e oferece escolha de foto como alternativa. Um site não pode retirar programaticamente uma recusa feita no navegador/sistema.
- O aviso de localização/mapas do GPS tornou-se opcional e não bloqueia localização, gravação, demarcação, pontos A/B, cálculos ou salvamento. A permissão de localização é solicitada pelo próprio navegador somente quando o usuário aciona o GPS.
- Adicionada marcação manual dos pontos A e B clicando no mapa, útil quando a localização do navegador estiver negada ou indisponível.
- Demarcação e salvamento manual de talhões continuam disponíveis sem a autorização opcional.
- Política de Privacidade, testes, endpoints e cache atualizados para 3.15.

**Limite técnico:** o código não pode forçar a câmera ou a localização se o usuário, navegador ou sistema operacional bloquear o acesso. Nesse caso, o PesaBoi mantém as alternativas manuais e explica como liberar a permissão.


## 3.16 — alternativa de captura pelo próprio aparelho

- Adicionado o botão **Abrir câmera do aparelho**. Ele aciona diretamente o seletor nativo de mídia com `capture="environment"`; em navegadores móveis compatíveis, o usuário pode tirar uma foto com a câmera traseira sem depender da prévia ao vivo (`getUserMedia`).
- A opção **Escolher foto salva** continua disponível separadamente. Ambas levam a imagem para o mesmo processamento e enquadramento integral já utilizado pelo PesaBoi.
- Quando a permissão de câmera ao vivo já foi negada, o aplicativo explica como alterar a permissão do site/aparelho e não fica preso repetindo uma solicitação que o navegador não exibirá.
- A captura nativa continua sujeita às permissões do navegador e do sistema operacional; nenhum site pode contornar uma recusa do usuário ou do sistema.
- Cache do Service Worker, arquivos estáticos e endpoint `/api/health` atualizados para 3.16.

### Como aplicar a atualização

Envie o conteúdo completo deste ZIP para a **raiz do mesmo repositório GitHub**, substituindo os arquivos antigos. No Render, confirme que o serviço está ligado a esse repositório e branch, use **Manual Deploy → Clear build cache & deploy** para remover artefatos antigos e abra o site em HTTPS. Depois faça uma atualização completa (Ctrl+F5) ou feche e reabra o PWA. O endpoint `/api/health` deve retornar `"version": "3.19"`; se mostrar outra versão, o Render ainda está servindo um deploy antigo.


## 3.17 — Central Agro e novos módulos de agricultura de precisão

A Central Agro acrescenta seis módulos separados do PesaBoi e do GPS Agrônomo: 

- **Satélite e NDVI:** Sentinel-2 L2A Harmonized via Google Earth Engine, composição RGB, NDVI em talhões e análise local de GeoTIFF no navegador. A camada de satélite só funciona após configurar um projeto Google Cloud registrado no Earth Engine e a conta de serviço. Sentinel-2 não é tempo real; datas e cenas são mostradas na tela.
- **Clima e balanço hídrico:** previsão de sete dias pelo Open-Meteo, ET₀ FAO, precipitação e balanço simplificado P − ETc. Histórico diário pelo NASA POWER. O balanço depende do Kc e armazenamento inicial informado pelo usuário e não substitui um balanço completo de campo.
- **Solo e zoneamento:** consulta experimental SoilGrids; registro de laudos locais; integração com Embrapa Agritec v2 para janelas de plantio ZARC por município/cultura/risco, ClimAPI e SmartSolos Expert, autenticadas por token AgroAPI. O resultado ZARC vem da Agritec v2; o link do MAPA permanece como fonte oficial complementar para conferir a portaria vigente, safra e grupo/ciclo.
- **Ambiental:** camadas WMS sob demanda de SICAR e TerraBrasilis/INPE; camada MapBiomas via Earth Engine. A exibição é informativa, não uma conclusão legal ou licenciamento.
- **Pasto, ração e mercado:** cálculo de lotação com matéria seca, custo da mistura por percentuais e registro manual de cotações CEPEA com data e fonte. Não é formulação nutricional completa.
- **Pragas por foto:** triagem com detector IP102 em endpoint Hugging Face configurado pelo responsável e opção TensorFlow.js local se houver modelo TF.js compatível em `models/pest-detection/`. Sem endpoint/modelo instalado, a tela informa que está indisponível em vez de fingir um diagnóstico.

### Configuração obrigatória no Render

Adicione em **Environment** somente os segredos que você configurou: `GEE_PROJECT_ID`, `GEE_SERVICE_ACCOUNT_JSON`, `EMBRAPA_AGROAPI_TOKEN`, `HF_TOKEN`, `HF_PEST_ENDPOINT_URL`, `HF_PEST_MODEL`. O arquivo `.env.example` lista os nomes sem conter credenciais.

**Google Earth Engine:** crie um projeto Google Cloud, registre-o para uso do Earth Engine, habilite a API, crie uma conta de serviço, conceda as permissões necessárias para acessar Earth Engine e cole o JSON completo da chave em `GEE_SERVICE_ACCOUNT_JSON` como secret. Use o ID do projeto em `GEE_PROJECT_ID`. Não envie esse JSON ao GitHub nem ao navegador. O servidor inicializa o Earth Engine no primeiro pedido e retorna erro claro se o acesso não estiver autorizado.

**Embrapa:** crie conta no portal AgroAPI, habilite Agritec v2 e ClimAPI nos tiers disponíveis e gere um token em `EMBRAPA_AGROAPI_TOKEN`. As condições variam: Agritec/ClimAPI aparecem como freemium por 1 mês ou até 1.000 chamadas; SmartSolos Expert é listado gratuitamente até 100 mil chamadas/mês. Confira o catálogo e os termos atuais antes de usar em produção. Agritec v2 consulta culturas ZARC por município IBGE e janelas de plantio por município, ID de cultura e risco de 20%, 30% ou 40%; ClimAPI lista datas GFS e consulta variáveis por latitude/longitude; SmartSolos recebe perfis com horizontes descritos e atributos medidos. O portal informa Agritec/ClimAPI/SATVeg no tier freemium por até 1.000 requisições durante um mês, e SmartSolos Expert sem custo até 100 mil requisições/mês; verifique limites e condições atuais no catálogo oficial.

**Hugging Face:** crie/ative um Inference Endpoint com o modelo detector de pragas IP102 e configure a URL HTTPS em `HF_PEST_ENDPOINT_URL` e o token com permissão de inferência em `HF_TOKEN`. O repositório do detector consultado não está atualmente implantado em um Inference Provider compartilhado; por isso, a tela não promete funcionamento sem o endpoint dedicado. Modelos TensorFlow.js locais devem ser exportados para o formato Layers/Graph Model com entrada RGB 224×224 normalizada em 0–1 e `classes.json` em `models/pest-detection/`.

### Limites e fontes

- SoilGrids REST pode estar temporariamente suspensa; use análise laboratorial e as APIs Embrapa configuradas quando disponíveis.
- Cotação de commodities: CEPEA é aberto por link; os valores são inseridos manualmente com data porque não há API pública oficial de consulta em tempo real integrada nesta versão.
- SICAR e TerraBrasilis dependem da disponibilidade e do catálogo WMS dos órgãos. A camada PRODES/DETER não define, por si só, legalidade de uma intervenção.
- OpenLayers oferece desenho/edição com `Draw`/`Modify`; Geoman não foi instalado porque é um plugin de Leaflet.


## 3.18 — ajustes operacionais e configuração das integrações

- Corrigido o campo de coordenadas: valores vazios deixam de ser interpretados como latitude/longitude zero.
- Adicionado botão para centralizar o mapa Sentinel-2 nas coordenadas digitadas; ao carregar RGB/NDVI com coordenadas preenchidas, a vista aproxima-se automaticamente da região.
- Datas de entrada usam o calendário local do navegador.
- Atualização do status e do cache para 3.18.
- A cotação de commodities é informada manualmente com fonte e data; a integração não a apresenta como cotação automática em tempo real.

### Custos e requisitos dos serviços

Google Earth Engine requer projeto Google Cloud registrado, Earth Engine API habilitada, permissões e credenciais de serviço no Render. A classificação de uso importa: o acesso não comercial elegível pode usar os tiers não comerciais sujeitos a verificação e cotas; uso operacional por empresa/produto comercial requer a modalidade comercial e pode gerar custos. Confira as condições e preços atuais diretamente na documentação do Google antes de publicar para clientes.

Embrapa AgroAPI ClimAPI e SmartSolos Expert exigem cadastro, adesão/assinatura dos serviços correspondentes e token. SoilGrids REST pode permanecer indisponível temporariamente; não use ausência de resposta como resultado de solo. Os WMS públicos de SICAR e TerraBrasilis podem mudar catálogo ou ficar fora do ar.

O diagnóstico IP102 por Hugging Face requer um Inference Endpoint dedicado configurado em `HF_PEST_ENDPOINT_URL` e token de inferência `HF_TOKEN`; o modelo não está ativo por padrão. A opção TensorFlow.js local só funciona quando um modelo TF.js treinado e compatível for instalado em `models/pest-detection/`. O repositório não inclui pesos treinados nem afirma que diagnóstico já está funcionando sem esses modelos. Confirme qualquer suspeita com agrônomo e inspeção de campo; a imagem pode não representar todos os sintomas.

O OpenLayers utiliza `Draw`/`Modify` nativos. Geoman não é incluído porque é um plugin do ecossistema Leaflet.

### Documentação oficial das fontes integradas

- Google Earth Engine: https://developers.google.com/earth-engine/guides/service_account e https://developers.google.com/earth-engine/guides/access
- Sentinel-2 SR Harmonized: https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_S2_SR_HARMONIZED
- Open-Meteo Forecast API: https://open-meteo.com/en/docs
- NASA POWER: https://power.larc.nasa.gov/docs/services/api/
- Embrapa AgroAPI / Agritec v2 (ZARC): https://www.agroapi.cnptia.embrapa.br/portal/ e https://www.agroapi.cnptia.embrapa.br/store/apis/info?name=Agritec&provider=agroapi&version=v2
- SoilGrids: https://www.isric.org/explore/soilgrids
- MapBiomas: https://brasil.mapbiomas.org/
- TerraBrasilis/INPE: https://terrabrasilis.dpi.inpe.br/
- SICAR: https://www.car.gov.br/
- CEPEA/ESALQ: https://cepea.org.br/indicadores/
- Hugging Face Inference Endpoints: https://huggingface.co/docs/inference-endpoints/index
- OpenLayers: https://openlayers.org/en/latest/doc/


## 3.19 — Central API Gateway e assistente de configuração

- A Central Agro ganhou o cartão **Central de Integrações**, com painel de status agrupado por fornecedor.
- O endpoint `GET /api/integrations/status` apresenta o estado das integrações sem devolver tokens, chaves ou JSON privado.
- O gateway do servidor (`server.py` + `agro_services.py`) continua roteando as chamadas dos módulos para Earth Engine, Embrapa, Hugging Face e fontes públicas.
- O assistente do navegador gera localmente `central-agro.env`, para importação em lote pelo Render em **Environment → Add from .env**. As credenciais digitadas não são enviadas ao PesaBoi nem guardadas no `localStorage`.
- O JSON da conta de serviço Google é validado no navegador e exportado como `GEE_SERVICE_ACCOUNT_JSON_B64`; o servidor decodifica Base64 antes de autenticar no Earth Engine. O formato antigo `GEE_SERVICE_ACCOUNT_JSON` continua compatível.
- A tela separa serviços com credenciais próprias de fontes públicas que não precisam de token. A presença de credenciais é mostrada como configuração, nunca como autenticação comprovada.

### Configuração com uma importação em lote
1. Abra **Central Agro → Central de Integrações**.
2. Cole somente as credenciais que já obteve nos sites oficiais.
3. Clique em **Gerar arquivo único para Render**. O download contém credenciais em texto legível e deve ser guardado em local privado.
4. No Render, abra o serviço PesaBoi → **Environment → Add from .env**, selecione `central-agro.env` e salve com deploy.
5. Após o deploy, retorne à Central de Integrações e atualize o status. Faça também uma consulta real em cada módulo: status de credenciais não substitui teste de autenticação.

**Limitação:** não existe uma chave mestra universal capaz de criar contas ou autorizações no Google, Embrapa e Hugging Face. O assistente unifica o preenchimento e a importação, mas cada fornecedor ainda exige sua própria credencial e condições de uso.
