// public/js/dashboard.js - VERSI FINAL DENGAN CLIENT-SIDE FETCHING & DATE PICKER

document.addEventListener('DOMContentLoaded', () => {
    // --- Seleksi Elemen DOM ---
    const tableBody = document.querySelector('#attendance-table tbody');
    const absentStudentList = document.getElementById('absent-student-list');
    const currentDateEl = document.getElementById('current-date');
    const datePicker = document.getElementById('date-picker');
    const attendanceTitle = document.getElementById('attendance-title');
    const manualAttendanceSubtitle = document.getElementById('manual-attendance-subtitle');
    const toggleBtn = document.getElementById('toggle-reg-mode');
    const regStatus = document.getElementById('reg-status');
    const modal = document.getElementById('registration-modal');
    const regForm = document.getElementById('registration-form');
    const cancelRegButton = document.getElementById('cancel-reg-button');
    const exportButton = document.getElementById('export-button');
    const logoutButton = document.getElementById('logout-button');
    let isRegistrationMode = false;

    // --- Fungsi Utama untuk Mengambil dan Merender Data ---
    async function fetchAndRenderDashboard(dateString) {
        tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Memuat data...</td></tr>';
        absentStudentList.innerHTML = '<li class="loading">Memuat daftar siswa...</li>';

        try {
            const response = await fetch(`/api/dashboard-data?date=${dateString}`);
            if (!response.ok) throw new Error('Gagal memuat data dari server.');
            
            const result = await response.json();
            if (result.success) {
                renderAttendanceTable(result.data.attendances);
                renderAbsentStudents(result.data.absentStudents);
            } else {
                throw new Error(result.message);
            }
        } catch (error) {
            console.error('Error fetching dashboard data:', error);
            tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:red;">Error: ${error.message}</td></tr>`;
            absentStudentList.innerHTML = `<li style="color:red;">Error: ${error.message}</li>`;
        }
    }

    // --- Inisialisasi Halaman ---
    function initializePage() {
        // Baca tanggal dari server (jika ada), atau default ke hari ini
        let initialDateStr = document.body.dataset.currentDate;
        if (!initialDateStr) {
            initialDateStr = new Date().toISOString().slice(0, 10);
        }
        
        const initialDate = new Date(initialDateStr);
        datePicker.value = initialDateStr;
        updateDateHeader(initialDate);
        fetchAndRenderDashboard(initialDateStr);

        datePicker.addEventListener('change', () => {
            const selectedDate = datePicker.value;
            if (selectedDate) {
                updateDateHeader(new Date(selectedDate));
                fetchAndRenderDashboard(selectedDate);
            }
        });
        
        absentStudentList.addEventListener('click', (event) => {
            if (event.target.classList.contains('btn-save-manual')) {
                handleManualAttendance(event);
            }
        });
    }

    function updateDateHeader(date) {
        const offset = date.getTimezoneOffset();
        const correctedDate = new Date(date.getTime() + (offset * 60 * 1000));
        const dateText = correctedDate.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
        
        currentDateEl.textContent = `Tanggal ${dateText}`;
        
        // Update judul-judul dinamis
        const today = new Date();
        const todayStr = today.toISOString().slice(0, 10);
        const selectedDateStr = correctedDate.toISOString().slice(0, 10);

        if (todayStr === selectedDateStr) {
            attendanceTitle.textContent = "Kehadiran Hari Ini";
            manualAttendanceSubtitle.textContent = "Siswa yang belum tercatat kehadirannya hari ini.";
        } else {
            attendanceTitle.textContent = `Kehadiran ${dateText}`;
            manualAttendanceSubtitle.textContent = `Siswa yang belum tercatat kehadirannya pada tanggal tersebut.`;
        }
    }
    
    // --- Koneksi WebSocket ---
    const isSecure = window.location.protocol === 'https:';
    const wsProtocol = isSecure ? 'wss://' : 'ws://';
    const wsUrl = `${wsProtocol}${window.location.host}`;
    const socket = new WebSocket(wsUrl);
    socket.onopen = () => console.log('✅ Terhubung ke WebSocket server');
    socket.onclose = () => console.log('❌ Terputus dari WebSocket server.');
    socket.onerror = (error) => console.error('WebSocket Error:', error);

    socket.onmessage = (event) => {
    try {
        const message = JSON.parse(event.data);
        console.log('Pesan diterima dari server:', message);
        
        // Gunakan satu switch untuk semua tipe pesan
        switch (message.type) {
            case 'mode_status':
                isRegistrationMode = message.isRegistrationMode;
                updateRegistrationUI();
                break;

            case 'registration_prompt':
                openRegistrationModal(message.uid);
                break;

            case 'new_attendance':
            case 'update_attendance':
                // Cek relevansi tanggal HANYA untuk pesan absensi
                const selectedDateStr = datePicker.value;
                const attendanceDateStr = new Date(message.data.timestamp).toISOString().slice(0, 10);

                if (selectedDateStr === attendanceDateStr) {
                    console.log('Update absensi relevan, memperbarui UI...');
                    upsertAttendanceRow(message.data);
                    fetchAbsentStudents();
                } else {
                    console.log('Update absensi diterima, tapi untuk tanggal lain. Diabaikan.');
                }
                break;
            
            case 'welcome':
                console.log('Pesan dari server:', message.message);
                break;

            default:
                console.warn('Menerima pesan WebSocket dengan tipe tidak dikenal:', message.type);
        }
    } catch (error) {
        console.error('Gagal mem-parsing pesan dari server:', error);
    }
};

    // --- Fungsi-fungsi Render & UI ---
    function updateRegistrationUI() {
        if(!regStatus || !toggleBtn) return;
        regStatus.textContent = isRegistrationMode ? 'ON' : 'OFF';
        toggleBtn.textContent = isRegistrationMode ? 'Nonaktifkan' : 'Aktifkan';
        toggleBtn.classList.toggle('active', isRegistrationMode);
    }
    function openRegistrationModal(uid) { document.getElementById('reg-uid').value = uid; modal.classList.add('visible'); }
    function closeRegistrationModal() { modal.classList.remove('visible'); setTimeout(() => { regForm.reset(); }, 300); }

    function renderAttendanceTable(attendances) {
        tableBody.innerHTML = '';
        if (attendances.length === 0) {
            tableBody.innerHTML = '<tr id="no-data"><td colspan="6" style="text-align:center;">Belum ada data absensi pada tanggal ini.</td></tr>';
            return;
        }
        attendances.forEach(attData => upsertAttendanceRow(attData));
    }

    function upsertAttendanceRow(attData) {
        let row = document.getElementById(`att-${attData._id}`);
        const isNewRow = !row;
        if (isNewRow) { row = document.createElement('tr'); row.id = `att-${attData._id}`; }
        const studentName = attData.student ? attData.student.name : 'Siswa Dihapus';
        let photoImg = `<img src="https://ui-avatars.com/api/?name=${studentName.split(' ').join('+')}&background=random" alt="Avatar Default">`;
        if (attData.photoUrl) { photoImg = `<img src="${attData.photoUrl}" alt="Foto Absensi">`; }
        row.innerHTML = `<td></td><td>${studentName}</td><td>${attData.student ? attData.student.studentId : '-'}</td><td>${attData.status === 'HADIR' ? new Date(attData.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'}</td><td><span class="status-badge status-${attData.status.toLowerCase()}">${attData.status}</span></td><td><div class="photo-cell">${photoImg}</div></td>`;
        if (isNewRow) { tableBody.prepend(row); }
        renumberTableRows();
    }
    
    function renumberTableRows() {
        const allRows = tableBody.querySelectorAll('tr');
        allRows.forEach((r, index) => { if (r.id !== 'no-data') { r.cells[0].textContent = index + 1; } });
    }
    
    function renderAbsentStudents(students) {
        absentStudentList.innerHTML = ''; 
        if (students.length === 0) { absentStudentList.innerHTML = '<li class="all-present">Semua siswa sudah tercatat kehadirannya!</li>'; return; }
        students.forEach(student => {
            const listItem = document.createElement('li');
            listItem.className = 'absent-student-item';
            listItem.id = `absent-${student._id}`;
            listItem.innerHTML = `<div class="student-info"><span>${student.name}</span><small>${student.studentId}</small></div><div class="status-buttons"><select><option value="">-- Status --</option><option value="IZIN">Izin</option><option value="SAKIT">Sakit</option><option value="ALFA">Alfa</option></select><button class="btn-save-manual" data-studentid="${student._id}">Simpan</button></div>`;
            absentStudentList.appendChild(listItem);
        });
    }

    // --- Fungsi Handler & API Call ---
    async function handleManualAttendance(event) {
        const studentId = event.target.dataset.studentid;
        const selectedDate = datePicker.value;
        const statusSelect = event.target.previousElementSibling;
        const selectedStatus = statusSelect.value;
        if (!selectedStatus) { alert('Silakan pilih status.'); return; }
        try {
            const response = await fetch('/api/attendance/manual', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ studentId, date: selectedDate, status: selectedStatus, keterangan: `Diinput manual` }),
            });
            if (!response.ok) { const result = await response.json(); throw new Error(result.message || 'Gagal menyimpan absensi manual.'); }
        } catch (error) { alert(error.message); }
    }
    
    // --- Event Listeners ---
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            fetch('/api/registration-mode', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: !isRegistrationMode })
            });
        });
    }
    if (cancelRegButton) cancelRegButton.addEventListener('click', closeRegistrationModal);
    if (regForm) {
        regForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const data = Object.fromEntries(new FormData(e.target).entries());
            try {
                const response = await fetch('/api/students', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
                });
                const result = await response.json();
                if (response.ok) {
                    alert('Siswa berhasil didaftarkan!');
                    closeRegistrationModal();
                    fetchAndRenderDashboard(datePicker.value); // Fetch ulang data
                } else {
                    alert(`Gagal: ${result.message}`);
                }
            } catch (error) {
                alert('Terjadi kesalahan koneksi saat mendaftar.');
            }
        });
    }
    if (exportButton) {
        exportButton.addEventListener('click', () => { 
            const selectedDate = datePicker.value;
            window.location.href = `/api/export?startDate=${selectedDate}&endDate=${selectedDate}`;
        });
    }
    if (logoutButton) {
        logoutButton.addEventListener('click', async () => {
            try {
                const response = await fetch('/api/auth/logout', { method: 'POST' });
                if (response.ok) { window.location.href = '/login'; }
                else { alert('Gagal logout.'); }
            } catch (error) {
                alert('Gagal terhubung ke server untuk logout.');
            }
        });
    }

    // --- Inisialisasi ---
    initializePage();
});