import { state } from './state.js';

const GAMEINFO_DESCRIPTIONS = {
  guard: '握持长枪的卫兵组成的小队，擅长对抗小规模敌人。',
  soldier: '前线战士，使用剑与盾，能够轻松阻拦敌人。',
  archer: '一队弓兵，能够稳定输出高额的伤害。',
  ranger: '弩手射速较慢，但能精准狙击大型目标并造成高额伤害。',
  vanguard: '前线作战的先锋，使用剑与盾，能够轻松阻拦敌人。',
  kayle: '近战与远程混合型输出，在战斗中不断获得攻速和攻击距离。',
  garen: '一击便能重创大片敌人，同时自身获得“勇气”效果，暂时降低承受的伤害。',
  jarvan_iv: '可掷出德玛西亚军旗，增加周围全体友方近战单位的攻击力和护甲。',
  poppy: '可将武器砸向地面，击晕面前所有敌人。',
  galio: '前线的守护者，可以减少自己所受的伤害。',
  morgana: '可侵蚀目标区域 5 秒，范围内的敌人每 0.5 秒受到一次伤害。',
  sona: '不仅能使用叆华在战斗中造成远程伤害，还能提升其他远程部队的攻击力，为其提供支援。',
  quinn: '会利用十字弩优先打击敌方的远程部队，并可召出华洛造成巨额伤害。',
  noxian_infantry: '诺克萨斯大军中的骨干，其实力与德玛西亚卫兵相当。',
  noxian_battlemage: '擅长从远距离投掷火球，造成范围伤害；要想接近他们，就必须突破敌方阵线。',
  basilisk: '以远程单位为攻击目标，但移动速度极其缓慢；游侠的十字弩能射穿其护甲。',
  noxian_drakehound: '训练有素的龙犬跑得比野犬还快，能轻松闪避远程攻击。',
  noxian_mauler: '配备重甲，生命值降至一半时会陷入狂暴状态，攻击速度大幅提升。',
  tribal_warrior: '会瞄准远程单位，发动迅猛且极具毁灭性的近战攻击。',
  troll: '会掷出夺命飞斧，对挡道的敌人造成高额单体伤害。',
  yeti: '会扔出巨石，对周围单位造成高额范围伤害。',
  krug: '对近战攻击伤害有大幅减免，更适合用远程单位处理。',
  drakehound: '常常成群结队出没，是迅猛的猎手。',
};

function withDescription(entity) {
  if (!entity) return entity;
  return {
    ...entity,
    description: entity.description || GAMEINFO_DESCRIPTIONS[entity.id] || '',
  };
}

export function getFactionUnits(faction) {
  return Array.isArray(state.config?.units?.[faction]) ? state.config.units[faction].map(withDescription) : [];
}

export function getAllEnemyUnits() {
  return Array.isArray(state.config?.enemies) ? state.config.enemies.map(withDescription) : [];
}

export function getHeroes() {
  return Array.isArray(state.config?.heroes) ? state.config.heroes.map(withDescription) : [];
}

export function getBuildings() {
  return Array.isArray(state.config?.buildings) ? state.config.buildings : [];
}

export function getAllDefenseUnits() {
  const heroes = getHeroes().map(hero => ({ ...hero, category: 'hero', isHero: true }));
  const units = getFactionUnits('demacia').map(unit => ({ ...unit, category: 'demacia', isHero: false }));
  return [...heroes, ...units];
}

export function getOfficialLineups() {
  return Array.isArray(state.config?.enemy_compositions) ? state.config.enemy_compositions : [];
}

export function getTechTree() {
  return Array.isArray(state.config?.tech_tree) ? state.config.tech_tree : [];
}

export function getAllTechOptions() {
  return getTechTree().flatMap(chapter =>
    Array.isArray(chapter.techs)
      ? chapter.techs.map(tech => ({ ...tech, chapter: chapter.chapter, chapterName: chapter.name }))
      : []
  );
}

export function getTownDefenseRecommendations() {
  return Array.isArray(state.config?.town_defense_recommendations) ? state.config.town_defense_recommendations : [];
}

export function getAllMapNodes() {
  const mapNodes = state.config?.map_nodes || {};
  return Object.entries(mapNodes).flatMap(([region, nodes]) =>
    Array.isArray(nodes) ? nodes.map(node => ({ ...node, region })) : []
  );
}

export function getEnemyUnitById(id) {
  return getAllEnemyUnits().find(unit => unit.id === id) || null;
}

export function getDefenseUnitById(id) {
  return getAllDefenseUnits().find(unit => unit.id === id) || null;
}

export function getTechById(id) {
  return getAllTechOptions().find(tech => tech.id === id) || null;
}

export function getMapNodeById(id) {
  return getAllMapNodes().find(node => node.id === id) || null;
}

export function getResolvedTownDefenseRecommendations() {
  return getTownDefenseRecommendations().map(entry => {
    const town = getMapNodeById(entry.town_id) || { id: entry.town_id, name: entry.town_name || entry.town_id, region: entry.region || 'unknown' };
    return {
      ...entry,
      town,
      waves: Array.isArray(entry.waves) ? entry.waves.map(wave => ({
        ...wave,
        incomingEnemies: (wave.incoming_enemy_ids || []).map(getEnemyUnitById).filter(Boolean),
        recommendedLineup: (wave.recommended_lineup_ids || []).map(getDefenseUnitById).filter(Boolean),
        recommendedTechs: (wave.recommended_tech_ids || []).map(getTechById).filter(Boolean),
      })) : [],
    };
  });
}
