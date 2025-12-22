
function formatTopicLabel(question) {
    const stopwords = ['what', 'is', 'the', 'are', 'info', 'about', 'for', 'details', 'of', 'in', 'on', 'how', 'to', 'can', 'you', 'tell', 'me', 'enquiry', 'check', 'where', 'when', 'who', 'which', 'do', 'does', 'located'];
    const words = question.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/);
    const keywords = words.filter(w => !stopwords.includes(w) && w.length > 2);
    const label = keywords.slice(0, 3).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    return label || "General Info";
}

// Simulate logic in chatController
const raw = "School Area";
let label = formatTopicLabel(raw).replace(/School|Montfort/gi, '').trim();
if (!label || label.length < 2) label = "Details";

console.log(`Raw: "${raw}" -> Final: "${label}"`);

if (label === "Area") console.log("✅ PASS: Stripped School.");

const raw2 = "School";
let label2 = formatTopicLabel(raw2).replace(/School|Montfort/gi, '').trim();
if (!label2 || label2.length < 2) label2 = "Details";
console.log(`Raw: "${raw2}" -> Final: "${label2}"`);

if (label2 === "Details") console.log("✅ PASS: Fallback to Details.");
