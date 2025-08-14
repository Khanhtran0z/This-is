function showOnly(name){
  if (name==='shop') name = 'shop-panel';
  document.querySelectorAll('.panel').forEach(sec => { sec.setAttribute('hidden','hidden'); sec.style.display='none'; });
  const landing = document.getElementById('landing');
  if (landing) { landing.setAttribute('hidden','hidden'); landing.style.display='none'; }
  const candidates = [document.getElementById(name), document.getElementById(name+'-panel'), (name==='game'?document.getElementById('game-section'):null), (name==='levelup'?document.getElementById('level-up-panel'):null)].filter(Boolean);
  const el = candidates[0];
  if (el){ el.removeAttribute('hidden'); el.style.display=''; } else if (name==='landing' && landing){ landing.removeAttribute('hidden'); landing.style.display=''; }
}
(function () {
  'use strict';

  /*=== Constants ===*/
  const GRID_SIZE = 4; // number of cells per side (4x4 grid)
  // Each HP stat represents this many actual hit points. Used for Berserker scaling and skill costs.
  const HP_STAT_VALUE = 5;
  // Definitions for items available in the game. Each entry defines a label and color used in the grid,
  // and a cost used in the shop.
  const ITEM_TYPES = {
    wall: { label: 'W', color: '#b5651d', name: 'Tường gỗ', cost: 2 },
    spike: { label: 'Sp', color: '#ff4d4d', name: 'Gai', cost: 3 },
    poison: { label: 'Po', color: '#32cd32', name: 'Độc', cost: 5 },
    skeleton: { label: 'Sk', color: '#9ba3af', name: 'Skeleton', cost: 5 },
    // New zombie monster: a tougher undead that moves like skeletons but cannot break walls
    zombie: { label: 'Zo', color: '#7fba1e', name: 'Zombie', cost: 7 }
  ,
    stoneWall: { label: 'S', color: '#888888', name: 'Tường đá', cost: 6 },
    ironWall: { label: 'I', color: '#aaaaaa', name: 'Tường sắt', cost: 10 }
  };
  // Template hero used for invading heroes; each level spawns additional heroes.
  const HERO_TEMPLATE = {
    className: 'Warrior',
    hp: 10,
    attack: 2,
    speed: 3
  ,
    stoneWall: { label: 'S', color: '#888888', name: 'Tường đá', cost: 6 },
    ironWall: { label: 'I', color: '#aaaaaa', name: 'Tường sắt', cost: 10 }
  };
  // Template for the stronger great knight heroes. These appear with a chance after round 5.
  // Adjusted stats according to requirements: increased HP and attack, speed unchanged.
  const GREAT_HERO_TEMPLATE = {
    className: 'GreatKnight',
    hp: 30,
    attack: 6,
    speed: 3
  ,
    stoneWall: { label: 'S', color: '#888888', name: 'Tường đá', cost: 6 },
    ironWall: { label: 'I', color: '#aaaaaa', name: 'Tường sắt', cost: 10 }
  };

  /**
   * Get a random integer between min and max inclusive.
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Return a human-friendly label for a hero. If includeId is true, append the hero's id.
   * Normal heroes are called "Hiệp sĩ" and great heroes are "Đại hiệp sĩ".
   * @param {object} hero
   * @param {boolean} includeId
   * @returns {string}
   */
  function heroLabel(hero, includeId = true) {
    const base = hero.type === 'great' ? 'Đại hiệp sĩ' : 'Hiệp sĩ';
    return includeId ? `${base} ${hero.id}` : base;
  }
  // Player classes with base stats. Currently only Berserker is available.
  const PLAYER_CLASSES = {
    berserker: { attack: 5, hp: 3 },
    builder: { attack: 1, hp: 3 }
  ,
    stoneWall: { label: 'S', color: '#888888', name: 'Tường đá', cost: 6 },
    ironWall: { label: 'I', color: '#aaaaaa', name: 'Tường sắt', cost: 10 }
  };
  // Cost to buy an additional skill in the shop
  const SKILL_COST = 20;

  



/*=== State ===*/
  // Global game state object. It is persisted into localStorage on every state change.
  let state = { awaitingBuilderFix: false,
    phase: 'landing', // one of: landing, character, preparation, defense, boss, shop, gameover
    level: 1,
    character: null, // { name, class, attack, hp, maxHp }
    grid: [], // array of cells { x, y }
    door: null, // { x, y }
    exit: null, // { x, y }
    inventory: {}, // counts of items { wall: n, spike: n, poison: n, skeleton: n }
    gold: 0,
    obstacles: [], // list of walls { x, y }
    traps: [], // list of traps { x, y, type } where type is 'spike' or 'poison'
    monsters: [], // list of monsters { x, y, type, hp, attack, speed }
    heroes: [], // list of heroes currently in the dungeon { id, x, y, hp, attack, speed, poison }
    bossQueue: [], // heroes that reached exit awaiting boss fight
    logs: []
    // Flags for skills and turn management
    ,skillUsedThisTurn: false
    ,awaitingTargetSkill2: false
    ,playerAp: 0
    // Currently dragged/selected placed item for repositioning during preparation phase
    ,selectedPlacedItem: null
    // Number of heroes to spawn each wave. Increases randomly every few rounds.
    ,heroesPerWave: 1
    // Counter tracking how many rounds until heroesPerWave should increase.
    ,heroIncreaseCounter: 0
    // Total heroes spawned in the current wave (used for rewards and logs)
    ,totalHeroesThisWave: 0
  ,
    stoneWall: { label: 'S', color: '#888888', name: 'Tường đá', cost: 6 },
    ironWall: { label: 'I', color: '#aaaaaa', name: 'Tường sắt', cost: 10 }
  };

  // The currently selected item type from the inventory during preparation. Used for click-to-place.
  let selectedItemType = null;

  /*=== DOM references ===*/
  const yearSpan = document.getElementById('year');
  const landingSection = document.getElementById('landing');
  const startBtn = document.getElementById('btn-start-game');
  const continueBtn = document.getElementById('btn-continue-game');
  const openSettingsBtn = document.getElementById('btn-open-settings');
  const characterPanel = document.getElementById('character-panel');
  const charNameInput = document.getElementById('char-name');
  const charClassSelect = document.getElementById('char-class');
  const createCharBtn = document.getElementById('btn-create-character');
  const gameSection = document.getElementById('game-section');
  const phaseInfo = document.getElementById('phase-info');
  const gridContainer = document.getElementById('grid-container');
  const inventoryBar = document.getElementById('inventory-bar');
  const variantBar = document.getElementById('variant-bar');
  const controlsDiv = document.getElementById('controls');
  const logDiv = document.getElementById('log');
  const bossPanel = document.getElementById('boss-panel');
  const bossInfoDiv = document.getElementById('boss-info');
  const attackBossBtn = document.getElementById('btn-attack-boss');
  const shopPanel = document.getElementById('shop-panel');
  const shopInfoDiv = document.getElementById('shop-info');
  const shopItemsDiv = document.getElementById('shop-items');
  const nextLevelBtn = document.getElementById('btn-next-level');
  const settingsPanel = document.getElementById('settings-panel');
  const closeSettingsBtn = document.getElementById('btn-close-settings');

  // Level up and gameover panels
  const levelUpPanel = document.getElementById('level-up-panel');
  const statPointsSpan = document.getElementById('stat-points');
  const statAtkValue = document.getElementById('stat-atk-value');
  const statHpValue = document.getElementById('stat-hp-value');
  const statSpeedValue = document.getElementById('stat-speed-value');
  const btnStatAtk = document.getElementById('btn-stat-atk');
  const btnStatHp = document.getElementById('btn-stat-hp');
  const btnStatSpeed = document.getElementById('btn-stat-speed');
  const btnConfirmStats = document.getElementById('btn-confirm-stats');
  const gameoverPanel = document.getElementById('gameover-panel');
  const btnRestart = document.getElementById('btn-restart');

  /*=== Utility functions ===*/
  /**
   * Save the current state to localStorage.
   */
  function saveGame() {
    try {
      const data = JSON.stringify(state);
      localStorage.setItem('dungeonGame', data);
    } catch (e) {
      console.warn('Failed to save game state:', e);
    }
  }

  /**
   * Load saved state from localStorage. Returns true if loaded successfully.
   */
  function loadGame() {
    const data = localStorage.getItem('dungeonGame');
    if (!data) return false;
    try {
      const loaded = JSON.parse(data);
      if (loaded && loaded.phase) {
        state = loaded;
        return true;
      }
    } catch (_) {
      // ignore
    }
    return false;
  }

  /**
   * Clear the saved game from localStorage.
   */
  function clearSavedGame() {
    localStorage.removeItem('dungeonGame');
  }

  /**
   * Add a log entry and update the log view.
   * @param {string} msg
   */
  function addLog(msg) {
    state.logs.push(msg);
    renderLog();
    saveGame();
  }

  /**
   * Get the cell object at the given coordinates.
   * @param {number} x
   * @param {number} y
   */
  function getCell(x, y) {
    return state.grid.find(c => c.x === x && c.y === y);
  }

  /**
   * Find path from (sx,sy) to (tx,ty) using BFS ignoring obstacles and monsters.
   * If a path exists, returns an array of cells from start to target inclusive.
   * If no path, returns null.
   */
  function findPathIgnoringWalls(sx, sy, tx, ty) {
    const directions = [
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 }
    ];
    const visited = Array(GRID_SIZE)
      .fill(null)
      .map(() => Array(GRID_SIZE).fill(false));
    const parent = {};
    const queue = [];
    queue.push({ x: sx, y: sy });
    visited[sy][sx] = true;
    while (queue.length) {
      const current = queue.shift();
      if (current.x === tx && current.y === ty) {
        // reconstruct path
        const path = [];
        let key = `${current.x},${current.y}`;
        while (key) {
          const [cx, cy] = key.split(',').map(Number);
          path.unshift({ x: cx, y: cy });
          key = parent[key];
        }
        return path;
      }
      for (const dir of directions) {
        const nx = current.x + dir.dx;
        const ny = current.y + dir.dy;
        // Only consider neighbor if it exists in the current map
        if (
          nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE &&
          !visited[ny][nx] &&
          cellExists(nx, ny)
        ) {
          // consider cell blocked if it's a wall
          const isWall = state.obstacles.some(o => o.x === nx && o.y === ny);
          if (!isWall) {
            visited[ny][nx] = true;
            parent[`${nx},${ny}`] = `${current.x},${current.y}`;
            queue.push({ x: nx, y: ny });
          }
        }
      }
    }
    return null;
  }

  /**
   * Find a path for a monster from (sx, sy) to (tx, ty) using BFS. This path treats obstacles
   * (walls) and other monsters as impassable. Hero positions are treated as passable so that
   * monsters can move into a hero's square to attack. If no path exists, returns null.
   *
   * @param {number} sx Source x coordinate
   * @param {number} sy Source y coordinate
   * @param {number} tx Target x coordinate
   * @param {number} ty Target y coordinate
   * @param {object} movingMonster The monster we are moving (to avoid blocking itself)
   * @returns {Array|null}
   */
  function findPathForMonster(sx, sy, tx, ty, movingMonster) {
    const directions = [
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 }
    ];
    const visited = Array(GRID_SIZE)
      .fill(null)
      .map(() => Array(GRID_SIZE).fill(false));
    const parent = {};
    const queue = [];
    queue.push({ x: sx, y: sy });
    visited[sy][sx] = true;
    while (queue.length) {
      const current = queue.shift();
      if (current.x === tx && current.y === ty) {
        // reconstruct path
        const path = [];
        let key = `${current.x},${current.y}`;
        while (key) {
          const [cx, cy] = key.split(',').map(Number);
          path.unshift({ x: cx, y: cy });
          key = parent[key];
        }
        return path;
      }
      for (const dir of directions) {
        const nx = current.x + dir.dx;
        const ny = current.y + dir.dy;
        // Only consider neighbor if it exists in the current map
        if (
          nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE &&
          !visited[ny][nx] &&
          cellExists(nx, ny)
        ) {
          // skip cell if it's a wall
          const isWall = state.obstacles.some(o => o.x === nx && o.y === ny);
          if (isWall) continue;
          // skip cell if another monster (not the one we're moving) occupies it
          const otherMon = state.monsters.find(m => m !== movingMonster && m.x === nx && m.y === ny);
          if (otherMon) continue;
          visited[ny][nx] = true;
          parent[`${nx},${ny}`] = `${current.x},${current.y}`;
          queue.push({ x: nx, y: ny });
        }
      }
    }
    return null;
  }

  /**
   * Find the shortest path from a monster at (sx,sy) to any hero on the map. If multiple heroes
   * exist, the shortest path to the closest hero is returned. Returns null if there are no heroes
   * or no path exists.
   *
   * @param {number} sx
   * @param {number} sy
   * @param {object} movingMonster
   * @returns {Array|null}
   */
  function findPathToNearestHero(sx, sy, movingMonster) {
    if (!state.heroes || state.heroes.length === 0) return null;
    let bestPath = null;
    for (const hero of state.heroes) {
      const path = findPathForMonster(sx, sy, hero.x, hero.y, movingMonster);
      if (path) {
        if (!bestPath || path.length < bestPath.length) {
          bestPath = path;
        }
      }
    }
    return bestPath;
  }

  /**
   * Generate a random map shape for the dungeon. The result is an array
   * of cell objects {x,y}. Different shapes are returned on each call
   * to provide variety between levels. Shapes include a full grid,
   * a cross shape and an L-shape. Additional shapes can be added here.
   */
  function generateMap() {
    // Helper to build a list of all cells
    function allCells() {
      const cells = [];
      for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
          cells.push({ x, y });
        }
      }
      return cells;
    }
    // Cross shape: keep cells on the middle row and middle column
    function crossShape() {
      const mid = Math.floor(GRID_SIZE / 2);
      const cells = [];
      for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
          if (x === mid || y === mid) {
            cells.push({ x, y });
          }
        }
      }
      return cells;
    }
    // L-shape: keep all cells except the bottom-right quadrant
    function lShape() {
      const cells = [];
      for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
          // omit the bottom-right quadrant
          if (x < GRID_SIZE - 1 || y < GRID_SIZE - 1) {
            cells.push({ x, y });
          }
        }
      }
      return cells;
    }
    const shapes = [allCells, crossShape, lShape];
    const idx = Math.floor(Math.random() * shapes.length);
    return shapes[idx]();
  }

  /**
   * Check if a grid cell exists in the current dungeon map.
   * For maps generated by generateMap(), some coordinates may be missing.
   *
   * @param {number} x
   * @param {number} y
   * @returns {boolean}
   */
  function cellExists(x, y) {
    return state.grid.some(c => c.x === x && c.y === y);
  }

  /**
   * Generate a random integer between min and max inclusive. Used for
   * determining how many rounds before the hero count increases.
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Return the localized name for a hero based on its type. Normal knights
   * are labelled "Hiệp sĩ" and great knights are labelled "Đại hiệp sĩ".
   * Optionally include the hero's id in the label.
   * @param {object} hero
   * @param {boolean} includeId
   * @returns {string}
   */
  function heroLabel(hero, includeId = true) {
    const base = hero.type === 'great' ? 'Đại hiệp sĩ' : 'Hiệp sĩ';
    if (includeId) {
      return `${base} ${hero.id}`;
    }
    return base;
  }

  /**
   * Generate a new grid with a random shape and assign random door and exit
   * positions. Ensures door and exit are not on top of existing obstacles,
   * traps or monsters.
   */
  function generateGrid() {
    // Create a new map shape
    state.grid = generateMap();
    // pick door and exit positions that are not occupied
    function randomCell() {
      const candidates = state.grid.filter(c => {
        // cannot place door/exit on an obstacle or trap or monster
        const occupied =
          state.obstacles.some(o => o.x === c.x && o.y === c.y) ||
          state.traps.some(t => t.x === c.x && t.y === c.y) ||
          state.monsters.some(m => m.x === c.x && m.y === c.y);
        return !occupied;
      });
      if (!candidates.length) return null;
      const idx = Math.floor(Math.random() * candidates.length);
      return candidates[idx];
    }
    const doorCell = randomCell();
    let exitCell = randomCell();
    // ensure exit is not same as door
    while (exitCell && doorCell && exitCell.x === doorCell.x && exitCell.y === doorCell.y) {
      exitCell = randomCell();
    }
    state.door = doorCell ? { x: doorCell.x, y: doorCell.y } : null;
    state.exit = exitCell ? { x: exitCell.x, y: exitCell.y } : null;
    // Reduce the probability that door and exit are adjacent. If they are adjacent,
    // with 99% probability reselect exit from a non-adjacent cell. This yields ~1% chance of adjacency.
    if (state.door && state.exit) {
      const isAdjacent = Math.abs(state.door.x - state.exit.x) + Math.abs(state.door.y - state.exit.y) === 1;
      if (isAdjacent && Math.random() < 0.99) {
        // pick a new exit cell that is not the door and not adjacent to the door
        let newExit = randomCell();
        let attempts = 0;
        while (newExit && (newExit.x === state.door.x && newExit.y === state.door.y || (Math.abs(newExit.x - state.door.x) + Math.abs(newExit.y - state.door.y) === 1)) && attempts < 20) {
          newExit = randomCell();
          attempts++;
        }
        if (newExit) {
          state.exit = { x: newExit.x, y: newExit.y };
        }
      }
    }
  }

  /**
   * Render the phase indicator text.
   */
  function renderPhaseInfo() {
    let phaseText = '';
    switch (state.phase) {
      case 'preparation':
        phaseText = `Màn ${state.level} – Chuẩn bị`;
        break;
      case 'defense': {
        // Show knights remaining and player AP
        const heroCount = state.heroes ? state.heroes.length : 0;
        const apInfo = typeof state.playerAp === 'number' ? ` – AP: ${state.playerAp}` : '';
        phaseText = `Màn ${state.level} – Phòng thủ – Hiệp sĩ: ${heroCount}${apInfo}`;
        break;
      }
      case 'boss': {
        const heroCount = state.bossQueue ? state.bossQueue.length : 0;
        const apInfo = typeof state.playerAp === 'number' ? ` – AP: ${state.playerAp}` : '';
        phaseText = `Màn ${state.level} – Đối đầu hiệp sĩ – Hiệp sĩ: ${heroCount}${apInfo}`;
        break;
      }
      case 'shop':
        phaseText = `Màn ${state.level} – Mua sắm`;
        break;
      case 'character':
        phaseText = `Tạo nhân vật`;
        break;
      case 'gameover':
        phaseText = 'Thất bại';
        break;
      case 'levelup':
        phaseText = 'Tăng cấp';
        break;
      default:
        phaseText = '';
    }
    phaseInfo.textContent = phaseText;
  }

  /**
   * Render the dungeon grid into the DOM.
   */
  
  function performBuilderFixOnCell(x,y){
    if (state.playerAp <= 0) { addLog('Không đủ AP.'); state.awaitingBuilderFix = false; renderControls(); return; }
    const wall = state.obstacles.find(o => o.x === x && o.y === y);
    if (!wall) { addLog('Ô này không có tường để sửa.'); state.awaitingBuilderFix = false; return; }
    const addHp = 2 + (state.character ? state.character.attack : 1);
    wall.hp = (wall.hp || (wall.material==='stone'?4:(wall.material==='iron'?10:2))) + addHp;
    state.playerAp -= 1;
    addLog(`Sửa ${wall.material==='stone'?'tường đá':(wall.material==='iron'?'tường sắt':'tường gỗ')} tại (${x+1},${y+1}) +${addHp} HP.`);
    state.awaitingBuilderFix = false;
    renderGrid(); renderControls(); saveGame();
  }

