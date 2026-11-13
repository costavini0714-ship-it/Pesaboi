"""Serviços opcionais da Central Agro: GEE, clima, solo, ambiente e diagnóstico vegetal.
Credenciais sensíveis são lidas exclusivamente de variáveis de ambiente do servidor.
"""
from __future__ import annotations

import json
import math
import base64
import os
import re
import threading
from datetime import date, datetime, timedelta, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse, parse_qs
from urllib.request import Request, urlopen

_USER_AGENT = "CentralAgro/3.19 (agricultural decision support)"
_EE_LOCK = threading.Lock()
_EE_READY = False
_EE_ERROR = None
_EE = None

WMS_SOURCES = {
    "terrabrasilis": "https://terrabrasilis.dpi.inpe.br/geoserver/ows",
    "sicar": os.environ.get("SICAR_WMS_URL", "https://geoserver.car.gov.br/geoserver/sicar/wms"),
}


def _fetch(url: str, timeout: int = 25, headers: dict | None = None) -> bytes:
    request_headers = {"User-Agent": _USER_AGENT, "Accept": "application/json,*/*"}
    if headers:
        request_headers.update(headers)
    req = Request(url, headers=request_headers)
    with urlopen(req, timeout=timeout) as response:
        return response.read()


def _json(url: str, timeout: int = 25, headers: dict | None = None):
    return json.loads(_fetch(url, timeout, headers).decode("utf-8-sig"))


def _number(query: dict, key: str, low: float, high: float, required=True):
    raw = query.get(key, [None])[0]
    if raw in (None, "") and not required:
        return None
    try:
        value = float(raw)
    except (TypeError, ValueError):
        raise ValueError(f"Parâmetro {key} inválido.")
    if not math.isfinite(value) or not low <= value <= high:
        raise ValueError(f"Parâmetro {key} fora do intervalo permitido.")
    return value


def _get_ee():
    """Inicializa Earth Engine usando chave JSON em secret do Render."""
    global _EE_READY, _EE_ERROR, _EE
    if _EE_READY and _EE is not None:
        return _EE
    with _EE_LOCK:
        if _EE_READY and _EE is not None:
            return _EE
        key_text = os.environ.get("GEE_SERVICE_ACCOUNT_JSON", "").strip()
        key_b64 = os.environ.get("GEE_SERVICE_ACCOUNT_JSON_B64", "").strip()
        project = os.environ.get("GEE_PROJECT_ID", "").strip()
        if not key_text and key_b64:
            try:
                key_text = base64.b64decode(key_b64, validate=True).decode("utf-8")
            except Exception as exc:
                raise RuntimeError("GEE_SERVICE_ACCOUNT_JSON_B64 não contém JSON Base64 válido.") from exc
        if not key_text or not project:
            raise RuntimeError("Earth Engine ainda não configurado. Defina GEE_PROJECT_ID e GEE_SERVICE_ACCOUNT_JSON_B64 (ou GEE_SERVICE_ACCOUNT_JSON) no Render.")
        try:
            import ee  # type: ignore
            from google.oauth2 import service_account
            key = json.loads(key_text)
            # Google Auth lê o JSON completo da conta de serviço; a chave privada
            # isolada não é passada como se fosse um arquivo JSON.
            credentials = service_account.Credentials.from_service_account_info(
                key, scopes=["https://www.googleapis.com/auth/earthengine"]
            )
            ee.Initialize(credentials, project=project)
            _EE = ee
            _EE_READY = True
            _EE_ERROR = None
            return ee
        except Exception as exc:
            _EE_ERROR = str(exc)[:300]
            raise RuntimeError(f"Não foi possível autenticar no Google Earth Engine: {_EE_ERROR}") from exc


def _sentinel_collection(ee, geometry, start: str, end: str, cloud: float):
    # Earth Engine filterDate uses an exclusive end bound. Add one day so the
    # date selected by the user in the UI is included in the requested period.
    end_exclusive = (datetime.strptime(end, "%Y-%m-%d") + timedelta(days=1)).strftime("%Y-%m-%d")
    collection = (ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
                  .filterBounds(geometry)
                  .filterDate(start, end_exclusive)
                  .filter(ee.Filter.lte("CLOUDY_PIXEL_PERCENTAGE", cloud)))

    def mask_scale(image):
        scl = image.select("SCL")
        # Keep vegetation and bare-soil pixels; exclude cloud, shadow, cirrus,
        # snow/ice, water, saturated and unclassified pixels from plant NDVI.
        clear = scl.eq(4).Or(scl.eq(5))
        optical = image.select(["B2", "B3", "B4", "B8"]).divide(10000)
        return optical.updateMask(clear).copyProperties(image, ["system:time_start", "CLOUDY_PIXEL_PERCENTAGE"])

    return collection.map(mask_scale)


