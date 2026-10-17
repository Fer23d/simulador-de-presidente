export const DEFAULT_EXPEDITION_CITY = 'Capital';
export const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';

export function createExpeditionLocation(city, source = 'fallback') {
  const cleaned = typeof city === 'string' ? city.trim().replace(/[<>\u0000-\u001f]/g, '').slice(0, 80) : '';
  const label = cleaned || DEFAULT_EXPEDITION_CITY;
  return { city: label, nodes: createExpeditionNodes(label), source: source === 'geolocation' ? source : 'fallback' };
}

export function createExpeditionNodes(city) {
  const cleaned = typeof city === 'string' ? city.trim().replace(/[<>\u0000-\u001f]/g, '').slice(0, 80) : '';
  const label = cleaned || DEFAULT_EXPEDITION_CITY;
  if (label === DEFAULT_EXPEDITION_CITY) {
    return ['Ruínas da Capital', 'Cratera do estádio da Capital', 'Acampamento da praça central da Capital'];
  }
  if (label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() === 'belo horizonte') {
    return ['Ruínas de Belo Horizonte', 'Cratera do Mineirão', 'Acampamento da Praça da Liberdade'];
  }
  return [
    `Ruínas de ${label}`,
    `Cratera do estádio de ${label}`,
    `Acampamento da praça central de ${label}`,
  ];
}

function getPosition(geolocation) {
  return new Promise((resolve, reject) => {
    if (typeof geolocation?.getCurrentPosition !== 'function') {
      reject(new Error('Geolocalização indisponível.'));
      return;
    }
    geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      maximumAge: 86_400_000,
      timeout: 8_000,
    });
  });
}

function fallbackLocation() {
  return createExpeditionLocation(DEFAULT_EXPEDITION_CITY);
}

export async function resolveExpeditionLocation({
  geolocation = globalThis.navigator?.geolocation,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== 'function') return fallbackLocation();
  try {
    const position = await getPosition(geolocation);
    const latitude = Number(position?.coords?.latitude);
    const longitude = Number(position?.coords?.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return fallbackLocation();

    const url = new URL(NOMINATIM_REVERSE_URL);
    url.search = new URLSearchParams({
      format: 'jsonv2',
      lat: String(latitude),
      lon: String(longitude),
      zoom: '10',
      addressdetails: '1',
    }).toString();
    const response = await fetchImpl(url, { headers: { 'Accept-Language': 'pt-BR' }, cache: 'force-cache' });
    if (!response?.ok) return fallbackLocation();
    const data = await response.json();
    const address = data?.address ?? {};
    const city = address.city || address.town || address.village || address.municipality || address.county;
    if (typeof city !== 'string' || !city.trim()) return fallbackLocation();
    return createExpeditionLocation(city, 'geolocation');
  } catch {
    return fallbackLocation();
  }
}
