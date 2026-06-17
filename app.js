// --- Globala tillståndsvariabler ---
let cart = [];
let map, marker;
let registeredTrees = [];
let fieldNotes = [];
let activeSpecies = 'Tall';
let computedDgv = 18;
let computedHm = 16;
let computedStemHa = 0;
let savedLogoDataUrl = ""; 

const priceLists = {
    SCA: { timmer: 690, massa: 425 },
    Norra: { timmer: 710, massa: 440 },
    Sveaskog: { timmer: 680, massa: 415 },
    Mellanskog: { timmer: 740, massa: 460 }
};

// --- Canvas (Signatur) Variabler ---
let canvas, ctx, isDrawing = false;

document.addEventListener('DOMContentLoaded', () => {
    const dateInput = document.getElementById('kund-datum');
    if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
    
    initMap();
    initSignaturePad();
    loadSavedLogo();
    loadHistory();
    runLivePrognosis();
    
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(err => console.log("SW Error", err));
    }
});

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-tabs button').forEach(b => b.classList.remove('active'));
    
    const targetTab = document.getElementById(tabId);
    if (targetTab) targetTab.classList.add('active');
    
    if(window.event && window.event.currentTarget && window.event.currentTarget.tagName === 'BUTTON') {
        window.event.currentTarget.classList.add('active');
    }
    if(tabId === 'tab-kund' && map) {
        setTimeout(() => map.invalidateSize(), 200);
    }
}

// Helper-funktion för att säkert sätta text utan att krascha om ID saknas i HTML
function safelySetText(id, value) {
    const el = document.getElementById(id);
    if (el) {
        el.innerText = value;
    }
}

// --- GPS-FUNKTION ---
function getGPS() {
    const gpsInput = document.getElementById('kund-gps');
    const swerefInput = document.getElementById('kund-sweref');
    const fastighetInput = document.getElementById('kund-fastighet');
    
    if (!navigator.geolocation) {
        alert("Geolocation stöds inte av din webbläsare eller enhet.");
        return;
    }

    if (fastighetInput) fastighetInput.value = "Hämtar position från satellit...";

    const options = {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0
    };

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            
            if (gpsInput) gpsInput.value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
            
            const sweref = convertToSweref99TM(lat, lng);
            if (swerefInput) swerefInput.value = `N: ${sweref.N}, E: ${sweref.E}`;
            
            if (map) {
                map.setView([lat, lng], 16);
                if (marker) {
                    marker.setLatLng([lat, lng]);
                } else {
                    marker = L.marker([lat, lng], { draggable: true }).addTo(map);
                }
                if (fastighetInput && fastighetInput.value.includes("Hämtar")) {
                    fastighetInput.value = "Position lokaliserad. Ange fastighetsbeteckning.";
                }
            }
        },
        (error) => {
            console.error(error);
            if (fastighetInput) fastighetInput.value = "";
            switch(error.code) {
                case error.PERMISSION_DENIED:
                    alert("Du måste godkänna platstjänster i webbläsaren för att spåra skiftet.");
                    break;
                case error.TIMEOUT:
                    alert("Tog för lång tid att hämta GPS. Försök igen eller stå utomhus.");
                    break;
                default:
                    alert("Ett internt GPS-fel uppstod vid fältetablering.");
                    break;
            }
        },
        options
    );
}

function initMap() {
    const mapEl = document.getElementById('map');
    if (!mapEl) return;
    
    map = L.map('map').setView([62.6, 16.5], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
    }).addTo(map);

    map.on('click', (e) => {
        const lat = e.latlng.lat;
        const lng = e.latlng.lng;
        
        const gpsInput = document.getElementById('kund-gps');
        const swerefInput = document.getElementById('kund-sweref');
        
        if (gpsInput) gpsInput.value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        const sweref = convertToSweref99TM(lat, lng);
        if (swerefInput) swerefInput.value = `N: ${sweref.N}, E: ${sweref.E}`;
        
        if (marker) {
            marker.setLatLng(e.latlng);
        } else {
            marker = L.marker(e.latlng, { draggable: true }).addTo(map);
        }
    });
}

function convertToSweref99TM(lat, lng) {
    return {
        N: Math.round(6900000 + (lat - 62) * 111200), 
        E: Math.round(500000 + (lng - 15) * 53200)
    };
}

