// Unit tests for server-side name matching and synchronization logic
process.env.NODE_ENV = 'test';
const {
    normalizeName,
    normalizeFamilyName,
    parseFamilyName,
    findMatchingBrother,
    findMatchingFamily
} = require('./server.js');

let pass = true;

function assert(condition, message) {
    if (!condition) {
        console.error(`❌ FAIL: ${message}`);
        pass = false;
    } else {
        console.log(`✅ PASS: ${message}`);
    }
}

console.log('--- Running Sync Integration & Matching Tests ---\n');

// 1. Test normalizeName
assert(normalizeName('Adams, Steven') === 'adams, steven', 'normalizeName lowercase');
assert(normalizeName('Adams, Steven B.') === 'adams, steven b', 'normalizeName keeps letters, numbers, spaces, comma');

// 2. Test normalizeFamilyName
assert(normalizeFamilyName('Adams, Steven & Heidi') === 'adams, steven and heidi', 'normalizeFamilyName ampersand conversion');

// 3. Test parseFamilyName
const parsed1 = parseFamilyName('Adams, Steven & Heidi');
assert(parsed1 && parsed1.lastName === 'adams' && parsed1.firstNames.includes('steven') && parsed1.firstNames.includes('heidi'), 'parseFamilyName couple');

const parsed2 = parseFamilyName('Abegglen, Teanka');
assert(parsed2 && parsed2.lastName === 'abegglen' && parsed2.firstNames.length === 1 && parsed2.firstNames[0] === 'teanka', 'parseFamilyName single');

// 4. Test findMatchingBrother
const existingBros = new Set(['Adams, Steven', 'Ahlstrom, James']);
assert(findMatchingBrother('adams, steven', existingBros) === 'Adams, Steven', 'findMatchingBrother exact match with different casing');
assert(findMatchingBrother('Ahlstrom, James', existingBros) === 'Ahlstrom, James', 'findMatchingBrother exact match');
assert(findMatchingBrother('Unknown, Brother', existingBros) === null, 'findMatchingBrother no match returns null');

// 5. Test findMatchingFamily
const existingFams = new Set(['Abegglen, Teanka', 'Adams, Steven & Heidi', 'Alvey, Ryan & Cori']);

assert(findMatchingFamily('Adams, Steven & Heidi', existingFams) === 'Adams, Steven & Heidi', 'findMatchingFamily exact match couple');
assert(findMatchingFamily('Adams, Steven', existingFams) === 'Adams, Steven & Heidi', 'findMatchingFamily LCR has single name, local has couple');
assert(findMatchingFamily('Adams, Heidi & Steven', existingFams) === 'Adams, Steven & Heidi', 'findMatchingFamily order reversed');
assert(findMatchingFamily('Alvey, Ryan', existingFams) === 'Alvey, Ryan & Cori', 'findMatchingFamily matches Alvey');
assert(findMatchingFamily('Smith, John', existingFams) === null, 'findMatchingFamily returns null for completely unmatched names');

// 6. Test syncMinisteringData (Adding, Preserving, and Pruning)
const { syncMinisteringData } = require('./server.js');

const initialMockData = {
    comps: {
        "District 1": [
            { brothers: ["Adams, Steven"], families: ["Adams, Steven & Heidi"] }
        ]
    },
    masterBros: ["Adams, Steven", "Ahlstrom, James", "OldBrother, DeleteMe"],
    masterFams: ["Abegglen, Teanka", "Adams, Steven & Heidi", "OldFamily, DeleteMe"]
};

// Test A: Normal sync that adds new names, preserves matches, and prunes unreferenced names
const reqBodyNormal = {
    elders: [
        {
            districtName: "District 1",
            companionships: [
                {
                    ministers: [{ name: "Adams, Steven" }],
                    assignments: [{ name: "Adams, Steven & Heidi" }]
                }
            ]
        }
    ],
    ministeringData: {
        eligibleMinistersAndAssignments: {
            eligibleMinisters: [
                { name: "Adams, Steven" },
                { name: "Ahlstrom, James" },
                { name: "NewBrother, AddMe" }
            ],
            eligibleAssignments: [
                { name: "Abegglen, Teanka" },
                { name: "Adams, Steven & Heidi" },
                { name: "NewFamily, AddMe" }
            ]
        }
    }
};

try {
    const result = syncMinisteringData(initialMockData, reqBodyNormal);
    const finalData = result.finalData;
    const report = result.report;

    assert(finalData.masterBros.includes("Adams, Steven"), "Normal Sync: Preserves 'Adams, Steven'");
    assert(finalData.masterBros.includes("Ahlstrom, James"), "Normal Sync: Preserves 'Ahlstrom, James'");
    assert(finalData.masterBros.includes("NewBrother, AddMe"), "Normal Sync: Adds 'NewBrother, AddMe'");
    assert(!finalData.masterBros.includes("OldBrother, DeleteMe"), "Normal Sync: Prunes 'OldBrother, DeleteMe'");

    assert(finalData.masterFams.includes("Adams, Steven & Heidi"), "Normal Sync: Preserves 'Adams, Steven & Heidi'");
    assert(finalData.masterFams.includes("Abegglen, Teanka"), "Normal Sync: Preserves 'Abegglen, Teanka'");
    assert(finalData.masterFams.includes("NewFamily, AddMe"), "Normal Sync: Adds 'NewFamily, AddMe'");
    assert(!finalData.masterFams.includes("OldFamily, DeleteMe"), "Normal Sync: Prunes 'OldFamily, DeleteMe'");

    assert(report.addedBros.includes("NewBrother, AddMe") && report.addedBros.length === 1, "Normal Sync Report: Correctly reports 1 added brother");
    assert(report.removedBros.includes("OldBrother, DeleteMe") && report.removedBros.length === 1, "Normal Sync Report: Correctly reports 1 removed brother");
    assert(report.addedFams.includes("NewFamily, AddMe") && report.addedFams.length === 1, "Normal Sync Report: Correctly reports 1 added family");
    assert(report.removedFams.includes("OldFamily, DeleteMe") && report.removedFams.length === 1, "Normal Sync Report: Correctly reports 1 removed family");
} catch (e) {
    assert(false, `Normal sync test threw an error: ${e.message}`);
}

// Test B: Safeguard - should NOT prune if eligible list is empty or missing
const reqBodyMissingEligible = {
    elders: [
        {
            districtName: "District 1",
            companionships: [
                {
                    ministers: [{ name: "Adams, Steven" }],
                    assignments: [{ name: "Adams, Steven & Heidi" }]
                }
            ]
        }
    ]
    // ministeringData is completely missing here
};

try {
    const result = syncMinisteringData(initialMockData, reqBodyMissingEligible);
    const finalData = result.finalData;
    const report = result.report;

    assert(finalData.masterBros.includes("OldBrother, DeleteMe"), "Safeguard: Keeps 'OldBrother, DeleteMe' when eligibleMinisters is missing");
    assert(finalData.masterFams.includes("OldFamily, DeleteMe"), "Safeguard: Keeps 'OldFamily, DeleteMe' when eligibleAssignments is missing");
    assert(report.removedBros.length === 0, "Safeguard Report: 0 removed brothers");
    assert(report.removedFams.length === 0, "Safeguard Report: 0 removed families");
} catch (e) {
    assert(false, `Safeguard test threw an error: ${e.message}`);
}

console.log('\n----------------------------------------');
if (pass) {
    console.log('🎉 ALL TESTS PASSED SUCCESSFULLY! 🎉');
    process.exit(0);
} else {
    console.log('❌ SOME TESTS FAILED! Please review the failures.');
    process.exit(1);
}