def _tile_url(image, vis_params: dict) -> str:
    map_id = image.getMapId(vis_params)
    fetcher = map_id.get("tile_fetcher")
    url_format = getattr(fetcher, "url_format", None) if fetcher is not None else None
    if not url_format:
        raise RuntimeError("Earth Engine não retornou um endereço de tiles para esta camada.")
    return url_format


def gee_tiles(query: dict):
    ee = _get_ee()
    west = _number(query, "west", -180, 180)
    south = _number(query, "south", -85, 85)
    east = _number(query, "east", -180, 180)
    north = _number(query, "north", -85, 85)
    if west >= east or south >= north:
        raise ValueError("Área do mapa inválida.")
    if (east-west) * (north-south) > 4:
        raise ValueError("A área solicitada é muito grande. Aproxime o mapa da propriedade.")
    geometry = ee.Geometry.Rectangle([west, south, east, north], geodesic=False)
    mode = query.get("mode", ["rgb"])[0].lower()
    if mode == "mapbiomas":
        year = int(query.get("year", ["2025"])[0])
        if year < 1985 or year > 2025:
            raise ValueError("Ano MapBiomas fora do intervalo publicado nesta coleção.")
        asset = "projects/mapbiomas-public/assets/brazil/lulc/collection11/mapbiomas_brazil_collection11_coverage_v3"
        image = ee.Image(asset).select(f"classification_{year}")
        vis = {"min": 0, "max": 62, "palette": ["#ffffff", "#1f8d49", "#7dc975", "#d6bc74", "#d4271e", "#0000ff", "#935132", "#f5b3c8", "#c9c9c9"]}
        label = f"MapBiomas Coleção 11 — {year}"
        count = None
        actual_start = actual_end = None
    else:
        start = query.get("start", [(date.today()-timedelta(days=90)).isoformat()])[0]
        end = query.get("end", [date.today().isoformat()])[0]
        datetime.strptime(start, "%Y-%m-%d")
        datetime.strptime(end, "%Y-%m-%d")
        if start >= end:
            raise ValueError("A data inicial deve ser anterior à data final.")
        cloud = _number(query, "cloud", 0, 100, required=False)
        cloud = 80 if cloud is None else cloud
        collection = _sentinel_collection(ee, geometry, start, end, cloud)
        count = int(collection.size().getInfo())
        if count < 1:
            raise RuntimeError("Nenhuma cena Sentinel-2 encontrada para esta área e período. Amplie o intervalo ou aumente o limite de nuvens.")
        image = collection.median()
        if mode == "ndvi":
            image = image.normalizedDifference(["B8", "B4"]).rename("NDVI")
            vis = {"min": -0.2, "max": 0.9, "palette": ["#7f3b08", "#d8b365", "#f6e8c3", "#c7eae5", "#5ab4ac", "#01665e"]}
            label = "NDVI Sentinel-2 L2A"
        else:
            vis = {"bands": ["B4", "B3", "B2"], "min": 0.02, "max": 0.30, "gamma": 1.15}
            label = "Sentinel-2 RGB — composição mediana sem nuvens"
        first_ms = collection.aggregate_min("system:time_start").getInfo()
        last_ms = collection.aggregate_max("system:time_start").getInfo()
        actual_start = ee.Date(first_ms).format("YYYY-MM-dd").getInfo() if first_ms else None
        actual_end = ee.Date(last_ms).format("YYYY-MM-dd").getInfo() if last_ms else None
    url = _tile_url(image.visualize(**vis), {})
    return {"ok": True, "layer": mode, "label": label, "tileUrl": url, "sceneCount": count,
            "actualStart": actual_start, "actualEnd": actual_end,
            "source": "Copernicus Sentinel-2 L2A / Google Earth Engine" if mode != "mapbiomas" else "MapBiomas Collection 11 / Google Earth Engine"}


