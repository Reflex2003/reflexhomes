// ==========================================
// 1. THE PERSISTENT DATABASE ENGINE (LOCALSTORAGE)
// ==========================================

const defaultProperties = [
    {
        propertyId: "PROP-001",
        town: "Nakuru",
        neighborhood: "Milimani",
        houseType: "1 Bedroom",
        pricePerMonth: 15000,
        waterAccess: "24/7 Borehole",
        amenities: ["Hot Shower", "Balcony", "Gated Compound"],
        mapLink: "https://google.com"
    },
    {
        propertyId: "PROP-002",
        town: "Eldoret",
        neighborhood: "Kapianga / Annex",
        houseType: "Bedsitter",
        pricePerMonth: 7500,
        waterAccess: "Water Tanks / Rationed",
        amenities: ["WiFi Available", "Tiled Floors"],
        mapLink: "https://google.com"
    }
];

// Initialize matrices from local hard-drive vault sectors
let userDatabase = JSON.parse(localStorage.getItem('reflex_users')) || [
    {
        email: "ianmorgan107@gmail.com", 
        role: "admin", 
        isApproved: true,
        expiryTime: null, 
        payerPhone: "SYSTEM"
    }
];

let propertyDatabase = JSON.parse(localStorage.getItem('reflex_properties')) || defaultProperties;
let feedbackDatabase = JSON.parse(localStorage.getItem('reflex_feedback')) || [];

function commitToStorage() {
    localStorage.setItem('reflex_users', JSON.stringify(userDatabase));
    localStorage.setItem('reflex_properties', JSON.stringify(propertyDatabase));
    localStorage.setItem('reflex_feedback', JSON.stringify(feedbackDatabase));
}

// Master credential fallback enforcer
if (!userDatabase.some(u => u.email === "ianmorgan107@gmail.com")) {
    userDatabase.unshift({
        email: "ianmorgan107@gmail.com",
        role: "admin",
        isApproved: true,
        expiryTime: null,
        payerPhone: "SYSTEM"
    });
    commitToStorage();
}

// ==========================================
// 2. DOM ELEMENT SELECTORS
// ==========================================
const authGate = document.getElementById('authGate');
const seekerDashboard = document.getElementById('seekerDashboard');
const adminDashboard = document.getElementById('adminDashboard');
const landlordDashboard = document.getElementById('landlordDashboard');

const userEmailInput = document.getElementById('userEmail');
const userPasswordInput = document.getElementById('userPassword');
const payerPhoneInput = document.getElementById('payerPhone');

const payTriggerBtn = document.getElementById('payTriggerBtn');
const loginBtn = document.getElementById('loginBtn');
const propertyGrid = document.getElementById('propertyGrid');
const userTableBody = document.getElementById('userTableBody');
const feedbackTableBody = document.getElementById('feedbackTableBody');

const townSearch = document.getElementById('townSearch');
const waterFilter = document.getElementById('waterFilter');

const uploadHouseBtn = document.getElementById('uploadHouseBtn');
const newTown = document.getElementById('newTown');
const newNeighborhood = document.getElementById('newNeighborhood');
const newHouseType = document.getElementById('newHouseType');
const newPrice = document.getElementById('newPrice');
const newWater = document.getElementById('newWater');
const newMapLink = document.getElementById('newMapLink');

// ==========================================
// 3. PAYMENT TRACKER DATA PACKETS
// ==========================================
payTriggerBtn.addEventListener('click', () => {
    const email = userEmailInput.value.trim();
    const phone = payerPhoneInput.value.trim();
    const selectedRole = document.querySelector('input[name="userRole"]:checked').value;

    if (!email || !phone) {
        alert("❌ Error: Please input an Email AND M-Pesa Phone Number first!");
        return;
    }

    const existingUser = userDatabase.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (existingUser) {
        alert("⚠️ An account with this email already exists.");
        return;
    }

    const newUser = {
        email: email,
        role: selectedRole,
        isApproved: false,
        expiryTime: null,
        payerPhone: phone
    };

    userDatabase.push(newUser);
    commitToStorage(); 
    alert(`💰 M-Pesa STK Push prompted to phone ${phone}!\n\nTransaction logged. Contact Admin to receive activation password.`);
    updateAdminTable();
});

