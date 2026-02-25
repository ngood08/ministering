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

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