// --- Fältmätning & Provytor ---
function setActiveSpecies(species) {
    activeSpecies = species;
    document.querySelectorAll('.species-btn').forEach(b => b.classList.remove('active-tall', 'active-gran', 'active-lov'));
    const btn = document.getElementById(`s-btn-${species}`);
    if (btn) {
        if(species === 'Tall') btn.classList.add('active-tall');
        if(species === 'Gran') btn.classList.add('active-gran');
        if(species === 'Lov') btn.classList.add('active-lov');
    }
}

function setFieldVal(type, val) {
    const el = document.getElementById(`field-${type}`);
    if (el) el.value = val;
}

function addHalfVal(type) {
    const el = document.getElementById(`field-${type}`);
    if (el) el.value = (parseFloat(el.value) || 0) + 0.5;
}

function addTreeRecord() {
    const dInput = document.getElementById('field-d');
    const hInput = document.getElementById('field-h');
    
    const d = dInput ? (parseFloat(dInput.value) || 0) : 0;
    const h = hInput ? (parseFloat(hInput.value) || 0) : 0;
    
    registeredTrees.push({ species: activeSpecies, d, h });
    
    const display = document.getElementById('tree-list-display');
    if (display) {
        display.innerHTML = registeredTrees.map((t, idx) => `#${idx+1}: [${t.species}] d:${t.d}cm h:${t.h}m`).join('<br>');
    }
}

function clearTreeRecords() {
    registeredTrees = [];
    const display = document.getElementById('tree-list-display');
    if (display) display.innerText = "Inga stammar registrerade än.";
}

function calculateFieldMetrics() {
    if(registeredTrees.length === 0) {
        alert("Registrera minst ett träd först!");
        return;
    }
    let sumG = 0, sumGD = 0, sumH = 0;
    registeredTrees.forEach(t => {
        const g = Math.PI * Math.pow(t.d / 200, 2);
        sumG += g;
        sumGD += g * t.d;
        sumH += t.h;
    });
    
    computedDgv = sumG > 0 ? sumGD / sumG : 0;
    computedHm = sumH / registeredTrees.length;
    
    const radiusInput = document.getElementById('field-radius');
    const radius = radiusInput ? (parseFloat(radiusInput.value) || 0) : 0;
    const factor = radius > 0 ? (10000 / (Math.PI * Math.pow(radius, 2))) : 0;
    computedStemHa = Math.round(registeredTrees.length * factor);
    
    safelySetText('res-dgv', computedDgv.toFixed(1));
    safelySetText('res-hm', computedHm.toFixed(1));
    safelySetText('res-stem-ha', computedStemHa);
}

function transferMetricsToGallring() {
    const galD = document.getElementById('gal-d');
    const galHojd = document.getElementById('gal-hojd');
    if (galD) galD.value = computedDgv.toFixed(1);
    if (galHojd) galHojd.value = computedHm.toFixed(1);
    switchTab('tab-gallring');
    runLivePrognosis();
}

// --- Kalkyl & Gallringsfunktioner ---
function updateTimmerLabels() {
    const pctInput = document.getElementById('gal-timmer-pct');
    const tPct = pctInput ? parseInt(pctInput.value) : 0;
    safelySetText('lbl-timmer-pct', tPct + '%');
    safelySetText('lbl-massa-pct', (100 - tPct) + '%');
    runLivePrognosis();
}

function runLivePrognosis() {
    const getValue = (id) => parseFloat(document.getElementById(id)?.value) || 0;
    
    const areal = getValue('gal-areal');
    const gy = getValue('gal-gy');
    const hojd = getValue('gal-hojd');
    const uttag = getValue('gal-uttag');
    const tPct = parseInt(document.getElementById('gal-timmer-pct')?.value) || 0;
    
    const pTimmer = getValue('cfg-pris-timmer');
    const pMassa = getValue('cfg-pris-massa');
    
    let f = 0.45;
    const species = document.getElementById('gal-tradslag')?.value;
    if(species === 'Gran') f = 0.50;
    if(species === 'Tall') f = 0.44;
    
    const totVol = gy * hojd * f * areal;
    const outVol = totVol * (uttag / 100);
    const vTimmer = outVol * (tPct / 100);
    const vMassa = outVol * ((100 - tPct) / 100);
    
    const bearing = document.getElementById('gal-bearing')?.value;
    const alertBox = document.getElementById('terrain-alert');
    if(alertBox) {
        if(bearing === 'Låg') {
            alertBox.style.display = 'block';
            alertBox.innerText = "⚠️ OBS: Svag bärighet. Körskaderisk identifierad! Kräver risning eller vinteravverkning.";
        } else {
            alertBox.style.display = 'none';
        }
    }
    
    const netto = (vTimmer * pTimmer) + (vMassa * pMassa);
    
    safelySetText('prog-tot-vol', Math.round(totVol));
    safelySetText('prog-out-vol', Math.round(outVol));
    safelySetText('prog-out-timmer', Math.round(vTimmer));
    safelySetText('prog-out-massa', Math.round(vMassa));
    safelySetText('prog-netto', Math.round(netto).toLocaleString('sv-SE'));
    
    return { totVol, outVol, vTimmer, vMassa, netto };
}