// ==========================================
// 4. SECURITY ROUTING ACCESS MANAGER
// ==========================================
loginBtn.addEventListener('click', () => {
    const email = userEmailInput.value.trim().toLowerCase();
    const password = userPasswordInput.value;
    const selectedRole = document.querySelector('input[name="userRole"]:checked').value;

    // 🌟 UNIFIED MULTI-PORTAL ROUTER LOGIC
    if (email === "ianmorgan107@gmail.com" && password === "Morgan6273") {
        
        if (payerPhoneInput.value.trim().toLowerCase() === "admin") {
            alert("🔓 Master Admin Access Granted. Opening Supreme Control Center...");
            showPanel(adminDashboard);
            updateAdminTable();
            return;
        }

        if (selectedRole === "seeker") {
            alert("🔓 Master Seeker Bypass Active! Opening Seeker Grid...");
            showPanel(seekerDashboard);
            displayProperties(propertyDatabase);
        } else if (selectedRole === "landlord") {
            alert("🔓 Master Landlord Bypass Active! Opening Property Uploader Dashboard...");
            showPanel(landlordDashboard);
        }
        return;
    }

    const user = userDatabase.find(u => u.email.toLowerCase() === email);

    if (!user) {
        alert("❌ Credentials mismatch. Try again or pay to register.");
        return;
    }

    if (!user.isApproved) {
        alert("🔒 Account Hold: Waiting on Admin approval password.");
        return;
    }

    if (user.role === "seeker" && user.expiryTime) {
        const currentTime = new Date().getTime();
        if (currentTime > user.expiryTime) {
            user.isApproved = false;
            commitToStorage(); 
            alert("⏰ Access Token Expired. Your 24-hour pass has run out.");
            updateAdminTable();
            return;
        }
    }

    if (user.role === "seeker") {
        showPanel(seekerDashboard);
        displayProperties(propertyDatabase);
    } else if (user.role === "landlord") {
        showPanel(landlordDashboard);
    }
});

function showPanel(activePanel) {
    authGate.classList.add('hidden');
    seekerDashboard.classList.add('hidden');
    adminDashboard.classList.add('hidden');
    landlordDashboard.classList.add('hidden'); 
    activePanel.classList.remove('hidden');
}

document.querySelectorAll('.btn-logout').forEach(btn => {
    btn.addEventListener('click', () => {
        showPanel(authGate);
        userPasswordInput.value = "";
        payerPhoneInput.value = ""; 
    });
});

// ==========================================
// 5. LANDLORD REGISTRATION LOGIC ENGINE
// ==========================================
uploadHouseBtn.addEventListener('click', () => {
    const townVal = newTown.value.trim();
    const neighborhoodVal = newNeighborhood.value.trim();
    const typeVal = newHouseType.value;
    const priceVal = parseInt(newPrice.value.trim()); 
    const waterVal = newWater.value;
    let mapVal = newMapLink.value.trim();

    if (!townVal || !neighborhoodVal || !priceVal || isNaN(priceVal)) {
        alert("❌ Validation Error: Please fill in Town, Estate, and a valid numerical Rent Price!");
        return;
    }

    if (!mapVal) {
        mapVal = `https://google.com/${encodeURIComponent(neighborhoodVal)}+${encodeURIComponent(townVal)}`;
    }

    let checkedAmenities = [];
    document.querySelectorAll('.amenity-check:checked').forEach(checkbox => {
        checkedAmenities.push(checkbox.value);
    });

    const newProperty = {
        propertyId: "PROP-" + (propertyDatabase.length + 1),
        town: townVal,
        neighborhood: neighborhoodVal,
        houseType: typeVal,
        pricePerMonth: priceVal,
        waterAccess: waterVal,
        amenities: checkedAmenities,
        mapLink: mapVal
    };

    propertyDatabase.push(newProperty);
    commitToStorage(); 
    alert(`🎉 Success! Your ${typeVal} unit in ${neighborhoodVal}, ${townVal} has been successfully added to Reflex Homes.`);

    newTown.value = "";
    newNeighborhood.value = "";
    newPrice.value = "";
    newMapLink.value = "";
    document.querySelectorAll('.amenity-check').forEach(box => box.checked = false);
});

// ==========================================
// 6. DISCOVERY VISUAL LAYOUT GENERATION
// ==========================================
function displayProperties(propertiesList) {
    if (!propertyGrid) return;
    propertyGrid.innerHTML = "";

    if (!propertiesList || propertiesList.length === 0) {
        propertyGrid.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: #7f8c8d;">No houses found matching your filters. 😢</p>`;
        return;
    }

    propertiesList.forEach(house => {
        const card = document.createElement('div');
        card.classList.add('house-card');
        card.innerHTML = `
            <span style="color: #ff4500; font-weight: bold; font-size: 0.8rem; text-transform: uppercase;">📍 ${house.town} — ${house.neighborhood}</span>
            <h3 style="margin: 5px 0;">${house.houseType}</h3>
            <p style="font-size: 1.3rem; color: #008080; font-weight: bold; margin-bottom: 8px;">Ksh ${house.pricePerMonth.toLocaleString()} / month</p>
            <p style="font-size: 0.9rem; margin-bottom: 4px;">💧 <strong>Water:</strong> ${house.waterAccess}</p>
            <p style="font-size: 0.85rem; color: #555; margin-bottom: 15px;">✨ ${house.amenities.join(' • ')}</p>
            <a href="${house.mapLink}" target="_blank" style="display: block; text-align: center; background: #007bff; color: white; padding: 10px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 0.9rem;">🗺️ Navigate to House</a>
        `;
        propertyGrid.appendChild(card);
    });
}