def gee_ndvi(payload: dict):
    ee = _get_ee()
    geometry_json = payload.get("geometry")
    if not isinstance(geometry_json, dict) or geometry_json.get("type") not in {"Polygon", "MultiPolygon"}:
        raise ValueError("Desenhe um polígono de talhão no mapa antes de calcular o NDVI.")
    start = payload.get("start") or (date.today()-timedelta(days=90)).isoformat()
    end = payload.get("end") or date.today().isoformat()
    datetime.strptime(start, "%Y-%m-%d"); datetime.strptime(end, "%Y-%m-%d")
    if start >= end:
        raise ValueError("A data inicial deve ser anterior à data final.")
    cloud = float(payload.get("cloud", 80))
    if not 0 <= cloud <= 100:
        raise ValueError("Limite de nuvens deve estar entre 0 e 100%.")
    geometry = ee.Geometry(geometry_json)
    collection = _sentinel_collection(ee, geometry, start, end, cloud)
    count = int(collection.size().getInfo())
    if count < 1:
        raise RuntimeError("Nenhuma cena Sentinel-2 encontrada. Amplie o período ou o limite de nuvens.")
    ndvi = collection.median().normalizedDifference(["B8", "B4"]).rename("NDVI")
    reducer = ee.Reducer.mean().combine(ee.Reducer.percentile([25, 50, 75]), "_", True)
    stats = ndvi.reduceRegion(reducer=reducer, geometry=geometry, scale=10, maxPixels=100000000, tileScale=4).getInfo()
    first_ms = collection.aggregate_min("system:time_start").getInfo()
    last_ms = collection.aggregate_max("system:time_start").getInfo()
    val = lambda key: float(stats[key]) if stats.get(key) is not None else None
    mean = val("NDVI_mean")
    if mean is None:
        classification = "Sem pixels válidos"
    elif mean < 0.20:
        classification = "Vigor baixo — verificar solo exposto, cultura e estágio"
    elif mean < 0.45:
        classification = "Vigor intermediário — avaliar contexto e histórico"
    else:
        classification = "Vigor relativamente alto — comparar com talhões e datas"
    return {"ok": True, "sceneCount": count, "mean": mean, "p25": val("NDVI_p25"), "median": val("NDVI_p50"), "p75": val("NDVI_p75"),
            "classification": classification,
            "actualStart": ee.Date(first_ms).format("YYYY-MM-dd").getInfo() if first_ms else None,
            "actualEnd": ee.Date(last_ms).format("YYYY-MM-dd").getInfo() if last_ms else None,
            "scaleMeters": 10, "source": "Sentinel-2 L2A Harmonized / Google Earth Engine",
            "note": "NDVI indica resposta espectral/vigor relativo. Não identifica, sozinho, praga, doença, nutriente, produtividade ou necessidade de defensivo."}


def weather_forecast(query: dict):
    lat = _number(query, "lat", -90, 90)
    lon = _number(query, "lon", -180, 180)
    kc = _number(query, "kc", 0.1, 2.5, required=False) or 1.0
    storage = _number(query, "storage", 0, 1000, required=False)
    capacity = _number(query, "capacity", 1, 2000, required=False) or 120.0
    storage = min(storage if storage is not None else capacity * 0.5, capacity)
    params = {"latitude": lat, "longitude": lon, "timezone": "auto", "forecast_days": 7,
              "daily": "precipitation_sum,et0_fao_evapotranspiration,temperature_2m_max,temperature_2m_min,wind_speed_10m_max,precipitation_probability_max",
              "hourly": "temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,et0_fao_evapotranspiration,wind_speed_10m"}
    data = _json("https://api.open-meteo.com/v1/forecast?" + urlencode(params), timeout=30)
    daily = data.get("daily", {})
    balance = []
    current_storage = storage
    for i, day in enumerate(daily.get("time", [])):
        rain = float((daily.get("precipitation_sum") or [0]*len(daily["time"]))[i] or 0)
        et0 = float((daily.get("et0_fao_evapotranspiration") or [0]*len(daily["time"]))[i] or 0)
        etc = et0 * kc
        net = rain - etc
        current_storage = max(0.0, min(capacity, current_storage + net))
        deficit = max(0.0, etc - rain)
        balance.append({"date": day, "rainMm": round(rain, 2), "et0Mm": round(et0, 2), "etcMm": round(etc, 2),
                        "balanceMm": round(net, 2), "storageMm": round(current_storage, 2), "deficitMm": round(deficit, 2)})
    return {"ok": True, "source": "Open-Meteo Forecast API", "timezone": data.get("timezone"), "daily": daily,
            "hourly": data.get("hourly", {}), "waterBalance": balance, "kc": kc,
            "initialStorageMm": storage, "capacityMm": capacity,
            "note": "Balanço simplificado P − ETc (ETc = ET0 × Kc), sem estimar escoamento, drenagem ou irrigação. Atualize Kc, armazenamento inicial e capacidade de água do solo para sua cultura/talhão."}