function renderGrid() {
    // clear grid container
    gridContainer.innerHTML = '';
    for (let cell of state.grid) {
      const div = document.createElement('div');
      div.className = 'cell';
      div.dataset.x = cell.x;
      div.dataset.y = cell.y;
      // Unified click handling for placing items, picking and moving items, and targeting skill 2
      div.addEventListener('click', () => {
        const x = parseInt(div.dataset.x, 10);
        const y = parseInt(div.dataset.y, 10);
        // If awaiting target for skill 2 in defense or boss phase, perform the skill
        if (state.awaitingBuilderFix && state.phase === 'defense') { performBuilderFixOnCell(x,y); return; }
        if (state.awaitingTargetSkill2 && (state.phase === 'defense' || state.phase === 'boss')) {
          performSkill2OnCell(x, y);
          return;
        }
        // In preparation phase, handle placing from inventory or moving/swapping existing items
        if (state.phase === 'preparation') {
          // If an inventory item is selected for placement, place it
          if (selectedItemType) {
            placeItem(selectedItemType, x, y);
            return;
          }
          // If a placed item is currently picked up, move or swap it to the clicked cell
          if (state.selectedPlacedItem) {
            movePlacedItem(x, y);
            return;
          }
          // Otherwise, attempt to pick up an existing placed item (wall, trap or monster)
          const hasWall = state.obstacles.some(o => o.x === x && o.y === y);
          const hasTrap = state.traps.some(t => t.x === x && t.y === y);
          const hasMon = state.monsters.some(m => m.x === x && m.y === y);
          if (hasWall || hasTrap || hasMon) {
            pickupPlacedItem(x, y);
          }
          return;
        }
      });
      // Determine base item in cell: wall or trap
      let itemType = null;
      let itemLabel = '';
      let itemColor = '';
      // door & exit
      if (state.door && cell.x === state.door.x && cell.y === state.door.y) {
        // Use a door emoji for the entry point. This uses a neutral colour so the hero overlay remains clear.
        itemLabel = '🚪';
        itemColor = '#f5b700';
      } else if (state.exit && cell.x === state.exit.x && cell.y === state.exit.y) {
        // Use a finish flag icon for the exit.
        itemLabel = '🏁';
        itemColor = '#00b7b7';
      } else {
        // obstacle
        const obs = state.obstacles.find(o => o.x === cell.x && o.y === cell.y);
        if (obs) { itemType = 'wall'; div.classList.add('has-wall'); if (obs.material) div.classList.add(obs.material); }
        // trap
        const trap = state.traps.find(t => t.x === cell.x && t.y === cell.y);
        if (trap) {
          itemType = trap.type;
        }
        if (itemType) {
          itemLabel = ITEM_TYPES[itemType].label;
          itemColor = ITEM_TYPES[itemType].color;
        }
      }
      // Build content for cell base
      const itemSpan = document.createElement('div');
      itemSpan.className = 'item';
      if (itemLabel) {
        itemSpan.textContent = itemLabel;
        itemSpan.style.color = itemColor;
      }
      // Determine monster presence (allow multiple monsters in a cell)
      const monstersHere = state.monsters.filter(m => m.x === cell.x && m.y === cell.y);
      const monsterSpan = document.createElement('div');
      monsterSpan.className = 'monster';
      if (monstersHere.length > 0) {
        // group monsters by type
        const monGroups = {};
        for (const mon of monstersHere) {
          const key = mon.type;
          monGroups[key] = (monGroups[key] || 0) + 1;
        }
        // build spans for each monster type
        Object.keys(monGroups).forEach((type, idx) => {
          const count = monGroups[type];
          const span = document.createElement('span');
          span.textContent = `${count > 1 ? count : ''}${ITEM_TYPES[type].label}`;
          span.style.color = ITEM_TYPES[type].color;
          // Add some spacing between different monster groups
          if (idx > 0) span.style.marginLeft = '2px';
          monsterSpan.appendChild(span);
        });
        // apply movement animation using the first monster in the list
        const refMon = monstersHere[0];
        if (typeof refMon.prevX === 'number' && typeof refMon.prevY === 'number') {
          const dx = refMon.prevX - refMon.x;
          const dy = refMon.prevY - refMon.y;
          monsterSpan.style.transform = `translate(${dx * 100}%, ${dy * 100}%)`;
          requestAnimationFrame(() => {
            monsterSpan.style.transform = 'translate(0,0)';
          });
          setTimeout(() => {
            delete refMon.prevX;
            delete refMon.prevY;
          }, 300);
        }
      }
      // Determine hero presence (allow multiple heroes in a cell)
      const heroesHere = state.heroes.filter(h => h.x === cell.x && h.y === cell.y);
      const heroSpan = document.createElement('div');
      heroSpan.className = 'hero';
      if (heroesHere.length > 0) {
        // group heroes by type
        const heroGroups = {};
        for (const h of heroesHere) {
          const key = h.type === 'great' ? 'great' : 'knight';
          heroGroups[key] = (heroGroups[key] || 0) + 1;
        }
        Object.keys(heroGroups).forEach((key, idx) => {
          const count = heroGroups[key];
          const span = document.createElement('span');
          // Label: Hi for normal hiệp sĩ, ĐH for đại hiệp sĩ
          const label = key === 'great' ? 'ĐH' : 'Hi';
          span.textContent = `${count > 1 ? count : ''}${label}`;
          // Color: great knights appear golden, normal knights white
          span.style.color = key === 'great' ? '#ffd700' : '#ffa500';
          if (idx > 0) span.style.marginLeft = '2px';
          heroSpan.appendChild(span);
        });
        // apply movement animation using the first hero in the list
        const refHero = heroesHere[0];
        if (typeof refHero.prevX === 'number' && typeof refHero.prevY === 'number') {
          const dx = refHero.prevX - refHero.x;
          const dy = refHero.prevY - refHero.y;
          heroSpan.style.transform = `translate(${dx * 100}%, ${dy * 100}%)`;
          requestAnimationFrame(() => {
            heroSpan.style.transform = 'translate(0,0)';
          });
          setTimeout(() => {
            delete refHero.prevX;
            delete refHero.prevY;
          }, 300);
        }
      }
      if (itemType==='wall' && typeof obs !== 'undefined') {
        const hpBadge = document.createElement('div');
        hpBadge.className = 'hp-badge';
        const maxHP = obs.material==='stone'?4:(obs.material==='iron'?10:2);
        hpBadge.textContent = String(obs.hp ?? maxHP);
        if ((obs.hp ?? maxHP) < maxHP) div.classList.add('cracked');
        div.appendChild(hpBadge);
      }
      div.appendChild(itemSpan);
      // Append monster container on top of base
      div.appendChild(monsterSpan);
      // Append hero container on top of monster
      div.appendChild(heroSpan);
      gridContainer.appendChild(div);
    }
  }

  /**
   * Render the inventory bar. Items can be dragged onto grid cells during preparation.
   */
  
  function renderWallVariants(){
    if (!variantBar) return;
    variantBar.innerHTML = '';
    const items = [
      { key: 'wall', name: 'Tường gỗ', hp: 2, req: 0, color: ITEM_TYPES.wall.color },
      { key: 'stoneWall', name: 'Tường đá', hp: 4, req: 1, color: ITEM_TYPES.stoneWall.color },
      { key: 'ironWall', name: 'Tường sắt', hp: 10, req: 2, color: ITEM_TYPES.ironWall.color },
    ];
    items.forEach(it => {
      const div = document.createElement('div');
      div.className = 'inventory-item';
      div.style.color = it.color;
      const unlocked = (state.level >= it.req);
      if (!unlocked) div.classList.add('locked');
      div.innerHTML = `<strong>${it.name}</strong><span class="sub">HP ${it.hp} • yêu cầu Lv ${it.req}</span>`;
      div.addEventListener('click', () => {
        if (!unlocked) { addLog('Chưa mở khóa: cần Lv ' + it.req); return; }
        selectedItemType = it.key; // choose specific wall variant
        renderInventory();
      });
      variantBar.appendChild(div);
    });
  }

