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

console.log('\n----------------------------------------');
if (pass) {
    console.log('🎉 ALL TESTS PASSED SUCCESSFULLY! 🎉');
    process.exit(0);
} else {
    console.log('❌ SOME TESTS FAILED! Please review the failures.');
    process.exit(1);
}
