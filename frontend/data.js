import { state } from './state.js';

export function getFactionUnits(faction) {
  return Array.isArray(state.config?.units?.[faction]) ? state.config.units[faction] : [];
}

export function getAllEnemyUnits() {
  return Array.isArray(state.config?.enemies) ? state.config.enemies : [];
}

export function getHeroes() {
  return Array.isArray(state.config?.heroes) ? state.config.heroes : [];
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
