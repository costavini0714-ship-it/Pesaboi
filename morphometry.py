"""Motor morfométrico experimental PesaBoi. Unidades SI internamente."""
from __future__ import annotations
import math

# Constante Crevat inicial; deve ser calibrada por raça/lote com pesagens reais.
BREED_K = {
    "nelore": 11200.0, "angus": 11000.0, "brangus": 11100.0,
    "holandes": 11400.0, "gir": 11300.0, "default": 11200.0,
}


def pixel_scale_cm_per_px(focal_mm: float, distance_mm: float, sensor_width_mm: float, image_width_px: int) -> float:
    vals = (focal_mm, distance_mm, sensor_width_mm, image_width_px)
    if any(float(v) <= 0 for v in vals):
        raise ValueError("Focal, distância, largura do sensor e resolução devem ser positivos.")
    # cm/px = (sensor_mm * distância_mm / (focal_mm * largura_px)) * 0.1
    return (sensor_width_mm * distance_mm / (focal_mm * image_width_px)) * 0.1


def joint_angle_deg(a: dict, b: dict, c: dict) -> float:
    """Ângulo ABC pelo produto escalar; B é o vértice articular."""
    u = (float(a['x'])-float(b['x']), float(a['y'])-float(b['y']), float(a.get('z',0))-float(b.get('z',0)))
    v = (float(c['x'])-float(b['x']), float(c['y'])-float(b['y']), float(c.get('z',0))-float(b.get('z',0)))
    nu = math.sqrt(sum(q*q for q in u)); nv = math.sqrt(sum(q*q for q in v))
    if nu == 0 or nv == 0: raise ValueError("Pontos articulares coincidentes.")
    cosine = max(-1.0, min(1.0, sum(x*y for x,y in zip(u,v))/(nu*nv)))
    return math.degrees(math.acos(cosine))


def ellipse_perimeter(width_m: float, depth_m: float) -> float:
    """Ramanujan II para perímetro de secção elíptica."""
    a, b = width_m/2.0, depth_m/2.0
    if a <= 0 or b <= 0: raise ValueError("Largura e profundidade precisam ser positivas.")
    h = ((a-b)**2)/((a+b)**2)
    return math.pi*(a+b)*(1 + 3*h/(10+math.sqrt(4-3*h)))


def estimate(payload: dict) -> dict:
    cal = payload.get('calibration') or {}
    focal = float(cal.get('focal_mm', 0)); distance = float(cal.get('distance_mm', 0))
    sensor = float(cal.get('sensor_width_mm', 0)); image_w = int(cal.get('image_width_px', 0))
    cm_px = pixel_scale_cm_per_px(focal, distance, sensor, image_w)
    # Comprimento pode vir da distância entre landmarks em pixels, nunca digitado em cm.
    body_px = float(payload.get('body_length_px', 0))
    if body_px <= 0: raise ValueError("body_length_px ausente: o detector deve localizar os extremos do tronco.")
    body_length_cm = body_px * cm_px
    slices = payload.get('slices') or []
    if len(slices) < 3: raise ValueError("São necessárias ao menos 3 fatias com largura e profundidade medidas pelo mapa Z.")
    # Fatias igualmente espaçadas ao longo do eixo corporal; cada secção é elíptica.
    dx = (body_length_cm/100.0)/(len(slices)-1)
    areas=[]; chest_width=None; chest_depth=None
    for i, s in enumerate(slices):
        w=float(s.get('width_px',0))*cm_px/100.0
        d=float(s.get('depth_mm',0))/1000.0
        if w <= 0 or d <= 0: raise ValueError("Cada fatia precisa de largura de silhueta e profundidade Z válida.")
        areas.append(math.pi*(w/2)*(d/2))
        if s.get('is_chest') or chest_width is None:
            chest_width, chest_depth = w, d
    # Regra trapezoidal para integrar volume ao longo do comprimento.
    volume_m3 = dx*(sum(areas) - (areas[0]+areas[-1])/2)
    volume_l = max(0.0, volume_m3*1000.0)
    chest_perimeter_cm = ellipse_perimeter(chest_width, chest_depth)*100.0
    k = float(payload.get('crevat_k') or BREED_K.get(str(payload.get('breed','')).lower(), BREED_K['default']))
    if not 10000 <= k <= 12000: raise ValueError("K Crevat fora da faixa esperada (10.000–12.000).")
    crevat_kg = (chest_perimeter_cm**2 * body_length_cm)/k
    # Densidade aparente inicial; volume é controle independente, não diagnóstico.
    volume_kg = volume_m3*985.0
    # Crevat como estimador principal, volume como verificação morfológica.
    discrepancy = abs(crevat_kg-volume_kg)/max(crevat_kg,1)*100
    angles = {}
    points = payload.get('keypoints') or {}
    if all(kp in points for kp in ('A','B','C')):
        angles['ABC_deg'] = round(joint_angle_deg(points['A'],points['B'],points['C']),2)
    return {
        'status':'experimental_geometry_received',
        'weight_estimate_kg':round(crevat_kg,1),
        'crevat_kg':round(crevat_kg,1), 'volume_crosscheck_kg':round(volume_kg,1),
        'volume_liters':round(volume_l,1), 'body_length_cm':round(body_length_cm,1),
        'thoracic_perimeter_cm':round(chest_perimeter_cm,1), 'crevat_k':k,
        'pixel_scale_cm_per_px':round(cm_px,6), 'joint_angles':angles,
        'crosscheck_difference_percent':round(discrepancy,1),
        'confidence':'requires_validation' if discrepancy>20 else 'experimental',
        'warning':'Estimativa morfométrica experimental. A precisão depende de segmentação bovina, calibração da câmera, mapa de profundidade e validação com balança.'
    }
