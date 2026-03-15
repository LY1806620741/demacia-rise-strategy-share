import init, {
    load_official_heroes,
    create_strategy,
    get_strategies,
    vote
} from './pkg/demacia_rise.js';

async function start() {
    await init();
    renderHeroes();
    renderStrategies();
}

function renderHeroes() {
    const list = load_official_heroes();
    const el = document.getElementById('hero-list');
    list.forEach(h => {
        el.innerHTML += `
        <div class="hero">
            <h3>${h.name} (${h.id})</h3>
            <p>HP:${h.hp} 攻击:${h.attack} | ${h.role}</p>
        </div>`;
    });
}

export function renderStrategies() {
    const list = get_strategies();
    const el = document.getElementById('strategy-list');
    el.innerHTML = '';
    list.forEach(s => {
        el.innerHTML += `
        <div class="strategy">
            <h4>${s.title}</h4>
            <p>${s.description}</p>
            <small>针对: ${s.target_hero} | 👍${s.likes} 👎${s.dislikes} | 评分:${s.score.toFixed(1)}</small>
            <div>
                <button class="vote-btn" onclick="vote('${s.id}',true)">👍</button>
                <button class="vote-btn" onclick="vote('${s.id}',false)">👎</button>
            </div>
        </div>`;
    });
}

window.submitStrategy = () => {
    const title = document.getElementById('title').value;
    const desc = document.getElementById('desc').value;
    const id = crypto.randomUUID();
    create_strategy(id, title, desc, "garen");
    renderStrategies();
};

window.vote = (id, isLike) => {
    vote(id, isLike);
    renderStrategies();
};

start();