function renderInventory() {
    if (variantBar) variantBar.innerHTML = '';
    inventoryBar.innerHTML = '';
    const types = Object.keys(ITEM_TYPES);
    types.forEach(type => {
      const baseType = (type==='stoneWall' || type==='ironWall') ? 'wall' : type;
    const count = state.inventory[baseType] || 0;
      const itemDiv = document.createElement('div');
      itemDiv.className = 'inventory-item';
      // Highlight if currently selected
      if (selectedItemType === type) {
        itemDiv.classList.add('selected');
      }
      itemDiv.dataset.type = type;
      itemDiv.textContent = `${ITEM_TYPES[type].name} (${count})`;
      // Set text color similar to grid representation for easy recognition
      itemDiv.style.color = ITEM_TYPES[type].color;
      // Click to select/deselect item for placement
      itemDiv.addEventListener('click', () => {
        const type = itemDiv.dataset.type;
        if (type === 'wall') { renderWallVariants(); return; }
        if (selectedItemType === type) selectedItemType = null; else selectedItemType = type;
        renderInventory();
      });
      inventoryBar.appendChild(itemDiv);
    });
  }

  /**
   * Render the controls bar depending on the current phase.
   */
  function renderControls() {
    controlsDiv.innerHTML = '';
    if (state.phase === 'preparation') {
      const endPrep = document.createElement('button');
      endPrep.className = 'btn primary';
      endPrep.textContent = 'Kết thúc chuẩn bị';
      endPrep.addEventListener('click', () => {
        startDefense();
      });
      controlsDiv.appendChild(endPrep);
    } else if (state.phase === 'defense') {
      // Show next turn button
      const nextTurn = document.createElement('button');
      nextTurn.className = 'btn primary';
      nextTurn.textContent = 'Qua lượt';
      nextTurn.addEventListener('click', () => {
        runTurn();
      });
      controlsDiv.appendChild(nextTurn);
      // Show skill buttons depending on player's unlocked skills
      if (state.character && state.character.skillsUnlocked) {
        // Skill2 button (usable in defense and boss)
        if (state.character.skillsUnlocked.includes('skill2')) {
          const skillBtn2 = document.createElement('button');
          skillBtn2.className = 'btn ghost';
          skillBtn2.textContent = 'Dùng kỹ năng 2';
          skillBtn2.addEventListener('click', () => {
            prepareSkill2();
          });
          // Disable if no action points left
          skillBtn2.disabled = state.playerAp <= 0;
          controlsDiv.appendChild(skillBtn2);
        }
        // Skill3 button (heal)
        if (state.character.skillsUnlocked.includes('skill3')) {
          const skillBtn3 = document.createElement('button');
          skillBtn3.className = 'btn ghost';
          skillBtn3.textContent = 'Hồi máu';
          skillBtn3.addEventListener('click', () => {
            useSkill3();
          });
          skillBtn3.disabled = state.playerAp <= 0;
          controlsDiv.appendChild(skillBtn3);
        }
      }
    } else if (state.phase === 'boss') {
      // In boss phase, attack button is in boss panel; Add skill buttons for unlocked skills
      if (state.character && state.character.skillsUnlocked) {
        // Skill1 only usable in boss
        if (state.character.skillsUnlocked.includes('skill1')) {
          const skillBtn1 = document.createElement('button');
          skillBtn1.className = 'btn ghost';
          skillBtn1.textContent = 'Kỹ năng 1: Hiến máu';
          skillBtn1.addEventListener('click', () => {
            useSkill1();
          });
          skillBtn1.disabled = state.playerAp <= 0;
          controlsDiv.appendChild(skillBtn1);
        }
        // Skill2 usable in boss
        if (state.character.skillsUnlocked.includes('skill2')) {
          const skillBtn2 = document.createElement('button');
          skillBtn2.className = 'btn ghost';
          skillBtn2.textContent = 'Kỹ năng 2: Ném chùy';
          skillBtn2.addEventListener('click', () => {
            prepareSkill2();
          });
          skillBtn2.disabled = state.playerAp <= 0;
          controlsDiv.appendChild(skillBtn2);
        }
        // Skill3 usable in boss
        if (state.character.skillsUnlocked.includes('skill3')) {
          const skillBtn3 = document.createElement('button');
          skillBtn3.className = 'btn ghost';
          skillBtn3.textContent = 'Kỹ năng 3: Hồi máu';
          skillBtn3.addEventListener('click', () => {
            useSkill3();
          });
          skillBtn3.disabled = state.playerAp <= 0;
          controlsDiv.appendChild(skillBtn3);
        }
      }
    } else {
      // no controls in shop or gameover
    }
  }

  /**
   * Render the log messages.
   */
  function renderLog() {
    logDiv.innerHTML = '';
    const recent = state.logs.slice(-50);
    recent.forEach(msg => {
      const p = document.createElement('p');
      p.textContent = msg;
      logDiv.appendChild(p);
    });
    logDiv.scrollTop = logDiv.scrollHeight;
  }

  /**
   * Render the boss fight info panel.
   */
  function renderBoss() {
    bossInfoDiv.innerHTML = '';
    if (!state.character) return;
    if (!state.bossQueue.length) return;
    const hero = state.bossQueue[0];
    // Show hero stats and player stats
    const heroStats = document.createElement('p');
    // Show the appropriate name for the hero (Hiệp sĩ or Đại hiệp sĩ)
    heroStats.innerHTML = `<strong>${heroLabel(hero, false)}</strong>: HP ${hero.hp} | ATK ${hero.attack}`;
    const playerStats = document.createElement('p');
    // Compute effective attack for berserker: base + lost HP stats
    let atk = state.character.attack;
    if (state.character.class === 'berserker') {
      const lost = state.character.maxHp - state.character.hp;
      const bonus = Math.floor(lost / HP_STAT_VALUE);
      atk += bonus;
    }
    playerStats.innerHTML = `<strong>${state.character.name}</strong>: HP ${state.character.hp} | ATK ${atk}`;
    bossInfoDiv.appendChild(heroStats);
    bossInfoDiv.appendChild(playerStats);
  }

  /**
   * Render the shop panel: available gold and items with buy buttons.
   */
  function renderShop() {
    shopInfoDiv.textContent = `Vàng: ${state.gold}`;
    shopItemsDiv.innerHTML = '';
    Object.keys(ITEM_TYPES).forEach(type => {
      const item = ITEM_TYPES[type];
      const row = document.createElement('div');
      row.className = 'shop-item';
      const label = document.createElement('span');
      label.textContent = `${item.name} – ${item.cost} vàng`;
      const buyBtn = document.createElement('button');
      buyBtn.textContent = 'Mua';
      buyBtn.disabled = state.gold < item.cost;
      buyBtn.addEventListener('click', () => {
        if (state.gold >= item.cost) {
          state.gold -= item.cost;
          state.inventory[type] = (state.inventory[type] || 0) + 1;
          addLog(`Đã mua ${item.name}.`);
          renderShop();
          renderInventory();
          saveGame();
        }
      });
      row.appendChild(label);
      row.appendChild(buyBtn);
      shopItemsDiv.appendChild(row);
    });
    // Add skill purchasing options for Berserker: allow buying skills not yet unlocked
    if (state.character && state.character.class === 'berserker') {
      const skills = ['skill1', 'skill2', 'skill3'];
      const available = skills.filter(s => !state.character.skillsUnlocked || !state.character.skillsUnlocked.includes(s));
      available.forEach(skill => {
        const row = document.createElement('div');
        row.className = 'shop-item';
        const nameMap = { skill1: 'Kỹ năng 1', skill2: 'Kỹ năng 2', skill3: 'Kỹ năng 3' };
        const label = document.createElement('span');
        label.textContent = `${nameMap[skill]} – ${SKILL_COST} vàng`;
        const buyBtn = document.createElement('button');
        buyBtn.textContent = 'Mua';
        buyBtn.disabled = state.gold < SKILL_COST;
        buyBtn.addEventListener('click', () => {
          if (state.gold >= SKILL_COST) {
            state.gold -= SKILL_COST;
            if (!state.character.skillsUnlocked) {
              state.character.skillsUnlocked = [];
            }
            state.character.skillsUnlocked.push(skill);
            addLog(`Đã mua ${nameMap[skill]}.`);
            renderShop();
            renderControls();
            saveGame();
          }
        });
        row.appendChild(label);
        row.appendChild(buyBtn);
        shopItemsDiv.appendChild(row);
      });
    }

    // Add level-up potion based on current level (max level 3). Cost varies per level.
    if (state.character) {
      const lvl = state.character.level || 0;
      if (lvl < 3) {
        let cost = 0;
        if (lvl === 0) cost = 10;
        else if (lvl === 1) cost = 18;
        else if (lvl === 2) cost = 30;
        const row = document.createElement('div');
        row.className = 'shop-item';
        const label = document.createElement('span');
        label.textContent = `Thuốc tăng cấp (cấp ${lvl} → ${lvl + 1}) – ${cost} vàng`;
        const buyBtn = document.createElement('button');
        buyBtn.textContent = 'Mua';
        buyBtn.disabled = state.gold < cost;
        buyBtn.addEventListener('click', () => {
          if (state.gold >= cost) {
            state.gold -= cost;
            addLog(`Đã mua thuốc tăng cấp lên cấp ${lvl + 1}.`);
            // Trigger level up process
            handleLevelUp();
          }
        });
        row.appendChild(label);
        row.appendChild(buyBtn);
        shopItemsDiv.appendChild(row);
      }
    }
  }

  /**
   * Show only the specified main section and hide the rest.
   * @param {string} sectionName
   */
  function showOnly(sectionName) {
    // Hide all main panels
    landingSection.hidden = true;
    characterPanel.hidden = true;
    gameSection.hidden = true;
    bossPanel.hidden = true;
    shopPanel.hidden = true;
    settingsPanel.hidden = true;
    // Also hide overlay panels like level-up and game over when switching sections
    levelUpPanel.hidden = true;
    gameoverPanel.hidden = true;
    switch (sectionName) {
      case 'landing':
        landingSection.hidden = false;
        break;
      case 'character':
        characterPanel.hidden = false;
        break;
      case 'game':
        gameSection.hidden = false;
        break;
      case 'boss':
        bossPanel.hidden = false;
        break;
      case 'shop':
        shopPanel.hidden = false;
        break;
      case 'settings':
        settingsPanel.hidden = false;
        break;
    case 'levelup':
      levelUpPanel.hidden = false;
      break;
    case 'gameover':
      gameoverPanel.hidden = false;
      break;
    }
  }

  /**
   * Update Continue button state based on saved game existence.
   */
  function updateContinueButton() {
    const saved = localStorage.getItem('dungeonGame');
    if (saved) {
      continueBtn.disabled = false;
    } else {
      continueBtn.disabled = true;
    }
  }

  /**
   * Start a new game: go to character creation and reset state.
   */
  function startNewGame() {
    // Clear old state and saved game
    state = { awaitingBuilderFix: false,
      phase: 'character',
      level: 0,
      character: null,
      grid: [],
      door: null,
      exit: null,
      inventory: { wall: 4, spike: 2, poison: 1, skeleton: 1, zombie: 0 },
      gold: 0,
      obstacles: [],
      traps: [],
      monsters: [],
      gold: 0,
      obstacles: [],
      traps: [],
      monsters: [],
      heroes: [],
      bossQueue: [],
      logs: [],
      skillUsedThisTurn: false,
      awaitingTargetSkill2: false,
      playerAp: 0,
      selectedPlacedItem: null,
      // number of knights to spawn per wave; increases after a random number of rounds
      heroesPerWave: 1,
      // counter tracking how many more rounds until hero count increases
      heroIncreaseCounter: 0
    ,
    stoneWall: { label: 'S', color: '#888888', name: 'Tường đá', cost: 6 },
    ironWall: { label: 'I', color: '#aaaaaa', name: 'Tường sắt', cost: 10 }
  };
    clearSavedGame();
    showOnly('character');
    renderPhaseInfo();
    renderLog();
    saveGame();
  }

  /**
   * Handle character creation: save chosen name and class, set base stats,
   * assign starting inventory, generate grid and enter preparation phase.
   */
  function createCharacter() {
    const name = charNameInput.value.trim() || 'Người chơi';
    const classId = charClassSelect.value;
    const classStats = PLAYER_CLASSES[classId];
    // Initialize character stats. Convert HP stat to actual HP using HP_STAT_VALUE and set base speed.
    const maxHp = classStats.hp * HP_STAT_VALUE;
    // Randomly assign one of the three Berserker skills
    const skillList = ['skill1', 'skill2', 'skill3'];
    const randSkill = classId==='builder' ? 'skill1' : skillList[Math.floor(Math.random()*skillList.length)];

      // Character level (starts at 0)
      level: 0,
      // Free stat points available for allocation when leveling up
      freePoints: 0,
      // HP stat count (each point equals HP_STAT_VALUE actual HP)
      hpStat: classStats.hp
    ,
    stoneWall: { label: 'S', color: '#888888', name: 'Tường đá', cost: 6 },
    ironWall: { label: 'I', color: '#aaaaaa', name: 'Tường sắt', cost: 10 }
  };
    // Initialize hero wave counters. Heroes start at 1 per wave and increase every 2‑5 rounds.
    state.heroesPerWave = 1;
    state.heroIncreaseCounter = randInt(2, 5);
    state.totalHeroesThisWave = 0;
    // Starting inventory for level 1
    state.inventory = { wall: 4, spike: 2, poison: 1, skeleton: 1 };
    state.gold = 0;
    // Initialize hero spawning counters: start with one knight per wave and
    // set a random counter (2–5) before the hero count increases. This
    // counter will be decremented each time a new level starts.
    state.heroesPerWave = 1;
    state.heroIncreaseCounter = randInt(2, 5);
    // Generate grid with door & exit; ensure no conflict with existing obstacles/traps/monsters
    generateGrid();
    state.phase = 'preparation';
    showOnly('game');
    renderPhaseInfo();
    renderGrid();
    renderInventory();
    renderControls();
    renderLog();
    addLog(`Nhân vật ${state.character.name} được tạo với class ${classId} và kỹ năng ${randSkill}.`);
    saveGame();
  }

  /**
   * Place an item of the given type onto the grid at (x,y).
   * Only allowed in preparation phase and if inventory contains the item.
   * @param {string} type
   * @param {number} x
   * @param {number} y
   */
  function placeItem(type, x, y) {
    if (state.phase !== 'preparation') return;
    const baseType = (type==='stoneWall' || type==='ironWall') ? 'wall' : type;
    const count = state.inventory[baseType] || 0;
    if (count <= 0) {
      addLog('Bạn không còn vật phẩm này.');
      return;
    }
    // Cannot place on door or exit
    if (
      (state.door && state.door.x === x && state.door.y === y) ||
      (state.exit && state.exit.x === x && state.exit.y === y)
    ) {
      addLog('Không thể đặt lên cửa hoặc lối ra.');
      return;
    }
    // Determine occupancy restrictions. A cell cannot contain walls or traps concurrently with anything,
    // and can hold up to 3 monsters. Walls/traps block placement; monsters can stack to a max of 3.
    const hasWall = state.obstacles.some(o => o.x === x && o.y === y);
    const hasTrap = state.traps.some(t => t.x === x && t.y === y);
    const monstersHere = state.monsters.filter(m => m.x === x && m.y === y);
    // Block placement on walls or traps
    if (hasWall || hasTrap) {
      addLog('Ô này đã có vật phẩm.');
      return;
    }
    // If placing a monster, ensure there is room (max 3)
    if ((type === 'skeleton' || type === 'zombie') && monstersHere.length >= 3) {
      addLog('Ô này đã có quá nhiều quái.');
      return;
    }
    // If placing a wall or trap, cell must not already have monsters
    if ((type === 'wall' || type === 'spike' || type === 'poison') && monstersHere.length > 0) {
      addLog('Không thể đặt tường hoặc bẫy ở ô có quái.');
      return;
    }
    // Place item
    if (type==='wall' || type==='stoneWall' || type==='ironWall') {
      const hp = (type==='stoneWall'?4:(type==='ironWall'?10:2));
      const material = (type==='stoneWall'?'stone':(type==='ironWall'?'iron':'wood'));
      state.obstacles.push({ x, y, hp, material });
    } else if (type === 'spike' || type === 'poison') {
      state.traps.push({ x, y, type });
    } else if (type === 'skeleton') {
      // Monster skeleton: HP and attack similar to hero? define HP=5, attack=2, speed=2
      state.monsters.push({ x, y, type, hp: 5, attack: 2, speed: 2 });
    } else if (type === 'zombie') {
      // Monster zombie: tougher but slower; HP=7, attack=2, speed=2
      state.monsters.push({ x, y, type, hp: 7, attack: 2, speed: 2 });
    }
    state.inventory[baseType]--;
    addLog(`Đã đặt ${ITEM_TYPES[type].name} tại ô (${x + 1},${y + 1}).`);
    renderGrid();
    renderInventory();
    saveGame();
  }

  /**
   * Pick up an already placed item from the grid during preparation.
   * Removes the item from its data structure and stores it in state.selectedPlacedItem.
   * @param {number} x
   * @param {number} y
   */
  function pickupPlacedItem(x, y) {
    if (state.phase !== 'preparation') return;
    // Cannot pick up door or exit
    if ((state.door && state.door.x === x && state.door.y === y) || (state.exit && state.exit.x === x && state.exit.y === y)) {
      return;
    }
    // Only one item can be held at a time
    if (state.selectedPlacedItem) {
      return;
    }
    // Search for wall
    let idx = state.obstacles.findIndex(o => o.x === x && o.y === y);
    if (idx >= 0) {
      const item = state.obstacles.splice(idx, 1)[0];
      // Store original coordinates on item for swap later
      item.oldX = x;
      item.oldY = y;
      state.selectedPlacedItem = { type: 'wall', item: item };
      addLog(`Đã nhấc ${ITEM_TYPES.wall.name} từ ô (${x + 1},${y + 1}).`);
      renderGrid();
      saveGame();
      return;
    }
    // Search for trap
    idx = state.traps.findIndex(t => t.x === x && t.y === y);
    if (idx >= 0) {
      const trap = state.traps.splice(idx, 1)[0];
      trap.oldX = x;
      trap.oldY = y;
      state.selectedPlacedItem = { type: trap.type, item: trap };
      addLog(`Đã nhấc ${ITEM_TYPES[trap.type].name} từ ô (${x + 1},${y + 1}).`);
      renderGrid();
      saveGame();
      return;
    }
    // Search for monster
    idx = state.monsters.findIndex(m => m.x === x && m.y === y);
    if (idx >= 0) {
      const mon = state.monsters.splice(idx, 1)[0];
      mon.oldX = x;
      mon.oldY = y;
      state.selectedPlacedItem = { type: mon.type, item: mon };
      addLog(`Đã nhấc ${ITEM_TYPES[mon.type].name} từ ô (${x + 1},${y + 1}).`);
      renderGrid();
      saveGame();
      return;
    }
  }

  /**
   * Place or swap a previously picked-up item into a new cell. If another item exists at the
   * target cell, swap their positions. After placement, the selectedPlacedItem is cleared.
   * @param {number} x
   * @param {number} y
   */
  function movePlacedItem(x, y) {
    if (!state.selectedPlacedItem) return;
    if (state.phase !== 'preparation') return;
    // Cannot place on door or exit
    if ((state.door && state.door.x === x && state.door.y === y) || (state.exit && state.exit.x === x && state.exit.y === y)) {
      addLog('Không thể đặt lên cửa hoặc lối ra.');
      return;
    }
    // Determine if target cell has existing item. We allow up to 3 monsters in a cell, but
    // walls and traps block placement. When swapping, we remove only one occupant.
    let targetType = null;
    let targetItem = null;
    // Check wall
    let idx = state.obstacles.findIndex(o => o.x === x && o.y === y);
    if (idx >= 0) {
      targetType = 'wall';
      targetItem = state.obstacles.splice(idx, 1)[0];
    }
    // Check trap
    if (!targetItem) {
      idx = state.traps.findIndex(t => t.x === x && t.y === y);
      if (idx >= 0) {
        targetType = state.traps[idx].type;
        targetItem = state.traps.splice(idx, 1)[0];
      }
    }
    // Check monster
    if (!targetItem) {
      idx = state.monsters.findIndex(m => m.x === x && m.y === y);
      if (idx >= 0) {
        targetType = state.monsters[idx].type;
        targetItem = state.monsters.splice(idx, 1)[0];
      }
    }
    // Place the selected item at target location. For monsters, ensure we don't exceed 3 in cell.
    const sel = state.selectedPlacedItem;
    // If placing a monster, check capacity
    if ((sel.type === 'skeleton' || sel.type === 'zombie')) {
      const monsAtTarget = state.monsters.filter(m => m.x === x && m.y === y);
      if (monsAtTarget.length >= 3) {
        // Cannot place; put selected item back to original cell
        addLog('Ô này đã có quá nhiều quái.');
        // Put back selected item to original location
        sel.item.x = sel.item.oldX;
        sel.item.y = sel.item.oldY;
        // Reinsert into appropriate array
        state.monsters.push(sel.item);
        state.selectedPlacedItem = null;
        renderGrid();
        saveGame();
        return;
      }
    }
    // Place selected item at new coordinates
    sel.item.x = x;
    sel.item.y = y;
    if (sel.type === 'wall') {
      state.obstacles.push(sel.item);
    } else if (sel.type === 'spike' || sel.type === 'poison') {
      state.traps.push(sel.item);
    } else if (sel.type === 'skeleton' || sel.type === 'zombie') {
      state.monsters.push(sel.item);
    }
    addLog(`Đã chuyển ${ITEM_TYPES[sel.type].name} tới ô (${x + 1},${y + 1}).`);
    // If there was an item at target, swap it back to the original location
    if (targetItem) {
      // Put the target item back to original coordinates of selected item
      const ox = sel.item.oldX;
      const oy = sel.item.oldY;
      targetItem.x = ox;
      targetItem.y = oy;
      // If swapping a monster back, ensure its type array can hold it (monsters can stack up to 3)
      if (targetType === 'wall') {
        state.obstacles.push(targetItem);
      } else if (targetType === 'spike' || targetType === 'poison') {
        state.traps.push(targetItem);
      } else {
        state.monsters.push(targetItem);
      }
      addLog(`Đã hoán đổi với ${ITEM_TYPES[targetType].name} về ô (${ox + 1},${oy + 1}).`);
    }
    // Clear selected
    state.selectedPlacedItem = null;
    // Re-render grid to reflect changes
    renderGrid();
    saveGame();
  }

  /**
   * Move to defense phase: spawn heroes and set up for turns.
   */
  function startDefense() {
    state.phase = 'defense';
    // Spawn heroes based on level
    spawnHeroes();
    // Reset player's action points based on speed
    if (state.character) {
      state.playerAp = state.character.speed;
    }
    addLog('Bắt đầu phòng thủ.');
    renderPhaseInfo();
    renderGrid();
    renderControls();
    saveGame();
  }

  /**
   * Spawn heroes at the door location. Number of heroes equals current level.
   */
  function spawnHeroes() {
    // Determine how many knights to spawn this wave. Use heroesPerWave if defined; fallback to level.
    const count = state.heroesPerWave || state.level;
    state.heroes = [];
    // Remember how many heroes were spawned this wave for reward calculation
    state.totalHeroesThisWave = count;
    for (let i = 0; i < count; i++) {
      if (!state.door) continue;
      // Determine whether this hero should be a great knight based on round and probability
      let type = 'knight';
      let template = HERO_TEMPLATE;
      // Starting from round 5, each spawned hero has 40% chance to become a great knight
      if (state.level >= 5 && Math.random() < 0.4) {
        type = 'great';
        template = GREAT_HERO_TEMPLATE;
      }
      const hero = {
        id: i + 1,
        type: type,
        x: state.door.x,
        y: state.door.y,
        hp: template.hp,
        attack: template.attack,
        speed: template.speed,
        poison: 0
      ,
    stoneWall: { label: 'S', color: '#888888', name: 'Tường đá', cost: 6 },
    ironWall: { label: 'I', color: '#aaaaaa', name: 'Tường sắt', cost: 10 }
  };
      // Set previous coordinates equal to current so the first move animates from the door
      hero.prevX = hero.x;
      hero.prevY = hero.y;
      state.heroes.push(hero);
    }
  }

  /**
   * Process a single hero's actions during a turn. Returns true if hero remains alive and not in boss queue.
   * @param {object} hero
   */
  function processHeroActions(hero) {
    let ap = hero.speed;
    // Each point of poison subtracts 1 HP at start of turn
    if (hero.poison > 0) {
      hero.hp -= 1;
      hero.poison--;
      addLog(`${heroLabel(hero)} bị độc, mất 1 HP (còn ${hero.hp}).`);
      if (hero.hp <= 0) {
        addLog(`${heroLabel(hero)} đã gục do độc.`);
        return false;
      }
    }
    while (ap > 0) {
      // Check if reached exit
      if (state.exit && hero.x === state.exit.x && hero.y === state.exit.y) {
        // Move to boss queue
        addLog(`${heroLabel(hero)} đã tìm thấy lối ra!`);
        state.bossQueue.push({
          id: hero.id,
          hp: hero.hp,
          attack: hero.attack,
          speed: hero.speed
        });
        return false; // remove from heroes array
      }
      // Determine next move
      const path = findPathIgnoringWalls(hero.x, hero.y, state.exit.x, state.exit.y);
      if (!path || path.length < 2) {
        // No path; attempt to break a wall adjacent
        const neighbors = [
          { x: hero.x + 1, y: hero.y },
          { x: hero.x - 1, y: hero.y },
          { x: hero.x, y: hero.y + 1 },
          { x: hero.x, y: hero.y - 1 }
        ];
        const wall = neighbors.find(n => state.obstacles.some(o => o.x === n.x && o.y === n.y));
        if (wall) {
          const wObj = state.obstacles.find(o => o.x === wall.x && o.y === wall.y);
          if (wObj) {
            wObj.hp = (wObj.hp || (wObj.material==='stone'?4:(wObj.material==='iron'?10:2))) - 1;
            const matName = wObj.material==='stone'?'tường đá':(wObj.material==='iron'?'tường sắt':'tường gỗ');
            addLog(`${heroLabel(hero)} chém ${matName} tại (${wall.x + 1},${wall.y + 1}), còn ${wObj.hp} HP.`);
            if (wObj.hp <= 0) {
              state.obstacles = state.obstacles.filter(o => !(o.x === wall.x && o.y === wall.y));
              addLog(`Tường bị phá hủy.`);
            }
          }
          ap -= 2; if (ap < 0) ap = 0; continue;
        } else {
          // Stuck and cannot move
          addLog(`${heroLabel(hero)} không thể tìm đường.`);
          break;
        }
      } else {
        // Move to next cell in path
        const nextCell = path[1];
        hero.x = nextCell.x;
        hero.y = nextCell.y;
        addLog(`${heroLabel(hero)} di chuyển đến (${hero.x + 1},${hero.y + 1}).`);
        ap--;
        // Check trap
        const trapIndex = state.traps.findIndex(t => t.x === hero.x && t.y === hero.y);
        if (trapIndex >= 0) {
          const trap = state.traps[trapIndex];
          if (trap.type === 'spike') {
            hero.hp -= 3;
            addLog(`${heroLabel(hero)} dẫm gai và mất 3 HP (còn ${hero.hp}).`);
            // animate damage on trap
            animateDamage(hero.x, hero.y, 3);
          } else if (trap.type === 'poison') {
            hero.hp -= 1;
            hero.poison += 3; // poison effect lasts 3 turns
            addLog(`${heroLabel(hero)} trúng độc! HP còn ${hero.hp}, sẽ mất HP trong 3 lượt.`);
            animateDamage(hero.x, hero.y, 1);
          }
          // Remove trap after activation
          state.traps.splice(trapIndex, 1);
          if (hero.hp <= 0) {
          addLog(`${heroLabel(hero)} đã chết vì bẫy.`);
            return false;
          }
        }
        // Check monster
        const monIndex = state.monsters.findIndex(m => m.x === hero.x && m.y === hero.y);
        if (monIndex >= 0) {
          const mon = state.monsters[monIndex];
          // Fight: both lose HP
          hero.hp -= mon.attack;
          mon.hp -= hero.attack;
          addLog(`${heroLabel(hero)} chiến đấu với ${ITEM_TYPES[mon.type].name}.`);
          // Animate bump and damage text for both participants
          animateBump(hero.x, hero.y);
          // Damage inflicted on monster by hero
          animateDamage(hero.x, hero.y, hero.attack);
          // Damage inflicted on hero by monster
          animateDamage(hero.x, hero.y, mon.attack);
          if (mon.hp <= 0) {
            addLog(`${ITEM_TYPES[mon.type].name} bị tiêu diệt.`);
            state.monsters.splice(monIndex, 1);
            // award gold? not yet; reward happens at hero death maybe
          }
          if (hero.hp <= 0) {
          addLog(`${heroLabel(hero)} đã bị giết bởi quái.`);
            return false;
          }
          // stop hero's turn after fight
          break;
        }
      }
    }
    // End of hero's AP loop
    return true;
  }

  /**
   * Process a single monster's actions during a turn. Monsters attempt to move towards the nearest
   * hero and attack them. Monsters cannot break walls and will not move if no path exists.
   * Returns true if the monster remains alive after its actions.
   *
   * @param {object} monster
   * @returns {boolean}
   */
  function processMonsterActions(monster) {
    let ap = monster.speed;
    // Loop until we exhaust action points or no heroes remain
    while (ap > 0) {
      if (!state.heroes || state.heroes.length === 0) {
        break;
      }
      // Find path to the nearest hero
      const path = findPathToNearestHero(monster.x, monster.y, monster);
      if (!path || path.length < 2) {
        // No path or already adjacent; monsters do not move
        break;
      }
      // Move one step along the path
      const nextCell = path[1];
      // Set previous coordinates for animation
      monster.prevX = monster.x;
      monster.prevY = monster.y;
      monster.x = nextCell.x;
      monster.y = nextCell.y;
      ap--;
      // Check if monster stepped onto a hero; fight occurs
      const heroIndex = state.heroes.findIndex(h => h.x === monster.x && h.y === monster.y);
      if (heroIndex >= 0) {
        const hero = state.heroes[heroIndex];
        // Both parties attack
        hero.hp -= monster.attack;
        monster.hp -= hero.attack;
        addLog(`${ITEM_TYPES[monster.type].name} tấn công ${heroLabel(hero)}.`);
        // Trigger bump and damage animations
        animateBump(monster.x, monster.y);
        animateDamage(monster.x, monster.y, monster.attack);
        animateDamage(monster.x, monster.y, hero.attack);
        if (hero.hp <= 0) {
          addLog(`${heroLabel(hero)} đã bị giết bởi ${ITEM_TYPES[monster.type].name}.`);
          state.heroes.splice(heroIndex, 1);
        }
        if (monster.hp <= 0) {
          addLog(`${ITEM_TYPES[monster.type].name} đã bị giết bởi ${heroLabel(hero)}.`);
          return false;
        }
        // Stop monster's remaining actions after a fight
        break;
      }
    }
    return true;
  }

  /**
   * Run the current turn: each hero acts; then check end conditions.
   */
  function runTurn() {
    if (state.phase !== 'defense') return;
    addLog('--- Bắt đầu lượt mới ---');
    // Reset skill flags and action points at start of turn
    state.skillUsedThisTurn = false;
    state.awaitingTargetSkill2 = false;
    // Reset player's action points based on current speed
    if (state.character) {
      state.playerAp = state.character.speed;
    }
    // Store previous coordinates for movement animation
    for (const hero of state.heroes) {
      hero.prevX = hero.x;
      hero.prevY = hero.y;
    }
    // Copy heroes array to iterate; we will remove heroes that die or exit
    const remaining = [];
    for (const hero of state.heroes) {
      const alive = processHeroActions(hero);
      if (alive) {
        remaining.push(hero);
      }
    }
    state.heroes = remaining;
    // Award gold for defeated knights that did not reach the boss queue; each knight yields 5 gold
    const totalThisWave = state.totalHeroesThisWave || state.level;
    const defeated = totalThisWave - (state.heroes.length + state.bossQueue.length);
    if (defeated > 0) {
      const reward = defeated * 5;
      state.gold += reward;
      addLog(`Nhận ${reward} vàng từ việc tiêu diệt hiệp sĩ.`);
    }
    /*
     * After heroes have acted and we have updated the state, process monster actions. Monsters
     * attempt to move toward the nearest hero and attack them. Record previous positions for
     * movement animations before moving. Any monsters killed in the process are removed.
     */
    // Store previous coordinates for monsters for animations
    for (const mon of state.monsters) {
      mon.prevX = mon.x;
      mon.prevY = mon.y;
    }
    const remainingMonsters = [];
    for (const mon of state.monsters) {
      const alive = processMonsterActions(mon);
      if (alive) {
        remainingMonsters.push(mon);
      }
    }
    state.monsters = remainingMonsters;
    // After monsters act, check if any heroes remain. If none, decide next phase.
    if (state.heroes.length === 0) {
      if (state.bossQueue.length > 0) {
        goToBoss();
      } else {
        goToShop();
      }
    }
    // Update UI for new turn
    renderGrid();
    renderPhaseInfo();
    renderControls();
    renderLog();
    saveGame();
  }

  /**
   * Enter the boss fight phase.
   */
  function goToBoss() {
    state.phase = 'boss';
    showOnly('boss');
    renderPhaseInfo();
    renderBoss();
    attackBossBtn.disabled = false;
    saveGame();
  }

  /**
   * Perform an attack in the boss fight. Player and hero exchange damage.
   */
  function fightBoss() {
    if (state.phase !== 'boss') return;
    if (!state.bossQueue.length) return;
    const hero = state.bossQueue[0];
    // Determine player's effective attack. For berserker class, attack increases per lost HP stat.
    let playerAtk = state.character.attack;
    if (state.character.class === 'berserker') {
      // Each lost HP stat (HP_STAT_VALUE actual HP) adds 1 attack
      const lost = state.character.maxHp - state.character.hp;
      const bonus = Math.floor(lost / HP_STAT_VALUE);
      playerAtk += bonus;
    }
    // Player attacks hero
    hero.hp -= playerAtk;
    addLog(`${state.character.name} tấn công ${heroLabel(hero)}, gây ${playerAtk} sát thương.`);
    if (hero.hp <= 0) {
      addLog(`${heroLabel(hero)} bị đánh bại!`);
      state.bossQueue.shift();
      // Award gold for boss defeat? Extra reward
      state.gold += 5;
      addLog('Nhận 5 vàng từ việc đánh bại hiệp sĩ trong boss phòng.');
      if (state.bossQueue.length === 0) {
        // All heroes defeated, go to shop
        goToShop();
        return;
      }
    }
    // Hero attacks player if still alive
    if (state.phase === 'boss' && state.bossQueue.length > 0) {
      const currentHero = state.bossQueue[0];
      state.character.hp -= currentHero.attack;
      addLog(`${heroLabel(currentHero)} phản công, gây ${currentHero.attack} sát thương.`);
      if (state.character.hp <= 0) {
        state.character.hp = 0;
        addLog(`${state.character.name} đã gục ngã. Trò chơi kết thúc!`);
        // Transition to game over panel
        goToGameOver();
        return;
      }
    }
    renderBoss();
    renderLog();
    saveGame();
  }

  /**
   * Enter the shop phase.
   */
  function goToShop() {
    state.phase = 'shop';
    showOnly('shop');
    renderPhaseInfo();
    renderShop();
    saveGame();
  }

  /**
   * Start the next level: increase level, generate new grid, and return to preparation.
   */
  function nextLevel() {
    state.level++;
    // Decrement the hero increase counter. When it reaches 0, increase the
    // number of hiệp sĩ spawned per wave and reset the counter to a random
    // interval between 2 and 5 rounds. Use a fallback of 1 when
    // heroesPerWave is undefined.
    if (typeof state.heroIncreaseCounter === 'number') {
      state.heroIncreaseCounter--;
      if (state.heroIncreaseCounter <= 0) {
        // Increase the number of heroes spawned in subsequent waves. If
        // heroesPerWave is undefined (should not happen), start from 1.
        state.heroesPerWave = (state.heroesPerWave || 1) + 1;
        // Reset the counter for the next increase after a random 2–5 rounds.
        state.heroIncreaseCounter = randInt(2, 5);
      }
    }
    // Generate new grid; keep obstacles/traps/monsters that survived
    generateGrid();
    // Make sure new door/exit positions do not collide with existing items
    // (generateGrid already ensures no overlap)
    state.phase = 'preparation';
    // Spawn heroes will happen in defense phase
    showOnly('game');
    renderPhaseInfo();
    renderGrid();
    renderInventory();
    renderControls();
    renderLog();
    addLog(`Bắt đầu màn ${state.level}.`);
    saveGame();
  }

  /**
   * Handle the game over state. Show the game over panel and allow the player to restart.
   */
  function goToGameOver() {
    state.phase = 'gameover';
    showOnly('gameover');
    renderPhaseInfo();
    // Disable any further actions
    // Note: logs can still be added for end-of-game messages
    saveGame();
  }

  /**
   * Berserker Skill 1: sacrifice HP to gain attack and speed. Only usable in boss phase.
   */
  function useSkill1() {
    if (state.phase !== 'boss') {
      addLog('Kỹ năng này chỉ dùng khi đối đầu hiệp sĩ.');
      return;
    }
    // Player must have available action points
    if (state.playerAp <= 0) {
      addLog('Không còn điểm hành động.');
      return;
    }
    // Check if enough HP to sacrifice
    if (state.character.hp < HP_STAT_VALUE) {
      addLog('Không đủ HP để dùng kỹ năng này.');
      return;
    }
    // Deduct action point
    state.playerAp--;
    state.character.hp -= HP_STAT_VALUE;
    // If HP falls below or equal 0, end the game
    if (state.character.hp <= 0) {
      state.character.hp = 0;
      addLog(`${state.character.name} đã kiệt sức do hiến máu.`);
      goToGameOver();
      return;
    }
    state.character.attack += 2;
    state.character.speed += 3;
    addLog(`${state.character.name} hiến ${HP_STAT_VALUE} HP, tăng ATK +2 và tốc độ +3.`);
    // Re-render boss panel and phase info to update stats and AP
    if (state.phase === 'boss') {
      renderBoss();
      renderPhaseInfo();
    }
    saveGame();
  }

  /**
   * Berserker Skill 2: choose a cell and throw a spiked mace, dealing 70% of attack to a hero or monster in that cell.
   * This skill can be used during defense or boss phases.
   */
  function prepareSkill2() {
    if (state.phase !== 'defense' && state.phase !== 'boss') {
      addLog('Kỹ năng này chỉ dùng khi phòng thủ hoặc đối đầu.');
      return;
    }
    // Must have action points to prepare skill2
    if (state.playerAp <= 0) {
      addLog('Không còn điểm hành động.');
      return;
    }
    if (state.awaitingTargetSkill2) {
      // already awaiting; clicking again cancels
      state.awaitingTargetSkill2 = false;
      addLog('Hủy lựa chọn ô cho kỹ năng 2.');
      return;
    }
    state.awaitingTargetSkill2 = true;
    addLog('Chọn một ô để ném chùy gai.');
  }

  /**
   * Perform skill 2 on a target cell. Calculates damage based on player's effective attack.
   * @param {number} x
   * @param {number} y
   */
  function performSkill2OnCell(x, y) {
    if (!state.awaitingTargetSkill2) return;
    // Check action points before casting the skill
    if (state.playerAp <= 0) {
      addLog('Không còn điểm hành động.');
      state.awaitingTargetSkill2 = false;
      return;
    }
    // Compute player's effective attack (including berserker bonus)
    let atk = state.character.attack;
    if (state.character.class === 'berserker') {
      const lost = state.character.maxHp - state.character.hp;
      const bonus = Math.floor(lost / HP_STAT_VALUE);
      atk += bonus;
    }
    const damage = Math.floor(atk * 0.7);
    // Check hero at cell
    const heroIndex = state.heroes.findIndex(h => h.x === x && h.y === y);
    if (heroIndex >= 0) {
      const hero = state.heroes[heroIndex];
      hero.hp -= damage;
      addLog(`${state.character.name} ném chùy vào ${heroLabel(hero)}, gây ${damage} sát thương.`);
      // Animate bump and damage
      animateBump(x, y);
      animateDamage(x, y, damage);
        if (hero.hp <= 0) {
        addLog(`${heroLabel(hero)} gục ngã vì chùy gai.`);
        // remove from heroes
        state.heroes.splice(heroIndex, 1);
        // award gold
        state.gold += 5;
      }
    } else {
      // Check monster at cell
      const monIndex = state.monsters.findIndex(m => m.x === x && m.y === y);
      if (monIndex >= 0) {
        const mon = state.monsters[monIndex];
        mon.hp -= damage;
        addLog(`${state.character.name} ném chùy vào ${ITEM_TYPES[mon.type].name}, gây ${damage} sát thương.`);
        animateBump(x, y);
        animateDamage(x, y, damage);
        if (mon.hp <= 0) {
          addLog(`${ITEM_TYPES[mon.type].name} bị phá hủy bởi chùy gai.`);
          state.monsters.splice(monIndex, 1);
        }
      } else {
        addLog('Ô đã chọn không có mục tiêu.');
      }
    }
    // End targeting state and deduct action point for this skill
    state.awaitingTargetSkill2 = false;
    if (state.playerAp > 0) {
      state.playerAp--;
    }
    // Re-render grid, phase info (to update AP display) and log
    renderGrid();
    renderPhaseInfo();
    renderLog();
    saveGame();
  }

  /**
   * Berserker Skill 3: heal the player by 5 + 10% of max HP.
   * Can be used in any phase except preparation and landing.
   */
  function useSkill3() {
    if (state.phase !== 'defense' && state.phase !== 'boss' && state.phase !== 'shop') {
      addLog('Không thể dùng kỹ năng này vào lúc này.');
      return;
    }
    // Check action points for using skill 3
    if (state.playerAp <= 0) {
      addLog('Không còn điểm hành động.');
      return;
    }
    // Deduct an action point
    state.playerAp--;
    const healAmount = 5 + Math.floor(state.character.maxHp * 0.1);
    const newHp = Math.min(state.character.maxHp, state.character.hp + healAmount);
    const gained = newHp - state.character.hp;
    state.character.hp = newHp;
    addLog(`${state.character.name} hồi phục ${gained} HP.`);
    // Update boss info if applicable
    if (state.phase === 'boss') {
      renderBoss();
    }
    // Update phase info to reflect new AP
    renderPhaseInfo();
    renderLog();
    saveGame();
  }

  /**
   * Initiate level-up process by granting free stat points based on current level
   * and switching to the level up panel. Sets up UI to allocate points.
   */
  function handleLevelUp() {
    if (!state.character) return;
    // Determine free points based on level: 0→1 gives 1 point, 1→2 gives 2, 2→3 gives 3
    const lvl = state.character.level || 0;
    let points = 0;
    if (lvl === 0) points = 1;
    else if (lvl === 1) points = 2;
    else if (lvl === 2) points = 3;
    state.character.freePoints = points;
    // Display current stats in the panel
    statPointsSpan.textContent = points;
    statAtkValue.textContent = state.character.attack;
    statHpValue.textContent = state.character.hpStat;
    statSpeedValue.textContent = state.character.speed;
    // Disable confirm button until all points allocated
    btnConfirmStats.disabled = points > 0;
    // Switch to levelup phase
    state.phase = 'levelup';
    showOnly('levelup');
    renderPhaseInfo();
    saveGame();
  }

  /**
   * Allocate a single stat point to the specified attribute. Decrements free points
   * and updates the character's stats accordingly. When no points remain, enable confirm.
   * @param {'atk'|'hp'|'speed'} stat
   */
  function allocateStat(stat) {
    if (!state.character || state.character.freePoints <= 0) return;
    state.character.freePoints--;
    if (stat === 'atk') {
      state.character.attack++;
    } else if (stat === 'hp') {
      state.character.hpStat++;
      state.character.maxHp += HP_STAT_VALUE;
      state.character.hp += HP_STAT_VALUE;
    } else if (stat === 'speed') {
      state.character.speed++;
    }
    // Update displayed stats
    statPointsSpan.textContent = state.character.freePoints;
    statAtkValue.textContent = state.character.attack;
    statHpValue.textContent = state.character.hpStat;
    statSpeedValue.textContent = state.character.speed;
    // Enable confirm button when no free points remain
    btnConfirmStats.disabled = state.character.freePoints > 0;
    saveGame();
  }

  /**
   * Confirm stat allocation and increase character level. Returns to shop phase.
   */
  function confirmStats() {
    if (!state.character) return;
    // Increment character level if below max
    if (state.character.level < 3) {
      state.character.level++;
    }
    // After allocation, return to shop
    state.phase = 'shop';
    showOnly('shop');
    renderPhaseInfo();
    renderShop();
    renderInventory();
    renderControls();
    saveGame();
  }

  /**
   * Animate a bump on both the hero and monster (if present) in a cell. Applies
   * a temporary CSS class that triggers a keyframe animation defined in CSS.
   * @param {number} x
   * @param {number} y
   */
  function animateBump(x, y) {
    const cellSelector = `.cell[data-x="${x}"][data-y="${y}"]`;
    const cell = gridContainer.querySelector(cellSelector);
    if (!cell) return;
    const heroEl = cell.querySelector('.hero');
    const monsterEl = cell.querySelector('.monster');
    if (heroEl) {
      heroEl.classList.add('attack');
      setTimeout(() => heroEl.classList.remove('attack'), 300);
    }
    if (monsterEl) {
      monsterEl.classList.add('attack');
      setTimeout(() => monsterEl.classList.remove('attack'), 300);
    }
  }

  /**
   * Animate damage text and sword icon overlay on a specific cell. The overlay
   * fades and scales based on CSS animations. The damage appears using the
   * pixel font defined in CSS.
   * @param {number} x
   * @param {number} y
   * @param {number} dmg
   */
  function animateDamage(x, y, dmg) {
    const cellSelector = `.cell[data-x="${x}"][data-y="${y}"]`;
    const cell = gridContainer.querySelector(cellSelector);
    if (!cell) return;
    const overlay = document.createElement('div');
    overlay.className = 'damage-text';
    // Use a unicode sword icon followed by damage amount
    overlay.innerHTML = `<span style="margin-right:4px">🗡️</span>${dmg}`;
    cell.appendChild(overlay);
    setTimeout(() => {
      overlay.remove();
    }, 600);
  }

  /**
   * Load saved game and resume at the appropriate phase.
   */
  function continueGame() {
    if (!loadGame()) {
      addLog('Không có file lưu nào.');
      return;
    }
    // determine which panel to show based on phase
    switch (state.phase) {
      case 'preparation':
      case 'defense':
        showOnly('game');
        renderPhaseInfo();
        renderGrid();
        renderInventory();
        renderControls();
        renderLog();
        break;
      case 'boss':
        showOnly('boss');
        renderPhaseInfo();
        renderBoss();
        renderLog();
        break;
      case 'shop':
        showOnly('shop');
        renderPhaseInfo();
        renderShop();
        renderLog();
        break;
      case 'character':
        showOnly('character');
        renderPhaseInfo();
        renderLog();
        break;
      case 'gameover':
        // Show boss panel with message
        showOnly('boss');
        renderPhaseInfo();
        renderBoss();
        renderLog();
        break;
      default:
        showOnly('landing');
        break;
    }
    updateContinueButton();
  }

  /**
   * Initialize event listeners and set up the initial UI.
   */
  function init() {
    // Set year in footer
    yearSpan.textContent = new Date().getFullYear();
    // Event listeners for landing page buttons
    startBtn.addEventListener('click', () => {
      startNewGame();
    });
    continueBtn.addEventListener('click', () => {
      continueGame();
    });
    openSettingsBtn.addEventListener('click', () => {
      state.phase = 'settings';
      showOnly('settings');
      renderPhaseInfo();
    });
    // Character creation
    createCharBtn.addEventListener('click', () => {
      createCharacter();
    });
    // Some browsers or CSS stacking contexts may block click events on the create character button.
    // Add a fallback listener for mousedown to ensure the character creation is triggered on press.
    createCharBtn.addEventListener('mousedown', () => {
      createCharacter();
    });
    // Additional fallback: listen for mouseup event in case mousedown is swallowed
    createCharBtn.addEventListener('mouseup', () => {
      createCharacter();
    });

    // Fallback: attach a click listener on the character panel to catch clicks that might
    // be swallowed due to overlay issues. If the click originates from the create character
    // button or a child of it, call createCharacter(). This ensures mouse/touch interactions
    // always work even if the direct event listener is interfered with by CSS stacking.
    characterPanel.addEventListener('click', (event) => {
      // Determine the element clicked. If the target is a text node (nodeType 3), use its parent element.
      let el = event.target;
      if (el && el.nodeType === 3) {
        el = el.parentElement;
      }
      // Check if the clicked element is the create character button or inside it.
      if (el === createCharBtn || (el && el.closest && el.closest('#btn-create-character'))) {
        createCharacter();
      }
    });
    // Boss attack button
    attackBossBtn.addEventListener('click', () => {
      fightBoss();
    });
    // Shop next level
    nextLevelBtn.addEventListener('click', () => {
      nextLevel();
    });
    // Level up allocation buttons
    btnStatAtk.addEventListener('click', () => {
      allocateStat('atk');
    });
    btnStatHp.addEventListener('click', () => {
      allocateStat('hp');
    });
    btnStatSpeed.addEventListener('click', () => {
      allocateStat('speed');
    });
    btnConfirmStats.addEventListener('click', () => {
      confirmStats();
    });
    // Game over restart button
    btnRestart.addEventListener('click', () => {
      startNewGame();
    });
    // Settings close button
    closeSettingsBtn.addEventListener('click', () => {
      // Return to landing or previous phase? Go back to landing for now
      state.phase = 'landing';
      showOnly('landing');
      renderPhaseInfo();
    });
    // If URL contains ?reset, clear any saved game (useful for testing without stale state)
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.has('reset')) {
        clearSavedGame();
      }
    } catch (e) {
      // ignore
    }
    // Initialize UI based on saved game or default
    updateContinueButton();
    if (loadGame()) {
      // Immediately load game state and show appropriate panel
      continueGame();
    } else {
      // Fresh start
      showOnly('landing');
      renderPhaseInfo();
    }
  }

  // Kick off initialization
  if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
})();

