// Seleção fixa do tabuleiro compacto. A base global continua disponível aos
// outros modos e às partidas antigas; apenas estes países entram no novo War.
export const WAR_REGIONS = Object.freeze({
  americas: Object.freeze('can usa mex gtm hnd nic cri pan cub dom col ven ecu per bra bol chl arg pry ury'.split(' ')),
  europe: Object.freeze('rus ukr pol deu fra esp prt gbr irl ita grc rou bgr hun cze aut che bel nld dnk swe nor fin srb tur'.split(' ')),
  africa: Object.freeze('mar dza tun lby egy sdn ssd eth som ken uga tza cod cog ago zmb zwe moz zaf nam bwa nga ner mli sen'.split(' ')),
  asia: Object.freeze('chn ind pak bgd afg irn irq sau are isr jor syr kaz uzb mng prk kor jpn twn vnm tha mmr mys idn phl'.split(' ')),
  oceania: Object.freeze('aus nzl png fji slb'.split(' ')),
});

export const WAR_COUNTRY_IDS = Object.freeze(Object.values(WAR_REGIONS).flat());
export const WAR_COUNTRY_COUNT = WAR_COUNTRY_IDS.length;
