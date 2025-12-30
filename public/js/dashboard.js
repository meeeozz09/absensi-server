document.addEventListener('DOMContentLoaded', () => {

    const tableBody = document.querySelector('#attendance-table tbody');
    const toggleBtn = document.getElementById('toggle-reg-mode');
    const regStatus = document.getElementById('reg-status');
    const modal = document.getElementById('registration-modal');
    const regForm = document.getElementById('registration-form');
    const cancelRegButton = document.getElementById('cancel-reg-button');
    const absentStudentList = document.getElementById('absent-student-list');
    const currentDateEl = document.getElementById('current-date');
    const exportButton = document.getElementById('export-button');
    const logoutButton = document.getElementById('logout-button');
    let isRegistrationMode = false;

    function initializePage() {
        const today = new Date();
        currentDateEl.textContent = `Tanggal ${today.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}`;
        
        absentStudentList.addEventListener('click', (event) => {
            if (event.target.classList.contains('btn-save-manual')) {
                handleManualAttendance(event);
            }
        });
    }

    const isSecure = window.location.protocol === 'https:';
    const wsProtocol = isSecure ? 'wss://' : 'ws://'; 
    const wsUrl = `${wsProtocol}${window.location.host}`;
    
    console.log(`Menghubungkan ke WebSocket di: ${wsUrl}`);
    const socket = new WebSocket(wsUrl);

    socket.onopen = () => console.log('✅ Terhubung ke WebSocket server');
    socket.onclose = () => console.log('❌ Terputus dari WebSocket server. Silakan refresh halaman.');
    socket.onerror = (error) => console.error('WebSocket Error:', error);

    socket.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);
            console.log('Pesan diterima dari server:', message);
            
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
                    upsertAttendanceRow(message.data);
                    fetchAbsentStudents(); 
                    break;
            }
        } catch (error) {
            console.error('Gagal mem-parsing pesan dari server:', error);
        }
    };

    function updateRegistrationUI() {
        regStatus.textContent = isRegistrationMode ? 'ON' : 'OFF';
        toggleBtn.textContent = isRegistrationMode ? 'Nonaktifkan' : 'Aktifkan';
        toggleBtn.classList.toggle('active', isRegistrationMode);
    }

    function openRegistrationModal(uid) {
        document.getElementById('reg-uid').value = uid;
        modal.classList.add('visible');
    }

    function closeRegistrationModal() {
        modal.classList.remove('visible');
        setTimeout(() => {
            regForm.reset();
        }, 300);
    }

    function upsertAttendanceRow(attData) {
        const noDataRow = document.getElementById('no-data');
        if (noDataRow) noDataRow.remove();

        let row = document.getElementById(`att-${attData._id}`);
        const isNewRow = !row;

        if (isNewRow) {
            row = document.createElement('tr');
            row.id = `att-${attData._id}`;
        }
        
        const studentName = attData.student ? attData.student.name : 'Siswa Dihapus';
        const studentId = attData.student ? attData.student.studentId : '-';
        const time = attData.status === 'HADIR' ? new Date(attData.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-';
        const statusSpan = `<span class="status-badge status-${attData.status.toLowerCase()}">${attData.status}</span>`;
        
        let photoImg;
        if (attData.photoUrl && attData.photoUrl !== '/photos/default.png') {
            photoImg = `<img src="${attData.photoUrl}" alt="Foto Absensi">`;
        } else {
            const avatarName = studentName.split(' ').join('+');
            photoImg = `<img src="https://ui-avatars.com/api/?name=${avatarName}&background=random" alt="Avatar Default">`;
        }

        row.innerHTML = `
            <td></td>
            <td>${studentName}</td>
            <td>${studentId}</td>
            <td>${time}</td>
            <td>${statusSpan}</td>
            <td><div class="photo-cell">${photoImg}</div></td>
        `;

        if (isNewRow) {
            tableBody.prepend(row);
        }
        
        renumberTableRows();
    }

    function renumberTableRows() {
        const allRows = tableBody.querySelectorAll('tr');
        allRows.forEach((r, index) => {
            if(r.id !== 'no-data') {
                r.cells[0].textContent = index + 1;
            }
        });
    }
    
    async function fetchAbsentStudents() {
        try {
            const response = await fetch('/api/students/absent');
            if (!response.ok) throw new Error('Gagal mengambil data dari server');
            const result = await response.json();
            if (result.success) {
                renderAbsentStudents(result.data);
            }
        } catch (error) {
            console.error('Gagal mengambil daftar siswa absen:', error);
        }
    }

    function renderAbsentStudents(students) {
        absentStudentList.innerHTML = ''; 
        if (students.length === 0) {
            absentStudentList.innerHTML = '<li class="all-present">Semua siswa sudah tercatat kehadirannya!</li>';
            return;
        }
        students.forEach(student => {
            const listItem = document.createElement('li');
            listItem.className = 'absent-student-item';
            listItem.id = `absent-${student._id}`;
            listItem.innerHTML = `
                <div class="student-info">
                    <span>${student.name}</span>
                    <small>${student.studentId}</small>
                </div>
                <div class="status-buttons">
                    <select>
                        <option value="">-- Status --</option>
                        <option value="IZIN">Izin</option>
                        <option value="SAKIT">Sakit</option>
                        <option value="ALFA">Alfa</option>
                    </select>
                    <button class="btn-save-manual" data-studentid="${student._id}">Simpan</button>
                </div>
            `;
            absentStudentList.appendChild(listItem);
        });
    }

    async function handleManualAttendance(event) {
        const studentId = event.target.dataset.studentid;
        const row = document.getElementById(`absent-${studentId}`);
        const statusSelect = row.querySelector('select');
        const selectedStatus = statusSelect.value;
        if (!selectedStatus) {
            alert('Silakan pilih status (Izin, Sakit, atau Alfa).');
            return;
        }

        try {
            const response = await fetch('/api/attendance/manual', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    studentId: studentId,
                    date: new Date().toISOString().slice(0, 10), 
                    status: selectedStatus,
                    keterangan: 'Diinput manual oleh guru'
                }),
            });
            if (!response.ok) {
                const result = await response.json();
                throw new Error(result.message || 'Gagal menyimpan absensi manual.');
            }
        } catch (error) {
            alert(error.message);
        }
    }

    toggleBtn.addEventListener('click', () => {
        fetch('/api/registration-mode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled: !isRegistrationMode })
        });
    });

    cancelRegButton.addEventListener('click', closeRegistrationModal);

    regForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(regForm).entries());
        try {
            const response = await fetch('/api/students', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            const result = await response.json();
            if (response.ok) {
                alert('Siswa berhasil didaftarkan!');
                closeRegistrationModal();
                fetchAbsentStudents(); 
            } else {
                alert(`Gagal: ${result.message}`);
            }
        } catch (error) {
            alert('Terjadi kesalahan koneksi saat mendaftar.');
        }
    });

    exportButton.addEventListener('click', () => {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0'); 
        const day = String(today.getDate()).padStart(2, '0');
        const todayString = `${year}-${month}-${day}`;
        const exportUrl = `/api/export?startDate=${todayString}&endDate=${todayString}`;

        console.log(`Mengekspor data untuk hari ini. URL: ${exportUrl}`);
        window.location.href = exportUrl;
    });

    if (logoutButton) {
        logoutButton.addEventListener('click', async () => {
            try {
                const response = await fetch('/api/auth/logout', {
                    method: 'POST',
                });

                if (response.ok) {
                    window.location.href = '/login';
                } else {
                    alert('Gagal logout.');
                }
            } catch (error) {
                console.error('Error saat logout:', error);
                alert('Gagal terhubung ke server untuk logout.');
            }
        });
    }

    initializePage();
    renumberTableRows(); 
});