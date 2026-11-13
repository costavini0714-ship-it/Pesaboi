# Central API Gateway — PesaBoi 3.19

## O que é
O gateway (`server.py` + `agro_services.py`) é a porta única do PesaBoi para os serviços externos. Os módulos chamam o próprio servidor; ele encaminha cada solicitação ao fornecedor correspondente.

O gerenciador central facilita a configuração: reúne credenciais num arquivo `central-agro.env`, gerado no navegador sem enviar os valores ao servidor. O arquivo `central-agro.env` também acompanha este ZIP como modelo vazio na raiz da pasta `central.agro`; preencha-o ou gere uma versão preenchida pelo gerenciador. O Render importa esse arquivo em lote.

## Configurar
1. Abra o site PesaBoi e entre na Central Agro.
2. Selecione **Central de Integrações**.
3. Google Earth Engine: informe o ID do projeto e cole o JSON completo da conta de serviço. O navegador verifica a estrutura e converte para Base64.
4. Embrapa: informe o token AgroAPI depois de inscrever a aplicação em Agritec/ClimAPI/SmartSolos, conforme necessário.
5. Hugging Face: informe o HTTPS do Inference Endpoint ativo e o token com permissão de inferência.
6. Clique em **Gerar arquivo único para Render**. O download terá exatamente o nome `central-agro.env`. Se não conseguir usar o gerador, há um modelo na pasta raiz do projeto que pode ser aberto por `EDITAR-CENTRAL-AGRO-ENV.bat`.
7. Não envie `central-agro.env` ao GitHub. O `.gitignore` já o ignora em operações Git. Se enviar arquivos pelo site do GitHub, deixe esse arquivo de fora.
8. No Render Dashboard, selecione o serviço PesaBoi → **Environment** → **Add from .env**. Selecione `central-agro.env`.
9. Salve com deploy e aguarde a publicação.
10. Volte ao PesaBoi, abra Central de Integrações e atualize o status.

## Credenciais e segurança
- O formulário não envia credenciais ao PesaBoi, não usa localStorage e não persiste os campos.
- O arquivo exportado contém segredos em texto legível. Não o envie por mensagem, não o adicione ao GitHub e apague a cópia após importar.
- O `.gitignore` ignora `central-agro.env` e `*.secrets.env`.
- O endpoint `/api/integrations/status` nunca retorna os valores das chaves.
- Earth Engine aceita `GEE_SERVICE_ACCOUNT_JSON_B64` e mantém compatibilidade com `GEE_SERVICE_ACCOUNT_JSON`.

## Variáveis geradas
- `GEE_PROJECT_ID`
- `GEE_SERVICE_ACCOUNT_JSON_B64`
- `EMBRAPA_AGROAPI_TOKEN`
- `HF_PEST_ENDPOINT_URL`
- `HF_TOKEN`
- `HF_PEST_MODEL` (opcional)

Open-Meteo, NASA POWER, OpenStreetMap e os servidores WMS públicos não exigem chave privada nesta configuração. Plano comercial, cota, licenças e disponibilidade continuam sujeitos a cada fornecedor.

## Verificação
- `GET /api/health`: confirma versão publicada.
- `GET /api/integrations/status`: confirma quais credenciais estão presentes sem revelar valores.
- Faça depois uma consulta real nos módulos Satélite/NDVI, ZARC/Embrapa e Pragas por Foto. A presença de credenciais, isoladamente, não prova que a conta está autorizada ou que há cota.

## Importante
Não existe API única de terceiros que crie, em nome do usuário, todas as contas e licenças Google, Embrapa e Hugging Face. O gerenciador central unifica o cadastro e a importação das credenciais que o usuário obtém em cada fornecedor.
