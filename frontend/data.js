import { state } from './state.js';

export function getFactionUnits(faction) {
  return Array.isArray(state.config?.units?.[faction]) ? state.config.units[faction] : [];
}

export function getAllEnemyUnits() {
  return Array.isArray(state.config?.enemies) ? state.config.enemies : [];
}

export function getAllDefenseUnits() {
  const heroes = Array.isArray(state.config?.heroes)
    ? state.config.heroes.map(hero => ({ ...hero, category: 'hero', isHero: true }))
    : [];
  const units = getFactionUnits('demacia').map(unit => ({ ...unit, category: 'demacia', isHero: false }));
  return [...heroes, ...units];
}