function runFilters() {
    const searchText = townSearch?.value.toLowerCase() || "";
    const waterType = waterFilter?.value || "all";
    const filtered = propertyDatabase.filter(house => {
        const matchTown = house.town.toLowerCase().includes(searchText) || house.neighborhood.toLowerCase().includes(searchText);
        const matchWater = waterType === "all" || house.waterAccess.includes(waterType);
        return matchTown && matchWater;
    });
    displayProperties(filtered);
}

townSearch?.addEventListener('input', runFilters);
waterFilter?.addEventListener('change', runFilters);
// ==========================================
// 7. OVERRIDE CENTRAL DISPATCH INTERFACE
// ==========================================
function updateAdminTable() {
    if (!userTableBody) return;
    userTableBody.innerHTML = "";

    userDatabase.forEach((user, index) => {
        if (user.email === "ianmorgan107@gmail.com") return;

        let timeStatus = "Unlimited Access";
        if (user.role === "seeker") {
            if (!user.isApproved) {
                timeStatus = "🔴 Pending Approval";
            } else if (user.expiryTime) {
                const timeLeft = user.expiryTime - new Date().getTime();
                if (timeLeft <= 0) {
                    timeStatus = "❌ Expired";
                } else {
                    const hoursLeft = Math.round(timeLeft / (1000 * 60 * 60));
                    timeStatus = `🟢 Active (~${hoursLeft}h Left)`;
                }
            }
        }

        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${user.email}</strong><br><small style="color: #7f8c8d;">M-Pesa Source: ${user.payerPhone}</small></td>
            <td style="text-transform: capitalize;">${user.role}</td>
            <td>${timeStatus}</td>
            <td>
                <button onclick="approveUser(${index})" style="background: #28a745; color: white; border: none; padding: 5px 10px; margin-right: 5px; border-radius: 3px; cursor: pointer;">🟢 Approve</button>
                <button onclick="blockUser(${index})" style="background: #ffc107; color: black; border: none; padding: 5px 10px; margin-right: 5px; border-radius: 3px; cursor: pointer;">🟡 Block</button>
                <button onclick="deleteUser(${index})" style="background: #dc3545; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer;">🔴 Delete</button>
            </td>
        `;
        userTableBody.appendChild(row);
    });
    updateFeedbackTable();
}

function updateFeedbackTable() {
    if (!feedbackTableBody) return;
    feedbackTableBody.innerHTML = "";

    if (feedbackDatabase.length === 0) {
        feedbackTableBody.innerHTML = `<tr><td style="color: #7f8c8d; text-align: center;">No feedback submitted yet.</td></tr>`;
        return;
    }
    feedbackDatabase.forEach(msg => {
        const row = document.createElement('tr');
        row.innerHTML = `<td>💬 ${msg}</td>`;
        feedbackTableBody.appendChild(row);
    });
}

window.approveUser = function(index) {
    const user = userDatabase[index];
    if (!user) return;
    user.isApproved = true;
    const twentyFourHours = 24 * 60 * 60 * 1000;
    user.expiryTime = new Date().getTime() + twentyFourHours;
    commitToStorage();
    alert(`Account activated for: ${user.email}`);
    updateAdminTable();
};

window.blockUser = function(index) {
    const user = userDatabase[index];
    if (!user) return;
    user.isApproved = false;
    commitToStorage();
    alert(`Account blocked: ${user.email}`);
    updateAdminTable();
};

window.deleteUser = function(index) {
    const user = userDatabase[index];
    if (!user) return;
    if (confirm(`Permanently remove ${user.email} from ledger?`)) {
        userDatabase.splice(index, 1);
        commitToStorage();
        updateAdminTable();
    }
};

const feedbackSubmitButton = document.getElementById('submitFeedbackBtn');
if (feedbackSubmitButton) {
    feedbackSubmitButton.addEventListener('click', () => {
        const feedbackText = document.getElementById('feedbackText');
        const text = feedbackText?.value.trim() || '';
        if (text === "") return;
        feedbackDatabase.push(text);
        commitToStorage();
        alert("✨ Review beamed directly to Admin Console.");
        if (feedbackText) feedbackText.value = "";
        updateFeedbackTable();
    });
}
