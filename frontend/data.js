import { state } from './state.js';

export function getFactionUnits(faction) {
  return Array.isArray(state.config?.units?.[faction]) ? state.config.units[faction] : [];
}

export function getAllEnemyUnits() {
  return Array.isArray(state.config?.enemies) ? state.config.enemies : [];
}

export function getAllDefenseUnits() {
  const heroes = getHeroes().map(hero => ({ ...hero, category: 'hero', isHero: true }));
  const units = getFactionUnits('demacia').map(unit => ({ ...unit, category: 'demacia', isHero: false }));
  return [...heroes, ...units];
}

export function getHeroes() {
  return Array.isArray(state.config?.heroes) ? state.config.heroes : [];
}

export function getBuildings() {
  return Array.isArray(state.config?.buildings) ? state.config.buildings : [];
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
