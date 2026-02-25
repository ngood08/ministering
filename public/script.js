let MASTER_BROS = [];
let MASTER_FAMS = [];

let compId = 0;
let selItem = null;
let currentPin = localStorage.getItem('ministering_pin') || '';

async function checkPin() {
    const pinInput = document.getElementById('pin-input');
    const pin = pinInput.value;
    
    try {
        const res = await fetch('/api/verify', { headers: { 'X-PIN': pin } });
        if (res.ok) {
            currentPin = pin;
            localStorage.setItem('ministering_pin', currentPin);
            document.getElementById('login-overlay').style.display = 'none';
            init(); 
        } else {
            document.getElementById('login-error').style.display = 'block';
            pinInput.value = '';
        }
    } catch(err) {
        console.error("Failed to verify PIN", err);
    }
}

async function init() {
    try {
        const res = await fetch('/api/data', { headers: { 'X-PIN': currentPin } });
        if (res.status === 401) {
            document.getElementById('login-overlay').style.display = 'flex';
            return;
        }
        const data = await res.json();
        MASTER_BROS = data.masterBros;
        MASTER_FAMS = data.masterFams;
        renderFromData(data.comps);
    } catch(err) {
        console.error("Failed to load data", err);
    }
}

async function saveToServer(auto = false) {
    const data = {};
    document.querySelectorAll('.district').forEach(d => {
        const name = d.querySelector('.dist-header').innerText;
        data[name] = [];
        d.querySelectorAll('.card').forEach(c => {
            const b = Array.from(c.querySelectorAll('.b-box .item')).map(i=>i.dataset.name);
            const f = Array.from(c.querySelectorAll('.f-box .item')).map(i=>i.dataset.name);
            if(b.length || f.length) data[name].push({brothers:b, families:f});
        });
    });
    
    try {
        const saveBtn = document.getElementById('save-btn');
        saveBtn.textContent = 'Saving...';
        
        const res = await fetch('/api/data', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-PIN': currentPin
            },
            body: JSON.stringify({ comps: data, masterBros: [...new Set(MASTER_BROS)].sort(), masterFams: [...new Set(MASTER_FAMS)].sort() })
        });
        
        if(res.ok) {
            saveBtn.textContent = auto ? 'Auto-Saved' : 'Saved!';
            saveBtn.style.background = '#27ae60';
            setTimeout(() => {
                saveBtn.textContent = 'Save Changes';
                saveBtn.style.background = '#e67e22';
            }, 2000);
        }
    } catch(err) {
        console.error("Failed to save data", err);
    }
}

function handleFileSelect(input) {
    const file = input.files[0];
    if(!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            renderFromData(data);
            saveToServer();
            input.value = ''; 
        } catch(err) {
            alert("Invalid JSON file");
        }
    };
    reader.readAsText(file);
}

function renderFromData(data) {
    const board = document.getElementById('board');
    board.innerHTML = '';
    
    const assignedSet = new Set();
    const distKeys = Object.keys(data).length > 0 ? Object.keys(data) : ["District 1 (Good)", "District 2 (Eastman)", "District 3 (Call)"];

    distKeys.forEach(name => {
        const distCol = document.createElement('div');
        distCol.className = 'district';
        distCol.innerHTML = `
            <div class="dist-header">${name}</div>
            <div class="dist-body">
                <div class="add-btn" onclick="addComp(this.parentElement)">+ Add Comp</div>
            </div>`;
        
        const body = distCol.querySelector('.dist-body');
        const btn = body.querySelector('.add-btn');

        if (data[name]) {
            data[name].forEach(c => {
                if(c.brothers) c.brothers.forEach(n => assignedSet.add(n));
                if(c.families) c.families.forEach(n => assignedSet.add(n));
                const card = createCompUI(c.brothers, c.families);
                body.insertBefore(card, btn);
            });
        }
        board.appendChild(distCol);
    });

    const pBro = document.getElementById('pool-bros');
    const pfam = document.getElementById('pool-fams');
    pBro.innerHTML = '';
    pfam.innerHTML = '';

    const uniqueBros = [...new Set(MASTER_BROS)].sort();
    const uniqueFams = [...new Set(MASTER_FAMS)].sort();

    uniqueBros.forEach(n => {
        if(!assignedSet.has(n)) pBro.appendChild(createItem(n, 'bro'));
    });
    
    uniqueFams.forEach(n => {
        if(!assignedSet.has(n)) pfam.appendChild(createItem(n, 'fam'));
    });

    const pools = [pBro, pfam];
    pools.forEach(el => {
        el.ondragover = e => e.preventDefault();
        el.ondrop = e => { e.preventDefault(); drop(el); };
        el.onclick = () => attemptMoveToBox(el);
    });

    updateCounts();
}

function downloadJSON() {
    const data = {};
    document.querySelectorAll('.district').forEach(d => {
        const name = d.querySelector('.dist-header').innerText;
        data[name] = [];
        d.querySelectorAll('.card').forEach(c => {
            const b = Array.from(c.querySelectorAll('.b-box .item')).map(i=>i.dataset.name);
            const f = Array.from(c.querySelectorAll('.f-box .item')).map(i=>i.dataset.name);
            if(b.length || f.length) data[name].push({brothers:b, families:f});
        });
    });
    const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'ministering.json';
    a.click();
}

