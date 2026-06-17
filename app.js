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
    document.getElementById('kund-datum').value = new Date().toISOString().split('T')[0];
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
    document.getElementById(tabId).classList.add('active');
    if(event && event.currentTarget) {
        event.currentTarget.classList.add('active');
    }
    if(tabId === 'tab-kund' && map) {
        setTimeout(() => map.invalidateSize(), 200);
    }
}

// --- GPS-FUNKTION MED AUTOMATISK TEXTPLACERING ---
function getGPS() {
    const gpsInput = document.getElementById('kund-gps');
    const swerefInput = document.getElementById('kund-sweref');
    const fastighetInput = document.getElementById('kund-fastighet');
    
    if (!navigator.geolocation) {
        alert("Geolocation stöds inte av din webbläsare eller enhet.");
        return;
    }

    fastighetInput.value = "Hämtar position från satellit...";

    const options = {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0
    };

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            
            gpsInput.value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
            
            // Konvertering till SWEREF 99 TM
            const sweref = convertToSweref99TM(lat, lng);
            swerefInput.value = `N: ${sweref.N}, E: ${sweref.E}`;
            
            // Flytta kartan till aktuell position
            if (map) {
                map.setView([lat, lng], 16);
                if (marker) {
                    marker.setLatLng([lat, lng]);
                } else {
                    marker = L.marker([lat, lng], { draggable: true }).addTo(map);
                }
                // Sätter en tillfällig text baserad på positionen istället för bara en instruktion
                fastighetInput.value = `Skifte vid Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`;
            }
        },
        (error) => {
            console.error(error);
            fastighetInput.value = "";
            switch(error.code) {
                case error.PERMISSION_DENIED:
                    alert("Du måste godkänna platstjänster i webbläsaren för att spåra skiftet.");
                    break;
                case error.TIMEOUT:
                    alert("Tog för lång tid att hämta GPS. Försök igen eller stå utomhus under öppen himmel.");
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
    map = L.map('map').setView([62.6, 16.5], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
    }).addTo(map);

    map.on('click', (e) => {
        const lat = e.latlng.lat;
        const lng = e.latlng.lng;
        document.getElementById('kund-gps').value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        const sweref = convertToSweref99TM(lat, lng);
        document.getElementById('kund-sweref').value = `N: ${sweref.N}, E: ${sweref.E}`;
        
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
    if(species === 'Tall') btn.classList.add('active-tall');
    if(species === 'Gran') btn.classList.add('active-gran');
    if(species === 'Lov') btn.classList.add('active-lov');
}

function setFieldVal(type, val) {
    document.getElementById(`field-${type}`).value = val;
}

function addHalfVal(type) {
    const el = document.getElementById(`field-${type}`);
    el.value = (parseFloat(el.value) || 0) + 0.5;
}

function addTreeRecord() {
    const d = parseFloat(document.getElementById('field-d').value) || 0;
    const h = parseFloat(document.getElementById('field-h').value) || 0;
    registeredTrees.push({ species: activeSpecies, d, h });
    
    const display = document.getElementById('tree-list-display');
    display.innerHTML = registeredTrees.map((t, idx) => `#${idx+1}: [${t.species}] d:${t.d}cm h:${t.h}m`).join('<br>');
}

function clearTreeRecords() {
    registeredTrees = [];
    document.getElementById('tree-list-display').innerText = "Inga stammar registrerade än.";
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
    
    const radius = parseFloat(document.getElementById('field-radius').value);
    const factor = 10000 / (Math.PI * Math.pow(radius, 2));
    computedStemHa = Math.round(registeredTrees.length * factor);
    
    document.getElementById('res-dgv').innerText = computedDgv.toFixed(1);
    document.getElementById('res-hm').innerText = computedHm.toFixed(1);
    document.getElementById('res-stem-ha').innerText = computedStemHa;
}

function transferMetricsToGallring() {
    document.getElementById('gal-d').value = computedDgv.toFixed(1);
    document.getElementById('gal-hojd').value = computedHm.toFixed(1);
    switchTab('tab-gallring');
    runLivePrognosis();
}

// --- Kalkyl & Gallringsfunktioner ---
function updateTimmerLabels() {
    const tPct = parseInt(document.getElementById('gal-timmer-pct').value);
    document.getElementById('lbl-timmer-pct').innerText = tPct + '%';
    document.getElementById('lbl-massa-pct').innerText = (100 - tPct) + '%';
    runLivePrognosis();
}

function runLivePrognosis() {
    const areal = parseFloat(document.getElementById('gal-areal').value) || 0;
    const gy = parseFloat(document.getElementById('gal-gy').value) || 0;
    const hojd = parseFloat(document.getElementById('gal-hojd').value) || 0;
    const uttag = parseFloat(document.getElementById('gal-uttag').value) || 0;
    const tPct = parseInt(document.getElementById('gal-timmer-pct').value) || 0;
    
    const pTimmer = parseFloat(document.getElementById('cfg-pris-timmer').value) || 0;
    const pMassa = parseFloat(document.getElementById('cfg-pris-massa').value) || 0;
    
    let f = 0.45;
    const species = document.getElementById('gal-tradslag').value;
    if(species === 'Gran') f = 0.50;
    if(species === 'Tall') f = 0.44;
    
    const totVol = gy * hojd * f * areal;
    const outVol = totVol * (uttag / 100);
    const vTimmer = outVol * (tPct / 100);
    const vMassa = outVol * ((100 - tPct) / 100);
    
    const bearing = document.getElementById('gal-bearing').value;
    const alertBox = document.getElementById('terrain-alert');
    if(bearing === 'Låg') {
        alertBox.style.display = 'block';
        alertBox.innerText = "⚠️ OBS: Svag bärighet. Körskaderisk identifierad! Kräver risning eller vinteravverkning.";
    } else {
        alertBox.style.display = 'none';
    }
    
    const netto = (vTimmer * pTimmer) + (vMassa * pMassa);
    
    document.getElementById('prog-tot-vol').innerText = Math.round(totVol);
    document.getElementById('prog-out-vol').innerText = Math.round(outVol);
    document.getElementById('prog-out-timmer').innerText = Math.round(vTimmer);
    document.getElementById('prog-out-massa').innerText = Math.round(vMassa);
    document.getElementById('prog-netto').innerText = Math.round(netto).toLocaleString('sv-SE');
    
    return { totVol, outVol, vTimmer, vMassa, netto };
}

function syncCompanyPrices(key) {
    if(priceLists[key]) {
        document.getElementById('gal-company-sync').value = key;
        document.getElementById('cfg-skogsbolag').value = key;
        document.getElementById('cfg-pris-timmer').value = priceLists[key].timmer;
        document.getElementById('cfg-pris-massa').value = priceLists[key].massa;
        runLivePrognosis();
    }
}

// --- Kalkylvagnshantering (Cart) ---
function addRojningToCart() {
    const ar = parseFloat(document.getElementById('roj-areal').value) || 0;
    const h = document.getElementById('roj-hojd').value;
    const p = parseFloat(document.getElementById('cfg-roj-timme').value) || 0;
    const cost = ar * 8 * p;
    
    // Sparas som ett positivt tal internt
    cart.push({ type: 'Röjning', desc: `Ungskogsröjning, medelhöjd ${h}m`, area: ar, rate: `${p} kr/h (Est. 8h/ha)`, amount: cost });
    updateCartUI();
}

function addGallringToCart() {
    const data = runLivePrognosis();
    const ar = parseFloat(document.getElementById('gal-areal').value) || 0;
    const sp = document.getElementById('gal-tradslag').value;
    cart.push({ type: 'Gallring', desc: `Avverkning/Gallring (${sp}) - Uttag på ${Math.round(data.outVol)} m³fub`, area: ar, rate: 'Virkesnetto', amount: data.netto });
    updateCartUI();
}

function addPlanteringToCart() {
    const ar = parseFloat(document.getElementById('plan-areal').value) || 0;
    const t = parseInt(document.getElementById('plan-tathet').value) || 0;
    const pPlanta = parseFloat(document.getElementById('cfg-planta').value) || 0;
    const incMb = document.getElementById('plan-mb').checked;
    const cMb = parseFloat(document.getElementById('cfg-mb-ha').value) || 0;
    
    let cost = ar * t * pPlanta;
    let desc = `Plantering (${t} st/ha, á ${pPlanta}kr)`;
    if(incMb) {
        cost += (ar * cMb);
        desc += ` inkl. maskinell markberedning`;
    }
    
    // Sparas som ett positivt tal internt
    cart.push({ type: 'Plantering', desc: desc, area: ar, rate: 'Löpande taxa', amount: cost });
    updateCartUI();
}

function updateCartUI() {
    document.getElementById('cart-count').innerText = cart.length;
    const container = document.getElementById('cart-items-container');
    if(cart.length === 0) {
        container.innerText = "Kalkylen är tom.";
        document.getElementById('cart-total').innerText = "Totalt exkl. moms: 0 kr";
        return;
    }
    
    let total = 0;
    container.innerHTML = cart.map((item, idx) => {
        // Tvingar talet till positivt innan vi tillämpar logik baserat på typ
        const rawAmount = Math.abs(item.amount);
        const isExpense = (item.type === 'Röjning' || item.type === 'Plantering');
        
        if (isExpense) {
            total -= rawAmount; // Drar av utgifter
        } else {
            total += rawAmount; // Plussar på intäkter
        }
        
        const color = isExpense ? "red" : "green";
        const prefix = isExpense ? "-" : "+";
        
        return `<div class="cart-item">
            <div><strong>${item.type}</strong> - ${item.desc} (${item.area} ha)</div>
            <div style="color:${color}; font-weight:bold;">${prefix}${Math.round(rawAmount).toLocaleString('sv-SE')} kr 
            <button class="btn btn-danger" style="width:auto; padding:2px 6px; font-size:0.75rem; margin-left:10px;" onclick="removeItem(${idx})">X</button></div>
        </div>`;
    }).join('');
    
    if (total < 0) {
        document.getElementById('cart-total').innerText = `Balans/Totalt exkl. moms: -${Math.round(Math.abs(total)).toLocaleString('sv-SE')} kr`;
    } else {
        document.getElementById('cart-total').innerText = `Balans/Totalt exkl. moms: ${Math.round(total).toLocaleString('sv-SE')} kr`;
    }
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
    const type = document.getElementById('note-type').value;
    const coords = document.getElementById('kund-gps').value || "Ej spec.";
    fieldNotes.push({ type, coords });
    
    document.getElementById('saved-notes-display').innerHTML = fieldNotes.map(n => `📍 <strong>${n.type}</strong> (${n.coords})`).join('<br>');
}

// --- Logohantering & Lokallagring (Offline) ---
function handleLogoUpload(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            savedLogoDataUrl = e.target.result;
            localStorage.setItem('fieldpro_user_logo', savedLogoDataUrl);
            showLogoPreview();
        };
        reader.readAsDataURL(input.files[0]);
    }
}