def nasa_power(query: dict):
    lat = _number(query, "lat", -90, 90)
    lon = _number(query, "lon", -180, 180)
    end = query.get("end", [date.today().strftime("%Y%m%d")])[0]
    start = query.get("start", [(date.today()-timedelta(days=30)).strftime("%Y%m%d")])[0]
    for value in (start, end):
        datetime.strptime(value, "%Y%m%d")
    params = {"parameters": "T2M,PRECTOTCORR,ALLSKY_SFC_SW_DWN,RH2M,WS2M", "community": "AG",
              "longitude": lon, "latitude": lat, "start": start, "end": end, "format": "JSON", "time-standard": "LST"}
    return {"ok": True, "source": "NASA POWER Daily / Agroclimatology", "data": _json("https://power.larc.nasa.gov/api/temporal/daily/point?"+urlencode(params), timeout=35)}


def soil_lookup(query: dict):
    lat = _number(query, "lat", -90, 90)
    lon = _number(query, "lon", -180, 180)
    params = {"lat": lat, "lon": lon, "property": ["phh2o", "soc", "clay", "sand", "nitrogen"],
              "depth": ["0-5cm", "5-15cm"], "value": "mean"}
    try:
        data = _json("https://rest.isric.org/soilgrids/v2.0/properties/query?"+urlencode(params, doseq=True), timeout=18)
        return {"ok": True, "source": "ISRIC SoilGrids", "data": data}
    except Exception as exc:
        return {"ok": False, "temporarilyUnavailable": True, "source": "ISRIC SoilGrids REST", "error": str(exc)[:220],
                "note": "O ISRIC informou suspensão temporária da API REST. Para decisão de adubação, use análise laboratorial do talhão. SmartSolos/AgroAPI da Embrapa pode ser habilitado com token próprio."}


def api_status():
    token = bool(os.environ.get("EMBRAPA_AGROAPI_TOKEN", "").strip())
    return {"ok": True,
            "earthEngine": {"configured": bool(os.environ.get("GEE_PROJECT_ID", "").strip() and (os.environ.get("GEE_SERVICE_ACCOUNT_JSON", "").strip() or os.environ.get("GEE_SERVICE_ACCOUNT_JSON_B64", "").strip())), "projectConfigured": bool(os.environ.get("GEE_PROJECT_ID", "").strip()), "credentialsConfigured": bool(os.environ.get("GEE_SERVICE_ACCOUNT_JSON", "").strip() or os.environ.get("GEE_SERVICE_ACCOUNT_JSON_B64", "").strip()), "lastInitializationError": _EE_ERROR},
            "huggingFace": {"configured": bool(os.environ.get("HF_TOKEN") and os.environ.get("HF_PEST_ENDPOINT_URL")), "tokenConfigured": bool(os.environ.get("HF_TOKEN")), "endpointConfigured": bool(os.environ.get("HF_PEST_ENDPOINT_URL")), "model": os.environ.get("HF_PEST_MODEL", "underdogquality/yolo11s-pest-detection")},
            "embrapa": {"configured": token, "agritec": token, "climApi": token, "smartSolos": token, "note": "Exige conta AgroAPI e token com as APIs desejadas habilitadas; planos e limites variam por API."},
            "soilGrids": {"source": "ISRIC SoilGrids REST", "status": "may_be_temporarily_unavailable"},
            "commodityQuotes": {"liveApiConfigured": False, "manualQuotesAvailable": True}}