function syncCompanyPrices(key) {
    if(priceLists[key]) {
        const compSync = document.getElementById('gal-company-sync');
        const cfgSkogs = document.getElementById('cfg-skogsbolag');
        const cfgTimmer = document.getElementById('cfg-pris-timmer');
        const cfgMassa = document.getElementById('cfg-pris-massa');
        
        if (compSync) compSync.value = key;
        if (cfgSkogs) cfgSkogs.value = key;
        if (cfgTimmer) cfgTimmer.value = priceLists[key].timmer;
        if (cfgMassa) cfgMassa.value = priceLists[key].massa;
        runLivePrognosis();
    }
}

// --- Kalkylvagnshantering (Cart) ---
function addRojningToCart() {
    const ar = parseFloat(document.getElementById('roj-areal')?.value) || 0;
    const h = document.getElementById('roj-hojd')?.value || "0";
    const p = parseFloat(document.getElementById('cfg-roj-timme')?.value) || 0;
    const cost = ar * 8 * p;
    
    cart.push({ type: 'Röjning', desc: `Ungskogsröjning, medelhöjd ${h}m`, area: ar, rate: `${p} kr/h (Est. 8h/ha)`, amount: Math.abs(cost) });
    updateCartUI();
}

function addGallringToCart() {
    const data = runLivePrognosis();
    const ar = parseFloat(document.getElementById('gal-areal')?.value) || 0;
    const sp = document.getElementById('gal-tradslag')?.value || "Tall";
    cart.push({ type: 'Gallring', desc: `Avverkning/Gallring (${sp}) - Uttag på ${Math.round(data.outVol)} m³fub`, area: ar, rate: 'Virkesnetto', amount: Math.abs(data.netto) });
    updateCartUI();
}

function addPlanteringToCart() {
    const ar = parseFloat(document.getElementById('plan-areal')?.value) || 0;
    const t = parseInt(document.getElementById('plan-tathet')?.value) || 0;
    const pPlanta = parseFloat(document.getElementById('cfg-planta')?.value) || 0;
    const incMb = document.getElementById('plan-mb')?.checked;
    const cMb = parseFloat(document.getElementById('cfg-mb-ha')?.value) || 0;
    
    let cost = ar * t * pPlanta;
    let desc = `Plantering (${t} st/ha, á ${pPlanta}kr)`;
    if(incMb) {
        cost += (ar * cMb);
        desc += ` inkl. maskinell markberedning`;
    }
    
    cart.push({ type: 'Plantering', desc: desc, area: ar, rate: 'Löpande taxa', amount: Math.abs(cost) });
    updateCartUI();
}

function updateCartUI() {
    safelySetText('cart-count', cart.length);
    const container = document.getElementById('cart-items-container');
    if(!container) return;
    
    if(cart.length === 0) {
        container.innerText = "Kalkylen är tom.";
        safelySetText('cart-total', "Totalt exkl. moms: 0 kr");
        return;
    }
    
    let total = 0;
    const calcMode = document.getElementById('calc-mode')?.value || "netto";
    
    container.innerHTML = cart.map((item, idx) => {
        const rawAmount = Math.abs(item.amount); 
        const isExpense = (item.type === 'Röjning' || item.type === 'Plantering');
        
        if (isExpense) {
            total -= rawAmount;
        } else {
            total += rawAmount;
        }
        
        const color = isExpense ? "red" : "green";
        const prefix = isExpense ? "-" : "+";
        
        return `<div class="cart-item">
            <div><strong>${item.type}</strong> - ${item.desc} (${item.area} ha)</div>
            <div style="color:${color}; font-weight:bold;">${prefix}${Math.round(rawAmount).toLocaleString('sv-SE')} kr 
            <button class="btn btn-danger" style="width:auto; padding:2px 6px; font-size:0.75rem; margin-left:10px;" onclick="removeItem(${idx})">X</button></div>
        </div>`;
    }).join('');
    
    let displayText = "";
    if (calcMode === "kostnad") {
        displayText = `Offert Kostnad (exkl. moms): ${Math.round(Math.abs(total)).toLocaleString('sv-SE')} kr`;
    } else {
        displayText = `Balans/Totalt exkl. moms: ${Math.round(total).toLocaleString('sv-SE')} kr`;
    }
    
    const totalBox = document.getElementById('cart-total');
    if (totalBox) totalBox.innerText = displayText;
}

