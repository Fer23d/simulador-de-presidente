// Identidade dos moradores comuns: nome, sobrenome e um traco de personalidade.
// Gerados a partir do id, para que o mesmo morador tenha sempre o mesmo nome (inclusive em saves antigos).
export const GENERIC_NAME = 'Habitante Genérico';

const FIRST_NAMES = Object.freeze([
  'Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Fábio', 'Gabi', 'Hugo', 'Inês', 'João', 'Kátia', 'Leo',
  'Marta', 'Nuno', 'Olga', 'Paulo', 'Rita', 'Saulo', 'Tânia', 'Vítor', 'Yara', 'Zé',
]);
const LAST_NAMES = Object.freeze([
  'Almeida', 'Batista', 'Cardoso', 'Duarte', 'Esteves', 'Farias', 'Gomes', 'Lima', 'Matos', 'Nogueira',
  'Pires', 'Queiroz', 'Ramos', 'Souza', 'Teixeira', 'Vieira',
]);

export const RESIDENT_TRAITS = Object.freeze({
  banker: Object.freeze({ label: 'Ex-bancário', line: 'No meu antigo banco, isto seria um prejuízo inaceitável. Aqui é só terça-feira.' }),
  parent: Object.freeze({ label: 'Pai de três', line: 'Os meus três dormem no andar de baixo. Enquanto comerem, eu aguento tudo.' }),
  musician: Object.freeze({ label: 'Músico', line: 'Toco no dormitório à noite. Ninguém pede, mas todo mundo fica calado para ouvir.' }),
  veteran: Object.freeze({ label: 'Ex-soldado', line: 'Já respirei coisa pior que este ar, Presidente. Pode contar comigo.' }),
  loyalist: Object.freeze({ label: 'Fã do antigo governo', line: 'O antigo presidente teria resolvido isto em uma semana. Mas ele fugiu, não foi?' }),
  insomniac: Object.freeze({ label: 'Insone', line: 'Não durmo desde a bomba. Pelo menos vigio os corredores de graça.' }),
});
const TRAIT_IDS = Object.keys(RESIDENT_TRAITS);

function hash(text, salt) {
  let value = 2_166_136_261 ^ salt;
  for (const character of String(text)) value = Math.imul(value ^ character.codePointAt(0), 16_777_619);
  return value >>> 0;
}

export function generateResidentIdentity(id) {
  return {
    name: `${FIRST_NAMES[hash(id, 11) % FIRST_NAMES.length]} ${LAST_NAMES[hash(id, 29) % LAST_NAMES.length]}`,
    trait: TRAIT_IDS[hash(id, 47) % TRAIT_IDS.length],
  };
}

export function isGenericName(name) {
  return typeof name !== 'string' || !name.trim() || name.trim() === GENERIC_NAME;
}

// Mantem nomes proprios (especialistas, nomes ja salvos) e so preenche o que for generico.
export function resolveResidentIdentity(npc) {
  const generated = generateResidentIdentity(npc?.id ?? '');
  return {
    name: isGenericName(npc?.name) ? generated.name : npc.name.trim().slice(0, 60),
    trait: RESIDENT_TRAITS[npc?.trait] ? npc.trait : (npc?.isVIP ? null : generated.trait),
  };
}

export function getTraitLabel(traitId) {
  return RESIDENT_TRAITS[traitId]?.label ?? null;
}
