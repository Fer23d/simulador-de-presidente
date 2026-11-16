// Configuracao de imagem (guardada no aparelho, como o volume): qualidade dos efeitos e escala da interface.
export const QUALITY_LEVELS = Object.freeze([
  Object.freeze({ id: 'high', label: 'Alta', text: 'Todos os brilhos, sombras e animações.' }),
  Object.freeze({ id: 'medium', label: 'Média', text: 'Sem desfoque de fundo nem brilho nos textos; as animações continuam.' }),
  Object.freeze({ id: 'low', label: 'Baixa', text: 'Sem desfoque, brilhos, sombras e movimento: o mais leve para PCs fracos.' }),
]);

export const SCALE_MIN = 0.8;
export const SCALE_MAX = 1.4;
export const SCALE_STEP = 0.05;

export function normalizeImageSettings(value = {}) {
  const quality = QUALITY_LEVELS.some((item) => item.id === value?.imageQuality) ? value.imageQuality : 'high';
  const raw = Number(value?.uiScale);
  const scale = Number.isFinite(raw) ? Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.round(raw / SCALE_STEP) * SCALE_STEP)) : 1;
  return { quality, scale: Math.round(scale * 100) / 100 };
}
