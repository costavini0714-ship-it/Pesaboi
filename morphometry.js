/* PesaBoi — geometria e cálculos morfométricos convencionais, sem IA. */
(function (root) {
  'use strict';
  const DEFAULT_K = 10840;
  const MIN_K = 10800;
  const MAX_K = 11500;
  function distance2D(a, b) {
    if (!a || !b) return null;
    return Math.hypot(Number(b.x) - Number(a.x), Number(b.y) - Number(a.y));
  }
  function pixelScaleFromReference(referenceCm, referencePixels) {
    if (!(Number(referenceCm) > 0) || !(Number(referencePixels) > 0)) throw new Error('Referência física inválida.');
    return Number(referenceCm) / Number(referencePixels);
  }
  function crevat(thoracic1Cm, thoracic2Cm, bodyLengthCm, K = DEFAULT_K) {
    const g1 = Number(thoracic1Cm), g2 = Number(thoracic2Cm), c = Number(bodyLengthCm), k = Number(K);
    if (![g1, g2, c, k].every(Number.isFinite) || g1 <= 0 || g2 <= 0 || c <= 0 || k < MIN_K || k > MAX_K) throw new Error('Medidas ou coeficiente K inválidos.');
    const chestAverageCm = (g1 + g2) / 2;
    return { weightKg: (chestAverageCm ** 2 * c) / k, chestAverageCm, formula: `((${chestAverageCm.toFixed(2)})² × ${c.toFixed(2)}) ÷ ${k}` };
  }
  function ellipsePerimeter(depthCm, widthCm) {
    const a = Number(depthCm) / 2, b = Number(widthCm) / 2;
    if (!(a > 0 && b > 0)) throw new Error('Dimensões elípticas inválidas.');
    return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
  }
  function angleABC(A, B, C) {
    const u = [A.x - B.x, A.y - B.y, (A.z || 0) - (B.z || 0)];
    const v = [C.x - B.x, C.y - B.y, (C.z || 0) - (B.z || 0)];
    const dot = u.reduce((sum, value, i) => sum + value * v[i], 0);
    const denominator = Math.hypot(...u) * Math.hypot(...v);
    if (!denominator) throw new Error('Pontos articulares coincidentes.');
    return Math.acos(Math.max(-1, Math.min(1, dot / denominator))) * 180 / Math.PI;
  }

  const HEIGHT_BY_SIZE = { Pequeno: 112, Médio: 138, Grande: 160 };
  const BREED_FACTOR = {
    angus: 1.00, nelore: 1.02, brangus: 1.02, hereford: 1.00, brahman: 1.05,
    senepol: 0.99, guzera: 1.02, gir: 0.96, girolando: 1.02, holandes: 1.04,
    jersey: 0.91, tabapua: 1.03, simental: 1.05, charoles: 1.05, canchim: 1.03,
    outramestico: 1.00
  };
  const BREED_K = {
    nelore: 11200, angus: 11000, brangus: 11100, holandes: 11400,
    gir: 11300, hereford: 11050, brahman: 11250, senepol: 11050,
    guzera: 11300, girolando: 11350, jersey: 11250, tabapua: 11200,
    simental: 11300, charoles: 11200, canchim: 11150
  };
  function normalizeBreed(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '');
  }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function estimateAutomaticVisual(options) {
    const box = options && options.bbox;
    const breed = String(options?.breed || '').trim();
    const size = String(options?.sizeClass || '').trim();
    const score = Number(options?.score || 0);
    if (!box || box.length !== 4 || box.some(value => !Number.isFinite(Number(value)) || Number(value) <= 0)) {
      throw new Error('A detecção automática do bovino não forneceu uma área válida. Tire outra foto lateral.');
    }
    if (!breed || !HEIGHT_BY_SIZE[size]) throw new Error('Selecione a raça e o porte do bovino.');
    if (score < 0.25) throw new Error('O bovino não foi identificado com segurança. Tire outra foto, mostrando o corpo inteiro de lado.');
    const [x, y, widthPx, heightPx] = box.map(Number);
    const imageWidth = Number(options.imageWidth || 1200);
    const imageHeight = Number(options.imageHeight || 1200);
    if (widthPx < imageWidth * 0.16 || heightPx < imageHeight * 0.13) {
      throw new Error('O animal ficou pequeno na foto. Aproxime a câmera sem cortar cabeça, patas ou cauda.');
    }
    if (x <= imageWidth * 0.005 || y <= imageHeight * 0.005 || x + widthPx >= imageWidth * 0.995 || y + heightPx >= imageHeight * 0.995) {
      throw new Error('O bovino parece encostar na borda da foto e pode estar cortado. Refaça a captura com margem ao redor do animal.');
    }
    const aspect = widthPx / heightPx;
    if (aspect < 1.18) throw new Error('A foto parece frontal ou traseira. Tire uma fotografia lateral do bovino.');
    if (aspect > 3.8) throw new Error('O enquadramento ficou muito comprido ou cortado. Refaça a foto com o animal inteiro.');

    const breedKey = normalizeBreed(breed);
    const breedFactor = BREED_FACTOR[breedKey] || 1.0;
    const referenceHeightCm = HEIGHT_BY_SIZE[size] * breedFactor;
    // A altura média da categoria é uma referência estatística, não uma escala
    // física obtida pela câmera. A proporção da caixa visual ajusta o comprimento.
    const lengthFactor = clamp(1 + (aspect - 1.75) * 0.10, 0.91, 1.16);
    const bodyLengthCm = referenceHeightCm * lengthFactor;
    const bodyFactor = breedKey === 'brahman' || breedKey === 'nelore' || breedKey === 'simental' ? 1.025 : 1.0;
    const thoracicDepthCm = referenceHeightCm * 0.47 * bodyFactor;
    const thoracicWidthCm = referenceHeightCm * 0.42 * bodyFactor;
    const thoracicPerimeterCm = ellipsePerimeter(thoracicDepthCm, thoracicWidthCm);
    const K = Number(options.calibrationK) > 0 ? Number(options.calibrationK) : (BREED_K[breedKey] || DEFAULT_K);
    const weightKg = (thoracicPerimeterCm ** 2 * bodyLengthCm) / K;
    // A faixa ampla expressa a incerteza de usar proporções médias sem profundidade 3D.
    const uncertainty = score >= 0.70 ? 0.35 : 0.45;
    return {
      weightKg,
      rangeLowKg: weightKg * (1 - uncertainty),
      rangeHighKg: weightKg * (1 + uncertainty),
      bodyLengthCm,
      referenceHeightCm,
      thoracicDepthCm,
      thoracicWidthCm,
      thoracicPerimeterCm,
      K,
      bboxAspect: aspect,
      detectorScore: score,
      formula: '(perímetro torácico elíptico² × comprimento estimado) ÷ K',
      method: 'detecção bovina local + proporções morfométricas médias por raça/porte',
      confidence: 'baixa — pré-estimativa visual experimental',
      warning: 'A detecção localiza o bovino, mas uma foto RGB comum não mede profundidade nem escala física. Comprimento e tórax usam médias estatísticas de raça/porte; a faixa é ampla e precisa ser validada com balança. Não use para medicamentos, venda ou decisões veterinárias.'
    };
  }

  root.PesaBoiMorphometry = { DEFAULT_K, distance2D, pixelScaleFromReference, crevat, ellipsePerimeter, angleABC, estimateAutomaticVisual };
})(typeof window !== 'undefined' ? window : globalThis);