def integration_status():
    """Visão unificada do gateway; informa presença de configuração sem revelar segredos."""
    raw = api_status()
    providers = [
        {"id": "earthEngine", "name": "Google Earth Engine / Sentinel-2", "configured": bool(raw["earthEngine"]["configured"]), "credentialRequired": True,
         "uses": ["Sentinel-2 RGB", "NDVI", "MapBiomas via Earth Engine"]},
        {"id": "embrapa", "name": "Embrapa AgroAPI", "configured": bool(raw["embrapa"]["configured"]), "credentialRequired": True,
         "uses": ["Agritec / ZARC", "ClimAPI", "SmartSolos Expert"]},
        {"id": "huggingFace", "name": "Hugging Face Inference Endpoint", "configured": bool(raw["huggingFace"]["configured"]), "credentialRequired": True,
         "uses": ["Triagem visual de pragas"]},
        {"id": "soilGrids", "name": "ISRIC SoilGrids", "configured": False, "credentialRequired": False,
         "uses": ["Propriedades globais do solo"], "note": "API REST pode estar temporariamente indisponível."},
        {"id": "commodityQuotes", "name": "Cotações CEPEA", "configured": False, "credentialRequired": False,
         "uses": ["Registro manual de preços"], "note": "Esta versão não possui API automática autorizada para cotação ao vivo."}
    ]
    public = [
        {"id": "openMeteo", "name": "Open-Meteo", "configured": True, "credentialRequired": False, "note": "Endpoint público; uso comercial depende do plano/licença aplicável."},
        {"id": "nasaPower", "name": "NASA POWER", "configured": True, "credentialRequired": False},
        {"id": "openStreetMap", "name": "OpenStreetMap", "configured": True, "credentialRequired": False},
        {"id": "sicar", "name": "SICAR WMS", "configured": True, "credentialRequired": False, "note": "Disponibilidade depende do servidor público."},
        {"id": "terraBrasilis", "name": "TerraBrasilis / INPE", "configured": True, "credentialRequired": False, "note": "Disponibilidade depende do servidor público."}
    ]
    return {"ok": True, "gateway": "Central Agro API Gateway", "version": "3.19",
            "credentialValuesReturned": False,
            "providers": providers, "publicServices": public,
            "setupHint": "Credenciais preenchidas indicam configuração presente, não autenticação validada. Faça uma consulta real em cada módulo.",
            "configImport": "Render Dashboard → serviço PesaBoi → Environment → Add from .env"}


def _embrapa_token() -> str:
    token = os.environ.get("EMBRAPA_AGROAPI_TOKEN", "").strip()
    if not token:
        raise RuntimeError("AgroAPI da Embrapa ainda não configurada. Gere um token e assine ClimAPI/SmartSolos no portal AgroAPI; depois adicione EMBRAPA_AGROAPI_TOKEN no Render.")
    return token


def _embrapa_get(url: str):
    return _json(url, timeout=35, headers={"Authorization": f"Bearer {_embrapa_token()}", "Accept": "application/json"})


def embrapa_climapi_dates(query: dict):
    variable = query.get("variable", ["tmpsfc"])[0]
    allowed = {"dpt2m", "apcpsfc", "gustsfc", "hcdchcll", "lcdclcll", "mcdcmcll", "pevprsfc", "rh2m", "soill0_10cm", "soill10_40cm", "soill40_100cm", "sunsdsfc", "tmax2m", "tmin2m", "tmpsfc", "ugrd10m", "vgrd10m"}
    if variable not in allowed:
        raise ValueError("Variável ClimAPI não reconhecida.")
    data = _embrapa_get(f"https://api.cnptia.embrapa.br/climapi/v1/ncep-gfs/{variable}")
    found = sorted(set(re.findall(r"20\d{2}-\d{2}-\d{2}", json.dumps(data, ensure_ascii=False))))
    return {"ok": True, "variable": variable, "dates": found, "raw": data if not found else None,
            "source": "Embrapa AgroAPI ClimAPI / GFS", "note": "Datas são execuções do GFS publicadas pela ClimAPI; selecione uma das datas retornadas para consultar o ponto."}


