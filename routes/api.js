import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Student from '../models/Student.js';
import Attendance from '../models/Attendance.js';
import exceljs from 'exceljs';
import { uploadImage } from '../config/cloudinary.js';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let isRegistrationMode = false;

// Endpoint untuk ESP32 (Tap Kartu = HADIR)
router.post('/attendance/tap', async (req, res) => {
    const { uid, image_data } = req.body;
    const broadcast = req.app.get('broadcast'); 
    if (!uid) return res.status(400).json({ message: 'UID is required' });

    if (isRegistrationMode) {
        const studentExists = await Student.findOne({ uid });
        if (!studentExists) {
            console.log(`[REG MODE] Prompting registration for new UID: ${uid}`);
            broadcast({ type: 'registration_prompt', uid });
            return res.status(200).json({ message: 'Registration prompt sent' });
        }
    }

    try {
        const student = await Student.findOne({ uid });
        if (!student) {
            console.log(`[ATTENDANCE] Tap from unknown UID: ${uid}`);
            return res.status(404).json({ message: 'Siswa tidak terdaftar' });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0); 
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1); 
        const existingAttendance = await Attendance.findOne({
            student: student._id,
            timestamp: { $gte: today, $lt: tomorrow }
        });

        if (existingAttendance) {
            console.log(`[ATTENDANCE] Siswa ${student.name} sudah absen hari ini dengan status ${existingAttendance.status}.`);
            return res.status(409).json({ message: `Sudah absen: ${existingAttendance.status}` });
        }

        let photoUrl = null;
        if (image_data) {
            const base64Data = image_data.replace(/^data:image\/jpeg;base64,/, "");
            const publicId = `${Date.now()}-${uid}`;
            
            console.log(`[PHOTO] Mengupload foto ke Cloudinary...`);
            photoUrl = await uploadImage(base64Data, publicId);

            if (photoUrl) {
                console.log(`[PHOTO] Upload Cloudinary berhasil. URL: ${photoUrl}`);
            } else {
                console.error('❌ Gagal upload foto ke Cloudinary.');
            }
        }

        const newAttendance = new Attendance({ 
            student: student._id,
            timestamp: new Date(),
            status: 'HADIR',
            photoUrl: photoUrl
        });
        await newAttendance.save();
        
        const populatedAttendance = await Attendance.findById(newAttendance._id).populate('student');
        broadcast({ type: 'new_attendance', data: populatedAttendance });
        
        console.log(`[ATTENDANCE] Absensi 'HADIR' tercatat untuk: ${student.name}`);
        res.status(200).json({ message: `Hadir, ${student.name}` });
    } catch (error) {
        console.error('Error saat proses absensi:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Endpoint untuk mengelola mode registrasi
router.post('/registration-mode', (req, res) => {
    const { enabled } = req.body;
    isRegistrationMode = enabled;
    const broadcast = req.app.get('broadcast');
    broadcast({ type: 'mode_status', isRegistrationMode });
    console.log(`[REG MODE] Mode registrasi diubah menjadi: ${isRegistrationMode ? 'ON' : 'OFF'}`);
    res.status(200).json({ message: `Mode registrasi ${enabled ? 'diaktifkan' : 'dinonaktifkan'}` });
});

// Endpoint untuk menyimpan siswa baru
router.post('/students', async (req, res) => {
    try {
        const { uid, name, studentId, gender } = req.body;
        if (!uid || !name || !studentId || !gender) {
            return res.status(400).json({ success: false, message: "Semua field (UID, Nama, ID Siswa, Jenis Kelamin) harus diisi." });
        }
        const newStudent = await Student.create({ uid, name, studentId, gender });
        res.status(201).json({ success: true, data: newStudent });
        console.log(`[REGISTRATION] Siswa baru berhasil didaftarkan: ${name}`);
    } catch (error) {
        console.error('❌ Gagal mendaftarkan siswa:', error);
        if (error.code === 11000) {
            return res.status(409).json({ success: false, message: "UID atau ID Siswa sudah terdaftar." });
        }
        res.status(500).json({ success: false, message: "Terjadi kesalahan di server." });
    }
});

// Endpoint untuk input absensi manual
router.post('/attendance/manual', async (req, res) => {
    const { studentId, date, status, keterangan } = req.body;
    const broadcast = req.app.get('broadcast');
    try {
        const student = await Student.findById(studentId);
        if (!student) return res.status(404).json({ message: "Siswa tidak ditemukan." });

        const attendanceDate = new Date(date);
        attendanceDate.setUTCHours(0, 0, 0, 0);
        const nextDay = new Date(attendanceDate);
        nextDay.setDate(nextDay.getDate() + 1);

        const updatedAttendance = await Attendance.findOneAndUpdate(
            { student: student._id, timestamp: { $gte: attendanceDate, $lt: nextDay } },
            { student: student._id, timestamp: attendanceDate, status: status, keterangan: keterangan || '', $unset: { photoUrl: "" } },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        ).populate('student');

        broadcast({ type: 'update_attendance', data: updatedAttendance });
        console.log(`[MANUAL] Absensi manual (${status}) untuk ${student.name} pada tanggal ${date}`);
        res.status(200).json({ success: true, data: updatedAttendance });
    } catch (error) {
        console.error('Gagal input absensi manual:', error);
        res.status(500).json({ success: false, message: 'Server error saat input manual' });
    }
});

// Endpoint untuk mendapatkan siswa yang belum absen hari ini
router.get('/students/absent', async (req, res) => {
    try {
        const dateQuery = req.query.date;
        const selectedDate = dateQuery ? new Date(dateQuery) : new Date();
        const startOfDay = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
        const endOfDay = new Date(startOfDay);
        endOfDay.setDate(startOfDay.getDate() + 1);
        const attendedStudentIds = await Attendance.find(
            { timestamp: { $gte: startOfDay, $lt: endOfDay } }, 'student'
        ).distinct('student');
        const absentStudents = await Student.find({ _id: { $nin: attendedStudentIds } }).sort({ name: 1 });
        res.status(200).json({ success: true, data: absentStudents });
    } catch (error) {
        console.error('Error fetching absent students:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Endpoint untuk Ekspor ke Excel
router.get('/export', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        // Validasi: pastikan tanggal ada untuk laporan bulanan
        if (!startDate || !endDate) {
            return res.status(400).send('Harap tentukan rentang tanggal (Tanggal Mulai dan Tanggal Akhir) untuk membuat laporan.');
        }

        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        
        // Ambil nama bulan dan tahun dari tanggal mulai
        const monthName = start.toLocaleDateString('id-ID', { month: 'long' });
        const year = start.getFullYear();

        // 1. Ambil semua siswa (kita asumsikan semua siswa adalah target laporan)
        const allStudents = await Student.find().sort({ name: 1 });

        // 2. Ambil semua data absensi dalam rentang tanggal yang dipilih
        const attendances = await Attendance.find({
            timestamp: { $gte: start, $lte: end }
        }).populate('student');

        // 3. Proses dan transformasi data
        const studentDataMap = new Map();
        
        // Inisialisasi map dengan semua siswa
        allStudents.forEach(student => {
            studentDataMap.set(student._id.toString(), {
                name: student.name,
                studentId: student.studentId,
                gender: student.gender,
                attendances: new Map(), // Map untuk menyimpan absensi per tanggal
                counts: { HADIR: 0, IZIN: 0, SAKIT: 0, ALFA: 0 }
            });
        });

        // Isi data absensi ke dalam map
        attendances.forEach(att => {
            if (att.student) {
                const studentId = att.student._id.toString();
                const dayOfMonth = new Date(att.timestamp).getDate();
                
                if (studentDataMap.has(studentId)) {
                    const studentData = studentDataMap.get(studentId);
                    let symbol = '';
                    switch(att.status) {
                        case 'HADIR': symbol = '✓'; break;
                        case 'IZIN': symbol = 'I'; break;
                        case 'SAKIT': symbol = 'S'; break;
                        case 'ALFA': symbol = 'A'; break;
                    }
                    studentData.attendances.set(dayOfMonth, symbol);
                    studentData.counts[att.status]++;
                }
            }
        });

        // 4. Generate file Excel
        const workbook = new exceljs.Workbook();
        workbook.creator = 'Sistem Absensi SDN 29 Bontomacinna';
        const worksheet = workbook.addWorksheet(`Absensi ${monthName} ${year}`);

        // --- Membuat Header Laporan ---
        worksheet.mergeCells('A1:AI1');
        worksheet.getCell('A1').value = 'REKAPITULASI DAFTAR HADIR SISWA';
        worksheet.getCell('A1').font = { name: 'Arial', size: 16, bold: true };
        worksheet.getCell('A1').alignment = { horizontal: 'center' };

        worksheet.addRow([]); // Baris kosong
        worksheet.addRow(['Kelas', ':', 'VI']);
        worksheet.addRow(['Bulan', ':', `${monthName.toUpperCase()} ${year}`]);
        worksheet.addRow([]); // Baris kosong

        // --- Membuat Header Tabel ---
        const daysInMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
        const headerTop = ['NO', 'NAMA SISWA', 'L/P', ...Array(daysInMonth).fill(''), 'JML'];
        const headerMid = ['', '', '', ...Array(daysInMonth).fill(''), 'H', 'I', 'S', 'A'];
        
        worksheet.addRow(headerTop); // Misal: Row 6
        worksheet.addRow(headerMid); // Misal: Row 7
        
        // Merge header
        worksheet.mergeCells('A6:A7');
        worksheet.mergeCells('B6:B7');
        worksheet.mergeCells('C6:C7');
        worksheet.mergeCells('D6', `AD${6}`); // Merge 'TANGGAL'
        worksheet.getCell('D6').value = 'TANGGAL';
        worksheet.mergeCells('AE6', 'AH6'); // Merge 'JUMLAH'
        worksheet.getCell('AE6').value = 'JUMLAH';

        // Isi tanggal 1 s/d 31
        const dateHeaderRow = worksheet.getRow(7);
        for (let i = 1; i <= daysInMonth; i++) {
            dateHeaderRow.getCell(3 + i).value = i;
        }

        // Styling header
        [worksheet.getRow(6), worksheet.getRow(7)].forEach(row => {
            row.font = { bold: true };
            row.alignment = { horizontal: 'center', vertical: 'middle' };
        });

        // --- Mengisi Data Siswa ---
        let currentRow = 8;
        allStudents.forEach((student, index) => {
            const studentId = student._id.toString();
            const data = studentDataMap.get(studentId);

            const rowData = [
                index + 1,
                data.name,
                data.gender === 'Laki-laki' ? 'L' : 'P'
            ];
            
            for (let i = 1; i <= daysInMonth; i++) {
                rowData.push(data.attendances.get(i) || '');
            }

            rowData.push(data.counts.HADIR, data.counts.IZIN, data.counts.SAKIT, data.counts.ALFA);
            worksheet.addRow(rowData);
        });

        // --- Final Styling ---
        worksheet.getColumn('B').width = 35; // Nama
        worksheet.getColumn('C').width = 5;  // L/P
        // Atur lebar kolom tanggal menjadi kecil
        for (let i = 4; i <= 3 + daysInMonth; i++) {
            worksheet.getColumn(i).width = 4;
        }
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber > 5) { // Mulai dari header tabel
                row.eachCell({ includeEmpty: true }, cell => {
                    cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
                    if (rowNumber > 7) { // Data siswa
                        cell.alignment = { vertical: 'middle', horizontal: 'center' };
                    }
                });
                row.getCell(2).alignment = { horizontal: 'left' }; // Nama rata kiri
            }
        });

        // --- Ekspor File ---
        const fileName = `Rekap_Absensi_${monthName}_${year}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error("Gagal membuat file Excel:", error);
        res.status(500).send('Terjadi kesalahan saat membuat file Excel. Cek log server.');
    }
});


router.get('/dashboard-data', async (req, res) => {
    try {
        const dateQuery = req.query.date;
        if (!dateQuery) {
            return res.status(400).json({ success: false, message: "Parameter tanggal dibutuhkan." });
        }
        
        const selectedDate = new Date(dateQuery);
        const startOfDay = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
        const endOfDay = new Date(startOfDay);
        endOfDay.setDate(startOfDay.getDate() + 1);

        const attendancesRaw = await Attendance.find({
            timestamp: { $gte: startOfDay, $lt: endOfDay }
        }).sort({ timestamp: -1 }).populate('student');

        const attendances = attendancesRaw.filter(att => att.student != null);
        const attendedStudentIds = attendances.map(att => att.student._id);
        const absentStudents = await Student.find({ _id: { $nin: attendedStudentIds } }).sort({ name: 1 });

        res.status(200).json({
            success: true,
            data: {
                attendances: attendances,
                absentStudents: absentStudents
            }
        });

    } catch (error) {
        console.error("❌ Gagal mengambil data dashboard:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
});



export default router;