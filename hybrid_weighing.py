"""Motor matemático PesaBoi — câmera calibrada + fita métrica.

Não usa IA, detector genérico, estimativas por porte ou pesos de referência.
O peso só é calculado quando a escala da fotografia, o comprimento corporal e
as duas medidas torácicas são fornecidos e validados.
"""
from __future__ import annotations
import math

DEFAULT_K = 10840.0
MIN_K = 10800.0
MAX_K = 11500.0


def _point(value: object, field: str) -> tuple[float, float]:
    if not isinstance(value, dict):
        raise ValueError(f"Marque os pontos da fotografia: {field} está ausente.")
    try:
        x = float(value["x"])
        y = float(value["y"])
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError(f"Coordenadas inválidas em {field}.") from exc
    if not (math.isfinite(x) and math.isfinite(y) and 0 <= x <= 1200 and 0 <= y <= 1200):
        raise ValueError(f"O ponto {field} está fora da fotografia.")
    return x, y


def _distance(a: tuple[float, float], b: tuple[float, float]) -> float:
    return math.hypot(b[0] - a[0], b[1] - a[1])


def estimate_hybrid(payload: dict) -> dict:
    """Calcula PV = (G_médio² × C) / K com dimensões em centímetros."""
    breed = str(payload.get("breed", "")).strip()
    size_class = str(payload.get("size_class", "")).strip()
    if not breed:
        raise ValueError("Selecione a raça do bovino.")
    if size_class not in {"Pequeno", "Médio", "Grande"}:
        raise ValueError("Selecione o porte pequeno, médio ou grande.")

    try:
        reference_length_cm = float(payload.get("reference_length_cm", 0))
    except (TypeError, ValueError) as exc:
        raise ValueError("Informe o comprimento real da régua/barra em centímetros.") from exc
    if not math.isfinite(reference_length_cm) or not 5 <= reference_length_cm <= 300:
        raise ValueError("A referência deve ter entre 5 e 300 cm.")

    scale_a = _point(payload.get("reference_start"), "A — início da referência")
    scale_b = _point(payload.get("reference_end"), "B — fim da referência")
    body_a = _point(payload.get("body_start"), "C — ponta do ombro")
    body_b = _point(payload.get("body_end"), "D — osso da garupa")
    reference_pixels = _distance(scale_a, scale_b)
    body_pixels = _distance(body_a, body_b)
    if reference_pixels < 5:
        raise ValueError("Os pontos A e B estão muito próximos. Marque as duas extremidades da referência.")
    if body_pixels < 5:
        raise ValueError("Os pontos C e D estão muito próximos. Marque ombro e garupa.")

    scale_cm_per_pixel = reference_length_cm / reference_pixels
    body_length_cm = body_pixels * scale_cm_per_pixel
    if not 40 <= body_length_cm <= 350:
        raise ValueError("O comprimento calculado ficou fora de 40–350 cm. Confira a escala e os pontos C/D.")

    measurements = payload.get("thoracic_measurements_cm")
    if not isinstance(measurements, list) or len(measurements) != 2:
        raise ValueError("Informe duas medidas da circunferência torácica com fita métrica.")
    try:
        chest_1, chest_2 = map(float, measurements)
    except (TypeError, ValueError) as exc:
        raise ValueError("As duas medidas torácicas precisam ser números em centímetros.") from exc
    if any(not math.isfinite(v) or not 30 <= v <= 300 for v in (chest_1, chest_2)):
        raise ValueError("Cada medida torácica deve estar entre 30 e 300 cm.")
    thoracic_average_cm = (chest_1 + chest_2) / 2.0

    try:
        k = float(payload.get("crevat_k") or DEFAULT_K)
    except (TypeError, ValueError) as exc:
        raise ValueError("O coeficiente K precisa ser numérico.") from exc
    if not math.isfinite(k) or not MIN_K <= k <= MAX_K:
        raise ValueError("O coeficiente K deve ficar entre 10.800 e 11.500.")

    weight_kg = (thoracic_average_cm ** 2 * body_length_cm) / k
    if not math.isfinite(weight_kg) or not 10 <= weight_kg <= 2500:
        raise ValueError("O resultado ficou fora da faixa matemática esperada. Confira as medidas e a escala.")

    return {
        "status": "calculated_estimate",
        "estimate_mode": "calibrated_photo_plus_tape",
        "weight_estimate_kg": round(weight_kg, 2),
        "thoracic_measurement_1_cm": round(chest_1, 2),
        "thoracic_measurement_2_cm": round(chest_2, 2),
        "thoracic_average_cm": round(thoracic_average_cm, 2),
        "body_length_cm": round(body_length_cm, 2),
        "body_length_pixels": round(body_pixels, 2),
        "reference_pixels": round(reference_pixels, 2),
        "reference_length_cm": round(reference_length_cm, 2),
        "cm_per_pixel": round(scale_cm_per_pixel, 7),
        "crevat_k": round(k, 2),
        "formula": "(circunferência torácica média² × comprimento corporal) ÷ K",
        "formula_constant": round(k, 2),
        "confidence": "não validada — comparar com pesagens reais de balança",
        "warning": (
            "Estimativa matemática por medidas corporais. A imagem foi usada para medir o comprimento "
            "com uma referência física; a circunferência veio da fita métrica. A precisão por raça/lote "
            "ainda precisa ser validada com pesagens reais. Não é uma pesagem de balança."
        ),
    }


def estimate_two_photo_ellipse(depth_cm: float, width_cm: float) -> dict:
    """Perímetro elíptico experimental (Ramanujan); não substitui fita métrica."""
    depth = float(depth_cm)
    width = float(width_cm)
    if not (math.isfinite(depth) and math.isfinite(width) and 10 <= depth <= 200 and 10 <= width <= 200):
        raise ValueError("Profundidade e largura precisam estar entre 10 e 200 cm.")
    a, b = depth / 2.0, width / 2.0
    perimeter = math.pi * (3 * (a + b) - math.sqrt((3 * a + b) * (a + 3 * b)))
    return {
        "depth_cm": round(depth, 2), "width_cm": round(width, 2),
        "estimated_perimeter_cm": round(perimeter, 2),
        "method": "Ramanujan — seção transversal elíptica experimental",
        "warning": "Estimativa experimental; valide com fita métrica antes de usar no peso.",
    }