def embrapa_climapi_data(query: dict):
    variable = query.get("variable", ["tmpsfc"])[0]
    allowed = {"dpt2m", "apcpsfc", "gustsfc", "hcdchcll", "lcdclcll", "mcdcmcll", "pevprsfc", "rh2m", "soill0_10cm", "soill10_40cm", "soill40_100cm", "sunsdsfc", "tmax2m", "tmin2m", "tmpsfc", "ugrd10m", "vgrd10m"}
    if variable not in allowed:
        raise ValueError("Variável ClimAPI não reconhecida.")
    lat = _number(query, "lat", -90, 90); lon = _number(query, "lon", -180, 180)
    run_date = query.get("date", [""])[0]
    try:
        datetime.strptime(run_date, "%Y-%m-%d")
    except ValueError as exc:
        raise ValueError("Selecione uma data de execução ClimAPI válida (AAAA-MM-DD).") from exc
    url = f"https://api.cnptia.embrapa.br/climapi/v1/ncep-gfs/{variable}/{run_date}/{lon}/{lat}"
    return {"ok": True, "variable": variable, "date": run_date, "latitude": lat, "longitude": lon,
            "source": "Embrapa AgroAPI ClimAPI / GFS", "data": _embrapa_get(url)}



def agritec_municipal_cultures(query: dict):
    """Lista as culturas com dados ZARC para um município IBGE."""
    raw = (query.get("codigoIBGE") or [""])[0].strip()
    if not raw.isdigit() or len(raw) != 7:
        raise ValueError("Informe o código IBGE do município com 7 dígitos.")
    data = _embrapa_get(f"https://api.cnptia.embrapa.br/agritec/v2/municipios/{raw}/culturas")
    return {"ok": True, "codigoIBGE": raw, "source": "Embrapa AgroAPI Agritec v2", "data": data,
            "note": "A resposta lista as culturas disponíveis no ZARC para o município; use o identificador de cultura retornado na consulta de janela de plantio."}


def agritec_zoneamento(query: dict):
    """Consulta janelas de plantio ZARC por município, cultura e risco."""
    code = (query.get("codigoIBGE") or [""])[0].strip()
    culture = (query.get("idCultura") or [""])[0].strip()
    risk = (query.get("risco") or ["20"])[0].strip()
    if not code.isdigit() or len(code) != 7:
        raise ValueError("Informe o código IBGE do município com 7 dígitos.")
    if not culture.isdigit() or int(culture) <= 0:
        raise ValueError("Informe o identificador numérico da cultura retornado pela Agritec.")
    if risk not in {"20", "30", "40", "todos"}:
        raise ValueError("O risco ZARC deve ser 20, 30, 40 ou todos.")
    params = urlencode({"codigoIBGE": code, "idCultura": culture, "risco": risk})
    data = _embrapa_get(f"https://api.cnptia.embrapa.br/agritec/v2/zoneamento?{params}")
    return {"ok": True, "codigoIBGE": code, "idCultura": int(culture), "risco": risk,
            "source": "Embrapa AgroAPI Agritec v2 / ZARC", "data": data,
            "note": "A resposta é a janela ZARC publicada pela Agritec. Confira safra, grupo/ciclo, solo e portaria vigente antes de decidir o plantio."}


def embrapa_smartsolos(payload: dict):
    items = payload.get("items")
    if not isinstance(items, list) or not items:
        raise ValueError("Envie perfis no formato {items:[{ID_PONTO, HORIZONTES:[...]}]} com dados de campo ou laboratório.")
    if len(items) > 20:
        raise ValueError("Envie no máximo 20 perfis por consulta.")
    for index, profile in enumerate(items):
        if not isinstance(profile, dict) or not isinstance(profile.get("HORIZONTES"), list) or not profile["HORIZONTES"]:
            raise ValueError(f"O perfil {index+1} precisa conter HORIZONTES com atributos medidos.")
        for horizon in profile["HORIZONTES"]:
            if not isinstance(horizon, dict):
                raise ValueError("Cada horizonte precisa ser um objeto JSON.")
    url = "https://api.cnptia.embrapa.br/smartsolos/expert/v1/classification"
    body = json.dumps({"items": items}, ensure_ascii=False).encode("utf-8")
    request = Request(url, data=body, headers={"Authorization": f"Bearer {_embrapa_token()}", "Content-Type": "application/json", "Accept": "application/json", "User-Agent": _USER_AGENT}, method="POST")
    with urlopen(request, timeout=45) as response:
        result = json.loads(response.read().decode("utf-8-sig"))
    return {"ok": True, "source": "Embrapa AgroAPI SmartSolos Expert / SiBCS", "data": result,
            "note": "A classificação utiliza atributos de perfil informados. Ela não mede solo por coordenada nem substitui descrição pedológica e análise laboratorial."}


