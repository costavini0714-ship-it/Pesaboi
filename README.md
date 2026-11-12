# PesaBoi 3.11 — monetização web preparada

O PesaBoi 3.11 mantém a análise visual experimental e simplifica a navegação. A versão 3.9 removeu a etapa de calibração manual da fotografia. O usuário não precisa marcar pontos, colocar régua, informar distâncias em pixels ou medir o tórax com fita no fluxo de pesagem.

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
2. Extraia o ZIP e envie **todos os arquivos e pastas que estão dentro de `PesaBoi-3.11`** para a raiz do repositório. O arquivo `render.yaml` deve ficar na raiz, ao lado de `server.py` e `requirements.txt`.
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


## Monetização — versão 3.11

- O projeto está preparado para Google AdSense na página inicial, no navegador web e em HTTPS. Não carrega anúncios na câmera, captura, medição, relatório individual ou tela de atualização dos animais. O modo instalado/PWA também não carrega AdSense.
- Os anúncios ficam desligados por padrão. Para ativar, primeiro crie uma conta Google AdSense, adicione o domínio e aguarde a aprovação do site. O Google não exibe anúncios antes da aprovação.
- Depois de aprovado, abra `monetization-config.js` e preencha `enabled: true`, `publisherId` com o identificador real `ca-pub-...` e `homeAdSlot` com o número do bloco responsivo criado no AdSense. Não use IDs fictícios.
- Se o painel do AdSense solicitar `ads.txt`, siga a linha exata fornecida pelo painel e publique-a em `/ads.txt`. O arquivo `ads.txt.modelo` deste ZIP é apenas um exemplo e não deve ser publicado sem substituir os dados.
- O primeiro carregamento pede autorização para cookies publicitários. O usuário pode aceitar ou recusar; recusar não bloqueia as funções do PesaBoi. A preferência pode ser alterada no rodapé.
- Não clique nos próprios anúncios nem incentive outras pessoas a clicar. Os anúncios são identificados como “ANÚNCIO” e ficam separados dos botões de navegação.

### Plano Premium

A interface do Premium está preparada como apresentação, mas pagamento e confirmação segura de assinatura ainda não estão conectados. O endpoint `/api/monetization/status` informa explicitamente que o Premium está indisponível; nenhum usuário é marcado como Premium por um valor guardado no navegador. Não há cobrança nesta versão. Para liberar assinaturas e remover anúncios automaticamente, será necessário integrar um gateway de pagamento e validação de assinatura no servidor.

### Arquivos de monetização

- `monetization-config.js`: identificador do editor e bloco de anúncios.
- `monetization.js`: carregamento condicional, consentimento e regras de exibição.
- `privacidade.html`: política de privacidade inicial. Atualize com a identificação e contato do responsável antes de publicar comercialmente.
- `ads.txt.modelo`: modelo de referência; não publicar sem os dados oficiais da conta.

Referências oficiais: [conectar e aprovar o site no AdSense](https://support.google.com/adsense/answer/7584263?hl=pt-BR) e [políticas de posicionamento de anúncios](https://support.google.com/adsense/answer/1346295?hl=pt-BR).
