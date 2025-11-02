document.addEventListener('DOMContentLoaded', () => {

    const tableBody = document.querySelector('#attendance-table tbody');
    const toggleBtn = document.getElementById('toggle-reg-mode');
    const regStatus = document.getElementById('reg-status');
    const modal = document.getElementById('registration-modal');
    const regForm = document.getElementById('registration-form');
    const cancelRegButton = document.getElementById('cancel-reg-button');

    let isRegistrationMode = false;

    const wsUrl = `ws://${window.location.host}`;
    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
        console.log('✅ Terhubung ke WebSocket server');
    };

    socket.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);
            console.log('Pesan diterima dari server:', message);

            switch (message.type) {
                case 'welcome':
                    console.log('Pesan sambutan:', message.message);
                    break;
                
                case 'mode_status':
                    isRegistrationMode = message.isRegistrationMode;
                    updateRegistrationUI();
                    break;

                case 'registration_prompt':
                    openRegistrationModal(message.uid);
                    break;

                case 'new_attendance':
                case 'update_attendance':
                    updateAttendanceTable(message.data);
                    break;
            }
        } catch (error) {
            console.error('Gagal mem-parsing pesan dari server:', error);
        }
    };

    socket.onclose = () => {
        console.log('❌ Terputus dari WebSocket server. Mencoba menghubungkan kembali...');
    };

    socket.onerror = (error) => {
        console.error('WebSocket Error:', error);
    };

    function updateRegistrationUI() {
        regStatus.textContent = isRegistrationMode ? 'ON' : 'OFF';
        toggleBtn.textContent = isRegistrationMode ? 'Nonaktifkan Mode Registrasi' : 'Aktifkan Mode Registrasi';
        toggleBtn.classList.toggle('active', isRegistrationMode);
    }

    function openRegistrationModal(uid) {
        document.getElementById('reg-uid').value = uid;
        modal.style.display = 'flex';
    }

    function closeRegistrationModal() {
        modal.style.display = 'none';
        regForm.reset();
    }

    function updateAttendanceTable(attendanceData) {
        const noDataRow = document.getElementById('no-data');
        if (noDataRow) {
            noDataRow.remove();
        }

        let row = document.getElementById(`att-${attendanceData._id}`);
        if (!row) {
            row = document.createElement('tr');
            row.id = `att-${attendanceData._id}`;
            tableBody.prepend(row);
        }

        const statusSpan = `<span class="status status-${attendanceData.status.toLowerCase()}">${attendanceData.status}</span>`;
        const photoImg = attendanceData.photoUrl ? `<img src="${attendanceData.photoUrl}" alt="Foto Absensi" width="80">` : '-';
        
        row.innerHTML = `
            <td>${new Date(attendanceData.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
            <td>${attendanceData.student.name}</td>
            <td>${attendanceData.student.studentId}</td>
            <td>${statusSpan}</td>
            <td>${photoImg}</td>
        `;
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
        const formData = new FormData(regForm);
        const data = Object.fromEntries(formData.entries());

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
            } else {
                alert(`Gagal: ${result.message}`);
            }
        } catch (error) {
            console.error('Error saat submit form registrasi:', error);
            alert('Terjadi kesalahan. Cek console untuk detail.');
        }
    });

});