function removeItem(idx) {
    cart.splice(idx, 1);
    updateCartUI();
}

function clearCart() {
    cart = [];
    updateCartUI();
}

// --- Kartmärken & Avvikelser ---
function addFieldNote() {
    const type = document.getElementById('note-type')?.value || "Övrigt";
    const coords = document.getElementById('kund-gps')?.value || "Ej spec.";
    fieldNotes.push({ type, coords });
    
    const display = document.getElementById('saved-notes-display');
    if (display) {
        display.innerHTML = fieldNotes.map(n => `📍 <strong>${n.type}</strong> (${n.coords})`).join('<br>');
    }
}

// --- Logohantering & Lokallagring ---
function handleLogoUpload(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            savedLogoDataUrl = e.target.result;
            try {
                localStorage.setItem('fieldpro_user_logo', savedLogoDataUrl);
            } catch(error) {
                console.warn("Kunde inte spara logotyp lokalt (LocalStorage fullt):", error);
            }
            showLogoPreview();
        };
        reader.readAsDataURL(input.files[0]);
    }
}

function showLogoPreview() {
    const preview = document.getElementById('logo-preview');
    if (preview) {
        preview.src = savedLogoDataUrl;
        preview.style.display = 'block';
    }
    const btn = document.getElementById('btn-clear-logo');
    if (btn) btn.style.display = 'inline-block';
}

function clearSavedLogo() {
    savedLogoDataUrl = "";
    try {
        localStorage.removeItem('fieldpro_user_logo');
    } catch(e) {}
    
    const preview = document.getElementById('logo-preview');
    if (preview) preview.style.display = 'none';
    
    const btn = document.getElementById('btn-clear-logo');
    if (btn) btn.style.display = 'none';
    
    const uploader = document.getElementById('logo-uploader');
    if (uploader) uploader.value = "";
}

function loadSavedLogo() {
    try {
        const stored = localStorage.getItem('fieldpro_user_logo');
        if(stored) {
            savedLogoDataUrl = stored;
            showLogoPreview();
        }
    } catch(e) {}
}

// --- Digital Signatur ---
function initSignaturePad() {
    canvas = document.getElementById('sig-pad');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    
    function getPos(e) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: (e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 0)) - rect.left,
            y: (e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientX : 0)) - rect.top
        };
    }
    
    function start(e) { isDrawing = true; ctx.beginPath(); const p = getPos(e); ctx.moveTo(p.x, p.y); }
    function move(e) { if(!isDrawing) return; e.preventDefault(); const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); }
    function stop() { isDrawing = false; }
    
    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', move);
    window.addEventListener('mouseup', stop);
    
    canvas.addEventListener('touchstart', start);
    canvas.addEventListener('touchmove', move);
    window.addEventListener('touchend', stop);
}