function manualAdd(type) {
    const name = prompt(type === 'bro' ? "Enter Brother's Name:" : "Enter Household Name:");
    if(!name) return;
    
    if (type === 'bro') {
        MASTER_BROS.push(name);
        MASTER_BROS = [...new Set(MASTER_BROS)].sort();
    } else {
        MASTER_FAMS.push(name);
        MASTER_FAMS = [...new Set(MASTER_FAMS)].sort();
    }
    
    const poolId = type === 'bro' ? 'pool-bros' : 'pool-fams';
    const pool = document.getElementById(poolId);
    const searchId = type === 'bro' ? 'search-bros' : 'search-fams';
    
    const newItem = createItem(name, type);
    pool.insertBefore(newItem, pool.firstChild);
    
    document.getElementById(searchId).value = '';
    filterList(poolId, '');
    
    updateCounts();
    saveToServer(true); // Auto-save when manually adding
}

function filterList(poolId, text) {
    const term = text.toLowerCase();
    const items = document.querySelectorAll(`#${poolId} .item`);
    items.forEach(item => {
        const name = item.dataset.name.toLowerCase();
        item.style.display = name.includes(term) ? '' : 'none';
    });
}

function createItem(name, type) {
    const d = document.createElement('div');
    d.className = `item ${type}`;
    
    const nameSpan = document.createElement('span');
    nameSpan.textContent = name;
    d.appendChild(nameSpan);

    const delBtn = document.createElement('span');
    delBtn.innerHTML = '×';
    delBtn.className = 'item-del-btn';
    delBtn.title = 'Remove';
    delBtn.onclick = (e) => {
        e.stopPropagation();
        deleteItem(d, name, type);
    };
    d.appendChild(delBtn);

    d.dataset.name = name;
    d.dataset.type = type;
    d.draggable = true;
    
    d.ondragstart = (e) => { e.dataTransfer.setData('text', ''); selItem = e.target; };
    
    d.onclick = (e) => {
        e.stopPropagation();
        if (selItem && selItem !== d) {
            const parentBox = d.parentElement;
            if (parentBox.classList.contains('box')) {
                attemptMoveToBox(parentBox);
                return;
            }
        }
        if(selItem === d) deselect();
        else select(d);
    };
    return d;
}

function deleteItem(itemEl, name, type) {
    if(!confirm(`Are you sure you want to completely remove "${name}" from the system?`)) return;
    
    itemEl.remove();
    
    if (type === 'bro') {
        MASTER_BROS = MASTER_BROS.filter(b => b !== name);
    } else {
        MASTER_FAMS = MASTER_FAMS.filter(f => f !== name);
    }
    
    if (selItem === itemEl) deselect();
    updateCounts();
    saveToServer(true);
}

function createCompUI(bros = [], fams = []) {
    compId++;
    const id = `c-${compId}`;
    const card = document.createElement('div');
    card.className = 'card';
    card.id = id;
    
    card.innerHTML = `
        <div class="card-head">Comp #${compId} <span style="color:red;cursor:pointer" onclick="delComp('${id}')">×</span></div>
        <div class="lbl">Brothers</div>
        <div class="box b-box" data-type="bro"></div>
        <div class="lbl">Families</div>
        <div class="box f-box" data-type="fam"></div>
    `;

    const bBox = card.querySelector('.b-box');
    const fBox = card.querySelector('.f-box');
    
    bros.forEach(n => bBox.appendChild(createItem(n, 'bro')));
    fams.forEach(n => fBox.appendChild(createItem(n, 'fam')));

    [bBox, fBox].forEach(b => {
        b.ondragover = e => e.preventDefault();
        b.ondrop = e => { e.preventDefault(); drop(b); };
        b.onclick = () => attemptMoveToBox(b);
    });

    return card;
}

function addComp(container) {
    const comp = createCompUI();
    const btn = container.querySelector('.add-btn');
    container.insertBefore(comp, btn);
    saveToServer(true);
}

function delComp(id) {
    if(!confirm('Delete this companionship?')) return;
    const c = document.getElementById(id);
    const pBro = document.getElementById('pool-bros');
    const pFam = document.getElementById('pool-fams');
    
    Array.from(c.querySelectorAll('.item.bro')).forEach(i => pBro.insertBefore(i, pBro.firstChild));
    Array.from(c.querySelectorAll('.item.fam')).forEach(i => pFam.insertBefore(i, pFam.firstChild));
    c.remove();
    updateCounts();
    saveToServer(true);
}

function select(el) {
    if(selItem) selItem.classList.remove('selected');
    selItem = el;
    el.classList.add('selected');
    const t = el.dataset.type;
    document.querySelectorAll('.box').forEach(b => {
        if(b.dataset.type === t) b.classList.add('highlight');
        else b.classList.remove('highlight');
    });
}

function deselect() {
    if(selItem) selItem.classList.remove('selected');
    selItem = null;
    document.querySelectorAll('.box').forEach(b => b.classList.remove('highlight'));
}

function attemptMoveToBox(box) {
    if(!selItem) return;
    const itemType = selItem.dataset.type;
    const boxType = box.dataset.type;
    
    if(itemType === boxType) {
        box.appendChild(selItem);
        selItem.style.display = 'block';
        deselect();
        updateCounts();
        saveToServer(true);
    }
}

function drop(box) { attemptMoveToBox(box); }

function updateCounts() {
    document.getElementById('cnt-bros').innerText = document.getElementById('pool-bros').children.length;
    document.getElementById('cnt-fams').innerText = document.getElementById('pool-fams').children.length;
}

window.onload = async () => {
    if (currentPin) {
        try {
            const res = await fetch('/api/verify', { headers: { 'X-PIN': currentPin } });
            if (res.ok) {
                document.getElementById('login-overlay').style.display = 'none';
                init();
            } else {
                document.getElementById('login-overlay').style.display = 'flex';
            }
        } catch(e) {
            document.getElementById('login-overlay').style.display = 'flex';
        }
    } else {
        document.getElementById('login-overlay').style.display = 'flex';
    }
};