def wms_capabilities(query: dict):
    source = query.get("source", ["terrabrasilis"])[0]
    if source not in WMS_SOURCES:
        raise ValueError("Fonte WMS não reconhecida.")
    url = WMS_SOURCES[source] + "?SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.3.0"
    xml = _fetch(url, timeout=30, headers={"Accept": "application/xml,text/xml,*/*"})
    return (200, "application/xml; charset=utf-8", xml)


def wms_proxy(query: dict):
    source = query.get("source", ["terrabrasilis"])[0]
    if source not in WMS_SOURCES:
        raise ValueError("Fonte WMS não reconhecida.")
    params = {k: v[-1] for k, v in query.items() if k.lower() != "source"}
    req = (params.get("REQUEST") or "GetMap").lower()
    if req not in {"getmap", "getfeatureinfo", "getcapabilities"}:
        raise ValueError("Operação WMS não permitida.")
    url = WMS_SOURCES[source] + "?" + urlencode(params)
    raw = _fetch(url, timeout=30, headers={"Accept": "image/png,image/jpeg,application/xml,*/*"})
    content_type = "image/png"
    if raw.lstrip().startswith(b"<?xml") or b"ServiceException" in raw[:1000]:
        content_type = "application/xml; charset=utf-8"
    return (200, content_type, raw)


def commodity_source_status():
    return {"ok": True, "quotes": [
        {"commodity": "Milho", "unit": "R$/saca 60 kg", "source": "CEPEA/ESALQ", "url": "https://cepea.org.br/indicadores/"},
        {"commodity": "Soja", "unit": "R$/saca 60 kg", "source": "CEPEA/ESALQ", "url": "https://cepea.org.br/indicadores/"},
        {"commodity": "Boi gordo", "unit": "R$/arroba", "source": "CEPEA/ESALQ", "url": "https://cepea.org.br/indicadores/"},
        {"commodity": "Bezerro", "unit": "R$/cabeça", "source": "CEPEA/ESALQ", "url": "https://cepea.org.br/indicadores/"}],
        "liveApi": False,
        "note": "O CEPEA publica indicadores e séries de preços, mas não foi identificada uma API pública oficial de cotação em tempo real. Insira o valor consultado e a data da cotação; não usamos preços inventados."}


def get_response(path: str, query: dict):
    try:
        if path == "/api/agro/status": return (200, "application/json; charset=utf-8", api_status())
        if path == "/api/agro/gee/tiles": return (200, "application/json; charset=utf-8", gee_tiles(query))
        if path == "/api/agro/weather": return (200, "application/json; charset=utf-8", weather_forecast(query))
        if path == "/api/agro/nasa-power": return (200, "application/json; charset=utf-8", nasa_power(query))
        if path == "/api/agro/soil": return (200, "application/json; charset=utf-8", soil_lookup(query))
        if path == "/api/agro/embrapa/climapi/dates": return (200, "application/json; charset=utf-8", embrapa_climapi_dates(query))
        if path == "/api/agro/embrapa/climapi/data": return (200, "application/json; charset=utf-8", embrapa_climapi_data(query))
        if path == "/api/agro/agritec/municipal-cultures": return (200, "application/json; charset=utf-8", agritec_municipal_cultures(query))
        if path == "/api/agro/agritec/zoneamento": return (200, "application/json; charset=utf-8", agritec_zoneamento(query))
        if path == "/api/agro/wms/capabilities": return wms_capabilities(query)
        if path == "/api/agro/wms/proxy": return wms_proxy(query)
        if path == "/api/agro/commodities": return (200, "application/json; charset=utf-8", commodity_source_status())
    except ValueError as exc:
        return (400, "application/json; charset=utf-8", {"ok": False, "error": str(exc)})
    except (HTTPError, URLError, TimeoutError) as exc:
        return (502, "application/json; charset=utf-8", {"ok": False, "error": f"Serviço externo indisponível: {str(exc)[:220]}"})
    except Exception as exc:
        return (503, "application/json; charset=utf-8", {"ok": False, "error": str(exc)[:400], "configuration": api_status()})
    return None