function clearSignature() {
    if(ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// --- GENERERING AV OFFERT ---
function generateOffer() {
    if(cart.length === 0) {
        alert("Lägg till minst en åtgärd i din kalkyl innan du skapar en offert.");
        return;
    }
    
    const docTypeVal = document.getElementById('doc-type')?.value || "PRISOFFERT";
    const datumVal = document.getElementById('kund-datum')?.value || "-";
    const namnVal = document.getElementById('kund-namn')?.value || "Ej angiven";
    const idVal = document.getElementById('kund-id')?.value || "-";
    const fastighetVal = document.getElementById('kund-fastighet')?.value || "-";
    const ortVal = document.getElementById('kund-ort')?.value || "-";
    const gpsVal = document.getElementById('kund-gps')?.value || "-";
    const swerefVal = document.getElementById('kund-sweref')?.value || "-";
    const calcMode = document.getElementById('calc-mode')?.value || "netto";

    safelySetText('p-doc-type', docTypeVal.toUpperCase());
    safelySetText('p-datum', datumVal);
    safelySetText('p-uuid', Math.floor(100000 + Math.random() * 900000));
    
    safelySetText('p-kund-namn', namnVal);
    safelySetText('p-sign-name', namnVal || "Fastighetsägare");
    safelySetText('p-kund-id', idVal);
    safelySetText('p-kund-fastighet', fastighetVal);
    safelySetText('p-kund-ort', ortVal);
    safelySetText('p-kund-gps', gpsVal);
    safelySetText('p-kund-sweref', swerefVal);
    
    const wrapper = document.getElementById('p-logo-wrapper');
    if(wrapper) {
        if(savedLogoDataUrl) {
            wrapper.innerHTML = `<img src="${savedLogoDataUrl}" style="max-width:140px; max-height:70px; object-fit:contain;">`;
        } else {
            wrapper.innerHTML = `<div class="print-logo-placeholder">🌲</div>`;
        }
    }
    
    let nettoSum = 0;
    const tbody = document.getElementById('p-tbody');
    
    const rowsHtml = cart.map(item => {
        const rawAmount = Math.abs(Number(item.amount)); 
        const isExpense = (item.type === 'Röjning' || item.type === 'Plantering');
        
        if(isExpense) {
            nettoSum -= rawAmount;
        } else {
            nettoSum += rawAmount;
        }
        
        const prefix = isExpense ? "-" : "+";
        const displayAmount = prefix + Math.round(rawAmount).toLocaleString('sv-SE') + " kr";
        
        return `<tr>
            <td><strong>${item.type}</strong><br><span style="font-size:9pt; color:#444;">${item.desc}</span></td>
            <td style="text-align:right;">${item.area} ha</td>
            <td style="text-align:right;">${item.rate}</td>
            <td style="text-align:right; font-weight:bold;">${displayAmount}</td>
        </tr>`;
    }).join('');
    
    if (tbody) tbody.innerHTML = rowsHtml;
    
    let finalNetto = nettoSum;
    if (calcMode === "kostnad") {
        finalNetto = Math.abs(nettoSum);
        safelySetText('p-label-exkl', "Total Kostnad exkl. moms:");
    } else {
        safelySetText('p-label-exkl', "Slutbalans/Netto exkl. moms:");
    }

    const moms = finalNetto * 0.25;
    const totalInkl = finalNetto + moms;
    
    safelySetText('p-total-exkl', Math.round(finalNetto).toLocaleString('sv-SE') + " kr");
    safelySetText('p-moms', Math.round(moms).toLocaleString('sv-SE') + " kr");
    safelySetText('p-total-inkl', Math.round(totalInkl).toLocaleString('sv-SE') + " kr");
    
    const notesDiv = document.getElementById('p-field-notes');
    if(notesDiv) {
        if(fieldNotes.length > 0) {
            notesDiv.innerHTML = fieldNotes.map(n => `⚠️ <strong>${n.type}</strong> (Position: ${n.coords})`).join('<br>');
        } else {
            notesDiv.innerText = "Inga registrerade miljö- eller terrängavvikelser för detta skifte.";
        }
    }
    
    const sigImg = document.getElementById('p-signature-img');
    if(sigImg && canvas) {
        try {
            sigImg.src = canvas.toDataURL();
            sigImg.style.display = 'block';
        } catch(e) {
            console.error("Kunde inte hämta signatur:", e);
        }
    }
    
    window.scrollTo(0,0);
    const printView = document.getElementById('print-view');
    if (printView) printView.style.display = 'block';
}

function exitPrintView() {
    const printView = document.getElementById('print-view');
    if (printView) printView.style.display = 'none';
    window.scrollTo(0,0);
}

// --- Historikhantering lokalt ---
function saveCurrentContractToHistory() {
    const name = document.getElementById('kund-namn')?.value || "Okänd kund";
    const fastighet = document.getElementById('kund-fastighet')?.value || "Okänd fastighet";
    const date = document.getElementById('kund-datum')?.value || "-";
    
    try {
        const historyData = JSON.parse(localStorage.getItem('fieldpro_history') || '[]');
        historyData.push({ name, fastighet, date, cartCount: cart.length });
        localStorage.setItem('fieldpro_history', JSON.stringify(historyData));
        loadHistory();
        alert("Avtalet har arkiverats offline på enheten!");
    } catch(e) {
        console.error("Kunde inte spara historik:", e);
    }
}

function loadHistory() {
    try {
        const historyData = JSON.parse(localStorage.getItem('fieldpro_history') || '[]');
        const container = document.getElementById('history-list-container');
        if(!container) return;
        
        if(historyData.length === 0) {
            container.innerText = "Inga historiska kontrakt sparade lokalt.";
            return;
        }
        container.innerHTML = historyData.map(h => `<div class="history-item">
            <div>📁 <strong>${h.name}</strong> - ${h.fastighet} (${h.date})</div>
            <div style="font-size:0.8rem; background:#1e3f20; color:white; padding:2px 6px; border-radius:4px;">${h.cartCount} åtgärder</div>
        </div>`).join('');
    } catch(e) {}
}
