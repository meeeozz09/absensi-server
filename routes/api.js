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
        const { uid, name, studentId } = req.body;
        if (!uid || !name || !studentId) {
            return res.status(400).json({ success: false, message: "Semua field (UID, Nama, ID Siswa) harus diisi." });
        }
        const newStudent = await Student.create({ uid, name, studentId });
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
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const attendedStudentIds = await Attendance.find(
            { timestamp: { $gte: today, $lt: tomorrow } }, 'student'
        ).distinct('student');
        const absentStudents = await Student.find({ _id: { $nin: attendedStudentIds } });
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

        const query = {};
        const dateFilter = {};
        
        if (startDate) {
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            dateFilter.$gte = start;
        }

        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            dateFilter.$lte = end;
        }

        if (Object.keys(dateFilter).length > 0) {
            query.timestamp = dateFilter;
        }

        console.log("Mengekspor data dengan query:", JSON.stringify(query));

        const attendances = await Attendance.find(query).sort({ timestamp: 'desc' }).populate('student');

        const workbook = new exceljs.Workbook();
        workbook.creator = 'Sistem Absensi';
        const worksheet = workbook.addWorksheet('Laporan Absensi');

        worksheet.columns = [
            { header: 'No.', key: 'no', width: 5 },
            { header: 'Tanggal', key: 'tanggal', width: 20 },
            { header: 'Waktu', key: 'waktu', width: 15 },
            { header: 'ID Siswa', key: 'studentId', width: 20 },
            { header: 'Nama Siswa', key: 'name', width: 35 },
            { header: 'Status', key: 'status', width: 12 },
            { header: 'Keterangan', key: 'keterangan', width: 40 }
        ];
        worksheet.getRow(1).font = { bold: true };

        if (attendances.length > 0) {
            attendances.forEach((att, index) => {
                if (att.student) {
                    const ts = new Date(att.timestamp);
                    worksheet.addRow({
                        no: index + 1,
                        tanggal: ts.toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' }),
                        waktu: att.status === 'HADIR' ? ts.toLocaleTimeString('id-ID') : '-',
                        studentId: att.student.studentId,
                        name: att.student.name,
                        status: att.status,
                        keterangan: att.keterangan || ''
                    });
                }
            });
        } else {
            worksheet.addRow({ no: '-', tanggal: 'Tidak ada data ditemukan untuk periode ini.' });
        }

        const fileName = `Laporan_Absensi_${new Date().toISOString().slice(0,10)}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);

        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error("Gagal membuat file Excel:", error);
        res.status(500).send('Terjadi kesalahan saat membuat file Excel. Cek log server.');
    }
});


export default router;