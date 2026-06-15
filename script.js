// --- FIREBASE CONFIGURATION ---
// Replace these placeholders with your actual keys from the Firebase Console
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "baraka-homes.firebaseapp.com",
    projectId: "baraka-homes",
    storageBucket: "baraka-homes.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:12345:web:abc123"
};

// Initialize Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, where, serverTimestamp, onSnapshot, setDoc, deleteField } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

document.addEventListener('DOMContentLoaded', async () => {
    // --- INITIAL THEME LOAD ---
    const savedTheme = localStorage.getItem('reflex_theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
    }

    // --- 1. CORE NAVIGATION ---
    const authGate = document.getElementById('authGate');
    const seekerDashboard = document.getElementById('seekerDashboard');
    const landlordDashboard = document.getElementById('landlordDashboard');
    const imageInput = document.getElementById('newImage');
    const previewContainer = document.getElementById('imagePreviewContainer');
    const previewImg = document.getElementById('imagePreview');
    const removeImgBtn = document.getElementById('removeImageBtn');
    const rememberMeCheck = document.getElementById('rememberMe');

    // --- GOOGLE MAPS DARK MODE STYLES ---
    const darkMapStyles = [
        { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
        { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
        { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
        { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
        { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
        { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#212a37" }] },
        { featureType: "water", elementType: "geometry", stylers: [{ color: "#17263c" }] },
    ];

    const adminDashboard = document.getElementById('adminDashboard');
    const loginBtn = document.getElementById('loginBtn');
    const rememberMeCheck = document.getElementById('rememberMe');
    let droppedFile = null; // Store drag-and-drop file
    const adminNotificationSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
    const adminTypingSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2357/2357-preview.mp3'); // Bubble pop sound
    let wasAdminTyping = false;
    let seekerLocation = null;
    let radiusSearchActive = false;
    let selectedSchoolCoords = null;
    let sessionEmail = ""; // Persistent session tracker
    let isMaintenanceMode = false;
    let typingTimer;
    const sessionId = Math.random().toString(36).substring(7);

    // --- REAL-TIME VISITOR COUNTER (Heartbeat) ---
    async function updatePresence() {
        const presenceRef = doc(db, "online_presence", sessionId);
        await setDoc(presenceRef, {
            lastActive: serverTimestamp(),
            email: sessionEmail || "Guest"
        }, { merge: true });
    }

    // Heartbeat every 30 seconds
    setInterval(updatePresence, 30000);
    updatePresence();

    // Listen for total online users (Active within last 2 minutes)
    onSnapshot(collection(db, "online_presence"), (snapshot) => {
        const twoMinutesAgo = Date.now() - 120000;
        const onlineCount = snapshot.docs.filter(doc => {
            const data = doc.data();
            return data.lastActive && data.lastActive.toDate().getTime() > twoMinutesAgo;
        }).length;

        const countDisplay = document.getElementById('visitorCount');
        const adminStatDisplay = document.getElementById('statUsers');
        if (countDisplay) countDisplay.textContent = onlineCount;
        if (adminStatDisplay) adminStatDisplay.textContent = onlineCount;
    });

    // Cleanup presence on logout
    const clearPresence = async () => {
        try {
            await deleteDoc(doc(db, "online_presence", sessionId));
        } catch (e) {
            console.warn("Presence cleanup failed", e);
        }
    };

    // --- REAL-TIME TYPING INDICATOR LOGIC ---
    async function updateTypingStatus(isTyping) {
        if (!sessionEmail) return;
        try {
            const typingRef = doc(db, "typing_presence", sessionEmail);
            await setDoc(typingRef, {
                email: sessionEmail,
                isTyping: isTyping,
                lastUpdated: serverTimestamp()
            }, { merge: true });
        } catch (e) {
            console.warn("Typing status update failed", e);
        }
    }

    // Listen for others typing
    onSnapshot(collection(db, "typing_presence"), (snapshot) => {
        const indicator = document.getElementById('typingIndicator');
        const chatIndicator = document.getElementById('chatTypingIndicator');
        if (!indicator) return;

        const typers = snapshot.docs
            .map(d => d.data())
            .filter(d => d.isTyping && d.email !== sessionEmail);

        // --- ADMIN TYPING SOUND LOGIC ---
        const adminTyper = typers.find(d => d.email === 'ianmorgan107@gmail.com');
        if (adminTyper && !wasAdminTyping && sessionEmail !== 'ianmorgan107@gmail.com') {
            adminTypingSound.play().catch(e => console.warn("Audio play blocked", e));
        }
        wasAdminTyping = !!adminTyper;

        if (typers.length > 0) {
            const name = typers[0].email.split('@')[0];
            indicator.textContent = `✍️ ${name} is typing...`;
            indicator.classList.remove('hidden');
            if (chatIndicator && adminTyper) chatIndicator.classList.remove('hidden');
        } else {
            indicator.classList.add('hidden');
            if (chatIndicator) chatIndicator.classList.add('hidden');
        }
    });

    // Attach listener to feedback input
    const feedbackInput = document.getElementById('feedbackText');
    if (feedbackInput) {
        feedbackInput.addEventListener('input', () => {
            updateTypingStatus(true);
            
            clearTimeout(typingTimer);
            typingTimer = setTimeout(() => updateTypingStatus(false), 3000);
        });
    }

    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
        chatInput.addEventListener('input', () => {
            updateTypingStatus(true);
            
            clearTimeout(typingTimer);
            typingTimer = setTimeout(() => updateTypingStatus(false), 3000);
        });
    }

    // --- EMERGENCY PANIC / MAINTENANCE LOGIC ---
    const maintenanceRef = doc(db, "system", "maintenance");
    
    // Real-time listener: instantly reacts when Admin toggles the button
    onSnapshot(maintenanceRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            isMaintenanceMode = data.active || false;
            currentAdminNote = data.adminNote || "";
            currentEta = data.eta ? data.eta.toDate() : null; // Convert Firestore Timestamp to JS Date
            updateMaintenanceUI();
            renderAuditLogs(); // Refresh logs when state changes
        } else {
            // If document doesn't exist, assume no maintenance
            isMaintenanceMode = false;
            currentAdminNote = "";
            currentEta = null;
            updateMaintenanceUI();
        }
    }, (error) => { console.error("Error listening to maintenance status:", error); });

    function updateMaintenanceUI() {
        const isAdmin = sessionEmail === 'ianmorgan107@gmail.com';
        const overlay = document.getElementById('maintenanceOverlay');
        const panicBtn = document.getElementById('panicBtn');

        if (panicBtn) {
            // Update Panic Button UI
            if (isMaintenanceMode) {
                panicBtn.innerHTML = "🛑 DEACTIVATE PANIC MODE";
                panicBtn.classList.add('panic-active');
            } else {
                panicBtn.innerHTML = "🚨 ACTIVATE PANIC MODE";
                panicBtn.classList.remove('panic-active');
            }
        }

        const adminNoteDisplay = document.getElementById('adminMaintenanceNote');
        const countdownDisplay = document.getElementById('maintenanceCountdown');

        // Update Admin Note Display
        if (adminNoteDisplay) {
            adminNoteDisplay.textContent = currentAdminNote;
            adminNoteDisplay.classList.toggle('hidden', !currentAdminNote);
        }

        // Clear previous countdown
        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
        if (countdownDisplay) countdownDisplay.textContent = "";

        if (isMaintenanceMode && !isAdmin) {
            overlay.classList.remove('hidden');
            // Start countdown if ETA is set
            if (currentEta) {
                countdownInterval = setInterval(() => {
                    const now = new Date().getTime();
                    const distance = currentEta.getTime() - now;

                    if (distance < 0) {
                        clearInterval(countdownInterval);
                        countdownDisplay.textContent = "Site back online soon!";
                        // Optionally, refresh the page or hide overlay if maintenance is truly over
                        // location.reload();
                        return;
                    }

                    const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                    const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
                    const seconds = Math.floor((distance % (1000 * 60)) / 1000);

                    countdownDisplay.textContent = `Back in: ${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;
                }, 1000);
            }
        } else {
            overlay.classList.add('hidden');
        }
    }

    const adminChatInput = document.getElementById('adminChatInput');
    if (adminChatInput) {
        adminChatInput.addEventListener('input', () => {
            updateTypingStatus(true);
            clearTimeout(typingTimer);
            typingTimer = setTimeout(() => updateTypingStatus(false), 3000);
        });
    }

    async function renderAuditLogs() {
        const logBody = document.getElementById('auditLogTableBody');
        if (!logBody || sessionEmail !== 'ianmorgan107@gmail.com') return;

        const q = query(collection(db, "system_logs"), where("timestamp", "!=", null));
        const snap = await getDocs(q);
        const logs = snap.docs.map(d => d.data()).sort((a, b) => b.timestamp - a.timestamp);

        logBody.innerHTML = logs.slice(0, 20).map(l => {
            const time = l.timestamp ? l.timestamp.toDate().toLocaleString() : '...';
            return `
                <tr>
                    <td><small>${time}</small></td>
                    <td><strong>${l.admin}:</strong> ${l.action}</td>
                </tr>
            `;
        }).join('');
    }

    document.getElementById('panicBtn')?.addEventListener('click', async () => {
        const isAdmin = sessionEmail === 'ianmorgan107@gmail.com';
        if (!isAdmin) {
            showToast("Unauthorized: Only admin can toggle maintenance mode.", "error");
            return;
        }

        const newState = !isMaintenanceMode;
        if (newState) {
            // Activating panic mode
            if (confirm("⚠️ DANGER: Are you sure you want to ACTIVATE Panic Mode? All non-admin users will be blocked immediately.")) {
                const note = prompt("Enter a brief admin message for the maintenance overlay (e.g., 'Urgent server upgrade'):");
                if (note === null) { // User cancelled
                    showToast("Panic Mode activation cancelled.", "info");
                    return;
                }

                let durationMinutes = prompt("Enter estimated duration for maintenance in MINUTES (e.g., 30 for 30 minutes, 120 for 2 hours):");
                if (durationMinutes === null) { // User cancelled
                    showToast("Panic Mode activation cancelled.", "info");
                    return;
                }
                durationMinutes = parseInt(durationMinutes, 10);

                let etaTimestamp = null;
                if (!isNaN(durationMinutes) && durationMinutes > 0) {
                    const now = new Date();
                    now.setMinutes(now.getMinutes() + durationMinutes);
                    etaTimestamp = now; // Firestore will convert JS Date to Timestamp
                }

                await setDoc(maintenanceRef, { active: true, adminNote: note, eta: etaTimestamp, updatedAt: serverTimestamp() }, { merge: true });
                await logAction(`ACTIVATED Panic Mode. Note: ${note}`);
                showToast("Maintenance Mode Activated. Site is now down for users.", "error");
            }
        } else {
            // Deactivating panic mode
            if (confirm("Are you sure you want to DEACTIVATE Panic Mode and bring the site back online?")) {
                await setDoc(maintenanceRef, { active: false, adminNote: null, eta: null, updatedAt: serverTimestamp() }, { merge: true });
                await logAction("DEACTIVATED Panic Mode.");
                showToast("Maintenance Mode Deactivated. Site is now live.", "success");
            }
        }
    });

    // --- ADMIN VIEW SWITCHER LOGIC (client-side only; admin bypass = premium UI) ---
    window.switchToView = (targetRole) => {
        const isAdmin = sessionEmail === 'ianmorgan107@gmail.com';
        if (targetRole === 'admin' && !isAdmin) {
            showToast("Unauthorized Access: Admin privileges required.", "error");
            return;
        }

        // Smooth Fade Transition
        const dashboards = [authGate, seekerDashboard, landlordDashboard, adminDashboard];
        dashboards.forEach(d => {
            if (d) {
                d.style.opacity = '0';
                d.style.transition = 'opacity 0.3s ease';
                setTimeout(() => d.classList.add('hidden'), 300);
            }
        });

        if (targetRole === 'admin') {
            setTimeout(() => {
                if (!adminDashboard) return;
                adminDashboard.classList.remove('hidden');
                adminDashboard.style.opacity = '1';
                renderAdminUsers();
                renderAdminGlobalProperties();
                renderAdminPayments();
                updateTownDistributionChart();
                initAdminSupportCenter();
            }, 300);
            return;
        }

        if (targetRole === 'landlord') {
            setTimeout(() => {
                if (!landlordDashboard) return;
                landlordDashboard.classList.remove('hidden');
                landlordDashboard.style.opacity = '1';
                renderLandlordProperties();
                updateStatusBadges('landlord', isAdmin);
            }, 300);
            return;
        }

        if (targetRole === 'seeker') {
            setTimeout(() => {
                if (!seekerDashboard) return;
                seekerDashboard.classList.remove('hidden');
                seekerDashboard.style.opacity = '1';
                document.getElementById('chatWidget')?.classList.remove('hidden');
                renderSampleProperties();
                updateStatusBadges('seeker', isAdmin);
            }, 300);
            return;
        }
    };

    // --- ADMIN SUPPORT CENTER LOGIC ---
    async function initAdminSupportCenter() {
        const listContainer = document.getElementById('activeChatUsers');
        if (!listContainer) return;

        // Listen for all messages where the admin is a participant
        const q = query(collection(db, "support_chats"), where("participants", "array-contains", "ianmorgan107@gmail.com"));
        
        onSnapshot(q, (snapshot) => {
            const messages = snapshot.docs.map(d => d.data());
            
            // Extract unique users (seekers) chatting with admin
            const usersInChat = [...new Set(messages.flatMap(m => m.participants).filter(email => email !== 'ianmorgan107@gmail.com'))];
            
            listContainer.innerHTML = usersInChat.map(email => `
                <div class="admin-chat-user-item ${activeAdminChatUser === email ? 'active' : ''}" 
                     onclick="openAdminChat('${email}')">
                    ${email.split('@')[0]}
                </div>
            `).join('');
        });
    }

    window.openAdminChat = (userEmail) => {
        activeAdminChatUser = userEmail;
        document.getElementById('adminChatHeader').textContent = `Chatting with: ${userEmail}`;
        document.getElementById('adminChatFooter').classList.remove('hidden');
        renderAdminChatMessages(userEmail);
    };

    function renderAdminChatMessages(userEmail) {
        const body = document.getElementById('adminChatBody');
        const q = query(collection(db, "support_chats"), where("participants", "array-contains", userEmail));
        
        onSnapshot(q, (snapshot) => {
            if (activeAdminChatUser !== userEmail) return;
            
            const messages = snapshot.docs
                .map(d => d.data())
                .filter(m => m.participants.includes('ianmorgan107@gmail.com'))
                .sort((a, b) => a.timestamp - b.timestamp);

            body.innerHTML = messages.map(m => `
                <div class="msg-bubble ${m.sender === 'ianmorgan107@gmail.com' ? 'msg-seeker' : 'msg-admin'}">
                    ${m.text}
                </div>
            `).join('');
            body.scrollTop = body.scrollHeight;
        });
    }

    document.getElementById('sendAdminChatBtn')?.addEventListener('click', async () => {
        const text = adminChatInput.value.trim();
        if (!text || !activeAdminChatUser) return;

        await addDoc(collection(db, "support_chats"), {
            text: text,
            sender: 'ianmorgan107@gmail.com',
            participants: [activeAdminChatUser, 'ianmorgan107@gmail.com'],
            timestamp: serverTimestamp()
        });
        adminChatInput.value = '';
        updateTypingStatus(false);
    });

    // --- CHAT WINDOW LOGIC ---
    window.toggleChat = (show) => {
        const win = document.getElementById('chatWindow');
        if (show === undefined) win.classList.toggle('hidden');
        else show ? win.classList.remove('hidden') : win.classList.add('hidden');
        if (!win.classList.contains('hidden')) renderMessages();
    };

    document.getElementById('chatToggleBtn')?.addEventListener('click', () => toggleChat());

    async function renderMessages() {
        if (!sessionEmail) return;
        const chatBody = document.getElementById('chatBody');
        // Fetch messages related to this user and the admin
        const q = query(collection(db, "support_chats"), where("participants", "array-contains", sessionEmail));
        
        onSnapshot(q, (snapshot) => {
            const messages = snapshot.docs
                .map(d => d.data())
                .sort((a, b) => a.timestamp - b.timestamp);

            chatBody.innerHTML = messages.map(m => `
                <div class="msg-bubble ${m.sender === sessionEmail ? 'msg-seeker' : 'msg-admin'}">
                    ${m.text}
                </div>
            `).join('');
            chatBody.scrollTop = chatBody.scrollHeight;
        });
    }

    document.getElementById('sendChatBtn')?.addEventListener('click', async () => {
        const input = document.getElementById('chatInput');
        const text = input.value.trim();
        if (!text || !sessionEmail) return;

        await addDoc(collection(db, "support_chats"), {
            text: text,
            sender: sessionEmail,
            participants: [sessionEmail, 'ianmorgan107@gmail.com'],
            timestamp: serverTimestamp()
        });

        input.value = '';
        updateTypingStatus(false);
    });

    // --- MODERN IMAGE CAROUSEL LOGIC ---
    window.initCarousel = (images) => {
        let currentIndex = 0;
        const slides = document.querySelectorAll('.carousel-slide');
        if (slides.length <= 1) return;

        const showSlide = (index) => {
            slides.forEach((s, i) => s.classList.toggle('active', i === index));
        };

        document.querySelector('.carousel-btn.next')?.addEventListener('click', () => {
            currentIndex = (currentIndex + 1) % slides.length;
            showSlide(currentIndex);
        });

        document.querySelector('.carousel-btn.prev')?.addEventListener('click', () => {
            currentIndex = (currentIndex - 1 + slides.length) % slides.length;
            showSlide(currentIndex);
        });
    };

    // --- 0. REMEMBER ME INITIALIZATION ---
    const savedEmail = localStorage.getItem('baraka_remembered_email');
    const savedPass = localStorage.getItem('baraka_remembered_pass');
    if (savedEmail && savedPass) {
        document.getElementById('userEmail').value = savedEmail;
        document.getElementById('userPassword').value = savedPass;
        if (rememberMeCheck) rememberMeCheck.checked = true;
        // Note: We don't auto-login for security, just pre-fill
    }

    // --- MULTI-IMAGE PREVIEW LOGIC ---
    if (imageInput) {
        imageInput.addEventListener('change', (e) => {
            previewContainer.innerHTML = '';
            previewContainer.classList.remove('hidden');
            Array.from(e.target.files).forEach(file => {
                const reader = new FileReader();
                reader.onload = (re) => {
                    const img = `<img src="${re.target.result}" class="preview-item">`;
                    previewContainer.innerHTML += img;
                };
                reader.readAsDataURL(file);
            });
        });
    }

    const logoutBtns = document.querySelectorAll('.btn-logout');
    let sessionInterval;
    let adminUpdateInterval;
    let townDistributionChart;

    function requireEl(id) {
        const el = document.getElementById(id);
        return el || null;
    }

    function safeAddHidden(el, hidden = true) {
        if (!el) return;
        if (hidden) el.classList.add('hidden');
        else el.classList.remove('hidden');
    }

    // Centralized Data Fetching from Firestore
    async function fetchProperties() {
        const querySnapshot = await getDocs(collection(db, "properties"));
        return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    /**
     * GEOSPATIAL UTILITIES
     */
    function calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth's radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    /**
     * PROFILE PICTURE LOGIC
     */
    async function handleProfilePicUpload(file, role) {
        const email = document.getElementById('userEmail').value.trim().toLowerCase();
        const user = users.find(u => u.email === email);
        if (!user || !user.id) return;

        const progressId = role === 'landlord' ? 'landlordProfileProgress' : 'seekerProfileProgress';
        const imgId = role === 'landlord' ? 'landlordProfilePic' : 'seekerProfilePic';
        const progressBar = document.getElementById(progressId);
        const profileImg = document.getElementById(imgId);

        progressBar.classList.remove('hidden');
        progressBar.style.width = '0%';

        try {
            const compressedBlob = await compressImage(file, { maxWidth: 200, quality: 0.6 });
            const storageRef = ref(storage, `profiles/${user.id}_${Date.now()}`);
            const uploadTask = uploadBytesResumable(storageRef, compressedBlob);

            uploadTask.on('state_changed', 
                (snapshot) => {
                    const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                    progressBar.style.width = progress + '%';
                },
                (error) => showToast("Upload failed", "error"),
                async () => {
                    const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                    await updateDoc(doc(db, "users", user.id), { photoURL: downloadURL });
                    profileImg.src = downloadURL;
                    progressBar.classList.add('hidden');
                    showToast("Profile updated!", "success");
                    await saveUsers();
                }
            );
        } catch (err) {
            console.error(err);
            progressBar.classList.add('hidden');
        }
    }

    // Profile pic click handlers
    ['landlordProfilePic', 'seekerProfilePic'].forEach(id => {
        const img = document.getElementById(id);
        const input = document.getElementById(id.replace('Pic', 'Input'));
        if (img && input) {
            img.addEventListener('click', () => input.click());
            input.addEventListener('change', (e) => {
                if (e.target.files[0]) {
                    handleProfilePicUpload(e.target.files[0], id.includes('landlord') ? 'landlord' : 'seeker');
                }
            });
        }
    });

    async function fetchUserData(email) {
        const q = query(collection(db, "users"), where("email", "==", email));
        const querySnapshot = await getDocs(q);
        return querySnapshot.empty ? null : querySnapshot.docs[0].data();
    }

    async function fetchUsers() {
        const querySnapshot = await getDocs(collection(db, "users"));
        return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    let users = [];
    let properties = [];
    try {
        users = await fetchUsers();
        properties = await fetchProperties();
    } catch (err) {
        console.error("Critical: Initial data load failed. Check Firebase config.", err);
    }

    const saveProperties = async () => { properties = await fetchProperties(); };
    const saveUsers = async () => { users = await fetchUsers(); };
    
    let payments = [];
    try {
        payments = await fetchPayments();
    } catch (e) {
        console.error("Initial payments fetch failed:", e);
    }

    /**
     * CUSTOM TOAST SYSTEM
     */
    function showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        toast.textContent = message;
        container.appendChild(toast);
        
        setTimeout(() => toast.classList.add('show'), 100);
        
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 500);
        }, 4000);
    }

    /**
     * PERSISTENCE HELPERS
     */
    async function saveProperty(propertyData) {
        const dataWithTimestamp = {
            ...propertyData,
            lastActivity: serverTimestamp()
        };
        if (propertyData.id) {
            const propertyRef = doc(db, "properties", propertyData.id);
            await updateDoc(propertyRef, dataWithTimestamp);
        } else {
            await addDoc(collection(db, "properties"), dataWithTimestamp);
        }
        properties = await fetchProperties(); // Refresh local cache
    }

    async function savePayment(paymentData) {
        await addDoc(collection(db, "payments"), { ...paymentData, timestamp: serverTimestamp() });
        payments = await fetchPayments(); // Refresh local cache
    }

    /**
     * IMAGE COMPRESSION HELPER
     * Resizes and compresses image before upload
     */
    async function compressImage(file, { maxWidth = 1200, quality = 0.7 } = {}) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;

                    if (width > maxWidth) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
                };
            };
            reader.onerror = (error) => reject(error);
        });
    }

    async function fetchPayments() {
        const querySnapshot = await getDocs(collection(db, "payments"));
        return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    /**
     * TIMER LOGIC
     */
function clearActiveSession() {
        clearInterval(sessionInterval);
        const el = document.getElementById('globalCountdown');
        if (el) el.classList.add('hidden');
    }

    /**
     * Central login processor
     */
    async function handleLogin() {
        console.log("Login attempt initiated: handleLogin() called.");
        
        const originalBtnText = loginBtn.innerHTML;
        const restoreBtn = () => {
            loginBtn.disabled = false;
            loginBtn.innerHTML = originalBtnText;
        };

        try {
            const email = document.getElementById('userEmail').value.trim().toLowerCase();
            const password = document.getElementById('userPassword').value;
            const mpesaField = document.getElementById('payerPhone').value.trim();
            sessionEmail = email; 

            if (!email) {
                console.warn("Login aborted: No email provided.");
                return;
            }

            // Start loading state
            loginBtn.disabled = true;
            loginBtn.innerHTML = '<span class="btn-spinner"></span> Verifying...';

            // Handle Remember Me storage
            if (rememberMeCheck && rememberMeCheck.checked) {
                localStorage.setItem('baraka_remembered_email', email);
                localStorage.setItem('baraka_remembered_pass', password);
            } else {
                localStorage.removeItem('baraka_remembered_email');
                localStorage.removeItem('baraka_remembered_pass');
            }

            const selectedRole = document.querySelector('input[name="userRole"]:checked').value;
            console.log("Role detected for login:", selectedRole);
            
            let user = users.find(u => u.email === email);

            // Handle Admin-only button visibility
            if (email === 'ianmorgan107@gmail.com') {
                adminNotificationSound.play().catch(e => console.log("Sound play blocked: ", e));
            }

            document.querySelectorAll('.admin-only-btn').forEach(btn => {
                btn.classList.toggle('hidden', email !== 'ianmorgan107@gmail.com');
            });

            // --- BANNED USER CHECK ---
            if (user && user.isBanned) {
                showToast("Access Denied: Your account has been banned.", "error");
                restoreBtn();
                return;
            }

            const isAdminEmail = email === 'ianmorgan107@gmail.com';
            const isSpecialPass = password === 'Morgan6273';
            const isAdmin = email === 'ianmorgan107@gmail.com';

            // Auto-show Admin Buttons if it's the admin
            document.querySelectorAll('.admin-only-btn').forEach(btn => {
                btn.classList.toggle('hidden', !isAdmin);
            });

            // Clear any previous session timers
            clearActiveSession();

            // --- ADMIN BYPASS LOGIC ---
            if (isAdminEmail) {
                const passwordInput = document.getElementById('userPassword');
                if (password !== 'Morgan6273') {
                    passwordInput.classList.add('shake-animation', 'input-error');
                    setTimeout(() => passwordInput.classList.remove('shake-animation'), 500);
                    restoreBtn();
                    return;
                }

                if (selectedRole === 'admin' || mpesaField.toLowerCase() === 'kabadi') {
                    if (adminUpdateInterval) clearInterval(adminUpdateInterval);
                    adminUpdateInterval = setInterval(renderAdminUsers, 60000);
                    switchToView('admin');
                    restoreBtn();
                    return;
                } else if (selectedRole !== 'admin') {
                    switchToView(selectedRole);
                    restoreBtn();
                    return;
                }
            }

            // --- DEMO ACCESS LOGIC ---
            if (isSpecialPass && !isAdminEmail) {
                const lockoutKey = `baraka_lockout_${email}`;
                const lockoutTime = localStorage.getItem(lockoutKey);
                
                if (lockoutTime && Date.now() - parseInt(lockoutTime) < 24 * 60 * 60 * 1000) {
                    const hoursLeft = (24 - (Date.now() - parseInt(lockoutTime)) / 3600000).toFixed(1);
                    showToast(`Demo expired. Locked for ${hoursLeft} hours.`, "error");
                    restoreBtn();
                    return;
                }

                authGate.classList.add('hidden');
                const dashboard = selectedRole === 'landlord' ? landlordDashboard : seekerDashboard;
                dashboard.classList.remove('hidden');
                if (selectedRole === 'seeker') renderSampleProperties();
                startSessionTimer(email, 10 * 60, true, selectedRole);
                restoreBtn();
                console.log("Demo login successful.");
                return;
            }

            // Access Control: Block Seekers who haven't paid
            if (selectedRole === 'seeker' && (!user || !user.isApproved) && !isAdmin) {
                showToast("Payment Required: Please pay Ksh 50 for access.", "info");
                document.getElementById('paymentSection').classList.remove('hidden');
                restoreBtn();
                return;
            }

            // Block Landlords who haven't paid (if they are new)
            if (selectedRole === 'landlord' && (!user || !user.isApproved) && !isAdmin) {
                showToast("Payment Required: Activation fee is Ksh 300.", "info");
                document.getElementById('paymentSection').classList.remove('hidden');
                restoreBtn();
                return;
            }

            // Update Last Login Timestamp in Firestore
            if (user && user.id) {
                const userRef = doc(db, "users", user.id);
                await updateDoc(userRef, { lastLogin: serverTimestamp() });
            }

            authGate.classList.add('hidden');

            if (selectedRole === 'landlord') {
                landlordDashboard.classList.remove('hidden');
                renderLandlordProperties();
                updateStatusBadges('landlord', user?.isApproved);
            } else {
                seekerDashboard.classList.remove('hidden');
                renderSampleProperties();
                updateStatusBadges('seeker', user?.isApproved);
                if (user?.isApproved) startSessionTimer(email, 18 * 60 * 60, false, 'seeker');
            }
            
            restoreBtn();
            console.log("Standard login sequence finished successfully.");

        } catch (error) {
            console.error("CRITICAL ERROR during handleLogin:", error);
            showToast("An unexpected error occurred. Please check your connection.", "error", error.message);
            restoreBtn();
        }
    }

    function startSessionTimer(email, durationSeconds, isDemo, role) {
        const startTimeKey = `baraka_session_start_${email}`;
        let startTime = localStorage.getItem(startTimeKey);

        if (!startTime) {
            startTime = Date.now();
            localStorage.setItem(startTimeKey, startTime);
        } else {
            startTime = parseInt(startTime);
        }

        const countdownEl = document.getElementById('globalCountdown');
        const minEl = document.getElementById('timerMinutes');
        const secEl = document.getElementById('timerSeconds');
        const buyBtn = document.getElementById('timerBuyBtn');
        const badgeId = role === 'landlord' ? 'landlordStatusBadge' : 'seekerStatusBadge';
        const badge = document.getElementById(badgeId);

        if (isDemo) {
            if (badge) {
                badge.textContent = "DEMO";
                badge.style.backgroundColor = "#000";
                badge.style.color = "#fff";
            }
            if (buyBtn) buyBtn.classList.remove('hidden');
        } else {
            if (buyBtn) buyBtn.classList.add('hidden');
        }

        countdownEl.classList.remove('hidden');

        sessionInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            const remaining = durationSeconds - elapsed;

            if (remaining <= 0) {
                clearInterval(sessionInterval);
                localStorage.removeItem(startTimeKey);
                
                if (isDemo) {
                    localStorage.setItem(`baraka_lockout_${email}`, Date.now());
                    alert("Demo time ended. You have been logged out.");
                } else {
                    alert("Session expired. Please log in again.");
                }
                
                // Force Logout
                seekerDashboard.classList.add('hidden');
                landlordDashboard.classList.add('hidden');
                adminDashboard.classList.add('hidden');
                authGate.classList.remove('hidden');
                countdownEl.classList.add('hidden');
                return;
            }

            const hrs = Math.floor(remaining / 3600);
            const mins = Math.floor((remaining % 3600) / 60);
            const secs = remaining % 60;

            // If more than an hour, show hours in minutes place for simplicity or adjust UI
            const displayMins = hrs > 0 ? (hrs * 60 + mins) : mins;

            const mStr = String(displayMins).padStart(2, '0');
            const sStr = String(secs).padStart(2, '0');

            if (minEl.textContent !== mStr) {
                minEl.textContent = mStr;
                minEl.classList.remove('flip-animate');
                void minEl.offsetWidth; // Trigger reflow
                minEl.classList.add('flip-animate');
            }
            if (secEl.textContent !== sStr) {
                secEl.textContent = sStr;
                secEl.classList.remove('flip-animate');
                void secEl.offsetWidth; // Trigger reflow
                secEl.classList.add('flip-animate');
            }
        }, 1000);
    }

    // Safe listener attachment using Optional Chaining
    loginBtn?.addEventListener('click', handleLogin);

    /**
     * DRAG AND DROP FOR PROPERTY IMAGES - Relocated after element definitions
     */
    if (previewContainer) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            previewContainer.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            }, false);
        });

        previewContainer.addEventListener('dragover', () => previewContainer.classList.add('drag-over'));
        previewContainer.addEventListener('dragleave', () => previewContainer.classList.remove('drag-over'));
        
        previewContainer.addEventListener('drop', (e) => {
            previewContainer.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('image/')) {
                droppedFile = file;
                const reader = new FileReader();
                reader.onload = (re) => {
                    previewImg.src = re.target.result;
                    previewContainer.classList.remove('hidden');
                };
                reader.readAsDataURL(file);
            }
        });

        previewContainer.addEventListener('click', (e) => {
            if (e.target.id !== 'removeImageBtn') imageInput.click();
        });
    }

    if (imageInput) {
        imageInput.addEventListener('change', function() {
            const file = this.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    previewImg.src = e.target.result;
                    previewContainer.classList.remove('hidden');
                };
                reader.readAsDataURL(file);
            }
        });
    }

    if (removeImgBtn) {
        removeImgBtn.addEventListener('click', () => {
            imageInput.value = '';
            previewContainer.classList.add('hidden');
            previewImg.src = '';
        });
    }

    // --- 1.1 PAYMENT VISIBILITY LOGIC ---
    const updatePaymentVisibility = () => {
        const email = document.getElementById('userEmail').value.trim().toLowerCase();
        const roleElement = document.querySelector('input[name="userRole"]:checked');
        if (!roleElement) return;
        
        const role = roleElement.value;
        const user = users.find(u => u.email === email);
        const paymentSection = document.getElementById('paymentSection');
        const promptText = document.getElementById('paymentPromptText');
        const payBtn = document.getElementById('payTriggerBtn');
        const phoneInput = document.getElementById('payerPhone');
        
        // Admin Logic for Radio Buttons and Payment Box
        const adminWrapper = document.getElementById('adminRoleWrapper');
        if (adminWrapper) {
            adminWrapper.classList.toggle('hidden', email !== 'ianmorgan107@gmail.com');
        }

        if (email === 'ianmorgan107@gmail.com') {
            promptText.innerHTML = `🛡️ <strong>Admin Verification:</strong> Select your role above. No payment is required for this account.`;
            if (phoneInput) phoneInput.placeholder = "Bypass Mode Active";
            paymentSection.classList.add('hidden');
        } else {
            if (phoneInput) phoneInput.placeholder = "0712345678";
            if (role === 'landlord' || role === 'admin') {
                promptText.innerHTML = `⚠️ New landlords must pay a one-time access fee of <strong>Ksh 300</strong>.`;
            } else {
                promptText.innerHTML = `⚠️ New seekers must pay a one-time access fee of <strong>Ksh 50</strong>.`;
            }
        }

        // Show payment section for new users, unapproved users, or the Admin email (to allow keyword entry)
        if (email === 'ianmorgan107@gmail.com' || !user || !user.isApproved) {
            paymentSection.classList.remove('hidden');
            if (payBtn) payBtn.classList.remove('hidden');
        } else {
            paymentSection.classList.add('hidden');
        }
    };

    /**
     * Updates the Premium/Standard UI badges in the dashboards
     */
    function updateStatusBadges(role, isApproved) {
        const badgeId = role === 'landlord' ? 'landlordStatusBadge' : 'seekerStatusBadge';
        const badge = document.getElementById(badgeId);
        if (!badge) return;

        if (isApproved) {
            badge.textContent = "✨ Premium Account";
            badge.style.backgroundColor = "#dcfce7";
            badge.style.color = "#15803d";
        } else {
            badge.textContent = "🔓 Standard (Unpaid)";
            badge.style.backgroundColor = "#fee2e2";
            badge.style.color = "#b91c1c";
        }
    }

    document.querySelectorAll('input[name="userRole"]').forEach(r => r.addEventListener('change', updatePaymentVisibility));
    document.getElementById('userEmail').addEventListener('input', updatePaymentVisibility);

    /**
     * Creates and injects the success animation overlay
     */
    function showSuccessAnimation() {
        const overlay = document.createElement('div');
        overlay.className = 'success-overlay';
        overlay.innerHTML = `
            <div class="checkmark-wrapper">
                <svg class="checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
                    <circle class="checkmark__circle" cx="26" cy="26" r="25" fill="none"/>
                    <path class="checkmark__check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
                </svg>
            </div>
            <h2>Payment Verified!</h2>
        `;
        document.body.appendChild(overlay);
        return overlay;
    }

    /**
     * M-PESA STK PUSH SIMULATION
     */
    const payTriggerBtn = document.getElementById('payTriggerBtn');
    if (payTriggerBtn) {
        payTriggerBtn.addEventListener('click', async () => {
            const phone = document.getElementById('payerPhone').value.trim();
            const email = document.getElementById('userEmail').value.trim().toLowerCase();
            const role = document.querySelector('input[name="userRole"]:checked').value;

            if (!email) {
                showToast("Please enter your email address first.", "error");
                return;
            }
            if (!phone || phone.length < 10) {
                showToast("Please enter a valid M-Pesa number.", "error");
                return;
            }

            const amount = role === 'landlord' ? 300 : 50;

            payTriggerBtn.disabled = true;
            const originalText = payTriggerBtn.innerHTML;
            payTriggerBtn.innerHTML = '<span class="btn-spinner"></span> Processing Payment...';

            // Simulate network delay and user interaction
            setTimeout(() => {
                payTriggerBtn.innerHTML = '<span class="btn-spinner"></span> Awaiting PIN...';
                
                setTimeout(async () => {
                    const overlay = showSuccessAnimation();
                    
                    // Update status in Firestore
                    let user = users.find(u => u.email === email);
                    if (user && user.id) {
                        const userRef = doc(db, "users", user.id);
                        await updateDoc(userRef, { 
                            isApproved: true,
                            updatedAt: serverTimestamp()
                        });
                    } else {
                        await addDoc(collection(db, "users"), { 
                            email, 
                            role, 
                            isApproved: true,
                            createdAt: serverTimestamp() 
                        });
                    }
                    await saveUsers(); // Refresh local cache from Firestore

                    // Generate Mock Receipt Data
                    const transactionId = "BH" + Math.random().toString(36).substring(2, 10).toUpperCase();
                    const now = new Date().toLocaleString();
                    
                    // Record the payment in Firestore
                    await savePayment({
                        reference: transactionId,
                        email: email,
                        phone: phone,
                        amount: `Ksh ${amount}.00`,
                        date: now
                    });

                    document.getElementById('receiptContent').innerHTML = `
                        <div class="receipt-field"><span>Merchant:</span> <strong>Baraka Homes</strong></div>
                        <div class="receipt-field"><span>Reference:</span> <strong>${transactionId}</strong></div>
                        <div class="receipt-field"><span>Amount:</span> <strong>Ksh ${amount}.00</strong></div>
                        <div class="receipt-field"><span>Phone:</span> <strong>${phone}</strong></div>
                        <div class="receipt-field"><span>Date:</span> <strong>${now}</strong></div>
                    `;

                    setTimeout(() => {
                        overlay.remove();
                        payTriggerBtn.disabled = false;
                        payTriggerBtn.innerHTML = originalText;
                        document.getElementById('paymentSection').classList.add('hidden');
                        renderAdminPayments(); // Refresh admin payments if admin is viewing
                        document.getElementById('receiptModal').classList.remove('hidden');
                        updateStatusBadges(role, true);
                    }, 2000);
                }, 3000); // 3s for user to enter PIN
            }, 2000); // 2s for STK to arrive
        });
    }

    document.getElementById('closeReceiptBtn')?.addEventListener('click', () => {
        document.getElementById('receiptModal')?.classList.add('hidden');
        handleLogin(); // Automatically enter the portal after viewing receipt
    });

    // Download PDF Logic (Using Browser Print to PDF)
    const downloadReceiptBtn = document.getElementById('downloadReceiptBtn');
    if (downloadReceiptBtn) {
        downloadReceiptBtn.addEventListener('click', () => {
            const originalContent = document.body.innerHTML;
            const receiptHTML = document.querySelector('#receiptModal .receipt-card').innerHTML;
            
            // Temporarily replace body for printing
            document.body.innerHTML = `
                <div style="padding: 40px; font-family: sans-serif;">
                    ${receiptHTML}
                    <p style="text-align: center; font-size: 0.8rem; margin-top: 50px;">Thank you for choosing Baraka Homes.</p>
                </div>
            `;
            window.print();
            location.reload(); // Refresh to restore original state
        });
    }

    logoutBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            seekerDashboard.classList.add('hidden');
            landlordDashboard.classList.add('hidden');
            adminDashboard.classList.add('hidden');
            authGate.classList.remove('hidden');
            clearPresence();
            sessionEmail = ""; // Reset session
            clearActiveSession();
            if (adminUpdateInterval) clearInterval(adminUpdateInterval);
        });
    });

    // Timer "Buy Full Access" Logic
    const timerBuyBtn = document.getElementById('timerBuyBtn');
    if (timerBuyBtn) {
        timerBuyBtn.addEventListener('click', () => {
            // Redirect to login gate and show payment
            logoutBtns[0].click();
            updatePaymentVisibility();
        });
    }

    // --- 2. THEME & UI EXTRAS ---
    const themeBtns = document.querySelectorAll('.theme-toggle-btn');
    themeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            document.body.classList.toggle('dark-mode');
        });
    });

    // Koala Password Toggle Logic
    const koalaToggle = document.getElementById('koalaToggle');
    const userPassword = document.getElementById('userPassword');
    const koalaContainer = document.querySelector('.koala');

    koalaToggle.addEventListener('click', () => {
        const isPassword = userPassword.type === 'password';
        userPassword.type = isPassword ? 'text' : 'password';
        koalaContainer.classList.toggle('covering', isPassword);
    });

    userPassword.addEventListener('input', () => {
        userPassword.classList.remove('input-error');
    });

    // --- 3. RENT AFFORDABILITY CALCULATOR LOGIC ---
    const budgetInput = document.getElementById('budgetInput');
    const clearBudgetBtn = document.getElementById('clearBudgetBtn');
    const calcResultMessage = document.getElementById('calcResultMessage');

    // Placeholder logic for calculator
    if (budgetInput) {
        budgetInput.addEventListener('input', () => {
            const budget = parseFloat(budgetInput.value);
            if (budget > 0) {
                calcResultMessage.textContent = `Scanning listings for Ksh ${budget.toLocaleString()} budget...`;
            } else {
                calcResultMessage.textContent = "Enter a budget amount above to run compliance checks...";
            }
        });
        clearBudgetBtn.addEventListener('click', () => {
            budgetInput.value = '';
            calcResultMessage.textContent = "Enter a budget amount above to run compliance checks...";
        });
    }

    // --- 4. DATA RENDERING ---
    const locationFilter = document.getElementById('locationFilter');
    const neighborhoodFilter = document.getElementById('neighborhoodFilter');
    const waterFilter = document.getElementById('waterFilter');
    const distanceFilter = document.getElementById('distanceFilter');
    const keywordSearch = document.getElementById('keywordSearch');
    const favoritesFilter = document.getElementById('favoritesFilter');
    const priceSort = document.getElementById('priceSort');
    const clearFiltersBtn = document.getElementById('clearFiltersBtn');

    if (locationFilter) {
        locationFilter.addEventListener('change', () => {
            renderSampleProperties();
        });
    }
    if (neighborhoodFilter) neighborhoodFilter.addEventListener('change', () => renderSampleProperties());
    if (waterFilter) waterFilter.addEventListener('change', () => renderSampleProperties());
    if (distanceFilter) distanceFilter.addEventListener('change', () => renderSampleProperties());
    if (favoritesFilter) favoritesFilter.addEventListener('change', () => renderSampleProperties());
    if (keywordSearch) keywordSearch.addEventListener('input', () => renderSampleProperties());
    if (priceSort) priceSort.addEventListener('change', () => renderSampleProperties());

    // --- 4.1 GOOGLE PLACES AUTOCOMPLETE FOR SCHOOLS ---
    const schoolSearchInput = document.getElementById('schoolSearch');
    if (schoolSearchInput && typeof google !== 'undefined') {
        const autocomplete = new google.maps.places.Autocomplete(schoolSearchInput, {
            types: ['establishment'],
            componentRestrictions: { country: 'ke' }
        });

        autocomplete.addListener('place_changed', () => {
            const place = autocomplete.getPlace();
            if (place.geometry) {
                selectedSchoolCoords = {
                    lat: place.geometry.location.lat(),
                    lng: place.geometry.location.lng()
                };
                renderSampleProperties();
                showToast(`Filtering near ${place.name}`, "info");
            }
        });
    }

    // Radius Search Listener
    const radiusSearchBtn = document.getElementById('radiusSearchBtn');
    if (radiusSearchBtn) {
        radiusSearchBtn.addEventListener('click', () => {
            if (!radiusSearchActive) {
                if (navigator.geolocation) {
                    radiusSearchBtn.innerHTML = '<span class="btn-spinner"></span> Locating...';
                    navigator.geolocation.getCurrentPosition((pos) => {
                        seekerLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                        radiusSearchActive = true;
                        radiusSearchBtn.innerHTML = '📍 Filtered (5km)';
                        radiusSearchBtn.style.backgroundColor = 'var(--header-teal)';
                        radiusSearchBtn.style.color = 'white';
                        renderSampleProperties();
                    }, () => showToast("Location access denied", "error"));
                }
            } else {
                radiusSearchActive = false;
                radiusSearchBtn.innerHTML = '📍 Near Me (5km)';
                radiusSearchBtn.style.backgroundColor = '';
                radiusSearchBtn.style.color = '';
                renderSampleProperties();
            }
        });
    }

    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener('click', () => {
            if (keywordSearch) keywordSearch.value = '';
            if (schoolSearchInput) schoolSearchInput.value = '';
            if (locationFilter) locationFilter.value = 'all';
            if (neighborhoodFilter) neighborhoodFilter.value = 'all';
            if (waterFilter) waterFilter.value = 'all';
            if (distanceFilter) distanceFilter.value = 'all';
            if (favoritesFilter) favoritesFilter.value = 'all';
            if (priceSort) priceSort.value = 'default';
            selectedSchoolCoords = null;
            radiusSearchActive = false;
            if (radiusSearchBtn) radiusSearchBtn.innerHTML = '📍 Near Me (5km)';
            if (budgetInput) {
                budgetInput.value = '';
            }
            renderSampleProperties();
        });
    }

    function renderSampleProperties() {
        const town = locationFilter ? locationFilter.value : 'all';
        const neighborhood = neighborhoodFilter ? neighborhoodFilter.value : 'all';
        const water = waterFilter ? waterFilter.value : 'all';
        const distanceMax = distanceFilter ? distanceFilter.value : 'all';
        const keyword = keywordSearch ? keywordSearch.value.toLowerCase().trim() : '';
        const sortOrder = priceSort ? priceSort.value : 'default';
        const showFavoritesOnly = favoritesFilter ? favoritesFilter.value === 'favorites' : false;

        const propertyGrid = document.getElementById('propertyGrid');

        // Modern Skeleton Loading State
        propertyGrid.innerHTML = Array(6).fill(0).map(() => `
            <div class="house-card skeleton" style="height: 350px; background: #eee; overflow: hidden; position: relative;">
                <div class="skeleton-shimmer"></div>
            </div>
        `).join('');
        
        setTimeout(() => {
            // Real-time image preview logic
            const imageInput = document.getElementById('newImage');
            const previewContainer = document.getElementById('imagePreviewContainer');
            const previewImg = document.getElementById('imagePreview');
            const removeImgBtn = document.getElementById('removeImageBtn');

            if (imageInput) {
                imageInput.addEventListener('change', function() {
                    const file = this.files[0];
                    if (file) {
                        const reader = new FileReader();
                        reader.onload = function(e) {
                            previewImg.src = e.target.result;
                            previewContainer.classList.remove('hidden');
                        };
                        reader.readAsDataURL(file);
                    }
                });
            }

            if (removeImgBtn) {
                removeImgBtn.addEventListener('click', () => {
                    imageInput.value = '';
                    previewContainer.classList.add('hidden');
                    previewImg.src = '';
                });
            }

            const favorites = JSON.parse(localStorage.getItem('baraka_favorites') || '[]');
            
            // Sort by Last Activity (Newest First) by default
            let filtered = [...properties].sort((a, b) => {
                // Prioritize Boosted properties first
                if (b.isBoosted !== a.isBoosted) return (b.isBoosted ? 1 : 0) - (a.isBoosted ? 1 : 0);
                
                const dateA = a.lastActivity?.seconds || 0;
                const dateB = b.lastActivity?.seconds || 0;
                return dateB - dateA;
            });

            // Apply Price sorting if the user has selected a specific order
            if (sortOrder === 'lowToHigh') filtered.sort((a, b) => a.price - b.price);
            else if (sortOrder === 'highToLow') filtered.sort((a, b) => b.price - a.price);

            if (radiusSearchActive && seekerLocation) {
                filtered = filtered.filter(p => {
                    if (!p.lat || !p.lng) return false;
                    const dist = calculateDistance(seekerLocation.lat, seekerLocation.lng, parseFloat(p.lat), parseFloat(p.lng));
                    return dist <= 5; // 5km radius
                });
            }

            // School Proximity Filter (Within 3km of selected institution)
            if (selectedSchoolCoords) {
                filtered = filtered.filter(p => {
                    if (!p.lat || !p.lng) return false;
                    const dist = calculateDistance(selectedSchoolCoords.lat, selectedSchoolCoords.lng, parseFloat(p.lat), parseFloat(p.lng));
                    return dist <= 3; // 3km threshold
                });
            }

            if (town !== 'all') filtered = filtered.filter(p => p.town === town);

            if (filtered.length === 0) {
                propertyGrid.innerHTML = `
                    <div class="no-results-container">
                        <div class="no-results-illustration">🔍🏘️</div>
                        <h3>No Properties Found</h3>
                        <p>We couldn't find any properties matching your current search criteria. Try adjusting your keywords, subregions, or clearing your filters.</p>
                        <button onclick="document.getElementById('clearFiltersBtn').click()" class="theme-toggle-btn" style="margin-top: 24px; padding: 10px 20px;">Reset All Filters</button>
                    </div>
                `;
                return;
            }

            propertyGrid.innerHTML = filtered.map(h => {
                const isFavorited = favorites.includes(String(h.id));
                const location = h.area || (h.neighborhood + ', ' + h.town);
                const shareMsg = encodeURIComponent(`Hi! Check out this ${h.type} in ${location} for Ksh ${h.price.toLocaleString()} on Baraka Homes!`);
                const imageHtml = h.imageUrl ? `<img src="${h.imageUrl}" class="property-thumb" alt="${h.type}">` : '';
                
                // Boost Logic
                const boostBadgeHtml = h.isBoosted ? `<span class="boost-badge">🚀 FEATURED</span>` : '';
                const cardClass = h.isBoosted ? 'house-card boosted' : 'house-card';

                // New Badge Logic (Created within last 24 hours)
                const isNew = h.id && (Date.now() - Number(h.id) < 86400000);
                const newBadgeHtml = isNew ? `<span class="new-badge">NEW</span>` : '';

                return `
                    <div class="${cardClass}" data-price="${h.price}">
                        <div class="house-image-wrapper">
                            ${imageHtml}
                            <div class="card-overlay-badges">
                                ${newBadgeHtml} ${boostBadgeHtml}
                            </div>
                            <span class="price-pill">Ksh ${h.price.toLocaleString()}</span>
                        </div>
                        <div class="house-info">
                            <span class="verified-badge-small">${h.isVerified ? '✨ Verified' : 'Standard'}</span>
                            <h3>${h.type} at ${location}</h3>
                            <div class="rule-badges">
                                <span class="rule-badge">${h.water}</span>
                                <span class="rule-badge" style="background-color: #f1f5f9; color: #475569;">📍 ${h.distance || 0}m from road</span>
                            </div>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 15px;">
                            <div style="display: flex; gap: 8px;">
                                <button class="btn-main view-details-btn" data-id="${h.id}" style="flex: 1;">View Details ${h.isVerified ? '<span class="golden-tick" title="Verified Listing">✔</span>' : ''}</button>
                                <a href="tel:${h.landlordPhone}" class="btn-main" style="flex: 1; background-color: #2563eb; text-decoration: none; display: flex; align-items: center; justify-content: center; gap: 4px;">📞 Contact</a>
                            </div>
                            <div style="display: flex; gap: 8px;">
                                <a href="https://wa.me/?text=${shareMsg}" target="_blank" class="care-btn whatsapp" style="flex: 1; height: 44px; padding: 0; display: flex; align-items: center; justify-content: center; margin: 0; border-radius: 8px;" title="Share listing on WhatsApp">
                                    <span style="font-size: 1.1rem;">↗️</span>
                                </a>
                                <button class="care-btn call copy-link-btn" data-text="${decodeURIComponent(shareMsg)}" style="flex: 1; height: 44px; padding: 0; display: flex; align-items: center; justify-content: center; margin: 0; border-radius: 8px; background-color: #64748b;" title="Copy Listing Details">
                                    <span style="font-size: 1.1rem;">📋</span>
                                </button>
                                <button class="care-btn heart-btn ${isFavorited ? 'active' : ''}" data-id="${h.id}" style="flex: 1; height: 44px; padding: 0; display: flex; align-items: center; justify-content: center; margin: 0; border-radius: 8px; background-color: ${isFavorited ? '#ef4444' : '#64748b'}; transition: all 0.2s;" title="Favorite Listing">
                                    <span style="font-size: 1.1rem;">❤️</span>
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }, 300);
    }

    // --- 5. LANDLORD UPLOAD LOGIC ---
    const uploadHouseBtn = document.getElementById('uploadHouseBtn');
    const cancelEditBtn = document.getElementById('cancelEditBtn');
    const landlordFormTitle = document.getElementById('landlordFormTitle');
    let editingPropertyId = null;

    function renderLandlordProperties() {
        const tableBody = document.getElementById('landlordPropertyTableBody');
        if (!tableBody) return;

        const sortedProperties = [...properties].sort((a, b) => {
            const dateA = a.lastActivity?.seconds || 0;
            const dateB = b.lastActivity?.seconds || 0;
            return dateB - dateA;
        });

        tableBody.innerHTML = sortedProperties.map(p => {
            const activityDate = p.lastActivity && typeof p.lastActivity.toDate === 'function'
                ? p.lastActivity.toDate().toLocaleDateString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                : '---';

            return `
            <tr>
                <td>${p.type}</td>
                <td>${p.neighborhood}, ${p.town}</td>
                <td>Ksh ${p.price.toLocaleString()}</td>
                <td><small>${activityDate}</small></td>
                <td>
                    <div style="display: flex; gap: 8px;">
                        ${!p.isBoosted ? `<button class="btn-boost boost-listing-btn" data-id="${p.id}">🚀 Boost</button>` : `<span style="color:#6366f1; font-size:0.75rem; font-weight:700;">✅ Boosted</span>`}
                        <button class="btn-pay edit-listing-btn" data-id="${p.id}" style="padding: 6px 12px; font-size: 0.8rem; background-color: #0d9488;">Edit</button>
                        <button class="btn-logout delete-listing-btn" data-id="${p.id}" style="padding: 6px 12px; font-size: 0.8rem;">Delete</button>
                    </div>
                </td>
            </tr>
        `}).join('') || '<tr><td colspan="5" style="text-align: center; color: var(--subtext-color);">No listings yet.</td></tr>';
    }

    if (uploadHouseBtn) {
        uploadHouseBtn.addEventListener('click', async () => {
            const town = document.getElementById('newTown').value.trim();
            const price = document.getElementById('newPrice').value.trim();
            const distance = document.getElementById('newDistance').value.trim();
            const landlordPhone = document.getElementById('newLandlordPhone').value.trim();

            const email = document.getElementById('userEmail').value.trim().toLowerCase();
            const user = users.find(u => u.email === email);

            // Start loading state
            uploadHouseBtn.disabled = true;
            const originalBtnText = uploadHouseBtn.innerHTML;
            uploadHouseBtn.innerHTML = '<span class="btn-spinner"></span> Publishing...';

            const restoreBtn = () => {
                uploadHouseBtn.disabled = false;
                uploadHouseBtn.innerHTML = originalBtnText;
            };

            if ((!user || !user.isApproved) && email !== 'ianmorgan107@gmail.com') {
                showToast("Activation Required: Please pay the Ksh 300 fee.", "error");
                document.getElementById('authGate').classList.remove('hidden');
                document.getElementById('landlordDashboard').classList.add('hidden');
                restoreBtn();
                return;
            }

            if (!town || !price || !landlordPhone) {
                showToast("Please fill in all required fields.", "error");
                restoreBtn();
                return;
            }

            const neighborhood = document.getElementById('newNeighborhood').value.trim();
            const type = document.getElementById('newHouseType').value;
            const water = document.getElementById('newWater').value;
            const lat = document.getElementById('newLat').value.trim();
            const lng = document.getElementById('newLng').value.trim();
            
            let imageUrls = [];
            const files = Array.from(imageInput.files);

            if (files.length > 0) {
                const uploadPromises = files.map(async (file) => {
                    const compressedBlob = await compressImage(file);
                    const storageRef = ref(storage, `properties/${Date.now()}_${file.name}`);
                    const uploadTask = uploadBytesResumable(storageRef, compressedBlob);
                    return new Promise((resolve) => {
                        uploadTask.on('state_changed', null, null, async () => {
                            const url = await getDownloadURL(uploadTask.snapshot.ref);
                            resolve(url);
                        });
                    });
                });
                imageUrls = await Promise.all(uploadPromises);
            }
            
            if (editingPropertyId) {
                // Update Existing
                const updatedProperty = {
                    id: editingPropertyId,
                    type, town, neighborhood, 
                    area: `${town}, ${neighborhood}`,
                    price: parseInt(price), water, 
                    distance: parseInt(distance) || 0,
                    landlordPhone,
                    imageUrls: imageUrls.length > 0 ? imageUrls : properties.find(p => p.id === editingPropertyId)?.imageUrls || [],
                    lat,
                    lng
                };
                await saveProperty(updatedProperty);
                showToast("Listing updated successfully!", "success");
                resetLandlordForm();
            } else {
                // Create New
                const newProperty = {
                    id: Date.now(),
                    type, town, neighborhood,
                    area: `${town}, ${neighborhood}`,
                    price: parseInt(price), water,
                    isVerified: false,
                    distance: parseInt(distance) || 0,
                    landlordPhone,
                    imageUrls,
                    lat,
                    lng
                };
                await saveProperty(newProperty);
                showToast("Property published successfully!", "success");
                resetLandlordForm();
            }
            
            restoreBtn();
            droppedFile = null;
            renderLandlordProperties();
        });
    }

    function resetLandlordForm() {
        editingPropertyId = null;
        uploadHouseBtn.textContent = "🚀 Publish Listing Instantly";
        landlordFormTitle.textContent = "List a New Rental Unit";
        cancelEditBtn.classList.add('hidden');
        
        document.getElementById('newTown').value = '';
        document.getElementById('newPrice').value = '';
        document.getElementById('newDistance').value = '';
        document.getElementById('newNeighborhood').value = '';
        document.getElementById('newLandlordPhone').value = '';
        document.getElementById('newLat').value = '';
        document.getElementById('newLng').value = '';
        document.getElementById('newImage').value = '';
        document.getElementById('imagePreviewContainer').classList.add('hidden');
        droppedFile = null;
        document.getElementById('imagePreview').src = '';
        document.querySelectorAll('.amenity-check').forEach(el => el.checked = false);
    }

    if (cancelEditBtn) {
        cancelEditBtn.addEventListener('click', resetLandlordForm);
    }

    // --- 5.1 LANDLORD MANAGEMENT ACTIONS ---
    document.addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('.delete-listing-btn');
        const editBtn = e.target.closest('.edit-listing-btn');

        if (deleteBtn) {
            const id = deleteBtn.getAttribute('data-id');
            if (confirm("Are you sure you want to delete this listing?")) {
                properties = properties.filter(p => p.id !== id);
                saveProperties();
                renderLandlordProperties();
            }
        }

        if (editBtn) {
            const id = editBtn.getAttribute('data-id');
            const p = properties.find(prop => prop.id === id);
            if (p) {
                editingPropertyId = id;
                landlordFormTitle.textContent = "Editing Listing Details";
                uploadHouseBtn.textContent = "💾 Update Listing Changes";
                cancelEditBtn.classList.remove('hidden');

                document.getElementById('newTown').value = p.town;
                document.getElementById('newPrice').value = p.price;
                document.getElementById('newDistance').value = p.distance;
                document.getElementById('newNeighborhood').value = p.neighborhood;
                document.getElementById('newLandlordPhone').value = p.landlordPhone;
                document.getElementById('newHouseType').value = p.type;
                document.getElementById('newWater').value = p.water;
                document.getElementById('newLat').value = p.lat || '';
                document.getElementById('newLng').value = p.lng || '';
                
                // Scroll to top of form
                document.querySelector('.landlord-container').scrollIntoView({ behavior: 'smooth' });
            }
        }
    });

    // --- 5.2 ADMIN MANAGEMENT LOGIC ---
    function renderAdminUsers() {
        const query = document.getElementById('adminUserSearch')?.value.toLowerCase() || '';
        const startDate = document.getElementById('adminDateStart')?.value;
        const endDate = document.getElementById('adminDateEnd')?.value;
        // Update Summary Stats
        const seekerCount = users.filter(u => u.role === 'seeker').length;
        const landlordCount = users.filter(u => u.role === 'landlord').length;
        const seekerEl = document.getElementById('totalSeekersCount');
        const landlordEl = document.getElementById('totalLandlordsCount');
        if (seekerEl) seekerEl.textContent = seekerCount;
        if (landlordEl) landlordEl.textContent = landlordCount;

        const tableBody = document.getElementById('adminUserTableBody');
        
        // Sort users by registration date (newest first)
        const sortedUsers = [...users].sort((a, b) => {
            const dateA = a.createdAt?.seconds || 0;
            const dateB = b.createdAt?.seconds || 0;
            return dateB - dateA;
        });

        const filtered = sortedUsers.filter(u => {
            const matchesEmail = u.email.toLowerCase().includes(query);
            
            // Date Range logic
            let matchesDate = true;
            if (u.createdAt && typeof u.createdAt.toDate === 'function') {
                const userDate = u.createdAt.toDate();
                if (startDate) matchesDate = matchesDate && userDate >= new Date(startDate);
                if (endDate) {
                    const end = new Date(endDate);
                    end.setHours(23, 59, 59); // Include the full end day
                    matchesDate = matchesDate && userDate <= end;
                }
            }
            
            return matchesEmail && matchesDate;
        });

        tableBody.innerHTML = filtered.map(u => {
            // Format Firestore timestamp to readable date
            const joinedDate = u.createdAt && typeof u.createdAt.toDate === 'function' 
                ? u.createdAt.toDate().toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) 
                : 'Legacy';

            const lastLoginObj = u.lastLogin && typeof u.lastLogin.toDate === 'function' ? u.lastLogin.toDate() : null;
            const lastLoginDate = lastLoginObj ? lastLoginObj.toLocaleString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '---';
            
            let statusHtml;
            if (u.isBanned) {
                statusHtml = `<span class="status-dot banned"></span> <small>Banned</small>`;
            } else {
                // Online Heuristic: Active within last 5 minutes
                const isOnline = lastLoginObj && (Date.now() - lastLoginObj.getTime() < 5 * 60 * 1000);
                const dotClass = u.role === 'landlord' ? 'landlord' : 'seeker';
                statusHtml = isOnline ? `<span class="status-dot ${dotClass}"></span> <small>Online</small>` : '<small style="color:var(--subtext-color)">Offline</small>';
            }

            return `
            <tr>
                <td>${statusHtml}</td>
                <td>${u.email}</td>
                <td><span class="rule-badge">${u.role}</span> ${u.isApproved ? '✅' : '❌'}</td>
                <td><small>${joinedDate}</small></td>
                <td><small>${lastLoginDate}</small></td>
                <td>
                    <button class="btn-logout delete-user-btn" data-email="${u.email}" style="padding: 6px 12px; font-size: 0.8rem;">Remove User</button>
                    <button class="btn-pay toggle-ban-btn" data-id="${u.id}" data-banned="${u.isBanned}" style="padding: 6px 12px; font-size: 0.8rem; background-color: ${u.isBanned ? '#10b981' : '#ef4444'}; margin-left: 5px;">
                        ${u.isBanned ? 'Unban' : 'Ban'}
                    </button>
                </td>
            </tr>
        `}).join('');
    }

    function renderAdminPayments() {
        const tableBody = document.getElementById('adminPaymentTableBody');
        if (!tableBody) return;

        // Sort payments by timestamp (newest first)
        const processedPayments = [...payments].sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));

        tableBody.innerHTML = processedPayments.map(p => {
            const paymentDate = p.timestamp && typeof p.timestamp.toDate === 'function' ? p.timestamp.toDate().toLocaleString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : p.date;
            
            return `
            <tr>
                <td><code style="background: #f1f5f9; padding: 2px 5px; border-radius: 4px;">${p.reference}</code></td>
                <td>${p.email}</td>
                <td style="color: #16a34a; font-weight: 700;">${p.amount}</td>
                <td><small>${paymentDate}</small></td>
            </tr>
        `}).join('') || `<tr><td colspan="4" style="text-align: center; color: var(--subtext-color);">No transactions recorded yet.</td></tr>`;
    }

    /**
     * Aggregates property counts per town and renders/updates the Bar Chart
     */
    function updateTownDistributionChart() {
        const ctx = document.getElementById('townChart')?.getContext('2d');
        if (!ctx) return;

        // Aggregate data: count properties per town
        const distribution = {};
        properties.forEach(p => {
            distribution[p.town] = (distribution[p.town] || 0) + 1;
        });

        const labels = Object.keys(distribution);
        const data = Object.values(distribution);

        // Destroy old chart instance to prevent memory leaks and glitchy hovering
        if (townDistributionChart) townDistributionChart.destroy();

        townDistributionChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Properties Listed',
                    data: data,
                    backgroundColor: '#0d9488', // Consistent with var(--header-teal)
                    borderRadius: 6,
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, ticks: { stepSize: 1, color: '#64748b' }, grid: { drawBorder: false } },
                    x: { ticks: { color: '#64748b' }, grid: { display: false } }
                },
                plugins: { legend: { display: false } }
            }
        });
    }

    function renderAdminGlobalProperties() {
        const query = document.getElementById('adminPropertySearch')?.value.toLowerCase() || '';
        const tableBody = document.getElementById('adminGlobalPropertyTableBody');
        
        const filtered = properties.filter(p => 
            (p.type || "").toLowerCase().includes(query) || 
            (p.town || "").toLowerCase().includes(query) || 
            (p.neighborhood || "").toLowerCase().includes(query)
        );

        tableBody.innerHTML = filtered.map(p => {
            const activityDate = p.lastActivity && typeof p.lastActivity.toDate === 'function'
                ? p.lastActivity.toDate().toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })
                : '---';
                
            return `
            <tr>
                <td>${p.type}</td>
                <td>${p.neighborhood}, ${p.town}</td>
                <td>Ksh ${p.price.toLocaleString()}</td>
                <td><small>${activityDate}</small></td>
                <td>
                    <button class="btn-pay verify-listing-btn" data-id="${p.id}" style="padding: 6px 12px; font-size: 0.8rem; background-color: ${p.isVerified ? '#64748b' : '#f59e0b'};">
                        ${p.isVerified ? 'Unverify' : 'Verify'}
                    </button>
                    <button class="btn-logout delete-listing-btn" data-id="${p.id}" style="padding: 6px 12px; font-size: 0.8rem;">Delete Listing</button>
                </td>
            </tr>
        `}).join('');
    }

    // Search listener for admin user table
    const adminUserSearch = document.getElementById('adminUserSearch');
    if (adminUserSearch) {
        adminUserSearch.addEventListener('input', renderAdminUsers);
    }

    const adminPropertySearch = document.getElementById('adminPropertySearch');
    if (adminPropertySearch) {
        adminPropertySearch.addEventListener('input', renderAdminGlobalProperties);
    }

    const dateFilters = ['adminDateStart', 'adminDateEnd'];
    for(const id of dateFilters) {
        document.getElementById(id)?.addEventListener('change', renderAdminUsers);
    }

    // Admin Filter Reset Logic
    const resetAdminFiltersBtn = document.getElementById('resetAdminFiltersBtn');
    if (resetAdminFiltersBtn) {
        resetAdminFiltersBtn.addEventListener('click', () => {
            if (adminUserSearch) adminUserSearch.value = '';
            document.getElementById('adminDateStart').value = '';
            document.getElementById('adminDateEnd').value = '';
            renderAdminUsers();
        });
    }

    /**
     * Generates a CSV file from the user database and initiates a download.
     */
    function exportUsersToCSV() {
        if (users.length === 0) {
            showToast("No users found to export.", "info");
            return;
        }

        let csvContent = "User Email,Role\n";
        users.forEach(u => {
            csvContent += `${u.email},${u.role}\n`;
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `BarakaHomes_UserList_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    const exportUsersBtn = document.getElementById('exportUsersBtn');
    if (exportUsersBtn) {
        exportUsersBtn.addEventListener('click', exportUsersToCSV);
    }

    document.addEventListener('click', async (e) => {
        const deleteUserBtn = e.target.closest('.delete-user-btn');
        const verifyBtn = e.target.closest('.verify-listing-btn');
        const deleteListingBtn = e.target.closest('.delete-listing-btn');
        const editListingBtn = e.target.closest('.edit-listing-btn');
        const toggleBanBtn = e.target.closest('.toggle-ban-btn');
        const boostListingBtn = e.target.closest('.boost-listing-btn');

        if (deleteUserBtn) {
            const email = deleteUserBtn.getAttribute('data-email');
            const userToDelete = users.find(u => u.email === email);
            
            if (userToDelete && confirm(`⚠️ DANGER: Are you sure you want to permanently remove ${email}? This user will lose all portal access immediately.`)) {
                await deleteDoc(doc(db, "users", userToDelete.id));
                await saveUsers();
                renderAdminUsers();
            }
        }

        if (toggleBanBtn) {
            const userId = toggleBanBtn.getAttribute('data-id');
            const isCurrentlyBanned = toggleBanBtn.getAttribute('data-banned') === 'true';
            if (confirm(`Are you sure you want to ${isCurrentlyBanned ? 'Unban' : 'Ban'} this user?`)) {
                await updateDoc(doc(db, "users", userId), { isBanned: !isCurrentlyBanned, updatedAt: serverTimestamp() });
                await saveUsers();
                renderAdminUsers();
            }
        }

        if (verifyBtn) {
            const id = String(verifyBtn.getAttribute('data-id'));
            const property = properties.find(p => String(p.id) === id);
            if (property) {
                property.isVerified = !property.isVerified;
                await updateDoc(doc(db, "properties", id), { isVerified: property.isVerified });
                await saveProperties();
                renderAdminGlobalProperties();
            }
        }

        if (deleteListingBtn) {
            const id = String(deleteListingBtn.getAttribute('data-id'));
            if (confirm("Are you sure you want to delete this listing?")) {
                await deleteDoc(doc(db, "properties", id));
                await saveProperties();
                if (!landlordDashboard.classList.contains('hidden')) renderLandlordProperties();
                if (!adminDashboard.classList.contains('hidden')) {
                    renderAdminGlobalProperties();
                    updateTownDistributionChart();
                }
            }
        }

        if (editListingBtn) {
            const id = String(editListingBtn.getAttribute('data-id'));
            const p = properties.find(prop => String(prop.id) === id);
            if (p) {
                editingPropertyId = id;
                landlordFormTitle.textContent = "Editing Listing Details";
                uploadHouseBtn.textContent = "💾 Update Listing Changes";
                cancelEditBtn.classList.remove('hidden');
                document.getElementById('newTown').value = p.town;
                document.getElementById('newPrice').value = p.price;
                document.getElementById('newDistance').value = p.distance;
                document.getElementById('newNeighborhood').value = p.neighborhood;
                document.getElementById('newLandlordPhone').value = p.landlordPhone;
                document.getElementById('newHouseType').value = p.type;
                document.getElementById('newWater').value = p.water;
                document.querySelector('.landlord-container').scrollIntoView({ behavior: 'smooth' });
            }
        }

        if (boostListingBtn) {
            const id = boostListingBtn.getAttribute('data-id');
            const phone = prompt("Enter M-Pesa Number to pay Ksh 100 for a 7-day listing boost:");
            
            if (phone && phone.length >= 10) {
                boostListingBtn.disabled = true;
                boostListingBtn.innerHTML = '<span class="btn-spinner"></span>...';
                
                showToast("Requesting Ksh 100 boost payment...", "info");
                
                // Simulate Payment Delay
                setTimeout(async () => {
                    try {
                        const propertyRef = doc(db, "properties", id);
                        await updateDoc(propertyRef, { 
                            isBoosted: true, 
                            boostedAt: serverTimestamp(),
                            lastActivity: serverTimestamp() // Refresh activity so it hits the top
                        });
                        showToast("Listing Boosted Successfully! 🚀", "success");
                        await saveProperties();
                        renderLandlordProperties();
                    } catch (err) {
                        console.error(err);
                        showToast("Failed to process boost.", "error");
                        boostListingBtn.disabled = false;
                    }
                }, 3000);
            }
        }

    });

    // Custom Delete Modal Action Listeners
    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener('click', () => {
            if (userToDeleteId) {
                const userRef = doc(db, "users", userToDeleteId);
                deleteDoc(userRef)
                    .then(() => {
                        saveUsers().then(() => renderAdminUsers());
                        deleteConfirmationModal.classList.add('hidden');
                        showToast("User permanently deleted.", "success");
                    })
                    .catch(err => {
                        console.error("Error removing user:", err);
                        showToast("Failed to remove user.", "error");
                    });
            }
        });
    }
    if (cancelDeleteBtn) cancelDeleteBtn.addEventListener('click', () => deleteConfirmationModal.classList.add('hidden'));

    // --- 6. UTILITY: COPY TO CLIPBOARD ---
    document.addEventListener('click', (e) => {
        const copyBtn = e.target.closest('.copy-link-btn');
        if (copyBtn) {
            const textToCopy = copyBtn.getAttribute('data-text');
            navigator.clipboard.writeText(textToCopy).then(() => {
                const originalIcon = copyBtn.innerHTML;
                copyBtn.innerHTML = '<span style="font-size: 1.1rem;">✅</span>';
                copyBtn.style.backgroundColor = '#16a34a';
                setTimeout(() => {
                    copyBtn.innerHTML = originalIcon;
                    copyBtn.style.backgroundColor = '#64748b';
                }, 2000);
            });
        }
    });

    // --- 7. UTILITY: FAVORITE LISTINGS ---
    document.addEventListener('click', (e) => {
        const heartBtn = e.target.closest('.heart-btn');
        if (heartBtn) {
            const propertyId = heartBtn.getAttribute('data-id');
            let favorites = JSON.parse(localStorage.getItem('baraka_favorites') || '[]');
            
            if (favorites.includes(propertyId)) {
                favorites = favorites.filter(id => id !== propertyId);
                heartBtn.classList.remove('active');
                heartBtn.style.backgroundColor = '#64748b';

                // Auto-refresh if currently viewing favorites only
                if (favoritesFilter && favoritesFilter.value === 'favorites') {
                    renderSampleProperties();
                }
            } else {
                favorites.push(propertyId);
                heartBtn.classList.add('active');
                heartBtn.style.backgroundColor = '#ef4444';
            }
            localStorage.setItem('baraka_favorites', JSON.stringify(favorites));
        }
    });

    // --- 8. UTILITY: VIEW DETAILS MODAL ---
    const detailsModal = document.getElementById('detailsModal');
    const modalContent = document.getElementById('modalContent');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const modalCloseAction = document.getElementById('modalCloseAction');

    const toggleModal = (show = true) => {
        detailsModal.classList.toggle('hidden', !show);
    };

    document.addEventListener('click', (e) => {
        const viewBtn = e.target.closest('.view-details-btn');
        if (viewBtn) {
            const propertyId = viewBtn.getAttribute('data-id');
            const h = properties.find(p => p.id === propertyId);
            
            const email = document.getElementById('userEmail').value.trim().toLowerCase();
            const user = users.find(u => u.email === email);
            const hasPaid = (user && user.isApproved) || email === 'ianmorgan107@gmail.com';

            if (h) {
                const location = h.area || (h.neighborhood + ', ' + h.town);
                // Render Carousel or Single Image
                let carouselHtml = '';
                if (h.imageUrls && h.imageUrls.length > 0) {
                    carouselHtml = `
                        <div class="carousel-container">
                            ${h.imageUrls.map((url, i) => `<img src="${url}" class="carousel-slide ${i === 0 ? 'active' : ''}">`).join('')}
                            ${h.imageUrls.length > 1 ? `
                                <button class="carousel-btn prev">❮</button>
                                <button class="carousel-btn next">❯</button>
                            ` : ''}
                        </div>
                    `;
                }

                modalContent.innerHTML = `
                    <div style="padding: 10px 0;">
                        ${carouselHtml}
                        <p><strong>Property Type:</strong> ${h.type}</p>
                        <p><strong>Location:</strong> ${location}</p>
                        <p><strong>Price:</strong> Ksh ${h.price.toLocaleString()} / month</p>
                        <p><strong>Water Status:</strong> ${h.water}</p>
                        <p><strong>Distance to Road:</strong> ${h.distance} meters</p>
                        <p><strong>Verification:</strong> ${h.isVerified ? 'Premium Verified' : 'Standard Listing'}</p>
                        <p><strong>Landlord Phone:</strong> ${hasPaid ? h.landlordPhone : '07xxxxxx (Pay Ksh 50 to Unlock)'}</p>
                        ${!hasPaid ? `
                            <div style="background: #fffbeb; padding: 10px; border-radius: 8px; margin-top: 15px; border: 1px solid #fef08a;">
                                <p style="font-size: 0.8rem; margin: 0; color: #854d0e;">⚠️ You are viewing as a Standard User. Phone numbers are hidden until payment is confirmed.</p>
                            </div>
                        ` : ''}
                        
                        <!-- Map Section -->
                        <div id="propertyMap" class="property-map-container ${h.lat && h.lng ? '' : 'hidden'}"></div>
                        ${!(h.lat && h.lng) ? '<p style="font-size: 0.8rem; color: var(--subtext-color); margin-top: 10px;">📍 Map location not provided by landlord.</p>' : ''}
                        
                        ${h.lat && h.lng ? `
                            <button id="getDirectionsBtn" class="btn-main" style="margin-top: 15px; background-color: #059669;">
                                🚗 Get Directions to Property
                            </button>` : ''}
                    </div>
                `;
                toggleModal(true);
                if (h.imageUrls && h.imageUrls.length > 1) window.initCarousel(h.imageUrls);

                // Initialize Google Map if coordinates exist
                if (h.lat && h.lng && typeof google !== 'undefined') {
                    const coords = { lat: parseFloat(h.lat), lng: parseFloat(h.lng) };
                    const isDark = document.body.classList.contains('dark-mode');
                    setTimeout(() => {
                        const map = new google.maps.Map(document.getElementById('propertyMap'), {
                            center: coords,
                            zoom: 15,
                            disableDefaultUI: false,
                            zoomControl: true,
                            styles: isDark ? darkMapStyles : [],
                            streetViewControl: true
                        });
                        new google.maps.Marker({
                            position: coords,
                            map: map,
                            title: h.type
                        });

                        // --- NEARBY AMENITIES SEARCH ---
                        const service = new google.maps.places.PlacesService(map);
                        const amenityConfig = [
                            { type: 'hospital', icon: '🏥' },
                            { type: 'supermarket', icon: '🛒' },
                            { type: 'school', icon: '🏫' },
                            { type: 'bank', icon: '🏦' },
                            { type: 'restaurant', icon: '🍴' }
                        ];

                        amenityConfig.forEach(amenity => {
                            service.nearbySearch({
                                location: coords,
                                radius: 1500, // Search within 1.5km
                                type: [amenity.type]
                            }, (results, status) => {
                                if (status === google.maps.places.PlacesServiceStatus.OK && results) {
                                    // Limit to top 2 results per category to keep the map clean
                                    results.slice(0, 2).forEach(place => {
                                        const marker = new google.maps.Marker({
                                            position: place.geometry.location,
                                            map: map,
                                            title: place.name,
                                            label: {
                                                text: amenity.icon,
                                                fontSize: '16px'
                                            }
                                        });

                                        const infoWindow = new google.maps.InfoWindow({
                                            content: `<div style="color: #1e293b; padding: 5px;"><strong>${place.name}</strong><br>${amenity.icon} ${amenity.type.charAt(0).toUpperCase() + amenity.type.slice(1)}</div>`
                                        });

                                        marker.addListener('click', () => {
                                            infoWindow.open(map, marker);
                                        });
                                    });
                                }
                            });
                        });

                        // Get Directions Logic
                        const directionsBtn = document.getElementById('getDirectionsBtn');
                        if (directionsBtn) {
                            directionsBtn.addEventListener('click', () => {
                                window.open(`https://www.google.com/maps/dir/?api=1&destination=${h.lat},${h.lng}`, '_blank');
                            });
                        }
                    }, 200);
                }
            }
        }
    });

    closeModalBtn.addEventListener('click', () => toggleModal(false));
    modalCloseAction.addEventListener('click', () => toggleModal(false));
    window.addEventListener('click', (e) => {
        if (e.target === detailsModal) toggleModal(false);
    });

    // --- THEME PERSISTENCE LOGIC ---
    document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const isDark = document.body.classList.toggle('dark-mode');
            localStorage.setItem('reflex_theme', isDark ? 'dark' : 'light');
            showToast(`${isDark ? 'Dark' : 'Light'} Mode Enabled`, 'info');
        });
    });
});