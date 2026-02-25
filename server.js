const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = process.env.DATA_DIR || __dirname;
const DATA_FILE = path.join(DATA_DIR, 'ministering_comps.json');
const MASTER_BROS_FILE = path.join(DATA_DIR, 'bros_new.json');
const MASTER_FAMS_FILE = path.join(DATA_DIR, 'fams_new.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Helper to seed initial data files if they don't exist in the data directory
const seedFile = (fileName) => {
    const src = path.join(__dirname, fileName);
    const dest = path.join(DATA_DIR, fileName);
    if (!fs.existsSync(dest) && fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
    }
};

seedFile('ministering_comps.json');
seedFile('bros_new.json');
seedFile('fams_new.json');

const PIN = process.env.PIN || '1234';

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Require PIN for all API routes
app.use('/api', (req, res, next) => {
    const providedPin = req.headers['x-pin'];
    if (providedPin === PIN) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
});

app.get('/api/verify', (req, res) => {
    res.json({ success: true });
});

app.get('/api/data', (req, res) => {
    try {
        const compsData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        const brosData = JSON.parse(fs.readFileSync(MASTER_BROS_FILE, 'utf8'));
        const famsData = JSON.parse(fs.readFileSync(MASTER_FAMS_FILE, 'utf8'));
        res.json({
            comps: compsData,
            masterBros: brosData,
            masterFams: famsData
        });
    } catch (e) {
        console.error("GET /api/data error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/data', (req, res) => {
    try {
        const newData = req.body;
        // Backup just in case
        fs.copyFileSync(DATA_FILE, DATA_FILE + '.bak');
        
        if (newData.comps) {
            fs.writeFileSync(DATA_FILE, JSON.stringify(newData.comps, null, 2));
            if (newData.masterBros) fs.writeFileSync(MASTER_BROS_FILE, JSON.stringify(newData.masterBros, null, 2));
            if (newData.masterFams) fs.writeFileSync(MASTER_FAMS_FILE, JSON.stringify(newData.masterFams, null, 2));
        } else {
            // Fallback for old save format
            fs.writeFileSync(DATA_FILE, JSON.stringify(newData, null, 2));
        }
        
        res.json({ success: true });
    } catch (e) {
        console.error("POST /api/data error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
