import { state } from './state.js';

function withDescription(entity) {
  if (!entity) return entity;
  return {
    ...entity,
    description: entity.description || '',
  };
}

function parseChapterNumber(value) {
  const text = String(value || '');
  const matched = /第\s*(\d+)\s*章/.exec(text);
  return matched ? Number(matched[1]) : 0;
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
        chapter: Number(wave.chapter || parseChapterNumber(wave.label || entry.notes || '')) || 0,
        incomingEnemies: (wave.incoming_enemy_ids || []).map(getEnemyUnitById).filter(Boolean),
        recommendedLineup: (wave.recommended_lineup_ids || []).map(getDefenseUnitById).filter(Boolean),
        recommendedTechs: (wave.recommended_tech_ids || []).map(getTechById).filter(Boolean),
      })) : [],
    };
  });
}

export function getCurrentChapter() {
  const configuredChapter = Number(state?.config?.community?.current_chapter || 0) || 0;
  const runtimeChapter = Number(state?.networkConfig?.currentChapter || 0) || 0;
  return configuredChapter || runtimeChapter || 0;
}

export function getResolvedTownDefenseRecommendationsForChapter(chapter = getCurrentChapter()) {
  const targetChapter = Number(chapter || 0);
  const recommendations = getResolvedTownDefenseRecommendations();
  if (!targetChapter) return recommendations;
  return recommendations
    .map(entry => ({
      ...entry,
      waves: (entry.waves || []).filter(wave => Number(wave.chapter || 0) === targetChapter),
    }))
    .filter(entry => entry.waves.length > 0);
}