// Fallbacks callable from HTML (in case listeners failed to attach)
window.__start = function(){ try { startNewGame(); } catch(e){ console.error(e); } };
window.__openSettings = function(){ try { state.phase='settings'; showOnly('settings'); renderPhaseInfo(); } catch(e){ console.error(e); } };


// Damage popup + sword icon
function spawnAttackEffect(attacker, defender, damage) {
  const gridContainer = (state && state.phase==='boss' ? document.getElementById('boss-grid') : document.querySelector('#grid')) || document.body;
  const cellSize = (state && state.phase==='boss' ? 48 : 32);
  const effect = document.createElement('div');
  effect.className = 'attack-effect';
  const icon = document.createElement('img');
  icon.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" fill="%23fff" viewBox="0 0 24 24"><path d=\"M2 21l1.5-1.5 3-3L9 19.5 7.5 21 6 22.5 4.5 21 3 22.5 2 21zm4-5.5l-1-1 9-9V2h2v4h4v2h-4.586l-9 9z\"/></svg>';
  const dmgText = document.createElement('div');
  dmgText.className = 'damage-text';
  dmgText.textContent = '-' + damage;
  effect.appendChild(icon); effect.appendChild(dmgText);
  const x = (attacker && attacker.x!=null) ? attacker.x : 0;
  const y = (attacker && attacker.y!=null) ? attacker.y : 0;
  effect.style.position = 'absolute';
  effect.style.left = (x * cellSize + cellSize/2 - 10) + 'px';
  effect.style.top = (y * cellSize + cellSize/2 - 18) + 'px';
  gridContainer.appendChild(effect);
  setTimeout(()=> effect.remove(), 800);
}