function showLogoPreview() {
    const preview = document.getElementById('logo-preview');
    preview.src = savedLogoDataUrl;
    preview.style.display = 'block';
    document.getElementById('btn-clear-logo').style.display = 'inline-block';
}

function clearSavedLogo() {
    savedLogoDataUrl = "";
    localStorage.removeItem('fieldpro_user_logo');
    document.getElementById('logo-preview').style.display = 'none';
    document.getElementById('btn-clear-logo').style.display = 'none';
    document.getElementById('logo-uploader').value = "";
}

function loadSavedLogo() {
    const stored = localStorage.getItem('fieldpro_user_logo');
    if(stored) {
        savedLogoDataUrl = stored;
        showLogoPreview();
    }
}

// --- Digital Signatur Logik ---
function initSignaturePad() {
    canvas = document.getElementById('sig-pad');
    ctx = canvas.getContext('2d');
    
    function getPos(e) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: (e.clientX || e.touches[0].clientX) - rect.left,
            y: (e.clientY || e.touches[0].clientY) - rect.top
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

// --- GENERERA OFFERT / AVTAL FÖR UTSKRIFT (RENSAD FRÅN DUBBLA MINUS) ---
function generateOffer() {
    if(cart.length === 0) {
        alert("Lägg till minst en åtgärd i din kalkyl innan du skapar en offert.");
        return;
    }
    
    // Synka fältdata till utskriftsmallen
    document.getElementById('p-doc-type').innerText = document.getElementById('doc-type').value.toUpperCase();
    document.getElementById('p-datum').innerText = document.getElementById('kund-datum').value;
    document.getElementById('p-uuid').innerText = Math.floor(100000 + Math.random() * 900000);
    
    document.getElementById('p-kund-namn').innerText = document.getElementById('kund-namn').value || "Ej angiven";
    document.getElementById('p-sign-name').innerText = document.getElementById('kund-namn').value || "Fastighetsägare";
    document.getElementById('p-kund-id').innerText = document.getElementById('kund-id').value || "-";
    document.getElementById('p-kund-fastighet').innerText = document.getElementById('kund-fastighet').value || "-";
    document.getElementById('p-kund-ort').innerText = document.getElementById('kund-ort').value || "-";
    document.getElementById('p-kund-gps').innerText = document.getElementById('kund-gps').value || "-";
    document.getElementById('p-kund-sweref').innerText = document.getElementById('kund-sweref').value || "-";
    
    const wrapper = document.getElementById('p-logo-wrapper');
    if(savedLogoDataUrl) {
        wrapper.innerHTML = `<img src="${savedLogoDataUrl}" style="max-width:140px; max-height:70px; object-fit:contain;">`;
    } else {
        wrapper.innerHTML = `<div class="print-logo-placeholder">🌲</div>`;
    }
    
    // Bygg tabellrader för offerten utan dolda minustecken
    let nettoSum = 0;
    const tbody = document.getElementById('p-tbody');
    tbody.innerHTML = cart.map(item => {
        const rawAmount = Math.abs(item.amount);
        const isExpense = (item.type === 'Röjning' || item.type === 'Plantering');
        
        if(isExpense) {
            nettoSum -= rawAmount;
        } else {
            nettoSum += rawAmount;
        }
        
        // Sätter utskriftsprefix baserat enbart på typen
        const prefix = isExpense ? "-" : "+";
        const displayAmount = prefix + Math.round(rawAmount).toLocaleString('sv-SE') + " kr";
        
        return `<tr>
            <td><strong>${item.type}</strong><br><span style="font-size:9pt; color:#444;">${item.desc}</span></td>
            <td style="text-align:right;">${item.area} ha</td>
            <td style="text-align:right;">${item.rate}</td>
            <td style="text-align:right; font-weight:bold;">${displayAmount}</td>
        </tr>`;
    }).join('');
    
    // Beräkna moms och totaler baserat på den framräknade slutsumman
    const moms = nettoSum * 0.25;
    const totalInkl = nettoSum + moms;
    
    // Hantera teckenvisning (+ eller -) för slutsektionen
    const nettoPrefix = nettoSum < 0 ? "-" : "";
    const momsPrefix = moms < 0 ? "-" : "";
    const inklPrefix = totalInkl < 0 ? "-" : "";
    
    document.getElementById('p-total-exkl').innerText = nettoPrefix + Math.round(Math.abs(nettoSum)).toLocaleString('sv-SE') + " kr";
    document.getElementById('p-moms').innerText = momsPrefix + Math.round(Math.abs(moms)).toLocaleString('sv-SE') + " kr";
    document.getElementById('p-total-inkl').innerText = inklPrefix + Math.round(Math.abs(totalInkl)).toLocaleString('sv-SE') + " kr";
    
    // Miljö- och terrängavvikelser
    const notesDiv = document.getElementById('p-field-notes');
    if(fieldNotes.length > 0) {
        notesDiv.innerHTML = fieldNotes.map(n => `⚠️ <strong>${n.type}</strong> (Position: ${n.coords})`).join('<br>');
    } else {
        notesDiv.innerText = "Inga registrerade miljö- eller terrängavvikelser för detta skifte.";
    }
    
    // Överför namnteckning från ritplattan till utskriftsbilden
    const sigImg = document.getElementById('p-signature-img');
    sigImg.src = canvas.toDataURL();
    sigImg.style.display = 'block';
    
    // Växla vy till förhandsgranskning
    window.scrollTo(0,0);
    document.getElementById('print-view').style.display = 'block';
}

function exitPrintView() {
    document.getElementById('print-view').style.display = 'none';
    window.scrollTo(0,0);
}

// --- Historikhantering lokalt ---
function saveCurrentContractToHistory() {
    const name = document.getElementById('kund-namn').value || "Okänd kund";
    const fastighet = document.getElementById('kund-fastighet').value || "Okänd fastighet";
    const date = document.getElementById('kund-datum').value;
    
    const historyData = JSON.parse(localStorage.getItem('fieldpro_history') || '[]');
    historyData.push({ name, fastighet, date, cartCount: cart.length });
    localStorage.setItem('fieldpro_history', JSON.stringify(historyData));
    loadHistory();
    alert("Avtalet har arkiverats offline på enheten!");
}

function loadHistory() {
    const historyData = JSON.parse(localStorage.getItem('fieldpro_history') || '[]');
    const container = document.getElementById('history-list-container');
    if(historyData.length === 0) {
        container.innerText = "Inga historiska kontrakt sparade lokalt.";
        return;
    }
    container.innerHTML = historyData.map(h => `<div class=\"history-item\">
        <div>📁 <strong>${h.name}</strong> - ${h.fastighet} (${h.date})</div>
        <div style=\"font-size:0.8rem; background:#1e3f20; color:white; padding:2px 6px; border-radius:4px;\">${h.cartCount} åtgärder</div>
    </div>`).join('');
}
