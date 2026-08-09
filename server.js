require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const app = express();
const PORT = process.env.PORT || 3000;
const PIN = process.env.PIN || '1234';

// Initialize Firebase Admin
let db;
try {
    let serviceAccount;
    // Check if we are passing credentials as an env variable (for production like Render)
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } else {
        // Fallback to local file for development
        serviceAccount = require('./firebase-key.json');
    }

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    db = admin.firestore();
    console.log("Firebase initialized successfully.");
} catch (error) {
    console.error("Firebase initialization failed:", error);
}

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// Require PIN for all API routes (except OPTIONS preflight)
app.use('/api', (req, res, next) => {
    if (req.method === 'OPTIONS') {
        return next();
    }
    const providedPin = req.headers['x-pin'];
    if (providedPin === PIN) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
});

// Helper to normalize strings for comparison (lowercase, alphanumeric only, trimmed)
function normalizeName(name) {
    if (!name) return '';
    return name.toLowerCase()
        .replace(/[^a-z0-9,\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// Helper to normalize family names (convert ampersand to and, lowercase, alphanumeric)
function normalizeFamilyName(name) {
    if (!name) return '';
    return name.toLowerCase()
        .replace(/&/g, 'and')
        .replace(/[^a-z0-9,\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// Helper to parse family name parts (lastName, array of firstNames)
function parseFamilyName(name) {
    if (!name) return null;
    const parts = name.split(',');
    if (parts.length < 2) return null;
    const lastName = parts[0].trim().toLowerCase();
    
    const firstNamesPart = parts[1].toLowerCase();
    const firstNames = firstNamesPart
        .replace(/&/g, ' ')
        .replace(/\band\b/g, ' ')
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .map(s => s.trim())
        .filter(s => s.length > 1);
        
    return { lastName, firstNames };
}

// Matching logic for brothers
function findMatchingBrother(lcrName, existingBros) {
    if (existingBros.has(lcrName)) return lcrName;
    
    const normalizedLcr = normalizeName(lcrName);
    for (const existing of existingBros) {
        if (normalizeName(existing) === normalizedLcr) {
            return existing;
        }
    }
    return null;
}

// Matching logic for families/households
function findMatchingFamily(lcrName, existingFams) {
    if (existingFams.has(lcrName)) return lcrName;
    
    const normalizedLcr = normalizeFamilyName(lcrName);
    for (const existing of existingFams) {
        if (normalizeFamilyName(existing) === normalizedLcr) {
            return existing;
        }
    }
    
    const lcrParts = parseFamilyName(lcrName);
    if (!lcrParts) return null;
    
    for (const existing of existingFams) {
        const existingParts = parseFamilyName(existing);
        if (!existingParts) continue;
        
        if (lcrParts.lastName === existingParts.lastName) {
            const overlap = lcrParts.firstNames.some(fn => existingParts.firstNames.includes(fn)) ||
                            existingParts.firstNames.some(fn => lcrParts.firstNames.includes(fn));
            if (overlap) {
                return existing;
            }
        }
    }
    return null;
}

app.get('/api/verify', (req, res) => {
    res.json({ success: true });
});

app.get('/api/data', async (req, res) => {
    try {
        const docRef = db.collection('ministering').doc('mainData');
        const doc = await docRef.get();
        
        let data;
        if (!doc.exists) {
            console.log("No data found in Firestore, seeding from local files...");
            const compsData = JSON.parse(fs.readFileSync(path.join(__dirname, 'ministering_comps.json'), 'utf8'));
            const brosData = JSON.parse(fs.readFileSync(path.join(__dirname, 'bros_new.json'), 'utf8'));
            const famsData = JSON.parse(fs.readFileSync(path.join(__dirname, 'fams_new.json'), 'utf8'));
            
            data = {
                comps: compsData,
                masterBros: brosData,
                masterFams: famsData
            };
            
            // Seed the database
            await docRef.set(data);
        } else {
            data = doc.data();
        }

        res.json({
            comps: data.comps || {},
            masterBros: data.masterBros || [],
            masterFams: data.masterFams || []
        });
    } catch (e) {
        console.error("GET /api/data error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/data', async (req, res) => {
    try {
        const newData = req.body;
        const docRef = db.collection('ministering').doc('mainData');
        
        if (newData.comps) {
            await docRef.set(newData, { merge: true });
        } else {
            // Fallback for older formats
            await docRef.set({ comps: newData }, { merge: true });
        }
        
        res.json({ success: true });
    } catch (e) {
        console.error("POST /api/data error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/sync', async (req, res) => {
    try {
        let elders = req.body.elders;
        let ministeringData = req.body.ministeringData;
        let debugKeys = null;

        if (ministeringData) {
            debugKeys = Object.keys(ministeringData);
            console.log("\n--- LCR SYNC DATA RECEIVED ---");
            console.log("Keys inside ministeringData:", debugKeys);
            
            // Print details of each key to see what unassigned keys exist!
            for (const key of debugKeys) {
                const value = ministeringData[key];
                if (Array.isArray(value)) {
                    console.log(`- ${key}: Array (length: ${value.length})`);
                    if (value.length > 0) {
                        console.log(`  Sample item keys for ${key}:`, Object.keys(value[0]));
                    }
                } else if (value && typeof value === 'object') {
                    console.log(`- ${key}: Object (keys: ${Object.keys(value)})`);
                } else {
                    console.log(`- ${key}: ${typeof value}`);
                }
            }
            console.log("-------------------------------\n");

            if (!elders && ministeringData.elders) {
                elders = ministeringData.elders;
            }
        }

        if (!elders || !Array.isArray(elders)) {
            return res.status(400).json({ error: 'Missing or invalid "elders" array' });
        }
        
        const docRef = db.collection('ministering').doc('mainData');
        const doc = await docRef.get();
        
        let currentData;
        if (!doc.exists) {
            console.log("No data found in Firestore, seeding from local files...");
            const compsData = JSON.parse(fs.readFileSync(path.join(__dirname, 'ministering_comps.json'), 'utf8'));
            const brosData = JSON.parse(fs.readFileSync(path.join(__dirname, 'bros_new.json'), 'utf8'));
            const famsData = JSON.parse(fs.readFileSync(path.join(__dirname, 'fams_new.json'), 'utf8'));
            
            currentData = {
                comps: compsData,
                masterBros: brosData,
                masterFams: famsData
            };
        } else {
            currentData = doc.data();
        }
        
        const existingBros = new Set(currentData.masterBros || []);
        const existingFams = new Set(currentData.masterFams || []);
        
        // 1. First, import ALL eligible ministers and assignments to our master list.
        // This ensures unassigned brothers/families are present in our roster database!
        if (ministeringData && ministeringData.eligibleMinistersAndAssignments) {
            const ema = ministeringData.eligibleMinistersAndAssignments;
            
            if (ema.eligibleMinisters && Array.isArray(ema.eligibleMinisters)) {
                console.log(`Processing ${ema.eligibleMinisters.length} eligible ministers from LCR...`);
                for (const min of ema.eligibleMinisters) {
                    const lcrName = min.name;
                    if (!lcrName) continue;
                    
                    let matchedName = findMatchingBrother(lcrName, existingBros);
                    if (!matchedName) {
                        existingBros.add(lcrName);
                    }
                }
            }
            
            if (ema.eligibleAssignments && Array.isArray(ema.eligibleAssignments)) {
                console.log(`Processing ${ema.eligibleAssignments.length} eligible assignments from LCR...`);
                for (const ass of ema.eligibleAssignments) {
                    const lcrName = ass.name;
                    if (!lcrName) continue;
                    
                    let matchedName = findMatchingFamily(lcrName, existingFams);
                    if (!matchedName) {
                        existingFams.add(lcrName);
                    }
                }
            }
        }
        
        // 2. Map companionships and match names to existing rosters
        const newComps = {};
        
        for (const dist of elders) {
            const distName = dist.districtName || "Unnamed District";
            newComps[distName] = [];
            
            for (const comp of (dist.companionships || [])) {
                const brothers = [];
                const families = [];
                
                for (const min of (comp.ministers || [])) {
                    const lcrName = min.name;
                    if (!lcrName) continue;
                    
                    let matchedName = findMatchingBrother(lcrName, existingBros);
                    if (!matchedName) {
                        matchedName = lcrName;
                        existingBros.add(lcrName);
                    }
                    brothers.push(matchedName);
                }
                
                for (const ass of (comp.assignments || [])) {
                    const lcrName = ass.name;
                    if (!lcrName) continue;
                    
                    let matchedName = findMatchingFamily(lcrName, existingFams);
                    if (!matchedName) {
                        matchedName = lcrName;
                        existingFams.add(lcrName);
                    }
                    families.push(matchedName);
                }
                
                if (brothers.length > 0 || families.length > 0) {
                    newComps[distName].push({ brothers, families });
                }
            }
        }
        
        const finalData = {
            comps: newComps,
            masterBros: Array.from(existingBros).sort(),
            masterFams: Array.from(existingFams).sort()
        };
        
        await docRef.set(finalData);
        console.log(`Successfully synced from LCR! Districts: ${Object.keys(newComps).length}, Brothers: ${existingBros.size}, Families: ${existingFams.size}`);
        
        res.json({ success: true, debugKeys });
    } catch (e) {
        console.error("POST /api/sync error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

if (process.env.NODE_ENV === 'test') {
    module.exports = {
        normalizeName,
        normalizeFamilyName,
        parseFamilyName,
        findMatchingBrother,
        findMatchingFamily
    };
}