function hitstop(ms=120){
  const el = document.getElementById('boss-grid');
  if (!el) return;
  el.classList.add('hitstop');
  setTimeout(()=> el.classList.remove('hitstop'), ms);
}
function screenShake(duration=120){
  const wrap = document.getElementById('boss-wrapper') || document.getElementById('boss-panel');
  if (!wrap) return;
  wrap.style.setProperty('--shake-duration', duration+'ms');
  wrap.classList.add('shake');
  setTimeout(()=> wrap.classList.remove('shake'), duration);
}


// === Boss Battle (integrated, player is HERO) ===
const attackBossBtn = document.getElementById('btn-attack-boss');
const bossGridEl = document.getElementById('boss-grid');
const bossLogEl = document.getElementById('boss-log');
const bossApEl = document.getElementById('boss-ap');
const bossPhpEl = document.getElementById('boss-php');
const bossEhpEl = document.getElementById('boss-ehp');
const btnBossS1 = document.getElementById('btn-boss-s1');
const btnBossS2 = document.getElementById('btn-boss-s2');
const btnBossS3 = document.getElementById('btn-boss-s3');

state.battle = { size: 6, player: {x:0,y:5,hp:1,maxHp:1,atk:1,speed:4}, enemy:{x:5,y:0,hp:1,maxHp:1,atk:1,speed:3,name:'Hiệp sĩ'}, turn:'player', ap:0, maxAp:0, targeting:false };