def post_response(path: str, payload: dict):
    try:
        if path == "/api/agro/ndvi":
            return (200, gee_ndvi(payload))
        if path == "/api/agro/embrapa/smartsolos":
            return (200, embrapa_smartsolos(payload))
        if path == "/api/agro/pest-diagnosis":
            token = os.environ.get("HF_TOKEN", "").strip()
            endpoint = os.environ.get("HF_PEST_ENDPOINT_URL", "").strip()
            if not token:
                return (503, {"ok": False, "error": "Hugging Face não configurado. Adicione HF_TOKEN com permissão de inferência no Render."})
            if not endpoint:
                return (503, {"ok": False, "error": "O detector de pragas ainda não tem endpoint de inferência. Configure HF_PEST_ENDPOINT_URL com a URL HTTPS de um Hugging Face Inference Endpoint ativo. O modelo IP102 não está hospedado por um Inference Provider compartilhado neste momento."})
            parsed = urlparse(endpoint)
            if parsed.scheme != "https" or not (parsed.hostname == "router.huggingface.co" or (parsed.hostname or "").endswith(".endpoints.huggingface.cloud")):
                return (400, {"ok": False, "error": "HF_PEST_ENDPOINT_URL deve ser HTTPS e pertencer a router.huggingface.co ou a um domínio *.endpoints.huggingface.cloud."})
            import base64
            raw = payload.get("imageBase64", "")
            if "," in raw:
                raw = raw.split(",", 1)[1]
            try:
                image_bytes = base64.b64decode(raw, validate=True)
            except Exception:
                raise ValueError("Imagem inválida. Selecione uma foto JPG ou PNG.")
            if len(image_bytes) < 100 or len(image_bytes) > 7 * 1024 * 1024:
                raise ValueError("A foto deve ter entre 100 bytes e 7 MB.")
            model = os.environ.get("HF_PEST_MODEL", "underdogquality/yolo11s-pest-detection").strip()
            request = Request(endpoint, data=image_bytes, headers={"Authorization": f"Bearer {token}", "Content-Type": payload.get("mimeType", "image/jpeg"), "Accept": "application/json", "User-Agent": _USER_AGENT}, method="POST")
            try:
                with urlopen(request, timeout=90) as resp:
                    result = json.loads(resp.read().decode("utf-8"))
            except HTTPError as exc:
                body = exc.read().decode("utf-8", "replace")[:350]
                if exc.code in (503, 504):
                    return (503, {"ok": False, "error": "O endpoint Hugging Face está inicializando ou indisponível. Aguarde a inicialização do endpoint e tente novamente."})
                return (502, {"ok": False, "error": f"Hugging Face retornou HTTP {exc.code}: {body}"})
            if isinstance(result, dict) and result.get("error"):
                return (502, {"ok": False, "error": str(result["error"])[:350]})
            predictions = result if isinstance(result, list) else (result.get("predictions") or result.get("detections") or result.get("results") or []) if isinstance(result, dict) else []
            normalized = []
            for item in predictions:
                if isinstance(item, dict):
                    label = item.get("label") or item.get("class") or item.get("name")
                    score = item.get("score", item.get("confidence", item.get("probability")))
                    if label is not None and score is not None:
                        row = {"label": str(label)[:120], "score": max(0.0, min(1.0, float(score)))}
                        if isinstance(item.get("box"), dict): row["box"] = item["box"]
                        normalized.append(row)
            if normalized:
                ranked = sorted(normalized, key=lambda x: x["score"], reverse=True)[:10]
                top = ranked[0]
                return (200, {"ok": True, "model": model, "predictions": ranked, "topLabel": top["label"],
                              "score": top["score"], "status": "inconclusive" if top["score"] < 0.5 else "candidate",
                              "note": "Detector de pragas IP102. A cobertura depende das classes do modelo e de fotos de campo; um score não é probabilidade clínica calibrada. Confirme no campo com agrônomo antes de intervir."})
            return (502, {"ok": False, "error": "O endpoint respondeu, mas o JSON não contém predictions/detections com label e score. Configure o endpoint para devolver uma lista de detecções."})
    except ValueError as exc:
        return (400, {"ok": False, "error": str(exc)})
    except Exception as exc:
        return (503, {"ok": False, "error": str(exc)[:350]})
    return None
