// O Vault conta o tempo em dias: 30 dias fecham um mes, e e o fechamento do mes que dispara eventos, ataques e a porta.
export const DAYS_PER_MONTH = 30;

// Parte do fluxo mensal que cabe no dia `dayIndex` (1 a 30). Somando os 30 dias o total e exatamente o mes inteiro,
// sem perder os centesimos que arredondar dia a dia comeria.
export function dayShare(monthlyAmount, dayIndex) {
  if (!dayIndex) return monthlyAmount;
  return Math.round(monthlyAmount * dayIndex / DAYS_PER_MONTH) - Math.round(monthlyAmount * (dayIndex - 1) / DAYS_PER_MONTH);
}

export function getVaultDayOfMonth(state) {
  return Math.max(0, Math.min(DAYS_PER_MONTH - 1, Math.floor(Number(state?.wasteland_day) || 0)));
}

// Dias totais desde a bomba: meses fechados mais os dias do mes em curso.
export function getVaultDay(state) {
  return Math.max(0, Math.floor(Number(state?.wasteland_turn) || 0)) * DAYS_PER_MONTH + getVaultDayOfMonth(state);
}