function blog(m){ const d=document.createElement('div'); d.textContent=m; bossLogEl.appendChild(d); bossLogEl.scrollTop=bossLogEl.scrollHeight; }
function bAdj(a,b){ return Math.abs(a.x-b.x)+Math.abs(a.y-b.y)===1; }
function bHUD(){ const B=state.battle; bossApEl.textContent=B.ap+'/'+B.maxAp; bossPhpEl.textContent=B.player.hp+'/'+B.player.maxHp; bossEhpEl.textContent=B.enemy.hp+'/'+B.enemy.maxHp; const my=B.turn==='player'; [btnBossS1,btnBossS2,btnBossS3,attackBossBtn].forEach(btn=>{ if(btn) btn.disabled=!my; }); }
function bRender(){ bossGridEl.innerHTML=''; const B=state.battle,N=B.size; for(let y=0;y<N;y++){ for(let x=0;x<N;x++){ const c=document.createElement('div'); c.className='cell'; if(B.player.x===x&&B.player.y===y){c.classList.add('player'); c.textContent='P';} else if(B.enemy.x===x&&B.enemy.y===y){c.classList.add('enemy'); c.textContent='Hi';} c.addEventListener('click',()=>bClick(x,y)); bossGridEl.appendChild(c);} } bHUD(); }
function bStart(){ const B=state.battle; B.turn='player'; B.ap=B.player.speed; B.maxAp=B.player.speed; B.targeting=false; blog('Lượt của bạn.'); bRender(); }
function bEnd(){ const B=state.battle; B.turn='enemy'; B.ap=0; B.targeting=false; bRender(); setTimeout(bEnemy,350); }
function bDmgP(){ let atk=state.character.attack; if(state.character.class==='berserker'){const lost=state.character.maxHp-state.character.hp; atk+=Math.floor(lost/HP_STAT_VALUE);} return atk; }
function bClick(x,y){ const B=state.battle; if(B.turn!=='player') return; const dx=Math.abs(x-B.player.x), dy=Math.abs(y-B.player.y); if(dx+dy===1 && B.ap>=1){ const prev={x:B.player.x,y:B.player.y}; B.ap-=1; B.player.x=x; B.player.y=y; if(B.player.x===B.enemy.x && B.player.y===B.enemy.y){ const dmg=bDmgP(); B.enemy.hp=Math.max(0,B.enemy.hp-dmg); hitstop(120); screenShake(140); spawnAttackEffect(B.player,B.enemy,dmg); blog('Bạn lao tới chém '+dmg+' dmg (1 AP).'); B.player.x=prev.x; B.player.y=prev.y; if(bCheck()) return; } bRender(); return; } if(x===B.enemy.x && y===B.enemy.y && bAdj(B.player,B.enemy)){ if(B.ap>=2){ B.ap-=2; const dmg=bDmgP(); B.enemy.hp=Math.max(0,B.enemy.hp-dmg); hitstop(120); screenShake(140); spawnAttackEffect(B.player,B.enemy,dmg); blog('Bạn tấn công thường '+dmg+' dmg (2 AP).'); if(bCheck()) return; bRender(); } else blog('Không đủ AP.'); } }
function bEnemy(){ const B=state.battle; if(B.enemy.hp<=0) return; if(bAdj(B.player,B.enemy)){ state.character.hp=Math.max(0,state.character.hp-B.enemy.atk); hitstop(120); screenShake(160); spawnAttackEffect(B.enemy,B.player,B.enemy.atk); blog('Hiệp sĩ chém bạn '+B.enemy.atk+' dmg.'); if(bCheck()) return; return setTimeout(bStart,120);} let steps=B.enemy.speed; while(steps>0 && !bAdj(B.player,B.enemy)){ const dx=B.player.x-B.enemy.x, dy=B.player.y-B.enemy.y; if(Math.abs(dx)>Math.abs(dy)) B.enemy.x+=Math.sign(dx); else if(dy!==0) B.enemy.y+=Math.sign(dy); else if(dx!==0) B.enemy.x+=Math.sign(dx); steps--; } bRender(); if(bAdj(B.player,B.enemy)){ state.character.hp=Math.max(0,state.character.hp-B.enemy.atk); hitstop(120); screenShake(160); spawnAttackEffect(B.enemy,B.player,B.enemy.atk); blog('Hiệp sĩ áp sát và chém '+B.enemy.atk+' dmg.'); if(bCheck()) return; } setTimeout(bStart,120); }
function bCheck(){ const B=state.battle; if(B.enemy.hp<=0){ blog('Bạn đã hạ gục Hiệp sĩ! +5 vàng.'); state.gold+=5; state.bossQueue.shift(); if(state.bossQueue.length>0){ setupBoss(); bStart(); } else { goToShop(); } return true; } if(state.character.hp<=0){ goToGameOver(); return true; } return false; }
function setupBoss(){ const B=state.battle; if(!state.bossQueue.length) return; const h=state.bossQueue[0]; B.player.maxHp=state.character.maxHp; B.player.hp=state.character.hp; B.player.atk=bDmgP(); B.player.speed=state.character.speed; B.enemy.name=h.type==='great'?'Đại hiệp sĩ':'Hiệp sĩ'; B.enemy.maxHp=h.hp; B.enemy.hp=h.hp; B.enemy.atk=h.attack; B.enemy.speed=h.speed||3; B.player.x=0; B.player.y=B.size-1; B.enemy.x=B.size-1; B.enemy.y=0; bRender(); }
if(attackBossBtn){ attackBossBtn.textContent='Hết lượt'; attackBossBtn.addEventListener('click', ()=>{ if(state.phase==='boss') bEnd(); }); }
if(btnBossS1){ btnBossS1.addEventListener('click', ()=>{ const B=state.battle; if(B.turn!=='player' || B.ap<1) return; B.ap-=1; blog('Skill 1 (placeholder).'); bRender(); }); }
if(btnBossS2){ btnBossS2.addEventListener('click', ()=>{ const B=state.battle; if(B.turn!=='player' || B.ap<2) return; B.targeting=true; blog('Skill 2: click ô kẻ địch để dùng.'); bHUD(); }); }
if(btnBossS3){ btnBossS3.addEventListener('click', ()=>{ const B=state.battle; if(B.turn!=='player' || B.ap<2) return; B.ap-=2; const heal=10; state.character.hp=Math.min(state.character.maxHp,state.character.hp+heal); blog('Hồi '+heal+' HP.'); bRender(); }); }
const __orig_goToBoss = typeof goToBoss !== 'undefined' ? goToBoss : null;
goToBoss = function(){ if(!state.bossQueue.length){ addLog('Không có hiệp sĩ nào tới boss.'); return; } state.phase='boss'; showOnly('boss'); renderPhaseInfo(); setupBoss(); bStart(); saveGame(); };



// --- Robust kickoff (idempotent) ---
(function(){
  function __safeInit(){
    try {
      if (window.__gameInited) return;
      window.__gameInited = true;
      init();
    } catch(e){
      console.error('Init error:', e);
      // Try a second time after next tick
      setTimeout(()=>{ try{ if (!window.__gameInited2){ window.__gameInited2 = true; init(); } } catch(e2){ console.error('Init retry failed:', e2); } }, 0);
    }
  }
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    __safeInit();
  } else {
    document.addEventListener('DOMContentLoaded', __safeInit, { once: true });
  }
  window.addEventListener('load', __safeInit, { once: true });
})();

